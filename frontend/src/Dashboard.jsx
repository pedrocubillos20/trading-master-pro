import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Pricing from './Pricing';
import { 
  MODULES, 
  PLAN_ASSETS, 
  ASSETS_INFO, 
  PLAN_LIMITS, 
  PLANS_INFO,
  hasModuleAccess, 
  hasAssetAccess,
  getRequiredPlan 
} from './config/plans';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// PANTALLA DE BLOQUEO - TRIAL EXPIRADO
// =============================================
const ExpiredScreen = ({ onSelectPlan, user }) => (
  <div className="fixed inset-0 bg-[#06060a] z-50 flex items-center justify-center p-4">
    <div className="max-w-md w-full text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
        <span className="text-4xl">⏰</span>
      </div>
      <h1 className="text-2xl font-bold text-white mb-3">Tu período de prueba ha terminado</h1>
      <p className="text-white/60 mb-6">
        Gracias por probar Trading Master Pro. Para continuar usando la plataforma, 
        selecciona un plan que se adapte a tus necesidades.
      </p>
      <div className="space-y-3">
        <button 
          onClick={onSelectPlan}
          className="w-full py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-xl text-black font-bold text-lg transition-all"
        >
          🚀 Ver Planes y Precios
        </button>
        <p className="text-white/40 text-sm">
          Planes desde $29,900 COP/mes
        </p>
      </div>
    </div>
  </div>
);

// =============================================
// ELISA CHAT - COMPONENTE
// =============================================
const ElisaChat = ({ selectedAsset, isMobile, subscription }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  
  const messagesEndRef = useRef(null);
  const planSlug = subscription?.plans?.slug || subscription?.plan || 'trial';
  const hasAccess = hasModuleAccess('chat', planSlug);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [messages.length]);

  const sendMessage = async (customText) => {
    const messageText = customText || text.trim();
    if (!messageText || loading) return;

    setText('');
    setMessages(prev => [...prev, { role: 'user', content: messageText }]);
    setLoading(true);
    setInitialized(true);

    try {
      const res = await fetch(`${API_URL}/api/elisa/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText, asset: selectedAsset })
      });
      const data = await res.json();
      if (data.response) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error de conexión' }]);
    }
    setLoading(false);
  };

  if (!hasAccess) return null;

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full shadow-lg flex items-center justify-center z-50 hover:scale-110 transition-transform">
        <span className="text-2xl">🤖</span>
      </button>
    );
  }

  return (
    <div className={`fixed ${isMobile ? 'inset-2' : 'bottom-4 right-4 w-96 h-[500px]'} bg-[#0d0d12] rounded-2xl border border-white/10 shadow-2xl z-50 flex flex-col`}>
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <span>🤖</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">ELISA</h3>
            <p className="text-[10px] text-white/50">Asistente IA</p>
          </div>
        </div>
        <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/5 rounded-lg">
          <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!initialized && (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🤖</div>
            <p className="text-white/60 text-sm mb-4">¡Hola! Soy ELISA</p>
            <div className="space-y-2">
              {['¿Cómo está el mercado?', '¿Qué señales hay?', 'Explícame SMC'].map((q, i) => (
                <button key={i} onClick={() => sendMessage(q)}
                  className="w-full px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/70 text-left">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
              msg.role === 'user' ? 'bg-emerald-500 text-black' : 'bg-white/10 text-white/90'
            }`}>{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/10 px-4 py-2 rounded-xl flex gap-1">
              <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-white/10 flex gap-2">
        <input type="text" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Pregúntale a ELISA..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500"
        />
        <button onClick={() => sendMessage()} disabled={loading || !text.trim()}
          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-white font-medium disabled:opacity-50">
          ➤
        </button>
      </div>
    </div>
  );
};

// =============================================
// DASHBOARD PRINCIPAL
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
  const [showPricing, setShowPricing] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [isExpired, setIsExpired] = useState(false);
  
  const mountedRef = useRef(true);
  
  const planSlug = useMemo(() => {
    if (!subscription) return 'trial';
    if (subscription.status === 'expired') return 'expired';
    if (subscription.status === 'active') return subscription.plans?.slug || subscription.plan || 'basic';
    return subscription.plan || 'trial';
  }, [subscription]);

  useEffect(() => {
    if (subscription?.status === 'trial' && subscription?.trial_ends_at) {
      if (new Date() > new Date(subscription.trial_ends_at)) setIsExpired(true);
    }
    if (subscription?.status === 'expired') setIsExpired(true);
  }, [subscription]);

  const trialDaysLeft = useMemo(() => {
    if (subscription?.status !== 'trial' || !subscription?.trial_ends_at) return null;
    const diff = new Date(subscription.trial_ends_at) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [subscription]);

  const availableAssets = useMemo(() => {
    if (!data?.assets) return [];
    const effectivePlan = isExpired ? 'expired' : planSlug;
    const allowedSymbols = PLAN_ASSETS[effectivePlan] || PLAN_ASSETS.trial;
    return data.assets.filter(a => allowedSymbols.includes(a.symbol));
  }, [data?.assets, planSlug, isExpired]);

  const pendingSignals = useMemo(() => availableAssets.filter(a => a.lockedSignal), [availableAssets]);

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    if (!user?.id) return;
    const fetchSubscription = async () => {
      try {
        const res = await fetch(`${API_URL}/api/subscription/${user.id}`);
        const json = await res.json();
        if (mountedRef.current && json.subscription) {
          setSubscription(json.subscription);
        } else {
          setSubscription({
            status: 'trial',
            plan: 'trial',
            trial_ends_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
          });
        }
      } catch (e) { 
        setSubscription({
          status: 'trial',
          plan: 'trial',
          trial_ends_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
        });
      }
    };
    fetchSubscription();
  }, [user?.id]);
  
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_URL}/api/dashboard`);
        const json = await res.json();
        if (!isCancelled && mountedRef.current) {
          setData(json);
          if (!selectedAsset && json.assets?.length) {
            const allowedSymbols = PLAN_ASSETS[planSlug] || PLAN_ASSETS.trial;
            const firstAllowed = json.assets.find(a => allowedSymbols.includes(a.symbol));
            if (firstAllowed) setSelectedAsset(firstAllowed.symbol);
          }
        }
      } catch (e) { console.error('Fetch error:', e); }
    };
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => { isCancelled = true; clearInterval(interval); };
  }, [selectedAsset, planSlug]);

  useEffect(() => {
    if (!selectedAsset) return;
    let isCancelled = false;
    const fetchCandles = async () => {
      try {
        const res = await fetch(`${API_URL}/api/candles/${selectedAsset}`);
        const json = await res.json();
        if (!isCancelled && mountedRef.current) {
          if (json.candles?.length) setCandles(json.candles);
          if (json.candlesH1?.length) setCandlesH1(json.candlesH1);
        }
      } catch (e) { console.error('Candles error:', e); }
    };
    fetchCandles();
    const interval = setInterval(fetchCandles, 5000);
    return () => { isCancelled = true; clearInterval(interval); };
  }, [selectedAsset]);

  const currentAsset = useMemo(() => data?.assets?.find(a => a.symbol === selectedAsset), [data?.assets, selectedAsset]);
  const currentCandles = timeframe === 'H1' ? candlesH1 : candles;
  const checkModuleAccess = (moduleId) => isExpired ? false : hasModuleAccess(moduleId, planSlug);

  const handleModuleClick = (moduleId) => {
    if (isExpired) { setShowPricing(true); return; }
    const module = MODULES.find(m => m.id === moduleId);
    if (module?.comingSoon) { alert('🚧 Próximamente'); return; }
    if (!checkModuleAccess(moduleId)) { setShowPricing(true); return; }
    setActiveSection(moduleId);
    if (isMobile) setSidebarOpen(false);
  };

  // GRÁFICO DE VELAS
  const CandleChart = ({ candles: chartCandles, height = 200 }) => {
    const containerRef = useRef(null);
    const [width, setWidth] = useState(600);

    useEffect(() => {
      if (containerRef.current) {
        setWidth(containerRef.current.getBoundingClientRect().width);
      }
      const handleResize = () => {
        if (containerRef.current) setWidth(containerRef.current.getBoundingClientRect().width);
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (!chartCandles || chartCandles.length === 0) {
      return (
        <div ref={containerRef} className="w-full flex items-center justify-center" style={{ height }}>
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-white/40 text-sm">Cargando gráfico...</p>
          </div>
        </div>
      );
    }
    
    const displayCandles = chartCandles.slice(-60);
    const padding = { top: 10, right: 60, bottom: 20, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    const highs = displayCandles.map(c => c.high);
    const lows = displayCandles.map(c => c.low);
    const maxPrice = Math.max(...highs);
    const minPrice = Math.min(...lows);
    const priceRange = maxPrice - minPrice || 1;
    
    const candleWidth = chartWidth / displayCandles.length;
    const getY = price => padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
    const getX = index => padding.left + index * candleWidth + candleWidth / 2;

    const priceLevels = Array.from({length: 5}, (_, i) => minPrice + (priceRange * i / 4));
    const decimals = currentAsset?.decimals || 2;
    
    return (
      <div ref={containerRef} className="w-full">
        <svg width={width} height={height}>
          {priceLevels.map((price, i) => (
            <g key={i}>
              <line x1={padding.left} y1={getY(price)} x2={width - padding.right} y2={getY(price)}
                stroke="rgba(255,255,255,0.05)" strokeDasharray="4,4" />
              <text x={padding.left - 5} y={getY(price) + 4} fill="rgba(255,255,255,0.3)" fontSize="10" textAnchor="end">
                {price.toFixed(decimals)}
              </text>
            </g>
          ))}
          {displayCandles.map((candle, i) => {
            const x = getX(i);
            const isGreen = candle.close >= candle.open;
            const color = isGreen ? '#10b981' : '#ef4444';
            const bodyTop = getY(Math.max(candle.open, candle.close));
            const bodyBottom = getY(Math.min(candle.open, candle.close));
            const bodyHeight = Math.max(1, bodyBottom - bodyTop);
            return (
              <g key={i}>
                <line x1={x} y1={getY(candle.high)} x2={x} y2={getY(candle.low)} stroke={color} strokeWidth="1" />
                <rect x={x - candleWidth * 0.35} y={bodyTop} width={candleWidth * 0.7} height={bodyHeight} fill={color} rx="1" />
              </g>
            );
          })}
          {displayCandles.length > 0 && (
            <g>
              <line x1={padding.left} y1={getY(displayCandles[displayCandles.length - 1].close)}
                x2={width - padding.right} y2={getY(displayCandles[displayCandles.length - 1].close)}
                stroke="#10b981" strokeWidth="1" strokeDasharray="4,2" />
              <rect x={width - padding.right + 2} y={getY(displayCandles[displayCandles.length - 1].close) - 10}
                width="55" height="20" fill="#10b981" rx="4" />
              <text x={width - padding.right + 30} y={getY(displayCandles[displayCandles.length - 1].close) + 4}
                fill="black" fontSize="10" fontWeight="bold" textAnchor="middle">
                {displayCandles[displayCandles.length - 1].close.toFixed(decimals)}
              </text>
            </g>
          )}
        </svg>
      </div>
    );
  };

  // SIDEBAR
  const Sidebar = () => {
    const planInfo = PLANS_INFO[planSlug] || PLANS_INFO.trial;
    return (
      <>
        {isMobile && sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />}
        <aside className={`fixed left-0 top-0 h-full bg-[#0a0a0f] border-r border-white/5 z-40 transition-all duration-300 flex flex-col ${
          sidebarOpen ? (isMobile ? 'w-64' : 'w-56') : 'w-0 overflow-hidden'
        }`}>
          <div className="h-14 flex items-center justify-between px-3 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <span className="font-bold text-sm text-white block leading-tight">TradingPro</span>
                <span className="text-[10px] text-white/40">SMC Institucional</span>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-white/5 rounded-lg">
              <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-3 py-2 border-b border-white/5 shrink-0">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isExpired ? 'bg-red-500/20 border border-red-500/30' : `bg-gradient-to-r ${planInfo.color} bg-opacity-20`}`}>
              <span className="text-lg">{isExpired ? '⚠️' : planInfo.badge}</span>
              <div className="flex-1">
                <p className="text-xs font-bold text-white">{isExpired ? 'Expirado' : planInfo.name}</p>
                {subscription?.status === 'trial' && trialDaysLeft !== null && !isExpired && (
                  <p className="text-[10px] text-white/70">{trialDaysLeft} días restantes</p>
                )}
              </div>
              <button onClick={() => setShowPricing(true)} className="text-[10px] px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-white font-medium">
                {isExpired ? 'Activar' : 'Upgrade'}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <nav className="p-2">
              <p className="text-[10px] uppercase text-white/30 px-3 py-2 font-medium">Principal</p>
              {MODULES.filter(m => ['dashboard', 'signals', 'chat', 'stats'].includes(m.id)).map(module => {
                const hasAccess = checkModuleAccess(module.id);
                const isActive = activeSection === module.id;
                return (
                  <button key={module.id} onClick={() => handleModuleClick(module.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all mb-1 ${
                      isActive ? 'bg-emerald-500/15 text-emerald-400' : hasAccess ? 'text-white/60 hover:bg-white/5' : 'text-white/30 hover:bg-white/5'
                    }`}>
                    <span className={hasAccess ? '' : 'grayscale opacity-50'}>{module.icon}</span>
                    <span className="text-sm flex-1 text-left">{module.label}</span>
                    {!hasAccess && <span className="text-[9px] text-white/30">🔒</span>}
                    {module.id === 'signals' && pendingSignals.length > 0 && hasAccess && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500 text-black rounded-full">{pendingSignals.length}</span>
                    )}
                  </button>
                );
              })}

              <p className="text-[10px] uppercase text-white/30 px-3 py-2 mt-3 font-medium">Herramientas</p>
              {MODULES.filter(m => ['alerts', 'backtesting'].includes(m.id)).map(module => (
                <button key={module.id} onClick={() => handleModuleClick(module.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all mb-1 ${
                    activeSection === module.id ? 'bg-emerald-500/15 text-emerald-400' : 'text-white/30 hover:bg-white/5'
                  }`}>
                  <span className="grayscale opacity-50">{module.icon}</span>
                  <span className="text-sm flex-1 text-left">{module.label}</span>
                  {module.comingSoon && <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">Soon</span>}
                </button>
              ))}

              <p className="text-[10px] uppercase text-white/30 px-3 py-2 mt-3 font-medium">Elite</p>
              {MODULES.filter(m => ['mentor', 'replay', 'ambassador'].includes(m.id)).map(module => (
                <button key={module.id} onClick={() => handleModuleClick(module.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all mb-1 text-white/30 hover:bg-white/5">
                  <span className="grayscale opacity-50">{module.icon}</span>
                  <span className="text-sm flex-1 text-left">{module.label}</span>
                  <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">Soon</span>
                </button>
              ))}

              <p className="text-[10px] uppercase text-white/30 px-3 py-2 mt-3 font-medium">Cuenta</p>
              {MODULES.filter(m => ['settings', 'billing'].includes(m.id)).map(module => (
                <button key={module.id} onClick={() => handleModuleClick(module.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all mb-1 ${
                    activeSection === module.id ? 'bg-emerald-500/15 text-emerald-400' : 'text-white/60 hover:bg-white/5'
                  }`}>
                  <span>{module.icon}</span>
                  <span className="text-sm">{module.label}</span>
                </button>
              ))}
            </nav>

            <div className="p-2 border-t border-white/5">
              <p className="text-[10px] uppercase text-white/30 px-3 py-2 font-medium">Mercados ({availableAssets.length})</p>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {availableAssets.map(asset => (
                  <button key={asset.symbol} onClick={() => { setSelectedAsset(asset.symbol); if (isMobile) setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      selectedAsset === asset.symbol ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5'
                    }`}>
                    <span>{asset.emoji}</span>
                    <div className="flex-1 text-left">
                      <span className="text-xs font-medium block">{asset.shortName}</span>
                      <span className="text-[10px] text-white/40 font-mono">{asset.price?.toFixed(2)}</span>
                    </div>
                    {asset.lockedSignal && (
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                        asset.lockedSignal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'
                      }`}>{asset.lockedSignal.action}</span>
                    )}
                  </button>
                ))}
              </div>
              {planSlug !== 'elite' && !isExpired && (
                <button onClick={() => setShowPricing(true)}
                  className="w-full mt-2 px-3 py-2 border border-dashed border-white/10 rounded-lg text-white/30 text-xs hover:border-white/20 transition-all">
                  + Más activos
                </button>
              )}
            </div>
          </div>

          <div className="p-3 border-t border-white/5 shrink-0">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${data?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-xs text-white/40">{data?.connected ? 'Conectado' : 'Desconectado'}</span>
            </div>
          </div>
        </aside>
      </>
    );
  };

  // HEADER
  const Header = () => {
    const planInfo = PLANS_INFO[planSlug] || PLANS_INFO.trial;
    return (
      <header className="h-12 bg-[#0a0a0f] border-b border-white/5 flex items-center justify-between px-3 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-white/5 rounded-lg">
              <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          <h2 className="text-sm font-medium text-white capitalize">{MODULES.find(m => m.id === activeSection)?.label || 'Dashboard'}</h2>
        </div>
        
        <div className="flex items-center gap-2">
          <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg ${isExpired ? 'bg-red-500/20' : `bg-gradient-to-r ${planInfo.color} bg-opacity-20`}`}>
            <span className="text-sm">{isExpired ? '⚠️' : planInfo.badge}</span>
            <span className="text-xs text-white font-medium">{isExpired ? 'Expirado' : planInfo.name}</span>
            {trialDaysLeft !== null && !isExpired && <span className="text-[10px] text-white/70">({trialDaysLeft}d)</span>}
          </div>

          <button onClick={() => setShowPricing(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg text-white text-xs font-medium">
            ⚡ <span className="hidden sm:inline">{isExpired ? 'Activar' : 'Upgrade'}</span>
          </button>

          <div className="flex bg-white/5 rounded-lg p-0.5">
            {['M5', 'H1'].map(tf => (
              <button key={tf} onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  timeframe === tf ? 'bg-emerald-500 text-black' : 'text-white/50'
                }`}>{tf}</button>
            ))}
          </div>

          <div className="relative">
            <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded-lg">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                <span className="text-black text-xs font-bold">{user?.email?.charAt(0).toUpperCase() || 'U'}</span>
              </div>
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
                    <button onClick={() => { handleModuleClick('settings'); setShowUserMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-white/70 hover:bg-white/5 rounded-lg text-sm">
                      ⚙️ Configuración
                    </button>
                    <button onClick={() => { handleModuleClick('billing'); setShowUserMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-white/70 hover:bg-white/5 rounded-lg text-sm">
                      💳 Plan & Pagos
                    </button>
                    <button onClick={onLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-lg text-sm">
                      🚪 Cerrar Sesión
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
    );
  };

  // SECCIONES
  const DashboardSection = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Señales Activas', value: pendingSignals.length, color: 'text-emerald-400' },
          { label: 'Win Rate', value: `${data?.stats?.winRate || 0}%`, color: 'text-white' },
          { label: 'Activos', value: availableAssets.length, color: 'text-white' },
          { label: 'Plan', value: PLANS_INFO[planSlug]?.name || 'Trial', color: 'text-white' }
        ].map((stat, i) => (
          <div key={i} className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
            <p className="text-white/50 text-xs mb-1">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {currentAsset && (
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">{currentAsset.emoji}</span>
              <div>
                <h3 className="text-white font-bold">{currentAsset.name}</h3>
                <p className="text-white/50 text-sm font-mono">{currentAsset.price?.toFixed(currentAsset.decimals || 2)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentAsset.lockedSignal && (
                <div className={`px-3 py-1.5 rounded-lg ${currentAsset.lockedSignal.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                  <span className="font-bold">{currentAsset.lockedSignal.action}</span>
                </div>
              )}
              <span className="text-xs text-white/40 bg-white/5 px-2 py-1 rounded">{timeframe}</span>
            </div>
          </div>
          <CandleChart candles={currentCandles} height={250} />
        </div>
      )}

      {pendingSignals.length > 0 && (
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <h3 className="text-white font-bold mb-3">📈 Señales Activas</h3>
          <div className="space-y-2">
            {pendingSignals.map(asset => (
              <div key={asset.symbol} onClick={() => setSelectedAsset(asset.symbol)}
                className="flex items-center justify-between p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{asset.emoji}</span>
                  <div>
                    <p className="text-white font-medium">{asset.shortName}</p>
                    <p className="text-white/50 text-xs">{asset.lockedSignal.model}</p>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-lg font-bold ${asset.lockedSignal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>
                  {asset.lockedSignal.action}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const SignalsSection = () => (
    <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
      <h3 className="text-white font-bold mb-4">📈 Señales IA</h3>
      {pendingSignals.length === 0 ? (
        <div className="text-center py-8">
          <span className="text-4xl block mb-3">🔍</span>
          <p className="text-white/50">Sin señales activas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingSignals.map(asset => (
            <div key={asset.symbol} className="p-4 bg-white/5 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{asset.emoji}</span>
                  <div>
                    <p className="text-white font-bold">{asset.name}</p>
                    <p className="text-white/50 text-sm">{asset.lockedSignal.model}</p>
                  </div>
                </div>
                <div className={`px-4 py-2 rounded-xl font-bold ${asset.lockedSignal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>
                  {asset.lockedSignal.action}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-black/20 rounded-lg p-2">
                  <p className="text-white/50 text-xs">Entrada</p>
                  <p className="text-white font-mono">{asset.lockedSignal.entry?.toFixed(2)}</p>
                </div>
                <div className="bg-black/20 rounded-lg p-2">
                  <p className="text-white/50 text-xs">SL</p>
                  <p className="text-red-400 font-mono">{asset.lockedSignal.sl?.toFixed(2)}</p>
                </div>
                <div className="bg-black/20 rounded-lg p-2">
                  <p className="text-white/50 text-xs">TP</p>
                  <p className="text-emerald-400 font-mono">{asset.lockedSignal.tp?.toFixed(2)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const StatsSection = () => (
    <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
      <h3 className="text-white font-bold mb-4">📊 Estadísticas</h3>
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Win Rate', value: `${data?.stats?.winRate || 0}%`, color: 'text-emerald-400' },
          { label: 'Total Trades', value: data?.stats?.totalTrades || 0, color: 'text-white' },
          { label: 'Profit Factor', value: data?.stats?.profitFactor || '0.00', color: 'text-cyan-400' },
          { label: 'Señales Hoy', value: pendingSignals.length, color: 'text-white' }
        ].map((stat, i) => (
          <div key={i} className="bg-white/5 rounded-xl p-4">
            <p className="text-white/50 text-sm mb-1">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const SettingsSection = () => (
    <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
      <h3 className="text-white font-bold mb-4">⚙️ Configuración</h3>
      <div className="space-y-4">
        <div className="bg-white/5 rounded-xl p-4">
          <p className="text-white font-medium mb-2">Cuenta</p>
          <p className="text-white/50 text-sm">{user?.email}</p>
        </div>
      </div>
    </div>
  );

  const BillingSection = () => {
    const planInfo = PLANS_INFO[planSlug] || PLANS_INFO.trial;
    return (
      <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
        <h3 className="text-white font-bold mb-4">💳 Plan & Pagos</h3>
        <div className={`rounded-xl p-4 mb-4 ${isExpired ? 'bg-red-500/20' : `bg-gradient-to-r ${planInfo.color} bg-opacity-20`}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{isExpired ? '⚠️' : planInfo.badge}</span>
              <div>
                <p className="text-white font-bold text-lg">{isExpired ? 'Expirado' : planInfo.name}</p>
                {trialDaysLeft !== null && !isExpired && <p className="text-white/70 text-sm">{trialDaysLeft} días restantes</p>}
              </div>
            </div>
            <button onClick={() => setShowPricing(true)} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white font-medium">
              {isExpired ? 'Ver Planes' : 'Cambiar'}
            </button>
          </div>
        </div>
        <button onClick={() => setShowPricing(true)}
          className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-white font-bold">
          🚀 Ver todos los planes
        </button>
      </div>
    );
  };

  const LockedModule = ({ moduleId }) => {
    const module = MODULES.find(m => m.id === moduleId);
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
          <span className="text-2xl">🔒</span>
        </div>
        <h3 className="text-white font-bold text-lg mb-2">{module?.label} bloqueado</h3>
        <p className="text-white/50 mb-4">Actualiza tu plan para acceder</p>
        <button onClick={() => setShowPricing(true)}
          className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-white font-bold">
          🚀 Ver Planes
        </button>
      </div>
    );
  };

  const ComingSoon = ({ moduleId }) => {
    const module = MODULES.find(m => m.id === moduleId);
    return (
      <div className="text-center py-12">
        <span className="text-4xl block mb-4">{module?.icon}</span>
        <h3 className="text-white font-bold text-lg mb-2">{module?.label}</h3>
        <span className="inline-block px-4 py-2 bg-purple-500/20 text-purple-400 rounded-full text-sm">🚧 Próximamente</span>
      </div>
    );
  };

  const renderSection = () => {
    const module = MODULES.find(m => m.id === activeSection);
    if (module?.comingSoon) return <ComingSoon moduleId={activeSection} />;
    if (!checkModuleAccess(activeSection) && !['settings', 'billing'].includes(activeSection)) return <LockedModule moduleId={activeSection} />;
    switch (activeSection) {
      case 'dashboard': return <DashboardSection />;
      case 'signals': return <SignalsSection />;
      case 'stats': return <StatsSection />;
      case 'settings': return <SettingsSection />;
      case 'billing': return <BillingSection />;
      case 'chat': return <div className="text-center py-12 text-white/50">Usa el botón flotante 🤖</div>;
      default: return <DashboardSection />;
    }
  };

  if (isExpired && !showPricing) {
    return (
      <>
        <ExpiredScreen onSelectPlan={() => setShowPricing(true)} user={user} />
        {showPricing && <Pricing user={user} subscription={subscription} onClose={() => setShowPricing(false)} />}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#06060a]">
      <Sidebar />
      <main className={`transition-all duration-300 ${sidebarOpen && !isMobile ? 'ml-56' : 'ml-0'}`}>
        <Header />
        <div className="p-3 pb-24">{renderSection()}</div>
      </main>
      <ElisaChat selectedAsset={selectedAsset} isMobile={isMobile} subscription={subscription} />
      {showPricing && <Pricing user={user} subscription={subscription} onClose={() => setShowPricing(false)} />}
    </div>
  );
}
