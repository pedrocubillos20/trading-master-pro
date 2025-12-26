import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// TRADING MASTER PRO v11.3
// - Fix parpadeo gráfico
// - Alertas de cierre
// - Sin Volatility 100
// =============================================

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [aiChat, setAiChat] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [candles, setCandles] = useState([]);
  const [isLoadingCandles, setIsLoadingCandles] = useState(true);
  const chatEndRef = useRef(null);
  const candlesRef = useRef([]);

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
      console.error('Error:', err);
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
        // Solo actualizar si hay cambios reales
        if (JSON.stringify(json.candles) !== JSON.stringify(candlesRef.current)) {
          candlesRef.current = json.candles;
          setCandles(json.candles);
        }
      }
      setIsLoadingCandles(false);
    } catch (err) {
      setIsLoadingCandles(false);
    }
  }, [selectedAsset]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (selectedAsset) {
      setIsLoadingCandles(true);
      candlesRef.current = [];
      fetchCandles();
      const interval = setInterval(fetchCandles, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedAsset, fetchCandles]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChat]);

  // Search
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return data?.assets?.filter(a => 
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.symbol.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];
  }, [searchQuery, data]);

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
    const question = chatInput;
    setAiChat(prev => [...prev, { role: 'user', content: question }]);
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
      setAiChat(prev => [...prev, { role: 'assistant', content: '❌ Error de conexión' }]);
    }
  };

  const currentAsset = data?.assets?.find(a => a.symbol === selectedAsset);
  const pendingSignals = data?.recentSignals?.filter(s => s.status === 'PENDING') || [];
  const closedSignals = data?.recentSignals?.filter(s => s.status !== 'PENDING') || [];

  const colors = theme === 'dark' ? {
    bg: '#06060a', card: '#12121a', border: 'rgba(255,255,255,0.05)',
    text: '#ffffff', textMuted: 'rgba(255,255,255,0.5)', textDim: 'rgba(255,255,255,0.3)',
  } : {
    bg: '#f5f5f7', card: '#ffffff', border: 'rgba(0,0,0,0.1)',
    text: '#1a1a1a', textMuted: 'rgba(0,0,0,0.6)', textDim: 'rgba(0,0,0,0.3)',
  };

  // =============================================
  // CANDLESTICK CHART - Memoizado para evitar parpadeo
  // =============================================
  const CandlestickChart = useMemo(() => {
    return function Chart({ height = 280 }) {
      const containerRef = useRef(null);
      const [width, setWidth] = useState(700);

      useEffect(() => {
        const updateWidth = () => {
          if (containerRef.current) {
            setWidth(containerRef.current.offsetWidth || 700);
          }
        };
        updateWidth();
        window.addEventListener('resize', updateWidth);
        const t = setTimeout(updateWidth, 100);
        return () => { window.removeEventListener('resize', updateWidth); clearTimeout(t); };
      }, []);

      if (isLoadingCandles && candles.length === 0) {
        return (
          <div ref={containerRef} className="w-full flex items-center justify-center" style={{ height }}>
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-sm" style={{ color: colors.textDim }}>Conectando...</p>
            </div>
          </div>
        );
      }

      if (candles.length === 0) {
        return (
          <div ref={containerRef} className="w-full flex items-center justify-center" style={{ height }}>
            <div className="text-center">
              <p className="text-sm" style={{ color: colors.textDim }}>Sin datos</p>
            </div>
          </div>
        );
      }

      const padding = { top: 15, right: 60, bottom: 20, left: 5 };
      const chartWidth = Math.max(100, width - padding.left - padding.right);
      const chartHeight = Math.max(100, height - padding.top - padding.bottom);

      const displayCandles = candles.slice(-50);
      const candleW = Math.max(4, Math.min(10, (chartWidth / displayCandles.length) * 0.75));
      const gap = (chartWidth / displayCandles.length) - candleW;

      const prices = displayCandles.flatMap(c => [c.high, c.low]);
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);
      const range = (maxP - minP) || 1;
      const pad = range * 0.08;
      const adjMin = minP - pad;
      const adjMax = maxP + pad;
      const adjRange = adjMax - adjMin;
      const scale = chartHeight / adjRange;

      const getY = (p) => padding.top + (adjMax - p) * scale;
      const lastPrice = displayCandles[displayCandles.length - 1]?.close;

      return (
        <div ref={containerRef} className="w-full">
          <svg width={width} height={height}>
            {/* Grid */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
              const price = adjMax - (adjRange * pct);
              const y = getY(price);
              return (
                <g key={i}>
                  <line x1={padding.left} y1={y} x2={width - padding.right} y2={y}
                    stroke={theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'} />
                  <text x={width - padding.right + 4} y={y + 3} fill={colors.textDim}
                    fontSize="9" fontFamily="monospace">{price.toFixed(2)}</text>
                </g>
              );
            })}

            {/* Candles */}
            {displayCandles.map((c, i) => {
              const x = padding.left + i * (candleW + gap) + gap / 2;
              const isGreen = c.close >= c.open;
              const top = getY(Math.max(c.open, c.close));
              const bottom = getY(Math.min(c.open, c.close));
              const bodyH = Math.max(1, bottom - top);
              const color = isGreen ? '#10b981' : '#ef4444';

              return (
                <g key={i}>
                  <line x1={x + candleW / 2} y1={getY(c.high)} x2={x + candleW / 2} y2={getY(c.low)}
                    stroke={color} strokeWidth="1" />
                  <rect x={x} y={top} width={candleW} height={bodyH} fill={color} rx="1" />
                </g>
              );
            })}

            {/* Price line */}
            {lastPrice && (
              <g>
                <line x1={padding.left} y1={getY(lastPrice)} x2={width - padding.right} y2={getY(lastPrice)}
                  stroke="#10b981" strokeWidth="1" strokeDasharray="3,3" />
                <rect x={width - padding.right} y={getY(lastPrice) - 9} width="52" height="18"
                  fill="#10b981" rx="3" />
                <text x={width - padding.right + 26} y={getY(lastPrice) + 4} fill="black"
                  fontSize="10" fontFamily="monospace" textAnchor="middle" fontWeight="bold">
                  {lastPrice.toFixed(2)}
                </text>
              </g>
            )}

            {/* Signal lines */}
            {currentAsset?.signal?.entry && !['WAIT', 'LOADING'].includes(currentAsset.signal.action) && (
              <>
                <line x1={padding.left} y1={getY(currentAsset.signal.entry)} x2={width - padding.right} y2={getY(currentAsset.signal.entry)}
                  stroke="#3b82f6" strokeWidth="1" strokeDasharray="2,2" opacity="0.7" />
                <line x1={padding.left} y1={getY(currentAsset.signal.tp1)} x2={width - padding.right} y2={getY(currentAsset.signal.tp1)}
                  stroke="#10b981" strokeWidth="1" opacity="0.4" />
                <line x1={padding.left} y1={getY(currentAsset.signal.stop)} x2={width - padding.right} y2={getY(currentAsset.signal.stop)}
                  stroke="#ef4444" strokeWidth="1" opacity="0.4" />
              </>
            )}
          </svg>
        </div>
      );
    };
  }, [candles, isLoadingCandles, currentAsset, theme, colors]);

  // =============================================
  // SIDEBAR
  // =============================================
  const Sidebar = () => (
    <aside className={`fixed left-0 top-0 h-full border-r transition-all duration-300 z-50 ${sidebarOpen ? 'w-60' : 'w-16'}`}
      style={{ background: colors.card, borderColor: colors.border }}>
      
      <div className="h-14 flex items-center justify-between px-3 border-b" style={{ borderColor: colors.border }}>
        {sidebarOpen ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
              <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-sm" style={{ color: colors.text }}>TradingPro</h1>
              <p className="text-[9px]" style={{ color: colors.textDim }}>v11.3</p>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 mx-auto rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
            <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        )}
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 hover:bg-white/5 rounded-lg">
          <svg className={`w-4 h-4 transition-transform ${!sidebarOpen ? 'rotate-180' : ''}`} style={{ color: colors.textMuted }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <nav className="p-2 space-y-0.5">
        {[
          { id: 'dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', label: 'Dashboard' },
          { id: 'signals', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9', label: 'Señales', badge: pendingSignals.length },
          { id: 'analysis', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', label: 'Análisis' },
          { id: 'history', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Historial' },
          { id: 'stats', icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', label: 'Stats' },
        ].map(item => (
          <button key={item.id} onClick={() => setActiveSection(item.id)}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all ${
              activeSection === item.id ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-white/5'
            }`} style={{ color: activeSection === item.id ? '#10b981' : colors.textMuted }}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
            </svg>
            {sidebarOpen && (
              <>
                <span className="text-sm">{item.label}</span>
                {item.badge > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500 text-black rounded-full">{item.badge}</span>
                )}
              </>
            )}
          </button>
        ))}
      </nav>

      <div className="p-2 border-t" style={{ borderColor: colors.border }}>
        {sidebarOpen && <p className="text-[9px] uppercase tracking-wider mb-1.5 px-2" style={{ color: colors.textDim }}>Mercados</p>}
        <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
          {data?.assets?.map(asset => (
            <button key={asset.symbol} onClick={() => { setSelectedAsset(asset.symbol); setCandles([]); }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all ${
                selectedAsset === asset.symbol ? 'bg-white/10' : 'hover:bg-white/5'
              }`} style={{ color: selectedAsset === asset.symbol ? colors.text : colors.textMuted }}>
              <span className="text-base">{asset.emoji}</span>
              {sidebarOpen && (
                <>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-medium truncate">{asset.shortName || asset.name.split(' ')[0]}</p>
                      {asset.timeframe && <span className="text-[9px] px-1 py-0.5 rounded bg-white/10">{asset.timeframe}</span>}
                    </div>
                    <p className="text-[10px] font-mono" style={{ color: colors.textDim }}>{asset.price?.toFixed(2) || '---'}</p>
                  </div>
                  {asset.signal?.action && !['WAIT', 'LOADING'].includes(asset.signal.action) && (
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                      asset.signal.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>{asset.signal.action}</span>
                  )}
                  {asset.structureAlert && (
                    <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-3 border-t" style={{ borderColor: colors.border }}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${data?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {sidebarOpen && <span className="text-[10px]" style={{ color: colors.textDim }}>{data?.connected ? 'Live' : 'Offline'}</span>}
        </div>
      </div>
    </aside>
  );

  // =============================================
  // HEADER
  // =============================================
  const Header = () => (
    <header className="h-14 backdrop-blur-xl border-b flex items-center justify-between px-4 sticky top-0 z-40"
      style={{ background: `${colors.card}dd`, borderColor: colors.border }}>
      
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold capitalize" style={{ color: colors.text }}>{activeSection}</h2>
        <span className="text-xs" style={{ color: colors.textDim }}>
          {new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <input type="text" placeholder="Buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-36 border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            style={{ background: 'rgba(255,255,255,0.05)', borderColor: colors.border, color: colors.text }} />
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-xl overflow-hidden z-50"
              style={{ background: colors.card, borderColor: colors.border }}>
              {searchResults.map(a => (
                <button key={a.symbol} onClick={() => { setSelectedAsset(a.symbol); setSearchQuery(''); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left">
                  <span>{a.emoji}</span>
                  <span className="text-xs" style={{ color: colors.text }}>{a.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button onClick={() => setShowNotifications(!showNotifications)} className="p-1.5 hover:bg-white/5 rounded-lg relative">
            <svg className="w-4 h-4" style={{ color: colors.textMuted }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {pendingSignals.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-emerald-500 text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                {pendingSignals.length}
              </span>
            )}
          </button>
          {showNotifications && (
            <div className="absolute top-full right-0 mt-1 w-72 rounded-lg border shadow-xl overflow-hidden z-50"
              style={{ background: colors.card, borderColor: colors.border }}>
              <div className="p-2 border-b" style={{ borderColor: colors.border }}>
                <p className="text-xs font-medium" style={{ color: colors.text }}>Señales Activas</p>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {pendingSignals.length === 0 ? (
                  <p className="p-3 text-xs text-center" style={{ color: colors.textMuted }}>Sin señales</p>
                ) : (
                  pendingSignals.map(s => (
                    <div key={s.id} className="p-2 border-b hover:bg-white/5" style={{ borderColor: colors.border }}>
                      <div className="flex items-center gap-2">
                        <span>{s.emoji}</span>
                        <span className={`text-xs font-medium ${s.action === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>{s.action}</span>
                        <span className="text-xs" style={{ color: colors.textMuted }}>{s.assetName}</span>
                        <span className="ml-auto text-[10px]" style={{ color: colors.textDim }}>{s.score}%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-1.5 hover:bg-white/5 rounded-lg">
          {theme === 'dark' ? (
            <svg className="w-4 h-4" style={{ color: colors.textMuted }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" style={{ color: colors.textMuted }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        <div className="relative pl-2 border-l" style={{ borderColor: colors.border }}>
          <button onClick={() => setShowProfile(!showProfile)}
            className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs">T</button>
          {showProfile && (
            <div className="absolute top-full right-0 mt-1 w-40 rounded-lg border shadow-xl overflow-hidden z-50"
              style={{ background: colors.card, borderColor: colors.border }}>
              <div className="p-2 border-b" style={{ borderColor: colors.border }}>
                <p className="text-xs font-medium" style={{ color: colors.text }}>Trader</p>
              </div>
              <button className="w-full px-3 py-2 text-left text-xs hover:bg-white/5 flex items-center gap-2" style={{ color: colors.textMuted }}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Config
              </button>
              <button className="w-full px-3 py-2 text-left text-xs hover:bg-white/5 flex items-center gap-2 text-red-400">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Salir
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );

  // Stats Card
  const StatsCard = ({ title, value, sub, icon }) => (
    <div className="rounded-xl p-4 border" style={{ background: colors.card, borderColor: colors.border }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-xl">{icon}</div>
      </div>
      <p className="text-2xl font-bold" style={{ color: colors.text }}>{value}</p>
      <p className="text-xs" style={{ color: colors.textMuted }}>{title}</p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: colors.textDim }}>{sub}</p>}
    </div>
  );

  // Price Card
  const PriceCard = () => {
    if (!currentAsset) return null;
    const sig = currentAsset.signal;
    const hasSignal = sig?.action && !['WAIT', 'LOADING'].includes(sig.action);

    return (
      <div className="rounded-xl border overflow-hidden" style={{ background: colors.card, borderColor: colors.border }}>
        <div className="p-4 border-b" style={{ borderColor: colors.border }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-2xl">{currentAsset.emoji}</div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold" style={{ color: colors.text }}>{currentAsset.name}</h3>
                  {currentAsset.timeframe && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">{currentAsset.timeframe}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs" style={{ color: colors.textMuted }}>{currentAsset.type}</p>
                  {candles.length > 0 && <span className="flex items-center gap-1 text-[10px] text-emerald-400"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>Live</span>}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono" style={{ color: colors.text }}>{currentAsset.price?.toFixed(currentAsset.decimals) || '---'}</p>
              <p className="text-xs" style={{ color: colors.textMuted }}>{currentAsset.demandZones || 0}D • {currentAsset.supplyZones || 0}S</p>
            </div>
          </div>
        </div>

        {/* ALERTA DE ESTRUCTURA */}
        {currentAsset.structureAlert && (
          <div className="px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20">
            <p className="text-xs text-yellow-400 font-medium">⚠️ {currentAsset.structureAlert.message}</p>
          </div>
        )}

        <div className="p-2" style={{ minHeight: 280 }}>
          <CandlestickChart height={280} />
        </div>

        {hasSignal && (
          <div className="p-4 border-t bg-gradient-to-r from-emerald-500/5 to-transparent" style={{ borderColor: colors.border }}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`px-3 py-1.5 rounded-lg font-bold ${sig.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{sig.action}</div>
              <div>
                <p className="text-sm font-medium" style={{ color: colors.text }}>{sig.model}</p>
                <p className="text-xs" style={{ color: colors.textMuted }}>Score: {sig.score}%</p>
              </div>
              <div className="ml-auto w-12 h-12 relative">
                <svg className="w-12 h-12 -rotate-90">
                  <circle cx="24" cy="24" r="20" fill="none" stroke={colors.border} strokeWidth="3" />
                  <circle cx="24" cy="24" r="20" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${sig.score * 1.26} 126`} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: colors.text }}>{sig.score}</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <p className="text-[9px] uppercase" style={{ color: colors.textDim }}>Entry</p>
                <p className="text-xs font-mono" style={{ color: colors.text }}>{sig.entry}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
                <p className="text-[9px] text-emerald-400 uppercase">TP1</p>
                <p className="text-xs text-emerald-400 font-mono">{sig.tp1}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
                <p className="text-[9px] text-emerald-400 uppercase">TP2</p>
                <p className="text-xs text-emerald-400 font-mono">{sig.tp2}</p>
              </div>
              <div className="bg-red-500/10 rounded-lg p-2 text-center">
                <p className="text-[9px] text-red-400 uppercase">SL</p>
                <p className="text-xs text-red-400 font-mono">{sig.stop}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // AI Panel
  const AIPanel = () => (
    <div className="rounded-xl border flex flex-col" style={{ background: colors.card, borderColor: colors.border, height: 450 }}>
      <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: colors.border }}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: colors.text }}>AI Assistant</p>
          <p className="text-[10px]" style={{ color: colors.textDim }}>Análisis inteligente</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {aiChat.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs mb-3" style={{ color: colors.textDim }}>Pregúntame sobre el mercado</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {['¿Señal?', '¿Zonas?', '¿Setup?'].map(q => (
                <button key={q} onClick={() => { setChatInput(q); setTimeout(() => sendMessage(), 50); }}
                  className="px-2.5 py-1 rounded-lg text-xs hover:bg-white/10" style={{ background: 'rgba(255,255,255,0.05)', color: colors.textMuted }}>{q}</button>
              ))}
            </div>
          </div>
        ) : (
          aiChat.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-xl px-3 py-2 ${m.role === 'user' ? 'bg-emerald-500 text-black' : ''}`}
                style={m.role === 'assistant' ? { background: 'rgba(255,255,255,0.05)', color: colors.text } : {}}>
                <p className="text-xs whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-3 border-t" style={{ borderColor: colors.border }}>
        <div className="flex gap-2">
          <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Pregunta..."
            className="flex-1 border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            style={{ background: 'rgba(255,255,255,0.05)', borderColor: colors.border, color: colors.text }} />
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
    <div className="rounded-xl border overflow-hidden" style={{ background: colors.card, borderColor: colors.border }}>
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{s.emoji}</span>
            <div>
              <p className="text-sm font-medium" style={{ color: colors.text }}>{s.assetName}</p>
              <p className="text-[10px]" style={{ color: colors.textDim }}>{new Date(s.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
          <span className={`px-2 py-1 rounded-lg text-xs font-bold ${s.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{s.action}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          <div className="rounded-lg p-1.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <p className="text-[9px]" style={{ color: colors.textDim }}>Entry</p>
            <p className="text-xs font-mono" style={{ color: colors.text }}>{s.entry}</p>
          </div>
          <div className="bg-red-500/10 rounded-lg p-1.5">
            <p className="text-[9px] text-red-400">SL</p>
            <p className="text-xs text-red-400 font-mono">{s.stop}</p>
          </div>
        </div>
        <div className="flex gap-1.5 mb-2">
          {['tp1', 'tp2', 'tp3'].map(tp => (
            <div key={tp} className={`flex-1 rounded-lg p-1.5 text-center ${s[`${tp}Hit`] ? 'bg-emerald-500/20' : ''}`}
              style={!s[`${tp}Hit`] ? { background: 'rgba(255,255,255,0.05)' } : {}}>
              <p className="text-[9px]" style={{ color: colors.textDim }}>{tp.toUpperCase()}</p>
              <p className={`text-[10px] font-mono ${s[`${tp}Hit`] ? 'text-emerald-400' : ''}`} style={!s[`${tp}Hit`] ? { color: colors.textMuted } : {}}>{s[tp]}</p>
            </div>
          ))}
        </div>
        {s.status === 'PENDING' && (
          <div className="flex gap-1.5">
            <button onClick={() => markSignal(s.id, 'WIN')} className="flex-1 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium">Win</button>
            <button onClick={() => markSignal(s.id, 'LOSS')} className="flex-1 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium">Loss</button>
            <button onClick={() => markSignal(s.id, 'SKIP')} className="flex-1 py-1.5 rounded-lg text-xs font-medium hover:bg-white/10"
              style={{ background: 'rgba(255,255,255,0.05)', color: colors.textMuted }}>Skip</button>
          </div>
        )}
        {s.status !== 'PENDING' && (
          <div className={`py-1.5 rounded-lg text-center text-xs font-medium ${s.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : s.status === 'LOSS' ? 'bg-red-500/20 text-red-400' : ''}`}
            style={s.status === 'SKIP' ? { background: 'rgba(255,255,255,0.05)', color: colors.textMuted } : {}}>{s.status}</div>
        )}
      </div>
    </div>
  );

  // SECTIONS
  const DashboardSection = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatsCard title="Win Rate" value={`${data?.stats?.wins && data?.stats?.losses ? Math.round(data.stats.wins / (data.stats.wins + data.stats.losses) * 100) : 0}%`} icon="📊" />
        <StatsCard title="Activas" value={pendingSignals.length} sub="Pendientes" icon="🎯" />
        <StatsCard title="Wins" value={data?.stats?.wins || 0} sub={`de ${data?.stats?.total || 0}`} icon="✅" />
        <StatsCard title="TP3" value={data?.stats?.tp3Hits || 0} sub="Máximo profit" icon="💎" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2"><PriceCard /></div>
        <div><AIPanel /></div>
      </div>
      {pendingSignals.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3" style={{ color: colors.text }}>Señales Activas</h3>
          <div className="grid grid-cols-3 gap-3">
            {pendingSignals.slice(0, 3).map(s => <SignalCard key={s.id} signal={s} />)}
          </div>
        </div>
      )}
    </div>
  );

  const SignalsSection = () => (
    <div className="space-y-4">
      <h3 className="text-base font-semibold" style={{ color: colors.text }}>Señales ({pendingSignals.length} activas)</h3>
      {pendingSignals.length > 0 ? (
        <div className="grid grid-cols-3 gap-3">{pendingSignals.map(s => <SignalCard key={s.id} signal={s} />)}</div>
      ) : (
        <div className="text-center py-12 rounded-xl border" style={{ background: colors.card, borderColor: colors.border }}>
          <p style={{ color: colors.textMuted }}>Sin señales activas</p>
        </div>
      )}
    </div>
  );

  const AnalysisSection = () => (
    <div className="space-y-4">
      <h3 className="text-base font-semibold" style={{ color: colors.text }}>Análisis</h3>
      <div className="grid grid-cols-2 gap-4">
        {data?.assets?.map(a => (
          <div key={a.symbol} className="rounded-xl border p-4" style={{ background: colors.card, borderColor: colors.border }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{a.emoji}</span>
                <div>
                  <p className="font-medium" style={{ color: colors.text }}>{a.name}</p>
                  <p className="text-lg font-bold font-mono" style={{ color: colors.text }}>{a.price?.toFixed(a.decimals) || '---'}</p>
                </div>
              </div>
              {a.signal?.action && !['WAIT', 'LOADING'].includes(a.signal.action) && (
                <span className={`px-2 py-1 rounded-lg text-xs font-bold ${a.signal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{a.signal.action}</span>
              )}
            </div>
            {a.structureAlert && (
              <div className="mb-2 px-2 py-1 bg-yellow-500/10 rounded text-[10px] text-yellow-400">⚠️ Alerta de estructura</div>
            )}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span style={{ color: colors.textMuted }}>Estructura</span><span className={a.signal?.analysis?.structure === 'BULLISH' ? 'text-emerald-400' : a.signal?.analysis?.structure === 'BEARISH' ? 'text-red-400' : ''} style={!a.signal?.analysis?.structure ? { color: colors.textMuted } : {}}>{a.signal?.analysis?.structure || 'N/A'}</span></div>
              <div className="flex justify-between"><span style={{ color: colors.textMuted }}>CHoCH</span><span className="text-cyan-400">{a.signal?.analysis?.choch || 'No'}</span></div>
              <div className="flex justify-between"><span style={{ color: colors.textMuted }}>Zonas</span><span style={{ color: colors.textMuted }}>{a.demandZones}D / {a.supplyZones}S</span></div>
              <div className="flex justify-between items-center"><span style={{ color: colors.textMuted }}>Score</span>
                <div className="flex items-center gap-1">
                  <div className="w-16 h-1.5 rounded-full" style={{ background: colors.border }}>
                    <div className={`h-full rounded-full ${(a.signal?.score || 0) >= 70 ? 'bg-emerald-500' : 'bg-yellow-500'}`} style={{ width: `${a.signal?.score || 0}%` }} />
                  </div>
                  <span className="font-mono" style={{ color: colors.textMuted }}>{a.signal?.score || 0}%</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const HistorySection = () => (
    <div className="space-y-4">
      <h3 className="text-base font-semibold" style={{ color: colors.text }}>Historial</h3>
      <div className="rounded-xl border overflow-hidden" style={{ background: colors.card, borderColor: colors.border }}>
        <table className="w-full">
          <thead><tr className="border-b text-left" style={{ borderColor: colors.border }}>
            <th className="p-3 text-[10px] font-medium" style={{ color: colors.textDim }}>Activo</th>
            <th className="p-3 text-[10px] font-medium" style={{ color: colors.textDim }}>Tipo</th>
            <th className="p-3 text-[10px] font-medium" style={{ color: colors.textDim }}>Entry</th>
            <th className="p-3 text-[10px] font-medium" style={{ color: colors.textDim }}>Resultado</th>
            <th className="p-3 text-[10px] font-medium" style={{ color: colors.textDim }}>Fecha</th>
          </tr></thead>
          <tbody>
            {closedSignals.map(s => (
              <tr key={s.id} className="border-b hover:bg-white/5" style={{ borderColor: colors.border }}>
                <td className="p-3"><div className="flex items-center gap-1.5"><span>{s.emoji}</span><span className="text-xs" style={{ color: colors.text }}>{s.assetName}</span></div></td>
                <td className="p-3"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${s.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{s.action}</span></td>
                <td className="p-3 font-mono text-xs" style={{ color: colors.textMuted }}>{s.entry}</td>
                <td className="p-3"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${s.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : s.status === 'LOSS' ? 'bg-red-500/20 text-red-400' : ''}`} style={s.status === 'SKIP' ? { background: 'rgba(255,255,255,0.1)', color: colors.textMuted } : {}}>{s.status}</span></td>
                <td className="p-3 text-xs" style={{ color: colors.textDim }}>{new Date(s.timestamp).toLocaleDateString('es-ES')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {closedSignals.length === 0 && <p className="p-6 text-center text-xs" style={{ color: colors.textMuted }}>Sin historial</p>}
      </div>
    </div>
  );

  const StatsSection = () => {
    const wr = data?.stats?.wins && data?.stats?.losses ? Math.round(data.stats.wins / (data.stats.wins + data.stats.losses) * 100) : 0;
    return (
      <div className="space-y-4">
        <h3 className="text-base font-semibold" style={{ color: colors.text }}>Estadísticas</h3>
        <div className="grid grid-cols-4 gap-3">
          <StatsCard title="Total" value={data?.stats?.total || 0} icon="📊" />
          <StatsCard title="Wins" value={data?.stats?.wins || 0} icon="✅" />
          <StatsCard title="Losses" value={data?.stats?.losses || 0} icon="❌" />
          <StatsCard title="Win Rate" value={`${wr}%`} icon="🎯" />
        </div>
        <div className="rounded-xl border p-4" style={{ background: colors.card, borderColor: colors.border }}>
          <div className="flex items-center gap-6">
            <div className="relative w-28 h-28">
              <svg className="w-28 h-28 -rotate-90"><circle cx="56" cy="56" r="48" fill="none" stroke={colors.border} strokeWidth="8" /><circle cx="56" cy="56" r="48" fill="none" stroke="#10b981" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${wr * 3.02} 302`} /></svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-bold" style={{ color: colors.text }}>{wr}%</span><span className="text-[10px]" style={{ color: colors.textMuted }}>Win Rate</span></div>
            </div>
            <div className="flex-1 space-y-3">
              <div><div className="flex justify-between mb-1 text-xs"><span style={{ color: colors.textMuted }}>Wins</span><span className="text-emerald-400">{data?.stats?.wins || 0}</span></div><div className="h-2 rounded-full" style={{ background: colors.border }}><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${wr}%` }} /></div></div>
              <div><div className="flex justify-between mb-1 text-xs"><span style={{ color: colors.textMuted }}>Losses</span><span className="text-red-400">{data?.stats?.losses || 0}</span></div><div className="h-2 rounded-full" style={{ background: colors.border }}><div className="h-full bg-red-500 rounded-full" style={{ width: `${100 - wr}%` }} /></div></div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen transition-colors" style={{ background: colors.bg }}>
      <Sidebar />
      <main className={`transition-all ${sidebarOpen ? 'ml-60' : 'ml-16'}`}>
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
