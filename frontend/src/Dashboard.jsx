// =============================================
// TRADING MASTER PRO v10.9
// + Pullback to Order Block Pattern
// + Zonas de Demanda/Oferta visibles
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// GRÁFICO CON ZONAS DE DEMANDA/OFERTA
// =============================================
const Chart = ({ candles = [], signal, decimals = 2, demandZones = [], supplyZones = [] }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext('2d');
    
    const W = container.clientWidth;
    const H = 420;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
    
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);
    
    if (!candles || candles.length === 0) {
      ctx.fillStyle = '#333';
      ctx.font = '13px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Cargando datos...', W / 2, H / 2);
      return;
    }
    
    const MARGIN = { top: 20, right: 80, bottom: 30, left: 15 };
    const chartW = W - MARGIN.left - MARGIN.right;
    const chartH = H - MARGIN.top - MARGIN.bottom;
    
    const data = candles.slice(-60);
    
    let minP = Math.min(...data.map(c => c.low));
    let maxP = Math.max(...data.map(c => c.high));
    
    // Incluir zonas en el rango
    demandZones.forEach(z => { minP = Math.min(minP, z.low); });
    supplyZones.forEach(z => { maxP = Math.max(maxP, z.high); });
    
    if (signal?.entry) {
      minP = Math.min(minP, signal.stop || minP);
      maxP = Math.max(maxP, signal.tp3 || maxP);
    }
    
    const pad = (maxP - minP) * 0.08;
    minP -= pad;
    maxP += pad;
    const range = maxP - minP;
    
    const toY = (p) => MARGIN.top + ((maxP - p) / range) * chartH;
    const candleW = chartW / data.length;
    const bodyW = candleW * 0.65;
    const gap = candleW * 0.175;
    
    // Grid
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const p = maxP - (range / 6) * i;
      const y = toY(p);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(W - MARGIN.right, y);
      ctx.stroke();
      
      ctx.fillStyle = '#4a4a4a';
      ctx.font = '10px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(p.toFixed(decimals), W - MARGIN.right + 8, y + 3);
    }
    
    // =============================================
    // DIBUJAR ZONAS DE DEMANDA (verde transparente)
    // =============================================
    demandZones.forEach(zone => {
      const y1 = toY(zone.high);
      const y2 = toY(zone.low);
      const height = y2 - y1;
      
      // Zona sombreada
      ctx.fillStyle = 'rgba(0, 200, 83, 0.15)';
      ctx.fillRect(MARGIN.left, y1, chartW, height);
      
      // Borde superior
      ctx.strokeStyle = 'rgba(0, 200, 83, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y1);
      ctx.lineTo(W - MARGIN.right, y1);
      ctx.stroke();
      
      // Borde inferior
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y2);
      ctx.lineTo(W - MARGIN.right, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Label
      ctx.fillStyle = 'rgba(0, 200, 83, 0.8)';
      ctx.font = 'bold 9px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('DEMAND', MARGIN.left + 5, y1 + 12);
    });
    
    // =============================================
    // DIBUJAR ZONAS DE OFERTA (rojo transparente)
    // =============================================
    supplyZones.forEach(zone => {
      const y1 = toY(zone.high);
      const y2 = toY(zone.low);
      const height = y2 - y1;
      
      ctx.fillStyle = 'rgba(255, 23, 68, 0.15)';
      ctx.fillRect(MARGIN.left, y1, chartW, height);
      
      ctx.strokeStyle = 'rgba(255, 23, 68, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y1);
      ctx.lineTo(W - MARGIN.right, y1);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y2);
      ctx.lineTo(W - MARGIN.right, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = 'rgba(255, 23, 68, 0.8)';
      ctx.font = 'bold 9px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('SUPPLY', MARGIN.left + 5, y2 - 5);
    });
    
    // Velas
    data.forEach((c, i) => {
      const x = MARGIN.left + gap + (i * candleW);
      const cx = x + bodyW / 2;
      const up = c.close >= c.open;
      const color = up ? '#00c853' : '#ff1744';
      
      const hY = toY(c.high);
      const lY = toY(c.low);
      const oY = toY(c.open);
      const cY = toY(c.close);
      const top = Math.min(oY, cY);
      const bot = Math.max(oY, cY);
      const h = Math.max(1, bot - top);
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, hY);
      ctx.lineTo(cx, top);
      ctx.moveTo(cx, bot);
      ctx.lineTo(cx, lY);
      ctx.stroke();
      
      ctx.fillStyle = color;
      ctx.fillRect(x, top, bodyW, h);
    });
    
    // Líneas de señal
    const drawLevel = (price, color, label, dash = true) => {
      if (!price) return;
      const y = toY(price);
      if (y < MARGIN.top - 5 || y > H - MARGIN.bottom + 5) return;
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      if (dash) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(W - MARGIN.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.font = '9px -apple-system, system-ui, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.fillText(label, W - MARGIN.right - 5, y - 4);
    };
    
    if (signal?.action && !['WAIT', 'LOADING'].includes(signal.action)) {
      drawLevel(signal.tp3, '#7cb342', 'TP3');
      drawLevel(signal.tp2, '#9ccc65', 'TP2');
      drawLevel(signal.tp1, '#aed581', 'TP1');
      drawLevel(signal.entry, '#42a5f5', 'ENTRY', false);
      drawLevel(signal.stop, '#ef5350', 'SL');
    }
    
    // Precio actual
    if (data.length > 0) {
      const last = data[data.length - 1];
      const y = toY(last.close);
      const up = last.close >= last.open;
      const color = up ? '#00c853' : '#ff1744';
      
      ctx.strokeStyle = color + '60';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(W - MARGIN.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = color;
      const badgeW = 65;
      const badgeH = 20;
      ctx.beginPath();
      ctx.roundRect(W - MARGIN.right + 2, y - badgeH/2, badgeW, badgeH, 3);
      ctx.fill();
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(last.close.toFixed(decimals), W - MARGIN.right + 2 + badgeW/2, y + 4);
    }
    
  }, [candles, signal, decimals, demandZones, supplyZones]);
  
  return (
    <div ref={containerRef} className="w-full bg-[#0d0d0d] rounded-xl overflow-hidden">
      <canvas ref={canvasRef} />
    </div>
  );
};

// =============================================
// ASSET LIST
// =============================================
const AssetList = ({ assets, selected, onSelect }) => (
  <div className="space-y-1">
    {assets?.map(asset => {
      const active = selected?.symbol === asset.symbol;
      const hasSignal = asset.signal?.action && !['WAIT', 'LOADING'].includes(asset.signal.action);
      const isPullback = asset.signal?.model === 'PULLBACK_OB' || asset.signal?.model === 'CHOCH_PULLBACK' || asset.signal?.model === 'STRUCTURE_PULLBACK';
      
      return (
        <div
          key={asset.symbol}
          onClick={() => onSelect(asset)}
          className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
            active ? 'bg-white/10' : 'hover:bg-white/5'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-lg">{asset.emoji}</span>
            <div>
              <p className={`text-sm font-medium ${active ? 'text-white' : 'text-gray-300'}`}>
                {asset.name}
              </p>
              <p className="text-xs text-gray-500 font-mono">
                {asset.price?.toFixed(asset.decimals) || '---'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {hasSignal && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                isPullback ? 'bg-purple-500/20 text-purple-400' :
                asset.signal.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
              }`}>
                {isPullback ? (asset.signal?.model === 'CHOCH_PULLBACK' ? 'CP' : asset.signal?.model === 'STRUCTURE_PULLBACK' ? 'SP' : 'PB') : asset.signal.action}
              </span>
            )}
            {(asset.demandZones > 0 || asset.supplyZones > 0) && (
              <span className="text-[10px] text-gray-500">
                {asset.demandZones}D/{asset.supplyZones}S
              </span>
            )}
          </div>
        </div>
      );
    })}
  </div>
);

// =============================================
// SIGNAL CARD
// =============================================
const SignalCard = ({ signal }) => {
  if (!signal) return null;
  
  const hasSignal = signal.action && !['WAIT', 'LOADING'].includes(signal.action);
  const isLong = signal.action === 'LONG';
  const isPullback = signal.model === 'PULLBACK_OB';
  
  return (
    <div className="bg-[#111] rounded-xl p-4 border border-white/5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-gray-500 text-xs uppercase tracking-wider">Signal</span>
        <span className={`text-lg font-bold ${
          isLong ? 'text-emerald-400' : signal.action === 'SHORT' ? 'text-red-400' : 'text-gray-500'
        }`}>
          {signal.action || 'WAIT'}
        </span>
      </div>
      
      {/* Score */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-gray-500">Score</span>
          <span className="text-white font-medium">{signal.score || 0}%</span>
        </div>
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${
              signal.score >= 55 ? 'bg-emerald-500' : 'bg-gray-600'
            }`}
            style={{ width: `${signal.score || 0}%` }}
          />
        </div>
      </div>
      
      {/* Model badge */}
      {signal.model && signal.model !== 'NO_SETUP' && (
        <div className="mb-4">
          <span className={`text-[10px] font-bold px-2 py-1 rounded ${
            signal.model === 'CHOCH_PULLBACK' ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400' :
            signal.model === 'STRUCTURE_PULLBACK' ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-400' :
            signal.model === 'PULLBACK_OB' ? 'bg-purple-500/20 text-purple-400' :
            signal.model === 'CHOCH' || signal.model === 'CHOCH_WAITING' ? 'bg-orange-500/20 text-orange-400' :
            signal.model === 'REVERSAL' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-blue-500/20 text-blue-400'
          }`}>
            {signal.model === 'CHOCH_PULLBACK' ? '💎 CHoCH+PB' : signal.model === 'STRUCTURE_PULLBACK' ? '🔷 Struct+PB' : signal.model === 'PULLBACK_OB' ? '📦 PULLBACK' : signal.model}
          </span>
        </div>
      )}
      
      {/* Levels */}
      {hasSignal && (
        <div className="space-y-2">
          <div className="flex justify-between items-center py-1.5 px-2.5 bg-blue-500/10 rounded-lg">
            <span className="text-blue-400 text-xs">Entry</span>
            <span className="text-white text-sm font-mono">{signal.entry}</span>
          </div>
          <div className="flex justify-between items-center py-1.5 px-2.5 bg-red-500/10 rounded-lg">
            <span className="text-red-400 text-xs">Stop</span>
            <span className="text-white text-sm font-mono">{signal.stop}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <div className="text-center py-1.5 bg-emerald-500/10 rounded-lg">
              <p className="text-[10px] text-emerald-400">TP1 (1:1)</p>
              <p className="text-xs text-white font-mono">{signal.tp1}</p>
            </div>
            <div className="text-center py-1.5 bg-emerald-500/10 rounded-lg">
              <p className="text-[10px] text-emerald-400">TP2 (1:2)</p>
              <p className="text-xs text-white font-mono">{signal.tp2}</p>
            </div>
            <div className="text-center py-1.5 bg-emerald-500/10 rounded-lg">
              <p className="text-[10px] text-emerald-400">TP3 (1:3)</p>
              <p className="text-xs text-white font-mono">{signal.tp3}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================
// STATS
// =============================================
const StatsMini = ({ stats }) => {
  if (!stats) return null;
  
  const total = stats.wins + stats.losses;
  const winRate = total > 0 ? ((stats.wins / total) * 100).toFixed(0) : 0;
  
  return (
    <div className="bg-[#111] rounded-xl p-4 border border-white/5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-500 text-xs uppercase tracking-wider">Stats</span>
        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">Auto</span>
      </div>
      
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="text-center">
          <p className="text-emerald-400 text-lg font-bold">{stats.wins}</p>
          <p className="text-[10px] text-gray-500">Win</p>
        </div>
        <div className="text-center">
          <p className="text-red-400 text-lg font-bold">{stats.losses}</p>
          <p className="text-[10px] text-gray-500">Loss</p>
        </div>
        <div className="text-center">
          <p className="text-gray-400 text-lg font-bold">{stats.notTaken}</p>
          <p className="text-[10px] text-gray-500">Skip</p>
        </div>
        <div className="text-center">
          <p className="text-blue-400 text-lg font-bold">{stats.pending}</p>
          <p className="text-[10px] text-gray-500">Open</p>
        </div>
      </div>
      
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <span className="text-gray-500 text-xs">Win Rate</span>
        <span className={`text-xl font-bold ${winRate >= 60 ? 'text-emerald-400' : winRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
          {winRate}%
        </span>
      </div>
    </div>
  );
};

// =============================================
// AI NARRATION
// =============================================
const AINarration = ({ symbol, assetName }) => {
  const [narration, setNarration] = useState(null);
  
  useEffect(() => {
    if (!symbol) return;
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API_URL}/api/ai/narrate/${symbol}`);
        setNarration(await res.json());
      } catch {}
    };
    fetch_();
    const i = setInterval(fetch_, 8000);
    return () => clearInterval(i);
  }, [symbol]);
  
  return (
    <div className="bg-gradient-to-br from-indigo-950/40 to-purple-950/40 rounded-xl p-4 border border-indigo-500/20">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
          <span className="text-sm">🤖</span>
        </div>
        <div>
          <p className="text-white text-sm font-medium">AI Analysis</p>
          <p className="text-indigo-400 text-[10px]">{assetName} • En vivo</p>
        </div>
      </div>
      
      {narration ? (
        <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
          {narration.text}
        </div>
      ) : (
        <p className="text-gray-500 text-sm">Analizando...</p>
      )}
    </div>
  );
};

// =============================================
// AI CHAT
// =============================================
const AIChat = ({ symbol, assetName }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  
  useEffect(() => {
    setMessages([{
      role: 'ai',
      content: `👋 Analizando **${assetName}**.\n\nPregunta sobre: señales, zonas, pullback, tendencia...`
    }]);
  }, [symbol, assetName]);
  
  const send = async () => {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    
    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, symbol })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', content: data.answer }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', content: '❌ Error de conexión' }]);
    }
    setLoading(false);
  };
  
  const suggestions = ['¿Señal?', '¿Zonas?', '¿Pullback?', '¿Qué hacer?'];
  
  return (
    <div className="bg-[#111] rounded-xl border border-white/5 flex flex-col h-[350px]">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>💬</span>
          <span className="text-white text-sm font-medium">Chat AI</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-xl px-3.5 py-2.5 ${
              msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-gray-200'
            }`}>
              <p className="text-sm whitespace-pre-line leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}
        {loading && <div className="text-gray-500 text-sm">Pensando...</div>}
        <div ref={endRef} />
      </div>
      
      <div className="px-4 py-2 flex gap-2 border-t border-white/5">
        {suggestions.map((s, i) => (
          <button key={i} onClick={() => setInput(s)} className="px-3 py-1.5 text-[11px] bg-white/5 hover:bg-white/10 text-gray-400 rounded-full">
            {s}
          </button>
        ))}
      </div>
      
      <div className="p-3 border-t border-white/5">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && send()}
            placeholder="Pregunta..."
            className="flex-1 bg-white/5 border-0 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          />
          <button onClick={send} disabled={loading} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 text-white rounded-xl text-sm font-medium">
            →
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================================
// SIGNAL HISTORY
// =============================================
const SignalHistory = ({ signals, onUpdate }) => {
  if (!signals?.length) return null;
  
  return (
    <div className="bg-[#111] rounded-xl border border-white/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5">
        <span className="text-gray-500 text-xs uppercase tracking-wider">Historial</span>
      </div>
      
      <div className="max-h-[250px] overflow-y-auto divide-y divide-white/5">
        {signals.slice(0, 8).map((sig) => (
          <div key={sig.id} className={`p-3 ${
            sig.status === 'WIN' ? 'bg-emerald-500/5' : sig.status === 'LOSS' ? 'bg-red-500/5' : ''
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">{sig.emoji}</span>
                <span className="text-white text-xs">{sig.assetName}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  sig.model === 'CHOCH_PULLBACK' ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400' :
                  sig.model === 'STRUCTURE_PULLBACK' ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-400' :
                  sig.model === 'PULLBACK_OB' ? 'bg-purple-500/20 text-purple-400' :
                  sig.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {sig.model === 'CHOCH_PULLBACK' ? 'CP' : sig.model === 'STRUCTURE_PULLBACK' ? 'SP' : sig.model === 'PULLBACK_OB' ? 'PB' : sig.action}
                </span>
              </div>
            </div>
            
            {sig.status === 'PENDING' ? (
              <div className="flex gap-1.5">
                <button onClick={() => onUpdate(sig.id, 'WIN')} className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg">WIN</button>
                <button onClick={() => onUpdate(sig.id, 'LOSS')} className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded-lg">LOSS</button>
                <button onClick={() => onUpdate(sig.id, 'NOT_TAKEN')} className="flex-1 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-[10px] font-bold rounded-lg">SKIP</button>
              </div>
            ) : (
              <div className={`text-center py-1.5 rounded-lg text-[10px] font-bold ${
                sig.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' :
                sig.status === 'LOSS' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'
              }`}>
                {sig.status} {sig.closedBy?.startsWith('AUTO') && '(auto)'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================
// DASHBOARD
// =============================================
const Dashboard = () => {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/dashboard`);
      const json = await res.json();
      setData(json);
      if (!selected && json.assets?.length) setSelected(json.assets[0]);
    } catch {}
  }, [selected]);
  
  const fetchDetail = useCallback(async (symbol) => {
    try {
      const res = await fetch(`${API_URL}/api/analyze/${symbol}`);
      setDetail(await res.json());
    } catch {}
  }, []);
  
  const updateSignal = async (id, status) => {
    try {
      await fetch(`${API_URL}/api/signals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchData();
    } catch {}
  };
  
  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 2000);
    return () => clearInterval(i);
  }, [fetchData]);
  
  useEffect(() => {
    if (selected?.symbol) {
      fetchDetail(selected.symbol);
      const i = setInterval(() => fetchDetail(selected.symbol), 2000);
      return () => clearInterval(i);
    }
  }, [selected?.symbol, fetchDetail]);
  
  if (!data) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-800 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Conectando...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="h-14 px-6 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold tracking-tight">TradingPro</h1>
          <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-1 rounded">v10.9</span>
          <span className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-1 rounded">💎 SL+TP Fix</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${data.connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-500">{data.connected ? 'Live' : 'Offline'}</span>
        </div>
      </header>
      
      <main className="p-4 max-w-[1800px] mx-auto">
        <div className="grid grid-cols-12 gap-4">
          {/* Assets */}
          <aside className="col-span-12 lg:col-span-2">
            <div className="bg-[#111] rounded-xl p-3 border border-white/5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider px-3 mb-2">Assets</p>
              <AssetList assets={data.assets} selected={selected} onSelect={setSelected} />
            </div>
          </aside>
          
          {/* Chart */}
          <section className="col-span-12 lg:col-span-6 space-y-4">
            {selected && (
              <>
                <div className="bg-[#111] rounded-xl border border-white/5 overflow-hidden">
                  <div className="px-5 py-3 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{selected.emoji}</span>
                      <div>
                        <h2 className="text-white font-semibold">{selected.name}</h2>
                        <p className="text-gray-500 text-xs">{selected.type} • M5</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-mono font-bold">{selected.price?.toFixed(selected.decimals) || '---'}</p>
                      <p className="text-[10px] text-gray-500">
                        {detail?.demandZones?.length || 0} demanda • {detail?.supplyZones?.length || 0} oferta
                      </p>
                    </div>
                  </div>
                  <div className="p-2">
                    <Chart 
                      candles={detail?.candles} 
                      signal={detail?.signal} 
                      decimals={selected.decimals}
                      demandZones={detail?.demandZones || []}
                      supplyZones={detail?.supplyZones || []}
                    />
                  </div>
                </div>
                <AINarration symbol={selected.symbol} assetName={selected.name} />
              </>
            )}
          </section>
          
          {/* Signal + Stats */}
          <aside className="col-span-12 lg:col-span-2 space-y-4">
            <SignalCard signal={selected?.signal} />
            <StatsMini stats={data.stats} />
          </aside>
          
          {/* Chat + History */}
          <aside className="col-span-12 lg:col-span-2 space-y-4">
            {selected && <AIChat symbol={selected.symbol} assetName={selected.name} />}
            <SignalHistory signals={data.recentSignals} onUpdate={updateSignal} />
          </aside>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
