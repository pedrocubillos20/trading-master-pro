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
// ELISA CHAT - COMPONENTE
// =============================================
const ElisaChat = ({ selectedAsset, isMobile, subscription }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  
  const planSlug = subscription?.plans?.slug || subscription?.status || 'trial';
  const hasAccess = hasModuleAccess('chat', planSlug);

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
            <p className="text-[10px] text-white/50">Asistente IA de Trading</p>
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
            <p className="text-white/60 text-sm mb-4">¡Hola! Soy ELISA, tu asistente de trading.</p>
            <div className="space-y-2">
              {['¿Cómo está el mercado?', '¿Qué señales hay activas?', 'Explícame la estrategia SMC'].map((q, i) => (
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
              msg.role === 'user' 
                ? 'bg-emerald-500 text-black' 
                : 'bg-white/10 text-white/90'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/10 px-4 py-2 rounded-xl">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-white/10">
        <div className="flex gap-2">
          <input ref={inputRef} type="text" value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Pregúntale a ELISA..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500"
          />
          <button onClick={() => sendMessage()} disabled={loading || !text.trim()}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-white font-medium disabled:opacity-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================================
// COMPONENTE PRINCIPAL - DASHBOARD
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
  
  const mountedRef = useRef(true);
  
  // Plan actual del usuario
  const planSlug = useMemo(() => {
    if (!subscription) return 'trial';
    if (subscription.status === 'expired') return 'expired';
    return subscription.plans?.slug || subscription.plan || 'trial';
  }, [subscription]);

  // Días restantes de trial
  const trialDaysLeft = useMemo(() => {
    if (subscription?.status !== 'trial' || !subscription?.trial_ends_at) return null;
    const diff = new Date(subscription.trial_ends_at) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [subscription]);

  // Activos filtrados por plan
  const availableAssets = useMemo(() => {
    if (!data?.assets) return [];
    const allowedSymbols = PLAN_ASSETS[planSlug] || PLAN_ASSETS.trial;
    return data.assets.filter(a => allowedSymbols.includes(a.symbol));
  }, [data?.assets, planSlug]);

  // Señales pendientes
  const pendingSignals = useMemo(() => {
    return availableAssets.filter(a => a.lockedSignal);
  }, [availableAssets]);

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // Cargar suscripción
  useEffect(() => {
    if (!user?.id) return;
    
    const fetchSubscription = async () => {
      try {
        const res = await fetch(`${API_URL}/api/subscription/${user.id}`);
        const json = await res.json();
        if (mountedRef.current) {
          setSubscription(json.subscription);
        }
      } catch (e) { 
        console.error('Subscription error:', e);
        setSubscription({
          status: 'trial',
          plan: 'premium',
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

  // Data fetching
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
    const fetchCandles = async () => {
      try {
        const res = await fetch(`${API_URL}/api/candles/${selectedAsset}`);
        const json = await res.json();
        if (mountedRef.current && json.candles) setCandles(json.candles);
        if (mountedRef.current && json.candlesH1) setCandlesH1(json.candlesH1);
      } catch (e) { console.error('Candles error:', e); }
    };
    fetchCandles();
    const interval = setInterval(fetchCandles, 5000);
    return () => clearInterval(interval);
  }, [selectedAsset]);

  const currentAsset = useMemo(() => {
    return data?.assets?.find(a => a.symbol === selectedAsset);
  }, [data?.assets, selectedAsset]);

  const currentCandles = timeframe === 'H1' ? candlesH1 : candles;

  // Verificar acceso a módulo
  const checkModuleAccess = (moduleId) => {
    return hasModuleAccess(moduleId, planSlug);
  };

  // Manejar click en módulo
  const handleModuleClick = (moduleId) => {
    const module = MODULES.find(m => m.id === moduleId);
    
    if (module?.comingSoon) {
      alert('🚧 Este módulo estará disponible próximamente');
      return;
    }
    
    if (!checkModuleAccess(moduleId)) {
      setShowPricing(true);
      return;
    }
    
    setActiveSection(moduleId);
    if (isMobile) setSidebarOpen(false);
  };

  // =============================================
  // SIDEBAR MEJORADO
  // =============================================
  const Sidebar = () => {
    const planInfo = PLANS_INFO[planSlug] || PLANS_INFO.trial;
    
    return (
      <>
        {isMobile && sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />}
        <aside className={`fixed left-0 top-0 h-full bg-[#0a0a0f] border-r border-white/5 z-40 transition-all duration-300 flex flex-col ${
          sidebarOpen ? (isMobile ? 'w-64' : 'w-56') : 'w-0 overflow-hidden'
        }`}>
          {/* Header */}
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

          {/* Plan Badge */}
          <div className="px-3 py-2 border-b border-white/5 shrink-0">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r ${planInfo.color} bg-opacity-20`}>
              <span className="text-lg">{planInfo.badge}</span>
              <div className="flex-1">
                <p className="text-xs font-bold text-white">{planInfo.name}</p>
                {subscription?.status === 'trial' && trialDaysLeft !== null && (
                  <p className="text-[10px] text-white/70">{trialDaysLeft} días restantes</p>
                )}
              </div>
              {planSlug !== 'elite' && (
                <button 
                  onClick={() => setShowPricing(true)}
                  className="text-[10px] px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-white font-medium"
                >
                  Upgrade
                </button>
              )}
            </div>
          </div>

          {/* Navegación Principal */}
          <div className="flex-1 overflow-y-auto">
            <nav className="p-2">
              <p className="text-[10px] uppercase text-white/30 px-3 py-2 font-medium">Principal</p>
              {MODULES.filter(m => ['dashboard', 'signals', 'chat', 'stats'].includes(m.id)).map(module => {
                const hasAccess = checkModuleAccess(module.id);
                const isActive = activeSection === module.id;
                
                return (
                  <button
                    key={module.id}
                    onClick={() => handleModuleClick(module.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all mb-1 ${
                      isActive 
                        ? 'bg-emerald-500/15 text-emerald-400' 
                        : hasAccess 
                          ? 'text-white/60 hover:bg-white/5 hover:text-white' 
                          : 'text-white/30 hover:bg-white/5'
                    }`}
                  >
                    <span className={hasAccess ? '' : 'grayscale'}>{module.icon}</span>
                    <span className="text-sm flex-1 text-left">{module.label}</span>
                    {!hasAccess && (
                      <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    )}
                    {module.id === 'signals' && pendingSignals.length > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500 text-black rounded-full">
                        {pendingSignals.length}
                      </span>
                    )}
                  </button>
                );
              })}

              <p className="text-[10px] uppercase text-white/30 px-3 py-2 mt-3 font-medium">Herramientas</p>
              {MODULES.filter(m => ['alerts', 'backtesting'].includes(m.id)).map(module => {
                const hasAccess = checkModuleAccess(module.id);
                const isActive = activeSection === module.id;
                
                return (
                  <button
                    key={module.id}
                    onClick={() => handleModuleClick(module.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all mb-1 ${
                      isActive 
                        ? 'bg-emerald-500/15 text-emerald-400' 
                        : hasAccess 
                          ? 'text-white/60 hover:bg-white/5 hover:text-white' 
                          : 'text-white/30 hover:bg-white/5'
                    }`}
                  >
                    <span className={hasAccess ? '' : 'grayscale'}>{module.icon}</span>
                    <span className="text-sm flex-1 text-left">{module.label}</span>
                    {module.comingSoon && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">Soon</span>
                    )}
                    {!hasAccess && !module.comingSoon && (
                      <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    )}
                  </button>
                );
              })}

              <p className="text-[10px] uppercase text-white/30 px-3 py-2 mt-3 font-medium">Elite</p>
              {MODULES.filter(m => ['mentor', 'replay', 'ambassador'].includes(m.id)).map(module => {
                const hasAccess = checkModuleAccess(module.id);
                const isActive = activeSection === module.id;
                
                return (
                  <button
                    key={module.id}
                    onClick={() => handleModuleClick(module.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all mb-1 ${
                      isActive 
                        ? 'bg-purple-500/15 text-purple-400' 
                        : hasAccess 
                          ? 'text-white/60 hover:bg-white/5 hover:text-white' 
                          : 'text-white/30 hover:bg-white/5'
                    }`}
                  >
                    <span className={hasAccess ? '' : 'grayscale'}>{module.icon}</span>
                    <span className="text-sm flex-1 text-left">{module.label}</span>
                    {module.comingSoon && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">Soon</span>
                    )}
                    {!hasAccess && !module.comingSoon && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">Elite</span>
                    )}
                  </button>
                );
              })}

              <p className="text-[10px] uppercase text-white/30 px-3 py-2 mt-3 font-medium">Cuenta</p>
              {MODULES.filter(m => ['settings', 'billing'].includes(m.id)).map(module => (
                <button
                  key={module.id}
                  onClick={() => handleModuleClick(module.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all mb-1 ${
                    activeSection === module.id 
                      ? 'bg-emerald-500/15 text-emerald-400' 
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span>{module.icon}</span>
                  <span className="text-sm">{module.label}</span>
                </button>
              ))}
            </nav>

            {/* Mercados */}
            <div className="p-2 border-t border-white/5">
              <p className="text-[10px] uppercase text-white/30 px-3 py-2 font-medium">
                Mercados ({availableAssets.length})
              </p>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {availableAssets.map(asset => (
                  <button 
                    key={asset.symbol}
                    onClick={() => { setSelectedAsset(asset.symbol); if (isMobile) setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      selectedAsset === asset.symbol ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5'
                    }`}
                  >
                    <span>{asset.emoji}</span>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium">{asset.shortName}</span>
                        {asset.h1Loaded && <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400">H1</span>}
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
              
              {/* Mostrar activos bloqueados */}
              {planSlug !== 'elite' && (
                <button 
                  onClick={() => setShowPricing(true)}
                  className="w-full mt-2 px-3 py-2 border border-dashed border-white/10 rounded-lg text-white/30 text-xs hover:border-white/20 hover:text-white/50 transition-all"
                >
                  + Desbloquear más activos
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-white/5 shrink-0">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${data?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-xs text-white/40">{data?.connected ? 'Conectado' : 'Offline'}</span>
            </div>
          </div>
        </aside>
      </>
    );
  };

  // =============================================
  // HEADER
  // =============================================
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
          <h2 className="text-sm font-medium text-white capitalize">
            {MODULES.find(m => m.id === activeSection)?.label || activeSection}
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Badge del plan */}
          <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gradient-to-r ${planInfo.color} bg-opacity-20`}>
            <span className="text-sm">{planInfo.badge}</span>
            <span className="text-xs text-white font-medium">{planInfo.name}</span>
            {subscription?.status === 'trial' && trialDaysLeft !== null && (
              <span className="text-[10px] text-white/70">({trialDaysLeft}d)</span>
            )}
          </div>

          {planSlug !== 'elite' && (
            <button 
              onClick={() => setShowPricing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 rounded-lg transition-all text-white text-xs font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="hidden sm:inline">Upgrade</span>
            </button>
          )}

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
            </button>
            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-56 bg-[#0d0d12] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-white/5">
                    <p className="text-xs text-white/50">Conectado como</p>
                    <p className="text-sm text-white font-medium truncate">{user?.email}</p>
                    <div className={`inline-flex items-center gap-1 mt-2 px-2 py-1 rounded bg-gradient-to-r ${planInfo.color} bg-opacity-20`}>
                      <span>{planInfo.badge}</span>
                      <span className="text-xs text-white">{planInfo.name}</span>
                    </div>
                  </div>
                  <div className="p-1">
                    <button onClick={() => { handleModuleClick('settings'); setShowUserMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-white/70 hover:bg-white/5 rounded-lg transition-colors text-sm">
                      <span>⚙️</span>
                      Configuración
                    </button>
                    <button onClick={() => { handleModuleClick('billing'); setShowUserMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-white/70 hover:bg-white/5 rounded-lg transition-colors text-sm">
                      <span>💳</span>
                      Plan & Pagos
                    </button>
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
  };

  // =============================================
  // MINI GRÁFICO SVG
  // =============================================
  const MiniChart = ({ data: chartCandles, width = 280, height = 100 }) => {
    if (!chartCandles?.length) return <div className="h-24 flex items-center justify-center text-white/30 text-sm">Cargando...</div>;
    
    const displayCandles = chartCandles.slice(-50);
    const highs = displayCandles.map(c => c.high);
    const lows = displayCandles.map(c => c.low);
    const maxPrice = Math.max(...highs);
    const minPrice = Math.min(...lows);
    const priceRange = maxPrice - minPrice || 1;
    
    const candleWidth = width / displayCandles.length;
    const getY = price => height - ((price - minPrice) / priceRange) * height * 0.9 - height * 0.05;
    
    return (
      <svg width={width} height={height} className="w-full">
        {displayCandles.map((candle, i) => {
          const x = i * candleWidth + candleWidth / 2;
          const isGreen = candle.close >= candle.open;
          const bodyTop = getY(Math.max(candle.open, candle.close));
          const bodyBottom = getY(Math.min(candle.open, candle.close));
          const bodyHeight = Math.max(1, bodyBottom - bodyTop);
          
          return (
            <g key={i}>
              <line x1={x} y1={getY(candle.high)} x2={x} y2={getY(candle.low)} 
                stroke={isGreen ? '#10b981' : '#ef4444'} strokeWidth="1" />
              <rect x={x - candleWidth * 0.35} y={bodyTop} 
                width={candleWidth * 0.7} height={bodyHeight}
                fill={isGreen ? '#10b981' : '#ef4444'} />
            </g>
          );
        })}
      </svg>
    );
  };

  // =============================================
  // SECCIONES
  // =============================================
  
  // Dashboard Principal
  const DashboardSection = () => (
    <div className="space-y-4">
      {/* Stats rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <p className="text-white/50 text-xs mb-1">Señales Activas</p>
          <p className="text-2xl font-bold text-emerald-400">{pendingSignals.length}</p>
        </div>
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <p className="text-white/50 text-xs mb-1">Win Rate</p>
          <p className="text-2xl font-bold text-white">{data?.stats?.winRate || 0}%</p>
        </div>
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <p className="text-white/50 text-xs mb-1">Activos</p>
          <p className="text-2xl font-bold text-white">{availableAssets.length}</p>
        </div>
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <p className="text-white/50 text-xs mb-1">Plan</p>
          <p className="text-lg font-bold text-white">{PLANS_INFO[planSlug]?.name || 'Trial'}</p>
        </div>
      </div>

      {/* Gráfico principal */}
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
            {currentAsset.lockedSignal && (
              <div className={`px-3 py-1.5 rounded-lg ${
                currentAsset.lockedSignal.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
              }`}>
                <span className="font-bold">{currentAsset.lockedSignal.action}</span>
                <span className="text-xs ml-2">{currentAsset.lockedSignal.model}</span>
              </div>
            )}
          </div>
          <MiniChart data={currentCandles} height={200} />
        </div>
      )}

      {/* Señales activas */}
      {pendingSignals.length > 0 && (
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <h3 className="text-white font-bold mb-3">📈 Señales Activas</h3>
          <div className="space-y-2">
            {pendingSignals.map(asset => (
              <div key={asset.symbol} 
                onClick={() => setSelectedAsset(asset.symbol)}
                className="flex items-center justify-between p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{asset.emoji}</span>
                  <div>
                    <p className="text-white font-medium">{asset.shortName}</p>
                    <p className="text-white/50 text-xs">{asset.lockedSignal.model}</p>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-lg font-bold ${
                  asset.lockedSignal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'
                }`}>
                  {asset.lockedSignal.action}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Señales
  const SignalsSection = () => (
    <div className="space-y-4">
      <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
        <h3 className="text-white font-bold mb-4">📈 Todas las Señales</h3>
        {pendingSignals.length === 0 ? (
          <div className="text-center py-8">
            <span className="text-4xl mb-3 block">🔍</span>
            <p className="text-white/50">No hay señales activas</p>
            <p className="text-white/30 text-sm">El motor SMC está analizando el mercado...</p>
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
                  <div className={`px-4 py-2 rounded-xl font-bold text-lg ${
                    asset.lockedSignal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'
                  }`}>
                    {asset.lockedSignal.action}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="bg-black/20 rounded-lg p-2">
                    <p className="text-white/50 text-xs">Entrada</p>
                    <p className="text-white font-mono">{asset.lockedSignal.entry?.toFixed(2)}</p>
                  </div>
                  <div className="bg-black/20 rounded-lg p-2">
                    <p className="text-white/50 text-xs">Stop Loss</p>
                    <p className="text-red-400 font-mono">{asset.lockedSignal.sl?.toFixed(2)}</p>
                  </div>
                  <div className="bg-black/20 rounded-lg p-2">
                    <p className="text-white/50 text-xs">Take Profit</p>
                    <p className="text-emerald-400 font-mono">{asset.lockedSignal.tp?.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Estadísticas
  const StatsSection = () => (
    <div className="space-y-4">
      <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
        <h3 className="text-white font-bold mb-4">📊 Estadísticas</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-white/50 text-sm mb-1">Win Rate</p>
            <p className="text-3xl font-bold text-emerald-400">{data?.stats?.winRate || 0}%</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-white/50 text-sm mb-1">Total Trades</p>
            <p className="text-3xl font-bold text-white">{data?.stats?.totalTrades || 0}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-white/50 text-sm mb-1">Profit Factor</p>
            <p className="text-3xl font-bold text-cyan-400">{data?.stats?.profitFactor || '0.00'}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-white/50 text-sm mb-1">Señales Hoy</p>
            <p className="text-3xl font-bold text-white">{pendingSignals.length}</p>
          </div>
        </div>
      </div>
    </div>
  );

  // Alertas
  const AlertsSection = () => (
    <div className="space-y-4">
      <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
        <h3 className="text-white font-bold mb-4">🔔 Alertas Telegram</h3>
        {checkModuleAccess('alerts') ? (
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
              <p className="text-emerald-400 font-medium">✅ Alertas activadas</p>
              <p className="text-white/50 text-sm mt-1">Recibirás las señales en tu Telegram</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4">
              <p className="text-white/50 text-sm mb-2">Configuración</p>
              <div className="space-y-2">
                <label className="flex items-center justify-between">
                  <span className="text-white">Señales de entrada</span>
                  <input type="checkbox" defaultChecked className="w-5 h-5 accent-emerald-500" />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-white">Actualizaciones TP/SL</span>
                  <input type="checkbox" defaultChecked className="w-5 h-5 accent-emerald-500" />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-white">Resumen diario</span>
                  <input type="checkbox" className="w-5 h-5 accent-emerald-500" />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <LockedModule moduleId="alerts" />
        )}
      </div>
    </div>
  );

  // Configuración
  const SettingsSection = () => (
    <div className="space-y-4">
      <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
        <h3 className="text-white font-bold mb-4">⚙️ Configuración</h3>
        <div className="space-y-4">
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-white font-medium mb-2">Cuenta</p>
            <p className="text-white/50 text-sm">{user?.email}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-white font-medium mb-2">Preferencias de Trading</p>
            <div className="space-y-2">
              <label className="flex items-center justify-between">
                <span className="text-white/70 text-sm">Sonido en señales</span>
                <input type="checkbox" defaultChecked className="w-5 h-5 accent-emerald-500" />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-white/70 text-sm">Modo oscuro</span>
                <input type="checkbox" defaultChecked className="w-5 h-5 accent-emerald-500" />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Plan & Pagos
  const BillingSection = () => {
    const planInfo = PLANS_INFO[planSlug] || PLANS_INFO.trial;
    
    return (
      <div className="space-y-4">
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <h3 className="text-white font-bold mb-4">💳 Plan & Pagos</h3>
          
          {/* Plan actual */}
          <div className={`bg-gradient-to-r ${planInfo.color} bg-opacity-20 rounded-xl p-4 mb-4`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{planInfo.badge}</span>
                <div>
                  <p className="text-white font-bold text-lg">{planInfo.name}</p>
                  {subscription?.status === 'trial' && trialDaysLeft !== null && (
                    <p className="text-white/70 text-sm">{trialDaysLeft} días de prueba restantes</p>
                  )}
                  {subscription?.status === 'active' && subscription?.current_period_end && (
                    <p className="text-white/70 text-sm">
                      Renueva: {new Date(subscription.current_period_end).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              {planSlug !== 'elite' && (
                <button 
                  onClick={() => setShowPricing(true)}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white font-medium transition-all"
                >
                  Cambiar Plan
                </button>
              )}
            </div>
          </div>

          {/* Límites del plan */}
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-white font-medium mb-3">Tu plan incluye:</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-white/70">Activos</span>
                <span className="text-white">{PLAN_ASSETS[planSlug]?.length || 2} mercados</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70">Señales diarias</span>
                <span className="text-white">{PLAN_LIMITS[planSlug]?.signals_per_day || 5}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70">Modelos SMC</span>
                <span className="text-white">{PLAN_LIMITS[planSlug]?.models?.length || 2}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70">Telegram</span>
                <span className={PLAN_LIMITS[planSlug]?.telegram ? 'text-emerald-400' : 'text-white/30'}>
                  {PLAN_LIMITS[planSlug]?.telegram ? '✅' : '❌'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70">ELISA Chat</span>
                <span className={PLAN_LIMITS[planSlug]?.elisa_chat ? 'text-emerald-400' : 'text-white/30'}>
                  {PLAN_LIMITS[planSlug]?.elisa_chat ? '✅' : '❌'}
                </span>
              </div>
            </div>
          </div>

          {planSlug !== 'elite' && (
            <button 
              onClick={() => setShowPricing(true)}
              className="w-full mt-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 rounded-xl text-white font-bold transition-all"
            >
              🚀 Ver todos los planes
            </button>
          )}
        </div>
      </div>
    );
  };

  // Módulo bloqueado
  const LockedModule = ({ moduleId }) => {
    const module = MODULES.find(m => m.id === moduleId);
    const requiredPlan = getRequiredPlan(moduleId);
    const requiredPlanInfo = PLANS_INFO[requiredPlan];
    
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
          <svg className="w-8 h-8 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h3 className="text-white font-bold text-lg mb-2">{module?.label || 'Módulo'} bloqueado</h3>
        <p className="text-white/50 mb-4">
          Necesitas el plan {requiredPlanInfo?.name} o superior para acceder
        </p>
        <button 
          onClick={() => setShowPricing(true)}
          className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 rounded-xl text-white font-bold transition-all"
        >
          🚀 Desbloquear con {requiredPlanInfo?.name}
        </button>
      </div>
    );
  };

  // Coming Soon
  const ComingSoonModule = ({ moduleId }) => {
    const module = MODULES.find(m => m.id === moduleId);
    
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-500/20 flex items-center justify-center">
          <span className="text-3xl">{module?.icon}</span>
        </div>
        <h3 className="text-white font-bold text-lg mb-2">{module?.label}</h3>
        <p className="text-white/50 mb-2">{module?.description}</p>
        <span className="inline-block px-4 py-2 bg-purple-500/20 text-purple-400 rounded-full text-sm font-medium">
          🚧 Próximamente
        </span>
      </div>
    );
  };

  // Renderizar sección activa
  const renderSection = () => {
    const module = MODULES.find(m => m.id === activeSection);
    
    if (module?.comingSoon) {
      return <ComingSoonModule moduleId={activeSection} />;
    }
    
    if (!checkModuleAccess(activeSection) && !['settings', 'billing'].includes(activeSection)) {
      return <LockedModule moduleId={activeSection} />;
    }

    switch (activeSection) {
      case 'dashboard': return <DashboardSection />;
      case 'signals': return <SignalsSection />;
      case 'stats': return <StatsSection />;
      case 'alerts': return <AlertsSection />;
      case 'settings': return <SettingsSection />;
      case 'billing': return <BillingSection />;
      case 'chat': return <div className="text-center py-12 text-white/50">Usa el botón flotante de ELISA 🤖</div>;
      default: return <DashboardSection />;
    }
  };

  // =============================================
  // RENDER PRINCIPAL
  // =============================================
  return (
    <div className="min-h-screen bg-[#06060a]">
      <Sidebar />
      <main className={`transition-all duration-300 ${sidebarOpen && !isMobile ? 'ml-56' : 'ml-0'}`}>
        <Header />
        <div className="p-3 pb-24">
          {renderSection()}
        </div>
      </main>
      
      <ElisaChat selectedAsset={selectedAsset} isMobile={isMobile} subscription={subscription} />
      
      {showPricing && (
        <Pricing 
          user={user} 
          subscription={subscription}
          onClose={() => setShowPricing(false)} 
        />
      )}
    </div>
  );
}
