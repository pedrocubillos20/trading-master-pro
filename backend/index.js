// =============================================
// TRADING MASTER PRO v12.5
// MODELOS SMC CORREGIDOS + MARCUS AI
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
  'stpRNG': { name: 'Step Index', shortName: 'Step', emoji: '📊', decimals: 2, slBuffer: 2.0, minScore: 60 },
  '1HZ75V': { name: 'Volatility 75', shortName: 'V75', emoji: '📈', decimals: 2, slBuffer: 5.0, minScore: 60 },
  'frxXAUUSD': { name: 'Oro (XAU/USD)', shortName: 'XAU', emoji: '🥇', decimals: 2, slBuffer: 1.0, minScore: 55 },
  'frxGBPUSD': { name: 'GBP/USD', shortName: 'GBP', emoji: '💷', decimals: 5, slBuffer: 0.0003, minScore: 55 },
  'cryBTCUSD': { name: 'Bitcoin', shortName: 'BTC', emoji: '₿', decimals: 2, slBuffer: 50, minScore: 55 }
};

const GRANULARITY_M5 = 300;
const GRANULARITY_H1 = 3600;

// =============================================
// ESTADO GLOBAL
// =============================================
let derivWs = null;
let isConnected = false;

const assetData = {};
for (const symbol of Object.keys(ASSETS)) {
  assetData[symbol] = {
    candles: [],
    candlesH1: [],
    price: null,
    signal: null,
    lockedSignal: null,
    lastAnalysis: 0,
    demandZones: [],
    supplyZones: [],
    fvgZones: [],
    liquidityLevels: [],
    swings: [],
    structure: null,
    structureH1: null,
    orderFlow: null,
    choch: null,
    bos: null
  };
}

let signalHistory = [];
let signalIdCounter = 1;

const stats = {
  total: 0, wins: 0, losses: 0, pending: 0,
  tp1Hits: 0, tp2Hits: 0, tp3Hits: 0,
  byModel: {}, byAsset: {}, learning: { scoreAdjustments: {} }
};

for (const symbol of Object.keys(ASSETS)) {
  stats.byAsset[symbol] = { wins: 0, losses: 0, total: 0 };
}

// =============================================
// MOTOR SMC v12.5 - LÓGICA CLARA Y CORREGIDA
// =============================================

/*
╔═══════════════════════════════════════════════════════════════════════════╗
║                    ESQUEMA DE MODELOS SMC                                  ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                           ║
║  1. MTF_CONFLUENCE (95pts)                                                ║
║     ────────────────────                                                  ║
║     Condiciones:                                                          ║
║     ✓ H1 y M5 tienen la MISMA tendencia (ambos BULLISH o BEARISH)        ║
║     ✓ Pullback a zona válida (demanda para BULL, oferta para BEAR)       ║
║     ✓ Vela de confirmación (rechazo de la zona)                          ║
║                                                                           ║
║     H1: ──────/──────/────── (BULLISH)                                   ║
║     M5: ──/──/──/──/── (BULLISH) + Pullback a demanda                    ║
║                                                                           ║
║  2. CHOCH_PULLBACK (90pts)                                                ║
║     ────────────────────                                                  ║
║     Condiciones:                                                          ║
║     ✓ Cambio de estructura detectado (CHoCH)                             ║
║     ✓ Pullback a zona que causó el CHoCH                                 ║
║     ✓ Vela de confirmación                                               ║
║                                                                           ║
║     Bajista → CHoCH Alcista:                                             ║
║         ╲                                                                 ║
║          ╲    ╱╲   ← Rompe máximo (CHoCH)                                ║
║           ╲  ╱  ╲  ← Pullback                                            ║
║            ╲╱    ╲ ← Entry aquí                                          ║
║                                                                           ║
║  3. BOS_CONTINUATION (80pts)                                              ║
║     ────────────────────                                                  ║
║     Condiciones:                                                          ║
║     ✓ Tendencia clara establecida                                        ║
║     ✓ Ruptura del último swing (BOS)                                     ║
║     ✓ Pullback al nivel roto o zona cercana                              ║
║                                                                           ║
║     Alcista con BOS:                                                      ║
║            ╱╲                                                             ║
║           ╱  ╲  ╱╲ ← BOS (nuevo HH)                                      ║
║          ╱    ╲╱  ╲ ← Pullback                                           ║
║         ╱          ╲ ← Entry                                             ║
║                                                                           ║
║  4. FVG_ENTRY (75pts)                                                     ║
║     ────────────────────                                                  ║
║     Condiciones:                                                          ║
║     ✓ FVG (Fair Value Gap) identificado                                  ║
║     ✓ Precio retrocede al 50% del FVG                                    ║
║     ✓ Estructura favorable                                               ║
║                                                                           ║
║     FVG Alcista:                                                          ║
║     │ │ Vela 1                                                           ║
║     │ │                                                                   ║
║     ┌───┐ Vela 2 (impulso)                                               ║
║     │   │                                                                 ║
║     └───┘                                                                 ║
║     ░░░░░ ← FVG (gap)                                                    ║
║     │ │ Vela 3                                                           ║
║                                                                           ║
║  5. LIQUIDITY_SWEEP (85pts)                                               ║
║     ────────────────────                                                  ║
║     Condiciones:                                                          ║
║     ✓ Nivel de liquidez identificado (equal highs/lows)                  ║
║     ✓ Precio "barre" el nivel (sweep)                                    ║
║     ✓ Rechazo fuerte (cierra del lado opuesto)                           ║
║                                                                           ║
║     Sweep de liquidez:                                                    ║
║     ══════════════ Liquidez (stops)                                      ║
║          │╲                                                               ║
║          │ ╲ ← Sweep                                                     ║
║          │  ╲                                                            ║
║          │   ╲ ← Rechazo y reversión                                     ║
║                                                                           ║
║  6. ORDER_FLOW (70pts)                                                    ║
║     ────────────────────                                                  ║
║     Condiciones:                                                          ║
║     ✓ Momentum fuerte en una dirección                                   ║
║     ✓ Pullback menor (1-3 velas)                                         ║
║     ✓ Continuación del momentum                                          ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
*/

const SMC = {
  
  // Encontrar swings (máximos y mínimos)
  findSwings(candles, lookback = 3) {
    const swings = [];
    if (candles.length < lookback * 2 + 1) return swings;
    
    for (let i = lookback; i < candles.length - lookback; i++) {
      const c = candles[i];
      const leftCandles = candles.slice(i - lookback, i);
      const rightCandles = candles.slice(i + 1, i + lookback + 1);
      
      // Swing High
      const isHigh = leftCandles.every(x => x.high <= c.high) && 
                     rightCandles.every(x => x.high < c.high);
      
      // Swing Low
      const isLow = leftCandles.every(x => x.low >= c.low) && 
                    rightCandles.every(x => x.low > c.low);
      
      if (isHigh) swings.push({ type: 'high', price: c.high, index: i, time: c.time });
      if (isLow) swings.push({ type: 'low', price: c.low, index: i, time: c.time });
    }
    return swings;
  },

  // Promedio de rango de velas
  getAvgRange(candles, period = 14) {
    const recent = candles.slice(-period);
    if (!recent.length) return 0;
    return recent.reduce((sum, c) => sum + (c.high - c.low), 0) / recent.length;
  },

  // Analizar estructura del mercado
  analyzeStructure(swings) {
    if (swings.length < 4) return { trend: 'NEUTRAL', strength: 0 };
    
    const recentSwings = swings.slice(-8);
    const highs = recentSwings.filter(s => s.type === 'high');
    const lows = recentSwings.filter(s => s.type === 'low');
    
    if (highs.length < 2 || lows.length < 2) return { trend: 'NEUTRAL', strength: 0 };
    
    // Contar Higher Highs y Higher Lows
    let hhCount = 0, hlCount = 0, lhCount = 0, llCount = 0;
    
    for (let i = 1; i < highs.length; i++) {
      if (highs[i].price > highs[i-1].price) hhCount++;
      else if (highs[i].price < highs[i-1].price) lhCount++;
    }
    
    for (let i = 1; i < lows.length; i++) {
      if (lows[i].price > lows[i-1].price) hlCount++;
      else if (lows[i].price < lows[i-1].price) llCount++;
    }
    
    const bullScore = hhCount + hlCount;
    const bearScore = lhCount + llCount;
    
    if (bullScore >= 2 && bullScore > bearScore) {
      return { trend: 'BULLISH', strength: Math.min(100, bullScore * 25), hhCount, hlCount };
    }
    if (bearScore >= 2 && bearScore > bullScore) {
      return { trend: 'BEARISH', strength: Math.min(100, bearScore * 25), lhCount, llCount };
    }
    
    return { trend: 'NEUTRAL', strength: 0 };
  },

  // Detectar CHoCH (Change of Character)
  detectCHoCH(candles, swings) {
    if (swings.length < 4 || candles.length < 10) return null;
    
    const highs = swings.filter(s => s.type === 'high').slice(-4);
    const lows = swings.filter(s => s.type === 'low').slice(-4);
    const recentCandles = candles.slice(-8);
    const lastClose = candles[candles.length - 1].close;
    
    // CHoCH Alcista: En tendencia bajista, rompe un máximo
    if (lows.length >= 2) {
      const wasDowntrend = lows[lows.length - 1].price < lows[lows.length - 2].price;
      
      if (wasDowntrend && highs.length >= 1) {
        const targetHigh = highs[highs.length - 1];
        const brokeHigh = recentCandles.some(c => c.close > targetHigh.price);
        
        if (brokeHigh && lastClose > targetHigh.price) {
          return { 
            type: 'BULLISH_CHOCH', 
            side: 'BUY', 
            level: targetHigh.price,
            confidence: 85
          };
        }
      }
    }
    
    // CHoCH Bajista: En tendencia alcista, rompe un mínimo
    if (highs.length >= 2) {
      const wasUptrend = highs[highs.length - 1].price > highs[highs.length - 2].price;
      
      if (wasUptrend && lows.length >= 1) {
        const targetLow = lows[lows.length - 1];
        const brokeLow = recentCandles.some(c => c.close < targetLow.price);
        
        if (brokeLow && lastClose < targetLow.price) {
          return { 
            type: 'BEARISH_CHOCH', 
            side: 'SELL', 
            level: targetLow.price,
            confidence: 85
          };
        }
      }
    }
    
    return null;
  },

  // Detectar BOS (Break of Structure)
  detectBOS(candles, swings, structure) {
    if (swings.length < 3 || candles.length < 5) return null;
    
    const recentCandles = candles.slice(-5);
    const lastClose = candles[candles.length - 1].close;
    
    // BOS Alcista
    if (structure.trend === 'BULLISH') {
      const highs = swings.filter(s => s.type === 'high').slice(-3);
      if (highs.length >= 2) {
        const lastHigh = highs[highs.length - 1];
        const brokeHigh = recentCandles.some(c => c.close > lastHigh.price);
        
        if (brokeHigh && lastClose > lastHigh.price) {
          return { type: 'BULLISH_BOS', side: 'BUY', level: lastHigh.price, confidence: 80 };
        }
      }
    }
    
    // BOS Bajista
    if (structure.trend === 'BEARISH') {
      const lows = swings.filter(s => s.type === 'low').slice(-3);
      if (lows.length >= 2) {
        const lastLow = lows[lows.length - 1];
        const brokeLow = recentCandles.some(c => c.close < lastLow.price);
        
        if (brokeLow && lastClose < lastLow.price) {
          return { type: 'BEARISH_BOS', side: 'SELL', level: lastLow.price, confidence: 80 };
        }
      }
    }
    
    return null;
  },

  // Encontrar FVGs (Fair Value Gaps)
  findFVGs(candles) {
    const fvgs = [];
    if (candles.length < 5) return fvgs;
    
    const avgRange = this.getAvgRange(candles);
    
    for (let i = 2; i < candles.length; i++) {
      const c1 = candles[i - 2];
      const c2 = candles[i - 1];
      const c3 = candles[i];
      
      const bodySize = Math.abs(c2.close - c2.open);
      
      // FVG Alcista: Gap entre high de c1 y low de c3
      if (c2.close > c2.open && bodySize > avgRange * 0.8) {
        if (c3.low > c1.high) {
          fvgs.push({
            type: 'BULLISH_FVG',
            side: 'BUY',
            high: c3.low,
            low: c1.high,
            mid: (c3.low + c1.high) / 2,
            index: i,
            strength: bodySize / avgRange
          });
        }
      }
      
      // FVG Bajista: Gap entre low de c1 y high de c3
      if (c2.close < c2.open && bodySize > avgRange * 0.8) {
        if (c1.low > c3.high) {
          fvgs.push({
            type: 'BEARISH_FVG',
            side: 'SELL',
            high: c1.low,
            low: c3.high,
            mid: (c1.low + c3.high) / 2,
            index: i,
            strength: bodySize / avgRange
          });
        }
      }
    }
    
    // Filtrar FVGs ya llenados
    const currentPrice = candles[candles.length - 1].close;
    return fvgs.filter(fvg => {
      const afterCandles = candles.slice(fvg.index + 1);
      if (fvg.side === 'BUY') {
        return !afterCandles.some(c => c.low <= fvg.low);
      } else {
        return !afterCandles.some(c => c.high >= fvg.high);
      }
    }).slice(-5);
  },

  // Encontrar niveles de liquidez
  findLiquidityLevels(swings, avgRange) {
    const levels = [];
    
    // Equal Highs
    const highs = swings.filter(s => s.type === 'high').slice(-8);
    for (let i = 0; i < highs.length; i++) {
      const similar = highs.filter(h => Math.abs(h.price - highs[i].price) < avgRange * 0.2);
      if (similar.length >= 2) {
        const avgPrice = similar.reduce((s, h) => s + h.price, 0) / similar.length;
        if (!levels.some(l => Math.abs(l.price - avgPrice) < avgRange * 0.3)) {
          levels.push({ type: 'EQUAL_HIGHS', price: avgPrice, touches: similar.length });
        }
      }
    }
    
    // Equal Lows
    const lows = swings.filter(s => s.type === 'low').slice(-8);
    for (let i = 0; i < lows.length; i++) {
      const similar = lows.filter(l => Math.abs(l.price - lows[i].price) < avgRange * 0.2);
      if (similar.length >= 2) {
        const avgPrice = similar.reduce((s, l) => s + l.price, 0) / similar.length;
        if (!levels.some(l => Math.abs(l.price - avgPrice) < avgRange * 0.3)) {
          levels.push({ type: 'EQUAL_LOWS', price: avgPrice, touches: similar.length });
        }
      }
    }
    
    return levels;
  },

  // Analizar Order Flow (momentum)
  analyzeOrderFlow(candles) {
    if (candles.length < 10) return { momentum: 'NEUTRAL', strength: 0 };
    
    const last10 = candles.slice(-10);
    const bullish = last10.filter(c => c.close > c.open);
    const bearish = last10.filter(c => c.close < c.open);
    
    const bullVolume = bullish.reduce((s, c) => s + Math.abs(c.close - c.open), 0);
    const bearVolume = bearish.reduce((s, c) => s + Math.abs(c.close - c.open), 0);
    
    const ratio = bullVolume / (bearVolume || 0.001);
    
    if (ratio > 1.5) return { momentum: 'BULLISH', strength: Math.min(100, ratio * 30), bullCount: bullish.length, bearCount: bearish.length };
    if (ratio < 0.67) return { momentum: 'BEARISH', strength: Math.min(100, (1/ratio) * 30), bullCount: bullish.length, bearCount: bearish.length };
    
    return { momentum: 'NEUTRAL', strength: 50, bullCount: bullish.length, bearCount: bearish.length };
  },

  // Encontrar zonas de demanda y oferta
  findZones(candles) {
    const demandZones = [];
    const supplyZones = [];
    
    if (candles.length < 10) return { demandZones, supplyZones };
    
    const avgRange = this.getAvgRange(candles);
    
    for (let i = 2; i < candles.length - 2; i++) {
      const curr = candles[i];
      const next1 = candles[i + 1];
      const next2 = candles[i + 2];
      
      const bodySize = Math.abs(curr.close - curr.open);
      if (bodySize < avgRange * 0.3) continue;
      
      // Zona de Demanda: Vela bajista seguida de movimiento alcista fuerte
      if (curr.close < curr.open) {
        const bullishMove = next1.close > curr.high || next2.close > curr.high;
        const strongMove = (next1.close - curr.high) > avgRange * 0.5 || (next2.close - curr.high) > avgRange * 0.5;
        
        if (bullishMove && strongMove) {
          const tooClose = demandZones.some(z => Math.abs(z.mid - curr.low) < avgRange * 0.5);
          if (!tooClose) {
            demandZones.push({
              type: 'DEMAND',
              high: Math.max(curr.open, curr.close),
              low: curr.low,
              mid: (curr.open + curr.low) / 2,
              index: i,
              strength: strongMove ? 'STRONG' : 'NORMAL',
              valid: true
            });
          }
        }
      }
      
      // Zona de Oferta: Vela alcista seguida de movimiento bajista fuerte
      if (curr.close > curr.open) {
        const bearishMove = next1.close < curr.low || next2.close < curr.low;
        const strongMove = (curr.low - next1.close) > avgRange * 0.5 || (curr.low - next2.close) > avgRange * 0.5;
        
        if (bearishMove && strongMove) {
          const tooClose = supplyZones.some(z => Math.abs(z.mid - curr.high) < avgRange * 0.5);
          if (!tooClose) {
            supplyZones.push({
              type: 'SUPPLY',
              high: curr.high,
              low: Math.min(curr.open, curr.close),
              mid: (curr.high + curr.open) / 2,
              index: i,
              strength: strongMove ? 'STRONG' : 'NORMAL',
              valid: true
            });
          }
        }
      }
    }
    
    // Invalidar zonas rotas
    const lastCandles = candles.slice(-10);
    demandZones.forEach(z => {
      if (lastCandles.some(c => c.close < z.low * 0.998)) z.valid = false;
    });
    supplyZones.forEach(z => {
      if (lastCandles.some(c => c.close > z.high * 1.002)) z.valid = false;
    });
    
    return {
      demandZones: demandZones.filter(z => z.valid).slice(-5),
      supplyZones: supplyZones.filter(z => z.valid).slice(-5)
    };
  },

  // Detectar pullback a zona
  detectPullback(candles, demandZones, supplyZones, structure, config) {
    if (candles.length < 5) return null;
    
    const last5 = candles.slice(-5);
    const lastCandle = candles[candles.length - 1];
    const price = lastCandle.close;
    const avgRange = this.getAvgRange(candles);
    
    // Pullback a zona de demanda (para BUY)
    for (const zone of demandZones) {
      // Precio tocó o está cerca de la zona
      const inZone = price >= zone.low * 0.998 && price <= zone.high * 1.01;
      const touched = last5.some(c => c.low <= zone.high * 1.002);
      
      // Vela de rechazo alcista
      const rejection = lastCandle.close > lastCandle.open && 
                        lastCandle.close > zone.mid &&
                        (lastCandle.low <= zone.high * 1.005);
      
      if ((inZone || touched) && rejection) {
        const entry = Math.max(price, zone.high);
        const stop = zone.low - config.slBuffer;
        const risk = entry - stop;
        
        if (risk > 0 && risk < avgRange * 3) {
          return {
            type: 'PULLBACK_DEMAND',
            side: 'BUY',
            zone,
            entry: +entry.toFixed(config.decimals),
            stop: +stop.toFixed(config.decimals),
            tp1: +(entry + risk).toFixed(config.decimals),
            tp2: +(entry + risk * 2).toFixed(config.decimals),
            tp3: +(entry + risk * 3).toFixed(config.decimals),
            confidence: zone.strength === 'STRONG' ? 85 : 70
          };
        }
      }
    }
    
    // Pullback a zona de oferta (para SELL)
    for (const zone of supplyZones) {
      const inZone = price >= zone.low * 0.99 && price <= zone.high * 1.002;
      const touched = last5.some(c => c.high >= zone.low * 0.998);
      
      const rejection = lastCandle.close < lastCandle.open &&
                        lastCandle.close < zone.mid &&
                        (lastCandle.high >= zone.low * 0.995);
      
      if ((inZone || touched) && rejection) {
        const entry = Math.min(price, zone.low);
        const stop = zone.high + config.slBuffer;
        const risk = stop - entry;
        
        if (risk > 0 && risk < avgRange * 3) {
          return {
            type: 'PULLBACK_SUPPLY',
            side: 'SELL',
            zone,
            entry: +entry.toFixed(config.decimals),
            stop: +stop.toFixed(config.decimals),
            tp1: +(entry - risk).toFixed(config.decimals),
            tp2: +(entry - risk * 2).toFixed(config.decimals),
            tp3: +(entry - risk * 3).toFixed(config.decimals),
            confidence: zone.strength === 'STRONG' ? 85 : 70
          };
        }
      }
    }
    
    return null;
  },

  // Análisis Multi-Timeframe
  analyzeMTF(candlesM5, candlesH1) {
    if (!candlesH1 || candlesH1.length < 15) {
      return { confluence: false, h1Trend: 'LOADING', m5Trend: 'LOADING', aligned: false };
    }
    
    const swingsH1 = this.findSwings(candlesH1, 2);
    const structureH1 = this.analyzeStructure(swingsH1);
    
    const swingsM5 = this.findSwings(candlesM5, 3);
    const structureM5 = this.analyzeStructure(swingsM5);
    
    const aligned = structureH1.trend === structureM5.trend && 
                    structureH1.trend !== 'NEUTRAL';
    
    return {
      confluence: aligned,
      h1Trend: structureH1.trend,
      m5Trend: structureM5.trend,
      aligned,
      h1Strength: structureH1.strength,
      m5Strength: structureM5.strength
    };
  },

  // ═══════════════════════════════════════════════════════════════
  // ANÁLISIS PRINCIPAL - GENERA SEÑALES
  // ═══════════════════════════════════════════════════════════════
  analyze(candlesM5, candlesH1, config, state) {
    if (candlesM5.length < 30) {
      return { action: 'LOADING', score: 0, model: 'LOADING', reason: 'Cargando datos...' };
    }
    
    // 1. Calcular todos los indicadores
    const swings = this.findSwings(candlesM5, 3);
    const structure = this.analyzeStructure(swings);
    const { demandZones, supplyZones } = this.findZones(candlesM5);
    const fvgZones = this.findFVGs(candlesM5);
    const avgRange = this.getAvgRange(candlesM5);
    const liquidityLevels = this.findLiquidityLevels(swings, avgRange);
    const orderFlow = this.analyzeOrderFlow(candlesM5);
    const mtf = this.analyzeMTF(candlesM5, candlesH1);
    const choch = this.detectCHoCH(candlesM5, swings);
    const bos = this.detectBOS(candlesM5, swings, structure);
    const pullback = this.detectPullback(candlesM5, demandZones, supplyZones, structure, config);
    
    // Guardar en estado
    Object.assign(state, {
      swings: swings.slice(-10),
      structure,
      structureH1: { trend: mtf.h1Trend },
      demandZones,
      supplyZones,
      fvgZones,
      liquidityLevels,
      orderFlow,
      choch,
      bos,
      mtfAnalysis: mtf
    });
    
    // 2. Evaluar modelos (de mayor a menor prioridad)
    const signals = [];
    
    // MODELO 1: MTF_CONFLUENCE (95pts)
    if (mtf.confluence && pullback) {
      const sideMatch = (mtf.h1Trend === 'BULLISH' && pullback.side === 'BUY') ||
                        (mtf.h1Trend === 'BEARISH' && pullback.side === 'SELL');
      if (sideMatch) {
        signals.push({
          model: 'MTF_CONFLUENCE',
          baseScore: 95,
          pullback,
          reason: `Confluencia H1(${mtf.h1Trend}) + M5(${mtf.m5Trend}) + Pullback`
        });
      }
    }
    
    // MODELO 2: CHOCH_PULLBACK (90pts)
    if (choch && pullback && choch.side === pullback.side) {
      signals.push({
        model: 'CHOCH_PULLBACK',
        baseScore: 90,
        pullback,
        reason: `${choch.type} + Pullback a zona`
      });
    }
    
    // MODELO 3: LIQUIDITY_SWEEP (85pts)
    // Detectar si hubo un sweep reciente
    const lastCandle = candlesM5[candlesM5.length - 1];
    for (const level of liquidityLevels) {
      const swept = candlesM5.slice(-3).some(c => {
        if (level.type === 'EQUAL_HIGHS') return c.high > level.price && c.close < level.price;
        if (level.type === 'EQUAL_LOWS') return c.low < level.price && c.close > level.price;
        return false;
      });
      
      if (swept) {
        const side = level.type === 'EQUAL_HIGHS' ? 'SELL' : 'BUY';
        if (pullback && pullback.side === side) {
          signals.push({
            model: 'LIQUIDITY_SWEEP',
            baseScore: 85,
            pullback,
            reason: `Sweep de ${level.type} + Pullback`
          });
        }
      }
    }
    
    // MODELO 4: BOS_CONTINUATION (80pts)
    if (bos && pullback && bos.side === pullback.side) {
      signals.push({
        model: 'BOS_CONTINUATION',
        baseScore: 80,
        pullback,
        reason: `${bos.type} + Pullback`
      });
    }
    
    // MODELO 5: FVG_ENTRY (75pts)
    for (const fvg of fvgZones) {
      const price = lastCandle.close;
      const inFVG = price >= fvg.low * 0.999 && price <= fvg.high * 1.001;
      
      if (inFVG && pullback && fvg.side === pullback.side) {
        signals.push({
          model: 'FVG_ENTRY',
          baseScore: 75,
          pullback,
          reason: `Precio en ${fvg.type}`
        });
      }
    }
    
    // MODELO 6: ORDER_FLOW (70pts) - Más permisivo
    if (orderFlow.momentum !== 'NEUTRAL' && pullback) {
      const flowMatch = (orderFlow.momentum === 'BULLISH' && pullback.side === 'BUY') ||
                        (orderFlow.momentum === 'BEARISH' && pullback.side === 'SELL');
      if (flowMatch && orderFlow.strength >= 40) {
        signals.push({
          model: 'ORDER_FLOW',
          baseScore: 70,
          pullback,
          reason: `Order Flow ${orderFlow.momentum} (${orderFlow.strength.toFixed(0)}%)`
        });
      }
    }
    
    // 3. Si no hay señales, retornar WAIT con información
    if (signals.length === 0) {
      let reason = 'Esperando setup válido';
      if (!pullback) reason = 'Sin pullback a zona';
      else if (structure.trend === 'NEUTRAL') reason = 'Estructura neutral';
      
      return {
        action: 'WAIT',
        score: Math.max(structure.strength, orderFlow.strength) * 0.5,
        model: 'NO_SETUP',
        reason,
        analysis: {
          structure: structure.trend,
          h1Trend: mtf.h1Trend,
          orderFlow: orderFlow.momentum,
          demandZones: demandZones.length,
          supplyZones: supplyZones.length,
          fvgCount: fvgZones.length,
          choch: choch?.type || null,
          bos: bos?.type || null
        }
      };
    }
    
    // 4. Seleccionar la mejor señal
    signals.sort((a, b) => b.baseScore - a.baseScore);
    const best = signals[0];
    
    // Aplicar ajuste de aprendizaje
    const learningAdj = stats.learning.scoreAdjustments[best.model] || 0;
    const finalScore = Math.min(100, Math.max(0, best.baseScore + learningAdj));
    
    // Verificar score mínimo
    if (finalScore < config.minScore) {
      return {
        action: 'WAIT',
        score: finalScore,
        model: best.model,
        reason: `Score ${finalScore}% < ${config.minScore}% requerido`,
        analysis: {
          structure: structure.trend,
          h1Trend: mtf.h1Trend,
          orderFlow: orderFlow.momentum
        }
      };
    }
    
    // 5. Retornar señal válida
    const pb = best.pullback;
    return {
      action: pb.side === 'BUY' ? 'LONG' : 'SHORT',
      model: best.model,
      score: finalScore,
      entry: pb.entry,
      stop: pb.stop,
      tp1: pb.tp1,
      tp2: pb.tp2,
      tp3: pb.tp3,
      reason: best.reason,
      analysis: {
        structure: structure.trend,
        h1Trend: mtf.h1Trend,
        mtfConfluence: mtf.confluence,
        orderFlow: orderFlow.momentum,
        choch: choch?.type,
        bos: bos?.type
      }
    };
  }
};

// =============================================
// MARCUS - IA TRADER PROFESIONAL
// =============================================
const Marcus = {
  getContext(symbol) {
    const data = assetData[symbol];
    const config = ASSETS[symbol];
    if (!data || !config || data.candles.length < 10) return null;
    
    const price = data.price || data.candles[data.candles.length - 1]?.close;
    
    return {
      symbol,
      name: config.name,
      shortName: config.shortName,
      emoji: config.emoji,
      price,
      decimals: config.decimals,
      structure: data.structure?.trend || 'NEUTRAL',
      structureH1: data.structureH1?.trend || 'LOADING',
      mtfConfluence: data.mtfAnalysis?.confluence || false,
      orderFlow: data.orderFlow || { momentum: 'NEUTRAL', strength: 0 },
      demandZones: data.demandZones || [],
      supplyZones: data.supplyZones || [],
      fvgZones: data.fvgZones || [],
      liquidityLevels: data.liquidityLevels || [],
      choch: data.choch,
      bos: data.bos,
      lockedSignal: data.lockedSignal,
      signal: data.signal
    };
  },

  chat(question, symbol) {
    const ctx = this.getContext(symbol);
    if (!ctx) {
      return { answer: "Cargando datos del mercado... ⏳", type: 'loading' };
    }
    
    const q = (question || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    
    // SALUDO
    if (!q || q === 'hola' || q === 'hey' || q === 'hi') {
      let r = `¡Hola! 👋 Soy Marcus.\n\n`;
      r += `${ctx.emoji} **${ctx.name}** @ ${ctx.price?.toFixed(ctx.decimals) || '---'}\n\n`;
      r += `📊 M5: ${ctx.structure === 'BULLISH' ? '🟢 Alcista' : ctx.structure === 'BEARISH' ? '🔴 Bajista' : '⚪ Neutral'}\n`;
      r += `📊 H1: ${ctx.structureH1 === 'BULLISH' ? '🟢 Alcista' : ctx.structureH1 === 'BEARISH' ? '🔴 Bajista' : ctx.structureH1 === 'LOADING' ? '⏳ Cargando' : '⚪ Neutral'}\n`;
      if (ctx.mtfConfluence) r += `\n✨ Confluencia MTF activa\n`;
      r += `\n¿Qué necesitas saber?`;
      return { answer: r, type: 'greeting' };
    }

    // ANÁLISIS
    if (q.includes('analisis') || q.includes('analiza') || q.includes('que ves') || q.includes('grafico')) {
      let r = `📊 **${ctx.name}** @ ${ctx.price?.toFixed(ctx.decimals)}\n\n`;
      
      r += `**ESTRUCTURA**\n`;
      r += `• M5: ${ctx.structure === 'BULLISH' ? '🟢 ALCISTA (HH+HL)' : ctx.structure === 'BEARISH' ? '🔴 BAJISTA (LH+LL)' : '⚪ NEUTRAL'}\n`;
      r += `• H1: ${ctx.structureH1 === 'BULLISH' ? '🟢 ALCISTA' : ctx.structureH1 === 'BEARISH' ? '🔴 BAJISTA' : ctx.structureH1 === 'LOADING' ? '⏳ Cargando...' : '⚪ NEUTRAL'}\n`;
      
      if (ctx.mtfConfluence) {
        r += `• ✨ **MTF Confluencia activa**\n`;
      }
      
      r += `\n**MOMENTUM**\n`;
      r += `• Order Flow: ${ctx.orderFlow.momentum === 'BULLISH' ? '📈 Compradores' : ctx.orderFlow.momentum === 'BEARISH' ? '📉 Vendedores' : '↔️ Neutral'}\n`;
      
      r += `\n**ZONAS**\n`;
      r += `• Demanda: ${ctx.demandZones.length} zonas\n`;
      r += `• Oferta: ${ctx.supplyZones.length} zonas\n`;
      r += `• FVG: ${ctx.fvgZones.length} gaps\n`;
      
      if (ctx.choch) r += `\n⚡ **${ctx.choch.type}** detectado\n`;
      if (ctx.bos) r += `📊 **${ctx.bos.type}** confirmado\n`;
      
      if (ctx.lockedSignal) {
        const s = ctx.lockedSignal;
        r += `\n━━━━━━━━━━━━━━\n`;
        r += `🎯 **${s.action} ACTIVO** (${s.model})\n`;
        r += `Entry: ${s.entry} | SL: ${s.stop}\n`;
        r += `TP1: ${s.tp1}${s.tp1Hit?' ✅':''} | TP2: ${s.tp2}${s.tp2Hit?' ✅':''} | TP3: ${s.tp3}${s.tp3Hit?' ✅':''}\n`;
      }
      
      return { answer: r, type: 'analysis' };
    }

    // ZONAS
    if (q.includes('zona') || q.includes('demanda') || q.includes('oferta') || q.includes('order block')) {
      let r = `📦 **ZONAS - ${ctx.shortName}**\n\n`;
      
      if (ctx.demandZones.length > 0) {
        r += `**🟢 DEMANDA (Compra)**\n`;
        ctx.demandZones.forEach((z, i) => {
          r += `${i+1}. ${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)} ${z.strength === 'STRONG' ? '💪' : ''}\n`;
        });
      } else {
        r += `Sin zonas de demanda activas\n`;
      }
      
      r += `\n`;
      
      if (ctx.supplyZones.length > 0) {
        r += `**🔴 OFERTA (Venta)**\n`;
        ctx.supplyZones.forEach((z, i) => {
          r += `${i+1}. ${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)} ${z.strength === 'STRONG' ? '💪' : ''}\n`;
        });
      } else {
        r += `Sin zonas de oferta activas\n`;
      }
      
      return { answer: r, type: 'zones' };
    }

    // SEÑAL
    if (q.includes('senal') || q.includes('signal') || q.includes('operacion') || q.includes('trade')) {
      if (ctx.lockedSignal) {
        const s = ctx.lockedSignal;
        let r = `🎯 **${s.action} ACTIVO**\n\n`;
        r += `Modelo: ${s.model}\n`;
        r += `Score: ${s.score}%\n\n`;
        r += `Entry: ${s.entry}\n`;
        r += `SL: ${s.stop}\n`;
        r += `TP1: ${s.tp1} ${s.tp1Hit ? '✅' : ''}\n`;
        r += `TP2: ${s.tp2} ${s.tp2Hit ? '✅' : ''}\n`;
        r += `TP3: ${s.tp3} ${s.tp3Hit ? '✅' : ''}\n`;
        return { answer: r, type: 'signal' };
      }
      
      const sig = ctx.signal;
      let r = `⏳ **Sin operación activa**\n\n`;
      r += `Score actual: ${sig?.score || 0}%\n`;
      r += `${sig?.reason || 'Esperando setup'}\n\n`;
      r += `Estructura: ${ctx.structure}\n`;
      r += `Zonas: ${ctx.demandZones.length}D / ${ctx.supplyZones.length}S`;
      return { answer: r, type: 'waiting' };
    }

    // QUÉ BUSCAR
    if (q.includes('que buscar') || q.includes('plan') || q.includes('proyeccion') || q.includes('esperar')) {
      let r = `🎯 **QUÉ BUSCAR**\n\n`;
      
      if (ctx.mtfConfluence && ctx.structure === 'BULLISH') {
        r += `✅ Escenario ALCISTA favorable\n\n`;
        r += `• Buscar COMPRAS en pullback a demanda\n`;
        if (ctx.demandZones.length > 0) {
          const z = ctx.demandZones[ctx.demandZones.length - 1];
          r += `• Zona: ${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)}\n`;
        }
      } else if (ctx.mtfConfluence && ctx.structure === 'BEARISH') {
        r += `✅ Escenario BAJISTA favorable\n\n`;
        r += `• Buscar VENTAS en pullback a oferta\n`;
        if (ctx.supplyZones.length > 0) {
          const z = ctx.supplyZones[ctx.supplyZones.length - 1];
          r += `• Zona: ${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)}\n`;
        }
      } else {
        r += `⚠️ Sin confluencia clara\n\n`;
        r += `• Esperar definición de estructura\n`;
        r += `• M5: ${ctx.structure}\n`;
        r += `• H1: ${ctx.structureH1}\n`;
      }
      
      return { answer: r, type: 'plan' };
    }

    // MODELOS
    if (q.includes('modelo') || q.includes('models')) {
      let r = `🧠 **MODELOS SMC**\n\n`;
      r += `1. **MTF_CONFLUENCE** (95pts)\n   H1 + M5 alineados + Pullback\n\n`;
      r += `2. **CHOCH_PULLBACK** (90pts)\n   Cambio de carácter + Pullback\n\n`;
      r += `3. **LIQUIDITY_SWEEP** (85pts)\n   Caza de stops + Reversión\n\n`;
      r += `4. **BOS_CONTINUATION** (80pts)\n   Ruptura de estructura + Pullback\n\n`;
      r += `5. **FVG_ENTRY** (75pts)\n   Entrada en Fair Value Gap\n\n`;
      r += `6. **ORDER_FLOW** (70pts)\n   Momentum + Pullback menor`;
      return { answer: r, type: 'models' };
    }

    // STATS
    if (q.includes('stat') || q.includes('win rate') || q.includes('resultado')) {
      const wr = stats.wins + stats.losses > 0 ? Math.round(stats.wins / (stats.wins + stats.losses) * 100) : 0;
      let r = `📈 **ESTADÍSTICAS**\n\n`;
      r += `Win Rate: ${wr}%\n`;
      r += `Wins: ${stats.wins} | Losses: ${stats.losses}\n`;
      r += `TPs: ${stats.tp1Hits}/${stats.tp2Hits}/${stats.tp3Hits}`;
      return { answer: r, type: 'stats' };
    }

    // AYUDA
    if (q.includes('ayuda') || q.includes('help') || q.includes('comando')) {
      return {
        answer: `🤝 **COMANDOS**\n\n• **analisis** - Ver el gráfico\n• **zonas** - Order blocks\n• **señal** - Operación activa\n• **plan** - Qué buscar\n• **modelos** - Lista de modelos\n• **stats** - Estadísticas`,
        type: 'help'
      };
    }

    // DEFAULT
    return {
      answer: `${ctx.emoji} ${ctx.name} @ ${ctx.price?.toFixed(ctx.decimals)}\n\nEscribe: analisis, zonas, señal, plan, modelos, stats`,
      type: 'default'
    };
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
    
    // Check SL
    if ((isLong && price <= locked.stop) || (!isLong && price >= locked.stop)) {
      closeSignal(signal.id, 'LOSS', 'AUTO-SL', symbol);
      continue;
    }
    
    // Check TPs
    if (isLong) {
      if (price >= locked.tp1 && !signal.tp1Hit) { signal.tp1Hit = locked.tp1Hit = true; stats.tp1Hits++; }
      if (price >= locked.tp2 && !signal.tp2Hit) { signal.tp2Hit = locked.tp2Hit = true; stats.tp2Hits++; }
      if (price >= locked.tp3 && !signal.tp3Hit) { signal.tp3Hit = locked.tp3Hit = true; stats.tp3Hits++; closeSignal(signal.id, 'WIN', 'AUTO-TP3', symbol); }
    } else {
      if (price <= locked.tp1 && !signal.tp1Hit) { signal.tp1Hit = locked.tp1Hit = true; stats.tp1Hits++; }
      if (price <= locked.tp2 && !signal.tp2Hit) { signal.tp2Hit = locked.tp2Hit = true; stats.tp2Hits++; }
      if (price <= locked.tp3 && !signal.tp3Hit) { signal.tp3Hit = locked.tp3Hit = true; stats.tp3Hits++; closeSignal(signal.id, 'WIN', 'AUTO-TP3', symbol); }
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
}

// =============================================
// CONEXIÓN DERIV
// =============================================
function connectDeriv() {
  const appId = process.env.DERIV_APP_ID || '1089';
  
  try {
    derivWs = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
  } catch (err) {
    console.error('Error conectando:', err);
    setTimeout(connectDeriv, 5000);
    return;
  }
  
  derivWs.on('open', () => {
    console.log('✅ Conectado a Deriv');
    isConnected = true;
    
    for (const symbol of Object.keys(ASSETS)) {
      // Suscribir a velas M5
      derivWs.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: 100,
        end: 'latest',
        granularity: GRANULARITY_M5,
        style: 'candles',
        subscribe: 1
      }));
      
      // Obtener velas H1 (sin suscripción, las pediremos periódicamente)
      derivWs.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: 50,
        end: 'latest',
        granularity: GRANULARITY_H1,
        style: 'candles',
        req_id: `h1_${symbol}`
      }));
      
      // Suscribir a ticks para precio en tiempo real
      derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    }
  });
  
  derivWs.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData);
      
      // Velas M5 históricas
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
          console.log(`📊 H1 ${symbol}: ${assetData[symbol].candlesH1.length} velas`);
          analyzeAsset(symbol);
        }
      }
      
      // Actualización de vela M5
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
      
      // Tick de precio
      if (msg.tick) {
        const symbol = msg.tick.symbol;
        if (assetData[symbol]) {
          assetData[symbol].price = parseFloat(msg.tick.quote);
          checkSignalHits();
        }
      }
      
    } catch (err) {
      // Silenciar errores de parsing
    }
  });
  
  derivWs.on('close', () => {
    console.log('❌ Desconectado de Deriv');
    isConnected = false;
    setTimeout(connectDeriv, 5000);
  });
  
  derivWs.on('error', (err) => {
    console.error('Error WebSocket:', err.message);
  });
}

function analyzeAsset(symbol) {
  const data = assetData[symbol];
  const config = ASSETS[symbol];
  
  if (!data || !config || data.candles.length < 30) return;
  
  // Rate limit análisis
  const now = Date.now();
  if (now - data.lastAnalysis < 2000) return;
  data.lastAnalysis = now;
  
  // Ejecutar análisis SMC
  const signal = SMC.analyze(data.candles, data.candlesH1, config, data);
  data.signal = signal;
  
  // Si ya hay señal bloqueada, no generar nueva
  if (data.lockedSignal) return;
  
  // Si el análisis dio señal válida, crear señal
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
        tp1Hit: false,
        tp2Hit: false,
        tp3Hit: false,
        status: 'PENDING',
        timestamp: new Date().toISOString(),
        reason: signal.reason
      };
      
      signalHistory.unshift(newSignal);
      data.lockedSignal = { ...newSignal };
      stats.total++;
      stats.pending++;
      
      if (signalHistory.length > 100) signalHistory.pop();
      
      console.log(`\n💎 SEÑAL #${newSignal.id} | ${config.name} | ${signal.action} | ${signal.model} | ${signal.score}%`);
    }
  }
}

// =============================================
// API ENDPOINTS
// =============================================
app.get('/', (req, res) => {
  res.json({ 
    name: 'Trading Master Pro',
    version: '12.5',
    ai: 'Marcus',
    connected: isConnected,
    assets: Object.keys(ASSETS).length
  });
});

app.get('/api/dashboard', (req, res) => {
  res.json({
    connected: isConnected,
    timestamp: new Date().toISOString(),
    assets: Object.entries(assetData).map(([symbol, data]) => ({
      symbol,
      ...ASSETS[symbol],
      timeframe: 'M5',
      price: data.price,
      signal: data.signal,
      lockedSignal: data.lockedSignal,
      demandZones: data.demandZones?.length || 0,
      supplyZones: data.supplyZones?.length || 0,
      fvgZones: data.fvgZones?.length || 0,
      liquidityLevels: data.liquidityLevels?.length || 0,
      h1Loaded: (data.candlesH1?.length || 0) > 0
    })),
    recentSignals: signalHistory.slice(0, 30),
    stats,
    learning: stats.learning
  });
});

app.get('/api/analyze/:symbol', (req, res) => {
  const { symbol } = req.params;
  const data = assetData[symbol];
  const config = ASSETS[symbol];
  
  if (!data || !config) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  
  res.json({
    symbol,
    ...config,
    price: data.price,
    signal: data.signal,
    lockedSignal: data.lockedSignal,
    candles: data.candles.slice(-100),
    candlesH1: data.candlesH1?.slice(-50) || [],
    demandZones: data.demandZones,
    supplyZones: data.supplyZones,
    fvgZones: data.fvgZones,
    liquidityLevels: data.liquidityLevels
  });
});

app.get('/api/signals', (req, res) => {
  res.json({ signals: signalHistory, stats });
});

app.put('/api/signals/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const signal = signalHistory.find(s => s.id === id);
  
  if (!signal) {
    return res.status(404).json({ error: 'Signal not found' });
  }
  
  closeSignal(id, req.body.status, 'MANUAL', signal.symbol);
  res.json({ success: true, signal, stats });
});

// Chat con Marcus
app.post('/api/ai/chat', (req, res) => {
  const { question, symbol } = req.body;
  const response = Marcus.chat(question || '', symbol || 'stpRNG');
  res.json(response);
});

// =============================================
// INICIO DEL SERVIDOR
// =============================================
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           TRADING MASTER PRO v12.5 - CORREGIDO                ║
╠═══════════════════════════════════════════════════════════════╣
║  🤖 Marcus AI Trader                                          ║
║  📊 6 Modelos SMC optimizados                                 ║
║  🔧 Lógica corregida y clara                                  ║
║  ⚡ Score mínimo reducido a 55-60%                            ║
╠═══════════════════════════════════════════════════════════════╣
║  Puerto: ${PORT}                                                   ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  
  connectDeriv();
  
  // Actualizar H1 cada 5 minutos
  setInterval(() => {
    if (derivWs?.readyState === WebSocket.OPEN) {
      derivWs.send(JSON.stringify({ ping: 1 }));
      
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
