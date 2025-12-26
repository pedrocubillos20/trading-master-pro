// =============================================
// TRADING MASTER PRO v10.1
// Dashboard con IA: Narración + Chat en Vivo
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// GRÁFICO DE VELAS JAPONESAS
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
    const H = 400;
    
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
    
    const MARGIN = { top: 20, right: 70, bottom: 25, left: 10 };
    const chartWidth = W - MARGIN.left - MARGIN.right;
    const chartHeight = H - MARGIN.top - MARGIN.bottom;
    
    const data = candles.slice(-50);
    
    let minPrice = Math.min(...data.map(c => c.low));
    let maxPrice = Math.max(...data.map(c => c.high));
    
    if (signal?.entry) {
      minPrice = Math.min(minPrice, signal.entry, signal.stop || minPrice);
      maxPrice = Math.max(maxPrice, signal.entry, signal.tp || maxPrice);
    }
    
    const priceMargin = (maxPrice - minPrice) * 0.03;
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
    ctx.font = '10px monospace';
    ctx.fillStyle = '#444';
    ctx.textAlign = 'left';
    
    for (let i = 0; i <= 5; i++) {
      const price = maxPrice - (priceRange / 5) * i;
      const y = priceToY(price);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(W - MARGIN.right, y);
      ctx.stroke();
      ctx.fillText(price.toFixed(decimals), W - MARGIN.right + 5, y + 3);
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
    const drawLine = (price, color, label) => {
      if (!price) return;
      const y = priceToY(price);
      if (y < MARGIN.top || y > H - MARGIN.bottom) return;
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(W - MARGIN.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = color;
      ctx.font = 'bold 9px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(`${label} ${price.toFixed(decimals)}`, W - MARGIN.right - 5, y - 4);
    };
    
    if (signal?.action && !['WAIT', 'LOADING'].includes(signal.action)) {
      drawLine(signal.entry, '#2196f3', 'ENTRY');
      drawLine(signal.stop, '#ef5350', 'SL');
      drawLine(signal.tp, '#26a69a', 'TP');
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
      ctx.fillRect(W - MARGIN.right, y - 10, 60, 20);
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
// PANEL DE SEÑAL
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
      
      {hasSignal && (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between p-2 bg-blue-500/10 rounded">
            <span className="text-blue-400">Entry</span>
            <span className="text-white font-mono">{sig.entry}</span>
          </div>
          <div className="flex justify-between p-2 bg-red-500/10 rounded">
            <span className="text-red-400">Stop</span>
            <span className="text-white font-mono">{sig.stop}</span>
          </div>
          <div className="flex justify-between p-2 bg-green-500/10 rounded">
            <span className="text-green-400">TP</span>
            <span className="text-white font-mono">{sig.tp}</span>
          </div>
        </div>
      )}
      
      <div className="mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-500">
        Modelo: <span className="text-zinc-300">{sig.model || 'NO_SETUP'}</span>
      </div>
    </div>
  );
};

// =============================================
// NARRACIÓN IA EN VIVO
// =============================================
const AINarration = ({ symbol }) => {
  const [narration, setNarration] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const fetchNarration = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/ai/narrate/${symbol}`);
      const data = await res.json();
      setNarration(data);
    } catch (err) {
      console.error('Error fetching narration:', err);
    }
    setLoading(false);
  }, [symbol]);
  
  useEffect(() => {
    fetchNarration();
    const interval = setInterval(fetchNarration, 10000); // Actualizar cada 10s
    return () => clearInterval(interval);
  }, [fetchNarration]);
  
  return (
    <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-lg p-4 border border-purple-500/30">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🤖</span>
        <h3 className="text-white font-semibold text-sm">Narración IA</h3>
        {loading && <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />}
      </div>
      
      {narration ? (
        <div className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed">
          {narration.text}
        </div>
      ) : (
        <p className="text-zinc-500 text-sm">Analizando mercado...</p>
      )}
      
      <p className="text-zinc-600 text-xs mt-3">
        Actualizado: {narration?.timestamp ? new Date(narration.timestamp).toLocaleTimeString() : '--'}
      </p>
    </div>
  );
};

// =============================================
// CHAT CON IA
// =============================================
const AIChat = ({ symbol, assetName }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  // Limpiar chat cuando cambia el activo
  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: `¡Hola! 👋 Soy tu asistente de trading. Estoy analizando **${assetName}** en tiempo real.\n\nPuedes preguntarme:\n• ¿Hay señal?\n• ¿Cuál es la tendencia?\n• ¿Dónde está la liquidez?\n• ¿Qué me recomiendas?\n• ¿Cómo funciona SMC?`
    }]);
  }, [symbol, assetName]);
  
  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);
    
    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMessage, symbol })
      });
      
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (err) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '❌ Error al conectar. Intenta de nuevo.' 
      }]);
    }
    
    setLoading(false);
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  
  // Preguntas sugeridas
  const suggestions = [
    '¿Hay señal?',
    '¿Tendencia?',
    '¿Qué hacer?',
    '¿Liquidez?'
  ];
  
  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 flex flex-col h-[400px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <span className="text-lg">💬</span>
        <h3 className="text-white font-semibold text-sm">Chat con IA</h3>
        <span className="text-xs text-zinc-500">• {assetName}</span>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white' 
                : 'bg-zinc-800 text-zinc-200'
            }`}>
              <div className="whitespace-pre-line">{msg.content}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 rounded-lg px-4 py-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Suggestions */}
      <div className="px-4 py-2 border-t border-zinc-800/50 flex gap-2 overflow-x-auto">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => { setInput(s); }}
            className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-full whitespace-nowrap"
          >
            {s}
          </button>
        ))}
      </div>
      
      {/* Input */}
      <div className="p-3 border-t border-zinc-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Pregunta sobre el mercado..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
          >
            Enviar
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
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">TradingPro</h1>
            <span className="text-xs text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded">v10.1</span>
            <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">🤖 IA</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${data.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-xs text-zinc-500">{data.connected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </header>
      
      {/* Main */}
      <main className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-12 gap-4">
          
          {/* Sidebar - Activos */}
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
          
          {/* Centro - Gráfico */}
          <section className="col-span-12 lg:col-span-6 space-y-4">
            {selected && (
              <>
                <div className="bg-zinc-900/30 rounded-lg border border-zinc-800/50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between">
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
                
                {/* Narración IA */}
                <AINarration symbol={selected.symbol} />
              </>
            )}
          </section>
          
          {/* Sidebar derecho */}
          <aside className="col-span-12 lg:col-span-4 space-y-4">
            <SignalPanel asset={selected} />
            
            {/* Chat IA */}
            {selected && (
              <AIChat symbol={selected.symbol} assetName={selected.name} />
            )}
          </aside>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
