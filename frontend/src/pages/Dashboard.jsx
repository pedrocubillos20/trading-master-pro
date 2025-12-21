// =============================================
// TRADING MASTER PRO - DASHBOARD v6.0
// SMC Institutional + Gráfico con CHoCH/BOS/Fib
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// GRÁFICO SMC CON MARCADORES
// =============================================
const SMCChart = ({ candles, markers, symbol, height = 450 }) => {
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
    
    // Incluir niveles de fibonacci en el rango
    if (markers?.fibonacci?.optimalZone) {
      allPrices.push(markers.fibonacci.optimalZone.start, markers.fibonacci.optimalZone.end);
    }
    if (markers?.entry) allPrices.push(markers.entry);
    if (markers?.stopLoss) allPrices.push(markers.stopLoss);
    if (markers?.takeProfit) allPrices.push(markers.takeProfit);
    
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
      ctx.textAlign = 'left';
      ctx.fillText(price.toFixed(4), chartRight + 5, y + 3);
    }

    // =============================================
    // DIBUJAR ZONA FIBONACCI (70.6% - 92.6%)
    // =============================================
    if (markers?.fibonacci?.optimalZone) {
      const fib = markers.fibonacci;
      const zoneTop = scaleY(fib.optimalZone.start);
      const zoneBottom = scaleY(fib.optimalZone.end);
      
      // Zona sombreada
      ctx.fillStyle = 'rgba(251, 191, 36, 0.1)';
      ctx.fillRect(0, zoneTop, chartRight, zoneBottom - zoneTop);
      
      // Líneas de fibonacci
      const fibLevels = [
        { level: 70.6, price: fib.fib_706, color: '#f59e0b' },
        { level: 78.6, price: fib.fib_786, color: '#eab308' },
        { level: 92.6, price: fib.fib_926, color: '#f59e0b' },
      ];
      
      fibLevels.forEach(({ level, price, color }) => {
        if (price) {
          const y = scaleY(price);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(chartRight, y);
          ctx.stroke();
          ctx.setLineDash([]);
          
          ctx.fillStyle = color;
          ctx.font = 'bold 9px sans-serif';
          ctx.fillText(`${level}%`, 5, y - 3);
        }
      });
    }

    // =============================================
    // DIBUJAR ORDER BLOCKS
    // =============================================
    if (markers?.orderBlocks) {
      const { decisional, original } = markers.orderBlocks;
      
      [decisional, original].forEach((ob, i) => {
        if (ob) {
          const y1 = scaleY(ob.high);
          const y2 = scaleY(ob.low);
          const color = ob.obType === 'DEMAND' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';
          const borderColor = ob.obType === 'DEMAND' ? '#10b981' : '#ef4444';
          
          ctx.fillStyle = color;
          ctx.fillRect(0, y1, chartRight, y2 - y1);
          
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(0, y1, chartRight, y2 - y1);
          
          // Label
          ctx.fillStyle = borderColor;
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText(ob.type === 'ORIGINAL' ? 'OB Original' : 'OB Decisional', 5, y1 - 5);
        }
      });
    }

    // =============================================
    // DIBUJAR VELAS
    // =============================================
    visibleCandles.forEach((candle, i) => {
      const x = 10 + i * candleWidth + candleWidth / 2;
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

    // =============================================
    // DIBUJAR CHoCH
    // =============================================
    if (markers?.choch) {
      const y = scaleY(markers.choch.price);
      const color = markers.choch.direction === 'BULLISH' ? '#22c55e' : '#ef4444';
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartRight, y);
      ctx.stroke();
      
      // Label CHoCH
      ctx.fillStyle = '#000';
      ctx.fillRect(chartRight - 60, y - 12, 55, 18);
      ctx.fillStyle = color;
      ctx.fillRect(chartRight - 58, y - 10, 51, 14);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CHoCH', chartRight - 33, y + 1);
    }

    // =============================================
    // DIBUJAR BOS
    // =============================================
    if (markers?.bos) {
      const y = scaleY(markers.bos.price);
      const color = markers.bos.direction === 'BULLISH' ? '#3b82f6' : '#f97316';
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartRight, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = color;
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('BOS', chartRight - 50, y - 5);
    }

    // =============================================
    // DIBUJAR NIVELES ENTRY / SL / TP
    // =============================================
    const drawLevel = (price, label, color, style = 'solid') => {
      if (!price) return;
      const y = scaleY(price);
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (style === 'dashed') ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(chartRight - 150, y);
      ctx.lineTo(chartRight, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Badge
      ctx.fillStyle = color;
      ctx.fillRect(chartRight + 2, y - 10, 65, 20);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, chartRight + 5, y + 4);
    };

    drawLevel(markers?.entry, 'ENTRY', '#3b82f6');
    drawLevel(markers?.stopLoss, 'SL', '#ef4444', 'dashed');
    drawLevel(markers?.takeProfit, 'TP', '#10b981', 'dashed');

    // =============================================
    // PRECIO ACTUAL
    // =============================================
    if (visibleCandles.length > 0) {
      const currentPrice = visibleCandles[visibleCandles.length - 1].close;
      const y = scaleY(currentPrice);
      
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.moveTo(chartRight, y);
      ctx.lineTo(chartRight + 8, y - 6);
      ctx.lineTo(chartRight + 8, y + 6);
      ctx.fill();
    }

    // Título
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(symbol || 'Chart', 10, 20);
    
  }, [candles, markers, symbol]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={900} 
      height={height}
      className="w-full rounded-xl border border-zinc-800"
      style={{ background: '#09090b' }}
    />
  );
};

// =============================================
// CARD DE SEÑAL CON NIVELES
// =============================================
const SignalCard = ({ signal, onClick, compact = false }) => {
  if (!signal) return null;
  
  const isBuy = signal.direction === 'BULLISH' || signal.direction === 'COMPRA';
  
  return (
    <div 
      onClick={() => onClick?.(signal)}
      className={`border rounded-xl p-4 cursor-pointer transition hover:scale-[1.02] ${
        isBuy 
          ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50' 
          : 'bg-red-500/10 border-red-500/30 hover:border-red-500/50'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{isBuy ? '🟢' : '🔴'}</span>
          <div>
            <div className="font-bold text-white">{signal.symbolName || signal.symbol}</div>
            <div className="text-xs text-zinc-400">
              {new Date(signal.createdAt).toLocaleTimeString()}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`font-bold ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
            {isBuy ? 'COMPRA' : 'VENTA'}
          </div>
          <div className="text-xs text-amber-400">
            {signal.scoring?.classification} ({signal.scoring?.score}/100)
          </div>
        </div>
      </div>
      
      {signal.levels && !compact && (
        <div className="grid grid-cols-4 gap-2 text-xs mb-3">
          <div className="bg-zinc-800/50 rounded p-2 text-center">
            <div className="text-zinc-500">Entry</div>
            <div className="font-mono font-bold text-blue-400">{signal.levels.entry}</div>
          </div>
          <div className="bg-zinc-800/50 rounded p-2 text-center">
            <div className="text-zinc-500">SL</div>
            <div className="font-mono font-bold text-red-400">{signal.levels.stopLoss}</div>
          </div>
          <div className="bg-zinc-800/50 rounded p-2 text-center">
            <div className="text-zinc-500">TP</div>
            <div className="font-mono font-bold text-emerald-400">{signal.levels.takeProfit}</div>
          </div>
          <div className="bg-zinc-800/50 rounded p-2 text-center">
            <div className="text-zinc-500">R:R</div>
            <div className="font-mono font-bold text-amber-400">{signal.levels.riskReward}</div>
          </div>
        </div>
      )}
      
      {signal.reason && !compact && (
        <div className="text-xs text-zinc-400 border-t border-zinc-800 pt-2">
          💡 {signal.reason}
        </div>
      )}
    </div>
  );
};

// =============================================
// MODAL DE DETALLE DE SEÑAL
// =============================================
const SignalDetailModal = ({ signal, onClose }) => {
  if (!signal) return null;
  
  const isBuy = signal.direction === 'BULLISH' || signal.direction === 'COMPRA';
  
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-zinc-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-4 border-b border-zinc-800 flex items-center justify-between ${
          isBuy ? 'bg-emerald-500/10' : 'bg-red-500/10'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{isBuy ? '🟢' : '🔴'}</span>
            <div>
              <h2 className="text-xl font-bold text-white">{signal.symbolName}</h2>
              <div className="text-sm text-zinc-400">
                {new Date(signal.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl">×</button>
        </div>
        
        {/* Gráfico */}
        <div className="p-4">
          <SMCChart 
            candles={signal.candles?.m15 || []}
            markers={signal.chartMarkers}
            symbol={`${signal.symbolName} - M15`}
            height={400}
          />
        </div>
        
        {/* Niveles */}
        {signal.levels && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-center">
                <div className="text-blue-400 text-sm mb-1">📍 Entry</div>
                <div className="font-mono font-bold text-xl text-white">{signal.levels.entry}</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
                <div className="text-red-400 text-sm mb-1">🛑 Stop Loss</div>
                <div className="font-mono font-bold text-xl text-white">{signal.levels.stopLoss}</div>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
                <div className="text-emerald-400 text-sm mb-1">🎯 Take Profit</div>
                <div className="font-mono font-bold text-xl text-white">{signal.levels.takeProfit}</div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center">
                <div className="text-amber-400 text-sm mb-1">📈 Risk:Reward</div>
                <div className="font-mono font-bold text-xl text-white">{signal.levels.riskReward}</div>
              </div>
            </div>
          </div>
        )}
        
        {/* Análisis */}
        <div className="px-4 pb-4">
          <div className="bg-zinc-800/50 rounded-xl p-4">
            <h3 className="font-bold text-white mb-3">📊 Análisis SMC</h3>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-zinc-400 mb-1">Estructura M15</div>
                <div className="text-white font-medium">{signal.m15Structure?.trend || 'N/A'}</div>
              </div>
              <div>
                <div className="text-zinc-400 mb-1">CHoCH</div>
                <div className={`font-medium ${signal.choch ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {signal.choch ? `✓ ${signal.choch.direction}` : '✗ No detectado'}
                </div>
              </div>
              <div>
                <div className="text-zinc-400 mb-1">Zona Fibonacci</div>
                <div className={`font-medium ${signal.inFibZone ? 'text-amber-400' : 'text-zinc-500'}`}>
                  {signal.inFibZone ? '✓ En zona 70.6-92.6%' : '✗ Fuera de zona'}
                </div>
              </div>
              <div>
                <div className="text-zinc-400 mb-1">Order Block</div>
                <div className={`font-medium ${signal.orderBlocks?.decisional ? 'text-blue-400' : 'text-zinc-500'}`}>
                  {signal.orderBlocks?.original ? 'Original (A+)' : 
                   signal.orderBlocks?.decisional ? 'Decisional (A)' : 'No encontrado'}
                </div>
              </div>
            </div>
            
            {/* Score breakdown */}
            {signal.scoring?.details && (
              <div className="mt-4 pt-4 border-t border-zinc-700">
                <div className="text-zinc-400 mb-2">Score Breakdown</div>
                <div className="flex gap-2">
                  {Object.entries(signal.scoring.details).map(([key, value]) => (
                    <div key={key} className="flex-1 bg-zinc-900 rounded p-2 text-center">
                      <div className="text-xs text-zinc-500">{key.replace('_', ' ')}</div>
                      <div className={`font-bold ${value >= 15 ? 'text-emerald-400' : value >= 10 ? 'text-amber-400' : 'text-zinc-500'}`}>
                        {value}/20
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Razón */}
        <div className="px-4 pb-4">
          <div className={`rounded-xl p-4 ${isBuy ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
            <div className="text-sm text-zinc-300">
              💡 <strong>Por qué esta señal:</strong> {signal.reason}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================
// SELECTOR DE SÍMBOLO
// =============================================
const SymbolSelector = ({ symbols, selected, onSelect, dailyCounts }) => {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {Object.entries(symbols).map(([key, info]) => {
        const count = dailyCounts?.[key] || 0;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap transition flex items-center gap-2 ${
              selected === key 
                ? 'bg-blue-600 text-white' 
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            <span>{info.name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              count >= 7 ? 'bg-red-500/30 text-red-400' : 'bg-zinc-700 text-zinc-400'
            }`}>
              {count}/7
            </span>
          </button>
        );
      })}
    </div>
  );
};

// =============================================
// PANEL DE ANÁLISIS EN VIVO
// =============================================
const LiveAnalysisPanel = ({ analysis }) => {
  if (!analysis) return null;
  
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
      <h3 className="font-bold text-white mb-3 flex items-center gap-2">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        Análisis en Vivo
      </h3>
      
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="text-zinc-500 text-xs mb-1">Tendencia M15</div>
          <div className={`font-bold ${
            analysis.m15Structure?.trend === 'BULLISH' ? 'text-emerald-400' :
            analysis.m15Structure?.trend === 'BEARISH' ? 'text-red-400' : 'text-zinc-400'
          }`}>
            {analysis.m15Structure?.trend || 'Analizando...'}
          </div>
        </div>
        
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="text-zinc-500 text-xs mb-1">CHoCH M15</div>
          <div className={`font-bold ${analysis.choch ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {analysis.choch ? `✓ ${analysis.choch.direction}` : 'Esperando...'}
          </div>
        </div>
        
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="text-zinc-500 text-xs mb-1">Zona Fib (70.6-92.6%)</div>
          <div className={`font-bold ${analysis.inFibZone ? 'text-amber-400' : 'text-zinc-500'}`}>
            {analysis.inFibZone ? '✓ En zona' : '✗ Fuera'}
          </div>
        </div>
        
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="text-zinc-500 text-xs mb-1">Order Block</div>
          <div className={`font-bold ${
            analysis.orderBlocks?.original ? 'text-emerald-400' :
            analysis.orderBlocks?.decisional ? 'text-blue-400' : 'text-zinc-500'
          }`}>
            {analysis.orderBlocks?.original ? 'Original ✓' :
             analysis.orderBlocks?.decisional ? 'Decisional ✓' : 'Buscando...'}
          </div>
        </div>
      </div>
      
      {analysis.scoring && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 text-sm">Score Total</span>
            <div className="flex items-center gap-2">
              <div className="w-32 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    analysis.scoring.score >= 85 ? 'bg-emerald-500' :
                    analysis.scoring.score >= 70 ? 'bg-blue-500' :
                    analysis.scoring.score >= 55 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${analysis.scoring.score}%` }}
                />
              </div>
              <span className={`font-bold ${
                analysis.scoring.score >= 85 ? 'text-emerald-400' :
                analysis.scoring.score >= 70 ? 'text-blue-400' : 'text-zinc-400'
              }`}>
                {analysis.scoring.score}/100 ({analysis.scoring.classification})
              </span>
            </div>
          </div>
        </div>
      )}
      
      {analysis.reason && (
        <div className="mt-3 text-xs text-zinc-400 bg-zinc-800/30 rounded-lg p-2">
          💡 {analysis.reason}
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
  const [derivConnected, setDerivConnected] = useState(false);
  const [symbols, setSymbols] = useState({});
  const [selectedSymbol, setSelectedSymbol] = useState('R_75');
  const [analysis, setAnalysis] = useState(null);
  const [signals, setSignals] = useState([]);
  const [dailyCounts, setDailyCounts] = useState({});
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [activeTab, setActiveTab] = useState('live');
  const [loading, setLoading] = useState(false);

  // Cargar datos iniciales
  useEffect(() => {
    const init = async () => {
      try {
        const [healthRes, symbolsRes, signalsRes, countsRes] = await Promise.all([
          fetch(`${API_URL}/health`),
          fetch(`${API_URL}/api/deriv/symbols`),
          fetch(`${API_URL}/api/signals/history`),
          fetch(`${API_URL}/api/signals/daily-count`)
        ]);
        
        const health = await healthRes.json();
        setIsConnected(true);
        setDerivConnected(health.deriv);
        
        const symbolsData = await symbolsRes.json();
        setSymbols(symbolsData);
        
        const signalsData = await signalsRes.json();
        setSignals(signalsData);
        
        const counts = await countsRes.json();
        setDailyCounts(counts);
        
      } catch (e) {
        console.error('Error:', e);
        setIsConnected(false);
      }
    };
    init();
  }, []);

  // Obtener análisis en vivo
  const fetchAnalysis = useCallback(async () => {
    if (!selectedSymbol) return;
    setLoading(true);
    
    try {
      const res = await fetch(`${API_URL}/api/analyze/live/${selectedSymbol}`);
      const data = await res.json();
      setAnalysis(data);
    } catch (e) {
      console.error('Error:', e);
    }
    
    setLoading(false);
  }, [selectedSymbol]);

  useEffect(() => {
    fetchAnalysis();
    const interval = setInterval(fetchAnalysis, 10000);
    return () => clearInterval(interval);
  }, [fetchAnalysis]);

  // Obtener señales periódicamente
  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const [signalsRes, countsRes] = await Promise.all([
          fetch(`${API_URL}/api/signals/history`),
          fetch(`${API_URL}/api/signals/daily-count`)
        ]);
        setSignals(await signalsRes.json());
        setDailyCounts(await countsRes.json());
      } catch (e) {}
    };
    
    const interval = setInterval(fetchSignals, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">
              Trading<span className="text-blue-500">Pro</span>
              <span className="text-xs text-zinc-500 ml-2">v6.0</span>
            </h1>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${derivConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-sm text-zinc-400">
                {derivConnected ? 'Deriv Online' : 'Desconectado'}
              </span>
            </div>
          </div>
          
          <div className="text-sm text-zinc-400">
            SMC Institutional Strategy
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-zinc-800 px-6">
        <div className="max-w-7xl mx-auto flex gap-1">
          {[
            { id: 'live', label: '📊 Trading en Vivo' },
            { id: 'signals', label: '🎯 Señales' },
            { id: 'history', label: '📜 Historial' },
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

      {/* Main */}
      <main className="max-w-7xl mx-auto p-6">
        
        {/* TAB: Trading en Vivo */}
        {activeTab === 'live' && (
          <div className="space-y-6">
            <SymbolSelector 
              symbols={symbols} 
              selected={selectedSymbol} 
              onSelect={setSelectedSymbol}
              dailyCounts={dailyCounts}
            />
            
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 space-y-4">
                {/* Gráfico */}
                <div className="relative">
                  {loading && (
                    <div className="absolute inset-0 bg-zinc-900/50 flex items-center justify-center z-10 rounded-xl">
                      <div className="text-zinc-400">Analizando...</div>
                    </div>
                  )}
                  <SMCChart 
                    candles={analysis?.candles?.m15 || []}
                    markers={analysis?.chartMarkers}
                    symbol={`${symbols[selectedSymbol]?.name || selectedSymbol} - M15`}
                  />
                </div>
                
                {/* Señal activa si existe */}
                {analysis?.hasSignal && (
                  <SignalCard signal={analysis} onClick={setSelectedSignal} />
                )}
              </div>
              
              <div className="space-y-4">
                <LiveAnalysisPanel analysis={analysis} />
                
                {/* Reglas */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <h3 className="font-bold text-white mb-3">📋 Reglas SMC</h3>
                  <div className="space-y-2 text-xs text-zinc-400">
                    <div className="flex items-center gap-2">
                      <span className={analysis?.choch ? 'text-emerald-400' : 'text-zinc-600'}>
                        {analysis?.choch ? '✓' : '○'}
                      </span>
                      CHoCH en M15 (obligatorio)
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={analysis?.inFibZone ? 'text-emerald-400' : 'text-zinc-600'}>
                        {analysis?.inFibZone ? '✓' : '○'}
                      </span>
                      Precio en zona 70.6% - 92.6%
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={analysis?.orderBlocks?.decisional ? 'text-emerald-400' : 'text-zinc-600'}>
                        {analysis?.orderBlocks?.decisional ? '✓' : '○'}
                      </span>
                      Order Block válido
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={analysis?.scoring?.score >= 70 ? 'text-emerald-400' : 'text-zinc-600'}>
                        {analysis?.scoring?.score >= 70 ? '✓' : '○'}
                      </span>
                      Score ≥ 70 (A o A+)
                    </div>
                  </div>
                </div>
                
                {/* Timeframes por índice */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <h3 className="font-bold text-white mb-3">⏱️ Timeframes</h3>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between text-zinc-400">
                      <span>HTF (Estructura)</span>
                      <span className="text-white">M15</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Ejecución Boom/Crash</span>
                      <span className="text-white">M5</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Ejecución Vol/Step</span>
                      <span className="text-white">M1</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Señales Activas */}
        {activeTab === 'signals' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">🎯 Señales Activas</h2>
            {signals.filter(s => s.hasSignal).length === 0 ? (
              <div className="text-center text-zinc-500 py-12">
                No hay señales activas en este momento
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {signals.filter(s => s.hasSignal).slice(0, 10).map(signal => (
                  <SignalCard 
                    key={signal.id} 
                    signal={signal} 
                    onClick={setSelectedSignal}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: Historial */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">📜 Historial de Señales</h2>
            <p className="text-sm text-zinc-400">Click en una señal para ver el gráfico y análisis completo</p>
            
            {signals.length === 0 ? (
              <div className="text-center text-zinc-500 py-12">
                No hay señales en el historial
              </div>
            ) : (
              <div className="space-y-2">
                {signals.map(signal => (
                  <div 
                    key={signal.id}
                    onClick={() => setSelectedSignal(signal)}
                    className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition hover:scale-[1.01] ${
                      signal.direction === 'BULLISH'
                        ? 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40'
                        : 'bg-red-500/5 border-red-500/20 hover:border-red-500/40'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">
                        {signal.direction === 'BULLISH' ? '🟢' : '🔴'}
                      </span>
                      <div>
                        <div className="font-bold text-white">{signal.symbolName}</div>
                        <div className="text-xs text-zinc-500">
                          {new Date(signal.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      {signal.levels && (
                        <div className="text-right text-xs">
                          <div className="text-zinc-500">Entry: <span className="text-blue-400">{signal.levels.entry}</span></div>
                          <div className="text-zinc-500">R:R: <span className="text-amber-400">{signal.levels.riskReward}</span></div>
                        </div>
                      )}
                      
                      <div className="text-right">
                        <div className={`font-bold ${
                          signal.direction === 'BULLISH' ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {signal.direction === 'BULLISH' ? 'COMPRA' : 'VENTA'}
                        </div>
                        <div className="text-xs text-amber-400">
                          {signal.scoring?.classification} ({signal.scoring?.score}/100)
                        </div>
                      </div>
                      
                      <div className="text-zinc-600">→</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal de detalle */}
      {selectedSignal && (
        <SignalDetailModal 
          signal={selectedSignal} 
          onClose={() => setSelectedSignal(null)} 
        />
      )}
    </div>
  );
}
