const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const axios = require('axios');

const app = express();

// 1. 基础配置
// Render 平台会自动分配 PORT，本地默认为 3000
const PORT = process.env.PORT || 3000;
app.use(cors()); // 允许前端跨域请求
app.use(express.json()); // 解析 JSON 请求体

// 2. 初始化 DeepSeek 客户端
// 确保在部署平台的 Environment Variables 中配置了 DEEPSEEK_API_KEY
const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY 
});

// 3. 联网检索函数 (基于 Tavily API)
async function googleSearch(query) {
    try {
        // 检查是否有搜索 Key
        if (!process.env.TAVILY_API_KEY) {
            console.warn('⚠️ 未配置 TAVILY_API_KEY，联网搜索功能已跳过');
            return "联网搜索功能未激活。";
        }

        console.log(`🌐 Agent 启动联网检索: ${query}...`);
        const response = await axios.post('https://api.tavily.com/search', {
            api_key: process.env.TAVILY_API_KEY,
            query: `足球战术分析 ${query}`,
            search_depth: "advanced"
        });

        // 提取前 5 个核心结果并合并
        return response.data.results.map(r => r.content).slice(0, 5).join('\n');
    } catch (err) {
        console.error('❌ Tavily 搜索接口异常:', err.message);
        return "暂无实时战术参考数据（搜索接口连接失败）。";
    }
}

// 4. 核心分析接口 (Agent 逻辑)
app.post('/api/deepseek', async (req, res) => {
    // 🛡️ API Key 存在性检查
    if (!process.env.DEEPSEEK_API_KEY) {
        console.error('❌ 错误：未发现 DEEPSEEK_API_KEY');
        return res.status(500).json({ error: '服务器未配置 DeepSeek API Key' });
    }

    try {
        const { messages, teamData } = req.body; 
        
        // 数据完整性检查
        if (!messages || messages.length === 0) {
            return res.status(400).json({ error: "请求体中缺少必要的 messages 数组" });
        }

        // 获取用户最后一条指令
        const userPrompt = messages[messages.length - 1].content;

        console.log('--- 🤖 足球战术 Agent 开始处理请求 ---');

        // 第一步：Agent 执行异步联网检索
        // 我们利用 2026 年的时间点来搜索最前沿的趋势
        let searchResult = "正在检索基础知识...";
        try {
            searchResult = await googleSearch("2026年现代足球最前沿战术趋势与压迫体系");
        } catch (sErr) {
            console.error("搜索步骤崩溃，降级为离线模式");
        }

        // 第二步：构建深度 System Prompt（合并搜索知识与场上数据）
        const systemPrompt = `你是一个顶级足球战术 Agent。
        你拥有联网检索权限。你现在的任务是结合检索到的最新战术趋势，以及用户提供的球员坐标和数值进行深度分析。
        
        【最新联网情报】：
        ${searchResult}

        【当前球场球员数据】：
        ${JSON.stringify(teamData)}

        请根据以上信息，对用户提出的战术意图或阵型缺陷给出专业建议。`;

        // 第三步：调用 DeepSeek (显式指定 model 参数以修复 400 报错)
        const completion = await client.chat.completions.create({
            model: "deepseek-chat", // 🌟 关键修复点：显式传递模型名称
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7, // 保持一定的创造力与专业性平衡
            max_tokens: 2048
        });

        console.log('✅ 分析任务顺利完成');
        res.json(completion);

    } catch (error) {
        console.error('❌ 代理服务器运行报错:', error.message);
        // 将具体错误透传，方便调试（如 Token 不足或 API Key 错误）
        res.status(500).json({ 
            error: 'Agent 内部执行出错', 
            details: error.message 
        });
    }
});

// 5. 启动服务器
app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`🚀 足球战术 Agent 后端已就绪！`);
    console.log(`📡 监听端口: ${PORT}`);
    console.log(`💡 环境检查: DEEPSEEK_API_KEY 为 ${process.env.DEEPSEEK_API_KEY ? '✅ 已配置' : '❌ 未配置'}`);
    console.log(`💡 环境检查: TAVILY_API_KEY 为 ${process.env.TAVILY_API_KEY ? '✅ 已配置' : '❌ 未配置'}`);
    console.log(`========================================\n`);
});