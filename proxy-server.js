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
    // 🌟 设置响应头为流式传输
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const { teamData, customSkill } = req.body; 

        // 🌟 注入战术规范
        const baseSystemPrompt = `你是一个具备【顶级足球地理直觉】的教练 Agent。
你必须通过调用 generate_smart_formation 工具来响应。

【文字表达规范】：
1. 在 logic 字段中，绝对严禁出现任何坐标数值（如 x: 800, y: 300 等）。
2. 请使用专业术语描述位置，例如：“禁区弧顶”、“肋部空档”、“边路走廊”。
3. 描述要专业、简洁、有感染力。

【球场坐标系规范】：
1. 范围：x [0-1000], y [0-650]。红色方左向右攻，球门中心 (1000, 325)。
2. 站位：后卫 x[100-300], 中场 x[400-600], 前锋 x[700-950]。
3. 射门：targetX > 900, targetY [250-400]。

【战术需求】：${customSkill || "执行常规排阵"}
【球员快照】：${JSON.stringify(teamData)}`;

        // 1. 发送第一个真实节点
        res.write(`data: ${JSON.stringify({ stage: "📡 数据包已送达云端，正在初始化教练模型..." })}\n\n`);

        const stream = await client.chat.completions.create({
            model: "deepseek-chat", 
            messages: [
                { role: "system", content: baseSystemPrompt },
                { role: "user", content: "请根据战术需求下达指令。" }
            ],
            tools: tools,
            tool_choice: { type: "function", function: { name: "generate_smart_formation" } },
            stream: true, // 🌟 开启流模式
        });

        res.write(`data: ${JSON.stringify({ stage: "🧠 DeepSeek 正在推演最优攻防路径..." })}\n\n`);

        let fullArguments = "";
        for await (const chunk of stream) {
            const toolCall = chunk.choices[0].delta.tool_calls?.[0];
            if (toolCall?.function?.arguments) {
                const fragment = toolCall.function.arguments;
                fullArguments += fragment;
                
                // 🌟 根据 Token 生成进度动态反馈给前端
                if (fullArguments.length % 50 === 0) { 
                    res.write(`data: ${JSON.stringify({ stage: `⚽ 正在计算战术坐标点... (${fullArguments.length} tokens)` })}\n\n`);
                }
            }
        }

        // 2. 解析完整数据并发送最终包
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
        } catch (parseError) {
            res.write(`data: ${JSON.stringify({ error: "数据解析失败，请尝试重新生成。" })}\n\n`);
        }
        
        res.end();

    } catch (error) {
        console.error('Stream Error:', error.message);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`🚀 战术大师后端（流式版）已启动，端口: ${PORT}`);
});