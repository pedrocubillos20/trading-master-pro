import React, { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// TRADING MASTER PRO v11.5
// - Sin zoom (simplificado)
// - Gráfico estable
// - Conexión robusta
// =============================================

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [candles, setCandles] = useState([]);
  const [isLoadingCandles, setIsLoadingCandles] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  
  // Chat state
  const [aiChat, setAiChat] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/dashboard`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setData(json);
      setConnectionError(false);
      if (!selectedAsset && json.assets?.length > 0) {
        setSelectedAsset(json.assets[0].symbol);
      }
    } catch (err) {
      console.error('Error fetching dashboard:', err);
      setConnectionError(true);
    }
  }, [selectedAsset]);

  // Fetch candles
  const fetchCandles = useCallback(async () => {
    if (!selectedAsset) return;
    try {
      const res = await fetch(`${API_URL}/api/analyze/${selectedAsset}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      if (json.candles && json.candles.length > 0) {
        setCandles(json.candles);
        setIsLoadingCandles(false);
      }
    } catch (err) {
      console.error('Error fetching candles:', err);
      setIsLoadingCandles(false);
    }
  }, [selectedAsset]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (selectedAsset) {
      setIsLoadingCandles(true);
      setCandles([]);
      fetchCandles();
      const interval = setInterval(fetchCandles, 4000);
      return () => clearInterval(interval);
    }
  }, [selectedAsset, fetchCandles]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChat]);

  // Search
  const searchResults = searchQuery.trim() 
    ? (data?.assets?.filter(a => 
        a.name.toLowerCase().includes(searchQuery.toLowerCase())
      ) || [])
    : [];

  // Mark signal
  const markSignal = async (id, status) => {
    try {
      await fetch(`${API_URL}/api/signals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchData();
    } catch (err) {}
  };

  // AI Chat
  const sendMessage = async () => {
    if (!chatInput.trim() || !selectedAsset) return;
    const msg = chatInput.trim();
    setChatInput('');
    setAiChat(prev => [...prev, { role: 'user', content: msg }]);
    
    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: msg, symbol: selectedAsset })
      });
      const json = await res.json();
      setAiChat(prev => [...prev, { role: 'assistant', content: json.answer }]);
    } catch (err) {
      setAiChat(prev => [...prev, { role: 'assistant', content: '❌ Error de conexión' }]);
    }
  };

  const currentAsset = data?.assets?.find(a => a.symbol === selectedAsset);
  const pendingSignals = data?.recentSignals?.filter(s => s.status === 'PENDING') || [];
  const closedSignals = data?.recentSignals?.filter(s => s.status !== 'PENDING') || [];

  const colors = {
    bg: '#08080c',
    card: '#0f0f14',
    cardHover: '#141419',
    border: 'rgba(255,255,255,0.06)',
    text: '#ffffff',
    textMuted: 'rgba(255,255,255,0.6)',
    textDim: 'rgba(255,255,255,0.35)',
    emerald: '#10b981',
    red: '#ef4444',
  };

  // =============================================
  // GRÁFICO SIMPLE SIN ZOOM
  // =============================================
  const SimpleChart = ({ data: chartCandles, height = 260 }) => {
    const containerRef = useRef(null);
    const [width, setWidth] = useState(600);

    useEffect(() => {
      const updateWidth = () => {
        if (containerRef.current) {
          setWidth(containerRef.current.offsetWidth || 600);
        }
      };
      updateWidth();
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }, []);

    // Loading
    if (isLoadingCandles) {
      return (
        <div ref={containerRef} style={{ height }} className="flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-xs text-white/40">Cargando datos...</p>
          </div>
        </div>
      );
    }

    // No data
    if (!chartCandles || chartCandles.length === 0) {
      return (
        <div ref={containerRef} style={{ height }} className="flex items-center justify-center">
          <div className="text-center">
            <svg className="w-10 h-10 mx-auto mb-2 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-xs text-white/40">Sin datos de mercado</p>
            <p className="text-[10px] text-white/20 mt-1">Esperando conexión con Deriv...</p>
          </div>
        </div>
      );
    }

    const padding = { top: 10, right: 50, bottom: 20, left: 5 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Últimas 50 velas
    const displayCandles = chartCandles.slice(-50);
    const candleW = Math.max(3, (chartWidth / displayCandles.length) * 0.7);
    const gap = (chartWidth / displayCandles.length) - candleW;

    // Calcular escala
    const prices = displayCandles.flatMap(c => [c.high, c.low]);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = (maxP - minP) || 1;
    const pad = range * 0.1;
    const adjMin = minP - pad;
    const adjMax = maxP + pad;
    const scale = chartHeight / (adjMax - adjMin);

    const getY = (p) => padding.top + (adjMax - p) * scale;
    const lastPrice = displayCandles[displayCandles.length - 1]?.close;
    const decimals = currentAsset?.decimals || 2;

    return (
      <div ref={containerRef} className="w-full">
        <svg width={width} height={height}>
          {/* Grid */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const price = adjMax - ((adjMax - adjMin) * pct);
            const y = getY(price);
            return (
              <g key={i}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y}
                  stroke="rgba(255,255,255,0.04)" />
                <text x={width - padding.right + 4} y={y + 3} fill="rgba(255,255,255,0.3)"
                  fontSize="9" fontFamily="monospace">{price.toFixed(decimals)}</text>
              </g>
            );
          })}

          {/* Velas */}
          {displayCandles.map((c, i) => {
            const x = padding.left + i * (candleW + gap);
            const isGreen = c.close >= c.open;
            const top = getY(Math.max(c.open, c.close));
            const bottom = getY(Math.min(c.open, c.close));
            const bodyH = Math.max(1, bottom - top);
            const color = isGreen ? '#10b981' : '#ef4444';

            return (
              <g key={i}>
                <line x1={x + candleW / 2} y1={getY(c.high)} x2={x + candleW / 2} y2={getY(c.low)}
                  stroke={color} strokeWidth="1" />
                <rect x={x} y={top} width={candleW} height={bodyH} fill={color} />
              </g>
            );
          })}

          {/* Línea de precio actual */}
          {lastPrice && (
            <g>
              <line x1={padding.left} y1={getY(lastPrice)} x2={width - padding.right} y2={getY(lastPrice)}
                stroke="#10b981" strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />
              <rect x={width - padding.right - 2} y={getY(lastPrice) - 8} width="48" height="16"
                fill="#10b981" rx="2" />
              <text x={width - padding.right + 22} y={getY(lastPrice) + 4} fill="black"
                fontSize="9" fontFamily="monospace" textAnchor="middle" fontWeight="bold">
                {lastPrice.toFixed(decimals)}
              </text>
            </g>
          )}

          {/* Líneas de señal */}
          {currentAsset?.signal?.entry && !['WAIT', 'LOADING'].includes(currentAsset.signal.action) && (
            <>
              <line x1={padding.left} y1={getY(currentAsset.signal.entry)} x2={width - padding.right} y2={getY(currentAsset.signal.entry)}
                stroke="#3b82f6" strokeWidth="1" strokeDasharray="4,2" opacity="0.5" />
              <line x1={padding.left} y1={getY(currentAsset.signal.tp1)} x2={width - padding.right} y2={getY(currentAsset.signal.tp1)}
                stroke="#10b981" strokeWidth="1" opacity="0.3" />
              <line x1={padding.left} y1={getY(currentAsset.signal.stop)} x2={width - padding.right} y2={getY(currentAsset.signal.stop)}
                stroke="#ef4444" strokeWidth="1" opacity="0.3" />
            </>
          )}
        </svg>
      </div>
    );
  };

  // =============================================
  // SIDEBAR
  // =============================================
  const Sidebar = () => (
    <aside className={`fixed left-0 top-0 h-full border-r transition-all duration-200 z-50 ${sidebarOpen ? 'w-52' : 'w-14'}`}
      style={{ background: colors.card, borderColor: colors.border }}>
      
      {/* Logo */}
      <div className="h-12 flex items-center justify-between px-3 border-b" style={{ borderColor: colors.border }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          {sidebarOpen && <span className="font-bold text-sm text-white">TradingPro</span>}
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 hover:bg-white/5 rounded">
          <svg className={`w-4 h-4 text-white/50 ${!sidebarOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="p-2 space-y-1">
        {[
          { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
          { id: 'signals', icon: '🔔', label: 'Señales', badge: pendingSignals.length },
          { id: 'analysis', icon: '📊', label: 'Análisis' },
          { id: 'history', icon: '📜', label: 'Historial' },
          { id: 'stats', icon: '📈', label: 'Stats' },
        ].map(item => (
          <button key={item.id} onClick={() => setActiveSection(item.id)}
            className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-all ${
              activeSection === item.id ? 'bg-emerald-500/15 text-emerald-400' : 'text-white/60 hover:bg-white/5'
            }`}>
            <span className="text-base">{item.icon}</span>
            {sidebarOpen && (
              <>
                <span className="text-xs">{item.label}</span>
                {item.badge > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500 text-black rounded-full">{item.badge}</span>
                )}
              </>
            )}
          </button>
        ))}
      </nav>

      {/* Mercados */}
      <div className="p-2 border-t" style={{ borderColor: colors.border }}>
        {sidebarOpen && <p className="text-[9px] uppercase text-white/30 mb-1 px-2">Mercados</p>}
        <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
          {data?.assets?.map(asset => (
            <button key={asset.symbol} onClick={() => setSelectedAsset(asset.symbol)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${
                selectedAsset === asset.symbol ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5'
              }`}>
              <span className="text-sm">{asset.emoji}</span>
              {sidebarOpen && (
                <>
                  <div className="flex-1 text-left">
                    <p className="text-[11px] font-medium">{asset.shortName || asset.name?.split(' ')[0]}</p>
                    <p className="text-[9px] font-mono text-white/40">{asset.price?.toFixed(2) || '---'}</p>
                  </div>
                  {asset.signal?.action && !['WAIT', 'LOADING'].includes(asset.signal.action) && (
                    <span className={`px-1 py-0.5 text-[8px] font-bold rounded ${
                      asset.signal.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>{asset.signal.action}</span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      <div className="absolute bottom-0 left-0 right-0 p-3 border-t" style={{ borderColor: colors.border }}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${data?.connected && !connectionError ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {sidebarOpen && <span className="text-[10px] text-white/40">{data?.connected && !connectionError ? 'Conectado' : 'Desconectado'}</span>}
        </div>
      </div>
    </aside>
  );

  // =============================================
  // HEADER
  // =============================================
  const Header = () => (
    <header className="h-11 border-b flex items-center justify-between px-4 sticky top-0 z-40"
      style={{ background: colors.card, borderColor: colors.border }}>
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-medium text-white capitalize">{activeSection}</h2>
        <span className="text-[10px] text-white/30">
          {new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative">
          <input type="text" placeholder="Buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-28 bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-emerald-500" />
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#151520] border border-white/10 rounded shadow-xl z-50">
              {searchResults.map(a => (
                <button key={a.symbol} onClick={() => { setSelectedAsset(a.symbol); setSearchQuery(''); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 text-left">
                  <span>{a.emoji}</span>
                  <span className="text-[10px] text-white">{a.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Notifications */}
        <button onClick={() => setShowNotifications(!showNotifications)} className="p-1.5 hover:bg-white/5 rounded relative">
          <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {pendingSignals.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-emerald-500 text-black text-[8px] font-bold rounded-full flex items-center justify-center">{pendingSignals.length}</span>
          )}
        </button>

        {/* Theme */}
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-1.5 hover:bg-white/5 rounded">
          <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        </button>

        {/* Profile */}
        <button onClick={() => setShowProfile(!showProfile)}
          className="w-7 h-7 rounded bg-gradient-to-br from-purple-500 to-pink-500 text-white text-[10px] font-bold">T</button>
      </div>
    </header>
  );

  // Stats Card
  const StatsCard = ({ title, value, sub, icon }) => (
    <div className="rounded-xl p-3" style={{ background: colors.card }}>
      <div className="text-xl mb-2">{icon}</div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-[10px] text-white/50">{title}</p>
      {sub && <p className="text-[9px] text-white/30">{sub}</p>}
    </div>
  );

  // Price Card
  const PriceCard = () => {
    if (!currentAsset) return null;
    const sig = currentAsset.signal;
    const hasSignal = sig?.action && !['WAIT', 'LOADING'].includes(sig.action);

    return (
      <div className="rounded-xl overflow-hidden" style={{ background: colors.card }}>
        {/* Header */}
        <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-xl">{currentAsset.emoji}</div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{currentAsset.name}</h3>
                {currentAsset.timeframe && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">{currentAsset.timeframe}</span>}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-white/40">{currentAsset.type}</p>
                {candles.length > 0 && <span className="flex items-center gap-1 text-[9px] text-emerald-400"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>Live</span>}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold font-mono text-white">{currentAsset.price?.toFixed(currentAsset.decimals) || '---'}</p>
            <p className="text-[10px] text-white/40">{currentAsset.demandZones || 0}D • {currentAsset.supplyZones || 0}S</p>
          </div>
        </div>

        {/* Chart */}
        <div className="p-2">
          <SimpleChart data={candles} height={260} />
        </div>

        {/* Signal */}
        {hasSignal && (
          <div className="p-3 border-t" style={{ borderColor: colors.border, background: 'rgba(16,185,129,0.05)' }}>
            <div className="flex items-center gap-3 mb-2">
              <span className={`px-2.5 py-1 rounded font-bold text-sm ${sig.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{sig.action}</span>
              <div>
                <p className="text-xs font-medium text-white">{sig.model}</p>
                <p className="text-[10px] text-white/50">Score: {sig.score}%</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-white/5 rounded p-2 text-center">
                <p className="text-[8px] text-white/40 uppercase">Entry</p>
                <p className="text-[10px] font-mono text-white">{sig.entry}</p>
              </div>
              <div className="bg-emerald-500/10 rounded p-2 text-center">
                <p className="text-[8px] text-emerald-400 uppercase">TP1</p>
                <p className="text-[10px] font-mono text-emerald-400">{sig.tp1}</p>
              </div>
              <div className="bg-emerald-500/10 rounded p-2 text-center">
                <p className="text-[8px] text-emerald-400 uppercase">TP2</p>
                <p className="text-[10px] font-mono text-emerald-400">{sig.tp2}</p>
              </div>
              <div className="bg-red-500/10 rounded p-2 text-center">
                <p className="text-[8px] text-red-400 uppercase">SL</p>
                <p className="text-[10px] font-mono text-red-400">{sig.stop}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // AI Panel
  const AIPanel = () => (
    <div className="rounded-xl flex flex-col h-[400px]" style={{ background: colors.card }}>
      <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: colors.border }}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <span className="text-white text-sm">🤖</span>
        </div>
        <div>
          <p className="text-xs font-medium text-white">AI Assistant</p>
          <p className="text-[9px] text-white/40">Análisis inteligente</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {aiChat.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-[10px] text-white/30 mb-3">Pregúntame sobre el mercado</p>
            <div className="flex flex-wrap gap-1 justify-center">
              {['¿Señal?', '¿Zonas?', '¿Setup?'].map(q => (
                <button key={q} onClick={() => { setChatInput(q); }}
                  className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] text-white/60">{q}</button>
              ))}
            </div>
          </div>
        ) : (
          aiChat.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-xl px-3 py-2 ${m.role === 'user' ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white'}`}>
                <p className="text-[11px] whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-3 border-t" style={{ borderColor: colors.border }}>
        <div className="flex gap-2">
          <input 
            type="text" 
            value={chatInput} 
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Escribe aquí..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white placeholder-white/30 focus:outline-none focus:border-emerald-500" 
          />
          <button onClick={sendMessage} className="px-3 bg-emerald-500 hover:bg-emerald-600 text-black rounded-lg">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  // Signal Card
  const SignalCard = ({ signal: s }) => (
    <div className="rounded-xl p-3" style={{ background: colors.card }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{s.emoji}</span>
          <div>
            <p className="text-xs font-medium text-white">{s.assetName}</p>
            <p className="text-[9px] text-white/40">{new Date(s.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{s.action}</span>
      </div>
      <div className="grid grid-cols-2 gap-1 mb-2">
        <div className="bg-white/5 rounded p-1.5">
          <p className="text-[8px] text-white/40">Entry</p>
          <p className="text-[10px] font-mono text-white">{s.entry}</p>
        </div>
        <div className="bg-red-500/10 rounded p-1.5">
          <p className="text-[8px] text-red-400">SL</p>
          <p className="text-[10px] font-mono text-red-400">{s.stop}</p>
        </div>
      </div>
      <div className="flex gap-1 mb-2">
        {['tp1', 'tp2', 'tp3'].map(tp => (
          <div key={tp} className={`flex-1 rounded p-1 text-center ${s[`${tp}Hit`] ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
            <p className="text-[8px] text-white/40">{tp.toUpperCase()}</p>
            <p className={`text-[9px] font-mono ${s[`${tp}Hit`] ? 'text-emerald-400' : 'text-white/50'}`}>{s[tp]}</p>
          </div>
        ))}
      </div>
      {s.status === 'PENDING' && (
        <div className="flex gap-1">
          <button onClick={() => markSignal(s.id, 'WIN')} className="flex-1 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded text-[10px]">Win</button>
          <button onClick={() => markSignal(s.id, 'LOSS')} className="flex-1 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded text-[10px]">Loss</button>
          <button onClick={() => markSignal(s.id, 'SKIP')} className="flex-1 py-1 bg-white/5 hover:bg-white/10 text-white/50 rounded text-[10px]">Skip</button>
        </div>
      )}
      {s.status !== 'PENDING' && (
        <div className={`py-1 rounded text-center text-[10px] font-medium ${s.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : s.status === 'LOSS' ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-white/50'}`}>{s.status}</div>
      )}
    </div>
  );

  // SECTIONS
  const DashboardSection = () => (
    <div className="space-y-4">
      {connectionError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
          <p className="text-xs text-red-400">⚠️ Error de conexión con el servidor</p>
          <p className="text-[10px] text-red-400/60">Verifica que el backend esté corriendo</p>
        </div>
      )}
      <div className="grid grid-cols-4 gap-3">
        <StatsCard title="Win Rate" value={`${data?.stats?.wins && data?.stats?.losses ? Math.round(data.stats.wins / (data.stats.wins + data.stats.losses) * 100) : 0}%`} icon="📊" />
        <StatsCard title="Activas" value={pendingSignals.length} sub="Pendientes" icon="🎯" />
        <StatsCard title="Wins" value={data?.stats?.wins || 0} sub={`de ${data?.stats?.total || 0}`} icon="✅" />
        <StatsCard title="TP3" value={data?.stats?.tp3Hits || 0} sub="Max profit" icon="💎" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2"><PriceCard /></div>
        <div><AIPanel /></div>
      </div>
      {pendingSignals.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-white mb-2">Señales Activas</h3>
          <div className="grid grid-cols-3 gap-3">
            {pendingSignals.slice(0, 3).map(s => <SignalCard key={s.id} signal={s} />)}
          </div>
        </div>
      )}
    </div>
  );

  const SignalsSection = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-white">Señales ({pendingSignals.length})</h3>
      {pendingSignals.length > 0 ? (
        <div className="grid grid-cols-3 gap-3">{pendingSignals.map(s => <SignalCard key={s.id} signal={s} />)}</div>
      ) : (
        <div className="text-center py-12 rounded-xl" style={{ background: colors.card }}>
          <p className="text-xs text-white/50">Sin señales activas</p>
        </div>
      )}
    </div>
  );

  const AnalysisSection = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-white">Análisis</h3>
      <div className="grid grid-cols-2 gap-4">
        {data?.assets?.map(a => (
          <div key={a.symbol} className="rounded-xl p-3" style={{ background: colors.card }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{a.emoji}</span>
                <div>
                  <p className="text-xs font-medium text-white">{a.name}</p>
                  <p className="text-sm font-bold font-mono text-white">{a.price?.toFixed(a.decimals) || '---'}</p>
                </div>
              </div>
              {a.signal?.action && !['WAIT', 'LOADING'].includes(a.signal.action) && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${a.signal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{a.signal.action}</span>
              )}
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between"><span className="text-white/50">Estructura</span><span className={a.signal?.analysis?.structure === 'BULLISH' ? 'text-emerald-400' : a.signal?.analysis?.structure === 'BEARISH' ? 'text-red-400' : 'text-white/50'}>{a.signal?.analysis?.structure || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-white/50">CHoCH</span><span className="text-cyan-400">{a.signal?.analysis?.choch || 'No'}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Zonas</span><span className="text-white/50">{a.demandZones || 0}D / {a.supplyZones || 0}S</span></div>
              <div className="flex justify-between"><span className="text-white/50">Score</span><span className="font-mono text-white/50">{a.signal?.score || 0}%</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const HistorySection = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-white">Historial</h3>
      <div className="rounded-xl overflow-hidden" style={{ background: colors.card }}>
        <table className="w-full">
          <thead><tr className="border-b text-left" style={{ borderColor: colors.border }}>
            <th className="p-3 text-[10px] text-white/50">Activo</th>
            <th className="p-3 text-[10px] text-white/50">Tipo</th>
            <th className="p-3 text-[10px] text-white/50">Entry</th>
            <th className="p-3 text-[10px] text-white/50">Resultado</th>
          </tr></thead>
          <tbody>
            {closedSignals.map(s => (
              <tr key={s.id} className="border-b" style={{ borderColor: colors.border }}>
                <td className="p-3"><span className="text-xs text-white">{s.emoji} {s.assetName}</span></td>
                <td className="p-3"><span className={`px-1 py-0.5 rounded text-[9px] ${s.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{s.action}</span></td>
                <td className="p-3 font-mono text-[10px] text-white/50">{s.entry}</td>
                <td className="p-3"><span className={`px-1 py-0.5 rounded text-[9px] ${s.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : s.status === 'LOSS' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/50'}`}>{s.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {closedSignals.length === 0 && <p className="p-6 text-center text-xs text-white/40">Sin historial</p>}
      </div>
    </div>
  );

  const StatsSection = () => {
    const wr = data?.stats?.wins && data?.stats?.losses ? Math.round(data.stats.wins / (data.stats.wins + data.stats.losses) * 100) : 0;
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white">Estadísticas</h3>
        <div className="grid grid-cols-4 gap-3">
          <StatsCard title="Total" value={data?.stats?.total || 0} icon="📊" />
          <StatsCard title="Wins" value={data?.stats?.wins || 0} icon="✅" />
          <StatsCard title="Losses" value={data?.stats?.losses || 0} icon="❌" />
          <StatsCard title="Win Rate" value={`${wr}%`} icon="🎯" />
        </div>
        <div className="rounded-xl p-4" style={{ background: colors.card }}>
          <div className="flex items-center gap-6">
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90">
                <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                <circle cx="48" cy="48" r="40" fill="none" stroke="#10b981" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${wr * 2.51} 251`} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-white">{wr}%</span>
                <span className="text-[9px] text-white/50">Win Rate</span>
              </div>
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <div className="flex justify-between mb-1 text-xs"><span className="text-white/50">Wins</span><span className="text-emerald-400">{data?.stats?.wins || 0}</span></div>
                <div className="h-2 bg-white/10 rounded-full"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${wr}%` }} /></div>
              </div>
              <div>
                <div className="flex justify-between mb-1 text-xs"><span className="text-white/50">Losses</span><span className="text-red-400">{data?.stats?.losses || 0}</span></div>
                <div className="h-2 bg-white/10 rounded-full"><div className="h-full bg-red-500 rounded-full" style={{ width: `${100 - wr}%` }} /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: colors.bg }}>
      <Sidebar />
      <main className={`transition-all ${sidebarOpen ? 'ml-52' : 'ml-14'}`}>
        <Header />
        <div className="p-4">
          {activeSection === 'dashboard' && <DashboardSection />}
          {activeSection === 'signals' && <SignalsSection />}
          {activeSection === 'analysis' && <AnalysisSection />}
          {activeSection === 'history' && <HistorySection />}
          {activeSection === 'stats' && <StatsSection />}
        </div>
      </main>
    </div>
  );
}
