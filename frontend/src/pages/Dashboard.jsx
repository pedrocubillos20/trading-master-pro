// =============================================
// TRADING MASTER PRO - DASHBOARD v5.0
// Gráfico en vivo + Narración SMC + Señales Automáticas
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// COMPONENTE: GRÁFICO DE VELAS
// =============================================
const CandlestickChart = ({ candles, symbol, currentPrice, orderBlocks = [], fibLevels = {} }) => {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current || !candles || candles.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Limpiar
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);
    
    // Calcular escalas
    const visibleCandles = candles.slice(-100);
    const prices = visibleCandles.flatMap(c => [c.high, c.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    const padding = priceRange * 0.1;
    
    const scaleY = (price) => height - ((price - minPrice + padding) / (priceRange + padding * 2)) * height;
    const candleWidth = (width - 60) / visibleCandles.length;
    
    // Dibujar grid
    ctx.strokeStyle = '#1f1f23';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = (height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width - 60, y);
      ctx.stroke();
      
      // Precio en el eje Y
      const price = maxPrice - (priceRange / 5) * i;
      ctx.fillStyle = '#71717a';
      ctx.font = '10px monospace';
      ctx.fillText(price.toFixed(4), width - 55, y + 4);
    }
    
    // Dibujar Order Blocks
    orderBlocks.forEach(ob => {
      const y1 = scaleY(ob.high);
      const y2 = scaleY(ob.low);
      ctx.fillStyle = ob.type === 'DEMAND' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
      ctx.fillRect(0, y1, width - 60, y2 - y1);
      ctx.strokeStyle = ob.type === 'DEMAND' ? '#10b981' : '#ef4444';
      ctx.strokeRect(0, y1, width - 60, y2 - y1);
    });
    
    // Dibujar Fibonacci
    if (fibLevels.fib786) {
      ctx.strokeStyle = '#f59e0b';
      ctx.setLineDash([5, 5]);
      const y786 = scaleY(fibLevels.fib786);
      ctx.beginPath();
      ctx.moveTo(0, y786);
      ctx.lineTo(width - 60, y786);
      ctx.stroke();
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('78.6%', 5, y786 - 5);
    }
    
    if (fibLevels.fib926) {
      const y926 = scaleY(fibLevels.fib926);
      ctx.beginPath();
      ctx.moveTo(0, y926);
      ctx.lineTo(width - 60, y926);
      ctx.stroke();
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('92.6%', 5, y926 - 5);
    }
    ctx.setLineDash([]);
    
    // Dibujar velas
    visibleCandles.forEach((candle, i) => {
      const x = i * candleWidth + candleWidth / 2;
      const open = scaleY(candle.open);
      const close = scaleY(candle.close);
      const high = scaleY(candle.high);
      const low = scaleY(candle.low);
      
      const isBullish = candle.close > candle.open;
      const color = isBullish ? '#10b981' : '#ef4444';
      
      // Mecha
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, high);
      ctx.lineTo(x, low);
      ctx.stroke();
      
      // Cuerpo
      ctx.fillStyle = color;
      const bodyTop = Math.min(open, close);
      const bodyHeight = Math.abs(close - open) || 1;
      ctx.fillRect(x - candleWidth * 0.35, bodyTop, candleWidth * 0.7, bodyHeight);
    });
    
    // Línea de precio actual
    if (currentPrice) {
      const y = scaleY(currentPrice);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width - 60, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Badge de precio
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(width - 58, y - 10, 55, 20);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(currentPrice.toFixed(4), width - 55, y + 4);
    }
    
  }, [candles, currentPrice, orderBlocks, fibLevels]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={800} 
      height={400}
      className="w-full h-full rounded-lg"
      style={{ background: '#09090b' }}
    />
  );
};

// =============================================
// COMPONENTE: PANEL DE NARRACIÓN
// =============================================
const NarrationPanel = ({ narration, symbol, analysis }) => {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-sm font-medium text-zinc-300">Narración en Vivo</span>
        <span className="text-xs text-zinc-500">• {symbol}</span>
      </div>
      
      <div className="bg-zinc-800/50 rounded-lg p-4 mb-4">
        <p className="text-zinc-200 leading-relaxed">
          {narration || 'Analizando el mercado...'}
        </p>
      </div>
      
      {analysis && (
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="bg-zinc-800/30 rounded-lg p-2 text-center">
            <div className="text-zinc-500 mb-1">H1</div>
            <div className={`font-bold ${
              analysis.h1?.structure?.trend === 'BULLISH' ? 'text-emerald-400' :
              analysis.h1?.structure?.trend === 'BEARISH' ? 'text-red-400' : 'text-zinc-400'
            }`}>
              {analysis.h1?.structure?.trend || 'N/A'}
            </div>
          </div>
          <div className="bg-zinc-800/30 rounded-lg p-2 text-center">
            <div className="text-zinc-500 mb-1">M15</div>
            <div className={`font-bold ${
              analysis.m15?.structure?.trend === 'BULLISH' ? 'text-emerald-400' :
              analysis.m15?.structure?.trend === 'BEARISH' ? 'text-red-400' : 'text-zinc-400'
            }`}>
              {analysis.m15?.structure?.trend || 'N/A'}
            </div>
          </div>
          <div className="bg-zinc-800/30 rounded-lg p-2 text-center">
            <div className="text-zinc-500 mb-1">M5 OBs</div>
            <div className="font-bold text-amber-400">
              {analysis.m5?.orderBlocks?.length || 0}
            </div>
          </div>
          <div className="bg-zinc-800/30 rounded-lg p-2 text-center">
            <div className="text-zinc-500 mb-1">CHoCH</div>
            <div className={`font-bold ${analysis.m1?.choch ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {analysis.m1?.choch ? '✓ SÍ' : '✗ NO'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================
// COMPONENTE: SEÑAL ACTIVA
// =============================================
const SignalCard = ({ signal, onTake, onIgnore }) => {
  if (!signal?.hasSignal) return null;
  
  return (
    <div className={`border rounded-xl p-4 ${
      signal.direction === 'COMPRA' 
        ? 'bg-emerald-500/10 border-emerald-500/30' 
        : 'bg-red-500/10 border-red-500/30'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{signal.direction === 'COMPRA' ? '🟢' : '🔴'}</span>
          <div>
            <div className={`font-bold text-lg ${
              signal.direction === 'COMPRA' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {signal.direction}
            </div>
            <div className="text-xs text-zinc-400">{signal.setup?.type}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-400">Confianza</div>
          <div className="font-bold text-amber-400">{signal.confidence}</div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        <div className="bg-zinc-800/50 rounded p-2">
          <div className="text-zinc-500 text-xs">Entrada</div>
          <div className="font-mono font-bold text-white">{signal.levels?.entry}</div>
        </div>
        <div className="bg-zinc-800/50 rounded p-2">
          <div className="text-zinc-500 text-xs">Stop Loss</div>
          <div className="font-mono font-bold text-red-400">{signal.levels?.stopLoss}</div>
        </div>
        <div className="bg-zinc-800/50 rounded p-2">
          <div className="text-zinc-500 text-xs">TP1 (1:2)</div>
          <div className="font-mono font-bold text-emerald-400">{signal.levels?.takeProfit1}</div>
        </div>
        <div className="bg-zinc-800/50 rounded p-2">
          <div className="text-zinc-500 text-xs">TP2 (1:3)</div>
          <div className="font-mono font-bold text-emerald-400">{signal.levels?.takeProfit2}</div>
        </div>
      </div>
      
      <div className="text-xs text-zinc-400 mb-3">{signal.reasoning}</div>
      
      <div className="flex gap-2">
        <button
          onClick={() => onTake?.(signal)}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg font-medium transition"
        >
          ✓ Tomar Señal
        </button>
        <button
          onClick={() => onIgnore?.(signal)}
          className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white py-2 rounded-lg font-medium transition"
        >
          ✗ Ignorar
        </button>
      </div>
    </div>
  );
};

// =============================================
// COMPONENTE: CONTADOR DE SEÑALES
// =============================================
const SignalCounter = ({ current, max = 7 }) => {
  const percentage = (current / max) * 100;
  
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-zinc-400">Señales Hoy</span>
        <span className="font-bold text-white">{current} / {max}</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${
            current >= max ? 'bg-red-500' : current >= 5 ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {current >= max && (
        <div className="text-xs text-red-400 mt-2">Límite diario alcanzado</div>
      )}
    </div>
  );
};

// =============================================
// COMPONENTE: TOGGLE DE SEÑALES
// =============================================
const SignalToggle = ({ enabled, onToggle, symbol }) => {
  return (
    <div className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
      <div>
        <div className="font-medium text-white">Señales Automáticas</div>
        <div className="text-xs text-zinc-500">{symbol}</div>
      </div>
      <button
        onClick={onToggle}
        className={`relative w-14 h-7 rounded-full transition-colors ${
          enabled ? 'bg-emerald-600' : 'bg-zinc-700'
        }`}
      >
        <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
          enabled ? 'translate-x-8' : 'translate-x-1'
        }`} />
      </button>
    </div>
  );
};

// =============================================
// COMPONENTE: SELECTOR DE SÍMBOLO
// =============================================
const SymbolSelector = ({ symbols, selected, onSelect }) => {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {Object.entries(symbols).map(([key, info]) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`px-4 py-2 rounded-lg whitespace-nowrap transition ${
            selected === key 
              ? 'bg-blue-600 text-white' 
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          }`}
        >
          {info.name}
        </button>
      ))}
    </div>
  );
};

// =============================================
// COMPONENTE: SELECTOR DE TIMEFRAME
// =============================================
const TimeframeSelector = ({ selected, onSelect }) => {
  const timeframes = ['M1', 'M5', 'M15', 'H1'];
  
  return (
    <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
      {timeframes.map(tf => (
        <button
          key={tf}
          onClick={() => onSelect(tf)}
          className={`px-3 py-1 rounded text-sm font-medium transition ${
            selected === tf 
              ? 'bg-zinc-600 text-white' 
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          {tf}
        </button>
      ))}
    </div>
  );
};

// =============================================
// COMPONENTE: HISTORIAL DE SEÑALES
// =============================================
const SignalHistory = ({ signals }) => {
  if (!signals || signals.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-8">
        No hay señales recientes
      </div>
    );
  }
  
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {signals.map((signal, i) => (
        <div 
          key={i}
          className={`flex items-center justify-between p-3 rounded-lg border ${
            signal.direction === 'COMPRA'
              ? 'bg-emerald-500/5 border-emerald-500/20'
              : 'bg-red-500/5 border-red-500/20'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">{signal.direction === 'COMPRA' ? '🟢' : '🔴'}</span>
            <div>
              <div className="font-medium text-white text-sm">{signal.symbolName}</div>
              <div className="text-xs text-zinc-500">
                {new Date(signal.createdAt).toLocaleTimeString()}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-sm font-bold ${
              signal.direction === 'COMPRA' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {signal.direction}
            </div>
            <div className="text-xs text-zinc-500">#{signal.dailyCount}/7</div>
          </div>
        </div>
      ))}
    </div>
  );
};

// =============================================
// DASHBOARD PRINCIPAL
// =============================================
export default function Dashboard() {
  // Estado
  const [user, setUser] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [derivConnected, setDerivConnected] = useState(false);
  
  // Símbolos y datos
  const [symbols, setSymbols] = useState({});
  const [selectedSymbol, setSelectedSymbol] = useState('R_75');
  const [selectedTimeframe, setSelectedTimeframe] = useState('M5');
  
  // Datos en vivo
  const [candles, setCandles] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [narration, setNarration] = useState('');
  const [signal, setSignal] = useState(null);
  
  // Señales
  const [signalsEnabled, setSignalsEnabled] = useState(true);
  const [dailyCount, setDailyCount] = useState(0);
  const [signalHistory, setSignalHistory] = useState([]);
  
  // Tabs
  const [activeTab, setActiveTab] = useState('live');
  
  // Intervalo de actualización
  const updateInterval = useRef(null);

  // =============================================
  // CARGAR DATOS INICIALES
  // =============================================
  useEffect(() => {
    const init = async () => {
      try {
        // Verificar conexión
        const healthRes = await fetch(`${API_URL}/health`);
        const health = await healthRes.json();
        setIsConnected(true);
        setDerivConnected(health.deriv);
        
        // Cargar símbolos
        const symbolsRes = await fetch(`${API_URL}/api/deriv/symbols`);
        const symbolsData = await symbolsRes.json();
        setSymbols(symbolsData);
        
        // Cargar señales activas
        const signalsRes = await fetch(`${API_URL}/api/signals/active`);
        const signalsData = await signalsRes.json();
        setSignalHistory(signalsData);
        
        // Cargar conteo diario
        const countRes = await fetch(`${API_URL}/api/signals/daily-count`);
        const countData = await countRes.json();
        setDailyCount(countData[selectedSymbol] || 0);
        
      } catch (e) {
        console.error('Error inicializando:', e);
        setIsConnected(false);
      }
    };
    
    init();
  }, []);

  // =============================================
  // ACTUALIZAR DATOS EN VIVO
  // =============================================
  const fetchLiveData = useCallback(async () => {
    if (!selectedSymbol) return;
    
    try {
      // Obtener velas
      const candlesRes = await fetch(
        `${API_URL}/api/deriv/candles/${selectedSymbol}/${selectedTimeframe}`
      );
      const candlesData = await candlesRes.json();
      if (candlesData.candles) {
        setCandles(candlesData.candles);
        if (candlesData.candles.length > 0) {
          setCurrentPrice(candlesData.candles[candlesData.candles.length - 1].close);
        }
      }
      
      // Obtener análisis y narración
      const analysisRes = await fetch(
        `${API_URL}/api/analyze/live/${selectedSymbol}`
      );
      const analysisData = await analysisRes.json();
      setAnalysis(analysisData.analysis);
      setNarration(analysisData.narration);
      setSignal(analysisData.signal);
      setDailyCount(analysisData.dailySignals || 0);
      
    } catch (e) {
      console.error('Error obteniendo datos:', e);
    }
  }, [selectedSymbol, selectedTimeframe]);

  // Iniciar/detener actualización automática
  useEffect(() => {
    fetchLiveData();
    
    if (signalsEnabled) {
      updateInterval.current = setInterval(fetchLiveData, 5000); // Cada 5 segundos
    }
    
    return () => {
      if (updateInterval.current) {
        clearInterval(updateInterval.current);
      }
    };
  }, [selectedSymbol, selectedTimeframe, signalsEnabled, fetchLiveData]);

  // =============================================
  // HANDLERS
  // =============================================
  const handleTakeSignal = async (signal) => {
    try {
      await fetch(`${API_URL}/api/signals/${signal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'taken' }),
      });
      
      // Registrar trade
      await fetch(`${API_URL}/api/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: signal.symbol,
          direction: signal.direction,
          entry: signal.levels?.entry,
          stop_loss: signal.levels?.stopLoss,
          take_profit: signal.levels?.takeProfit1,
          signal_id: signal.id,
        }),
      });
      
      alert('✅ Señal tomada. ¡Buena suerte!');
    } catch (e) {
      console.error('Error:', e);
    }
  };

  const handleIgnoreSignal = async (signal) => {
    try {
      await fetch(`${API_URL}/api/signals/${signal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ignored' }),
      });
      setSignal(null);
    } catch (e) {
      console.error('Error:', e);
    }
  };

  // =============================================
  // RENDER
  // =============================================
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tight">
              Trading<span className="text-blue-500">Pro</span>
            </h1>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${derivConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-zinc-400">
                {derivConnected ? 'Deriv Conectado' : 'Desconectado'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <SignalCounter current={dailyCount} max={7} />
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-zinc-800 px-6">
        <div className="max-w-7xl mx-auto flex gap-1">
          {[
            { id: 'live', label: '📊 Trading en Vivo', icon: '📊' },
            { id: 'signals', label: '🎯 Señales', icon: '🎯' },
            { id: 'history', label: '📜 Historial', icon: '📜' },
            { id: 'config', label: '⚙️ Config', icon: '⚙️' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        
        {/* TAB: Trading en Vivo */}
        {activeTab === 'live' && (
          <div className="space-y-6">
            {/* Selector de símbolo */}
            <SymbolSelector 
              symbols={symbols} 
              selected={selectedSymbol} 
              onSelect={setSelectedSymbol}
            />
            
            <div className="grid grid-cols-3 gap-6">
              {/* Columna izquierda: Gráfico */}
              <div className="col-span-2 space-y-4">
                {/* Header del gráfico */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold">{symbols[selectedSymbol]?.name || selectedSymbol}</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-mono font-bold text-blue-400">
                        {currentPrice?.toFixed(4) || '---'}
                      </span>
                    </div>
                  </div>
                  <TimeframeSelector 
                    selected={selectedTimeframe} 
                    onSelect={setSelectedTimeframe}
                  />
                </div>
                
                {/* Gráfico */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <CandlestickChart 
                    candles={candles}
                    symbol={selectedSymbol}
                    currentPrice={currentPrice}
                    orderBlocks={analysis?.m5?.orderBlocks || []}
                    fibLevels={analysis?.fibLevels || {}}
                  />
                </div>
                
                {/* Narración */}
                <NarrationPanel 
                  narration={narration}
                  symbol={selectedSymbol}
                  analysis={analysis}
                />
              </div>
              
              {/* Columna derecha: Señales y controles */}
              <div className="space-y-4">
                {/* Toggle de señales */}
                <SignalToggle 
                  enabled={signalsEnabled}
                  onToggle={() => setSignalsEnabled(!signalsEnabled)}
                  symbol={symbols[selectedSymbol]?.name || selectedSymbol}
                />
                
                {/* Señal activa */}
                {signal?.hasSignal ? (
                  <SignalCard 
                    signal={signal}
                    onTake={handleTakeSignal}
                    onIgnore={handleIgnoreSignal}
                  />
                ) : (
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 text-center">
                    <div className="text-4xl mb-3">🔍</div>
                    <div className="text-zinc-400">Buscando setup...</div>
                    <div className="text-xs text-zinc-500 mt-2">
                      {signal?.reason || 'Esperando condiciones SMC'}
                    </div>
                  </div>
                )}
                
                {/* Reglas SMC */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <h3 className="font-medium text-white mb-3">📋 Checklist SMC</h3>
                  <div className="space-y-2 text-sm">
                    {[
                      { label: 'Tendencia H1/M15', check: analysis?.h1?.structure?.trend && analysis.h1.structure.trend !== 'RANGING' },
                      { label: 'CHoCH en M1', check: analysis?.m1?.choch },
                      { label: 'Order Block M5', check: analysis?.m5?.orderBlocks?.length > 0 },
                      { label: 'Fib 78.6%/92.6%', check: analysis?.fibLevels?.fib786 },
                      { label: 'Alineación MTF', check: analysis?.h1?.structure?.trend === analysis?.m15?.structure?.trend },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-zinc-400">{item.label}</span>
                        <span className={item.check ? 'text-emerald-400' : 'text-zinc-600'}>
                          {item.check ? '✓' : '○'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Estrategia */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <h3 className="font-medium text-white mb-3">🎯 Tu Estrategia</h3>
                  <div className="space-y-2 text-xs text-zinc-400">
                    <div>• H1/M15: Dirección del mercado</div>
                    <div>• M5: Zonas OB para entrada</div>
                    <div>• M1: CHoCH sniper entry</div>
                    <div>• Fib: 78.6% - 92.6%</div>
                    <div>• SL: Corto debajo de zona</div>
                    <div>• TP: Nuevos máximos/mínimos</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Señales */}
        {activeTab === 'signals' && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-bold mb-4">🎯 Señales Activas</h2>
              <SignalHistory signals={signalHistory.filter(s => !s.status)} />
            </div>
            <div>
              <h2 className="text-lg font-bold mb-4">📊 Conteo por Símbolo</h2>
              <div className="space-y-3">
                {Object.entries(symbols).slice(0, 10).map(([key, info]) => (
                  <div key={key} className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                    <span className="text-white">{info.name}</span>
                    <SignalCounter current={dailyCount} max={7} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: Historial */}
        {activeTab === 'history' && (
          <div>
            <h2 className="text-lg font-bold mb-4">📜 Historial de Señales</h2>
            <SignalHistory signals={signalHistory} />
          </div>
        )}

        {/* TAB: Configuración */}
        {activeTab === 'config' && (
          <div className="max-w-xl space-y-6">
            <h2 className="text-lg font-bold">⚙️ Configuración</h2>
            
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <h3 className="font-medium mb-4">Símbolos a Monitorear</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(symbols).map(([key, info]) => (
                  <label key={key} className="flex items-center gap-2 p-2 rounded hover:bg-zinc-800 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-sm">{info.name}</span>
                  </label>
                ))}
              </div>
            </div>
            
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <h3 className="font-medium mb-4">Límites</h3>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Máximo señales por día</span>
                <span className="font-bold text-white">7 por índice</span>
              </div>
            </div>
            
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <h3 className="font-medium mb-4">Notificaciones</h3>
              <div className="space-y-3">
                <label className="flex items-center justify-between">
                  <span className="text-zinc-400">Sonido en nueva señal</span>
                  <input type="checkbox" defaultChecked className="rounded" />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-zinc-400">Vibración</span>
                  <input type="checkbox" defaultChecked className="rounded" />
                </label>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
