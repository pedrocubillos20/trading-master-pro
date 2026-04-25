import React, { useState } from 'react';

// ── Real SMC chart SVGs ──────────────────────────────────────────────────────
const ChartSVG = ({ candles, zones=[], lines=[], labels=[], w=400, h=200 }) => {
  const PAD = { t:16, r:56, b:24, l:8 };
  const CW = w - PAD.l - PAD.r, CH = h - PAD.t - PAD.b;
  const prices = candles.flatMap(c=>[c.h,c.l]);
  zones.forEach(z=>{ prices.push(z.hi); prices.push(z.lo); });
  lines.forEach(l=>prices.push(l.y));
  const hi = Math.max(...prices) * 1.02, lo = Math.min(...prices) * 0.98;
  const rng = hi - lo || 1;
  const Y = p => PAD.t + CH * (1 - (p - lo) / rng);
  const n = candles.length;
  const cW = CW / n, bW = Math.max(2.5, cW * 0.55);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{display:'block'}}>
      <defs>
        <linearGradient id="gridFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.04"/>
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill="#07080f" rx="10"/>
      {[0.2,0.4,0.6,0.8].map(f=>(
        <line key={f} x1={PAD.l} y1={PAD.t+CH*f} x2={w-PAD.r} y2={PAD.t+CH*f}
          stroke="#ffffff" strokeOpacity="0.04" strokeWidth="1"/>
      ))}

      {/* Zones */}
      {zones.map((z,i)=>{
        const yTop = Y(z.hi), yBot = Y(z.lo), zH = Math.max(3, yBot-yTop);
        return (
          <g key={i}>
            <rect x={z.from!=null ? PAD.l+z.from*cW : PAD.l} y={yTop}
              width={z.from!=null ? (n-z.from)*cW : CW} height={zH}
              fill={z.col} fillOpacity={z.opacity||0.12} rx="1"/>
            {z.border && <line x1={PAD.l} y1={yTop} x2={w-PAD.r} y2={yTop}
              stroke={z.col} strokeWidth="1.5" strokeOpacity="0.6"/>}
            {z.border && <line x1={PAD.l} y1={yBot} x2={w-PAD.r} y2={yBot}
              stroke={z.col} strokeWidth="0.8" strokeOpacity="0.35" strokeDasharray="4,3"/>}
            {z.star && <>
              <line x1={PAD.l} y1={yTop} x2={w-PAD.r} y2={yTop}
                stroke="#fbbf24" strokeWidth="2" strokeOpacity="0.9"/>
            </>}
            <rect x={w-PAD.r+3} y={yTop} width={PAD.r-6} height="15" rx="3" fill={z.col} fillOpacity="0.9"/>
            <text x={w-PAD.r+6} y={yTop+10} fill="#000" fontSize="8" fontWeight="800" fontFamily="monospace">{z.label}</text>
          </g>
        );
      })}

      {/* Horizontal lines */}
      {lines.map((l,i)=>(
        <g key={i}>
          <line x1={l.from!=null ? PAD.l+l.from*cW : PAD.l} y1={Y(l.y)}
            x2={w-PAD.r} y2={Y(l.y)}
            stroke={l.col} strokeWidth={l.lw||1.5} strokeDasharray={l.dash||''} strokeOpacity="0.9"/>
          <rect x={w-PAD.r+3} y={Y(l.y)-7} width={PAD.r-6} height="14" rx="3" fill={l.col}/>
          <text x={w-PAD.r+6} y={Y(l.y)+4} fill="#000" fontSize="8" fontWeight="800" fontFamily="monospace">{l.label}</text>
        </g>
      ))}

      {/* Candles */}
      {candles.map((c,i)=>{
        const x = PAD.l + i*cW + cW/2;
        const bull = c.c >= c.o;
        const col = c.dim ? (bull?'#166534':'#7f1d1d') : (bull?'#22c55e':'#ef4444');
        const bTop = Y(Math.max(c.o,c.c)), bBot = Y(Math.min(c.o,c.c));
        const bH = Math.max(2, bBot-bTop);
        return (
          <g key={i}>
            <line x1={x} y1={Y(c.h)} x2={x} y2={Y(c.l)} stroke={col} strokeWidth="1" opacity={c.dim?0.4:0.8}/>
            <rect x={x-bW/2} y={bTop} width={bW} height={bH} fill={col} opacity={c.dim?0.5:1}
              rx={bH > 4 ? 1 : 0}/>
            {c.ob && <>
              <rect x={x-bW/2-1} y={bTop-1} width={bW+2} height={bH+2}
                fill="none" stroke="#fbbf24" strokeWidth="1.5" rx="2"/>
            </>}
          </g>
        );
      })}

      {/* Labels */}
      {labels.map((lb,i)=>{
        const x = PAD.l + lb.ci*cW + cW/2;
        const y = Y(lb.y);
        return (
          <g key={i}>
            {lb.line && <line x1={PAD.l} y1={y} x2={w-PAD.r} y2={y}
              stroke={lb.col} strokeWidth="1.5" strokeDasharray="6,3" strokeOpacity="0.6"/>}
            {lb.dot && <circle cx={x} cy={y} r="4" fill={lb.col} opacity="0.9"/>}
            <rect x={x-lb.text.length*3.2-4} y={y-(lb.above?16:2)} width={lb.text.length*6.4+8} height="14" rx="3"
              fill={lb.col} fillOpacity="0.92"/>
            <text x={x} y={y+(lb.above?-5:10)} textAnchor="middle" fill="#000"
              fontSize="7.5" fontWeight="800" fontFamily="monospace">{lb.text}</text>
            {lb.arrow && (lb.arrow==='up'
              ? <polygon points={`${x-5},${y+18} ${x+5},${y+18} ${x},${y+6}`} fill={lb.col} opacity="0.9"/>
              : <polygon points={`${x-5},${y-18} ${x+5},${y-18} ${x},${y-6}`} fill={lb.col} opacity="0.9"/>
            )}
          </g>
        );
      })}
    </svg>
  );
};

// ── MODEL DATA with real chart scenarios ────────────────────────────────────
const MODELS = [
  {
    id: 'MTF_CONFLUENCE',
    name: 'MTF Confluence',
    tier: 'S', tierCol: '#f59e0b',
    score: '88–100',
    color: '#f59e0b',
    summary: 'H1 define tendencia → M15 confirma → M5 retrocede al OB★ (último OB antes del impulso que creó el CHoCH/BOS) → entrada.',
    flow: ['H1 BULLISH/BEARISH · strength ≥ 40%', 'M15 alineado con H1 · ó CHoCH M15 (ventana 40 velas) · ó M15+M5 ambos alineados', 'OB★ formado: última vela ROJA antes de impulso alcista · última VERDE antes de impulso bajista', 'Precio toca el OB en las últimas 10 velas M5', 'Confirmación: vela de rechazo · engulfing · pin bar · CHoCH_OB auto-acepta'],
    sl: 'Bajo mecha del OB (BUY) · Sobre mecha del OB (SELL)',
    tp: 'TP1=1.5R · TP2=2.5R · TP3=4R',
    chart: () => {
      const c = [
        // Bajada previa
        {o:120,c:116,h:121,l:115,dim:true},{o:116,c:113,h:117,l:112,dim:true},
        {o:113,c:110,h:114,l:109,dim:true},{o:110,c:107,h:111,l:106,dim:true},
        // LL - última baja
        {o:107,c:103,h:108,l:102,dim:true},
        // VELA OB ROJA (el OB) — marcada con borde dorado
        {o:103,c:99,h:104,l:98,ob:true},
        // Impulso alcista (CHoCH)
        {o:99,c:108,h:110,l:98},{o:108,c:113,h:115,l:107},
        // Retroceso al OB
        {o:113,c:105,h:114,l:104},{o:105,c:103,h:106,l:102},
        // Entrada + subida
        {o:103,c:110,h:112,l:102},{o:110,c:117,h:119,l:109},
        {o:117,c:122,h:124,l:116},{o:122,c:126,h:128,l:121},
      ];
      return <ChartSVG candles={c} w={420} h={210}
        zones={[{hi:104,lo:99,col:'#fbbf24',label:'OB★',border:true,star:true,from:5,opacity:0.15}]}
        lines={[
          {y:103,col:'#f59e0b',label:'ENT',lw:2.5,from:9},
          {y:117,col:'#34d399',label:'TP1',dash:'5,3',from:9},
          {y:125,col:'#34d399',label:'TP2',dash:'5,3',from:9},
          {y:97,col:'#ef4444',label:'SL',dash:'4,3',from:9},
        ]}
        labels={[
          {ci:5,y:96,text:'OB★',col:'#fbbf24',above:false,dot:true},
          {ci:7,y:116,text:'CHoCH↑',col:'#22c55e',above:true,line:true,dot:true},
          {ci:9,y:100,text:'PULLBACK',col:'#f59e0b',above:false,arrow:'up'},
        ]}/>;
    }
  },
  {
    id: 'CHOCH_PULLBACK',
    name: 'CHoCH + Pullback',
    tier: 'A', tierCol: '#22c55e',
    score: '86–99',
    color: '#8b5cf6',
    summary: 'CHoCH en M5 detectado (rompe estructura) → OB★ del impulso formado → BOS confirma → precio retrocede → entrada. Funciona con H1+M15 Y como reversión desde extremidades.',
    flow: ['CHoCH M5: precio cierra más allá del último HH/LL con close confirmado', 'OB★ = última vela de color opuesto ANTES del impulso del CHoCH', 'BOS M5 = confirmación de continuidad (break of structure posterior)', 'Precio retrocede al OB en las últimas 10 velas', 'Modo reversión: CHoCH M5 contra H1+M15 + BOS confirma → opDir = CHoCH direction · minScore 83'],
    sl: 'Bajo mecha del OB★ (BUY) · Sobre mecha del OB★ (SELL)',
    tp: 'TP1=1.5R · TP2=2.5R · TP3=4R',
    chart: () => {
      const c = [
        // Tendencia bajista con HH bajantes
        {o:118,c:114,h:119,l:113,dim:true},{o:114,c:116,h:117,l:113,dim:true},
        {o:116,c:111,h:117,l:110,dim:true},{o:111,c:113,h:114,l:110,dim:true},
        {o:113,c:108,h:114,l:107,dim:true},{o:108,c:104,h:109,l:103,dim:true},
        // LL — swing low
        {o:104,c:100,h:105,l:99,dim:true},
        // VELA OB★ roja — ANTES del impulso
        {o:100,c:96,h:101,l:95,ob:true},
        // IMPULSO CHoCH alcista
        {o:96,c:106,h:108,l:95},{o:106,c:111,h:113,l:105},
        // BOS — rompe el último LH
        {o:111,c:115,h:117,l:110},
        // Retroceso al OB
        {o:115,c:104,h:116,l:103},{o:104,c:102,h:105,l:101},
        // Entrada + continuación
        {o:102,c:110,h:112,l:101},{o:110,c:117,h:119,l:109},
      ];
      return <ChartSVG candles={c} w={420} h={210}
        zones={[{hi:101,lo:96,col:'#fbbf24',label:'OB★',border:true,star:true,from:7,opacity:0.18}]}
        lines={[
          {y:102,col:'#f59e0b',label:'ENT',lw:2.5,from:12},
          {y:115,col:'#34d399',label:'TP1',dash:'5,3',from:12},
          {y:94,col:'#ef4444',label:'SL',dash:'4,3',from:12},
        ]}
        labels={[
          {ci:8,y:109,text:'CHoCH↑',col:'#22c55e',above:true,line:true,dot:true},
          {ci:10,y:118,text:'BOS↑',col:'#34d399',above:true,line:true,dot:true},
          {ci:12,y:99,text:'PULLBACK',col:'#f59e0b',above:false,arrow:'up'},
        ]}/>;
    }
  },
  {
    id: 'BOS_CONTINUATION',
    name: 'BOS Continuation',
    tier: 'B', tierCol: '#3b82f6',
    score: '84–97',
    color: '#3b82f6',
    summary: 'Break of Structure (BOS) = tendencia continúa. El precio rompe el último swing high/low en la dirección de H1+M15 y retrocede al OB del impulso para continuar.',
    flow: ['BOS: precio cierra más allá del último HH (BUY) o LL (SELL)', 'opSide debe coincidir con opDir H1+M15 — BOS contra-tendencia rechazado', 'OB★ formado en el impulso que generó el BOS', 'Precio toca el OB en las últimas 10 velas', 'Confirmación con vela de rechazo · engulfing · ó BOS+OB auto-acepta'],
    sl: 'Bajo el OB★ (BUY) · Sobre el OB★ (SELL)',
    tp: 'TP1=1.5R · TP2=2.5R · TP3=4R',
    chart: () => {
      const c = [
        {o:100,c:105,h:107,l:99},{o:105,c:103,h:106,l:102},{o:103,c:108,h:110,l:102},
        {o:108,c:106,h:109,l:105},{o:106,c:112,h:114,l:105},
        // Retroceso
        {o:112,c:108,h:113,l:107},{o:108,c:110,h:111,l:107},
        // VELA OB ROJA antes del impulso
        {o:110,c:107,h:111,l:106,ob:true},
        // BOS — rompe el último HH
        {o:107,c:116,h:118,l:106},{o:116,c:113,h:117,l:112},
        // Retrocede al OB
        {o:113,c:109,h:114,l:108},{o:109,c:107,h:110,l:106},
        // Entrada + continuación
        {o:107,c:114,h:116,l:106},{o:114,c:120,h:122,l:113},
      ];
      return <ChartSVG candles={c} w={420} h={210}
        zones={[{hi:111,lo:107,col:'#fbbf24',label:'OB★',border:true,star:true,from:7,opacity:0.15}]}
        lines={[
          {y:109,col:'#f59e0b',label:'ENT',lw:2.5,from:11},
          {y:120,col:'#34d399',label:'TP1',dash:'5,3',from:11},
          {y:105,col:'#ef4444',label:'SL',dash:'4,3',from:11},
        ]}
        labels={[
          {ci:8,y:119,text:'BOS↑',col:'#3b82f6',above:true,line:true,dot:true},
          {ci:11,y:104,text:'PULLBACK',col:'#f59e0b',above:false,arrow:'up'},
        ]}/>;
    }
  },
  {
    id: 'LIQUIDITY_GRAB',
    name: 'Liquidity Grab',
    tier: 'B', tierCol: '#3b82f6',
    score: '85–96',
    color: '#06b6d4',
    summary: 'El precio barre stops (liquidez) por encima de un máximo o debajo de un mínimo y revierte inmediatamente. H1+M15 DEBEN coincidir con la dirección de la reversión — sin excepción.',
    flow: ['Precio rompe el último HH (SHORT) o LL (LONG) barriendo liquidez', 'Vela de sweep con mecha larga — revierte y cierra en dirección opuesta', 'opSide estricto: SHORT solo H1+M15 BEARISH · LONG solo H1+M15 BULLISH', 'SL encima del sweep high (SHORT) · debajo del sweep low (LONG)', 'Score 85 base · +4 triple confluencia · +4 P/D correcto'],
    sl: 'Sobre el máximo del sweep (SHORT) · Bajo el mínimo del sweep (LONG)',
    tp: 'TP1=1.5R · TP2=2.5R · TP3=4R',
    chart: () => {
      const c = [
        // Tendencia bajista
        {o:120,c:117,h:121,l:116},{o:117,c:119,h:120,l:116},{o:119,c:115,h:120,l:114},
        {o:115,c:117,h:118,l:114},{o:117,c:113,h:118,l:112},{o:113,c:115,h:116,l:112},
        // SWEEP alcista — barre stops arriba
        {o:115,c:113,h:125,l:112},
        // Reversión bajista
        {o:113,c:108,h:114,l:107},{o:108,c:105,h:109,l:104},
        {o:105,c:107,h:106,l:104},{o:107,c:103,h:108,l:102},
        {o:103,c:100,h:104,l:99},{o:100,c:97,h:101,l:96},
      ];
      return <ChartSVG candles={c} w={420} h={210}
        zones={[{hi:125,lo:121,col:'#06b6d4',label:'LIQ',from:6,opacity:0.18,border:true}]}
        lines={[
          {y:113,col:'#f59e0b',label:'ENT',lw:2.5,from:7},
          {y:105,col:'#34d399',label:'TP1',dash:'5,3',from:7},
          {y:97,col:'#34d399',label:'TP2',dash:'5,3',from:7},
          {y:126,col:'#ef4444',label:'SL',dash:'4,3',from:6},
        ]}
        labels={[
          {ci:6,y:127,text:'SWEEP↑',col:'#06b6d4',above:true,dot:true},
          {ci:7,y:106,text:'SHORT',col:'#ef4444',above:false,arrow:'down'},
        ]}/>;
    }
  },
  {
    id: 'FVG_ENTRY',
    name: 'Fair Value Gap',
    tier: 'B', tierCol: '#3b82f6',
    score: '84–98',
    color: '#8b5cf6',
    summary: 'Fair Value Gap = desequilibrio de precio (gap entre 3 velas). El precio retrocede para llenar el gap en dirección de H1+M15. FVG del mismo lado que opSide — NUNCA contra-tendencia.',
    flow: ['FVG: vela 1 high < vela 3 low (BUY) ó vela 1 low > vela 3 high (SELL)', 'fvgSide = opSide (H1+M15 direction) — sin excepción', 'Precio entra en el rango del FVG (±0.1%)', 'Pullback al OB del mismo lado confirmado', 'Score 84 base · +4 P/D correcto · +4 triple confluencia · +3 CHoCH M5'],
    sl: 'Bajo el FVG low + buffer (BUY) · Sobre el FVG high + buffer (SELL)',
    tp: 'TP1=1.5R · TP2=2.5R · TP3=4R',
    chart: () => {
      const c = [
        {o:100,c:103,h:104,l:99,dim:true},{o:103,c:101,h:104,l:100,dim:true},
        // Vela 1 del FVG
        {o:101,c:106,h:107,l:100},
        // Vela 2 — impulso grande (gap)
        {o:106,c:114,h:116,l:105},
        // Vela 3 del FVG (high de v1=107 < low de v3)
        {o:114,c:118,h:120,l:112},
        {o:118,c:115,h:119,l:114},{o:115,c:117,h:118,l:114},
        // Retrocede al FVG
        {o:117,c:109,h:118,l:108},{o:109,c:107,h:110,l:106},
        // Entrada
        {o:107,c:113,h:115,l:106},{o:113,c:119,h:121,l:112},
        {o:119,c:124,h:126,l:118},
      ];
      return <ChartSVG candles={c} w={420} h={210}
        zones={[{hi:112,lo:107,col:'#8b5cf6',label:'FVG',from:2,opacity:0.2,border:true}]}
        lines={[
          {y:109,col:'#f59e0b',label:'ENT',lw:2.5,from:8},
          {y:120,col:'#34d399',label:'TP1',dash:'5,3',from:8},
          {y:105,col:'#ef4444',label:'SL',dash:'4,3',from:8},
        ]}
        labels={[
          {ci:3,y:118,text:'FVG GAP',col:'#8b5cf6',above:true},
          {ci:8,y:104,text:'FILL',col:'#f59e0b',above:false,arrow:'up'},
        ]}/>;
    }
  },
  {
    id: 'OTE_ENTRY',
    name: 'OTE Entry',
    tier: 'S', tierCol: '#f59e0b',
    score: '85–97',
    color: '#f59e0b',
    summary: 'Optimal Trade Entry: retroceso al 62–79% del rango del impulso (Fibonacci). Combina CHoCH M5 con posicionamiento en la zona óptima de probabilidad estadística.',
    flow: ['CHoCH M5 detectado con close confirmado más allá del nivel', 'Precio retrocede entre el 62% y 79% del swing del impulso', 'opSide = CHoCH side (estricto)', 'SL: bajo el 100% del swing (mínimo del impulso)', 'Score 85 base · +5 triple confluencia · +4 P/D correcto · +3 m15Strong'],
    sl: 'Bajo el 100% del swing (BUY) · Sobre el 100% (SELL)',
    tp: 'TP1=1.5R · TP2=2.5R · TP3=4R',
    chart: () => {
      const c = [
        {o:100,c:104,h:106,l:99,dim:true},{o:104,c:108,h:110,l:103,dim:true},
        {o:108,c:112,h:114,l:107,dim:true},{o:112,c:118,h:120,l:111,dim:true},
        // CHoCH — rompe LH
        {o:118,c:122,h:124,l:117},
        {o:122,c:126,h:128,l:121},{o:126,c:130,h:132,l:125},
        // Retroceso al 62-79% (OTE)
        {o:130,c:122,h:131,l:121},{o:122,c:119,h:123,l:118},
        // Zona OTE — entrada
        {o:119,c:121,h:122,l:118},{o:121,c:126,h:128,l:120},
        {o:126,c:131,h:133,l:125},{o:131,c:136,h:138,l:130},
      ];
      return <ChartSVG candles={c} w={420} h={210}
        zones={[{hi:124,lo:119,col:'#f59e0b',label:'OTE 62%',from:7,opacity:0.18,border:true}]}
        lines={[
          {y:120,col:'#f59e0b',label:'ENT',lw:2.5,from:9},
          {y:132,col:'#34d399',label:'TP1',dash:'5,3',from:9},
          {y:137,col:'#34d399',label:'TP2',dash:'5,3',from:9},
          {y:116,col:'#ef4444',label:'SL',dash:'4,3',from:7},
        ]}
        labels={[
          {ci:4,y:125,text:'CHoCH↑',col:'#f59e0b',above:true,line:true,dot:true},
          {ci:9,y:116,text:'OTE ZONE',col:'#f59e0b',above:false,arrow:'up'},
        ]}/>;
    }
  },
  {
    id: 'M1_PRECISION',
    name: 'M1 Precision',
    tier: 'S', tierCol: '#f59e0b',
    score: '82–97',
    color: '#06b6d4',
    summary: 'Triple confluencia H1+M15+M5 alineados. En M1 se busca CHoCH o pin bar para la entrada más ajustada. Score más alto del sistema.',
    flow: ['H1 = M15 = M5 misma dirección (triple confluencia confirmada)', 'Precio en zona OB de M15 o M5 identificada', 'En M1: CHoCH + BOS · engulfing · pin bar (mecha > 2× cuerpo)', 'SL más pequeño gracias a la precisión M1', 'Score 82+ · triple confluencia +5 · M15 CHoCH +5'],
    sl: 'Bajo mecha del OB en M1 (muy ajustado)',
    tp: 'TP1=1.5R · TP2=2.5R · TP3=4R',
    chart: () => {
      const c = [
        {o:100,c:103,h:105,l:99,dim:true},{o:103,c:101,h:104,l:100,dim:true},
        {o:101,c:104,h:106,l:100,dim:true},{o:104,c:102,h:105,l:101,dim:true},
        // OB de M15
        {o:102,c:99,h:103,l:98,ob:true},
        // M5 en zona
        {o:99,c:101,h:102,l:98},{o:101,c:99,h:102,l:98},
        // M1 CHoCH + pin bar
        {o:99,c:98,h:100,l:96},{o:98,c:105,h:106,l:97},
        // Entrada
        {o:105,c:109,h:111,l:104},{o:109,c:113,h:115,l:108},
        {o:113,c:117,h:119,l:112},{o:117,c:121,h:123,l:116},
      ];
      return <ChartSVG candles={c} w={420} h={210}
        zones={[{hi:103,lo:99,col:'#06b6d4',label:'M15 OB',from:0,opacity:0.12,border:true}]}
        lines={[
          {y:105,col:'#f59e0b',label:'ENT',lw:2.5,from:8},
          {y:117,col:'#34d399',label:'TP1',dash:'5,3',from:8},
          {y:121,col:'#34d399',label:'TP2',dash:'5,3',from:8},
          {y:95,col:'#ef4444',label:'SL',dash:'4,3',from:7},
        ]}
        labels={[
          {ci:7,y:96,text:'PIN BAR M1',col:'#06b6d4',above:false,dot:true},
          {ci:8,y:108,text:'CHoCH M1',col:'#06b6d4',above:true,line:true},
        ]}/>;
    }
  },
  {
    id: 'INDUCEMENT',
    name: 'Inducement',
    tier: 'A', tierCol: '#22c55e',
    score: '83–91',
    color: '#ec4899',
    summary: 'El mercado crea un falso movimiento (trampa) para capturar traders en contra y luego ejecuta la dirección real. Requiere H1+M15 alineados + OB de reversión.',
    flow: ['Precio hace movimiento falso rompiendo nivel menor (inducement)', 'Revierte inmediatamente hacia la dirección de H1+M15', 'OB activo en la zona de reversión del lado correcto', 'Vela de rechazo en el OB confirma la trampa', 'Score 83 base · +5 M15 CHoCH · +3 P/D correcto · H1+M15 alineados requerido'],
    sl: 'Bajo la mecha del OB (BUY) · Sobre la mecha del OB (SELL)',
    tp: 'TP1=1.5R · TP2=2.5R · TP3=4R',
    chart: () => {
      const c = [
        // Tendencia bajista
        {o:118,c:115,h:119,l:114},{o:115,c:117,h:118,l:114},{o:117,c:113,h:118,l:112},
        {o:113,c:115,h:116,l:112},{o:115,c:111,h:116,l:110},
        // INDUCEMENT: falso rompimiento alcista — trampa
        {o:111,c:115,h:120,l:110},
        // OB de supply — vela verde antes del impulso bajista
        {o:115,c:118,h:119,l:114,ob:true},
        // Reversión bajista
        {o:118,c:112,h:119,l:111},{o:112,c:108,h:113,l:107},
        {o:108,c:105,h:109,l:104},{o:105,c:102,h:106,l:101},
        {o:102,c:99,h:103,l:98},{o:99,c:96,h:100,l:95},
      ];
      return <ChartSVG candles={c} w={420} h={210}
        zones={[{hi:119,lo:115,col:'#ec4899',label:'OB↓',from:5,opacity:0.15,border:true}]}
        lines={[
          {y:117,col:'#f59e0b',label:'ENT',lw:2.5,from:7},
          {y:108,col:'#34d399',label:'TP1',dash:'5,3',from:7},
          {y:101,col:'#34d399',label:'TP2',dash:'5,3',from:7},
          {y:121,col:'#ef4444',label:'SL',dash:'4,3',from:5},
        ]}
        labels={[
          {ci:5,y:122,text:'TRAMPA↑',col:'#ec4899',above:true,dot:true},
          {ci:7,y:120,text:'SHORT',col:'#ef4444',above:false,arrow:'down'},
        ]}/>;
    }
  },
];

// ── Main Component ──────────────────────────────────────────────────────────
export default function ModelosGuia() {
  const [sel, setSel] = useState('MTF_CONFLUENCE');
  const [tab, setTab] = useState('diagram');
  const m = MODELS.find(x => x.id === sel);

  const tierBg = { S:'rgba(245,158,11,0.12)', A:'rgba(34,197,94,0.10)', B:'rgba(59,130,246,0.10)' };
  const tierBorder = { S:'rgba(245,158,11,0.3)', A:'rgba(34,197,94,0.25)', B:'rgba(59,130,246,0.25)' };

  return (
    <div style={{minHeight:'100vh',background:'#07080f',color:'#fff',fontFamily:'system-ui,sans-serif',padding:'20px 16px'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:12,marginBottom:24}}>
        <div>
          <div style={{fontSize:20,fontWeight:800,letterSpacing:-0.5}}>Modelos SMC</div>
          <div style={{fontSize:11,color:'rgba(255,255,255,0.35)',marginTop:4}}>
            {MODELS.length} modelos · CHoCH → OB★ → Pullback (10 velas) → Señal
          </div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {[['S','#f59e0b'],['A','#22c55e'],['B','#3b82f6']].map(([t,c])=>(
            <span key={t} style={{fontSize:10,fontWeight:700,padding:'3px 10px',borderRadius:20,
              color:c,background:tierBg[t],border:`1px solid ${tierBorder[t]}`}}>Tier {t}</span>
          ))}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:16}}>
        {/* Model selector - horizontal scroll */}
        <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:4}}>
          {MODELS.map(mx=>{
            const active = mx.id===sel;
            return (
              <button key={mx.id} onClick={()=>{setSel(mx.id);setTab('diagram');}}
                style={{flex:'0 0 auto',padding:'8px 14px',borderRadius:10,border:`1px solid ${active?'rgba(255,255,255,0.15)':'rgba(255,255,255,0.06)'}`,
                  background:active?'rgba(255,255,255,0.07)':'rgba(255,255,255,0.02)',cursor:'pointer',
                  display:'flex',alignItems:'center',gap:8,transition:'all 0.15s'}}>
                <div style={{width:8,height:8,borderRadius:4,background:mx.color,flexShrink:0}}/>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:active?'#fff':'rgba(255,255,255,0.5)',whiteSpace:'nowrap'}}>{mx.name}</div>
                  <div style={{fontSize:10,color:mx.tierCol,fontWeight:700}}>Tier {mx.tier} · {mx.score}%</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Model detail */}
        <div style={{borderRadius:14,border:`1px solid rgba(255,255,255,0.07)`,background:'rgba(255,255,255,0.02)',overflow:'hidden'}}>
          {/* Title bar */}
          <div style={{padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:10,height:10,borderRadius:5,background:m.color}}/>
              <span style={{fontSize:17,fontWeight:800}}>{m.name}</span>
              <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,
                color:m.tierCol,background:tierBg[m.tier]}}>{m.tier} · {m.score}%</span>
            </div>
            {/* Tabs */}
            <div style={{display:'flex',gap:4}}>
              {[['diagram','📊 Gráfico'],['rules','📋 Reglas']].map(([t,l])=>(
                <button key={t} onClick={()=>setTab(t)} style={{padding:'5px 12px',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',
                  background:tab===t?'rgba(255,255,255,0.1)':'transparent',
                  border:`1px solid ${tab===t?'rgba(255,255,255,0.15)':'transparent'}`,
                  color:tab===t?'#fff':'rgba(255,255,255,0.4)'}}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div style={{padding:'12px 20px',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,color:'rgba(255,255,255,0.5)',lineHeight:1.6}}>
            {m.summary}
          </div>

          {/* Diagram tab */}
          {tab==='diagram' && (
            <div style={{padding:'16px 20px'}}>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.25)',textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>
                Ejemplo real — {m.id==='LIQUIDITY_GRAB'?'SHORT':'LONG'}
              </div>
              {m.chart()}
              {/* Legend */}
              <div style={{display:'flex',gap:16,flexWrap:'wrap',marginTop:10}}>
                {[['━━','#f59e0b','Entrada'],['╌╌','#34d399','Take Profit'],['╌╌','#ef4444','Stop Loss'],['▓▓','#fbbf24','OB★ Estructura'],['◆','#06b6d4','CHoCH / BOS']].map(([sym,col,lbl])=>(
                  <div key={lbl} style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{color:col,fontSize:12,fontWeight:800}}>{sym}</span>
                    <span style={{fontSize:10,color:'rgba(255,255,255,0.3)'}}>{lbl}</span>
                  </div>
                ))}
              </div>
              {/* SL/TP boxes */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:14}}>
                {[['Stop Loss',m.sl,'#ef4444'],['Take Profit',m.tp,'#34d399']].map(([k,v,c])=>(
                  <div key={k} style={{padding:'10px 12px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:`1px solid rgba(255,255,255,0.07)`}}>
                    <div style={{fontSize:10,fontWeight:700,color:c,marginBottom:4}}>{k}</div>
                    <div style={{fontSize:11,color:'rgba(255,255,255,0.45)',lineHeight:1.5}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rules tab */}
          {tab==='rules' && (
            <div style={{padding:'16px 20px'}}>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.25)',textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>Condiciones de activación</div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {m.flow.map((r,i)=>(
                  <div key={i} style={{display:'flex',gap:12,alignItems:'flex-start'}}>
                    <div style={{flexShrink:0,width:22,height:22,borderRadius:11,display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:11,fontWeight:800,color:'#000',background:m.tierCol}}>
                      {i+1}
                    </div>
                    <div style={{fontSize:12,color:'rgba(255,255,255,0.6)',lineHeight:1.6,paddingTop:2}}>{r}</div>
                  </div>
                ))}
              </div>
              {/* Score breakdown */}
              <div style={{marginTop:16,padding:'12px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>
                <div style={{fontSize:10,color:'rgba(255,255,255,0.3)',marginBottom:8,fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>Score mínimo requerido</div>
                <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                  <div style={{fontSize:12,color:'rgba(255,255,255,0.5)'}}>Normal: <span style={{color:'#f59e0b',fontWeight:700}}>85</span></div>
                  <div style={{fontSize:12,color:'rgba(255,255,255,0.5)'}}>Contra-tendencia (CHoCH vs H1): <span style={{color:'#ef4444',fontWeight:700}}>83</span></div>
                  <div style={{fontSize:12,color:'rgba(255,255,255,0.5)'}}>Score range: <span style={{color:m.tierCol,fontWeight:700}}>{m.score}%</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
