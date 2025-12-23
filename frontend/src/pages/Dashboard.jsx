// =============================================
// TRADING MASTER PRO - DASHBOARD v7.4
// SMC + PSICOTRADING COMPLETO + PLAN SMC
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// GRÁFICO SMC
// =============================================
const SMCChart = ({ candles, markers, title, height = 320 }) => {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current || !candles || candles.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    
    ctx.fillStyle = '#08080a';
    ctx.fillRect(0, 0, w, h);
    
    const visible = candles.slice(-50);
    const prices = visible.flatMap(c => [c.high, c.low]);
    markers?.liquidity?.equalHighs?.forEach(p => prices.push(p));
    markers?.liquidity?.equalLows?.forEach(p => prices.push(p));
    
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const range = maxP - minP, pad = range * 0.1;
    const scaleY = (p) => h - 20 - ((p - minP + pad) / (range + pad * 2)) * (h - 40);
    const candleW = (w - 50) / visible.length;
    const chartR = w - 45;
    
    ctx.strokeStyle = '#141418';
    for (let i = 0; i <= 4; i++) {
      const y = 20 + ((h - 40) / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartR, y); ctx.stroke();
      ctx.fillStyle = '#3f3f46'; ctx.font = '8px monospace';
      ctx.fillText((maxP + pad - ((range + pad * 2) / 4) * i).toFixed(2), chartR + 2, y + 3);
    }

    markers?.liquidity?.equalHighs?.forEach(level => {
      const y = scaleY(level);
      ctx.strokeStyle = '#ef4444'; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartR, y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = '#ef4444'; ctx.font = 'bold 7px sans-serif';
      ctx.fillText('$$$ EQH', 2, y - 2);
    });
    
    markers?.liquidity?.equalLows?.forEach(level => {
      const y = scaleY(level);
      ctx.strokeStyle = '#22c55e'; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartR, y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = '#22c55e'; ctx.font = 'bold 7px sans-serif';
      ctx.fillText('$$$ EQL', 2, y + 8);
    });

    if (markers?.orderBlock) {
      const ob = markers.orderBlock;
      const y1 = scaleY(ob.high), y2 = scaleY(ob.low);
      ctx.fillStyle = ob.obType === 'DEMAND' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)';
      ctx.fillRect(0, Math.min(y1, y2), chartR, Math.abs(y2 - y1));
      ctx.strokeStyle = ob.obType === 'DEMAND' ? '#22c55e' : '#ef4444';
      ctx.strokeRect(0, Math.min(y1, y2), chartR, Math.abs(y2 - y1));
    }

    visible.forEach((c, i) => {
      const x = 5 + i * candleW + candleW / 2;
      const o = scaleY(c.open), cl = scaleY(c.close), hi = scaleY(c.high), lo = scaleY(c.low);
      const col = c.close > c.open ? '#22c55e' : '#ef4444';
      ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(x, hi); ctx.lineTo(x, lo); ctx.stroke();
      ctx.fillStyle = col; ctx.fillRect(x - candleW * 0.35, Math.min(o, cl), candleW * 0.7, Math.abs(cl - o) || 1);
    });

    if (markers?.choch) {
      const y = scaleY(markers.choch.price);
      ctx.strokeStyle = markers.choch.direction === 'BULLISH' ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(chartR - 70, y); ctx.lineTo(chartR, y); ctx.stroke();
      ctx.fillStyle = markers.choch.direction === 'BULLISH' ? '#22c55e' : '#ef4444';
      ctx.fillRect(chartR - 40, y - 7, 35, 12);
      ctx.fillStyle = '#000'; ctx.font = 'bold 7px sans-serif'; ctx.fillText('CHoCH', chartR - 38, y + 2);
    }

    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.fillText(title || '', 5, 12);
  }, [candles, markers, title]);
  
  return <canvas ref={canvasRef} width={650} height={height} className="w-full rounded-lg border border-zinc-800/50" />;
};

// =============================================
// FLUJO SMC
// =============================================
const SMCFlow = ({ analysis }) => {
  const steps = [
    { id: 'liq', label: 'Liquidez', icon: '💰', active: (analysis?.liquidity?.equalHighs?.length > 0 || analysis?.liquidity?.equalLows?.length > 0) },
    { id: 'sweep', label: 'Sweep', icon: '🧹', active: analysis?.sweep?.valid },
    { id: 'disp', label: 'Displacement', icon: '💨', active: analysis?.displacement?.valid },
    { id: 'choch', label: 'CHoCH', icon: '🔄', active: analysis?.choch?.valid },
    { id: 'ob', label: 'OB', icon: '📦', active: analysis?.orderBlock?.valid },
    { id: 'entry', label: 'Entrada', icon: '🎯', active: analysis?.ltfEntry?.valid },
  ];
  const activeIdx = steps.findIndex(s => !s.active);
  const progress = activeIdx === -1 ? 100 : (activeIdx / steps.length) * 100;
  
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-3">
      <div className="flex justify-between mb-2">
        <span className="text-xs font-bold text-white">Flujo SMC</span>
        <span className="text-[10px] text-zinc-500">{Math.round(progress)}%</span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full mb-2">
        <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="grid grid-cols-6 gap-1">
        {steps.map((s, i) => (
          <div key={s.id} className={`text-center p-1 rounded ${s.active ? 'bg-emerald-500/20' : i === activeIdx ? 'bg-amber-500/20 animate-pulse' : 'bg-zinc-800/30'}`}>
            <div className="text-sm">{s.icon}</div>
            <div className={`text-[8px] ${s.active ? 'text-emerald-400' : 'text-zinc-500'}`}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================
// NARRACIÓN
// =============================================
const NarrationPanel = ({ narration, status, aiEnabled, onToggleAI, score }) => {
  const statusCfg = {
    'SEÑAL_ACTIVA': { bg: 'bg-emerald-500/10 border-emerald-500/40', label: '🎯 SEÑAL' },
    'ESPERANDO_ENTRADA': { bg: 'bg-blue-500/10 border-blue-500/40', label: '⏳ Entrada' },
    'ESPERANDO_CHOCH': { bg: 'bg-amber-500/10 border-amber-500/40', label: '🔄 CHoCH' },
    'ESPERANDO_DISPLACEMENT': { bg: 'bg-orange-500/10 border-orange-500/40', label: '💨 Displacement' },
    'ESPERANDO_SWEEP': { bg: 'bg-yellow-500/10 border-yellow-500/40', label: '🧹 Sweep' },
    'SIN_LIQUIDEZ': { bg: 'bg-zinc-500/10 border-zinc-500/40', label: '💰 Liquidez' },
    'BUSCANDO_OB': { bg: 'bg-purple-500/10 border-purple-500/40', label: '📦 OB' },
  };
  const cfg = statusCfg[status] || statusCfg.SIN_LIQUIDEZ;

  return (
    <div className={`rounded-xl border p-3 ${cfg.bg}`}>
      <div className="flex justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-white">{cfg.label}</span>
          {score > 0 && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${score >= 85 ? 'bg-emerald-500/20 text-emerald-400' : score >= 70 ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-500/20 text-zinc-400'}`}>
              {score}/100
            </span>
          )}
        </div>
        <button onClick={onToggleAI} className={`px-2 py-0.5 rounded text-[9px] ${aiEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-500'}`}>
          🤖 {aiEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <p className="text-zinc-300 text-xs">{narration || 'Analizando...'}</p>
    </div>
  );
};

// =============================================
// SIGNAL CARD
// =============================================
const SignalCard = ({ signal, onTrack, showTracking = true }) => {
  const [tracking, setTracking] = useState({ operated: signal.operated, result: signal.result });
  const isBuy = signal.direction === 'BULLISH';
  
  const getEmoji = (symbol) => {
    if (symbol === 'frxXAUUSD') return '🥇';
    return isBuy ? '🟢' : '🔴';
  };
  
  const handleTrack = async (operated, result = null) => {
    setTracking({ operated, result });
    if (onTrack) await onTrack(signal.id, operated, result);
  };
  
  return (
    <div className={`rounded-xl border p-3 ${isBuy ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-red-500/10 border-red-500/40'}`}>
      <div className="flex justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getEmoji(signal.symbol)}</span>
          <div>
            <div className="font-bold text-white text-sm">{signal.symbolName}</div>
            <div className="text-[9px] text-zinc-400">{new Date(signal.createdAt).toLocaleString()}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`font-bold text-sm ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>{isBuy ? 'COMPRA' : 'VENTA'}</div>
          <div className="text-[9px] text-zinc-500">{signal.scoring?.score}/100 ({signal.scoring?.classification})</div>
        </div>
      </div>
      
      {signal.levels && (
        <div className="grid grid-cols-4 gap-1 text-[9px] mb-2">
          <div className="bg-black/20 rounded p-1 text-center">
            <div className="text-zinc-500">Entry</div>
            <div className="font-mono text-blue-400">{signal.levels.entry}</div>
          </div>
          <div className="bg-black/20 rounded p-1 text-center">
            <div className="text-zinc-500">SL</div>
            <div className="font-mono text-red-400">{signal.levels.stopLoss}</div>
          </div>
          <div className="bg-black/20 rounded p-1 text-center">
            <div className="text-zinc-500">TP1</div>
            <div className="font-mono text-emerald-400">{signal.levels.tp1}</div>
          </div>
          <div className="bg-black/20 rounded p-1 text-center">
            <div className="text-zinc-500">TP3</div>
            <div className="font-mono text-emerald-400">{signal.levels.tp3}</div>
          </div>
        </div>
      )}
      
      {showTracking && (
        <div className="border-t border-white/10 pt-2 mt-2">
          {!tracking.operated && !tracking.result ? (
            <div className="flex gap-2">
              <button onClick={() => handleTrack(false)} className="flex-1 py-1.5 rounded bg-zinc-700/50 text-zinc-400 text-xs hover:bg-zinc-600/50">
                ⏭️ No operé
              </button>
              <button onClick={() => handleTrack(true)} className="flex-1 py-1.5 rounded bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30">
                ✅ Sí operé
              </button>
            </div>
          ) : tracking.operated && !tracking.result ? (
            <div className="flex gap-2">
              <button onClick={() => handleTrack(true, 'WIN')} className="flex-1 py-1.5 rounded bg-emerald-500/20 text-emerald-400 text-xs hover:bg-emerald-500/30">
                🏆 Ganada
              </button>
              <button onClick={() => handleTrack(true, 'LOSS')} className="flex-1 py-1.5 rounded bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30">
                💔 Perdida
              </button>
            </div>
          ) : (
            <div className={`text-center py-1.5 rounded text-xs ${
              !tracking.operated ? 'bg-zinc-700/30 text-zinc-500' :
              tracking.result === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {!tracking.operated ? '⏭️ No operada' : tracking.result === 'WIN' ? '🏆 GANADA' : '💔 PERDIDA'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// =============================================
// ESTADÍSTICAS
// =============================================
const StatsPanel = ({ stats }) => {
  if (!stats) return null;
  
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
      <h3 className="text-sm font-bold text-white mb-3">📊 Estadísticas</h3>
      
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-black/20 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-white">{stats.totalOperated}</div>
          <div className="text-[9px] text-zinc-500">Operadas</div>
        </div>
        <div className="bg-black/20 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-emerald-400">{stats.wins}</div>
          <div className="text-[9px] text-zinc-500">Ganadas</div>
        </div>
        <div className="bg-black/20 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-red-400">{stats.losses}</div>
          <div className="text-[9px] text-zinc-500">Perdidas</div>
        </div>
        <div className="bg-black/20 rounded-lg p-2 text-center">
          <div className={`text-lg font-bold ${parseFloat(stats.winRate) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
            {stats.winRate}%
          </div>
          <div className="text-[9px] text-zinc-500">Win Rate</div>
        </div>
      </div>
      
      <div className="flex gap-2">
        <div className={`flex-1 rounded p-2 text-center ${stats.streaks?.currentWin > 0 ? 'bg-emerald-500/10' : 'bg-zinc-800/30'}`}>
          <div className="text-xs text-emerald-400">🔥 {stats.streaks?.currentWin || 0}</div>
          <div className="text-[8px] text-zinc-500">Racha Wins</div>
        </div>
        <div className={`flex-1 rounded p-2 text-center ${stats.streaks?.currentLoss > 0 ? 'bg-red-500/10' : 'bg-zinc-800/30'}`}>
          <div className="text-xs text-red-400">❄️ {stats.streaks?.currentLoss || 0}</div>
          <div className="text-[8px] text-zinc-500">Racha Loss</div>
        </div>
      </div>
    </div>
  );
};

// =============================================
// 🧠 PSICOTRADING COMPLETO
// =============================================
const PsychoPanel = ({ emotionalState }) => {
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('coach'); // 'coach' o 'plan'
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planPrefs, setPlanPrefs] = useState({
    capital: '',
    riskPerTrade: '1-2%',
    schedule: '',
    experience: 'Intermedio'
  });
  
  const stateColors = {
    'NEUTRAL': 'bg-zinc-500/20 text-zinc-400',
    'CONFIDENT': 'bg-emerald-500/20 text-emerald-400',
    'TILT': 'bg-red-500/20 text-red-400',
    'OVERTRADING': 'bg-amber-500/20 text-amber-400',
  };
  
  const stateLabels = {
    'NEUTRAL': '😐 Neutral',
    'CONFIDENT': '😊 Confiado',
    'TILT': '😤 En Tilt',
    'OVERTRADING': '⚡ Overtrading',
  };
  
  const handleSend = async () => {
    if (!message.trim() || loading) return;
    
    const userMsg = message;
    setMessage('');
    setChat(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    
    try {
      const res = await fetch(`${API_URL}/api/psycho/coaching`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      });
      const data = await res.json();
      setChat(prev => [...prev, { role: 'assistant', content: data.response || data.error || 'Sin respuesta' }]);
    } catch (err) {
      setChat(prev => [...prev, { role: 'assistant', content: 'Error de conexión. Intenta de nuevo.' }]);
    }
    setLoading(false);
  };
  
  const handleGeneratePlan = async () => {
    setPlanLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/psycho/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planPrefs)
      });
      const data = await res.json();
      setPlan(data.plan || data.error);
    } catch {
      setPlan('Error generando plan. Intenta de nuevo.');
    }
    setPlanLoading(false);
  };
  
  const quickMessages = [
    '¿Debería operar ahora?',
    'Estoy nervioso después de perder',
    '¿Cómo identifico un buen sweep?',
    '¿Qué es un CHoCH válido?',
    'Tips para manejar el FOMO',
    '¿Cuándo NO debo operar?'
  ];

  return (
    <div className="space-y-4">
      {/* Estado Emocional */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-3">🧠 Estado Emocional</h3>
        
        <div className={`rounded-lg p-3 mb-3 ${stateColors[emotionalState?.emotionalState] || stateColors.NEUTRAL}`}>
          <div className="text-lg font-bold">{stateLabels[emotionalState?.emotionalState] || '😐 Neutral'}</div>
          <div className="text-xs opacity-75">Riesgo: {emotionalState?.riskLevel || 'NORMAL'}</div>
        </div>
        
        {emotionalState?.recommendations?.length > 0 && (
          <div className="space-y-1">
            {emotionalState.recommendations.map((r, i) => (
              <div key={i} className="text-xs text-zinc-300 bg-black/20 rounded p-2">{r}</div>
            ))}
          </div>
        )}
        
        <div className="grid grid-cols-3 gap-2 mt-3 text-center text-[10px]">
          <div className="bg-black/20 rounded p-2">
            <div className="text-white font-bold">{emotionalState?.stats?.todayTrades || 0}</div>
            <div className="text-zinc-500">Hoy</div>
          </div>
          <div className="bg-black/20 rounded p-2">
            <div className="text-emerald-400 font-bold">{emotionalState?.stats?.currentWinStreak || 0}</div>
            <div className="text-zinc-500">Wins</div>
          </div>
          <div className="bg-black/20 rounded p-2">
            <div className="text-red-400 font-bold">{emotionalState?.stats?.currentLossStreak || 0}</div>
            <div className="text-zinc-500">Losses</div>
          </div>
        </div>
      </div>
      
      {/* Tabs: Coach / Plan */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setActiveTab('coach')}
            className={`flex-1 py-2 text-xs font-medium ${activeTab === 'coach' ? 'bg-blue-500/20 text-blue-400 border-b-2 border-blue-500' : 'text-zinc-500'}`}
          >
            💬 Coach SMC
          </button>
          <button
            onClick={() => setActiveTab('plan')}
            className={`flex-1 py-2 text-xs font-medium ${activeTab === 'plan' ? 'bg-purple-500/20 text-purple-400 border-b-2 border-purple-500' : 'text-zinc-500'}`}
          >
            📋 Plan Trading
          </button>
        </div>
        
        <div className="p-4">
          {/* Tab: Coach */}
          {activeTab === 'coach' && (
            <>
              <div className="flex flex-wrap gap-1 mb-3">
                {quickMessages.map((q, i) => (
                  <button key={i} onClick={() => setMessage(q)}
                    className="text-[9px] px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition">
                    {q}
                  </button>
                ))}
              </div>
              
              <div className="h-48 overflow-y-auto mb-3 space-y-2 bg-black/20 rounded-lg p-2">
                {chat.length === 0 ? (
                  <div className="text-center text-zinc-500 text-xs py-8">
                    👋 Hola! Soy tu coach de SMC.<br/>
                    Pregúntame sobre trading, emociones o metodología.
                  </div>
                ) : (
                  chat.map((msg, i) => (
                    <div key={i} className={`text-xs p-2 rounded-lg ${
                      msg.role === 'user' ? 'bg-blue-500/20 text-blue-300 ml-8' : 'bg-zinc-800 text-zinc-300 mr-8'
                    }`}>
                      {msg.content}
                    </div>
                  ))
                )}
                {loading && <div className="text-xs text-zinc-500 animate-pulse p-2">🤔 Pensando...</div>}
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Escribe tu pregunta sobre SMC..."
                  className="flex-1 bg-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button onClick={handleSend} disabled={loading}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-500 disabled:opacity-50 transition">
                  Enviar
                </button>
              </div>
            </>
          )}
          
          {/* Tab: Plan de Trading SMC */}
          {activeTab === 'plan' && (
            <>
              {!plan ? (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-400 mb-3">
                    Genera tu plan de trading personalizado basado en Smart Money Concepts.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-zinc-500">Capital</label>
                      <input
                        placeholder="Ej: $500"
                        value={planPrefs.capital}
                        onChange={(e) => setPlanPrefs({...planPrefs, capital: e.target.value})}
                        className="w-full bg-zinc-800 rounded px-2 py-1.5 text-xs text-white mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500">Riesgo/Trade</label>
                      <select
                        value={planPrefs.riskPerTrade}
                        onChange={(e) => setPlanPrefs({...planPrefs, riskPerTrade: e.target.value})}
                        className="w-full bg-zinc-800 rounded px-2 py-1.5 text-xs text-white mt-1"
                      >
                        <option value="0.5%">0.5%</option>
                        <option value="1%">1%</option>
                        <option value="1-2%">1-2%</option>
                        <option value="2%">2%</option>
                        <option value="3%">3%</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500">Horario</label>
                      <input
                        placeholder="Ej: 8am-12pm"
                        value={planPrefs.schedule}
                        onChange={(e) => setPlanPrefs({...planPrefs, schedule: e.target.value})}
                        className="w-full bg-zinc-800 rounded px-2 py-1.5 text-xs text-white mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500">Experiencia</label>
                      <select
                        value={planPrefs.experience}
                        onChange={(e) => setPlanPrefs({...planPrefs, experience: e.target.value})}
                        className="w-full bg-zinc-800 rounded px-2 py-1.5 text-xs text-white mt-1"
                      >
                        <option>Principiante</option>
                        <option>Intermedio</option>
                        <option>Avanzado</option>
                      </select>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleGeneratePlan}
                    disabled={planLoading}
                    className="w-full py-2.5 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-500 disabled:opacity-50 transition"
                  >
                    {planLoading ? '⏳ Generando plan SMC...' : '🚀 Generar Mi Plan SMC'}
                  </button>
                </div>
              ) : (
                <div>
                  <div className="bg-black/20 rounded-lg p-3 text-xs text-zinc-300 whitespace-pre-wrap max-h-72 overflow-y-auto">
                    {plan}
                  </div>
                  <button
                    onClick={() => setPlan(null)}
                    className="w-full mt-3 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-xs hover:bg-zinc-700 transition"
                  >
                    🔄 Generar nuevo plan
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// =============================================
// SYMBOL SELECTOR
// =============================================
const SymbolSelector = ({ symbols, selected, onSelect, counts }) => {
  const getEmoji = (key) => {
    if (key === 'frxXAUUSD') return '🥇';
    if (key === 'stpRNG') return '📊';
    if (key === 'R_75') return '📈';
    if (key === 'R_100') return '📉';
    return '📊';
  };
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {Object.entries(symbols).map(([key, info]) => (
        <button key={key} onClick={() => onSelect(key)}
          className={`py-2 px-3 rounded-xl transition ${
            selected === key 
              ? key === 'frxXAUUSD' 
                ? 'bg-amber-600 text-white' 
                : 'bg-blue-600 text-white' 
              : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50'
          }`}>
          <div className="flex items-center justify-center gap-1">
            <span>{getEmoji(key)}</span>
            <span className="font-medium text-sm">{info.name}</span>
          </div>
          <div className={`text-xs ${(counts?.[key] || 0) >= 7 ? 'text-red-400' : 'text-zinc-500'}`}>
            {counts?.[key] || 0}/7
          </div>
        </button>
      ))}
    </div>
  );
};

// =============================================
// MAIN DASHBOARD
// =============================================
export default function Dashboard() {
  const [connected, setConnected] = useState(false);
  const [symbols, setSymbols] = useState({});
  const [selectedSymbol, setSelectedSymbol] = useState('stpRNG');
  const [analysis, setAnalysis] = useState(null);
  const [narration, setNarration] = useState(null);
  const [signals, setSignals] = useState([]);
  const [dailyCounts, setDailyCounts] = useState({});
  const [tab, setTab] = useState('live');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [stats, setStats] = useState(null);
  const [emotionalState, setEmotionalState] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        const [health, syms, sigs, counts, st, emo] = await Promise.all([
          fetch(`${API_URL}/health`).then(r => r.json()),
          fetch(`${API_URL}/api/deriv/symbols`).then(r => r.json()),
          fetch(`${API_URL}/api/signals/history`).then(r => r.json()),
          fetch(`${API_URL}/api/signals/daily-count`).then(r => r.json()),
          fetch(`${API_URL}/api/stats`).then(r => r.json()).catch(() => null),
          fetch(`${API_URL}/api/stats/emotional`).then(r => r.json()).catch(() => null),
        ]);
        setConnected(health.deriv);
        setSymbols(syms);
        setSignals(sigs);
        setDailyCounts(counts);
        setStats(st);
        setEmotionalState(emo);
      } catch { setConnected(false); }
    };
    init();
  }, []);

  const fetchData = useCallback(async () => {
    if (!selectedSymbol) return;
    try {
      const [a, n] = await Promise.all([
        fetch(`${API_URL}/api/analyze/${selectedSymbol}`).then(r => r.json()),
        fetch(`${API_URL}/api/narration/${selectedSymbol}`).then(r => r.json()),
      ]);
      setAnalysis(a);
      setNarration(n);
    } catch {}
  }, [selectedSymbol]);

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 5000);
    return () => clearInterval(i);
  }, [fetchData]);

  useEffect(() => {
    const f = async () => {
      try {
        const [s, c, st, emo] = await Promise.all([
          fetch(`${API_URL}/api/signals/history`).then(r => r.json()),
          fetch(`${API_URL}/api/signals/daily-count`).then(r => r.json()),
          fetch(`${API_URL}/api/stats`).then(r => r.json()).catch(() => null),
          fetch(`${API_URL}/api/stats/emotional`).then(r => r.json()).catch(() => null),
        ]);
        setSignals(s);
        setDailyCounts(c);
        setStats(st);
        setEmotionalState(emo);
      } catch {}
    };
    const i = setInterval(f, 15000);
    return () => clearInterval(i);
  }, []);

  const handleToggleAI = async () => {
    try {
      const res = await fetch(`${API_URL}/api/ai/toggle`, { method: 'POST' });
      const data = await res.json();
      setAiEnabled(data.aiEnabled);
    } catch {}
  };

  const handleTrackSignal = async (id, operated, result) => {
    try {
      await fetch(`${API_URL}/api/signals/${id}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operated, result })
      });
      const [s, st] = await Promise.all([
        fetch(`${API_URL}/api/signals/history`).then(r => r.json()),
        fetch(`${API_URL}/api/stats`).then(r => r.json()),
      ]);
      setSignals(s);
      setStats(st);
    } catch {}
  };

  const isGold = selectedSymbol === 'frxXAUUSD';

  return (
    <div className="min-h-screen bg-[#08080a] text-white">
      <header className="border-b border-zinc-800/50 px-4 py-2">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold">Trading<span className="text-blue-500">Pro</span></h1>
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">v7.4</span>
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">+GOLD</span>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          </div>
          
          {emotionalState && (
            <div className={`px-2 py-0.5 rounded text-[9px] ${
              emotionalState.riskLevel === 'HIGH' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
            }`}>
              {emotionalState.emotionalState}
            </div>
          )}
        </div>
      </header>

      <nav className="border-b border-zinc-800/50 px-4">
        <div className="max-w-6xl mx-auto flex">
          {[
            { id: 'live', label: '📊 Trading' },
            { id: 'history', label: '📜 Historial' },
            { id: 'psycho', label: '🧠 Psicotrading' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-xs border-b-2 transition ${tab === t.id ? 'border-blue-500 text-white' : 'border-transparent text-zinc-500'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4">
        {tab === 'live' && (
          <div className="space-y-4">
            <SymbolSelector symbols={symbols} selected={selectedSymbol} onSelect={setSelectedSymbol} counts={dailyCounts} />
            
            {isGold && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 text-center">
                <span className="text-amber-400 text-xs">🥇 Gold/USD - Parámetros ajustados para mayor volatilidad</span>
              </div>
            )}
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-3">
                <SMCChart 
                  candles={analysis?.candles?.htf || []} 
                  markers={analysis?.chartMarkers} 
                  title={`${isGold ? '🥇' : '📊'} ${symbols[selectedSymbol]?.name || selectedSymbol} - 5M`} 
                />
                <NarrationPanel 
                  narration={narration?.text} 
                  status={analysis?.status} 
                  aiEnabled={aiEnabled} 
                  onToggleAI={handleToggleAI}
                  score={analysis?.scoring?.score || 0}
                />
                {analysis?.hasSignal && <SignalCard signal={analysis} onTrack={handleTrackSignal} />}
              </div>
              <div className="space-y-3">
                <SMCFlow analysis={analysis} />
                <StatsPanel stats={stats} />
              </div>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold">📜 Historial de Señales</h2>
              <div className="text-[10px] text-zinc-500">
                {stats?.totalOperated || 0} operadas | {stats?.winRate || 0}% win rate
              </div>
            </div>
            
            {signals.length === 0 ? (
              <div className="text-center text-zinc-500 py-8 text-sm">
                Sin señales aún. El sistema está analizando el mercado...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {signals.map(s => (
                  <SignalCard key={s.id} signal={s} onTrack={handleTrackSignal} showTracking={true} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'psycho' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PsychoPanel emotionalState={emotionalState} />
            <StatsPanel stats={stats} />
          </div>
        )}
      </main>
    </div>
  );
}
