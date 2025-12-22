// =============================================
// TRADING MASTER PRO - BACKEND v7.1
// SMC INSTITUCIONAL - CORRECCIONES ELITE
// =============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

console.log('\n🔧 TRADING MASTER PRO v7.1 - ELITE');
console.log('═══════════════════════════════════════');

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const DERIV_APP_ID = process.env.DERIV_APP_ID || '117347';
const DERIV_API_TOKEN = process.env.DERIV_API_TOKEN || '';
const DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3';
// WhatsApp Config - SIN el + en el número
const WHATSAPP_PHONE = (process.env.WHATSAPP_PHONE || '573203921881').replace('+', '');
const CALLMEBOT_API_KEY = process.env.CALLMEBOT_API_KEY || 'w2VJk5AzEsg3';

console.log('📱 WhatsApp Phone:', WHATSAPP_PHONE);
console.log('📱 WhatsApp API Key:', CALLMEBOT_API_KEY ? '✅ Configurada' : '❌ Falta');

// =============================================
// ÍNDICES
// =============================================
const SYNTHETIC_INDICES = {
  'stpRNG': { name: 'Step Index', pip: 0.01 },
  'R_75': { name: 'Volatility 75', pip: 0.0001 },
  'R_100': { name: 'Volatility 100', pip: 0.01 },
};

const TF_HTF = 300;  // 5M
const TF_LTF = 60;   // 1M

// =============================================
// ESTADO GLOBAL
// =============================================
let derivWs = null;
let isDerivConnected = false;
let aiEnabled = true; // Toggle para IA
const candleData = new Map();
const tickData = new Map();
const dailySignals = new Map();
const activeSignals = new Map();
const signalHistory = [];
const usedStructures = new Map(); // Para limitar 1 trade por CHoCH

// Reset diario
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    dailySignals.clear();
    usedStructures.clear();
    console.log('🔄 Reset diario');
  }
}, 60000);

// =============================================
// 🧠 ANALIZADOR SMC v7.1 - ELITE
// =============================================
const SMCAnalyzer = {

  // ========================================
  // 1️⃣ SWINGS (sin cambios)
  // ========================================
  findSwings(candles, length = 3) {
    const highs = [], lows = [];
    
    for (let i = length; i < candles.length - length; i++) {
      let isHigh = true, isLow = true;
      
      for (let j = 1; j <= length; j++) {
        if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isHigh = false;
        if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isLow = false;
      }
      
      if (isHigh) highs.push({ index: i, price: candles[i].high, time: candles[i].time, candle: candles[i] });
      if (isLow) lows.push({ index: i, price: candles[i].low, time: candles[i].time, candle: candles[i] });
    }
    
    return { highs, lows };
  },

  // ========================================
  // 2️⃣ LIQUIDEZ - CORREGIDO ✅
  // Solo estructura RECIENTE (últimos 5 swings)
  // ========================================
  detectLiquidity(candles, swings) {
    const liquidity = { equalHighs: [], equalLows: [], inducements: [] };
    
    // ✅ FIX: Solo swings RECIENTES (últimos 5)
    const recentHighs = swings.highs.slice(-5);
    const recentLows = swings.lows.slice(-5);
    
    const tolerance = 0.0003; // 0.03%
    
    // Equal Highs (liquidez arriba) - Solo recientes
    for (let i = 0; i < recentHighs.length - 1; i++) {
      for (let j = i + 1; j < recentHighs.length; j++) {
        const diff = Math.abs(recentHighs[i].price - recentHighs[j].price) / recentHighs[i].price;
        // ✅ FIX: Mínimo 3 velas de separación para ser válido
        if (diff <= tolerance && Math.abs(recentHighs[i].index - recentHighs[j].index) >= 3) {
          liquidity.equalHighs.push({
            type: 'EQUAL_HIGHS',
            price: Math.max(recentHighs[i].price, recentHighs[j].price),
            level: (recentHighs[i].price + recentHighs[j].price) / 2,
            points: [recentHighs[i], recentHighs[j]],
            age: candles.length - Math.max(recentHighs[i].index, recentHighs[j].index),
            description: 'Liquidez de compras (stops de ventas)'
          });
        }
      }
    }
    
    // Equal Lows (liquidez abajo) - Solo recientes
    for (let i = 0; i < recentLows.length - 1; i++) {
      for (let j = i + 1; j < recentLows.length; j++) {
        const diff = Math.abs(recentLows[i].price - recentLows[j].price) / recentLows[i].price;
        if (diff <= tolerance && Math.abs(recentLows[i].index - recentLows[j].index) >= 3) {
          liquidity.equalLows.push({
            type: 'EQUAL_LOWS',
            price: Math.min(recentLows[i].price, recentLows[j].price),
            level: (recentLows[i].price + recentLows[j].price) / 2,
            points: [recentLows[i], recentLows[j]],
            age: candles.length - Math.max(recentLows[i].index, recentLows[j].index),
            description: 'Liquidez de ventas (stops de compras)'
          });
        }
      }
    }
    
    // Inducements
    if (recentHighs.length >= 2) {
      const last = recentHighs[recentHighs.length - 1];
      const prev = recentHighs[recentHighs.length - 2];
      if (last.price < prev.price) {
        liquidity.inducements.push({
          type: 'INDUCEMENT_HIGH',
          price: last.price,
          mainTarget: prev.price
        });
      }
    }
    
    if (recentLows.length >= 2) {
      const last = recentLows[recentLows.length - 1];
      const prev = recentLows[recentLows.length - 2];
      if (last.price > prev.price) {
        liquidity.inducements.push({
          type: 'INDUCEMENT_LOW',
          price: last.price,
          mainTarget: prev.price
        });
      }
    }
    
    return liquidity;
  },

  // ========================================
  // 3️⃣ SWEEP - CORREGIDO ✅
  // Ventana reducida a 5-6 velas
  // ========================================
  detectSweep(candles, liquidity, swings) {
    if (!candles || candles.length < 10) return null;
    
    // ✅ FIX: Solo últimas 5-6 velas (más preciso y temprano)
    const recent = candles.slice(-6);
    const currentIndex = candles.length;
    
    // Sweep de Equal Highs
    for (const eqHigh of liquidity.equalHighs) {
      // ✅ FIX: Solo liquidez fresca (menos de 20 velas)
      if (eqHigh.age > 20) continue;
      
      for (let i = 0; i < recent.length; i++) {
        const candle = recent[i];
        const wickAbove = candle.high - Math.max(candle.open, candle.close);
        const bodySize = Math.abs(candle.close - candle.open);
        
        // SWEEP = wick rompe, cierre NO, y wick significativo
        if (candle.high > eqHigh.level && 
            candle.close < eqHigh.level && 
            candle.open < eqHigh.level &&
            wickAbove > bodySize * 0.3) { // Wick debe ser significativo
          return {
            type: 'SWEEP_HIGH',
            direction: 'BEARISH',
            level: eqHigh.level,
            sweepHigh: candle.high,
            sweepCandle: candle,
            sweepIndex: currentIndex - (recent.length - i),
            wickSize: wickAbove,
            description: 'Sweep de EQH - Instituciones vendiendo',
            valid: true
          };
        }
      }
    }
    
    // Sweep de Equal Lows
    for (const eqLow of liquidity.equalLows) {
      if (eqLow.age > 20) continue;
      
      for (let i = 0; i < recent.length; i++) {
        const candle = recent[i];
        const wickBelow = Math.min(candle.open, candle.close) - candle.low;
        const bodySize = Math.abs(candle.close - candle.open);
        
        if (candle.low < eqLow.level && 
            candle.close > eqLow.level && 
            candle.open > eqLow.level &&
            wickBelow > bodySize * 0.3) {
          return {
            type: 'SWEEP_LOW',
            direction: 'BULLISH',
            level: eqLow.level,
            sweepLow: candle.low,
            sweepCandle: candle,
            sweepIndex: currentIndex - (recent.length - i),
            wickSize: wickBelow,
            description: 'Sweep de EQL - Instituciones comprando',
            valid: true
          };
        }
      }
    }
    
    // Sweep de último swing (fallback)
    const lastHigh = swings.highs[swings.highs.length - 1];
    const lastLow = swings.lows[swings.lows.length - 1];
    
    for (let i = 0; i < recent.length; i++) {
      const candle = recent[i];
      
      if (lastHigh && candle.high > lastHigh.price && 
          candle.close < lastHigh.price && candle.open < lastHigh.price) {
        return {
          type: 'SWEEP_SWING_HIGH',
          direction: 'BEARISH',
          level: lastHigh.price,
          sweepHigh: candle.high,
          sweepCandle: candle,
          sweepIndex: currentIndex - (recent.length - i),
          description: 'Sweep de Swing High',
          valid: true
        };
      }
      
      if (lastLow && candle.low < lastLow.price && 
          candle.close > lastLow.price && candle.open > lastLow.price) {
        return {
          type: 'SWEEP_SWING_LOW',
          direction: 'BULLISH',
          level: lastLow.price,
          sweepLow: candle.low,
          sweepCandle: candle,
          sweepIndex: currentIndex - (recent.length - i),
          description: 'Sweep de Swing Low',
          valid: true
        };
      }
    }
    
    return null;
  },

  // ========================================
  // 4️⃣ DISPLACEMENT - CORREGIDO ✅
  // Protección contra NaN
  // ========================================
  detectDisplacement(candles, sweep) {
    if (!sweep || !sweep.valid || !candles || candles.length < 15) return null;
    
    const sweepIndex = sweep.sweepIndex || candles.length - 5;
    const afterSweep = candles.slice(sweepIndex);
    
    if (afterSweep.length < 2) return null;
    
    // ✅ FIX: Protección contra datos insuficientes
    const lookbackStart = Math.max(0, sweepIndex - 20);
    const lookbackEnd = Math.max(0, sweepIndex - 2);
    const lookback = candles.slice(lookbackStart, lookbackEnd);
    
    // ✅ FIX: Mínimo 5 velas para calcular ATR
    if (lookback.length < 5) return null;
    
    const avgRange = lookback.reduce((sum, c) => sum + (c.high - c.low), 0) / lookback.length;
    
    // ✅ FIX: Protección contra avgRange = 0 o NaN
    if (!avgRange || avgRange === 0 || isNaN(avgRange)) return null;
    
    // Buscar vela de desplazamiento
    for (let i = 0; i < Math.min(afterSweep.length, 5); i++) {
      const candle = afterSweep[i];
      const candleRange = candle.high - candle.low;
      const bodySize = Math.abs(candle.close - candle.open);
      const isImpulsive = bodySize > candleRange * 0.6;
      const multiplier = candleRange / avgRange;
      
      if (multiplier > 1.5 && isImpulsive) {
        const isBullish = candle.close > candle.open;
        
        if ((sweep.direction === 'BULLISH' && isBullish) || 
            (sweep.direction === 'BEARISH' && !isBullish)) {
          return {
            type: 'DISPLACEMENT',
            direction: sweep.direction,
            candle: candle,
            index: sweepIndex + i,
            range: candleRange,
            avgRange: avgRange,
            multiplier: multiplier.toFixed(2),
            description: `Desplazamiento ${sweep.direction} - ${multiplier.toFixed(1)}x ATR`,
            valid: true
          };
        }
      }
    }
    
    return null;
  },

  // ========================================
  // 5️⃣ CHoCH - CORREGIDO ✅
  // Solo swings estructurales válidos
  // ========================================
  detectCHoCH(candles, swings, sweep, displacement) {
    if (!sweep || !sweep.valid) return null;
    if (!displacement || !displacement.valid) return null;
    
    const { highs, lows } = swings;
    const displacementIndex = displacement.index;
    const afterDisplacement = candles.slice(displacementIndex);
    
    if (afterDisplacement.length < 2) return null;
    
    // CHoCH ALCISTA
    if (sweep.direction === 'BULLISH') {
      // ✅ FIX: Solo highs ESTRUCTURALES (no micro swings)
      // Filtrar highs que tienen al menos 3 velas de separación y son significativos
      const structuralHighs = highs
        .filter(h => h.index < displacementIndex)
        .filter((h, i, arr) => {
          if (i === 0) return true;
          return Math.abs(h.index - arr[i-1].index) >= 3;
        })
        .slice(-3);
      
      // ✅ FIX: Usar el swing más relevante (el que formó la estructura)
      const relevantHigh = structuralHighs.reduce((best, h) => {
        if (!best) return h;
        // Preferir el swing más alto que sea reciente
        return h.price > best.price ? h : best;
      }, null);
      
      if (relevantHigh) {
        for (let i = 0; i < afterDisplacement.length; i++) {
          const candle = afterDisplacement[i];
          if (candle.close > relevantHigh.price) {
            const chochId = `${sweep.sweepIndex}_${relevantHigh.price.toFixed(4)}`;
            return {
              id: chochId,
              type: 'CHoCH',
              direction: 'BULLISH',
              breakLevel: relevantHigh.price,
              breakCandle: candle,
              breakIndex: displacementIndex + i,
              structuralSwing: relevantHigh,
              description: 'CHoCH Alcista confirmado',
              valid: true
            };
          }
        }
      }
    }
    
    // CHoCH BAJISTA
    if (sweep.direction === 'BEARISH') {
      const structuralLows = lows
        .filter(l => l.index < displacementIndex)
        .filter((l, i, arr) => {
          if (i === 0) return true;
          return Math.abs(l.index - arr[i-1].index) >= 3;
        })
        .slice(-3);
      
      const relevantLow = structuralLows.reduce((best, l) => {
        if (!best) return l;
        return l.price < best.price ? l : best;
      }, null);
      
      if (relevantLow) {
        for (let i = 0; i < afterDisplacement.length; i++) {
          const candle = afterDisplacement[i];
          if (candle.close < relevantLow.price) {
            const chochId = `${sweep.sweepIndex}_${relevantLow.price.toFixed(4)}`;
            return {
              id: chochId,
              type: 'CHoCH',
              direction: 'BEARISH',
              breakLevel: relevantLow.price,
              breakCandle: candle,
              breakIndex: displacementIndex + i,
              structuralSwing: relevantLow,
              description: 'CHoCH Bajista confirmado',
              valid: true
            };
          }
        }
      }
    }
    
    return null;
  },

  // ========================================
  // 6️⃣ ORDER BLOCK - CORREGIDO ✅
  // Validación de mitigación
  // ========================================
  findDecisionalOB(candles, choch, displacement) {
    if (!choch || !choch.valid || !displacement) return null;
    
    const displacementIndex = displacement.index;
    const searchStart = Math.max(0, displacementIndex - 10);
    const searchRange = candles.slice(searchStart, displacementIndex);
    
    let decisionalOB = null;
    
    if (choch.direction === 'BULLISH') {
      // OB de DEMANDA
      for (let i = searchRange.length - 1; i >= 0; i--) {
        const candle = searchRange[i];
        const isBearish = candle.close < candle.open;
        const bodySize = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;
        
        if (isBearish && bodySize > range * 0.4) {
          const obIndex = searchStart + i;
          
          // ✅ FIX: Verificar que NO esté mitigado
          const afterOB = candles.slice(obIndex + 1);
          const isMitigated = afterOB.some(c => c.low <= candle.low);
          
          if (!isMitigated) {
            decisionalOB = {
              type: 'DECISIONAL',
              obType: 'DEMAND',
              high: candle.high,
              low: candle.low,
              mid: (candle.high + candle.low) / 2,
              index: obIndex,
              candle: candle,
              mitigated: false,
              description: 'OB Demanda - Sin mitigar',
              valid: true
            };
            break;
          }
        }
      }
    } else {
      // OB de OFERTA
      for (let i = searchRange.length - 1; i >= 0; i--) {
        const candle = searchRange[i];
        const isBullish = candle.close > candle.open;
        const bodySize = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;
        
        if (isBullish && bodySize > range * 0.4) {
          const obIndex = searchStart + i;
          
          // ✅ FIX: Verificar que NO esté mitigado
          const afterOB = candles.slice(obIndex + 1);
          const isMitigated = afterOB.some(c => c.high >= candle.high);
          
          if (!isMitigated) {
            decisionalOB = {
              type: 'DECISIONAL',
              obType: 'SUPPLY',
              high: candle.high,
              low: candle.low,
              mid: (candle.high + candle.low) / 2,
              index: obIndex,
              candle: candle,
              mitigated: false,
              description: 'OB Oferta - Sin mitigar',
              valid: true
            };
            break;
          }
        }
      }
    }
    
    return decisionalOB;
  },

  // ========================================
  // 7️⃣ LTF ENTRY - CORREGIDO ✅
  // Micro CHoCH o Rejection fuerte
  // ========================================
  checkLTFEntry(candlesLTF, ob, direction) {
    if (!ob || !candlesLTF || candlesLTF.length < 20) return null;
    
    const recent = candlesLTF.slice(-15);
    const currentPrice = recent[recent.length - 1]?.close;
    
    if (!currentPrice) return null;
    
    const inOBZone = currentPrice >= ob.low && currentPrice <= ob.high;
    const nearOBZone = direction === 'BULLISH' 
      ? currentPrice > ob.high && currentPrice < ob.high + (ob.high - ob.low) * 0.5
      : currentPrice < ob.low && currentPrice > ob.low - (ob.high - ob.low) * 0.5;
    
    if (inOBZone) {
      // ✅ FIX: Buscar MICRO CHoCH o REJECTION FUERTE
      for (let i = recent.length - 5; i < recent.length - 1; i++) {
        const prev = recent[i];
        const curr = recent[i + 1];
        
        if (direction === 'BULLISH') {
          // Opción 1: Micro CHoCH (rompe alto de vela anterior)
          const isMicroCHoCH = curr.close > prev.high && curr.close > curr.open;
          
          // Opción 2: Rejection fuerte (pin bar alcista)
          const wickBelow = Math.min(curr.open, curr.close) - curr.low;
          const bodySize = Math.abs(curr.close - curr.open);
          const isRejection = wickBelow > bodySize * 2 && curr.close > curr.open;
          
          // ✅ FIX: Precio hace nuevo low y cierra arriba
          const sweepAndClose = curr.low < prev.low && curr.close > prev.close;
          
          if (isMicroCHoCH || isRejection || sweepAndClose) {
            return {
              type: 'LTF_CONFIRMATION',
              confirmationType: isMicroCHoCH ? 'MICRO_CHOCH' : isRejection ? 'REJECTION' : 'SWEEP_CLOSE',
              direction: 'BULLISH',
              entryPrice: curr.close,
              confirmationCandle: curr,
              inZone: true,
              description: `Confirmación ${isMicroCHoCH ? 'Micro CHoCH' : isRejection ? 'Rejection' : 'Sweep+Close'}`,
              valid: true
            };
          }
        }
        
        if (direction === 'BEARISH') {
          const isMicroCHoCH = curr.close < prev.low && curr.close < curr.open;
          const wickAbove = curr.high - Math.max(curr.open, curr.close);
          const bodySize = Math.abs(curr.close - curr.open);
          const isRejection = wickAbove > bodySize * 2 && curr.close < curr.open;
          const sweepAndClose = curr.high > prev.high && curr.close < prev.close;
          
          if (isMicroCHoCH || isRejection || sweepAndClose) {
            return {
              type: 'LTF_CONFIRMATION',
              confirmationType: isMicroCHoCH ? 'MICRO_CHOCH' : isRejection ? 'REJECTION' : 'SWEEP_CLOSE',
              direction: 'BEARISH',
              entryPrice: curr.close,
              confirmationCandle: curr,
              inZone: true,
              description: `Confirmación ${isMicroCHoCH ? 'Micro CHoCH' : isRejection ? 'Rejection' : 'Sweep+Close'}`,
              valid: true
            };
          }
        }
      }
    }
    
    return {
      type: 'WAITING',
      direction: direction,
      currentPrice,
      obZone: { high: ob.high, low: ob.low },
      inZone: inOBZone,
      nearZone: nearOBZone,
      description: inOBZone ? 'En zona - Esperando micro CHoCH/rejection' : 'Esperando precio en OB',
      valid: false
    };
  },

  // ========================================
  // 8️⃣ NIVELES - RATIOS 1:5 y 1:10 ✅
  // ========================================
  calculateLevels(ob, direction, currentPrice) {
    if (!ob) return null;
    
    let entry, stopLoss;
    
    if (direction === 'BULLISH') {
      entry = ob.high;
      stopLoss = ob.low - ((ob.high - ob.low) * 0.3);
    } else {
      entry = ob.low;
      stopLoss = ob.high + ((ob.high - ob.low) * 0.3);
    }
    
    const risk = Math.abs(entry - stopLoss);
    
    // ✅ Ratios extendidos para Step/Volatility
    const tp1 = direction === 'BULLISH' ? entry + (risk * 2) : entry - (risk * 2);
    const tp2 = direction === 'BULLISH' ? entry + (risk * 3) : entry - (risk * 3);
    const tp3 = direction === 'BULLISH' ? entry + (risk * 5) : entry - (risk * 5);
    const tp4 = direction === 'BULLISH' ? entry + (risk * 10) : entry - (risk * 10);
    
    return {
      entry: entry.toFixed(4),
      stopLoss: stopLoss.toFixed(4),
      tp1: tp1.toFixed(4),
      tp2: tp2.toFixed(4),
      tp3: tp3.toFixed(4),
      tp4: tp4.toFixed(4),
      risk: risk.toFixed(4),
      ratios: '1:2 | 1:3 | 1:5 | 1:10'
    };
  },

  // ========================================
  // 9️⃣ SCORE
  // ========================================
  calculateScore(analysis) {
    let score = 0;
    const breakdown = {};
    
    if (analysis.liquidity?.equalHighs?.length > 0 || analysis.liquidity?.equalLows?.length > 0) {
      score += 20;
      breakdown.liquidity = 20;
    }
    
    if (analysis.sweep?.valid) {
      score += 25;
      breakdown.sweep = 25;
    }
    
    if (analysis.displacement?.valid) {
      const mult = parseFloat(analysis.displacement.multiplier) || 1;
      const pts = Math.min(20, Math.floor(mult * 8));
      score += pts;
      breakdown.displacement = pts;
    }
    
    if (analysis.choch?.valid) {
      score += 20;
      breakdown.choch = 20;
    }
    
    if (analysis.orderBlock?.valid && !analysis.orderBlock.mitigated) {
      score += 15;
      breakdown.orderBlock = 15;
    }
    
    let classification = 'INVALID';
    if (score >= 90) classification = 'A+';
    else if (score >= 75) classification = 'A';
    else if (score >= 60) classification = 'B';
    
    return { score, classification, breakdown, isValid: score >= 75, canAutomate: score >= 90 };
  },

  // ========================================
  // 🎯 ANÁLISIS COMPLETO
  // ========================================
  analyze(symbol) {
    const config = SYNTHETIC_INDICES[symbol];
    if (!config) return { error: 'Símbolo no soportado' };
    
    const candlesHTF = candleData.get(`${symbol}_${TF_HTF}`) || [];
    const candlesLTF = candleData.get(`${symbol}_${TF_LTF}`) || [];
    
    if (candlesHTF.length < 50) {
      return { symbol, symbolName: config.name, error: 'Cargando...', dataCount: candlesHTF.length, status: 'LOADING' };
    }
    
    const currentPrice = candlesHTF[candlesHTF.length - 1]?.close;
    
    // Flujo SMC
    const swings = this.findSwings(candlesHTF);
    const liquidity = this.detectLiquidity(candlesHTF, swings);
    const sweep = this.detectSweep(candlesHTF, liquidity, swings);
    const displacement = this.detectDisplacement(candlesHTF, sweep);
    const choch = this.detectCHoCH(candlesHTF, swings, sweep, displacement);
    const orderBlock = this.findDecisionalOB(candlesHTF, choch, displacement);
    const ltfEntry = orderBlock && choch ? this.checkLTFEntry(candlesLTF, orderBlock, choch.direction) : null;
    
    const analysisData = { liquidity, sweep, displacement, choch, orderBlock };
    const scoring = this.calculateScore(analysisData);
    const levels = orderBlock && choch ? this.calculateLevels(orderBlock, choch.direction, currentPrice) : null;
    
    // ✅ FIX: Verificar si ya usamos este CHoCH
    let structureUsed = false;
    if (choch?.id) {
      structureUsed = usedStructures.has(choch.id);
    }
    
    // Estado
    let status = 'BUSCANDO';
    let waiting = [];
    let hasSignal = false;
    
    if (!liquidity.equalHighs.length && !liquidity.equalLows.length) {
      status = 'SIN_LIQUIDEZ';
      waiting.push('Buscando Equal Highs/Lows');
    } else if (!sweep?.valid) {
      status = 'ESPERANDO_SWEEP';
      waiting.push('Liquidez detectada - Esperando sweep');
    } else if (!displacement?.valid) {
      status = 'ESPERANDO_DISPLACEMENT';
      waiting.push('Sweep OK - Esperando desplazamiento');
    } else if (!choch?.valid) {
      status = 'ESPERANDO_CHOCH';
      waiting.push('Displacement OK - Esperando CHoCH');
    } else if (!orderBlock?.valid) {
      status = 'BUSCANDO_OB';
      waiting.push('CHoCH OK - Buscando OB válido');
    } else if (structureUsed) {
      status = 'ESTRUCTURA_USADA';
      waiting.push('Ya operamos este CHoCH - Esperar nueva liquidez');
    } else if (!ltfEntry?.valid) {
      status = 'ESPERANDO_ENTRADA';
      waiting.push('OB listo - Esperando confirmación 1M');
      waiting.push(`Zona: ${orderBlock.low.toFixed(2)} - ${orderBlock.high.toFixed(2)}`);
    } else {
      status = 'SEÑAL_ACTIVA';
      hasSignal = scoring.isValid && !structureUsed;
    }
    
    return {
      symbol,
      symbolName: config.name,
      currentPrice,
      swings: { highsCount: swings.highs.length, lowsCount: swings.lows.length },
      liquidity,
      sweep,
      displacement,
      choch,
      orderBlock,
      ltfEntry,
      scoring,
      levels,
      status,
      waiting,
      hasSignal,
      structureUsed,
      direction: choch?.direction || null,
      candles: { htf: candlesHTF.slice(-80), ltf: candlesLTF.slice(-60) },
      chartMarkers: {
        liquidity: {
          equalHighs: liquidity.equalHighs.map(e => e.level),
          equalLows: liquidity.equalLows.map(e => e.level)
        },
        sweep: sweep ? { price: sweep.level, direction: sweep.direction } : null,
        choch: choch ? { price: choch.breakLevel, direction: choch.direction } : null,
        orderBlock,
        levels
      }
    };
  }
};

// =============================================
// NARRACIÓN IA
// =============================================
async function generateNarration(analysis) {
  if (!aiEnabled || !openai || !analysis || analysis.error) {
    return { text: analysis?.error || 'IA desactivada', waiting: analysis?.waiting || [], aiEnabled };
  }

  const prompt = `Narra brevemente (2-3 oraciones) el estado SMC de ${analysis.symbolName}:
- Liquidez: ${analysis.liquidity?.equalHighs?.length || 0} EQH, ${analysis.liquidity?.equalLows?.length || 0} EQL
- Sweep: ${analysis.sweep?.valid ? 'SÍ' : 'NO'}
- Displacement: ${analysis.displacement?.valid ? `${analysis.displacement.multiplier}x` : 'NO'}
- CHoCH: ${analysis.choch?.valid ? analysis.choch.direction : 'NO'}
- OB: ${analysis.orderBlock?.valid ? analysis.orderBlock.obType : 'NO'}
- Estado: ${analysis.status}

Habla como trader profesional SMC. Di qué está pasando y qué esperar.`;

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 120,
    });
    return { text: res.choices[0]?.message?.content || 'Analizando...', waiting: analysis.waiting, aiEnabled };
  } catch {
    return { text: 'Error IA', waiting: analysis.waiting, aiEnabled };
  }
}

// =============================================
// WHATSAPP
// =============================================
async function sendWhatsApp(signal) {
  console.log('📱 Intentando enviar WhatsApp via TextMeBot...');
  console.log('📱 Phone:', WHATSAPP_PHONE);
  console.log('📱 API Key:', CALLMEBOT_API_KEY ? CALLMEBOT_API_KEY.substring(0, 4) + '***' : 'NO CONFIGURADA');
  
  if (!CALLMEBOT_API_KEY) {
    console.log('❌ WhatsApp: API Key no configurada');
    return false;
  }
  
  const msg = `🎯 *SMC ELITE v7.1*
📊 ${signal.symbolName || 'Test'}
${signal.direction === 'BULLISH' ? '🟢 COMPRA' : '🔴 VENTA'}

✅ Sweep: ${signal.sweep?.description || 'N/A'}
✅ CHoCH: ${signal.choch?.description || 'N/A'}
✅ OB: ${signal.orderBlock?.description || 'N/A'}
✅ Entry: ${signal.ltfEntry?.confirmationType || 'N/A'}

📍 Entry: ${signal.levels?.entry || 'N/A'}
🛑 SL: ${signal.levels?.stopLoss || 'N/A'}
🎯 TP1 (1:2): ${signal.levels?.tp1 || 'N/A'}
🎯 TP2 (1:3): ${signal.levels?.tp2 || 'N/A'}
🎯 TP3 (1:5): ${signal.levels?.tp3 || 'N/A'}
🎯 TP4 (1:10): ${signal.levels?.tp4 || 'N/A'}

🏆 Score: ${signal.scoring?.score || 0}/100 (${signal.scoring?.classification || 'N/A'})`;

  // TextMeBot API (diferente a CallMeBot)
  const url = `https://api.textmebot.com/send.php?recipient=${WHATSAPP_PHONE}&apikey=${CALLMEBOT_API_KEY}&text=${encodeURIComponent(msg)}`;
  
  console.log('📱 Usando TextMeBot API');

  try {
    const response = await fetch(url);
    const text = await response.text();
    console.log('📱 WhatsApp Response Status:', response.status);
    console.log('📱 WhatsApp Response:', text.substring(0, 200));
    
    if (response.ok || text.includes('success') || text.includes('sent') || text.includes('queued')) {
      console.log('✅ WhatsApp enviado exitosamente');
      return true;
    } else {
      console.log('⚠️ WhatsApp respuesta:', text);
      return false;
    }
  } catch (error) {
    console.error('❌ WhatsApp Error:', error.message);
    return false;
  }
}

// =============================================
// DERIV WEBSOCKET
// =============================================
function connectDeriv() {
  console.log('🔌 Conectando a Deriv...');
  derivWs = new WebSocket(`${DERIV_WS_URL}?app_id=${DERIV_APP_ID}`);

  derivWs.on('open', () => {
    console.log('✅ Conectado');
    isDerivConnected = true;
    if (DERIV_API_TOKEN) derivWs.send(JSON.stringify({ authorize: DERIV_API_TOKEN }));

    Object.keys(SYNTHETIC_INDICES).forEach(symbol => {
      derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      [TF_LTF, TF_HTF].forEach(g => {
        derivWs.send(JSON.stringify({
          ticks_history: symbol, adjust_start_time: 1, count: 200,
          end: 'latest', granularity: g, style: 'candles', subscribe: 1,
        }));
      });
    });
  });

  derivWs.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.error) return;

      if (msg.tick) {
        const { symbol, quote, epoch } = msg.tick;
        if (!tickData.has(symbol)) tickData.set(symbol, []);
        tickData.get(symbol).push({ time: epoch, price: parseFloat(quote) });
        if (tickData.get(symbol).length > 200) tickData.get(symbol).shift();
      }

      if (msg.ohlc) {
        const { symbol, granularity, open_time, open, high, low, close } = msg.ohlc;
        const key = `${symbol}_${granularity}`;
        if (!candleData.has(key)) candleData.set(key, []);
        const candles = candleData.get(key);
        const newCandle = { time: open_time, open: parseFloat(open), high: parseFloat(high), low: parseFloat(low), close: parseFloat(close) };

        if (candles.length > 0 && candles[candles.length - 1].time === newCandle.time) {
          candles[candles.length - 1] = newCandle;
        } else {
          candles.push(newCandle);
          if (granularity === TF_HTF) await checkSignal(symbol);
        }
        if (candles.length > 300) candles.shift();
      }

      if (msg.candles) {
        const symbol = msg.echo_req?.ticks_history;
        const granularity = msg.echo_req?.granularity;
        candleData.set(`${symbol}_${granularity}`, msg.candles.map(c => ({
          time: c.epoch, open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close)
        })));
        console.log(`✅ ${SYNTHETIC_INDICES[symbol]?.name} ${granularity === TF_HTF ? '5M' : '1M'}: ${msg.candles.length} velas`);
      }
    } catch {}
  });

  derivWs.on('close', () => { isDerivConnected = false; setTimeout(connectDeriv, 5000); });
  derivWs.on('error', () => {});
}

async function checkSignal(symbol) {
  const count = dailySignals.get(symbol) || 0;
  if (count >= 7) return;

  const analysis = SMCAnalyzer.analyze(symbol);
  
  if (analysis.hasSignal && analysis.scoring?.canAutomate && !analysis.structureUsed) {
    const signalId = `${symbol}_${Date.now()}`;
    const signal = { 
      id: signalId, 
      ...analysis, 
      dailyCount: count + 1, 
      createdAt: new Date().toISOString(),
      // Guardar contexto completo para historial
      context: {
        sweepType: analysis.sweep?.type,
        displacementMultiplier: analysis.displacement?.multiplier,
        obType: analysis.orderBlock?.obType,
        ltfConfirmation: analysis.ltfEntry?.confirmationType
      }
    };
    
    // Marcar estructura como usada
    if (analysis.choch?.id) {
      usedStructures.set(analysis.choch.id, true);
    }
    
    activeSignals.set(signalId, signal);
    signalHistory.unshift(signal);
    if (signalHistory.length > 50) signalHistory.pop();
    dailySignals.set(symbol, count + 1);

    console.log(`🎯 SEÑAL A+ #${count + 1}/7: ${analysis.direction} ${analysis.symbolName}`);
    await sendWhatsApp(signal);
  }
}

connectDeriv();

// =============================================
// MIDDLEWARE & RUTAS
// =============================================
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => res.json({ status: 'ok', version: '7.1-elite', deriv: isDerivConnected, aiEnabled }));
app.get('/health', (req, res) => res.json({ status: 'healthy', deriv: isDerivConnected }));

app.get('/api/deriv/symbols', (req, res) => res.json(SYNTHETIC_INDICES));
app.get('/api/deriv/status', (req, res) => res.json({ connected: isDerivConnected }));

app.get('/api/analyze/:symbol', (req, res) => res.json(SMCAnalyzer.analyze(req.params.symbol)));

app.get('/api/narration/:symbol', async (req, res) => {
  const analysis = SMCAnalyzer.analyze(req.params.symbol);
  const narration = await generateNarration(analysis);
  res.json(narration);
});

// Toggle IA
app.post('/api/ai/toggle', (req, res) => {
  aiEnabled = !aiEnabled;
  console.log(`🤖 IA: ${aiEnabled ? 'ON' : 'OFF'}`);
  res.json({ aiEnabled });
});

app.get('/api/ai/status', (req, res) => res.json({ aiEnabled }));

// Señales
app.get('/api/signals/active', (req, res) => res.json(Array.from(activeSignals.values())));
app.get('/api/signals/history', (req, res) => res.json(signalHistory));
app.get('/api/signals/:id', (req, res) => {
  const signal = signalHistory.find(s => s.id === req.params.id);
  res.json(signal || { error: 'No encontrada' });
});
app.get('/api/signals/daily-count', (req, res) => {
  const counts = {};
  Object.keys(SYNTHETIC_INDICES).forEach(s => counts[s] = dailySignals.get(s) || 0);
  res.json(counts);
});

app.get('/api/test-whatsapp', async (req, res) => {
  console.log('🧪 Test WhatsApp iniciado...');
  
  const config = {
    phone: WHATSAPP_PHONE,
    apiKeyConfigured: !!CALLMEBOT_API_KEY,
    apiKeyPreview: CALLMEBOT_API_KEY ? CALLMEBOT_API_KEY.substring(0, 4) + '***' : 'NO CONFIGURADA',
    service: 'TextMeBot'
  };
  
  const result = await sendWhatsApp({
    symbolName: '🧪 TEST v7.1', 
    direction: 'BULLISH',
    sweep: { description: 'Sweep EQL Test' }, 
    choch: { description: 'CHoCH Alcista Test' }, 
    orderBlock: { description: 'OB Demanda Test' }, 
    ltfEntry: { confirmationType: 'TEST' },
    levels: { entry: '100.00', stopLoss: '99.00', tp1: '102.00', tp2: '103.00', tp3: '105.00', tp4: '110.00' },
    scoring: { score: 95, classification: 'A+' }
  });
  
  res.json({ 
    success: result, 
    config,
    message: result ? '✅ Mensaje enviado, revisa tu WhatsApp' : '❌ Error al enviar, revisa los logs en Railway',
    testUrl: `https://api.textmebot.com/send.php?recipient=${WHATSAPP_PHONE}&apikey=${CALLMEBOT_API_KEY}&text=Test+Manual`
  });
});

// Endpoint para ver configuración
app.get('/api/config', (req, res) => {
  res.json({
    version: '7.1-elite',
    whatsapp: {
      phone: WHATSAPP_PHONE,
      apiKeyConfigured: !!CALLMEBOT_API_KEY,
      apiKeyPreview: CALLMEBOT_API_KEY ? CALLMEBOT_API_KEY.substring(0, 4) + '***' : 'NO'
    },
    deriv: {
      connected: isDerivConnected,
      appId: DERIV_APP_ID
    },
    ai: {
      enabled: aiEnabled,
      configured: !!openai
    }
  });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     TRADING MASTER PRO v7.1 ELITE                          ║
║     SMC Institucional - Todas las correcciones             ║
╠════════════════════════════════════════════════════════════╣
║  ✅ Liquidez: Solo swings recientes (5)                    ║
║  ✅ Sweep: Ventana 5-6 velas                               ║
║  ✅ Displacement: Protección NaN                           ║
║  ✅ CHoCH: Solo swings estructurales                       ║
║  ✅ OB: Validación de mitigación                           ║
║  ✅ LTF: Micro CHoCH / Rejection / Sweep+Close             ║
║  ✅ Ratios: 1:2, 1:3, 1:5, 1:10                            ║
║  ✅ 1 trade por estructura                                 ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;
