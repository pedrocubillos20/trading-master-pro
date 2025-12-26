import React, { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// TRADING MASTER PRO v11.0
// Professional Dashboard - Premium Design
// =============================================

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [aiChat, setAiChat] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [notifications, setNotifications] = useState([]);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/dashboard`);
      const json = await res.json();
      setData(json);
      if (!selectedAsset && json.assets?.length > 0) {
        setSelectedAsset(json.assets[0].symbol);
      }
      
      // Check for new signals
      if (json.recentSignals?.length > 0) {
        const latestSignal = json.recentSignals[0];
        const signalTime = new Date(latestSignal.timestamp).getTime();
        const now = Date.now();
        if (now - signalTime < 10000 && latestSignal.status === 'PENDING') {
          addNotification(`Nueva señal ${latestSignal.action} en ${latestSignal.assetName}`, 'signal');
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  }, [selectedAsset]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Notifications
  const addNotification = (message, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  // Mark signal
  const markSignal = async (id, status) => {
    try {
      await fetch(`${API_URL}/api/signals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      addNotification(`Señal marcada como ${status}`, status === 'WIN' ? 'success' : 'error');
      fetchData();
    } catch (err) {
      console.error('Error:', err);
    }
  };

  // AI Chat
  const sendMessage = async () => {
    if (!chatInput.trim() || !selectedAsset) return;
    
    const userMsg = { role: 'user', content: chatInput };
    setAiChat(prev => [...prev, userMsg]);
    setChatInput('');
    
    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: chatInput, symbol: selectedAsset })
      });
      const json = await res.json();
      setAiChat(prev => [...prev, { role: 'assistant', content: json.answer }]);
    } catch (err) {
      setAiChat(prev => [...prev, { role: 'assistant', content: 'Error al conectar con IA' }]);
    }
  };

  const currentAsset = data?.assets?.find(a => a.symbol === selectedAsset);
  const pendingSignals = data?.recentSignals?.filter(s => s.status === 'PENDING') || [];
  const closedSignals = data?.recentSignals?.filter(s => s.status !== 'PENDING') || [];

  // =============================================
  // COMPONENTS
  // =============================================

  // Sidebar
  const Sidebar = () => (
    <aside className={`fixed left-0 top-0 h-full bg-[#0a0a0f] border-r border-white/5 transition-all duration-300 z-50 ${sidebarOpen ? 'w-64' : 'w-20'}`}>
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-white/5">
        {sidebarOpen ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
              <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-bold text-lg tracking-tight">TradingPro</h1>
              <p className="text-[10px] text-white/40">SMC Intelligence</p>
            </div>
          </div>
        ) : (
          <div className="w-10 h-10 mx-auto rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
            <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        )}
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
          <svg className={`w-5 h-5 text-white/50 transition-transform ${!sidebarOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="p-3 space-y-1">
        {[
          { id: 'dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', label: 'Dashboard' },
          { id: 'signals', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9', label: 'Señales', badge: pendingSignals.length },
          { id: 'analysis', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', label: 'Análisis' },
          { id: 'history', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Historial' },
          { id: 'stats', icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', label: 'Estadísticas' },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
              activeSection === item.id 
                ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-emerald-400' 
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
            </svg>
            {sidebarOpen && (
              <>
                <span className="font-medium text-sm">{item.label}</span>
                {item.badge > 0 && (
                  <span className="ml-auto px-2 py-0.5 text-xs font-bold bg-emerald-500 text-black rounded-full">
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
      </nav>

      {/* Assets */}
      <div className="p-3 border-t border-white/5">
        {sidebarOpen && <p className="text-[10px] uppercase tracking-wider text-white/30 mb-2 px-3">Mercados</p>}
        <div className="space-y-1">
          {data?.assets?.map(asset => (
            <button
              key={asset.symbol}
              onClick={() => setSelectedAsset(asset.symbol)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                selectedAsset === asset.symbol
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="text-lg">{asset.emoji}</span>
              {sidebarOpen && (
                <>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium truncate">{asset.name.split(' ')[0]}</p>
                    <p className="text-[10px] text-white/40">{asset.price?.toFixed(asset.decimals)}</p>
                  </div>
                  {asset.signal?.action && !['WAIT', 'LOADING'].includes(asset.signal.action) && (
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                      asset.signal.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {asset.signal.action}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Connection Status */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/5">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${data?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {sidebarOpen && (
            <span className="text-xs text-white/40">{data?.connected ? 'Conectado' : 'Desconectado'}</span>
          )}
        </div>
      </div>
    </aside>
  );

  // Header
  const Header = () => (
    <header className="h-16 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-6 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-white capitalize">{activeSection}</h2>
        <span className="text-white/30">|</span>
        <span className="text-sm text-white/50">
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar..."
            className="w-48 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <svg className="w-4 h-4 text-white/30 absolute right-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Notifications */}
        <button className="relative p-2 hover:bg-white/5 rounded-xl transition-colors">
          <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {pendingSignals.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
              {pendingSignals.length}
            </span>
          )}
        </button>

        {/* Theme Toggle */}
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
          <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        </button>

        {/* Profile */}
        <div className="flex items-center gap-3 pl-3 border-l border-white/10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
            T
          </div>
        </div>
      </div>
    </header>
  );

  // Stats Card
  const StatsCard = ({ title, value, subtitle, icon, trend, color = 'emerald' }) => (
    <div className="bg-[#12121a] rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl bg-${color}-500/10 flex items-center justify-center`}>
          <span className="text-2xl">{icon}</span>
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-medium px-2 py-1 rounded-lg ${trend >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      <p className="text-sm text-white/40">{title}</p>
      {subtitle && <p className="text-xs text-white/30 mt-1">{subtitle}</p>}
    </div>
  );

  // Price Card (Main Asset)
  const PriceCard = () => {
    if (!currentAsset) return null;
    const signal = currentAsset.signal;
    const hasSignal = signal?.action && !['WAIT', 'LOADING'].includes(signal.action);

    return (
      <div className="bg-[#12121a] rounded-2xl border border-white/5 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-3xl">
                {currentAsset.emoji}
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{currentAsset.name}</h3>
                <p className="text-sm text-white/40">{currentAsset.type} • M5</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-white font-mono">
                {currentAsset.price?.toFixed(currentAsset.decimals)}
              </p>
              <p className="text-sm text-white/40">
                {currentAsset.demandZones || 0} demanda • {currentAsset.supplyZones || 0} oferta
              </p>
            </div>
          </div>
        </div>

        {/* Chart Placeholder */}
        <div className="h-64 relative bg-gradient-to-b from-transparent to-emerald-500/5">
          <MiniChart candles={[]} asset={currentAsset} />
        </div>

        {/* Signal Info */}
        {hasSignal && (
          <div className="p-5 border-t border-white/5 bg-gradient-to-r from-emerald-500/5 to-transparent">
            <div className="flex items-center gap-4 mb-4">
              <div className={`px-4 py-2 rounded-xl font-bold text-lg ${
                signal.action === 'LONG' 
                  ? 'bg-emerald-500 text-black' 
                  : 'bg-red-500 text-white'
              }`}>
                {signal.action}
              </div>
              <div>
                <p className="text-white font-medium">{signal.model}</p>
                <p className="text-sm text-white/50">Score: {signal.score}%</p>
              </div>
              <div className="ml-auto">
                <div className="w-16 h-16 relative">
                  <svg className="w-16 h-16 -rotate-90">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
                    <circle 
                      cx="32" cy="32" r="28" fill="none" 
                      stroke={signal.score >= 80 ? '#10b981' : signal.score >= 60 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="4" 
                      strokeLinecap="round"
                      strokeDasharray={`${signal.score * 1.76} 176`}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-white font-bold">
                    {signal.score}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Entry</p>
                <p className="text-white font-mono font-medium">{signal.entry}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-xl p-3 text-center">
                <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1">TP1 (1:1)</p>
                <p className="text-emerald-400 font-mono font-medium">{signal.tp1}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-xl p-3 text-center">
                <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1">TP2 (1:2)</p>
                <p className="text-emerald-400 font-mono font-medium">{signal.tp2}</p>
              </div>
              <div className="bg-red-500/10 rounded-xl p-3 text-center">
                <p className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Stop Loss</p>
                <p className="text-red-400 font-mono font-medium">{signal.stop}</p>
              </div>
            </div>
          </div>
        )}

        {/* Analysis */}
        {signal?.analysis && (
          <div className="p-5 border-t border-white/5">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-white/40">Estructura:</span>
                <span className={`font-medium ${signal.analysis.structure === 'BULLISH' ? 'text-emerald-400' : signal.analysis.structure === 'BEARISH' ? 'text-red-400' : 'text-white/50'}`}>
                  {signal.analysis.structure || 'NEUTRAL'}
                </span>
              </div>
              {signal.analysis.choch && (
                <div className="flex items-center gap-2">
                  <span className="text-white/40">CHoCH:</span>
                  <span className="text-cyan-400 font-medium">{signal.analysis.choch}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-white/40">EQH:</span>
                <span className="text-white/70 font-mono">{signal.analysis.eqh}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/40">EQL:</span>
                <span className="text-white/70 font-mono">{signal.analysis.eql}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Mini Chart (simplified)
  const MiniChart = ({ asset }) => {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <svg className="w-16 h-16 text-white/10 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <p className="text-white/30 text-sm">Gráfico en tiempo real</p>
        </div>
      </div>
    );
  };

  // Signal Card
  const SignalCard = ({ signal, showActions = true }) => {
    const isLong = signal.action === 'LONG';
    
    return (
      <div className="bg-[#12121a] rounded-2xl border border-white/5 overflow-hidden hover:border-white/10 transition-all">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{signal.emoji}</span>
              <div>
                <p className="text-white font-medium">{signal.assetName}</p>
                <p className="text-xs text-white/40">
                  {new Date(signal.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1.5 rounded-lg font-bold text-sm ${
                isLong ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'
              }`}>
                {signal.action}
              </span>
              <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                signal.model === 'CHOCH_PULLBACK' ? 'bg-purple-500/20 text-purple-400' :
                signal.model === 'STRUCTURE_PULLBACK' ? 'bg-cyan-500/20 text-cyan-400' :
                'bg-orange-500/20 text-orange-400'
              }`}>
                {signal.model}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-white/5 rounded-lg p-2">
              <p className="text-[10px] text-white/40">Entry</p>
              <p className="text-sm text-white font-mono">{signal.entry}</p>
            </div>
            <div className="bg-red-500/10 rounded-lg p-2">
              <p className="text-[10px] text-red-400">Stop</p>
              <p className="text-sm text-red-400 font-mono">{signal.stop}</p>
            </div>
          </div>

          <div className="flex gap-2 mb-3">
            <div className={`flex-1 rounded-lg p-2 text-center ${signal.tp1Hit ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
              <p className="text-[10px] text-white/40">TP1</p>
              <p className={`text-xs font-mono ${signal.tp1Hit ? 'text-emerald-400' : 'text-white/70'}`}>{signal.tp1}</p>
            </div>
            <div className={`flex-1 rounded-lg p-2 text-center ${signal.tp2Hit ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
              <p className="text-[10px] text-white/40">TP2</p>
              <p className={`text-xs font-mono ${signal.tp2Hit ? 'text-emerald-400' : 'text-white/70'}`}>{signal.tp2}</p>
            </div>
            <div className={`flex-1 rounded-lg p-2 text-center ${signal.tp3Hit ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
              <p className="text-[10px] text-white/40">TP3</p>
              <p className={`text-xs font-mono ${signal.tp3Hit ? 'text-emerald-400' : 'text-white/70'}`}>{signal.tp3}</p>
            </div>
          </div>

          {showActions && signal.status === 'PENDING' && (
            <div className="flex gap-2">
              <button
                onClick={() => markSignal(signal.id, 'WIN')}
                className="flex-1 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-sm font-medium transition-colors"
              >
                ✓ Win
              </button>
              <button
                onClick={() => markSignal(signal.id, 'LOSS')}
                className="flex-1 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm font-medium transition-colors"
              >
                ✗ Loss
              </button>
              <button
                onClick={() => markSignal(signal.id, 'SKIP')}
                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white/50 rounded-lg text-sm font-medium transition-colors"
              >
                Skip
              </button>
            </div>
          )}

          {signal.status !== 'PENDING' && (
            <div className={`py-2 rounded-lg text-center font-medium ${
              signal.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' :
              signal.status === 'LOSS' ? 'bg-red-500/20 text-red-400' :
              'bg-white/5 text-white/40'
            }`}>
              {signal.status}
            </div>
          )}
        </div>
      </div>
    );
  };

  // AI Chat Panel
  const AIPanel = () => (
    <div className="bg-[#12121a] rounded-2xl border border-white/5 flex flex-col h-[400px]">
      <div className="p-4 border-b border-white/5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="text-white font-medium">AI Assistant</p>
          <p className="text-xs text-white/40">Análisis inteligente</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {aiChat.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white/30 text-sm mb-4">Pregúntame sobre señales, zonas o análisis</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {['¿Señal?', '¿Zonas?', '¿Setup?'].map(q => (
                <button
                  key={q}
                  onClick={() => { setChatInput(q); }}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/60 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          aiChat.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-emerald-500 text-black'
                  : 'bg-white/5 text-white/80'
              }`}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-white/5">
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Escribe tu pregunta..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50"
          />
          <button
            onClick={sendMessage}
            className="px-4 bg-emerald-500 hover:bg-emerald-600 text-black rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  // =============================================
  // SECTIONS
  // =============================================

  const DashboardSection = () => (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <StatsCard
          title="Win Rate"
          value={`${data?.stats?.wins && data?.stats?.losses ? Math.round(data.stats.wins / (data.stats.wins + data.stats.losses) * 100) : 0}%`}
          icon="📊"
          trend={5}
        />
        <StatsCard
          title="Señales Activas"
          value={pendingSignals.length}
          subtitle="Pendientes de resultado"
          icon="🎯"
        />
        <StatsCard
          title="Victorias"
          value={data?.stats?.wins || 0}
          subtitle={`de ${data?.stats?.total || 0} totales`}
          icon="✅"
          color="green"
        />
        <StatsCard
          title="TP3 Alcanzados"
          value={data?.stats?.tp3Hits || 0}
          subtitle="Máximo profit"
          icon="💎"
          color="purple"
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <PriceCard />
        </div>
        <div>
          <AIPanel />
        </div>
      </div>

      {/* Active Signals */}
      {pendingSignals.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Señales Activas</h3>
          <div className="grid grid-cols-3 gap-4">
            {pendingSignals.slice(0, 3).map(signal => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const SignalsSection = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Todas las Señales</h3>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-xl text-sm font-medium">
            Activas ({pendingSignals.length})
          </button>
          <button className="px-4 py-2 bg-white/5 text-white/50 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors">
            Historial ({closedSignals.length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {pendingSignals.map(signal => (
          <SignalCard key={signal.id} signal={signal} />
        ))}
      </div>

      {pendingSignals.length === 0 && (
        <div className="text-center py-16 bg-[#12121a] rounded-2xl border border-white/5">
          <svg className="w-16 h-16 text-white/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <p className="text-white/40">No hay señales activas</p>
          <p className="text-sm text-white/20 mt-1">Las nuevas señales aparecerán aquí</p>
        </div>
      )}
    </div>
  );

  const AnalysisSection = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">Análisis de Mercado</h3>
      
      <div className="grid grid-cols-2 gap-6">
        {data?.assets?.map(asset => {
          const signal = asset.signal;
          const hasSignal = signal?.action && !['WAIT', 'LOADING'].includes(signal.action);
          
          return (
            <div key={asset.symbol} className="bg-[#12121a] rounded-2xl border border-white/5 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{asset.emoji}</span>
                  <div>
                    <p className="text-white font-medium">{asset.name}</p>
                    <p className="text-xl font-bold text-white font-mono">
                      {asset.price?.toFixed(asset.decimals)}
                    </p>
                  </div>
                </div>
                {hasSignal && (
                  <span className={`px-3 py-1.5 rounded-lg font-bold ${
                    signal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'
                  }`}>
                    {signal.action}
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/40">Estructura</span>
                  <span className={`font-medium ${
                    signal?.analysis?.structure === 'BULLISH' ? 'text-emerald-400' :
                    signal?.analysis?.structure === 'BEARISH' ? 'text-red-400' :
                    'text-white/50'
                  }`}>
                    {signal?.analysis?.structure || 'NEUTRAL'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/40">CHoCH</span>
                  <span className="text-cyan-400">{signal?.analysis?.choch || 'No detectado'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/40">Zonas</span>
                  <span className="text-white/70">{asset.demandZones}D / {asset.supplyZones}S</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/40">Score</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          (signal?.score || 0) >= 70 ? 'bg-emerald-500' :
                          (signal?.score || 0) >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${signal?.score || 0}%` }}
                      />
                    </div>
                    <span className="text-white/70 font-mono">{signal?.score || 0}%</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const HistorySection = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">Historial de Señales</h3>
      
      <div className="bg-[#12121a] rounded-2xl border border-white/5 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-xs text-white/40 font-medium p-4">Activo</th>
              <th className="text-left text-xs text-white/40 font-medium p-4">Tipo</th>
              <th className="text-left text-xs text-white/40 font-medium p-4">Entry</th>
              <th className="text-left text-xs text-white/40 font-medium p-4">Modelo</th>
              <th className="text-left text-xs text-white/40 font-medium p-4">Resultado</th>
              <th className="text-left text-xs text-white/40 font-medium p-4">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {closedSignals.map(signal => (
              <tr key={signal.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <span>{signal.emoji}</span>
                    <span className="text-white text-sm">{signal.assetName}</span>
                  </div>
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    signal.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {signal.action}
                  </span>
                </td>
                <td className="p-4 text-white/70 font-mono text-sm">{signal.entry}</td>
                <td className="p-4 text-white/50 text-sm">{signal.model}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    signal.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' :
                    signal.status === 'LOSS' ? 'bg-red-500/20 text-red-400' :
                    'bg-white/10 text-white/50'
                  }`}>
                    {signal.status}
                  </span>
                </td>
                <td className="p-4 text-white/40 text-sm">
                  {new Date(signal.timestamp).toLocaleDateString('es-ES')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const StatsSection = () => {
    const winRate = data?.stats?.wins && data?.stats?.losses 
      ? Math.round(data.stats.wins / (data.stats.wins + data.stats.losses) * 100) 
      : 0;

    return (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-white">Estadísticas</h3>
        
        <div className="grid grid-cols-4 gap-4">
          <StatsCard title="Total Señales" value={data?.stats?.total || 0} icon="📊" />
          <StatsCard title="Victorias" value={data?.stats?.wins || 0} icon="✅" color="green" />
          <StatsCard title="Pérdidas" value={data?.stats?.losses || 0} icon="❌" color="red" />
          <StatsCard title="Win Rate" value={`${winRate}%`} icon="🎯" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <StatsCard title="TP1 Alcanzados" value={data?.stats?.tp1Hits || 0} icon="1️⃣" subtitle="Ratio 1:1" />
          <StatsCard title="TP2 Alcanzados" value={data?.stats?.tp2Hits || 0} icon="2️⃣" subtitle="Ratio 1:2" />
          <StatsCard title="TP3 Alcanzados" value={data?.stats?.tp3Hits || 0} icon="3️⃣" subtitle="Ratio 1:3" />
        </div>

        {/* Win Rate Chart Visual */}
        <div className="bg-[#12121a] rounded-2xl border border-white/5 p-6">
          <h4 className="text-white font-medium mb-6">Rendimiento General</h4>
          <div className="flex items-center gap-8">
            <div className="relative w-40 h-40">
              <svg className="w-40 h-40 -rotate-90">
                <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="12" />
                <circle 
                  cx="80" cy="80" r="70" fill="none" 
                  stroke="#10b981"
                  strokeWidth="12" 
                  strokeLinecap="round"
                  strokeDasharray={`${winRate * 4.4} 440`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-white">{winRate}%</span>
                <span className="text-sm text-white/40">Win Rate</span>
              </div>
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/60">Victorias</span>
                  <span className="text-emerald-400 font-medium">{data?.stats?.wins || 0}</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${winRate}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/60">Pérdidas</span>
                  <span className="text-red-400 font-medium">{data?.stats?.losses || 0}</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: `${100 - winRate}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // =============================================
  // MAIN RENDER
  // =============================================

  return (
    <div className="min-h-screen bg-[#06060a] text-white">
      {/* Notifications */}
      <div className="fixed top-4 right-4 z-[100] space-y-2">
        {notifications.map(n => (
          <div
            key={n.id}
            className={`px-4 py-3 rounded-xl shadow-lg animate-slide-in ${
              n.type === 'signal' ? 'bg-emerald-500 text-black' :
              n.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
              n.type === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
              'bg-white/10 text-white border border-white/10'
            }`}
          >
            {n.message}
          </div>
        ))}
      </div>

      <Sidebar />
      
      <main className={`transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'}`}>
        <Header />
        
        <div className="p-6">
          {activeSection === 'dashboard' && <DashboardSection />}
          {activeSection === 'signals' && <SignalsSection />}
          {activeSection === 'analysis' && <AnalysisSection />}
          {activeSection === 'history' && <HistorySection />}
          {activeSection === 'stats' && <StatsSection />}
        </div>
      </main>

      <style>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
