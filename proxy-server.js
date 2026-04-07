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

// 3. 核心工具定义
const tools = [{
    type: "function",
    function: {
        name: "generate_smart_formation",
        description: "分析足球战术需求，自动配置数值、移动棋子并规划具体的传球路径与射门坐标",
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

        // 🌟 核心升级：11人制/8人制自适应战术大脑
        const baseSystemPrompt = `你是一个具备【8人制与11人制双重专项知识】的教练 Agent。
你必须通过调用 generate_smart_formation 工具来响应。

【场制自动识别协议】：
- 请根据 teamData 中球员总数判断：若单方人数为 8人，则应用 8人制逻辑；若为 11人，则应用 11人制逻辑。

【8人制专项逻辑】：
1. 空间特性：场地紧凑，强调快速出球和局部小组配合。
2. 经典阵型：3-3-1 (平衡), 2-3-2 (进攻), 3-2-2 (稳守)。
3. 坐标约束：由于人数减少，x 轴分布应更紧凑（后卫 x:150-300, 中场 x:450-650, 前锋 x:750-920）。

【11人制专项逻辑】：
1. 空间特性：强调阵型宽度、三线距离及长距离调度。
2. 坐标约束：后卫 x[100-300], 中场 x[400-600], 前锋 x[700-950]。

【通用指令同步协议】：
- 优先级最高：若用户提到某特质（如“7号快”），必须在 updated_stats 中将数值调至 85-99。
- 数值挂钩：高速度球员必须安排长跑位，高射门球员必须安排射门动作。
- 严禁逻辑冲突：逻辑分析中称赞的球员，其对应 updated_stats 必须为高分。

【文字表达规范】：绝对禁止出现坐标数值，使用专业术语（如肋部、边路走廊）。

【当前战术需求】：${customSkill || "自动分析并克制对手"}
【实时球员数据】：${JSON.stringify(teamData)}`;

        res.write(`data: ${JSON.stringify({ stage: "📡 正在分析场制并识别球员特质..." })}\n\n`);

        const stream = await client.chat.completions.create({
            model: "deepseek-chat", 
            messages: [
                { role: "system", content: baseSystemPrompt },
                { role: "user", content: "请根据战术需求和协议，生成结构化战术指令。" }
            ],
            tools: tools,
            tool_choice: { type: "function", function: { name: "generate_smart_formation" } },
            stream: true,
        });

        res.write(`data: ${JSON.stringify({ stage: "🧠 正在构建针对性战术模型..." })}\n\n`);

        let fullArguments = "";
        for await (const chunk of stream) {
            const toolCall = chunk.choices[0].delta.tool_calls?.[0];
            if (toolCall?.function?.arguments) {
                fullArguments += toolCall.function.arguments;
                if (fullArguments.length % 100 === 0) { 
                    res.write(`data: ${JSON.stringify({ stage: `⚽ 正在精准同步数值与坐标... (${fullArguments.length} tokens)` })}\n\n`);
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
            res.write(`data: ${JSON.stringify({ error: "战术逻辑构建失败，请尝试刷新重试。" })}\n\n`);
        }
        
        res.end();

    } catch (error) {
        console.error('API Error:', error.message);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`🚀 战术大师（全能场制版）已启动！端口: ${PORT}`);
});