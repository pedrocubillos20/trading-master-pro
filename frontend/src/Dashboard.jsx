import React, { useState, useEffect, useCallback, useRef, memo } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// TRADING MASTER PRO v11.4
// - Gráfico estable sin parpadeo
// - Zoom y Pan en gráfico
// - Input chat arreglado
// =============================================

// =============================================
// GRÁFICO DE VELAS - Componente separado y memoizado
// =============================================
const CandlestickChart = memo(function CandlestickChart({ 
  candles, 
  signal, 
  isLoading,
  decimals = 2 
}) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 700, height: 280 });
  const [offset, setOffset] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width || 700,
          height: 280
        });
      }
    });
    
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Handlers para pan
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    if (e.ctrlKey) {
      // Zoom con Ctrl + scroll
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(prev => Math.max(0.5, Math.min(3, prev + delta)));
    } else {
      // Pan horizontal con scroll normal
      const delta = e.deltaY > 0 ? 5 : -5;
      setOffset(prev => Math.max(0, Math.min(candles.length - 20, prev + delta)));
    }
  };

  // Controles de zoom
  const zoomIn = () => setZoom(prev => Math.min(3, prev + 0.2));
  const zoomOut = () => setZoom(prev => Math.max(0.5, prev - 0.2));
  const resetView = () => { setZoom(1); setOffset(0); setPanOffset({ x: 0, y: 0 }); };

  // Loading state
  if (isLoading && (!candles || candles.length === 0)) {
    return (
      <div ref={containerRef} className="w-full h-[280px] flex items-center justify-center bg-black/20 rounded-lg">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs text-white/30">Conectando...</p>
        </div>
      </div>
    );
  }

  if (!candles || candles.length === 0) {
    return (
      <div ref={containerRef} className="w-full h-[280px] flex items-center justify-center bg-black/20 rounded-lg">
        <p className="text-xs text-white/30">Sin datos de mercado</p>
      </div>
    );
  }

  const { width, height } = dimensions;
  const padding = { top: 15, right: 55, bottom: 25, left: 5 };
  const chartWidth = Math.max(100, width - padding.left - padding.right);
  const chartHeight = Math.max(100, height - padding.top - padding.bottom);

  // Calcular velas visibles según zoom y offset
  const visibleCount = Math.floor(50 / zoom);
  const startIdx = Math.max(0, candles.length - visibleCount - offset);
  const endIdx = Math.min(candles.length, startIdx + visibleCount);
  const displayCandles = candles.slice(startIdx, endIdx);

  if (displayCandles.length === 0) {
    return (
      <div ref={containerRef} className="w-full h-[280px] flex items-center justify-center bg-black/20 rounded-lg">
        <p className="text-xs text-white/30">Sin velas para mostrar</p>
      </div>
    );
  }

  const candleW = Math.max(2, Math.min(20, (chartWidth / displayCandles.length) * 0.75 * zoom));
  const gap = (chartWidth / displayCandles.length) - candleW;

  const prices = displayCandles.flatMap(c => [c.high, c.low]);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = (maxP - minP) || 1;
  const pad = range * 0.1;
  const adjMin = minP - pad;
  const adjMax = maxP + pad;
  const adjRange = adjMax - adjMin;
  const scale = chartHeight / adjRange;

  const getY = (p) => padding.top + (adjMax - p) * scale + panOffset.y;
  const lastPrice = displayCandles[displayCandles.length - 1]?.close;

  return (
    <div ref={containerRef} className="w-full relative">
      {/* Controles de zoom */}
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button onClick={zoomOut} className="w-7 h-7 bg-black/50 hover:bg-black/70 rounded flex items-center justify-center text-white/70 hover:text-white text-sm font-bold">−</button>
        <button onClick={resetView} className="px-2 h-7 bg-black/50 hover:bg-black/70 rounded flex items-center justify-center text-white/70 hover:text-white text-[10px]">{Math.round(zoom * 100)}%</button>
        <button onClick={zoomIn} className="w-7 h-7 bg-black/50 hover:bg-black/70 rounded flex items-center justify-center text-white/70 hover:text-white text-sm font-bold">+</button>
      </div>

      {/* Instrucciones */}
      <div className="absolute bottom-2 left-2 z-10 text-[9px] text-white/30">
        Scroll: mover | Ctrl+Scroll: zoom | Arrastrar: pan
      </div>

      <svg 
        width={width} 
        height={height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        className="select-none"
      >
        {/* Background */}
        <rect x="0" y="0" width={width} height={height} fill="transparent" />

        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const price = adjMax - (adjRange * pct);
          const y = getY(price);
          if (y < padding.top || y > height - padding.bottom) return null;
          return (
            <g key={i}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y}
                stroke="rgba(255,255,255,0.03)" strokeDasharray="2,4" />
              <text x={width - padding.right + 4} y={y + 3} fill="rgba(255,255,255,0.25)"
                fontSize="9" fontFamily="monospace">{price.toFixed(decimals)}</text>
            </g>
          );
        })}

        {/* Candles */}
        {displayCandles.map((c, i) => {
          const x = padding.left + i * (candleW + gap) + gap / 2 + panOffset.x;
          if (x < padding.left - candleW || x > width - padding.right) return null;
          
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

        {/* Línea de precio actual */}
        {lastPrice && getY(lastPrice) > padding.top && getY(lastPrice) < height - padding.bottom && (
          <g>
            <line x1={padding.left} y1={getY(lastPrice)} x2={width - padding.right} y2={getY(lastPrice)}
              stroke="#10b981" strokeWidth="1" strokeDasharray="3,3" opacity="0.7" />
            <rect x={width - padding.right} y={getY(lastPrice) - 9} width="50" height="18"
              fill="#10b981" rx="3" />
            <text x={width - padding.right + 25} y={getY(lastPrice) + 4} fill="black"
              fontSize="9" fontFamily="monospace" textAnchor="middle" fontWeight="bold">
              {lastPrice.toFixed(decimals)}
            </text>
          </g>
        )}

        {/* Líneas de señal */}
        {signal?.entry && (
          <>
            {getY(signal.entry) > padding.top && getY(signal.entry) < height - padding.bottom && (
              <line x1={padding.left} y1={getY(signal.entry)} x2={width - padding.right} y2={getY(signal.entry)}
                stroke="#3b82f6" strokeWidth="1" strokeDasharray="4,2" opacity="0.6" />
            )}
            {getY(signal.tp1) > padding.top && getY(signal.tp1) < height - padding.bottom && (
              <line x1={padding.left} y1={getY(signal.tp1)} x2={width - padding.right} y2={getY(signal.tp1)}
                stroke="#10b981" strokeWidth="1" opacity="0.4" />
            )}
            {getY(signal.stop) > padding.top && getY(signal.stop) < height - padding.bottom && (
              <line x1={padding.left} y1={getY(signal.stop)} x2={width - padding.right} y2={getY(signal.stop)}
                stroke="#ef4444" strokeWidth="1" opacity="0.4" />
            )}
          </>
        )}
      </svg>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison para evitar re-renders innecesarios
  return (
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.candles?.length === nextProps.candles?.length &&
    prevProps.candles?.[prevProps.candles?.length - 1]?.close === nextProps.candles?.[nextProps.candles?.length - 1]?.close &&
    prevProps.signal?.entry === nextProps.signal?.entry
  );
});

// =============================================
// COMPONENTE PRINCIPAL
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
  
  // Chat state separado para evitar re-renders
  const [aiChat, setAiChat] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatInputRef = useRef(null);
  const chatEndRef = useRef(null);
  
  // Refs para evitar re-fetching innecesario
  const lastFetchRef = useRef(0);
  const candlesRef = useRef([]);

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchRef.current < 1500) return;
    lastFetchRef.current = now;
    
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

  // Fetch candles - optimizado
  const fetchCandles = useCallback(async () => {
    if (!selectedAsset) return;
    
    try {
      const res = await fetch(`${API_URL}/api/analyze/${selectedAsset}`);
      if (!res.ok) return;
      const json = await res.json();
      
      if (json.candles && json.candles.length > 0) {
        const lastNew = json.candles[json.candles.length - 1];
        const lastOld = candlesRef.current[candlesRef.current.length - 1];
        
        // Solo actualizar si hay cambios reales
        if (!lastOld || lastNew.time !== lastOld.time || lastNew.close !== lastOld.close) {
          candlesRef.current = json.candles;
          setCandles([...json.candles]);
        }
      }
      setIsLoadingCandles(false);
    } catch (err) {
      setIsLoadingCandles(false);
    }
  }, [selectedAsset]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2500);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (selectedAsset) {
      setIsLoadingCandles(true);
      candlesRef.current = [];
      setCandles([]);
      fetchCandles();
      const interval = setInterval(fetchCandles, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedAsset, fetchCandles]);

  // Scroll chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiChat]);

  // Search results
  const searchResults = searchQuery.trim() 
    ? (data?.assets?.filter(a => 
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.symbol.toLowerCase().includes(searchQuery.toLowerCase())
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

  // AI Chat - función separada
  const sendChatMessage = async () => {
    const message = chatInput.trim();
    if (!message || !selectedAsset) return;
    
    // Guardar mensaje y limpiar input
    const userMessage = message;
    setChatInput('');
    setAiChat(prev => [...prev, { role: 'user', content: userMessage }]);
    
    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMessage, symbol: selectedAsset })
      });
      const json = await res.json();
      setAiChat(prev => [...prev, { role: 'assistant', content: json.answer }]);
    } catch (err) {
      setAiChat(prev => [...prev, { role: 'assistant', content: '❌ Error de conexión' }]);
    }
    
    // Mantener foco en input
    setTimeout(() => chatInputRef.current?.focus(), 100);
  };

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  const currentAsset = data?.assets?.find(a => a.symbol === selectedAsset);
  const pendingSignals = data?.recentSignals?.filter(s => s.status === 'PENDING') || [];
  const closedSignals = data?.recentSignals?.filter(s => s.status !== 'PENDING') || [];

  const colors = theme === 'dark' ? {
    bg: '#06060a', card: '#0d0d12', border: 'rgba(255,255,255,0.06)',
    text: '#ffffff', textMuted: 'rgba(255,255,255,0.5)', textDim: 'rgba(255,255,255,0.3)',
  } : {
    bg: '#f5f5f7', card: '#ffffff', border: 'rgba(0,0,0,0.1)',
    text: '#1a1a1a', textMuted: 'rgba(0,0,0,0.6)', textDim: 'rgba(0,0,0,0.3)',
  };

  // =============================================
  // SIDEBAR - Memoizado
  // =============================================
  const Sidebar = memo(function Sidebar() {
    return (
      <aside className={`fixed left-0 top-0 h-full border-r transition-all duration-300 z-50 ${sidebarOpen ? 'w-56' : 'w-16'}`}
        style={{ background: colors.card, borderColor: colors.border }}>
        
        <div className="h-12 flex items-center justify-between px-3 border-b" style={{ borderColor: colors.border }}>
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <span className="font-bold text-sm" style={{ color: colors.text }}>TradingPro</span>
            </div>
          ) : (
            <div className="w-7 h-7 mx-auto rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
              <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 hover:bg-white/5 rounded">
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
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${
                activeSection === item.id ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-white/5'
              }`} style={{ color: activeSection === item.id ? '#10b981' : colors.textMuted }}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
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

        <div className="p-2 border-t" style={{ borderColor: colors.border }}>
          {sidebarOpen && <p className="text-[9px] uppercase tracking-wider mb-1 px-2" style={{ color: colors.textDim }}>Mercados</p>}
          <div className="space-y-0.5 max-h-[280px] overflow-y-auto">
            {data?.assets?.map(asset => (
              <button key={asset.symbol} onClick={() => setSelectedAsset(asset.symbol)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${
                  selectedAsset === asset.symbol ? 'bg-white/10' : 'hover:bg-white/5'
                }`} style={{ color: selectedAsset === asset.symbol ? colors.text : colors.textMuted }}>
                <span className="text-sm">{asset.emoji}</span>
                {sidebarOpen && (
                  <>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-[11px] font-medium truncate">{asset.shortName || asset.name.split(' ')[0]}</p>
                      <p className="text-[9px] font-mono" style={{ color: colors.textDim }}>{asset.price?.toFixed(2) || '---'}</p>
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

        <div className="absolute bottom-0 left-0 right-0 p-2 border-t" style={{ borderColor: colors.border }}>
          <div className="flex items-center gap-2 px-2">
            <div className={`w-2 h-2 rounded-full ${data?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            {sidebarOpen && <span className="text-[10px]" style={{ color: colors.textDim }}>{data?.connected ? 'Conectado' : 'Offline'}</span>}
          </div>
        </div>
      </aside>
    );
  });

  // =============================================
  // HEADER
  // =============================================
  const Header = () => (
    <header className="h-12 backdrop-blur-xl border-b flex items-center justify-between px-4 sticky top-0 z-40"
      style={{ background: `${colors.card}ee`, borderColor: colors.border }}>
      
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold capitalize" style={{ color: colors.text }}>{activeSection}</h2>
        <span className="text-[10px]" style={{ color: colors.textDim }}>
          {new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative">
          <input type="text" placeholder="Buscar..." value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-32 border rounded-lg px-2.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
            style={{ background: 'rgba(255,255,255,0.05)', borderColor: colors.border, color: colors.text }} />
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-xl overflow-hidden z-50"
              style={{ background: colors.card, borderColor: colors.border }}>
              {searchResults.map(a => (
                <button key={a.symbol} onClick={() => { setSelectedAsset(a.symbol); setSearchQuery(''); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 text-left">
                  <span className="text-sm">{a.emoji}</span>
                  <span className="text-[11px]" style={{ color: colors.text }}>{a.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative">
          <button onClick={() => setShowNotifications(!showNotifications)} className="p-1.5 hover:bg-white/5 rounded-lg relative">
            <svg className="w-4 h-4" style={{ color: colors.textMuted }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {pendingSignals.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-emerald-500 text-black text-[8px] font-bold rounded-full flex items-center justify-center">
                {pendingSignals.length}
              </span>
            )}
          </button>
          {showNotifications && (
            <div className="absolute top-full right-0 mt-1 w-64 rounded-lg border shadow-xl overflow-hidden z-50"
              style={{ background: colors.card, borderColor: colors.border }}>
              <div className="p-2 border-b text-xs font-medium" style={{ borderColor: colors.border, color: colors.text }}>Señales</div>
              <div className="max-h-48 overflow-y-auto">
                {pendingSignals.length === 0 ? (
                  <p className="p-3 text-[11px] text-center" style={{ color: colors.textMuted }}>Sin señales</p>
                ) : (
                  pendingSignals.map(s => (
                    <div key={s.id} className="p-2 border-b hover:bg-white/5 flex items-center gap-2" style={{ borderColor: colors.border }}>
                      <span>{s.emoji}</span>
                      <span className={`text-[11px] font-medium ${s.action === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>{s.action}</span>
                      <span className="text-[11px]" style={{ color: colors.textMuted }}>{s.assetName}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Theme */}
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-1.5 hover:bg-white/5 rounded-lg">
          <svg className="w-4 h-4" style={{ color: colors.textMuted }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={theme === 'dark' ? "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" : "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"} />
          </svg>
        </button>

        {/* Profile */}
        <div className="relative">
          <button onClick={() => setShowProfile(!showProfile)}
            className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-[11px]">T</button>
          {showProfile && (
            <div className="absolute top-full right-0 mt-1 w-36 rounded-lg border shadow-xl overflow-hidden z-50"
              style={{ background: colors.card, borderColor: colors.border }}>
              <div className="p-2 border-b text-xs" style={{ borderColor: colors.border, color: colors.text }}>Trader</div>
              <button className="w-full px-3 py-2 text-left text-[11px] hover:bg-white/5 text-red-400">Salir</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );

  // Stats Card
  const StatsCard = ({ title, value, sub, icon }) => (
    <div className="rounded-xl p-3 border" style={{ background: colors.card, borderColor: colors.border }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-lg">{icon}</div>
      </div>
      <p className="text-xl font-bold" style={{ color: colors.text }}>{value}</p>
      <p className="text-[10px]" style={{ color: colors.textMuted }}>{title}</p>
      {sub && <p className="text-[9px]" style={{ color: colors.textDim }}>{sub}</p>}
    </div>
  );

  // Price Card
  const PriceCard = () => {
    if (!currentAsset) return null;
    const sig = currentAsset.signal;
    const hasSignal = sig?.action && !['WAIT', 'LOADING'].includes(sig.action);

    return (
      <div className="rounded-xl border overflow-hidden" style={{ background: colors.card, borderColor: colors.border }}>
        <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-xl">{currentAsset.emoji}</div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold" style={{ color: colors.text }}>{currentAsset.name}</h3>
                {currentAsset.timeframe && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">{currentAsset.timeframe}</span>}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-[10px]" style={{ color: colors.textMuted }}>{currentAsset.type}</p>
                {candles.length > 0 && <span className="flex items-center gap-1 text-[9px] text-emerald-400"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>Live</span>}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold font-mono" style={{ color: colors.text }}>{currentAsset.price?.toFixed(currentAsset.decimals) || '---'}</p>
            <p className="text-[10px]" style={{ color: colors.textMuted }}>{currentAsset.demandZones || 0}D • {currentAsset.supplyZones || 0}S</p>
          </div>
        </div>

        {currentAsset.structureAlert && (
          <div className="px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20">
            <p className="text-[10px] text-yellow-400">⚠️ {currentAsset.structureAlert.message}</p>
          </div>
        )}

        <div className="p-1">
          <CandlestickChart 
            candles={candles} 
            signal={hasSignal ? sig : null}
            isLoading={isLoadingCandles}
            decimals={currentAsset.decimals}
          />
        </div>

        {hasSignal && (
          <div className="p-3 border-t bg-gradient-to-r from-emerald-500/5 to-transparent" style={{ borderColor: colors.border }}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`px-2.5 py-1 rounded-lg font-bold text-sm ${sig.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{sig.action}</div>
              <div>
                <p className="text-xs font-medium" style={{ color: colors.text }}>{sig.model}</p>
                <p className="text-[10px]" style={{ color: colors.textMuted }}>Score: {sig.score}%</p>
              </div>
              <div className="ml-auto w-10 h-10 relative">
                <svg className="w-10 h-10 -rotate-90">
                  <circle cx="20" cy="20" r="16" fill="none" stroke={colors.border} strokeWidth="3" />
                  <circle cx="20" cy="20" r="16" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${sig.score * 1} 100`} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color: colors.text }}>{sig.score}</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <div className="rounded-lg p-1.5 text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <p className="text-[8px] uppercase" style={{ color: colors.textDim }}>Entry</p>
                <p className="text-[10px] font-mono" style={{ color: colors.text }}>{sig.entry}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-1.5 text-center">
                <p className="text-[8px] text-emerald-400 uppercase">TP1</p>
                <p className="text-[10px] text-emerald-400 font-mono">{sig.tp1}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-1.5 text-center">
                <p className="text-[8px] text-emerald-400 uppercase">TP2</p>
                <p className="text-[10px] text-emerald-400 font-mono">{sig.tp2}</p>
              </div>
              <div className="bg-red-500/10 rounded-lg p-1.5 text-center">
                <p className="text-[8px] text-red-400 uppercase">SL</p>
                <p className="text-[10px] text-red-400 font-mono">{sig.stop}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // AI Panel - Con input arreglado
  const AIPanel = () => (
    <div className="rounded-xl border flex flex-col" style={{ background: colors.card, borderColor: colors.border, height: 420 }}>
      <div className="p-2.5 border-b flex items-center gap-2" style={{ borderColor: colors.border }}>
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-medium" style={{ color: colors.text }}>AI Assistant</p>
          <p className="text-[9px]" style={{ color: colors.textDim }}>Análisis inteligente</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {aiChat.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-[10px] mb-2" style={{ color: colors.textDim }}>Pregúntame sobre el mercado</p>
            <div className="flex flex-wrap gap-1 justify-center">
              {['¿Señal?', '¿Zonas?', '¿Setup?'].map(q => (
                <button key={q} onClick={() => { setChatInput(q); setTimeout(() => sendChatMessage(), 50); }}
                  className="px-2 py-1 rounded text-[10px] hover:bg-white/10" style={{ background: 'rgba(255,255,255,0.05)', color: colors.textMuted }}>{q}</button>
              ))}
            </div>
          </div>
        ) : (
          aiChat.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-xl px-2.5 py-1.5 ${m.role === 'user' ? 'bg-emerald-500 text-black' : ''}`}
                style={m.role === 'assistant' ? { background: 'rgba(255,255,255,0.05)', color: colors.text } : {}}>
                <p className="text-[11px] whitespace-pre-wrap leading-relaxed">{m.content}</p>
              </div>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-2.5 border-t" style={{ borderColor: colors.border }}>
        <div className="flex gap-1.5">
          <input 
            ref={chatInputRef}
            type="text" 
            value={chatInput} 
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleChatKeyDown}
            placeholder="Escribe aquí..."
            autoComplete="off"
            className="flex-1 border rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
            style={{ background: 'rgba(255,255,255,0.05)', borderColor: colors.border, color: colors.text }} 
          />
          <button onClick={sendChatMessage} className="px-2.5 bg-emerald-500 hover:bg-emerald-600 text-black rounded-lg transition-colors">
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
      <div className="p-2.5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{s.emoji}</span>
            <div>
              <p className="text-xs font-medium" style={{ color: colors.text }}>{s.assetName}</p>
              <p className="text-[9px]" style={{ color: colors.textDim }}>{new Date(s.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{s.action}</span>
        </div>
        <div className="grid grid-cols-2 gap-1 mb-1.5">
          <div className="rounded p-1.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <p className="text-[8px]" style={{ color: colors.textDim }}>Entry</p>
            <p className="text-[10px] font-mono" style={{ color: colors.text }}>{s.entry}</p>
          </div>
          <div className="bg-red-500/10 rounded p-1.5">
            <p className="text-[8px] text-red-400">SL</p>
            <p className="text-[10px] text-red-400 font-mono">{s.stop}</p>
          </div>
        </div>
        <div className="flex gap-1 mb-1.5">
          {['tp1', 'tp2', 'tp3'].map(tp => (
            <div key={tp} className={`flex-1 rounded p-1 text-center ${s[`${tp}Hit`] ? 'bg-emerald-500/20' : ''}`}
              style={!s[`${tp}Hit`] ? { background: 'rgba(255,255,255,0.05)' } : {}}>
              <p className="text-[8px]" style={{ color: colors.textDim }}>{tp.toUpperCase()}</p>
              <p className={`text-[9px] font-mono ${s[`${tp}Hit`] ? 'text-emerald-400' : ''}`} style={!s[`${tp}Hit`] ? { color: colors.textMuted } : {}}>{s[tp]}</p>
            </div>
          ))}
        </div>
        {s.status === 'PENDING' && (
          <div className="flex gap-1">
            <button onClick={() => markSignal(s.id, 'WIN')} className="flex-1 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-medium">Win</button>
            <button onClick={() => markSignal(s.id, 'LOSS')} className="flex-1 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded text-[10px] font-medium">Loss</button>
            <button onClick={() => markSignal(s.id, 'SKIP')} className="flex-1 py-1 rounded text-[10px] hover:bg-white/10"
              style={{ background: 'rgba(255,255,255,0.05)', color: colors.textMuted }}>Skip</button>
          </div>
        )}
        {s.status !== 'PENDING' && (
          <div className={`py-1 rounded text-center text-[10px] font-medium ${s.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : s.status === 'LOSS' ? 'bg-red-500/20 text-red-400' : ''}`}
            style={s.status === 'SKIP' ? { background: 'rgba(255,255,255,0.05)', color: colors.textMuted } : {}}>{s.status}</div>
        )}
      </div>
    </div>
  );

  // SECTIONS
  const DashboardSection = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <StatsCard title="Win Rate" value={`${data?.stats?.wins && data?.stats?.losses ? Math.round(data.stats.wins / (data.stats.wins + data.stats.losses) * 100) : 0}%`} icon="📊" />
        <StatsCard title="Activas" value={pendingSignals.length} sub="Pendientes" icon="🎯" />
        <StatsCard title="Wins" value={data?.stats?.wins || 0} sub={`de ${data?.stats?.total || 0}`} icon="✅" />
        <StatsCard title="TP3" value={data?.stats?.tp3Hits || 0} sub="Max profit" icon="💎" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2"><PriceCard /></div>
        <div><AIPanel /></div>
      </div>
      {pendingSignals.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold mb-2" style={{ color: colors.text }}>Señales Activas</h3>
          <div className="grid grid-cols-3 gap-2">
            {pendingSignals.slice(0, 3).map(s => <SignalCard key={s.id} signal={s} />)}
          </div>
        </div>
      )}
    </div>
  );

  const SignalsSection = () => (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold" style={{ color: colors.text }}>Señales ({pendingSignals.length})</h3>
      {pendingSignals.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">{pendingSignals.map(s => <SignalCard key={s.id} signal={s} />)}</div>
      ) : (
        <div className="text-center py-10 rounded-xl border" style={{ background: colors.card, borderColor: colors.border }}>
          <p className="text-xs" style={{ color: colors.textMuted }}>Sin señales activas</p>
        </div>
      )}
    </div>
  );

  const AnalysisSection = () => (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold" style={{ color: colors.text }}>Análisis</h3>
      <div className="grid grid-cols-2 gap-3">
        {data?.assets?.map(a => (
          <div key={a.symbol} className="rounded-xl border p-3" style={{ background: colors.card, borderColor: colors.border }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{a.emoji}</span>
                <div>
                  <p className="text-xs font-medium" style={{ color: colors.text }}>{a.name}</p>
                  <p className="text-sm font-bold font-mono" style={{ color: colors.text }}>{a.price?.toFixed(a.decimals) || '---'}</p>
                </div>
              </div>
              {a.signal?.action && !['WAIT', 'LOADING'].includes(a.signal.action) && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${a.signal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{a.signal.action}</span>
              )}
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between"><span style={{ color: colors.textMuted }}>Estructura</span><span className={a.signal?.analysis?.structure === 'BULLISH' ? 'text-emerald-400' : a.signal?.analysis?.structure === 'BEARISH' ? 'text-red-400' : ''} style={!a.signal?.analysis?.structure ? { color: colors.textMuted } : {}}>{a.signal?.analysis?.structure || 'N/A'}</span></div>
              <div className="flex justify-between"><span style={{ color: colors.textMuted }}>CHoCH</span><span className="text-cyan-400">{a.signal?.analysis?.choch || 'No'}</span></div>
              <div className="flex justify-between"><span style={{ color: colors.textMuted }}>Zonas</span><span style={{ color: colors.textMuted }}>{a.demandZones}D / {a.supplyZones}S</span></div>
              <div className="flex justify-between items-center"><span style={{ color: colors.textMuted }}>Score</span>
                <div className="flex items-center gap-1">
                  <div className="w-14 h-1.5 rounded-full" style={{ background: colors.border }}>
                    <div className={`h-full rounded-full ${(a.signal?.score || 0) >= 70 ? 'bg-emerald-500' : 'bg-yellow-500'}`} style={{ width: `${a.signal?.score || 0}%` }} />
                  </div>
                  <span className="font-mono text-[10px]" style={{ color: colors.textMuted }}>{a.signal?.score || 0}%</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const HistorySection = () => (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold" style={{ color: colors.text }}>Historial</h3>
      <div className="rounded-xl border overflow-hidden" style={{ background: colors.card, borderColor: colors.border }}>
        <table className="w-full">
          <thead><tr className="border-b text-left" style={{ borderColor: colors.border }}>
            <th className="p-2 text-[9px] font-medium" style={{ color: colors.textDim }}>Activo</th>
            <th className="p-2 text-[9px] font-medium" style={{ color: colors.textDim }}>Tipo</th>
            <th className="p-2 text-[9px] font-medium" style={{ color: colors.textDim }}>Entry</th>
            <th className="p-2 text-[9px] font-medium" style={{ color: colors.textDim }}>Resultado</th>
            <th className="p-2 text-[9px] font-medium" style={{ color: colors.textDim }}>Fecha</th>
          </tr></thead>
          <tbody>
            {closedSignals.map(s => (
              <tr key={s.id} className="border-b hover:bg-white/5" style={{ borderColor: colors.border }}>
                <td className="p-2"><div className="flex items-center gap-1"><span>{s.emoji}</span><span className="text-[11px]" style={{ color: colors.text }}>{s.assetName}</span></div></td>
                <td className="p-2"><span className={`px-1 py-0.5 rounded text-[9px] font-medium ${s.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{s.action}</span></td>
                <td className="p-2 font-mono text-[10px]" style={{ color: colors.textMuted }}>{s.entry}</td>
                <td className="p-2"><span className={`px-1 py-0.5 rounded text-[9px] font-medium ${s.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : s.status === 'LOSS' ? 'bg-red-500/20 text-red-400' : ''}`} style={s.status === 'SKIP' ? { background: 'rgba(255,255,255,0.1)', color: colors.textMuted } : {}}>{s.status}</span></td>
                <td className="p-2 text-[10px]" style={{ color: colors.textDim }}>{new Date(s.timestamp).toLocaleDateString('es-ES')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {closedSignals.length === 0 && <p className="p-4 text-center text-[11px]" style={{ color: colors.textMuted }}>Sin historial</p>}
      </div>
    </div>
  );

  const StatsSection = () => {
    const wr = data?.stats?.wins && data?.stats?.losses ? Math.round(data.stats.wins / (data.stats.wins + data.stats.losses) * 100) : 0;
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold" style={{ color: colors.text }}>Estadísticas</h3>
        <div className="grid grid-cols-4 gap-2">
          <StatsCard title="Total" value={data?.stats?.total || 0} icon="📊" />
          <StatsCard title="Wins" value={data?.stats?.wins || 0} icon="✅" />
          <StatsCard title="Losses" value={data?.stats?.losses || 0} icon="❌" />
          <StatsCard title="Win Rate" value={`${wr}%`} icon="🎯" />
        </div>
        <div className="rounded-xl border p-4" style={{ background: colors.card, borderColor: colors.border }}>
          <div className="flex items-center gap-6">
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90"><circle cx="48" cy="48" r="40" fill="none" stroke={colors.border} strokeWidth="6" /><circle cx="48" cy="48" r="40" fill="none" stroke="#10b981" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${wr * 2.51} 251`} /></svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-bold" style={{ color: colors.text }}>{wr}%</span><span className="text-[9px]" style={{ color: colors.textMuted }}>Win Rate</span></div>
            </div>
            <div className="flex-1 space-y-2">
              <div><div className="flex justify-between mb-1 text-[11px]"><span style={{ color: colors.textMuted }}>Wins</span><span className="text-emerald-400">{data?.stats?.wins || 0}</span></div><div className="h-2 rounded-full" style={{ background: colors.border }}><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${wr}%` }} /></div></div>
              <div><div className="flex justify-between mb-1 text-[11px]"><span style={{ color: colors.textMuted }}>Losses</span><span className="text-red-400">{data?.stats?.losses || 0}</span></div><div className="h-2 rounded-full" style={{ background: colors.border }}><div className="h-full bg-red-500 rounded-full" style={{ width: `${100 - wr}%` }} /></div></div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen transition-colors" style={{ background: colors.bg }}>
      <Sidebar />
      <main className={`transition-all ${sidebarOpen ? 'ml-56' : 'ml-16'}`}>
        <Header />
        <div className="p-3">
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
