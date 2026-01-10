import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Pricing from './Pricing';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// ELISA CHAT
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
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
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
      <button onClick={openChat}
        className={`fixed z-[100] flex items-center gap-3 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white rounded-2xl shadow-xl transition-transform hover:scale-105 ${
          isMobile ? 'bottom-4 right-4 px-3 py-2.5' : 'bottom-6 right-6 px-4 py-3'
        }`}>
        <div className="relative">
          <img 
            src="/elisa.png" 
            alt="ELISA" 
            className="w-10 h-10 rounded-full object-cover border-2 border-white/30"
            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
          />
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 items-center justify-center text-lg font-bold hidden">
            <AIIcon size={24} />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-purple-600 animate-pulse" />
        </div>
        <div className="text-left">
          <p className="font-bold text-sm">ELISA</p>
          {!isMobile && <p className="text-xs text-white/70">IA Trading Expert</p>}
        </div>
      </button>
    );
  }

  return (
    <div className={`fixed z-[100] bg-[#0d0d12] rounded-2xl shadow-2xl border border-white/10 flex flex-col ${
      isMobile ? 'inset-2' : 'bottom-6 right-6 w-[380px]'
    }`} style={{ height: isMobile ? 'calc(100% - 16px)' : '520px' }}>
      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img 
              src="/elisa.png" 
              alt="ELISA" 
              className="w-11 h-11 rounded-full object-cover border-2 border-white/30 shadow-lg"
              onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
            />
            <div className="w-11 h-11 rounded-full bg-white/20 items-center justify-center hidden">
              <AIIcon size={28} />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-purple-600" />
          </div>
          <div>
            <p className="font-bold text-white">ELISA</p>
            <p className="text-xs text-white/70">IA Trading Expert</p>
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
              <img 
                src="/elisa.png" 
                alt="ELISA" 
                className="w-8 h-8 rounded-full object-cover mr-2 flex-shrink-0 border border-pink-500/30"
                onError={(e) => { e.target.src = ''; e.target.className = 'w-8 h-8 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 mr-2 flex-shrink-0'; }}
              />
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
            <img 
              src="/elisa.png" 
              alt="ELISA" 
              className="w-8 h-8 rounded-full object-cover mr-2 flex-shrink-0 border border-pink-500/30"
              onError={(e) => { e.target.src = ''; e.target.className = 'w-8 h-8 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 mr-2 flex-shrink-0'; }}
            />
            <div className="bg-white/5 rounded-2xl px-4 py-3 flex gap-1.5">
              <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-white/10">
        <div className="flex gap-2">
          <input ref={inputRef} type="text" value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Escribe tu pregunta..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-pink-500"
            style={{ fontSize: '16px' }}
          />
          <button onClick={() => sendMessage()}
            className="px-4 py-2.5 bg-gradient-to-r from-pink-500 to-purple-600 rounded-xl text-white font-medium">
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
};


// =============================================
// MINI CHART CON NIVELES DE SEÑAL
// =============================================
const MiniChart = ({ candles, height = 200, signal = null }) => {
  const svgRef = useRef(null);
  
  useEffect(() => {
    if (!candles?.length || !svgRef.current) return;
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const w = rect.width || 600;
    const h = height;
    const padding = { top: 15, right: 75, bottom: 15, left: 10 };
    
    const visibleCandles = candles.slice(-60);
    
    // Calcular rango incluyendo niveles de señal
    let allPrices = visibleCandles.flatMap(c => [c.high, c.low]);
    if (signal) {
      if (signal.entry) allPrices.push(signal.entry);
      if (signal.stop) allPrices.push(signal.stop);
      if (signal.tp1) allPrices.push(signal.tp1);
      if (signal.tp2) allPrices.push(signal.tp2);
      if (signal.tp3) allPrices.push(signal.tp3);
    }
    
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const range = maxP - minP || 1;
    
    const candleW = (w - padding.left - padding.right) / visibleCandles.length;
    const scaleY = (p) => padding.top + ((maxP - p) / range) * (h - padding.top - padding.bottom);
    
    let html = '';
    
    // ═══════════════════════════════════════════════════════════════
    // DIBUJAR VELAS PRIMERO
    // ═══════════════════════════════════════════════════════════════
    
    visibleCandles.forEach((c, i) => {
      const x = padding.left + i * candleW + candleW / 2;
      const isGreen = c.close >= c.open;
      const color = isGreen ? '#10b981' : '#ef4444';
      const bodyTop = scaleY(Math.max(c.open, c.close));
      const bodyBottom = scaleY(Math.min(c.open, c.close));
      const bodyH = Math.max(1, bodyBottom - bodyTop);
      
      html += `<line x1="${x}" y1="${scaleY(c.high)}" x2="${x}" y2="${scaleY(c.low)}" stroke="${color}" stroke-width="1"/>`;
      html += `<rect x="${x - candleW * 0.35}" y="${bodyTop}" width="${candleW * 0.7}" height="${bodyH}" fill="${color}"/>`;
    });
    
    // ═══════════════════════════════════════════════════════════════
    // DIBUJAR NIVELES DE SEÑAL
    // ═══════════════════════════════════════════════════════════════
    
    if (signal && signal.entry) {
      const drawLevel = (price, color, label) => {
        if (!price || price < minP * 0.99 || price > maxP * 1.01) return '';
        const y = scaleY(price);
        let levelHtml = '';
        
        const isDashed = label === 'ENTRY';
        levelHtml += `<line x1="${padding.left}" y1="${y}" x2="${w - padding.right}" y2="${y}" stroke="${color}" stroke-width="1.5" ${isDashed ? 'stroke-dasharray="6,4"' : ''} opacity="0.7"/>`;
        levelHtml += `<rect x="${w - padding.right + 3}" y="${y - 9}" width="65" height="18" rx="3" fill="${color}"/>`;
        levelHtml += `<text x="${w - padding.right + 35}" y="${y + 4}" text-anchor="middle" fill="white" font-family="Arial" font-size="9" font-weight="bold">${label}</text>`;
        
        return levelHtml;
      };
      
      html += drawLevel(signal.stop, '#ef4444', 'SL');
      html += drawLevel(signal.entry, '#f59e0b', 'ENTRY');
      html += drawLevel(signal.tp1, '#34d399', 'TP1');
      html += drawLevel(signal.tp2, '#10b981', 'TP2');
      html += drawLevel(signal.tp3, '#06b6d4', 'TP3');
    }
    
    // Precio actual
    const lastPrice = visibleCandles[visibleCandles.length - 1]?.close;
    if (lastPrice) {
      const y = scaleY(lastPrice);
      html += `<line x1="${padding.left}" y1="${y}" x2="${w - padding.right}" y2="${y}" stroke="#3b82f6" stroke-width="1" stroke-dasharray="3,3" opacity="0.5"/>`;
      html += `<rect x="${w - padding.right + 3}" y="${y - 9}" width="65" height="18" rx="3" fill="#3b82f6"/>`;
      html += `<text x="${w - padding.right + 35}" y="${y + 4}" text-anchor="middle" fill="white" font-family="Arial" font-size="9" font-weight="bold">${lastPrice.toFixed(2)}</text>`;
    }
    
    svg.innerHTML = html;
  }, [candles, height, signal]);
  
  return <svg ref={svgRef} className="w-full" style={{ height }} />;
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
  const [loadingSub, setLoadingSub] = useState(true);
  const [isNightBlocked, setIsNightBlocked] = useState(false);
  
  const mountedRef = useRef(true);
  const initialAssetSetRef = useRef(false);
  const marketsScrollRef = useRef(null);
  const scrollPositionRef = useRef(0);
  
  // Función para verificar si estamos en horario de trading
  const checkTradingHours = useCallback((plan) => {
    const now = new Date();
    const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
    
    // Horario base: 11:00 - 19:00 UTC (6AM - 2PM Colombia)
    const inBaseHours = utcHour >= 11 && utcHour < 19;
    
    // Horario nocturno: 01:30 - 06:00 UTC (8:30PM - 1AM Colombia)
    const inNightHours = utcHour >= 1.5 && utcHour < 6;
    
    // Premium y Elite tienen acceso nocturno
    const hasNightAccess = plan === 'premium' || plan === 'elite';
    
    if (inBaseHours) return { open: true, blocked: false };
    if (inNightHours && hasNightAccess) return { open: true, blocked: false };
    if (inNightHours && !hasNightAccess) return { open: false, blocked: true, reason: 'nocturno' };
    
    return { open: false, blocked: true, reason: 'cerrado' };
  }, []);
  
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // Cargar suscripción del usuario (solo una vez)
  useEffect(() => {
    if (!user?.email && !user?.id) return;
    
    const fetchSubscription = async () => {
      try {
        // Usar email si está disponible, sino usar id
        const identifier = user.email || user.id;
        const res = await fetch(`${API_URL}/api/subscription/${encodeURIComponent(identifier)}`);
        const json = await res.json();
        if (mountedRef.current) {
          setSubscription(json.subscription);
          setLoadingSub(false);
          
          // Verificar horario
          const hours = checkTradingHours(json.subscription?.plan);
          setIsNightBlocked(hours.blocked && hours.reason === 'nocturno');
        }
      } catch (e) { 
        console.error('Subscription error:', e);
        // Default trial con activos limitados
        setSubscription({
          status: 'trial',
          plan: 'free',
          plan_name: 'Free Trial',
          days_left: 5,
          assets: ['stpRNG', 'frxXAUUSD']
        });
        setLoadingSub(false);
      }
    };
    
    fetchSubscription();
    
    // Verificar horario cada minuto
    const hourCheck = setInterval(() => {
      if (subscription?.plan) {
        const hours = checkTradingHours(subscription.plan);
        setIsNightBlocked(hours.blocked && hours.reason === 'nocturno');
      }
    }, 60000);
    
    return () => clearInterval(hourCheck);
  }, [user?.id, user?.email, checkTradingHours]);

  // Verificar acceso - usar useMemo para evitar recrear el array
  const isExpired = subscription?.status === 'expired';
  const allowedAssets = useMemo(() => {
    return subscription?.assets || ['stpRNG', 'frxXAUUSD'];
  }, [subscription?.assets]);
  
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
          // Solo establecer el activo inicial UNA vez
          if (!initialAssetSetRef.current && json.assets?.length) {
            initialAssetSetRef.current = true;
            setSelectedAsset(json.assets[0].symbol);
          }
        }
      } catch (e) { console.error('Fetch error:', e); }
    };
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => { isCancelled = true; clearInterval(interval); };
  }, []);

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
  }, [selectedAsset, isMobile]);

  const markSignal = async (id, status) => {
    try {
      await fetch(`${API_URL}/api/signals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
    } catch (e) { console.error('Signal error:', e); }
  };

  const pendingSignals = useMemo(() => data?.recentSignals?.filter(s => s.status === 'PENDING') || [], [data?.recentSignals]);
  const closedSignals = useMemo(() => data?.recentSignals?.filter(s => s.status !== 'PENDING') || [], [data?.recentSignals]);
  const currentAsset = useMemo(() => data?.assets?.find(a => a.symbol === selectedAsset), [data?.assets, selectedAsset]);
  const lockedSignal = currentAsset?.lockedSignal;
  const currentCandles = timeframe === 'H1' ? candlesH1 : candles;

  // Filtrar activos según plan
  const filteredAssets = useMemo(() => {
    if (!data?.assets) return [];
    return data.assets.filter(asset => allowedAssets.includes(asset.symbol));
  }, [data?.assets, allowedAssets]);

  const lockedAssets = useMemo(() => {
    if (!data?.assets) return [];
    return data.assets.filter(asset => !allowedAssets.includes(asset.symbol));
  }, [data?.assets, allowedAssets]);

  // Restaurar posición del scroll después de cada render
  useEffect(() => {
    if (marketsScrollRef.current && scrollPositionRef.current > 0) {
      marketsScrollRef.current.scrollTop = scrollPositionRef.current;
    }
  });

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

        {/* Subscription Badge */}
        <div className="p-2 border-b border-white/5">
          <div className={`px-3 py-2 rounded-lg ${
            subscription?.status === 'trial' ? 'bg-amber-500/20' : 
            subscription?.status === 'expired' ? 'bg-red-500/20' : 'bg-emerald-500/20'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                subscription?.status === 'trial' ? 'bg-amber-500 text-black' : 
                subscription?.status === 'expired' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-black'
              }`}>
                {subscription?.status === 'trial' ? 'FREE' : 
                 subscription?.status === 'expired' ? 'EXPIRADO' :
                 subscription?.plan_name?.toUpperCase() || 'ACTIVE'}
              </span>
              {subscription?.days_left !== undefined && subscription?.days_left !== null && subscription?.status !== 'expired' && (
                <span className={`text-xs font-medium ${
                  subscription?.days_left <= 5 ? 'text-red-400' : 
                  subscription?.days_left <= 10 ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {subscription.days_left} días
                </span>
              )}
            </div>
          </div>
        </div>

        <nav className="p-2 space-y-1">
          {[
            { id: 'dashboard', icon: '📊', label: 'Dashboard' },
            { id: 'signals', icon: isNightBlocked ? '🔒' : '🔔', label: 'Señales IA', badge: isNightBlocked ? null : pendingSignals.length, locked: isNightBlocked },
            { id: 'chat', icon: '🤖', label: 'Chat ELISA' },
            { id: 'stats', icon: '📈', label: 'Estadísticas' },
            { id: 'history', icon: '📜', label: 'Historial' },
            { id: 'download', icon: '📱', label: 'Descargar App' },
          ].map(item => (
            <button key={item.id}
              onClick={() => { setActiveSection(item.id); if (isMobile) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                activeSection === item.id ? 'bg-emerald-500/15 text-emerald-400' : 'text-white/60 hover:bg-white/5'
              } ${item.locked ? 'opacity-70' : ''}`}>
              <span>{item.icon}</span>
              <span className="text-sm">{item.label}</span>
              {item.locked && (
                <span className="ml-auto px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded">Cerrado</span>
              )}
              {item.badge > 0 && !item.locked && (
                <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500 text-black rounded-full">{item.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-white/5">
          <p className="text-[10px] uppercase text-white/30 mb-2 px-3">Mercados</p>
          <div 
            ref={marketsScrollRef}
            className="space-y-1 max-h-[250px] overflow-y-auto" 
            style={{ scrollBehavior: 'auto', overscrollBehavior: 'contain' }}
            onScroll={(e) => {
              e.stopPropagation();
              scrollPositionRef.current = e.target.scrollTop;
            }}>
            {filteredAssets.map(asset => (
              <button key={asset.symbol}
                onClick={(e) => { 
                  e.stopPropagation();
                  setSelectedAsset(asset.symbol); 
                  if (isMobile) setSidebarOpen(false); 
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  selectedAsset === asset.symbol ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5'
                }`}>
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
            
            {/* Activos bloqueados */}
            {lockedAssets.length > 0 && (
              <>
                <p className="text-[9px] uppercase text-white/20 mt-3 mb-1 px-3">🔒 Requiere upgrade</p>
                {lockedAssets.slice(0, 3).map(asset => (
                  <button key={asset.symbol}
                    onClick={() => setShowPricing(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/30 hover:bg-white/5 opacity-50">
                    <span>{asset.emoji}</span>
                    <span className="text-xs">{asset.shortName}</span>
                    <span className="ml-auto text-[9px]">🔒</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {subscription?.status !== 'elite' && (
          <div className="absolute bottom-14 left-0 right-0 p-3">
            <button onClick={() => setShowPricing(true)}
              className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold rounded-lg hover:opacity-90">
              ⚡ Upgrade
            </button>
          </div>
        )}

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
        <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded hidden sm:inline">12 Modelos SMC</span>
      </div>
      
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Badge de suscripción en header */}
        {subscription?.status === 'trial' && (
          <button onClick={() => setShowPricing(true)}
            className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg transition-colors">
            <span className="text-amber-400 text-xs">⏳</span>
            <span className="text-amber-400 text-xs font-medium">{subscription.days_left} días trial</span>
          </button>
        )}
        
        {subscription?.plan && subscription?.status !== 'trial' && subscription?.status !== 'expired' && (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/20 rounded-lg">
            <span className="text-emerald-400 text-xs">✓</span>
            <span className="text-emerald-400 text-xs font-medium">{subscription.plan_name}</span>
          </span>
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
            className="w-8 h-8 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 flex items-center justify-center text-black font-bold text-sm">
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </button>
          
          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-[#0d0d12] rounded-xl border border-white/10 shadow-xl py-2">
              <div className="px-3 py-2 border-b border-white/5">
                <p className="text-white text-sm font-medium truncate">{user?.email}</p>
                <p className="text-white/40 text-xs">{subscription?.plan_name || 'Free Trial'}</p>
              </div>
              <button onClick={onLogout}
                className="w-full px-3 py-2 text-left text-red-400 text-sm hover:bg-white/5">
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );


  // Dashboard Section
  const DashboardSection = () => {
    const signal = lockedSignal;
    
    return (
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
            <p className="text-white/40 text-xs mb-1">Win Rate</p>
            <p className="text-2xl font-bold text-white">
              {data?.stats?.total ? Math.round((data.stats.wins / data.stats.total) * 100) : 0}%
            </p>
          </div>
          <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
            <p className="text-white/40 text-xs mb-1">Activas</p>
            <p className="text-2xl font-bold text-cyan-400">{data?.stats?.pending || 0}</p>
          </div>
          <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
            <p className="text-white/40 text-xs mb-1">Wins</p>
            <p className="text-2xl font-bold text-emerald-400">{data?.stats?.wins || 0}</p>
          </div>
          <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
            <p className="text-white/40 text-xs mb-1">Loss</p>
            <p className="text-2xl font-bold text-red-400">{data?.stats?.losses || 0}</p>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-[#0d0d12] rounded-xl border border-white/5 overflow-hidden">
          <div className="p-3 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">{currentAsset?.emoji}</span>
              <div>
                <h3 className="text-white font-medium">{currentAsset?.name || 'Loading...'}</h3>
                <div className="flex gap-2 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    currentAsset?.structureM5 === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' :
                    currentAsset?.structureM5 === 'BEARISH' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/50'
                  }`}>M5: {currentAsset?.structureM5 || 'LOADING'}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    currentAsset?.structureH1 === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' :
                    currentAsset?.structureH1 === 'BEARISH' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/50'
                  }`}>H1: {currentAsset?.structureH1 || 'LOADING'}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">{currentAsset?.price?.toFixed(currentAsset?.decimals || 2) || '---'}</p>
              <p className="text-xs text-white/40">{timeframe} · {currentCandles.length} velas</p>
            </div>
          </div>
          
          <div className="p-2">
            <MiniChart candles={currentCandles} height={isMobile ? 200 : 280} signal={lockedSignal} />
          </div>
        </div>

        {/* Signal activa */}
        {signal && (
          <div className={`rounded-xl p-4 border ${signal.action === 'LONG' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-lg text-sm font-bold ${signal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>
                  {signal.action}
                </span>
                <span className="text-white/60 text-sm">{signal.model}</span>
              </div>
              <span className="text-2xl font-bold text-white">{signal.score}%</span>
            </div>
            
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              <div className="bg-white/5 rounded-lg p-2">
                <p className="text-white/40">Entry</p>
                <p className="text-white font-medium">{signal.entry?.toFixed(2)}</p>
              </div>
              <div className="bg-emerald-500/20 rounded-lg p-2">
                <p className="text-emerald-400/60">TP1</p>
                <p className="text-emerald-400 font-medium">{signal.tp1?.toFixed(2)}</p>
              </div>
              <div className="bg-emerald-500/20 rounded-lg p-2">
                <p className="text-emerald-400/60">TP2</p>
                <p className="text-emerald-400 font-medium">{signal.tp2?.toFixed(2)}</p>
              </div>
              <div className="bg-emerald-500/20 rounded-lg p-2">
                <p className="text-emerald-400/60">TP3</p>
                <p className="text-emerald-400 font-medium">{signal.tp3?.toFixed(2)}</p>
              </div>
              <div className="bg-red-500/20 rounded-lg p-2">
                <p className="text-red-400/60">SL</p>
                <p className="text-red-400 font-medium">{signal.stop?.toFixed(2)}</p>
              </div>
            </div>
            
            <div className="flex gap-2 mt-3">
              <button onClick={() => markSignal(signal.id, 'WIN')}
                className="flex-1 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-sm font-medium">
                ✓ Win
              </button>
              <button onClick={() => markSignal(signal.id, 'LOSS')}
                className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium">
                ✗ Loss
              </button>
            </div>
          </div>
        )}

        {/* Señales activas o bloqueo nocturno */}
        {isNightBlocked ? (
          <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 rounded-xl border border-amber-500/20 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                <span className="text-xl">🔒</span>
              </div>
              <div className="flex-1">
                <p className="text-white font-medium text-sm">Horario Nocturno</p>
                <p className="text-white/50 text-xs">Disponible para Premium y Elite</p>
              </div>
              <button 
                onClick={() => setShowPricing(true)}
                className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold rounded-lg"
              >
                Upgrade
              </button>
            </div>
          </div>
        ) : pendingSignals.length > 0 && (
          <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-4">
            <h3 className="text-white font-medium mb-3 flex items-center gap-2">
              <span>🔔</span> Señales Activas
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">{pendingSignals.length}</span>
            </h3>
            <div className="space-y-2">
              {pendingSignals.slice(0, 5).map(s => (
                <div key={s.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span>{s.emoji}</span>
                    <span className="text-white text-sm">{s.assetName}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                      s.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'
                    }`}>{s.action}</span>
                  </div>
                  <span className="text-white/60 text-xs">{s.score}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Signals Section
  // Componente de bloqueo nocturno
  const NightBlockedOverlay = () => (
    <div className="bg-gradient-to-br from-slate-900/95 to-slate-800/95 rounded-xl border border-amber-500/30 p-8 text-center">
      <div className="w-20 h-20 mx-auto mb-4 bg-amber-500/20 rounded-full flex items-center justify-center">
        <span className="text-4xl">🔒</span>
      </div>
      <h3 className="text-xl font-bold text-white mb-2">Horario Nocturno</h3>
      <p className="text-white/60 mb-4">
        El acceso nocturno (8:30 PM - 1:00 AM) está disponible solo para planes <span className="text-purple-400 font-semibold">Premium</span> y <span className="text-pink-400 font-semibold">Elite</span>.
      </p>
      <div className="text-amber-400/80 text-sm mb-4">
        ⏰ Horario diurno: 6:00 AM - 2:00 PM (Colombia)
      </div>
      <button 
        onClick={() => setShowPricing(true)}
        className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
      >
        Actualizar Plan
      </button>
    </div>
  );

  const SignalsSection = () => (
    <div className="space-y-4">
      {isNightBlocked ? (
        <NightBlockedOverlay />
      ) : (
        <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-4">
          <h3 className="text-white font-medium mb-3">📊 Señales Pendientes</h3>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {pendingSignals.length === 0 ? (
              <div className="text-center py-8 text-white/40">
                <span className="text-4xl mb-2 block">⏳</span>
                <p>No hay señales pendientes</p>
                <p className="text-xs mt-1">Las señales aparecerán aquí cuando se generen</p>
              </div>
            ) : (
              pendingSignals.map(s => (
                <div key={s.id} className="p-3 rounded-lg border bg-cyan-500/10 border-cyan-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span>{s.emoji}</span>
                      <span className="text-white font-medium">{s.assetName}</span>
                      <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                        s.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'
                      }`}>{s.action}</span>
                    </div>
                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-cyan-500/20 text-cyan-400">PENDING</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>{s.model} · {s.score}%</span>
                    <span>{new Date(s.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => markSignal(s.id, 'WIN')} className="flex-1 py-1.5 bg-emerald-500/20 text-emerald-400 rounded text-xs hover:bg-emerald-500/30 transition-colors">✓ Win</button>
                    <button onClick={() => markSignal(s.id, 'LOSS')} className="flex-1 py-1.5 bg-red-500/20 text-red-400 rounded text-xs hover:bg-red-500/30 transition-colors">✗ Loss</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Stats Section
  const StatsSection = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <p className="text-white/40 text-xs mb-1">Total Señales</p>
          <p className="text-3xl font-bold text-white">{data?.stats?.total || 0}</p>
        </div>
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <p className="text-white/40 text-xs mb-1">Win Rate</p>
          <p className="text-3xl font-bold text-emerald-400">
            {data?.stats?.total ? Math.round((data.stats.wins / data.stats.total) * 100) : 0}%
          </p>
        </div>
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <p className="text-white/40 text-xs mb-1">Wins</p>
          <p className="text-3xl font-bold text-emerald-400">{data?.stats?.wins || 0}</p>
        </div>
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <p className="text-white/40 text-xs mb-1">Losses</p>
          <p className="text-3xl font-bold text-red-400">{data?.stats?.losses || 0}</p>
        </div>
      </div>
      
      <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
        <h3 className="text-white font-medium mb-3">🎯 Take Profits</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-white/5 rounded-lg">
            <p className="text-2xl font-bold text-emerald-400">{data?.stats?.tp1Hits || 0}</p>
            <p className="text-xs text-white/40">TP1</p>
          </div>
          <div className="text-center p-3 bg-white/5 rounded-lg">
            <p className="text-2xl font-bold text-cyan-400">{data?.stats?.tp2Hits || 0}</p>
            <p className="text-xs text-white/40">TP2</p>
          </div>
          <div className="text-center p-3 bg-white/5 rounded-lg">
            <p className="text-2xl font-bold text-purple-400">{data?.stats?.tp3Hits || 0}</p>
            <p className="text-xs text-white/40">TP3</p>
          </div>
        </div>
      </div>
    </div>
  );

  // History Section
  const HistorySection = () => (
    <div className="bg-[#0d0d12] rounded-xl border border-white/5 overflow-hidden">
      <div className="p-4 border-b border-white/5">
        <h3 className="text-white font-medium">📜 Historial de Señales</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
            <tr className="text-white/50 text-xs">
              <th className="p-3 text-left">Activo</th>
              <th className="p-3 text-left">Acción</th>
              <th className="p-3 text-left">Score</th>
              <th className="p-3 text-left">Estado</th>
              <th className="p-3 text-left">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {closedSignals.slice(0, 20).map(s => (
              <tr key={s.id} className="text-white/80">
                <td className="p-3">{s.emoji} {s.assetName}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                    s.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>{s.action}</span>
                </td>
                <td className="p-3">{s.score}%</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 text-xs rounded ${
                    s.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>{s.status}</span>
                </td>
                <td className="p-3 text-white/50">{new Date(s.timestamp).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );


  // Loading
  if (loadingSub) {
    return (
      <div className="min-h-screen bg-[#06060a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Cargando...</p>
        </div>
      </div>
    );
  }

  // Pantalla de bloqueo - Trial expirado
  if (isExpired) {
    return (
      <div className="min-h-screen bg-[#06060a] flex flex-col">
        <Sidebar />
        <main className={`flex-1 transition-all duration-300 ${sidebarOpen && !isMobile ? 'ml-48' : 'ml-0'}`}>
          <Header />
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                <span className="text-5xl">🔒</span>
              </div>
              <h2 className="text-3xl font-bold text-white mb-3">Dashboard bloqueado</h2>
              <p className="text-white/60 mb-6">Tu período de prueba ha terminado. Actualiza tu plan para continuar accediendo a todas las funciones de Trading Master Pro.</p>
              <button 
                onClick={() => setShowPricing(true)}
                className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-bold rounded-xl transition-all transform hover:scale-105 text-lg"
              >
                💎 Ver Planes
              </button>
              <p className="text-white/30 text-sm mt-4">Desde $29.900 COP/mes</p>
            </div>
          </div>
        </main>
        {showPricing && (
          <Pricing user={user} subscription={subscription} onClose={() => setShowPricing(false)} />
        )}
      </div>
    );
  }

  // Dashboard principal
  return (
    <div className="min-h-screen bg-[#06060a]">
      <Sidebar />
      <main className={`transition-all duration-300 ${sidebarOpen && !isMobile ? 'ml-48' : 'ml-0'}`}>
        <Header />
        <div className="p-3 pb-24">
          {activeSection === 'dashboard' && <DashboardSection />}
          {activeSection === 'signals' && <SignalsSection />}
          {activeSection === 'stats' && <StatsSection />}
          {activeSection === 'history' && <HistorySection />}
          {activeSection === 'download' && (
            <div className="space-y-4">
              <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-6">
                <h2 className="text-xl font-bold text-white mb-2">📱 Descargar App</h2>
                <p className="text-white/60 text-sm mb-6">Accede a Trading Master Pro desde tu dispositivo móvil o escritorio</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Android */}
                  <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 rounded-xl border border-emerald-500/20 p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                        <svg className="w-7 h-7 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.523 2.047a.5.5 0 0 0-.832.025L14.804 5.07a6.93 6.93 0 0 0-5.608 0L7.309 2.072a.5.5 0 0 0-.832-.025.5.5 0 0 0-.046.836L8.14 5.4A6.893 6.893 0 0 0 5 11h14a6.893 6.893 0 0 0-3.14-5.6l1.71-2.517a.5.5 0 0 0-.047-.836zM9 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm6 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM5 12v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8H5z"/>
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold">Android</h3>
                        <p className="text-white/40 text-xs">APK disponible</p>
                      </div>
                    </div>
                    <p className="text-white/60 text-sm mb-4">Descarga la app para tu dispositivo Android. Compatible con Android 7.0+</p>
                    <a 
                      href="https://github.com/tu-usuario/trading-master-pro/releases/download/v1.0.0/TradingMasterPro-v1.0.0.apk"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Descargar APK
                    </a>
                    <p className="text-white/30 text-[10px] mt-2 text-center">Versión 1.0.0 • 5.2 MB</p>
                  </div>

                  {/* Mac */}
                  <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-xl border border-blue-500/20 p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                        <svg className="w-7 h-7 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold">macOS</h3>
                        <p className="text-white/40 text-xs">DMG disponible</p>
                      </div>
                    </div>
                    <p className="text-white/60 text-sm mb-4">Descarga la app para Mac. Compatible con macOS 11.0+ (Intel & Apple Silicon)</p>
                    <a 
                      href="https://github.com/tu-usuario/trading-master-pro/releases/download/v1.0.0/TradingMasterPro-v1.0.0.dmg"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Descargar DMG
                    </a>
                    <p className="text-white/30 text-[10px] mt-2 text-center">Versión 1.0.0 • 85 MB</p>
                  </div>
                </div>

                {/* Windows */}
                <div className="mt-4 bg-gradient-to-br from-purple-500/10 to-purple-600/5 rounded-xl border border-purple-500/20 p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                      <svg className="w-7 h-7 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 12V6.75l6-1.32v6.48L3 12zm6.58.08l-.01 6.67 5.8 1.12V12.16l-5.79.02zm-.58-6.91l-.01 6.46 5.79-.03V5.5l-5.78.74zM9.57 18.75L3 17.88v-5.67l6.57.07v6.47zm10.67-12.3L11.3 4.89v6.77l8.94-.03V6.45zm0 11.33l-8.94 1.69v-6.55l8.94.03v4.83z"/>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white font-semibold">Windows</h3>
                      <p className="text-white/40 text-xs">Instalador EXE disponible</p>
                    </div>
                    <a 
                      href="https://github.com/tu-usuario/trading-master-pro/releases/download/v1.0.0/TradingMasterPro-Setup-v1.0.0.exe"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-lg transition-colors text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Descargar EXE
                    </a>
                  </div>
                  <p className="text-white/30 text-[10px]">Versión 1.0.0 • 78 MB • Windows 10/11</p>
                </div>

                {/* PWA Info */}
                <div className="mt-6 p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">💡</span>
                    <div>
                      <h4 className="text-white font-medium mb-1">También puedes instalar desde el navegador</h4>
                      <p className="text-white/50 text-sm">
                        En Chrome/Edge, haz clic en el icono de instalación en la barra de direcciones para agregar Trading Master Pro a tu escritorio como una app.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeSection === 'chat' && (
            <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-6 text-center">
              <p className="text-white/60 mb-4">Usa el botón de Elisa en la esquina inferior derecha para chatear</p>
              <button onClick={() => {}} className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-lg">
                Abrir Chat
              </button>
            </div>
          )}
        </div>
      </main>
      <ElisaChat selectedAsset={selectedAsset} isMobile={isMobile} />
      
      {showPricing && (
        <Pricing user={user} subscription={subscription} onClose={() => setShowPricing(false)} />
      )}
    </div>
  );
}
