// =============================================
// TRADING MASTER PRO - DASHBOARD v8.0
// SMC INSTITUCIONAL
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// COMPONENTE: Gráfico de Velas con Zonas SMC
// =============================================
const CandleChart = ({ candles, signal, height = 300 }) => {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current || !candles || candles.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * 2;
    canvas.height = height * 2;
    ctx.scale(2, 2);
    
    const width = rect.width;
    const h = height;
    
    // Fondo
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, h);
    
    // Calcular rangos
    const data = candles.slice(-50);
    const highs = data.map(c => c.high);
    const lows = data.map(c => c.low);
    const maxPrice = Math.max(...highs);
    const minPrice = Math.min(...lows);
    const priceRange = maxPrice - minPrice || 1;
    
    const padding = 10;
    const chartWidth = width - padding * 2;
    const chartHeight = h - padding * 2;
    const candleWidth = chartWidth / data.length * 0.7;
    const gap = chartWidth / data.length * 0.3;
    
    const priceToY = (price) => padding + (1 - (price - minPrice) / priceRange) * chartHeight;
    
    // Dibujar grid
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }
    
    // Dibujar zona de OB si existe
    if (signal?.entryZone) {
      const obTop = priceToY(signal.entryZone.high);
      const obBottom = priceToY(signal.entryZone.low);
      const obColor = signal.action === 'LONG' || signal.action === 'BUY' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)';
      const obBorder = signal.action === 'LONG' || signal.action === 'BUY' ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)';
      
      ctx.fillStyle = obColor;
      ctx.fillRect(padding, obTop, chartWidth, obBottom - obTop);
      ctx.strokeStyle = obBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(padding, obTop, chartWidth, obBottom - obTop);
      
      // Label OB
      ctx.fillStyle = obBorder;
      ctx.font = '10px Arial';
      ctx.fillText('OB', padding + 5, obTop + 12);
    }
    
    // Dibujar velas
    data.forEach((candle, i) => {
      const x = padding + i * (candleWidth + gap) + gap / 2;
      const isGreen = candle.close >= candle.open;
      
      const openY = priceToY(candle.open);
      const closeY = priceToY(candle.close);
      const highY = priceToY(candle.high);
      const lowY = priceToY(candle.low);
      
      // Mecha
      ctx.strokeStyle = isGreen ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + candleWidth / 2, highY);
      ctx.lineTo(x + candleWidth / 2, lowY);
      ctx.stroke();
      
      // Cuerpo
      ctx.fillStyle = isGreen ? '#22c55e' : '#ef4444';
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.abs(closeY - openY) || 1;
      ctx.fillRect(x, bodyTop, candleWidth, bodyHeight);
    });
    
    // Dibujar líneas de Entry, Stop, TP
    if (signal && signal.action !== 'WAIT') {
      const drawLine = (price, color, label) => {
        if (!price || typeof price !== 'number') return;
        const y = priceToY(price);
        if (y < 0 || y > h) return;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = color;
        ctx.font = 'bold 10px Arial';
        ctx.fillText(`${label}: ${price.toFixed(2)}`, width - 80, y - 3);
      };
      
      if (signal.entry) drawLine(signal.entry, '#3b82f6', 'Entry');
      if (signal.stop) drawLine(signal.stop, '#ef4444', 'SL');
      if (signal.tp1 && typeof signal.tp1 === 'number') drawLine(signal.tp1, '#22c55e', 'TP');
    }
    
    // Precio actual
    const lastCandle = data[data.length - 1];
    if (lastCandle) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Arial';
      ctx.fillText(lastCandle.close.toFixed(2), width - 60, priceToY(lastCandle.close) + 4);
    }
    
  }, [candles, signal, height]);
  
  return (
    <canvas 
      ref={canvasRef} 
      style={{ width: '100%', height: `${height}px` }}
      className="rounded-lg"
    />
  );
};

// =============================================
// COMPONENTE: Tarjeta de Activo
// =============================================
const AssetCard = ({ asset, onSelect, isSelected }) => {
  const getActionColor = (action) => {
    if (action === 'LONG' || action === 'BUY') return 'text-green-500';
    if (action === 'SHORT' || action === 'SELL') return 'text-red-500';
    return 'text-zinc-500';
  };
  
  const getActionBg = (action) => {
    if (action === 'LONG' || action === 'BUY') return 'bg-green-500/20 border-green-500/50';
    if (action === 'SHORT' || action === 'SELL') return 'bg-red-500/20 border-red-500/50';
    return 'bg-zinc-800/50 border-zinc-700';
  };
  
  const getScoreColor = (score) => {
    if (score >= 85) return 'text-green-400';
    if (score >= 70) return 'text-yellow-400';
    return 'text-zinc-500';
  };

  const analysis = asset.analysis || {};
  const hasSignal = analysis.action && analysis.action !== 'WAIT';
  
  return (
    <div 
      onClick={() => onSelect(asset)}
      className={`
        p-4 rounded-xl border cursor-pointer transition-all duration-200
        ${isSelected ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'}
        ${hasSignal ? getActionBg(analysis.action) : ''}
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{asset.type === 'synthetic' ? '📊' : asset.type === 'commodity' ? '🥇' : '💱'}</span>
          <span className="font-semibold text-white">{asset.name}</span>
        </div>
        {hasSignal && (
          <span className={`px-2 py-1 rounded text-xs font-bold ${getActionColor(analysis.action)}`}>
            {analysis.action}
          </span>
        )}
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-zinc-400 text-sm">
          {asset.price?.toFixed(asset.type === 'forex' ? 5 : 2) || 'Cargando...'}
        </span>
        <div className="flex items-center gap-2">
          {analysis.score > 0 && (
            <span className={`text-sm font-medium ${getScoreColor(analysis.score)}`}>
              {analysis.score}%
            </span>
          )}
          <span className="text-xs text-zinc-600">
            {asset.signalsToday || 0}/día
          </span>
        </div>
      </div>
      
      {hasSignal && analysis.model && (
        <div className="mt-2 pt-2 border-t border-zinc-800">
          <span className="text-xs text-zinc-500">
            {analysis.model.replace('_', ' ')}
          </span>
        </div>
      )}
    </div>
  );
};

// =============================================
// COMPONENTE: Panel de Señal Detallada
// =============================================
const SignalPanel = ({ asset, signal }) => {
  if (!signal) return null;
  
  const isActive = signal.action && signal.action !== 'WAIT';
  
  const ScoreBar = ({ score }) => (
    <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
      <div 
        className={`h-full rounded-full transition-all duration-500 ${
          score >= 85 ? 'bg-green-500' : score >= 70 ? 'bg-yellow-500' : score >= 50 ? 'bg-orange-500' : 'bg-red-500'
        }`}
        style={{ width: `${Math.min(score, 100)}%` }}
      />
    </div>
  );
  
  return (
    <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">{asset.name}</h2>
          <p className="text-zinc-500 text-sm">{asset.symbol} • {asset.type}</p>
        </div>
        <div className={`
          px-4 py-2 rounded-lg font-bold text-lg
          ${signal.action === 'LONG' ? 'bg-green-500/20 text-green-400' : 
            signal.action === 'SHORT' ? 'bg-red-500/20 text-red-400' : 
            'bg-zinc-800 text-zinc-400'}
        `}>
          {signal.action || 'WAIT'}
        </div>
      </div>
      
      {/* Score */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-zinc-400">Score</span>
          <span className="text-white font-bold">{signal.score || 0}/100</span>
        </div>
        <ScoreBar score={signal.score || 0} />
        {signal.confidence && (
          <p className="text-xs text-zinc-500 mt-1">Confianza: {signal.confidence}</p>
        )}
      </div>
      
      {/* Breakdown */}
      {signal.breakdown && signal.breakdown.length > 0 && (
        <div className="mb-6">
          <h4 className="text-zinc-400 text-sm mb-2">Breakdown</h4>
          <div className="flex flex-wrap gap-2">
            {signal.breakdown.map((item, i) => (
              <span key={i} className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-300">
                {item}
              </span>
            ))}
          </div>
        </div>
      )}
      
      {/* Entry Details */}
      {isActive && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
            <p className="text-zinc-500 text-xs mb-1">Entry</p>
            <p className="text-blue-400 font-bold">{signal.entry?.toFixed(2) || '-'}</p>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
            <p className="text-zinc-500 text-xs mb-1">Stop Loss</p>
            <p className="text-red-400 font-bold">{signal.stop?.toFixed(2) || '-'}</p>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
            <p className="text-zinc-500 text-xs mb-1">Take Profit</p>
            <p className="text-green-400 font-bold">
              {typeof signal.tp1 === 'number' ? signal.tp1.toFixed(2) : signal.tp1 || '-'}
            </p>
          </div>
        </div>
      )}
      
      {/* Risk/Reward */}
      {signal.riskReward && (
        <div className="bg-zinc-800/30 rounded-lg p-3 mb-6">
          <p className="text-zinc-500 text-xs mb-1">Risk : Reward</p>
          <p className="text-white font-bold">1 : {signal.riskReward.ratio}</p>
        </div>
      )}
      
      {/* Model Info */}
      <div className="mb-6">
        <h4 className="text-zinc-400 text-sm mb-2">Modelo</h4>
        <div className={`
          inline-block px-3 py-1 rounded-lg text-sm font-medium
          ${signal.model === 'REVERSAL_OB' ? 'bg-purple-500/20 text-purple-400' :
            signal.model === 'CONTINUATION' ? 'bg-blue-500/20 text-blue-400' :
            signal.model === 'POST_DISPLACEMENT' ? 'bg-orange-500/20 text-orange-400' :
            'bg-zinc-800 text-zinc-400'}
        `}>
          {signal.model?.replace('_', ' ') || 'NO SETUP'}
        </div>
      </div>
      
      {/* Analysis Details */}
      {signal.details && (
        <div className="space-y-2">
          <h4 className="text-zinc-400 text-sm">Análisis</h4>
          {Object.entries(signal.details).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-zinc-500 capitalize">{key.replace('_', ' ')}</span>
              <span className="text-zinc-300">{value}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Waiting */}
      {signal.waiting && signal.waiting.length > 0 && (
        <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <p className="text-yellow-400 text-sm font-medium mb-1">⏳ Esperando:</p>
          <ul className="text-yellow-300/70 text-xs">
            {signal.waiting.map((item, i) => (
              <li key={i}>• {item}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Suggestion */}
      {signal.suggestion && (
        <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-blue-300 text-sm">{signal.suggestion}</p>
        </div>
      )}
    </div>
  );
};

// =============================================
// COMPONENTE: Lista de Señales Recientes
// =============================================
const RecentSignals = ({ signals }) => {
  if (!signals || signals.length === 0) {
    return (
      <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
        <h3 className="text-white font-semibold mb-3">📡 Señales Recientes</h3>
        <p className="text-zinc-500 text-sm">Sin señales recientes</p>
      </div>
    );
  }
  
  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
      <h3 className="text-white font-semibold mb-3">📡 Señales Recientes</h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {signals.slice(0, 10).map((sig, i) => (
          <div key={i} className="flex items-center justify-between p-2 bg-zinc-800/50 rounded-lg">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                sig.action === 'LONG' ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className="text-white text-sm">{sig.assetName || sig.asset}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${
                sig.action === 'LONG' ? 'text-green-400' : 'text-red-400'
              }`}>
                {sig.action}
              </span>
              <span className="text-zinc-500 text-xs">{sig.score}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================
// COMPONENTE: Flujo SMC
// =============================================
const SMCFlow = ({ analysis }) => {
  const steps = [
    { key: 'sweep', label: 'Liquidez', icon: '💰' },
    { key: 'sweep', label: 'Sweep', icon: '🔄' },
    { key: 'displacement', label: 'Displacement', icon: '➡️' },
    { key: 'choch', label: 'CHoCH', icon: '🔀' },
    { key: 'ob', label: 'OB', icon: '📦' },
    { key: 'entry', label: 'Entrada', icon: '🎯' },
  ];
  
  const isStepComplete = (key) => {
    if (!analysis) return false;
    const value = analysis[key];
    if (typeof value === 'string') return !value.includes('❌') && !value.includes('Sin');
    return !!value;
  };
  
  const completedSteps = steps.filter(s => isStepComplete(s.key)).length;
  const progress = (completedSteps / steps.length) * 100;
  
  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold">Flujo SMC</h3>
        <span className="text-zinc-400 text-sm">{Math.round(progress)}%</span>
      </div>
      
      {/* Progress bar */}
      <div className="w-full bg-zinc-800 rounded-full h-2 mb-4">
        <div 
          className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      {/* Steps */}
      <div className="grid grid-cols-6 gap-1">
        {steps.map((step, i) => (
          <div 
            key={i}
            className={`
              flex flex-col items-center p-2 rounded-lg text-center
              ${isStepComplete(step.key) ? 'bg-green-500/20' : 'bg-zinc-800/50'}
            `}
          >
            <span className="text-lg mb-1">{step.icon}</span>
            <span className={`text-xs ${isStepComplete(step.key) ? 'text-green-400' : 'text-zinc-500'}`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================
// COMPONENTE PRINCIPAL: Dashboard
// =============================================
const Dashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [assetDetail, setAssetDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/dashboard`);
      if (!res.ok) throw new Error('Error al conectar con el servidor');
      const data = await res.json();
      setDashboardData(data);
      setLastUpdate(new Date());
      setError(null);
      
      // Auto-select first asset with signal
      if (!selectedAsset && data.assets) {
        const withSignal = data.assets.find(a => a.analysis?.action && a.analysis.action !== 'WAIT');
        setSelectedAsset(withSignal || data.assets[0]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedAsset]);
  
  // Fetch asset detail
  const fetchAssetDetail = useCallback(async (symbol) => {
    try {
      const res = await fetch(`${API_URL}/api/analyze/${symbol}`);
      if (!res.ok) return;
      const data = await res.json();
      setAssetDetail(data);
    } catch (err) {
      console.error('Error fetching asset detail:', err);
    }
  }, []);
  
  // Initial fetch and polling
  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 5000); // Every 5 seconds
    return () => clearInterval(interval);
  }, [fetchDashboard]);
  
  // Fetch detail when asset selected
  useEffect(() => {
    if (selectedAsset?.symbol) {
      fetchAssetDetail(selectedAsset.symbol);
    }
  }, [selectedAsset, fetchAssetDetail]);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-zinc-700 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-400">Conectando con Trading Master Pro v8.0...</p>
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
            <h1 className="text-xl font-bold">
              Trading<span className="text-green-500">Pro</span>
            </h1>
            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full font-medium">
              v8.0
            </span>
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
              SMC INSTITUCIONAL
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 ${dashboardData?.connected ? 'text-green-400' : 'text-red-400'}`}>
              <span className={`w-2 h-2 rounded-full ${dashboardData?.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-sm">{dashboardData?.connected ? 'Conectado' : 'Desconectado'}</span>
            </div>
            {lastUpdate && (
              <span className="text-zinc-500 text-xs">
                {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </header>
      
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
          <p className="text-red-400 text-sm">⚠️ {error}</p>
        </div>
      )}
      
      <main className="p-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Left: Asset List */}
          <div className="col-span-12 lg:col-span-3 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-300">Activos</h2>
            <div className="space-y-2">
              {dashboardData?.assets?.map((asset) => (
                <AssetCard 
                  key={asset.symbol}
                  asset={asset}
                  onSelect={setSelectedAsset}
                  isSelected={selectedAsset?.symbol === asset.symbol}
                />
              ))}
            </div>
          </div>
          
          {/* Center: Chart */}
          <div className="col-span-12 lg:col-span-6 space-y-4">
            {selectedAsset && (
              <>
                <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">{selectedAsset.name}</h2>
                    <span className="text-zinc-400">{selectedAsset.price?.toFixed(selectedAsset.type === 'forex' ? 5 : 2)}</span>
                  </div>
                  <CandleChart 
                    candles={assetDetail?.candles || []} 
                    signal={assetDetail?.signal}
                    height={350}
                  />
                </div>
                
                <SMCFlow analysis={assetDetail?.signal?.analysis || assetDetail?.analysis} />
              </>
            )}
          </div>
          
          {/* Right: Signal Panel & Recent */}
          <div className="col-span-12 lg:col-span-3 space-y-4">
            {assetDetail && (
              <SignalPanel 
                asset={selectedAsset} 
                signal={assetDetail.signal}
              />
            )}
            <RecentSignals signals={dashboardData?.recentSignals} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
