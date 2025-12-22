// =============================================
// TRADING MASTER PRO - DASHBOARD v7.1 ELITE
// Toggle IA + Historial con gráfico + Ratios 1:10
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// GRÁFICO SMC
// =============================================
const SMCChart = ({ candles, markers, title, height = 350 }) => {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current || !candles || candles.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.fillStyle = '#08080a';
    ctx.fillRect(0, 0, w, h);
    
    const visible = candles.slice(-55);
    const prices = visible.flatMap(c => [c.high, c.low]);
    markers?.liquidity?.equalHighs?.forEach(p => prices.push(p));
    markers?.liquidity?.equalLows?.forEach(p => prices.push(p));
    
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP;
    const pad = range * 0.1;
    
    const scaleY = (p) => h - 22 - ((p - minP + pad) / (range + pad * 2)) * (h - 44);
    const candleW = (w - 55) / visible.length;
    const chartR = w - 50;
    
    // Grid
    ctx.strokeStyle = '#141418';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = 22 + ((h - 44) / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartR, y);
      ctx.stroke();
      ctx.fillStyle = '#3f3f46';
      ctx.font = '8px monospace';
      ctx.fillText((maxP + pad - ((range + pad * 2) / 4) * i).toFixed(2), chartR + 2, y + 3);
    }

    // Liquidez EQH
    markers?.liquidity?.equalHighs?.forEach(level => {
      const y = scaleY(level);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartR, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 7px sans-serif';
      ctx.fillText('$$$ EQH', 2, y - 2);
    });
    
    // Liquidez EQL
    markers?.liquidity?.equalLows?.forEach(level => {
      const y = scaleY(level);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartR, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 7px sans-serif';
      ctx.fillText('$$$ EQL', 2, y + 8);
    });

    // Order Block
    if (markers?.orderBlock) {
      const ob = markers.orderBlock;
      const y1 = scaleY(ob.high);
      const y2 = scaleY(ob.low);
      const isDemand = ob.obType === 'DEMAND';
      
      ctx.fillStyle = isDemand ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)';
      ctx.fillRect(0, Math.min(y1, y2), chartR, Math.abs(y2 - y1));
      ctx.strokeStyle = isDemand ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(0, Math.min(y1, y2), chartR, Math.abs(y2 - y1));
      ctx.fillStyle = isDemand ? '#22c55e' : '#ef4444';
      ctx.font = 'bold 8px sans-serif';
      ctx.fillText(`OB ${ob.obType}`, 2, Math.min(y1, y2) - 2);
    }

    // Velas
    visible.forEach((c, i) => {
      const x = 6 + i * candleW + candleW / 2;
      const o = scaleY(c.open);
      const cl = scaleY(c.close);
      const hi = scaleY(c.high);
      const lo = scaleY(c.low);
      const bull = c.close > c.open;
      const col = bull ? '#22c55e' : '#ef4444';
      
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, hi);
      ctx.lineTo(x, lo);
      ctx.stroke();
      
      ctx.fillStyle = col;
      ctx.fillRect(x - candleW * 0.35, Math.min(o, cl), candleW * 0.7, Math.abs(cl - o) || 1);
    });

    // Sweep marker
    if (markers?.sweep) {
      const y = scaleY(markers.sweep.price);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(chartR - 25, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 7px sans-serif';
      ctx.fillText('S', chartR - 27, y + 2);
    }

    // CHoCH
    if (markers?.choch) {
      const y = scaleY(markers.choch.price);
      ctx.strokeStyle = markers.choch.direction === 'BULLISH' ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(chartR - 80, y);
      ctx.lineTo(chartR, y);
      ctx.stroke();
      
      ctx.fillStyle = markers.choch.direction === 'BULLISH' ? '#22c55e' : '#ef4444';
      ctx.fillRect(chartR - 42, y - 8, 38, 14);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 7px sans-serif';
      ctx.fillText('CHoCH', chartR - 40, y + 2);
    }

    // Entry/SL/TP
    if (markers?.levels) {
      const { entry, stopLoss, tp1, tp3 } = markers.levels;
      
      [[entry, 'ENTRY', '#3b82f6'], [stopLoss, 'SL', '#ef4444'], [tp1, 'TP1', '#22c55e'], [tp3, 'TP3', '#10b981']].forEach(([val, label, col]) => {
        if (val) {
          const y = scaleY(parseFloat(val));
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.setLineDash(label === 'ENTRY' ? [] : [3, 2]);
          ctx.beginPath();
          ctx.moveTo(chartR - 60, y);
          ctx.lineTo(chartR, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = col;
          ctx.font = '7px sans-serif';
          ctx.fillText(label, chartR - 55, y - 1);
        }
      });
    }

    // Título
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(title || '', 6, 13);
    
  }, [candles, markers, title]);
  
  return <canvas ref={canvasRef} width={700} height={height} className="w-full rounded-lg border border-zinc-800/50" />;
};

// =============================================
// FLUJO SMC
// =============================================
const SMCFlow = ({ analysis }) => {
  const steps = [
    { id: 'liq', label: 'Liquidez', icon: '💰', active: (analysis?.liquidity?.equalHighs?.length > 0 || analysis?.liquidity?.equalLows?.length > 0), detail: `${analysis?.liquidity?.equalHighs?.length || 0} EQH, ${analysis?.liquidity?.equalLows?.length || 0} EQL` },
    { id: 'sweep', label: 'Sweep', icon: '🧹', active: analysis?.sweep?.valid, detail: analysis?.sweep?.description || 'Esperando' },
    { id: 'disp', label: 'Displacement', icon: '💨', active: analysis?.displacement?.valid, detail: analysis?.displacement?.valid ? `${analysis.displacement.multiplier}x ATR` : 'Esperando' },
    { id: 'choch', label: 'CHoCH', icon: '🔄', active: analysis?.choch?.valid, detail: analysis?.choch?.description || 'Esperando' },
    { id: 'ob', label: 'OB', icon: '📦', active: analysis?.orderBlock?.valid, detail: analysis?.orderBlock?.description || 'Buscando' },
    { id: 'entry', label: 'Entrada 1M', icon: '🎯', active: analysis?.ltfEntry?.valid, detail: analysis?.ltfEntry?.confirmationType || 'Esperando' },
  ];
  
  const activeIdx = steps.findIndex(s => !s.active);
  const progress = activeIdx === -1 ? 100 : (activeIdx / steps.length) * 100;
  
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-white">Flujo SMC</span>
        <span className="text-[10px] text-zinc-500">{Math.round(progress)}%</span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full mb-3 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="space-y-1">
        {steps.map((s, i) => (
          <div key={s.id} className={`flex items-center gap-2 p-1.5 rounded-lg text-xs ${
            s.active ? 'bg-emerald-500/10' : i === activeIdx ? 'bg-amber-500/10 animate-pulse' : 'bg-zinc-800/30'
          }`}>
            <span>{s.icon}</span>
            <div className="flex-1">
              <div className={s.active ? 'text-emerald-400' : i === activeIdx ? 'text-amber-400' : 'text-zinc-500'}>{s.label}</div>
            </div>
            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${
              s.active ? 'bg-emerald-500 text-black' : 'bg-zinc-700 text-zinc-500'
            }`}>{s.active ? '✓' : i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================
// NARRACIÓN + TOGGLE IA
// =============================================
const NarrationPanel = ({ narration, waiting, status, aiEnabled, onToggleAI }) => {
  const statusCfg = {
    'SEÑAL_ACTIVA': { bg: 'bg-emerald-500/10 border-emerald-500/40', label: '🎯 SEÑAL', color: 'text-emerald-400' },
    'ESPERANDO_ENTRADA': { bg: 'bg-blue-500/10 border-blue-500/40', label: '⏳ Esperando 1M', color: 'text-blue-400' },
    'BUSCANDO_OB': { bg: 'bg-purple-500/10 border-purple-500/40', label: '📦 Buscando OB', color: 'text-purple-400' },
    'ESPERANDO_CHOCH': { bg: 'bg-amber-500/10 border-amber-500/40', label: '🔄 Esperando CHoCH', color: 'text-amber-400' },
    'ESPERANDO_DISPLACEMENT': { bg: 'bg-orange-500/10 border-orange-500/40', label: '💨 Esperando Impulso', color: 'text-orange-400' },
    'ESPERANDO_SWEEP': { bg: 'bg-yellow-500/10 border-yellow-500/40', label: '🧹 Esperando Sweep', color: 'text-yellow-400' },
    'SIN_LIQUIDEZ': { bg: 'bg-zinc-500/10 border-zinc-500/40', label: '💰 Buscando Liquidez', color: 'text-zinc-400' },
    'ESTRUCTURA_USADA': { bg: 'bg-zinc-500/10 border-zinc-500/40', label: '⏸️ Estructura usada', color: 'text-zinc-400' },
  };
  
  const cfg = statusCfg[status] || statusCfg.SIN_LIQUIDEZ;

  return (
    <div className={`rounded-xl border p-3 ${cfg.bg}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs font-medium text-white">Narración</span>
          <span className={`text-[10px] ${cfg.color}`}>{cfg.label}</span>
        </div>
        {/* Toggle IA */}
        <button 
          onClick={onToggleAI}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
            aiEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-500'
          }`}
        >
          🤖 IA {aiEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
      
      <p className="text-zinc-300 text-xs leading-relaxed mb-2">{narration || 'Analizando...'}</p>
      
      {waiting?.length > 0 && (
        <div className="border-t border-white/10 pt-2 space-y-0.5">
          {waiting.map((w, i) => (
            <div key={i} className="text-[10px] text-amber-400">• {w}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================
// SIGNAL CARD (con ratios 1:10)
// =============================================
const SignalCard = ({ signal, onViewDetails }) => {
  if (!signal?.hasSignal && !signal?.scoring) return null;
  const isBuy = signal.direction === 'BULLISH';
  
  return (
    <div className={`rounded-xl border p-3 ${
      isBuy ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-red-500/10 border-red-500/40'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{isBuy ? '🟢' : '🔴'}</span>
          <div>
            <div className="font-bold text-white text-sm">{signal.symbolName}</div>
            <div className="text-[10px] text-zinc-400">{signal.scoring?.classification} • {signal.ltfEntry?.confirmationType || ''}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`font-bold ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>{isBuy ? 'COMPRA' : 'VENTA'}</div>
          <div className="text-[10px] text-zinc-500">{signal.scoring?.score}/100</div>
        </div>
      </div>
      
      {signal.levels && (
        <>
          <div className="grid grid-cols-6 gap-1 text-[10px] mb-2">
            <div className="bg-black/20 rounded p-1.5 text-center">
              <div className="text-zinc-500">Entry</div>
              <div className="font-mono text-blue-400">{signal.levels.entry}</div>
            </div>
            <div className="bg-black/20 rounded p-1.5 text-center">
              <div className="text-zinc-500">SL</div>
              <div className="font-mono text-red-400">{signal.levels.stopLoss}</div>
            </div>
            <div className="bg-black/20 rounded p-1.5 text-center">
              <div className="text-zinc-500">1:2</div>
              <div className="font-mono text-emerald-400">{signal.levels.tp1}</div>
            </div>
            <div className="bg-black/20 rounded p-1.5 text-center">
              <div className="text-zinc-500">1:3</div>
              <div className="font-mono text-emerald-400">{signal.levels.tp2}</div>
            </div>
            <div className="bg-black/20 rounded p-1.5 text-center">
              <div className="text-zinc-500">1:5</div>
              <div className="font-mono text-emerald-500">{signal.levels.tp3}</div>
            </div>
            <div className="bg-black/20 rounded p-1.5 text-center">
              <div className="text-zinc-500">1:10</div>
              <div className="font-mono text-emerald-600">{signal.levels.tp4}</div>
            </div>
          </div>
          
          <div className="text-[9px] text-zinc-500 space-y-0.5">
            <div>✓ {signal.sweep?.description}</div>
            <div>✓ {signal.choch?.description}</div>
            <div>✓ {signal.orderBlock?.description}</div>
          </div>
        </>
      )}
      
      {onViewDetails && (
        <button 
          onClick={() => onViewDetails(signal)}
          className="w-full mt-2 py-1.5 rounded bg-zinc-800/50 text-zinc-400 text-xs hover:bg-zinc-700/50 transition"
        >
          Ver gráfico y contexto →
        </button>
      )}
    </div>
  );
};

// =============================================
// MODAL DETALLE SEÑAL (Historial con gráfico)
// =============================================
const SignalDetailModal = ({ signal, onClose }) => {
  if (!signal) return null;
  const isBuy = signal.direction === 'BULLISH';
  
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-zinc-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`p-4 border-b border-zinc-800 flex items-center justify-between ${isBuy ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{isBuy ? '🟢' : '🔴'}</span>
            <div>
              <h2 className="text-lg font-bold text-white">{signal.symbolName}</h2>
              <div className="text-xs text-zinc-400">{new Date(signal.createdAt).toLocaleString()}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-xl">×</button>
        </div>
        
        {/* Gráfico */}
        <div className="p-4">
          <SMCChart 
            candles={signal.candles?.htf || []}
            markers={signal.chartMarkers}
            title={`${signal.symbolName} - 5M (HTF)`}
            height={300}
          />
        </div>
        
        {/* Contexto */}
        <div className="px-4 pb-4 grid grid-cols-2 gap-4">
          <div className="bg-zinc-800/50 rounded-xl p-3">
            <h3 className="text-xs font-bold text-white mb-2">📊 Contexto SMC</h3>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-zinc-500">Sweep:</span><span className="text-amber-400">{signal.sweep?.type}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Displacement:</span><span className="text-orange-400">{signal.displacement?.multiplier}x ATR</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">CHoCH:</span><span className={isBuy ? 'text-emerald-400' : 'text-red-400'}>{signal.choch?.direction}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">OB Type:</span><span className="text-purple-400">{signal.orderBlock?.obType}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">LTF Entry:</span><span className="text-blue-400">{signal.ltfEntry?.confirmationType}</span></div>
            </div>
          </div>
          
          <div className="bg-zinc-800/50 rounded-xl p-3">
            <h3 className="text-xs font-bold text-white mb-2">🎯 Niveles</h3>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-zinc-500">Entry:</span><span className="text-blue-400 font-mono">{signal.levels?.entry}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Stop Loss:</span><span className="text-red-400 font-mono">{signal.levels?.stopLoss}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">TP1 (1:2):</span><span className="text-emerald-400 font-mono">{signal.levels?.tp1}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">TP2 (1:3):</span><span className="text-emerald-400 font-mono">{signal.levels?.tp2}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">TP3 (1:5):</span><span className="text-emerald-500 font-mono">{signal.levels?.tp3}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">TP4 (1:10):</span><span className="text-emerald-600 font-mono">{signal.levels?.tp4}</span></div>
            </div>
          </div>
        </div>
        
        {/* Score */}
        <div className="px-4 pb-4">
          <div className="bg-zinc-800/50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-500">Score Total</span>
              <span className={`text-sm font-bold ${signal.scoring?.score >= 90 ? 'text-emerald-400' : 'text-blue-400'}`}>
                {signal.scoring?.score}/100 ({signal.scoring?.classification})
              </span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${signal.scoring?.score}%` }} />
            </div>
            <div className="mt-2 flex gap-2 text-[10px]">
              {Object.entries(signal.scoring?.breakdown || {}).map(([k, v]) => (
                <div key={k} className="bg-zinc-900 rounded px-2 py-1">
                  <span className="text-zinc-500">{k}:</span> <span className="text-white">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================
// SYMBOL SELECTOR
// =============================================
const SymbolSelector = ({ symbols, selected, onSelect, counts }) => (
  <div className="flex gap-2">
    {Object.entries(symbols).map(([key, info]) => (
      <button
        key={key}
        onClick={() => onSelect(key)}
        className={`flex-1 py-2.5 px-3 rounded-xl transition ${
          selected === key ? 'bg-blue-600 text-white' : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50'
        }`}
      >
        <div className="font-medium text-sm">{info.name}</div>
        <div className={`text-xs ${(counts?.[key] || 0) >= 7 ? 'text-red-400' : 'text-zinc-500'}`}>{counts?.[key] || 0}/7</div>
      </button>
    ))}
  </div>
);

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
  const [selectedSignal, setSelectedSignal] = useState(null);

  // Init
  useEffect(() => {
    const init = async () => {
      try {
        const [health, syms, sigs, counts, aiStatus] = await Promise.all([
          fetch(`${API_URL}/health`).then(r => r.json()),
          fetch(`${API_URL}/api/deriv/symbols`).then(r => r.json()),
          fetch(`${API_URL}/api/signals/history`).then(r => r.json()),
          fetch(`${API_URL}/api/signals/daily-count`).then(r => r.json()),
          fetch(`${API_URL}/api/ai/status`).then(r => r.json()).catch(() => ({ aiEnabled: true })),
        ]);
        setConnected(health.deriv);
        setSymbols(syms);
        setSignals(sigs);
        setDailyCounts(counts);
        setAiEnabled(aiStatus.aiEnabled);
      } catch { setConnected(false); }
    };
    init();
  }, []);

  // Fetch analysis
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

  // Fetch signals
  useEffect(() => {
    const f = async () => {
      try {
        const [s, c] = await Promise.all([
          fetch(`${API_URL}/api/signals/history`).then(r => r.json()),
          fetch(`${API_URL}/api/signals/daily-count`).then(r => r.json()),
        ]);
        setSignals(s);
        setDailyCounts(c);
      } catch {}
    };
    const i = setInterval(f, 15000);
    return () => clearInterval(i);
  }, []);

  // Toggle IA
  const handleToggleAI = async () => {
    try {
      const res = await fetch(`${API_URL}/api/ai/toggle`, { method: 'POST' });
      const data = await res.json();
      setAiEnabled(data.aiEnabled);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-[#08080a] text-white">
      {/* Header */}
      <header className="border-b border-zinc-800/50 px-4 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold">Trading<span className="text-blue-500">Pro</span></h1>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">v7.1 ELITE</span>
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-[10px] text-zinc-500">{connected ? 'Online' : 'Offline'}</span>
            </div>
          </div>
          <div className="text-[9px] text-zinc-600">Liquidez → Sweep → Displacement → CHoCH → OB → 1M</div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-zinc-800/50 px-4">
        <div className="max-w-6xl mx-auto flex">
          {[
            { id: 'live', label: '📊 Análisis' },
            { id: 'history', label: '📜 Historial' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-xs border-b-2 transition ${
                tab === t.id ? 'border-blue-500 text-white' : 'border-transparent text-zinc-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main */}
      <main className="max-w-6xl mx-auto p-4">
        {tab === 'live' && (
          <div className="space-y-4">
            <SymbolSelector symbols={symbols} selected={selectedSymbol} onSelect={setSelectedSymbol} counts={dailyCounts} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-3">
                <SMCChart 
                  candles={analysis?.candles?.htf || []}
                  markers={analysis?.chartMarkers}
                  title={`${symbols[selectedSymbol]?.name} - 5M`}
                />
                
                <NarrationPanel 
                  narration={narration?.text}
                  waiting={narration?.waiting}
                  status={analysis?.status}
                  aiEnabled={aiEnabled}
                  onToggleAI={handleToggleAI}
                />
                
                {analysis?.hasSignal && <SignalCard signal={analysis} />}
              </div>
              
              <div className="space-y-3">
                <SMCFlow analysis={analysis} />
                
                {analysis?.scoring && (
                  <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-500">Score</span>
                      <span className={`text-sm font-bold ${analysis.scoring.score >= 90 ? 'text-emerald-400' : analysis.scoring.score >= 75 ? 'text-blue-400' : 'text-zinc-400'}`}>
                        {analysis.scoring.score}/100 ({analysis.scoring.classification})
                      </span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full transition-all ${analysis.scoring.score >= 90 ? 'bg-emerald-500' : analysis.scoring.score >= 75 ? 'bg-blue-500' : 'bg-zinc-600'}`} style={{ width: `${analysis.scoring.score}%` }} />
                    </div>
                    <div className="mt-1 text-[9px] text-zinc-500">
                      {analysis.scoring.canAutomate ? '✅ Auto-ejecutable' : '⏳ Manual'}
                      {analysis.structureUsed && ' • ⚠️ Estructura ya usada'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">📜 Historial de Señales A+</h2>
              <span className="text-[10px] text-zinc-500">Click para ver gráfico</span>
            </div>
            
            {signals.length === 0 ? (
              <div className="text-center text-zinc-500 py-8 text-sm">Sin señales A+ aún</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {signals.map(s => (
                  <SignalCard key={s.id} signal={s} onViewDetails={setSelectedSignal} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal */}
      {selectedSignal && <SignalDetailModal signal={selectedSignal} onClose={() => setSelectedSignal(null)} />}
    </div>
  );
}
