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

// 3. 工具函数定义（包含更新球员数值、位置和战术动作）
const tools = [{
    type: "function",
    function: {
        name: "generate_smart_formation",
        description: "分析足球战术需求，自动匹配球员特质并规划跑位、传球与射门坐标",
        parameters: {
            type: "object",
            properties: {
                logic: { type: "string", description: "战术逻辑详细描述" },
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

        // 🌟 深度集成：球员特质识别 + 场景模版 + 同步协议
        const baseSystemPrompt = `你是一个具备【球员特质识别】能力的顶级主教练。
你必须通过调用 generate_smart_formation 工具来响应，并严格遵守以下动态战术逻辑：

【模块五：动态特质匹配逻辑】
当用户触发特定战术场景（角球、防守、反击）时，你必须先扫描 teamData 中的 stats：

1. 场景：角球进攻 (Corner Kick)
   - 寻找【PAS 传球】最高的球员：将其设为角球执行者(fromLabel)，坐标设为底线角球点。
   - 寻找【PHY 体能/力量】最高的 3 名球员：将其坐标设为点球点附近的头球冲顶位置。
   - 寻找【SHO 射门】最高的球员：将其设为禁区弧顶，准备二点球凌空抽射。

2. 场景：快速反击 (Counter Attack)
   - 寻找【PAC 速度】最高的 2 名球员：无论其初始位置，必须安排他们执行直接冲击对方防线深处的长距离跑位。
   - 寻找【PAS 传球】最高的球员：作为核心发起点，负责从后场或中场发放致命长传。

3. 场景：区域防守 (Zonal Defense)
   - 寻找【DEF 防守】最高的球员：设为防线核心（出球中卫），指挥整体防线同步移动。
   - 动态调整：若全队平均 PAC 较低，则采用低位深蹲防守，减小三线距离。

【场制识别协议】：
- 识别球员总数：8人制时采用更紧凑的 x 轴布局（150-900）；11人制强调阵型拉伸。

【指令同步协议】：
- 若用户提到特定球员，则在 updated_stats 中将其对应特质调优至 85-99。
- 禁止在 logic 字段中出现坐标数字，使用“肋部”、“弧顶”、“身后”等专业词汇。

【球场坐标规范】：
- x[0-1000], y[0-650]。红色左向右攻，目标球门 (1000, 325)。

【当前战术需求】：${customSkill || "智能战术分析"}
【球员特质快照】：${JSON.stringify(teamData)}`;

        res.write(`data: ${JSON.stringify({ stage: "📡 正在扫描全员属性，匹配核心特质..." })}\n\n`);

        const stream = await client.chat.completions.create({
            model: "deepseek-chat", 
            messages: [{ role: "system", content: baseSystemPrompt }],
            tools: tools,
            tool_choice: { type: "function", function: { name: "generate_smart_formation" } },
            stream: true,
        });

        res.write(`data: ${JSON.stringify({ stage: "🧠 正在基于球员属性进行动态推演..." })}\n\n`);

        let fullArguments = "";
        for await (const chunk of stream) {
            const toolCall = chunk.choices[0].delta.tool_calls?.[0];
            if (toolCall?.function?.arguments) {
                fullArguments += toolCall.function.arguments;
                if (fullArguments.length % 100 === 0) { 
                    res.write(`data: ${JSON.stringify({ stage: `⚽ 正在生成个性化战术坐标... (${fullArguments.length} tokens)` })}\n\n`);
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
            res.write(`data: ${JSON.stringify({ error: "战术推演失败，建议精简指令后重试。" })}\n\n`);
        }
        
        res.end();

    } catch (error) {
        console.error('Runtime Error:', error.message);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`🚀 战术大师（球员特质增强版）已启动！端口: ${PORT}`);
});