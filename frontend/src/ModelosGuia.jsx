import React, { useState } from 'react';

// ─── SVG DIAGRAM HELPERS ─────────────────────────────────────────────────────
const colors = {
  bull: '#22c55e', bear: '#ef4444', neutral: '#f59e0b',
  entry: '#f59e0b', tp: '#34d399', sl: '#ef4444',
  ob: '#3b82f6', fvg: '#8b5cf6', liq: '#06b6d4',
  bg: '#07080f', grid: '#ffffff08', text: '#94a3b8'
};

// Generic candle chart SVG
const CandleChart = ({ candles, levels = [], arrows = [], zones = [], labels = [], w = 340, h = 160 }) => {
  const P = { t: 12, r: 60, b: 16, l: 8 };
  const CW = w - P.l - P.r, CH = h - P.t - P.b;

  const allPrices = candles.flatMap(c => [c.h, c.l]);
  levels.forEach(l => allPrices.push(l.price));
  const hi = Math.max(...allPrices) * 1.02;
  const lo = Math.min(...allPrices) * 0.98;
  const rng = hi - lo || 1;
  const Y = p => P.t + CH * (1 - (p - lo) / rng);

  const n = candles.length;
  const cW = CW / n;
  const bW = Math.max(3, cW * 0.6);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
      <rect width={w} height={h} fill={colors.bg} rx="6" />

      {/* Grid */}
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={P.l} y1={P.t + CH * f} x2={w - P.r} y2={P.t + CH * f}
          stroke={colors.grid} strokeWidth="1" />
      ))}

      {/* Zones (OB, FVG, etc) */}
      {zones.map((z, i) => (
        <g key={i}>
          <rect x={P.l} y={Y(z.hi)} width={CW} height={Math.max(2, Y(z.lo) - Y(z.hi))}
            fill={z.col} fillOpacity="0.15" />
          <rect x={w - P.r + 2} y={Y(z.hi) - 1} width={P.r - 4} height="13" rx="2" fill={z.col} fillOpacity="0.9" />
          <text x={w - P.r + 5} y={Y(z.hi) + 8} fill="#000" fontSize="8" fontWeight="700" fontFamily="monospace">{z.label}</text>
        </g>
      ))}

      {/* Levels */}
      {levels.map((l, i) => (
        <g key={i}>
          <line x1={P.l} y1={Y(l.price)} x2={w - P.r} y2={Y(l.price)}
            stroke={l.col} strokeWidth={l.lw || 1.5} strokeDasharray={l.dash || ''} opacity="0.9" />
          <rect x={w - P.r + 2} y={Y(l.price) - 7} width={P.r - 4} height="14" rx="2" fill={l.col} />
          <text x={w - P.r + 5} y={Y(l.price) + 4} fill="#000" fontSize="7.5" fontWeight="700" fontFamily="monospace">{l.label}</text>
        </g>
      ))}

      {/* Candles */}
      {candles.map((c, i) => {
        const x = P.l + i * cW + cW / 2;
        const bTop = Y(Math.max(c.o, c.c));
        const bBot = Y(Math.min(c.o, c.c));
        const bH = Math.max(2, bBot - bTop);
        const col = c.c >= c.o ? colors.bull : colors.bear;
        return (
          <g key={i}>
            <line x1={x} y1={Y(c.h)} x2={x} y2={Y(c.l)} stroke={col} strokeWidth="1" opacity="0.7" />
            <rect x={x - bW / 2} y={bTop} width={bW} height={bH} fill={col} />
          </g>
        );
      })}

      {/* Arrows */}
      {arrows.map((a, i) => {
        const x = P.l + a.ci * cW + cW / 2;
        const y = Y(a.price);
        return a.dir === 'up'
          ? <polygon key={i} points={`${x - 6},${y + 8} ${x + 6},${y + 8} ${x},${y - 2}`} fill={a.col || colors.bull} opacity="0.95" />
          : <polygon key={i} points={`${x - 6},${y - 8} ${x + 6},${y - 8} ${x},${y + 2}`} fill={a.col || colors.bear} opacity="0.95" />;
      })}

      {/* Labels */}
      {labels.map((lb, i) => {
        const x = P.l + lb.ci * cW + cW / 2;
        return (
          <g key={i}>
            <rect x={x - 20} y={Y(lb.price) - 14} width="40" height="13" rx="2" fill={lb.col} fillOpacity="0.9" />
            <text x={x} y={Y(lb.price) - 4} textAnchor="middle" fill="#000" fontSize="7.5" fontWeight="700" fontFamily="monospace">{lb.label}</text>
          </g>
        );
      })}
    </svg>
  );
};

// ─── MODEL DEFINITIONS ────────────────────────────────────────────────────────
const MODELS = [
  {
    id: 'MTF_CONFLUENCE',
    name: 'MTF Confluence',
    tier: 'S',
    score: '88–100%',
    active: true,
    color: '#f59e0b',
    desc: 'El modelo más fuerte. Requiere que H1 y M5 estén en la misma dirección y que el precio haga pullback a un Order Block válido.',
    rules: [
      'H1 BULLISH/BEARISH (no NEUTRAL)',
      'M5 en la misma dirección que H1',
      'Precio retrocede a zona de Order Block en M5',
      'Vela de confirmación (rechazo o engulfing) en la zona',
      'Bonus: zona en Discount (compras) o Premium (ventas)',
    ],
    diagram: () => {
      const candles = [
        {o:100,c:105,h:107,l:98},{o:105,c:112,h:114,l:104},{o:112,c:108,h:113,l:107},
        {o:108,c:115,h:116,l:107},{o:115,c:120,h:122,l:114},{o:120,c:116,h:121,l:115},
        {o:116,c:118,h:120,l:115},{o:118,c:124,h:126,l:117},{o:124,c:128,h:130,l:123},
        {o:128,c:125,h:129,l:124},{o:125,c:127,h:128,l:123},{o:127,c:133,h:135,l:126},
      ];
      return <CandleChart candles={candles}
        zones={[{ hi: 119, lo: 115, col: colors.bull, label: 'OB' }]}
        levels={[{ price: 119, col: colors.entry, label: 'ENT', lw: 2 },
                 { price: 127, col: colors.tp, label: 'TP1', dash: '4,3' },
                 { price: 112, col: colors.sl, label: 'SL', dash: '4,3' }]}
        arrows={[{ ci: 10, price: 121, dir: 'up', col: colors.bull }]}
      />;
    }
  },
  {
    id: 'M1_PRECISION',
    name: 'M1 Precision',
    tier: 'S',
    score: '82–97%',
    active: true,
    color: '#06b6d4',
    desc: 'Estrategia de 3 temporalidades. H1 define la tendencia, M15 identifica la zona de interés, M1 da la entrada precisa.',
    rules: [
      'H1 = M15 = M5: misma dirección (triple confluencia)',
      'Precio en zona de demanda/oferta identificada en M15',
      'En M1: CHoCH, OB Engulfing, o Pin Bar (mecha larga)',
      'Score sube con cada confirmación adicional',
      'Requiere los 3 timeframes alineados — sin excepción',
    ],
    diagram: () => {
      const candles = [
        {o:100,c:103,h:105,l:99},{o:103,c:101,h:104,l:100},{o:101,c:104,h:105,l:100},
        {o:104,c:102,h:105,l:101},{o:102,c:105,h:106,l:101},{o:105,c:103,h:106,l:102},
        {o:103,c:101,h:104,l:100},{o:101,c:100,h:102,l:99},{o:100,c:106,h:107,l:99},
        {o:106,c:110,h:111,l:105},{o:110,c:108,h:111,l:107},{o:108,c:113,h:114,l:107},
      ];
      return <CandleChart candles={candles}
        zones={[{ hi: 105, lo: 100, col: colors.bull, label: 'M15' }]}
        levels={[{ price: 106, col: colors.entry, label: 'ENT', lw: 2.5 },
                 { price: 113, col: colors.tp, label: 'TP2', dash: '4,3' },
                 { price: 98, col: colors.sl, label: 'SL', dash: '4,3' }]}
        arrows={[{ ci: 8, price: 97, dir: 'up', col: colors.bull }]}
        labels={[{ ci: 8, price: 108, label: 'CHoCH', col: colors.liq }]}
      />;
    }
  },
  {
    id: 'CHOCH_PULLBACK',
    name: 'CHoCH + Pullback',
    tier: 'A',
    score: '85–92%',
    active: true,
    color: '#8b5cf6',
    desc: 'Change of Character detectado (CHoCH) seguido de pullback al Order Block que generó el cambio de dirección.',
    rules: [
      'CHoCH confirmado: precio rompe último mínimo relevante (LONG) o máximo (SHORT)',
      'Pullback al OB que originó el CHoCH',
      'H1 y M15 no deben estar en contra de la dirección del trade',
      'Confirmación en el OB (engulfing o wick)',
      'Bonus: MTF confluence (+5 puntos)',
    ],
    diagram: () => {
      const candles = [
        {o:110,c:106,h:111,l:105},{o:106,c:108,h:109,l:105},{o:108,c:104,h:109,l:103},
        {o:104,c:106,h:107,l:103},{o:106,c:102,h:107,l:101},{o:102,c:104,h:105,l:101},
        {o:104,c:100,h:105,l:99},{o:100,c:107,h:108,l:99},{o:107,c:105,h:108,l:104},
        {o:105,c:108,h:109,l:104},{o:108,c:112,h:113,l:107},{o:112,c:115,h:116,l:111},
      ];
      return <CandleChart candles={candles}
        zones={[{ hi: 106, lo: 102, col: colors.bull, label: 'OB' }]}
        levels={[{ price: 107, col: colors.entry, label: 'ENT', lw: 2 },
                 { price: 114, col: colors.tp, label: 'TP1', dash: '4,3' },
                 { price: 99, col: colors.sl, label: 'SL', dash: '4,3' }]}
        arrows={[{ ci: 7, price: 97, dir: 'up', col: colors.bull }]}
        labels={[{ ci: 7, price: 110, label: 'CHoCH', col: '#8b5cf6' }]}
      />;
    }
  },
  {
    id: 'LIQUIDITY_GRAB',
    name: 'Liquidity Grab',
    tier: 'B',
    score: '80–92%',
    active: true,
    color: '#06b6d4',
    desc: 'El precio barre la liquidez (stop hunts) por encima de un máximo o debajo de un mínimo y revierte inmediatamente. H1 y M15 deben alinearse.',
    rules: [
      'Vela previa: rompe el máximo/mínimo anterior',
      'Vela previa: cierra de vuelta dentro del rango = engulfing falso',
      'Vela actual: continúa la reversión',
      'LONG: H1 no debe ser BEARISH · M15 no debe ser BEARISH',
      'SHORT: H1 no debe ser BULLISH · M15 no debe ser BULLISH',
    ],
    diagram: () => {
      const candles = [
        {o:100,c:103,h:104,l:99},{o:103,c:106,h:107,l:102},{o:106,c:109,h:110,l:105},
        {o:109,c:107,h:115,l:106},{o:107,c:103,h:108,l:102},{o:103,c:101,h:104,l:100},
        {o:101,c:99,h:102,l:98},{o:99,c:100,h:101,l:97},{o:100,c:98,h:101,l:97},
        {o:98,c:95,h:99,l:94},{o:95,c:92,h:96,l:91},{o:92,c:90,h:93,l:89},
      ];
      return <CandleChart candles={candles}
        levels={[{ price: 103, col: colors.sl, label: 'SL', lw: 1.5, dash: '5,3' },
                 { price: 100, col: colors.entry, label: 'ENT', lw: 2.5 },
                 { price: 93, col: colors.tp, label: 'TP1', dash: '4,3' }]}
        arrows={[{ ci: 4, price: 116, dir: 'down', col: colors.bear }]}
        labels={[{ ci: 3, price: 117, label: 'GRAB', col: colors.liq }]}
      />;
    }
  },
  {
    id: 'BOS_CONTINUATION',
    name: 'BOS Continuation',
    tier: 'B',
    score: '82–90%',
    active: true,
    color: '#10b981',
    desc: 'Break of Structure confirmado en dirección de la tendencia H1. El precio rompe un swing alto/bajo y hace pullback para continuar.',
    rules: [
      'BOS detectado: precio rompe último swing en dirección de H1',
      'Pullback al nivel del BOS (se convierte en soporte/resistencia)',
      'H1 y M15 en la misma dirección que el BOS',
      'Confirmación en el pullback',
      'No operar si el BOS fue hace más de 10 velas',
    ],
    diagram: () => {
      const candles = [
        {o:100,c:104,h:105,l:99},{o:104,c:102,h:105,l:101},{o:102,c:107,h:108,l:101},
        {o:107,c:105,h:108,l:104},{o:105,c:110,h:111,l:104},{o:110,c:108,h:111,l:107},
        {o:108,c:114,h:115,l:107},{o:114,c:111,h:115,l:110},{o:111,c:114,h:115,l:110},
        {o:114,c:118,h:119,l:113},{o:118,c:116,h:119,l:115},{o:116,c:121,h:122,l:115},
      ];
      return <CandleChart candles={candles}
        levels={[{ price: 110, col: colors.entry, label: 'BOS', lw: 2 },
                 { price: 120, col: colors.tp, label: 'TP1', dash: '4,3' },
                 { price: 105, col: colors.sl, label: 'SL', dash: '4,3' }]}
        arrows={[{ ci: 8, price: 108, dir: 'up', col: colors.bull }]}
        labels={[{ ci: 6, price: 116, label: 'BOS↑', col: colors.bull }]}
      />;
    }
  },
  {
    id: 'FVG_ENTRY',
    name: 'Fair Value Gap',
    tier: 'B',
    score: '80–88%',
    active: true,
    color: '#8b5cf6',
    desc: 'Desequilibrio de precio (gap) que el mercado tiende a llenar. Se entra cuando el precio regresa a llenar el FVG en dirección de la tendencia.',
    rules: [
      'FVG: vela 1 high < vela 3 low (alcista) o vela 1 low > vela 3 high (bajista)',
      'Precio retorna al gap para "llenarlo"',
      'H1 y M15 no deben estar en contra',
      'Entrada al 50% del FVG o al toque del borde',
      'Stop: por debajo/encima del FVG + buffer',
    ],
    diagram: () => {
      const candles = [
        {o:100,c:104,h:105,l:99},{o:104,c:108,h:115,l:103},{o:115,c:118,h:120,l:114},
        {o:118,c:121,h:122,l:117},{o:121,c:117,h:122,l:116},{o:117,c:114,h:118,l:113},
        {o:114,c:115,h:116,l:112},{o:115,c:120,h:121,l:114},{o:120,c:124,h:125,l:119},
        {o:124,c:122,h:125,l:121},{o:122,c:126,h:127,l:121},{o:126,c:130,h:131,l:125},
      ];
      return <CandleChart candles={candles}
        zones={[{ hi: 115, lo: 108, col: colors.fvg, label: 'FVG' }]}
        levels={[{ price: 113, col: colors.entry, label: 'ENT', lw: 2 },
                 { price: 125, col: colors.tp, label: 'TP1', dash: '4,3' },
                 { price: 106, col: colors.sl, label: 'SL', dash: '4,3' }]}
        arrows={[{ ci: 6, price: 110, dir: 'up', col: colors.bull }]}
      />;
    }
  },
  {
    id: 'OTE_ENTRY',
    name: 'OTE Entry',
    tier: 'S',
    score: '88–96%',
    active: true,
    color: '#f59e0b',
    desc: 'Optimal Trade Entry basado en Fibonacci 61.8%–79% del último impulso. El precio retrocede a la zona óptima dentro de la estructura alcista/bajista.',
    rules: [
      'Identificar impulso claro (BOS confirmado)',
      'Retroceso del precio a zona Fibonacci 61.8%–79%',
      'Zona coincide con Order Block o FVG (confluencia)',
      'Vela de confirmación en la zona OTE',
      'H1 en la misma dirección del impulso',
    ],
    diagram: () => {
      const candles = [
        {o:100,c:106,h:107,l:99},{o:106,c:112,h:113,l:105},{o:112,c:119,h:120,l:111},
        {o:119,c:115,h:120,l:114},{o:115,c:112,h:116,l:111},{o:112,c:113,h:114,l:110},
        {o:113,c:111,h:114,l:110},{o:111,c:116,h:117,l:110},{o:116,c:120,h:121,l:115},
        {o:120,c:124,h:125,l:119},{o:124,c:128,h:129,l:123},{o:128,c:132,h:133,l:127},
      ];
      return <CandleChart candles={candles}
        zones={[{ hi: 114, lo: 111, col: colors.neutral, label: 'OTE' }]}
        levels={[{ price: 113, col: colors.entry, label: 'ENT', lw: 2.5 },
                 { price: 125, col: colors.tp, label: 'TP1', dash: '4,3' },
                 { price: 108, col: colors.sl, label: 'SL', dash: '4,3' }]}
        arrows={[{ ci: 7, price: 108, dir: 'up', col: colors.bull }]}
      />;
    }
  },
  {
    id: 'INDUCEMENT',
    name: 'Inducement',
    tier: 'A',
    score: '83–91%',
    active: true,
    color: '#ec4899',
    desc: 'El mercado genera un falso movimiento para capturar stops antes del movimiento real. Se detecta cuando el precio barre liquidez y luego revierte con fuerza.',
    rules: [
      'Precio barre liquidez obvia (mínimos/máximos de la sesión)',
      'Reversión inmediata con vela fuerte en dirección opuesta',
      'La vela de reversión cierra más allá del nivel de liquidez',
      'H1 y M15 deben apoyar la dirección de la reversión',
      'Confirmar con estructura: CHoCH o BOS en M5',
    ],
    diagram: () => {
      const candles = [
        {o:108,c:112,h:113,l:107},{o:112,c:109,h:113,l:108},{o:109,c:111,h:112,l:108},
        {o:111,c:106,h:112,l:103},{o:106,c:112,h:113,l:105},{o:112,c:115,h:116,l:111},
        {o:115,c:113,h:116,l:112},{o:113,c:117,h:118,l:112},{o:117,c:121,h:122,l:116},
        {o:121,c:119,h:122,l:118},{o:119,c:123,h:124,l:118},{o:123,c:127,h:128,l:122},
      ];
      return <CandleChart candles={candles}
        levels={[{ price: 103, col: colors.liq, label: 'LIQ', lw: 1.5, dash: '4,3' },
                 { price: 108, col: colors.entry, label: 'ENT', lw: 2 },
                 { price: 120, col: colors.tp, label: 'TP1', dash: '4,3' },
                 { price: 100, col: colors.sl, label: 'SL', dash: '4,3' }]}
        arrows={[{ ci: 4, price: 100, dir: 'up', col: colors.bull }]}
        labels={[{ ci: 3, price: 100, label: 'SWEEP', col: colors.liq }]}
      />;
    }
  },
];

const TIER_COLOR = { S: '#f59e0b', A: '#8b5cf6', B: '#10b981', C: '#6b7280' };
const TIER_LABEL = { S: 'Elite', A: 'Alto', B: 'Bueno', C: 'Complementario' };

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function ModelosGuia() {
  const [selected, setSelected] = useState(MODELS[0].id);
  const model = MODELS.find(m => m.id === selected);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-[#0c0c18] rounded-xl border border-white/[0.05] p-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-white font-bold text-base">Modelos SMC Activos</h2>
            <p className="text-white/35 text-xs mt-0.5">{MODELS.length} modelos · Todos requieren H1 y M15 no en contra de la operación</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {['S','A','B'].map(t=>(
              <div key={t} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border" style={{borderColor:`${TIER_COLOR[t]}30`,background:`${TIER_COLOR[t]}10`}}>
                <span className="text-xs font-bold" style={{color:TIER_COLOR[t]}}>Tier {t}</span>
                <span className="text-white/30 text-[10px]">— {TIER_LABEL[t]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Model list */}
        <div className="bg-[#0c0c18] rounded-xl border border-white/[0.05] overflow-hidden">
          <div className="p-3 border-b border-white/[0.04]">
            <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold">Seleccionar modelo</p>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {MODELS.map(m=>(
              <button key={m.id} onClick={()=>setSelected(m.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all ${selected===m.id?'bg-white/8':'hover:bg-white/4'}`}>
                <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{background:m.color}}/>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-white text-xs font-semibold truncate">{m.name}</p>
                    <span className="text-[8px] font-bold px-1 py-0.5 rounded flex-shrink-0" style={{background:`${TIER_COLOR[m.tier]}20`,color:TIER_COLOR[m.tier]}}>T{m.tier}</span>
                  </div>
                  <p className="text-white/25 text-[9px]">{m.score}</p>
                </div>
                {selected===m.id&&<span className="text-white/40 text-xs flex-shrink-0">→</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Model detail */}
        <div className="lg:col-span-2 space-y-3">
          {/* Title + tier */}
          <div className="bg-[#0c0c18] rounded-xl border border-white/[0.05] p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-2 h-10 rounded-full flex-shrink-0" style={{background:model.color}}/>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-bold text-base">{model.name}</h3>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-md" style={{background:`${TIER_COLOR[model.tier]}20`,color:TIER_COLOR[model.tier]}}>Tier {model.tier} — {TIER_LABEL[model.tier]}</span>
                </div>
                <p className="text-white/35 text-[10px] font-mono mt-0.5">Score: {model.score}</p>
              </div>
            </div>
            <p className="text-white/60 text-sm leading-relaxed">{model.desc}</p>
          </div>

          {/* SVG Diagram */}
          <div className="bg-[#0c0c18] rounded-xl border border-white/[0.05] p-4">
            <p className="text-white/30 text-[10px] uppercase tracking-widest font-semibold mb-3">Diagrama — Ejemplo LONG</p>
            <div className="rounded-lg overflow-hidden">
              {model.diagram()}
            </div>
            <div className="flex gap-4 mt-3 flex-wrap">
              {[{c:colors.entry,l:'Entrada'},{c:colors.tp,l:'Take Profit'},{c:colors.sl,l:'Stop Loss'},{c:colors.bull,l:'OB / Zona'}].map(({c,l})=>(
                <div key={l} className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 rounded-full" style={{background:c}}/>
                  <span className="text-white/30 text-[9px]">{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rules */}
          <div className="bg-[#0c0c18] rounded-xl border border-white/[0.05] p-4">
            <p className="text-white/30 text-[10px] uppercase tracking-widest font-semibold mb-3">Reglas de activación</p>
            <div className="space-y-2">
              {model.rules.map((r,i)=>(
                <div key={i} className="flex gap-2.5">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[9px] font-bold text-black" style={{background:model.color}}>{i+1}</div>
                  <p className="text-white/55 text-xs leading-relaxed">{r}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Why this signal fired (contextual) */}
          {selected==='LIQUIDITY_GRAB'&&(
            <div className="bg-red-500/8 rounded-xl border border-red-500/20 p-4">
              <p className="text-red-400 text-xs font-bold mb-2">⚠️ Por qué se generó la señal SHORT incorrecta</p>
              <p className="text-white/50 text-xs leading-relaxed">
                El LIQUIDITY_GRAB SHORT en Step Index se disparó porque el precio estaba en zona PREMIUM en H1 — esa condición era suficiente en la versión anterior. El código ha sido corregido: ahora el modelo <strong className="text-white/70">requiere obligatoriamente</strong> que H1 y M15 no estén en dirección opuesta al trade. Un SHORT con H1 BULLISH y M15 BULLISH ya no es posible.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Summary table */}
      <div className="bg-[#0c0c18] rounded-xl border border-white/[0.05] overflow-hidden">
        <div className="p-3 border-b border-white/[0.04]">
          <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold">Resumen de filtros por modelo</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-white/[0.02]">
              {['Modelo','Tier','Score','Requiere H1','Requiere M15','Requiere Pullback OB','Requiere M1 Confirm'].map(h=>(
                <th key={h} className="px-3 py-2 text-left text-[8px] uppercase tracking-widest text-white/20 font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.03]">
              {[
                ['MTF Confluence','S','88–100%','✅ Alineado','✅ Bonus','✅ Obligatorio','—'],
                ['M1 Precision','S','82–97%','✅ Alineado','✅ Alineado','✅ Zona M15','✅ CHoCH/OB/Wick'],
                ['CHoCH + Pullback','A','85–92%','✅ No en contra','✅ No en contra','✅ Obligatorio','—'],
                ['Inducement','A','83–91%','✅ Apoya','✅ Bonus','— OB ayuda','—'],
                ['OTE Entry','S','88–96%','✅ Mismo dir','✅ Bonus','✅ Fib 61–79%','—'],
                ['Liquidity Grab','B','80–92%','✅ No en contra','✅ No en contra','— patrón candles','—'],
                ['BOS Continuation','B','82–90%','✅ Mismo dir','✅ Bonus','✅ Nivel BOS','—'],
                ['FVG Entry','B','80–88%','✅ No en contra','— bonus','— FVG zona','—'],
              ].map(row=>(
                <tr key={row[0]} className="hover:bg-white/[0.015] transition-colors">
                  {row.map((cell,i)=>(
                    <td key={i} className={`px-3 py-2 ${i===0?'text-white/65 font-medium':i===1?'font-bold':'text-white/35'} ${cell==='✅ Obligatorio'||cell==='✅ Alineado'||cell==='✅ Mismo dir'?'text-emerald-400':cell.startsWith('✅')?'text-emerald-400/70':cell==='—'?'text-white/20':''} whitespace-nowrap`}>
                      {i===1?<span className="px-1.5 py-0.5 rounded text-[9px]" style={{background:`${TIER_COLOR[cell]}20`,color:TIER_COLOR[cell]}}>{cell}</span>:cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
