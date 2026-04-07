const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY 
});

const tools = [{
    type: "function",
    function: {
        name: "generate_smart_formation",
        description: "按时序拆解足球战术：包含接球跑位、传球链路与射门动作",
        parameters: {
            type: "object",
            properties: {
                logic: { type: "string", description: "战术步骤描述（如：步骤1...步骤2...）" },
                updated_stats: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            label: { type: "string" },
                            stats: { 
                                type: "object", 
                                properties: {
                                    pac: { type: "number" }, sho: { type: "number" },
                                    pas: { type: "number" }, dri: { type: "number" },
                                    def: { type: "number" }, phy: { type: "number" }
                                }
                            }
                        }
                    }
                },
                // 🌟 重要：这里的 positions 代表动作发生前或过程中的瞬时跑位
                positions: { 
                    type: "array", 
                    items: {
                        type: "object",
                        properties: {
                            label: { type: "string" },
                            x: { type: "number" },
                            y: { type: "number" }
                        }
                    }
                },
                tactical_actions: {
                    type: "array",
                    description: "必须严格按发生顺序排列的交互链",
                    items: {
                        type: "object",
                        properties: {
                            type: { type: "string", enum: ["pass", "shot"] },
                            fromLabel: { type: "string" },
                            toLabel: { type: "string", description: "若是传球，这是接球手的编号" },
                            targetX: { type: "number", description: "传球/射门的目标落点X" },
                            targetY: { type: "number", description: "传球/射门的目标落点Y" }
                        },
                        required: ["type", "fromLabel"]
                    }
                }
            },
            required: ["logic", "positions", "updated_stats", "tactical_actions"]
        }
    }
}];

app.post('/api/deepseek', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const { teamData, customSkill } = req.body; 

        // 🌟 核心协议升级：强调“动静结合”
        const baseSystemPrompt = `你是一个专业的足球战术动态推演引擎。你的任务是策划一组具有【真实动感】的进攻流程。

【核心时序协议】：
1. 联动跑位：在 generate_smart_formation 的 positions 中，设置的坐标必须是接球手(toLabel)前往接球的目标位置。
2. 动作与位移同步：tactical_actions 中的每一组 fromLabel 和 toLabel 应当与 positions 中的坐标调整相对应。
3. 真实性约束：禁止瞬移。8人制足球中，传球距离不应超过500单位。
4. 顺序逻辑：
   - 步骤1：传球手寻找空间，接球手启动跑位。
   - 步骤2：传球发出，线段指向 positions 中接球手的新坐标。
   - 步骤3：完成射门。

【特质映射】：
- PAC最高者：必须安排在 tactical_actions 中作为接球手执行前插跑位。
- PAS最高者：作为链路的发起点。

【输出要求】：
- logic：分步骤陈述，每一步必须提到谁在跑，谁在传。
- updated_stats：体现球员在该战术下的巅峰状态。

【场制】：根据 teamData 人数自适应（16人为8人制，22人为11人制）。
【坐标系】：x[0-1000], y[0-650]。红队从左向右进攻。

【当前战术需求】：${customSkill || "执行流畅的整体进攻"}
【实时球员数据】：${JSON.stringify(teamData)}`;

        const stream = await client.chat.completions.create({
            model: "deepseek-chat", 
            messages: [{ role: "system", content: baseSystemPrompt }],
            tools: tools,
            tool_choice: { type: "function", function: { name: "generate_smart_formation" } },
            stream: true,
        });

        let fullArguments = "";
        for await (const chunk of stream) {
            const toolCall = chunk.choices[0].delta.tool_calls?.[0];
            if (toolCall?.function?.arguments) {
                fullArguments += toolCall.function.arguments;
                if (fullArguments.length % 120 === 0) { 
                    res.write(`data: ${JSON.stringify({ stage: "⚽ 正在计算球员跑位与球速同步..." })}\n\n`);
                }
            }
        }

        try {
            const args = JSON.parse(fullArguments);
            res.write(`data: ${JSON.stringify({ 
                final: true,
                analysis: args.logic,
                new_player_data: args.positions,
                updated_stats: args.updated_stats,
                tactical_actions: args.tactical_actions
            })}\n\n`);
        } catch (e) {
            res.write(`data: ${JSON.stringify({ error: "战术逻辑计算超载，请简化指令。" })}\n\n`);
        }
        res.end();
    } catch (error) {
        console.error('API Error:', error.message);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`🚀 真实动感战术引擎已启动！端口: ${PORT}`);
});