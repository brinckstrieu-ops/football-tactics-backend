、const express = require('express');
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
        description: "综合分析战术需求，自动配置数值、移动棋子并规划具体的传球路径与射门坐标",
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

        // 🌟 核心升级：深度数值关联逻辑 + 指令同步协议
        const baseSystemPrompt = `你是一个具备【深度数值关联逻辑】的顶级主教练。
你必须通过调用 generate_smart_formation 工具来响应，并严格遵守以下协议：

【模块一：阵型克制逻辑】
- 实时分析 teamData 中蓝色方坐标：识别其阵型（如 442, 532）并选择弱侧进攻。
- 利用宽度拉伸对方防线，针对对方薄弱区域（如边后卫身后）进行打击。

【模块二：属性加权跑位 (PAC/PAS/DRI)】
- 跑位逻辑必须与 stats 数值严格挂钩：
  - 高速度 (PAC > 85)：必须安排长距离冲刺位置（大幅度改变 x 坐标）。
  - 高传球 (PAS > 85)：必须作为 tactical_actions 的发起点（核心组织者）。

【模块三：指令同步协议（🔥 核心修复）】
- 优先级最高：若用户在指令中提到某球员特质（如“7号速度快”、“9号射门准”），你必须在 updated_stats 中将该球员对应的数值调整至 85-99 之间。
- 严禁逻辑冲突：禁止在文字 logic 中称赞某人优秀，但在 updated_stats 中给其低分。
- 属性决定动作：若你上调了某人的 SHO（射门），则必须在 tactical_actions 中为其安排一个 shot（射门）动作。

【文字表达规范】：
- 禁止出现坐标数值。使用专业术语：肋部、禁区弧顶、高位压迫、出球中卫。

【球场坐标规范】：
- x[0-1000], y[0-650]。红色左向右攻，对方球门中心位于 (1000, 325)。

【当前战术需求】：${customSkill || "自动分析并克制对手"}
【实时球员数据】：${JSON.stringify(teamData)}`;

        res.write(`data: ${JSON.stringify({ stage: "📡 战术需求已上传，正在解析同步协议..." })}\n\n`);

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

        res.write(`data: ${JSON.stringify({ stage: "🧠 正在匹配球员属性与战术跑位..." })}\n\n`);

        let fullArguments = "";
        for await (const chunk of stream) {
            const toolCall = chunk.choices[0].delta.tool_calls?.[0];
            if (toolCall?.function?.arguments) {
                fullArguments += toolCall.function.arguments;
                if (fullArguments.length % 80 === 0) { 
                    res.write(`data: ${JSON.stringify({ stage: `⚽ 正在校准动态坐标... (${fullArguments.length} tokens)` })}\n\n`);
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
    console.log(`🚀 战术大师后端已启动！端口: ${PORT}`);
});