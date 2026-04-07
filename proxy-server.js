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
        description: "复现真实足球战术：包含红队进攻链路与蓝队防守牵引位移",
        parameters: {
            type: "object",
            properties: {
                logic: { type: "string", description: "战术逻辑：需描述红队如何诱导及蓝队防线的错误移动" },
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
                // 🌟 关键：这里的 positions 必须包含红蓝两队的变动坐标
                positions: { 
                    type: "array", 
                    items: {
                        type: "object",
                        properties: {
                            label: { type: "string" },
                            team: { type: "string", enum: ["red", "blue"] },
                            x: { type: "number" },
                            y: { type: "number" }
                        }
                    }
                },
                tactical_actions: {
                    type: "array",
                    description: "按执行顺序排列的进攻动作",
                    items: {
                        type: "object",
                        properties: {
                            type: { type: "string", enum: ["pass", "shot"] },
                            fromLabel: { type: "string" },
                            toLabel: { type: "string" },
                            targetX: { type: "number" },
                            targetY: { type: "number" }
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

        // 🌟 核心升级：增加【防守牵引与空挡复现协议】
        const baseSystemPrompt = `你是一个顶级的足球战术复盘引擎，专注于展示“进攻诱导”与“防守偏移”的博弈过程。

【核心协议：防守牵引模拟】：
1. 蓝队动态响应：你必须在 positions 数组中更新蓝队球员的坐标。
2. 牵引逻辑：
   - 当红队爆点(如7号)带球或高速前插时，蓝队对应的后卫(如蓝2、蓝5)必须向其位置靠拢，执行“双人包夹”或“重心偏移”。
   - 这种偏移必须导致蓝队防线的另一侧或中路出现巨大的视觉空档。
3. 空间复现：在执行 tactical_actions 的射门动作前，蓝队的中卫位置应被诱导离开球门正面区域。
4. 守门员约束：严禁移动红1和蓝1，除非是射门扑救动作。

【步骤严格对齐】：
- 每一个进攻动作(pass/shot)都必须伴随着蓝队整体阵型的同步收缩或拉伸。
- logic 字段必须明确指出：“蓝队后卫因防守压力向X路倾斜，导致Y路空档完全暴露”。

【场制与坐标】：
- 红色左攻右。蓝队球员编号应对应其防守位置。
- 8人制球场(1000x650)，利用空间拉开幅度，展示蓝队防守的无力感。

【当前战术需求】：${customSkill || "展示一次经典的调虎离山配合进攻"}
【实时红蓝数据】：${JSON.stringify(teamData)}`;

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
                    res.write(`data: ${JSON.stringify({ stage: "⚽ 正在模拟防线牵引轨迹..." })}\n\n`);
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
            res.write(`data: ${JSON.stringify({ error: "战术引擎解析逻辑冲突，请尝试简化指令。" })}\n\n`);
        }
        res.end();
    } catch (error) {
        console.error('API Error:', error.message);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`🚀 真实博弈战术引擎已启动！端口: ${PORT}`);
});