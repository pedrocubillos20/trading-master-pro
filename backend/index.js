// =============================================
// TRADING MASTER PRO v12.1
// 6 MODELOS SMC COMPLETOS:
// 1. CHOCH_PULLBACK - Cambio de estructura + pullback
// 2. BOS_CONTINUATION - Continuación de tendencia
// 3. FVG_ENTRY - Fair Value Gap (imbalances)
// 4. LIQUIDITY_SWEEP - Caza de liquidez + reversión
// 5. ORDER_FLOW - Confirmación con volumen/momentum
// 6. MTF_CONFLUENCE - Multi-Timeframe (H1 + M5)
// =============================================

import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// =============================================
// CONFIGURACIÓN DE ACTIVOS
// =============================================
const ASSETS = {
  'stpRNG': { 
    name: 'Step Index', 
    shortName: 'Step',
    emoji: '📊', 
    type: 'synthetic',
    decimals: 2, 
    slBuffer: 2.0,
    minScore: 70,
    avgVolume: 1000
  },
  '1HZ75V': { 
    name: 'Volatility 75', 
    shortName: 'V75',
    emoji: '📈', 
    type: 'synthetic',
    decimals: 2, 
    slBuffer: 5.0,
    minScore: 70,
    avgVolume: 1500
  },
  'frxXAUUSD': { 
    name: 'Oro (XAU/USD)', 
    shortName: 'XAU',
    emoji: '🥇', 
    type: 'commodity',
    decimals: 2, 
    slBuffer: 1.0,
    minScore: 65,
    avgVolume: 5000
  },
  'frxGBPUSD': { 
    name: 'GBP/USD', 
    shortName: 'GBP',
    emoji: '💷', 
    type: 'forex',
    decimals: 5, 
    slBuffer: 0.0003,
    minScore: 65,
    avgVolume: 3000
  },
  'cryBTCUSD': { 
    name: 'Bitcoin (BTC/USD)', 
    shortName: 'BTC',
    emoji: '₿', 
    type: 'crypto',
    decimals: 2, 
    slBuffer: 50,
    minScore: 65,
    avgVolume: 10000
  }
};

// Timeframes
const GRANULARITY_M5 = 300;  // 5 minutos
const GRANULARITY_H1 = 3600; // 1 hora (para MTF)

// =============================================
// ESTADO GLOBAL
// =============================================
let derivWs = null;
let isConnected = false;

const assetData = {};
for (const symbol of Object.keys(ASSETS)) {
  assetData[symbol] = {
    candles: [],        // M5
    candlesH1: [],      // H1 para MTF
    price: null,
    signal: null,
    lockedSignal: null,
    lastAnalysis: 0,
    // Zonas y estructura
    demandZones: [],
    supplyZones: [],
    fvgZones: [],       // Fair Value Gaps
    liquidityLevels: [], // Niveles de liquidez
    swings: [],
    structure: null,
    structureH1: null,  // Estructura en H1
    // Alertas
    structureAlert: null,
    narration: null
  };
}

let signalHistory = [];
let signalIdCounter = 1;

// Estadísticas con aprendizaje
const stats = {
  total: 0, wins: 0, losses: 0, pending: 0,
  tp1Hits: 0, tp2Hits: 0, tp3Hits: 0,
  byModel: {},
  byAsset: {},
  learning: { scoreAdjustments: {} }
};

for (const symbol of Object.keys(ASSETS)) {
  stats.byAsset[symbol] = { wins: 0, losses: 0, total: 0 };
}

// =============================================
// MOTOR SMC v12.1 - 6 MODELOS
// =============================================
const SMC = {
  
  // ═══════════════════════════════════════════
  // UTILIDADES BASE
  // ═══════════════════════════════════════════
  
  findSwings(candles, lookback = 3) {
    const swings = [];
    for (let i = lookback; i < candles.length - lookback; i++) {
      const c = candles[i];
      const left = candles.slice(i - lookback, i);
      const right = candles.slice(i + 1, i + lookback + 1);
      
      const isHigh = left.every(x => x.high <= c.high) && right.every(x => x.high < c.high);
      const isLow = left.every(x => x.low >= c.low) && right.every(x => x.low > c.low);
      
      if (isHigh) swings.push({ type: 'high', price: c.high, index: i, time: c.time });
      if (isLow) swings.push({ type: 'low', price: c.low, index: i, time: c.time });
    }
    return swings;
  },

  getAvgRange(candles, period = 20) {
    const recent = candles.slice(-period);
    if (recent.length === 0) return 0;
    return recent.reduce((sum, c) => sum + (c.high - c.low), 0) / recent.length;
  },

  getAvgBody(candles, period = 20) {
    const recent = candles.slice(-period);
    if (recent.length === 0) return 0;
    return recent.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / recent.length;
  },

  // ═══════════════════════════════════════════
  // MODELO 1: ESTRUCTURA Y CHoCH
  // ═══════════════════════════════════════════
  
  analyzeStructure(swings) {
    const highs = swings.filter(s => s.type === 'high').slice(-6);
    const lows = swings.filter(s => s.type === 'low').slice(-6);
    
    let trend = 'NEUTRAL';
    let strength = 0;
    
    if (highs.length >= 2 && lows.length >= 2) {
      const hhCount = highs.filter((h, i) => i > 0 && h.price > highs[i-1].price).length;
      const hlCount = lows.filter((l, i) => i > 0 && l.price > lows[i-1].price).length;
      const lhCount = highs.filter((h, i) => i > 0 && h.price < highs[i-1].price).length;
      const llCount = lows.filter((l, i) => i > 0 && l.price < lows[i-1].price).length;
      
      const bullScore = hhCount + hlCount;
      const bearScore = lhCount + llCount;
      
      if (bullScore >= 2 && bullScore > bearScore) {
        trend = 'BULLISH';
        strength = bullScore * 20;
      } else if (bearScore >= 2 && bearScore > bullScore) {
        trend = 'BEARISH';
        strength = bearScore * 20;
      }
    }
    
    return { trend, strength, highs, lows };
  },

  detectCHoCH(candles, swings) {
    if (swings.length < 5) return null;
    
    const highs = swings.filter(s => s.type === 'high');
    const lows = swings.filter(s => s.type === 'low');
    const last10 = candles.slice(-10);
    
    // CHoCH Alcista
    for (let i = Math.max(0, highs.length - 3); i < highs.length; i++) {
      const targetHigh = highs[i];
      const lowsBefore = lows.filter(l => l.index < targetHigh.index).slice(-3);
      
      const hadDowntrend = lowsBefore.length >= 2 && 
        lowsBefore.some((l, idx) => idx > 0 && l.price < lowsBefore[idx-1].price);
      const brokeHigh = last10.some(c => c.close > targetHigh.price * 1.001);
      
      if (hadDowntrend && brokeHigh) {
        return { type: 'BULLISH_CHOCH', side: 'BUY', level: targetHigh.price, confidence: 85 };
      }
    }
    
    // CHoCH Bajista
    for (let i = Math.max(0, lows.length - 3); i < lows.length; i++) {
      const targetLow = lows[i];
      const highsBefore = highs.filter(h => h.index < targetLow.index).slice(-3);
      
      const hadUptrend = highsBefore.length >= 2 &&
        highsBefore.some((h, idx) => idx > 0 && h.price > highsBefore[idx-1].price);
      const brokeLow = last10.some(c => c.close < targetLow.price * 0.999);
      
      if (hadUptrend && brokeLow) {
        return { type: 'BEARISH_CHOCH', side: 'SELL', level: targetLow.price, confidence: 85 };
      }
    }
    
    return null;
  },

  // ═══════════════════════════════════════════
  // MODELO 2: BOS (Break of Structure) - CONTINUACIÓN
  // ═══════════════════════════════════════════
  
  detectBOS(candles, swings, structure) {
    if (swings.length < 4) return null;
    
    const highs = swings.filter(s => s.type === 'high').slice(-4);
    const lows = swings.filter(s => s.type === 'low').slice(-4);
    const last5 = candles.slice(-5);
    const currentPrice = candles[candles.length - 1].close;
    
    // BOS Alcista: En tendencia alcista, rompe el último high
    if (structure.trend === 'BULLISH' && highs.length >= 2) {
      const lastHigh = highs[highs.length - 1];
      const prevHigh = highs[highs.length - 2];
      
      // Confirmación: último high > previo high (HH)
      if (lastHigh.price > prevHigh.price) {
        // Precio rompió el último high
        const brokeHigh = last5.some(c => c.close > lastHigh.price * 1.0005);
        
        if (brokeHigh) {
          return {
            type: 'BULLISH_BOS',
            side: 'BUY',
            level: lastHigh.price,
            confidence: 80,
            description: 'Continuación alcista - BOS confirmado'
          };
        }
      }
    }
    
    // BOS Bajista
    if (structure.trend === 'BEARISH' && lows.length >= 2) {
      const lastLow = lows[lows.length - 1];
      const prevLow = lows[lows.length - 2];
      
      if (lastLow.price < prevLow.price) {
        const brokeLow = last5.some(c => c.close < lastLow.price * 0.9995);
        
        if (brokeLow) {
          return {
            type: 'BEARISH_BOS',
            side: 'SELL',
            level: lastLow.price,
            confidence: 80,
            description: 'Continuación bajista - BOS confirmado'
          };
        }
      }
    }
    
    return null;
  },

  // ═══════════════════════════════════════════
  // MODELO 3: FVG (Fair Value Gap) - IMBALANCES
  // ═══════════════════════════════════════════
  
  findFVGs(candles) {
    const fvgs = [];
    if (candles.length < 5) return fvgs;
    
    for (let i = 2; i < candles.length - 1; i++) {
      const c1 = candles[i - 2]; // Primera vela
      const c2 = candles[i - 1]; // Vela del medio (impulso)
      const c3 = candles[i];     // Tercera vela
      
      const c2Body = Math.abs(c2.close - c2.open);
      const avgBody = this.getAvgBody(candles.slice(0, i), 10);
      
      // FVG Alcista: Gap entre high de c1 y low de c3
      if (c2.close > c2.open && c2Body > avgBody * 1.5) {
        const gapHigh = c3.low;
        const gapLow = c1.high;
        
        if (gapHigh > gapLow) {
          fvgs.push({
            type: 'BULLISH_FVG',
            side: 'BUY',
            high: gapHigh,
            low: gapLow,
            mid: (gapHigh + gapLow) / 2,
            index: i,
            time: c2.time,
            filled: false,
            strength: c2Body / avgBody
          });
        }
      }
      
      // FVG Bajista: Gap entre low de c1 y high de c3
      if (c2.close < c2.open && c2Body > avgBody * 1.5) {
        const gapHigh = c1.low;
        const gapLow = c3.high;
        
        if (gapHigh > gapLow) {
          fvgs.push({
            type: 'BEARISH_FVG',
            side: 'SELL',
            high: gapHigh,
            low: gapLow,
            mid: (gapHigh + gapLow) / 2,
            index: i,
            time: c2.time,
            filled: false,
            strength: c2Body / avgBody
          });
        }
      }
    }
    
    // Marcar FVGs que han sido llenados
    const currentPrice = candles[candles.length - 1].close;
    fvgs.forEach(fvg => {
      const candlesAfter = candles.slice(fvg.index + 1);
      if (fvg.side === 'BUY') {
        fvg.filled = candlesAfter.some(c => c.low <= fvg.mid);
      } else {
        fvg.filled = candlesAfter.some(c => c.high >= fvg.mid);
      }
    });
    
    return fvgs.filter(f => !f.filled).slice(-5);
  },

  detectFVGEntry(candles, fvgs, structure) {
    if (fvgs.length === 0) return null;
    
    const last3 = candles.slice(-3);
    const currentPrice = candles[candles.length - 1].close;
    const lastCandle = candles[candles.length - 1];
    
    for (const fvg of fvgs) {
      // FVG Alcista: Precio retrocede al gap
      if (fvg.side === 'BUY' && structure.trend !== 'BEARISH') {
        const inZone = last3.some(c => c.low <= fvg.high && c.low >= fvg.low);
        const reaction = lastCandle.close > lastCandle.open && lastCandle.close > fvg.mid;
        
        if (inZone && reaction) {
          return {
            type: 'FVG_LONG',
            side: 'BUY',
            zone: fvg,
            confidence: 75 + (fvg.strength > 2 ? 10 : 0),
            description: `Entrada en FVG alcista (fuerza: ${fvg.strength.toFixed(1)}x)`
          };
        }
      }
      
      // FVG Bajista
      if (fvg.side === 'SELL' && structure.trend !== 'BULLISH') {
        const inZone = last3.some(c => c.high >= fvg.low && c.high <= fvg.high);
        const reaction = lastCandle.close < lastCandle.open && lastCandle.close < fvg.mid;
        
        if (inZone && reaction) {
          return {
            type: 'FVG_SHORT',
            side: 'SELL',
            zone: fvg,
            confidence: 75 + (fvg.strength > 2 ? 10 : 0),
            description: `Entrada en FVG bajista (fuerza: ${fvg.strength.toFixed(1)}x)`
          };
        }
      }
    }
    
    return null;
  },

  // ═══════════════════════════════════════════
  // MODELO 4: LIQUIDITY SWEEP - CAZA DE LIQUIDEZ
  // ═══════════════════════════════════════════
  
  findLiquidityLevels(candles, swings) {
    const levels = [];
    const avgRange = this.getAvgRange(candles);
    
    // Liquidez en Highs (stops de shorts)
    const highs = swings.filter(s => s.type === 'high').slice(-6);
    highs.forEach(h => {
      // Buscar highs con múltiples toques (igual high = liquidez acumulada)
      const touches = swings.filter(s => 
        s.type === 'high' && Math.abs(s.price - h.price) < avgRange * 0.3
      ).length;
      
      if (touches >= 2) {
        levels.push({
          type: 'HIGH_LIQUIDITY',
          price: h.price,
          touches,
          swept: false,
          index: h.index
        });
      }
    });
    
    // Liquidez en Lows (stops de longs)
    const lows = swings.filter(s => s.type === 'low').slice(-6);
    lows.forEach(l => {
      const touches = swings.filter(s => 
        s.type === 'low' && Math.abs(s.price - l.price) < avgRange * 0.3
      ).length;
      
      if (touches >= 2) {
        levels.push({
          type: 'LOW_LIQUIDITY',
          price: l.price,
          touches,
          swept: false,
          index: l.index
        });
      }
    });
    
    return levels;
  },

  detectLiquiditySweep(candles, liquidityLevels, structure) {
    if (liquidityLevels.length === 0) return null;
    
    const last5 = candles.slice(-5);
    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    const avgRange = this.getAvgRange(candles);
    
    for (const level of liquidityLevels) {
      // Sweep de liquidez en highs (para SHORT)
      if (level.type === 'HIGH_LIQUIDITY') {
        // Precio rompió el nivel (sweep)
        const swept = last5.some(c => c.high > level.price * 1.001);
        // Pero cerró debajo (rechazo)
        const rejected = lastCandle.close < level.price && 
                         lastCandle.close < lastCandle.open;
        
        if (swept && rejected) {
          return {
            type: 'LIQUIDITY_SWEEP_SHORT',
            side: 'SELL',
            level: level.price,
            touches: level.touches,
            confidence: 80 + (level.touches * 5),
            description: `Sweep de liquidez en ${level.price.toFixed(2)} (${level.touches} toques)`
          };
        }
      }
      
      // Sweep de liquidez en lows (para LONG)
      if (level.type === 'LOW_LIQUIDITY') {
        const swept = last5.some(c => c.low < level.price * 0.999);
        const rejected = lastCandle.close > level.price && 
                         lastCandle.close > lastCandle.open;
        
        if (swept && rejected) {
          return {
            type: 'LIQUIDITY_SWEEP_LONG',
            side: 'BUY',
            level: level.price,
            touches: level.touches,
            confidence: 80 + (level.touches * 5),
            description: `Sweep de liquidez en ${level.price.toFixed(2)} (${level.touches} toques)`
          };
        }
      }
    }
    
    return null;
  },

  // ═══════════════════════════════════════════
  // MODELO 5: ORDER FLOW - MOMENTUM/VOLUMEN
  // ═══════════════════════════════════════════
  
  analyzeOrderFlow(candles) {
    if (candles.length < 20) return { momentum: 'NEUTRAL', strength: 0 };
    
    const last10 = candles.slice(-10);
    const prev10 = candles.slice(-20, -10);
    
    // Calcular momentum por tamaño de cuerpos
    const recentBullish = last10.filter(c => c.close > c.open);
    const recentBearish = last10.filter(c => c.close < c.open);
    
    const bullishVolume = recentBullish.reduce((sum, c) => sum + (c.close - c.open), 0);
    const bearishVolume = recentBearish.reduce((sum, c) => sum + (c.open - c.close), 0);
    
    // Calcular aceleración
    const prevBullish = prev10.filter(c => c.close > c.open);
    const prevBullishVol = prevBullish.reduce((sum, c) => sum + (c.close - c.open), 0);
    
    let momentum = 'NEUTRAL';
    let strength = 0;
    let acceleration = 0;
    
    if (bullishVolume > bearishVolume * 1.5) {
      momentum = 'BULLISH';
      strength = (bullishVolume / (bearishVolume || 1)) * 20;
      acceleration = prevBullishVol > 0 ? (bullishVolume / prevBullishVol) : 1;
    } else if (bearishVolume > bullishVolume * 1.5) {
      momentum = 'BEARISH';
      strength = (bearishVolume / (bullishVolume || 1)) * 20;
    }
    
    // Detectar clímax de volumen
    const lastBody = Math.abs(candles[candles.length - 1].close - candles[candles.length - 1].open);
    const avgBody = this.getAvgBody(candles);
    const volumeClimax = lastBody > avgBody * 2.5;
    
    return { momentum, strength, acceleration, volumeClimax };
  },

  detectOrderFlowEntry(candles, orderFlow, structure) {
    if (orderFlow.momentum === 'NEUTRAL') return null;
    
    const lastCandle = candles[candles.length - 1];
    const last3 = candles.slice(-3);
    const avgRange = this.getAvgRange(candles);
    
    // Entrada con momentum fuerte
    if (orderFlow.momentum === 'BULLISH' && orderFlow.strength > 30) {
      // Buscar pullback pequeño en tendencia alcista
      const smallPullback = last3.some(c => c.close < c.open) && 
                            lastCandle.close > lastCandle.open;
      
      if (smallPullback && structure.trend === 'BULLISH') {
        return {
          type: 'ORDER_FLOW_LONG',
          side: 'BUY',
          momentum: orderFlow.momentum,
          strength: orderFlow.strength,
          confidence: Math.min(90, 70 + orderFlow.strength / 3),
          description: `Momentum alcista fuerte (${orderFlow.strength.toFixed(0)}%)`
        };
      }
    }
    
    if (orderFlow.momentum === 'BEARISH' && orderFlow.strength > 30) {
      const smallPullback = last3.some(c => c.close > c.open) && 
                            lastCandle.close < lastCandle.open;
      
      if (smallPullback && structure.trend === 'BEARISH') {
        return {
          type: 'ORDER_FLOW_SHORT',
          side: 'SELL',
          momentum: orderFlow.momentum,
          strength: orderFlow.strength,
          confidence: Math.min(90, 70 + orderFlow.strength / 3),
          description: `Momentum bajista fuerte (${orderFlow.strength.toFixed(0)}%)`
        };
      }
    }
    
    return null;
  },

  // ═══════════════════════════════════════════
  // MODELO 6: MTF (Multi-Timeframe Confluence)
  // ═══════════════════════════════════════════
  
  analyzeMTF(candlesM5, candlesH1) {
    if (candlesH1.length < 20) return { confluence: false, h1Trend: 'UNKNOWN' };
    
    const swingsH1 = this.findSwings(candlesH1, 2);
    const structureH1 = this.analyzeStructure(swingsH1);
    
    const swingsM5 = this.findSwings(candlesM5, 3);
    const structureM5 = this.analyzeStructure(swingsM5);
    
    // Confluencia: ambos timeframes en la misma dirección
    const confluence = structureH1.trend === structureM5.trend && 
                       structureH1.trend !== 'NEUTRAL';
    
    // H1 en zona de valor
    const h1Price = candlesH1[candlesH1.length - 1].close;
    const h1Highs = swingsH1.filter(s => s.type === 'high').slice(-3);
    const h1Lows = swingsH1.filter(s => s.type === 'low').slice(-3);
    
    let h1Zone = 'MIDDLE';
    if (h1Lows.length > 0) {
      const nearLow = h1Lows.some(l => Math.abs(h1Price - l.price) / l.price < 0.01);
      if (nearLow) h1Zone = 'DISCOUNT'; // Bueno para LONG
    }
    if (h1Highs.length > 0) {
      const nearHigh = h1Highs.some(h => Math.abs(h1Price - h.price) / h.price < 0.01);
      if (nearHigh) h1Zone = 'PREMIUM'; // Bueno para SHORT
    }
    
    return {
      confluence,
      h1Trend: structureH1.trend,
      m5Trend: structureM5.trend,
      h1Zone,
      h1Strength: structureH1.strength,
      m5Strength: structureM5.strength
    };
  },

  detectMTFEntry(candlesM5, mtfAnalysis, demandZones, supplyZones, config) {
    if (!mtfAnalysis.confluence) return null;
    
    const currentPrice = candlesM5[candlesM5.length - 1].close;
    const lastCandle = candlesM5[candlesM5.length - 1];
    const last5 = candlesM5.slice(-5);
    
    // LONG: H1 BULLISH + M5 BULLISH + En zona de descuento o demanda
    if (mtfAnalysis.h1Trend === 'BULLISH') {
      // Buscar entrada en zona de demanda M5
      for (const zone of demandZones) {
        const touchedZone = last5.some(c => c.low <= zone.high && c.low >= zone.low * 0.998);
        const reaction = lastCandle.close > lastCandle.open;
        
        if (touchedZone && reaction) {
          return {
            type: 'MTF_LONG',
            side: 'BUY',
            zone,
            mtf: mtfAnalysis,
            confidence: 85 + (mtfAnalysis.h1Zone === 'DISCOUNT' ? 10 : 0),
            description: `MTF Confluencia BULLISH (H1+M5) en zona demanda`
          };
        }
      }
    }
    
    // SHORT: H1 BEARISH + M5 BEARISH + En zona premium o supply
    if (mtfAnalysis.h1Trend === 'BEARISH') {
      for (const zone of supplyZones) {
        const touchedZone = last5.some(c => c.high >= zone.low && c.high <= zone.high * 1.002);
        const reaction = lastCandle.close < lastCandle.open;
        
        if (touchedZone && reaction) {
          return {
            type: 'MTF_SHORT',
            side: 'SELL',
            zone,
            mtf: mtfAnalysis,
            confidence: 85 + (mtfAnalysis.h1Zone === 'PREMIUM' ? 10 : 0),
            description: `MTF Confluencia BEARISH (H1+M5) en zona oferta`
          };
        }
      }
    }
    
    return null;
  },

  // ═══════════════════════════════════════════
  // ZONAS (Order Blocks)
  // ═══════════════════════════════════════════
  
  findZones(candles) {
    const demandZones = [];
    const supplyZones = [];
    const avgRange = this.getAvgRange(candles);
    
    for (let i = 3; i < candles.length - 3; i++) {
      const curr = candles[i];
      const next = candles[i + 1];
      const next2 = candles[i + 2];
      
      const bodySize = Math.abs(curr.close - curr.open);
      if (bodySize < avgRange * 0.3) continue;
      
      // DEMANDA
      if (curr.close < curr.open) {
        const strongMove = (next.close > curr.high && next.close > next.open) ||
                           (next2.close > curr.high);
        if (strongMove) {
          const tooClose = demandZones.some(z => Math.abs(z.mid - curr.low) < avgRange);
          if (!tooClose) {
            demandZones.push({
              type: 'DEMAND', high: curr.open, low: curr.low,
              mid: (curr.open + curr.low) / 2, index: i,
              strength: (next.close - curr.high > avgRange) ? 'STRONG' : 'NORMAL',
              valid: true
            });
          }
        }
      }
      
      // OFERTA
      if (curr.close > curr.open) {
        const strongMove = (next.close < curr.low && next.close < next.open) ||
                           (next2.close < curr.low);
        if (strongMove) {
          const tooClose = supplyZones.some(z => Math.abs(z.mid - curr.high) < avgRange);
          if (!tooClose) {
            supplyZones.push({
              type: 'SUPPLY', high: curr.high, low: curr.open,
              mid: (curr.high + curr.open) / 2, index: i,
              strength: (curr.low - next.close > avgRange) ? 'STRONG' : 'NORMAL',
              valid: true
            });
          }
        }
      }
    }
    
    // Invalidar zonas rotas
    demandZones.forEach(zone => {
      const after = candles.slice(zone.index + 3);
      if (after.some(c => c.close < zone.low * 0.997)) zone.valid = false;
    });
    supplyZones.forEach(zone => {
      const after = candles.slice(zone.index + 3);
      if (after.some(c => c.close > zone.high * 1.003)) zone.valid = false;
    });
    
    return {
      demandZones: demandZones.filter(z => z.valid).slice(-5),
      supplyZones: supplyZones.filter(z => z.valid).slice(-5)
    };
  },

  // ═══════════════════════════════════════════
  // PULLBACK A ZONA
  // ═══════════════════════════════════════════
  
  detectPullback(candles, demandZones, supplyZones, structure, config) {
    const last5 = candles.slice(-5);
    const lastCandle = candles[candles.length - 1];
    const currentPrice = lastCandle.close;
    
    // DEMANDA
    for (const zone of demandZones) {
      const touched = last5.some(c => c.low <= zone.high * 1.001 && c.low >= zone.low * 0.998);
      const reaction = lastCandle.close > lastCandle.open && lastCandle.close > zone.mid;
      const positionOk = currentPrice >= zone.low * 0.998 && currentPrice <= zone.high * 1.02;
      const structureOk = structure.trend !== 'BEARISH';
      
      if (touched && reaction && positionOk && structureOk) {
        const entry = Math.max(currentPrice, zone.high);
        const stop = zone.low - config.slBuffer;
        const risk = entry - stop;
        if (risk <= 0) continue;
        
        return {
          type: 'PULLBACK_DEMAND', side: 'BUY', zone,
          entry: parseFloat(entry.toFixed(config.decimals)),
          stop: parseFloat(stop.toFixed(config.decimals)),
          tp1: parseFloat((entry + risk).toFixed(config.decimals)),
          tp2: parseFloat((entry + risk * 2).toFixed(config.decimals)),
          tp3: parseFloat((entry + risk * 3).toFixed(config.decimals)),
          confidence: zone.strength === 'STRONG' ? 85 : 75
        };
      }
    }
    
    // OFERTA
    for (const zone of supplyZones) {
      const touched = last5.some(c => c.high >= zone.low * 0.999 && c.high <= zone.high * 1.002);
      const reaction = lastCandle.close < lastCandle.open && lastCandle.close < zone.mid;
      const positionOk = currentPrice <= zone.high * 1.002 && currentPrice >= zone.low * 0.98;
      const structureOk = structure.trend !== 'BULLISH';
      
      if (touched && reaction && positionOk && structureOk) {
        const entry = Math.min(currentPrice, zone.low);
        const stop = zone.high + config.slBuffer;
        const risk = stop - entry;
        if (risk <= 0) continue;
        
        return {
          type: 'PULLBACK_SUPPLY', side: 'SELL', zone,
          entry: parseFloat(entry.toFixed(config.decimals)),
          stop: parseFloat(stop.toFixed(config.decimals)),
          tp1: parseFloat((entry - risk).toFixed(config.decimals)),
          tp2: parseFloat((entry - risk * 2).toFixed(config.decimals)),
          tp3: parseFloat((entry - risk * 3).toFixed(config.decimals)),
          confidence: zone.strength === 'STRONG' ? 85 : 75
        };
      }
    }
    
    return null;
  },

  // ═══════════════════════════════════════════
  // ANÁLISIS COMPLETO - TODOS LOS MODELOS
  // ═══════════════════════════════════════════
  
  analyze(candlesM5, candlesH1, config, assetState) {
    if (candlesM5.length < 40) {
      return { action: 'LOADING', score: 0, model: 'NO_DATA' };
    }
    
    const currentPrice = candlesM5[candlesM5.length - 1].close;
    
    // Análisis base
    const swings = this.findSwings(candlesM5);
    const structure = this.analyzeStructure(swings);
    const { demandZones, supplyZones } = this.findZones(candlesM5);
    const fvgZones = this.findFVGs(candlesM5);
    const liquidityLevels = this.findLiquidityLevels(candlesM5, swings);
    const orderFlow = this.analyzeOrderFlow(candlesM5);
    const mtfAnalysis = this.analyzeMTF(candlesM5, candlesH1);
    
    // Guardar en estado
    assetState.demandZones = demandZones;
    assetState.supplyZones = supplyZones;
    assetState.fvgZones = fvgZones;
    assetState.liquidityLevels = liquidityLevels;
    assetState.swings = swings.slice(-10);
    assetState.structure = structure;
    assetState.structureH1 = { trend: mtfAnalysis.h1Trend };
    
    // Detectar señales de cada modelo
    const choch = this.detectCHoCH(candlesM5, swings);
    const bos = this.detectBOS(candlesM5, swings, structure);
    const fvgEntry = this.detectFVGEntry(candlesM5, fvgZones, structure);
    const liquiditySweep = this.detectLiquiditySweep(candlesM5, liquidityLevels, structure);
    const orderFlowEntry = this.detectOrderFlowEntry(candlesM5, orderFlow, structure);
    const mtfEntry = this.detectMTFEntry(candlesM5, mtfAnalysis, demandZones, supplyZones, config);
    const pullback = this.detectPullback(candlesM5, demandZones, supplyZones, structure, config);
    
    // Evaluar modelos por prioridad
    const models = [];
    
    // 1. MTF + Pullback (más confiable)
    if (mtfEntry && pullback && mtfEntry.side === pullback.side) {
      models.push({
        name: 'MTF_CONFLUENCE',
        signal: mtfEntry,
        pullback,
        score: 95,
        priority: 1
      });
    }
    
    // 2. CHoCH + Pullback
    if (choch && pullback && choch.side === pullback.side) {
      models.push({
        name: 'CHOCH_PULLBACK',
        signal: choch,
        pullback,
        score: 90,
        priority: 2
      });
    }
    
    // 3. Liquidity Sweep + Zona
    if (liquiditySweep && pullback && liquiditySweep.side === pullback.side) {
      models.push({
        name: 'LIQUIDITY_SWEEP',
        signal: liquiditySweep,
        pullback,
        score: 85,
        priority: 3
      });
    }
    
    // 4. BOS + Pullback (continuación)
    if (bos && pullback && bos.side === pullback.side) {
      models.push({
        name: 'BOS_CONTINUATION',
        signal: bos,
        pullback,
        score: 80,
        priority: 4
      });
    }
    
    // 5. FVG Entry
    if (fvgEntry) {
      // Calcular niveles para FVG
      const zone = fvgEntry.zone;
      const isLong = fvgEntry.side === 'BUY';
      const entry = isLong ? zone.high : zone.low;
      const stop = isLong ? zone.low - config.slBuffer : zone.high + config.slBuffer;
      const risk = Math.abs(entry - stop);
      
      models.push({
        name: 'FVG_ENTRY',
        signal: fvgEntry,
        pullback: {
          side: fvgEntry.side,
          entry: parseFloat(entry.toFixed(config.decimals)),
          stop: parseFloat(stop.toFixed(config.decimals)),
          tp1: parseFloat((isLong ? entry + risk : entry - risk).toFixed(config.decimals)),
          tp2: parseFloat((isLong ? entry + risk * 2 : entry - risk * 2).toFixed(config.decimals)),
          tp3: parseFloat((isLong ? entry + risk * 3 : entry - risk * 3).toFixed(config.decimals))
        },
        score: fvgEntry.confidence,
        priority: 5
      });
    }
    
    // 6. Order Flow puro
    if (orderFlowEntry && !models.some(m => m.signal.side === orderFlowEntry.side)) {
      const isLong = orderFlowEntry.side === 'BUY';
      const avgRange = this.getAvgRange(candlesM5);
      const entry = currentPrice;
      const stop = isLong ? entry - avgRange * 2 : entry + avgRange * 2;
      const risk = Math.abs(entry - stop);
      
      models.push({
        name: 'ORDER_FLOW',
        signal: orderFlowEntry,
        pullback: {
          side: orderFlowEntry.side,
          entry: parseFloat(entry.toFixed(config.decimals)),
          stop: parseFloat(stop.toFixed(config.decimals)),
          tp1: parseFloat((isLong ? entry + risk : entry - risk).toFixed(config.decimals)),
          tp2: parseFloat((isLong ? entry + risk * 2 : entry - risk * 2).toFixed(config.decimals)),
          tp3: parseFloat((isLong ? entry + risk * 3 : entry - risk * 3).toFixed(config.decimals))
        },
        score: orderFlowEntry.confidence,
        priority: 6
      });
    }
    
    // Seleccionar mejor modelo
    if (models.length === 0) {
      return {
        action: 'WAIT',
        score: 0,
        model: 'NO_SETUP',
        reason: 'Sin setup válido',
        analysis: {
          structure: structure.trend,
          h1Trend: mtfAnalysis.h1Trend,
          orderFlow: orderFlow.momentum,
          fvgCount: fvgZones.length,
          liquidityLevels: liquidityLevels.length
        }
      };
    }
    
    // Ordenar por score y prioridad
    models.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.priority - b.priority;
    });
    
    const best = models[0];
    
    // Aplicar ajuste de aprendizaje
    const learningAdjust = stats.learning.scoreAdjustments[best.name] || 0;
    const finalScore = Math.min(100, Math.max(0, best.score + learningAdjust));
    
    // Validar score mínimo
    if (finalScore < config.minScore) {
      return {
        action: 'WAIT',
        score: finalScore,
        model: best.name,
        reason: `Score ${finalScore}% < ${config.minScore}% mínimo`,
        potentialSetup: best,
        analysis: {
          structure: structure.trend,
          h1Trend: mtfAnalysis.h1Trend,
          orderFlow: orderFlow.momentum
        }
      };
    }
    
    const pb = best.pullback;
    return {
      action: pb.side === 'BUY' ? 'LONG' : 'SHORT',
      model: best.name,
      score: finalScore,
      entry: pb.entry,
      stop: pb.stop,
      tp1: pb.tp1,
      tp2: pb.tp2,
      tp3: pb.tp3,
      reason: best.signal.description || best.name,
      allModels: models.map(m => ({ name: m.name, score: m.score })),
      analysis: {
        structure: structure.trend,
        h1Trend: mtfAnalysis.h1Trend,
        mtfConfluence: mtfAnalysis.confluence,
        orderFlow: orderFlow.momentum,
        orderFlowStrength: orderFlow.strength,
        choch: choch?.type,
        bos: bos?.type,
        fvgCount: fvgZones.length,
        liquidityLevels: liquidityLevels.length
      }
    };
  }
};

// =============================================
// NARRADOR IA
// =============================================
const Narrator = {
  generate(symbol) {
    const data = assetData[symbol];
    const config = ASSETS[symbol];
    if (!data || !config) return null;
    
    const lines = [];
    const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const signal = data.signal;
    const locked = data.lockedSignal;
    
    lines.push(`⏰ ${time} | ${config.name} (M5)`);
    lines.push(`${'━'.repeat(30)}`);
    
    if (data.candles.length < 20) {
      lines.push(`🔄 Cargando datos...`);
      return { text: lines.join('\n'), type: 'loading' };
    }
    
    // Precio
    const price = data.price;
    const recent = data.candles.slice(-10);
    const change = ((price - recent[0].close) / recent[0].close * 100);
    lines.push(`💰 ${price?.toFixed(config.decimals)} (${change > 0 ? '+' : ''}${change.toFixed(2)}%)`);
    lines.push(``);
    
    // Análisis multi-modelo
    const analysis = signal?.analysis;
    if (analysis) {
      // Estructura
      const structEmoji = analysis.structure === 'BULLISH' ? '🐂' : 
                          analysis.structure === 'BEARISH' ? '🐻' : '⚖️';
      lines.push(`${structEmoji} M5: ${analysis.structure}`);
      
      if (analysis.h1Trend) {
        const h1Emoji = analysis.h1Trend === 'BULLISH' ? '🐂' : 
                        analysis.h1Trend === 'BEARISH' ? '🐻' : '⚖️';
        lines.push(`${h1Emoji} H1: ${analysis.h1Trend}`);
        
        if (analysis.mtfConfluence) {
          lines.push(`✨ MTF CONFLUENCIA ✨`);
        }
      }
      
      // Order Flow
      if (analysis.orderFlow !== 'NEUTRAL') {
        const ofEmoji = analysis.orderFlow === 'BULLISH' ? '📈' : '📉';
        lines.push(`${ofEmoji} Momentum: ${analysis.orderFlow} (${analysis.orderFlowStrength?.toFixed(0)}%)`);
      }
      
      // Detecciones
      if (analysis.choch) lines.push(`⚡ ${analysis.choch}`);
      if (analysis.bos) lines.push(`📊 ${analysis.bos}`);
      if (analysis.fvgCount > 0) lines.push(`📦 ${analysis.fvgCount} FVG activos`);
      if (analysis.liquidityLevels > 0) lines.push(`💧 ${analysis.liquidityLevels} niveles liquidez`);
    }
    
    lines.push(``);
    
    // Señal bloqueada
    if (locked) {
      const emoji = locked.action === 'LONG' ? '🚀' : '🔻';
      lines.push(`${'═'.repeat(30)}`);
      lines.push(`${emoji} SEÑAL ${locked.action} ACTIVA`);
      lines.push(`📊 ${locked.model}`);
      lines.push(`💯 Score: ${locked.score}%`);
      lines.push(``);
      lines.push(`📍 Entry: ${locked.entry}`);
      lines.push(`🎯 TP1: ${locked.tp1} ${locked.tp1Hit ? '✅' : ''}`);
      lines.push(`🎯 TP2: ${locked.tp2} ${locked.tp2Hit ? '✅' : ''}`);
      lines.push(`🎯 TP3: ${locked.tp3} ${locked.tp3Hit ? '✅' : ''}`);
      lines.push(`🛑 SL: ${locked.stop}`);
      lines.push(`${'═'.repeat(30)}`);
      
      if (data.structureAlert) {
        lines.push(`⚠️ ${data.structureAlert.message}`);
      }
    } else if (signal?.action === 'WAIT') {
      lines.push(`⏳ Score: ${signal.score}%`);
      if (signal.potentialSetup) {
        lines.push(`👀 Potencial: ${signal.potentialSetup.name}`);
      }
      lines.push(`📝 ${signal.reason}`);
    }
    
    return { text: lines.join('\n'), type: locked ? 'active' : 'waiting' };
  },

  chat(question, symbol) {
    const data = assetData[symbol];
    const config = ASSETS[symbol];
    if (!data) return { answer: "🔄 Cargando..." };
    
    const q = question.toLowerCase();
    
    if (q.includes('modelo') || q.includes('estrategia')) {
      let answer = `📊 **6 Modelos SMC Activos:**\n\n`;
      answer += `1️⃣ **MTF_CONFLUENCE** (95pts)\n   H1 + M5 alineados + pullback a zona\n\n`;
      answer += `2️⃣ **CHOCH_PULLBACK** (90pts)\n   Cambio de estructura + pullback\n\n`;
      answer += `3️⃣ **LIQUIDITY_SWEEP** (85pts)\n   Caza de stops + reversión\n\n`;
      answer += `4️⃣ **BOS_CONTINUATION** (80pts)\n   Continuación de tendencia\n\n`;
      answer += `5️⃣ **FVG_ENTRY** (75pts)\n   Entrada en imbalance\n\n`;
      answer += `6️⃣ **ORDER_FLOW** (70pts)\n   Momentum fuerte + pullback`;
      return { answer };
    }
    
    if (q.includes('senal') || q.includes('señal')) {
      const locked = data.lockedSignal;
      if (locked) {
        return { answer: `🎯 **${locked.action} Activo**\n\nModelo: ${locked.model}\nScore: ${locked.score}%\nEntry: ${locked.entry}\nTP1: ${locked.tp1}\nTP2: ${locked.tp2}\nTP3: ${locked.tp3}\nSL: ${locked.stop}` };
      }
      return { answer: `⏳ Sin señal activa\n\nScore: ${data.signal?.score || 0}%\n${data.signal?.reason || ''}` };
    }
    
    if (q.includes('zona')) {
      let answer = `📦 **Zonas ${config.name}:**\n\n`;
      answer += `🟢 Demanda: ${data.demandZones?.length || 0}\n`;
      answer += `🔴 Oferta: ${data.supplyZones?.length || 0}\n`;
      answer += `📊 FVG: ${data.fvgZones?.length || 0}\n`;
      answer += `💧 Liquidez: ${data.liquidityLevels?.length || 0}`;
      return { answer };
    }
    
    if (q.includes('stats') || q.includes('estadistica')) {
      const s = stats.byAsset[symbol];
      const wr = s.total > 0 ? Math.round(s.wins / s.total * 100) : 0;
      return { answer: `📈 **Stats ${config.name}:**\n\nWin Rate: ${wr}%\nWins: ${s.wins}\nLosses: ${s.losses}\nTotal: ${s.total}` };
    }
    
    // Default: narración
    return { answer: this.generate(symbol)?.text || 'Pregunta: señal, zonas, modelos, stats' };
  }
};

// =============================================
// AUTO-TRACKING
// =============================================
function checkSignalHits() {
  for (const [symbol, data] of Object.entries(assetData)) {
    const locked = data.lockedSignal;
    if (!locked || !data.price) continue;
    
    const price = data.price;
    const isLong = locked.action === 'LONG';
    const signal = signalHistory.find(s => s.id === locked.id);
    if (!signal || signal.status !== 'PENDING') continue;
    
    // SL
    if ((isLong && price <= locked.stop) || (!isLong && price >= locked.stop)) {
      closeSignal(signal.id, 'LOSS', 'AUTO-SL', symbol);
      continue;
    }
    
    // TPs
    if (isLong) {
      if (price >= locked.tp1 && !signal.tp1Hit) { signal.tp1Hit = locked.tp1Hit = true; stats.tp1Hits++; }
      if (price >= locked.tp2 && !signal.tp2Hit) { signal.tp2Hit = locked.tp2Hit = true; stats.tp2Hits++; }
      if (price >= locked.tp3 && !signal.tp3Hit) { 
        signal.tp3Hit = locked.tp3Hit = true; 
        stats.tp3Hits++; 
        closeSignal(signal.id, 'WIN', 'AUTO-TP3', symbol);
      }
    } else {
      if (price <= locked.tp1 && !signal.tp1Hit) { signal.tp1Hit = locked.tp1Hit = true; stats.tp1Hits++; }
      if (price <= locked.tp2 && !signal.tp2Hit) { signal.tp2Hit = locked.tp2Hit = true; stats.tp2Hits++; }
      if (price <= locked.tp3 && !signal.tp3Hit) { 
        signal.tp3Hit = locked.tp3Hit = true; 
        stats.tp3Hits++; 
        closeSignal(signal.id, 'WIN', 'AUTO-TP3', symbol);
      }
    }
    
    // Alerta estructura
    if (data.structure) {
      const conflict = (isLong && data.structure.trend === 'BEARISH') ||
                       (!isLong && data.structure.trend === 'BULLISH');
      data.structureAlert = conflict ? {
        message: `Estructura M5 cambió a ${data.structure.trend}. Considera cerrar.`
      } : null;
    }
  }
}

function closeSignal(id, status, source, symbol) {
  const signal = signalHistory.find(s => s.id === id);
  if (!signal || signal.status !== 'PENDING') return;
  
  signal.status = status;
  signal.closedAt = new Date().toISOString();
  signal.closedBy = source;
  
  if (symbol && assetData[symbol]) {
    assetData[symbol].lockedSignal = null;
    assetData[symbol].structureAlert = null;
  }
  
  stats.byModel[signal.model] = stats.byModel[signal.model] || { wins: 0, losses: 0 };
  stats.byAsset[signal.symbol] = stats.byAsset[signal.symbol] || { wins: 0, losses: 0, total: 0 };
  
  if (status === 'WIN') {
    stats.wins++;
    stats.byModel[signal.model].wins++;
    stats.byAsset[signal.symbol].wins++;
    stats.byAsset[signal.symbol].total++;
    stats.learning.scoreAdjustments[signal.model] = (stats.learning.scoreAdjustments[signal.model] || 0) + 2;
  } else if (status === 'LOSS') {
    stats.losses++;
    stats.byModel[signal.model].losses++;
    stats.byAsset[signal.symbol].losses++;
    stats.byAsset[signal.symbol].total++;
    stats.learning.scoreAdjustments[signal.model] = (stats.learning.scoreAdjustments[signal.model] || 0) - 1;
  }
  
  stats.pending = signalHistory.filter(s => s.status === 'PENDING').length;
  console.log(`📊 Señal #${id} cerrada: ${status} (${source}) - Modelo: ${signal.model}`);
}

// =============================================
// CONEXIÓN DERIV
// =============================================
function connectDeriv() {
  const appId = process.env.DERIV_APP_ID || '1089';
  
  try {
    derivWs = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
  } catch (err) {
    setTimeout(connectDeriv, 5000);
    return;
  }
  
  derivWs.on('open', () => {
    console.log('✅ Conectado a Deriv');
    isConnected = true;
    
    for (const symbol of Object.keys(ASSETS)) {
      // M5
      derivWs.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: 100,
        end: 'latest',
        granularity: GRANULARITY_M5,
        style: 'candles',
        subscribe: 1
      }));
      
      // H1 para MTF
      derivWs.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: 50,
        end: 'latest',
        granularity: GRANULARITY_H1,
        style: 'candles',
        req_id: `h1_${symbol}`
      }));
      
      // Tick precio
      derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    }
  });
  
  derivWs.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData);
      
      // Velas M5
      if (msg.candles && msg.echo_req?.ticks_history && !msg.echo_req?.req_id) {
        const symbol = msg.echo_req.ticks_history;
        if (assetData[symbol]) {
          assetData[symbol].candles = msg.candles.map(c => ({
            time: c.epoch * 1000,
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close)
          }));
          console.log(`📊 ${symbol}: ${msg.candles.length} velas M5`);
          analyzeAsset(symbol);
        }
      }
      
      // Velas H1
      if (msg.candles && msg.echo_req?.req_id?.startsWith('h1_')) {
        const symbol = msg.echo_req.req_id.replace('h1_', '');
        if (assetData[symbol]) {
          assetData[symbol].candlesH1 = msg.candles.map(c => ({
            time: c.epoch * 1000,
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close)
          }));
          console.log(`📊 ${symbol}: ${msg.candles.length} velas H1`);
        }
      }
      
      // OHLC M5
      if (msg.ohlc && msg.ohlc.granularity === GRANULARITY_M5) {
        const symbol = msg.ohlc.symbol;
        if (assetData[symbol]) {
          const newCandle = {
            time: msg.ohlc.open_time * 1000,
            open: parseFloat(msg.ohlc.open),
            high: parseFloat(msg.ohlc.high),
            low: parseFloat(msg.ohlc.low),
            close: parseFloat(msg.ohlc.close)
          };
          
          const candles = assetData[symbol].candles;
          if (candles.length > 0) {
            const last = candles[candles.length - 1];
            if (last.time === newCandle.time) {
              candles[candles.length - 1] = newCandle;
            } else if (newCandle.time > last.time) {
              candles.push(newCandle);
              if (candles.length > 200) candles.shift();
              analyzeAsset(symbol);
            }
          }
          assetData[symbol].price = newCandle.close;
          checkSignalHits();
        }
      }
      
      // Tick
      if (msg.tick) {
        const symbol = msg.tick.symbol;
        if (assetData[symbol]) {
          assetData[symbol].price = parseFloat(msg.tick.quote);
          checkSignalHits();
        }
      }
    } catch (err) {}
  });
  
  derivWs.on('close', () => {
    console.log('❌ Desconectado');
    isConnected = false;
    setTimeout(connectDeriv, 5000);
  });
  
  derivWs.on('error', () => {});
}

function analyzeAsset(symbol) {
  const data = assetData[symbol];
  const config = ASSETS[symbol];
  if (!data || !config || data.candles.length < 40) return;
  
  const now = Date.now();
  if (now - data.lastAnalysis < 2000) return;
  data.lastAnalysis = now;
  
  // Analizar con todos los modelos
  const signal = SMC.analyze(data.candles, data.candlesH1 || [], config, data);
  data.signal = signal;
  data.narration = Narrator.generate(symbol);
  
  // Si ya hay señal bloqueada, no crear nueva
  if (data.lockedSignal) return;
  
  // Crear señal si cumple requisitos
  if (signal.action !== 'WAIT' && signal.action !== 'LOADING' && signal.score >= config.minScore) {
    const hasPending = signalHistory.some(s => s.symbol === symbol && s.status === 'PENDING');
    
    if (!hasPending) {
      const newSignal = {
        id: signalIdCounter++,
        symbol,
        assetName: config.name,
        emoji: config.emoji,
        action: signal.action,
        model: signal.model,
        score: signal.score,
        entry: signal.entry,
        stop: signal.stop,
        tp1: signal.tp1,
        tp2: signal.tp2,
        tp3: signal.tp3,
        tp1Hit: false, tp2Hit: false, tp3Hit: false,
        status: 'PENDING',
        timestamp: new Date().toISOString(),
        reason: signal.reason,
        allModels: signal.allModels
      };
      
      signalHistory.unshift(newSignal);
      data.lockedSignal = { ...newSignal };
      stats.total++;
      stats.pending++;
      
      if (signalHistory.length > 100) signalHistory.pop();
      
      console.log(`\n${'═'.repeat(50)}`);
      console.log(`💎 NUEVA SEÑAL #${newSignal.id}`);
      console.log(`📊 ${config.name} | ${signal.action} | ${signal.model}`);
      console.log(`💯 Score: ${signal.score}%`);
      console.log(`📍 Entry: ${signal.entry} | SL: ${signal.stop}`);
      console.log(`🎯 TP1: ${signal.tp1} | TP2: ${signal.tp2} | TP3: ${signal.tp3}`);
      console.log(`📝 ${signal.reason}`);
      if (signal.allModels?.length > 1) {
        console.log(`🔄 Otros modelos: ${signal.allModels.slice(1).map(m => m.name).join(', ')}`);
      }
      console.log(`${'═'.repeat(50)}\n`);
    }
  }
}

// =============================================
// API
// =============================================
app.get('/', (req, res) => res.json({ 
  name: 'Trading Master Pro', 
  version: '12.1',
  models: ['MTF_CONFLUENCE', 'CHOCH_PULLBACK', 'LIQUIDITY_SWEEP', 'BOS_CONTINUATION', 'FVG_ENTRY', 'ORDER_FLOW'],
  connected: isConnected 
}));

app.get('/api/dashboard', (req, res) => {
  res.json({
    connected: isConnected,
    timestamp: new Date().toISOString(),
    assets: Object.entries(assetData).map(([symbol, data]) => ({
      symbol, ...ASSETS[symbol],
      timeframe: 'M5',
      price: data.price,
      signal: data.signal,
      lockedSignal: data.lockedSignal,
      demandZones: data.demandZones?.length || 0,
      supplyZones: data.supplyZones?.length || 0,
      fvgZones: data.fvgZones?.length || 0,
      liquidityLevels: data.liquidityLevels?.length || 0,
      structureAlert: data.structureAlert
    })),
    recentSignals: signalHistory.slice(0, 30),
    stats,
    learning: stats.learning
  });
});

app.get('/api/analyze/:symbol', (req, res) => {
  const { symbol } = req.params;
  const data = assetData[symbol];
  if (!data) return res.status(404).json({ error: 'Not found' });
  
  res.json({ 
    symbol, ...ASSETS[symbol],
    price: data.price,
    signal: data.signal,
    lockedSignal: data.lockedSignal,
    candles: data.candles.slice(-100),
    candlesH1: data.candlesH1?.slice(-50),
    demandZones: data.demandZones,
    supplyZones: data.supplyZones,
    fvgZones: data.fvgZones,
    liquidityLevels: data.liquidityLevels,
    structureAlert: data.structureAlert
  });
});

app.get('/api/signals', (req, res) => res.json({ signals: signalHistory, stats }));

app.put('/api/signals/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const signal = signalHistory.find(s => s.id === id);
  if (!signal) return res.status(404).json({ error: 'Not found' });
  closeSignal(id, req.body.status, 'MANUAL', signal.symbol);
  res.json({ success: true, signal, stats });
});

app.get('/api/narrate/:symbol', (req, res) => {
  const narration = Narrator.generate(req.params.symbol);
  res.json(narration || { text: 'Cargando...', type: 'loading' });
});

app.post('/api/ai/chat', (req, res) => {
  const { question, symbol } = req.body;
  res.json(Narrator.chat(question || '', symbol || 'stpRNG'));
});

// =============================================
// INICIO
// =============================================
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║              TRADING MASTER PRO v12.1 - 6 MODELOS SMC            ║
╠══════════════════════════════════════════════════════════════════╣
║  1. MTF_CONFLUENCE    - H1 + M5 alineados + zona     (95 pts)   ║
║  2. CHOCH_PULLBACK    - Cambio estructura + pullback (90 pts)   ║
║  3. LIQUIDITY_SWEEP   - Caza stops + reversión       (85 pts)   ║
║  4. BOS_CONTINUATION  - Continuación tendencia       (80 pts)   ║
║  5. FVG_ENTRY         - Entrada en imbalance         (75 pts)   ║
║  6. ORDER_FLOW        - Momentum fuerte              (70 pts)   ║
╠══════════════════════════════════════════════════════════════════╣
║  Puerto: ${PORT}                                                      ║
║  Timeframes: M5 + H1 (MTF)                                       ║
╚══════════════════════════════════════════════════════════════════╝
  `);
  connectDeriv();
  
  setInterval(() => {
    if (derivWs?.readyState === WebSocket.OPEN) {
      derivWs.send(JSON.stringify({ ping: 1 }));
      
      // Refrescar H1 cada 5 minutos
      for (const symbol of Object.keys(ASSETS)) {
        derivWs.send(JSON.stringify({
          ticks_history: symbol,
          count: 50,
          end: 'latest',
          granularity: GRANULARITY_H1,
          style: 'candles',
          req_id: `h1_${symbol}`
        }));
      }
    }
  }, 300000);
});

export default app;
