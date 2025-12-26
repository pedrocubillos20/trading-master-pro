// =============================================
// TRADING MASTER PRO v10.0
// Dashboard Minimalista con Velas Correctas
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
    
    // Tamaño del contenedor
    const W = container.clientWidth;
    const H = 500;
    
    // Resolución para pantallas retina
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
    
    // Fondo
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);
    
    // Si no hay velas, mostrar mensaje
    if (!candles || candles.length === 0) {
      ctx.fillStyle = '#444';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Esperando datos...', W / 2, H / 2);
      return;
    }
    
    // Configuración
    const MARGIN = { top: 20, right: 80, bottom: 30, left: 10 };
    const chartWidth = W - MARGIN.left - MARGIN.right;
    const chartHeight = H - MARGIN.top - MARGIN.bottom;
    
    // Usar últimas 50 velas
    const data = candles.slice(-50);
    
    // Calcular rango de precios
    let minPrice = Math.min(...data.map(c => c.low));
    let maxPrice = Math.max(...data.map(c => c.high));
    
    // Incluir líneas de señal en el rango
    if (signal?.entry) {
      minPrice = Math.min(minPrice, signal.entry, signal.stop || minPrice);
      maxPrice = Math.max(maxPrice, signal.entry, signal.tp || maxPrice);
    }
    
    // Añadir margen del 3%
    const priceMargin = (maxPrice - minPrice) * 0.03;
    minPrice -= priceMargin;
    maxPrice += priceMargin;
    const priceRange = maxPrice - minPrice;
    
    // Funciones de conversión
    const priceToY = (price) => MARGIN.top + ((maxPrice - price) / priceRange) * chartHeight;
    
    // Calcular ancho de velas
    const totalSpace = chartWidth;
    const candleFullWidth = totalSpace / data.length;
    const candleBodyWidth = candleFullWidth * 0.7;
    const candleGap = candleFullWidth * 0.15;
    
    // ===== GRID =====
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    
    // Líneas horizontales de precio
    const priceSteps = 6;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#555';
    ctx.textAlign = 'left';
    
    for (let i = 0; i <= priceSteps; i++) {
      const price = maxPrice - (priceRange / priceSteps) * i;
      const y = priceToY(price);
      
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(W - MARGIN.right, y);
      ctx.stroke();
      
      ctx.fillText(price.toFixed(decimals), W - MARGIN.right + 5, y + 3);
    }
    
    // ===== DIBUJAR CADA VELA =====
    data.forEach((candle, index) => {
      const x = MARGIN.left + candleGap + (index * candleFullWidth);
      const centerX = x + candleBodyWidth / 2;
      
      const isGreen = candle.close >= candle.open;
      
      // Colores estilo TradingView
      const color = isGreen ? '#26a69a' : '#ef5350';
      
      // Coordenadas Y
      const highY = priceToY(candle.high);
      const lowY = priceToY(candle.low);
      const openY = priceToY(candle.open);
      const closeY = priceToY(candle.close);
      
      const bodyTop = Math.min(openY, closeY);
      const bodyBottom = Math.max(openY, closeY);
      const bodyHeight = Math.max(1, bodyBottom - bodyTop);
      
      // === MECHA SUPERIOR ===
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.moveTo(centerX, highY);
      ctx.lineTo(centerX, bodyTop);
      ctx.stroke();
      
      // === MECHA INFERIOR ===
      ctx.beginPath();
      ctx.moveTo(centerX, bodyBottom);
      ctx.lineTo(centerX, lowY);
      ctx.stroke();
      
      // === CUERPO DE LA VELA ===
      ctx.fillStyle = color;
      ctx.fillRect(x, bodyTop, candleBodyWidth, bodyHeight);
    });
    
    // ===== LÍNEAS DE SEÑAL =====
    const drawSignalLine = (price, color, label) => {
      if (!price) return;
      
      const y = priceToY(price);
      if (y < MARGIN.top || y > H - MARGIN.bottom) return;
      
      // Línea punteada
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(W - MARGIN.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Etiqueta
      ctx.fillStyle = color;
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(`${label} ${price.toFixed(decimals)}`, W - MARGIN.right - 5, y - 5);
    };
    
    if (signal?.action && signal.action !== 'WAIT' && signal.action !== 'LOADING') {
      drawSignalLine(signal.entry, '#2196f3', 'ENTRY');
      drawSignalLine(signal.stop, '#ef5350', 'STOP');
      drawSignalLine(signal.tp, '#26a69a', 'TP');
    }
    
    // ===== LÍNEA DE PRECIO ACTUAL =====
    if (data.length > 0) {
      const lastCandle = data[data.length - 1];
      const currentPrice = lastCandle.close;
      const y = priceToY(currentPrice);
      const isUp = lastCandle.close >= lastCandle.open;
      const priceColor = isUp ? '#26a69a' : '#ef5350';
      
      // Línea punteada
      ctx.strokeStyle = priceColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(W - MARGIN.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Badge de precio actual
      const badgeWidth = 65;
      const badgeHeight = 20;
      ctx.fillStyle = priceColor;
      ctx.fillRect(W - MARGIN.right, y - badgeHeight/2, badgeWidth, badgeHeight);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(currentPrice.toFixed(decimals), W - MARGIN.right + badgeWidth/2, y + 4);
    }
    
  }, [candles, signal, decimals]);
  
  return (
    <div ref={containerRef} style={{ width: '100%', backgroundColor: '#0d0d0d', borderRadius: '8px' }}>
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
              ? 'bg-green-900/20 border-green-800/50 hover:bg-green-900/30'
              : 'bg-red-900/20 border-red-800/50 hover:bg-red-900/30'
            : 'bg-zinc-900/50 border-zinc-800/50 hover:bg-zinc-800/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{asset.emoji}</span>
          <span className="text-white font-medium text-sm">{asset.name}</span>
        </div>
        {hasSignal && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
            sig.action === 'LONG' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {sig.action}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-zinc-300 font-mono">
          {asset.price?.toFixed(asset.decimals) || '---'}
        </span>
        {sig?.score > 0 && (
          <span className={`text-xs font-medium ${
            sig.score >= 70 ? 'text-green-400' : 'text-zinc-500'
          }`}>
            {sig.score}%
          </span>
        )}
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
      <div className="flex items-center justify-between mb-4">
        <span className="text-zinc-400 text-sm">Señal</span>
        <span className={`text-xl font-bold ${
          sig.action === 'LONG' ? 'text-green-400' :
          sig.action === 'SHORT' ? 'text-red-400' :
          'text-zinc-500'
        }`}>
          {sig.action || 'WAIT'}
        </span>
      </div>
      
      {/* Score */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-zinc-500">Score SMC</span>
          <span className={sig.score >= 70 ? 'text-green-400' : 'text-zinc-400'}>{sig.score || 0}%</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${
              sig.score >= 70 ? 'bg-green-500' : sig.score >= 50 ? 'bg-yellow-500' : 'bg-zinc-600'
            }`}
            style={{ width: `${Math.min(100, sig.score || 0)}%` }}
          />
        </div>
      </div>
      
      {/* Entry/SL/TP */}
      {hasSignal && sig.entry && (
        <div className="space-y-3 mb-4">
          <div className="flex justify-between items-center p-2 bg-blue-500/10 rounded border border-blue-500/30">
            <span className="text-blue-400 text-sm">Entry</span>
            <span className="text-white font-mono font-bold">{sig.entry}</span>
          </div>
          <div className="flex justify-between items-center p-2 bg-red-500/10 rounded border border-red-500/30">
            <span className="text-red-400 text-sm">Stop Loss</span>
            <span className="text-white font-mono font-bold">{sig.stop}</span>
          </div>
          <div className="flex justify-between items-center p-2 bg-green-500/10 rounded border border-green-500/30">
            <span className="text-green-400 text-sm">Take Profit</span>
            <span className="text-white font-mono font-bold">{sig.tp}</span>
          </div>
        </div>
      )}
      
      {/* Modelo */}
      <div className="pt-3 border-t border-zinc-800">
        <span className="text-zinc-500 text-xs">Modelo: </span>
        <span className={`text-sm ${
          sig.model === 'REVERSAL' ? 'text-purple-400' :
          sig.model === 'CONTINUATION' ? 'text-blue-400' :
          'text-zinc-400'
        }`}>{sig.model || 'NO_SETUP'}</span>
      </div>
    </div>
  );
};

// =============================================
// PANEL DE ANÁLISIS
// =============================================
const AnalysisPanel = ({ signal }) => {
  if (!signal?.analysis) return null;
  
  const { analysis } = signal;
  
  return (
    <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/50">
      <h3 className="text-zinc-400 text-xs font-semibold mb-3 uppercase tracking-wide">
        Análisis SMC
      </h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-500">EQH</span>
          <span className="text-white font-mono">{analysis.eqh}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">EQL</span>
          <span className="text-white font-mono">{analysis.eql}</span>
        </div>
        {analysis.sweep && (
          <div className="flex justify-between">
            <span className="text-zinc-500">Sweep</span>
            <span className="text-yellow-400 text-xs">{analysis.sweep}</span>
          </div>
        )}
        {analysis.displacement && (
          <div className="flex justify-between">
            <span className="text-zinc-500">Displacement</span>
            <span className="text-cyan-400 text-xs">{analysis.displacement}</span>
          </div>
        )}
        {analysis.ob && (
          <div className="flex justify-between">
            <span className="text-zinc-500">Order Block</span>
            <span className="text-purple-400 text-xs">{analysis.ob}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-zinc-500">Estructura</span>
          <span className="text-zinc-300 text-xs">{analysis.structure}</span>
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
  const [error, setError] = useState(null);
  
  // Fetch principal
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/dashboard`);
      if (!res.ok) throw new Error('Error de conexión');
      const json = await res.json();
      setData(json);
      setError(null);
      
      // Seleccionar primer activo si no hay selección
      if (!selected && json.assets?.length > 0) {
        setSelected(json.assets[0]);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [selected]);
  
  // Fetch detalle del activo
  const fetchDetail = useCallback(async (symbol) => {
    try {
      const res = await fetch(`${API_URL}/api/analyze/${symbol}`);
      if (!res.ok) return;
      const json = await res.json();
      setDetail(json);
    } catch (err) {
      console.error('Error fetching detail:', err);
    }
  }, []);
  
  // Polling cada 2 segundos
  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 2000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);
  
  // Actualizar detalle cuando cambia selección
  useEffect(() => {
    if (selected?.symbol) {
      fetchDetail(selected.symbol);
      const interval = setInterval(() => fetchDetail(selected.symbol), 2000);
      return () => clearInterval(interval);
    }
  }, [selected?.symbol, fetchDetail]);
  
  // Loading
  if (!data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-zinc-700 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-500">Conectando...</p>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="px-6 py-4 border-b border-zinc-900">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">TradingPro</h1>
            <span className="text-xs text-zinc-600 bg-zinc-900 px-2 py-1 rounded">v10</span>
            <span className="text-xs text-zinc-500">M5</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${data.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-sm text-zinc-500">{data.connected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4 lg:p-6">
        <div className="grid grid-cols-12 gap-4 lg:gap-6">
          
          {/* Sidebar - Lista de Activos */}
          <aside className="col-span-12 lg:col-span-2 space-y-2">
            <p className="text-zinc-600 text-xs uppercase tracking-wider mb-3">Activos</p>
            {data.assets?.map(asset => (
              <AssetCard
                key={asset.symbol}
                asset={asset}
                selected={selected?.symbol === asset.symbol}
                onClick={setSelected}
              />
            ))}
            
            {/* Info de metodología */}
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <p className="text-zinc-600 text-xs uppercase tracking-wider mb-2">Metodología</p>
              <div className="text-xs text-zinc-500 space-y-1">
                <p>• SMC (Smart Money)</p>
                <p>• Timeframe: M5</p>
                <p>• Score mínimo: 70%</p>
              </div>
            </div>
          </aside>
          
          {/* Centro - Gráfico */}
          <section className="col-span-12 lg:col-span-7">
            {selected && (
              <div className="bg-zinc-900/30 rounded-xl border border-zinc-800/50 overflow-hidden">
                {/* Header del gráfico */}
                <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{selected.emoji}</span>
                    <div>
                      <h2 className="text-white font-semibold">{selected.name}</h2>
                      <p className="text-zinc-500 text-xs">{selected.type} • M5</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-mono font-bold text-white">
                      {selected.price?.toFixed(selected.decimals) || '---'}
                    </p>
                    <p className="text-zinc-500 text-xs">
                      {detail?.candles?.length || 0} velas
                    </p>
                  </div>
                </div>
                
                {/* Gráfico de velas */}
                <div className="p-2">
                  <CandlestickChart
                    candles={detail?.candles || []}
                    signal={detail?.signal}
                    decimals={selected.decimals}
                  />
                </div>
              </div>
            )}
          </section>
          
          {/* Sidebar derecho - Señal y Análisis */}
          <aside className="col-span-12 lg:col-span-3 space-y-4">
            <SignalPanel asset={selected} />
            <AnalysisPanel signal={detail?.signal} />
            
            {/* Señales recientes */}
            {data.recentSignals?.length > 0 && (
              <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/50">
                <h3 className="text-zinc-400 text-xs font-semibold mb-3 uppercase tracking-wide">
                  Señales Recientes
                </h3>
                <div className="space-y-2">
                  {data.recentSignals.slice(0, 5).map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span>{s.emoji}</span>
                        <span className="text-zinc-400">{s.assetName}</span>
                      </div>
                      <span className={`text-xs font-bold ${
                        s.action === 'LONG' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {s.action}
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
