// =============================================
// TRADING MASTER PRO v14.6
// BACKEND COMPLETO - TELEGRAM + HORARIOS FOREX
// =============================================

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// =============================================
// CONFIGURACIÓN
// =============================================
const DERIV_APP_ID = process.env.DERIV_APP_ID || '67347';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7749268073:AAGcUxq2Pea0pyoIqmqb7kUgif0bpPe8oZQ';
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || '-1003581375831';

// =============================================
// ACTIVOS - SÍMBOLOS CORRECTOS DE DERIV
// =============================================
const ASSETS = {
  // SINTÉTICOS 24/7 (estos siempre funcionan)
  'R_75': { 
    name: 'Volatility 75', 
    shortName: 'V75',
    emoji: '🔥',
    decimals: 4,
    pip: 0.0001,
    type: 'synthetic',
    alwaysActive: true
  },
  'BOOM1000': { 
    name: 'Boom 1000', 
    shortName: 'Boom',
    emoji: '💣',
    decimals: 2,
    pip: 0.01,
    type: 'synthetic',
    alwaysActive: true
  },
  // FOREX - Solo Lun-Vie 7am-12pm Colombia
  'frxXAUUSD': { 
    name: 'Oro (XAU/USD)', 
    shortName: 'XAU',
    emoji: '🥇',
    decimals: 2,
    pip: 0.01,
    type: 'forex',
    alwaysActive: false
  },
  'frxGBPUSD': { 
    name: 'GBP/USD', 
    shortName: 'GBP',
    emoji: '💷',
    decimals: 5,
    pip: 0.0001,
    type: 'forex',
    alwaysActive: false
  }
};

// =============================================
// ESTADO GLOBAL
// =============================================
let derivWs = null;
let isConnected = false;
let reconnectAttempts = 0;
let pingInterval = null;

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
    structure: { trend: 'NEUTRAL', strength: 0 },
    choch: null,
    bos: null,
    orderFlow: { momentum: 'NEUTRAL', strength: 0 },
    structureH1: { trend: 'LOADING', strength: 0 },
    demandZonesH1: [],
    supplyZonesH1: [],
    premiumDiscount: 'EQUILIBRIUM',
    h1Loaded: false
  };
}

let signalHistory = [];
let signalIdCounter = 1;

const stats = {
  total: 0, wins: 0, losses: 0, pending: 0,
  tp1Hits: 0, tp2Hits: 0, tp3Hits: 0,
  byModel: {}, byAsset: {}, 
  learning: { scoreAdjustments: {} }
};

for (const symbol of Object.keys(ASSETS)) {
  stats.byAsset[symbol] = { wins: 0, losses: 0, total: 0 };
}

// =============================================
// FUNCIONES DE HORARIO
// =============================================
function isForexTradingHours() {
  const now = new Date();
  const colombiaOffset = -5 * 60;
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const colombiaTime = new Date(utc + (colombiaOffset * 60000));
  
  const day = colombiaTime.getDay();
  const hour = colombiaTime.getHours();
  
  // Solo Lunes a Viernes
  if (day === 0 || day === 6) return false;
  
  // Solo 7am a 12pm Colombia
  return hour >= 7 && hour < 12;
}

function getForexStatus() {
  const now = new Date();
  const colombiaOffset = -5 * 60;
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const colombiaTime = new Date(utc + (colombiaOffset * 60000));
  
  const day = colombiaTime.getDay();
  const hour = colombiaTime.getHours();
  const isWeekend = day === 0 || day === 6;
  
  if (isWeekend) {
    return { active: false, message: 'Cerrado (fin de semana)' };
  }
  
  if (hour < 7) {
    return { active: false, message: `Abre a las 7:00 AM (${7 - hour}h)` };
  }
  
  if (hour >= 12) {
    return { active: false, message: 'Cerrado hasta mañana 7:00 AM' };
  }
  
  return { active: true, message: `Activo hasta 12:00 PM (${12 - hour}h)` };
}

// =============================================
// TELEGRAM
// =============================================
async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) return;
  
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHANNEL_ID,
        text: text,
        parse_mode: 'HTML'
      })
    });
    
    if (!response.ok) {
      console.error('❌ Telegram error:', await response.text());
    }
  } catch (error) {
    console.error('❌ Telegram error:', error.message);
  }
}

function formatSignalMessage(signal, asset) {
  const arrow = signal.action === 'LONG' ? '🟢 COMPRA' : '🔴 VENTA';
  
  return `
${arrow} <b>${asset.name}</b>

📊 Modelo: ${signal.model}
💪 Score: ${signal.score}%

📍 Entry: ${signal.entry}
🛑 Stop Loss: ${signal.stop}
🎯 TP1: ${signal.tp1}
🎯 TP2: ${signal.tp2}
🎯 TP3: ${signal.tp3}

⏰ ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}

#TradingMasterPro #${asset.shortName}
`;
}

// =============================================
// MOTOR SMC
// =============================================
const SMC = {
  
  getAvgRange(candles, period = 14) {
    const recent = candles.slice(-period);
    if (!recent.length) return 0;
    return recent.reduce((sum, c) => sum + (c.high - c.low), 0) / recent.length;
  },

  findSwings(candles, lookback = 3) {
    const swings = [];
    if (candles.length < lookback * 2 + 1) return swings;
    
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

  analyzeStructure(swings) {
    if (swings.length < 4) return { trend: 'NEUTRAL', strength: 0 };
    
    const recent = swings.slice(-8);
    const highs = recent.filter(s => s.type === 'high');
    const lows = recent.filter(s => s.type === 'low');
    
    if (highs.length < 2 || lows.length < 2) return { trend: 'NEUTRAL', strength: 0 };
    
    let hh = 0, hl = 0, lh = 0, ll = 0;
    
    for (let i = 1; i < highs.length; i++) {
      if (highs[i].price > highs[i-1].price) hh++;
      else if (highs[i].price < highs[i-1].price) lh++;
    }
    
    for (let i = 1; i < lows.length; i++) {
      if (lows[i].price > lows[i-1].price) hl++;
      else if (lows[i].price < lows[i-1].price) ll++;
    }
    
    const bullScore = hh + hl;
    const bearScore = lh + ll;
    
    if (bullScore >= 2 && bullScore > bearScore) {
      return { trend: 'BULLISH', strength: Math.min(100, bullScore * 25), hh, hl };
    }
    if (bearScore >= 2 && bearScore > bullScore) {
      return { trend: 'BEARISH', strength: Math.min(100, bearScore * 25), lh, ll };
    }
    
    return { trend: 'NEUTRAL', strength: 0 };
  },

  getPremiumDiscount(candles, swings) {
    if (candles.length < 20 || swings.length < 2) return 'EQUILIBRIUM';
    
    const highs = swings.filter(s => s.type === 'high').slice(-5);
    const lows = swings.filter(s => s.type === 'low').slice(-5);
    
    if (!highs.length || !lows.length) return 'EQUILIBRIUM';
    
    const rangeHigh = Math.max(...highs.map(h => h.price));
    const rangeLow = Math.min(...lows.map(l => l.price));
    const range = rangeHigh - rangeLow;
    
    if (range === 0) return 'EQUILIBRIUM';
    
    const price = candles[candles.length - 1].close;
    const position = (price - rangeLow) / range;
    
    if (position > 0.7) return 'PREMIUM';
    if (position < 0.3) return 'DISCOUNT';
    return 'EQUILIBRIUM';
  },

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
      
      if (curr.close < curr.open) {
        const bullMove = Math.max(next1.close, next2.close) - curr.high;
        if (bullMove > avgRange * 0.5) {
          const exists = demandZones.some(z => Math.abs(z.mid - curr.low) < avgRange * 0.5);
          if (!exists) {
            demandZones.push({
              type: 'DEMAND',
              high: Math.max(curr.open, curr.close),
              low: curr.low,
              mid: (curr.open + curr.low) / 2,
              index: i,
              strength: bullMove > avgRange ? 'STRONG' : 'NORMAL',
              tested: false
            });
          }
        }
      }
      
      if (curr.close > curr.open) {
        const bearMove = curr.low - Math.min(next1.close, next2.close);
        if (bearMove > avgRange * 0.5) {
          const exists = supplyZones.some(z => Math.abs(z.mid - curr.high) < avgRange * 0.5);
          if (!exists) {
            supplyZones.push({
              type: 'SUPPLY',
              high: curr.high,
              low: Math.min(curr.open, curr.close),
              mid: (curr.high + curr.open) / 2,
              index: i,
              strength: bearMove > avgRange ? 'STRONG' : 'NORMAL',
              tested: false
            });
          }
        }
      }
    }
    
    const lastPrice = candles[candles.length - 1].close;
    const validDemand = demandZones.filter(z => lastPrice > z.low * 0.995).slice(-5);
    const validSupply = supplyZones.filter(z => lastPrice < z.high * 1.005).slice(-5);
    
    return { demandZones: validDemand, supplyZones: validSupply };
  },

  findFVGs(candles) {
    const fvgs = [];
    if (candles.length < 5) return fvgs;
    
    for (let i = 2; i < candles.length; i++) {
      const c1 = candles[i - 2];
      const c2 = candles[i - 1];
      const c3 = candles[i];
      
      if (c2.close > c2.open && c3.low > c1.high) {
        fvgs.push({
          type: 'BULLISH_FVG',
          side: 'BUY',
          high: c3.low,
          low: c1.high,
          mid: (c3.low + c1.high) / 2,
          index: i
        });
      }
      
      if (c2.close < c2.open && c1.low > c3.high) {
        fvgs.push({
          type: 'BEARISH_FVG',
          side: 'SELL',
          high: c1.low,
          low: c3.high,
          mid: (c1.low + c3.high) / 2,
          index: i
        });
      }
    }
    
    return fvgs.slice(-5);
  },

  findLiquidityLevels(swings, avgRange) {
    const levels = [];
    const tolerance = avgRange * 0.2;
    
    const highs = swings.filter(s => s.type === 'high').slice(-8);
    for (let i = 0; i < highs.length; i++) {
      const similar = highs.filter(h => Math.abs(h.price - highs[i].price) < tolerance);
      if (similar.length >= 2) {
        const avgPrice = similar.reduce((s, h) => s + h.price, 0) / similar.length;
        if (!levels.some(l => Math.abs(l.price - avgPrice) < tolerance)) {
          levels.push({ type: 'EQUAL_HIGHS', price: avgPrice, touches: similar.length });
        }
      }
    }
    
    const lows = swings.filter(s => s.type === 'low').slice(-8);
    for (let i = 0; i < lows.length; i++) {
      const similar = lows.filter(l => Math.abs(l.price - lows[i].price) < tolerance);
      if (similar.length >= 2) {
        const avgPrice = similar.reduce((s, l) => s + l.price, 0) / similar.length;
        if (!levels.some(l => Math.abs(l.price - avgPrice) < tolerance)) {
          levels.push({ type: 'EQUAL_LOWS', price: avgPrice, touches: similar.length });
        }
      }
    }
    
    return levels;
  },

  detectCHoCH(candles, swings) {
    if (swings.length < 4 || candles.length < 10) return null;
    
    const highs = swings.filter(s => s.type === 'high').slice(-4);
    const lows = swings.filter(s => s.type === 'low').slice(-4);
    const lastPrice = candles[candles.length - 1].close;
    
    if (lows.length >= 2 && highs.length >= 1) {
      const wasDown = lows[lows.length - 1].price < lows[lows.length - 2].price;
      const targetHigh = highs[highs.length - 1];
      
      if (wasDown && lastPrice > targetHigh.price) {
        return { type: 'BULLISH_CHOCH', side: 'BUY', level: targetHigh.price };
      }
    }
    
    if (highs.length >= 2 && lows.length >= 1) {
      const wasUp = highs[highs.length - 1].price > highs[highs.length - 2].price;
      const targetLow = lows[lows.length - 1];
      
      if (wasUp && lastPrice < targetLow.price) {
        return { type: 'BEARISH_CHOCH', side: 'SELL', level: targetLow.price };
      }
    }
    
    return null;
  },

  detectBOS(candles, swings, structure) {
    if (swings.length < 3 || candles.length < 5) return null;
    
    const lastPrice = candles[candles.length - 1].close;
    
    if (structure.trend === 'BULLISH') {
      const highs = swings.filter(s => s.type === 'high').slice(-2);
      if (highs.length >= 1 && lastPrice > highs[highs.length - 1].price) {
        return { type: 'BULLISH_BOS', side: 'BUY', level: highs[highs.length - 1].price };
      }
    }
    
    if (structure.trend === 'BEARISH') {
      const lows = swings.filter(s => s.type === 'low').slice(-2);
      if (lows.length >= 1 && lastPrice < lows[lows.length - 1].price) {
        return { type: 'BEARISH_BOS', side: 'SELL', level: lows[lows.length - 1].price };
      }
    }
    
    return null;
  },

  analyzeOrderFlow(candles) {
    if (candles.length < 10) return { momentum: 'NEUTRAL', strength: 0 };
    
    const last10 = candles.slice(-10);
    const bullish = last10.filter(c => c.close > c.open);
    const bearish = last10.filter(c => c.close < c.open);
    
    const bullVol = bullish.reduce((s, c) => s + Math.abs(c.close - c.open), 0);
    const bearVol = bearish.reduce((s, c) => s + Math.abs(c.close - c.open), 0);
    
    const ratio = bullVol / (bearVol || 0.001);
    
    if (ratio > 1.5) return { momentum: 'BULLISH', strength: Math.min(100, ratio * 30), bullCount: bullish.length };
    if (ratio < 0.67) return { momentum: 'BEARISH', strength: Math.min(100, (1/ratio) * 30), bearCount: bearish.length };
    
    return { momentum: 'NEUTRAL', strength: 50 };
  },

  detectPullback(candles, demandZones, supplyZones, config) {
    if (candles.length < 5) return null;
    
    const last = candles[candles.length - 1];
    const price = last.close;
    const avgRange = this.getAvgRange(candles);
    
    for (const zone of demandZones) {
      const inZone = price >= zone.low && price <= zone.high * 1.01;
      const touched = last.low <= zone.high * 1.002;
      
      const bullishCandle = last.close > last.open;
      const rejection = last.low <= zone.high && last.close > zone.mid;
      
      if ((inZone || touched) && bullishCandle && rejection) {
        const entry = Math.max(price, zone.high);
        const stop = zone.low - avgRange * 0.3;
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
            tp3: +(entry + risk * 3).toFixed(config.decimals)
          };
        }
      }
    }
    
    for (const zone of supplyZones) {
      const inZone = price >= zone.low * 0.99 && price <= zone.high;
      const touched = last.high >= zone.low * 0.998;
      
      const bearishCandle = last.close < last.open;
      const rejection = last.high >= zone.low && last.close < zone.mid;
      
      if ((inZone || touched) && bearishCandle && rejection) {
        const entry = Math.min(price, zone.low);
        const stop = zone.high + avgRange * 0.3;
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
            tp3: +(entry - risk * 3).toFixed(config.decimals)
          };
        }
      }
    }
    
    return null;
  },

  analyze(candlesM5, candlesH1, config, state) {
    if (candlesM5.length < 30) {
      return { action: 'LOADING', score: 0, model: 'LOADING', reason: 'Cargando datos M5...' };
    }
    
    const swingsM5 = this.findSwings(candlesM5, 3);
    const structureM5 = this.analyzeStructure(swingsM5);
    const { demandZones, supplyZones } = this.findZones(candlesM5);
    const fvgZones = this.findFVGs(candlesM5);
    const avgRange = this.getAvgRange(candlesM5);
    const liquidityLevels = this.findLiquidityLevels(swingsM5, avgRange);
    const orderFlow = this.analyzeOrderFlow(candlesM5);
    const choch = this.detectCHoCH(candlesM5, swingsM5);
    const bos = this.detectBOS(candlesM5, swingsM5, structureM5);
    const pullback = this.detectPullback(candlesM5, demandZones, supplyZones, config);
    
    state.swings = swingsM5.slice(-10);
    state.structure = structureM5;
    state.demandZones = demandZones;
    state.supplyZones = supplyZones;
    state.fvgZones = fvgZones;
    state.liquidityLevels = liquidityLevels;
    state.orderFlow = orderFlow;
    state.choch = choch;
    state.bos = bos;
    
    let structureH1 = { trend: 'LOADING', strength: 0 };
    let demandZonesH1 = [];
    let supplyZonesH1 = [];
    let premiumDiscount = 'EQUILIBRIUM';
    let h1Loaded = false;
    
    if (candlesH1 && candlesH1.length >= 20) {
      h1Loaded = true;
      const swingsH1 = this.findSwings(candlesH1, 2);
      structureH1 = this.analyzeStructure(swingsH1);
      const zonesH1 = this.findZones(candlesH1);
      demandZonesH1 = zonesH1.demandZones;
      supplyZonesH1 = zonesH1.supplyZones;
      premiumDiscount = this.getPremiumDiscount(candlesH1, swingsH1);
    }
    
    state.structureH1 = structureH1;
    state.demandZonesH1 = demandZonesH1;
    state.supplyZonesH1 = supplyZonesH1;
    state.premiumDiscount = premiumDiscount;
    state.h1Loaded = h1Loaded;
    
    const mtfConfluence = h1Loaded && 
                          structureH1.trend === structureM5.trend && 
                          structureH1.trend !== 'NEUTRAL';
    
    state.mtfConfluence = mtfConfluence;
    
    const signals = [];
    const minScore = 60;
    
    if (mtfConfluence && pullback) {
      const sideMatch = (structureH1.trend === 'BULLISH' && pullback.side === 'BUY') ||
                        (structureH1.trend === 'BEARISH' && pullback.side === 'SELL');
      
      let pdBonus = 0;
      if (pullback.side === 'BUY' && premiumDiscount === 'DISCOUNT') pdBonus = 5;
      if (pullback.side === 'SELL' && premiumDiscount === 'PREMIUM') pdBonus = 5;
      
      if (sideMatch) {
        signals.push({
          model: 'MTF_CONFLUENCE',
          baseScore: 95 + pdBonus,
          pullback,
          reason: `H1+M5 ${structureH1.trend} + Pullback${pdBonus ? ' + ' + premiumDiscount : ''}`
        });
      }
    }
    
    if (choch && pullback && choch.side === pullback.side) {
      signals.push({
        model: 'CHOCH_PULLBACK',
        baseScore: 90,
        pullback,
        reason: `${choch.type} + Pullback`
      });
    }
    
    const last3 = candlesM5.slice(-3);
    for (const level of liquidityLevels) {
      const swept = last3.some(c => {
        if (level.type === 'EQUAL_HIGHS') return c.high > level.price && c.close < level.price;
        if (level.type === 'EQUAL_LOWS') return c.low < level.price && c.close > level.price;
        return false;
      });
      
      if (swept && pullback) {
        const side = level.type === 'EQUAL_HIGHS' ? 'SELL' : 'BUY';
        if (pullback.side === side) {
          signals.push({
            model: 'LIQUIDITY_SWEEP',
            baseScore: 85,
            pullback,
            reason: `Sweep ${level.type}`
          });
        }
      }
    }
    
    if (bos && pullback && bos.side === pullback.side) {
      signals.push({
        model: 'BOS_CONTINUATION',
        baseScore: 80,
        pullback,
        reason: `${bos.type} + Pullback`
      });
    }
    
    const price = candlesM5[candlesM5.length - 1].close;
    for (const fvg of fvgZones) {
      const inFVG = price >= fvg.low * 0.999 && price <= fvg.high * 1.001;
      if (inFVG && pullback && fvg.side === pullback.side) {
        signals.push({
          model: 'FVG_ENTRY',
          baseScore: 75,
          pullback,
          reason: `En ${fvg.type}`
        });
      }
    }
    
    if (orderFlow.momentum !== 'NEUTRAL' && orderFlow.strength >= 50 && pullback) {
      const flowMatch = (orderFlow.momentum === 'BULLISH' && pullback.side === 'BUY') ||
                        (orderFlow.momentum === 'BEARISH' && pullback.side === 'SELL');
      
      const h1Supports = !h1Loaded || structureH1.trend === orderFlow.momentum || structureH1.trend === 'NEUTRAL';
      
      if (flowMatch && h1Supports) {
        signals.push({
          model: 'ORDER_FLOW',
          baseScore: 70,
          pullback,
          reason: `Flow ${orderFlow.momentum} (${orderFlow.strength.toFixed(0)}%)`
        });
      }
    }
    
    if (signals.length === 0) {
      let reason = 'Esperando setup';
      if (!pullback) reason = 'Sin pullback a zona';
      else if (structureM5.trend === 'NEUTRAL') reason = 'Estructura M5 neutral';
      
      return {
        action: 'WAIT',
        score: Math.round(Math.max(structureM5.strength, orderFlow.strength) * 0.5),
        model: 'WAIT',
        reason,
        analysis: {
          structureM5: structureM5.trend,
          structureH1: structureH1.trend,
          mtfConfluence,
          premiumDiscount,
          orderFlow: orderFlow.momentum,
          demandZones: demandZones.length,
          supplyZones: supplyZones.length,
          choch: choch?.type,
          bos: bos?.type
        }
      };
    }
    
    signals.sort((a, b) => b.baseScore - a.baseScore);
    const best = signals[0];
    
    const adj = stats.learning.scoreAdjustments[best.model] || 0;
    const finalScore = Math.min(100, Math.max(0, best.baseScore + adj));
    
    if (finalScore < minScore) {
      return {
        action: 'WAIT',
        score: finalScore,
        model: best.model,
        reason: `Score ${finalScore}% < ${minScore}% min`,
        analysis: {
          structureM5: structureM5.trend,
          structureH1: structureH1.trend,
          mtfConfluence,
          premiumDiscount
        }
      };
    }
    
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
        structureM5: structureM5.trend,
        structureH1: structureH1.trend,
        mtfConfluence,
        premiumDiscount,
        orderFlow: orderFlow.momentum
      }
    };
  }
};

// =============================================
// ELISA IA
// =============================================
const Elisa = {
  getContext(symbol) {
    const data = assetData[symbol];
    const config = ASSETS[symbol];
    if (!data || !config) return null;
    
    return {
      symbol,
      name: config.name,
      shortName: config.shortName,
      emoji: config.emoji,
      price: data.price,
      decimals: config.decimals,
      structureM5: data.structure?.trend || 'LOADING',
      structureH1: data.structureH1?.trend || 'LOADING',
      h1Loaded: data.h1Loaded,
      mtfConfluence: data.mtfConfluence,
      premiumDiscount: data.premiumDiscount,
      orderFlow: data.orderFlow,
      demandZones: data.demandZones || [],
      supplyZones: data.supplyZones || [],
      lockedSignal: data.lockedSignal,
      signal: data.signal
    };
  },

  chat(question, symbol) {
    const ctx = this.getContext(symbol);
    if (!ctx) return { answer: "⏳ Conectándome al mercado...", type: 'loading' };
    
    const q = (question || '').toLowerCase().trim();
    
    if (!q || q === 'hola') {
      let r = `¡Hola! 💜 Soy Elisa, tu asistente de trading.\n\n`;
      r += `Estoy viendo **${ctx.emoji} ${ctx.name}**\n`;
      r += `💵 Precio: **${ctx.price?.toFixed(ctx.decimals) || '---'}**\n\n`;
      r += `¿Qué quieres saber?\n`;
      r += `• "análisis" - Estado del gráfico\n`;
      r += `• "plan" - Qué operación buscar\n`;
      r += `• "zonas" - Zonas de entrada`;
      return { answer: r, type: 'greeting' };
    }

    if (q.includes('analisis') || q.includes('que ves')) {
      let r = `📊 **Análisis de ${ctx.name}**\n\n`;
      r += `💵 Precio: ${ctx.price?.toFixed(ctx.decimals)}\n\n`;
      r += `**📈 ESTRUCTURA:**\n`;
      r += `• M5: ${ctx.structureM5}\n`;
      r += `• H1: ${ctx.structureH1}\n`;
      if (ctx.mtfConfluence) r += `\n✨ **¡CONFLUENCIA MTF!**\n`;
      r += `\n**📦 ZONAS:**\n`;
      r += `• ${ctx.demandZones.length} demanda\n`;
      r += `• ${ctx.supplyZones.length} oferta`;
      return { answer: r, type: 'analysis' };
    }

    if (q.includes('plan') || q.includes('buscar')) {
      let r = `🎯 **Plan para ${ctx.name}**\n\n`;
      if (ctx.mtfConfluence) {
        const side = ctx.structureH1 === 'BULLISH' ? 'COMPRAS' : 'VENTAS';
        r += `✅ Buscar **${side}**\n`;
        r += `Confluencia MTF activa.`;
      } else {
        r += `⚠️ Esperar confluencia\n`;
        r += `M5: ${ctx.structureM5} | H1: ${ctx.structureH1}`;
      }
      return { answer: r, type: 'plan' };
    }

    if (q.includes('zona')) {
      let r = `📦 **Zonas en ${ctx.name}**\n\n`;
      r += `🟢 Demanda: ${ctx.demandZones.length}\n`;
      r += `🔴 Oferta: ${ctx.supplyZones.length}`;
      return { answer: r, type: 'zones' };
    }

    return { 
      answer: `${ctx.emoji} ${ctx.name} @ ${ctx.price?.toFixed(ctx.decimals)}\n\nPregúntame: análisis, plan, zonas`, 
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
    
    // Trailing Stop
    if (signal.tp1Hit && !signal.trailingTP1) {
      signal.trailingTP1 = true;
      signal.stop = signal.entry;
      locked.stop = signal.entry;
      locked.trailingActive = true;
      console.log(`🔄 TRAILING #${signal.id}: SL → Entry`);
    }
    
    if (signal.tp2Hit && !signal.trailingTP2) {
      signal.trailingTP2 = true;
      signal.stop = signal.tp1;
      locked.stop = signal.tp1;
      console.log(`🔄 TRAILING #${signal.id}: SL → TP1`);
    }
    
    // Check SL
    if ((isLong && price <= signal.stop) || (!isLong && price >= signal.stop)) {
      if (signal.tp1Hit) {
        closeSignal(signal.id, 'WIN', symbol);
      } else {
        closeSignal(signal.id, 'LOSS', symbol);
      }
      continue;
    }
    
    // Check TPs
    if (isLong) {
      if (price >= locked.tp1 && !signal.tp1Hit) { signal.tp1Hit = locked.tp1Hit = true; stats.tp1Hits++; }
      if (price >= locked.tp2 && !signal.tp2Hit) { signal.tp2Hit = locked.tp2Hit = true; stats.tp2Hits++; }
      if (price >= locked.tp3 && !signal.tp3Hit) { signal.tp3Hit = locked.tp3Hit = true; stats.tp3Hits++; closeSignal(signal.id, 'WIN', symbol); }
    } else {
      if (price <= locked.tp1 && !signal.tp1Hit) { signal.tp1Hit = locked.tp1Hit = true; stats.tp1Hits++; }
      if (price <= locked.tp2 && !signal.tp2Hit) { signal.tp2Hit = locked.tp2Hit = true; stats.tp2Hits++; }
      if (price <= locked.tp3 && !signal.tp3Hit) { signal.tp3Hit = locked.tp3Hit = true; stats.tp3Hits++; closeSignal(signal.id, 'WIN', symbol); }
    }
  }
}

function closeSignal(id, status, symbol) {
  const signal = signalHistory.find(s => s.id === id);
  if (!signal || signal.status !== 'PENDING') return;
  
  signal.status = status;
  signal.closedAt = new Date().toISOString();
  
  if (symbol && assetData[symbol]) assetData[symbol].lockedSignal = null;
  
  stats.byModel[signal.model] = stats.byModel[signal.model] || { wins: 0, losses: 0 };
  stats.byAsset[signal.symbol] = stats.byAsset[signal.symbol] || { wins: 0, losses: 0, total: 0 };
  
  if (status === 'WIN') {
    stats.wins++;
    stats.byModel[signal.model].wins++;
    stats.byAsset[signal.symbol].wins++;
  } else if (status === 'LOSS') {
    stats.losses++;
    stats.byModel[signal.model].losses++;
    stats.byAsset[signal.symbol].losses++;
  }
  
  stats.pending = signalHistory.filter(s => s.status === 'PENDING').length;
  console.log(`${status === 'WIN' ? '✅' : '❌'} Señal #${id} cerrada: ${status}`);
}

// =============================================
// CONEXIÓN DERIV
// =============================================
function connectDeriv() {
  console.log(`\n🔌 Conectando a Deriv (APP_ID: ${DERIV_APP_ID})...`);
  
  try {
    derivWs = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`);
  } catch (err) {
    console.error('❌ Error creando WebSocket:', err.message);
    setTimeout(connectDeriv, 5000);
    return;
  }
  
  derivWs.on('open', () => {
    console.log('✅ Conectado a Deriv');
    isConnected = true;
    reconnectAttempts = 0;
    
    // Ping para mantener conexión
    pingInterval = setInterval(() => {
      if (derivWs && derivWs.readyState === WebSocket.OPEN) {
        derivWs.send(JSON.stringify({ ping: 1 }));
      }
    }, 30000);
    
    // Suscribir a cada activo
    const symbols = Object.keys(ASSETS);
    let delay = 0;
    
    symbols.forEach((symbol) => {
      const asset = ASSETS[symbol];
      
      // Verificar si es forex en fin de semana
      if (!asset.alwaysActive && !isForexTradingHours()) {
        console.log(`⏸️ ${asset.shortName}: ${getForexStatus().message}`);
        return;
      }
      
      // M5
      setTimeout(() => {
        if (derivWs && derivWs.readyState === WebSocket.OPEN) {
          console.log(`📡 Suscribiendo M5: ${asset.shortName}`);
          derivWs.send(JSON.stringify({
            ticks_history: symbol,
            adjust_start_time: 1,
            count: 100,
            end: 'latest',
            granularity: 300,
            style: 'candles',
            subscribe: 1
          }));
        }
      }, delay);
      
      // H1
      setTimeout(() => {
        if (derivWs && derivWs.readyState === WebSocket.OPEN) {
          console.log(`📡 Suscribiendo H1: ${asset.shortName}`);
          derivWs.send(JSON.stringify({
            ticks_history: symbol,
            adjust_start_time: 1,
            count: 50,
            end: 'latest',
            granularity: 3600,
            style: 'candles'
          }));
        }
      }, delay + 500);
      
      // Ticks
      setTimeout(() => {
        if (derivWs && derivWs.readyState === WebSocket.OPEN) {
          derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
        }
      }, delay + 1000);
      
      delay += 1500;
    });
  });
  
  derivWs.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData);
      
      // Ignorar pong
      if (msg.pong) return;
      
      // Log errores
      if (msg.error) {
        const symbol = msg.echo_req?.ticks_history || msg.echo_req?.ticks;
        const asset = ASSETS[symbol];
        if (asset) {
          console.error(`❌ ${asset.shortName}: ${msg.error.message}`);
        }
        return;
      }
      
      // M5 Candles
      if (msg.candles && msg.echo_req?.granularity === 300) {
        const symbol = msg.echo_req.ticks_history;
        if (assetData[symbol]) {
          assetData[symbol].candles = msg.candles.map(c => ({
            time: c.epoch * 1000,
            open: +c.open,
            high: +c.high,
            low: +c.low,
            close: +c.close
          }));
          console.log(`📊 M5 ${ASSETS[symbol]?.shortName}: ${assetData[symbol].candles.length} velas`);
          analyzeAsset(symbol);
        }
      }
      
      // H1 Candles
      if (msg.candles && msg.echo_req?.granularity === 3600) {
        const symbol = msg.echo_req.ticks_history;
        if (assetData[symbol]) {
          assetData[symbol].candlesH1 = msg.candles.map(c => ({
            time: c.epoch * 1000,
            open: +c.open,
            high: +c.high,
            low: +c.low,
            close: +c.close
          }));
          assetData[symbol].h1Loaded = true;
          console.log(`📊 H1 ${ASSETS[symbol]?.shortName}: ${assetData[symbol].candlesH1.length} velas`);
          analyzeAsset(symbol);
        }
      }
      
      // OHLC updates
      if (msg.ohlc && msg.ohlc.granularity === 300) {
        const symbol = msg.ohlc.symbol;
        if (assetData[symbol]) {
          const newCandle = {
            time: msg.ohlc.open_time * 1000,
            open: +msg.ohlc.open,
            high: +msg.ohlc.high,
            low: +msg.ohlc.low,
            close: +msg.ohlc.close
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
      
      // Tick updates
      if (msg.tick) {
        const symbol = msg.tick.symbol;
        if (assetData[symbol]) {
          assetData[symbol].price = +msg.tick.quote;
          checkSignalHits();
        }
      }
      
    } catch (err) {
      // Ignore parse errors
    }
  });
  
  derivWs.on('close', (code, reason) => {
    console.log(`❌ Desconectado de Deriv (code: ${code})`);
    isConnected = false;
    
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    
    reconnectAttempts++;
    const delay = Math.min(5000 * reconnectAttempts, 30000);
    console.log(`🔄 Reconectando en ${delay/1000}s...`);
    setTimeout(connectDeriv, delay);
  });
  
  derivWs.on('error', (err) => {
    console.error('❌ WebSocket error:', err.message);
  });
}

function analyzeAsset(symbol) {
  const data = assetData[symbol];
  const config = ASSETS[symbol];
  
  if (!data || !config || data.candles.length < 30) return;
  
  // Verificar horario para forex
  if (!config.alwaysActive && !isForexTradingHours()) return;
  
  const now = Date.now();
  if (now - data.lastAnalysis < 2000) return;
  data.lastAnalysis = now;
  
  const signal = SMC.analyze(data.candles, data.candlesH1, config, data);
  data.signal = signal;
  
  if (data.lockedSignal) return;
  
  if (signal.action !== 'WAIT' && signal.action !== 'LOADING' && signal.score >= 60) {
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
        trailingTP1: false,
        trailingTP2: false,
        trailingActive: false,
        status: 'PENDING',
        timestamp: new Date().toISOString(),
        reason: signal.reason
      };
      
      signalHistory.unshift(newSignal);
      data.lockedSignal = { ...newSignal };
      stats.total++;
      stats.pending++;
      
      if (signalHistory.length > 100) signalHistory.pop();
      
      console.log(`💎 SEÑAL #${newSignal.id} | ${config.shortName} | ${signal.action} | ${signal.model} | ${signal.score}%`);
      
      // Enviar a Telegram
      sendTelegramMessage(formatSignalMessage(newSignal, config));
    }
  }
}

// =============================================
// API ENDPOINTS
// =============================================
app.get('/', (req, res) => {
  res.json({ 
    name: 'Trading Master Pro', 
    version: '14.6', 
    connected: isConnected,
    telegram: !!TELEGRAM_BOT_TOKEN,
    forexStatus: getForexStatus()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '14.6',
    wsConnected: isConnected,
    telegram: !!TELEGRAM_BOT_TOKEN,
    forexStatus: getForexStatus(),
    assets: Object.keys(ASSETS).length,
    activeSignals: signalHistory.filter(s => s.status === 'PENDING').length
  });
});

app.get('/api/dashboard', (req, res) => {
  res.json({
    connected: isConnected,
    timestamp: Date.now(),
    forexStatus: getForexStatus(),
    assets: Object.entries(assetData).map(([symbol, data]) => ({
      symbol,
      ...ASSETS[symbol],
      price: data.price,
      signal: data.signal,
      lockedSignal: data.lockedSignal,
      structureM5: data.structure?.trend || 'LOADING',
      structureH1: data.structureH1?.trend || 'LOADING',
      h1Loaded: data.h1Loaded || false,
      mtfConfluence: data.mtfConfluence || false,
      premiumDiscount: data.premiumDiscount || 'EQUILIBRIUM',
      demandZones: data.demandZones?.length || 0,
      supplyZones: data.supplyZones?.length || 0,
      fvgZones: data.fvgZones?.length || 0
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
  
  if (!data || !config) return res.status(404).json({ error: 'Not found' });
  
  res.json({
    symbol,
    ...config,
    price: data.price,
    signal: data.signal,
    lockedSignal: data.lockedSignal,
    candles: data.candles.slice(-100),
    candlesH1: data.candlesH1?.slice(-50) || [],
    demandZones: data.demandZones || [],
    supplyZones: data.supplyZones || [],
    demandZonesH1: data.demandZonesH1 || [],
    supplyZonesH1: data.supplyZonesH1 || [],
    structureM5: data.structure?.trend,
    structureH1: data.structureH1?.trend,
    h1Loaded: data.h1Loaded,
    mtfConfluence: data.mtfConfluence,
    premiumDiscount: data.premiumDiscount
  });
});

app.get('/api/signals', (req, res) => res.json({ signals: signalHistory, stats }));

app.put('/api/signals/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const signal = signalHistory.find(s => s.id === id);
  if (!signal) return res.status(404).json({ error: 'Not found' });
  closeSignal(id, req.body.status, signal.symbol);
  res.json({ success: true, signal, stats });
});

app.post('/api/ai/chat', (req, res) => {
  const { question, symbol } = req.body;
  res.json(Elisa.chat(question || '', symbol || 'R_75'));
});

app.get('/api/telegram/test', async (req, res) => {
  try {
    await sendTelegramMessage('🧪 Test de conexión Trading Master Pro v14.6');
    res.json({ success: true, message: 'Mensaje enviado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// INICIO
// =============================================
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║     TRADING MASTER PRO v14.6                 ║
║     Telegram + Horarios Forex                ║
╠══════════════════════════════════════════════╣
║  Puerto: ${PORT}                                 ║
║  📱 Telegram: ${TELEGRAM_BOT_TOKEN ? '✅' : '❌'}                           ║
║  📊 Activos: ${Object.keys(ASSETS).length}                                ║
║  ⏰ Forex: ${getForexStatus().message}
╚══════════════════════════════════════════════╝
  `);
  
  connectDeriv();
  
  // Actualizar H1 cada 2 minutos
  setInterval(() => {
    if (derivWs?.readyState === WebSocket.OPEN) {
      for (const symbol of Object.keys(ASSETS)) {
        const asset = ASSETS[symbol];
        if (asset.alwaysActive || isForexTradingHours()) {
          derivWs.send(JSON.stringify({
            ticks_history: symbol,
            adjust_start_time: 1,
            count: 50,
            end: 'latest',
            granularity: 3600,
            style: 'candles'
          }));
        }
      }
    }
  }, 120000);
});

module.exports = app;
