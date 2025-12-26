// =============================================
// TRADING MASTER PRO v9.1 - DASHBOARD
// Gráfico de Velas Japonesas Profesional
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// GRÁFICO DE VELAS JAPONESAS PROFESIONAL
// =============================================
const CandlestickChart = ({ candles = [], signal, height = 400, decimals = 2 }) => {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current || !candles.length) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    // Alta resolución
    const dpr = window.devicePixelRatio || 2;
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    
    const w = rect.width;
    const h = height;
    
    // Limpiar canvas
    ctx.clearRect(0, 0, w, h);
    
    // Fondo oscuro
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, w, h);
    
    const data = candles.slice(-60);
    if (!data.length) return;
    
    // Padding
    const padding = { top: 30, right: 80, bottom: 40, left: 15 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    
    // Calcular rango de precios con margen
    const allHighs = data.map(c => c.high);
    const allLows = data.map(c => c.low);
    let maxPrice = Math.max(...allHighs);
    let minPrice = Math.min(...allLows);
    
    // Agregar líneas de señal al rango si existen
    if (signal?.entry) maxPrice = Math.max(maxPrice, signal.entry, signal.stop || 0, signal.tp || 0);
    if (signal?.stop) minPrice = Math.min(minPrice, signal.stop);
    if (signal?.tp) maxPrice = Math.max(maxPrice, signal.tp);
    
    const priceMargin = (maxPrice - minPrice) * 0.1;
    maxPrice += priceMargin;
    minPrice -= priceMargin;
    const priceRange = maxPrice - minPrice || 1;
    
    // Funciones de conversión
    const priceToY = (price) => padding.top + ((maxPrice - price) / priceRange) * chartH;
    const candleWidth = Math.max(4, (chartW / data.length) * 0.65);
    const candleGap = (chartW / data.length) * 0.35;
    const indexToX = (i) => padding.left + i * (candleWidth + candleGap) + candleGap / 2;
    
    // ===== GRID =====
    ctx.strokeStyle = '#1f1f1f';
    ctx.lineWidth = 1;
    
    // Líneas horizontales y precios
    const priceSteps = 6;
    ctx.font = '11px monospace';
    ctx.fillStyle = '#555';
    ctx.textAlign = 'left';
    
    for (let i = 0; i <= priceSteps; i++) {
      const y = padding.top + (chartH / priceSteps) * i;
      const price = maxPrice - (priceRange / priceSteps) * i;
      
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      
      ctx.fillText(price.toFixed(decimals), w - padding.right + 8, y + 4);
    }
    
    // ===== ZONAS DE SEÑAL (fondo) =====
    if (signal?.entry && signal?.stop && signal.action && !['WAIT', 'LOADING'].includes(signal.action)) {
      const entryY = priceToY(signal.entry);
      const stopY = priceToY(signal.stop);
      
      // Zona de riesgo
      ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
      ctx.fillRect(padding.left, Math.min(entryY, stopY), chartW, Math.abs(stopY - entryY));
      
      // Zona de profit
      if (signal.tp) {
        const tpY = priceToY(signal.tp);
        ctx.fillStyle = 'rgba(34, 197, 94, 0.1)';
        ctx.fillRect(padding.left, Math.min(entryY, tpY), chartW, Math.abs(tpY - entryY));
      }
    }
    
    // ===== VELAS JAPONESAS =====
    data.forEach((candle, i) => {
      const x = indexToX(i);
      const centerX = x + candleWidth / 2;
      
      const isGreen = candle.close >= candle.open;
      const bodyColor = isGreen ? '#26a69a' : '#ef5350';
      const wickColor = isGreen ? '#26a69a' : '#ef5350';
      
      const openY = priceToY(candle.open);
      const closeY = priceToY(candle.close);
      const highY = priceToY(candle.high);
      const lowY = priceToY(candle.low);
      
      // MECHA (línea vertical completa)
      ctx.strokeStyle = wickColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX, highY);
      ctx.lineTo(centerX, lowY);
      ctx.stroke();
      
      // CUERPO DE LA VELA
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.abs(closeY - openY) || 2;
      
      // Relleno del cuerpo
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x, bodyTop, candleWidth, bodyHeight);
      
      // Si es vela hueca (algunas personas prefieren verde hueco)
      // ctx.strokeStyle = bodyColor;
      // ctx.lineWidth = 1.5;
      // ctx.strokeRect(x, bodyTop, candleWidth, bodyHeight);
    });
    
    // ===== LÍNEAS DE SEÑAL =====
    if (signal?.action && !['WAIT', 'LOADING'].includes(signal.action)) {
      
      const drawSignalLine = (price, color, label, dashed = false) => {
        if (!price || price < minPrice || price > maxPrice) return;
        
        const y = priceToY(price);
        
        // Línea
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        if (dashed) ctx.setLineDash([6, 4]);
        else ctx.setLineDash([]);
        
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Badge con precio
        const badgeW = 75;
        const badgeH = 22;
        const badgeX = w - padding.right - badgeW - 5;
        const badgeY = y - badgeH / 2;
        
        // Fondo del badge
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
        ctx.fill();
        
        // Texto del badge
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${label} ${price.toFixed(decimals)}`, badgeX + badgeW / 2, y + 4);
      };
      
      // Dibujar líneas
      drawSignalLine(signal.entry, '#2196f3', 'ENTRY', false);
      drawSignalLine(signal.stop, '#f44336', 'STOP', true);
      drawSignalLine(signal.tp, '#4caf50', 'TP', true);
    }
    
    // ===== PRECIO ACTUAL =====
    const lastCandle = data[data.length - 1];
    if (lastCandle) {
      const currentPrice = lastCandle.close;
      const y = priceToY(currentPrice);
      const isUp = lastCandle.close >= lastCandle.open;
      
      // Línea punteada del precio actual
      ctx.strokeStyle = isUp ? '#26a69a' : '#ef5350';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Badge precio actual
      const priceText = currentPrice.toFixed(decimals);
      ctx.fillStyle = isUp ? '#26a69a' : '#ef5350';
      ctx.fillRect(w - padding.right + 2, y - 11, padding.right - 4, 22);
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(priceText, w - padding.right / 2 + 1, y + 4);
    }
    
  }, [candles, signal, height, decimals]);
  
  return (
    <canvas 
      ref={canvasRef} 
      style={{ width: '100%', height: `${height}px`, borderRadius: '12px' }}
    />
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
      className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
        selected 
          ? 'border-blue-500 bg-blue-500/10' 
          : hasSignal
            ? sig.action === 'LONG' 
              ? 'border-green-500/50 bg-green-900/20 hover:bg-green-900/30'
              : 'border-red-500/50 bg-red-900/20 hover:bg-red-900/30'
            : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{asset.emoji}</span>
          <span className="font-semibold text-white">{asset.name}</span>
        </div>
        {hasSignal && (
          <span className={`px-2 py-1 rounded text-xs font-bold text-white ${
            sig.action === 'LONG' ? 'bg-green-600' : 'bg-red-600'
          }`}>
            {sig.action}
          </span>
        )}
      </div>
      
      <div className="flex items-center justify-between text-sm">
        <span className="text-white font-mono text-lg">
          {asset.price?.toFixed(asset.decimals) || '---'}
        </span>
        {sig?.score > 0 && (
          <span className={`font-bold ${
            sig.score >= 70 ? 'text-green-400' : sig.score >= 50 ? 'text-yellow-400' : 'text-zinc-500'
          }`}>
            {sig.score}%
          </span>
        )}
      </div>
      
      {/* Entry/SL/TP en tarjeta */}
      {hasSignal && sig.entry && (
        <div className="mt-3 pt-3 border-t border-zinc-700/50 grid grid-cols-3 gap-2 text-xs">
          <div className="text-center">
            <p className="text-blue-400 font-semibold">Entry</p>
            <p className="text-white font-mono">{sig.entry}</p>
          </div>
          <div className="text-center">
            <p className="text-red-400 font-semibold">SL</p>
            <p className="text-white font-mono">{sig.stop}</p>
          </div>
          <div className="text-center">
            <p className="text-green-400 font-semibold">TP</p>
            <p className="text-white font-mono">{sig.tp}</p>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================
// PANEL DE SEÑAL DETALLADO
// =============================================
const SignalPanel = ({ asset }) => {
  const sig = asset?.signal;
  if (!sig) return null;
  
  const hasSignal = sig.action && !['WAIT', 'LOADING'].includes(sig.action);
  
  return (
    <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            {asset.emoji} {asset.name}
          </h3>
          <p className="text-zinc-500 text-sm">{asset.type}</p>
        </div>
        <div className={`px-4 py-2 rounded-lg font-bold text-lg ${
          sig.action === 'LONG' ? 'bg-green-600 text-white' :
          sig.action === 'SHORT' ? 'bg-red-600 text-white' :
          'bg-zinc-800 text-zinc-400'
        }`}>
          {sig.action || 'WAIT'}
        </div>
      </div>
      
      {/* Score */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-zinc-400">Score SMC</span>
          <span className={`font-bold ${
            sig.score >= 70 ? 'text-green-400' : sig.score >= 50 ? 'text-yellow-400' : 'text-red-400'
          }`}>{sig.score || 0}/100</span>
        </div>
        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${
              sig.score >= 70 ? 'bg-gradient-to-r from-green-600 to-green-400' : 
              sig.score >= 50 ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' : 
              'bg-gradient-to-r from-red-600 to-red-400'
            }`}
            style={{ width: `${sig.score || 0}%` }}
          />
        </div>
      </div>
      
      {/* Entry/SL/TP Grande */}
      {hasSignal && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-blue-500/10 border border-blue-500/40 rounded-xl p-3 text-center">
            <p className="text-blue-400 text-xs font-semibold mb-1">📍 ENTRY</p>
            <p className="text-white font-bold text-lg font-mono">{sig.entry}</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-3 text-center">
            <p className="text-red-400 text-xs font-semibold mb-1">🛑 STOP</p>
            <p className="text-white font-bold text-lg font-mono">{sig.stop}</p>
          </div>
          <div className="bg-green-500/10 border border-green-500/40 rounded-xl p-3 text-center">
            <p className="text-green-400 text-xs font-semibold mb-1">🎯 TP</p>
            <p className="text-white font-bold text-lg font-mono">{sig.tp}</p>
          </div>
        </div>
      )}
      
      {/* Modelo */}
      <div className="mb-4">
        <span className={`inline-block px-3 py-1.5 rounded-lg text-sm font-semibold ${
          sig.model === 'REVERSAL' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
          sig.model === 'CONTINUATION' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
          'bg-zinc-800 text-zinc-400'
        }`}>
          {sig.model || 'NO SETUP'}
        </span>
      </div>
      
      {/* Análisis SMC */}
      {sig.analysis && (
        <div className="space-y-2 text-sm border-t border-zinc-800 pt-4">
          <p className="text-zinc-500 font-semibold mb-2">📊 Análisis SMC</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex justify-between">
              <span className="text-zinc-500">EQH</span>
              <span className="text-white font-mono">{sig.analysis.eqh}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">EQL</span>
              <span className="text-white font-mono">{sig.analysis.eql}</span>
            </div>
          </div>
          {sig.analysis.sweep && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Sweep</span>
              <span className="text-yellow-400">{sig.analysis.sweep}</span>
            </div>
          )}
          {sig.analysis.displacement && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Displacement</span>
              <span className="text-cyan-400">{sig.analysis.displacement}</span>
            </div>
          )}
          {sig.analysis.ob && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Order Block</span>
              <span className="text-purple-400">{sig.analysis.ob}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-zinc-500">Estructura</span>
            <span className="text-white">{sig.analysis.structure}</span>
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
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-zinc-700">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900">
          <h2 className="text-xl font-bold text-white">🧠 Coach de Trading SMC</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl">×</button>
        </div>
        
        <div className="p-6 space-y-6">
          {categories.map(cat => (
            <div key={cat}>
              <h3 className="text-sm font-bold text-zinc-400 mb-3 uppercase tracking-wide">{cat}</h3>
              <div className="space-y-2">
                {checklist.filter(c => c.category === cat).map(item => (
                  <label key={item.id} className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                    <input 
                      type="checkbox"
                      checked={answers[item.id] || false}
                      onChange={(e) => setAnswers({ ...answers, [item.id]: e.target.checked })}
                      className="w-5 h-5 rounded accent-green-500"
                    />
                    <span className="text-white text-sm flex-1">{item.question}</span>
                    {item.required && <span className="text-red-400 text-xs">*</span>}
                  </label>
                ))}
              </div>
            </div>
          ))}
          
          <button
            onClick={evaluate}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
          >
            EVALUAR CHECKLIST
          </button>
          
          {result && (
            <div className={`p-5 rounded-xl text-center ${
              result.canTrade 
                ? 'bg-green-500/20 border-2 border-green-500' 
                : 'bg-red-500/20 border-2 border-red-500'
            }`}>
              <p className="text-4xl font-bold mb-2">{result.score}%</p>
              <p className={`font-semibold ${result.canTrade ? 'text-green-400' : 'text-red-400'}`}>
                {result.canTrade ? '✅ PUEDES OPERAR' : '❌ NO OPERAR'}
              </p>
              {result.requiredFailed?.length > 0 && (
                <p className="text-red-300 text-sm mt-2">
                  Falta: {result.requiredFailed.slice(0, 2).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// =============================================
// OPERACIONES ACTIVAS
// =============================================
const ActiveOperations = ({ operations, onUpdate }) => {
  if (!operations?.length) return null;
  
  const activeOps = operations.filter(o => o.status === 'OPEN');
  if (!activeOps.length) return null;
  
  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
      <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
        📋 Operaciones Activas <span className="text-xs bg-blue-600 px-2 py-0.5 rounded-full">{activeOps.length}</span>
      </h3>
      <div className="space-y-2">
        {activeOps.map(op => (
          <div key={op.id} className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-white">{op.assetName}</span>
              <span className={`px-2 py-1 rounded text-xs font-bold text-white ${
                op.action === 'LONG' ? 'bg-green-600' : 'bg-red-600'
              }`}>
                {op.action}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs mb-2">
              <div><span className="text-zinc-500">Entry:</span><br/><span className="text-white">{op.entry}</span></div>
              <div><span className="text-zinc-500">SL:</span><br/><span className="text-red-400">{op.stop}</span></div>
              <div><span className="text-zinc-500">TP:</span><br/><span className="text-green-400">{op.tp}</span></div>
              <div><span className="text-zinc-500">PnL:</span><br/><span className={parseFloat(op.pnl) >= 0 ? 'text-green-400' : 'text-red-400'}>{op.pnl}%</span></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onUpdate(op.id, 'TP')} className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded">
                ✅ TP HIT
              </button>
              <button onClick={() => onUpdate(op.id, 'SL')} className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded">
                ❌ SL HIT
              </button>
            </div>
          </div>
        ))}
      </div>
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
          <div key={i} className="flex items-center justify-between p-2 bg-zinc-800/50 rounded-lg">
            <div className="flex items-center gap-2">
              <span>{s.emoji}</span>
              <span className="text-white text-sm">{s.assetName}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                s.action === 'LONG' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
              }`}>{s.action}</span>
              <span className="text-zinc-400 text-xs">{s.score}%</span>
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
          <div className="w-20 h-20 border-4 border-zinc-700 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-400 text-lg">Conectando...</p>
          <p className="text-zinc-600 text-sm mt-2">Trading Master Pro v9.1</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">
              Trading<span className="text-green-500">Pro</span>
            </h1>
            <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full font-semibold">v9.1</span>
            <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full">SMC</span>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowCoach(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              🧠 Coach
            </button>
            <div className={`flex items-center gap-2 ${data.connected ? 'text-green-400' : 'text-red-400'}`}>
              <span className={`w-3 h-3 rounded-full ${data.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-sm font-medium">{data.connected ? 'Conectado' : 'Desconectado'}</span>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main */}
      <main className="p-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Lista de Activos */}
          <div className="col-span-12 lg:col-span-3 space-y-3">
            <h2 className="text-lg font-semibold text-zinc-300 mb-2">📊 Activos</h2>
            {data.assets?.map(asset => (
              <AssetCard 
                key={asset.symbol}
                asset={asset}
                selected={selected?.symbol === asset.symbol}
                onClick={setSelected}
              />
            ))}
          </div>
          
          {/* Gráfico Central */}
          <div className="col-span-12 lg:col-span-6 space-y-4">
            {selected && (
              <>
                <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{selected.emoji}</span>
                      <div>
                        <h2 className="text-lg font-bold">{selected.name}</h2>
                        <p className="text-zinc-500 text-sm">{selected.type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold font-mono text-white">
                        {selected.price?.toFixed(selected.decimals)}
                      </p>
                    </div>
                  </div>
                  
                  <CandlestickChart 
                    candles={detail?.candles || []}
                    signal={detail?.signal}
                    height={400}
                    decimals={selected.decimals}
                  />
                </div>
                
                {/* Botón Operar */}
                {selected.signal?.action && !['WAIT','LOADING'].includes(selected.signal.action) && (
                  <button 
                    onClick={openOperation}
                    className={`w-full py-4 rounded-xl font-bold text-lg text-white transition-all ${
                      selected.signal.action === 'LONG' 
                        ? 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600' 
                        : 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600'
                    }`}
                  >
                    {selected.signal.action === 'LONG' ? '🚀' : '📉'} ABRIR {selected.signal.action} @ {selected.signal.entry}
                  </button>
                )}
              </>
            )}
          </div>
          
          {/* Panel Derecho */}
          <div className="col-span-12 lg:col-span-3 space-y-4">
            <SignalPanel asset={selected} />
            <ActiveOperations operations={operations} onUpdate={updateOperation} />
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
