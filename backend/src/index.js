// =============================================
// TRADING MASTER PRO - BACKEND v7.4
// SMC AJUSTADO + PSICOTRADING COMPLETO
// =============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

console.log('\n🔧 TRADING MASTER PRO v7.4');
console.log('═══════════════════════════════════════');
console.log('SMC AJUSTADO + PSICOTRADING COMPLETO');
console.log('═══════════════════════════════════════');

// =============================================
// CONFIGURACIÓN
// =============================================
let supabase = null;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✅ Supabase conectado');
}

let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log('✅ OpenAI conectado');
} else {
  console.log('⚠️ OpenAI NO configurado');
}

const DERIV_APP_ID = process.env.DERIV_APP_ID || '117347';
const DERIV_API_TOKEN = process.env.DERIV_API_TOKEN || '';
const DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3';
const WHATSAPP_PHONE = (process.env.WHATSAPP_PHONE || '573203921881').replace('+', '');
const CALLMEBOT_API_KEY = process.env.CALLMEBOT_API_KEY || 'w2VJk5AzEsg3';
const BACKEND_URL = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
  : process.env.BACKEND_URL || 'https://trading-master-pro-production.up.railway.app';

// =============================================
// 🎯 ÍNDICES CON ORO
// =============================================
const SYNTHETIC_INDICES = {
  'stpRNG': { name: 'Step Index', pip: 0.01, type: 'synthetic', emoji: '📊' },
  'R_75': { name: 'Volatility 75', pip: 0.0001, type: 'synthetic', emoji: '📈' },
  'R_100': { name: 'Volatility 100', pip: 0.01, type: 'synthetic', emoji: '📉' },
  'frxXAUUSD': { name: 'Gold/USD', pip: 0.01, type: 'forex', emoji: '🥇' },
};

// =============================================
// 🔧 CONFIGURACIÓN SMC AJUSTADA (MENOS ESTRICTA)
// =============================================
const ASSET_CONFIG = {
  synthetic: {
    tolerance: 0.0005,        // ⬆️ Era 0.0003 - Más tolerante para EQH/EQL
    sweepWindow: 8,           // ⬆️ Era 6 - Más velas para detectar sweep
    maxAge: 30,               // ⬆️ Era 20 - Más tiempo para liquidez válida
    displacementMultiplier: 1.2, // ⬇️ Era 1.5 - Menos exigente
    minSwingDistance: 2,      // ⬇️ Era 3 - Swings más cercanos válidos
  },
  forex: {
    tolerance: 0.0008,        // ⬆️ Era 0.0005
    sweepWindow: 10,          // ⬆️ Era 8
    maxAge: 35,               // ⬆️ Era 25
    displacementMultiplier: 1.1, // ⬇️ Era 1.3
    minSwingDistance: 2,
  }
};

// Score mínimo ajustado
const MIN_SCORE_VALID = 70;      // ⬇️ Era 75
const MIN_SCORE_AUTO = 85;       // ⬇️ Era 90

const TF_HTF = 300;  // 5M
const TF_LTF = 60;   // 1M

// =============================================
// ESTADO EN MEMORIA
// =============================================
let derivWs = null;
let isDerivConnected = false;
let aiEnabled = true;
let lastActivity = Date.now();
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

const candleData = new Map();
const tickData = new Map();
const dailySignals = new Map();
const activeSignals = new Map();
let signalHistory = [];
const usedStructures = new Map();
const analysisCache = new Map();

const tradingStats = {
  totalSignals: 0,
  operatedSignals: 0,
  wins: 0,
  losses: 0,
  skipped: 0,
  streaks: { currentWin: 0, currentLoss: 0, maxWin: 0, maxLoss: 0 },
};

// =============================================
// 💾 PERSISTENCIA EN SUPABASE
// =============================================
const Persistence = {
  async saveCandles(symbol, timeframe, candles) {
    if (!supabase || !candles || candles.length === 0) return;
    try {
      const key = `${symbol}_${timeframe}`;
      await supabase.from('candle_data').upsert({
        key, symbol, timeframe,
        candles: JSON.stringify(candles.slice(-200)),
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });
    } catch (error) {
      console.error('Error guardando velas:', error.message);
    }
  },

  async loadCandles(symbol, timeframe) {
    if (!supabase) return null;
    try {
      const key = `${symbol}_${timeframe}`;
      const { data, error } = await supabase
        .from('candle_data')
        .select('candles, updated_at')
        .eq('key', key)
        .single();
      
      if (error || !data) return null;
      
      const age = (Date.now() - new Date(data.updated_at).getTime()) / 1000 / 60;
      if (age > 30) return null;
      
      console.log(`✅ Cargadas ${key} desde Supabase (${age.toFixed(1)} min)`);
      return JSON.parse(data.candles);
    } catch {
      return null;
    }
  },

  async saveSignal(signal) {
    if (!supabase) return;
    try {
      await supabase.from('signals').upsert({
        id: signal.id,
        symbol: signal.symbol,
        symbol_name: signal.symbolName,
        direction: signal.direction,
        score: signal.scoring?.score,
        classification: signal.scoring?.classification,
        levels: signal.levels,
        sweep_desc: signal.sweep?.description,
        choch_desc: signal.choch?.description,
        ob_desc: signal.orderBlock?.description,
        operated: signal.operated || false,
        result: signal.result,
        notes: signal.notes,
        created_at: signal.createdAt,
        candles_snapshot: JSON.stringify(signal.candles?.htf?.slice(-30) || [])
      }, { onConflict: 'id' });
    } catch (error) {
      console.error('Error guardando señal:', error.message);
    }
  },

  async loadSignalHistory() {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) return [];
      
      return data.map(s => ({
        id: s.id, symbol: s.symbol, symbolName: s.symbol_name,
        direction: s.direction,
        scoring: { score: s.score, classification: s.classification },
        levels: s.levels,
        sweep: { description: s.sweep_desc },
        choch: { description: s.choch_desc },
        orderBlock: { description: s.ob_desc },
        operated: s.operated, result: s.result, notes: s.notes,
        createdAt: s.created_at,
        candles: { htf: JSON.parse(s.candles_snapshot || '[]') }
      }));
    } catch {
      return [];
    }
  },

  async updateSignalTracking(id, operated, result, notes) {
    if (!supabase) return;
    try {
      await supabase.from('signals')
        .update({ operated, result, notes, updated_at: new Date().toISOString() })
        .eq('id', id);
    } catch {}
  },

  async saveState() {
    if (!supabase) return;
    try {
      await supabase.from('app_state').upsert({
        id: 'main_state',
        daily_signals: JSON.stringify(Object.fromEntries(dailySignals)),
        used_structures: JSON.stringify(Object.fromEntries(usedStructures)),
        trading_stats: JSON.stringify(tradingStats),
        ai_enabled: aiEnabled,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    } catch {}
  },

  async loadState() {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('app_state')
        .select('*')
        .eq('id', 'main_state')
        .single();
      
      if (!data) return;
      
      const stateDate = new Date(data.updated_at).toDateString();
      const today = new Date().toDateString();
      
      if (stateDate === today) {
        const ds = JSON.parse(data.daily_signals || '{}');
        Object.entries(ds).forEach(([k, v]) => dailySignals.set(k, v));
        const us = JSON.parse(data.used_structures || '{}');
        Object.entries(us).forEach(([k, v]) => usedStructures.set(k, v));
        aiEnabled = data.ai_enabled;
        console.log('✅ Estado restaurado desde Supabase');
      }
      
      const stats = JSON.parse(data.trading_stats || '{}');
      Object.assign(tradingStats, stats);
    } catch {}
  }
};

// =============================================
// 🔄 KEEP-ALIVE SYSTEM
// =============================================
const KeepAlive = {
  interval: null,
  
  start() {
    this.interval = setInterval(async () => {
      try {
        await fetch(`${BACKEND_URL}/health`);
        console.log(`💓 Keep-alive OK - ${new Date().toLocaleTimeString()}`);
        await Persistence.saveState();
        
        for (const [key, candles] of candleData.entries()) {
          const [symbol, tf] = key.split('_');
          await Persistence.saveCandles(symbol, tf, candles);
        }
        
        lastActivity = Date.now();
      } catch (error) {
        console.error('⚠️ Keep-alive error:', error.message);
      }
    }, 4 * 60 * 1000);
    
    console.log('✅ Keep-alive iniciado (cada 4 min)');
  },
  
  stop() {
    if (this.interval) clearInterval(this.interval);
  }
};

// =============================================
// 🧠 ANALIZADOR SMC AJUSTADO
// =============================================
const SMCAnalyzer = {
  
  getConfig(symbol) {
    const asset = SYNTHETIC_INDICES[symbol];
    return ASSET_CONFIG[asset?.type] || ASSET_CONFIG.synthetic;
  },
  
  findSwings(candles, length = 2) { // ⬇️ Era 3
    const highs = [], lows = [];
    for (let i = length; i < candles.length - length; i++) {
      let isHigh = true, isLow = true;
      for (let j = 1; j <= length; j++) {
        if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isHigh = false;
        if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isLow = false;
      }
      if (isHigh) highs.push({ index: i, price: candles[i].high, time: candles[i].time });
      if (isLow) lows.push({ index: i, price: candles[i].low, time: candles[i].time });
    }
    return { highs, lows };
  },

  detectLiquidity(candles, swings, config) {
    const liquidity = { equalHighs: [], equalLows: [] };
    const recentHighs = swings.highs.slice(-7); // ⬆️ Era 5
    const recentLows = swings.lows.slice(-7);   // ⬆️ Era 5
    const tolerance = config.tolerance;
    
    for (let i = 0; i < recentHighs.length - 1; i++) {
      for (let j = i + 1; j < recentHighs.length; j++) {
        const diff = Math.abs(recentHighs[i].price - recentHighs[j].price) / recentHighs[i].price;
        if (diff <= tolerance && Math.abs(recentHighs[i].index - recentHighs[j].index) >= config.minSwingDistance) {
          liquidity.equalHighs.push({
            level: (recentHighs[i].price + recentHighs[j].price) / 2,
            age: candles.length - Math.max(recentHighs[i].index, recentHighs[j].index),
          });
        }
      }
    }
    
    for (let i = 0; i < recentLows.length - 1; i++) {
      for (let j = i + 1; j < recentLows.length; j++) {
        const diff = Math.abs(recentLows[i].price - recentLows[j].price) / recentLows[i].price;
        if (diff <= tolerance && Math.abs(recentLows[i].index - recentLows[j].index) >= config.minSwingDistance) {
          liquidity.equalLows.push({
            level: (recentLows[i].price + recentLows[j].price) / 2,
            age: candles.length - Math.max(recentLows[i].index, recentLows[j].index),
          });
        }
      }
    }
    
    return liquidity;
  },

  detectSweep(candles, liquidity, config) {
    if (!candles || candles.length < 10) return null;
    const recent = candles.slice(-config.sweepWindow);
    const currentIndex = candles.length;
    
    // Sweep de EQH (Bearish)
    for (const eqHigh of liquidity.equalHighs) {
      if (eqHigh.age > config.maxAge) continue;
      for (let i = 0; i < recent.length; i++) {
        const c = recent[i];
        const wickAbove = c.high - Math.max(c.open, c.close);
        const bodySize = Math.abs(c.close - c.open) || 0.0001;
        
        // Relajado: wick > 20% del body (era 30%)
        if (c.high > eqHigh.level && c.close < eqHigh.level && wickAbove > bodySize * 0.2) {
          return { 
            type: 'SWEEP_HIGH', 
            direction: 'BEARISH', 
            level: eqHigh.level, 
            sweepIndex: currentIndex - (recent.length - i), 
            description: 'Sweep de EQH', 
            valid: true 
          };
        }
      }
    }
    
    // Sweep de EQL (Bullish)
    for (const eqLow of liquidity.equalLows) {
      if (eqLow.age > config.maxAge) continue;
      for (let i = 0; i < recent.length; i++) {
        const c = recent[i];
        const wickBelow = Math.min(c.open, c.close) - c.low;
        const bodySize = Math.abs(c.close - c.open) || 0.0001;
        
        if (c.low < eqLow.level && c.close > eqLow.level && wickBelow > bodySize * 0.2) {
          return { 
            type: 'SWEEP_LOW', 
            direction: 'BULLISH', 
            level: eqLow.level, 
            sweepIndex: currentIndex - (recent.length - i), 
            description: 'Sweep de EQL', 
            valid: true 
          };
        }
      }
    }
    
    return null;
  },

  detectDisplacement(candles, sweep, config) {
    if (!sweep?.valid || !candles || candles.length < 15) return null;
    const sweepIndex = sweep.sweepIndex || candles.length - 5;
    const afterSweep = candles.slice(sweepIndex);
    if (afterSweep.length < 2) return null;
    
    const lookback = candles.slice(Math.max(0, sweepIndex - 20), Math.max(0, sweepIndex - 2));
    if (lookback.length < 3) return null; // ⬇️ Era 5
    
    const avgRange = lookback.reduce((sum, c) => sum + (c.high - c.low), 0) / lookback.length;
    if (!avgRange || isNaN(avgRange)) return null;
    
    for (let i = 0; i < Math.min(afterSweep.length, 6); i++) { // ⬆️ Era 5
      const c = afterSweep[i];
      const candleRange = c.high - c.low;
      const bodySize = Math.abs(c.close - c.open);
      const multiplier = candleRange / avgRange;
      
      // Relajado: body > 50% del rango (era 60%)
      if (multiplier > config.displacementMultiplier && bodySize > candleRange * 0.5) {
        const isBullish = c.close > c.open;
        if ((sweep.direction === 'BULLISH' && isBullish) || (sweep.direction === 'BEARISH' && !isBullish)) {
          return { 
            direction: sweep.direction, 
            index: sweepIndex + i, 
            multiplier: multiplier.toFixed(2), 
            description: `Displacement ${multiplier.toFixed(1)}x`, 
            valid: true 
          };
        }
      }
    }
    return null;
  },

  detectCHoCH(candles, swings, sweep, displacement) {
    if (!sweep?.valid || !displacement?.valid) return null;
    const { highs, lows } = swings;
    const displacementIndex = displacement.index;
    const afterDisplacement = candles.slice(displacementIndex);
    if (afterDisplacement.length < 1) return null; // ⬇️ Era 2
    
    if (sweep.direction === 'BULLISH') {
      const structuralHighs = highs.filter(h => h.index < displacementIndex).slice(-5); // ⬆️ Era 3
      const relevantHigh = structuralHighs.reduce((best, h) => (!best || h.price > best.price) ? h : best, null);
      if (relevantHigh) {
        for (let i = 0; i < afterDisplacement.length; i++) {
          if (afterDisplacement[i].close > relevantHigh.price) {
            return { 
              id: `${sweep.sweepIndex}_${relevantHigh.price}`, 
              direction: 'BULLISH', 
              breakLevel: relevantHigh.price, 
              description: 'CHoCH Alcista', 
              valid: true 
            };
          }
        }
      }
    }
    
    if (sweep.direction === 'BEARISH') {
      const structuralLows = lows.filter(l => l.index < displacementIndex).slice(-5);
      const relevantLow = structuralLows.reduce((best, l) => (!best || l.price < best.price) ? l : best, null);
      if (relevantLow) {
        for (let i = 0; i < afterDisplacement.length; i++) {
          if (afterDisplacement[i].close < relevantLow.price) {
            return { 
              id: `${sweep.sweepIndex}_${relevantLow.price}`, 
              direction: 'BEARISH', 
              breakLevel: relevantLow.price, 
              description: 'CHoCH Bajista', 
              valid: true 
            };
          }
        }
      }
    }
    return null;
  },

  findOB(candles, choch, displacement) {
    if (!choch?.valid || !displacement) return null;
    const searchStart = Math.max(0, displacement.index - 15); // ⬆️ Era 10
    const searchRange = candles.slice(searchStart, displacement.index);
    
    for (let i = searchRange.length - 1; i >= 0; i--) {
      const c = searchRange[i];
      const bodySize = Math.abs(c.close - c.open);
      const candleRange = c.high - c.low;
      
      // Relajado: body > 35% del rango (era 40%)
      if (choch.direction === 'BULLISH' && c.close < c.open && bodySize > candleRange * 0.35) {
        const obIndex = searchStart + i;
        const afterOB = candles.slice(obIndex + 1);
        // Relajado: permitir mitigación parcial
        const fullyMitigated = afterOB.filter(x => x.low < c.low).length > 3;
        if (!fullyMitigated) {
          return { obType: 'DEMAND', high: c.high, low: c.low, description: 'OB Demanda', valid: true };
        }
      }
      
      if (choch.direction === 'BEARISH' && c.close > c.open && bodySize > candleRange * 0.35) {
        const obIndex = searchStart + i;
        const afterOB = candles.slice(obIndex + 1);
        const fullyMitigated = afterOB.filter(x => x.high > c.high).length > 3;
        if (!fullyMitigated) {
          return { obType: 'SUPPLY', high: c.high, low: c.low, description: 'OB Oferta', valid: true };
        }
      }
    }
    return null;
  },

  checkLTFEntry(candlesLTF, ob, direction) {
    if (!ob || !candlesLTF || candlesLTF.length < 15) return null; // ⬇️ Era 20
    const recent = candlesLTF.slice(-20); // ⬆️ Era 15
    const currentPrice = recent[recent.length - 1]?.close;
    if (!currentPrice) return null;
    
    // Zona OB extendida 10%
    const obRange = ob.high - ob.low;
    const extendedHigh = ob.high + obRange * 0.1;
    const extendedLow = ob.low - obRange * 0.1;
    const inOBZone = currentPrice >= extendedLow && currentPrice <= extendedHigh;
    
    if (inOBZone) {
      for (let i = recent.length - 8; i < recent.length - 1; i++) { // ⬆️ Era 5
        if (i < 0) continue;
        const prev = recent[i], curr = recent[i + 1];
        if (!prev || !curr) continue;
        
        if (direction === 'BULLISH') {
          // Micro CHoCH
          const isMicroCHoCH = curr.close > prev.high && curr.close > curr.open;
          // Rejection
          const wickBelow = Math.min(curr.open, curr.close) - curr.low;
          const bodySize = Math.abs(curr.close - curr.open) || 0.0001;
          const isRejection = wickBelow > bodySize * 1.5 && curr.close > curr.open; // ⬇️ Era 2
          // Engulfing
          const isEngulfing = curr.close > curr.open && curr.close > prev.high && curr.open < prev.low;
          
          if (isMicroCHoCH || isRejection || isEngulfing) {
            return { 
              confirmationType: isMicroCHoCH ? 'MICRO_CHOCH' : isRejection ? 'REJECTION' : 'ENGULFING', 
              direction: 'BULLISH', 
              entryPrice: curr.close, 
              valid: true 
            };
          }
        }
        
        if (direction === 'BEARISH') {
          const isMicroCHoCH = curr.close < prev.low && curr.close < curr.open;
          const wickAbove = curr.high - Math.max(curr.open, curr.close);
          const bodySize = Math.abs(curr.close - curr.open) || 0.0001;
          const isRejection = wickAbove > bodySize * 1.5 && curr.close < curr.open;
          const isEngulfing = curr.close < curr.open && curr.close < prev.low && curr.open > prev.high;
          
          if (isMicroCHoCH || isRejection || isEngulfing) {
            return { 
              confirmationType: isMicroCHoCH ? 'MICRO_CHOCH' : isRejection ? 'REJECTION' : 'ENGULFING', 
              direction: 'BEARISH', 
              entryPrice: curr.close, 
              valid: true 
            };
          }
        }
      }
    }
    
    return { inZone: inOBZone, valid: false };
  },

  calculateLevels(ob, direction, symbol) {
    if (!ob) return null;
    const entry = direction === 'BULLISH' ? ob.high : ob.low;
    const stopLoss = direction === 'BULLISH' ? ob.low - (ob.high - ob.low) * 0.2 : ob.high + (ob.high - ob.low) * 0.2; // ⬇️ Era 0.3
    const risk = Math.abs(entry - stopLoss);
    
    const decimals = symbol === 'frxXAUUSD' ? 2 : 4;
    
    return {
      entry: entry.toFixed(decimals), 
      stopLoss: stopLoss.toFixed(decimals),
      tp1: (direction === 'BULLISH' ? entry + risk * 2 : entry - risk * 2).toFixed(decimals),
      tp2: (direction === 'BULLISH' ? entry + risk * 3 : entry - risk * 3).toFixed(decimals),
      tp3: (direction === 'BULLISH' ? entry + risk * 5 : entry - risk * 5).toFixed(decimals),
      tp4: (direction === 'BULLISH' ? entry + risk * 10 : entry - risk * 10).toFixed(decimals),
    };
  },

  calculateScore(a) {
    let score = 0;
    const breakdown = {};
    
    // Liquidez: 15 pts
    if (a.liquidity?.equalHighs?.length > 0 || a.liquidity?.equalLows?.length > 0) {
      score += 15;
      breakdown.liquidity = 15;
    }
    
    // Sweep: 25 pts
    if (a.sweep?.valid) {
      score += 25;
      breakdown.sweep = 25;
    }
    
    // Displacement: hasta 20 pts
    if (a.displacement?.valid) {
      const mult = parseFloat(a.displacement.multiplier) || 1;
      const pts = Math.min(20, Math.floor(mult * 10));
      score += pts;
      breakdown.displacement = pts;
    }
    
    // CHoCH: 20 pts
    if (a.choch?.valid) {
      score += 20;
      breakdown.choch = 20;
    }
    
    // OB: 15 pts
    if (a.orderBlock?.valid) {
      score += 15;
      breakdown.orderBlock = 15;
    }
    
    // LTF Entry: 5 pts bonus
    if (a.ltfEntry?.valid) {
      score += 5;
      breakdown.ltfEntry = 5;
    }
    
    return {
      score,
      breakdown,
      classification: score >= MIN_SCORE_AUTO ? 'A+' : score >= MIN_SCORE_VALID ? 'A' : score >= 60 ? 'B' : 'INVALID',
      isValid: score >= MIN_SCORE_VALID,
      canAutomate: score >= MIN_SCORE_AUTO
    };
  },

  analyze(symbol) {
    const assetInfo = SYNTHETIC_INDICES[symbol];
    if (!assetInfo) return { error: 'Símbolo no soportado' };
    
    const config = this.getConfig(symbol);
    const candlesHTF = candleData.get(`${symbol}_${TF_HTF}`) || [];
    const candlesLTF = candleData.get(`${symbol}_${TF_LTF}`) || [];
    
    if (candlesHTF.length < 50) {
      return { symbol, symbolName: assetInfo.name, status: 'LOADING', dataCount: candlesHTF.length };
    }
    
    const currentPrice = candlesHTF[candlesHTF.length - 1]?.close;
    const swings = this.findSwings(candlesHTF);
    const liquidity = this.detectLiquidity(candlesHTF, swings, config);
    const sweep = this.detectSweep(candlesHTF, liquidity, config);
    const displacement = this.detectDisplacement(candlesHTF, sweep, config);
    const choch = this.detectCHoCH(candlesHTF, swings, sweep, displacement);
    const orderBlock = this.findOB(candlesHTF, choch, displacement);
    const ltfEntry = orderBlock && choch ? this.checkLTFEntry(candlesLTF, orderBlock, choch.direction) : null;
    
    const scoring = this.calculateScore({ liquidity, sweep, displacement, choch, orderBlock, ltfEntry });
    const levels = orderBlock && choch ? this.calculateLevels(orderBlock, choch.direction, symbol) : null;
    
    const structureUsed = choch?.id ? usedStructures.has(choch.id) : false;
    
    let status = 'BUSCANDO', waiting = [], hasSignal = false;
    if (!liquidity.equalHighs.length && !liquidity.equalLows.length) { status = 'SIN_LIQUIDEZ'; waiting.push('Buscando liquidez'); }
    else if (!sweep?.valid) { status = 'ESPERANDO_SWEEP'; waiting.push('Esperando sweep'); }
    else if (!displacement?.valid) { status = 'ESPERANDO_DISPLACEMENT'; waiting.push('Esperando displacement'); }
    else if (!choch?.valid) { status = 'ESPERANDO_CHOCH'; waiting.push('Esperando CHoCH'); }
    else if (!orderBlock?.valid) { status = 'BUSCANDO_OB'; waiting.push('Buscando OB'); }
    else if (structureUsed) { status = 'ESTRUCTURA_USADA'; waiting.push('Estructura ya usada'); }
    else if (!ltfEntry?.valid) { status = 'ESPERANDO_ENTRADA'; waiting.push('Esperando entrada 1M'); }
    else { status = 'SEÑAL_ACTIVA'; hasSignal = scoring.isValid && !structureUsed; }
    
    analysisCache.set(symbol, { timestamp: Date.now(), status, hasSignal });
    
    return {
      symbol, 
      symbolName: assetInfo.name,
      assetType: assetInfo.type,
      emoji: assetInfo.emoji || '📊',
      currentPrice,
      liquidity, sweep, displacement, choch, orderBlock, ltfEntry,
      scoring, levels, status, waiting, hasSignal, structureUsed,
      direction: choch?.direction || null,
      candles: { htf: candlesHTF.slice(-80), ltf: candlesLTF.slice(-60) },
      chartMarkers: {
        liquidity: { equalHighs: liquidity.equalHighs.map(e => e.level), equalLows: liquidity.equalLows.map(e => e.level) },
        sweep: sweep ? { price: sweep.level, direction: sweep.direction } : null,
        choch: choch ? { price: choch.breakLevel, direction: choch.direction } : null,
        orderBlock, levels
      }
    };
  }
};

// =============================================
// 🧠 PSICOTRADING CON IA
// =============================================
const PsychoTrading = {
  
  analyzeEmotionalState() {
    const recentTrades = signalHistory.slice(0, 10);
    const operated = recentTrades.filter(s => s.operated);
    const wins = operated.filter(s => s.result === 'WIN').length;
    const losses = operated.filter(s => s.result === 'LOSS').length;
    
    let emotionalState = 'NEUTRAL';
    let riskLevel = 'NORMAL';
    const recommendations = [];
    
    if (tradingStats.streaks.currentLoss >= 3) {
      emotionalState = 'TILT';
      riskLevel = 'HIGH';
      recommendations.push('⚠️ 3+ pérdidas seguidas. Considera pausar 30 min.');
      recommendations.push('🧘 Respira. El mercado siempre estará ahí.');
    }
    
    if (tradingStats.streaks.currentWin >= 3) {
      emotionalState = 'CONFIDENT';
      riskLevel = 'MODERATE';
      recommendations.push('✅ Buena racha! Pero no aumentes el riesgo.');
      recommendations.push('📏 Mantén tu tamaño de posición.');
    }
    
    const todayTrades = operated.filter(s => {
      const d = new Date(s.createdAt);
      return d.toDateString() === new Date().toDateString();
    });
    
    if (todayTrades.length >= 5) {
      emotionalState = 'OVERTRADING';
      riskLevel = 'HIGH';
      recommendations.push('🛑 5+ trades hoy. ¿Estás siguiendo tu plan?');
    }
    
    return {
      emotionalState,
      riskLevel,
      recommendations,
      stats: {
        currentWinStreak: tradingStats.streaks.currentWin,
        currentLossStreak: tradingStats.streaks.currentLoss,
        todayTrades: todayTrades.length,
        winRate: operated.length > 0 ? ((wins / operated.length) * 100).toFixed(1) : 0
      }
    };
  },

  async getCoaching(userMessage) {
    if (!openai) {
      return { response: 'El coach de IA no está disponible. Verifica tu API key de OpenAI.', type: 'error' };
    }
    
    const emotionalState = this.analyzeEmotionalState();
    
    const systemPrompt = `Eres un coach de psicotrading experto especializado en Smart Money Concepts (SMC).

Tu rol es ayudar a traders a:
1. Mantener disciplina y seguir su plan SMC
2. Manejar emociones (miedo, codicia, frustración, FOMO)
3. Evitar errores comunes (revenge trading, overtrading)
4. Entender la metodología SMC (liquidez, sweep, CHoCH, OB)

CONTEXTO DEL TRADER:
- Estado emocional: ${emotionalState.emotionalState}
- Nivel de riesgo: ${emotionalState.riskLevel}
- Racha actual: ${emotionalState.stats.currentWinStreak} wins / ${emotionalState.stats.currentLossStreak} losses
- Trades hoy: ${emotionalState.stats.todayTrades}

REGLAS:
- Responde en español
- Sé directo pero empático
- Da consejos ESPECÍFICOS sobre SMC cuando sea relevante
- Si detectas peligro emocional, sé firme
- Máximo 100 palabras
- Usa emojis con moderación`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 200,
      });
      
      return {
        response: response.choices[0]?.message?.content || 'Sin respuesta',
        emotionalState,
        type: 'coaching'
      };
    } catch (error) {
      console.error('Error coaching:', error.message);
      return { response: 'Error al conectar con el coach. Intenta de nuevo.', type: 'error' };
    }
  },

  async generateTradingPlan(preferences) {
    if (!openai) return { error: 'IA no disponible' };
    
    const prompt = `Genera un PLAN DE TRADING SMC (Smart Money Concepts) personalizado.

Datos del trader:
- Capital: ${preferences.capital || 'No especificado'}
- Riesgo por trade: ${preferences.riskPerTrade || '1-2%'}
- Horario: ${preferences.schedule || 'Flexible'}
- Experiencia: ${preferences.experience || 'Intermedio'}
- Activos: Step Index, Volatility 75/100, Gold/USD

El plan debe incluir:

1. 📋 CHECKLIST PRE-TRADE SMC
   - Qué verificar antes de entrar

2. 🎯 REGLAS DE ENTRADA
   - Basadas en: Liquidez → Sweep → Displacement → CHoCH → OB → Entrada 1M

3. 💰 GESTIÓN DE RIESGO
   - Tamaño de posición
   - Stop loss obligatorio
   - Take profits (1:2, 1:3, 1:5)

4. 🚫 REGLAS DE NO OPERAR
   - Cuándo mantenerse fuera

5. 📊 LÍMITES DIARIOS
   - Máximo de trades
   - Máximo de pérdidas

Formato: Estructurado, claro, en español.`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
      });
      
      return { 
        plan: response.choices[0]?.message?.content, 
        generatedAt: new Date().toISOString() 
      };
    } catch (error) {
      console.error('Error plan:', error.message);
      return { error: 'Error generando plan' };
    }
  }
};

// =============================================
// NARRACIÓN IA
// =============================================
async function generateNarration(analysis) {
  if (!aiEnabled || !openai || !analysis || analysis.error) {
    return { text: analysis?.error || 'Analizando...', waiting: analysis?.waiting || [] };
  }

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: `Narra en 2 oraciones el estado SMC de ${analysis.symbolName}: Liquidez ${analysis.liquidity?.equalHighs?.length || 0} EQH/${analysis.liquidity?.equalLows?.length || 0} EQL, Sweep ${analysis.sweep?.valid ? 'SÍ' : 'NO'}, Displacement ${analysis.displacement?.valid ? analysis.displacement.multiplier + 'x' : 'NO'}, CHoCH ${analysis.choch?.valid ? analysis.choch.direction : 'NO'}, OB ${analysis.orderBlock?.valid ? analysis.orderBlock.obType : 'NO'}, Estado ${analysis.status}. Score: ${analysis.scoring?.score || 0}/100. Habla como trader SMC profesional en español.` }],
      max_tokens: 120,
    });
    return { text: res.choices[0]?.message?.content || 'Analizando...', waiting: analysis.waiting };
  } catch {
    return { text: 'Analizando mercado...', waiting: analysis.waiting };
  }
}

// =============================================
// WHATSAPP
// =============================================
async function sendWhatsApp(signal) {
  if (!CALLMEBOT_API_KEY) return false;
  
  const emoji = SYNTHETIC_INDICES[signal.symbol]?.emoji || '📊';
  
  const msg = `🎯 *SMC v7.4*
${emoji} ${signal.symbolName || 'Test'}
${signal.direction === 'BULLISH' ? '🟢 COMPRA' : '🔴 VENTA'}

✅ ${signal.sweep?.description || 'Sweep'}
✅ ${signal.choch?.description || 'CHoCH'}
✅ ${signal.orderBlock?.description || 'OB'}
✅ Entry: ${signal.ltfEntry?.confirmationType || 'Confirmado'}

📍 Entry: ${signal.levels?.entry || 'N/A'}
🛑 SL: ${signal.levels?.stopLoss || 'N/A'}
🎯 TP1: ${signal.levels?.tp1 || 'N/A'}
🎯 TP3: ${signal.levels?.tp3 || 'N/A'}

🏆 Score: ${signal.scoring?.score || 0}/100 (${signal.scoring?.classification})`;

  try {
    const url = `https://api.textmebot.com/send.php?recipient=${WHATSAPP_PHONE}&apikey=${CALLMEBOT_API_KEY}&text=${encodeURIComponent(msg)}`;
    await fetch(url);
    console.log('📱 WhatsApp enviado');
    return true;
  } catch (e) {
    console.error('❌ WhatsApp error:', e.message);
    return false;
  }
}

// =============================================
// DERIV WEBSOCKET
// =============================================
function connectDeriv() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    setTimeout(() => { reconnectAttempts = 0; connectDeriv(); }, 60000);
    return;
  }
  
  console.log(`🔌 Conectando a Deriv... (intento ${reconnectAttempts + 1})`);
  
  try {
    derivWs = new WebSocket(`${DERIV_WS_URL}?app_id=${DERIV_APP_ID}`);
  } catch (e) {
    reconnectAttempts++;
    setTimeout(connectDeriv, 5000);
    return;
  }

  derivWs.on('open', async () => {
    console.log('✅ Conectado a Deriv');
    isDerivConnected = true;
    reconnectAttempts = 0;
    lastActivity = Date.now();
    
    if (DERIV_API_TOKEN) {
      derivWs.send(JSON.stringify({ authorize: DERIV_API_TOKEN }));
    }

    for (const symbol of Object.keys(SYNTHETIC_INDICES)) {
      const assetInfo = SYNTHETIC_INDICES[symbol];
      console.log(`📡 Suscribiendo a ${assetInfo.name}...`);
      
      derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      
      for (const tf of [TF_LTF, TF_HTF]) {
        const savedCandles = await Persistence.loadCandles(symbol, tf);
        if (savedCandles && savedCandles.length > 100) {
          candleData.set(`${symbol}_${tf}`, savedCandles);
          console.log(`📦 ${symbol}_${tf}: ${savedCandles.length} velas desde Supabase`);
        }
        
        derivWs.send(JSON.stringify({
          ticks_history: symbol,
          adjust_start_time: 1,
          count: 200,
          end: 'latest',
          granularity: tf,
          style: 'candles',
          subscribe: 1,
        }));
      }
    }
  });

  derivWs.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      lastActivity = Date.now();
      
      if (msg.error) {
        if (msg.error.code === 'MarketIsClosed') {
          console.log(`⏸️ Mercado cerrado: ${msg.echo_req?.ticks_history || msg.echo_req?.ticks}`);
        }
        return;
      }

      if (msg.ohlc) {
        const { symbol, granularity, open_time, open, high, low, close } = msg.ohlc;
        const key = `${symbol}_${granularity}`;
        
        if (!candleData.has(key)) candleData.set(key, []);
        const candles = candleData.get(key);
        const newCandle = {
          time: open_time,
          open: parseFloat(open),
          high: parseFloat(high),
          low: parseFloat(low),
          close: parseFloat(close)
        };

        if (candles.length > 0 && candles[candles.length - 1].time === newCandle.time) {
          candles[candles.length - 1] = newCandle;
        } else {
          candles.push(newCandle);
          if (granularity === TF_HTF) {
            await checkSignal(symbol);
            if (candles.length % 10 === 0) {
              await Persistence.saveCandles(symbol, granularity, candles);
            }
          }
        }
        
        if (candles.length > 300) candles.shift();
      }

      if (msg.candles) {
        const symbol = msg.echo_req?.ticks_history;
        const granularity = msg.echo_req?.granularity;
        const key = `${symbol}_${granularity}`;
        const assetInfo = SYNTHETIC_INDICES[symbol];
        
        const existingCandles = candleData.get(key) || [];
        const newCandles = msg.candles.map(c => ({
          time: c.epoch,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close)
        }));
        
        if (existingCandles.length > 0 && existingCandles[existingCandles.length - 1].time > newCandles[newCandles.length - 1].time) {
          console.log(`✅ ${assetInfo?.name} ${granularity === TF_HTF ? '5M' : '1M'}: ${existingCandles.length} velas (preservadas)`);
        } else {
          candleData.set(key, newCandles);
          console.log(`✅ ${assetInfo?.name} ${granularity === TF_HTF ? '5M' : '1M'}: ${newCandles.length} velas`);
          await Persistence.saveCandles(symbol, granularity, newCandles);
        }
      }
    } catch {}
  });

  derivWs.on('close', () => {
    isDerivConnected = false;
    reconnectAttempts++;
    setTimeout(connectDeriv, 3000 + reconnectAttempts * 1000);
  });

  derivWs.on('error', () => {});
  
  setInterval(() => {
    if (derivWs && derivWs.readyState === WebSocket.OPEN) {
      derivWs.send(JSON.stringify({ ping: 1 }));
    }
  }, 30000);
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
      operated: false,
      result: null,
      notes: ''
    };
    
    if (analysis.choch?.id) usedStructures.set(analysis.choch.id, true);
    
    activeSignals.set(signalId, signal);
    signalHistory.unshift(signal);
    if (signalHistory.length > 100) signalHistory.pop();
    dailySignals.set(symbol, count + 1);
    tradingStats.totalSignals++;

    const emoji = SYNTHETIC_INDICES[symbol]?.emoji || '📊';
    console.log(`🎯 SEÑAL A+ #${count + 1}/7: ${emoji} ${analysis.direction} ${analysis.symbolName} - Score: ${analysis.scoring.score}`);
    
    await Persistence.saveSignal(signal);
    await Persistence.saveState();
    await sendWhatsApp(signal);
  }
}

// =============================================
// MIDDLEWARE & RUTAS
// =============================================
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    version: '7.4',
    features: ['SMC Ajustado', 'Psicotrading Completo', 'Plan SMC', 'Gold/USD'],
    minScore: { valid: MIN_SCORE_VALID, auto: MIN_SCORE_AUTO },
    assets: Object.keys(SYNTHETIC_INDICES),
    deriv: isDerivConnected,
    openai: !!openai,
    supabase: !!supabase
  });
});

app.get('/health', (req, res) => {
  lastActivity = Date.now();
  res.json({ status: 'healthy', deriv: isDerivConnected, timestamp: new Date().toISOString() });
});

// Deriv
app.get('/api/deriv/symbols', (req, res) => res.json(SYNTHETIC_INDICES));
app.get('/api/deriv/status', (req, res) => res.json({ connected: isDerivConnected, reconnectAttempts }));

// Análisis
app.get('/api/analyze/:symbol', (req, res) => {
  res.json(SMCAnalyzer.analyze(req.params.symbol));
});

app.get('/api/narration/:symbol', async (req, res) => {
  const analysis = SMCAnalyzer.analyze(req.params.symbol);
  const narration = await generateNarration(analysis);
  res.json({ ...narration, aiEnabled });
});

// IA Toggle
app.post('/api/ai/toggle', (req, res) => {
  aiEnabled = !aiEnabled;
  Persistence.saveState();
  res.json({ aiEnabled });
});

app.get('/api/ai/status', (req, res) => res.json({ aiEnabled, openaiConfigured: !!openai }));

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

// Tracking
app.post('/api/signals/:id/track', async (req, res) => {
  const { id } = req.params;
  const { operated, result, notes } = req.body;
  
  const signal = signalHistory.find(s => s.id === id);
  if (!signal) return res.status(404).json({ error: 'No encontrada' });
  
  signal.operated = operated;
  signal.result = result;
  signal.notes = notes;
  
  if (operated && result === 'WIN') {
    tradingStats.wins++;
    tradingStats.streaks.currentWin++;
    tradingStats.streaks.currentLoss = 0;
    if (tradingStats.streaks.currentWin > tradingStats.streaks.maxWin) {
      tradingStats.streaks.maxWin = tradingStats.streaks.currentWin;
    }
  } else if (operated && result === 'LOSS') {
    tradingStats.losses++;
    tradingStats.streaks.currentLoss++;
    tradingStats.streaks.currentWin = 0;
    if (tradingStats.streaks.currentLoss > tradingStats.streaks.maxLoss) {
      tradingStats.streaks.maxLoss = tradingStats.streaks.currentLoss;
    }
  }
  
  await Persistence.updateSignalTracking(id, operated, result, notes);
  await Persistence.saveState();
  
  res.json({ success: true, signal });
});

// Stats
app.get('/api/stats', (req, res) => {
  const operated = signalHistory.filter(s => s.operated);
  const wins = operated.filter(s => s.result === 'WIN').length;
  const losses = operated.filter(s => s.result === 'LOSS').length;
  
  res.json({
    totalSignals: signalHistory.length,
    totalOperated: operated.length,
    wins, losses,
    winRate: operated.length > 0 ? ((wins / operated.length) * 100).toFixed(1) : 0,
    streaks: tradingStats.streaks
  });
});

app.get('/api/stats/emotional', (req, res) => {
  res.json(PsychoTrading.analyzeEmotionalState());
});

// =============================================
// 🧠 PSICOTRADING ENDPOINTS
// =============================================
app.post('/api/psycho/coaching', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Mensaje requerido' });
  }
  const response = await PsychoTrading.getCoaching(message);
  res.json(response);
});

app.post('/api/psycho/plan', async (req, res) => {
  const plan = await PsychoTrading.generateTradingPlan(req.body);
  res.json(plan);
});

app.get('/api/psycho/check', (req, res) => {
  const state = PsychoTrading.analyzeEmotionalState();
  res.json({
    canTrade: state.riskLevel !== 'HIGH',
    state: state.emotionalState,
    risk: state.riskLevel,
    message: state.recommendations[0] || '✅ Listo para operar',
    recommendations: state.recommendations
  });
});

// WhatsApp test
app.get('/api/test-whatsapp', async (req, res) => {
  const result = await sendWhatsApp({
    symbol: 'stpRNG',
    symbolName: '🧪 TEST v7.4',
    direction: 'BULLISH',
    sweep: { description: 'Sweep EQL' },
    choch: { description: 'CHoCH Alcista' },
    orderBlock: { description: 'OB Demanda' },
    ltfEntry: { confirmationType: 'MICRO_CHOCH' },
    levels: { entry: '7850.00', stopLoss: '7845.00', tp1: '7860.00', tp3: '7875.00' },
    scoring: { score: 90, classification: 'A+' }
  });
  res.json({ success: result });
});

// Debug
app.get('/api/debug', (req, res) => {
  const analyses = {};
  Object.keys(SYNTHETIC_INDICES).forEach(sym => {
    const a = SMCAnalyzer.analyze(sym);
    analyses[sym] = {
      status: a.status,
      score: a.scoring?.score,
      hasSignal: a.hasSignal,
      liquidity: `${a.liquidity?.equalHighs?.length || 0} EQH / ${a.liquidity?.equalLows?.length || 0} EQL`,
      sweep: a.sweep?.valid ? '✅' : '❌',
      displacement: a.displacement?.valid ? `✅ ${a.displacement.multiplier}x` : '❌',
      choch: a.choch?.valid ? '✅' : '❌',
      ob: a.orderBlock?.valid ? '✅' : '❌',
      ltf: a.ltfEntry?.valid ? '✅' : '❌'
    };
  });
  
  res.json({
    candleData: Object.fromEntries([...candleData.entries()].map(([k, v]) => [k, v.length])),
    analyses,
    dailySignals: Object.fromEntries(dailySignals),
    totalSignals: signalHistory.length,
    config: { minScoreValid: MIN_SCORE_VALID, minScoreAuto: MIN_SCORE_AUTO },
    uptime: process.uptime()
  });
});

// =============================================
// INICIALIZACIÓN
// =============================================
async function init() {
  console.log('🚀 Iniciando Trading Master Pro v7.4...');
  console.log(`📊 Score mínimo: ${MIN_SCORE_VALID} (válido) / ${MIN_SCORE_AUTO} (auto)`);
  
  await Persistence.loadState();
  
  const savedSignals = await Persistence.loadSignalHistory();
  if (savedSignals.length > 0) {
    signalHistory = savedSignals;
    console.log(`📜 ${savedSignals.length} señales cargadas`);
  }
  
  connectDeriv();
  KeepAlive.start();
  
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      dailySignals.clear();
      usedStructures.clear();
      console.log('🔄 Reset diario');
      Persistence.saveState();
    }
  }, 60000);
}

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     TRADING MASTER PRO v7.4                                ║
║     SMC AJUSTADO + PSICOTRADING COMPLETO                   ║
╠════════════════════════════════════════════════════════════╣
║  🔧 SMC menos estricto (más señales)                       ║
║  🧠 Coaching IA funcionando                                ║
║  📋 Plan de Trading SMC                                    ║
║  🥇 Gold/USD incluido                                      ║
║  📱 WhatsApp alerts                                        ║
║  🎯 Puerto: ${PORT}                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
  
  init();
});

export default app;
