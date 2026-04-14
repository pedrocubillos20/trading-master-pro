import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Pricing from './Pricing';
import PushNotifications from './PushNotifications';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';
const ALLOWED_SYMBOLS = ['stpRNG', 'frxXAUUSD', '1HZ100V'];

// ─── MINI CHART ───────────────────────────────────────────────────────────────
const MiniChart = ({ candles, height = 380, signal = null }) => {
  const svgRef = useRef(null);
  const zoomRef = useRef(60);
  const offRef  = useRef(0);
  const isDrag  = useRef(false);
  const dragX   = useRef(0);
  const dragOff = useRef(0);

  const draw = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || !candles?.length) return;
    const W = svg.parentElement?.clientWidth || 700;
    const H = height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W); svg.setAttribute('height', H);

    const total = candles.length;
    const zoom  = Math.max(20, Math.min(zoomRef.current, total));
    const off   = Math.max(0, Math.min(total - zoom, offRef.current));
    const vis   = candles.slice(Math.max(0, total-zoom-off), total-off).slice(-zoom);
    if (!vis.length) return;

    const PAD = { top: 16, right: 86, bottom: 26, left: 6 };
    const CH = H - PAD.top - PAD.bottom;
    const CW = W - PAD.left - PAD.right;

    let maxP = Math.max(...vis.map(c=>parseFloat(c.high)));
    let minP = Math.min(...vis.map(c=>parseFloat(c.low)));
    if (signal?.entry) {
      const lvs = [signal.entry, signal.tp1||signal.take_profit_1, signal.tp2||signal.take_profit_2, signal.tp3||signal.take_profit_3, signal.stop||signal.stop_loss].map(v=>parseFloat(v||0)).filter(v=>v>0);
      if (lvs.length) { maxP = Math.max(maxP,...lvs); minP = Math.min(minP,...lvs); }
    }
    const mg = (maxP-minP)*0.1; maxP+=mg; minP-=mg;
    const range = maxP-minP||0.01;
    const Y = p => PAD.top + CH*(1-(parseFloat(p)-minP)/range);

    const n = vis.length, cW = CW/n, bW = Math.max(1.5, cW*0.65);
    let h = `<rect width="${W}" height="${H}" fill="#07080f"/>`;

    // Grid sutil
    for (let i=0; i<=5; i++) {
      const p = minP + (range*i)/5;
      const y = Y(p);
      h += `<line x1="${PAD.left}" y1="${y|0}" x2="${W-PAD.right}" y2="${y|0}" stroke="#ffffff05" stroke-width="1"/>`;
      h += `<text x="${W-PAD.right+4}" y="${(y+3.5)|0}" fill="#283040" font-size="8.5" font-family="'Courier New',monospace">${p.toFixed(2)}</text>`;
    }

    // Velas
    vis.forEach((c,i) => {
      const o=parseFloat(c.open), cl=parseFloat(c.close), hi=parseFloat(c.high), lo=parseFloat(c.low);
      if (!o||!cl||!hi||!lo||hi<lo) return;
      const bull=cl>=o, col=bull?'#22c55e':'#ef4444';
      const x=PAD.left+i*cW+cW/2;
      const bTop=Y(Math.max(o,cl)), bBot=Y(Math.min(o,cl)), bH=Math.max(1.5,bBot-bTop);
      h += `<line x1="${x|0}" y1="${Y(hi)|0}" x2="${x|0}" y2="${Y(lo)|0}" stroke="${col}" stroke-width="1" opacity="0.6"/>`;
      h += `<rect x="${(x-bW/2)|0}" y="${bTop|0}" width="${bW|0}" height="${bH|0}" fill="${col}"/>`;
    });

    // Niveles señal
    if (signal?.entry) {
      const en  = parseFloat(signal.entry);
      const tp1 = parseFloat(signal.tp1||signal.take_profit_1||0);
      const tp2 = parseFloat(signal.tp2||signal.take_profit_2||0);
      const tp3 = parseFloat(signal.tp3||signal.take_profit_3||0);
      const sl  = parseFloat(signal.stop||signal.stop_loss||0);
      const drawL = (price, col, label, lw=1.5, dash='') => {
        if (!price) return;
        const y = Math.max(PAD.top+5, Math.min(PAD.top+CH-5, Y(price)));
        const x2 = W-PAD.right;
        h += `<line x1="${PAD.left}" y1="${y|0}" x2="${x2}" y2="${y|0}" stroke="${col}" stroke-width="${lw}" ${dash?`stroke-dasharray="${dash}"`:''}  opacity="0.9"/>`;
        h += `<rect x="${x2+1}" y="${(y-8)|0}" width="${PAD.right-3}" height="16" rx="3" fill="${col}"/>`;
        h += `<text x="${x2+5}" y="${(y+4)|0}" fill="#000" font-size="8" font-weight="700" font-family="'Courier New',monospace">${label} ${price.toFixed(2)}</text>`;
      };
      if (sl)  drawL(sl,  '#ef4444','SL',  1.2,'5,3');
      if (tp3) drawL(tp3, '#059669','TP3', 1.2,'4,3');
      if (tp2) drawL(tp2, '#10b981','TP2', 1.5,'4,3');
      if (tp1) drawL(tp1, '#34d399','TP1', 2);
      drawL(en, '#f59e0b','ENT', 2.5);
      const isLong = ['BUY','LONG'].includes(signal.direction||signal.action||signal.tipo);
      const eY = Math.max(PAD.top+12, Math.min(PAD.top+CH-12, Y(en)));
      h += isLong
        ? `<polygon points="${PAD.left+8},${eY+8} ${PAD.left+20},${eY} ${PAD.left+8},${eY-8}" fill="#22c55e" opacity="0.95"/>`
        : `<polygon points="${PAD.left+20},${eY+8} ${PAD.left+8},${eY} ${PAD.left+20},${eY-8}" fill="#ef4444" opacity="0.95"/>`;
    }

    // Precio actual
    const lc = parseFloat(vis[vis.length-1]?.close||0);
    if (lc>0) {
      const py = Math.max(PAD.top+5, Math.min(PAD.top+CH-5, Y(lc)));
      const up = lc >= parseFloat(vis[vis.length-1]?.open||lc);
      const cc = up?'#22c55e':'#ef4444';
      h += `<line x1="${PAD.left}" y1="${py|0}" x2="${W-PAD.right}" y2="${py|0}" stroke="${cc}" stroke-width="1" stroke-dasharray="3,4" opacity="0.4"/>`;
      h += `<rect x="${W-PAD.right+1}" y="${(py-8)|0}" width="${PAD.right-3}" height="16" rx="3" fill="${cc}"/>`;
      h += `<text x="${W-PAD.right+5}" y="${(py+4)|0}" fill="#fff" font-size="8" font-weight="700" font-family="'Courier New',monospace">${lc.toFixed(2)}</text>`;
    }

    // Timestamps
    const step = Math.max(1, Math.floor(n/6));
    vis.forEach((c,i) => {
      if (i%step!==0&&i!==n-1) return;
      const x = PAD.left+i*cW+cW/2;
      const ep = parseInt(c.epoch||c.time||0); if (!ep) return;
      const d = new Date(ep*1000);
      h += `<text x="${x|0}" y="${H-PAD.bottom+14}" text-anchor="middle" fill="#283040" font-size="8" font-family="monospace">${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}</text>`;
    });

    svg.innerHTML = h;
  }, [candles, height, signal]);

  useEffect(()=>{ draw(); },[draw]);
  useEffect(()=>{
    const el = svgRef.current?.parentElement; if (!el) return;
    const ro = new ResizeObserver(()=>draw()); ro.observe(el);
    return ()=>ro.disconnect();
  },[draw]);

  const onMD=e=>{isDrag.current=true;dragX.current=e.clientX;dragOff.current=offRef.current;};
  const onMM=e=>{if(!isDrag.current)return;const sl=(svgRef.current?.parentElement?.clientWidth||700)/zoomRef.current;offRef.current=Math.max(0,Math.min((candles?.length||0)-zoomRef.current,dragOff.current+Math.round((dragX.current-e.clientX)/Math.max(2,sl))));draw();};
  const onMU=()=>{isDrag.current=false;};
  const onWh=e=>{e.preventDefault();zoomRef.current=Math.max(15,Math.min(200,zoomRef.current+(e.deltaY>0?8:-8)));draw();};
  const onTD=e=>{isDrag.current=true;dragX.current=e.touches[0].clientX;dragOff.current=offRef.current;};
  const onTM=e=>{if(!isDrag.current)return;const sl=(svgRef.current?.parentElement?.clientWidth||700)/zoomRef.current;offRef.current=Math.max(0,Math.min((candles?.length||0)-zoomRef.current,dragOff.current+Math.round((dragX.current-e.touches[0].clientX)/Math.max(2,sl))));draw();};

  return (
    <div className="relative w-full select-none" style={{height, background:'#07080f'}}>
      <div className="absolute top-2 left-2 z-10 flex gap-1">
        {[{l:'+',fn:()=>{zoomRef.current=Math.max(15,zoomRef.current-15);draw();}},{l:'−',fn:()=>{zoomRef.current=Math.min(200,zoomRef.current+15);draw();}},{l:'↺',fn:()=>{zoomRef.current=60;offRef.current=0;draw();}}].map(({l,fn})=>(
          <button key={l} onClick={fn} className="w-6 h-6 rounded bg-white/8 hover:bg-white/15 text-white/50 hover:text-white text-xs flex items-center justify-center transition-all">{l}</button>
        ))}
      </div>
      <svg ref={svgRef} style={{display:'block',width:'100%',height:'100%',cursor:'crosshair'}}
        onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU} onWheel={onWh}
        onTouchStart={onTD} onTouchMove={onTM} onTouchEnd={onMU}/>
    </div>
  );
};

// ─── DASHBOARD PRINCIPAL ──────────────────────────────────────────────────────
export default function Dashboard({ user, onLogout }) {
  const [data, setData]                   = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen]     = useState(window.innerWidth > 900);
  const [timeframe, setTimeframe]         = useState('M5');
  const [candles, setCandles]             = useState([]);
  const [candlesH1, setCandlesH1]         = useState([]);
  const [candlesM15, setCandlesM15]       = useState([]);
  const [candlesM1, setCandlesM1]         = useState([]);
  const [isMobile, setIsMobile]           = useState(window.innerWidth < 768);
  const [showUserMenu, setShowUserMenu]   = useState(false);
  const [showPricing, setShowPricing]     = useState(false);
  const [subscription, setSubscription]   = useState(null);
  const [loadingSub, setLoadingSub]       = useState(true);
  const [tpDialog, setTpDialog]           = useState({ open:false, signalId:null });

  const mountedRef          = useRef(true);
  const initialSetRef       = useRef(false);
  const scrollRef           = useRef(null);
  const scrollPosRef        = useRef(0);

  useEffect(()=>()=>{mountedRef.current=false;},[]);

  // Suscripción
  useEffect(()=>{
    if (!user?.email&&!user?.id) return;
    (async()=>{
      try {
        const r = await fetch(`${API_URL}/api/subscription/${encodeURIComponent(user.email||user.id)}`);
        const j = await r.json();
        if (mountedRef.current){ setSubscription(j.subscription); setLoadingSub(false); }
      } catch { setSubscription({status:'trial',plan:'free',plan_name:'Free Trial',days_left:5,assets:ALLOWED_SYMBOLS}); setLoadingSub(false); }
    })();
  },[user?.id,user?.email]);

  useEffect(()=>{
    const h=()=>{ const m=window.innerWidth<768; setIsMobile(m); if(m) setSidebarOpen(false); };
    window.addEventListener('resize',h); return()=>window.removeEventListener('resize',h);
  },[]);

  // Dashboard data
  useEffect(()=>{
    if (!user?.email&&!user?.id) return;
    let cancelled=false;
    const fetch_ = async()=>{
      try {
        const r=await fetch(`${API_URL}/api/dashboard/${encodeURIComponent(user.email||user.id)}`);
        const j=await r.json();
        if (!cancelled&&mountedRef.current){
          setData(j);
          if (!initialSetRef.current&&j.assets?.length){
            initialSetRef.current=true;
            const first=j.assets.find(a=>ALLOWED_SYMBOLS.includes(a.symbol))||j.assets[0];
            setSelectedAsset(first.symbol);
          }
        }
      } catch {}
    };
    fetch_(); const iv=setInterval(fetch_,3000); return()=>{cancelled=true;clearInterval(iv);};
  },[user?.email,user?.id]);

  // Candles
  useEffect(()=>{
    if (!selectedAsset) return;
    let cancelled=false;
    const fetch_ = async()=>{
      try {
        const r=await fetch(`${API_URL}/api/analyze/${selectedAsset}`);
        const j=await r.json();
        if (!cancelled&&mountedRef.current){
          if (j.candles?.length) setCandles(j.candles);
          if (j.candlesH1?.length) setCandlesH1(j.candlesH1);
          if (j.candlesM15?.length) setCandlesM15(j.candlesM15);
          if (j.candlesM1?.length) setCandlesM1(j.candlesM1);
        }
      } catch {}
    };
    fetch_(); const iv=setInterval(fetch_,4000); return()=>{cancelled=true;clearInterval(iv);};
  },[selectedAsset]);

  const markSignal = async(id,status)=>{
    if (status==='WIN'){ setTpDialog({open:true,signalId:id}); return; }
    try { await fetch(`${API_URL}/api/signals/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,userId:user?.email||user?.id,tpHit:null})}); } catch {}
  };
  const confirmWin = async(tpHit)=>{
    if (tpDialog.signalId){
      try { await fetch(`${API_URL}/api/signals/${tpDialog.signalId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'WIN',userId:user?.email||user?.id,tpHit})}); } catch {}
      setTpDialog({open:false,signalId:null});
    }
  };

  const pendingSignals = useMemo(()=>(data?.recentSignals||[]).filter(s=>s.status==='PENDING'&&ALLOWED_SYMBOLS.includes(s.symbol)),[data?.recentSignals]);
  const closedSignals  = useMemo(()=>(data?.recentSignals||[]).filter(s=>s.status!=='PENDING'&&ALLOWED_SYMBOLS.includes(s.symbol)),[data?.recentSignals]);
  const filteredAssets = useMemo(()=>(data?.assets||[]).filter(a=>ALLOWED_SYMBOLS.includes(a.symbol)),[data?.assets]);
  const currentAsset   = useMemo(()=>data?.assets?.find(a=>a.symbol===selectedAsset),[data?.assets,selectedAsset]);
  const currentCandles = timeframe==='H1' ? candlesH1 : timeframe==='M15' ? candlesM15 : timeframe==='M1' ? candlesM1 : candles;
  const lockedSignal   = currentAsset?.lockedSignal;
  const isExpired      = subscription?.status==='expired';

  const filteredStats = useMemo(()=>{
    const all=(data?.recentSignals||[]).filter(s=>ALLOWED_SYMBOLS.includes(s.symbol)&&s.status!=='PENDING');
    const wins=all.filter(s=>s.status==='WIN').length, losses=all.filter(s=>s.status==='LOSS').length, total=wins+losses;
    return { wins, losses, total, pending:pendingSignals.length, winRate:total>0?Math.round(wins/total*100):0,
      tp1Hits:all.filter(s=>s.tpHit===1).length, tp2Hits:all.filter(s=>s.tpHit===2).length, tp3Hits:all.filter(s=>s.tpHit===3).length };
  },[data?.recentSignals,pendingSignals.length]);

  useEffect(()=>{ if(scrollRef.current&&scrollPosRef.current>0) scrollRef.current.scrollTop=scrollPosRef.current; });

  // ── SIDEBAR ──────────────────────────────────────────────────────────────────
  const Sidebar = ()=>(
    <>
      {isMobile&&sidebarOpen&&<div className="fixed inset-0 bg-black/60 z-40" onClick={()=>setSidebarOpen(false)}/>}
      <aside className={`fixed left-0 top-0 h-full bg-[#07080f] border-r border-white/[0.06] z-50 flex flex-col transition-all duration-200
        ${sidebarOpen?(isMobile?'w-56':'w-52'):'w-0 overflow-hidden'}`}>

        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
            </div>
            <span className="font-bold text-sm text-white tracking-tight">TradingPro</span>
          </div>
          <button onClick={()=>setSidebarOpen(false)} className="w-7 h-7 rounded-lg hover:bg-white/8 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors text-sm">✕</button>
        </div>

        {/* Plan badge */}
        <div className="px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0 flex items-center justify-between">
          <span className={`text-[10px] font-bold px-2 py-1 rounded-md tracking-wide ${subscription?.status==='trial'?'bg-amber-500/20 text-amber-400 border border-amber-500/30':subscription?.status==='expired'?'bg-red-500/20 text-red-400 border border-red-500/30':'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
            {subscription?.status==='trial'?'FREE TRIAL':subscription?.status==='expired'?'EXPIRADO':subscription?.plan_name?.toUpperCase()||'ELITE'}
          </span>
          {subscription?.days_left!==undefined&&subscription?.status!=='expired'&&(
            <span className={`text-[10px] font-mono ${subscription.days_left<=5?'text-red-400':'text-white/30'}`}>{subscription.days_left}d</span>
          )}
        </div>

        {/* Nav */}
        <nav className="p-2.5 space-y-0.5 border-b border-white/[0.06] flex-shrink-0">
          {[
            {id:'dashboard',icon:'▦',label:'Dashboard'},
            {id:'signals',  icon:'◎',label:'Señales', badge:pendingSignals.length},
            {id:'stats',    icon:'◈',label:'Stats'},
            {id:'history',  icon:'≡',label:'Historial'},
          ].map(item=>(
            <button key={item.id} onClick={()=>{setActiveSection(item.id);if(isMobile)setSidebarOpen(false);}}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-xs font-medium
                ${activeSection===item.id?'bg-emerald-500/12 text-emerald-400 border border-emerald-500/20':'text-white/40 hover:text-white/70 hover:bg-white/5'}`}>
              <span className="text-base leading-none w-4 text-center">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge>0&&<span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500 text-black rounded-full">{item.badge}</span>}
            </button>
          ))}
        </nav>

        {/* Markets */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-4 pt-3 pb-1.5 flex-shrink-0">
            <p className="text-[9px] uppercase tracking-widest text-white/20 font-semibold">Mercados</p>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-2.5 pb-2 space-y-1"
            onScroll={e=>{e.stopPropagation();scrollPosRef.current=e.target.scrollTop;}}>
            {filteredAssets.map(asset=>(
              <button key={asset.symbol}
                onClick={e=>{e.stopPropagation();setSelectedAsset(asset.symbol);if(isMobile)setSidebarOpen(false);}}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all
                  ${selectedAsset===asset.symbol?'bg-white/10 border border-white/12 text-white':'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'}`}>
                <span className="text-lg leading-none">{asset.emoji}</span>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-[11px] font-semibold leading-tight truncate">{asset.shortName}</p>
                  <p className="text-[9px] text-white/25 leading-tight truncate">{asset.name}</p>
                </div>
                {asset.lockedSignal&&(
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0
                    ${asset.lockedSignal.action==='LONG'?'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30':'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                    {asset.lockedSignal.action}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-white/[0.06] p-2.5 space-y-1.5">
          {subscription?.plan!=='elite'&&subscription?.status!=='elite'&&(
            <button onClick={()=>setShowPricing(true)} className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 text-white text-xs font-bold rounded-lg transition-opacity">
              ⚡ Upgrade Plan
            </button>
          )}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${data?.connected?'bg-emerald-400 shadow-sm shadow-emerald-400/50':'bg-red-400'}`}/>
              <span className="text-[10px] text-white/30">{data?.connected?'Online':'Offline'}</span>
            </div>
            <button onClick={()=>{setActiveSection('download');if(isMobile)setSidebarOpen(false);}} className="text-[10px] text-white/25 hover:text-white/50 transition-colors px-2 py-1 rounded-md hover:bg-white/5">📱 App</button>
          </div>
        </div>
      </aside>
    </>
  );

  // ── HEADER ────────────────────────────────────────────────────────────────────
  const Header = ()=>(
    <header className="h-14 bg-[#07080f]/90 backdrop-blur border-b border-white/[0.06] flex items-center justify-between px-4 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {!sidebarOpen&&(
          <button onClick={()=>setSidebarOpen(true)} className="w-8 h-8 rounded-lg hover:bg-white/8 flex items-center justify-center text-white/40 hover:text-white/80 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
        )}
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white capitalize">{activeSection}</h2>
          <span className="hidden sm:inline text-[10px] px-2 py-0.5 bg-purple-500/15 text-purple-400 border border-purple-500/20 rounded-md">12 Modelos SMC</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {subscription?.status==='trial'&&(
          <button onClick={()=>setShowPricing(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-all">
            <span>⏳</span><span className="hidden sm:inline">{subscription.days_left}d restantes</span>
          </button>
        )}
        {subscription?.plan&&subscription?.status!=='trial'&&subscription?.status!=='expired'&&(
          <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs font-medium">
            <span>✓</span>{subscription.plan_name}
          </span>
        )}
        <div className="flex bg-white/6 border border-white/10 rounded-lg p-0.5">
          {['M1','M5','M15','H1'].map(tf=>(
            <button key={tf} onClick={()=>setTimeframe(tf)}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${timeframe===tf?'bg-emerald-500 text-black shadow-sm':'text-white/40 hover:text-white/70'}`}>{tf}</button>
          ))}
        </div>
        <div className="relative">
          <button onClick={()=>setShowUserMenu(!showUserMenu)}
            className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-black font-bold text-sm shadow-md">
            {user?.email?.[0]?.toUpperCase()||'U'}
          </button>
          {showUserMenu&&(
            <div className="absolute right-0 mt-2 w-52 bg-[#0c0c14] rounded-xl border border-white/10 shadow-2xl py-2">
              <div className="px-3 py-2 border-b border-white/8">
                <p className="text-white text-sm font-medium truncate">{user?.email}</p>
                <p className="text-white/30 text-xs">{subscription?.plan_name||'Free Trial'}</p>
              </div>
              <button onClick={onLogout} className="w-full px-3 py-2 text-left text-red-400 text-sm hover:bg-white/5 transition-colors">Cerrar sesión</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );

  // ── DASHBOARD SECTION ─────────────────────────────────────────────────────────
  const DashboardSection = ()=>{
    const sig = lockedSignal;
    const isLong = sig ? ['BUY','LONG'].includes(sig.action) : false;
    return (
      <div className="space-y-3">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2">
          {[
            {label:'Win Rate', value:`${filteredStats.winRate}%`, color:'text-white',    sub:filteredStats.total>0?`${filteredStats.total} ops`:'Sin ops'},
            {label:'Activas',  value:filteredStats.pending,       color:'text-cyan-400', sub:'En curso'},
            {label:'Wins',     value:filteredStats.wins,          color:'text-emerald-400', sub:'Ganadoras'},
            {label:'Loss',     value:filteredStats.losses,        color:'text-red-400',  sub:'Perdidas'},
          ].map(s=>(
            <div key={s.label} className="bg-[#0c0c14] rounded-xl p-3 border border-white/[0.06] hover:border-white/10 transition-colors">
              <p className="text-white/30 text-[9px] uppercase tracking-wide mb-1">{s.label}</p>
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-white/20 text-[9px] mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* CHART — grande y limpio */}
        <div className="bg-[#0c0c14] rounded-xl border border-white/[0.06] overflow-hidden">
          {/* Chart header */}
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{currentAsset?.emoji}</span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-semibold text-sm">{currentAsset?.name||'Cargando...'}</h3>
                  {lockedSignal&&(
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${isLong?'bg-emerald-500/15 text-emerald-400 border-emerald-500/30':'bg-red-500/15 text-red-400 border-red-500/30'}`}>
                      {lockedSignal.action}
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5 mt-1">
                  {[{tf:'M5',s:currentAsset?.structureM5},{tf:'M15',s:currentAsset?.structureM15},{tf:'H1',s:currentAsset?.structureH1}].map(({tf,s})=>(
                    <span key={tf} className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${s==='BULLISH'?'bg-emerald-500/10 text-emerald-400 border-emerald-500/20':s==='BEARISH'?'bg-red-500/10 text-red-400 border-red-500/20':'bg-white/5 text-white/30 border-white/8'}`}>
                      {tf}: {s||'…'}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-white font-mono tracking-tight">{currentAsset?.price?.toFixed(currentAsset?.decimals||2)||'---'}</p>
              <p className="text-[10px] text-white/25 mt-0.5">{timeframe} · {currentCandles.length} velas</p>
            </div>
          </div>

          {/* El gráfico — altura generosa */}
          <MiniChart candles={currentCandles} height={isMobile?260:400} signal={lockedSignal}/>
        </div>

        {/* Señal activa */}
        {sig&&(
          <div className={`rounded-xl overflow-hidden border ${isLong?'border-emerald-500/25':'border-red-500/25'}`}>
            <div className={`px-4 py-3 flex items-center justify-between ${isLong?'bg-emerald-500/8':'bg-red-500/8'}`}>
              <div className="flex items-center gap-2.5">
                <span className={`px-3 py-1 rounded-lg text-sm font-bold ${isLong?'bg-emerald-500 text-black':'bg-red-500 text-white'}`}>{sig.action}</span>
                <span className="text-white/40 text-xs font-mono">{sig.model}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full animate-pulse ${isLong?'bg-emerald-400':'bg-red-400'}`}/>
                <span className="text-2xl font-bold text-white font-mono">{sig.score}%</span>
              </div>
            </div>
            <div className="grid grid-cols-5 bg-[#0c0c14]">
              {[
                {l:'Entry', v:sig.entry,                               bg:'bg-white/4',         tc:'text-white',     bc:'border-white/8'},
                {l:'TP1',  v:sig.tp1||sig.take_profit_1,              bg:'bg-emerald-500/8',   tc:'text-emerald-400',bc:'border-emerald-500/15'},
                {l:'TP2',  v:sig.tp2||sig.take_profit_2,              bg:'bg-emerald-500/10',  tc:'text-emerald-400',bc:'border-emerald-500/20'},
                {l:'TP3',  v:sig.tp3||sig.take_profit_3,              bg:'bg-emerald-500/12',  tc:'text-emerald-400',bc:'border-emerald-500/25'},
                {l:'SL',   v:sig.stop||sig.stop_loss,                 bg:'bg-red-500/8',       tc:'text-red-400',    bc:'border-red-500/15'},
              ].map((item,i)=>(
                <div key={i} className={`${item.bg} border-r last:border-r-0 ${item.bc} p-3 text-center`}>
                  <p className={`text-[9px] uppercase tracking-wide mb-1 ${item.tc} opacity-50`}>{item.l}</p>
                  <p className={`text-xs font-bold font-mono ${item.tc}`}>{parseFloat(item.v||0).toFixed(2)}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 border-t border-white/[0.06]">
              <button onClick={()=>markSignal(sig.id,'WIN')}
                className="py-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold text-sm transition-all flex items-center justify-center gap-2 border-r border-white/[0.06] hover:text-emerald-300">
                <span className="text-base">✓</span> Win
              </button>
              <button onClick={()=>markSignal(sig.id,'LOSS')}
                className="py-3.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-sm transition-all flex items-center justify-center gap-2 hover:text-red-300">
                <span className="text-base">✗</span> Loss
              </button>
            </div>
          </div>
        )}

        {/* Señales activas */}
        {pendingSignals.length>0&&(
          <div className="bg-[#0c0c14] rounded-xl border border-white/[0.06]">
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
              <span className="text-xs font-semibold text-white/50">Señales Activas</span>
              <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] font-bold rounded-full">{pendingSignals.length}</span>
            </div>
            <div className="p-2 space-y-1">
              {pendingSignals.slice(0,4).map(s=>(
                <button key={s.id} onClick={()=>{setSelectedAsset(s.symbol);setActiveSection('dashboard');}}
                  className="w-full flex items-center justify-between px-3 py-2 bg-white/3 hover:bg-white/6 rounded-lg transition-colors">
                  <div className="flex items-center gap-2">
                    <span>{s.emoji}</span>
                    <span className="text-white/70 text-xs font-medium">{s.assetName}</span>
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${s.action==='LONG'?'bg-emerald-500/20 text-emerald-400':'bg-red-500/20 text-red-400'}`}>{s.action}</span>
                  </div>
                  <span className="text-white/30 text-xs font-mono">{s.score}%</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── SIGNALS SECTION ───────────────────────────────────────────────────────────
  const SignalsSection = ()=>(
    <div className="bg-[#0c0c14] rounded-xl border border-white/[0.06] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
        <span className="text-sm font-semibold text-white">Señales Activas</span>
        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full">{pendingSignals.length}</span>
      </div>
      <div className="divide-y divide-white/[0.04] max-h-[65vh] overflow-y-auto">
        {pendingSignals.length===0?(
          <div className="p-12 text-center"><p className="text-4xl mb-3">⏳</p><p className="text-white/30 text-sm">Sin señales activas</p></div>
        ):pendingSignals.map(s=>{
          const long=['BUY','LONG'].includes(s.action);
          return (
            <div key={s.id} className="p-4">
              <button onClick={()=>{setSelectedAsset(s.symbol);setActiveSection('dashboard');}} className="w-full flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{s.emoji}</span>
                  <div className="text-left">
                    <p className="text-white text-sm font-semibold">{s.assetName}</p>
                    <p className="text-white/30 text-[10px] font-mono">{s.model} · {s.score}%</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${long?'bg-emerald-500 text-black':'bg-red-500 text-white'}`}>{s.action}</span>
                </div>
                <span className="text-white/20 text-xs">→</span>
              </button>
              <div className="flex gap-2">
                <button onClick={()=>markSignal(s.id,'WIN')} className="flex-1 py-2 bg-emerald-500/12 hover:bg-emerald-500/25 text-emerald-400 text-xs font-bold rounded-lg transition-all">✓ Win</button>
                <button onClick={()=>markSignal(s.id,'LOSS')} className="flex-1 py-2 bg-red-500/12 hover:bg-red-500/25 text-red-400 text-xs font-bold rounded-lg transition-all">✗ Loss</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── STATS SECTION ─────────────────────────────────────────────────────────────
  const StatsSection = ()=>(
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[
          {label:'Win Rate',      value:`${filteredStats.winRate}%`, color:'text-emerald-400'},
          {label:'Total señales', value:filteredStats.total,         color:'text-white'},
          {label:'Wins',          value:filteredStats.wins,          color:'text-emerald-400'},
          {label:'Losses',        value:filteredStats.losses,        color:'text-red-400'},
        ].map(s=>(
          <div key={s.label} className="bg-[#0c0c14] rounded-xl p-4 border border-white/[0.06]">
            <p className="text-white/30 text-[10px] uppercase tracking-wide mb-1">{s.label}</p>
            <p className={`text-3xl font-bold font-mono ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-[#0c0c14] rounded-xl p-4 border border-white/[0.06]">
        <p className="text-white/50 text-xs font-semibold mb-3">Take Profits alcanzados</p>
        <div className="grid grid-cols-3 gap-2">
          {[{l:'TP1 · 1.5R',v:filteredStats.tp1Hits,c:'text-emerald-400'},{l:'TP2 · 2.5R',v:filteredStats.tp2Hits,c:'text-cyan-400'},{l:'TP3 · 4R',v:filteredStats.tp3Hits,c:'text-purple-400'}].map(t=>(
            <div key={t.l} className="text-center py-3 bg-white/4 rounded-lg">
              <p className={`text-2xl font-bold font-mono ${t.c}`}>{t.v}</p>
              <p className="text-white/25 text-[9px] mt-1">{t.l}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-[#0c0c14] rounded-xl p-4 border border-white/[0.06]">
        <p className="text-white/50 text-xs font-semibold mb-3">Por activo</p>
        <div className="space-y-2">
          {filteredAssets.map(asset=>{
            const ac=closedSignals.filter(s=>s.symbol===asset.symbol);
            const aw=ac.filter(s=>s.status==='WIN').length, at=ac.length;
            const wr=at>0?Math.round(aw/at*100):0;
            return (
              <div key={asset.symbol} className="flex items-center justify-between p-2.5 bg-white/3 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{asset.emoji}</span>
                  <div><p className="text-white/80 text-xs font-medium">{asset.shortName}</p><p className="text-white/25 text-[9px]">{at} señales</p></div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold font-mono ${wr>=50?'text-emerald-400':'text-red-400'}`}>{wr}%</p>
                  <p className="text-white/25 text-[9px]">{aw}W · {at-aw}L</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── HISTORY SECTION ───────────────────────────────────────────────────────────
  const HistorySection = ()=>(
    <div className="bg-[#0c0c14] rounded-xl border border-white/[0.06] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Historial</span>
        <span className="text-[10px] text-white/25">Step · Oro · V100 únicamente</span>
      </div>
      {closedSignals.length===0?(
        <div className="p-12 text-center"><p className="text-4xl mb-3">📋</p><p className="text-white/30 text-sm">Sin historial aún</p></div>
      ):(
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-white/[0.03]">
              {['Activo','Dir','Score','Estado','Fecha'].map(h=><th key={h} className="p-3 text-left text-[9px] uppercase tracking-widest text-white/20 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.03]">
              {closedSignals.slice(0,30).map(s=>(
                <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-3"><div className="flex items-center gap-1.5"><span>{s.emoji}</span><span className="text-white/60 text-xs">{s.assetName}</span></div></td>
                  <td className="p-3"><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${s.action==='LONG'?'bg-emerald-500/15 text-emerald-400':'bg-red-500/15 text-red-400'}`}>{s.action}</span></td>
                  <td className="p-3 text-white/40 text-xs font-mono">{s.score}%</td>
                  <td className="p-3"><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${s.status==='WIN'?'bg-emerald-500/15 text-emerald-400':'bg-red-500/15 text-red-400'}`}>{s.status}</span></td>
                  <td className="p-3 text-white/25 text-[10px]">{new Date(s.timestamp).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // Loading
  if (loadingSub) return (
    <div className="min-h-screen bg-[#050509] flex items-center justify-center">
      <div className="text-center"><div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3"/><p className="text-white/30 text-sm">Cargando...</p></div>
    </div>
  );

  if (isExpired) return (
    <div className="min-h-screen bg-[#050509] flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <p className="text-5xl mb-4">🔒</p>
        <h2 className="text-xl font-bold text-white mb-2">Suscripción expirada</h2>
        <p className="text-white/40 text-sm mb-5">Activa un plan para continuar operando.</p>
        <button onClick={()=>setShowPricing(true)} className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold rounded-xl">Ver Planes</button>
      </div>
      {showPricing&&<Pricing user={user} subscription={subscription} onClose={()=>setShowPricing(false)}/>}
    </div>
  );

  const sideW = sidebarOpen&&!isMobile ? 'ml-52' : 'ml-0';

  return (
    <div className="min-h-screen bg-[#050509]">
      <Sidebar/>
      <main className={`transition-all duration-200 ${sideW} min-h-screen flex flex-col`}>
        <Header/>
        <div className="flex-1 p-3 sm:p-4 pb-20 max-w-5xl w-full mx-auto">
          {activeSection==='dashboard' && <DashboardSection/>}
          {activeSection==='signals'   && <SignalsSection/>}
          {activeSection==='stats'     && <StatsSection/>}
          {activeSection==='history'   && <HistorySection/>}
          {activeSection==='download'  && (
            <div className="space-y-3">
              <div className="bg-[#0c0c14] rounded-xl border border-white/[0.06] p-8 text-center">
                <p className="text-4xl mb-3">📲</p>
                <h2 className="text-lg font-bold text-white mb-2">Instalar Trading Master Pro</h2>
                <p className="text-white/40 text-sm mb-5">Instala la app en tu dispositivo para acceso rápido</p>
                <button onClick={()=>{if(window.deferredPrompt){window.deferredPrompt.prompt();}else{alert('Usa el menú de tu navegador → "Instalar app"');}}}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold rounded-xl">Instalar App</button>
              </div>
              <PushNotifications userId={user?.id} userPlan={subscription?.plan||'trial'}/>
            </div>
          )}
        </div>
      </main>

      {/* TP Dialog */}
      {tpDialog.open&&(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c0c14] rounded-2xl border border-white/10 p-6 w-full max-w-xs shadow-2xl">
            <h3 className="text-white font-bold text-base mb-1 text-center">🎯 ¿Qué TP alcanzaste?</h3>
            <p className="text-white/30 text-xs text-center mb-4">Selecciona el nivel</p>
            <div className="space-y-2">
              {[{n:1,l:'TP1',r:'+1.5R'},{n:2,l:'TP2',r:'+2.5R'},{n:3,l:'TP3',r:'+4R 🏆'}].map(tp=>(
                <button key={tp.n} onClick={()=>confirmWin(tp.n)}
                  className="w-full py-3 bg-emerald-500/12 hover:bg-emerald-500/25 text-emerald-400 rounded-xl font-bold text-sm transition-all flex justify-between px-4">
                  <span>{tp.l}</span><span className="text-emerald-500 font-mono">{tp.r}</span>
                </button>
              ))}
            </div>
            <button onClick={()=>setTpDialog({open:false,signalId:null})} className="w-full mt-3 py-2 text-white/25 hover:text-white/50 text-sm transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      {showPricing&&<Pricing user={user} subscription={subscription} onClose={()=>setShowPricing(false)}/>}
    </div>
  );
}
