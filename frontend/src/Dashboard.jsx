import React, { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// TRADING MASTER PRO v11.1
// Dashboard Profesional - Todo Funcional
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
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [candles, setCandles] = useState([]);
  const chatEndRef = useRef(null);

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/dashboard`);
      const json = await res.json();
      setData(json);
      if (!selectedAsset && json.assets?.length > 0) {
        setSelectedAsset(json.assets[0].symbol);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  }, [selectedAsset]);

  // Fetch candles for selected asset
  const fetchCandles = useCallback(async () => {
    if (!selectedAsset) return;
    try {
      const res = await fetch(`${API_URL}/api/analyze/${selectedAsset}`);
      const json = await res.json();
      if (json.candles) {
        setCandles(json.candles);
      }
    } catch (err) {
      console.error('Error fetching candles:', err);
    }
  }, [selectedAsset]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    fetchCandles();
    const interval = setInterval(fetchCandles, 5000);
    return () => clearInterval(interval);
  }, [fetchCandles]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChat]);

  // Apply theme
  useEffect(() => {
    document.documentElement.classList.toggle('light-theme', theme === 'light');
  }, [theme]);

  // Search functionality
  useEffect(() => {
    if (searchQuery.trim()) {
      const results = data?.assets?.filter(a => 
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.symbol.toLowerCase().includes(searchQuery.toLowerCase())
      ) || [];
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, data]);

  // Notifications
  const addNotification = (message, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [{ id, message, type, time: new Date() }, ...prev]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 10000);
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
    const question = chatInput;
    setChatInput('');
    
    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, symbol: selectedAsset })
      });
      const json = await res.json();
      setAiChat(prev => [...prev, { role: 'assistant', content: json.answer }]);
    } catch (err) {
      setAiChat(prev => [...prev, { role: 'assistant', content: 'Error al conectar con IA' }]);
    }
  };

  // Quick questions
  const askQuickQuestion = (q) => {
    setChatInput(q);
    setTimeout(() => sendMessage(), 100);
  };

  const currentAsset = data?.assets?.find(a => a.symbol === selectedAsset);
  const pendingSignals = data?.recentSignals?.filter(s => s.status === 'PENDING') || [];
  const closedSignals = data?.recentSignals?.filter(s => s.status !== 'PENDING') || [];

  // Theme colors
  const colors = theme === 'dark' ? {
    bg: '#06060a',
    card: '#12121a',
    border: 'rgba(255,255,255,0.05)',
    text: '#ffffff',
    textMuted: 'rgba(255,255,255,0.5)',
    textDim: 'rgba(255,255,255,0.3)',
  } : {
    bg: '#f5f5f7',
    card: '#ffffff',
    border: 'rgba(0,0,0,0.1)',
    text: '#1a1a1a',
    textMuted: 'rgba(0,0,0,0.6)',
    textDim: 'rgba(0,0,0,0.3)',
  };

  // =============================================
  // CANDLESTICK CHART COMPONENT
  // =============================================
  const CandlestickChart = ({ candles, height = 300, zones = [] }) => {
    const containerRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: 600, height });

    useEffect(() => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: height
        });
      }
    }, [containerRef, height]);

    if (!candles || candles.length === 0) {
      return (
        <div ref={containerRef} className="w-full flex items-center justify-center" style={{ height }}>
          <div className="text-center">
            <svg className="w-12 h-12 text-white/10 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            <p className={`text-sm ${theme === 'dark' ? 'text-white/30' : 'text-black/30'}`}>Cargando gráfico...</p>
          </div>
        </div>
      );
    }

    const { width } = dimensions;
    const padding = { top: 20, right: 60, bottom: 30, left: 10 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const displayCandles = candles.slice(-50);
    const candleWidth = Math.max(4, (chartWidth / displayCandles.length) * 0.7);
    const gap = (chartWidth / displayCandles.length) * 0.3;

    const allPrices = displayCandles.flatMap(c => [c.high, c.low]);
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice || 1;
    const priceScale = chartHeight / priceRange;

    const getY = (price) => padding.top + (maxPrice - price) * priceScale;

    // Get demand/supply zones from current asset
    const demandZones = currentAsset?.signal?.analysis?.demandZones ? 
      data?.assets?.find(a => a.symbol === selectedAsset)?.demandZones || [] : [];
    const supplyZones = currentAsset?.signal?.analysis?.supplyZones ?
      data?.assets?.find(a => a.symbol === selectedAsset)?.supplyZones || [] : [];

    return (
      <div ref={containerRef} className="w-full">
        <svg width={width} height={height} className="overflow-visible">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const y = padding.top + chartHeight * pct;
            const price = maxPrice - (priceRange * pct);
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke={theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
                  strokeDasharray="4,4"
                />
                <text
                  x={width - padding.right + 5}
                  y={y + 4}
                  fill={theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {price.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Candles */}
          {displayCandles.map((candle, i) => {
            const x = padding.left + i * (candleWidth + gap) + gap / 2;
            const isGreen = candle.close >= candle.open;
            const bodyTop = getY(Math.max(candle.open, candle.close));
            const bodyBottom = getY(Math.min(candle.open, candle.close));
            const bodyHeight = Math.max(1, bodyBottom - bodyTop);

            return (
              <g key={i}>
                {/* Wick */}
                <line
                  x1={x + candleWidth / 2}
                  y1={getY(candle.high)}
                  x2={x + candleWidth / 2}
                  y2={getY(candle.low)}
                  stroke={isGreen ? '#10b981' : '#ef4444'}
                  strokeWidth="1"
                />
                {/* Body */}
                <rect
                  x={x}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={isGreen ? '#10b981' : '#ef4444'}
                  rx="1"
                />
              </g>
            );
          })}

          {/* Current price line */}
          {displayCandles.length > 0 && (
            <g>
              <line
                x1={padding.left}
                y1={getY(displayCandles[displayCandles.length - 1].close)}
                x2={width - padding.right}
                y2={getY(displayCandles[displayCandles.length - 1].close)}
                stroke="#10b981"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
              <rect
                x={width - padding.right}
                y={getY(displayCandles[displayCandles.length - 1].close) - 10}
                width="55"
                height="20"
                fill="#10b981"
                rx="4"
              />
              <text
                x={width - padding.right + 27}
                y={getY(displayCandles[displayCandles.length - 1].close) + 4}
                fill="black"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                textAnchor="middle"
                fontWeight="bold"
              >
                {displayCandles[displayCandles.length - 1].close.toFixed(2)}
              </text>
            </g>
          )}

          {/* Entry/TP/SL lines if signal exists */}
          {currentAsset?.signal?.entry && (
            <>
              {/* Entry */}
              <line
                x1={padding.left}
                y1={getY(currentAsset.signal.entry)}
                x2={width - padding.right}
                y2={getY(currentAsset.signal.entry)}
                stroke="#3b82f6"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
              {/* TP1 */}
              <line
                x1={padding.left}
                y1={getY(currentAsset.signal.tp1)}
                x2={width - padding.right}
                y2={getY(currentAsset.signal.tp1)}
                stroke="#10b981"
                strokeWidth="1"
                opacity="0.5"
              />
              {/* SL */}
              <line
                x1={padding.left}
                y1={getY(currentAsset.signal.stop)}
                x2={width - padding.right}
                y2={getY(currentAsset.signal.stop)}
                stroke="#ef4444"
                strokeWidth="1"
                opacity="0.5"
              />
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
    <aside 
      className={`fixed left-0 top-0 h-full border-r transition-all duration-300 z-50 ${sidebarOpen ? 'w-64' : 'w-20'}`}
      style={{ 
        background: colors.card, 
        borderColor: colors.border 
      }}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b" style={{ borderColor: colors.border }}>
        {sidebarOpen ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
              <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight" style={{ color: colors.text }}>TradingPro</h1>
              <p className="text-[10px]" style={{ color: colors.textDim }}>SMC Intelligence</p>
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
          <svg className={`w-5 h-5 transition-transform ${!sidebarOpen ? 'rotate-180' : ''}`} style={{ color: colors.textMuted }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
              activeSection === item.id 
                ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-emerald-400' 
                : `hover:bg-white/5`
            }`}
            style={{ color: activeSection === item.id ? '#10b981' : colors.textMuted }}
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

      {/* Markets */}
      <div className="p-3 border-t" style={{ borderColor: colors.border }}>
        {sidebarOpen && <p className="text-[10px] uppercase tracking-wider mb-2 px-3" style={{ color: colors.textDim }}>Mercados</p>}
        <div className="space-y-1 max-h-[280px] overflow-y-auto">
          {data?.assets?.map(asset => (
            <button
              key={asset.symbol}
              onClick={() => setSelectedAsset(asset.symbol)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                selectedAsset === asset.symbol ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
              style={{ color: selectedAsset === asset.symbol ? colors.text : colors.textMuted }}
            >
              <span className="text-lg">{asset.emoji}</span>
              {sidebarOpen && (
                <>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium truncate">{asset.name.split(' ')[0]}</p>
                    <p className="text-[10px]" style={{ color: colors.textDim }}>{asset.price?.toFixed(asset.decimals)}</p>
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

      {/* Status */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t" style={{ borderColor: colors.border }}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${data?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {sidebarOpen && (
            <span className="text-xs" style={{ color: colors.textDim }}>
              {data?.connected ? 'Conectado' : 'Desconectado'}
            </span>
          )}
        </div>
      </div>
    </aside>
  );

  // =============================================
  // HEADER
  // =============================================
  const Header = () => (
    <header 
      className="h-16 backdrop-blur-xl border-b flex items-center justify-between px-6 sticky top-0 z-40"
      style={{ background: `${colors.card}cc`, borderColor: colors.border }}
    >
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold capitalize" style={{ color: colors.text }}>{activeSection}</h2>
        <span style={{ color: colors.textDim }}>|</span>
        <span className="text-sm" style={{ color: colors.textMuted }}>
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar activo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48 border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
            style={{ 
              background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              borderColor: colors.border,
              color: colors.text
            }}
          />
          <svg className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" style={{ color: colors.textDim }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          
          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border shadow-xl overflow-hidden" style={{ background: colors.card, borderColor: colors.border }}>
              {searchResults.map(asset => (
                <button
                  key={asset.symbol}
                  onClick={() => { setSelectedAsset(asset.symbol); setSearchQuery(''); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  <span>{asset.emoji}</span>
                  <span style={{ color: colors.text }}>{asset.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 hover:bg-white/5 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" style={{ color: colors.textMuted }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {pendingSignals.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                {pendingSignals.length}
              </span>
            )}
          </button>
          
          {showNotifications && (
            <div className="absolute top-full right-0 mt-2 w-80 rounded-xl border shadow-xl overflow-hidden" style={{ background: colors.card, borderColor: colors.border }}>
              <div className="p-3 border-b" style={{ borderColor: colors.border }}>
                <p className="font-medium" style={{ color: colors.text }}>Notificaciones</p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {pendingSignals.length === 0 ? (
                  <p className="p-4 text-sm text-center" style={{ color: colors.textMuted }}>No hay señales pendientes</p>
                ) : (
                  pendingSignals.map(sig => (
                    <div key={sig.id} className="p-3 border-b hover:bg-white/5" style={{ borderColor: colors.border }}>
                      <div className="flex items-center gap-2">
                        <span>{sig.emoji}</span>
                        <span className={sig.action === 'LONG' ? 'text-emerald-400' : 'text-red-400'}>{sig.action}</span>
                        <span style={{ color: colors.textMuted }}>{sig.assetName}</span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: colors.textDim }}>Score: {sig.score}%</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button 
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
          className="p-2 hover:bg-white/5 rounded-xl transition-colors"
        >
          {theme === 'dark' ? (
            <svg className="w-5 h-5" style={{ color: colors.textMuted }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" style={{ color: colors.textMuted }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* Profile */}
        <div className="relative pl-3 border-l" style={{ borderColor: colors.border }}>
          <button 
            onClick={() => setShowProfile(!showProfile)}
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm hover:opacity-90 transition-opacity"
          >
            T
          </button>
          
          {showProfile && (
            <div className="absolute top-full right-0 mt-2 w-48 rounded-xl border shadow-xl overflow-hidden" style={{ background: colors.card, borderColor: colors.border }}>
              <div className="p-3 border-b" style={{ borderColor: colors.border }}>
                <p className="font-medium" style={{ color: colors.text }}>Trader Pro</p>
                <p className="text-xs" style={{ color: colors.textDim }}>Plan Premium</p>
              </div>
              <button className="w-full px-4 py-3 text-left text-sm hover:bg-white/5 flex items-center gap-2" style={{ color: colors.textMuted }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Configuración
              </button>
              <button className="w-full px-4 py-3 text-left text-sm hover:bg-white/5 flex items-center gap-2 text-red-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );

  // Stats Card
  const StatsCard = ({ title, value, subtitle, icon, trend }) => (
    <div 
      className="rounded-2xl p-5 border hover:border-opacity-20 transition-all"
      style={{ background: colors.card, borderColor: colors.border }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <span className="text-2xl">{icon}</span>
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-medium px-2 py-1 rounded-lg ${trend >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <p className="text-3xl font-bold mb-1" style={{ color: colors.text }}>{value}</p>
      <p className="text-sm" style={{ color: colors.textMuted }}>{title}</p>
      {subtitle && <p className="text-xs mt-1" style={{ color: colors.textDim }}>{subtitle}</p>}
    </div>
  );

  // Price Card
  const PriceCard = () => {
    if (!currentAsset) return null;
    const signal = currentAsset.signal;
    const hasSignal = signal?.action && !['WAIT', 'LOADING'].includes(signal.action);

    return (
      <div className="rounded-2xl border overflow-hidden" style={{ background: colors.card, borderColor: colors.border }}>
        {/* Header */}
        <div className="p-5 border-b" style={{ borderColor: colors.border }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-3xl">
                {currentAsset.emoji}
              </div>
              <div>
                <h3 className="text-xl font-bold" style={{ color: colors.text }}>{currentAsset.name}</h3>
                <p className="text-sm" style={{ color: colors.textMuted }}>{currentAsset.type} • M5</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold font-mono" style={{ color: colors.text }}>
                {currentAsset.price?.toFixed(currentAsset.decimals)}
              </p>
              <p className="text-sm" style={{ color: colors.textMuted }}>
                {currentAsset.demandZones || 0} demanda • {currentAsset.supplyZones || 0} oferta
              </p>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="p-2">
          <CandlestickChart candles={candles} height={280} />
        </div>

        {/* Signal */}
        {hasSignal && (
          <div className="p-5 border-t bg-gradient-to-r from-emerald-500/5 to-transparent" style={{ borderColor: colors.border }}>
            <div className="flex items-center gap-4 mb-4">
              <div className={`px-4 py-2 rounded-xl font-bold text-lg ${
                signal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'
              }`}>
                {signal.action}
              </div>
              <div>
                <p className="font-medium" style={{ color: colors.text }}>{signal.model}</p>
                <p className="text-sm" style={{ color: colors.textMuted }}>Score: {signal.score}%</p>
              </div>
              <div className="ml-auto">
                <div className="w-16 h-16 relative">
                  <svg className="w-16 h-16 -rotate-90">
                    <circle cx="32" cy="32" r="28" fill="none" stroke={colors.border} strokeWidth="4" />
                    <circle cx="32" cy="32" r="28" fill="none" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${signal.score * 1.76} 176`} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center font-bold" style={{ color: colors.text }}>{signal.score}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-xl p-3 text-center" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textMuted }}>Entry</p>
                <p className="font-mono font-medium" style={{ color: colors.text }}>{signal.entry}</p>
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
      </div>
    );
  };

  // AI Panel
  const AIPanel = () => (
    <div className="rounded-2xl border flex flex-col h-[500px]" style={{ background: colors.card, borderColor: colors.border }}>
      <div className="p-4 border-b flex items-center gap-3" style={{ borderColor: colors.border }}>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="font-medium" style={{ color: colors.text }}>AI Assistant</p>
          <p className="text-xs" style={{ color: colors.textDim }}>Análisis inteligente</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {aiChat.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm mb-4" style={{ color: colors.textDim }}>Pregúntame sobre señales, zonas o análisis</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {['¿Señal?', '¿Zonas?', '¿Setup?'].map(q => (
                <button
                  key={q}
                  onClick={() => askQuickQuestion(q)}
                  className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/10"
                  style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', color: colors.textMuted }}
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
                msg.role === 'user' ? 'bg-emerald-500 text-black' : ''
              }`} style={msg.role === 'assistant' ? { background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', color: colors.text } : {}}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 border-t" style={{ borderColor: colors.border }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Escribe tu pregunta..."
            className="flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            style={{ 
              background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              borderColor: colors.border,
              color: colors.text
            }}
          />
          <button onClick={sendMessage} className="px-4 bg-emerald-500 hover:bg-emerald-600 text-black rounded-xl transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  // Signal Card
  const SignalCard = ({ signal }) => (
    <div className="rounded-2xl border overflow-hidden hover:border-opacity-20 transition-all" style={{ background: colors.card, borderColor: colors.border }}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{signal.emoji}</span>
            <div>
              <p className="font-medium" style={{ color: colors.text }}>{signal.assetName}</p>
              <p className="text-xs" style={{ color: colors.textDim }}>
                {new Date(signal.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <span className={`px-3 py-1.5 rounded-lg font-bold text-sm ${signal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>
            {signal.action}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="rounded-lg p-2" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
            <p className="text-[10px]" style={{ color: colors.textDim }}>Entry</p>
            <p className="text-sm font-mono" style={{ color: colors.text }}>{signal.entry}</p>
          </div>
          <div className="bg-red-500/10 rounded-lg p-2">
            <p className="text-[10px] text-red-400">Stop</p>
            <p className="text-sm text-red-400 font-mono">{signal.stop}</p>
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          {[{ k: 'tp1', v: signal.tp1 }, { k: 'tp2', v: signal.tp2 }, { k: 'tp3', v: signal.tp3 }].map(({ k, v }) => (
            <div key={k} className={`flex-1 rounded-lg p-2 text-center ${signal[`${k}Hit`] ? 'bg-emerald-500/20' : ''}`} style={!signal[`${k}Hit`] ? { background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' } : {}}>
              <p className="text-[10px]" style={{ color: colors.textDim }}>{k.toUpperCase()}</p>
              <p className={`text-xs font-mono ${signal[`${k}Hit`] ? 'text-emerald-400' : ''}`} style={!signal[`${k}Hit`] ? { color: colors.textMuted } : {}}>{v}</p>
            </div>
          ))}
        </div>

        {signal.status === 'PENDING' && (
          <div className="flex gap-2">
            <button onClick={() => markSignal(signal.id, 'WIN')} className="flex-1 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-sm font-medium transition-colors">✓ Win</button>
            <button onClick={() => markSignal(signal.id, 'LOSS')} className="flex-1 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm font-medium transition-colors">✗ Loss</button>
            <button onClick={() => markSignal(signal.id, 'SKIP')} className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/10" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', color: colors.textMuted }}>Skip</button>
          </div>
        )}

        {signal.status !== 'PENDING' && (
          <div className={`py-2 rounded-lg text-center font-medium ${signal.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : signal.status === 'LOSS' ? 'bg-red-500/20 text-red-400' : ''}`} style={signal.status === 'SKIP' ? { background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', color: colors.textMuted } : {}}>
            {signal.status}
          </div>
        )}
      </div>
    </div>
  );

  // Sections
  const DashboardSection = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatsCard title="Win Rate" value={`${data?.stats?.wins && data?.stats?.losses ? Math.round(data.stats.wins / (data.stats.wins + data.stats.losses) * 100) : 0}%`} icon="📊" trend={5} />
        <StatsCard title="Señales Activas" value={pendingSignals.length} subtitle="Pendientes de resultado" icon="🎯" />
        <StatsCard title="Victorias" value={data?.stats?.wins || 0} subtitle={`de ${data?.stats?.total || 0} totales`} icon="✅" />
        <StatsCard title="TP3 Alcanzados" value={data?.stats?.tp3Hits || 0} subtitle="Máximo profit" icon="💎" />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2"><PriceCard /></div>
        <div><AIPanel /></div>
      </div>

      {pendingSignals.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4" style={{ color: colors.text }}>Señales Activas</h3>
          <div className="grid grid-cols-3 gap-4">
            {pendingSignals.slice(0, 3).map(signal => <SignalCard key={signal.id} signal={signal} />)}
          </div>
        </div>
      )}
    </div>
  );

  const SignalsSection = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold" style={{ color: colors.text }}>Todas las Señales</h3>
      <div className="grid grid-cols-3 gap-4">
        {pendingSignals.map(signal => <SignalCard key={signal.id} signal={signal} />)}
      </div>
      {pendingSignals.length === 0 && (
        <div className="text-center py-16 rounded-2xl border" style={{ background: colors.card, borderColor: colors.border }}>
          <p style={{ color: colors.textMuted }}>No hay señales activas</p>
        </div>
      )}
    </div>
  );

  const AnalysisSection = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold" style={{ color: colors.text }}>Análisis de Mercado</h3>
      <div className="grid grid-cols-2 gap-6">
        {data?.assets?.map(asset => (
          <div key={asset.symbol} className="rounded-2xl border p-5" style={{ background: colors.card, borderColor: colors.border }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{asset.emoji}</span>
                <div>
                  <p className="font-medium" style={{ color: colors.text }}>{asset.name}</p>
                  <p className="text-xl font-bold font-mono" style={{ color: colors.text }}>{asset.price?.toFixed(asset.decimals)}</p>
                </div>
              </div>
              {asset.signal?.action && !['WAIT', 'LOADING'].includes(asset.signal.action) && (
                <span className={`px-3 py-1.5 rounded-lg font-bold ${asset.signal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{asset.signal.action}</span>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span style={{ color: colors.textMuted }}>Estructura</span><span className={asset.signal?.analysis?.structure === 'BULLISH' ? 'text-emerald-400' : asset.signal?.analysis?.structure === 'BEARISH' ? 'text-red-400' : ''} style={!asset.signal?.analysis?.structure || asset.signal?.analysis?.structure === 'NEUTRAL' ? { color: colors.textMuted } : {}}>{asset.signal?.analysis?.structure || 'NEUTRAL'}</span></div>
              <div className="flex justify-between"><span style={{ color: colors.textMuted }}>CHoCH</span><span className="text-cyan-400">{asset.signal?.analysis?.choch || 'No'}</span></div>
              <div className="flex justify-between"><span style={{ color: colors.textMuted }}>Zonas</span><span style={{ color: colors.textMuted }}>{asset.demandZones}D / {asset.supplyZones}S</span></div>
              <div className="flex justify-between items-center"><span style={{ color: colors.textMuted }}>Score</span><div className="flex items-center gap-2"><div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: colors.border }}><div className={`h-full rounded-full ${(asset.signal?.score || 0) >= 70 ? 'bg-emerald-500' : (asset.signal?.score || 0) >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${asset.signal?.score || 0}%` }} /></div><span className="font-mono" style={{ color: colors.textMuted }}>{asset.signal?.score || 0}%</span></div></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const HistorySection = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold" style={{ color: colors.text }}>Historial de Señales</h3>
      <div className="rounded-2xl border overflow-hidden" style={{ background: colors.card, borderColor: colors.border }}>
        <table className="w-full">
          <thead><tr className="border-b" style={{ borderColor: colors.border }}><th className="text-left text-xs font-medium p-4" style={{ color: colors.textMuted }}>Activo</th><th className="text-left text-xs font-medium p-4" style={{ color: colors.textMuted }}>Tipo</th><th className="text-left text-xs font-medium p-4" style={{ color: colors.textMuted }}>Entry</th><th className="text-left text-xs font-medium p-4" style={{ color: colors.textMuted }}>Resultado</th><th className="text-left text-xs font-medium p-4" style={{ color: colors.textMuted }}>Fecha</th></tr></thead>
          <tbody>
            {closedSignals.map(sig => (
              <tr key={sig.id} className="border-b hover:bg-white/5" style={{ borderColor: colors.border }}>
                <td className="p-4"><div className="flex items-center gap-2"><span>{sig.emoji}</span><span className="text-sm" style={{ color: colors.text }}>{sig.assetName}</span></div></td>
                <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-medium ${sig.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{sig.action}</span></td>
                <td className="p-4 font-mono text-sm" style={{ color: colors.textMuted }}>{sig.entry}</td>
                <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-medium ${sig.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : sig.status === 'LOSS' ? 'bg-red-500/20 text-red-400' : ''}`} style={sig.status === 'SKIP' ? { background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', color: colors.textMuted } : {}}>{sig.status}</span></td>
                <td className="p-4 text-sm" style={{ color: colors.textDim }}>{new Date(sig.timestamp).toLocaleDateString('es-ES')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {closedSignals.length === 0 && <p className="p-8 text-center" style={{ color: colors.textMuted }}>No hay historial</p>}
      </div>
    </div>
  );

  const StatsSection = () => {
    const winRate = data?.stats?.wins && data?.stats?.losses ? Math.round(data.stats.wins / (data.stats.wins + data.stats.losses) * 100) : 0;
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold" style={{ color: colors.text }}>Estadísticas</h3>
        <div className="grid grid-cols-4 gap-4">
          <StatsCard title="Total Señales" value={data?.stats?.total || 0} icon="📊" />
          <StatsCard title="Victorias" value={data?.stats?.wins || 0} icon="✅" />
          <StatsCard title="Pérdidas" value={data?.stats?.losses || 0} icon="❌" />
          <StatsCard title="Win Rate" value={`${winRate}%`} icon="🎯" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <StatsCard title="TP1 Alcanzados" value={data?.stats?.tp1Hits || 0} icon="1️⃣" subtitle="Ratio 1:1" />
          <StatsCard title="TP2 Alcanzados" value={data?.stats?.tp2Hits || 0} icon="2️⃣" subtitle="Ratio 1:2" />
          <StatsCard title="TP3 Alcanzados" value={data?.stats?.tp3Hits || 0} icon="3️⃣" subtitle="Ratio 1:3" />
        </div>
        <div className="rounded-2xl border p-6" style={{ background: colors.card, borderColor: colors.border }}>
          <h4 className="font-medium mb-6" style={{ color: colors.text }}>Rendimiento General</h4>
          <div className="flex items-center gap-8">
            <div className="relative w-40 h-40">
              <svg className="w-40 h-40 -rotate-90"><circle cx="80" cy="80" r="70" fill="none" stroke={colors.border} strokeWidth="12" /><circle cx="80" cy="80" r="70" fill="none" stroke="#10b981" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${winRate * 4.4} 440`} /></svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-4xl font-bold" style={{ color: colors.text }}>{winRate}%</span><span className="text-sm" style={{ color: colors.textMuted }}>Win Rate</span></div>
            </div>
            <div className="flex-1 space-y-4">
              <div><div className="flex justify-between mb-2"><span style={{ color: colors.textMuted }}>Victorias</span><span className="text-emerald-400 font-medium">{data?.stats?.wins || 0}</span></div><div className="h-2 rounded-full overflow-hidden" style={{ background: colors.border }}><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${winRate}%` }} /></div></div>
              <div><div className="flex justify-between mb-2"><span style={{ color: colors.textMuted }}>Pérdidas</span><span className="text-red-400 font-medium">{data?.stats?.losses || 0}</span></div><div className="h-2 rounded-full overflow-hidden" style={{ background: colors.border }}><div className="h-full bg-red-500 rounded-full" style={{ width: `${100 - winRate}%` }} /></div></div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Main Render
  return (
    <div className="min-h-screen transition-colors duration-300" style={{ background: colors.bg }}>
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
    </div>
  );
}
