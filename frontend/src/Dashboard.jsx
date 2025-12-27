import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// TRADUCCIONES SIMPLIFICADAS
// =============================================
const translations = {
  es: {
    appName: 'TradingPro',
    nav: { dashboard: 'Dashboard', signals: 'Señales', models: 'Modelos', history: 'Historial', stats: 'Stats', markets: 'Mercados' },
    dashboard: { winRate: 'Win Rate', active: 'Activas', wins: 'Wins', losses: 'Losses', total: 'Total', score: 'Score', activeSignals: 'Señales Activas', noActiveSignals: 'Sin señales activas' },
    signals: { entry: 'Entry', stop: 'Stop', win: '✓ Win', loss: '✗ Loss', skip: 'Skip', long: 'LONG', short: 'SHORT', waiting: 'Esperando setup' },
    models: { title: '6 Modelos SMC' }
  }
};

const t = translations.es;

// =============================================
// COMPONENTE PRINCIPAL
// =============================================
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [candles, setCandles] = useState([]);
  const [isLoadingCandles, setIsLoadingCandles] = useState(true);
  
  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/dashboard`);
      const json = await res.json();
      setData(json);
      if (!selectedAsset && json.assets?.length) setSelectedAsset(json.assets[0].symbol);
    } catch (e) { console.error(e); }
  }, [selectedAsset]);

  const fetchCandles = useCallback(async () => {
    if (!selectedAsset) return;
    try {
      const res = await fetch(`${API_URL}/api/analyze/${selectedAsset}`);
      const json = await res.json();
      if (json.candles?.length) { setCandles(json.candles); setIsLoadingCandles(false); }
    } catch { setIsLoadingCandles(false); }
  }, [selectedAsset]);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 3000); return () => clearInterval(i); }, [fetchData]);
  useEffect(() => { if (selectedAsset) { setIsLoadingCandles(true); fetchCandles(); const i = setInterval(fetchCandles, 4000); return () => clearInterval(i); } }, [selectedAsset, fetchCandles]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const markSignal = async (id, status) => {
    try {
      await fetch(`${API_URL}/api/signals/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      fetchData();
    } catch (e) { console.error(e); }
  };

  // ═══════════════════════════════════════════
  // CHAT CON MARCUS - ARREGLADO
  // ═══════════════════════════════════════════
  const sendMessage = async (customMsg) => {
    const text = customMsg || inputValue.trim();
    if (!text) return;
    
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setIsTyping(true);
    
    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, symbol: selectedAsset || 'stpRNG' })
      });
      const json = await res.json();
      setMessages(prev => [...prev, { role: 'marcus', text: json.answer }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'marcus', text: '❌ Error de conexión' }]);
    }
    setIsTyping(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const openChat = () => {
    setChatOpen(true);
    if (messages.length === 0) setTimeout(() => sendMessage('hola'), 200);
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  const currentAsset = data?.assets?.find(a => a.symbol === selectedAsset);
  const lockedSignal = currentAsset?.lockedSignal;
  const pendingSignals = data?.recentSignals?.filter(s => s.status === 'PENDING') || [];
  const closedSignals = data?.recentSignals?.filter(s => s.status !== 'PENDING') || [];

  const modelColors = {
    'MTF_CONFLUENCE': { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'MTF' },
    'CHOCH_PULLBACK': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'CHoCH' },
    'LIQUIDITY_SWEEP': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'LIQ' },
    'BOS_CONTINUATION': { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'BOS' },
    'FVG_ENTRY': { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'FVG' },
    'ORDER_FLOW': { bg: 'bg-pink-500/20', text: 'text-pink-400', label: 'OF' }
  };
  const getModelStyle = (model) => modelColors[model] || { bg: 'bg-white/10', text: 'text-white/60', label: model?.substring(0, 4) || '?' };

  // ═══════════════════════════════════════════
  // CHART
  // ═══════════════════════════════════════════
  const Chart = ({ height = 280 }) => {
    const containerRef = useRef(null);
    const [width, setWidth] = useState(600);
    
    useEffect(() => {
      const updateWidth = () => {
        if (containerRef.current) setWidth(containerRef.current.offsetWidth || 600);
      };
      updateWidth();
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }, []);

    if (isLoadingCandles) {
      return (
        <div ref={containerRef} style={{ height }} className="flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      );
    }

    if (!candles?.length) {
      return (
        <div ref={containerRef} style={{ height }} className="flex items-center justify-center text-white/30 text-sm">
          Sin datos
        </div>
      );
    }

    const padding = { top: 10, right: 55, bottom: 20, left: 5 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const displayCandles = candles.slice(-50);
    const candleW = Math.max(3, (chartW / displayCandles.length) * 0.7);
    const gap = (chartW / displayCandles.length) - candleW;

    const prices = displayCandles.flatMap(c => [c.high, c.low]);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const padP = (maxP - minP) * 0.1;
    const adjMin = minP - padP;
    const adjMax = maxP + padP;
    const scale = chartH / (adjMax - adjMin);
    const getY = (p) => padding.top + (adjMax - p) * scale;

    const lastPrice = displayCandles[displayCandles.length - 1]?.close;
    const decimals = currentAsset?.decimals || 2;
    const signal = lockedSignal;

    return (
      <div ref={containerRef} className="w-full">
        <svg width={width} height={height}>
          {/* Grid */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const price = adjMax - ((adjMax - adjMin) * pct);
            return (
              <g key={i}>
                <line x1={padding.left} y1={getY(price)} x2={width - padding.right} y2={getY(price)} stroke="rgba(255,255,255,0.04)" />
                <text x={width - padding.right + 4} y={getY(price) + 3} fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="monospace">
                  {price.toFixed(decimals)}
                </text>
              </g>
            );
          })}

          {/* Candles */}
          {displayCandles.map((c, i) => {
            const x = padding.left + i * (candleW + gap);
            const isGreen = c.close >= c.open;
            const top = getY(Math.max(c.open, c.close));
            const bottom = getY(Math.min(c.open, c.close));
            const color = isGreen ? '#10b981' : '#ef4444';
            return (
              <g key={i}>
                <line x1={x + candleW / 2} y1={getY(c.high)} x2={x + candleW / 2} y2={getY(c.low)} stroke={color} strokeWidth="1" />
                <rect x={x} y={top} width={candleW} height={Math.max(1, bottom - top)} fill={color} />
              </g>
            );
          })}

          {/* Price line */}
          {lastPrice && (
            <g>
              <line x1={padding.left} y1={getY(lastPrice)} x2={width - padding.right} y2={getY(lastPrice)} stroke="#10b981" strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />
              <rect x={width - padding.right - 2} y={getY(lastPrice) - 8} width="52" height="16" fill="#10b981" rx="2" />
              <text x={width - padding.right + 24} y={getY(lastPrice) + 4} fill="black" fontSize="9" fontFamily="monospace" textAnchor="middle" fontWeight="bold">
                {lastPrice.toFixed(decimals)}
              </text>
            </g>
          )}

          {/* Signal lines */}
          {signal && (
            <>
              <line x1={padding.left} y1={getY(signal.entry)} x2={width - padding.right} y2={getY(signal.entry)} stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,3" />
              <line x1={padding.left} y1={getY(signal.tp1)} x2={width - padding.right} y2={getY(signal.tp1)} stroke="#10b981" strokeWidth="1" opacity={signal.tp1Hit ? 1 : 0.4} />
              <line x1={padding.left} y1={getY(signal.tp2)} x2={width - padding.right} y2={getY(signal.tp2)} stroke="#10b981" strokeWidth="1" opacity={signal.tp2Hit ? 1 : 0.3} />
              <line x1={padding.left} y1={getY(signal.tp3)} x2={width - padding.right} y2={getY(signal.tp3)} stroke="#10b981" strokeWidth="1" opacity={signal.tp3Hit ? 1 : 0.2} />
              <line x1={padding.left} y1={getY(signal.stop)} x2={width - padding.right} y2={getY(signal.stop)} stroke="#ef4444" strokeWidth="2" />
            </>
          )}
        </svg>
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // MARCUS CHAT - SIMPLE Y FUNCIONAL
  // ═══════════════════════════════════════════
  const MarcusChat = () => {
    if (!chatOpen) {
      return (
        <button 
          onClick={openChat}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-2xl px-5 py-3 shadow-2xl shadow-purple-500/30 transition-all hover:scale-105"
        >
          <span className="text-2xl">🤖</span>
          <div className="text-left">
            <p className="font-semibold text-sm">Marcus</p>
            <p className="text-xs text-white/70">Mentor SMC</p>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
        </button>
      );
    }

    return (
      <div className="fixed bottom-6 right-6 z-50 w-96 bg-[#0a0a0f] rounded-2xl shadow-2xl border border-white/10 flex flex-col" style={{ height: '500px' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-violet-600 to-purple-600 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <p className="font-semibold text-white text-sm">Marcus</p>
              <p className="text-xs text-white/70">{currentAsset?.name || 'Cargando...'}</p>
            </div>
          </div>
          <button 
            onClick={() => setChatOpen(false)} 
            className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'marcus' && (
                <div className="w-7 h-7 rounded-full bg-violet-500/30 flex items-center justify-center mr-2 flex-shrink-0 text-sm">
                  🤖
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                msg.role === 'user' 
                  ? 'bg-violet-600 text-white' 
                  : 'bg-white/5 text-white/90'
              }`}>
                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-violet-500/30 flex items-center justify-center mr-2 text-sm">🤖</div>
              <div className="bg-white/5 rounded-2xl px-4 py-3 flex gap-1.5">
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          
          <div ref={chatEndRef} />
        </div>

        {/* Quick buttons */}
        <div className="px-4 py-2 border-t border-white/5 flex gap-2 overflow-x-auto">
          {['📊 Análisis', '📦 Zonas', '🎯 Plan', '💡 Señal'].map((btn, i) => (
            <button 
              key={i}
              onClick={() => sendMessage(btn.split(' ')[1].toLowerCase())}
              className="flex-shrink-0 px-3 py-1.5 bg-white/5 hover:bg-violet-500/20 rounded-full text-xs text-white/60 hover:text-white transition-all"
            >
              {btn}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/5">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pregúntame sobre el gráfico..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500 focus:bg-white/10"
              autoComplete="off"
            />
            <button 
              onClick={() => sendMessage()}
              disabled={!inputValue.trim() || isTyping}
              className="w-12 h-12 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // SIDEBAR
  // ═══════════════════════════════════════════
  const Sidebar = () => (
    <aside className={`fixed left-0 top-0 h-full bg-[#0a0a0f] border-r border-white/5 transition-all z-40 ${sidebarOpen ? 'w-52' : 'w-14'}`}>
      <div className="h-12 flex items-center justify-between px-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
            <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          {sidebarOpen && <span className="font-bold text-sm text-white">{t.appName}</span>}
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 hover:bg-white/5 rounded">
          <svg className={`w-4 h-4 text-white/50 transition-transform ${!sidebarOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <nav className="p-2 space-y-1">
        {[
          { id: 'dashboard', icon: '🏠', label: t.nav.dashboard },
          { id: 'signals', icon: '🔔', label: t.nav.signals, badge: pendingSignals.length },
          { id: 'models', icon: '🧠', label: t.nav.models },
          { id: 'history', icon: '📜', label: t.nav.history },
          { id: 'stats', icon: '📈', label: t.nav.stats },
        ].map(item => (
          <button 
            key={item.id} 
            onClick={() => setActiveSection(item.id)}
            className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors ${
              activeSection === item.id ? 'bg-emerald-500/15 text-emerald-400' : 'text-white/60 hover:bg-white/5'
            }`}
          >
            <span>{item.icon}</span>
            {sidebarOpen && (
              <>
                <span className="text-xs">{item.label}</span>
                {item.badge > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500 text-black rounded-full">
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
      </nav>

      {/* Markets */}
      <div className="p-2 border-t border-white/5">
        {sidebarOpen && <p className="text-[9px] uppercase text-white/30 mb-1 px-2">{t.nav.markets}</p>}
        <div className="space-y-0.5 max-h-[280px] overflow-y-auto">
          {data?.assets?.map(asset => {
            const ms = asset.lockedSignal ? getModelStyle(asset.lockedSignal.model) : null;
            return (
              <button
                key={asset.symbol}
                onClick={() => { setSelectedAsset(asset.symbol); setMessages([]); }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                  selectedAsset === asset.symbol ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5'
                }`}
              >
                <span className="text-sm">{asset.emoji}</span>
                {sidebarOpen && (
                  <>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-1">
                        <p className="text-[11px] font-medium">{asset.shortName}</p>
                        <span className="text-[8px] px-1 py-0.5 rounded bg-white/10">M5</span>
                        {asset.h1Loaded && <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400">H1</span>}
                      </div>
                      <p className="text-[9px] font-mono text-white/40">{asset.price?.toFixed(2) || '---'}</p>
                    </div>
                    {asset.lockedSignal && (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`px-1 py-0.5 text-[8px] font-bold rounded ${asset.lockedSignal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>
                          {asset.lockedSignal.action}
                        </span>
                        <span className={`px-1 py-0.5 text-[7px] rounded ${ms?.bg} ${ms?.text}`}>{ms?.label}</span>
                      </div>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Connection status */}
      <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-white/5">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${data?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {sidebarOpen && <span className="text-[10px] text-white/40">{data?.connected ? 'Conectado' : 'Offline'}</span>}
        </div>
      </div>
    </aside>
  );

  // ═══════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════
  const Header = () => (
    <header className="h-11 bg-[#0a0a0f] border-b border-white/5 flex items-center justify-between px-4 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-medium text-white capitalize">{t.nav[activeSection]}</h2>
        <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">{t.models.title}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded">M5 + H1</span>
      </div>
    </header>
  );

  // ═══════════════════════════════════════════
  // COMPONENTS
  // ═══════════════════════════════════════════
  const StatsCard = ({ title, value, icon }) => (
    <div className="rounded-xl p-3 bg-[#0f0f14]">
      <div className="text-xl mb-2">{icon}</div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-[10px] text-white/50">{title}</p>
    </div>
  );

  const PriceCard = () => {
    if (!currentAsset) return null;
    
    const signal = lockedSignal;
    const ms = signal ? getModelStyle(signal.model) : null;
    const analysis = currentAsset?.signal?.analysis;
    
    return (
      <div className="rounded-xl bg-[#0f0f14] overflow-hidden">
        {/* Header */}
        <div className="p-3 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-xl">{currentAsset.emoji}</div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{currentAsset.name}</h3>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">M5</span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className={analysis?.structure === 'BULLISH' ? 'text-emerald-400' : analysis?.structure === 'BEARISH' ? 'text-red-400' : 'text-white/40'}>
                  M5: {analysis?.structure || 'LOADING'}
                </span>
                <span className={analysis?.h1Trend === 'BULLISH' ? 'text-emerald-400' : analysis?.h1Trend === 'BEARISH' ? 'text-red-400' : 'text-white/40'}>
                  H1: {analysis?.h1Trend || 'LOADING'}
                </span>
                {analysis?.mtfConfluence && <span className="text-purple-400">✨ MTF</span>}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold font-mono text-white">{currentAsset.price?.toFixed(currentAsset.decimals) || '---'}</p>
            <div className="flex items-center gap-1 justify-end text-[9px] text-white/40">
              <span>📦 {currentAsset.demandZones}D / {currentAsset.supplyZones}S</span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="p-2">
          <Chart height={260} />
        </div>

        {/* Signal info */}
        {signal && (
          <div className="p-3 border-t border-white/5" style={{ background: signal.action === 'LONG' ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1.5 rounded-lg font-bold ${signal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>
                  {signal.action}
                </span>
                <div>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${ms?.bg} ${ms?.text}`}>{signal.model}</span>
                  <span className="text-[10px] text-white/50 ml-1">#{signal.id}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-white">{signal.score}%</div>
                <p className="text-[9px] text-white/30">{t.dashboard.score}</p>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div className="bg-blue-500/20 rounded p-2 text-center">
                <p className="text-[8px] text-blue-400 uppercase">{t.signals.entry}</p>
                <p className="text-[11px] font-mono text-blue-400 font-bold">{signal.entry}</p>
              </div>
              {['tp1', 'tp2', 'tp3'].map(tp => (
                <div key={tp} className={`rounded p-2 text-center ${signal[`${tp}Hit`] ? 'bg-emerald-500/30' : 'bg-emerald-500/10'}`}>
                  <p className="text-[8px] text-emerald-400 uppercase">{tp.toUpperCase()} {signal[`${tp}Hit`] && '✓'}</p>
                  <p className="text-[11px] font-mono text-emerald-400">{signal[tp]}</p>
                </div>
              ))}
              <div className="bg-red-500/20 rounded p-2 text-center">
                <p className="text-[8px] text-red-400 uppercase">{t.signals.stop}</p>
                <p className="text-[11px] font-mono text-red-400 font-bold">{signal.stop}</p>
              </div>
            </div>
          </div>
        )}

        {/* Score indicator when no signal */}
        {!signal && currentAsset.signal && (
          <div className="p-3 border-t border-white/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/60">{t.dashboard.score}: {currentAsset.signal.score || 0}%</p>
                <p className="text-[10px] text-white/40">{currentAsset.signal.reason || t.signals.waiting}</p>
              </div>
              <div className="w-14 h-14 relative">
                <svg className="w-14 h-14 -rotate-90">
                  <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                  <circle cx="28" cy="28" r="24" fill="none" stroke={currentAsset.signal.score >= 60 ? "#10b981" : "#eab308"} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(currentAsset.signal.score || 0) * 1.5} 150`} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">{currentAsset.signal.score || 0}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const SignalCard = ({ signal: s }) => {
    const ms = getModelStyle(s.model);
    return (
      <div className="rounded-xl p-3 bg-[#0f0f14]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{s.emoji}</span>
            <div>
              <p className="text-xs font-medium text-white">{s.assetName}</p>
              <div className="flex items-center gap-1">
                <span className={`px-1 py-0.5 text-[8px] rounded ${ms.bg} ${ms.text}`}>{ms.label}</span>
                <span className="text-[9px] text-white/40">#{s.id}</span>
              </div>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>
            {s.action}
          </span>
        </div>
        
        <div className="grid grid-cols-2 gap-1 mb-2">
          <div className="bg-blue-500/10 rounded p-1.5">
            <p className="text-[8px] text-blue-400">{t.signals.entry}</p>
            <p className="text-[10px] font-mono text-blue-400">{s.entry}</p>
          </div>
          <div className="bg-red-500/10 rounded p-1.5">
            <p className="text-[8px] text-red-400">{t.signals.stop}</p>
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
            <button onClick={() => markSignal(s.id, 'WIN')} className="flex-1 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded text-[10px]">{t.signals.win}</button>
            <button onClick={() => markSignal(s.id, 'LOSS')} className="flex-1 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded text-[10px]">{t.signals.loss}</button>
            <button onClick={() => markSignal(s.id, 'SKIP')} className="flex-1 py-1 bg-white/5 text-white/50 rounded text-[10px]">{t.signals.skip}</button>
          </div>
        )}
        
        {s.status !== 'PENDING' && (
          <div className={`py-1 rounded text-center text-[10px] font-medium ${
            s.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : 
            s.status === 'LOSS' ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-white/50'
          }`}>
            {s.status}
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // SECTIONS
  // ═══════════════════════════════════════════
  const DashboardSection = () => {
    const wr = data?.stats?.wins + data?.stats?.losses > 0 
      ? Math.round(data.stats.wins / (data.stats.wins + data.stats.losses) * 100) 
      : 0;
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <StatsCard title={t.dashboard.winRate} value={`${wr}%`} icon="📊" />
          <StatsCard title={t.dashboard.active} value={pendingSignals.length} icon="🎯" />
          <StatsCard title={t.dashboard.wins} value={data?.stats?.wins || 0} icon="✅" />
          <StatsCard title="TP3" value={data?.stats?.tp3Hits || 0} icon="💎" />
        </div>
        
        <PriceCard />
        
        {pendingSignals.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-white mb-2">{t.dashboard.activeSignals}</h3>
            <div className="grid grid-cols-3 gap-3">
              {pendingSignals.slice(0, 3).map(s => <SignalCard key={s.id} signal={s} />)}
            </div>
          </div>
        )}
      </div>
    );
  };

  const SignalsSection = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-white">{t.dashboard.activeSignals} ({pendingSignals.length})</h3>
      {pendingSignals.length > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          {pendingSignals.map(s => <SignalCard key={s.id} signal={s} />)}
        </div>
      ) : (
        <div className="text-center py-12 rounded-xl bg-[#0f0f14]">
          <p className="text-white/50">{t.dashboard.noActiveSignals}</p>
        </div>
      )}
    </div>
  );

  const ModelsSection = () => {
    const models = [
      { name: 'MTF_CONFLUENCE', score: 95, desc: 'H1+M5 alineados + Pullback', icon: '🎯' },
      { name: 'CHOCH_PULLBACK', score: 90, desc: 'Cambio de carácter + Pullback', icon: '⚡' },
      { name: 'LIQUIDITY_SWEEP', score: 85, desc: 'Caza de stops + Reversión', icon: '💧' },
      { name: 'BOS_CONTINUATION', score: 80, desc: 'Ruptura de estructura', icon: '📈' },
      { name: 'FVG_ENTRY', score: 75, desc: 'Entrada en Fair Value Gap', icon: '📦' },
      { name: 'ORDER_FLOW', score: 70, desc: 'Momentum + Pullback menor', icon: '🌊' }
    ];
    
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white">{t.models.title}</h3>
        <div className="grid grid-cols-2 gap-4">
          {models.map(m => {
            const style = getModelStyle(m.name);
            const ms = data?.stats?.byModel?.[m.name] || { wins: 0, losses: 0 };
            const wr = ms.wins + ms.losses > 0 ? Math.round(ms.wins / (ms.wins + ms.losses) * 100) : 0;
            const adj = data?.learning?.scoreAdjustments?.[m.name] || 0;
            
            return (
              <div key={m.name} className="rounded-xl p-4 bg-[#0f0f14]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{m.icon}</span>
                    <div>
                      <p className={`text-sm font-medium ${style.text}`}>{m.name}</p>
                      <p className="text-[10px] text-white/40">{m.desc}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-white">{m.score}pts</p>
                    {adj !== 0 && <p className={`text-[10px] ${adj > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{adj > 0 ? '+' : ''}{adj}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-white/10 rounded-full">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500" style={{ width: `${wr}%` }} />
                  </div>
                  <span className="text-[10px] text-white/60">{wr}%</span>
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-white/40">
                  <span>✅ {ms.wins}</span>
                  <span>❌ {ms.losses}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const HistorySection = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-white">{t.nav.history}</h3>
      <div className="rounded-xl bg-[#0f0f14] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5 text-left">
              <th className="p-3 text-[10px] text-white/50">ID</th>
              <th className="p-3 text-[10px] text-white/50">Activo</th>
              <th className="p-3 text-[10px] text-white/50">Modelo</th>
              <th className="p-3 text-[10px] text-white/50">Tipo</th>
              <th className="p-3 text-[10px] text-white/50">Score</th>
              <th className="p-3 text-[10px] text-white/50">TPs</th>
              <th className="p-3 text-[10px] text-white/50">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {closedSignals.map(s => {
              const style = getModelStyle(s.model);
              return (
                <tr key={s.id} className="border-b border-white/5">
                  <td className="p-3 text-[10px] text-white/40">#{s.id}</td>
                  <td className="p-3 text-xs text-white">{s.emoji} {s.assetName}</td>
                  <td className="p-3"><span className={`px-1 py-0.5 rounded text-[9px] ${style.bg} ${style.text}`}>{style.label}</span></td>
                  <td className="p-3"><span className={`px-1 py-0.5 rounded text-[9px] ${s.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{s.action}</span></td>
                  <td className="p-3 text-[10px] text-white/50">{s.score}%</td>
                  <td className="p-3 text-[10px]">
                    <span className={s.tp1Hit ? 'text-emerald-400' : 'text-white/30'}>1</span>/
                    <span className={s.tp2Hit ? 'text-emerald-400' : 'text-white/30'}>2</span>/
                    <span className={s.tp3Hit ? 'text-emerald-400' : 'text-white/30'}>3</span>
                  </td>
                  <td className="p-3">
                    <span className={`px-1 py-0.5 rounded text-[9px] ${
                      s.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : 
                      s.status === 'LOSS' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/50'
                    }`}>{s.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {closedSignals.length === 0 && <p className="p-6 text-center text-xs text-white/40">Sin historial</p>}
      </div>
    </div>
  );

  const StatsSection = () => {
    const wr = data?.stats?.wins + data?.stats?.losses > 0 
      ? Math.round(data.stats.wins / (data.stats.wins + data.stats.losses) * 100) 
      : 0;
    
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white">{t.nav.stats}</h3>
        <div className="grid grid-cols-4 gap-3">
          <StatsCard title={t.dashboard.total} value={data?.stats?.total || 0} icon="📊" />
          <StatsCard title={t.dashboard.wins} value={data?.stats?.wins || 0} icon="✅" />
          <StatsCard title={t.dashboard.losses} value={data?.stats?.losses || 0} icon="❌" />
          <StatsCard title={t.dashboard.winRate} value={`${wr}%`} icon="🎯" />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl p-4 bg-[#0f0f14]">
            <h4 className="text-xs font-medium text-white mb-3">Win Rate Global</h4>
            <div className="flex items-center gap-6">
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 -rotate-90">
                  <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                  <circle cx="48" cy="48" r="40" fill="none" stroke="#10b981" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${wr * 2.51} 251`} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-white">{wr}%</span>
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/50">{t.dashboard.wins}</span>
                    <span className="text-emerald-400">{data?.stats?.wins || 0}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${wr}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/50">{t.dashboard.losses}</span>
                    <span className="text-red-400">{data?.stats?.losses || 0}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${100 - wr}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl p-4 bg-[#0f0f14]">
            <h4 className="text-xs font-medium text-white mb-3">🧠 Auto-Learning</h4>
            <div className="space-y-2">
              {Object.entries(data?.learning?.scoreAdjustments || {}).map(([model, adj]) => {
                const style = getModelStyle(model);
                return (
                  <div key={model} className="flex items-center justify-between">
                    <span className={`text-[11px] ${style.text}`}>{model}</span>
                    <span className={`text-[11px] font-mono ${adj > 0 ? 'text-emerald-400' : adj < 0 ? 'text-red-400' : 'text-white/50'}`}>
                      {adj > 0 ? '+' : ''}{adj}
                    </span>
                  </div>
                );
              })}
              {Object.keys(data?.learning?.scoreAdjustments || {}).length === 0 && (
                <p className="text-[10px] text-white/40 text-center py-4">Sin ajustes aún</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#06060a]">
      <Sidebar />
      <main className={`transition-all ${sidebarOpen ? 'ml-52' : 'ml-14'}`}>
        <Header />
        <div className="p-4 pb-24">
          {activeSection === 'dashboard' && <DashboardSection />}
          {activeSection === 'signals' && <SignalsSection />}
          {activeSection === 'models' && <ModelsSection />}
          {activeSection === 'history' && <HistorySection />}
          {activeSection === 'stats' && <StatsSection />}
        </div>
      </main>
      <MarcusChat />
    </div>
  );
}
