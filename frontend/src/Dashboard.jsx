// =============================================
// TRADING MASTER PRO v10.3
// TP1/TP2/TP3 + Auto-tracking + CHoCH
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// GRÁFICO DE VELAS CON TP1/TP2/TP3
// =============================================
const CandlestickChart = ({ candles = [], signal, decimals = 2 }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext('2d');
    
    const W = container.clientWidth;
    const H = 380;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
    
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);
    
    if (!candles || candles.length === 0) {
      ctx.fillStyle = '#444';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Cargando...', W / 2, H / 2);
      return;
    }
    
    const MARGIN = { top: 15, right: 70, bottom: 20, left: 10 };
    const chartWidth = W - MARGIN.left - MARGIN.right;
    const chartHeight = H - MARGIN.top - MARGIN.bottom;
    
    const data = candles.slice(-50);
    
    let minPrice = Math.min(...data.map(c => c.low));
    let maxPrice = Math.max(...data.map(c => c.high));
    
    // Incluir todos los TPs en el rango
    if (signal?.entry) {
      minPrice = Math.min(minPrice, signal.entry, signal.stop || minPrice);
      maxPrice = Math.max(maxPrice, signal.entry, signal.tp3 || maxPrice);
    }
    
    const priceMargin = (maxPrice - minPrice) * 0.05;
    minPrice -= priceMargin;
    maxPrice += priceMargin;
    const priceRange = maxPrice - minPrice;
    
    const priceToY = (price) => MARGIN.top + ((maxPrice - price) / priceRange) * chartHeight;
    const candleFullWidth = chartWidth / data.length;
    const candleBodyWidth = candleFullWidth * 0.7;
    const candleGap = candleFullWidth * 0.15;
    
    // Grid
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.font = '9px monospace';
    ctx.fillStyle = '#444';
    ctx.textAlign = 'left';
    
    for (let i = 0; i <= 4; i++) {
      const price = maxPrice - (priceRange / 4) * i;
      const y = priceToY(price);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(W - MARGIN.right, y);
      ctx.stroke();
      ctx.fillText(price.toFixed(decimals), W - MARGIN.right + 4, y + 3);
    }
    
    // Velas
    data.forEach((candle, index) => {
      const x = MARGIN.left + candleGap + (index * candleFullWidth);
      const centerX = x + candleBodyWidth / 2;
      const isGreen = candle.close >= candle.open;
      const color = isGreen ? '#26a69a' : '#ef5350';
      
      const highY = priceToY(candle.high);
      const lowY = priceToY(candle.low);
      const openY = priceToY(candle.open);
      const closeY = priceToY(candle.close);
      const bodyTop = Math.min(openY, closeY);
      const bodyBottom = Math.max(openY, closeY);
      const bodyHeight = Math.max(1, bodyBottom - bodyTop);
      
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.moveTo(centerX, highY);
      ctx.lineTo(centerX, bodyTop);
      ctx.moveTo(centerX, bodyBottom);
      ctx.lineTo(centerX, lowY);
      ctx.stroke();
      
      ctx.fillStyle = color;
      ctx.fillRect(x, bodyTop, candleBodyWidth, bodyHeight);
    });
    
    // Líneas de señal
    const drawLine = (price, color, label, dashed = true) => {
      if (!price) return;
      const y = priceToY(price);
      if (y < MARGIN.top - 10 || y > H - MARGIN.bottom + 10) return;
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      if (dashed) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(W - MARGIN.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = color;
      ctx.font = 'bold 8px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(`${label} ${price.toFixed(decimals)}`, W - MARGIN.right - 3, y - 3);
    };
    
    if (signal?.action && !['WAIT', 'LOADING'].includes(signal.action)) {
      drawLine(signal.entry, '#2196f3', 'ENTRY', false);
      drawLine(signal.stop, '#ef5350', 'SL');
      drawLine(signal.tp1, '#4caf50', 'TP1');
      drawLine(signal.tp2, '#8bc34a', 'TP2');
      drawLine(signal.tp3, '#cddc39', 'TP3');
    }
    
    // Precio actual
    if (data.length > 0) {
      const last = data[data.length - 1];
      const y = priceToY(last.close);
      const color = last.close >= last.open ? '#26a69a' : '#ef5350';
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(W - MARGIN.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = color;
      ctx.fillRect(W - MARGIN.right, y - 9, 60, 18);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(last.close.toFixed(decimals), W - MARGIN.right + 30, y + 4);
    }
    
  }, [candles, signal, decimals]);
  
  return (
    <div ref={containerRef} style={{ width: '100%', backgroundColor: '#0a0a0a', borderRadius: '8px' }}>
      <canvas ref={canvasRef} />
    </div>
  );
};

// =============================================
// TARJETA DE ACTIVO
// =============================================
const AssetCard = ({ asset, selected, onClick }) => {
  const sig = asset.signal;
  const hasSignal = sig?.action && !['WAIT', 'LOADING'].includes(sig.action);
  
  return (
    <div 
      onClick={() => onClick(asset)}
      className={`p-3 rounded-lg cursor-pointer transition-all border ${
        selected 
          ? 'bg-zinc-800 border-zinc-600' 
          : hasSignal
            ? sig.action === 'LONG'
              ? 'bg-green-900/20 border-green-700/50'
              : 'bg-red-900/20 border-red-700/50'
            : 'bg-zinc-900/50 border-zinc-800/50 hover:bg-zinc-800/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{asset.emoji}</span>
          <span className="text-white text-sm font-medium">{asset.name}</span>
        </div>
        {hasSignal && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
            sig.action === 'LONG' ? 'bg-green-600' : 'bg-red-600'
          }`}>
            {sig.action}
          </span>
        )}
      </div>
      <div className="flex justify-between mt-1 text-sm">
        <span className="text-zinc-400 font-mono">{asset.price?.toFixed(asset.decimals) || '---'}</span>
        {sig?.score > 0 && <span className="text-zinc-500">{sig.score}%</span>}
      </div>
    </div>
  );
};

// =============================================
// PANEL DE SEÑAL CON TP1/TP2/TP3
// =============================================
const SignalPanel = ({ asset }) => {
  if (!asset?.signal) return null;
  const sig = asset.signal;
  const hasSignal = sig.action && !['WAIT', 'LOADING'].includes(sig.action);
  
  return (
    <div className="bg-zinc-900/80 rounded-lg p-4 border border-zinc-800">
      <div className="flex justify-between items-center mb-3">
        <span className="text-zinc-500 text-sm">Señal</span>
        <span className={`text-lg font-bold ${
          sig.action === 'LONG' ? 'text-green-400' :
          sig.action === 'SHORT' ? 'text-red-400' : 'text-zinc-500'
        }`}>
          {sig.action || 'WAIT'}
        </span>
      </div>
      
      {/* Modelo con badge CHoCH */}
      {sig.model && sig.model !== 'NO_SETUP' && (
        <div className="mb-3">
          <span className={`text-xs font-bold px-2 py-1 rounded ${
            sig.model === 'CHOCH' ? 'bg-purple-600 text-white' :
            sig.model === 'REVERSAL' ? 'bg-orange-600 text-white' :
            'bg-blue-600 text-white'
          }`}>
            {sig.model}
          </span>
          {sig.analysis?.choch && (
            <span className="ml-2 text-xs text-purple-400">⚡ {sig.analysis.choch}</span>
          )}
        </div>
      )}
      
      {/* Score */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-zinc-500">Score</span>
          <span className="text-white">{sig.score || 0}%</span>
        </div>
        <div className="h-1.5 bg-zinc-800 rounded-full">
          <div 
            className={`h-full rounded-full ${sig.score >= 70 ? 'bg-green-500' : 'bg-zinc-600'}`}
            style={{ width: `${sig.score || 0}%` }}
          />
        </div>
      </div>
      
      {/* Entry/SL/TPs */}
      {hasSignal && (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between p-2 bg-blue-500/10 rounded border-l-2 border-blue-500">
            <span className="text-blue-400">Entry</span>
            <span className="text-white font-mono">{sig.entry}</span>
          </div>
          <div className="flex justify-between p-2 bg-red-500/10 rounded border-l-2 border-red-500">
            <span className="text-red-400">Stop Loss</span>
            <span className="text-white font-mono">{sig.stop}</span>
          </div>
          <div className="flex justify-between p-2 bg-green-500/10 rounded border-l-2 border-green-600">
            <span className="text-green-400">TP1 <span className="text-zinc-500">(1:1)</span></span>
            <span className="text-white font-mono">{sig.tp1}</span>
          </div>
          <div className="flex justify-between p-2 bg-green-500/10 rounded border-l-2 border-green-500">
            <span className="text-green-400">TP2 <span className="text-zinc-500">(1:2)</span></span>
            <span className="text-white font-mono">{sig.tp2}</span>
          </div>
          <div className="flex justify-between p-2 bg-green-500/10 rounded border-l-2 border-lime-500">
            <span className="text-lime-400">TP3 <span className="text-zinc-500">(1:3)</span></span>
            <span className="text-white font-mono">{sig.tp3}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================
// ESTADÍSTICAS MEJORADAS
// =============================================
const StatsPanel = ({ stats }) => {
  if (!stats) return null;
  
  const totalDecided = stats.wins + stats.losses;
  const winRate = totalDecided > 0 ? ((stats.wins / totalDecided) * 100).toFixed(0) : 0;
  
  return (
    <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-lg p-4 border border-zinc-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm">📊 Estadísticas</h3>
        <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
          🤖 Auto-tracking
        </span>
      </div>
      
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="text-center p-2 bg-green-500/10 rounded">
          <p className="text-green-400 text-lg font-bold">{stats.wins}</p>
          <p className="text-zinc-500 text-xs">Wins</p>
        </div>
        <div className="text-center p-2 bg-red-500/10 rounded">
          <p className="text-red-400 text-lg font-bold">{stats.losses}</p>
          <p className="text-zinc-500 text-xs">Losses</p>
        </div>
        <div className="text-center p-2 bg-zinc-700/50 rounded">
          <p className="text-zinc-400 text-lg font-bold">{stats.notTaken}</p>
          <p className="text-zinc-500 text-xs">Skip</p>
        </div>
        <div className="text-center p-2 bg-blue-500/10 rounded">
          <p className="text-blue-400 text-lg font-bold">{stats.pending}</p>
          <p className="text-zinc-500 text-xs">Pend</p>
        </div>
      </div>
      
      {/* Win Rate */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-zinc-400 text-sm">Win Rate</span>
        <span className={`text-xl font-bold ${
          winRate >= 60 ? 'text-green-400' : winRate >= 40 ? 'text-yellow-400' : 'text-red-400'
        }`}>
          {winRate}%
        </span>
      </div>
      
      {/* TPs alcanzados */}
      <div className="pt-3 border-t border-zinc-700">
        <p className="text-zinc-500 text-xs mb-2">TPs Alcanzados:</p>
        <div className="flex gap-2">
          <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded">
            TP1: {stats.tp1Hits || 0}
          </span>
          <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded">
            TP2: {stats.tp2Hits || 0}
          </span>
          <span className="text-xs bg-lime-500/20 text-lime-300 px-2 py-1 rounded">
            TP3: {stats.tp3Hits || 0}
          </span>
        </div>
      </div>
      
      {/* Por modelo */}
      {stats.byModel && (
        <div className="pt-3 mt-3 border-t border-zinc-700">
          <p className="text-zinc-500 text-xs mb-2">Por Modelo:</p>
          <div className="space-y-1 text-xs">
            {Object.entries(stats.byModel).map(([model, data]) => {
              if (data.wins + data.losses === 0) return null;
              const wr = ((data.wins / (data.wins + data.losses)) * 100).toFixed(0);
              return (
                <div key={model} className="flex justify-between">
                  <span className={`${
                    model === 'CHOCH' ? 'text-purple-400' :
                    model === 'REVERSAL' ? 'text-orange-400' : 'text-blue-400'
                  }`}>{model}</span>
                  <span className="text-zinc-300">{data.wins}W/{data.losses}L ({wr}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================
// HISTORIAL DE SEÑALES
// =============================================
const SignalHistory = ({ signals, onUpdateSignal }) => {
  if (!signals || signals.length === 0) {
    return (
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <h3 className="text-white font-semibold text-sm mb-2">📋 Historial</h3>
        <p className="text-zinc-500 text-sm">Sin señales</p>
      </div>
    );
  }
  
  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h3 className="text-white font-semibold text-sm">📋 Historial</h3>
      </div>
      
      <div className="max-h-[350px] overflow-y-auto">
        {signals.map((signal) => (
          <div 
            key={signal.id} 
            className={`p-3 border-b border-zinc-800/50 ${
              signal.status === 'WIN' ? 'bg-green-900/10' :
              signal.status === 'LOSS' ? 'bg-red-900/10' :
              signal.status === 'NOT_TAKEN' ? 'bg-zinc-800/30' : ''
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span>{signal.emoji}</span>
                <span className="text-white text-sm">{signal.assetName}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  signal.action === 'LONG' ? 'bg-green-600' : 'bg-red-600'
                }`}>
                  {signal.action}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  signal.model === 'CHOCH' ? 'bg-purple-600/50 text-purple-300' :
                  signal.model === 'REVERSAL' ? 'bg-orange-600/50 text-orange-300' :
                  'bg-blue-600/50 text-blue-300'
                }`}>
                  {signal.model}
                </span>
              </div>
              <span className="text-zinc-500 text-xs">#{signal.id}</span>
            </div>
            
            {/* Entry/SL/TPs */}
            <div className="grid grid-cols-5 gap-1 text-xs mb-2">
              <div>
                <span className="text-blue-400">E:</span>
                <span className="text-white ml-1">{signal.entry}</span>
              </div>
              <div>
                <span className="text-red-400">SL:</span>
                <span className="text-white ml-1">{signal.stop}</span>
              </div>
              <div className={signal.tp1Hit ? 'text-green-400' : ''}>
                <span>T1:</span>
                <span className="ml-1">{signal.tp1}</span>
                {signal.tp1Hit && <span className="ml-1">✓</span>}
              </div>
              <div className={signal.tp2Hit ? 'text-green-400' : ''}>
                <span>T2:</span>
                <span className="ml-1">{signal.tp2}</span>
                {signal.tp2Hit && <span className="ml-1">✓</span>}
              </div>
              <div className={signal.tp3Hit ? 'text-lime-400' : ''}>
                <span>T3:</span>
                <span className="ml-1">{signal.tp3}</span>
                {signal.tp3Hit && <span className="ml-1">✓</span>}
              </div>
            </div>
            
            {/* Status o Botones */}
            {signal.status === 'PENDING' ? (
              <div className="flex gap-2">
                <button
                  onClick={() => onUpdateSignal(signal.id, 'WIN')}
                  className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded"
                >
                  ✅ WIN
                </button>
                <button
                  onClick={() => onUpdateSignal(signal.id, 'LOSS')}
                  className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded"
                >
                  ❌ LOSS
                </button>
                <button
                  onClick={() => onUpdateSignal(signal.id, 'NOT_TAKEN')}
                  className="flex-1 py-1.5 bg-zinc-600 hover:bg-zinc-700 text-white text-xs font-bold rounded"
                >
                  ⏭️
                </button>
              </div>
            ) : (
              <div className={`text-center py-1.5 rounded text-xs font-bold ${
                signal.status === 'WIN' ? 'bg-green-500/20 text-green-400' :
                signal.status === 'LOSS' ? 'bg-red-500/20 text-red-400' :
                'bg-zinc-700/50 text-zinc-400'
              }`}>
                {signal.status === 'WIN' && `✅ WIN ${signal.tpLevel ? `(TP${signal.tpLevel})` : ''}`}
                {signal.status === 'LOSS' && '❌ LOSS'}
                {signal.status === 'NOT_TAKEN' && '⏭️ SKIP'}
                {signal.closedBy === 'AUTO' || signal.closedBy?.startsWith('AUTO') ? (
                  <span className="ml-1 text-zinc-500">(auto)</span>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================
// NARRACIÓN IA
// =============================================
const AINarration = ({ symbol }) => {
  const [narration, setNarration] = useState(null);
  
  useEffect(() => {
    if (!symbol) return;
    
    const fetchNarration = async () => {
      try {
        const res = await fetch(`${API_URL}/api/ai/narrate/${symbol}`);
        const data = await res.json();
        setNarration(data);
      } catch (err) {}
    };
    
    fetchNarration();
    const interval = setInterval(fetchNarration, 8000);
    return () => clearInterval(interval);
  }, [symbol]);
  
  if (!narration) return null;
  
  return (
    <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-lg p-3 border border-purple-500/30">
      <div className="flex items-center gap-2 mb-2">
        <span>🤖</span>
        <span className="text-white text-sm font-medium">IA</span>
      </div>
      <p className="text-zinc-300 text-sm whitespace-pre-line leading-relaxed">
        {narration.text}
      </p>
    </div>
  );
};

// =============================================
// CHAT IA
// =============================================
const AIChat = ({ symbol, assetName }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: `👋 Analizando **${assetName}**.\n\nPregunta: señal, CHoCH, estadísticas, tendencia...`
    }]);
  }, [symbol, assetName]);
  
  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    
    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMsg, symbol })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error' }]);
    }
    
    setLoading(false);
  };
  
  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 flex flex-col h-[220px]">
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
        <span>💬</span>
        <span className="text-white text-sm font-medium">Chat</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-lg px-3 py-2 text-xs ${
              msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-200'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && <div className="text-zinc-500 text-xs">Pensando...</div>}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-2 border-t border-zinc-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Pregunta..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
          />
          <button
            onClick={sendMessage}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================================
// DASHBOARD PRINCIPAL
// =============================================
const Dashboard = () => {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/dashboard`);
      const json = await res.json();
      setData(json);
      
      if (!selected && json.assets?.length > 0) {
        setSelected(json.assets[0]);
      }
    } catch (err) {}
  }, [selected]);
  
  const fetchDetail = useCallback(async (symbol) => {
    try {
      const res = await fetch(`${API_URL}/api/analyze/${symbol}`);
      const json = await res.json();
      setDetail(json);
    } catch (err) {}
  }, []);
  
  const updateSignal = async (id, status) => {
    try {
      await fetch(`${API_URL}/api/signals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchDashboard();
    } catch (err) {}
  };
  
  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 2000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);
  
  useEffect(() => {
    if (selected?.symbol) {
      fetchDetail(selected.symbol);
      const interval = setInterval(() => fetchDetail(selected.symbol), 2000);
      return () => clearInterval(interval);
    }
  }, [selected?.symbol, fetchDetail]);
  
  if (!data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-zinc-700 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-500">Conectando...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="px-4 py-3 border-b border-zinc-900">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">TradingPro</h1>
            <span className="text-xs text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded">v10.3</span>
            <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">⚡ CHoCH</span>
            <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">🤖 Auto</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${data.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-xs text-zinc-500">{data.connected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </header>
      
      {/* Main */}
      <main className="max-w-[1600px] mx-auto p-4">
        <div className="grid grid-cols-12 gap-4">
          
          {/* Col 1 - Activos */}
          <aside className="col-span-12 lg:col-span-2 space-y-2">
            <p className="text-zinc-600 text-xs uppercase mb-2">Activos</p>
            {data.assets?.map(asset => (
              <AssetCard
                key={asset.symbol}
                asset={asset}
                selected={selected?.symbol === asset.symbol}
                onClick={setSelected}
              />
            ))}
          </aside>
          
          {/* Col 2 - Gráfico */}
          <section className="col-span-12 lg:col-span-5 space-y-4">
            {selected && (
              <>
                <div className="bg-zinc-900/30 rounded-lg border border-zinc-800/50 overflow-hidden">
                  <div className="px-4 py-2 border-b border-zinc-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{selected.emoji}</span>
                      <div>
                        <h2 className="text-white font-semibold">{selected.name}</h2>
                        <p className="text-zinc-500 text-xs">{selected.type} • M5</p>
                      </div>
                    </div>
                    <p className="text-xl font-mono font-bold">
                      {selected.price?.toFixed(selected.decimals) || '---'}
                    </p>
                  </div>
                  
                  <div className="p-2">
                    <CandlestickChart
                      candles={detail?.candles || []}
                      signal={detail?.signal}
                      decimals={selected.decimals}
                    />
                  </div>
                </div>
                
                <AINarration symbol={selected.symbol} />
              </>
            )}
          </section>
          
          {/* Col 3 - Señal + Chat */}
          <aside className="col-span-12 lg:col-span-2 space-y-4">
            <SignalPanel asset={selected} />
            {selected && <AIChat symbol={selected.symbol} assetName={selected.name} />}
          </aside>
          
          {/* Col 4 - Stats + Historial */}
          <aside className="col-span-12 lg:col-span-3 space-y-4">
            <StatsPanel stats={data.stats} />
            <SignalHistory signals={data.recentSignals} onUpdateSignal={updateSignal} />
          </aside>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
