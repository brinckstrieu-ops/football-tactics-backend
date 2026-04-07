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
        description: "复现复杂博弈战术：包含红队引诱动作与蓝队防御偏移轨迹",
        parameters: {
            type: "object",
            properties: {
                logic: { type: "string", description: "详细描述红蓝博弈过程" },
                updated_stats: { type: "array", items: { type: "object", properties: { label: { type: "string" }, stats: { type: "object", properties: { pac: { type: "number" }, sho: { type: "number" }, pas: { type: "number" }, dri: { type: "number" }, def: { type: "number" }, phy: { type: "number" } } } } } },
                positions: { type: "array", items: { type: "object", properties: { label: { type: "string" }, team: { type: "string" }, x: { type: "number" }, y: { type: "number" } } } },
                tactical_actions: {
                    type: "array",
                    description: "战术动作流。每一项必须包含当时红蓝全员的 step_positions",
                    items: {
                        type: "object",
                        properties: {
                            type: { type: "string", enum: ["pass", "shot"] },
                            fromLabel: { type: "string" },
                            toLabel: { type: "string" },
                            targetX: { type: "number" },
                            targetY: { type: "number" },
                            step_positions: {
                                type: "array",
                                description: "🌟关键：该动作发生时，场上所有红蓝球员的具体坐标快照",
                                items: { type: "object", properties: { label: { type: "string" }, team: { type: "string" }, x: { type: "number" }, y: { type: "number" } } }
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
        const baseSystemPrompt = `你是一个顶级足球战术推演专家。

【博弈演示协议】：
1. 蓝队位移指令：你必须在 tactical_actions 的每一项 step_positions 中手动计算蓝队的位移。
2. 牵引复现：
   - 动作1（左路佯攻）：蓝队防线整体 Y 轴坐标应向红队持球侧偏移 150-200 单位。
   - 动作2（中路转移）：蓝队防线处于“呆滞”状态，位移延迟。
   - 动作3（右路突击）：蓝队防线应处于大范围回追的姿态，坐标应显示其向右路疯狂补位。
3. 空间感知：8人制场(1000x650)，确保红蓝球员坐标不重叠。红攻右，蓝守右。

【当前指令】：${customSkill}
【实时红蓝位置】：${JSON.stringify(teamData)}`;

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
                if (fullArguments.length % 120 === 0) res.write(`data: ${JSON.stringify({ stage: "⚽ 正在精算红蓝博弈路径..." })}\n\n`);
            }
        }

        const args = JSON.parse(fullArguments);
        res.write(`data: ${JSON.stringify({ final: true, analysis: args.logic, new_player_data: args.positions, updated_stats: args.updated_stats, tactical_actions: args.tactical_actions })}\n\n`);
        res.end();
    } catch (error) {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.listen(PORT, () => console.log(`🚀 v3.7 博弈版后端启动！`));