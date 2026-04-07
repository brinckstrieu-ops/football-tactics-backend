const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. 基础中间件
app.use(cors());
app.use(express.json());

// 2. 初始化 DeepSeek 客户端
const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY 
});

// 3. 工具函数定义
const tools = [{
    type: "function",
    function: {
        name: "generate_smart_formation",
        description: "分析足球战术需求，按时序规划跑位、传球与射门动作",
        parameters: {
            type: "object",
            properties: {
                logic: { type: "string", description: "战术逻辑详细描述（包含步骤）" },
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
                    description: "必须按执行顺序排列的战术动作数组",
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

// 4. 流式接口逻辑
app.post('/api/deepseek', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const { teamData, customSkill } = req.body; 

        // 🌟 核心：注入时序逻辑协议
        const baseSystemPrompt = `你是一个具备【时序逻辑】的足球战术推演引擎。
你必须调用 generate_smart_formation 并按以下协议规划战术：

【核心规则：时序推演】
1. tactical_actions 必须按发生的先后顺序排列（如：传球1 -> 传球2 -> 射门）。
2. 每一个动作必须包含：发起者(fromLabel)、接收者(toLabel)或目标点。
3. 空间约束：8人制场地较小，确保传球距离合理，不要出现全场瞬移。

【球员特质匹配】
- 扫描 teamData，识别 PAC(速度)、PAS(传球)、SHO(射门) 最高的球员。
- 快速反击：必须由高 PAS 球员发起长传，高 PAC 球员前插接球。
- 角球：高 PAS 球员罚球，高 PHY 球员在点球点包抄。

【输出格式约束】
- logic：用主教练口吻描述战术步骤（第1步、第2步...）。
- updated_stats：同步强化本次战术涉及的明星球员属性。
- positions：这是战术结束时的【最终站位】。

【场制识别】：根据球员总数自动判断（16人为8人制，22人为11人制）。
【球场规范】：x[0-1000], y[0-650]。红色攻左向右，目标球门中心(1000, 325)。

【当前战术需求】：${customSkill || "执行常规进攻"}
【球员实时数据】：${JSON.stringify(teamData)}`;

        res.write(`data: ${JSON.stringify({ stage: "📡 正在分析球员特质并规划推演时序..." })}\n\n`);

        const stream = await client.chat.completions.create({
            model: "deepseek-chat", 
            messages: [{ role: "system", content: baseSystemPrompt }],
            tools: tools,
            tool_choice: { type: "function", function: { name: "generate_smart_formation" } },
            stream: true,
        });

        res.write(`data: ${JSON.stringify({ stage: "🧠 正在生成连续战术步骤..." })}\n\n`);

        let fullArguments = "";
        for await (const chunk of stream) {
            const toolCall = chunk.choices[0].delta.tool_calls?.[0];
            if (toolCall?.function?.arguments) {
                fullArguments += toolCall.function.arguments;
                // 优化：不再每行输出，保持单行更新
                if (fullArguments.length % 120 === 0) { 
                    res.write(`data: ${JSON.stringify({ stage: "⚽ 正在校准动态路径..." })}\n\n`);
                }
            }
        }

        try {
            const args = JSON.parse(fullArguments);
            res.write(`data: ${JSON.stringify({ 
                final: true,
                analysis: args.logic,
                execute_action: "UPDATE_PLAYERS",
                new_player_data: args.positions,
                updated_stats: args.updated_stats,
                tactical_actions: args.tactical_actions
            })}\n\n`);
        } catch (e) {
            res.write(`data: ${JSON.stringify({ error: "战术逻辑构建失败，请重试。" })}\n\n`);
        }
        
        res.end();

    } catch (error) {
        console.error('API Error:', error.message);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`🚀 战术大师（时序逻辑版）已启动！端口: ${PORT}`);
});