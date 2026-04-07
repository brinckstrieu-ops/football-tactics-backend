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
        description: "复现足球战术博弈：按步骤生成进攻动作及同步的红蓝防线牵引位移",
        parameters: {
            type: "object",
            properties: {
                logic: { type: "string", description: "战术逻辑：描述诱导过程及蓝队失误" },
                updated_stats: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            label: { type: "string" },
                            stats: { type: "object", properties: { pac: { type: "number" }, sho: { type: "number" }, pas: { type: "number" }, dri: { type: "number" }, def: { type: "number" }, phy: { type: "number" } } }
                        }
                    }
                },
                // 🌟 这里保留一份最终站位快照
                positions: { 
                    type: "array", 
                    items: { type: "object", properties: { label: { type: "string" }, team: { type: "string", enum: ["red", "blue"] }, x: { type: "number" }, y: { type: "number" } } }
                },
                tactical_actions: {
                    type: "array",
                    description: "按执行顺序排列。🌟关键：每步包含该动作完成时红蓝全员的实时坐标",
                    items: {
                        type: "object",
                        properties: {
                            type: { type: "string", enum: ["pass", "shot"] },
                            fromLabel: { type: "string" },
                            toLabel: { type: "string" },
                            targetX: { type: "number" },
                            targetY: { type: "number" },
                            // 🌟 核心：每一步动作对应的【红蓝全员坐标快照】
                            step_positions: {
                                type: "array",
                                items: { type: "object", properties: { label: { type: "string" }, team: { type: "string", enum: ["red", "blue"] }, x: { type: "number" }, y: { type: "number" } } }
                            }
                        },
                        required: ["type", "fromLabel", "step_positions"]
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

        const baseSystemPrompt = `你是一个足球战术博弈大师，擅长利用“空间诱导”和“防线牵引”。

【核心任务】
1. 规划红队的连续进攻步骤。
2. 🌟必须在 tactical_actions 的每个步骤里，通过 step_positions 描述蓝队受牵引后的【动态位移】。

【博弈规则】
- 牵引：当红队爆点(如7号)高速带球或前插时，蓝队对应的后卫必须在 step_positions 中向其靠拢，形成局部多踢一。
- 制造空挡：蓝队的集体偏移必须导致球场另一侧或中路出现巨大无人区。
- 时序位移：step_positions 是随着 pass/shot 动作实时变化的。动作1时蓝队在左，动作2时蓝队被吊向右。
- 守门员(1号)：严禁大幅位移，除非是扑球动作。

【输出要求】
- logic：解释蓝队是如何被“骗”出位置的。
- 坐标：红攻右。8人制球场(1000x650)。

【当前战术需求】：${customSkill || "展示一次经典的调虎离山配合进攻"}
【实时数据】：${JSON.stringify(teamData)}`;

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
                    res.write(`data: ${JSON.stringify({ stage: "⚽ 正在精算防线牵引矢量..." })}\n\n`);
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
            res.write(`data: ${JSON.stringify({ error: "战术计算超时，请精简指令。" })}\n\n`);
        }
        res.end();
    } catch (error) {
        console.error('API Error:', error.message);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`🚀 牵引力博弈引擎已启动！端口: ${PORT}`);
});