// =============================================
// TRADING MASTER PRO v12.4
// MARCUS - IA TRADER PROFESIONAL SMC
// Mentor humanizado que analiza, enseña y guía
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
  'stpRNG': { name: 'Step Index', shortName: 'Step', emoji: '📊', type: 'synthetic', decimals: 2, slBuffer: 2.0, minScore: 70 },
  '1HZ75V': { name: 'Volatility 75', shortName: 'V75', emoji: '📈', type: 'synthetic', decimals: 2, slBuffer: 5.0, minScore: 70 },
  'frxXAUUSD': { name: 'Oro (XAU/USD)', shortName: 'XAU', emoji: '🥇', type: 'commodity', decimals: 2, slBuffer: 1.0, minScore: 65 },
  'frxGBPUSD': { name: 'GBP/USD', shortName: 'GBP', emoji: '💷', type: 'forex', decimals: 5, slBuffer: 0.0003, minScore: 65 },
  'cryBTCUSD': { name: 'Bitcoin', shortName: 'BTC', emoji: '₿', type: 'crypto', decimals: 2, slBuffer: 50, minScore: 65 }
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
    candles: [], candlesH1: [], price: null, signal: null, lockedSignal: null,
    lastAnalysis: 0, demandZones: [], supplyZones: [], fvgZones: [],
    liquidityLevels: [], swings: [], structure: null, structureH1: null,
    structureAlert: null, orderFlow: null, mtfAnalysis: null, choch: null, bos: null
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
// MOTOR SMC COMPLETO
// =============================================
const SMC = {
  findSwings(candles, lookback = 3) {
    const swings = [];
    for (let i = lookback; i < candles.length - lookback; i++) {
      const c = candles[i];
      const left = candles.slice(i - lookback, i);
      const right = candles.slice(i + 1, i + lookback + 1);
      if (left.every(x => x.high <= c.high) && right.every(x => x.high < c.high)) {
        swings.push({ type: 'high', price: c.high, index: i, time: c.time });
      }
      if (left.every(x => x.low >= c.low) && right.every(x => x.low > c.low)) {
        swings.push({ type: 'low', price: c.low, index: i, time: c.time });
      }
    }
    return swings;
  },

  getAvgRange(candles, period = 20) {
    const recent = candles.slice(-period);
    return recent.length ? recent.reduce((sum, c) => sum + (c.high - c.low), 0) / recent.length : 0;
  },

  getAvgBody(candles, period = 20) {
    const recent = candles.slice(-period);
    return recent.length ? recent.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / recent.length : 0;
  },

  analyzeStructure(swings) {
    const highs = swings.filter(s => s.type === 'high').slice(-6);
    const lows = swings.filter(s => s.type === 'low').slice(-6);
    let trend = 'NEUTRAL', strength = 0;
    
    if (highs.length >= 2 && lows.length >= 2) {
      const hhCount = highs.filter((h, i) => i > 0 && h.price > highs[i-1].price).length;
      const hlCount = lows.filter((l, i) => i > 0 && l.price > lows[i-1].price).length;
      const lhCount = highs.filter((h, i) => i > 0 && h.price < highs[i-1].price).length;
      const llCount = lows.filter((l, i) => i > 0 && l.price < lows[i-1].price).length;
      
      if (hhCount + hlCount >= 2 && hhCount + hlCount > lhCount + llCount) {
        trend = 'BULLISH'; strength = (hhCount + hlCount) * 20;
      } else if (lhCount + llCount >= 2) {
        trend = 'BEARISH'; strength = (lhCount + llCount) * 20;
      }
    }
    return { trend, strength, highs, lows };
  },

  detectCHoCH(candles, swings) {
    if (swings.length < 5) return null;
    const highs = swings.filter(s => s.type === 'high');
    const lows = swings.filter(s => s.type === 'low');
    const last10 = candles.slice(-10);
    
    for (let i = Math.max(0, highs.length - 3); i < highs.length; i++) {
      const targetHigh = highs[i];
      const lowsBefore = lows.filter(l => l.index < targetHigh.index).slice(-3);
      const hadDowntrend = lowsBefore.length >= 2 && lowsBefore.some((l, idx) => idx > 0 && l.price < lowsBefore[idx-1].price);
      if (hadDowntrend && last10.some(c => c.close > targetHigh.price * 1.001)) {
        return { type: 'BULLISH_CHOCH', side: 'BUY', level: targetHigh.price, confidence: 85 };
      }
    }
    
    for (let i = Math.max(0, lows.length - 3); i < lows.length; i++) {
      const targetLow = lows[i];
      const highsBefore = highs.filter(h => h.index < targetLow.index).slice(-3);
      const hadUptrend = highsBefore.length >= 2 && highsBefore.some((h, idx) => idx > 0 && h.price > highsBefore[idx-1].price);
      if (hadUptrend && last10.some(c => c.close < targetLow.price * 0.999)) {
        return { type: 'BEARISH_CHOCH', side: 'SELL', level: targetLow.price, confidence: 85 };
      }
    }
    return null;
  },

  detectBOS(candles, swings, structure) {
    if (swings.length < 4) return null;
    const highs = swings.filter(s => s.type === 'high').slice(-4);
    const lows = swings.filter(s => s.type === 'low').slice(-4);
    const last5 = candles.slice(-5);
    
    if (structure.trend === 'BULLISH' && highs.length >= 2) {
      const lastHigh = highs[highs.length - 1];
      if (highs[highs.length - 2] && lastHigh.price > highs[highs.length - 2].price) {
        if (last5.some(c => c.close > lastHigh.price * 1.0005)) {
          return { type: 'BULLISH_BOS', side: 'BUY', level: lastHigh.price, confidence: 80 };
        }
      }
    }
    
    if (structure.trend === 'BEARISH' && lows.length >= 2) {
      const lastLow = lows[lows.length - 1];
      if (lows[lows.length - 2] && lastLow.price < lows[lows.length - 2].price) {
        if (last5.some(c => c.close < lastLow.price * 0.9995)) {
          return { type: 'BEARISH_BOS', side: 'SELL', level: lastLow.price, confidence: 80 };
        }
      }
    }
    return null;
  },

  findFVGs(candles) {
    const fvgs = [];
    if (candles.length < 5) return fvgs;
    
    for (let i = 2; i < candles.length - 1; i++) {
      const c1 = candles[i - 2], c2 = candles[i - 1], c3 = candles[i];
      const c2Body = Math.abs(c2.close - c2.open);
      const avgBody = this.getAvgBody(candles.slice(0, i), 10);
      
      if (c2.close > c2.open && c2Body > avgBody * 1.5 && c3.low > c1.high) {
        fvgs.push({ type: 'BULLISH_FVG', side: 'BUY', high: c3.low, low: c1.high, mid: (c3.low + c1.high) / 2, index: i, filled: false, strength: c2Body / avgBody });
      }
      if (c2.close < c2.open && c2Body > avgBody * 1.5 && c1.low > c3.high) {
        fvgs.push({ type: 'BEARISH_FVG', side: 'SELL', high: c1.low, low: c3.high, mid: (c1.low + c3.high) / 2, index: i, filled: false, strength: c2Body / avgBody });
      }
    }
    
    fvgs.forEach(fvg => {
      const after = candles.slice(fvg.index + 1);
      fvg.filled = fvg.side === 'BUY' ? after.some(c => c.low <= fvg.mid) : after.some(c => c.high >= fvg.mid);
    });
    
    return fvgs.filter(f => !f.filled).slice(-5);
  },

  findLiquidityLevels(candles, swings) {
    const levels = [];
    const avgRange = this.getAvgRange(candles);
    
    swings.filter(s => s.type === 'high').slice(-6).forEach(h => {
      const touches = swings.filter(s => s.type === 'high' && Math.abs(s.price - h.price) < avgRange * 0.3).length;
      if (touches >= 2) levels.push({ type: 'HIGH_LIQUIDITY', price: h.price, touches, index: h.index });
    });
    
    swings.filter(s => s.type === 'low').slice(-6).forEach(l => {
      const touches = swings.filter(s => s.type === 'low' && Math.abs(s.price - l.price) < avgRange * 0.3).length;
      if (touches >= 2) levels.push({ type: 'LOW_LIQUIDITY', price: l.price, touches, index: l.index });
    });
    
    return levels;
  },

  analyzeOrderFlow(candles) {
    if (candles.length < 20) return { momentum: 'NEUTRAL', strength: 0, description: '' };
    const last10 = candles.slice(-10);
    const bullCount = last10.filter(c => c.close > c.open).length;
    const bearCount = last10.filter(c => c.close < c.open).length;
    const bullVol = last10.filter(c => c.close > c.open).reduce((s, c) => s + (c.close - c.open), 0);
    const bearVol = last10.filter(c => c.close < c.open).reduce((s, c) => s + (c.open - c.close), 0);
    
    if (bullVol > bearVol * 1.5) return { momentum: 'BULLISH', strength: Math.min(100, (bullVol / (bearVol || 1)) * 20), bullCount, bearCount, description: 'Compradores dominando' };
    if (bearVol > bullVol * 1.5) return { momentum: 'BEARISH', strength: Math.min(100, (bearVol / (bullVol || 1)) * 20), bullCount, bearCount, description: 'Vendedores dominando' };
    return { momentum: 'NEUTRAL', strength: 50, bullCount, bearCount, description: 'Equilibrio entre compradores y vendedores' };
  },

  findZones(candles) {
    const demandZones = [], supplyZones = [];
    const avgRange = this.getAvgRange(candles);
    
    for (let i = 3; i < candles.length - 3; i++) {
      const curr = candles[i], next = candles[i + 1], next2 = candles[i + 2];
      if (Math.abs(curr.close - curr.open) < avgRange * 0.3) continue;
      
      if (curr.close < curr.open && ((next.close > curr.high && next.close > next.open) || next2.close > curr.high)) {
        if (!demandZones.some(z => Math.abs(z.mid - curr.low) < avgRange)) {
          demandZones.push({ type: 'DEMAND', high: curr.open, low: curr.low, mid: (curr.open + curr.low) / 2, index: i, strength: (next.close - curr.high > avgRange) ? 'STRONG' : 'NORMAL', valid: true });
        }
      }
      
      if (curr.close > curr.open && ((next.close < curr.low && next.close < next.open) || next2.close < curr.low)) {
        if (!supplyZones.some(z => Math.abs(z.mid - curr.high) < avgRange)) {
          supplyZones.push({ type: 'SUPPLY', high: curr.high, low: curr.open, mid: (curr.high + curr.open) / 2, index: i, strength: (curr.low - next.close > avgRange) ? 'STRONG' : 'NORMAL', valid: true });
        }
      }
    }
    
    demandZones.forEach(z => { if (candles.slice(z.index + 3).some(c => c.close < z.low * 0.997)) z.valid = false; });
    supplyZones.forEach(z => { if (candles.slice(z.index + 3).some(c => c.close > z.high * 1.003)) z.valid = false; });
    
    return { demandZones: demandZones.filter(z => z.valid).slice(-5), supplyZones: supplyZones.filter(z => z.valid).slice(-5) };
  },

  detectPullback(candles, demandZones, supplyZones, structure, config) {
    const last5 = candles.slice(-5), lastCandle = candles[candles.length - 1], price = lastCandle.close;
    
    for (const zone of demandZones) {
      const touched = last5.some(c => c.low <= zone.high * 1.001 && c.low >= zone.low * 0.998);
      const reaction = lastCandle.close > lastCandle.open && lastCandle.close > zone.mid;
      if (touched && reaction && price >= zone.low * 0.998 && price <= zone.high * 1.02 && structure.trend !== 'BEARISH') {
        const entry = Math.max(price, zone.high), stop = zone.low - config.slBuffer, risk = entry - stop;
        if (risk > 0) return { type: 'PULLBACK_DEMAND', side: 'BUY', zone, entry: +entry.toFixed(config.decimals), stop: +stop.toFixed(config.decimals), tp1: +(entry + risk).toFixed(config.decimals), tp2: +(entry + risk * 2).toFixed(config.decimals), tp3: +(entry + risk * 3).toFixed(config.decimals), confidence: zone.strength === 'STRONG' ? 85 : 75 };
      }
    }
    
    for (const zone of supplyZones) {
      const touched = last5.some(c => c.high >= zone.low * 0.999 && c.high <= zone.high * 1.002);
      const reaction = lastCandle.close < lastCandle.open && lastCandle.close < zone.mid;
      if (touched && reaction && price <= zone.high * 1.002 && price >= zone.low * 0.98 && structure.trend !== 'BULLISH') {
        const entry = Math.min(price, zone.low), stop = zone.high + config.slBuffer, risk = stop - entry;
        if (risk > 0) return { type: 'PULLBACK_SUPPLY', side: 'SELL', zone, entry: +entry.toFixed(config.decimals), stop: +stop.toFixed(config.decimals), tp1: +(entry - risk).toFixed(config.decimals), tp2: +(entry - risk * 2).toFixed(config.decimals), tp3: +(entry - risk * 3).toFixed(config.decimals), confidence: zone.strength === 'STRONG' ? 85 : 75 };
      }
    }
    return null;
  },

  analyzeMTF(candlesM5, candlesH1) {
    if (candlesH1.length < 20) return { confluence: false, h1Trend: 'UNKNOWN', aligned: false };
    const structureH1 = this.analyzeStructure(this.findSwings(candlesH1, 2));
    const structureM5 = this.analyzeStructure(this.findSwings(candlesM5, 3));
    const aligned = structureH1.trend === structureM5.trend && structureH1.trend !== 'NEUTRAL';
    return { confluence: aligned, h1Trend: structureH1.trend, m5Trend: structureM5.trend, aligned };
  },

  analyze(candlesM5, candlesH1, config, state) {
    if (candlesM5.length < 40) return { action: 'LOADING', score: 0, model: 'NO_DATA' };
    
    const swings = this.findSwings(candlesM5);
    const structure = this.analyzeStructure(swings);
    const { demandZones, supplyZones } = this.findZones(candlesM5);
    const fvgZones = this.findFVGs(candlesM5);
    const liquidityLevels = this.findLiquidityLevels(candlesM5, swings);
    const orderFlow = this.analyzeOrderFlow(candlesM5);
    const mtfAnalysis = this.analyzeMTF(candlesM5, candlesH1);
    const choch = this.detectCHoCH(candlesM5, swings);
    const bos = this.detectBOS(candlesM5, swings, structure);
    const pullback = this.detectPullback(candlesM5, demandZones, supplyZones, structure, config);
    
    Object.assign(state, { demandZones, supplyZones, fvgZones, liquidityLevels, swings: swings.slice(-10), structure, structureH1: { trend: mtfAnalysis.h1Trend }, orderFlow, mtfAnalysis, choch, bos });
    
    const models = [];
    if (mtfAnalysis.confluence && pullback) models.push({ name: 'MTF_CONFLUENCE', pullback, score: 95 });
    if (choch && pullback && choch.side === pullback.side) models.push({ name: 'CHOCH_PULLBACK', pullback, score: 90 });
    if (bos && pullback && bos.side === pullback.side) models.push({ name: 'BOS_CONTINUATION', pullback, score: 80 });
    
    if (!models.length) return { action: 'WAIT', score: 0, model: 'NO_SETUP', reason: 'Esperando confluencia', analysis: { structure: structure.trend, h1Trend: mtfAnalysis.h1Trend, orderFlow: orderFlow.momentum } };
    
    models.sort((a, b) => b.score - a.score);
    const best = models[0], finalScore = Math.min(100, Math.max(0, best.score + (stats.learning.scoreAdjustments[best.name] || 0)));
    
    if (finalScore < config.minScore) return { action: 'WAIT', score: finalScore, model: best.name, reason: `Score ${finalScore}% < ${config.minScore}%`, analysis: { structure: structure.trend, h1Trend: mtfAnalysis.h1Trend } };
    
    const pb = best.pullback;
    return { action: pb.side === 'BUY' ? 'LONG' : 'SHORT', model: best.name, score: finalScore, entry: pb.entry, stop: pb.stop, tp1: pb.tp1, tp2: pb.tp2, tp3: pb.tp3, reason: `${best.name} confirmado`, analysis: { structure: structure.trend, h1Trend: mtfAnalysis.h1Trend, mtfConfluence: mtfAnalysis.confluence, orderFlow: orderFlow.momentum, choch: choch?.type, bos: bos?.type } };
  }
};

// =============================================
// MARCUS - IA TRADER PROFESIONAL SMC
// Mentor humanizado con 12 años de experiencia
// =============================================
const Marcus = {
  
  // Obtener contexto completo del mercado
  getFullContext(symbol) {
    const data = assetData[symbol];
    const config = ASSETS[symbol];
    if (!data || !config || data.candles.length < 20) return null;
    
    const candles = data.candles;
    const price = data.price;
    const last = candles[candles.length - 1];
    const prev5 = candles.slice(-5);
    const prev10 = candles.slice(-10);
    const prev20 = candles.slice(-20);
    
    // Cambios de precio
    const change1 = prev5.length > 1 ? ((price - prev5[prev5.length - 2].close) / prev5[prev5.length - 2].close * 100) : 0;
    const change5 = prev5.length ? ((price - prev5[0].close) / prev5[0].close * 100) : 0;
    const change20 = prev20.length ? ((price - prev20[0].close) / prev20[0].close * 100) : 0;
    
    // Volatilidad
    const avgRange = SMC.getAvgRange(candles);
    const currentRange = last.high - last.low;
    const volatilityRatio = currentRange / avgRange;
    const volatility = volatilityRatio > 1.5 ? 'MUY_ALTA' : volatilityRatio > 1.2 ? 'ALTA' : volatilityRatio < 0.5 ? 'MUY_BAJA' : volatilityRatio < 0.8 ? 'BAJA' : 'NORMAL';
    
    // Momentum de velas
    const bullishCandles = prev10.filter(c => c.close > c.open).length;
    const bearishCandles = prev10.filter(c => c.close < c.open).length;
    const momentum = bullishCandles >= 7 ? 'MUY_ALCISTA' : bullishCandles >= 5 ? 'ALCISTA' : bearishCandles >= 7 ? 'MUY_BAJISTA' : bearishCandles >= 5 ? 'BAJISTA' : 'NEUTRAL';
    
    // Última vela
    const lastCandleType = last.close > last.open ? 'ALCISTA' : 'BAJISTA';
    const lastCandleStrength = Math.abs(last.close - last.open) / avgRange;
    
    // Posición respecto a zonas
    let nearestDemand = null, nearestSupply = null;
    for (const z of data.demandZones || []) {
      const dist = (price - z.high) / price * 100;
      if (!nearestDemand || Math.abs(dist) < Math.abs(nearestDemand.distance)) {
        nearestDemand = { ...z, distance: dist, inZone: price >= z.low && price <= z.high * 1.01 };
      }
    }
    for (const z of data.supplyZones || []) {
      const dist = (z.low - price) / price * 100;
      if (!nearestSupply || Math.abs(dist) < Math.abs(nearestSupply.distance)) {
        nearestSupply = { ...z, distance: dist, inZone: price >= z.low * 0.99 && price <= z.high };
      }
    }
    
    // Highs y Lows recientes
    const recentHigh = Math.max(...prev20.map(c => c.high));
    const recentLow = Math.min(...prev20.map(c => c.low));
    const pricePosition = ((price - recentLow) / (recentHigh - recentLow) * 100).toFixed(0);
    
    return {
      symbol, name: config.name, shortName: config.shortName, emoji: config.emoji,
      price, decimals: config.decimals, type: config.type,
      change1: change1.toFixed(3), change5: change5.toFixed(2), change20: change20.toFixed(2),
      volatility, volatilityRatio: volatilityRatio.toFixed(2),
      momentum, bullishCandles, bearishCandles,
      lastCandle: { type: lastCandleType, strength: lastCandleStrength.toFixed(2) },
      structure: data.structure?.trend || 'NEUTRAL',
      structureStrength: data.structure?.strength || 0,
      structureH1: data.structureH1?.trend || 'NEUTRAL',
      mtfConfluence: data.mtfAnalysis?.confluence || false,
      mtfAligned: data.mtfAnalysis?.aligned || false,
      orderFlow: data.orderFlow || { momentum: 'NEUTRAL', strength: 0 },
      demandZones: data.demandZones || [],
      supplyZones: data.supplyZones || [],
      fvgZones: data.fvgZones || [],
      liquidityLevels: data.liquidityLevels || [],
      nearestDemand, nearestSupply,
      choch: data.choch,
      bos: data.bos,
      lockedSignal: data.lockedSignal,
      recentHigh, recentLow, pricePosition,
      swings: data.swings || []
    };
  },

  // Respuestas humanizadas
  humanize(text) {
    const fillers = ['Mira,', 'Ok,', 'Bien,', 'A ver,', 'Perfecto,', ''];
    const filler = fillers[Math.floor(Math.random() * fillers.length)];
    return filler ? `${filler} ${text}` : text;
  },

  // Chat principal - Responde como trader profesional
  chat(question, symbol) {
    const ctx = this.getFullContext(symbol);
    
    if (!ctx) {
      return { 
        answer: "Dame un segundo mientras cargo los datos del mercado... 📊\n\nPrueba preguntarme de nuevo en unos segundos.",
        type: 'loading'
      };
    }
    
    const q = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    
    // ═══════════════════════════════════════════════════════════════
    // SALUDO / INICIO
    // ═══════════════════════════════════════════════════════════════
    if (q === '' || q === 'hola' || q === 'hey' || q === 'que tal' || q === 'buenas' || q === 'hi' || q === 'hello') {
      return {
        answer: `¡Qué tal! 👋 Soy Marcus, tu mentor SMC.\n\nEstoy viendo ${ctx.emoji} **${ctx.name}** en ${ctx.price.toFixed(ctx.decimals)}.\n\n${ctx.structure === 'BULLISH' ? '📈 Estructura alcista' : ctx.structure === 'BEARISH' ? '📉 Estructura bajista' : '⚖️ Sin tendencia clara'}${ctx.mtfConfluence ? ' con confluencia MTF ✨' : ''}\n\n¿Qué quieres saber?\n• Escribe **"análisis"** para ver el gráfico completo\n• **"zonas"** para ver order blocks\n• **"qué buscar"** para saber qué esperar\n• O pregúntame lo que necesites 💪`,
        type: 'greeting'
      };
    }

    // ═══════════════════════════════════════════════════════════════
    // ANÁLISIS COMPLETO DEL GRÁFICO
    // ═══════════════════════════════════════════════════════════════
    if (q.includes('analisis') || q.includes('analiza') || q.includes('que ves') || q.includes('como esta') || 
        q.includes('grafico') || q.includes('mercado') || q.includes('situacion') || q.includes('contexto')) {
      
      let r = `📊 **ANÁLISIS ${ctx.name.toUpperCase()}**\n`;
      r += `Precio: **${ctx.price.toFixed(ctx.decimals)}**\n\n`;
      
      // Estructura
      r += `**📐 ESTRUCTURA DEL MERCADO**\n`;
      if (ctx.structure === 'BULLISH') {
        r += `M5: 🟢 ALCISTA - El precio está haciendo máximos más altos (HH) y mínimos más altos (HL). Los compradores tienen el control.\n`;
      } else if (ctx.structure === 'BEARISH') {
        r += `M5: 🔴 BAJISTA - El precio está haciendo máximos más bajos (LH) y mínimos más bajos (LL). Los vendedores dominan.\n`;
      } else {
        r += `M5: ⚪ NEUTRAL - No hay tendencia clara. El mercado está en consolidación o transición.\n`;
      }
      
      r += `H1: ${ctx.structureH1 === 'BULLISH' ? '🟢 ALCISTA' : ctx.structureH1 === 'BEARISH' ? '🔴 BAJISTA' : '⚪ NEUTRAL'}\n`;
      
      if (ctx.mtfConfluence) {
        r += `\n✨ **CONFLUENCIA MTF ACTIVA**\nAmbos timeframes alineados. Esto aumenta significativamente la probabilidad de éxito.\n`;
      }
      
      // Momentum
      r += `\n**📈 MOMENTUM**\n`;
      r += `${ctx.orderFlow.description || 'Flujo neutral'}\n`;
      r += `Últimas 10 velas: ${ctx.bullishCandles} alcistas / ${ctx.bearishCandles} bajistas\n`;
      r += `Volatilidad: ${ctx.volatility.replace('_', ' ')}\n`;
      
      // Zonas
      r += `\n**📦 ZONAS INSTITUCIONALES**\n`;
      r += `Demanda (compra): ${ctx.demandZones.length} zonas activas\n`;
      r += `Oferta (venta): ${ctx.supplyZones.length} zonas activas\n`;
      
      if (ctx.nearestDemand?.inZone) {
        r += `\n⚠️ **PRECIO EN ZONA DE DEMANDA** - Posible reacción alcista\n`;
      }
      if (ctx.nearestSupply?.inZone) {
        r += `\n⚠️ **PRECIO EN ZONA DE OFERTA** - Posible reacción bajista\n`;
      }
      
      // Detecciones SMC
      if (ctx.choch) {
        r += `\n⚡ **${ctx.choch.type}** detectado en ${ctx.choch.level?.toFixed(ctx.decimals)}\n`;
        r += `Esto indica un cambio en el carácter del mercado.\n`;
      }
      if (ctx.bos) {
        r += `\n📊 **${ctx.bos.type}** confirmado\n`;
        r += `La estructura continúa en la dirección actual.\n`;
      }
      
      // Señal activa
      if (ctx.lockedSignal) {
        const s = ctx.lockedSignal;
        r += `\n━━━━━━━━━━━━━━━━━━━━\n`;
        r += `🎯 **OPERACIÓN ${s.action} ACTIVA**\n`;
        r += `Modelo: ${s.model} | Score: ${s.score}%\n`;
        r += `Entry: ${s.entry} | SL: ${s.stop}\n`;
        r += `TP1: ${s.tp1}${s.tp1Hit ? ' ✅' : ''} | TP2: ${s.tp2}${s.tp2Hit ? ' ✅' : ''} | TP3: ${s.tp3}${s.tp3Hit ? ' ✅' : ''}\n`;
      }
      
      // Mi opinión
      r += `\n**💡 MI LECTURA**\n`;
      if (ctx.mtfConfluence && ctx.structure === 'BULLISH') {
        r += `El escenario es favorable para compras. Buscaría entrada en pullback a las zonas de demanda marcadas. La confluencia de timeframes nos da ventaja.`;
      } else if (ctx.mtfConfluence && ctx.structure === 'BEARISH') {
        r += `El escenario es favorable para ventas. Buscaría entrada en pullback a las zonas de oferta. Con la confluencia MTF, las probabilidades están de nuestro lado.`;
      } else if (ctx.structure === 'NEUTRAL') {
        r += `El mercado está indefinido. En estos casos, la mejor estrategia es esperar. No forzar trades cuando no hay claridad es parte de ser rentable.`;
      } else {
        r += `Hay estructura en M5 pero no hay confluencia con H1. Podría operar con precaución y menos riesgo, o esperar mejor alineación.`;
      }
      
      return { answer: r, type: 'analysis' };
    }

    // ═══════════════════════════════════════════════════════════════
    // QUÉ BUSCAR / PROYECCIÓN
    // ═══════════════════════════════════════════════════════════════
    if (q.includes('que buscar') || q.includes('que esperar') || q.includes('proyeccion') || q.includes('siguiente') ||
        q.includes('que hago') || q.includes('que hacer') || q.includes('recomendacion') || q.includes('plan')) {
      
      let r = `🎯 **QUÉ BUSCAR EN ${ctx.shortName}**\n\n`;
      
      if (ctx.mtfConfluence && ctx.structure === 'BULLISH') {
        r += `**ESCENARIO: COMPRAS (LONG)**\n\n`;
        r += `✅ La estructura es alcista en M5 y H1. Esto es ideal.\n\n`;
        r += `**Plan de trading:**\n`;
        r += `1. Esperar pullback a zona de demanda\n`;
        r += `2. Buscar vela de rechazo/confirmación alcista\n`;
        r += `3. Entry cuando el precio reaccione de la zona\n`;
        r += `4. Stop loss debajo de la zona\n`;
        r += `5. TP1: 1:1 | TP2: 1:2 | TP3: 1:3\n\n`;
        
        if (ctx.demandZones.length > 0) {
          const z = ctx.demandZones[ctx.demandZones.length - 1];
          r += `**🟢 Zona para buscar entrada:**\n`;
          r += `${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)} ${z.strength === 'STRONG' ? '(FUERTE 💪)' : ''}\n`;
          r += `Distancia: ${((ctx.price - z.high) / ctx.price * 100).toFixed(2)}% del precio actual\n`;
        }
        
      } else if (ctx.mtfConfluence && ctx.structure === 'BEARISH') {
        r += `**ESCENARIO: VENTAS (SHORT)**\n\n`;
        r += `✅ La estructura es bajista en M5 y H1. Buen setup.\n\n`;
        r += `**Plan de trading:**\n`;
        r += `1. Esperar pullback a zona de oferta\n`;
        r += `2. Buscar vela de rechazo/confirmación bajista\n`;
        r += `3. Entry cuando el precio reaccione de la zona\n`;
        r += `4. Stop loss encima de la zona\n`;
        r += `5. TP1: 1:1 | TP2: 1:2 | TP3: 1:3\n\n`;
        
        if (ctx.supplyZones.length > 0) {
          const z = ctx.supplyZones[ctx.supplyZones.length - 1];
          r += `**🔴 Zona para buscar entrada:**\n`;
          r += `${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)} ${z.strength === 'STRONG' ? '(FUERTE 💪)' : ''}\n`;
          r += `Distancia: ${((z.low - ctx.price) / ctx.price * 100).toFixed(2)}% del precio actual\n`;
        }
        
      } else if (ctx.structure === 'NEUTRAL') {
        r += `**ESCENARIO: ESPERAR**\n\n`;
        r += `⏳ El mercado está en consolidación. No hay tendencia clara.\n\n`;
        r += `**Lo que haría yo:**\n`;
        r += `1. No forzar ningún trade\n`;
        r += `2. Esperar ruptura de rango\n`;
        r += `3. Ver qué nivel rompe primero (máximo o mínimo del rango)\n`;
        r += `4. Después de la ruptura, buscar pullback\n\n`;
        r += `Rango actual:\n`;
        r += `Alto: ${ctx.recentHigh.toFixed(ctx.decimals)}\n`;
        r += `Bajo: ${ctx.recentLow.toFixed(ctx.decimals)}\n\n`;
        r += `*"La paciencia es una de las mejores herramientas del trader rentable."*`;
        
      } else {
        r += `**ESCENARIO: PRECAUCIÓN**\n\n`;
        r += `⚠️ Hay estructura en M5 (${ctx.structure}) pero H1 no confirma.\n\n`;
        r += `**Opciones:**\n`;
        r += `A) Operar con menos riesgo (menos lotaje)\n`;
        r += `B) Esperar que H1 se alinee\n`;
        r += `C) Buscar otro activo con mejor setup\n\n`;
        r += `*Personalmente, prefiero esperar confluencia. Los mejores trades vienen cuando todo se alinea.*`;
      }
      
      return { answer: r, type: 'plan' };
    }

    // ═══════════════════════════════════════════════════════════════
    // ZONAS / ORDER BLOCKS
    // ═══════════════════════════════════════════════════════════════
    if (q.includes('zona') || q.includes('order block') || q.includes('demanda') || q.includes('oferta') ||
        q.includes('soporte') || q.includes('resistencia') || q.includes('niveles')) {
      
      let r = `📦 **ZONAS INSTITUCIONALES - ${ctx.shortName}**\n\n`;
      
      if (ctx.demandZones.length > 0) {
        r += `**🟢 ZONAS DE DEMANDA (Para compras)**\n`;
        ctx.demandZones.forEach((z, i) => {
          const dist = ((ctx.price - z.high) / ctx.price * 100).toFixed(2);
          const status = z.inZone || (ctx.price >= z.low && ctx.price <= z.high * 1.01) ? '📍 PRECIO AQUÍ' : `${dist}% ${dist > 0 ? 'arriba' : 'abajo'}`;
          r += `${i+1}. **${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)}** ${z.strength === 'STRONG' ? '💪' : ''}\n   ${status}\n`;
        });
      } else {
        r += `No hay zonas de demanda válidas actualmente.\n`;
      }
      
      r += `\n`;
      
      if (ctx.supplyZones.length > 0) {
        r += `**🔴 ZONAS DE OFERTA (Para ventas)**\n`;
        ctx.supplyZones.forEach((z, i) => {
          const dist = ((z.low - ctx.price) / ctx.price * 100).toFixed(2);
          const status = ctx.price >= z.low * 0.99 && ctx.price <= z.high ? '📍 PRECIO AQUÍ' : `${dist}% ${dist > 0 ? 'arriba' : 'abajo'}`;
          r += `${i+1}. **${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)}** ${z.strength === 'STRONG' ? '💪' : ''}\n   ${status}\n`;
        });
      } else {
        r += `No hay zonas de oferta válidas actualmente.\n`;
      }
      
      if (ctx.fvgZones.length > 0) {
        r += `\n**📊 FAIR VALUE GAPS: ${ctx.fvgZones.length} activos**\n`;
        r += `Estos son imbalances que el precio podría llenar.\n`;
      }
      
      if (ctx.liquidityLevels.length > 0) {
        r += `\n**💧 NIVELES DE LIQUIDEZ: ${ctx.liquidityLevels.length}**\n`;
        r += `Hay stops acumulados en estos niveles.\n`;
      }
      
      r += `\n**💡 Tip:** Las zonas con 💪 son STRONG - tuvieron una reacción muy fuerte. Son las mejores para buscar entradas.`;
      
      return { answer: r, type: 'zones' };
    }

    // ═══════════════════════════════════════════════════════════════
    // SEÑAL ACTIVA / OPERACIÓN
    // ═══════════════════════════════════════════════════════════════
    if (q.includes('senal') || q.includes('operacion') || q.includes('trade') || q.includes('entrada') ||
        q.includes('posicion') || q.includes('como va')) {
      
      if (ctx.lockedSignal) {
        const s = ctx.lockedSignal;
        const isLong = s.action === 'LONG';
        const inProfit = (isLong && ctx.price > s.entry) || (!isLong && ctx.price < s.entry);
        const pnlPct = isLong ? ((ctx.price - s.entry) / s.entry * 100) : ((s.entry - ctx.price) / s.entry * 100);
        const distToTp1 = isLong ? ((s.tp1 - ctx.price) / ctx.price * 100) : ((ctx.price - s.tp1) / ctx.price * 100);
        const distToSl = isLong ? ((ctx.price - s.stop) / ctx.price * 100) : ((s.stop - ctx.price) / ctx.price * 100);
        
        let r = `🎯 **OPERACIÓN ACTIVA - ${ctx.shortName}**\n\n`;
        r += `**Tipo:** ${s.action === 'LONG' ? '🟢 COMPRA (LONG)' : '🔴 VENTA (SHORT)'}\n`;
        r += `**Modelo:** ${s.model}\n`;
        r += `**Score:** ${s.score}%\n\n`;
        
        r += `**📊 NIVELES**\n`;
        r += `Entry: ${s.entry}\n`;
        r += `SL: ${s.stop} (${distToSl.toFixed(2)}% de distancia)\n`;
        r += `TP1: ${s.tp1} ${s.tp1Hit ? '✅ ALCANZADO' : `(${distToTp1.toFixed(2)}%)`}\n`;
        r += `TP2: ${s.tp2} ${s.tp2Hit ? '✅ ALCANZADO' : ''}\n`;
        r += `TP3: ${s.tp3} ${s.tp3Hit ? '✅ ALCANZADO' : ''}\n\n`;
        
        r += `**📈 ESTADO ACTUAL**\n`;
        r += `Precio: ${ctx.price.toFixed(ctx.decimals)}\n`;
        r += `P&L flotante: ${inProfit ? '✅' : '🔻'} ${pnlPct.toFixed(2)}%\n\n`;
        
        if (s.tp1Hit && !s.tp2Hit) {
          r += `💡 **TP1 alcanzado.** Considera mover SL a breakeven para asegurar la operación.\n`;
        } else if (distToTp1 < 0.5 && distToTp1 > 0 && !s.tp1Hit) {
          r += `🔥 **Muy cerca de TP1!** Mantén la calma y deja que el precio trabaje.\n`;
        } else if (!inProfit && distToSl < 0.3) {
          r += `⚠️ **Cerca del SL.** Respeta tu plan. Si salta el SL, es parte del trading.\n`;
        }
        
        // Verificar si estructura cambió
        if ((isLong && ctx.structure === 'BEARISH') || (!isLong && ctx.structure === 'BULLISH')) {
          r += `\n⚠️ **ALERTA:** La estructura M5 cambió a ${ctx.structure}. Considera cerrar o ajustar.\n`;
        }
        
        return { answer: r, type: 'signal' };
      }
      
      let r = `⏳ **SIN OPERACIÓN ACTIVA - ${ctx.shortName}**\n\n`;
      r += `El sistema está esperando que se cumplan las condiciones:\n`;
      r += `• CHoCH o BOS confirmado ${ctx.choch || ctx.bos ? '✅' : '⏳'}\n`;
      r += `• Pullback a zona válida ⏳\n`;
      r += `• Score mínimo 70% ⏳\n\n`;
      
      r += `**Estado actual:**\n`;
      r += `Estructura M5: ${ctx.structure}\n`;
      r += `Estructura H1: ${ctx.structureH1}\n`;
      r += `Zonas: ${ctx.demandZones.length}D / ${ctx.supplyZones.length}S\n\n`;
      
      if (ctx.choch) {
        r += `✨ Ya hay ${ctx.choch.type} detectado. Esperando pullback a zona.\n`;
      } else if (ctx.bos) {
        r += `✨ Ya hay ${ctx.bos.type} confirmado. Esperando pullback.\n`;
      } else {
        r += `Esperando cambio de estructura (CHoCH) o continuación (BOS).\n`;
      }
      
      return { answer: r, type: 'waiting' };
    }

    // ═══════════════════════════════════════════════════════════════
    // EDUCACIÓN - CHoCH
    // ═══════════════════════════════════════════════════════════════
    if (q.includes('choch') || q.includes('cambio de caracter') || q.includes('change of character')) {
      let r = `📚 **CHoCH - CAMBIO DE CARÁCTER**\n\n`;
      r += `El CHoCH (Change of Character) es uno de los conceptos más poderosos en SMC. Indica que el mercado está **cambiando de dirección**.\n\n`;
      
      r += `**¿Cómo identificarlo?**\n\n`;
      r += `🔻 En tendencia BAJISTA (LH + LL):\n`;
      r += `• El precio viene haciendo máximos y mínimos más bajos\n`;
      r += `• De repente, rompe un máximo anterior con fuerza\n`;
      r += `• Eso es CHoCH ALCISTA → El mercado quiere subir\n\n`;
      
      r += `🔺 En tendencia ALCISTA (HH + HL):\n`;
      r += `• El precio viene haciendo máximos y mínimos más altos\n`;
      r += `• De repente, rompe un mínimo anterior con fuerza\n`;
      r += `• Eso es CHoCH BAJISTA → El mercado quiere bajar\n\n`;
      
      r += `**¿Cómo operar después del CHoCH?**\n`;
      r += `1. Identificar la zona que provocó el CHoCH (Order Block)\n`;
      r += `2. Esperar que el precio vuelva a esa zona (Pullback)\n`;
      r += `3. Buscar confirmación (vela de rechazo)\n`;
      r += `4. Entry con SL debajo/encima de la zona\n`;
      r += `5. TP mínimo 1:2 RR\n\n`;
      
      if (ctx.choch) {
        r += `**📍 EN ESTE GRÁFICO:**\n`;
        r += `✅ ${ctx.choch.type} detectado en ${ctx.choch.level?.toFixed(ctx.decimals)}\n`;
        r += `Ahora estamos esperando el pullback para buscar entrada.\n`;
      } else {
        r += `*Actualmente no hay CHoCH en ${ctx.shortName}. Te avisaré cuando aparezca uno.*\n`;
      }
      
      return { answer: r, type: 'education' };
    }

    // ═══════════════════════════════════════════════════════════════
    // EDUCACIÓN - BOS
    // ═══════════════════════════════════════════════════════════════
    if (q.includes('bos') || q.includes('break of structure') || q.includes('ruptura de estructura')) {
      let r = `📚 **BOS - RUPTURA DE ESTRUCTURA**\n\n`;
      r += `El BOS (Break of Structure) confirma que la tendencia actual **continúa**. Es diferente al CHoCH.\n\n`;
      
      r += `**CHoCH vs BOS:**\n`;
      r += `• **CHoCH** = Cambio de dirección (reversión)\n`;
      r += `• **BOS** = Confirmación de dirección (continuación)\n\n`;
      
      r += `**¿Cómo identificarlo?**\n\n`;
      r += `📈 BOS ALCISTA:\n`;
      r += `• Tendencia alcista existente (HH + HL)\n`;
      r += `• El precio rompe el último Higher High\n`;
      r += `• Confirma que los compradores siguen en control\n\n`;
      
      r += `📉 BOS BAJISTA:\n`;
      r += `• Tendencia bajista existente (LH + LL)\n`;
      r += `• El precio rompe el último Lower Low\n`;
      r += `• Confirma que los vendedores siguen dominando\n\n`;
      
      r += `**¿Cómo operar?**\n`;
      r += `1. Confirmar tendencia clara\n`;
      r += `2. Esperar BOS (ruptura del último swing)\n`;
      r += `3. Esperar pullback al nivel roto o zona\n`;
      r += `4. Entry en la dirección de la tendencia\n\n`;
      
      if (ctx.bos) {
        r += `**📍 EN ESTE GRÁFICO:**\n`;
        r += `✅ ${ctx.bos.type} confirmado\n`;
        r += `La estructura está continuando. Buscar entries en pullback.\n`;
      } else {
        r += `*Actualmente no hay BOS en ${ctx.shortName}.*\n`;
      }
      
      return { answer: r, type: 'education' };
    }

    // ═══════════════════════════════════════════════════════════════
    // EDUCACIÓN - FVG
    // ═══════════════════════════════════════════════════════════════
    if (q.includes('fvg') || q.includes('fair value') || q.includes('imbalance') || q.includes('gap')) {
      let r = `📚 **FVG - FAIR VALUE GAP**\n\n`;
      r += `Un FVG es un **desequilibrio de precio** - un área donde el mercado se movió tan rápido que dejó un "gap" en el precio justo.\n\n`;
      
      r += `**¿Cómo se forma?**\n`;
      r += `Necesitas 3 velas:\n`;
      r += `• Vela 1: Normal\n`;
      r += `• Vela 2: IMPULSO FUERTE (muy grande)\n`;
      r += `• Vela 3: Normal\n\n`;
      r += `El FVG es el espacio entre el máximo de la Vela 1 y el mínimo de la Vela 3 (en impulso alcista).\n\n`;
      
      r += `**¿Por qué importa?**\n`;
      r += `El precio tiende a "llenar" estos gaps. Es como si el mercado quisiera corregir ese desequilibrio.\n\n`;
      
      r += `**¿Cómo operar?**\n`;
      r += `• En tendencia alcista: Esperar que el precio baje al FVG y comprar ahí\n`;
      r += `• En tendencia bajista: Esperar que el precio suba al FVG y vender ahí\n`;
      r += `• El 50% del FVG (mitad) es el nivel más importante\n\n`;
      
      r += `**En ${ctx.shortName}:** ${ctx.fvgZones.length} FVGs activos\n`;
      
      return { answer: r, type: 'education' };
    }

    // ═══════════════════════════════════════════════════════════════
    // EDUCACIÓN - LIQUIDEZ
    // ═══════════════════════════════════════════════════════════════
    if (q.includes('liquidez') || q.includes('liquidity') || q.includes('stop hunt') || q.includes('caza de stop')) {
      let r = `📚 **LIQUIDEZ Y STOP HUNTS**\n\n`;
      r += `La liquidez es donde están las **órdenes pendientes** - principalmente stop losses de otros traders.\n\n`;
      
      r += `**¿Dónde está la liquidez?**\n`;
      r += `• Por encima de máximos iguales (equal highs)\n`;
      r += `• Por debajo de mínimos iguales (equal lows)\n`;
      r += `• En números redondos (1.2000, 50000, etc.)\n`;
      r += `• Encima/debajo de niveles obvios\n\n`;
      
      r += `**¿Qué es un Stop Hunt?**\n`;
      r += `El "dinero inteligente" necesita liquidez para llenar sus órdenes grandes. Por eso:\n`;
      r += `1. El precio "caza" los stops de retailers\n`;
      r += `2. Las instituciones llenan sus órdenes\n`;
      r += `3. El precio revierte en la dirección real\n\n`;
      
      r += `**¿Cómo aprovecharlo?**\n`;
      r += `• Identificar niveles con múltiples toques (liquidez acumulada)\n`;
      r += `• Esperar que el precio rompa el nivel (sweep)\n`;
      r += `• Buscar rechazo (cierre del otro lado)\n`;
      r += `• Entry en la reversión\n\n`;
      
      r += `**En ${ctx.shortName}:** ${ctx.liquidityLevels.length} niveles de liquidez identificados\n`;
      
      return { answer: r, type: 'education' };
    }

    // ═══════════════════════════════════════════════════════════════
    // EDUCACIÓN - SMC GENERAL
    // ═══════════════════════════════════════════════════════════════
    if (q.includes('smc') || q.includes('smart money') || q.includes('conceptos') || q.includes('metodologia') ||
        q.includes('ensena') || q.includes('aprend') || q.includes('curso') || q.includes('basico')) {
      let r = `📚 **SMART MONEY CONCEPTS (SMC)**\n\n`;
      r += `SMC es una metodología de trading que busca operar en la **dirección del dinero institucional** (bancos, fondos, etc.).\n\n`;
      
      r += `**🔑 CONCEPTOS CLAVE:**\n\n`;
      
      r += `**1. ESTRUCTURA DEL MERCADO**\n`;
      r += `• Alcista: HH (Higher High) + HL (Higher Low)\n`;
      r += `• Bajista: LH (Lower High) + LL (Lower Low)\n`;
      r += `• Es la base de todo el análisis\n\n`;
      
      r += `**2. CHoCH (Change of Character)**\n`;
      r += `• Señal de que la tendencia está cambiando\n`;
      r += `• Ruptura de estructura en contra de la tendencia\n\n`;
      
      r += `**3. BOS (Break of Structure)**\n`;
      r += `• Confirmación de que la tendencia continúa\n`;
      r += `• Ruptura en dirección de la tendencia\n\n`;
      
      r += `**4. ORDER BLOCKS (Zonas)**\n`;
      r += `• Demanda: Donde las instituciones compraron\n`;
      r += `• Oferta: Donde las instituciones vendieron\n`;
      r += `• Son nuestras zonas de entrada\n\n`;
      
      r += `**5. LIQUIDEZ**\n`;
      r += `• Donde están los stop losses\n`;
      r += `• Las instituciones los "cazan" para llenar órdenes\n\n`;
      
      r += `**6. FAIR VALUE GAPS (FVG)**\n`;
      r += `• Desequilibrios de precio\n`;
      r += `• El precio tiende a llenarlos\n\n`;
      
      r += `**¿Qué concepto quieres que te explique en detalle?**\n`;
      r += `Escribe: CHoCH, BOS, FVG, liquidez, zonas...`;
      
      return { answer: r, type: 'education' };
    }

    // ═══════════════════════════════════════════════════════════════
    // ESTADÍSTICAS
    // ═══════════════════════════════════════════════════════════════
    if (q.includes('stats') || q.includes('estadistica') || q.includes('rendimiento') || q.includes('win rate') ||
        q.includes('resultados') || q.includes('historial') || q.includes('record')) {
      const wr = stats.wins + stats.losses > 0 ? Math.round(stats.wins / (stats.wins + stats.losses) * 100) : 0;
      const as = stats.byAsset[symbol] || { wins: 0, losses: 0 };
      const asWr = as.wins + as.losses > 0 ? Math.round(as.wins / (as.wins + as.losses) * 100) : 0;
      
      let r = `📊 **ESTADÍSTICAS**\n\n`;
      r += `**GLOBAL**\n`;
      r += `Win Rate: ${wr}%\n`;
      r += `Trades: ${stats.total} | Wins: ${stats.wins} | Losses: ${stats.losses}\n`;
      r += `TPs: TP1=${stats.tp1Hits} | TP2=${stats.tp2Hits} | TP3=${stats.tp3Hits}\n\n`;
      
      r += `**${ctx.name.toUpperCase()}**\n`;
      r += `Win Rate: ${asWr}%\n`;
      r += `Wins: ${as.wins} | Losses: ${as.losses}\n\n`;
      
      if (Object.keys(stats.byModel).length > 0) {
        r += `**POR MODELO**\n`;
        for (const [model, ms] of Object.entries(stats.byModel)) {
          const mwr = ms.wins + ms.losses > 0 ? Math.round(ms.wins / (ms.wins + ms.losses) * 100) : 0;
          r += `${model}: ${mwr}% (${ms.wins}W/${ms.losses}L)\n`;
        }
      }
      
      return { answer: r, type: 'stats' };
    }

    // ═══════════════════════════════════════════════════════════════
    // AYUDA
    // ═══════════════════════════════════════════════════════════════
    if (q.includes('ayuda') || q.includes('help') || q.includes('que puedo') || q.includes('comandos')) {
      return {
        answer: `🤝 **¿EN QUÉ PUEDO AYUDARTE?**\n\n**ANÁLISIS EN TIEMPO REAL**\n• "análisis" - Análisis completo del gráfico\n• "zonas" - Ver order blocks\n• "qué buscar" - Plan de trading\n• "señal" - Estado de operación\n\n**EDUCACIÓN SMC**\n• "qué es CHoCH" - Cambio de carácter\n• "qué es BOS" - Ruptura de estructura\n• "qué es FVG" - Fair value gaps\n• "liquidez" - Stop hunts\n• "SMC" - Conceptos generales\n\n**OTROS**\n• "stats" - Estadísticas\n• Pregúntame lo que quieras sobre el gráfico\n\nEstoy aquí para ayudarte a mejorar tu trading 💪`,
        type: 'help'
      };
    }

    // ═══════════════════════════════════════════════════════════════
    // RESPUESTA DEFAULT - Intenta entender la pregunta
    // ═══════════════════════════════════════════════════════════════
    let r = `Entiendo que preguntas sobre "${question}".\n\n`;
    r += `**${ctx.name}** está en ${ctx.price.toFixed(ctx.decimals)}\n`;
    r += `Estructura: ${ctx.structure === 'BULLISH' ? '🟢 Alcista' : ctx.structure === 'BEARISH' ? '🔴 Bajista' : '⚪ Neutral'}\n\n`;
    
    r += `¿Qué te gustaría saber?\n`;
    r += `• **"análisis"** - Ver el gráfico completo\n`;
    r += `• **"zonas"** - Ver order blocks\n`;
    r += `• **"qué buscar"** - Plan de trading\n`;
    r += `• **"ayuda"** - Ver todo lo que puedo hacer`;
    
    return { answer: r, type: 'default' };
  }
};

// =============================================
// AUTO-TRACKING
// =============================================
function checkSignalHits() {
  for (const [symbol, data] of Object.entries(assetData)) {
    const locked = data.lockedSignal;
    if (!locked || !data.price) continue;
    
    const price = data.price, isLong = locked.action === 'LONG';
    const signal = signalHistory.find(s => s.id === locked.id);
    if (!signal || signal.status !== 'PENDING') continue;
    
    if ((isLong && price <= locked.stop) || (!isLong && price >= locked.stop)) {
      closeSignal(signal.id, 'LOSS', 'AUTO-SL', symbol);
      continue;
    }
    
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
    assetData[symbol].structureAlert = null;
  }
  
  stats.byModel[signal.model] = stats.byModel[signal.model] || { wins: 0, losses: 0 };
  stats.byAsset[signal.symbol] = stats.byAsset[signal.symbol] || { wins: 0, losses: 0, total: 0 };
  
  if (status === 'WIN') {
    stats.wins++; stats.byModel[signal.model].wins++; stats.byAsset[signal.symbol].wins++; stats.byAsset[signal.symbol].total++;
    stats.learning.scoreAdjustments[signal.model] = (stats.learning.scoreAdjustments[signal.model] || 0) + 2;
  } else if (status === 'LOSS') {
    stats.losses++; stats.byModel[signal.model].losses++; stats.byAsset[signal.symbol].losses++; stats.byAsset[signal.symbol].total++;
    stats.learning.scoreAdjustments[signal.model] = (stats.learning.scoreAdjustments[signal.model] || 0) - 1;
  }
  stats.pending = signalHistory.filter(s => s.status === 'PENDING').length;
}

// =============================================
// CONEXIÓN DERIV
// =============================================
function connectDeriv() {
  const appId = process.env.DERIV_APP_ID || '1089';
  try { derivWs = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`); }
  catch { setTimeout(connectDeriv, 5000); return; }
  
  derivWs.on('open', () => {
    console.log('✅ Conectado a Deriv');
    isConnected = true;
    for (const symbol of Object.keys(ASSETS)) {
      derivWs.send(JSON.stringify({ ticks_history: symbol, adjust_start_time: 1, count: 100, end: 'latest', granularity: GRANULARITY_M5, style: 'candles', subscribe: 1 }));
      derivWs.send(JSON.stringify({ ticks_history: symbol, adjust_start_time: 1, count: 50, end: 'latest', granularity: GRANULARITY_H1, style: 'candles', req_id: `h1_${symbol}` }));
      derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    }
  });
  
  derivWs.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.candles && msg.echo_req?.ticks_history && !msg.echo_req?.req_id) {
        const symbol = msg.echo_req.ticks_history;
        if (assetData[symbol]) {
          assetData[symbol].candles = msg.candles.map(c => ({ time: c.epoch * 1000, open: +c.open, high: +c.high, low: +c.low, close: +c.close }));
          analyzeAsset(symbol);
        }
      }
      if (msg.candles && msg.echo_req?.req_id?.startsWith('h1_')) {
        const symbol = msg.echo_req.req_id.replace('h1_', '');
        if (assetData[symbol]) assetData[symbol].candlesH1 = msg.candles.map(c => ({ time: c.epoch * 1000, open: +c.open, high: +c.high, low: +c.low, close: +c.close }));
      }
      if (msg.ohlc && msg.ohlc.granularity === GRANULARITY_M5) {
        const symbol = msg.ohlc.symbol;
        if (assetData[symbol]) {
          const nc = { time: msg.ohlc.open_time * 1000, open: +msg.ohlc.open, high: +msg.ohlc.high, low: +msg.ohlc.low, close: +msg.ohlc.close };
          const candles = assetData[symbol].candles;
          if (candles.length) {
            const last = candles[candles.length - 1];
            if (last.time === nc.time) candles[candles.length - 1] = nc;
            else if (nc.time > last.time) { candles.push(nc); if (candles.length > 200) candles.shift(); analyzeAsset(symbol); }
          }
          assetData[symbol].price = nc.close;
          checkSignalHits();
        }
      }
      if (msg.tick) {
        const symbol = msg.tick.symbol;
        if (assetData[symbol]) { assetData[symbol].price = +msg.tick.quote; checkSignalHits(); }
      }
    } catch {}
  });
  
  derivWs.on('close', () => { isConnected = false; setTimeout(connectDeriv, 5000); });
  derivWs.on('error', () => {});
}

function analyzeAsset(symbol) {
  const data = assetData[symbol], config = ASSETS[symbol];
  if (!data || !config || data.candles.length < 40) return;
  if (Date.now() - data.lastAnalysis < 2000) return;
  data.lastAnalysis = Date.now();
  
  data.signal = SMC.analyze(data.candles, data.candlesH1 || [], config, data);
  if (data.lockedSignal) return;
  
  const signal = data.signal;
  if (signal.action !== 'WAIT' && signal.action !== 'LOADING' && signal.score >= config.minScore) {
    if (!signalHistory.some(s => s.symbol === symbol && s.status === 'PENDING')) {
      const ns = { id: signalIdCounter++, symbol, assetName: config.name, emoji: config.emoji, action: signal.action, model: signal.model, score: signal.score, entry: signal.entry, stop: signal.stop, tp1: signal.tp1, tp2: signal.tp2, tp3: signal.tp3, tp1Hit: false, tp2Hit: false, tp3Hit: false, status: 'PENDING', timestamp: new Date().toISOString(), reason: signal.reason };
      signalHistory.unshift(ns);
      data.lockedSignal = { ...ns };
      stats.total++; stats.pending++;
      if (signalHistory.length > 100) signalHistory.pop();
      console.log(`💎 SEÑAL #${ns.id} | ${config.name} | ${signal.action} | ${signal.model} | ${signal.score}%`);
    }
  }
}

// =============================================
// API
// =============================================
app.get('/', (req, res) => res.json({ name: 'Trading Master Pro', version: '12.4', ai: 'Marcus - SMC Mentor', connected: isConnected }));

app.get('/api/dashboard', (req, res) => {
  res.json({
    connected: isConnected, timestamp: new Date().toISOString(),
    assets: Object.entries(assetData).map(([symbol, data]) => ({ symbol, ...ASSETS[symbol], timeframe: 'M5', price: data.price, signal: data.signal, lockedSignal: data.lockedSignal, demandZones: data.demandZones?.length || 0, supplyZones: data.supplyZones?.length || 0, fvgZones: data.fvgZones?.length || 0, liquidityLevels: data.liquidityLevels?.length || 0, structureAlert: data.structureAlert })),
    recentSignals: signalHistory.slice(0, 30), stats, learning: stats.learning
  });
});

app.get('/api/analyze/:symbol', (req, res) => {
  const data = assetData[req.params.symbol];
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json({ symbol: req.params.symbol, ...ASSETS[req.params.symbol], price: data.price, signal: data.signal, lockedSignal: data.lockedSignal, candles: data.candles.slice(-100), demandZones: data.demandZones, supplyZones: data.supplyZones, structureAlert: data.structureAlert });
});

app.get('/api/signals', (req, res) => res.json({ signals: signalHistory, stats }));

app.put('/api/signals/:id', (req, res) => {
  const signal = signalHistory.find(s => s.id === +req.params.id);
  if (!signal) return res.status(404).json({ error: 'Not found' });
  closeSignal(signal.id, req.body.status, 'MANUAL', signal.symbol);
  res.json({ success: true, signal, stats });
});

// CHAT CON MARCUS
app.post('/api/ai/chat', (req, res) => {
  const { question, symbol } = req.body;
  const response = Marcus.chat(question || '', symbol || 'stpRNG');
  res.json(response);
});

// =============================================
// INICIO
// =============================================
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║       TRADING MASTER PRO v12.4 - MARCUS AI TRADER             ║
╠═══════════════════════════════════════════════════════════════╣
║  🤖 Marcus - Tu mentor SMC profesional                        ║
║  📊 Análisis en tiempo real del gráfico                       ║
║  📚 Educación completa de conceptos SMC                       ║
║  🎯 6 modelos de trading institucional                        ║
║  💬 Chat humanizado que enseña y capacita                     ║
╠═══════════════════════════════════════════════════════════════╣
║  Puerto: ${PORT}                                                   ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  connectDeriv();
  setInterval(() => { if (derivWs?.readyState === WebSocket.OPEN) { derivWs.send(JSON.stringify({ ping: 1 })); for (const s of Object.keys(ASSETS)) derivWs.send(JSON.stringify({ ticks_history: s, count: 50, end: 'latest', granularity: GRANULARITY_H1, style: 'candles', req_id: `h1_${s}` })); } }, 300000);
});

export default app;
