const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. 基础中间件（CORS 必须放在路由之前）
app.use(cors());
app.use(express.json());

// 2. 初始化 DeepSeek 客户端
const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY 
});

// 3. 核心工具定义：生成战术结构化数据
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
                    description: "根据战术需求修正后的球员数值 (0-99)",
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
                    description: "球员最终停留的坐标位置 (x: 0-1000, y: 0-650)",
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
                    description: "战术演示步骤：包括传球路径和射门终点",
                    items: {
                        type: "object",
                        properties: {
                            type: { type: "string", enum: ["pass", "shot"] },
                            fromLabel: { type: "string", description: "发起者号码" },
                            toLabel: { type: "string", description: "传球目标号码（仅 pass 必填）" },
                            targetX: { type: "number", description: "射门目标 X 坐标 (900-1000)" },
                            targetY: { type: "number", description: "射门目标 Y 坐标 (250-400)" }
                        },
                        required: ["type", "fromLabel"]
                    }
                }
            },
            required: ["logic", "positions", "updated_stats", "tactical_actions"]
        }
    }
}];

// 4. 联网检索函数 (Tavily 提供现代足球参考)
async function googleSearch(query) {
    try {
        if (!process.env.TAVILY_API_KEY) return "联网搜索功能未激活。";
        const response = await axios.post('https://api.tavily.com/search', {
            api_key: process.env.TAVILY_API_KEY,
            query: `2026年现代足球战术趋势 ${query}`,
            search_depth: "basic"
        });
        return response.data.results.map(r => r.content).slice(0, 2).join('\n');
    } catch (err) {
        return "暂无实时战术参考数据。";
    }
}

// 5. 核心接口
app.post('/api/deepseek', async (req, res) => {
    if (!process.env.DEEPSEEK_API_KEY) return res.status(500).json({ error: '未配置 API Key' });

    console.log("--- ⚽ 战术 Agent 收到新请求 ---");

    try {
        const { teamData, customSkill } = req.body; 

        // 🌟 步骤 A: 联网搜索（可选，开启可增强 AI 战术专业性）
        // const searchResult = await googleSearch(customSkill || "进攻组织");
        const searchResult = "基于现代 4-3-3 压迫体系。";

        // 🌟 步骤 B: 注入“地理直觉”的 System Prompt
        const baseSystemPrompt = `你是一个具备【顶级足球地理直觉】的教练 Agent。
你必须通过调用 generate_smart_formation 工具来响应，禁止生成多余文字。

【球场坐标系规范】：
1. 场地范围：横轴 x [0-1000], 纵轴 y [0-650]。
2. 进攻方向：红色方（我方）从左向右攻，对方球门中心位于 (1000, 325)。
3. 球员位置 (positions) 逻辑：
   - 后卫 (DEF)：x 应在 100-300 之间。
   - 中场 (MID)：x 应在 400-600 之间。
   - 前锋 (FWD)：x 应在 700-950 之间。
4. 战术动作 (tactical_actions) 逻辑：
   - 传球 (pass)：toLabel 目标的 x 坐标通常应大于 fromLabel 发起者（向前推进）。
   - 射门 (shot)：targetX 必须 > 900，targetY 必须在 [250-400] 之间以确保进球。

【参考背景】：${searchResult}
【当前战术需求】：${customSkill || "执行常规排阵"}
【当前球员快照】：${JSON.stringify(teamData)}`;

        // 🌟 步骤 C: 调用 DeepSeek-V3 并强制工具调用
        const completion = await client.chat.completions.create({
            model: "deepseek-chat", 
            messages: [
                { role: "system", content: baseSystemPrompt },
                { role: "user", content: "根据战术需求，请下达具体的球员数值调整、位置移动和动态演示指令。" }
            ],
            tools: tools,
            tool_choice: { 
                type: "function", 
                function: { name: "generate_smart_formation" } 
            }, 
            max_tokens: 2000,
            temperature: 0.3 
        });

        // 🌟 步骤 D: 详细日志捕获（用于排查“乱飞”和“不执行”问题）
        console.log("--- 🤖 DeepSeek 原始返回内容 ---");
        console.log(JSON.stringify(completion.choices[0].message, null, 2));
        console.log("------------------------------");

        const choice = completion.choices[0];

        if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
            const toolCall = choice.message.tool_calls[0];
            const args = JSON.parse(toolCall.function.arguments);
            
            console.log("✅ 战术指令解析成功，正在发送至前端...");
            
            return res.json({
                analysis: args.logic,
                execute_action: "UPDATE_PLAYERS",
                new_player_data: args.positions,
                updated_stats: args.updated_stats,
                tactical_actions: args.tactical_actions
            });
        } else {
            console.warn("⚠️ 警告：AI 拒绝执行工具调用！");
            return res.json({
                execute_action: "TEXT_ONLY",
                analysis: choice.message.content || "AI 思考中断，请重试。"
            });
        }

    } catch (error) {
        console.error('❌ 后端运行报错:', error.message);
        res.status(500).json({ error: 'Agent 执行失败', details: error.message });
    }
});

// 6. 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 足球战术后端服务已启动！端口: ${PORT}`);
    console.log(`📡 等待 Live Server (127.0.0.1:5500) 的连接...`);
});