// =============================================
// TRADING MASTER PRO v10.6
// CHoCH + Pullback OB Combinado
// TP en High/Low anterior | SL 20 pips
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
// CONFIGURACIÓN
// =============================================
const ASSETS = {
  'stpRNG': { name: 'Step Index', emoji: '📊', type: 'synthetic', decimals: 2, pipValue: 0.01 },
  '1HZ75V': { name: 'Volatility 75', emoji: '📈', type: 'synthetic', decimals: 2, pipValue: 0.01 },
  '1HZ100V': { name: 'Volatility 100', emoji: '📉', type: 'synthetic', decimals: 2, pipValue: 0.01 },
  'frxXAUUSD': { name: 'Oro (XAU/USD)', emoji: '🥇', type: 'commodity', decimals: 2, pipValue: 0.01 },
  'frxGBPUSD': { name: 'GBP/USD', emoji: '💷', type: 'forex', decimals: 5, pipValue: 0.0001 },
  'cryBTCUSD': { name: 'Bitcoin (BTC/USD)', emoji: '₿', type: 'crypto', decimals: 2, pipValue: 1 }
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
    structurePoints: []  // Puntos de estructura (HH, HL, LH, LL)
  };
}

let signalHistory = [];
let signalIdCounter = 1;

const stats = {
  total: 0, wins: 0, losses: 0, notTaken: 0, pending: 0,
  tp1Hits: 0, tp2Hits: 0, tp3Hits: 0,
  byModel: { 
    REVERSAL: { wins: 0, losses: 0 }, 
    CONTINUATION: { wins: 0, losses: 0 }, 
    CHOCH: { wins: 0, losses: 0 },
    PULLBACK_OB: { wins: 0, losses: 0 },
    CHOCH_PULLBACK: { wins: 0, losses: 0 }  // Nuevo modelo combinado
  },
  byAsset: {}
};

for (const symbol of Object.keys(ASSETS)) {
  stats.byAsset[symbol] = { wins: 0, losses: 0 };
}

// =============================================
// MOTOR SMC - MODELO COMBINADO
// =============================================
const SMC = {
  // Encontrar swings con más detalle
  findSwings(candles, lookback = 3) {
    const swings = [];
    for (let i = lookback; i < candles.length - lookback; i++) {
      const c = candles[i];
      const left = candles.slice(i - lookback, i);
      const right = candles.slice(i + 1, i + lookback + 1);
      
      const isSwingHigh = left.every(x => x.high <= c.high) && right.every(x => x.high <= c.high);
      const isSwingLow = left.every(x => x.low >= c.low) && right.every(x => x.low >= c.low);
      
      if (isSwingHigh) {
        swings.push({ type: 'high', price: c.high, index: i, time: c.time, candle: c });
      }
      if (isSwingLow) {
        swings.push({ type: 'low', price: c.low, index: i, time: c.time, candle: c });
      }
    }
    return swings;
  },

  // Analizar estructura del mercado (HH, HL, LH, LL)
  analyzeStructure(swings) {
    const highs = swings.filter(s => s.type === 'high').slice(-5);
    const lows = swings.filter(s => s.type === 'low').slice(-5);
    
    const structure = {
      highs: [],
      lows: [],
      trend: 'NEUTRAL',
      lastHigherHigh: null,
      lastLowerLow: null,
      lastHigherLow: null,
      lastLowerHigh: null
    };
    
    // Analizar highs
    for (let i = 1; i < highs.length; i++) {
      if (highs[i].price > highs[i-1].price) {
        structure.highs.push({ ...highs[i], label: 'HH' }); // Higher High
        structure.lastHigherHigh = highs[i];
      } else {
        structure.highs.push({ ...highs[i], label: 'LH' }); // Lower High
        structure.lastLowerHigh = highs[i];
      }
    }
    
    // Analizar lows
    for (let i = 1; i < lows.length; i++) {
      if (lows[i].price > lows[i-1].price) {
        structure.lows.push({ ...lows[i], label: 'HL' }); // Higher Low
        structure.lastHigherLow = lows[i];
      } else {
        structure.lows.push({ ...lows[i], label: 'LL' }); // Lower Low
        structure.lastLowerLow = lows[i];
      }
    }
    
    // Determinar tendencia
    const recentHighs = structure.highs.slice(-2);
    const recentLows = structure.lows.slice(-2);
    
    const hasHH = recentHighs.some(h => h.label === 'HH');
    const hasHL = recentLows.some(l => l.label === 'HL');
    const hasLH = recentHighs.some(h => h.label === 'LH');
    const hasLL = recentLows.some(l => l.label === 'LL');
    
    if (hasHH && hasHL) structure.trend = 'BULLISH';
    else if (hasLH && hasLL) structure.trend = 'BEARISH';
    
    return structure;
  },

  // Detectar CHoCH con más precisión
  detectCHoCH(candles, swings, structure) {
    if (swings.length < 6) return null;
    
    const highs = swings.filter(s => s.type === 'high').slice(-4);
    const lows = swings.filter(s => s.type === 'low').slice(-4);
    
    if (highs.length < 2 || lows.length < 2) return null;
    
    const lastCandle = candles[candles.length - 1];
    const last5Candles = candles.slice(-5);
    
    // CHoCH ALCISTA: 
    // - Venía de tendencia bajista (Lower Lows)
    // - Rompe un high anterior con cierre
    for (let i = 0; i < highs.length - 1; i++) {
      const targetHigh = highs[i];
      // Verificar si había tendencia bajista antes
      const lowsBefore = lows.filter(l => l.index < targetHigh.index).slice(-2);
      const wasDowntrend = lowsBefore.length >= 2 && lowsBefore[1].price < lowsBefore[0].price;
      
      // Verificar si alguna de las últimas velas rompió ese high
      const breakCandle = last5Candles.find(c => c.close > targetHigh.price && c.open < targetHigh.price);
      
      if (wasDowntrend && breakCandle) {
        return {
          type: 'BULLISH_CHOCH',
          side: 'BUY',
          level: targetHigh.price,
          breakPrice: breakCandle.close,
          previousTrend: 'BEARISH',
          targetSwing: targetHigh
        };
      }
    }
    
    // CHoCH BAJISTA:
    // - Venía de tendencia alcista (Higher Highs)
    // - Rompe un low anterior con cierre
    for (let i = 0; i < lows.length - 1; i++) {
      const targetLow = lows[i];
      const highsBefore = highs.filter(h => h.index < targetLow.index).slice(-2);
      const wasUptrend = highsBefore.length >= 2 && highsBefore[1].price > highsBefore[0].price;
      
      const breakCandle = last5Candles.find(c => c.close < targetLow.price && c.open > targetLow.price);
      
      if (wasUptrend && breakCandle) {
        return {
          type: 'BEARISH_CHOCH',
          side: 'SELL',
          level: targetLow.price,
          breakPrice: breakCandle.close,
          previousTrend: 'BULLISH',
          targetSwing: targetLow
        };
      }
    }
    
    return null;
  },

  // Encontrar zonas de demanda/oferta después de CHoCH
  findZonesAfterCHoCH(candles, choch) {
    if (!choch) return { demandZones: [], supplyZones: [] };
    
    const demandZones = [];
    const supplyZones = [];
    
    // Buscar desde el punto de CHoCH
    const searchStart = Math.max(0, candles.length - 30);
    
    for (let i = searchStart; i < candles.length - 2; i++) {
      const prev = candles[i - 1];
      const curr = candles[i];
      const next = candles[i + 1];
      
      if (!prev || !next) continue;
      
      // DEMAND ZONE después de CHoCH alcista
      if (choch.side === 'BUY') {
        // Buscar vela bajista seguida de movimiento alcista fuerte
        const isBearish = curr.close < curr.open;
        const bullishNext = next.close > next.open;
        const strongMove = (next.close - next.open) > (curr.open - curr.close) * 0.5;
        
        if (isBearish && bullishNext && strongMove) {
          demandZones.push({
            type: 'DEMAND',
            high: Math.max(curr.open, curr.close),
            low: curr.low,
            mid: (curr.open + curr.low) / 2,
            index: i,
            time: curr.time,
            valid: true
          });
        }
      }
      
      // SUPPLY ZONE después de CHoCH bajista
      if (choch.side === 'SELL') {
        const isBullish = curr.close > curr.open;
        const bearishNext = next.close < next.open;
        const strongMove = (next.open - next.close) > (curr.close - curr.open) * 0.5;
        
        if (isBullish && bearishNext && strongMove) {
          supplyZones.push({
            type: 'SUPPLY',
            high: curr.high,
            low: Math.min(curr.open, curr.close),
            mid: (curr.high + curr.open) / 2,
            index: i,
            time: curr.time,
            valid: true
          });
        }
      }
    }
    
    return {
      demandZones: demandZones.slice(-3),
      supplyZones: supplyZones.slice(-3)
    };
  },

  // Detectar Higher High o Lower Low después de CHoCH
  findConfirmationSwing(candles, swings, choch) {
    if (!choch) return null;
    
    const highs = swings.filter(s => s.type === 'high');
    const lows = swings.filter(s => s.type === 'low');
    
    if (choch.side === 'BUY') {
      // Buscar el Higher High después del CHoCH
      const highsAfterChoch = highs.filter(h => h.price > choch.level);
      if (highsAfterChoch.length > 0) {
        // El high más reciente es nuestro target
        return {
          type: 'HIGHER_HIGH',
          price: highsAfterChoch[highsAfterChoch.length - 1].price,
          swing: highsAfterChoch[highsAfterChoch.length - 1]
        };
      }
    } else {
      // Buscar el Lower Low después del CHoCH
      const lowsAfterChoch = lows.filter(l => l.price < choch.level);
      if (lowsAfterChoch.length > 0) {
        return {
          type: 'LOWER_LOW',
          price: lowsAfterChoch[lowsAfterChoch.length - 1].price,
          swing: lowsAfterChoch[lowsAfterChoch.length - 1]
        };
      }
    }
    
    return null;
  },

  // Detectar Pullback a zona después de CHoCH y confirmación
  detectChochPullback(candles, demandZones, supplyZones, choch, confirmation, config) {
    if (!choch || !confirmation) return null;
    
    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    const currentPrice = lastCandle.close;
    
    // Calcular 20 pips en el valor del activo
    const pips20 = 20 * config.pipValue;
    
    // COMPRA: CHoCH alcista + Higher High + Pullback a demanda
    if (choch.side === 'BUY' && confirmation.type === 'HIGHER_HIGH') {
      for (const zone of demandZones) {
        if (!zone.valid) continue;
        
        // El precio debe estar cerca o dentro de la zona de demanda
        const inZone = lastCandle.low <= zone.high && lastCandle.low >= zone.low * 0.999;
        const nearZone = currentPrice <= zone.high * 1.002 && currentPrice >= zone.low * 0.998;
        
        // Debe mostrar reacción alcista
        const bullishReaction = lastCandle.close > lastCandle.open;
        const closeAboveZone = lastCandle.close > zone.mid;
        
        if ((inZone || nearZone) && bullishReaction && closeAboveZone) {
          return {
            type: 'CHOCH_PULLBACK_LONG',
            side: 'BUY',
            zone: zone,
            choch: choch,
            confirmation: confirmation,
            entry: zone.high,                        // Entry en el borde superior de la zona
            stop: zone.low - pips20,                 // SL 20 pips debajo de la zona
            tp1: confirmation.price,                 // TP1 = Higher High anterior
            tp2: confirmation.price + (confirmation.price - zone.high), // TP2 extendido
            tp3: confirmation.price + (confirmation.price - zone.high) * 1.5, // TP3 más extendido
            description: 'CHoCH + Pullback a Demanda → TP en Higher High'
          };
        }
      }
    }
    
    // VENTA: CHoCH bajista + Lower Low + Pullback a oferta
    if (choch.side === 'SELL' && confirmation.type === 'LOWER_LOW') {
      for (const zone of supplyZones) {
        if (!zone.valid) continue;
        
        const inZone = lastCandle.high >= zone.low && lastCandle.high <= zone.high * 1.001;
        const nearZone = currentPrice >= zone.low * 0.998 && currentPrice <= zone.high * 1.002;
        
        const bearishReaction = lastCandle.close < lastCandle.open;
        const closeBelowZone = lastCandle.close < zone.mid;
        
        if ((inZone || nearZone) && bearishReaction && closeBelowZone) {
          return {
            type: 'CHOCH_PULLBACK_SHORT',
            side: 'SELL',
            zone: zone,
            choch: choch,
            confirmation: confirmation,
            entry: zone.low,                         // Entry en el borde inferior de la zona
            stop: zone.high + pips20,                // SL 20 pips arriba de la zona
            tp1: confirmation.price,                 // TP1 = Lower Low anterior
            tp2: confirmation.price - (zone.low - confirmation.price), // TP2 extendido
            tp3: confirmation.price - (zone.low - confirmation.price) * 1.5, // TP3 más extendido
            description: 'CHoCH + Pullback a Oferta → TP en Lower Low'
          };
        }
      }
    }
    
    return null;
  },

  // Encontrar liquidez
  findLiquidity(candles) {
    const recent = candles.slice(-20);
    return {
      eqh: Math.max(...recent.map(c => c.high)),
      eql: Math.min(...recent.map(c => c.low))
    };
  },

  // Detectar sweep
  detectSweep(candle, eqh, eql) {
    if (candle.high > eqh && candle.close < eqh) {
      return { type: 'EQH_SWEEP', side: 'SELL', level: eqh };
    }
    if (candle.low < eql && candle.close > eql) {
      return { type: 'EQL_SWEEP', side: 'BUY', level: eql };
    }
    return null;
  },

  // Detectar displacement
  detectDisplacement(candles) {
    if (candles.length < 5) return null;
    
    const ranges = candles.slice(-20).map(c => c.high - c.low);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    
    for (let i = 1; i <= 5; i++) {
      const c = candles[candles.length - i];
      const body = Math.abs(c.close - c.open);
      
      if (body > avgRange * 1.5) {
        return {
          valid: true,
          direction: c.close > c.open ? 'BULLISH' : 'BEARISH',
          magnitude: (body / avgRange).toFixed(1)
        };
      }
    }
    return null;
  },

  // =============================================
  // ANÁLISIS PRINCIPAL
  // =============================================
  analyze(candles, config, assetState) {
    if (candles.length < 40) {
      return { action: 'LOADING', score: 0, model: 'NO_SETUP' };
    }
    
    const lastCandle = candles[candles.length - 1];
    const currentPrice = lastCandle.close;
    
    // Obtener swings y estructura
    const swings = this.findSwings(candles);
    const structure = this.analyzeStructure(swings);
    const { eqh, eql } = this.findLiquidity(candles);
    
    // Detectar CHoCH
    const choch = this.detectCHoCH(candles, swings, structure);
    
    // Encontrar zonas después del CHoCH
    const { demandZones, supplyZones } = this.findZonesAfterCHoCH(candles, choch);
    assetState.demandZones = demandZones;
    assetState.supplyZones = supplyZones;
    
    // Encontrar confirmación (HH o LL)
    const confirmation = this.findConfirmationSwing(candles, swings, choch);
    
    // Detectar el setup combinado CHoCH + Pullback
    const chochPullback = this.detectChochPullback(candles, demandZones, supplyZones, choch, confirmation, config);
    
    // Otros patrones
    const sweep = this.detectSweep(lastCandle, eqh, eql);
    const displacement = this.detectDisplacement(candles);
    
    let score = 0;
    let breakdown = [];
    let action = 'WAIT';
    let entry = null, stop = null, tp1 = null, tp2 = null, tp3 = null;
    let model = 'NO_SETUP';
    let direction = null;
    
    // =============================================
    // PRIORIDAD 1: CHoCH + PULLBACK (Setup combinado)
    // =============================================
    if (chochPullback) {
      score = 75;  // Score alto porque es el setup completo
      breakdown.push('CHoCH detectado');
      breakdown.push(chochPullback.confirmation.type === 'HIGHER_HIGH' ? 'Higher High confirmado' : 'Lower Low confirmado');
      breakdown.push('Pullback a zona');
      
      direction = chochPullback.side;
      model = 'CHOCH_PULLBACK';
      entry = chochPullback.entry;
      stop = chochPullback.stop;
      tp1 = chochPullback.tp1;
      tp2 = chochPullback.tp2;
      tp3 = chochPullback.tp3;
      
      // Bonus por displacement
      if (displacement?.valid) {
        const correctDirection = (chochPullback.side === 'BUY' && displacement.direction === 'BULLISH') ||
                                 (chochPullback.side === 'SELL' && displacement.direction === 'BEARISH');
        if (correctDirection) {
          score += 10;
          breakdown.push(`Displacement ${displacement.direction}`);
        }
      }
      
      action = direction === 'BUY' ? 'LONG' : 'SHORT';
    }
    
    // =============================================
    // PRIORIDAD 2: Solo CHoCH (sin pullback todavía)
    // =============================================
    else if (choch && !chochPullback) {
      score = 40;
      breakdown.push(`CHoCH ${choch.type}`);
      if (confirmation) {
        score += 15;
        breakdown.push(confirmation.type);
      }
      // No generar señal aún, esperar pullback
      model = 'CHOCH_WAITING';
    }
    
    // =============================================
    // PRIORIDAD 3: Otros patrones (fallback)
    // =============================================
    else {
      if (sweep) { score += 30; breakdown.push(`Sweep ${sweep.type}`); direction = sweep.side; model = 'REVERSAL'; }
      if (displacement?.valid) { score += 25; breakdown.push(`Displacement ${displacement.direction}`); }
      
      if (score >= 70 && direction) {
        action = direction === 'BUY' ? 'LONG' : 'SHORT';
        
        // Calcular niveles para patrones fallback
        if (direction === 'BUY') {
          entry = currentPrice;
          stop = eql * 0.999;
          const risk = entry - stop;
          tp1 = entry + risk;
          tp2 = entry + risk * 2;
          tp3 = entry + risk * 3;
        } else {
          entry = currentPrice;
          stop = eqh * 1.001;
          const risk = stop - entry;
          tp1 = entry - risk;
          tp2 = entry - risk * 2;
          tp3 = entry - risk * 3;
        }
      }
    }
    
    // Guardar puntos de estructura
    assetState.structurePoints = swings.slice(-10);
    
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
        confirmation: confirmation?.type || null,
        demandZones: demandZones.length,
        supplyZones: supplyZones.length,
        displacement: displacement?.valid ? `${displacement.direction} ${displacement.magnitude}x` : null
      }
    };
  }
};

// =============================================
// IA EXPRESIVA
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
    
    let trend = 'lateral';
    if (changePercent > 0.5) trend = 'alcista';
    else if (changePercent < -0.5) trend = 'bajista';
    
    return {
      asset: config.name, symbol, price, decimals: config.decimals,
      trend, changePercent: changePercent.toFixed(2), signal,
      demandZones: data.demandZones?.length || 0,
      supplyZones: data.supplyZones?.length || 0,
      structure: signal?.analysis?.structure,
      choch: signal?.analysis?.choch,
      confirmation: signal?.analysis?.confirmation,
      hasSignal: signal?.action && !['WAIT', 'LOADING'].includes(signal.action)
    };
  },

  generateNarration(symbol) {
    const ctx = this.getFullContext(symbol);
    if (!ctx) return null;
    
    const lines = [];
    
    // Precio
    const emoji = ctx.changePercent > 0 ? '📈' : ctx.changePercent < 0 ? '📉' : '➡️';
    lines.push(`${emoji} **${ctx.asset}** @ **${ctx.price?.toFixed(ctx.decimals)}** (${ctx.changePercent > 0 ? '+' : ''}${ctx.changePercent}%)`);
    
    // Estructura del mercado
    if (ctx.structure) {
      lines.push(`📊 Estructura: ${ctx.structure}`);
    }
    
    // CHoCH detectado
    if (ctx.choch) {
      lines.push(`⚡ **${ctx.choch}** detectado`);
    }
    
    // Confirmación
    if (ctx.confirmation) {
      lines.push(`✅ ${ctx.confirmation} confirmado`);
    }
    
    // Zonas
    if (ctx.demandZones > 0 || ctx.supplyZones > 0) {
      lines.push(`📦 Zonas activas: ${ctx.demandZones} demanda | ${ctx.supplyZones} oferta`);
    }
    
    // Señal
    if (ctx.hasSignal) {
      const sig = ctx.signal;
      const sigEmoji = sig.action === 'LONG' ? '🚀' : '🔻';
      lines.push(`\n${sigEmoji} **SEÑAL ${sig.action}** - ${sig.model}`);
      if (sig.model === 'CHOCH_PULLBACK') {
        lines.push(`💎 Setup completo: CHoCH + HH/LL + Pullback`);
      }
      lines.push(`🎯 Entry: ${sig.entry} | TP1: ${sig.tp1} | SL: ${sig.stop}`);
    } else if (ctx.choch && ctx.signal?.model === 'CHOCH_WAITING') {
      lines.push(`\n⏳ CHoCH detectado - Esperando pullback a zona`);
    }
    
    return { text: lines.join('\n'), timestamp: new Date().toISOString() };
  },

  chat(question, symbol) {
    const ctx = this.getFullContext(symbol);
    if (!ctx) return { answer: "Cargando datos..." };
    
    const q = question.toLowerCase().trim();
    let answer = '';
    
    // SETUP / MODELO
    if (q.includes('setup') || q.includes('modelo') || q.includes('cómo funciona')) {
      answer = `💎 **Setup CHoCH + Pullback**\n\n`;
      answer += `**Para COMPRA:**\n`;
      answer += `1️⃣ Tendencia bajista inicial\n`;
      answer += `2️⃣ CHoCH alcista (rompe un high)\n`;
      answer += `3️⃣ Se crea zona de demanda\n`;
      answer += `4️⃣ Hace Higher High (confirma)\n`;
      answer += `5️⃣ Pullback a la zona de demanda\n`;
      answer += `6️⃣ **SEÑAL LONG**\n`;
      answer += `   • Entry: Borde superior de la zona\n`;
      answer += `   • TP1: Higher High anterior\n`;
      answer += `   • SL: 20 pips bajo la zona\n\n`;
      answer += `**Para VENTA:** Lo inverso 🔄`;
    }
    
    // SEÑAL
    else if (q.includes('señal') || q.includes('entrada')) {
      if (ctx.hasSignal) {
        const sig = ctx.signal;
        answer = `🎯 **Señal ${sig.action}** en ${ctx.asset}\n\n`;
        answer += `**Modelo:** ${sig.model}\n`;
        answer += `**Score:** ${sig.score}%\n\n`;
        answer += `📍 **Niveles:**\n`;
        answer += `• Entry: ${sig.entry}\n`;
        answer += `• TP1: ${sig.tp1} ${sig.model === 'CHOCH_PULLBACK' ? '(High/Low anterior)' : ''}\n`;
        answer += `• TP2: ${sig.tp2}\n`;
        answer += `• TP3: ${sig.tp3}\n`;
        answer += `• Stop: ${sig.stop} ${sig.model === 'CHOCH_PULLBACK' ? '(20 pips de zona)' : ''}\n\n`;
        
        if (sig.breakdown?.length) {
          answer += `**Confirmaciones:**\n`;
          sig.breakdown.forEach(b => answer += `✅ ${b}\n`);
        }
      } else if (ctx.choch) {
        answer = `⏳ **CHoCH detectado** pero sin pullback aún\n\n`;
        answer += `Esperando que el precio retroceda a la zona de ${ctx.choch.includes('BULLISH') ? 'demanda' : 'oferta'}.\n\n`;
        answer += `Zonas activas: ${ctx.demandZones} demanda, ${ctx.supplyZones} oferta`;
      } else {
        answer = `⏳ Sin señal en ${ctx.asset}\n\nEsperando setup CHoCH + Pullback`;
      }
    }
    
    // ZONAS
    else if (q.includes('zona') || q.includes('demanda') || q.includes('oferta')) {
      const data = assetData[symbol];
      answer = `📦 **Zonas - ${ctx.asset}**\n\n`;
      
      if (data.demandZones?.length > 0) {
        answer += `**🟢 Demanda (Compra):**\n`;
        data.demandZones.forEach((z, i) => {
          answer += `  ${i+1}. ${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)}\n`;
        });
      } else {
        answer += `Sin zonas de demanda activas\n`;
      }
      
      answer += `\n`;
      
      if (data.supplyZones?.length > 0) {
        answer += `**🔴 Oferta (Venta):**\n`;
        data.supplyZones.forEach((z, i) => {
          answer += `  ${i+1}. ${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)}\n`;
        });
      } else {
        answer += `Sin zonas de oferta activas`;
      }
    }
    
    // ESTADÍSTICAS
    else if (q.includes('estadística') || q.includes('win')) {
      const total = stats.wins + stats.losses;
      const winRate = total > 0 ? ((stats.wins / total) * 100).toFixed(1) : 0;
      
      answer = `📊 **Estadísticas**\n\n`;
      answer += `✅ Wins: ${stats.wins} | ❌ Losses: ${stats.losses}\n`;
      answer += `📈 Win Rate: ${winRate}%\n\n`;
      answer += `**Por Modelo:**\n`;
      for (const [m, s] of Object.entries(stats.byModel)) {
        if (s.wins + s.losses > 0) {
          const wr = ((s.wins / (s.wins + s.losses)) * 100).toFixed(0);
          answer += `• ${m}: ${s.wins}W/${s.losses}L (${wr}%)\n`;
        }
      }
    }
    
    // QUÉ HACER
    else if (q.includes('qué hacer') || q.includes('recomien')) {
      if (ctx.hasSignal) {
        answer = `✅ **Hay señal ${ctx.signal.action}**\n\n`;
        answer += `Entry: ${ctx.signal.entry}\n`;
        answer += `TP1: ${ctx.signal.tp1}\n`;
        answer += `SL: ${ctx.signal.stop}\n\n`;
        answer += `💡 Considera la entrada si se alinea con tu gestión de riesgo.`;
      } else if (ctx.choch) {
        answer = `⏳ **CHoCH detectado - Espera el pullback**\n\n`;
        answer += `El mercado hizo cambio de estructura. Ahora espera que retroceda a la zona para entrar.`;
      } else {
        answer = `⏳ **Sin setup claro**\n\nEspera que se forme el patrón completo:\n`;
        answer += `1. CHoCH\n2. Zona de demanda/oferta\n3. Confirmación (HH/LL)\n4. Pullback`;
      }
    }
    
    // DEFAULT
    else {
      answer = `📊 **${ctx.asset}**\n\n`;
      answer += `💰 Precio: ${ctx.price?.toFixed(ctx.decimals)}\n`;
      answer += `📈 Tendencia: ${ctx.trend}\n`;
      answer += `📊 Estructura: ${ctx.structure || 'Analizando...'}\n`;
      if (ctx.choch) answer += `⚡ CHoCH: ${ctx.choch}\n`;
      answer += `\n💬 Pregunta: setup, señal, zonas, estadísticas...`;
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
      markSignal(signal.id, 'LOSS', 'AUTO');
      continue;
    }
    
    // Check TPs
    if (isLong) {
      if (price >= signal.tp3 && !signal.tp3Hit) { signal.tp3Hit = true; signal.tpLevel = 3; stats.tp3Hits++; markSignal(signal.id, 'WIN', 'AUTO-TP3'); }
      else if (price >= signal.tp2 && !signal.tp2Hit) { signal.tp2Hit = true; signal.tpLevel = 2; stats.tp2Hits++; }
      else if (price >= signal.tp1 && !signal.tp1Hit) { signal.tp1Hit = true; signal.tpLevel = 1; stats.tp1Hits++; }
    } else {
      if (price <= signal.tp3 && !signal.tp3Hit) { signal.tp3Hit = true; signal.tpLevel = 3; stats.tp3Hits++; markSignal(signal.id, 'WIN', 'AUTO-TP3'); }
      else if (price <= signal.tp2 && !signal.tp2Hit) { signal.tp2Hit = true; signal.tpLevel = 2; stats.tp2Hits++; }
      else if (price <= signal.tp1 && !signal.tp1Hit) { signal.tp1Hit = true; signal.tpLevel = 1; stats.tp1Hits++; }
    }
  }
}

function markSignal(id, status, source = 'MANUAL') {
  const signal = signalHistory.find(s => s.id === id);
  if (!signal || signal.status !== 'PENDING') return null;
  
  signal.status = status;
  signal.closedAt = new Date().toISOString();
  signal.closedBy = source;
  
  if (status === 'WIN') {
    stats.wins++;
    stats.byModel[signal.model] = stats.byModel[signal.model] || { wins: 0, losses: 0 };
    stats.byModel[signal.model].wins++;
  } else if (status === 'LOSS') {
    stats.losses++;
    stats.byModel[signal.model] = stats.byModel[signal.model] || { wins: 0, losses: 0 };
    stats.byModel[signal.model].losses++;
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
  if (!data || !config || data.candles.length < 40) return;
  
  const now = Date.now();
  if (now - data.lastAnalysis < 1000) return;
  data.lastAnalysis = now;
  
  const signal = SMC.analyze(data.candles, config, data);
  data.signal = signal;
  
  // Crear señal solo para CHOCH_PULLBACK o patrones con score >= 70
  const validSignal = (signal.model === 'CHOCH_PULLBACK' && signal.score >= 70) || 
                      (signal.model !== 'CHOCH_PULLBACK' && signal.model !== 'CHOCH_WAITING' && signal.score >= 70);
  
  if (signal.action !== 'WAIT' && signal.action !== 'LOADING' && validSignal) {
    const hasPending = signalHistory.some(s => 
      s.symbol === symbol && 
      s.status === 'PENDING' && 
      now - new Date(s.timestamp).getTime() < 600000
    );
    
    if (!hasPending) {
      const newSignal = {
        id: signalIdCounter++, symbol, assetName: config.name, emoji: config.emoji,
        action: signal.action, model: signal.model, score: signal.score,
        entry: signal.entry, stop: signal.stop, tp1: signal.tp1, tp2: signal.tp2, tp3: signal.tp3,
        tp1Hit: false, tp2Hit: false, tp3Hit: false, tpLevel: 0,
        price: data.price, status: 'PENDING', timestamp: new Date().toISOString(),
        breakdown: signal.breakdown
      };
      
      signalHistory.unshift(newSignal);
      stats.total++;
      stats.pending++;
      if (signalHistory.length > 100) signalHistory.pop();
      
      console.log(`\n💎 SEÑAL #${newSignal.id}: ${signal.action} ${config.name} (${signal.model})`);
      console.log(`   ${signal.breakdown.join(' | ')}`);
      console.log(`   Entry: ${signal.entry} | TP1: ${signal.tp1} | SL: ${signal.stop}\n`);
    }
  }
}

// =============================================
// API ENDPOINTS
// =============================================
app.get('/', (req, res) => res.json({ name: 'Trading Master Pro', version: '10.6', features: ['CHOCH_PULLBACK', 'Auto-track'], connected: isConnected }));

app.get('/api/dashboard', (req, res) => {
  res.json({
    connected: isConnected,
    timestamp: new Date().toISOString(),
    assets: Object.entries(assetData).map(([symbol, data]) => ({
      symbol, ...ASSETS[symbol], price: data.price, signal: data.signal,
      demandZones: data.demandZones?.length || 0,
      supplyZones: data.supplyZones?.length || 0
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
    supplyZones: data.supplyZones
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
╔══════════════════════════════════════════════════════════╗
║           TRADING MASTER PRO v10.6                       ║
║           CHoCH + Pullback Combined Model                ║
╠══════════════════════════════════════════════════════════╣
║  💎 Setup: CHoCH → Zona → HH/LL → Pullback → Entry      ║
║  🎯 TP1: High/Low anterior                               ║
║  🛑 SL: 20 pips de la zona                               ║
╚══════════════════════════════════════════════════════════╝
  `);
  connectDeriv();
  setInterval(() => { if (derivWs?.readyState === WebSocket.OPEN) derivWs.send(JSON.stringify({ ping: 1 })); }, 30000);
});

export default app;
