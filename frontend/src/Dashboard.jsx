// =============================================
// TRADING MASTER PRO v9.0 - DASHBOARD COMPLETO
// Coach, Seguimiento, Plan de Trading, Chat
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// GRÁFICO DE VELAS PROFESIONAL
// =============================================
const CandleChart = ({ candles = [], signal, height = 350, decimals = 2 }) => {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current || !candles.length) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * 2;
    canvas.height = height * 2;
    ctx.scale(2, 2);
    
    const w = rect.width;
    const h = height;
    
    // Fondo gradiente
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#0f0f0f');
    gradient.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    
    const data = candles.slice(-50);
    if (!data.length) return;
    
    const padding = { top: 20, right: 70, bottom: 30, left: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    
    const highs = data.map(c => c.high);
    const lows = data.map(c => c.low);
    const maxP = Math.max(...highs);
    const minP = Math.min(...lows);
    const range = maxP - minP || 1;
    
    const candleW = chartW / data.length * 0.7;
    const gap = chartW / data.length * 0.3;
    
    const priceToY = (p) => padding.top + (1 - (p - minP) / range) * chartH;
    const indexToX = (i) => padding.left + i * (candleW + gap) + gap / 2;
    
    // Grid horizontal
    ctx.strokeStyle = '#262626';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      
      // Precio en eje Y
      const price = maxP - (range / 5) * i;
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(price.toFixed(decimals), w - padding.right + 5, y + 3);
    }
    
    // Dibujar zona de OB si hay señal
    if (signal?.entry && signal?.stop && signal.action !== 'WAIT') {
      const obColor = signal.action === 'LONG' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
      const obY1 = priceToY(Math.max(signal.entry, signal.stop));
      const obY2 = priceToY(Math.min(signal.entry, signal.stop));
      
      ctx.fillStyle = obColor;
      ctx.fillRect(padding.left, obY1, chartW, obY2 - obY1);
    }
    
    // Dibujar velas
    data.forEach((c, i) => {
      const x = indexToX(i);
      const isGreen = c.close >= c.open;
      const color = isGreen ? '#22c55e' : '#ef4444';
      
      // Mecha
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + candleW / 2, priceToY(c.high));
      ctx.lineTo(x + candleW / 2, priceToY(c.low));
      ctx.stroke();
      
      // Cuerpo
      ctx.fillStyle = color;
      const bodyTop = priceToY(Math.max(c.open, c.close));
      const bodyH = Math.abs(priceToY(c.open) - priceToY(c.close)) || 1;
      ctx.fillRect(x, bodyTop, candleW, bodyH);
    });
    
    // Líneas de señal
    if (signal?.action && signal.action !== 'WAIT' && signal.action !== 'LOADING') {
      const drawPriceLine = (price, color, label, dash = false) => {
        if (!price) return;
        const y = priceToY(price);
        if (y < padding.top || y > h - padding.bottom) return;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        if (dash) ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Badge
        ctx.fillStyle = color;
        ctx.fillRect(w - padding.right - 50, y - 10, 55, 20);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${label}`, w - padding.right - 22, y + 4);
      };
      
      drawPriceLine(signal.entry, '#3b82f6', 'ENTRY');
      drawPriceLine(signal.stop, '#ef4444', 'SL', true);
      drawPriceLine(signal.tp, '#22c55e', 'TP', true);
    }
    
    // Precio actual
    const lastPrice = data[data.length - 1]?.close;
    if (lastPrice) {
      const y = priceToY(lastPrice);
      ctx.fillStyle = '#fff';
      ctx.fillRect(w - padding.right, y - 10, 65, 20);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(lastPrice.toFixed(decimals), w - padding.right + 32, y + 4);
    }
    
  }, [candles, signal, height, decimals]);
  
  return (
    <canvas 
      ref={canvasRef} 
      style={{ width: '100%', height }}
      className="rounded-xl"
    />
  );
};

// =============================================
// TARJETA DE ACTIVO
// =============================================
const AssetCard = ({ asset, selected, onClick }) => {
  const sig = asset.signal;
  const hasSignal = sig?.action && !['WAIT', 'LOADING'].includes(sig.action);
  
  const bgColor = hasSignal 
    ? (sig.action === 'LONG' ? 'bg-green-900/30 border-green-500/50' : 'bg-red-900/30 border-red-500/50')
    : 'bg-zinc-900/50 border-zinc-800';
  
  return (
    <div 
      onClick={() => onClick(asset)}
      className={`p-4 rounded-xl border cursor-pointer transition-all ${bgColor} ${selected ? 'ring-2 ring-blue-500' : 'hover:border-zinc-600'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{asset.emoji}</span>
          <span className="font-semibold text-white">{asset.name}</span>
        </div>
        {hasSignal && (
          <span className={`px-2 py-1 rounded text-xs font-bold ${sig.action === 'LONG' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
            {sig.action}
          </span>
        )}
      </div>
      
      <div className="flex items-center justify-between text-sm">
        <span className="text-white font-mono">{asset.price?.toFixed(asset.decimals) || '---'}</span>
        <div className="flex items-center gap-2">
          {sig?.score > 0 && (
            <span className={`font-medium ${sig.score >= 70 ? 'text-green-400' : 'text-zinc-500'}`}>
              {sig.score}%
            </span>
          )}
        </div>
      </div>
      
      {hasSignal && sig.entry && (
        <div className="mt-3 pt-3 border-t border-zinc-700/50 grid grid-cols-3 gap-2 text-xs">
          <div className="text-center">
            <p className="text-zinc-500">Entry</p>
            <p className="text-blue-400 font-mono">{sig.entry}</p>
          </div>
          <div className="text-center">
            <p className="text-zinc-500">SL</p>
            <p className="text-red-400 font-mono">{sig.stop}</p>
          </div>
          <div className="text-center">
            <p className="text-zinc-500">TP</p>
            <p className="text-green-400 font-mono">{sig.tp}</p>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================
// PANEL DE SEÑAL
// =============================================
const SignalPanel = ({ asset }) => {
  const sig = asset?.signal;
  if (!sig) return null;
  
  const hasSignal = sig.action && !['WAIT', 'LOADING'].includes(sig.action);
  
  return (
    <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            {asset.emoji} {asset.name}
          </h3>
          <p className="text-zinc-500 text-sm">{asset.symbol} • {asset.type}</p>
        </div>
        <div className={`px-4 py-2 rounded-lg font-bold ${
          sig.action === 'LONG' ? 'bg-green-500/20 text-green-400' :
          sig.action === 'SHORT' ? 'bg-red-500/20 text-red-400' :
          'bg-zinc-800 text-zinc-400'
        }`}>
          {sig.action || 'WAIT'}
        </div>
      </div>
      
      {/* Score Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-zinc-400">Score SMC</span>
          <span className="text-white font-bold">{sig.score || 0}/100</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full ${sig.score >= 70 ? 'bg-green-500' : sig.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${sig.score || 0}%` }}
          />
        </div>
        <p className="text-xs text-zinc-500 mt-1">Confianza: {sig.confidence || 'BAJA'}</p>
      </div>
      
      {/* Entry/SL/TP */}
      {hasSignal && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-center">
            <p className="text-blue-400 text-xs mb-1">📍 Entry</p>
            <p className="text-white font-bold font-mono">{sig.entry}</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
            <p className="text-red-400 text-xs mb-1">🛑 Stop Loss</p>
            <p className="text-white font-bold font-mono">{sig.stop}</p>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
            <p className="text-green-400 text-xs mb-1">🎯 Take Profit</p>
            <p className="text-white font-bold font-mono">{sig.tp}</p>
          </div>
        </div>
      )}
      
      {/* Modelo */}
      <div className="mb-4">
        <span className={`inline-block px-3 py-1 rounded-lg text-sm ${
          sig.model === 'REVERSAL' ? 'bg-purple-500/20 text-purple-400' :
          sig.model === 'CONTINUATION' ? 'bg-blue-500/20 text-blue-400' :
          'bg-zinc-800 text-zinc-400'
        }`}>
          {sig.model?.replace('_', ' ') || 'NO SETUP'}
        </span>
      </div>
      
      {/* Análisis SMC */}
      {sig.analysis && (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-zinc-500">EQH</span><span className="text-white">{sig.analysis.eqh}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">EQL</span><span className="text-white">{sig.analysis.eql}</span></div>
          {sig.analysis.sweep && <div className="flex justify-between"><span className="text-zinc-500">Sweep</span><span className="text-yellow-400">{sig.analysis.sweep}</span></div>}
          {sig.analysis.displacement && <div className="flex justify-between"><span className="text-zinc-500">Displacement</span><span className="text-blue-400">{sig.analysis.displacement}</span></div>}
          {sig.analysis.ob && <div className="flex justify-between"><span className="text-zinc-500">Order Block</span><span className="text-purple-400">{sig.analysis.ob}</span></div>}
          <div className="flex justify-between"><span className="text-zinc-500">Estructura</span><span className="text-white">{sig.analysis.structure}</span></div>
        </div>
      )}
      
      {/* Breakdown */}
      {sig.breakdown?.length > 0 && (
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <p className="text-zinc-500 text-xs mb-2">Breakdown:</p>
          <div className="flex flex-wrap gap-1">
            {sig.breakdown.map((b, i) => (
              <span key={i} className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-300">{b}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================
// COACH DE TRADING
// =============================================
const TradingCoach = ({ onClose }) => {
  const [checklist, setChecklist] = useState([]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  
  useEffect(() => {
    fetch(`${API_URL}/api/coach/checklist`)
      .then(r => r.json())
      .then(d => setChecklist(d.checklist || []))
      .catch(() => {});
  }, []);
  
  const evaluate = async () => {
    try {
      const res = await fetch(`${API_URL}/api/coach/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers })
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {}
  };
  
  const categories = [...new Set(checklist.map(c => c.category))];
  
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">🧠 Coach de Trading</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">✕</button>
        </div>
        
        <div className="p-6 space-y-6">
          {categories.map(cat => (
            <div key={cat}>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">{cat}</h3>
              <div className="space-y-2">
                {checklist.filter(c => c.category === cat).map(item => (
                  <label key={item.id} className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800">
                    <input 
                      type="checkbox"
                      checked={answers[item.id] || false}
                      onChange={(e) => setAnswers({ ...answers, [item.id]: e.target.checked })}
                      className="w-5 h-5 rounded"
                    />
                    <span className="text-white text-sm">{item.question}</span>
                    {item.required && <span className="text-red-400 text-xs">*</span>}
                  </label>
                ))}
              </div>
            </div>
          ))}
          
          <button
            onClick={evaluate}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
          >
            Evaluar
          </button>
          
          {result && (
            <div className={`p-4 rounded-lg ${result.canTrade ? 'bg-green-500/20 border border-green-500/50' : 'bg-red-500/20 border border-red-500/50'}`}>
              <p className="text-2xl font-bold text-center mb-2">{result.score}%</p>
              <p className={`text-center ${result.canTrade ? 'text-green-400' : 'text-red-400'}`}>
                {result.recommendation}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// =============================================
// SEGUIMIENTO DE OPERACIÓN
// =============================================
const OperationTracker = ({ operations, onUpdate }) => {
  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
      <h3 className="text-white font-semibold mb-3">📋 Operaciones Activas</h3>
      
      {operations.length === 0 ? (
        <p className="text-zinc-500 text-sm">Sin operaciones activas</p>
      ) : (
        <div className="space-y-2">
          {operations.filter(o => o.status === 'OPEN').map(op => (
            <div key={op.id} className="p-3 bg-zinc-800/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-white">{op.assetName}</span>
                <span className={`px-2 py-1 rounded text-xs font-bold ${op.action === 'LONG' ? 'bg-green-500' : 'bg-red-500'}`}>
                  {op.action}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                <div><span className="text-zinc-500">Entry:</span> <span className="text-white">{op.entry}</span></div>
                <div><span className="text-zinc-500">SL:</span> <span className="text-red-400">{op.stop}</span></div>
                <div><span className="text-zinc-500">TP:</span> <span className="text-green-400">{op.tp}</span></div>
              </div>
              <div className="flex items-center justify-between">
                <span className={`font-bold ${parseFloat(op.pnl) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {op.pnl}%
                </span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => onUpdate(op.id, 'TP')}
                    className="px-2 py-1 bg-green-600 text-white text-xs rounded"
                  >TP Hit</button>
                  <button 
                    onClick={() => onUpdate(op.id, 'SL')}
                    className="px-2 py-1 bg-red-600 text-white text-xs rounded"
                  >SL Hit</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================
// SEÑALES RECIENTES
// =============================================
const RecentSignals = ({ signals }) => (
  <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
    <h3 className="text-white font-semibold mb-3">📡 Señales Recientes</h3>
    {!signals?.length ? (
      <p className="text-zinc-500 text-sm">Sin señales</p>
    ) : (
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {signals.slice(0, 8).map((s, i) => (
          <div key={i} className="flex items-center justify-between p-2 bg-zinc-800/50 rounded">
            <div className="flex items-center gap-2">
              <span>{s.emoji}</span>
              <span className="text-white text-sm">{s.assetName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold ${s.action === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>{s.action}</span>
              <span className="text-zinc-500 text-xs">{s.score}%</span>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// =============================================
// DASHBOARD PRINCIPAL
// =============================================
const Dashboard = () => {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [operations, setOperations] = useState([]);
  const [showCoach, setShowCoach] = useState(false);
  const [tab, setTab] = useState('trading'); // trading, coach, plan
  
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/dashboard`);
      const json = await res.json();
      setData(json);
      setOperations(json.activeOperations || []);
      
      if (!selected && json.assets?.length) {
        const withSignal = json.assets.find(a => a.signal?.action && !['WAIT','LOADING'].includes(a.signal.action));
        setSelected(withSignal || json.assets[0]);
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
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);
  
  useEffect(() => {
    if (selected?.symbol) fetchDetail(selected.symbol);
  }, [selected, fetchDetail]);
  
  const openOperation = async () => {
    if (!selected?.signal || selected.signal.action === 'WAIT') return;
    const sig = selected.signal;
    
    try {
      await fetch(`${API_URL}/api/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selected.symbol,
          action: sig.action,
          entry: sig.entry,
          stop: sig.stop,
          tp: sig.tp
        })
      });
      fetchData();
    } catch (err) {}
  };
  
  const updateOperation = async (id, result) => {
    try {
      await fetch(`${API_URL}/api/operations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED', result })
      });
      fetchData();
    } catch (err) {}
  };
  
  if (!data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-zinc-700 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-400">Conectando a Trading Master Pro...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Trading<span className="text-green-500">Pro</span></h1>
            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">v9.0</span>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowCoach(true)}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg"
            >
              🧠 Coach
            </button>
            <div className={`flex items-center gap-2 ${data.connected ? 'text-green-400' : 'text-red-400'}`}>
              <span className={`w-2 h-2 rounded-full ${data.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-sm">{data.connected ? 'Conectado' : 'Desconectado'}</span>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main */}
      <main className="p-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Activos */}
          <div className="col-span-12 lg:col-span-3 space-y-3">
            <h2 className="text-lg font-semibold text-zinc-300">Activos</h2>
            {data.assets?.map(asset => (
              <AssetCard 
                key={asset.symbol}
                asset={asset}
                selected={selected?.symbol === asset.symbol}
                onClick={setSelected}
              />
            ))}
          </div>
          
          {/* Gráfico */}
          <div className="col-span-12 lg:col-span-6 space-y-4">
            {selected && (
              <>
                <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      {selected.emoji} {selected.name}
                    </h2>
                    <span className="text-xl font-mono text-white">{selected.price?.toFixed(selected.decimals)}</span>
                  </div>
                  <CandleChart 
                    candles={detail?.candles || []}
                    signal={detail?.signal}
                    height={350}
                    decimals={selected.decimals}
                  />
                </div>
                
                {/* Botón abrir operación */}
                {selected.signal?.action && !['WAIT','LOADING'].includes(selected.signal.action) && (
                  <button 
                    onClick={openOperation}
                    className={`w-full py-3 rounded-xl font-bold text-white ${
                      selected.signal.action === 'LONG' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    Abrir {selected.signal.action} @ {selected.signal.entry}
                  </button>
                )}
              </>
            )}
          </div>
          
          {/* Panel derecho */}
          <div className="col-span-12 lg:col-span-3 space-y-4">
            <SignalPanel asset={selected} />
            <OperationTracker operations={operations} onUpdate={updateOperation} />
            <RecentSignals signals={data.recentSignals} />
          </div>
        </div>
      </main>
      
      {/* Coach Modal */}
      {showCoach && <TradingCoach onClose={() => setShowCoach(false)} />}
    </div>
  );
};

export default Dashboard;
