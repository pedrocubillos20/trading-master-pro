// =============================================
// TRADING MASTER PRO v10.0
// Minimalista • Profesional • SMC
// Temporalidad: M5 (5 minutos)
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// GRÁFICO DE VELAS JAPONESAS - ESTILO TRADINGVIEW
// =============================================
const CandlestickChart = ({ candles = [], signal, height = 450, decimals = 2 }) => {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    // Resolución alta para pantallas retina
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    
    const W = rect.width;
    const H = height;
    
    // Limpiar
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);
    
    if (!candles.length) {
      ctx.fillStyle = '#333';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Cargando datos...', W / 2, H / 2);
      return;
    }
    
    // Configuración
    const PADDING = { top: 20, right: 70, bottom: 30, left: 10 };
    const chartW = W - PADDING.left - PADDING.right;
    const chartH = H - PADDING.top - PADDING.bottom;
    
    // Datos
    const data = candles.slice(-50);
    const highs = data.map(c => c.high);
    const lows = data.map(c => c.low);
    
    // Rango de precios
    let maxP = Math.max(...highs);
    let minP = Math.min(...lows);
    
    // Incluir líneas de señal en el rango
    if (signal?.entry) {
      maxP = Math.max(maxP, signal.entry, signal.stop || 0, signal.tp || 0);
      minP = Math.min(minP, signal.entry, signal.stop || maxP, signal.tp || maxP);
    }
    
    // Margen del 5%
    const margin = (maxP - minP) * 0.05;
    maxP += margin;
    minP -= margin;
    const range = maxP - minP || 1;
    
    // Funciones de conversión
    const toY = (price) => PADDING.top + ((maxP - price) / range) * chartH;
    const toX = (i) => PADDING.left + (i + 0.5) * (chartW / data.length);
    const candleW = Math.max(1, (chartW / data.length) * 0.6);
    
    // ===== GRID =====
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    
    // Líneas horizontales
    const steps = 5;
    ctx.font = '10px -apple-system, monospace';
    ctx.fillStyle = '#444';
    ctx.textAlign = 'left';
    
    for (let i = 0; i <= steps; i++) {
      const y = PADDING.top + (chartH / steps) * i;
      const price = maxP - (range / steps) * i;
      
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(W - PADDING.right, y);
      ctx.stroke();
      
      ctx.fillText(price.toFixed(decimals), W - PADDING.right + 5, y + 3);
    }
    
    // ===== VELAS JAPONESAS =====
    data.forEach((candle, i) => {
      const x = toX(i);
      const isUp = candle.close >= candle.open;
      
      const highY = toY(candle.high);
      const lowY = toY(candle.low);
      const openY = toY(candle.open);
      const closeY = toY(candle.close);
      
      const bodyTop = Math.min(openY, closeY);
      const bodyBottom = Math.max(openY, closeY);
      const bodyH = Math.max(1, bodyBottom - bodyTop);
      
      // Colores estilo TradingView
      const upColor = '#26a69a';
      const downColor = '#ef5350';
      const color = isUp ? upColor : downColor;
      
      // MECHA (wick/shadow)
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, bodyTop);
      ctx.moveTo(x, bodyBottom);
      ctx.lineTo(x, lowY);
      ctx.stroke();
      
      // CUERPO
      ctx.fillStyle = color;
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
    });
    
    // ===== LÍNEAS DE SEÑAL =====
    if (signal?.action && !['WAIT', 'LOADING'].includes(signal.action)) {
      const drawLine = (price, color, label) => {
        if (!price) return;
        const y = toY(price);
        if (y < PADDING.top || y > H - PADDING.bottom) return;
        
        // Línea punteada
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(PADDING.left, y);
        ctx.lineTo(W - PADDING.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Etiqueta
        ctx.fillStyle = color;
        ctx.font = 'bold 9px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${label} ${price.toFixed(decimals)}`, W - PADDING.right - 5, y - 4);
      };
      
      drawLine(signal.entry, '#2196f3', '▶ ENTRY');
      drawLine(signal.stop, '#ef5350', '✕ STOP');
      drawLine(signal.tp, '#26a69a', '◎ TP');
    }
    
    // ===== PRECIO ACTUAL =====
    const last = data[data.length - 1];
    if (last) {
      const y = toY(last.close);
      const isUp = last.close >= last.open;
      const color = isUp ? '#26a69a' : '#ef5350';
      
      // Línea del precio actual
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(W - PADDING.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Badge del precio
      ctx.fillStyle = color;
      const badgeW = 60;
      ctx.fillRect(W - PADDING.right, y - 10, badgeW, 20);
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px -apple-system, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(last.close.toFixed(decimals), W - PADDING.right + badgeW / 2, y + 4);
    }
    
  }, [candles, signal, height, decimals]);
  
  return (
    <canvas 
      ref={canvasRef} 
      style={{ 
        width: '100%', 
        height: `${height}px`,
        borderRadius: '8px',
        display: 'block'
      }}
    />
  );
};

// =============================================
// COMPONENTES MINIMALISTAS
// =============================================

// Tarjeta de activo
const AssetCard = ({ asset, selected, onClick }) => {
  const sig = asset.signal;
  const hasSignal = sig?.action && !['WAIT', 'LOADING'].includes(sig.action);
  
  return (
    <div 
      onClick={() => onClick(asset)}
      className={`p-3 rounded-lg cursor-pointer transition-all border ${
        selected 
          ? 'bg-zinc-800 border-zinc-600' 
          : 'bg-zinc-900/50 border-transparent hover:bg-zinc-800/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{asset.emoji}</span>
          <span className="text-white font-medium text-sm">{asset.name}</span>
        </div>
        {hasSignal && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
            sig.action === 'LONG' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {sig.action}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-zinc-400 font-mono text-sm">
          {asset.price?.toFixed(asset.decimals) || '---'}
        </span>
        {sig?.score > 0 && (
          <span className={`text-xs ${sig.score >= 70 ? 'text-green-400' : 'text-zinc-500'}`}>
            {sig.score}%
          </span>
        )}
      </div>
    </div>
  );
};

// Panel de señal
const SignalCard = ({ asset }) => {
  const sig = asset?.signal;
  if (!sig) return null;
  
  const hasSignal = sig.action && !['WAIT', 'LOADING'].includes(sig.action);
  
  return (
    <div className="bg-zinc-900/80 backdrop-blur rounded-lg p-4 border border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-zinc-400 text-sm">Señal</span>
        <span className={`text-lg font-bold ${
          sig.action === 'LONG' ? 'text-green-400' :
          sig.action === 'SHORT' ? 'text-red-400' :
          'text-zinc-500'
        }`}>
          {sig.action || 'WAIT'}
        </span>
      </div>
      
      {/* Score */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-zinc-500">Score</span>
          <span className="text-white">{sig.score || 0}%</span>
        </div>
        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all ${
              sig.score >= 70 ? 'bg-green-500' : sig.score >= 50 ? 'bg-yellow-500' : 'bg-zinc-600'
            }`}
            style={{ width: `${sig.score || 0}%` }}
          />
        </div>
      </div>
      
      {/* Entry/SL/TP */}
      {hasSignal && (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Entry</span>
            <span className="text-blue-400 font-mono">{sig.entry}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Stop Loss</span>
            <span className="text-red-400 font-mono">{sig.stop}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Take Profit</span>
            <span className="text-green-400 font-mono">{sig.tp}</span>
          </div>
        </div>
      )}
      
      {/* Modelo */}
      <div className="mt-3 pt-3 border-t border-zinc-800">
        <span className="text-xs text-zinc-500">
          Modelo: <span className="text-zinc-300">{sig.model || 'NO_SETUP'}</span>
        </span>
      </div>
    </div>
  );
};

// Información de metodología
const MethodologyInfo = () => (
  <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/50">
    <h3 className="text-zinc-400 text-xs font-semibold mb-2 uppercase tracking-wide">Metodología SMC</h3>
    <div className="space-y-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
        <span className="text-zinc-400">Liquidez (EQH/EQL)</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-orange-500"></span>
        <span className="text-zinc-400">Sweep de liquidez</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
        <span className="text-zinc-400">Displacement</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-purple-500"></span>
        <span className="text-zinc-400">Order Block</span>
      </div>
    </div>
    <p className="text-zinc-600 text-xs mt-2">Timeframe: M5</p>
  </div>
);

// =============================================
// DASHBOARD PRINCIPAL
// =============================================
const Dashboard = () => {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  
  // Fetch dashboard
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/dashboard`);
      const json = await res.json();
      setData(json);
      
      if (!selected && json.assets?.length) {
        setSelected(json.assets[0]);
      }
    } catch (err) {
      console.error('Error:', err);
    }
  }, [selected]);
  
  // Fetch detalle del activo
  const fetchDetail = useCallback(async (symbol) => {
    try {
      const res = await fetch(`${API_URL}/api/analyze/${symbol}`);
      const json = await res.json();
      setDetail(json);
    } catch (err) {}
  }, []);
  
  // Polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);
  
  // Actualizar detalle cuando cambia selección
  useEffect(() => {
    if (selected?.symbol) {
      fetchDetail(selected.symbol);
      const interval = setInterval(() => fetchDetail(selected.symbol), 2000);
      return () => clearInterval(interval);
    }
  }, [selected, fetchDetail]);
  
  // Loading
  if (!data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Conectando...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header minimalista */}
      <header className="px-4 py-3 border-b border-zinc-900">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">
              TradingPro
            </h1>
            <span className="text-xs text-zinc-600">v10</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${data.connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-zinc-500">
              {data.connected ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>
      </header>
      
      {/* Main */}
      <main className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-12 gap-4">
          
          {/* Sidebar - Activos */}
          <aside className="col-span-12 md:col-span-2 space-y-2">
            <p className="text-zinc-600 text-xs uppercase tracking-wide mb-2">Activos</p>
            {data.assets?.map(asset => (
              <AssetCard
                key={asset.symbol}
                asset={asset}
                selected={selected?.symbol === asset.symbol}
                onClick={setSelected}
              />
            ))}
            <MethodologyInfo />
          </aside>
          
          {/* Centro - Gráfico */}
          <section className="col-span-12 md:col-span-7">
            {selected && (
              <div className="bg-zinc-900/30 rounded-lg border border-zinc-800/50 overflow-hidden">
                {/* Header del gráfico */}
                <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{selected.emoji}</span>
                    <div>
                      <h2 className="text-white font-medium">{selected.name}</h2>
                      <p className="text-zinc-600 text-xs">M5 • {selected.type}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-mono text-white">
                      {selected.price?.toFixed(selected.decimals)}
                    </p>
                  </div>
                </div>
                
                {/* Gráfico */}
                <div className="p-2">
                  <CandlestickChart
                    candles={detail?.candles || []}
                    signal={detail?.signal}
                    height={450}
                    decimals={selected.decimals}
                  />
                </div>
              </div>
            )}
          </section>
          
          {/* Sidebar derecho - Señal */}
          <aside className="col-span-12 md:col-span-3 space-y-4">
            <SignalCard asset={selected} />
            
            {/* Análisis SMC */}
            {detail?.signal?.analysis && (
              <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/50">
                <h3 className="text-zinc-400 text-xs font-semibold mb-3 uppercase tracking-wide">Análisis</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">EQH</span>
                    <span className="text-white font-mono">{detail.signal.analysis.eqh}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">EQL</span>
                    <span className="text-white font-mono">{detail.signal.analysis.eql}</span>
                  </div>
                  {detail.signal.analysis.sweep && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Sweep</span>
                      <span className="text-yellow-400 text-xs">{detail.signal.analysis.sweep}</span>
                    </div>
                  )}
                  {detail.signal.analysis.displacement && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Displacement</span>
                      <span className="text-blue-400 text-xs">{detail.signal.analysis.displacement}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Estructura</span>
                    <span className="text-zinc-300 text-xs">{detail.signal.analysis.structure}</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Señales recientes */}
            {data.recentSignals?.length > 0 && (
              <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/50">
                <h3 className="text-zinc-400 text-xs font-semibold mb-3 uppercase tracking-wide">Recientes</h3>
                <div className="space-y-2">
                  {data.recentSignals.slice(0, 5).map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-400">{s.assetName}</span>
                      <span className={`text-xs font-medium ${
                        s.action === 'LONG' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {s.action} {s.score}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
