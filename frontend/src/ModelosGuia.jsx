import React, { useState } from 'react';

const colors = {
  bull:'#22c55e', bear:'#ef4444', neutral:'#f59e0b',
  entry:'#f59e0b', tp:'#34d399', sl:'#ef4444',
  ob:'#3b82f6', fvg:'#8b5cf6', liq:'#06b6d4',
  bg:'#07080f', grid:'#ffffff08', text:'#94a3b8',
  structOB:'#fbbf24'
};

const CandleChart = ({ candles, levels=[], arrows=[], zones=[], labels=[], chochLines=[], w=340, h=160 }) => {
  const P={t:12,r:60,b:16,l:8};
  const CW=w-P.l-P.r, CH=h-P.t-P.b;
  const allPrices=candles.flatMap(c=>[c.h,c.l]);
  levels.forEach(l=>allPrices.push(l.price));
  zones.forEach(z=>{allPrices.push(z.hi);allPrices.push(z.lo);});
  const hi=Math.max(...allPrices)*1.025;
  const lo=Math.min(...allPrices)*0.975;
  const rng=hi-lo||1;
  const Y=p=>P.t+CH*(1-(p-lo)/rng);
  const n=candles.length; const cW=CW/n; const bW=Math.max(3,cW*0.6);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{display:'block'}}>
      <rect width={w} height={h} fill={colors.bg} rx="6"/>
      {[0.25,0.5,0.75].map(f=>(
        <line key={f} x1={P.l} y1={P.t+CH*f} x2={w-P.r} y2={P.t+CH*f} stroke={colors.grid} strokeWidth="1"/>
      ))}
      {zones.map((z,i)=>(
        <g key={i}>
          <rect x={P.l} y={Y(z.hi)} width={CW} height={Math.max(2,Y(z.lo)-Y(z.hi))} fill={z.col} fillOpacity="0.15"/>
          {z.star && <rect x={P.l} y={Y(z.hi)} width={CW} height="1.5" fill={z.col} fillOpacity="0.8"/>}
          <rect x={w-P.r+2} y={Y(z.hi)-1} width={P.r-4} height="13" rx="2" fill={z.col} fillOpacity="0.9"/>
          <text x={w-P.r+5} y={Y(z.hi)+8} fill="#000" fontSize="8" fontWeight="700" fontFamily="monospace">{z.label}</text>
        </g>
      ))}
      {chochLines.map((cl,i)=>(
        <g key={i}>
          <line x1={P.l+cl.ci*cW} y1={Y(cl.price)} x2={w-P.r} y2={Y(cl.price)} stroke={cl.col} strokeWidth="1.5" strokeDasharray="6,3" opacity="0.7"/>
          <circle cx={P.l+cl.ci*cW+cW/2} cy={Y(cl.price)} r="4" fill={cl.col} opacity="0.9"/>
          <rect x={P.l+cl.ci*cW+cW/2+6} y={Y(cl.price)-8} width={cl.label.length*5.5+8} height="14" rx="3" fill={cl.col} fillOpacity="0.9"/>
          <text x={P.l+cl.ci*cW+cW/2+10} y={Y(cl.price)+4} fill="#000" fontSize="7" fontWeight="800" fontFamily="monospace">{cl.label}</text>
        </g>
      ))}
      {levels.map((l,i)=>(
        <g key={i}>
          <line x1={P.l} y1={Y(l.price)} x2={w-P.r} y2={Y(l.price)} stroke={l.col} strokeWidth={l.lw||1.5} strokeDasharray={l.dash||''} opacity="0.9"/>
          <rect x={w-P.r+2} y={Y(l.price)-7} width={P.r-4} height="14" rx="2" fill={l.col}/>
          <text x={w-P.r+5} y={Y(l.price)+4} fill="#000" fontSize="7.5" fontWeight="700" fontFamily="monospace">{l.label}</text>
        </g>
      ))}
      {candles.map((c,i)=>{
        const x=P.l+i*cW+cW/2;
        const bTop=Y(Math.max(c.o,c.c)); const bBot=Y(Math.min(c.o,c.c));
        const bH=Math.max(2,bBot-bTop); const col=c.c>=c.o?colors.bull:colors.bear;
        return (<g key={i}><line x1={x} y1={Y(c.h)} x2={x} y2={Y(c.l)} stroke={col} strokeWidth="1" opacity="0.7"/><rect x={x-bW/2} y={bTop} width={bW} height={bH} fill={col}/></g>);
      })}
      {arrows.map((a,i)=>{
        const x=P.l+a.ci*cW+cW/2; const y=Y(a.price);
        return a.dir==='up'
          ?<polygon key={i} points={`${x-6},${y+8} ${x+6},${y+8} ${x},${y-2}`} fill={a.col||colors.bull} opacity="0.95"/>
          :<polygon key={i} points={`${x-6},${y-8} ${x+6},${y-8} ${x},${y+2}`} fill={a.col||colors.bear} opacity="0.95"/>;
      })}
      {labels.map((lb,i)=>{
        const x=P.l+lb.ci*cW+cW/2;
        return (<g key={i}><rect x={x-22} y={Y(lb.price)-14} width="44" height="13" rx="2" fill={lb.col} fillOpacity="0.9"/><text x={x} y={Y(lb.price)-4} textAnchor="middle" fill="#000" fontSize="7" fontWeight="700" fontFamily="monospace">{lb.label}</text></g>);
      })}
    </svg>
  );
};

// ─── SIGNAL FLOW DIAGRAM ──────────────────────────────────────────────────────
const SignalFlowDiagram = () => (
  <div className="w-full rounded-xl overflow-hidden bg-[#07080f] border border-white/5 p-4">
    <div className="text-xs text-white/40 uppercase tracking-widest mb-3">Flujo de activación — todos los modelos</div>
    {[
      { n:'1', label:'H1 con tendencia clara', detail:'strength ≥ 40% · BEARISH o BULLISH (no NEUTRAL)', col:'#f59e0b' },
      { n:'2', label:'Alineación confirmada', detail:'H1+M15 misma dirección · ó M15 CHoCH reciente · ó M5 CHoCH+BOS contra-tendencia', col:'#f59e0b' },
      { n:'3', label:'OBs activos detectados', detail:'Mínimo 1 OB de demanda (compras) ó oferta (ventas) sin mitigar en M5', col:'#22c55e' },
      { n:'4', label:'Precio toca el OB', detail:'Cualquiera de las últimas 10 velas M5 entra en el rango del OB (±0.5 avgRange)', col:'#22c55e' },
      { n:'5', label:'Confirmación en la zona', detail:'Vela bajista/alcista · wick de rechazo · engulfing · pin bar · ó CHoCH structureOB (auto)', col:'#22c55e' },
      { n:'6', label:'Score ≥ 85 (83 contra-tendencia)', detail:'Suma de condiciones · bonuses por P/D correcto · triple confluencia · M15 CHoCH', col:'#3b82f6' },
      { n:'7', label:'Señal válida — no vencida', detail:'|precio_actual − entry| ≤ 0.6 × riesgo · TP1 ≥ 1.4 × SL · cooldown 30 min cumplido', col:'#ef4444' },
    ].map(({n,label,detail,col})=>(
      <div key={n} className="flex gap-3 mb-2.5">
        <div className="flex-none w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-black" style={{background:col}}>{n}</div>
        <div>
          <div className="text-sm text-white/80 font-medium">{label}</div>
          <div className="text-xs text-white/35 mt-0.5 leading-relaxed">{detail}</div>
        </div>
      </div>
    ))}
  </div>
);

// ─── MODEL DATA ───────────────────────────────────────────────────────────────
const MODELS = [
  {
    id:'MTF_CONFLUENCE', name:'MTF Confluence', tier:'S', score:'88–100%', active:true, color:'#f59e0b',
    desc:'Modelo principal. H1+M15 alineados (o M15 CHoCH reciente) + precio retrocede al Order Block★ (formado en el impulso del CHoCH/BOS). Entrada al precio actual, SL bajo/sobre la mecha del OB.',
    badges:['H1+M15 alineados','OB★ structureOB','10 velas touch','Entry = cierre actual'],
    rules:[
      'H1 BULLISH/BEARISH · strength ≥ 40%',
      'M15 alineado con H1 · ó CHoCH M15 en últimas 40 velas M15 · ó M15+M5 ambos en la misma dirección',
      'OB★ (structureOB): última vela opuesta antes del impulso que creó el CHoCH/BOS',
      'Precio toca el OB en las últimas 10 velas M5',
      'Confirmación: vela de rechazo · engulfing · pin bar · o structureOB auto-acepta',
      'Score base 88 · +5 P/D correcto · +4 M15 CHoCH · +4 structureOB · +3 triple confluencia',
    ],
    diagram:()=>{
      const c=[
        {o:100,c:104,h:106,l:99},{o:104,c:110,h:112,l:103},{o:110,c:107,h:111,l:106},
        {o:107,c:113,h:115,l:106},{o:113,c:118,h:120,l:112},{o:118,c:114,h:119,l:113},
        {o:114,c:116,h:118,l:113},{o:116,c:112,h:117,l:111},{o:112,c:115,h:116,l:111},
        {o:115,c:119,h:121,l:114},{o:119,c:124,h:126,l:118},{o:124,c:128,h:130,l:123},
      ];
      return <CandleChart candles={c}
        zones={[{hi:117,lo:113,col:colors.structOB,label:'OB★',star:true}]}
        levels={[{price:116,col:colors.entry,label:'ENT',lw:2.5},{price:126,col:colors.tp,label:'TP1',dash:'4,3'},{price:110,col:colors.sl,label:'SL',dash:'4,3'}]}
        chochLines={[{ci:7,price:113,col:'#22c55e',label:'CHoCH↑'}]}
        arrows={[{ci:8,price:110,dir:'up',col:colors.bull}]}/>;
    }
  },
  {
    id:'CHOCH_PULLBACK', name:'CHoCH + Pullback', tier:'A', score:'86–99%', active:true, color:'#8b5cf6',
    desc:'CHoCH en M5 detectado → OB★ formado en el impulso → precio retrocede al OB → entrada. Funciona con H1+M15 alineados Y como reversión (CHoCH M5 contra H1+M15 con BOS confirmado).',
    badges:['CHoCH M5','BOS confirmado','OB★ de impulso','Reversión válida'],
    rules:[
      'CHoCH en M5: precio rompe último HH/LL relevante con close más allá del nivel',
      'BOS en M5: confirma la nueva dirección (break of structure posterior)',
      'OB★: última vela de color opuesto ANTES del impulso del CHoCH',
      'Precio toca el OB en las últimas 10 velas',
      'Modo normal: opSide = H1 direction · Modo reversión: opSide = CHoCH M5 direction',
      'Score 86 base · +5 M15 CHoCH · +5 structureOB · +4 m15Strong · minScore 83 si contra-tendencia',
    ],
    diagram:()=>{
      const c=[
        {o:112,c:108,h:113,l:107},{o:108,c:110,h:111,l:107},{o:110,c:106,h:111,l:105},
        {o:106,c:108,h:109,l:105},{o:108,c:104,h:109,l:103},{o:104,c:106,h:107,l:103},
        {o:106,c:102,h:107,l:101},{o:102,c:108,h:109,l:101},{o:108,c:106,h:109,l:105},
        {o:106,c:109,h:110,l:105},{o:109,c:113,h:115,l:108},{o:113,c:117,h:118,l:112},
      ];
      return <CandleChart candles={c}
        zones={[{hi:108,lo:104,col:colors.structOB,label:'OB★',star:true}]}
        levels={[{price:108,col:colors.entry,label:'ENT',lw:2},{price:116,col:colors.tp,label:'TP1',dash:'4,3'},{price:100,col:colors.sl,label:'SL',dash:'4,3'}]}
        chochLines={[{ci:7,price:104,col:'#22c55e',label:'CHoCH↑'},{ci:9,price:106,col:'#34d399',label:'BOS↑'}]}
        arrows={[{ci:8,price:101,dir:'up',col:colors.bull}]}/>;
    }
  },
  {
    id:'M1_PRECISION', name:'M1 Precision', tier:'S', score:'82–97%', active:true, color:'#06b6d4',
    desc:'Triple confluencia H1+M15+M5 alineados. En M1 se busca el CHoCH final o pin bar para la entrada más precisa posible. Score más alto del sistema cuando todas las condiciones se cumplen.',
    badges:['H1+M15+M5 alineados','Entrada M1','Triple confluencia','Score máximo'],
    rules:[
      'H1 = M15 = M5 misma dirección (triple confluencia)',
      'Precio en zona de OB identificada en M15 o M5',
      'En M1: CHoCH alcista/bajista · engulfing · pin bar (mecha > 2x cuerpo)',
      'Confirmación M1 da entrada más ajustada y SL más pequeño',
      'Score 82+ base · triple confluencia suma +5 · M15 CHoCH suma +5',
    ],
    diagram:()=>{
      const c=[
        {o:100,c:103,h:105,l:99},{o:103,c:101,h:104,l:100},{o:101,c:104,h:105,l:100},
        {o:104,c:102,h:105,l:101},{o:102,c:105,h:106,l:101},{o:105,c:103,h:106,l:102},
        {o:103,c:101,h:104,l:100},{o:101,c:100,h:102,l:98},{o:100,c:107,h:108,l:98},
        {o:107,c:111,h:112,l:106},{o:111,c:109,h:112,l:108},{o:109,c:114,h:115,l:108},
      ];
      return <CandleChart candles={c}
        zones={[{hi:105,lo:100,col:colors.ob,label:'M15 OB'}]}
        levels={[{price:107,col:colors.entry,label:'ENT',lw:2.5},{price:114,col:colors.tp,label:'TP2',dash:'4,3'},{price:97,col:colors.sl,label:'SL',dash:'4,3'}]}
        chochLines={[{ci:8,price:100,col:colors.liq,label:'CHoCH M1'}]}
        arrows={[{ci:8,price:96,dir:'up',col:colors.bull}]}/>;
    }
  },
  {
    id:'BOS_CONTINUATION', name:'BOS Continuation', tier:'B', score:'84–97%', active:true, color:'#3b82f6',
    desc:'Break of Structure (BOS) en M5 confirma continuación de tendencia. El precio rompe un swing high/low previo y retrocede al OB del impulso para continuar.',
    badges:['BOS confirmado','OB★ de impulso','H1+M15 aligned','Continuación'],
    rules:[
      'BOS en M5: precio cierra más allá del último HH o LL (continuación de tendencia)',
      'opSide = H1 direction (BOS debe ir en dirección de H1+M15)',
      'OB★ formado en el impulso que creó el BOS',
      'Precio retrocede al OB en las últimas 10 velas',
      'Score 84 base · +5 triple confluencia · +4 P/D correcto · +4 M15 CHoCH',
    ],
    diagram:()=>{
      const c=[
        {o:100,c:105,h:107,l:99},{o:105,c:110,h:112,l:104},{o:110,c:107,h:111,l:106},
        {o:107,c:112,h:114,l:106},{o:112,c:116,h:118,l:111},{o:116,c:113,h:117,l:112},
        {o:113,c:115,h:116,l:112},{o:115,c:120,h:122,l:114},{o:120,c:117,h:121,l:116},
        {o:117,c:119,h:120,l:116},{o:119,c:123,h:125,l:118},{o:123,c:127,h:129,l:122},
      ];
      return <CandleChart candles={c}
        zones={[{hi:118,lo:114,col:colors.structOB,label:'OB★',star:true}]}
        levels={[{price:118,col:colors.entry,label:'ENT',lw:2},{price:127,col:colors.tp,label:'TP1',dash:'4,3'},{price:111,col:colors.sl,label:'SL',dash:'4,3'}]}
        chochLines={[{ci:7,price:114,col:'#3b82f6',label:'BOS↑'}]}
        arrows={[{ci:8,price:115,dir:'up',col:colors.bull}]}/>;
    }
  },
  {
    id:'LIQUIDITY_GRAB', name:'Liquidity Grab', tier:'B', score:'85–96%', active:true, color:'#06b6d4',
    desc:'El precio barre stops (liquidez) por encima de un máximo o debajo de un mínimo y revierte inmediatamente. H1+M15 deben ser BEARISH para SHORT y BULLISH para LONG — sin excepción.',
    badges:['Sweep de liquidez','Reversión inmediata','opSide estricto','R:R mínimo 1.5'],
    rules:[
      'Precio rompe el último HH (SHORT) o LL (LONG) con mecha larga y revierte',
      'opSide estricto: SHORT solo si H1+M15 BEARISH · LONG solo si H1+M15 BULLISH',
      'Vela de reversión cierra en dirección opuesta al sweep',
      'SL: encima del sweep high (SHORT) · debajo del sweep low (LONG)',
      'Score 85 base · +4 triple confluencia · +4 P/D correcto',
    ],
    diagram:()=>{
      const c=[
        {o:110,c:114,h:115,l:109},{o:114,c:112,h:115,l:111},{o:112,c:115,h:116,l:111},
        {o:115,c:113,h:116,l:112},{o:113,c:116,h:117,l:112},{o:116,c:114,h:120,l:108},
        {o:114,c:108,h:115,l:107},{o:108,c:106,h:109,l:105},{o:106,c:104,h:107,l:103},
        {o:104,c:102,h:105,l:101},{o:102,c:104,h:105,l:101},{o:104,c:100,h:105,l:99},
      ];
      return <CandleChart candles={c}
        zones={[{hi:120,lo:117,col:colors.liq,label:'LIQ'}]}
        levels={[{price:114,col:colors.entry,label:'ENT',lw:2},{price:106,col:colors.tp,label:'TP1',dash:'4,3'},{price:121,col:colors.sl,label:'SL',dash:'4,3'}]}
        arrows={[{ci:5,price:122,dir:'down',col:colors.bear}]}
        labels={[{ci:5,price:122,label:'SWEEP',col:colors.liq}]}/>;
    }
  },
  {
    id:'FVG_ENTRY', name:'Fair Value Gap', tier:'B', score:'84–98%', active:true, color:'#8b5cf6',
    desc:'Fair Value Gap (desequilibrio de precio) en M5. El precio salta dejando un gap sin llenar. Cuando retrocede al FVG en la dirección de H1+M15, se activa la entrada.',
    badges:['FVG en M5','opSide = H1+M15','No contra-tendencia','Gap fill'],
    rules:[
      'FVG: 3 velas donde la vela central deja un gap (high[1] < low[3] o low[1] > high[3])',
      'fvgSide debe coincidir con opSide (H1+M15 direction) — sin excepción',
      'Precio entra en el rango del FVG (±0.1%)',
      'Pullback al OB del mismo lado confirmado',
      'Score 84 base · +4 P/D correcto · +4 triple confluencia · +3 CHoCH M5',
    ],
    diagram:()=>{
      const c=[
        {o:100,c:104,h:105,l:99},{o:104,c:108,h:110,l:103},{o:108,c:115,h:117,l:107},
        {o:115,c:119,h:120,l:114},{o:119,c:117,h:120,l:116},{o:117,c:115,h:118,l:114},
        {o:115,c:116,h:117,l:114},{o:116,c:119,h:121,l:115},{o:119,c:122,h:124,l:118},
        {o:122,c:125,h:127,l:121},{o:125,c:123,h:126,l:122},{o:123,c:127,h:129,l:122},
      ];
      return <CandleChart candles={c}
        zones={[{hi:114,lo:111,col:colors.fvg,label:'FVG'}]}
        levels={[{price:116,col:colors.entry,label:'ENT',lw:2},{price:125,col:colors.tp,label:'TP1',dash:'4,3'},{price:109,col:colors.sl,label:'SL',dash:'4,3'}]}
        arrows={[{ci:6,price:113,dir:'up',col:colors.bull}]}/>;
    }
  },
  {
    id:'OTE_ENTRY', name:'OTE Entry', tier:'S', score:'85–97%', active:true, color:'#f59e0b',
    desc:'Optimal Trade Entry: precio retrocede entre el 62% y 79% del rango del impulso (Fibonacci). Combina CHoCH en M5 con posicionamiento óptimo en la zona de retroceso.',
    badges:['Fibo 62–79%','CHoCH + OTE','opSide estricto','Alta probabilidad'],
    rules:[
      'CHoCH en M5 detectado (cambio de estructura claro)',
      'Precio retrocede al 62–79% del swing anterior (zona OTE)',
      'opSide debe coincidir con CHoCH side (estricto)',
      'SL: encima del 100% del swing (mecha del OB)',
      'Score 85 base · +5 triple confluencia · +4 P/D correcto · +3 m15Strong',
    ],
    diagram:()=>{
      const c=[
        {o:100,c:104,h:106,l:99},{o:104,c:110,h:112,l:103},{o:110,c:116,h:118,l:109},
        {o:116,c:120,h:122,l:115},{o:120,c:117,h:121,l:116},{o:117,c:114,h:118,l:113},
        {o:114,c:111,h:115,l:110},{o:111,c:113,h:114,l:110},{o:113,c:117,h:119,l:112},
        {o:117,c:121,h:123,l:116},{o:121,c:124,h:126,l:120},{o:124,c:128,h:130,l:123},
      ];
      return <CandleChart candles={c}
        zones={[{hi:116,lo:113,col:'#f59e0b',label:'OTE 62%'}]}
        levels={[{price:114,col:colors.entry,label:'ENT',lw:2},{price:124,col:colors.tp,label:'TP1',dash:'4,3'},{price:109,col:colors.sl,label:'SL',dash:'4,3'}]}
        chochLines={[{ci:4,price:117,col:'#f59e0b',label:'CHoCH'}]}
        arrows={[{ci:7,price:109,dir:'up',col:colors.bull}]}/>;
    }
  },
  {
    id:'INDUCEMENT', name:'Inducement', tier:'A', score:'83–91%', active:true, color:'#ec4899',
    desc:'El mercado crea un falso movimiento (inducement) para atrapar traders y luego revierte hacia la dirección real. Requiere H1+M15 alineados y confirmación en OB.',
    badges:['Falso movimiento','Trampa de liquidez','OB de reversión','H1+M15 aligned'],
    rules:[
      'Precio hace un movimiento falso rompiendo un nivel menor (inducement)',
      'Revierte inmediatamente hacia la dirección de H1+M15',
      'OB activo en la zona de reversión',
      'Confirmación con vela de rechazo en el OB',
      'Score 83 base · +5 si M15 CHoCH confirma · +3 P/D correcto',
    ],
    diagram:()=>{
      const c=[
        {o:110,c:114,h:115,l:109},{o:114,c:111,h:115,l:110},{o:111,c:113,h:114,l:110},
        {o:113,c:116,h:117,l:112},{o:116,c:112,h:118,l:111},{o:112,c:109,h:113,l:108},
        {o:109,c:107,h:110,l:106},{o:107,c:110,h:111,l:106},{o:110,c:108,h:111,l:107},
        {o:108,c:106,h:109,l:105},{o:106,c:104,h:107,l:103},{o:104,c:101,h:105,l:100},
      ];
      return <CandleChart candles={c}
        zones={[{hi:119,lo:116,col:colors.bear,label:'OB↓'}]}
        levels={[{price:116,col:colors.entry,label:'ENT',lw:2},{price:107,col:colors.tp,label:'TP1',dash:'4,3'},{price:120,col:colors.sl,label:'SL',dash:'4,3'}]}
        labels={[{ci:4,price:120,label:'INDUCEMENT',col:colors.bear}]}
        arrows={[{ci:4,price:120,dir:'down',col:colors.bear}]}/>;
    }
  },
];

// ─── TIER CONFIG ──────────────────────────────────────────────────────────────
const TIER = {
  S:{ label:'Tier S — Elite', col:'#f59e0b', bg:'rgba(245,158,11,0.12)' },
  A:{ label:'Tier A — Alto',  col:'#22c55e', bg:'rgba(34,197,94,0.10)' },
  B:{ label:'Tier B — Bueno', col:'#3b82f6', bg:'rgba(59,130,246,0.10)' },
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function ModelosGuia() {
  const [sel, setSel] = useState('MTF_CONFLUENCE');
  const [showFlow, setShowFlow] = useState(false);
  const model = MODELS.find(m => m.id === sel);
  const T = TIER[model.tier];

  return (
    <div className="min-h-screen bg-[#07080f] text-white p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Modelos SMC Activos</h1>
          <p className="text-xs text-white/40 mt-1">{MODELS.length} modelos · Flujo SMC: CHoCH → OB★ → Pullback → Señal</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(TIER).map(([k,v])=>(
            <span key={k} className="text-xs px-2.5 py-1 rounded-full font-bold" style={{color:v.col,background:v.bg}}>{v.label}</span>
          ))}
        </div>
      </div>

      {/* Signal Flow Toggle */}
      <button onClick={()=>setShowFlow(v=>!v)}
        className="mb-4 w-full text-left px-4 py-3 rounded-xl border border-white/8 bg-white/3 hover:bg-white/5 transition-all flex items-center justify-between">
        <span className="text-sm font-medium text-white/70">⚡ Ver flujo completo de activación de señales</span>
        <span className="text-white/30 text-xs">{showFlow ? '▲ cerrar' : '▼ abrir'}</span>
      </button>
      {showFlow && <div className="mb-6"><SignalFlowDiagram/></div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Model List */}
        <div className="lg:col-span-1 space-y-2">
          <div className="text-xs text-white/30 uppercase tracking-widest mb-3">Seleccionar modelo</div>
          {MODELS.map(m=>{
            const t=TIER[m.tier];
            const active=m.id===sel;
            return (
              <button key={m.id} onClick={()=>setSel(m.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${active?'border-white/15 bg-white/6':'border-white/4 bg-white/2 hover:bg-white/4'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full" style={{background:m.color}}/>
                    <span className={`text-sm font-medium ${active?'text-white':'text-white/60'}`}>{m.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{color:t.col,background:t.bg}}>Tier {m.tier}</span>
                    {active && <span className="text-white/20">—</span>}
                  </div>
                </div>
                <div className="text-[10px] text-white/30 ml-4.5 mt-0.5 pl-4">{m.score}</div>
              </button>
            );
          })}
        </div>

        {/* Model Detail */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="rounded-xl border border-white/8 bg-white/2 p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <h2 className="text-lg font-bold text-white">{model.name}</h2>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{color:T.col,background:T.bg}}>{T.label}</span>
                </div>
                <p className="text-sm text-white/50 leading-relaxed">{model.desc}</p>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/30">Score range</div>
                <div className="text-lg font-bold font-mono" style={{color:T.col}}>{model.score}</div>
              </div>
            </div>

            {/* Badges */}
            <div className="flex gap-2 flex-wrap mt-3">
              {model.badges.map(b=>(
                <span key={b} className="text-[10px] px-2 py-1 rounded-lg bg-white/5 border border-white/8 text-white/50 font-mono">{b}</span>
              ))}
            </div>
          </div>

          {/* Diagram */}
          <div className="rounded-xl border border-white/8 bg-[#07080f] overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <div className="text-[10px] text-white/25 uppercase tracking-widest">Diagrama — ejemplo {model.id==='LIQUIDITY_GRAB'?'SHORT':'LONG'}</div>
            </div>
            <div className="px-4 pb-4">{model.diagram()}</div>
            <div className="flex gap-4 px-4 pb-3 flex-wrap">
              {[['─','#f59e0b','Entrada'],['─ ─','#34d399','Take Profit'],['─ ─','#ef4444','Stop Loss'],['█','#fbbf24','OB★ Estructura'],['█','#3b82f6','OB Normal']].map(([sym,col,lbl])=>(
                <div key={lbl} className="flex items-center gap-1.5">
                  <span className="text-sm font-bold" style={{color:col}}>{sym}</span>
                  <span className="text-[10px] text-white/35">{lbl}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rules */}
          <div className="rounded-xl border border-white/8 bg-white/2 p-5">
            <div className="text-xs text-white/30 uppercase tracking-widest mb-3">Reglas de activación</div>
            <div className="space-y-2">
              {model.rules.map((r,i)=>(
                <div key={i} className="flex gap-3">
                  <div className="flex-none w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-black" style={{background:T.col}}>{i+1}</div>
                  <span className="text-sm text-white/60 leading-relaxed">{r}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SL / TP info */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {label:'Entry',detail:'Precio de cierre actual (last.close) — nunca precio histórico del OB',col:'#f59e0b'},
              {label:'Stop Loss',detail:'Bajo mecha del OB (BUY) · Sobre mecha del OB (SELL) · +0.2× avgRange buffer',col:'#ef4444'},
              {label:'Take Profits',detail:'TP1 = 1.5× riesgo · TP2 = 2.5× · TP3 = 4× · Mínimo R:R 1.4 requerido',col:'#34d399'},
            ].map(({label,detail,col})=>(
              <div key={label} className="rounded-xl border border-white/6 bg-white/2 p-3">
                <div className="text-xs font-bold mb-1" style={{color}}>{label}</div>
                <div className="text-[10px] text-white/35 leading-relaxed">{detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
