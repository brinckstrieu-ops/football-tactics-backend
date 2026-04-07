<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>AI 足球战术大师 - 动态演示版</title>
    <style>
        :root { --pitch-green: #2e7d32; --panel-bg: rgba(10, 47, 31, 0.98); --accent-gold: #ff9800; --text-main: #f5f5f5; --shot-red: #ff1744; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { background: #121212; margin: 0; padding: 10px; font-family: 'PingFang SC', sans-serif; color: var(--text-main); overflow-y: auto; }
        header h1 { text-align: center; font-size: 18px; background: linear-gradient(to right, #fff, var(--accent-gold)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 5px 0; }
        .main-layout { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 1400px; margin: 0 auto; }
        .canvas-container { position: relative; background: #000; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 2px solid #333; width: 100%; aspect-ratio: 1000 / 650; touch-action: none; }
        canvas { display: block; width: 100%; height: 100%; background: var(--pitch-green); }
        .side-panel { display: flex; flex-direction: column; gap: 10px; }
        .control-card { background: var(--panel-bg); border-radius: 12px; padding: 12px; border: 1px solid rgba(255,255,255,0.1); }
        .button-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        @media (max-width: 600px) { .button-grid { grid-template-columns: repeat(2, 1fr); } }
        button { background: #263238; border: 1px solid #444; color: white; padding: 10px 2px; border-radius: 8px; cursor: pointer; font-size: 11px; transition: 0.2s; border: none; }
        button.mode-active { background: var(--accent-gold); color: #000; font-weight: bold; }
        #analyzeAiBtn { grid-column: span 2; background: linear-gradient(135deg, #ff9800, #f57c00); color: #000; font-weight: bold; }
        .analysis-card { display: none; background: #051a12; border: 1px solid var(--accent-gold); margin-top: 10px; padding: 12px; border-radius: 12px; max-height: 400px; overflow-y: auto; }
        .analysis-card.show { display: block; }
        #skillConfig { width: 100%; height: 100px; background: #121212; color: #00ff00; border: 1px solid #444; border-radius: 8px; padding: 10px; font-family: 'Courier New', monospace; font-size: 12px; resize: none; margin-top: 5px; outline: none; }
        .modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); z-index: 2000; justify-content: center; align-items: center; }
        .modal-content { background: #1e1e1e; padding: 20px; border-radius: 16px; width: 90%; max-width: 340px; border: 1px solid var(--accent-gold); }
        .ability-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
        .ability-item { display: flex; flex-direction: column; }
        .ability-item label { font-size: 10px; color: #aaa; margin-bottom: 2px; }
        .ability-item input { background: #333; border: 1px solid #444; color: var(--accent-gold); padding: 8px; border-radius: 6px; text-align: center; }
    </style>
</head>
<body>

<header><h1>FOOTBALL TACTICS PRO (Tactical Demo)</h1></header>

<div class="main-layout">
    <div class="canvas-container"><canvas id="tacticsCanvas" width="1000" height="650"></canvas></div>
    <div class="side-panel">
        <div class="control-card">
            <h4 style="color:var(--accent-gold); margin:0 0 5px 0;">🧪 战术实验室 (Skill 配置)</h4>
            <textarea id="skillConfig" placeholder="输入战术描述..."></textarea>
        </div>
        <div class="control-card">
            <div class="button-grid">
                <button id="dragModeBtn" class="mode-active">🎮 移动球员</button>
                <button id="lineModeBtn">✏️ 画线/打门</button>
                <button id="resetBtn">🔄 重置阵型</button>
                <button id="analyzeAiBtn">🤖 运行动态演示</button>
                <button id="clearLinesBtn">🗑️ 清空连线</button>
            </div>
        </div>
        <div class="control-card analysis-card" id="analysisPanel">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 style="margin:0; font-size:16px; color:var(--accent-gold);">🧠 AI 实时推演报告</h4>
                <span id="closeAnalysisBtn" style="cursor:pointer; padding:5px;">✖</span>
            </div>
            <div id="analysisText" style="font-size: 13px; line-height: 1.6; white-space: pre-wrap;">准备就绪...</div>
        </div>
    </div>
</div>

<script>
(function(){
    const canvas = document.getElementById('tacticsCanvas'), ctx = canvas.getContext('2d');
    const width = 1000, height = 650;
    let players = [], lines = [], dragMode = true, isDragging = false, draggedPlayerIndex = -1;
    let dragOffsetX = 0, dragOffsetY = 0, currentEditPlayerIndex = -1;
    let lastTapTime = 0, lastTapPlayerIdx = -1;
    let isAiPlaying = false; 

    function getDefaultAbility() { return { v1: 75, v2: 70, v3: 72, v4: 74, v5: 65, v6: 70 }; }

    function getDefaultPlayers() {
        const list = [];
        let redPos = [{x:80,y:325},{x:220,y:150},{x:220,y:325},{x:220,y:500},{x:400,y:100},{x:400,y:250},{x:400,y:400},{x:400,y:550},{x:650,y:150},{x:650,y:325},{x:650,y:500}];
        let bluePos = [{x:920,y:325},{x:780,y:150},{x:780,y:325},{x:780,y:500},{x:600,y:100},{x:600,y:250},{x:600,y:400},{x:600,y:550},{x:350,y:150},{x:350,y:325},{x:350,y:500}];
        redPos.forEach((p,i)=>list.push({x:p.x,y:p.y,team:'red',label:''+(i+1),ability:getDefaultAbility()}));
        bluePos.forEach((p,i)=>list.push({x:p.x,y:p.y,team:'blue',label:''+(i+1),ability:getDefaultAbility()}));
        return list;
    }

    function getRole(x, team) {
        if (team === 'red') return x < 120 ? 'GK' : x < 320 ? 'DEF' : x < 550 ? 'MID' : 'FWD';
        return x > 880 ? 'GK' : x > 680 ? 'DEF' : x > 450 ? 'MID' : 'FWD';
    }

    function drawCanvas() {
        ctx.clearRect(0, 0, width, height);
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#2e7d32'); grad.addColorStop(1, '#1b5e20');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 3;
        ctx.strokeRect(30, 30, width-60, height-60);
        ctx.beginPath(); ctx.moveTo(width/2, 30); ctx.lineTo(width/2, height-30); ctx.stroke();
        lines.forEach(l => {
            const f = players[l.fromIdx]; if (!f) return;
            ctx.beginPath(); ctx.moveTo(f.x, f.y);
            if (l.isShot) {
                ctx.lineTo(l.targetX, l.targetY); ctx.strokeStyle = "#ff1744"; ctx.lineWidth = 4;
            } else {
                const t = players[l.toIdx]; ctx.lineTo(t.x, t.y); ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 3; ctx.setLineDash([5, 5]);
            }
            ctx.stroke(); ctx.setLineDash([]);
        });
        players.forEach(p => {
            ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, Math.PI*2);
            ctx.fillStyle = p.team === 'red' ? '#ff5252' : '#448aff';
            ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.fillText(p.label, p.x, p.y + 7);
        });
    }

    function animatePlayersTo(newPositions, onComplete) {
        const startTime = performance.now();
        const duration = 1200;
        const startPositions = players.map(p => ({ x: p.x, y: p.y }));
        function step(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            newPositions.forEach(target => {
                const pIndex = players.findIndex(player => String(player.label) === String(target.label) && player.team === 'red');
                if (pIndex !== -1) {
                    const start = startPositions[pIndex];
                    const safeX = Math.max(50, Math.min(950, target.x));
                    const safeY = Math.max(50, Math.min(600, target.y));
                    players[pIndex].x = start.x + (safeX - start.x) * ease;
                    players[pIndex].y = start.y + (safeY - start.y) * ease;
                }
            });
            drawCanvas();
            if (progress < 1) requestAnimationFrame(step);
            else if (onComplete) onComplete();
        }
        requestAnimationFrame(step);
    }

    // 🌟 核心：流式处理 AI 真实日志
    async function analyzeWithAI() {
        if (isAiPlaying) return;
        const btn = document.getElementById('analyzeAiBtn');
        const textDiv = document.getElementById('analysisText');
        const skillContent = document.getElementById('skillConfig').value;
        
        btn.disabled = true;
        isAiPlaying = true;
        document.getElementById('analysisPanel').classList.add('show');
        textDiv.innerText = "🚀 正在初始化请求...";

        const teamData = players.map(p => ({
            label: p.label, team: p.team === 'red' ? '红' : '蓝',
            role: getRole(p.x, p.team),
            stats: { pac: p.ability.v1, sho: p.ability.v2, pas: p.ability.v3, dri: p.ability.v4, def: p.ability.v5, phy: p.ability.v6 }
        }));

        try {
            const response = await fetch('https://soccer-api-u8yn.onrender.com/api/deepseek', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamData, customSkill: skillContent })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // 保持未完成的行在 buffer 中

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.stage) textDiv.innerText = data.stage;
                            if (data.error) textDiv.innerText = "❌ 错误: " + data.error;
                            if (data.final) handleFinalAction(data, textDiv, btn);
                        } catch (e) { console.error("JSON 解析错误", e); }
                    }
                }
            }
        } catch (err) {
            textDiv.innerText = "❌ 连接失败";
            isAiPlaying = false;
            btn.disabled = false;
        }
    }

    function handleFinalAction(data, textDiv, btn) {
        if (data.updated_stats) {
            data.updated_stats.forEach(item => {
                const p = players.find(player => String(player.label) === String(item.label) && player.team === 'red');
                if (p) Object.assign(p.ability, { v1: item.stats.pac, v2: item.stats.sho, v3: item.stats.pas, v4: item.stats.dri, v5: item.stats.def, v6: item.stats.phy });
            });
        }
        
        textDiv.innerText = `【AI 指导方案】\n${data.analysis}`;
        lines = []; drawCanvas();

        animatePlayersTo(data.new_player_data, () => {
            if (data.tactical_actions && data.tactical_actions.length > 0) {
                data.tactical_actions.forEach((act, index) => {
                    setTimeout(() => {
                        const fIdx = players.findIndex(p => String(p.label) === String(act.fromLabel) && p.team === 'red');
                        if (act.type === 'pass') {
                            const tIdx = players.findIndex(p => String(p.label) === String(act.toLabel) && p.team === 'red');
                            if (fIdx !== -1 && tIdx !== -1) lines.push({ fromIdx: fIdx, toIdx: tIdx, isShot: false });
                        } else if (act.type === 'shot') {
                            if (fIdx !== -1) lines.push({ fromIdx: fIdx, isShot: true, targetX: act.targetX, targetY: act.targetY });
                        }
                        drawCanvas();
                        if (index === data.tactical_actions.length - 1) { 
                            isAiPlaying = false; 
                            btn.disabled = false; 
                        }
                    }, index * 600);
                });
            } else { isAiPlaying = false; btn.disabled = false; }
        });
    }

    document.getElementById('analyzeAiBtn').onclick = analyzeWithAI;
    document.getElementById('resetBtn').onclick = () => { players = getDefaultPlayers(); lines = []; drawCanvas(); };
    players = getDefaultPlayers(); drawCanvas();
})();
</script>
</body>
</html>