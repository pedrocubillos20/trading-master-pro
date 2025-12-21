// =============================================
// TRADING MASTER PRO - DASHBOARD v6.1
// Selector TF + Narración en Vivo + BOS/CHoCH
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// GRÁFICO SMC
// =============================================
const SMCChart = ({ candles, markers, symbol, height = 400 }) => {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current || !candles || candles.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const h = canvas.height;
    
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, h);
    
    const visibleCandles = candles.slice(-80);
    const allPrices = visibleCandles.flatMap(c => [c.high, c.low]);
    
    if (markers?.fibonacci?.optimalZone) {
      allPrices.push(markers.fibonacci.optimalZone.start, markers.fibonacci.optimalZone.end);
    }
    
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice;
    const padding = priceRange * 0.1;
    
    const scaleY = (price) => h - 30 - ((price - minPrice + padding) / (priceRange + padding * 2)) * (h - 60);
    const candleWidth = (width - 80) / visibleCandles.length;
    const chartRight = width - 70;
    
    // Grid
    ctx.strokeStyle = '#1f1f23';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = 30 + ((h - 60) / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartRight, y);
      ctx.stroke();
      const price = maxPrice + padding - ((priceRange + padding * 2) / 5) * i;
      ctx.fillStyle = '#52525b';
      ctx.font = '10px monospace';
      ctx.fillText(price.toFixed(2), chartRight + 5, y + 3);
    }

    // Fibonacci Zone (70.6% - 92.6%)
    if (markers?.fibonacci?.optimalZone) {
      const fib = markers.fibonacci;
      const zoneTop = scaleY(fib.optimalZone.start);
      const zoneBottom = scaleY(fib.optimalZone.end);
      
      ctx.fillStyle = 'rgba(251, 191, 36, 0.08)';
      ctx.fillRect(0, Math.min(zoneTop, zoneBottom), chartRight, Math.abs(zoneBottom - zoneTop));
      
      // Líneas Fib
      [
        { level: '70.6%', price: fib.fib_706 },
        { level: '78.6%', price: fib.fib_786 },
        { level: '92.6%', price: fib.fib_926 },
      ].forEach(({ level, price }) => {
        if (price) {
          const y = scaleY(price);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(chartRight, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#f59e0b';
          ctx.font = '9px sans-serif';
          ctx.fillText(level, 5, y - 3);
        }
      });
    }

    // Order Blocks
    if (markers?.orderBlocks) {
      [markers.orderBlocks.original, markers.orderBlocks.decisional].forEach((ob) => {
        if (ob) {
          const y1 = scaleY(ob.high);
          const y2 = scaleY(ob.low);
          const isDemand = ob.obType === 'DEMAND';
          
          ctx.fillStyle = isDemand ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
          ctx.fillRect(0, Math.min(y1, y2), chartRight, Math.abs(y2 - y1));
          
          ctx.strokeStyle = isDemand ? '#10b981' : '#ef4444';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(0, Math.min(y1, y2), chartRight, Math.abs(y2 - y1));
          
          ctx.fillStyle = isDemand ? '#10b981' : '#ef4444';
          ctx.font = 'bold 9px sans-serif';
          ctx.fillText(`OB ${ob.type}`, 5, Math.min(y1, y2) - 3);
        }
      });
    }

    // Velas
    visibleCandles.forEach((candle, i) => {
      const x = 10 + i * candleWidth + candleWidth / 2;
      const open = scaleY(candle.open);
      const close = scaleY(candle.close);
      const high = scaleY(candle.high);
      const low = scaleY(candle.low);
      const isBullish = candle.close > candle.open;
      const color = isBullish ? '#10b981' : '#ef4444';
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, high);
      ctx.lineTo(x, low);
      ctx.stroke();
      
      ctx.fillStyle = color;
      ctx.fillRect(x - candleWidth * 0.35, Math.min(open, close), candleWidth * 0.7, Math.abs(close - open) || 1);
    });

    // BOS Line
    if (markers?.bos) {
      const y = scaleY(markers.bos.price);
      const color = markers.bos.direction === 'BULLISH' ? '#3b82f6' : '#f97316';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartRight, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Label
      ctx.fillStyle = color;
      ctx.fillRect(chartRight - 45, y - 10, 40, 16);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('BOS', chartRight - 35, y + 2);
    }

    // CHoCH Line
    if (markers?.choch) {
      const y = scaleY(markers.choch.price);
      const color = markers.choch.direction === 'BULLISH' ? '#22c55e' : '#ef4444';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartRight, y);
      ctx.stroke();
      
      // Label
      ctx.fillStyle = color;
      ctx.fillRect(chartRight - 55, y - 10, 50, 16);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('CHoCH', chartRight - 50, y + 2);
    }

    // Entry/SL/TP Lines
    if (markers?.levels) {
      const { entry, stopLoss, takeProfit1 } = markers.levels;
      
      if (entry) {
        const y = scaleY(parseFloat(entry));
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(chartRight - 120, y);
        ctx.lineTo(chartRight, y);
        ctx.stroke();
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(`ENTRY ${entry}`, chartRight - 115, y - 3);
      }
      
      if (stopLoss) {
        const y = scaleY(parseFloat(stopLoss));
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(chartRight - 120, y);
        ctx.lineTo(chartRight, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ef4444';
        ctx.fillText(`SL ${stopLoss}`, chartRight - 115, y - 3);
      }
      
      if (takeProfit1) {
        const y = scaleY(parseFloat(takeProfit1));
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(chartRight - 120, y);
        ctx.lineTo(chartRight, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#10b981';
        ctx.fillText(`TP ${takeProfit1}`, chartRight - 115, y - 3);
      }
    }

    // Título
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(symbol || '', 10, 18);
    
  }, [candles, markers, symbol]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={850} 
      height={height}
      className="w-full rounded-xl border border-zinc-800"
    />
  );
};

// =============================================
// NARRACIÓN EN VIVO
// =============================================
const NarrationPanel = ({ narration, waiting, status, levels }) => {
  const statusColors = {
    'ENTRADA_LISTA': 'bg-emerald-500/20 border-emerald-500/50',
    'ESPERANDO_RETROCESO': 'bg-amber-500/20 border-amber-500/50',
    'ESPERANDO_BREAK': 'bg-blue-500/20 border-blue-500/50',
    'ESPERANDO_OB': 'bg-purple-500/20 border-purple-500/50',
    'SIN_ESTRUCTURA': 'bg-zinc-500/20 border-zinc-500/50',
    'BUSCANDO': 'bg-zinc-500/20 border-zinc-500/50',
  };

  const statusLabels = {
    'ENTRADA_LISTA': '🎯 ENTRADA LISTA',
    'ESPERANDO_RETROCESO': '⏳ Esperando Retroceso',
    'ESPERANDO_BREAK': '👀 Esperando BOS/CHoCH',
    'ESPERANDO_OB': '🔍 Buscando Order Block',
    'SIN_ESTRUCTURA': '📊 Sin Estructura Clara',
    'BUSCANDO': '🔄 Analizando...',
  };

  return (
    <div className={`rounded-xl border p-4 ${statusColors[status] || statusColors.BUSCANDO}`}>
      {/* Status Badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-white">Narración en Vivo</span>
        </div>
        <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300">
          {statusLabels[status] || status}
        </span>
      </div>
      
      {/* Narración */}
      <div className="bg-zinc-900/50 rounded-lg p-3 mb-3">
        <p className="text-zinc-200 text-sm leading-relaxed">
          {narration || 'Analizando el mercado...'}
        </p>
      </div>
      
      {/* Qué estamos esperando */}
      {waiting && waiting.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-zinc-400 mb-2">⏳ Esperando:</div>
          <div className="space-y-1">
            {waiting.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-amber-400">○</span>
                <span className="text-zinc-300">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Niveles si hay entrada lista */}
      {status === 'ENTRADA_LISTA' && levels && (
        <div className="grid grid-cols-4 gap-2 pt-3 border-t border-zinc-700">
          <div className="text-center">
            <div className="text-xs text-zinc-500">Entry</div>
            <div className="font-mono text-sm text-blue-400">{levels.entry}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-zinc-500">SL</div>
            <div className="font-mono text-sm text-red-400">{levels.stopLoss}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-zinc-500">TP1</div>
            <div className="font-mono text-sm text-emerald-400">{levels.takeProfit1}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-zinc-500">R:R</div>
            <div className="font-mono text-sm text-amber-400">{levels.riskReward}</div>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================
// SELECTOR DE SÍMBOLO
// =============================================
const SymbolSelector = ({ symbols, selected, onSelect, dailyCounts }) => (
  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
    {Object.entries(symbols).map(([key, info]) => (
      <button
        key={key}
        onClick={() => onSelect(key)}
        className={`px-3 py-2 rounded-lg whitespace-nowrap transition flex items-center gap-2 text-sm ${
          selected === key 
            ? 'bg-blue-600 text-white' 
            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
        }`}
      >
        <span>{info.name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          (dailyCounts?.[key] || 0) >= 7 ? 'bg-red-500/30 text-red-400' : 'bg-zinc-700/50 text-zinc-500'
        }`}>
          {dailyCounts?.[key] || 0}/7
        </span>
      </button>
    ))}
  </div>
);

// =============================================
// SELECTOR DE TIMEFRAME
// =============================================
const TimeframeSelector = ({ selected, onSelect }) => {
  const tfs = [
    { id: 'M15', label: 'M15', desc: 'Estructura' },
    { id: 'M5', label: 'M5', desc: 'Zonas' },
    { id: 'M1', label: 'M1', desc: 'Entrada' },
  ];
  
  return (
    <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-1">
      {tfs.map(tf => (
        <button
          key={tf.id}
          onClick={() => onSelect(tf.id)}
          className={`px-3 py-1.5 rounded transition ${
            selected === tf.id 
              ? 'bg-zinc-600 text-white' 
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <div className="text-sm font-medium">{tf.label}</div>
          <div className="text-[10px] text-zinc-500">{tf.desc}</div>
        </button>
      ))}
    </div>
  );
};

// =============================================
// PANEL DE ANÁLISIS
// =============================================
const AnalysisPanel = ({ analysis }) => {
  if (!analysis) return null;
  
  const { structure, bos, choch, orderBlocks, zoneCheck, scoring } = analysis;
  
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-4">
      <h3 className="font-bold text-white flex items-center gap-2">
        <span className="w-2 h-2 bg-blue-500 rounded-full" />
        Análisis SMC
      </h3>
      
      {/* Estructura */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-zinc-800/50 rounded-lg p-2">
          <div className="text-xs text-zinc-500">Tendencia</div>
          <div className={`font-bold ${
            structure?.trend === 'BULLISH' ? 'text-emerald-400' :
            structure?.trend === 'BEARISH' ? 'text-red-400' : 'text-zinc-400'
          }`}>
            {structure?.trend || 'N/A'}
          </div>
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-2">
          <div className="text-xs text-zinc-500">Estructura</div>
          <div className="font-bold text-white text-sm">
            {structure?.structure?.join(' → ') || 'N/A'}
          </div>
        </div>
      </div>
      
      {/* BOS / CHoCH */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-lg p-2 ${bos ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-zinc-800/50'}`}>
          <div className="text-xs text-zinc-500">BOS</div>
          <div className={`font-bold ${bos ? 'text-blue-400' : 'text-zinc-600'}`}>
            {bos ? `✓ ${bos.direction}` : '○ No'}
          </div>
        </div>
        <div className={`rounded-lg p-2 ${choch ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-zinc-800/50'}`}>
          <div className="text-xs text-zinc-500">CHoCH</div>
          <div className={`font-bold ${choch ? 'text-emerald-400' : 'text-zinc-600'}`}>
            {choch ? `✓ ${choch.direction}` : '○ No'}
          </div>
        </div>
      </div>
      
      {/* Order Block & Fib */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-lg p-2 ${orderBlocks?.decisional || orderBlocks?.original ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-zinc-800/50'}`}>
          <div className="text-xs text-zinc-500">Order Block</div>
          <div className={`font-bold text-sm ${orderBlocks?.original ? 'text-purple-400' : orderBlocks?.decisional ? 'text-purple-300' : 'text-zinc-600'}`}>
            {orderBlocks?.original ? 'Original ✓' : orderBlocks?.decisional ? 'Decisional ✓' : '○ Buscando'}
          </div>
        </div>
        <div className={`rounded-lg p-2 ${zoneCheck?.inFibZone ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-zinc-800/50'}`}>
          <div className="text-xs text-zinc-500">Zona Fib</div>
          <div className={`font-bold text-sm ${zoneCheck?.inFibZone ? 'text-amber-400' : zoneCheck?.nearZone ? 'text-amber-300' : 'text-zinc-600'}`}>
            {zoneCheck?.inFibZone ? '✓ En zona' : zoneCheck?.nearZone ? '~ Cerca' : '○ Fuera'}
          </div>
        </div>
      </div>
      
      {/* Score */}
      {scoring && (
        <div className="pt-3 border-t border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-400 text-sm">Score</span>
            <span className={`font-bold ${
              scoring.score >= 85 ? 'text-emerald-400' :
              scoring.score >= 70 ? 'text-blue-400' :
              scoring.score >= 55 ? 'text-amber-400' : 'text-zinc-400'
            }`}>
              {scoring.score}/100 ({scoring.classification})
            </span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${
                scoring.score >= 85 ? 'bg-emerald-500' :
                scoring.score >= 70 ? 'bg-blue-500' :
                scoring.score >= 55 ? 'bg-amber-500' : 'bg-zinc-600'
              }`}
              style={{ width: `${scoring.score}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================
// SIGNAL CARD
// =============================================
const SignalCard = ({ signal, onClick }) => {
  if (!signal?.hasSignal) return null;
  const isBuy = signal.direction === 'BULLISH';
  
  return (
    <div 
      onClick={() => onClick?.(signal)}
      className={`rounded-xl border p-4 cursor-pointer transition hover:scale-[1.01] ${
        isBuy ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{isBuy ? '🟢' : '🔴'}</span>
          <div>
            <div className="font-bold text-white">{signal.symbolName}</div>
            <div className="text-xs text-zinc-400">{signal.breakSignal?.type} - {new Date(signal.createdAt).toLocaleTimeString()}</div>
          </div>
        </div>
        <div className={`font-bold ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
          {isBuy ? 'COMPRA' : 'VENTA'}
        </div>
      </div>
      
      {signal.levels && (
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="bg-zinc-800/50 rounded p-2 text-center">
            <div className="text-zinc-500">Entry</div>
            <div className="font-mono text-blue-400">{signal.levels.entry}</div>
          </div>
          <div className="bg-zinc-800/50 rounded p-2 text-center">
            <div className="text-zinc-500">SL</div>
            <div className="font-mono text-red-400">{signal.levels.stopLoss}</div>
          </div>
          <div className="bg-zinc-800/50 rounded p-2 text-center">
            <div className="text-zinc-500">TP1</div>
            <div className="font-mono text-emerald-400">{signal.levels.takeProfit1}</div>
          </div>
          <div className="bg-zinc-800/50 rounded p-2 text-center">
            <div className="text-zinc-500">Score</div>
            <div className="font-mono text-amber-400">{signal.scoring?.score}</div>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================
// DASHBOARD PRINCIPAL
// =============================================
export default function Dashboard() {
  const [isConnected, setIsConnected] = useState(false);
  const [symbols, setSymbols] = useState({});
  const [selectedSymbol, setSelectedSymbol] = useState('R_75');
  const [selectedTF, setSelectedTF] = useState('M15');
  const [analysis, setAnalysis] = useState(null);
  const [narration, setNarration] = useState(null);
  const [signals, setSignals] = useState([]);
  const [dailyCounts, setDailyCounts] = useState({});
  const [activeTab, setActiveTab] = useState('live');
  const [loading, setLoading] = useState(false);

  // Init
  useEffect(() => {
    const init = async () => {
      try {
        const [health, syms, sigs, counts] = await Promise.all([
          fetch(`${API_URL}/health`).then(r => r.json()),
          fetch(`${API_URL}/api/deriv/symbols`).then(r => r.json()),
          fetch(`${API_URL}/api/signals/history`).then(r => r.json()),
          fetch(`${API_URL}/api/signals/daily-count`).then(r => r.json()),
        ]);
        setIsConnected(health.deriv);
        setSymbols(syms);
        setSignals(sigs);
        setDailyCounts(counts);
      } catch (e) {
        setIsConnected(false);
      }
    };
    init();
  }, []);

  // Fetch analysis
  const fetchData = useCallback(async () => {
    if (!selectedSymbol) return;
    setLoading(true);
    try {
      const [analysisRes, narrationRes] = await Promise.all([
        fetch(`${API_URL}/api/analyze/live/${selectedSymbol}?timeframe=${selectedTF}`).then(r => r.json()),
        fetch(`${API_URL}/api/narration/${selectedSymbol}?timeframe=${selectedTF}`).then(r => r.json()),
      ]);
      setAnalysis(analysisRes);
      setNarration(narrationRes);
    } catch (e) {}
    setLoading(false);
  }, [selectedSymbol, selectedTF]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Fetch signals
  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const [sigs, counts] = await Promise.all([
          fetch(`${API_URL}/api/signals/history`).then(r => r.json()),
          fetch(`${API_URL}/api/signals/daily-count`).then(r => r.json()),
        ]);
        setSignals(sigs);
        setDailyCounts(counts);
      } catch (e) {}
    };
    const interval = setInterval(fetchSignals, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">Trading<span className="text-blue-500">Pro</span></h1>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-xs text-zinc-400">{isConnected ? 'Online' : 'Offline'}</span>
            </div>
          </div>
          <span className="text-xs text-zinc-500">v6.1 SMC</span>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-zinc-800 px-4">
        <div className="max-w-7xl mx-auto flex gap-1">
          {[
            { id: 'live', label: '📊 Trading en Vivo' },
            { id: 'signals', label: '🎯 Señales' },
            { id: 'history', label: '📜 Historial' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm transition border-b-2 ${
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

      {/* Main */}
      <main className="max-w-7xl mx-auto p-4">
        {activeTab === 'live' && (
          <div className="space-y-4">
            {/* Selectors */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <SymbolSelector 
                symbols={symbols} 
                selected={selectedSymbol} 
                onSelect={setSelectedSymbol}
                dailyCounts={dailyCounts}
              />
              <TimeframeSelector selected={selectedTF} onSelect={setSelectedTF} />
            </div>
            
            {/* Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Chart + Narration */}
              <div className="lg:col-span-2 space-y-4">
                <div className="relative">
                  {loading && (
                    <div className="absolute inset-0 bg-zinc-900/70 flex items-center justify-center z-10 rounded-xl">
                      <div className="text-zinc-400 text-sm">Analizando...</div>
                    </div>
                  )}
                  <SMCChart 
                    candles={analysis?.candles || []}
                    markers={analysis?.chartMarkers}
                    symbol={`${symbols[selectedSymbol]?.name || selectedSymbol} - ${selectedTF}`}
                  />
                </div>
                
                <NarrationPanel 
                  narration={narration?.narration}
                  waiting={narration?.waiting}
                  status={narration?.status}
                  levels={narration?.levels}
                />
                
                {analysis?.hasSignal && <SignalCard signal={analysis} />}
              </div>
              
              {/* Analysis Panel */}
              <div>
                <AnalysisPanel analysis={analysis} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'signals' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">🎯 Señales Activas</h2>
            {signals.filter(s => s.hasSignal).length === 0 ? (
              <div className="text-center text-zinc-500 py-8">No hay señales activas</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {signals.filter(s => s.hasSignal).slice(0, 10).map(s => (
                  <SignalCard key={s.id} signal={s} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">📜 Historial</h2>
            {signals.length === 0 ? (
              <div className="text-center text-zinc-500 py-8">Sin historial</div>
            ) : (
              <div className="space-y-2">
                {signals.slice(0, 30).map(s => (
                  <div key={s.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                    s.direction === 'BULLISH' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
                  }`}>
                    <div className="flex items-center gap-3">
                      <span>{s.direction === 'BULLISH' ? '🟢' : '🔴'}</span>
                      <div>
                        <div className="font-medium text-white text-sm">{s.symbolName}</div>
                        <div className="text-xs text-zinc-500">{s.breakSignal?.type} - {new Date(s.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold text-sm ${s.direction === 'BULLISH' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {s.direction === 'BULLISH' ? 'COMPRA' : 'VENTA'}
                      </div>
                      <div className="text-xs text-zinc-500">Entry: {s.levels?.entry}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
