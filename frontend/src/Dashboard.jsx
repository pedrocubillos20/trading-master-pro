import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Pricing from './Pricing';
import PushNotifications from './PushNotifications';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// ACTIVOS PERMITIDOS (solo estos 3)
// =============================================
const ALLOWED_SYMBOLS = ['stpRNG', 'frxXAUUSD', '1HZ100V'];

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
    if (messages.length > 0) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
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

  if (!isOpen) {
    return (
      <button onClick={openChat}
        className={`fixed z-[100] flex items-center gap-3 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white rounded-2xl shadow-xl transition-transform hover:scale-105 ${isMobile ? 'bottom-4 right-4 px-3 py-2.5' : 'bottom-6 right-6 px-4 py-3'}`}>
        <div className="relative">
          <img src="/elisa.png" alt="ELISA" className="w-10 h-10 rounded-full object-cover border-2 border-white/30"
            onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 items-center justify-center text-lg font-bold hidden">E</div>
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
    <div className={`fixed z-[100] bg-[#0d0d12] rounded-2xl shadow-2xl border border-white/10 flex flex-col ${isMobile ? 'inset-2' : 'bottom-6 right-6 w-[380px]'}`}
      style={{ height: isMobile ? 'calc(100% - 16px)' : '520px' }}>
      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-t-2xl">
        <div className="flex items-center gap-3">
          <img src="/elisa.png" alt="ELISA" className="w-11 h-11 rounded-full object-cover border-2 border-white/30"
            onError={(e) => { e.target.src=''; }} />
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
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${msg.role === 'user' ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white' : 'bg-white/5 text-white/90'}`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-1.5 px-4 py-3 bg-white/5 rounded-2xl w-fit">
            {[0,150,300].map(d => <div key={d} className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-3 border-t border-white/10">
        <div className="flex gap-2">
          <input ref={inputRef} type="text" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Escribe tu pregunta..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-pink-500"
            style={{ fontSize: '16px' }} />
          <button onClick={() => sendMessage()} className="px-4 py-2.5 bg-gradient-to-r from-pink-500 to-purple-600 rounded-xl text-white font-medium">
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================================
// MINI CHART MINIMALISTA CON NIVELES DE SEÑAL
// =============================================
const MiniChart = ({ candles, height = 300, signal = null }) => {
  const svgRef  = useRef(null);
  const zoomRef = useRef(60);
  const offRef  = useRef(0);
  const isDrag  = useRef(false);
  const dragX   = useRef(0);
  const dragOff = useRef(0);

  const draw = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || !candles?.length) return;
    const W = svg.parentElement?.clientWidth || 600;
    const H = height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);

    const total = candles.length;
    const zoom  = Math.max(20, Math.min(zoomRef.current, total));
    const off   = Math.max(0, Math.min(total - zoom, offRef.current));
    const vis   = candles.slice(Math.max(0, total - zoom - off), total - off).slice(-zoom);
    if (!vis.length) return;

    // Padding: derecha amplio para etiquetas
    const PAD = { top: 12, right: 80, bottom: 24, left: 4 };
    const CH = H - PAD.top - PAD.bottom;
    const CW = W - PAD.left - PAD.right;

    // Rango de precios visibles + niveles de señal
    let maxP = Math.max(...vis.map(c => parseFloat(c.high)));
    let minP = Math.min(...vis.map(c => parseFloat(c.low)));
    if (signal?.entry) {
      const levels = [signal.entry, signal.tp1||signal.take_profit_1, signal.tp2||signal.take_profit_2, signal.tp3||signal.take_profit_3, signal.stop||signal.stop_loss].map(v => parseFloat(v||0)).filter(v => v > 0);
      if (levels.length) { maxP = Math.max(maxP, ...levels); minP = Math.min(minP, ...levels); }
    }
    const mg = (maxP - minP) * 0.1; maxP += mg; minP -= mg;
    const range = maxP - minP || 0.01;
    const Y = p => PAD.top + CH * (1 - (parseFloat(p) - minP) / range);

    const n  = vis.length;
    const cW = CW / n;
    const bW = Math.max(1.5, cW * 0.65);

    let h = `<rect width="${W}" height="${H}" fill="#080d18"/>`;

    // Grid horizontal — sutil
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const p = minP + (range * i) / steps;
      const y = Y(p);
      h += `<line x1="${PAD.left}" y1="${y|0}" x2="${W - PAD.right}" y2="${y|0}" stroke="#ffffff06" stroke-width="1"/>`;
      h += `<text x="${W - PAD.right + 3}" y="${(y + 3.5)|0}" fill="#2d3a4a" font-size="8.5" font-family="'Courier New',monospace">${p.toFixed(2)}</text>`;
    }

    // Velas
    vis.forEach((c, i) => {
      const o = parseFloat(c.open), cl = parseFloat(c.close);
      const hi = parseFloat(c.high), lo = parseFloat(c.low);
      if (!o || !cl || !hi || !lo || hi < lo) return;
      const bull = cl >= o;
      const col  = bull ? '#22c55e' : '#ef4444';
      const x    = PAD.left + i * cW + cW / 2;
      const bTop = Y(Math.max(o, cl));
      const bBot = Y(Math.min(o, cl));
      const bH   = Math.max(1.5, bBot - bTop);
      h += `<line x1="${x|0}" y1="${Y(hi)|0}" x2="${x|0}" y2="${Y(lo)|0}" stroke="${col}" stroke-width="1" opacity="0.7"/>`;
      h += `<rect x="${(x - bW/2)|0}" y="${bTop|0}" width="${bW|0}" height="${bH|0}" fill="${col}"/>`;
    });

    // Niveles de señal — limpios y bien etiquetados
    if (signal?.entry) {
      const entry = parseFloat(signal.entry);
      const tp1   = parseFloat(signal.tp1  || signal.take_profit_1 || 0);
      const tp2   = parseFloat(signal.tp2  || signal.take_profit_2 || 0);
      const tp3   = parseFloat(signal.tp3  || signal.take_profit_3 || 0);
      const sl    = parseFloat(signal.stop || signal.stop_loss     || 0);

      const drawLevel = (price, color, label, lineW = 1.5, dash = '') => {
        if (!price || price < minP * 0.98 || price > maxP * 1.02) return;
        const y = Math.max(PAD.top + 5, Math.min(PAD.top + CH - 5, Y(price)));
        const x2 = W - PAD.right;
        h += `<line x1="${PAD.left}" y1="${y|0}" x2="${x2}" y2="${y|0}" stroke="${color}" stroke-width="${lineW}" ${dash ? `stroke-dasharray="${dash}"` : ''} opacity="0.85"/>`;
        // Etiqueta con fondo
        const lblW = PAD.right - 3;
        h += `<rect x="${x2 + 1}" y="${(y - 8)|0}" width="${lblW}" height="16" rx="3" fill="${color}"/>`;
        h += `<text x="${x2 + 5}" y="${(y + 4)|0}" fill="#000" font-size="8.5" font-weight="700" font-family="'Courier New',monospace">${label} ${price.toFixed(2)}</text>`;
      };

      // Dibujar en orden: SL (fondo), TPs, ENT (encima)
      drawLevel(sl,  '#ef4444', 'SL',  1.2, '5,3');
      drawLevel(tp3, '#059669', 'TP3', 1.2, '4,3');
      drawLevel(tp2, '#10b981', 'TP2', 1.5, '4,3');
      drawLevel(tp1, '#34d399', 'TP1', 2);
      drawLevel(entry, '#f59e0b', 'ENT', 2.5);

      // Flecha de dirección
      const isLong = (signal.direction || signal.action || signal.tipo) === 'BUY'
                  || (signal.direction || signal.action || signal.tipo) === 'LONG';
      const eY = Math.max(PAD.top + 12, Math.min(PAD.top + CH - 12, Y(entry)));
      const ax = PAD.left + 14;
      h += isLong
        ? `<polygon points="${ax-7},${eY+7} ${ax+8},${eY} ${ax-7},${eY-7}" fill="#22c55e" opacity="0.9"/>`
        : `<polygon points="${ax+7},${eY+7} ${ax-8},${eY} ${ax+7},${eY-7}" fill="#ef4444" opacity="0.9"/>`;
    }

    // Precio actual (última vela)
    const lastClose = parseFloat(vis[vis.length - 1]?.close || 0);
    if (lastClose > 0) {
      const py = Math.max(PAD.top + 5, Math.min(PAD.top + CH - 5, Y(lastClose)));
      const isUp = lastClose >= parseFloat(vis[vis.length - 1]?.open || lastClose);
      const col = isUp ? '#22c55e' : '#ef4444';
      h += `<line x1="${PAD.left}" y1="${py|0}" x2="${W - PAD.right}" y2="${py|0}" stroke="${col}" stroke-width="1" stroke-dasharray="3,4" opacity="0.5"/>`;
      h += `<rect x="${W - PAD.right + 1}" y="${(py - 8)|0}" width="${PAD.right - 3}" height="16" rx="3" fill="${col}"/>`;
      h += `<text x="${W - PAD.right + 5}" y="${(py + 4)|0}" fill="#fff" font-size="8.5" font-weight="700" font-family="'Courier New',monospace">${lastClose.toFixed(2)}</text>`;
    }

    // Timestamps
    const step = Math.max(1, Math.floor(n / 6));
    vis.forEach((c, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      const x = PAD.left + i * cW + cW / 2;
      const ep = parseInt(c.epoch || c.time || 0);
      if (!ep) return;
      const d = new Date(ep * 1000);
      h += `<text x="${x|0}" y="${H - PAD.bottom + 12}" text-anchor="middle" fill="#2d3a4a" font-size="8" font-family="monospace">${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}</text>`;
    });

    svg.innerHTML = h;
  }, [candles, height, signal]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const el = svgRef.current?.parentElement; if (!el) return;
    const ro = new ResizeObserver(() => draw()); ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  // Mouse handlers
  const onMD = e => { isDrag.current = true; dragX.current = e.clientX; dragOff.current = offRef.current; };
  const onMM = e => {
    if (!isDrag.current) return;
    const slot = (svgRef.current?.parentElement?.clientWidth || 600) / zoomRef.current;
    offRef.current = Math.max(0, Math.min((candles?.length || 0) - zoomRef.current, dragOff.current + Math.round((dragX.current - e.clientX) / Math.max(2, slot))));
    draw();
  };
  const onMU = () => { isDrag.current = false; };
  const onWh = e => { e.preventDefault(); zoomRef.current = Math.max(15, Math.min(200, zoomRef.current + (e.deltaY > 0 ? 8 : -8))); draw(); };

  // Touch handlers
  const onTD = e => { isDrag.current = true; dragX.current = e.touches[0].clientX; dragOff.current = offRef.current; };
  const onTM = e => {
    if (!isDrag.current) return;
    const slot = (svgRef.current?.parentElement?.clientWidth || 600) / zoomRef.current;
    offRef.current = Math.max(0, Math.min((candles?.length || 0) - zoomRef.current, dragOff.current + Math.round((dragX.current - e.touches[0].clientX) / Math.max(2, slot))));
    draw();
  };
  const onTU = () => { isDrag.current = false; };

  return (
    <div className="relative w-full select-none" style={{ height, background: '#080d18' }}>
      {/* Controles zoom */}
      <div className="absolute top-2 left-2 z-10 flex gap-1">
        <button onClick={() => { zoomRef.current = Math.max(15, zoomRef.current - 15); draw(); }}
          className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white/60 text-xs flex items-center justify-center transition-colors">+</button>
        <button onClick={() => { zoomRef.current = Math.min(200, zoomRef.current + 15); draw(); }}
          className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white/60 text-xs flex items-center justify-center transition-colors">−</button>
        <button onClick={() => { zoomRef.current = 60; offRef.current = 0; draw(); }}
          className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white/60 text-[9px] flex items-center justify-center transition-colors">↺</button>
      </div>
      <svg ref={svgRef}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'crosshair' }}
        onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU} onWheel={onWh}
        onTouchStart={onTD} onTouchMove={onTM} onTouchEnd={onTU}
      />
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
  const [loadingSub, setLoadingSub] = useState(true);
  const [tradingSession, setTradingSession] = useState(null);

  const mountedRef = useRef(true);
  const initialAssetSetRef = useRef(false);
  const marketsScrollRef = useRef(null);
  const scrollPositionRef = useRef(0);

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    if (!user?.email && !user?.id) return;
    const fetchSubscription = async () => {
      try {
        const identifier = user.email || user.id;
        const res = await fetch(`${API_URL}/api/subscription/${encodeURIComponent(identifier)}`);
        const json = await res.json();
        if (mountedRef.current) { setSubscription(json.subscription); setLoadingSub(false); }
      } catch (e) {
        setSubscription({ status: 'trial', plan: 'free', plan_name: 'Free Trial', days_left: 5, assets: ALLOWED_SYMBOLS });
        setLoadingSub(false);
      }
    };
    fetchSubscription();
  }, [user?.id, user?.email]);

  useEffect(() => {
    const checkTradingSession = async () => {
      try {
        const plan = subscription?.plan || 'free';
        const res = await fetch(`${API_URL}/api/trading-session?plan=${plan}`);
        const json = await res.json();
        if (mountedRef.current) setTradingSession(json);
      } catch (e) {}
    };
    checkTradingSession();
    const interval = setInterval(checkTradingSession, 30000);
    return () => clearInterval(interval);
  }, [subscription?.plan]);

  const isExpired = subscription?.status === 'expired';

  // SIEMPRE filtrar a los 3 activos permitidos
  const allowedAssets = ALLOWED_SYMBOLS;

  const isNightBlocked = useMemo(() => {
    if (tradingSession) return tradingSession.isLocked && tradingSession.lockReason === 'night_session';
    const plan = subscription?.plan;
    if (plan === 'premium' || plan === 'elite') return false;
    const now = new Date();
    const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
    return utcHour >= 1.5 && utcHour < 6;
  }, [subscription?.plan, tradingSession]);

  const isMarketClosed = useMemo(() => {
    if (tradingSession) return tradingSession.isLocked && tradingSession.lockReason === 'market_closed';
    const now = new Date();
    const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
    return !(utcHour >= 11 && utcHour < 19) && !(utcHour >= 1.5 && utcHour < 6);
  }, [tradingSession]);

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
    if (!user?.email && !user?.id) return;
    let isCancelled = false;
    const fetchData = async () => {
      try {
        const identifier = encodeURIComponent(user.email || user.id);
        const res = await fetch(`${API_URL}/api/dashboard/${identifier}`);
        const json = await res.json();
        if (!isCancelled && mountedRef.current) {
          setData(json);
          if (!initialAssetSetRef.current && json.assets?.length) {
            initialAssetSetRef.current = true;
            // Seleccionar primer activo permitido
            const first = json.assets.find(a => ALLOWED_SYMBOLS.includes(a.symbol)) || json.assets[0];
            setSelectedAsset(first.symbol);
          }
        }
      } catch (e) {
        try {
          const res = await fetch(`${API_URL}/api/dashboard`);
          const json = await res.json();
          if (!isCancelled && mountedRef.current) {
            setData(json);
            if (!initialAssetSetRef.current && json.assets?.length) {
              initialAssetSetRef.current = true;
              const first = json.assets.find(a => ALLOWED_SYMBOLS.includes(a.symbol)) || json.assets[0];
              setSelectedAsset(first.symbol);
            }
          }
        } catch (e2) {}
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => { isCancelled = true; clearInterval(interval); };
  }, [user?.email, user?.id]);

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
      } catch (e) {}
    };
    fetchCandles();
    const interval = setInterval(fetchCandles, 4000);
    return () => { isCancelled = true; clearInterval(interval); };
  }, [selectedAsset]);

  const [tpDialog, setTpDialog] = useState({ open: false, signalId: null });

  const markSignal = async (id, status) => {
    try {
      if (status === 'WIN') { setTpDialog({ open: true, signalId: id }); return; }
      await fetch(`${API_URL}/api/signals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, userId: user?.email || user?.id, tpHit: null })
      });
    } catch (e) {}
  };

  const confirmWin = async (tpHit) => {
    if (tpDialog.signalId) {
      try {
        await fetch(`${API_URL}/api/signals/${tpDialog.signalId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'WIN', userId: user?.email || user?.id, tpHit })
        });
      } catch (e) {}
      setTpDialog({ open: false, signalId: null });
    }
  };

  // ── Señales filtradas SOLO a los 3 activos ──
  const allPendingSignals = useMemo(() =>
    (data?.recentSignals?.filter(s => s.status === 'PENDING') || []).filter(s => ALLOWED_SYMBOLS.includes(s.symbol)),
    [data?.recentSignals]
  );
  const pendingSignals = allPendingSignals; // ya filtradas
  const closedSignals  = useMemo(() =>
    (data?.recentSignals?.filter(s => s.status !== 'PENDING') || []).filter(s => ALLOWED_SYMBOLS.includes(s.symbol)),
    [data?.recentSignals]
  );

  // ── Stats calculados solo con los 3 activos ──
  const filteredStats = useMemo(() => {
    const allFiltered = data?.recentSignals?.filter(s => ALLOWED_SYMBOLS.includes(s.symbol) && s.status !== 'PENDING') || [];
    const wins   = allFiltered.filter(s => s.status === 'WIN').length;
    const losses = allFiltered.filter(s => s.status === 'LOSS').length;
    const total  = wins + losses;
    return {
      wins,
      losses,
      total,
      pending: allPendingSignals.length,
      winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
      tp1Hits: allFiltered.filter(s => s.tpHit === 1).length,
      tp2Hits: allFiltered.filter(s => s.tpHit === 2).length,
      tp3Hits: allFiltered.filter(s => s.tpHit === 3).length,
    };
  }, [data?.recentSignals, allPendingSignals.length]);

  const currentAsset = useMemo(() =>
    data?.assets?.find(a => a.symbol === selectedAsset),
    [data?.assets, selectedAsset]
  );
  const lockedSignal    = currentAsset?.lockedSignal;
  const currentCandles  = timeframe === 'H1' ? candlesH1 : candles;

  // Assets filtrados solo a los 3 permitidos
  const filteredAssets = useMemo(() =>
    (data?.assets || []).filter(a => ALLOWED_SYMBOLS.includes(a.symbol)),
    [data?.assets]
  );

  const goToSignal = (signal) => { setSelectedAsset(signal.symbol); setActiveSection('dashboard'); };

  useEffect(() => {
    if (marketsScrollRef.current && scrollPositionRef.current > 0) {
      marketsScrollRef.current.scrollTop = scrollPositionRef.current;
    }
  });

  // ── SIDEBAR ──
  const Sidebar = () => (
    <>
      {isMobile && sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed left-0 top-0 h-full bg-[#08080f] border-r border-white/5 z-40 transition-all duration-300 flex flex-col ${sidebarOpen ? (isMobile ? 'w-52' : 'w-44') : 'w-0 overflow-hidden'}`}>
        <div className="h-12 flex items-center justify-between px-3 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
              <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="font-bold text-sm text-white">TradingPro</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-white/5 rounded-lg">
            <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-3 py-2 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${subscription?.status === 'trial' ? 'bg-amber-500 text-black' : subscription?.status === 'expired' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-black'}`}>
              {subscription?.status === 'trial' ? 'FREE' : subscription?.status === 'expired' ? 'EXPIRADO' : subscription?.plan_name?.toUpperCase() || 'ACTIVE'}
            </span>
            {subscription?.days_left !== undefined && subscription?.status !== 'expired' && (
              <span className={`text-[10px] ${subscription.days_left <= 5 ? 'text-red-400' : 'text-emerald-400'}`}>{subscription.days_left}d</span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <nav className="p-2 space-y-0.5">
            {[
              { id: 'dashboard', icon: '📊', label: 'Dashboard' },
              { id: 'signals',   icon: isNightBlocked ? '🔒' : '🔔', label: 'Señales', badge: isNightBlocked ? 0 : pendingSignals.length, locked: isNightBlocked },
              { id: 'stats',     icon: '📈', label: 'Stats' },
              { id: 'history',   icon: '📜', label: 'Historial' },
            ].map(item => (
              <button key={item.id}
                onClick={() => { setActiveSection(item.id); if (isMobile) setSidebarOpen(false); }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors text-xs ${activeSection === item.id ? 'bg-emerald-500/15 text-emerald-400' : 'text-white/60 hover:bg-white/5'} ${item.locked ? 'opacity-60' : ''}`}>
                <span className="text-sm">{item.icon}</span>
                <span>{item.label}</span>
                {item.badge > 0 && !item.locked && (
                  <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500 text-black rounded-full">{item.badge}</span>
                )}
              </button>
            ))}
          </nav>

          {/* Mercados — solo los 3 activos */}
          <div className="px-2 pb-2">
            <p className="text-[9px] uppercase text-white/30 mb-1.5 px-1 tracking-widest">Mercados</p>
            <div ref={marketsScrollRef} className="space-y-0.5" onScroll={(e) => { e.stopPropagation(); scrollPositionRef.current = e.target.scrollTop; }}>
              {filteredAssets.map(asset => (
                <button key={asset.symbol}
                  onClick={(e) => { e.stopPropagation(); setSelectedAsset(asset.symbol); if (isMobile) setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-all ${selectedAsset === asset.symbol ? 'bg-white/10 text-white border border-white/10' : 'text-white/50 hover:bg-white/5'}`}>
                  <span className="text-base">{asset.emoji}</span>
                  <div className="flex-1 text-left">
                    <p className="text-[11px] font-medium leading-tight">{asset.shortName}</p>
                    <p className="text-[9px] text-white/30 leading-tight">{asset.name}</p>
                  </div>
                  {asset.lockedSignal && (
                    <span className={`px-1 py-0.5 text-[8px] font-bold rounded ${asset.lockedSignal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>
                      {asset.lockedSignal.action}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-white/5">
          {subscription?.plan !== 'elite' && subscription?.status !== 'elite' && (
            <button onClick={() => setShowPricing(true)} className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold hover:opacity-90">
              ⚡ Upgrade
            </button>
          )}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${data?.connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className="text-xs text-white/50">{data?.connected ? 'Online' : 'Offline'}</span>
            </div>
            <button onClick={() => { setActiveSection('download'); if (isMobile) setSidebarOpen(false); }}
              className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-xs text-white/60 hover:text-white/80 transition-colors">
              <span>📱</span> Download
            </button>
          </div>
        </div>
      </aside>
    </>
  );

  // ── HEADER ──
  const Header = () => (
    <header className="h-12 bg-[#08080f] border-b border-white/5 flex items-center justify-between px-3 sticky top-0 z-30">
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
        {subscription?.status === 'trial' && (
          <button onClick={() => setShowPricing(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-all">
            <span className="text-amber-400 text-xs font-bold">{subscription.days_left}d trial</span>
            <span className="text-amber-400 text-xs">→</span>
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
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${timeframe === tf ? 'bg-emerald-500 text-black' : 'text-white/50 hover:text-white'}`}>{tf}</button>
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
              <button onClick={onLogout} className="w-full px-3 py-2 text-left text-red-400 text-sm hover:bg-white/5">
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );

  // ── DASHBOARD SECTION ──
  const DashboardSection = () => {
    const signal = lockedSignal;
    return (
      <div className="space-y-3">
        {/* Stats personales */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Win Rate', value: `${filteredStats.winRate}%`, color: 'text-white' },
            { label: 'Activas',  value: filteredStats.pending,       color: 'text-cyan-400' },
            { label: 'Wins',     value: filteredStats.wins,          color: 'text-emerald-400' },
            { label: 'Loss',     value: filteredStats.losses,        color: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="bg-[#0d0d12] rounded-xl p-3 border border-white/5">
              <p className="text-white/40 text-[10px] mb-0.5">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="bg-[#0d0d12] rounded-xl border border-white/5 overflow-hidden">
          <div className="p-3 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{currentAsset?.emoji}</span>
              <div>
                <h3 className="text-white font-medium text-sm">{currentAsset?.name || 'Cargando...'}</h3>
                <div className="flex gap-1.5 mt-0.5">
                  {['M5','H1'].map(tf => (
                    <span key={tf} className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                      (tf === 'M5' ? currentAsset?.structureM5 : currentAsset?.structureH1) === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' :
                      (tf === 'M5' ? currentAsset?.structureM5 : currentAsset?.structureH1) === 'BEARISH' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/40'
                    }`}>{tf}: {(tf === 'M5' ? currentAsset?.structureM5 : currentAsset?.structureH1) || '…'}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white font-mono">{currentAsset?.price?.toFixed(currentAsset?.decimals || 2) || '---'}</p>
              <p className="text-[10px] text-white/30">{timeframe} · {currentCandles.length}v</p>
            </div>
          </div>
          <MiniChart candles={currentCandles} height={isMobile ? 220 : 290} signal={lockedSignal} />
        </div>

        {/* Señal activa */}
        {signal && (
          <div className={`rounded-xl overflow-hidden border ${signal.action === 'LONG' ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
            {/* Header */}
            <div className={`px-4 py-2.5 flex items-center justify-between ${signal.action === 'LONG' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-lg text-sm font-bold ${signal.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{signal.action}</span>
                <span className="text-white/50 text-xs">{signal.model}</span>
              </div>
              <span className="text-2xl font-bold text-white">{signal.score}%</span>
            </div>
            {/* Niveles */}
            <div className="grid grid-cols-5 gap-1 p-3 bg-[#0d0d12]">
              <div className="bg-white/5 rounded-lg p-2 text-center">
                <p className="text-white/30 text-[9px]">Entry</p>
                <p className="text-white text-xs font-mono font-bold">{signal.entry?.toFixed(2)}</p>
              </div>
              {[1,2,3].map(n => (
                <div key={n} className="bg-emerald-500/10 rounded-lg p-2 text-center">
                  <p className="text-emerald-400/50 text-[9px]">TP{n}</p>
                  <p className="text-emerald-400 text-xs font-mono font-bold">{(signal[`tp${n}`] || signal[`take_profit_${n}`])?.toFixed(2) || '—'}</p>
                </div>
              ))}
              <div className="bg-red-500/10 rounded-lg p-2 text-center">
                <p className="text-red-400/50 text-[9px]">SL</p>
                <p className="text-red-400 text-xs font-mono font-bold">{(signal.stop || signal.stop_loss)?.toFixed(2)}</p>
              </div>
            </div>
            {/* Botones acción */}
            <div className="grid grid-cols-2 gap-0 border-t border-white/5">
              <button onClick={() => markSignal(signal.id, 'WIN')}
                className="py-3 bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-400 font-bold text-sm transition-colors flex items-center justify-center gap-1.5">
                <span className="text-base">✓</span> Win
              </button>
              <button onClick={() => markSignal(signal.id, 'LOSS')}
                className="py-3 bg-red-500/20 hover:bg-red-500/35 text-red-400 font-bold text-sm transition-colors flex items-center justify-center gap-1.5 border-l border-white/5">
                <span className="text-base">✗</span> Loss
              </button>
            </div>
          </div>
        )}

        {/* Señales activas */}
        {!isNightBlocked && pendingSignals.length > 0 && (
          <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-3">
            <h3 className="text-white/70 text-xs font-medium mb-2 flex items-center gap-2">
              🔔 Señales Activas
              <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] rounded-full font-bold">{pendingSignals.length}</span>
            </h3>
            <div className="space-y-1.5">
              {pendingSignals.slice(0, 5).map(s => (
                <button key={s.id} onClick={() => goToSignal(s)}
                  className="w-full flex items-center justify-between p-2 bg-white/3 hover:bg-white/8 rounded-lg transition-colors">
                  <div className="flex items-center gap-2">
                    <span>{s.emoji}</span>
                    <span className="text-white text-xs">{s.assetName}</span>
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${s.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{s.action}</span>
                  </div>
                  <span className="text-white/40 text-xs">{s.score}% →</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── SIGNALS SECTION ──
  const SignalsSection = () => (
    <div className="space-y-3">
      {isNightBlocked ? (
        <div className="bg-[#0d0d12] rounded-xl border border-amber-500/20 p-8 text-center">
          <span className="text-4xl mb-3 block">🔒</span>
          <h3 className="text-lg font-bold text-white mb-2">Horario Cerrado</h3>
          <p className="text-white/50 text-sm mb-4">Disponible: <span className="text-emerald-400">6AM – 2PM COL</span></p>
          <button onClick={() => setShowPricing(true)} className="px-5 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg text-sm">Upgrade a 24/7</button>
        </div>
      ) : (
        <div className="bg-[#0d0d12] rounded-xl border border-white/5 overflow-hidden">
          <div className="p-3 border-b border-white/5 flex items-center gap-2">
            <span className="text-sm">📊</span>
            <span className="text-white text-sm font-medium">Señales Activas</span>
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded-full ml-auto">{pendingSignals.length}</span>
          </div>
          <div className="divide-y divide-white/5 max-h-[60vh] overflow-y-auto">
            {pendingSignals.length === 0 ? (
              <div className="p-8 text-center text-white/30">
                <span className="text-3xl block mb-2">⏳</span>
                <p className="text-sm">Sin señales activas en tus 3 activos</p>
              </div>
            ) : (
              pendingSignals.map(s => (
                <div key={s.id} className="p-3">
                  <button onClick={() => goToSignal(s)} className="w-full flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span>{s.emoji}</span>
                      <span className="text-white text-sm font-medium">{s.assetName}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${s.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{s.action}</span>
                    </div>
                    <span className="text-white/40 text-xs">{s.score}%</span>
                  </button>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => markSignal(s.id, 'WIN')} className="flex-1 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-400 rounded text-xs font-bold transition-colors">✓ Win</button>
                    <button onClick={() => markSignal(s.id, 'LOSS')} className="flex-1 py-1.5 bg-red-500/20 hover:bg-red-500/35 text-red-400 rounded text-xs font-bold transition-colors">✗ Loss</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );

  // ── STATS SECTION ──
  const StatsSection = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Total señales', value: filteredStats.total,    sub: 'Step + Oro + V100', color: 'text-white' },
          { label: 'Win Rate',      value: `${filteredStats.winRate}%`, sub: 'Solo mis activos', color: 'text-emerald-400' },
          { label: 'Wins',          value: filteredStats.wins,     sub: 'Operaciones ganadoras', color: 'text-emerald-400' },
          { label: 'Losses',        value: filteredStats.losses,   sub: 'Operaciones perdidas',  color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
            <p className="text-white/40 text-xs mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-white/20 text-[10px] mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
        <h3 className="text-white/70 text-sm font-medium mb-3">🎯 Take Profits alcanzados</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'TP1 (1:1.5)', value: filteredStats.tp1Hits, color: 'text-emerald-400' },
            { label: 'TP2 (1:2.5)', value: filteredStats.tp2Hits, color: 'text-cyan-400' },
            { label: 'TP3 (1:4)',   value: filteredStats.tp3Hits, color: 'text-purple-400' },
          ].map(t => (
            <div key={t.label} className="text-center p-3 bg-white/5 rounded-lg">
              <p className={`text-2xl font-bold ${t.color}`}>{t.value}</p>
              <p className="text-xs text-white/30 mt-1">{t.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
        <h3 className="text-white/70 text-sm font-medium mb-3">📊 Mis 3 Activos</h3>
        <div className="space-y-2">
          {filteredAssets.map(asset => {
            const assetClosed = closedSignals.filter(s => s.symbol === asset.symbol);
            const assetWins   = assetClosed.filter(s => s.status === 'WIN').length;
            const assetTotal  = assetClosed.length;
            const assetWR     = assetTotal > 0 ? Math.round((assetWins / assetTotal) * 100) : 0;
            return (
              <div key={asset.symbol} className="flex items-center justify-between p-2.5 bg-white/3 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{asset.emoji}</span>
                  <div>
                    <p className="text-white text-xs font-medium">{asset.name}</p>
                    <p className="text-white/30 text-[9px]">{assetTotal} señales</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${assetWR >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{assetWR}%</p>
                  <p className="text-white/30 text-[9px]">{assetWins}W / {assetTotal - assetWins}L</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── HISTORY SECTION ──
  const HistorySection = () => (
    <div className="bg-[#0d0d12] rounded-xl border border-white/5 overflow-hidden">
      <div className="p-3 border-b border-white/5 flex items-center gap-2">
        <span>📜</span>
        <span className="text-white text-sm font-medium">Historial</span>
        <span className="text-white/30 text-xs ml-auto">Solo Step · Oro · V100</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/3">
            <tr className="text-white/30 text-[10px] uppercase tracking-wide">
              <th className="p-3 text-left">Activo</th>
              <th className="p-3 text-left">Dir</th>
              <th className="p-3 text-left">Score</th>
              <th className="p-3 text-left">Estado</th>
              <th className="p-3 text-left">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {closedSignals.slice(0, 30).map(s => (
              <tr key={s.id} className="text-white/70 hover:bg-white/3 transition-colors">
                <td className="p-3 text-xs">{s.emoji} {s.assetName}</td>
                <td className="p-3">
                  <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${s.action === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{s.action}</span>
                </td>
                <td className="p-3 text-xs font-mono">{s.score}%</td>
                <td className="p-3">
                  <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${s.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{s.status}</span>
                </td>
                <td className="p-3 text-[10px] text-white/30">{new Date(s.timestamp).toLocaleDateString()}</td>
              </tr>
            ))}
            {closedSignals.length === 0 && (
              <tr><td colSpan="5" className="p-8 text-center text-white/30 text-sm">Sin historial aún</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Loading
  if (loadingSub) return (
    <div className="min-h-screen bg-[#06060a] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white/60">Cargando...</p>
      </div>
    </div>
  );

  // Expirado
  if (isExpired) return (
    <div className="min-h-screen bg-[#06060a] flex flex-col">
      <Sidebar />
      <main className={`flex-1 transition-all duration-300 ${sidebarOpen && !isMobile ? 'ml-44' : 'ml-0'}`}>
        <Header />
        <div className="flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <span className="text-5xl mb-4 block">🔒</span>
            <h2 className="text-2xl font-bold text-white mb-3">Suscripción expirada</h2>
            <p className="text-white/50 mb-6 text-sm">Tu plan ha expirado. Activa uno nuevo para seguir operando.</p>
            <button onClick={() => setShowPricing(true)} className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold rounded-xl">Ver Planes</button>
          </div>
        </div>
      </main>
      {showPricing && <Pricing user={user} subscription={subscription} onClose={() => setShowPricing(false)} />}
    </div>
  );

  // Bloqueo nocturno
  if (isNightBlocked) return (
    <div className="min-h-screen bg-[#06060a] flex flex-col">
      <Sidebar />
      <main className={`flex-1 transition-all duration-300 ${sidebarOpen && !isMobile ? 'ml-44' : 'ml-0'}`}>
        <Header />
        <div className="flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <span className="text-5xl mb-4 block">🌙</span>
            <h2 className="text-2xl font-bold text-white mb-2">Sesión Nocturna</h2>
            <p className="text-white/50 text-sm mb-4">Disponible: <span className="text-emerald-400">6:00 AM – 2:00 PM COL</span></p>
            <button onClick={() => setShowPricing(true)} className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg">Upgrade a 24/7</button>
          </div>
        </div>
      </main>
      {showPricing && <Pricing user={user} subscription={subscription} onClose={() => setShowPricing(false)} />}
    </div>
  );

  // Dashboard principal
  return (
    <div className="min-h-screen bg-[#06060a]">
      <Sidebar />
      <main className={`transition-all duration-300 ${sidebarOpen && !isMobile ? 'ml-44' : 'ml-0'}`}>
        <Header />
        <div className="p-3 pb-24">
          {activeSection === 'dashboard' && <DashboardSection />}
          {activeSection === 'signals'   && <SignalsSection />}
          {activeSection === 'stats'     && <StatsSection />}
          {activeSection === 'history'   && <HistorySection />}
          {activeSection === 'download'  && (
            <div className="space-y-4">
              <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-6 text-center">
                <div className="text-5xl mb-4">📲</div>
                <h2 className="text-xl font-bold text-white mb-2">Instalar Trading Master Pro</h2>
                <p className="text-white/50 text-sm mb-4">Instala la app en tu dispositivo para acceso rápido y notificaciones</p>
                <button onClick={() => { if (window.deferredPrompt) { window.deferredPrompt.prompt(); } else { alert('Usa el menú de tu navegador → "Instalar app"'); } }}
                  className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold rounded-xl">Instalar App</button>
              </div>
              <PushNotifications userId={user?.id} userPlan={subscription?.plan || 'trial'} />
            </div>
          )}
        </div>
      </main>

      {/* Diálogo TP */}
      {tpDialog.open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d0d12] rounded-2xl border border-white/10 p-6 max-w-sm w-full">
            <h3 className="text-white font-bold text-lg mb-1 text-center">🎯 ¿Qué TP alcanzaste?</h3>
            <p className="text-white/40 text-xs text-center mb-4">Selecciona el nivel de take profit</p>
            <div className="space-y-2">
              {[{ n: 1, label: 'TP1', ratio: '+1.5R' }, { n: 2, label: 'TP2', ratio: '+2.5R' }, { n: 3, label: 'TP3', ratio: '+4R 🏆' }].map(tp => (
                <button key={tp.n} onClick={() => confirmWin(tp.n)}
                  className="w-full py-3 bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 rounded-xl font-bold transition-colors flex items-center justify-between px-4">
                  <span>{tp.label}</span>
                  <span className="text-emerald-500 text-sm">{tp.ratio}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setTpDialog({ open: false, signalId: null })}
              className="w-full mt-3 py-2 text-white/30 hover:text-white/50 text-sm transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      {showPricing && <Pricing user={user} subscription={subscription} onClose={() => setShowPricing(false)} />}
      <ElisaChat selectedAsset={selectedAsset} isMobile={isMobile} />
    </div>
  );
}
