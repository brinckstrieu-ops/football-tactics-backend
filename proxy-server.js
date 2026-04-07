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
                            toLabel: { type: "string", description: "接收者编号" },
                            targetX: { type: "number", description: "目标落点X" },
                            targetY: { type: "number", description: "目标落点Y" }
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

        // 🌟 核心升级：增加【时序严格对齐协议】
        const baseSystemPrompt = `你是一个专业的足球战术动态推演引擎。
你的任务是策划一组具有【真实动感】且【逻辑闭环】的进攻流程。

【核心协议：时序严格对齐】：
1. 步骤一一对应：你在 logic 中描述的“步骤 N”，必须在 tactical_actions 数组中对应索引为 N-1 的动作。严禁 logic 写了 6 步而 actions 只有 5 个。
2. 动作补全：如果战术从 4 号发起，必须在 tactical_actions 中产生第一个 type: "pass" 动作（fromLabel: "4"）。
3. 动态接球：
   - 每一个 "pass" 动作的 toLabel 球员，其在 positions 数组中的坐标必须是该球员去接球的目标点。
   - 传球线 targetX/Y 必须指向接球手在 positions 中的位置。
4. 真实性：8人制足球场较小 (1000x650)，球员跑位不应瞬间跨越 500 单位，除非其 PAC 极高。

【特质映射】：
- PAC(速度)表现：高 PAC 球员安排大幅度纵向跑位接球。
- PAS(传球)表现：高 PAS 球员作为中转枢纽，线段应穿透对方防线。

【当前战术需求】：${customSkill || "执行连续的团队配合进攻"}
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
                    res.write(`data: ${JSON.stringify({ stage: "⚽ 正在严谨校对每一步传跑时序..." })}\n\n`);
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
            res.write(`data: ${JSON.stringify({ error: "战术序列解析失败，请检查指令复杂度。" })}\n\n`);
        }
        res.end();
    } catch (error) {
        console.error('API Error:', error.message);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`🚀 真实动感推演版已启动！端口: ${PORT}`);
});