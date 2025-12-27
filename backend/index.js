// =============================================
// TRADING MASTER PRO v11.5
// - No repetir señales hasta TP/SL
// - Alerta cuando estructura cambia
// - Sin Volatility 100
// - Narrador más expresivo
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
// CONFIGURACIÓN - Sin Volatility 100
// =============================================
const ASSETS = {
  'stpRNG': { 
    name: 'Step Index', 
    shortName: 'Step',
    emoji: '📊', 
    type: 'synthetic',
    timeframe: '1s',
    decimals: 2, 
    slBuffer: 2.0
  },
  '1HZ75V': { 
    name: 'Volatility 75', 
    shortName: 'V75',
    emoji: '📈', 
    type: 'synthetic',
    timeframe: '1s',
    decimals: 2, 
    slBuffer: 5.0
  },
  'frxXAUUSD': { 
    name: 'Oro (XAU/USD)', 
    shortName: 'XAU',
    emoji: '🥇', 
    type: 'commodity',
    timeframe: 'M5',
    decimals: 2, 
    slBuffer: 1.0
  },
  'frxGBPUSD': { 
    name: 'GBP/USD', 
    shortName: 'GBP',
    emoji: '💷', 
    type: 'forex',
    timeframe: 'M5',
    decimals: 5, 
    slBuffer: 0.0003
  },
  'cryBTCUSD': { 
    name: 'Bitcoin (BTC/USD)', 
    shortName: 'BTC',
    emoji: '₿', 
    type: 'crypto',
    timeframe: 'M5',
    decimals: 2, 
    slBuffer: 50
  }
};

// =============================================
// ESTADO GLOBAL
// =============================================
let derivWs = null;
let isConnected = false;
let reconnectAttempts = 0;

const assetData = {};
for (const symbol of Object.keys(ASSETS)) {
  assetData[symbol] = {
    candles: [],
    price: null,
    signal: null,
    lastAnalysis: 0,
    demandZones: [],
    supplyZones: [],
    swings: [],
    // NUEVO: Control de señales activas
    activeSignalId: null,
    lastStructure: null,
    structureAlert: null
  };
}

let signalHistory = [];
let signalIdCounter = 1;

const stats = {
  total: 0, wins: 0, losses: 0, notTaken: 0, pending: 0,
  tp1Hits: 0, tp2Hits: 0, tp3Hits: 0,
  byModel: {},
  byAsset: {}
};

for (const symbol of Object.keys(ASSETS)) {
  stats.byAsset[symbol] = { wins: 0, losses: 0 };
}

// =============================================
// MOTOR SMC v11.5
// =============================================
const SMC = {
  findSwings(candles, lookback = 2) {
    const swings = [];
    
    for (let i = lookback; i < candles.length - lookback; i++) {
      const c = candles[i];
      const left = candles.slice(i - lookback, i);
      const right = candles.slice(i + 1, i + lookback + 1);
      
      const isSwingHigh = left.every(x => x.high <= c.high) && right.every(x => x.high < c.high);
      const isSwingLow = left.every(x => x.low >= c.low) && right.every(x => x.low > c.low);
      
      if (isSwingHigh) swings.push({ type: 'high', price: c.high, index: i, time: c.time });
      if (isSwingLow) swings.push({ type: 'low', price: c.low, index: i, time: c.time });
    }
    
    return swings;
  },

  findAllZones(candles) {
    const demandZones = [];
    const supplyZones = [];
    
    if (candles.length < 15) return { demandZones, supplyZones };
    
    const ranges = candles.slice(-30).map(c => c.high - c.low);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    
    for (let i = 3; i < candles.length - 2; i++) {
      const curr = candles[i];
      const next = candles[i + 1];
      const next2 = candles[i + 2] || next;
      
      const isBearish = curr.close < curr.open;
      const bullishMove = next.close > curr.high || next2.close > curr.high;
      const strongBullish = next.close > next.open && (next.close - next.open) > avgRange * 0.3;
      
      if (isBearish && (bullishMove || strongBullish)) {
        const tooClose = demandZones.some(z => Math.abs(z.mid - curr.low) < avgRange * 0.5);
        if (!tooClose) {
          demandZones.push({
            type: 'DEMAND', high: curr.open, low: curr.low,
            mid: (curr.open + curr.low) / 2, index: i, time: curr.time,
            strength: bullishMove && strongBullish ? 'STRONG' : 'NORMAL', valid: true
          });
        }
      }
      
      const isBullish = curr.close > curr.open;
      const bearishMove = next.close < curr.low || next2.close < curr.low;
      const strongBearish = next.close < next.open && (next.open - next.close) > avgRange * 0.3;
      
      if (isBullish && (bearishMove || strongBearish)) {
        const tooClose = supplyZones.some(z => Math.abs(z.mid - curr.high) < avgRange * 0.5);
        if (!tooClose) {
          supplyZones.push({
            type: 'SUPPLY', high: curr.high, low: curr.open,
            mid: (curr.high + curr.open) / 2, index: i, time: curr.time,
            strength: bearishMove && strongBearish ? 'STRONG' : 'NORMAL', valid: true
          });
        }
      }
    }
    
    demandZones.forEach(zone => {
      const candlesAfter = candles.slice(zone.index + 3);
      if (candlesAfter.some(c => c.close < zone.low * 0.998)) zone.valid = false;
    });
    
    supplyZones.forEach(zone => {
      const candlesAfter = candles.slice(zone.index + 3);
      if (candlesAfter.some(c => c.close > zone.high * 1.002)) zone.valid = false;
    });
    
    return {
      demandZones: demandZones.filter(z => z.valid).slice(-5),
      supplyZones: supplyZones.filter(z => z.valid).slice(-5)
    };
  },

  analyzeStructure(swings) {
    const highs = swings.filter(s => s.type === 'high').slice(-6);
    const lows = swings.filter(s => s.type === 'low').slice(-6);
    
    let trend = 'NEUTRAL';
    let lastHH = null, lastHL = null, lastLH = null, lastLL = null;
    
    for (let i = 1; i < highs.length; i++) {
      if (highs[i].price > highs[i-1].price) lastHH = highs[i];
      else lastLH = highs[i];
    }
    
    for (let i = 1; i < lows.length; i++) {
      if (lows[i].price > lows[i-1].price) lastHL = lows[i];
      else lastLL = lows[i];
    }
    
    if (lastHH || lastHL) trend = 'BULLISH';
    if (lastLH || lastLL) trend = 'BEARISH';
    if ((lastHH || lastHL) && (lastLH || lastLL)) {
      const bullishIdx = Math.max(lastHH?.index || 0, lastHL?.index || 0);
      const bearishIdx = Math.max(lastLH?.index || 0, lastLL?.index || 0);
      trend = bullishIdx > bearishIdx ? 'BULLISH' : 'BEARISH';
    }
    
    return { trend, lastHH, lastHL, lastLH, lastLL, highs, lows };
  },

  detectCHoCH(candles, swings) {
    if (swings.length < 4) return null;
    
    const highs = swings.filter(s => s.type === 'high');
    const lows = swings.filter(s => s.type === 'low');
    
    if (highs.length < 2 || lows.length < 2) return null;
    
    const last15Candles = candles.slice(-15);
    
    for (let i = Math.max(0, highs.length - 4); i < highs.length; i++) {
      const targetHigh = highs[i];
      const lowsBefore = lows.filter(l => l.index < targetHigh.index).slice(-3);
      const hadLowerLows = lowsBefore.length >= 2 && 
        lowsBefore.some((l, idx) => idx > 0 && l.price < lowsBefore[idx-1].price);
      
      if (hadLowerLows && last15Candles.some(c => c.close > targetHigh.price)) {
        return { type: 'BULLISH_CHOCH', side: 'BUY', level: targetHigh.price };
      }
    }
    
    for (let i = Math.max(0, lows.length - 4); i < lows.length; i++) {
      const targetLow = lows[i];
      const highsBefore = highs.filter(h => h.index < targetLow.index).slice(-3);
      const hadHigherHighs = highsBefore.length >= 2 &&
        highsBefore.some((h, idx) => idx > 0 && h.price > highsBefore[idx-1].price);
      
      if (hadHigherHighs && last15Candles.some(c => c.close < targetLow.price)) {
        return { type: 'BEARISH_CHOCH', side: 'SELL', level: targetLow.price };
      }
    }
    
    return null;
  },

  detectPullback(candles, demandZones, supplyZones, structure, config) {
    if (candles.length < 10) return null;
    
    const currentPrice = candles[candles.length - 1].close;
    const last10Candles = candles.slice(-10);
    
    for (const zone of demandZones) {
      if (!zone.valid) continue;
      
      let touchedZone = false;
      let reactionCandle = null;
      
      for (let i = 0; i < last10Candles.length; i++) {
        const candle = last10Candles[i];
        const candleTouchedZone = candle.low <= zone.high * 1.002 && candle.low >= zone.low * 0.995;
        const candleNearZone = candle.close >= zone.low * 0.998 && candle.close <= zone.high * 1.005;
        
        if (candleTouchedZone || candleNearZone) {
          touchedZone = true;
          for (let j = i; j < last10Candles.length; j++) {
            const nextCandle = last10Candles[j];
            if (nextCandle.close > nextCandle.open && nextCandle.close > zone.mid) {
              reactionCandle = nextCandle;
              break;
            }
          }
          break;
        }
      }
      
      const priceNearZone = currentPrice >= zone.low * 0.995 && currentPrice <= zone.high * 1.02;
      const priceAboveZone = currentPrice > zone.high;
      const lastCandleBullish = candles[candles.length - 1].close > candles[candles.length - 1].open;
      
      if ((touchedZone && reactionCandle) || (priceNearZone && lastCandleBullish) || (touchedZone && priceAboveZone)) {
        const entry = Math.max(currentPrice, zone.high);
        const stop = zone.low - config.slBuffer;
        const risk = entry - stop;
        
        return {
          type: 'PULLBACK_DEMAND', side: 'BUY', zone,
          entry, stop,
          tp1: entry + (risk * 1),
          tp2: entry + (risk * 2),
          tp3: entry + (risk * 3),
          risk, strength: zone.strength,
          touchedRecently: touchedZone, hasReaction: !!reactionCandle
        };
      }
    }
    
    for (const zone of supplyZones) {
      if (!zone.valid) continue;
      
      let touchedZone = false;
      let reactionCandle = null;
      
      for (let i = 0; i < last10Candles.length; i++) {
        const candle = last10Candles[i];
        const candleTouchedZone = candle.high >= zone.low * 0.998 && candle.high <= zone.high * 1.005;
        const candleNearZone = candle.close <= zone.high * 1.002 && candle.close >= zone.low * 0.995;
        
        if (candleTouchedZone || candleNearZone) {
          touchedZone = true;
          for (let j = i; j < last10Candles.length; j++) {
            const nextCandle = last10Candles[j];
            if (nextCandle.close < nextCandle.open && nextCandle.close < zone.mid) {
              reactionCandle = nextCandle;
              break;
            }
          }
          break;
        }
      }
      
      const priceNearZone = currentPrice <= zone.high * 1.005 && currentPrice >= zone.low * 0.98;
      const priceBelowZone = currentPrice < zone.low;
      const lastCandleBearish = candles[candles.length - 1].close < candles[candles.length - 1].open;
      
      if ((touchedZone && reactionCandle) || (priceNearZone && lastCandleBearish) || (touchedZone && priceBelowZone)) {
        const entry = Math.min(currentPrice, zone.low);
        const stop = zone.high + config.slBuffer;
        const risk = stop - entry;
        
        return {
          type: 'PULLBACK_SUPPLY', side: 'SELL', zone,
          entry, stop,
          tp1: entry - (risk * 1),
          tp2: entry - (risk * 2),
          tp3: entry - (risk * 3),
          risk, strength: zone.strength,
          touchedRecently: touchedZone, hasReaction: !!reactionCandle
        };
      }
    }
    
    return null;
  },

  detectSweep(candles, eqh, eql, config) {
    const last3 = candles.slice(-3);
    const currentPrice = candles[candles.length - 1].close;
    
    for (const candle of last3) {
      if (candle.high > eqh * 1.001 && candle.close < eqh) {
        const entry = currentPrice;
        const stop = eqh + config.slBuffer;
        const risk = stop - entry;
        return { 
          type: 'EQH_SWEEP', side: 'SELL', level: eqh,
          entry, stop,
          tp1: entry - (risk * 1),
          tp2: entry - (risk * 2),
          tp3: entry - (risk * 3),
          risk
        };
      }
      
      if (candle.low < eql * 0.999 && candle.close > eql) {
        const entry = currentPrice;
        const stop = eql - config.slBuffer;
        const risk = entry - stop;
        return { 
          type: 'EQL_SWEEP', side: 'BUY', level: eql,
          entry, stop,
          tp1: entry + (risk * 1),
          tp2: entry + (risk * 2),
          tp3: entry + (risk * 3),
          risk
        };
      }
    }
    
    return null;
  },

  findLiquidity(candles) {
    const recent = candles.slice(-25);
    return {
      eqh: Math.max(...recent.map(c => c.high)),
      eql: Math.min(...recent.map(c => c.low))
    };
  },

  analyze(candles, config, assetState) {
    if (candles.length < 35) {
      return { action: 'LOADING', score: 0, model: 'NO_SETUP' };
    }
    
    const currentPrice = candles[candles.length - 1].close;
    
    const swings = this.findSwings(candles);
    const structure = this.analyzeStructure(swings);
    const { eqh, eql } = this.findLiquidity(candles);
    const { demandZones, supplyZones } = this.findAllZones(candles);
    
    assetState.demandZones = demandZones;
    assetState.supplyZones = supplyZones;
    assetState.swings = swings.slice(-10);
    
    // DETECTAR CAMBIO DE ESTRUCTURA
    const previousStructure = assetState.lastStructure;
    assetState.lastStructure = structure.trend;
    
    // Si hay señal activa y la estructura cambió, generar alerta
    if (assetState.activeSignalId) {
      const activeSignal = signalHistory.find(s => s.id === assetState.activeSignalId);
      if (activeSignal && activeSignal.status === 'PENDING') {
        const signalSide = activeSignal.action;
        const structureConflict = (signalSide === 'LONG' && structure.trend === 'BEARISH') ||
                                   (signalSide === 'SHORT' && structure.trend === 'BULLISH');
        
        if (structureConflict && previousStructure !== structure.trend) {
          assetState.structureAlert = {
            type: 'STRUCTURE_CHANGE',
            message: `⚠️ ALERTA: Estructura cambió a ${structure.trend}. Considera cerrar ${signalSide}.`,
            signalId: activeSignal.id,
            timestamp: new Date().toISOString()
          };
        }
      }
    }
    
    const choch = this.detectCHoCH(candles, swings);
    const pullback = this.detectPullback(candles, demandZones, supplyZones, structure, config);
    const sweep = this.detectSweep(candles, eqh, eql, config);
    
    let score = 0;
    let breakdown = [];
    let action = 'WAIT';
    let entry = null, stop = null, tp1 = null, tp2 = null, tp3 = null;
    let model = 'NO_SETUP';
    let direction = null;
    
    if (choch) {
      score += 35;
      breakdown.push(`${choch.type}`);
    }
    
    if (structure.trend === 'BULLISH' && pullback?.side === 'BUY') {
      score += 15;
      breakdown.push('Estructura BULLISH');
    } else if (structure.trend === 'BEARISH' && pullback?.side === 'SELL') {
      score += 15;
      breakdown.push('Estructura BEARISH');
    }
    
    if (pullback) {
      score += 30;
      direction = pullback.side;
      entry = pullback.entry;
      stop = pullback.stop;
      tp1 = pullback.tp1;
      tp2 = pullback.tp2;
      tp3 = pullback.tp3;
      
      if (pullback.strength === 'STRONG') { score += 10; breakdown.push('Zona STRONG'); }
      if (pullback.hasReaction) { score += 10; breakdown.push('Reacción confirmada'); }
      
      model = choch ? 'CHOCH_PULLBACK' : 'STRUCTURE_PULLBACK';
    } else if (sweep) {
      score += 45;
      breakdown.push(`Sweep ${sweep.type}`);
      direction = sweep.side;
      model = 'REVERSAL';
      entry = sweep.entry;
      stop = sweep.stop;
      tp1 = sweep.tp1;
      tp2 = sweep.tp2;
      tp3 = sweep.tp3;
    }
    
    // Validación de niveles
    if (direction && entry && stop && tp1) {
      if (direction === 'BUY') {
        if (tp1 <= entry || stop >= entry) {
          const risk = Math.abs(entry - stop);
          if (stop >= entry) stop = entry - risk;
          tp1 = entry + risk;
          tp2 = entry + risk * 2;
          tp3 = entry + risk * 3;
        }
      } else {
        if (tp1 >= entry || stop <= entry) {
          const risk = Math.abs(stop - entry);
          if (stop <= entry) stop = entry + risk;
          tp1 = entry - risk;
          tp2 = entry - risk * 2;
          tp3 = entry - risk * 3;
        }
      }
    }
    
    if (score >= 60 && direction && entry && stop && tp1) {
      action = direction === 'BUY' ? 'LONG' : 'SHORT';
    }
    
    return {
      action, model, score, breakdown,
      entry: entry ? parseFloat(entry.toFixed(config.decimals)) : null,
      stop: stop ? parseFloat(stop.toFixed(config.decimals)) : null,
      tp1: tp1 ? parseFloat(tp1.toFixed(config.decimals)) : null,
      tp2: tp2 ? parseFloat(tp2.toFixed(config.decimals)) : null,
      tp3: tp3 ? parseFloat(tp3.toFixed(config.decimals)) : null,
      analysis: {
        eqh: eqh.toFixed(config.decimals),
        eql: eql.toFixed(config.decimals),
        structure: structure.trend,
        choch: choch?.type || null,
        demandZones: demandZones.length,
        supplyZones: supplyZones.length
      }
    };
  }
};

// =============================================
// IA MEJORADA - Más expresiva
// =============================================
const AI = {
  getFullContext(symbol) {
    const data = assetData[symbol];
    const config = ASSETS[symbol];
    if (!data || !config) return null;
    
    const candles = data.candles;
    const signal = data.signal;
    const price = data.price;
    
    if (candles.length < 20) return { asset: config.name, price, trend: 'sin datos' };
    
    const recent = candles.slice(-20);
    const changePercent = ((recent[recent.length - 1].close - recent[0].close) / recent[0].close * 100);
    
    // Calcular momentum
    const last5 = candles.slice(-5);
    const bullishCandles = last5.filter(c => c.close > c.open).length;
    const momentum = bullishCandles >= 4 ? 'FUERTE_ALCISTA' : 
                     bullishCandles >= 3 ? 'ALCISTA' :
                     bullishCandles <= 1 ? 'FUERTE_BAJISTA' :
                     bullishCandles <= 2 ? 'BAJISTA' : 'NEUTRAL';
    
    // Volatilidad
    const ranges = candles.slice(-10).map(c => c.high - c.low);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    const currentRange = candles[candles.length - 1].high - candles[candles.length - 1].low;
    const volatility = currentRange > avgRange * 1.5 ? 'ALTA' : 
                       currentRange < avgRange * 0.5 ? 'BAJA' : 'NORMAL';
    
    return {
      asset: config.name, symbol, price, decimals: config.decimals,
      trend: changePercent > 0.3 ? 'alcista' : changePercent < -0.3 ? 'bajista' : 'lateral',
      changePercent: changePercent.toFixed(2), signal,
      demandZones: data.demandZones?.length || 0,
      supplyZones: data.supplyZones?.length || 0,
      structure: signal?.analysis?.structure,
      choch: signal?.analysis?.choch,
      hasSignal: signal?.action && !['WAIT', 'LOADING'].includes(signal.action),
      momentum, volatility,
      structureAlert: data.structureAlert
    };
  },

  generateNarration(symbol) {
    const ctx = this.getFullContext(symbol);
    if (!ctx) return null;
    
    const lines = [];
    const emoji = ctx.changePercent > 0 ? '📈' : ctx.changePercent < 0 ? '📉' : '➡️';
    
    // Encabezado más dinámico
    const priceAction = ctx.changePercent > 1 ? '¡Subiendo fuerte!' :
                        ctx.changePercent > 0.3 ? 'Movimiento alcista' :
                        ctx.changePercent < -1 ? '¡Cayendo fuerte!' :
                        ctx.changePercent < -0.3 ? 'Movimiento bajista' : 'Consolidando';
    
    lines.push(`${emoji} **${ctx.asset}** @ **${ctx.price?.toFixed(ctx.decimals)}**`);
    lines.push(`💫 ${priceAction} (${ctx.changePercent > 0 ? '+' : ''}${ctx.changePercent}%)`);
    
    // Momentum y volatilidad
    const momentumEmoji = ctx.momentum.includes('ALCISTA') ? '🟢' : 
                          ctx.momentum.includes('BAJISTA') ? '🔴' : '⚪';
    lines.push(`\n${momentumEmoji} **Momentum:** ${ctx.momentum.replace('_', ' ')}`);
    lines.push(`📊 **Volatilidad:** ${ctx.volatility}`);
    
    // Estructura
    if (ctx.structure) {
      const structEmoji = ctx.structure === 'BULLISH' ? '🐂' : ctx.structure === 'BEARISH' ? '🐻' : '➖';
      lines.push(`${structEmoji} **Estructura:** ${ctx.structure}`);
    }
    
    // CHoCH
    if (ctx.choch) {
      lines.push(`\n⚡ **¡${ctx.choch} DETECTADO!**`);
      lines.push(`   Cambio de carácter confirmado`);
    }
    
    // Zonas
    if (ctx.demandZones > 0 || ctx.supplyZones > 0) {
      lines.push(`\n📦 **Zonas activas:**`);
      if (ctx.demandZones > 0) lines.push(`   🟢 ${ctx.demandZones} zona(s) de demanda`);
      if (ctx.supplyZones > 0) lines.push(`   🔴 ${ctx.supplyZones} zona(s) de oferta`);
    }
    
    // ALERTA DE ESTRUCTURA
    if (ctx.structureAlert) {
      lines.push(`\n🚨 **${ctx.structureAlert.message}**`);
    }
    
    // Señal
    if (ctx.hasSignal) {
      const sig = ctx.signal;
      const sigEmoji = sig.action === 'LONG' ? '🚀' : '🔻';
      
      lines.push(`\n${'═'.repeat(30)}`);
      lines.push(`${sigEmoji} **¡SEÑAL ${sig.action} ACTIVA!**`);
      lines.push(`📊 Modelo: ${sig.model}`);
      lines.push(`💯 Confianza: ${sig.score}%`);
      lines.push(`\n📍 **Entry:** ${sig.entry}`);
      lines.push(`🛑 **Stop Loss:** ${sig.stop}`);
      lines.push(`\n🎯 **Targets:**`);
      lines.push(`   TP1 (1:1): ${sig.tp1}`);
      lines.push(`   TP2 (1:2): ${sig.tp2}`);
      lines.push(`   TP3 (1:3): ${sig.tp3}`);
      lines.push(`${'═'.repeat(30)}`);
      
      // Recomendación
      if (sig.score >= 85) {
        lines.push(`\n💎 **Setup de alta probabilidad.** Gestiona tu riesgo.`);
      } else if (sig.score >= 70) {
        lines.push(`\n✅ **Buen setup.** Espera confirmación si prefieres.`);
      } else {
        lines.push(`\n⚠️ **Setup moderado.** Considera tamaño de posición menor.`);
      }
    } else {
      lines.push(`\n⏳ **Score actual:** ${ctx.signal?.score || 0}%`);
      
      // Sugerencia según contexto
      if (ctx.score >= 50) {
        lines.push(`🔍 Cerca de generar señal. Observando...`);
      } else if (ctx.structure === 'NEUTRAL') {
        lines.push(`💤 Mercado sin dirección clara. Paciencia.`);
      } else {
        lines.push(`👀 Buscando setup en estructura ${ctx.structure}`);
      }
    }
    
    return { text: lines.join('\n'), timestamp: new Date().toISOString() };
  },

  chat(question, symbol) {
    const ctx = this.getFullContext(symbol);
    if (!ctx) return { answer: "🔄 Cargando datos del mercado..." };
    
    const q = question.toLowerCase().trim();
    let answer = '';
    
    if (q.includes('señal') || q.includes('entrada') || q.includes('signal')) {
      if (ctx.hasSignal) {
        const sig = ctx.signal;
        const emoji = sig.action === 'LONG' ? '🚀' : '🔻';
        
        answer = `${emoji} **¡HAY SEÑAL ${sig.action}!**\n\n`;
        answer += `📊 **Modelo:** ${sig.model}\n`;
        answer += `💯 **Score:** ${sig.score}% ${sig.score >= 85 ? '(Excelente)' : sig.score >= 70 ? '(Bueno)' : '(Moderado)'}\n\n`;
        answer += `📍 **Entry:** ${sig.entry}\n`;
        answer += `🛑 **Stop Loss:** ${sig.stop}\n\n`;
        answer += `🎯 **Targets:**\n`;
        answer += `• TP1 (1:1): ${sig.tp1}\n`;
        answer += `• TP2 (1:2): ${sig.tp2}\n`;
        answer += `• TP3 (1:3): ${sig.tp3}\n\n`;
        
        if (sig.action === 'LONG') {
          answer += `💡 **Tip:** En LONG, considera asegurar en TP1 y dejar correr a TP2/TP3.`;
        } else {
          answer += `💡 **Tip:** En SHORT, el mercado suele moverse más rápido. Protege ganancias.`;
        }
      } else {
        answer = `⏳ **Sin señal activa en ${ctx.asset}**\n\n`;
        answer += `📊 Score actual: ${ctx.signal?.score || 0}%\n`;
        answer += `📈 Estructura: ${ctx.structure || 'Analizando'}\n`;
        answer += `⚡ CHoCH: ${ctx.choch || 'No detectado'}\n`;
        answer += `📦 Zonas: ${ctx.demandZones}D / ${ctx.supplyZones}S\n\n`;
        
        if (ctx.signal?.score >= 50) {
          answer += `🔍 **Cerca de señal.** Mantente atento.`;
        } else {
          answer += `💤 **Esperando setup.** El mercado definirá dirección.`;
        }
      }
    }
    
    else if (q.includes('zona') || q.includes('zonas')) {
      const data = assetData[symbol];
      answer = `📦 **Zonas de ${ctx.asset}**\n\n`;
      
      if (data.demandZones?.length > 0) {
        answer += `🟢 **DEMANDA (Compra):**\n`;
        data.demandZones.forEach((z, i) => {
          answer += `${i+1}. ${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)} ${z.strength === 'STRONG' ? '💪' : ''}\n`;
        });
        answer += `\n`;
      } else {
        answer += `🟢 Sin zonas de demanda activas\n\n`;
      }
      
      if (data.supplyZones?.length > 0) {
        answer += `🔴 **OFERTA (Venta):**\n`;
        data.supplyZones.forEach((z, i) => {
          answer += `${i+1}. ${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)} ${z.strength === 'STRONG' ? '💪' : ''}\n`;
        });
      } else {
        answer += `🔴 Sin zonas de oferta activas`;
      }
      
      answer += `\n\n💡 Las zonas 💪 son más fuertes y tienen mayor probabilidad de reacción.`;
    }
    
    else if (q.includes('setup') || q.includes('analisis') || q.includes('análisis')) {
      answer = `📊 **Análisis Completo - ${ctx.asset}**\n\n`;
      answer += `💰 **Precio:** ${ctx.price?.toFixed(ctx.decimals)}\n`;
      answer += `📈 **Cambio:** ${ctx.changePercent > 0 ? '+' : ''}${ctx.changePercent}%\n\n`;
      
      answer += `🏗️ **Estructura:** ${ctx.structure || 'Neutral'}\n`;
      answer += `⚡ **CHoCH:** ${ctx.choch || 'No detectado'}\n`;
      answer += `💪 **Momentum:** ${ctx.momentum}\n`;
      answer += `📊 **Volatilidad:** ${ctx.volatility}\n\n`;
      
      answer += `📦 **Zonas:** ${ctx.demandZones} demanda / ${ctx.supplyZones} oferta\n`;
      answer += `📈 **Score:** ${ctx.signal?.score || 0}%\n\n`;
      
      if (ctx.structure === 'BULLISH') {
        answer += `🐂 **Sesgo:** Alcista. Buscar compras en zonas de demanda.`;
      } else if (ctx.structure === 'BEARISH') {
        answer += `🐻 **Sesgo:** Bajista. Buscar ventas en zonas de oferta.`;
      } else {
        answer += `⚖️ **Sesgo:** Neutral. Esperar definición de estructura.`;
      }
    }
    
    else {
      answer = `📊 **${ctx.asset}** - Resumen Rápido\n\n`;
      answer += `💰 Precio: ${ctx.price?.toFixed(ctx.decimals)}\n`;
      answer += `📈 Estructura: ${ctx.structure || 'Analizando'}\n`;
      answer += `⚡ CHoCH: ${ctx.choch || 'No'}\n`;
      answer += `📦 Zonas: ${ctx.demandZones}D / ${ctx.supplyZones}S\n`;
      answer += `💯 Score: ${ctx.signal?.score || 0}%\n\n`;
      answer += `💬 Pregunta por: señal, zonas, o setup`;
    }
    
    return { answer, timestamp: new Date().toISOString() };
  }
};

// =============================================
// AUTO-TRACKING
// =============================================
function checkSignalHits() {
  const pending = signalHistory.filter(s => s.status === 'PENDING');
  
  for (const signal of pending) {
    const data = assetData[signal.symbol];
    if (!data?.price) continue;
    
    const price = data.price;
    const isLong = signal.action === 'LONG';
    
    // Check SL
    if ((isLong && price <= signal.stop) || (!isLong && price >= signal.stop)) {
      markSignal(signal.id, 'LOSS', 'AUTO-SL');
      // Liberar señal activa
      data.activeSignalId = null;
      data.structureAlert = null;
      continue;
    }
    
    // Check TPs
    if (isLong) {
      if (price >= signal.tp1 && !signal.tp1Hit) { signal.tp1Hit = true; stats.tp1Hits++; }
      if (price >= signal.tp2 && !signal.tp2Hit) { signal.tp2Hit = true; stats.tp2Hits++; }
      if (price >= signal.tp3 && !signal.tp3Hit) { 
        signal.tp3Hit = true; 
        stats.tp3Hits++; 
        markSignal(signal.id, 'WIN', 'AUTO-TP3');
        data.activeSignalId = null;
        data.structureAlert = null;
      }
    } else {
      if (price <= signal.tp1 && !signal.tp1Hit) { signal.tp1Hit = true; stats.tp1Hits++; }
      if (price <= signal.tp2 && !signal.tp2Hit) { signal.tp2Hit = true; stats.tp2Hits++; }
      if (price <= signal.tp3 && !signal.tp3Hit) { 
        signal.tp3Hit = true; 
        stats.tp3Hits++; 
        markSignal(signal.id, 'WIN', 'AUTO-TP3');
        data.activeSignalId = null;
        data.structureAlert = null;
      }
    }
  }
}

function markSignal(id, status, source = 'MANUAL') {
  const signal = signalHistory.find(s => s.id === id);
  if (!signal || signal.status !== 'PENDING') return null;
  
  signal.status = status;
  signal.closedAt = new Date().toISOString();
  signal.closedBy = source;
  
  // Liberar señal activa del asset
  const data = assetData[signal.symbol];
  if (data) {
    data.activeSignalId = null;
    data.structureAlert = null;
  }
  
  stats.byModel[signal.model] = stats.byModel[signal.model] || { wins: 0, losses: 0 };
  
  if (status === 'WIN') {
    stats.wins++;
    stats.byModel[signal.model].wins++;
    stats.byAsset[signal.symbol].wins++;
  } else if (status === 'LOSS') {
    stats.losses++;
    stats.byModel[signal.model].losses++;
    stats.byAsset[signal.symbol].losses++;
  } else {
    stats.notTaken++;
  }
  
  stats.pending = signalHistory.filter(s => s.status === 'PENDING').length;
  return signal;
}

// =============================================
// CONEXIÓN DERIV
// =============================================
function connectDeriv() {
  const appId = process.env.DERIV_APP_ID || '117347';
  
  try {
    derivWs = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
  } catch (err) {
    setTimeout(connectDeriv, 5000);
    return;
  }
  
  derivWs.on('open', () => {
    console.log('✅ Conectado a Deriv');
    isConnected = true;
    reconnectAttempts = 0;
    
    for (const symbol of Object.keys(ASSETS)) {
      derivWs.send(JSON.stringify({
        ticks_history: symbol, adjust_start_time: 1, count: 100, end: 'latest',
        granularity: 300, style: 'candles', subscribe: 1
      }));
      derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    }
  });
  
  derivWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      if (msg.candles && msg.echo_req?.ticks_history) {
        const symbol = msg.echo_req.ticks_history;
        if (assetData[symbol]) {
          assetData[symbol].candles = msg.candles.map(c => ({
            time: c.epoch * 1000,
            open: parseFloat(c.open), high: parseFloat(c.high),
            low: parseFloat(c.low), close: parseFloat(c.close)
          }));
          console.log(`📊 ${symbol}: ${msg.candles.length} velas`);
          analyzeAsset(symbol);
        }
      }
      
      if (msg.ohlc) {
        const symbol = msg.ohlc.symbol;
        if (assetData[symbol]) {
          const newCandle = {
            time: msg.ohlc.open_time * 1000,
            open: parseFloat(msg.ohlc.open), high: parseFloat(msg.ohlc.high),
            low: parseFloat(msg.ohlc.low), close: parseFloat(msg.ohlc.close)
          };
          
          const candles = assetData[symbol].candles;
          if (candles.length > 0) {
            const last = candles[candles.length - 1];
            if (last.time === newCandle.time) candles[candles.length - 1] = newCandle;
            else if (newCandle.time > last.time) {
              candles.push(newCandle);
              if (candles.length > 200) candles.shift();
              analyzeAsset(symbol);
            }
          } else {
            candles.push(newCandle);
          }
          assetData[symbol].price = newCandle.close;
          checkSignalHits();
        }
      }
      
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
    isConnected = false;
    reconnectAttempts++;
    setTimeout(connectDeriv, Math.min(5000 * reconnectAttempts, 30000));
  });
  
  derivWs.on('error', () => {});
}

function analyzeAsset(symbol) {
  const data = assetData[symbol];
  const config = ASSETS[symbol];
  if (!data || !config || data.candles.length < 35) return;
  
  const now = Date.now();
  if (now - data.lastAnalysis < 500) return;
  data.lastAnalysis = now;
  
  const signal = SMC.analyze(data.candles, config, data);
  data.signal = signal;
  
  // NUEVA LÓGICA: No crear señal si ya hay una activa
  if (signal.action !== 'WAIT' && signal.action !== 'LOADING' && signal.score >= 60) {
    
    // Verificar si hay señal activa en este asset
    if (data.activeSignalId) {
      const activeSignal = signalHistory.find(s => s.id === data.activeSignalId);
      if (activeSignal && activeSignal.status === 'PENDING') {
        // Ya hay señal activa, no crear nueva
        return;
      } else {
        // La señal ya no está pendiente, limpiar
        data.activeSignalId = null;
      }
    }
    
    // Verificar que no haya señal pendiente reciente
    const hasPending = signalHistory.some(s => 
      s.symbol === symbol && 
      s.status === 'PENDING'
    );
    
    if (!hasPending) {
      const newSignal = {
        id: signalIdCounter++, symbol, assetName: config.name, emoji: config.emoji,
        action: signal.action, model: signal.model, score: signal.score,
        entry: signal.entry, stop: signal.stop, tp1: signal.tp1, tp2: signal.tp2, tp3: signal.tp3,
        tp1Hit: false, tp2Hit: false, tp3Hit: false,
        price: data.price, status: 'PENDING', timestamp: new Date().toISOString(),
        breakdown: signal.breakdown
      };
      
      signalHistory.unshift(newSignal);
      
      // NUEVO: Marcar señal activa
      data.activeSignalId = newSignal.id;
      
      stats.total++;
      stats.pending++;
      if (signalHistory.length > 100) signalHistory.pop();
      
      console.log(`\n💎 SEÑAL #${newSignal.id}: ${signal.action} ${config.name}`);
      console.log(`   Model: ${signal.model} | Score: ${signal.score}%`);
      console.log(`   Entry: ${signal.entry} | SL: ${signal.stop}`);
      console.log(`   TP1: ${signal.tp1} | TP2: ${signal.tp2} | TP3: ${signal.tp3}\n`);
    }
  }
}

// =============================================
// API ENDPOINTS
// =============================================
app.get('/', (req, res) => res.json({ 
  name: 'Trading Master Pro', 
  version: '11.3', 
  features: ['No señales duplicadas', 'Alertas estructura', 'IA expresiva'],
  connected: isConnected 
}));

app.get('/api/dashboard', (req, res) => {
  res.json({
    connected: isConnected,
    timestamp: new Date().toISOString(),
    assets: Object.entries(assetData).map(([symbol, data]) => ({
      symbol, ...ASSETS[symbol], price: data.price, signal: data.signal,
      demandZones: data.demandZones?.length || 0,
      supplyZones: data.supplyZones?.length || 0,
      candlesCount: data.candles?.length || 0,
      hasActiveSignal: !!data.activeSignalId,
      structureAlert: data.structureAlert
    })),
    recentSignals: signalHistory.slice(0, 20),
    stats
  });
});

app.get('/api/analyze/:symbol', (req, res) => {
  const { symbol } = req.params;
  const data = assetData[symbol];
  const config = ASSETS[symbol];
  if (!data || !config) return res.status(404).json({ error: 'Not found' });
  res.json({ 
    symbol, ...config, price: data.price, signal: data.signal, 
    candles: data.candles.slice(-60),
    demandZones: data.demandZones,
    supplyZones: data.supplyZones,
    structureAlert: data.structureAlert
  });
});

app.get('/api/signals', (req, res) => res.json({ signals: signalHistory, stats }));

app.put('/api/signals/:id', (req, res) => {
  const signal = markSignal(parseInt(req.params.id), req.body.status, 'MANUAL');
  if (!signal) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, signal, stats });
});

app.get('/api/ai/narrate/:symbol', (req, res) => {
  const narration = AI.generateNarration(req.params.symbol);
  if (!narration) return res.status(404).json({ error: 'Not found' });
  res.json(narration);
});

app.post('/api/ai/chat', (req, res) => {
  const { question, symbol } = req.body;
  if (!question || !symbol) return res.status(400).json({ error: 'Missing params' });
  res.json(AI.chat(question, symbol));
});

// =============================================
// INICIO
// =============================================
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              TRADING MASTER PRO v11.5                        ║
╠══════════════════════════════════════════════════════════════╣
║  ✅ No repite señales hasta TP/SL                            ║
║  ✅ Alerta si estructura cambia contra posición              ║
║  ✅ Eliminado Volatility 100                                 ║
║  ✅ IA más expresiva y detallada                             ║
╠══════════════════════════════════════════════════════════════╣
║  Activos: Step, V75, XAU, GBP, BTC                          ║
╚══════════════════════════════════════════════════════════════╝
  `);
  connectDeriv();
  setInterval(() => { if (derivWs?.readyState === WebSocket.OPEN) derivWs.send(JSON.stringify({ ping: 1 })); }, 30000);
});

export default app;
