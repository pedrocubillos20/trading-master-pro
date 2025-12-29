import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// ELISA CHAT - COMPONENTE AISLADO
// =============================================
const ElisaChat = ({ selectedAsset, isMobile }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages.length]);

  const sendMessage = async (customText) => {
    const messageText = customText || text.trim();
    if (!messageText || loading) return;

    setText('');
    setMessages(prev => [...prev, { role: 'user', content: messageText }]);
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: messageText, symbol: selectedAsset || 'stpRNG' })
      });
      const result = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: result.answer }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error de conexión.' }]);
    }
    setLoading(false);
  };

  const openChat = async () => {
    setIsOpen(true);
    if (!initialized) {
      setLoading(true);
      try {
        const response = await fetch(`${API_URL}/api/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: 'hola', symbol: selectedAsset || 'stpRNG' })
        });
        const result = await response.json();
        setMessages([{ role: 'assistant', content: result.answer }]);
      } catch (e) {
        setMessages([{ role: 'assistant', content: '¡Hola! 💜 Soy Elisa, tu asistente de trading.' }]);
      }
      setLoading(false);
      setInitialized(true);
    }
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  const AIIcon = ({ size = 24 }) => (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <circle cx="12" cy="12" r="10" fill="url(#elisa-grad)" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="10" r="1.5" fill="white" />
      <circle cx="15" cy="10" r="1.5" fill="white" />
      <defs>
        <linearGradient id="elisa-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </svg>
  );

  if (!isOpen) {
    return (
      <button 
        onClick={openChat}
        className={`fixed z-[100] flex items-center gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white rounded-2xl shadow-xl transition-transform hover:scale-105 active:scale-95 ${
          isMobile ? 'bottom-4 right-4 px-3 py-2.5' : 'bottom-6 right-6 px-4 py-3'
        }`}
      >
        <AIIcon size={24} />
        <div className="text-left">
          <p className="font-semibold text-sm">Elisa</p>
          {!isMobile && <p className="text-xs text-white/70">IA Assistant</p>}
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      </button>
    );
  }

  return (
    <div className={`fixed z-[100] bg-[#0d0d12] rounded-2xl shadow-2xl border border-white/10 flex flex-col ${
      isMobile ? 'inset-2' : 'bottom-6 right-6 w-[380px]'
    }`} style={{ height: isMobile ? 'calc(100% - 16px)' : '500px' }}>
      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <AIIcon size={28} />
          </div>
          <div>
            <p className="font-semibold text-white">Elisa</p>
            <p className="text-xs text-white/70">IA Trading Assistant</p>
          </div>
        </div>
        <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center mr-2 flex-shrink-0">
                <AIIcon size={18} />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
              msg.role === 'user' ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white' : 'bg-white/5 text-white/90'
            }`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center mr-2">
              <AIIcon size={18} />
            </div>
            <div className="bg-white/5 rounded-2xl px-4 py-3 flex gap-1.5">
              <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-3 py-2 border-t border-white/5 flex gap-2 overflow-x-auto">
        {['📊 Análisis', '🎯 Señal', '📈 Plan', '📦 Stats'].map((btn) => (
          <button key={btn} onClick={() => sendMessage(btn.split(' ')[1])} disabled={loading}
            className="flex-shrink-0 px-3 py-1.5 bg-white/5 hover:bg-pink-500/20 rounded-full text-xs text-white/60 hover:text-white disabled:opacity-50">
            {btn}
          </button>
        ))}
      </div>

      <div className="p-3 border-t border-white/5">
        <div className="flex gap-2">
          <input ref={inputRef} type="text" value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
            placeholder="Pregunta lo que quieras..."
            disabled={loading}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-pink-500 disabled:opacity-50"
            style={{ fontSize: '16px' }} autoComplete="off" />
          <button onClick={() => sendMessage()} disabled={!text.trim() || loading}
            className="w-12 h-12 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================================
// DASHBOARD PRINCIPAL v14.1
// =============================================
export default function Dashboard({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [timeframe, setTimeframe] = useState('M5');
  const [candles, setCandles] = useState([]);
  const [candlesH1, setCandlesH1] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showUserMenu, setShowUserMenu] = useState(false);
  
  const mountedRef = useRef(true);
  
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);
  
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Data fetching
  useEffect(() => {
    let isCancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_URL}/api/dashboard`);
        const json = await res.json();
        if (!isCancelled && mountedRef.current) {
          setData(json);
          if (!selectedAsset && json.assets?.length) setSelectedAsset(json.assets[0].symbol);
        }
      } catch (e) { console.error('Fetch error:', e); }
    };
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => { isCancelled = true; clearInterval(interval); };
  }, [selectedAsset]);

  useEffect(() => {
    if (!selectedAsset) return;
    let isCancelled = false;
    const fetchCandles = async () => {
      try {
        const res = await fetch(`${API_URL}/api/analyze/${selectedAsset}`);
        const json = await res.json();
        if (!isCancelled && mountedRef.current) {
          if (json.candles?.length) setCandles(json.candles);
          if (json.candlesH1?.length) setCandlesH1(json.candlesH1);
        }
      } catch (e) { console.error('Candles error:', e); }
    };
    fetchCandles();
    const interval = setInterval(fetchCandles, 4000);
    return () => { isCancelled = true; clearInterval(interval); };
  }, [selectedAsset]);

  const markSignal = async (id, status) => {
    try {
      await fetch(`${API_URL}/api/signals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
    } catch (e) { console.error(e); }
  };

  const currentAsset = useMemo(() => data?.assets?.find(a => a.symbol === selectedAsset), [data?.assets, selectedAsset]);
  const lockedSignal = currentAsset?.lockedSignal;
  const pendingSignals = useMemo(() => data?.recentSignals?.filter(s => s.status === 'PENDING') || [], [data?.recentSignals]);
  const closedSignals = useMemo(() => data?.recentSignals?.filter(s => s.status !== 'PENDING') || [], [data?.recentSignals]);

  const modelColors = {
    'MTF_CONFLUENCE': { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'MTF' },
    'CHOCH_PULLBACK': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'CHoCH' },
    'LIQUIDITY_SWEEP': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'LIQ' },
    'BOS_CONTINUATION': { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'BOS' },
    'FVG_ENTRY': { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'FVG' },
    'ORDER_FLOW': { bg: 'bg-pink-500/20', text: 'text-pink-400', label: 'OF' }
  };
  const getModelStyle = (model) => modelColors[model] || { bg: 'bg-white/10', text: 'text-white/60', label: '?' };

  // Chart Component
  const Chart = ({ height = 300 }) => {
    const containerRef = useRef(null);
    const [width, setWidth] = useState(600);
    
    useEffect(() => {
      const updateWidth = () => { if (containerRef.current) setWidth(containerRef.current.offsetWidth || 600); };
      updateWidth();
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }, []);

    const displayCandles = timeframe === 'H1' ? candlesH1 : candles;
    
    if (!displayCandles?.length) {
      return (
        <div ref={containerRef} style={{ height }} className="flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-white/40 text-sm">Cargando {timeframe}...</p>
          </div>
        </div>
      );
    }

    const padding = { top: 10, right: isMobile ? 45 : 60, bottom: 20, left: 5 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const visibleCandles = displayCandles.slice(-(isMobile ? 30 : 50));
    const candleW = Math.max(3, (chartW / visibleCandles.length) * 0.7);
    const gap = (chartW / visibleCandles.length) - candleW;
    const prices = visibleCandles.flatMap(c => [c.high, c.low]);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const pad = (maxP - minP) * 0.1;
    const adjMin = minP - pad;
    const adjMax = maxP + pad;
    const scale = chartH / (adjMax - adjMin);
    const getY = (p) => padding.top + (adjMax - p) * scale;
    const lastPrice = visibleCandles[visibleCandles.length - 1]?.close;
    const decimals = currentAsset?.decimals || 2;
    const signal = lockedSignal;

    return (
      <div ref={containerRef} className="w-full">
        <svg width={width} height={height}>
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const price = adjMax - ((adjMax - adjMin) * pct);
            return (
              <g key={i}>
                <line x1={padding.left} y1={getY(price)} x2={width - padding.right} y2={getY(price)} stroke="rgba(255,255,255,0.03)" />
                <text x={width - padding.right + 4} y={getY(price) + 3} fill="rgba(255,255,255,0.25)" fontSize={isMobile ? "8" : "9"} fontFamily="monospace">
                  {price.toFixed(decimals)}
                </text>
              </g>
            );
          })}
          {visibleCandles.map((c, i) => {
            const x = padding.left + i * (candleW + gap);
            const isGreen = c.close >= c.open;
            const top = getY(Math.max(c.open, c.close));
            const bottom = getY(Math.min(c.open, c.close));
            const color = isGreen ? '#10b981' : '#ef4444';
            return (
              <g key={i}>
                <line x1={x + candleW / 2} y1={getY(c.high)} x2={x + candleW / 2} y2={getY(c.low)} stroke={color} strokeWidth="1" />
                <rect x={x} y={top} width={candleW} height={Math.max(1, bottom - top)} fill={color} rx="0.5" />
              </g>
            );
          })}
          {lastPrice && (
            <g>
              <line x1={padding.left} y1={getY(lastPrice)} x2={width - padding.right} y2={getY(lastPrice)} stroke="#10b981" strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
              <rect x={width - padding.right - 2} y={getY(lastPrice) - 9} width={isMobile ? 42 : 56} height="18" fill="#10b981" rx="3" />
              <text x={width - padding.right + (isMobile ? 18 : 25)} y={getY(lastPrice) + 4} fill="black" fontSize={isMobile ? "9" : "10"} fontFamily="monospace" textAnchor="middle" fontWeight="bold">
                {lastPrice.toFixed(decimals)}
              </text>
            </g>
          )}
          {signal && timeframe === 'M5' && (
            <>
              <line x1={padding.left} y1={getY(signal.entry)} x2={width - padding.right} y2={getY(signal.entry)} stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4,2" />
              <line x1={padding.left} y1={getY(signal.tp1)} x2={width - padding.right} y2={getY(signal.tp1)} stroke="#10b981" strokeWidth="1" opacity={signal.tp1Hit ? 1 : 0.4} />
              <line x1={padding.left} y1={getY(signal.tp2)} x2={width - padding.right} y2={getY(signal.tp2)} stroke="#10b981" strokeWidth="1" opacity={signal.tp2Hit ? 1 : 0.3} />
              <line x1={padding.left} y1={getY(signal.tp3)} x2={width - padding.right} y2={getY(signal.tp3)} stroke="#10b981" strokeWidth="1" opacity={signal.tp3Hit ? 1 : 0.2} />
              <line x1={padding.left} y1={getY(signal.stop)} x2={width - padding.right} y2={getY(signal.stop)} stroke="#ef4444" strokeWidth="1.5" />
            </>
          )}
        </svg>
      </div>
    );
  };

  // Sidebar
  const Sidebar = () => (
    <>
      {isMobile && sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed left-0 top-0 h-full bg-[#0a0a0f] border-r border-white/5 z-40 transition-all duration-300 ${
        sidebarOpen ? (isMobile ? 'w-64' : 'w-48') : 'w-0 overflow-hidden'
      }`}>
        <div className="h-12 flex items-center justify-between px-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
              <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="font-bold text-sm text-white">TradingPro</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-white/5 rounded-lg">
            <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="p-2 space-y-1">
          {[
            { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
            { id: 'signals', icon: '🔔', label: 'Señales', badge: pendingSignals.length },
            { id: 'models', icon: '🧠', label: 'Modelos' },
            { id: 'history', icon: '📜', label: 'Historial' },
            { id: 'stats', icon: '📈', label: 'Stats' },
          ].map(item => (
            <button key={item.id}
              onClick={() => { setActiveSection(item.id); if (isMobile) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                activeSection === item.id ? 'bg-emerald-500/15 text-emerald-400' : 'text-white/60 hover:bg-white/5'
              }`}>
              <span>{item.icon}</span>
              <span className="text-sm">{item.label}</span>
              {item.badge > 0 && (
                <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500 text-black rounded-full">{item.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-white/5">
          <p className="text-[10px] uppercase text-white/30 mb-2 px-3">Mercados</p>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {data?.assets?.map(asset => (
              <button key={asset.symbol}
                onClick={() => { setSelectedAsset(asset.symbol); if (isMobile) setSidebarOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  selectedAsset === asset.symbol ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5'
                }`}>
                <span>{asset.emoji}</span>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium">{asset.shortName}</span>
                    {asset.h1Loaded && <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400">H1</span>}
                    {!asset.isActive && asset.type === 'forex' && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400">⏰</span>
                    )}
                  </div>
                  <span className="text-[10px] text-white/40 font-mono">{asset.price?.toFixed(2) || '---'}</span>
                </div>
                {asset.lockedSignal && (
                  <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                    asset.lockedSignal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'
                  }`}>{asset.lockedSignal.action}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${data?.connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className="text-xs text-white/40">{data?.connected ? 'Conectado' : 'Offline'}</span>
          </div>
        </div>
      </aside>
    </>
  );

  // Header
  const Header = () => (
    <header className="h-12 bg-[#0a0a0f] border-b border-white/5 flex items-center justify-between px-3 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-white/5 rounded-lg">
            <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <h2 className="text-sm font-medium text-white capitalize">{activeSection}</h2>
        <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded hidden sm:inline">6 Modelos SMC</span>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="flex bg-white/5 rounded-lg p-0.5">
          {['M5', 'H1'].map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                timeframe === tf ? 'bg-emerald-500 text-black' : 'text-white/50 hover:text-white'
              }`}>{tf}</button>
          ))}
        </div>

        <div className="relative">
          <button onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded-lg transition-colors">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
              <span className="text-black text-xs font-bold">{user?.email?.charAt(0).toUpperCase() || 'U'}</span>
            </div>
            <svg className={`w-4 h-4 text-white/50 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 top-full mt-2 w-56 bg-[#0d0d12] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="p-3 border-b border-white/5">
                  <p className="text-xs text-white/50">Conectado como</p>
                  <p className="text-sm text-white font-medium truncate">{user?.email}</p>
                </div>
                <div className="p-1">
                  <button onClick={onLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-sm">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Cerrar Sesión
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );

  // Small Components
  const StatsCard = ({ title, value, icon }) => (
    <div className="rounded-xl p-3 bg-[#0f0f14]">
      <div className="text-lg mb-1">{icon}</div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-[10px] text-white/50">{title}</p>
    </div>
  );

  const SignalCard = ({ signal: s }) => {
    const ms = getModelStyle(s.model);
    return (
      <div className="rounded-xl p-3 bg-[#0f0f14]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{s.emoji}</span>
            <div>
              <p className="text-xs font-medium text-white">{s.assetName}</p>
              <span className={`px-1 py-0.5 text-[8px] rounded ${ms.bg} ${ms.text}`}>{ms.label}</span>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
            s.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'
          }`}>{s.action}</span>
        </div>
        <div className="flex gap-1 mb-2">
          {['tp1', 'tp2', 'tp3'].map(tp => (
            <div key={tp} className={`flex-1 rounded p-1 text-center ${s[`${tp}Hit`] ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
              <p className={`text-[8px] ${s[`${tp}Hit`] ? 'text-emerald-400' : 'text-white/40'}`}>{tp.toUpperCase()}</p>
            </div>
          ))}
        </div>
        {s.status === 'PENDING' && (
          <div className="flex gap-1">
            <button onClick={() => markSignal(s.id, 'WIN')} className="flex-1 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded text-[10px]">✓ Win</button>
            <button onClick={() => markSignal(s.id, 'LOSS')} className="flex-1 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded text-[10px]">✗ Loss</button>
          </div>
        )}
      </div>
    );
  };

  // Price Card
  const PriceCard = () => {
    if (!currentAsset) return null;
    const signal = lockedSignal;
    
    return (
      <div className="rounded-xl bg-[#0f0f14] overflow-hidden">
        <div className="p-3 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-xl">{currentAsset.emoji}</div>
              <div>
                <h3 className="font-bold text-white text-sm">{currentAsset.name}</h3>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    currentAsset.structureM5 === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' :
                    currentAsset.structureM5 === 'BEARISH' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/50'
                  }`}>M5: {currentAsset.structureM5}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    currentAsset.structureH1 === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' :
                    currentAsset.structureH1 === 'BEARISH' ? 'bg-red-500/20 text-red-400' :
                    currentAsset.structureH1 === 'LOADING' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-white/10 text-white/50'
                  }`}>H1: {currentAsset.structureH1}</span>
                  {currentAsset.mtfConfluence && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">✨ MTF</span>}
                  {!currentAsset.isActive && currentAsset.type === 'forex' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">⏰ {currentAsset.scheduleMessage}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold font-mono text-white text-lg">{currentAsset.price?.toFixed(currentAsset.decimals) || '---'}</p>
              <p className="text-[10px] text-white/40">📦 {currentAsset.demandZones}D / {currentAsset.supplyZones}S</p>
            </div>
          </div>
        </div>

        <div className="p-2"><Chart height={isMobile ? 220 : 280} /></div>

        {signal && (
          <div className="p-3 border-t border-white/5" style={{ background: signal.action === 'LONG' ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-lg font-bold text-sm ${signal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{signal.action}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${getModelStyle(signal.model).bg} ${getModelStyle(signal.model).text}`}>{signal.model}</span>
                {signal.trailingActive && <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400">🔄</span>}
              </div>
              <div className="text-xl font-bold text-white">{signal.score}%</div>
            </div>
            <div className={`grid gap-2 ${isMobile ? 'grid-cols-3' : 'grid-cols-5'}`}>
              <div className="bg-blue-500/20 rounded p-2 text-center">
                <p className="text-[8px] text-blue-400">ENTRY</p>
                <p className="text-[10px] font-mono text-blue-400 font-bold">{signal.entry}</p>
              </div>
              {['tp1', 'tp2', 'tp3'].map(tp => (
                <div key={tp} className={`rounded p-2 text-center ${signal[`${tp}Hit`] ? 'bg-emerald-500/30' : 'bg-emerald-500/10'}`}>
                  <p className="text-[8px] text-emerald-400">{tp.toUpperCase()} {signal[`${tp}Hit`] && '✓'}</p>
                  <p className="text-[10px] font-mono text-emerald-400">{signal[tp]}</p>
                </div>
              ))}
              <div className="bg-red-500/20 rounded p-2 text-center">
                <p className="text-[8px] text-red-400">SL</p>
                <p className="text-[10px] font-mono text-red-400 font-bold">{signal.stop}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Sections
  const DashboardSection = () => {
    const wr = data?.stats?.wins + data?.stats?.losses > 0 ? Math.round(data.stats.wins / (data.stats.wins + data.stats.losses) * 100) : 0;
    return (
      <div className="space-y-4">
        {/* Forex Schedule Banner */}
        {data?.forexStatus && !data.forexStatus.active && (
          <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">⏰</span>
              <div>
                <p className="text-yellow-400 text-sm font-medium">Forex (XAU, GBP): {data.forexStatus.message}</p>
                <p className="text-yellow-400/60 text-xs">Horario de trading: 7:00 AM - 12:00 PM Colombia</p>
              </div>
            </div>
          </div>
        )}
        <div className={`grid gap-3 ${isMobile ? 'grid-cols-2' : 'grid-cols-4'}`}>
          <StatsCard title="Win Rate" value={`${wr}%`} icon="📊" />
          <StatsCard title="Activas" value={pendingSignals.length} icon="🎯" />
          <StatsCard title="Wins" value={data?.stats?.wins || 0} icon="✅" />
          <StatsCard title="TP3" value={data?.stats?.tp3Hits || 0} icon="💎" />
        </div>
        <PriceCard />
        {pendingSignals.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-white mb-2">Señales Activas</h3>
            <div className={`grid gap-3 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
              {pendingSignals.slice(0, 3).map(s => <SignalCard key={s.id} signal={s} />)}
            </div>
          </div>
        )}
      </div>
    );
  };

  const SignalsSection = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-white">Señales Activas ({pendingSignals.length})</h3>
      {pendingSignals.length > 0 ? (
        <div className={`grid gap-3 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
          {pendingSignals.map(s => <SignalCard key={s.id} signal={s} />)}
        </div>
      ) : (
        <div className="text-center py-12 rounded-xl bg-[#0f0f14]">
          <p className="text-white/50">Sin señales activas</p>
        </div>
      )}
    </div>
  );

  const ModelsSection = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-white">6 Modelos SMC</h3>
      <div className={`grid gap-3 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {[
          { name: 'MTF_CONFLUENCE', score: 95, desc: 'H1+M5 alineados' },
          { name: 'CHOCH_PULLBACK', score: 90, desc: 'Cambio de carácter' },
          { name: 'LIQUIDITY_SWEEP', score: 85, desc: 'Caza de stops' },
          { name: 'BOS_CONTINUATION', score: 80, desc: 'Ruptura estructura' },
          { name: 'FVG_ENTRY', score: 75, desc: 'Fair Value Gap' },
          { name: 'ORDER_FLOW', score: 70, desc: 'Momentum' }
        ].map(m => {
          const style = getModelStyle(m.name);
          const ms = data?.stats?.byModel?.[m.name] || { wins: 0, losses: 0 };
          const wr = ms.wins + ms.losses > 0 ? Math.round(ms.wins / (ms.wins + ms.losses) * 100) : 0;
          return (
            <div key={m.name} className="rounded-xl p-4 bg-[#0f0f14]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className={`text-sm font-medium ${style.text}`}>{m.name}</p>
                  <p className="text-[10px] text-white/40">{m.desc}</p>
                </div>
                <span className="text-lg font-bold text-white">{m.score}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-white/10 rounded-full">
                  <div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-purple-500" style={{ width: `${wr}%` }} />
                </div>
                <span className="text-[10px] text-white/60">{wr}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const HistorySection = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-white">Historial</h3>
      <div className="rounded-xl bg-[#0f0f14] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[400px]">
            <thead>
              <tr className="border-b border-white/5">
                <th className="p-3 text-left text-[10px] text-white/50">Activo</th>
                <th className="p-3 text-left text-[10px] text-white/50">Tipo</th>
                <th className="p-3 text-left text-[10px] text-white/50">Score</th>
                <th className="p-3 text-left text-[10px] text-white/50">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {closedSignals.slice(0, 15).map(s => (
                <tr key={s.id} className="border-b border-white/5">
                  <td className="p-3 text-xs text-white">{s.emoji} {s.assetName}</td>
                  <td className="p-3"><span className={`px-1.5 py-0.5 rounded text-[9px] ${s.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{s.action}</span></td>
                  <td className="p-3 text-[10px] text-white/50">{s.score}%</td>
                  <td className="p-3"><span className={`px-1.5 py-0.5 rounded text-[9px] ${s.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {closedSignals.length === 0 && <p className="p-6 text-center text-xs text-white/40">Sin historial</p>}
      </div>
    </div>
  );

  const StatsSection = () => {
    const wr = data?.stats?.wins + data?.stats?.losses > 0 ? Math.round(data.stats.wins / (data.stats.wins + data.stats.losses) * 100) : 0;
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white">Estadísticas</h3>
        <div className={`grid gap-3 ${isMobile ? 'grid-cols-2' : 'grid-cols-4'}`}>
          <StatsCard title="Total" value={data?.stats?.total || 0} icon="📊" />
          <StatsCard title="Wins" value={data?.stats?.wins || 0} icon="✅" />
          <StatsCard title="Losses" value={data?.stats?.losses || 0} icon="❌" />
          <StatsCard title="Win Rate" value={`${wr}%`} icon="🎯" />
        </div>
        <div className="rounded-xl p-4 bg-[#0f0f14]">
          <h4 className="text-xs font-medium text-white mb-3">TPs Alcanzados</h4>
          <div className="grid grid-cols-3 gap-3">
            {['TP1', 'TP2', 'TP3'].map((tp, i) => (
              <div key={tp} className="text-center">
                <p className="text-2xl font-bold text-emerald-400">{data?.stats?.[`tp${i+1}Hits`] || 0}</p>
                <p className="text-[10px] text-white/40">{tp}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#06060a]">
      <Sidebar />
      <main className={`transition-all duration-300 ${sidebarOpen && !isMobile ? 'ml-48' : 'ml-0'}`}>
        <Header />
        <div className="p-3 pb-24">
          {activeSection === 'dashboard' && <DashboardSection />}
          {activeSection === 'signals' && <SignalsSection />}
          {activeSection === 'models' && <ModelsSection />}
          {activeSection === 'history' && <HistorySection />}
          {activeSection === 'stats' && <StatsSection />}
        </div>
      </main>
      <ElisaChat selectedAsset={selectedAsset} isMobile={isMobile} />
    </div>
  );
}
