import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Pricing from './Pricing';
import PushNotifications from './PushNotifications';
import ModelosGuia from './ModelosGuia';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';
const ALLOWED = ['stpRNG', 'frxXAUUSD', '1HZ100V'];

// ─── CHART — per-timeframe aware rendering ────────────────────────────────────
const Chart = ({ candles, height, signal, timeframe='M5',
                 demandZones=[], supplyZones=[], structureData=null, m1Steps=null, chartOverlays=null }) => {
  const svgRef = useRef(null);
  const zoom   = useRef(60);
  const off    = useRef(0);
  const drag   = useRef({ active:false, startX:0, startOff:0 });

  // Per-timeframe config
  const TF_CFG = {
    M1:  { maxOB: 0, showLabels: false, labelEvery: 1, defaultZoom: 80  },
    M5:  { maxOB: 3, showLabels: true,  labelEvery: 1, defaultZoom: 60  },
    M15: { maxOB: 2, showLabels: true,  labelEvery: 2, defaultZoom: 50  },
    H1:  { maxOB: 2, showLabels: true,  labelEvery: 3, defaultZoom: 40  },
  };

  const draw = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || !candles?.length) return;
    const W = svg.parentElement?.clientWidth || 700;
    const H = height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W); svg.setAttribute('height', H);

    const cfg = TF_CFG[timeframe] || TF_CFG.M5;
    const total = candles.length;
    const z = Math.max(15, Math.min(zoom.current, total));
    const o = Math.max(0, Math.min(total - z, off.current));
    const vis = candles.slice(Math.max(0, total-z-o), total-o).slice(-z);
    if (!vis.length) return;

    const visStartIndex = Math.max(0, total-z-o);
    const P = { t:14, r:88, b:24, l:6 };
    const CH = H - P.t - P.b, CW = W - P.l - P.r;

    // Price range
    let hi = Math.max(...vis.map(c=>+c.high));
    let lo = Math.min(...vis.map(c=>+c.low));
    if (signal?.entry) {
      [signal.entry,signal.tp1,signal.tp2,signal.tp3,signal.stop].forEach(v=>{ const n=+v||0; if(n>0){hi=Math.max(hi,n);lo=Math.min(lo,n);} });
    }
    // Include ONLY visible OBs in range
    const visibleDemand = demandZones.filter(z=> { const r = z.index-visStartIndex; return r>=0&&r<vis.length; });
    const visibleSupply = supplyZones.filter(z=> { const r = z.index-visStartIndex; return r>=0&&r<vis.length; });
    [...visibleDemand,...visibleSupply].forEach(z=>{ hi=Math.max(hi,z.high||0); lo=Math.min(lo,z.low||Infinity); });
    const mg = (hi-lo)*0.1; hi+=mg; lo-=mg;
    const rng = hi-lo||0.01;
    const Y = p => P.t + CH*(1-(+p-lo)/rng);

    const n = vis.length, cW = CW/n, bW = Math.max(1.5, cW*0.62);
    let h = `<rect width="${W}" height="${H}" fill="#07080f"/>`;

    // Grid
    for (let i=0; i<=5; i++) {
      const p = lo+(rng*i)/5, y = Y(p);
      h += `<line x1="${P.l}" y1="${y|0}" x2="${W-P.r}" y2="${y|0}" stroke="#ffffff04" stroke-width="1"/>`;
      h += `<text x="${W-P.r+4}" y="${(y+3.5)|0}" fill="#1e2d3d" font-size="8" font-family="'Courier New',monospace">${p.toFixed(2)}</text>`;
    }

    // ── ORDER BLOCKS — only if TF is not M1, only visible ones ──
    if (cfg.maxOB > 0) {
      const drawOBs = (zones, isBull) => {
        zones.slice(0, cfg.maxOB).forEach(z => {
          if (!z.high || !z.low || z.high <= z.low) return;
          // Epoch-based positioning for stable OB placement
          let relIdx = -1;
          if (z.epoch) {
            const epoch = typeof z.epoch === 'number' ? z.epoch : Math.floor(z.epoch/1000);
            relIdx = vis.findIndex(cv => {
              const ce = cv.epoch || Math.floor((cv.time||0)/1000);
              return Math.abs(ce - epoch) <= 60;
            });
          }
          if (relIdx < 0 && z.index !== undefined) {
            relIdx = z.index - visStartIndex;
          }
          if (relIdx < 0 || relIdx >= vis.length) return; // not visible

          const startX = Math.max(P.l, P.l + relIdx * cW);
          const yTop = Math.max(P.t+1, Math.min(P.t+CH-1, Y(z.high)));
          const yBot = Math.max(P.t+1, Math.min(P.t+CH-1, Y(z.low)));
          const boxH = Math.max(4, Math.abs(yBot - yTop));
          const col  = isBull ? '#22c55e' : '#ef4444';
          const miti = z.mitigated;
          const endX = W - P.r;

          // Background fill
          h += `<rect x="${startX|0}" y="${yTop|0}" width="${(endX-startX)|0}" height="${boxH|0}" fill="${col}" fill-opacity="${miti?'0.04':z.strength==='STRONG'?'0.16':'0.09'}" rx="1"/>`;

          // Top border — the entry level
          h += `<line x1="${startX|0}" y1="${yTop|0}" x2="${endX}" y2="${yTop|0}" stroke="${col}" stroke-width="${z.strength==='STRONG'?1.5:1}" opacity="${miti?'0.25':'0.85'}"/>`;

          // Bottom border — SL reference (wick)
          const slY = Y(isBull ? (z.wickLow||z.low) : (z.wickHigh||z.high));
          if (Math.abs(slY - yTop) > 3) {
            h += `<line x1="${startX|0}" y1="${slY|0}" x2="${endX}" y2="${slY|0}" stroke="${col}" stroke-width="0.7" stroke-dasharray="4,4" opacity="${miti?'0.12':'0.35'}"/>`;
          }

          // Label — compact, positioned at the OB candle
          const midY = yTop + boxH/2;
          const lblText = miti ? (isBull?'OB↑✗':'OB↓✗') : (isBull?'OB↑':'OB↓');
          const lblW = miti ? 28 : 22;
          h += `<rect x="${(startX)|0}" y="${(midY-7)|0}" width="${lblW}" height="13" rx="2" fill="${col}" fill-opacity="${miti?'0.4':'0.9'}"/>`;
          h += `<text x="${(startX+lblW/2)|0}" y="${(midY+4)|0}" text-anchor="middle" fill="${miti?'#aaa':'#000'}" font-size="7" font-weight="700" font-family="monospace">${lblText}</text>`;

          // Pattern label — only on M5
          if (!miti && timeframe === 'M5' && z.pattern) {
            h += `<text x="${(startX+3)|0}" y="${(yTop-3)|0}" fill="${col}" font-size="6" font-family="monospace" opacity="0.6">${z.pattern}</text>`;
          }

          // Dot on base candle
          const cx = P.l + relIdx * cW + cW/2;
          h += `<circle cx="${cx|0}" cy="${(isBull?yBot+5:yTop-5)|0}" r="2" fill="${col}" opacity="0.8"/>`;
        });
      };
      drawOBs(visibleDemand.filter(z=>!z.mitigated).slice(0,cfg.maxOB), true);
      drawOBs(visibleSupply.filter(z=>!z.mitigated).slice(0,cfg.maxOB), false);
      // Show 1 mitigated for context (only M5)
      if (timeframe === 'M5') {
        drawOBs(visibleDemand.filter(z=>z.mitigated).slice(0,1), true);
        drawOBs(visibleSupply.filter(z=>z.mitigated).slice(0,1), false);
      }
    }

    // ── HH/HL/LH/LL STRUCTURE LABELS ──
    if (cfg.showLabels && structureData?.labels) {
      const labels = structureData.labels.filter(lb => !lb.ref);
      // Every N-th label to reduce clutter in H1
      const every = cfg.labelEvery;
      
      // Anti-overlap: track used Y positions
      const usedY = [];
      const isYFree = (y) => usedY.every(uy => Math.abs(uy-y) > 16);

      labels.filter((_,i) => i % every === 0).forEach(lb => {
        // Use epoch for stable positioning — survives candle array shifts
        let relIdx = -1;
        if (lb.epoch) {
          const epoch = lb.epoch;
          relIdx = vis.findIndex(cv => {
            const ce = cv.epoch || Math.floor((cv.time||0)/1000);
            return Math.abs(ce - epoch) <= 60; // within 1 min
          });
        }
        if (relIdx < 0 && lb.index !== undefined) {
          relIdx = lb.index - visStartIndex; // fallback to index
        }
        if (relIdx < 0 || relIdx >= vis.length) return;

        const x = P.l + relIdx * cW + cW/2;
        const isBull = lb.type === 'HH' || lb.type === 'HL';
        const col = isBull ? '#22c55e' : '#ef4444';

        // Position: HH/LH above candle, HL/LL below candle
        const isAbove = lb.type === 'HH' || lb.type === 'LH';
        let y = isAbove ? Y(lb.price) - 14 : Y(lb.price) + 18;
        y = Math.max(P.t+6, Math.min(P.t+CH-6, y));

        if (!isYFree(y)) return; // skip overlapping label
        usedY.push(y);

        // Label box
        h += `<rect x="${(x-11)|0}" y="${(y-9)|0}" width="22" height="12" rx="2" fill="${col}" fill-opacity="0.88"/>`;
        h += `<text x="${x|0}" y="${y|0}" text-anchor="middle" fill="#000" font-size="7.5" font-weight="800" font-family="monospace">${lb.type}</text>`;

        // Connecting dot on candle
        const dotY = isAbove ? Y(lb.price)-2 : Y(lb.price)+2;
        const dotClamped = Math.max(P.t+2, Math.min(P.t+CH-2, dotY));
        h += `<circle cx="${x|0}" cy="${dotClamped|0}" r="2" fill="${col}" opacity="0.7"/>`;
      });
    }

    // ── M1 STEPS BAR — only in M1 view ──
    if (timeframe === 'M1' && m1Steps) {
      const steps = [
        { label:'H1',   ok: m1Steps.h1ok,   col:'#f59e0b' },
        { label:'M15',  ok: m1Steps.m15ok,  col:'#f59e0b' },
        { label:'M5',   ok: m1Steps.m5ok,   col:'#f59e0b' },
        { label:'Zona', ok: m1Steps.zoneok, col:'#3b82f6' },
        { label:'M1',   ok: m1Steps.m1conf, col:'#22c55e' },
      ];
      const barW = 200, barH = 20, barX = W - P.r - barW - 4, barY = P.t + 2;
      h += `<rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="5" fill="#0c0c18" fill-opacity="0.92"/>`;
      const stepW = barW / steps.length;
      steps.forEach((s, i) => {
        const sx = barX + i * stepW + stepW/2;
        h += `<text x="${sx|0}" y="${(barY+13)|0}" text-anchor="middle" fill="${s.ok?s.col:'#2d3a4a'}" font-size="8" font-weight="700" font-family="monospace">${s.label}${s.ok?'✓':'○'}</text>`;
      });
      // Progress bar
      const ready = steps.filter(s=>s.ok).length;
      const progW = (ready/steps.length) * barW;
      const progCol = ready===5?'#22c55e':ready>=3?'#f59e0b':'#374151';
      h += `<rect x="${barX}" y="${barY+barH-3}" width="${progW|0}" height="3" rx="1.5" fill="${progCol}" opacity="0.7"/>`;
    }


    // ── CHoCH / BOS / Liquidity OVERLAY LINES ──
    // Professional short horizontal lines at the break level
    if (chartOverlays && timeframe !== 'M1') {
      const drawOverlayLine = (ov, label, col, dash='') => {
        if (!ov?.level) return;
        const y = Math.max(P.t+8, Math.min(P.t+CH-8, Y(ov.level)));

        // Find X position by epoch
        let lineStartX = P.l;
        if (ov.epoch) {
          const idx = vis.findIndex(cv => {
            const ce = cv.epoch || Math.floor((cv.time||0)/1000);
            return Math.abs(ce - ov.epoch) <= 120;
          });
          if (idx >= 0) lineStartX = P.l + idx * cW;
        }

        // Full-width dashed line at the level
        const lineCol = col;
        h += `<line x1="${lineStartX|0}" y1="${y|0}" x2="${W-P.r-2}" y2="${y|0}" stroke="${lineCol}" stroke-width="1.2" ${dash?`stroke-dasharray="${dash}"`:'stroke-dasharray="6,3"'} opacity="0.75"/>`;

        // Short marker line (thicker, left side) — "short horizontal line" style
        const markerW = Math.min(60, CW * 0.12);
        h += `<line x1="${lineStartX|0}" y1="${y|0}" x2="${(lineStartX+markerW)|0}" y2="${y|0}" stroke="${lineCol}" stroke-width="2.5" opacity="0.9"/>`;

        // Label pill
        const lblW = label.length * 5.8 + 12;
        h += `<rect x="${(lineStartX+markerW+3)|0}" y="${(y-8)|0}" width="${lblW|0}" height="15" rx="3" fill="${lineCol}" fill-opacity="0.9"/>`;
        h += `<text x="${(lineStartX+markerW+3+lblW/2)|0}" y="${(y+4)|0}" text-anchor="middle" fill="#000" font-size="7.5" font-weight="800" font-family="monospace">${label}</text>`;

        // Small triangle arrow indicating direction
        const isBull = label.includes('↑') || label.includes('BULL');
        const triX = lineStartX + markerW + lblW + 8;
        const triSize = 5;
        if (isBull) {
          h += `<polygon points="${triX},${y+triSize} ${triX+triSize*1.5},${y+triSize} ${triX+triSize*0.75},${y-triSize}" fill="${lineCol}" opacity="0.7"/>`;
        } else {
          h += `<polygon points="${triX},${y-triSize} ${triX+triSize*1.5},${y-triSize} ${triX+triSize*0.75},${y+triSize}" fill="${lineCol}" opacity="0.7"/>`;
        }
      };

      // CHoCH — Change of Character (trend reversal signal)
      if (chartOverlays.choch) {
        const co = chartOverlays.choch;
        const isBull = co.side === 'BUY';
        const label = isBull ? 'CHoCH↑' : 'CHoCH↓';
        const col   = isBull ? '#22c55e' : '#ef4444';
        drawOverlayLine(co, label, col);
      }

      // BOS — Break of Structure (continuation signal)
      if (chartOverlays.bos) {
        const bo = chartOverlays.bos;
        const isBull = bo.side === 'BUY';
        const label = isBull ? 'BOS↑' : 'BOS↓';
        const col   = isBull ? '#34d399' : '#f87171';
        drawOverlayLine(bo, label, col, '3,3');
      }
    }

    // ── CANDLES ──
    vis.forEach((c,i) => {
      const o_=+c.open,cl=+c.close,hi_=+c.high,lo_=+c.low;
      if (!o_||!cl||hi_<lo_) return;
      const bull=cl>=o_, col=bull?'#22c55e':'#ef4444';
      const x=P.l+i*cW+cW/2;
      const bTop=Y(Math.max(o_,cl)), bBot=Y(Math.min(o_,cl)), bH=Math.max(1.5,bBot-bTop);
      h += `<line x1="${x|0}" y1="${Y(hi_)|0}" x2="${x|0}" y2="${Y(lo_)|0}" stroke="${col}" stroke-width="1" opacity="0.55"/>`;
      h += `<rect x="${(x-bW/2)|0}" y="${bTop|0}" width="${bW|0}" height="${bH|0}" fill="${col}"/>`;
    });

    // ── SIGNAL LEVELS ──
    if (signal?.entry) {
      const drawL = (price, col, lbl, lw=1.5, dash='') => {
        if (!price||+price<=0) return;
        const y=Math.max(P.t+5,Math.min(P.t+CH-5,Y(+price)));
        const x2=W-P.r;
        h+=`<line x1="${P.l}" y1="${y|0}" x2="${x2}" y2="${y|0}" stroke="${col}" stroke-width="${lw}" ${dash?`stroke-dasharray="${dash}"`:''}  opacity="0.9"/>`;
        h+=`<rect x="${x2+1}" y="${(y-8)|0}" width="${P.r-3}" height="16" rx="3" fill="${col}"/>`;
        h+=`<text x="${x2+5}" y="${(y+4)|0}" fill="#000" font-size="7.5" font-weight="700" font-family="'Courier New',monospace">${lbl} ${(+price).toFixed(2)}</text>`;
      };
      drawL(signal.stop||signal.stop_loss,'#ef4444','SL',1.2,'5,3');
      drawL(signal.tp3||signal.take_profit_3,'#059669','TP3',1.2,'4,3');
      drawL(signal.tp2||signal.take_profit_2,'#10b981','TP2',1.5,'4,3');
      drawL(signal.tp1||signal.take_profit_1,'#34d399','TP1',2);
      drawL(signal.entry,'#f59e0b','ENT',2.5);
      const isLong=['BUY','LONG'].includes(signal.direction||signal.action||signal.tipo);
      const eY=Math.max(P.t+12,Math.min(P.t+CH-12,Y(+signal.entry)));
      h+=isLong
        ?`<polygon points="${P.l+8},${eY+8} ${P.l+20},${eY} ${P.l+8},${eY-8}" fill="#22c55e" opacity="0.95"/>`
        :`<polygon points="${P.l+20},${eY+8} ${P.l+8},${eY} ${P.l+20},${eY-8}" fill="#ef4444" opacity="0.95"/>`;
    }

    // ── CURRENT PRICE ──
    const lc=+vis[vis.length-1]?.close||0;
    if (lc>0) {
      const py=Math.max(P.t+5,Math.min(P.t+CH-5,Y(lc)));
      const up=lc>=(+vis[vis.length-1]?.open||lc);
      const cc=up?'#22c55e':'#ef4444';
      h+=`<line x1="${P.l}" y1="${py|0}" x2="${W-P.r}" y2="${py|0}" stroke="${cc}" stroke-width="1" stroke-dasharray="3,4" opacity="0.35"/>`;
      h+=`<rect x="${W-P.r+1}" y="${(py-8)|0}" width="${P.r-3}" height="16" rx="3" fill="${cc}"/>`;
      h+=`<text x="${W-P.r+5}" y="${(py+4)|0}" fill="#fff" font-size="7.5" font-weight="700" font-family="'Courier New',monospace">${lc.toFixed(2)}</text>`;
    }

    // ── TIMESTAMPS ──
    const step=Math.max(1,Math.floor(n/6));
    vis.forEach((c,i)=>{
      if(i%step!==0&&i!==n-1) return;
      const x=P.l+i*cW+cW/2, ep=+(c.epoch||c.time/1000||0); if(!ep) return;
      const d=new Date(ep*1000);
      h+=`<text x="${x|0}" y="${H-P.b+13}" text-anchor="middle" fill="#1e2d3d" font-size="7.5" font-family="monospace">${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}</text>`;
    });

    svg.innerHTML = h;
  }, [candles, height, signal, timeframe, demandZones, supplyZones, structureData, m1Steps, chartOverlays]);

  useEffect(()=>{ draw(); },[draw]);
  useEffect(()=>{
    const el=svgRef.current?.parentElement; if(!el) return;
    const ro=new ResizeObserver(()=>draw()); ro.observe(el); return()=>ro.disconnect();
  },[draw]);

  const onMD=e=>{drag.current={active:true,startX:e.clientX,startOff:off.current};};
  const onMM=e=>{ if(!drag.current.active)return; const sl=(svgRef.current?.parentElement?.clientWidth||700)/zoom.current; off.current=Math.max(0,Math.min((candles?.length||0)-zoom.current,drag.current.startOff+Math.round((drag.current.startX-e.clientX)/Math.max(2,sl)))); draw(); };
  const onMU=()=>{drag.current.active=false;};
  const onWh=e=>{e.preventDefault();zoom.current=Math.max(10,Math.min(200,zoom.current+(e.deltaY>0?8:-8)));draw();};
  const onTD=e=>{drag.current={active:true,startX:e.touches[0].clientX,startOff:off.current};};
  const onTM=e=>{if(!drag.current.active)return;const sl=(svgRef.current?.parentElement?.clientWidth||700)/zoom.current;off.current=Math.max(0,Math.min((candles?.length||0)-zoom.current,drag.current.startOff+Math.round((drag.current.startX-e.touches[0].clientX)/Math.max(2,sl))));draw();};

  return (
    <div className="relative w-full select-none" style={{height,background:'#07080f'}}>
      <div className="absolute top-2 left-2 z-10 flex gap-1">
        {[{l:'+',fn:()=>{zoom.current=Math.max(10,zoom.current-15);draw();}},{l:'−',fn:()=>{zoom.current=Math.min(200,zoom.current+15);draw();}},{l:'↺',fn:()=>{zoom.current=(TF_CFG[timeframe]||TF_CFG.M5).defaultZoom;off.current=0;draw();}}].map(({l,fn})=>(
          <button key={l} onClick={fn} className="w-6 h-6 rounded bg-white/8 hover:bg-white/15 text-white/40 hover:text-white text-xs flex items-center justify-center transition-all">{l}</button>
        ))}
      </div>
      <svg ref={svgRef} style={{display:'block',width:'100%',height:'100%',cursor:'crosshair'}}
        onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU} onWheel={onWh}
        onTouchStart={onTD} onTouchMove={onTM} onTouchEnd={onMU}/>
    </div>
  );
};
// ─── DASHBOARD ────────────────────────────────────────────────────────────────
export default function Dashboard({ user, onLogout }) {
  const [data, setData]                 = useState(null);
  const [selectedAsset, setAsset]       = useState(null);
  const [section, setSection]           = useState('dashboard');
  const [sidebarOpen, setSidebar]       = useState(window.innerWidth > 900);
  const [tf, setTf]                     = useState('M5');
  const [candles, setCandles]           = useState([]);
  const [candlesH1, setCandlesH1]       = useState([]);
  const [candlesM15, setCandlesM15]     = useState([]);
  const [candlesM1, setCandlesM1]       = useState([]);
  // Per-timeframe zones and structure
  const [zonesData, setZonesData]       = useState({ m5:{d:[],s:[]}, m15:{d:[],s:[]}, h1:{d:[],s:[]} });
  const [structAll, setStructAll]       = useState({ m5:null, m15:null, h1:null });
  const [m1Steps, setM1Steps]           = useState(null);
  const [liveAnalysis, setLiveAnalysis] = useState(null); // current WAIT state + what system seeks
  const [chartOverlays, setChartOverlays] = useState(null); // CHoCH/BOS lines for chart
  const [isMobile, setMobile]           = useState(window.innerWidth < 768);
  const [showMenu, setShowMenu]         = useState(false);
  const [showPricing, setShowPricing]   = useState(false);
  const [sub, setSub]                   = useState(null);
  const [loadingSub, setLoadingSub]     = useState(true);
  const [tpDlg, setTpDlg]             = useState({open:false,id:null});
  const [refreshKey, setRefreshKey]   = useState(0); // bump to force re-fetch

  const mounted   = useRef(true);
  const firstSet  = useRef(false);

  // Reset analysis: clears all chart overlays and re-fetches immediately
  const resetAnalysis = async () => {
    // Clear local state immediately for instant visual feedback
    setZonesData({ m5:{d:[],s:[]}, m15:{d:[],s:[]}, h1:{d:[],s:[]} });
    setStructAll({ m5:null, m15:null, h1:null });
    setM1Steps(null);
    // Tell backend to clear cooldowns + recompute
    if (selectedAsset) {
      try { await fetch(`${API_URL}/api/reset/${selectedAsset}`, { method:'POST' }); } catch {}
    }
    // Bump refreshKey to trigger immediate re-fetch
    setRefreshKey(k => k + 1);
  };

  useEffect(()=>()=>{mounted.current=false;},[]);

  // Subscription
  useEffect(()=>{
    if (!user?.email&&!user?.id) return;
    (async()=>{
      try {
        const r=await fetch(`${API_URL}/api/subscription/${encodeURIComponent(user.email||user.id)}`);
        const j=await r.json();
        if(mounted.current){setSub(j.subscription);setLoadingSub(false);}
      } catch { setSub({status:'active',plan:'elite',plan_name:'Elite',days_left:3650,assets:ALLOWED}); setLoadingSub(false); }
    })();
  },[user?.id,user?.email]);

  // Resize
  useEffect(()=>{
    const h=()=>{ const m=window.innerWidth<768; setMobile(m); if(m)setSidebar(false); };
    window.addEventListener('resize',h); return()=>window.removeEventListener('resize',h);
  },[]);

  // Dashboard data — 3s polling
  useEffect(()=>{
    if(!user?.email&&!user?.id) return;
    let cancelled=false;
    const go=async()=>{
      try {
        const r=await fetch(`${API_URL}/api/dashboard/${encodeURIComponent(user.email||user.id)}`);
        const j=await r.json();
        if(!cancelled&&mounted.current){
          setData(j);
          if(!firstSet.current&&j.assets?.length){
            firstSet.current=true;
            const first=j.assets.find(a=>ALLOWED.includes(a.symbol))||j.assets[0];
            setAsset(first?.symbol);
          }
        }
      } catch {}
    };
    go(); const iv=setInterval(go,2000); return()=>{cancelled=true;clearInterval(iv);};
  },[user?.email,user?.id]);

  // Candles — 4s polling
  useEffect(()=>{
    if(!selectedAsset) return;
    let cancelled=false;
    const go=async()=>{
      try {
        const r=await fetch(`${API_URL}/api/analyze/${selectedAsset}`);
        const j=await r.json();
        if(!cancelled&&mounted.current){
          if(j.candles?.length)    setCandles(j.candles);
          if(j.candlesH1?.length)  setCandlesH1(j.candlesH1);
          if(j.candlesM15?.length) setCandlesM15(j.candlesM15);
          if(j.candlesM1?.length)  setCandlesM1(j.candlesM1);
          // Store all TF zones and structure for switching
          setZonesData({
            m5:  { d: j.demandZones    || [], s: j.supplyZones    || [] },
            m15: { d: j.demandZonesM15 || [], s: j.supplyZonesM15 || [] },
            h1:  { d: j.demandZonesH1  || [], s: j.supplyZonesH1  || [] },
          });
          setStructAll({
            m5:  j.structureM5Data  || null,
            m15: j.structureM15Data || null,
            h1:  j.structureH1Data  || null,
          });
          if(j.m1Steps) setM1Steps(j.m1Steps);
          if(j.chartOverlays) setChartOverlays(j.chartOverlays);
          // Live analysis: what is the system currently waiting for
          if(j.signal) setLiveAnalysis({
            action:   j.signal.action,
            model:    j.signal.model,
            reason:   j.signal.reason,
            score:    j.signal.score,
            structM5:  j.structureM5,
            structM15: j.structureM15,
            structH1:  j.structureH1,
            pd:        j.premiumDiscount,
            demandCount: (j.demandZones||[]).filter(z=>!z.mitigated).length,
            supplyCount: (j.supplyZones||[]).filter(z=>!z.mitigated).length,
            ls: j.liveState || {},
            m1: j.m1Steps   || null,
            ts: Date.now()
          });
        }
      } catch {}
    };
    go(); const iv=setInterval(go,2000); return()=>{cancelled=true;clearInterval(iv);};
  },[selectedAsset, refreshKey]);

  // Mark signal
  const markSignal=async(id,status)=>{
    if(status==='WIN'){setTpDlg({open:true,id}); return;}
    try{ await fetch(`${API_URL}/api/signals/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,userId:user?.email||user?.id,tpHit:null})}); }catch{}
  };
  const confirmWin=async(tpHit)=>{
    if(tpDlg.id){
      try{ await fetch(`${API_URL}/api/signals/${tpDlg.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'WIN',userId:user?.email||user?.id,tpHit})}); }catch{}
      setTpDlg({open:false,id:null});
    }
  };

  // Computed
  const pending     = useMemo(()=>(data?.recentSignals||[]).filter(s=>s.status==='PENDING'&&ALLOWED.includes(s.symbol)),[data?.recentSignals]);
  const closed      = useMemo(()=>(data?.recentSignals||[]).filter(s=>s.status!=='PENDING'&&ALLOWED.includes(s.symbol)),[data?.recentSignals]);
  const assets      = useMemo(()=>(data?.assets||[]).filter(a=>ALLOWED.includes(a.symbol)),[data?.assets]);
  const asset       = useMemo(()=>assets.find(a=>a.symbol===selectedAsset),[assets,selectedAsset]);
  const signal      = asset?.lockedSignal;
  const isLong      = signal ? ['BUY','LONG'].includes(signal.action) : false;
  const isExpired   = sub?.status==='expired';

  const currentCandles = tf==='H1'?candlesH1:tf==='M15'?candlesM15:tf==='M1'?candlesM1:candles;

  const stats = useMemo(()=>{
    const all=closed; const w=all.filter(s=>s.status==='WIN').length, l=all.filter(s=>s.status==='LOSS').length, t=w+l;
    return {w,l,t,p:pending.length,wr:t>0?Math.round(w/t*100):0,
      tp1:all.filter(s=>s.tpHit===1).length,tp2:all.filter(s=>s.tpHit===2).length,tp3:all.filter(s=>s.tpHit===3).length};
  },[closed,pending.length]);

  // Structure badge helper
  const structBadge=(label,val)=>(
    <span key={label} className={`text-[9px] px-1.5 py-0.5 rounded font-semibold border
      ${val==='BULLISH'?'bg-emerald-500/12 text-emerald-400 border-emerald-500/25':
        val==='BEARISH'?'bg-red-500/12 text-red-400 border-red-500/25':
        'bg-white/5 text-white/25 border-white/8'}`}>
      {label}: {val||'…'}
    </span>
  );

  // ── SIDEBAR ─────────────────────────────────────────────────────────────────
  const Sidebar=()=>(
    <>
      {isMobile&&sidebarOpen&&<div className="fixed inset-0 bg-black/60 z-40" onClick={()=>setSidebar(false)}/>}
      <aside className={`fixed left-0 top-0 h-full bg-[#060710] border-r border-white/[0.05] z-50 flex flex-col transition-all duration-200 ${sidebarOpen?(isMobile?'w-56':'w-52'):'w-0 overflow-hidden'}`}>

        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.05] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-black font-bold text-sm">T</div>
            <span className="font-bold text-sm text-white">TradingPro</span>
          </div>
          <button onClick={()=>setSidebar(false)} className="w-7 h-7 rounded-lg hover:bg-white/8 flex items-center justify-center text-white/25 hover:text-white/60 transition-colors text-sm">✕</button>
        </div>

        {/* Plan */}
        <div className="px-4 py-2.5 border-b border-white/[0.05] flex-shrink-0 flex items-center justify-between">
          <span className={`text-[9px] font-bold px-2 py-1 rounded-md tracking-widest uppercase ${sub?.status==='trial'?'bg-amber-500/15 text-amber-400 border border-amber-500/25':sub?.status==='expired'?'bg-red-500/15 text-red-400 border border-red-500/25':'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'}`}>
            {sub?.status==='trial'?'FREE':sub?.status==='expired'?'EXPIRADO':sub?.plan_name?.toUpperCase()||'ELITE'}
          </span>
          {sub?.days_left!==undefined&&sub?.status!=='expired'&&(
            <span className={`text-[10px] font-mono ${sub.days_left<=5?'text-red-400':'text-white/25'}`}>{sub.days_left}d</span>
          )}
        </div>

        {/* Nav */}
        <nav className="p-2.5 space-y-0.5 border-b border-white/[0.05] flex-shrink-0">
          {[{id:'dashboard',icon:'▦',label:'Dashboard'},{id:'signals',icon:'◎',label:'Señales',badge:pending.length},{id:'stats',icon:'◈',label:'Stats'},{id:'history',icon:'≡',label:'Historial'},{id:'modelos',icon:'◉',label:'Modelos'}].map(it=>(
            <button key={it.id} onClick={()=>{setSection(it.id);if(isMobile)setSidebar(false);}}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-xs font-medium ${section===it.id?'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20':'text-white/35 hover:text-white/65 hover:bg-white/5 border border-transparent'}`}>
              <span className="w-4 text-center text-sm leading-none">{it.icon}</span>
              <span>{it.label}</span>
              {it.badge>0&&<span className="ml-auto px-1.5 py-0.5 text-[8px] font-bold bg-emerald-500 text-black rounded-full">{it.badge}</span>}
            </button>
          ))}
        </nav>

        {/* Markets */}
        <div className="flex-1 overflow-hidden flex flex-col p-2.5">
          <p className="text-[8px] uppercase tracking-widest text-white/20 font-bold mb-2 px-1">Mercados</p>
          <div className="space-y-1 overflow-y-auto flex-1">
            {assets.map(a=>(
              <button key={a.symbol} onClick={()=>{setAsset(a.symbol);if(isMobile)setSidebar(false);}}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all ${selectedAsset===a.symbol?'bg-white/10 border border-white/12':'text-white/35 hover:text-white/60 hover:bg-white/5 border border-transparent'}`}>
                <span className="text-lg">{a.emoji}</span>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-[11px] font-semibold text-white leading-tight truncate">{a.shortName}</p>
                  <p className="text-[9px] text-white/25 leading-tight truncate">{a.name}</p>
                </div>
                {a.lockedSignal&&(
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${a.lockedSignal.action==='LONG'?'bg-emerald-500/20 text-emerald-400':'bg-red-500/20 text-red-400'}`}>{a.lockedSignal.action}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-white/[0.05] p-2.5 space-y-1.5">
          {sub?.plan!=='elite'&&sub?.status!=='elite'&&(
            <button onClick={()=>setShowPricing(true)} className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 text-white text-xs font-bold rounded-lg">⚡ Upgrade</button>
          )}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${data?.connected?'bg-emerald-400 shadow-sm shadow-emerald-400/60':'bg-red-400'}`}/>
              <span className="text-[9px] text-white/25">{data?.connected?'Online':'Offline'}</span>
            </div>
            <button onClick={()=>{setSection('download');if(isMobile)setSidebar(false);}} className="text-[9px] text-white/20 hover:text-white/45 px-2 py-1 rounded hover:bg-white/5 transition-colors">📱 App</button>
          </div>
        </div>
      </aside>
    </>
  );

  // ── HEADER ──────────────────────────────────────────────────────────────────
  const Header=()=>(
    <header className="h-14 bg-[#060710]/90 backdrop-blur border-b border-white/[0.05] flex items-center justify-between px-4 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {!sidebarOpen&&(
          <button onClick={()=>setSidebar(true)} className="w-8 h-8 rounded-lg hover:bg-white/8 flex items-center justify-center text-white/35 hover:text-white transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
        )}
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white capitalize">{section}</h2>
          <span className="hidden sm:inline text-[9px] px-2 py-0.5 bg-purple-500/12 text-purple-400 border border-purple-500/20 rounded-md font-medium">6 Modelos SMC</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Timeframe selector */}
        <div className="flex bg-white/6 border border-white/10 rounded-lg p-0.5 gap-0.5">
          {['M1','M5','M15','H1'].map(t=>(
            <button key={t} onClick={()=>setTf(t)}
              className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${tf===t?'bg-emerald-500 text-black shadow-sm':'text-white/35 hover:text-white/70'}`}>{t}</button>
          ))}
        </div>

        {/* Plan indicator */}
        {sub?.plan&&sub?.status!=='trial'&&sub?.status!=='expired'&&(
          <span className="hidden sm:flex items-center gap-1 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-[10px] font-semibold">✓ {sub.plan_name}</span>
        )}

        {/* User */}
        <div className="relative">
          <button onClick={()=>setShowMenu(!showMenu)} className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-black font-bold text-sm shadow-md">
            {user?.email?.[0]?.toUpperCase()||'U'}
          </button>
          {showMenu&&(
            <div className="absolute right-0 mt-2 w-52 bg-[#0c0c18] rounded-xl border border-white/10 shadow-2xl py-2">
              <div className="px-3 py-2 border-b border-white/8">
                <p className="text-white text-xs font-medium truncate">{user?.email}</p>
                <p className="text-white/30 text-[10px]">{sub?.plan_name||'Elite'}</p>
              </div>
              <button onClick={onLogout} className="w-full px-3 py-2 text-left text-red-400 text-xs hover:bg-white/5 transition-colors">Cerrar sesión</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );

  // ── DASHBOARD SECTION ────────────────────────────────────────────────────────
  const DashSection=()=>(
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[{l:'Win Rate',v:`${stats.wr}%`,c:'text-white',s:stats.t>0?`${stats.t} ops`:'Sin ops'},
          {l:'Activas', v:stats.p,        c:'text-cyan-400',s:'En curso'},
          {l:'Wins',    v:stats.w,        c:'text-emerald-400',s:'Ganadoras'},
          {l:'Loss',    v:stats.l,        c:'text-red-400',s:'Perdidas'}
        ].map(s=>(
          <div key={s.l} className="bg-[#0c0c18] rounded-xl p-3 border border-white/[0.05]">
            <p className="text-white/25 text-[8px] uppercase tracking-widest mb-1">{s.l}</p>
            <p className={`text-2xl font-bold font-mono ${s.c}`}>{s.v}</p>
            <p className="text-white/20 text-[8px] mt-0.5">{s.s}</p>
          </div>
        ))}
      </div>

      {/* Chart card */}
      <div className="bg-[#0c0c18] rounded-xl border border-white/[0.05] overflow-hidden">
        {/* Chart header */}
        <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{asset?.emoji}</span>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-white font-semibold text-sm">{asset?.name||'Selecciona un activo'}</h3>
                {signal&&(
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${isLong?'bg-emerald-500/15 text-emerald-400 border-emerald-500/30':'bg-red-500/15 text-red-400 border-red-500/30'}`}>
                    {signal.action}
                  </span>
                )}
              </div>
              {/* Triple confluencia badges + reset */}
              <div className="flex items-center gap-1.5">
                {structBadge('M5', asset?.structureM5)}
                {structBadge('M15', asset?.structureM15)}
                {structBadge('H1', asset?.structureH1)}
                <button onClick={resetAnalysis}
                  title="Recargar análisis (OBs + estructura)"
                  className="ml-1 w-6 h-5 flex items-center justify-center rounded bg-white/6 hover:bg-white/15 text-white/30 hover:text-white/80 transition-all text-[10px]">
                  ⟳
                </button>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-white font-mono tracking-tight">{asset?.price?.toFixed(asset?.decimals||2)||'---'}</p>
            <p className="text-[9px] text-white/20 mt-0.5">{tf} · {currentCandles.length} velas</p>
          </div>
        </div>

        {/* Chart — tall */}
        <Chart candles={currentCandles} height={isMobile?240:420} signal={signal}
          timeframe={tf}
          demandZones={tf==='M1'?[]: tf==='H1'?zonesData.h1.d : tf==='M15'?zonesData.m15.d : zonesData.m5.d}
          supplyZones={tf==='M1'?[]: tf==='H1'?zonesData.h1.s : tf==='M15'?zonesData.m15.s : zonesData.m5.s}
          structureData={tf==='M1'?null : tf==='H1'?structAll.h1 : tf==='M15'?structAll.m15 : structAll.m5}
          chartOverlays={chartOverlays}
          m1Steps={tf==='M1'?m1Steps:null}/>
      </div>

      {/* ── STRUCTURE ALERT BANNER ── */}
      {signal?.structureAlert&&(
        <div className={`rounded-xl p-3.5 border flex items-start gap-3 ${signal.structureAlert.level==='CRITICAL'?'bg-red-500/10 border-red-500/40':'bg-amber-500/10 border-amber-500/30'}`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-lg ${signal.structureAlert.level==='CRITICAL'?'bg-red-500/20':'bg-amber-500/20'}`}>
            {signal.structureAlert.level==='CRITICAL'?'🚨':'⚠️'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-bold ${signal.structureAlert.level==='CRITICAL'?'text-red-400':'text-amber-400'}`}>
                {signal.structureAlert.level==='CRITICAL'?'CIERRE RECOMENDADO':'VIGILAR POSICIÓN'}
              </span>
              <span className="text-white/20 text-[9px]">hace {Math.round((Date.now()-signal.structureAlert.ts)/60000)} min</span>
            </div>
            <p className={`text-xs leading-relaxed ${signal.structureAlert.level==='CRITICAL'?'text-red-300':'text-amber-300'}`}>
              {signal.structureAlert.msg}
            </p>
            <div className="flex gap-3 mt-1.5">
              <span className="text-[9px] text-white/30">M5: <span className={signal.structureAlert.m5==='BULLISH'?'text-emerald-400':signal.structureAlert.m5==='BEARISH'?'text-red-400':'text-white/40'}>{signal.structureAlert.m5||'…'}</span></span>
              <span className="text-[9px] text-white/30">M15: <span className={signal.structureAlert.m15==='BULLISH'?'text-emerald-400':signal.structureAlert.m15==='BEARISH'?'text-red-400':'text-white/40'}>{signal.structureAlert.m15||'…'}</span></span>
              {signal.structureAlert.lossUsed>0&&<span className="text-[9px] text-white/30">SL usado: <span className="text-red-400">{signal.structureAlert.lossUsed}%</span></span>}
            </div>
          </div>
          {signal.structureAlert.level==='CRITICAL'&&(
            <button onClick={()=>markSignal(signal.id,'LOSS')}
              className="flex-shrink-0 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/35 text-red-400 text-xs font-bold rounded-lg transition-all border border-red-500/30 active:scale-95">
              Cerrar
            </button>
          )}
        </div>
      )}

      {/* Active signal panel */}
      {signal&&(
        <div className={`rounded-xl overflow-hidden border ${isLong?'border-emerald-500/20':'border-red-500/20'}`}>
          {/* Signal header */}
          <div className={`px-4 py-3 flex items-center justify-between ${isLong?'bg-emerald-500/7':'bg-red-500/7'}`}>
            <div className="flex items-center gap-2.5">
              <span className={`px-3 py-1 rounded-lg text-sm font-bold ${isLong?'bg-emerald-500 text-black':'bg-red-500 text-white'}`}>{signal.action}</span>
              <div>
                <span className="text-white/40 text-xs font-mono">{signal.model}</span>
                {signal.model==='M1_PRECISION'&&<span className="ml-2 text-[9px] text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded">Triple MTF</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full animate-pulse ${isLong?'bg-emerald-400':'bg-red-400'}`}/>
              <span className="text-2xl font-bold text-white font-mono">{signal.score}%</span>
            </div>
          </div>

          {/* Levels + Copy */}
          <div className="bg-[#0c0c18]">
            {/* Copy all button */}
            <div className="flex justify-end px-3 pt-2">
              <button onClick={()=>{
                const dec = asset?.decimals||2;
                const txt = [
                  `📊 ${asset?.name} ${signal.action} ${signal.score}%`,
                  `▶ Entry: ${(+(signal.entry||0)).toFixed(dec)}`,
                  `✅ TP1:   ${(+(signal.tp1||signal.take_profit_1||0)).toFixed(dec)}`,
                  `✅ TP2:   ${(+(signal.tp2||signal.take_profit_2||0)).toFixed(dec)}`,
                  `✅ TP3:   ${(+(signal.tp3||signal.take_profit_3||0)).toFixed(dec)}`,
                  `🛑 SL:    ${(+(signal.stop||signal.stop_loss||0)).toFixed(dec)}`,
                ].join('\n');
                navigator.clipboard.writeText(txt).catch(()=>{});
                const el = document.getElementById('copy-all-btn');
                if(el){el.textContent='✓ Copiado';setTimeout(()=>{el.textContent='⎘ Copiar todo';},2000);}
              }}
                id="copy-all-btn"
                className="text-[9px] text-white/25 hover:text-white/60 px-2 py-1 bg-white/4 hover:bg-white/8 rounded-md transition-all flex items-center gap-1">
                ⎘ Copiar todo
              </button>
            </div>

            <div className="grid grid-cols-5">
              {[{l:'Entry',v:signal.entry,                          bg:'bg-white/4',        tc:'text-white',     bc:'border-white/8'},
                {l:'TP1',  v:signal.tp1||signal.take_profit_1,      bg:'bg-emerald-500/7',  tc:'text-emerald-400',bc:'border-emerald-500/15'},
                {l:'TP2',  v:signal.tp2||signal.take_profit_2,      bg:'bg-emerald-500/10', tc:'text-emerald-400',bc:'border-emerald-500/20'},
                {l:'TP3',  v:signal.tp3||signal.take_profit_3,      bg:'bg-emerald-500/13', tc:'text-emerald-400',bc:'border-emerald-500/25'},
                {l:'SL',   v:signal.stop||signal.stop_loss,         bg:'bg-red-500/7',      tc:'text-red-400',   bc:'border-red-500/15'},
              ].map((it,i)=>{
                const val = (+(it.v||0)).toFixed(asset?.decimals||2);
                const [copied, setCopied] = React.useState(false);
                const copy = ()=>{
                  navigator.clipboard.writeText(val).catch(()=>{});
                  setCopied(true); setTimeout(()=>setCopied(false), 1800);
                };
                return (
                  <div key={i} className={`${it.bg} border-r last:border-r-0 ${it.bc} p-2.5 pb-3 text-center relative group cursor-pointer`} onClick={copy}>
                    <p className={`text-[8px] uppercase tracking-widest mb-1.5 ${it.tc} opacity-50`}>{it.l}</p>
                    <p className={`text-xs font-bold font-mono ${it.tc}`}>{val}</p>
                    <div className={`absolute inset-0 flex items-center justify-center rounded transition-all ${copied?'opacity-100':'opacity-0 group-hover:opacity-100'}`}>
                      <span className={`text-[9px] font-bold px-2 py-1 rounded-md ${copied?'bg-emerald-500 text-black':'bg-black/60 text-white/60'}`}>
                        {copied?'✓':'⎘'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Win/Loss */}
          <div className="grid grid-cols-2 border-t border-white/[0.05]">
            <button onClick={()=>markSignal(signal.id,'WIN')}
              className="py-4 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold text-sm transition-all flex items-center justify-center gap-2 border-r border-white/[0.05] active:scale-95">
              <span className="text-lg">✓</span> Win
            </button>
            <button onClick={()=>markSignal(signal.id,'LOSS')}
              className="py-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-95">
              <span className="text-lg">✗</span> Loss
            </button>
          </div>
        </div>
      )}

      {/* ── SMC LIVE ANALYSIS PANEL ── */}
      {liveAnalysis&&(()=>{
        const la = liveAnalysis;
        const ls = la.ls || {};
        const m1 = la.m1 || null;
        const isWait = ['WAIT','LOADING','COOLDOWN'].includes(la.action);
        const isLive = la.action==='LONG'||la.action==='SHORT';
        const opDir  = la.structH1==='BULLISH'?'LONG':la.structH1==='BEARISH'?'SHORT':null;
        const opBull = opDir==='LONG';

        // ── Per-TF structure badges
        const TFBadge = ({tf,trend})=>{
          const bull=trend==='BULLISH',bear=trend==='BEARISH';
          return (
            <div className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg border ${bull?'bg-emerald-500/10 border-emerald-500/25':bear?'bg-red-500/10 border-red-500/25':'bg-white/4 border-white/8'}`}>
              <span className="text-[8px] text-white/30 font-semibold">{tf}</span>
              <span className={`text-[9px] font-bold mt-0.5 ${bull?'text-emerald-400':bear?'text-red-400':'text-white/25'}`}>
                {bull?'▲':bear?'▼':'—'}
              </span>
            </div>
          );
        };

        // ── Step checker: returns {ok, label, detail}
        const h1ok   = la.structH1!=='NEUTRAL'&&la.structH1!=='LOADING';
        const m15ok  = la.structM15!=='NEUTRAL'&&la.structM15!=='LOADING';
        const align  = h1ok&&m15ok&&la.structH1===la.structM15;
        const m5ok   = la.structM5!=='NEUTRAL'&&la.structM5!=='LOADING';
        const triOk  = align&&m5ok&&la.structM5===la.structH1;
        const obDemOk= ls.demandM5>0||ls.demandM15>0;
        const obSupOk= ls.supplyM5>0||ls.supplyM15>0;
        const obOk   = opBull?obDemOk:obSupOk;
        const pdOk   = (opBull&&la.pd==='DISCOUNT')||(!opBull&&la.pd==='PREMIUM');
        const chochOk= ls.hasChoch&&ls.chochSide===(opBull?'BUY':'SELL');
        const pullOk = ls.hasPullback&&ls.pullbackSide===(opBull?'BUY':'SELL');
        const m1cOk  = m1?.m1conf||false;

        // ── Model-specific step list
        const modelSteps = {
          MTF_CONFLUENCE: [
            { ok: h1ok,   label:'H1 con tendencia', detail: la.structH1 },
            { ok: m15ok,  label:'M15 alineado con H1', detail: la.structM15 },
            { ok: align,  label:'H1 = M15 misma dirección', detail: align?'✓ Alineados':`${la.structH1} ≠ ${la.structM15}` },
            { ok: obOk,   label:`OBs ${opBull?'demanda':'oferta'} activos`, detail: opBull?`${ls.demandM5} M5 · ${ls.demandM15} M15`:`${ls.supplyM5} M5 · ${ls.supplyM15} M15` },
            { ok: pullOk, label:'Precio toca el Order Block', detail: pullOk?`OB tocado · ${ls.pullbackConf||'—'}`:'Esperando retroceso al OB' },
            { ok: pdOk,   label:`Zona ${opBull?'Discount (compras)':'Premium (ventas)'}`, detail: la.pd, bonus:true },
          ],
          CHOCH_PULLBACK: [
            { ok: h1ok,    label:'H1 con tendencia definida', detail: la.structH1 },
            { ok: m15ok,   label:'M15 no en contra', detail: la.structM15 },
            { ok: chochOk, label:`CHoCH ${opBull?'alcista':'bajista'} detectado`, detail: ls.hasChoch?`${ls.chochType}`:'Sin CHoCH aún' },
            { ok: obOk,    label:'Order Block formado en el CHoCH', detail: obOk?`${opBull?ls.demandM5:ls.supplyM5} OBs activos`:'Sin OB en zona' },
            { ok: pullOk,  label:'Pullback al OB + confirmación', detail: pullOk?`Confirmado: ${ls.pullbackConf||'—'}`:'Esperando retroceso' },
            { ok: ls.mtfConfluence, label:'MTF Confluencia (bonus +5)', detail: ls.mtfConfluence?'M5+H1 alineados':'—', bonus:true },
          ],
          LIQUIDITY_GRAB: [
            { ok: h1ok,  label:'H1 no opuesto a la dirección', detail: la.structH1 },
            { ok: m15ok, label:'M15 no opuesto a la dirección', detail: la.structM15 },
            { ok: ls.hasChoch||ls.hasBos, label:'Barrido de nivel + rechazo en M5', detail: ls.hasChoch?`CHoCH: ${ls.chochType}`:(ls.hasBos?`BOS: ${ls.bosSide}`:'Sin barrido detectado') },
            { ok: pullOk, label:'Vela de reversión fuerte', detail: pullOk?`Rechazo ${ls.pullbackConf}`:'Esperando vela de rechazo' },
            { ok: pdOk,   label:`Precio en ${opBull?'Discount':'Premium'}`, detail: la.pd, bonus:true },
          ],
          BOS_CONTINUATION: [
            { ok: h1ok,  label:'H1 define tendencia', detail: la.structH1 },
            { ok: m15ok, label:'M15 alineado', detail: la.structM15 },
            { ok: ls.hasBos, label:`BOS ${opBull?'alcista':'bajista'} confirmado`, detail: ls.hasBos?`BOS: ${ls.bosSide}`:'Sin ruptura de estructura' },
            { ok: obOk,  label:'OB en zona del BOS', detail: obOk?`${opBull?ls.demandM5:ls.supplyM5} OBs`:'Sin OB' },
            { ok: pullOk,label:'Pullback al nivel del BOS', detail: pullOk?`Confirmado`:'Esperando pullback' },
            { ok: pdOk,  label:`${opBull?'Discount':'Premium'} (bonus)`, detail: la.pd, bonus:true },
          ],
          OTE_ENTRY: [
            { ok: h1ok,    label:'H1 con impulso claro', detail: la.structH1 },
            { ok: m15ok,   label:'M15 alineado', detail: la.structM15 },
            { ok: ls.hasBos||ls.hasChoch, label:'BOS/CHoCH confirmado (impulso)', detail: ls.hasBos?`BOS ${ls.bosSide}`:(ls.hasChoch?`CHoCH ${ls.chochSide}`:'Sin impulso') },
            { ok: obOk,    label:'OB en zona Fibonacci 62-79%', detail: obOk?'OBs en zona OTE':'Sin OB en retroceso' },
            { ok: pullOk,  label:'Precio retrocede a zona OTE', detail: pullOk?`OB tocado · ${ls.pullbackConf}`:'Esperando retroceso OTE' },
          ],
          FVG_ENTRY: [
            { ok: h1ok,    label:'H1 define tendencia', detail: la.structH1 },
            { ok: m15ok,   label:'M15 no en contra', detail: la.structM15 },
            { ok: ls.hasBos||ls.hasChoch, label:'Impulso con desequilibrio (FVG)', detail: ls.hasBos?`BOS ${ls.bosSide}`:'Detectando FVG' },
            { ok: obOk,    label:'FVG / OB en zona', detail: obOk?`${opBull?ls.demandM5:ls.supplyM5} zonas activas`:'Sin desequilibrio' },
            { ok: pullOk,  label:'Precio llena el FVG', detail: pullOk?`FVG: ${ls.pullbackConf}`:'Esperando retorno al gap' },
          ],
          M1_PRECISION: [
            { ok: h1ok,    label:'H1 define dirección', detail: la.structH1 },
            { ok: m15ok&&la.structM15===la.structH1, label:'M15 = H1 misma dirección', detail: m15ok&&la.structM15===la.structH1?'Alineados':`${la.structM15} ≠ ${la.structH1}` },
            { ok: triOk,   label:'M5 = M15 = H1 triple confluencia', detail: triOk?'Triple alineación confirmada':`M5: ${la.structM5}` },
            { ok: obOk,    label:'Zona de interés M15', detail: obOk?`${la.pd}`:'Buscando OB en M15' },
            { ok: m1cOk,   label:'Confirmación en M1 (CHoCH/OB/Wick)', detail: m1?.m1conf?'M1 confirma entrada':'Esperando patrón M1' },
          ],
          INDUCEMENT: [
            { ok: h1ok,  label:'H1 define dirección', detail: la.structH1 },
            { ok: m15ok&&la.structM15===la.structH1, label:'M15 = H1', detail: m15ok&&la.structM15===la.structH1?'Alineados':la.structM15 },
            { ok: ls.hasChoch||ls.hasBos, label:'Barrido de liquidez obvio', detail: ls.hasChoch?`CHoCH: ${ls.chochType}`:(ls.hasBos?`BOS: ${ls.bosSide}`:'Buscando sweep') },
            { ok: pullOk, label:'Rechazo fuerte + vela de reversión', detail: pullOk?`${ls.pullbackConf}`:'Esperando mecha de rechazo' },
            { ok: pdOk,   label:`${opBull?'Discount':'Premium'} (bonus)`, detail: la.pd, bonus:true },
          ],
        };

        const steps = modelSteps[la.model] || modelSteps.MTF_CONFLUENCE;
        const doneCount  = steps.filter(s=>s.ok&&!s.bonus).length;
        const totalReq   = steps.filter(s=>!s.bonus).length;
        const allDone    = doneCount === totalReq;
        const pct        = Math.round((doneCount/totalReq)*100);
        const progColor  = allDone?'#22c55e':pct>=60?'#f59e0b':'#ef4444';

        const modelMeta = {
          MTF_CONFLUENCE:   { label:'MTF Confluencia',  icon:'⚡' },
          CHOCH_PULLBACK:   { label:'CHoCH + Pullback', icon:'🔄' },
          LIQUIDITY_GRAB:   { label:'Liquidity Grab',   icon:'🎯' },
          BOS_CONTINUATION: { label:'BOS Continuación', icon:'📈' },
          OTE_ENTRY:        { label:'OTE Fibonacci',    icon:'📐' },
          FVG_ENTRY:        { label:'Fair Value Gap',   icon:'📊' },
          M1_PRECISION:     { label:'M1 Precisión',     icon:'🎯' },
          INDUCEMENT:       { label:'Inducement',       icon:'🪤' },
          WAIT:             { label:'Analizando',       icon:'👁' },
          COOLDOWN:         { label:'Cooldown',         icon:'⏳' },
          LOADING:          { label:'Cargando',         icon:'🔄' },
        };
        const mm = modelMeta[la.model] || modelMeta.WAIT;

        return (
          <div className="bg-[#0c0c18] rounded-xl border border-white/[0.05] overflow-hidden">

            {/* Header */}
            <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">{mm.icon}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-white/80 text-xs font-bold">{mm.label}</p>
                    {opDir&&<span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${opDir==='LONG'?'bg-emerald-500/20 text-emerald-400':'bg-red-500/20 text-red-400'}`}>Buscando {opDir}</span>}
                  </div>
                  <p className="text-white/20 text-[9px] mt-0.5">
                    {isLive?`✓ Señal activa · Score ${la.score}%`:isWait?la.reason||'Monitoreando mercado':''}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white/50 text-xs font-bold font-mono" style={{color:progColor}}>{doneCount}/{totalReq}</p>
                <p className="text-[8px] text-white/15">condiciones</p>
              </div>
            </div>

            {/* TF badges */}
            <div className="px-4 pt-3 pb-2 flex gap-2">
              <TFBadge tf="H1"  trend={la.structH1}/>
              <TFBadge tf="M15" trend={la.structM15}/>
              <TFBadge tf="M5"  trend={la.structM5}/>
              <div className="flex-1 flex items-center pl-2">
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{width:`${pct}%`,background:progColor}}/>
                </div>
              </div>
            </div>

            {/* Steps checklist */}
            <div className="px-4 pb-3 space-y-1.5">
              <p className="text-[8px] text-white/20 uppercase tracking-widest mb-2">Condiciones de activación</p>
              {steps.map((s,i)=>(
                <div key={i} className={`flex items-start gap-2.5 px-2 py-1.5 rounded-lg transition-all ${s.ok?s.bonus?'bg-emerald-500/4':'bg-emerald-500/7':'bg-white/[0.02]'}`}>
                  {/* Status icon */}
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold ${s.ok?(s.bonus?'bg-emerald-500/20 text-emerald-400':'bg-emerald-500/30 text-emerald-300'):'bg-white/6 text-white/20'}`}>
                    {s.ok?'✓':i+1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[10px] font-semibold leading-tight ${s.ok?s.bonus?'text-emerald-400/70':'text-white/70':'text-white/35'}`}>
                      {s.label}{s.bonus&&<span className="ml-1 text-[8px] text-emerald-500/60 font-normal">+bonus</span>}
                    </p>
                    <p className={`text-[9px] mt-0.5 ${s.ok?'text-white/35':'text-white/20'}`}>{s.detail||'—'}</p>
                  </div>
                  {/* Right indicator */}
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${s.ok?s.bonus?'bg-emerald-500/40':'bg-emerald-500':'bg-white/10'}`}/>
                </div>
              ))}

              {/* Bottom status */}
              {allDone&&isWait&&(
                <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-500/10 rounded-lg border border-amber-500/25">
                  <span className="text-amber-400">⚡</span>
                  <p className="text-[10px] text-amber-300/90 font-semibold">Todas las condiciones listas — esperando toque al OB</p>
                </div>
              )}
              {!allDone&&!isLive&&(
                <div className="mt-2 px-3 py-2 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                  <p className="text-[9px] text-white/25">
                    Faltan <span className="text-white/50 font-semibold">{totalReq-doneCount} condición{totalReq-doneCount>1?'es':''}</span> — el sistema sigue monitoreando
                  </p>
                </div>
              )}
              {isLive&&(
                <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-emerald-500/10 rounded-lg border border-emerald-500/25">
                  <span className="text-emerald-400 text-base">✓</span>
                  <div>
                    <p className="text-[10px] text-emerald-300/90 font-semibold">Señal activa — {la.action} · {la.score}%</p>
                    <p className="text-[9px] text-emerald-400/50">{la.reason}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Pending signals mini-list */}
      {pending.length>0&&(
        <div className="bg-[#0c0c18] rounded-xl border border-white/[0.05]">
          <div className="px-4 py-2.5 border-b border-white/[0.04] flex items-center gap-2">
            <span className="text-xs font-semibold text-white/50">Señales Activas</span>
            <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[8px] font-bold rounded-full">{pending.length}</span>
          </div>
          <div className="p-2 space-y-1">
            {pending.slice(0,4).map(s=>(
              <button key={s.id} onClick={()=>{setAsset(s.symbol);setSection('dashboard');}}
                className="w-full flex items-center justify-between px-3 py-2 bg-white/3 hover:bg-white/6 rounded-lg transition-colors">
                <div className="flex items-center gap-2">
                  <span>{s.emoji}</span>
                  <span className="text-white/65 text-xs">{s.assetName}</span>
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${s.action==='LONG'?'bg-emerald-500/20 text-emerald-400':'bg-red-500/20 text-red-400'}`}>{s.action}</span>
                  {s.model==='M1_PRECISION'&&<span className="text-[8px] text-cyan-400/70">M1</span>}
                </div>
                <span className="text-white/25 text-[10px] font-mono">{s.score}%</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ── SIGNALS SECTION ──────────────────────────────────────────────────────────
  const SigsSection=()=>(
    <div className="bg-[#0c0c18] rounded-xl border border-white/[0.05] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center gap-2">
        <span className="text-sm font-semibold text-white">Señales Activas</span>
        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full ml-1">{pending.length}</span>
      </div>
      <div className="divide-y divide-white/[0.04] max-h-[65vh] overflow-y-auto">
        {pending.length===0?(
          <div className="p-10 text-center"><p className="text-3xl mb-2">⏳</p><p className="text-white/25 text-sm">Sin señales activas</p><p className="text-white/15 text-xs mt-1">El motor analiza M1·M5·M15·H1 continuamente</p></div>
        ):pending.map(s=>{
          const long=['BUY','LONG'].includes(s.action);
          return(
            <div key={s.id} className="p-4">
              <button onClick={()=>{setAsset(s.symbol);setSection('dashboard');}} className="w-full flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{s.emoji}</span>
                  <div className="text-left">
                    <p className="text-white text-sm font-semibold">{s.assetName}</p>
                    <p className="text-white/30 text-[10px] font-mono">{s.model} · {s.score}%{s.model==='M1_PRECISION'?' · Triple MTF':''}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${long?'bg-emerald-500 text-black':'bg-red-500 text-white'}`}>{s.action}</span>
                </div>
                <span className="text-white/20 text-xs">→ ver</span>
              </button>
              <div className="flex gap-2">
                <button onClick={()=>markSignal(s.id,'WIN')} className="flex-1 py-2 bg-emerald-500/12 hover:bg-emerald-500/22 text-emerald-400 text-xs font-bold rounded-lg transition-all">✓ Win</button>
                <button onClick={()=>markSignal(s.id,'LOSS')} className="flex-1 py-2 bg-red-500/12 hover:bg-red-500/22 text-red-400 text-xs font-bold rounded-lg transition-all">✗ Loss</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── STATS SECTION ────────────────────────────────────────────────────────────
  const StatsSection=()=>(
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[{l:'Win Rate',v:`${stats.wr}%`,c:'text-emerald-400'},{l:'Total señales',v:stats.t,c:'text-white'},
          {l:'Wins',v:stats.w,c:'text-emerald-400'},{l:'Losses',v:stats.l,c:'text-red-400'}
        ].map(s=>(
          <div key={s.l} className="bg-[#0c0c18] rounded-xl p-4 border border-white/[0.05]">
            <p className="text-white/25 text-[9px] uppercase tracking-widest mb-1">{s.l}</p>
            <p className={`text-3xl font-bold font-mono ${s.c}`}>{s.v}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#0c0c18] rounded-xl p-4 border border-white/[0.05]">
        <p className="text-white/40 text-xs font-semibold mb-3">Take Profits alcanzados</p>
        <div className="grid grid-cols-3 gap-2">
          {[{l:'TP1 · 1.5R',v:stats.tp1,c:'text-emerald-400'},{l:'TP2 · 2.5R',v:stats.tp2,c:'text-cyan-400'},{l:'TP3 · 4R',v:stats.tp3,c:'text-purple-400'}].map(t=>(
            <div key={t.l} className="text-center py-3 bg-white/4 rounded-lg">
              <p className={`text-2xl font-bold font-mono ${t.c}`}>{t.v}</p>
              <p className="text-white/20 text-[9px] mt-1">{t.l}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#0c0c18] rounded-xl p-4 border border-white/[0.05]">
        <p className="text-white/40 text-xs font-semibold mb-3">Por activo</p>
        <div className="space-y-2">
          {assets.map(a=>{
            const ac=closed.filter(s=>s.symbol===a.symbol);
            const aw=ac.filter(s=>s.status==='WIN').length, at=ac.length;
            const wr=at>0?Math.round(aw/at*100):0;
            return(
              <div key={a.symbol} className="flex items-center justify-between p-2.5 bg-white/3 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{a.emoji}</span>
                  <div><p className="text-white/70 text-xs font-medium">{a.shortName}</p><p className="text-white/20 text-[9px]">{at} señales</p></div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold font-mono ${wr>=50?'text-emerald-400':at>0?'text-red-400':'text-white/30'}`}>{at>0?wr+'%':'—'}</p>
                  <p className="text-white/20 text-[9px]">{aw}W · {at-aw}L</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Motor info */}
      <div className="bg-[#0c0c18] rounded-xl p-4 border border-white/[0.05]">
        <p className="text-white/40 text-xs font-semibold mb-3">Motor de análisis</p>
        <div className="space-y-2 text-xs">
          {[
            {ico:'🧠',l:'Análisis estructural',v:'Local · SMC puro'},
            {ico:'📐',l:'Triple confluencia',v:'H1 → M15 → M5 → M1'},
            {ico:'🎯',l:'Modelos activos',v:'MTF_CONFLUENCE · CHOCH · M1_PRECISION + 9 más'},
            {ico:'🔒',l:'Score mínimo',v:'82% — sin señales débiles'},
            {ico:'⏱',l:'Cooldown post-señal',v:'15 min entre señales'},
          ].map(r=>(
            <div key={r.l} className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0">
              <span className="text-white/35 flex items-center gap-1.5"><span>{r.ico}</span>{r.l}</span>
              <span className="text-white/55 font-mono text-[10px]">{r.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── HISTORY SECTION ──────────────────────────────────────────────────────────
  const HistSection=()=>(
    <div className="bg-[#0c0c18] rounded-xl border border-white/[0.05] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Historial</span>
        <span className="text-[9px] text-white/20">Step · Oro · V100</span>
      </div>
      {closed.length===0?(
        <div className="p-10 text-center"><p className="text-3xl mb-2">📋</p><p className="text-white/25 text-sm">Sin historial aún</p></div>
      ):(
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-white/[0.02]">
              {['Activo','Dir','Modelo','Score','TP','Estado','Fecha'].map(h=>(
                <th key={h} className="p-3 text-left text-[8px] uppercase tracking-widest text-white/20 font-semibold">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.03]">
              {closed.slice(0,40).map(s=>(
                <tr key={s.id} className="hover:bg-white/[0.015] transition-colors">
                  <td className="p-3"><div className="flex items-center gap-1.5"><span>{s.emoji}</span><span className="text-white/55 text-xs">{s.assetName}</span></div></td>
                  <td className="p-3"><span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${s.action==='LONG'?'bg-emerald-500/15 text-emerald-400':'bg-red-500/15 text-red-400'}`}>{s.action}</span></td>
                  <td className="p-3 text-white/30 text-[10px] font-mono">{s.model}</td>
                  <td className="p-3 text-white/35 text-xs font-mono">{s.score}%</td>
                  <td className="p-3 text-white/30 text-[10px]">{s.tpHit?`TP${s.tpHit}`:'—'}</td>
                  <td className="p-3"><span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${s.status==='WIN'?'bg-emerald-500/15 text-emerald-400':'bg-red-500/15 text-red-400'}`}>{s.status}</span></td>
                  <td className="p-3 text-white/20 text-[9px]">{new Date(s.timestamp).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // Loading / Expired
  if(loadingSub) return(
    <div className="min-h-screen bg-[#050509] flex items-center justify-center">
      <div className="text-center"><div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3"/><p className="text-white/25 text-sm">Cargando...</p></div>
    </div>
  );

  if(isExpired) return(
    <div className="min-h-screen bg-[#050509] flex items-center justify-center p-4">
      <div className="text-center max-w-sm"><p className="text-5xl mb-4">🔒</p><h2 className="text-xl font-bold text-white mb-2">Suscripción expirada</h2><p className="text-white/35 text-sm mb-5">Activa un plan para continuar.</p><button onClick={()=>setShowPricing(true)} className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold rounded-xl">Ver Planes</button></div>
      {showPricing&&<Pricing user={user} subscription={sub} onClose={()=>setShowPricing(false)}/>}
    </div>
  );

  const ml = sidebarOpen&&!isMobile ? 'ml-52' : 'ml-0';

  return (
    <div className="min-h-screen bg-[#050509]">
      <Sidebar/>
      <main className={`${ml} transition-all duration-200 min-h-screen flex flex-col`}>
        <Header/>
        <div className="flex-1 p-3 sm:p-4 pb-20 w-full max-w-5xl mx-auto">
          {section==='dashboard' && <DashSection/>}
          {section==='signals'   && <SigsSection/>}
          {section==='stats'     && <StatsSection/>}
          {section==='history'   && <HistSection/>}
          {section==='modelos'   && <ModelosGuia/>}
          {section==='download'  && (
            <div className="space-y-3">
              <div className="bg-[#0c0c18] rounded-xl border border-white/[0.05] p-8 text-center">
                <p className="text-4xl mb-3">📲</p>
                <h2 className="text-lg font-bold text-white mb-2">Instalar TradingPro</h2>
                <p className="text-white/35 text-sm mb-5">App instalable — acceso rápido y notificaciones</p>
                <button onClick={()=>{if(window.deferredPrompt){window.deferredPrompt.prompt();}else{alert('Usa el menú de tu navegador → "Instalar app"');}}} className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold rounded-xl">Instalar App</button>
              </div>
              <PushNotifications userId={user?.id} userPlan={sub?.plan||'elite'}/>
            </div>
          )}
        </div>
      </main>

      {/* TP Dialog */}
      {tpDlg.open&&(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c0c18] rounded-2xl border border-white/10 p-6 w-full max-w-xs shadow-2xl">
            <h3 className="text-white font-bold text-base mb-1 text-center">🎯 ¿Qué TP alcanzaste?</h3>
            <p className="text-white/25 text-xs text-center mb-4">Selecciona el nivel de take profit</p>
            <div className="space-y-2">
              {[{n:1,l:'TP1',r:'+1.5R'},{n:2,l:'TP2',r:'+2.5R'},{n:3,l:'TP3',r:'+4R 🏆'}].map(tp=>(
                <button key={tp.n} onClick={()=>confirmWin(tp.n)}
                  className="w-full py-3 bg-emerald-500/12 hover:bg-emerald-500/22 text-emerald-400 rounded-xl font-bold text-sm transition-all flex justify-between px-4 active:scale-95">
                  <span>{tp.l}</span><span className="font-mono text-emerald-500">{tp.r}</span>
                </button>
              ))}
            </div>
            <button onClick={()=>setTpDlg({open:false,id:null})} className="w-full mt-3 py-2 text-white/20 hover:text-white/45 text-sm transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      {showPricing&&<Pricing user={user} subscription={sub} onClose={()=>setShowPricing(false)}/>}
    </div>
  );
}
