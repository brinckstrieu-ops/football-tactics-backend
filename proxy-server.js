const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 1. 初始化客户端
const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY 
});

// 2. 工具定义
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
                            stats: { type: "object", properties: { pac: {type:"number"}, sho: {type:"number"}, pas: {type:"number"}, dri: {type:"number"}, def: {type:"number"}, phy: {type:"number"} } }
                        }
                    }
                },
                positions: { 
                    type: "array", 
                    items: { type: "object", properties: { label: {type:"string"}, x: {type:"number"}, y: {type:"number"} } }
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

// 3. 核心接口
app.post('/api/deepseek', async (req, res) => {
    if (!process.env.DEEPSEEK_API_KEY) return res.status(500).json({ error: '未配置 API Key' });

    try {
        const { messages, teamData, customSkill } = req.body; 
        const userPrompt = messages[messages.length - 1].content;

        const baseSystemPrompt = `你是一个具备【顶级战术导演权限】的教练 Agent。
        你必须且只能通过调用 generate_smart_formation 工具来回答。
        严禁输出任何多余的文字分析。
        
        【战术需求】：${customSkill || "执行常规排阵"}
        【球员数据】：${JSON.stringify(teamData)}`;

        const completion = await client.chat.completions.create({
            model: "deepseek-chat", 
            messages: [
                { role: "system", content: baseSystemPrompt },
                { role: "user", content: userPrompt }
            ],
            tools: tools,
            tool_choice: { 
                type: "function", 
                function: { name: "generate_smart_formation" } 
            }, 
            max_tokens: 2000,
            temperature: 0.3 
        });

        // 🌟 核心日志捕获：抓出 AI 的真实返回
        console.log("--- 🤖 DeepSeek 原始返回内容 ---");
        console.log(JSON.stringify(completion.choices[0].message, null, 2));
        console.log("------------------------------");

        const choice = completion.choices[0];
        
        // 判断是否触发了工具调用
        if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
            const toolCall = choice.message.tool_calls[0];
            const args = JSON.parse(toolCall.function.arguments);
            
            console.log("✅ 成功解析工具指令，下达给前端...");
            
            return res.json({
                analysis: args.logic,
                execute_action: "UPDATE_PLAYERS",
                new_player_data: args.positions,
                updated_stats: args.updated_stats,
                tactical_actions: args.tactical_actions
            });
        } else {
            // 🌟 异常情况捕获
            console.warn("⚠️ 警告：模型拒绝调用工具！");
            console.log("拒绝原因/文本内容:", choice.message.content);
            
            return res.json({
                execute_action: "TEXT_ONLY",
                analysis: choice.message.content || "AI 未生成有效指令，请重试。"
            });
        }

    } catch (error) {
        console.error('❌ 后端运行报错:', error.message);
        res.status(500).json({ error: 'Agent 执行出错', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 战术大师后端已启动！监听端口: ${PORT}`);
});