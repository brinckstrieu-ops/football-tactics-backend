const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const axios = require('axios');

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

// 4. 核心接口
app.post('/api/deepseek', async (req, res) => {
    if (!process.env.DEEPSEEK_API_KEY) return res.status(500).json({ error: '未配置 API Key' });

    try {
        const { teamData, customSkill } = req.body; 

        // 🌟 深度优化：建立球场直觉 + 文字表达规范
        const baseSystemPrompt = `你是一个具备【顶级足球地理直觉】的教练 Agent。
你必须通过调用 generate_smart_formation 工具来响应。

【文字表达规范】：
1. 在 logic 字段（即给用户看的分析报告）中，绝对严禁出现任何坐标数值（如 x: 800, y: 300 等）。
2. 请使用足球专业术语描述位置，例如：“禁区弧顶”、“肋部空档”、“边路走廊”、“高位压迫线”、“后场出球点”。
3. 描述要专业、简洁、有感染力，像顶级教练在更衣室的战术演讲。

【球场坐标系规范】：
1. 场地范围：横轴 x [0-1000], 纵轴 y [0-650]。
2. 进攻方向：红色方（我方）从左向右攻，对方球门中心位于 (1000, 325)。
3. 站位逻辑：后卫 x[100-300], 中场 x[400-600], 前锋 x[700-950]。
4. 动作逻辑：射门目标 targetX > 900, targetY 在 [250-400] 之间。

【当前战术需求】：${customSkill || "执行常规排阵"}
【当前球员快照】：${JSON.stringify(teamData)}`;

        const completion = await client.chat.completions.create({
            model: "deepseek-chat", 
            messages: [
                { role: "system", content: baseSystemPrompt },
                { role: "user", content: "请根据战术需求下达指令。" }
            ],
            tools: tools,
            tool_choice: { 
                type: "function", 
                function: { name: "generate_smart_formation" } 
            }, 
            max_tokens: 2000,
            temperature: 0.3 
        });

        console.log("--- 🤖 DeepSeek 原始返回内容 ---");
        console.log(JSON.stringify(completion.choices[0].message, null, 2));

        const choice = completion.choices[0];

        if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
            const toolCall = choice.message.tool_calls[0];
            const args = JSON.parse(toolCall.function.arguments);
            
            return res.json({
                analysis: args.logic,
                execute_action: "UPDATE_PLAYERS",
                new_player_data: args.positions,
                updated_stats: args.updated_stats,
                tactical_actions: args.tactical_actions
            });
        } else {
            return res.json({
                execute_action: "TEXT_ONLY",
                analysis: choice.message.content || "指令生成失败。"
            });
        }

    } catch (error) {
        console.error('❌ 后端报错:', error.message);
        res.status(500).json({ error: '执行失败', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 战术大师后端已启动，端口: ${PORT}`);
});