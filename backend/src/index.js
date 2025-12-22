// =============================================
// TRADING MASTER PRO - BACKEND v7.3.1
// SMC + PERSISTENCIA + ORO (GOLD)
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

console.log('\n🔧 TRADING MASTER PRO v7.3.1');
console.log('═══════════════════════════════════════');
console.log('SMC + PERSISTENCIA + ORO (GOLD)');
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
// 🎯 ÍNDICES - AHORA CON ORO
// =============================================
const SYNTHETIC_INDICES = {
  // Índices sintéticos
  'stpRNG': { name: 'Step Index', pip: 0.01, type: 'synthetic' },
  'R_75': { name: 'Volatility 75', pip: 0.0001, type: 'synthetic' },
  'R_100': { name: 'Volatility 100', pip: 0.01, type: 'synthetic' },
  
  // 🥇 ORO - Gold/USD
  'frxXAUUSD': { name: 'Gold/USD', pip: 0.01, type: 'forex', emoji: '🥇' },
};

// Configuración específica por tipo de activo
const ASSET_CONFIG = {
  synthetic: {
    tolerance: 0.0003,      // Tolerancia para EQH/EQL
    sweepWindow: 6,         // Velas para detectar sweep
    maxAge: 20,             // Máxima antigüedad de liquidez
    displacementMultiplier: 1.5,
  },
  forex: {
    tolerance: 0.0005,      // Oro es más volátil
    sweepWindow: 8,         // Más velas para sweep
    maxAge: 25,             // Más tiempo para liquidez
    displacementMultiplier: 1.3, // Menos estricto
  }
};

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
      
      console.log(`✅ Cargadas ${key} desde Supabase (${age.toFixed(1)} min antigüedad)`);
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
        console.log(`💓 Keep-alive ping OK - ${new Date().toLocaleTimeString()}`);
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
// 🧠 ANALIZADOR SMC (Adaptativo por activo)
// =============================================
const SMCAnalyzer = {
  
  getConfig(symbol) {
    const asset = SYNTHETIC_INDICES[symbol];
    return ASSET_CONFIG[asset?.type] || ASSET_CONFIG.synthetic;
  },
  
  findSwings(candles, length = 3) {
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
    const recentHighs = swings.highs.slice(-5);
    const recentLows = swings.lows.slice(-5);
    const tolerance = config.tolerance;
    
    for (let i = 0; i < recentHighs.length - 1; i++) {
      for (let j = i + 1; j < recentHighs.length; j++) {
        const diff = Math.abs(recentHighs[i].price - recentHighs[j].price) / recentHighs[i].price;
        if (diff <= tolerance && Math.abs(recentHighs[i].index - recentHighs[j].index) >= 3) {
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
        if (diff <= tolerance && Math.abs(recentLows[i].index - recentLows[j].index) >= 3) {
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
    
    for (const eqHigh of liquidity.equalHighs) {
      if (eqHigh.age > config.maxAge) continue;
      for (let i = 0; i < recent.length; i++) {
        const c = recent[i];
        const wickAbove = c.high - Math.max(c.open, c.close);
        const bodySize = Math.abs(c.close - c.open);
        if (c.high > eqHigh.level && c.close < eqHigh.level && c.open < eqHigh.level && wickAbove > bodySize * 0.3) {
          return { type: 'SWEEP_HIGH', direction: 'BEARISH', level: eqHigh.level, sweepIndex: currentIndex - (recent.length - i), description: 'Sweep EQH', valid: true };
        }
      }
    }
    
    for (const eqLow of liquidity.equalLows) {
      if (eqLow.age > config.maxAge) continue;
      for (let i = 0; i < recent.length; i++) {
        const c = recent[i];
        const wickBelow = Math.min(c.open, c.close) - c.low;
        const bodySize = Math.abs(c.close - c.open);
        if (c.low < eqLow.level && c.close > eqLow.level && c.open > eqLow.level && wickBelow > bodySize * 0.3) {
          return { type: 'SWEEP_LOW', direction: 'BULLISH', level: eqLow.level, sweepIndex: currentIndex - (recent.length - i), description: 'Sweep EQL', valid: true };
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
    if (lookback.length < 5) return null;
    
    const avgRange = lookback.reduce((sum, c) => sum + (c.high - c.low), 0) / lookback.length;
    if (!avgRange || isNaN(avgRange)) return null;
    
    for (let i = 0; i < Math.min(afterSweep.length, 5); i++) {
      const c = afterSweep[i];
      const candleRange = c.high - c.low;
      const bodySize = Math.abs(c.close - c.open);
      const multiplier = candleRange / avgRange;
      
      if (multiplier > config.displacementMultiplier && bodySize > candleRange * 0.6) {
        const isBullish = c.close > c.open;
        if ((sweep.direction === 'BULLISH' && isBullish) || (sweep.direction === 'BEARISH' && !isBullish)) {
          return { direction: sweep.direction, index: sweepIndex + i, multiplier: multiplier.toFixed(2), description: `Displacement ${multiplier.toFixed(1)}x`, valid: true };
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
    if (afterDisplacement.length < 2) return null;
    
    if (sweep.direction === 'BULLISH') {
      const structuralHighs = highs.filter(h => h.index < displacementIndex).slice(-3);
      const relevantHigh = structuralHighs.reduce((best, h) => (!best || h.price > best.price) ? h : best, null);
      if (relevantHigh) {
        for (let i = 0; i < afterDisplacement.length; i++) {
          if (afterDisplacement[i].close > relevantHigh.price) {
            return { id: `${sweep.sweepIndex}_${relevantHigh.price}`, direction: 'BULLISH', breakLevel: relevantHigh.price, description: 'CHoCH Alcista', valid: true };
          }
        }
      }
    }
    
    if (sweep.direction === 'BEARISH') {
      const structuralLows = lows.filter(l => l.index < displacementIndex).slice(-3);
      const relevantLow = structuralLows.reduce((best, l) => (!best || l.price < best.price) ? l : best, null);
      if (relevantLow) {
        for (let i = 0; i < afterDisplacement.length; i++) {
          if (afterDisplacement[i].close < relevantLow.price) {
            return { id: `${sweep.sweepIndex}_${relevantLow.price}`, direction: 'BEARISH', breakLevel: relevantLow.price, description: 'CHoCH Bajista', valid: true };
          }
        }
      }
    }
    return null;
  },

  findOB(candles, choch, displacement) {
    if (!choch?.valid || !displacement) return null;
    const searchStart = Math.max(0, displacement.index - 10);
    const searchRange = candles.slice(searchStart, displacement.index);
    
    for (let i = searchRange.length - 1; i >= 0; i--) {
      const c = searchRange[i];
      const bodySize = Math.abs(c.close - c.open);
      
      if (choch.direction === 'BULLISH' && c.close < c.open && bodySize > (c.high - c.low) * 0.4) {
        const obIndex = searchStart + i;
        if (!candles.slice(obIndex + 1).some(x => x.low <= c.low)) {
          return { obType: 'DEMAND', high: c.high, low: c.low, description: 'OB Demanda', valid: true };
        }
      }
      
      if (choch.direction === 'BEARISH' && c.close > c.open && bodySize > (c.high - c.low) * 0.4) {
        const obIndex = searchStart + i;
        if (!candles.slice(obIndex + 1).some(x => x.high >= c.high)) {
          return { obType: 'SUPPLY', high: c.high, low: c.low, description: 'OB Oferta', valid: true };
        }
      }
    }
    return null;
  },

  checkLTFEntry(candlesLTF, ob, direction) {
    if (!ob || !candlesLTF || candlesLTF.length < 20) return null;
    const recent = candlesLTF.slice(-15);
    const currentPrice = recent[recent.length - 1]?.close;
    if (!currentPrice) return null;
    
    const inOBZone = currentPrice >= ob.low && currentPrice <= ob.high;
    
    if (inOBZone) {
      for (let i = recent.length - 5; i < recent.length - 1; i++) {
        const prev = recent[i], curr = recent[i + 1];
        
        if (direction === 'BULLISH') {
          const isMicroCHoCH = curr.close > prev.high && curr.close > curr.open;
          const wickBelow = Math.min(curr.open, curr.close) - curr.low;
          const isRejection = wickBelow > Math.abs(curr.close - curr.open) * 2 && curr.close > curr.open;
          if (isMicroCHoCH || isRejection) {
            return { confirmationType: isMicroCHoCH ? 'MICRO_CHOCH' : 'REJECTION', direction: 'BULLISH', entryPrice: curr.close, valid: true };
          }
        }
        
        if (direction === 'BEARISH') {
          const isMicroCHoCH = curr.close < prev.low && curr.close < curr.open;
          const wickAbove = curr.high - Math.max(curr.open, curr.close);
          const isRejection = wickAbove > Math.abs(curr.close - curr.open) * 2 && curr.close < curr.open;
          if (isMicroCHoCH || isRejection) {
            return { confirmationType: isMicroCHoCH ? 'MICRO_CHOCH' : 'REJECTION', direction: 'BEARISH', entryPrice: curr.close, valid: true };
          }
        }
      }
    }
    
    return { inZone: inOBZone, valid: false };
  },

  calculateLevels(ob, direction, symbol) {
    if (!ob) return null;
    const entry = direction === 'BULLISH' ? ob.high : ob.low;
    const stopLoss = direction === 'BULLISH' ? ob.low - (ob.high - ob.low) * 0.3 : ob.high + (ob.high - ob.low) * 0.3;
    const risk = Math.abs(entry - stopLoss);
    
    // Para Oro, usamos más decimales
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
    if (a.liquidity?.equalHighs?.length > 0 || a.liquidity?.equalLows?.length > 0) score += 20;
    if (a.sweep?.valid) score += 25;
    if (a.displacement?.valid) score += Math.min(20, Math.floor(parseFloat(a.displacement.multiplier) * 8));
    if (a.choch?.valid) score += 20;
    if (a.orderBlock?.valid) score += 15;
    
    return {
      score,
      classification: score >= 90 ? 'A+' : score >= 75 ? 'A' : score >= 60 ? 'B' : 'INVALID',
      isValid: score >= 75,
      canAutomate: score >= 90
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
    
    const scoring = this.calculateScore({ liquidity, sweep, displacement, choch, orderBlock });
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
// NARRACIÓN IA
// =============================================
async function generateNarration(analysis) {
  if (!aiEnabled || !openai || !analysis || analysis.error) {
    return { text: analysis?.error || 'Analizando...', waiting: analysis?.waiting || [] };
  }

  try {
    const assetContext = analysis.assetType === 'forex' 
      ? 'Este es un par de Forex (Oro), considera su mayor volatilidad.'
      : 'Este es un índice sintético.';
      
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: `Narra en 2 oraciones el estado SMC de ${analysis.symbolName}: Liquidez ${analysis.liquidity?.equalHighs?.length || 0} EQH/${analysis.liquidity?.equalLows?.length || 0} EQL, Sweep ${analysis.sweep?.valid ? 'SÍ' : 'NO'}, CHoCH ${analysis.choch?.valid ? analysis.choch.direction : 'NO'}, Estado ${analysis.status}. ${assetContext} Habla como trader SMC.` }],
      max_tokens: 100,
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
  
  const msg = `🎯 *SMC v7.3.1*
${emoji} ${signal.symbolName || 'Test'}
${signal.direction === 'BULLISH' ? '🟢 COMPRA' : '🔴 VENTA'}

📍 Entry: ${signal.levels?.entry || 'N/A'}
🛑 SL: ${signal.levels?.stopLoss || 'N/A'}
🎯 TP1: ${signal.levels?.tp1 || 'N/A'}
🎯 TP3: ${signal.levels?.tp3 || 'N/A'}

🏆 Score: ${signal.scoring?.score || 0}/100`;

  try {
    await fetch(`https://api.textmebot.com/send.php?recipient=${WHATSAPP_PHONE}&apikey=${CALLMEBOT_API_KEY}&text=${encodeURIComponent(msg)}`);
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
    console.error('❌ Máximo de reconexiones alcanzado');
    setTimeout(() => {
      reconnectAttempts = 0;
      connectDeriv();
    }, 60000);
    return;
  }
  
  console.log(`🔌 Conectando a Deriv... (intento ${reconnectAttempts + 1})`);
  
  try {
    derivWs = new WebSocket(`${DERIV_WS_URL}?app_id=${DERIV_APP_ID}`);
  } catch (e) {
    console.error('Error creando WebSocket:', e.message);
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

    // Suscribir a TODOS los símbolos (incluyendo Oro)
    for (const symbol of Object.keys(SYNTHETIC_INDICES)) {
      const assetInfo = SYNTHETIC_INDICES[symbol];
      console.log(`📡 Suscribiendo a ${assetInfo.name} (${symbol})...`);
      
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
        // Ignorar errores de símbolos no disponibles
        if (msg.error.code === 'MarketIsClosed') {
          console.log(`⚠️ Mercado cerrado para: ${msg.echo_req?.ticks_history || msg.echo_req?.ticks}`);
        } else if (msg.error.code !== 'InvalidSymbol') {
          console.error('Deriv error:', msg.error.message);
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
          console.log(`✅ ${assetInfo?.name || symbol} ${granularity === TF_HTF ? '5M' : '1M'}: ${existingCandles.length} velas (preservadas)`);
        } else {
          candleData.set(key, newCandles);
          console.log(`✅ ${assetInfo?.name || symbol} ${granularity === TF_HTF ? '5M' : '1M'}: ${newCandles.length} velas (nuevas)`);
          await Persistence.saveCandles(symbol, granularity, newCandles);
        }
      }
    } catch (e) {
      console.error('Error procesando mensaje:', e.message);
    }
  });

  derivWs.on('close', () => {
    console.log('⚠️ Desconectado de Deriv');
    isDerivConnected = false;
    reconnectAttempts++;
    setTimeout(connectDeriv, 3000 + reconnectAttempts * 1000);
  });

  derivWs.on('error', (e) => {
    console.error('WebSocket error:', e.message);
  });
  
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
    console.log(`🎯 SEÑAL A+ #${count + 1}/7: ${emoji} ${analysis.direction} ${analysis.symbolName}`);
    
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
    version: '7.3.1',
    assets: Object.keys(SYNTHETIC_INDICES).map(k => ({
      symbol: k,
      name: SYNTHETIC_INDICES[k].name,
      type: SYNTHETIC_INDICES[k].type,
      emoji: SYNTHETIC_INDICES[k].emoji
    })),
    deriv: isDerivConnected,
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
  } else if (operated && result === 'LOSS') {
    tradingStats.losses++;
    tradingStats.streaks.currentLoss++;
    tradingStats.streaks.currentWin = 0;
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
  let emotionalState = 'NEUTRAL';
  let riskLevel = 'NORMAL';
  const recommendations = [];
  
  if (tradingStats.streaks.currentLoss >= 3) {
    emotionalState = 'TILT';
    riskLevel = 'HIGH';
    recommendations.push('⚠️ 3+ pérdidas seguidas. Pausa recomendada.');
  }
  
  if (tradingStats.streaks.currentWin >= 3) {
    emotionalState = 'CONFIDENT';
    recommendations.push('✅ Buena racha, mantén la disciplina.');
  }
  
  res.json({
    emotionalState, riskLevel, recommendations,
    stats: {
      currentWinStreak: tradingStats.streaks.currentWin,
      currentLossStreak: tradingStats.streaks.currentLoss
    }
  });
});

// WhatsApp test
app.get('/api/test-whatsapp', async (req, res) => {
  const result = await sendWhatsApp({
    symbol: 'frxXAUUSD',
    symbolName: '🥇 Gold/USD TEST',
    direction: 'BULLISH',
    levels: { entry: '2650.50', stopLoss: '2645.00', tp1: '2661.50', tp3: '2678.00' },
    scoring: { score: 95 }
  });
  res.json({ success: result });
});

// Debug
app.get('/api/debug', (req, res) => {
  res.json({
    candleData: Object.fromEntries([...candleData.entries()].map(([k, v]) => [k, { count: v.length, lastTime: v[v.length-1]?.time }])),
    analysisCache: Object.fromEntries(analysisCache),
    dailySignals: Object.fromEntries(dailySignals),
    usedStructures: usedStructures.size,
    reconnectAttempts,
    lastActivity: new Date(lastActivity).toISOString(),
    uptime: process.uptime()
  });
});

// =============================================
// INICIALIZACIÓN
// =============================================
async function init() {
  console.log('🚀 Iniciando Trading Master Pro v7.3.1...');
  console.log('📊 Activos configurados:');
  Object.entries(SYNTHETIC_INDICES).forEach(([sym, info]) => {
    console.log(`   ${info.emoji || '📈'} ${info.name} (${sym}) - ${info.type}`);
  });
  
  await Persistence.loadState();
  
  const savedSignals = await Persistence.loadSignalHistory();
  if (savedSignals.length > 0) {
    signalHistory = savedSignals;
    console.log(`📜 ${savedSignals.length} señales cargadas desde Supabase`);
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
║     TRADING MASTER PRO v7.3.1                              ║
║     SMC + PERSISTENCIA + ORO (GOLD)                        ║
╠════════════════════════════════════════════════════════════╣
║  📊 Step Index                                             ║
║  📊 Volatility 75                                          ║
║  📊 Volatility 100                                         ║
║  🥇 Gold/USD (NUEVO)                                       ║
╠════════════════════════════════════════════════════════════╣
║  💾 Persistencia Supabase                                  ║
║  💓 Keep-alive cada 4 min                                  ║
║  📱 WhatsApp TextMeBot                                     ║
║  🎯 Puerto: ${PORT}                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
  
  init();
});

export default app;
