// =============================================
// TRADING MASTER PRO v13.1 - PLATAFORMA COMPLETA
// Motor SMC + ELISA IA + Telegram + Supabase + Admin
// =============================================

import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// =============================================
// CONFIGURACIÓN TELEGRAM
// =============================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramSignal(signal) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  
  try {
    const isLong = signal.action === 'LONG';
    const emoji = isLong ? '🟢' : '🔴';
    const actionText = isLong ? 'COMPRA (LONG)' : 'VENTA (SHORT)';
    
    const message = `
${emoji} *SEÑAL #${signal.id}* ${emoji}

📊 *Activo:* ${signal.assetName}
📈 *Dirección:* ${actionText}
🎯 *Modelo:* ${signal.model}
💯 *Score:* ${signal.score}%

💰 *Entry:* ${signal.entry}
🛑 *Stop Loss:* ${signal.stop}

✅ *TP1:* ${signal.tp1}
✅ *TP2:* ${signal.tp2}
✅ *TP3:* ${signal.tp3}

📝 ${signal.reason}
⏰ ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
`;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' })
    });
    console.log(`📱 Telegram: Señal #${signal.id} enviada`);
  } catch (e) {
    console.log('⚠️ Telegram error:', e.message);
  }
}

// =============================================
// CONFIGURACIÓN SUPABASE
// =============================================
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log('✅ Supabase conectado');
} else {
  console.log('⚠️ Supabase no configurado - usando memoria local');
  console.log('   SUPABASE_URL:', SUPABASE_URL ? 'OK' : 'MISSING');
  console.log('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_KEY ? 'OK' : 'MISSING');
}

// Almacenamiento en memoria (fallback cuando no hay Supabase)
const memoryStore = {
  subscriptions: new Map()
};

// Función helper para obtener/guardar suscripciones
// Adaptado para la estructura de Supabase: identificacion, id_de_usuario, id_del_plan, estado, periodo
async function getSubscription(userId) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('suscripciones')
        .select('*')
        .eq('id_de_usuario', userId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.log('Supabase getSubscription error:', error.message);
      }
      
      // Normalizar datos para el backend
      if (data) {
        return {
          ...data,
          plan: data.plan || 'free',
          estado: data.estado || 'trial',
          email: data.email || null,
          trial_ends_at: data.trial_ends_at || null
        };
      }
      return null;
    } catch (e) {
      console.log('getSubscription error:', e.message);
      return null;
    }
  }
  return memoryStore.subscriptions.get(userId) || null;
}

async function saveSubscription(subData) {
  if (supabase) {
    try {
      // Preparar datos para Supabase
      const dataToSave = {
        id_de_usuario: subData.id_de_usuario,
        estado: subData.estado || 'trial',
        periodo: subData.periodo || 'mensual',
        plan: subData.plan || 'free',
        email: subData.email || null,
        trial_ends_at: subData.trial_ends_at || null,
        updated_at: new Date().toISOString()
      };
      
      // Verificar si existe
      const { data: existing, error: findError } = await supabase
        .from('suscripciones')
        .select('identificacion')
        .eq('id_de_usuario', subData.id_de_usuario)
        .single();
      
      if (existing) {
        // Actualizar existente
        const result = await supabase
          .from('suscripciones')
          .update(dataToSave)
          .eq('id_de_usuario', subData.id_de_usuario)
          .select();
        
        if (result.error) {
          console.log('Supabase update error:', result.error.message);
        } else {
          console.log(`✅ Suscripción actualizada: ${subData.id_de_usuario} -> ${subData.plan}`);
        }
        return result;
      } else {
        // Insertar nuevo
        dataToSave.created_at = new Date().toISOString();
        if (!dataToSave.trial_ends_at && dataToSave.estado === 'trial') {
          dataToSave.trial_ends_at = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
        }
        
        const result = await supabase
          .from('suscripciones')
          .insert(dataToSave)
          .select();
        
        if (result.error) {
          console.log('Supabase insert error:', result.error.message);
        } else {
          console.log(`✅ Suscripción creada: ${subData.id_de_usuario} -> ${subData.plan}`);
        }
        return result;
      }
    } catch (e) {
      console.log('saveSubscription error:', e.message);
      return { data: null, error: e };
    }
  }
  
  // Guardar en memoria (fallback)
  memoryStore.subscriptions.set(subData.id_de_usuario, {
    ...subData,
    created_at: subData.created_at || new Date().toISOString()
  });
  return { data: [subData] };
}

async function getAllSubscriptions() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('suscripciones')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.log('Supabase getAllSubscriptions error:', error.message);
        return [];
      }
      
      // Normalizar datos
      return (data || []).map(sub => ({
        ...sub,
        plan: sub.plan || 'free',
        estado: sub.estado || 'trial'
      }));
    } catch (e) {
      console.log('getAllSubscriptions error:', e.message);
      return [];
    }
  }
  return Array.from(memoryStore.subscriptions.values());
}

async function deleteSubscription(userId) {
  if (supabase) {
    try {
      const result = await supabase
        .from('suscripciones')
        .delete()
        .eq('id_de_usuario', userId);
      
      if (result.error) {
        console.log('Supabase delete error:', result.error.message);
      }
      return result;
    } catch (e) {
      console.log('deleteSubscription error:', e.message);
      return { error: e };
    }
  }
  memoryStore.subscriptions.delete(userId);
  return { error: null };
}

// =============================================
// CONFIGURACIÓN DE ACTIVOS Y PLANES
// =============================================
const PLANS = {
  free: {
    name: 'Free Trial',
    // Durante el trial FREE, tiene acceso a TODO (5 días)
    assets: ['stpRNG', '1HZ75V', 'frxXAUUSD', 'frxGBPUSD', 'cryBTCUSD', 'BOOM1000', 'BOOM500', 'CRASH1000', 'CRASH500'],
    duration: 5, // días
    price: 0
  },
  basico: {
    name: 'Básico',
    assets: ['stpRNG', '1HZ75V', 'frxXAUUSD', 'cryBTCUSD'],
    price: 29900
  },
  premium: {
    name: 'Premium',
    assets: ['stpRNG', '1HZ75V', 'frxXAUUSD', 'frxGBPUSD', 'cryBTCUSD'],
    price: 59900
  },
  elite: {
    name: 'Elite',
    assets: ['stpRNG', '1HZ75V', 'frxXAUUSD', 'frxGBPUSD', 'cryBTCUSD', 'BOOM1000', 'BOOM500', 'CRASH1000', 'CRASH500'],
    price: 99900
  }
};

const ASSETS = {
  'stpRNG': { name: 'Step Index', shortName: 'Step', emoji: '📊', decimals: 2, pip: 0.01, plan: 'free' },
  '1HZ75V': { name: 'Volatility 75', shortName: 'V75', emoji: '📈', decimals: 2, pip: 0.01, plan: 'basico' },
  'frxXAUUSD': { name: 'Oro (XAU/USD)', shortName: 'XAU', emoji: '🥇', decimals: 2, pip: 0.01, plan: 'free' },
  'frxGBPUSD': { name: 'GBP/USD', shortName: 'GBP', emoji: '💷', decimals: 5, pip: 0.0001, plan: 'premium' },
  'cryBTCUSD': { name: 'Bitcoin', shortName: 'BTC', emoji: '₿', decimals: 2, pip: 1, plan: 'premium' },
  'BOOM1000': { name: 'Boom 1000', shortName: 'Boom1K', emoji: '🚀', decimals: 2, pip: 0.01, plan: 'elite' },
  'BOOM500': { name: 'Boom 500', shortName: 'Boom500', emoji: '💥', decimals: 2, pip: 0.01, plan: 'elite' },
  'CRASH1000': { name: 'Crash 1000', shortName: 'Crash1K', emoji: '📉', decimals: 2, pip: 0.01, plan: 'elite' },
  'CRASH500': { name: 'Crash 500', shortName: 'Crash500', emoji: '💣', decimals: 2, pip: 0.01, plan: 'elite' }
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
// MOTOR SMC v13.0
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
    const lastCandle = candlesM5[candlesM5.length - 1];
    
    // *** MODELO ZONE_TOUCH - Señales cuando el precio toca una zona ***
    for (const zone of demandZones) {
      const touchingZone = lastCandle.low <= zone.high * 1.002 && lastCandle.low >= zone.low * 0.998;
      const closeAboveZone = lastCandle.close > zone.mid;
      
      if (touchingZone && closeAboveZone) {
        // Verificar que H1 no esté en contra
        const h1Supports = !h1Loaded || structureH1.trend !== 'BEARISH';
        
        if (h1Supports) {
          const zonePb = {
            side: 'BUY',
            entry: lastCandle.close,
            stop: zone.low - avgRange * 0.5,
            tp1: lastCandle.close + avgRange * 1.5,
            tp2: lastCandle.close + avgRange * 2.5,
            tp3: lastCandle.close + avgRange * 4
          };
          
          let bonus = 0;
          if (premiumDiscount === 'DISCOUNT') bonus = 10;
          if (mtfConfluence && structureH1.trend === 'BULLISH') bonus += 10;
          
          signals.push({
            model: 'ZONE_TOUCH',
            baseScore: 70 + bonus,
            pullback: zonePb,
            reason: `Toque zona demanda${bonus > 0 ? ' + ' + premiumDiscount : ''}`
          });
        }
      }
    }
    
    for (const zone of supplyZones) {
      const touchingZone = lastCandle.high >= zone.low * 0.998 && lastCandle.high <= zone.high * 1.002;
      const closeBelowZone = lastCandle.close < zone.mid;
      
      if (touchingZone && closeBelowZone) {
        const h1Supports = !h1Loaded || structureH1.trend !== 'BULLISH';
        
        if (h1Supports) {
          const zonePb = {
            side: 'SELL',
            entry: lastCandle.close,
            stop: zone.high + avgRange * 0.5,
            tp1: lastCandle.close - avgRange * 1.5,
            tp2: lastCandle.close - avgRange * 2.5,
            tp3: lastCandle.close - avgRange * 4
          };
          
          let bonus = 0;
          if (premiumDiscount === 'PREMIUM') bonus = 10;
          if (mtfConfluence && structureH1.trend === 'BEARISH') bonus += 10;
          
          signals.push({
            model: 'ZONE_TOUCH',
            baseScore: 70 + bonus,
            pullback: zonePb,
            reason: `Toque zona supply${bonus > 0 ? ' + ' + premiumDiscount : ''}`
          });
        }
      }
    }
    
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
// ELISA IA - ASISTENTE EXPRESIVA
// =============================================
const Elisa = {
  getContext(symbol) {
    const data = assetData[symbol];
    const config = ASSETS[symbol];
    if (!data || !config) return null;
    
    const lastCandles = data.candles.slice(-5);
    const priceChange = lastCandles.length >= 2 
      ? ((lastCandles[lastCandles.length - 1]?.close - lastCandles[0]?.close) / lastCandles[0]?.close * 100).toFixed(2)
      : 0;
    
    return {
      symbol,
      name: config.name,
      shortName: config.shortName,
      emoji: config.emoji,
      price: data.price,
      decimals: config.decimals,
      priceChange,
      structureM5: data.structure?.trend || 'LOADING',
      structureH1: data.structureH1?.trend || 'LOADING',
      h1Loaded: data.h1Loaded,
      mtfConfluence: data.mtfConfluence,
      premiumDiscount: data.premiumDiscount,
      orderFlow: data.orderFlow,
      demandZones: data.demandZones || [],
      supplyZones: data.supplyZones || [],
      fvgZones: data.fvgZones || [],
      liquidityLevels: data.liquidityLevels || [],
      choch: data.choch,
      bos: data.bos,
      lockedSignal: data.lockedSignal,
      signal: data.signal,
      candles: data.candles.slice(-10),
      swings: data.swings || []
    };
  },

  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return '¡Buenos días!';
    if (hour < 18) return '¡Buenas tardes!';
    return '¡Buenas noches!';
  },

  getRandomPhrase(phrases) {
    return phrases[Math.floor(Math.random() * phrases.length)];
  },

  chat(question, symbol) {
    const ctx = this.getContext(symbol);
    if (!ctx) return { answer: "⏳ Dame un momento, estoy conectándome al mercado...", type: 'loading' };
    
    const q = (question || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    
    // ═══════════════════════════════════════════
    // SALUDO
    // ═══════════════════════════════════════════
    if (!q || q === 'hola' || q === 'hey' || q === 'hi' || q === 'ey') {
      const greetings = [
        `${this.getGreeting()} 💜 Soy Elisa, tu asistente de trading.\n\n`,
        `¡Hola! 👋 Qué gusto verte por aquí.\n\n`,
        `${this.getGreeting()} ¿Listo para analizar el mercado juntos?\n\n`
      ];
      
      let r = this.getRandomPhrase(greetings);
      r += `Estoy viendo **${ctx.emoji} ${ctx.name}** ahora mismo.\n\n`;
      r += `💵 Precio actual: **${ctx.price?.toFixed(ctx.decimals) || '---'}**\n`;
      
      if (ctx.priceChange != 0) {
        const direction = ctx.priceChange > 0 ? '📈 Subiendo' : '📉 Bajando';
        r += `${direction} ${Math.abs(ctx.priceChange)}% en las últimas velas\n\n`;
      }
      
      r += `¿Qué quieres saber? Puedo contarte sobre:\n`;
      r += `• El análisis actual del gráfico\n`;
      r += `• Las zonas de entrada\n`;
      r += `• Qué operación buscar\n`;
      r += `• O pregúntame lo que quieras 😊`;
      
      return { answer: r, type: 'greeting' };
    }

    // ═══════════════════════════════════════════
    // ANÁLISIS COMPLETO
    // ═══════════════════════════════════════════
    if (q.includes('analisis') || q.includes('analiza') || q.includes('que ves') || q.includes('grafico') || q.includes('chart')) {
      let r = `📊 **Análisis de ${ctx.name}**\n\n`;
      r += `Déjame contarte lo que veo en el gráfico...\n\n`;
      
      // Precio y movimiento
      r += `💵 **Precio:** ${ctx.price?.toFixed(ctx.decimals)}\n`;
      if (ctx.priceChange != 0) {
        const emoji = ctx.priceChange > 0 ? '🟢' : '🔴';
        r += `${emoji} Movimiento reciente: ${ctx.priceChange > 0 ? '+' : ''}${ctx.priceChange}%\n\n`;
      }
      
      // Estructura
      r += `**📈 ESTRUCTURA:**\n`;
      if (ctx.structureM5 === 'BULLISH') {
        r += `• M5 está **ALCISTA** - Veo máximos y mínimos más altos. Los compradores tienen el control.\n`;
      } else if (ctx.structureM5 === 'BEARISH') {
        r += `• M5 está **BAJISTA** - Veo máximos y mínimos más bajos. Los vendedores dominan.\n`;
      } else {
        r += `• M5 está **NEUTRAL** - No hay una dirección clara, el mercado está consolidando.\n`;
      }
      
      if (ctx.h1Loaded) {
        if (ctx.structureH1 === 'BULLISH') {
          r += `• H1 está **ALCISTA** - La tendencia mayor es de compra.\n`;
        } else if (ctx.structureH1 === 'BEARISH') {
          r += `• H1 está **BAJISTA** - La tendencia mayor es de venta.\n`;
        } else {
          r += `• H1 está **NEUTRAL** - Sin tendencia clara en temporalidad mayor.\n`;
        }
        
        if (ctx.mtfConfluence) {
          r += `\n✨ **¡HAY CONFLUENCIA MTF!** Ambas temporalidades apuntan en la misma dirección. Esto es muy bueno para operar.\n`;
        }
      } else {
        r += `• H1: Cargando datos...\n`;
      }
      
      // Premium/Discount
      r += `\n**💰 CONTEXTO DE PRECIO:**\n`;
      if (ctx.premiumDiscount === 'PREMIUM') {
        r += `El precio está en zona **PREMIUM** (caro). Es mejor buscar VENTAS aquí.\n`;
      } else if (ctx.premiumDiscount === 'DISCOUNT') {
        r += `El precio está en zona **DISCOUNT** (barato). Es mejor buscar COMPRAS aquí.\n`;
      } else {
        r += `El precio está en **EQUILIBRIO**. Podría ir para cualquier lado.\n`;
      }
      
      // Zonas
      r += `\n**📦 ZONAS DETECTADAS:**\n`;
      r += `• ${ctx.demandZones.length} zonas de demanda (compra)\n`;
      r += `• ${ctx.supplyZones.length} zonas de oferta (venta)\n`;
      
      if (ctx.fvgZones.length > 0) {
        r += `• ${ctx.fvgZones.length} FVG (gaps de precio)\n`;
      }
      
      // CHoCH / BOS
      if (ctx.choch) {
        r += `\n⚡ **ALERTA:** Detecté un ${ctx.choch.type === 'BULLISH_CHOCH' ? 'cambio alcista' : 'cambio bajista'} en la estructura (CHoCH).\n`;
      }
      if (ctx.bos) {
        r += `📈 **BOS detectado:** ${ctx.bos.type === 'BULLISH_BOS' ? 'Ruptura alcista' : 'Ruptura bajista'} confirmada.\n`;
      }
      
      // Recomendación
      r += `\n**🎯 MI OPINIÓN:**\n`;
      if (ctx.lockedSignal) {
        r += `Tenemos una señal **${ctx.lockedSignal.action}** activa con score de ${ctx.lockedSignal.score}%. ¡Ya estamos en el mercado!`;
      } else if (ctx.mtfConfluence) {
        const side = ctx.structureH1 === 'BULLISH' ? 'COMPRAS' : 'VENTAS';
        r += `Con la confluencia MTF, me gusta buscar **${side}**. Solo falta esperar un buen pullback a zona.`;
      } else {
        r += `Ahora mismo no veo un setup claro. Te recomiendo esperar a que el mercado defina mejor su dirección.`;
      }
      
      return { answer: r, type: 'analysis' };
    }

    // ═══════════════════════════════════════════
    // SEÑAL ACTIVA
    // ═══════════════════════════════════════════
    if (q.includes('senal') || q.includes('signal') || q.includes('operacion') || q.includes('trade') || q.includes('entrada')) {
      if (ctx.lockedSignal) {
        const s = ctx.lockedSignal;
        let r = `🎯 **¡Tenemos una operación activa!**\n\n`;
        r += `${s.action === 'LONG' ? '🟢 COMPRA' : '🔴 VENTA'} en **${ctx.name}**\n\n`;
        r += `📊 Modelo: **${s.model}**\n`;
        r += `💪 Score: **${s.score}%**\n\n`;
        r += `**Niveles:**\n`;
        r += `• Entry: ${s.entry}\n`;
        r += `• Stop Loss: ${s.stop} ${s.trailingActive ? '(🔄 Trailing activo)' : ''}\n`;
        r += `• TP1: ${s.tp1} ${s.tp1Hit ? '✅ ¡Alcanzado!' : ''}\n`;
        r += `• TP2: ${s.tp2} ${s.tp2Hit ? '✅ ¡Alcanzado!' : ''}\n`;
        r += `• TP3: ${s.tp3} ${s.tp3Hit ? '✅ ¡Alcanzado!' : ''}\n\n`;
        
        const currentPrice = ctx.price;
        const entry = s.entry;
        const pips = s.action === 'LONG' ? currentPrice - entry : entry - currentPrice;
        
        if (pips > 0) {
          r += `💚 Estamos en **profit** ahora mismo (+${pips.toFixed(ctx.decimals)})`;
        } else if (pips < 0) {
          r += `💛 Estamos en **pérdida temporal** (${pips.toFixed(ctx.decimals)})`;
        } else {
          r += `⚪ Estamos en **breakeven**`;
        }
        
        return { answer: r, type: 'signal' };
      }
      
      let r = `⏳ **No hay señal activa ahora mismo**\n\n`;
      r += `Score actual: ${ctx.signal?.score || 0}%\n`;
      r += `Estado: ${ctx.signal?.reason || 'Esperando setup'}\n\n`;
      
      if (ctx.signal?.score >= 50) {
        r += `💡 Estamos cerca de una señal. Solo falta que se cumplan algunas condiciones más.`;
      } else {
        r += `El mercado no me está mostrando una oportunidad clara. Paciencia, las mejores operaciones requieren esperar el momento correcto.`;
      }
      
      return { answer: r, type: 'waiting' };
    }

    // ═══════════════════════════════════════════
    // PLAN / QUÉ BUSCAR
    // ═══════════════════════════════════════════
    if (q.includes('plan') || q.includes('buscar') || q.includes('hacer') || q.includes('estrategia') || q.includes('idea')) {
      let r = `🎯 **Plan de Trading para ${ctx.name}**\n\n`;
      
      if (ctx.mtfConfluence) {
        if (ctx.structureH1 === 'BULLISH') {
          r += `✅ **BUSCAR COMPRAS**\n\n`;
          r += `Tenemos confluencia MTF alcista, esto es ideal.\n\n`;
          r += `**¿Cómo entrar?**\n`;
          r += `1. Esperar que el precio baje a una zona de demanda\n`;
          r += `2. Ver una vela de rechazo (mecha inferior larga)\n`;
          r += `3. Entrar en la siguiente vela alcista\n\n`;
          
          if (ctx.premiumDiscount === 'DISCOUNT') {
            r += `💎 **¡BONUS!** El precio está en DISCOUNT. Es el mejor momento para buscar compras.\n`;
          } else if (ctx.premiumDiscount === 'PREMIUM') {
            r += `⚠️ El precio está en PREMIUM. Esperaría un retroceso antes de comprar.\n`;
          }
          
          if (ctx.demandZones.length > 0) {
            const bestZone = ctx.demandZones[ctx.demandZones.length - 1];
            r += `\n📍 Zona de demanda más cercana: ${bestZone.low.toFixed(ctx.decimals)} - ${bestZone.high.toFixed(ctx.decimals)}`;
          }
          
        } else {
          r += `✅ **BUSCAR VENTAS**\n\n`;
          r += `Tenemos confluencia MTF bajista, esto es ideal.\n\n`;
          r += `**¿Cómo entrar?**\n`;
          r += `1. Esperar que el precio suba a una zona de oferta\n`;
          r += `2. Ver una vela de rechazo (mecha superior larga)\n`;
          r += `3. Entrar en la siguiente vela bajista\n\n`;
          
          if (ctx.premiumDiscount === 'PREMIUM') {
            r += `💎 **¡BONUS!** El precio está en PREMIUM. Es el mejor momento para buscar ventas.\n`;
          } else if (ctx.premiumDiscount === 'DISCOUNT') {
            r += `⚠️ El precio está en DISCOUNT. Esperaría un rebote antes de vender.\n`;
          }
          
          if (ctx.supplyZones.length > 0) {
            const bestZone = ctx.supplyZones[ctx.supplyZones.length - 1];
            r += `\n📍 Zona de oferta más cercana: ${bestZone.low.toFixed(ctx.decimals)} - ${bestZone.high.toFixed(ctx.decimals)}`;
          }
        }
      } else {
        r += `⚠️ **ESPERAR CONFLUENCIA**\n\n`;
        r += `Ahora mismo M5 dice "${ctx.structureM5}" y H1 dice "${ctx.structureH1}".\n\n`;
        r += `No están de acuerdo, así que es mejor no operar.\n\n`;
        r += `**¿Qué hacer?**\n`;
        r += `• Esperar a que ambas temporalidades se alineen\n`;
        r += `• O buscar otro activo con mejor setup\n\n`;
        r += `Recuerda: No operar también es una decisión inteligente 🧠`;
      }
      
      return { answer: r, type: 'plan' };
    }

    // ═══════════════════════════════════════════
    // ZONAS
    // ═══════════════════════════════════════════
    if (q.includes('zona') || q.includes('demanda') || q.includes('oferta') || q.includes('soporte') || q.includes('resistencia')) {
      let r = `📦 **Zonas en ${ctx.name}**\n\n`;
      
      r += `**🟢 ZONAS DE DEMANDA (Compra):**\n`;
      if (ctx.demandZones.length > 0) {
        ctx.demandZones.forEach((z, i) => {
          r += `${i + 1}. ${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)} `;
          r += z.strength === 'STRONG' ? '💪 Fuerte\n' : '👍 Normal\n';
        });
      } else {
        r += `No veo zonas de demanda activas\n`;
      }
      
      r += `\n**🔴 ZONAS DE OFERTA (Venta):**\n`;
      if (ctx.supplyZones.length > 0) {
        ctx.supplyZones.forEach((z, i) => {
          r += `${i + 1}. ${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)} `;
          r += z.strength === 'STRONG' ? '💪 Fuerte\n' : '👍 Normal\n';
        });
      } else {
        r += `No veo zonas de oferta activas\n`;
      }
      
      if (ctx.fvgZones.length > 0) {
        r += `\n**📊 FVG (Fair Value Gaps):**\n`;
        ctx.fvgZones.forEach((f, i) => {
          r += `${i + 1}. ${f.type === 'BULLISH_FVG' ? '🟢' : '🔴'} ${f.low.toFixed(ctx.decimals)} - ${f.high.toFixed(ctx.decimals)}\n`;
        });
      }
      
      return { answer: r, type: 'zones' };
    }

    // ═══════════════════════════════════════════
    // STATS
    // ═══════════════════════════════════════════
    if (q.includes('stat') || q.includes('resultado') || q.includes('rendimiento') || q.includes('win')) {
      const wr = stats.wins + stats.losses > 0 ? Math.round(stats.wins / (stats.wins + stats.losses) * 100) : 0;
      
      let r = `📈 **Estadísticas de Trading**\n\n`;
      r += `**Win Rate:** ${wr}%\n`;
      r += `**Operaciones:** ${stats.total} total\n`;
      r += `• ✅ Wins: ${stats.wins}\n`;
      r += `• ❌ Losses: ${stats.losses}\n`;
      r += `• ⏳ Pendientes: ${stats.pending}\n\n`;
      r += `**TPs Alcanzados:**\n`;
      r += `• TP1: ${stats.tp1Hits}\n`;
      r += `• TP2: ${stats.tp2Hits}\n`;
      r += `• TP3: ${stats.tp3Hits} 💎\n\n`;
      
      if (wr >= 60) {
        r += `🎉 ¡Excelente rendimiento! Sigue así.`;
      } else if (wr >= 40) {
        r += `👍 Buen trabajo. Hay espacio para mejorar.`;
      } else if (stats.total > 5) {
        r += `💪 Los resultados mejorarán con práctica y paciencia.`;
      }
      
      return { answer: r, type: 'stats' };
    }

    // ═══════════════════════════════════════════
    // PRECIO
    // ═══════════════════════════════════════════
    if (q.includes('precio') || q.includes('cuanto') || q.includes('cotiza') || q.includes('vale')) {
      let r = `💵 **${ctx.name}** está en **${ctx.price?.toFixed(ctx.decimals)}**\n\n`;
      
      if (ctx.priceChange != 0) {
        const emoji = ctx.priceChange > 0 ? '📈' : '📉';
        const direction = ctx.priceChange > 0 ? 'subiendo' : 'bajando';
        r += `${emoji} Está ${direction} ${Math.abs(ctx.priceChange)}% en las últimas velas.\n`;
      }
      
      if (ctx.premiumDiscount === 'PREMIUM') {
        r += `\n⚠️ El precio está en zona PREMIUM (caro).`;
      } else if (ctx.premiumDiscount === 'DISCOUNT') {
        r += `\n💎 El precio está en zona DISCOUNT (barato).`;
      }
      
      return { answer: r, type: 'price' };
    }

    // ═══════════════════════════════════════════
    // MODELOS / COMO FUNCIONA
    // ═══════════════════════════════════════════
    if (q.includes('modelo') || q.includes('como funciona') || q.includes('explicar') || q.includes('que es')) {
      let r = `🧠 **Mis 6 Modelos de Análisis**\n\n`;
      r += `Uso conceptos de Smart Money (SMC) para encontrar las mejores entradas:\n\n`;
      r += `**1. MTF_CONFLUENCE (95pts)** ⭐\n`;
      r += `Cuando H1 y M5 van en la misma dirección + hay pullback. Es mi favorito.\n\n`;
      r += `**2. CHOCH_PULLBACK (90pts)**\n`;
      r += `Cuando el mercado cambia de dirección y luego hace pullback.\n\n`;
      r += `**3. LIQUIDITY_SWEEP (85pts)**\n`;
      r += `Cuando el precio "caza" stops y luego revierte.\n\n`;
      r += `**4. BOS_CONTINUATION (80pts)**\n`;
      r += `Cuando hay ruptura de estructura con pullback.\n\n`;
      r += `**5. FVG_ENTRY (75pts)**\n`;
      r += `Entrada en un gap de precio (Fair Value Gap).\n\n`;
      r += `**6. ORDER_FLOW (70pts)**\n`;
      r += `Entrada basada en momentum fuerte.\n\n`;
      r += `¿Quieres que te explique alguno en detalle? 😊`;
      
      return { answer: r, type: 'models' };
    }

    // ═══════════════════════════════════════════
    // AYUDA
    // ═══════════════════════════════════════════
    if (q.includes('ayuda') || q.includes('help') || q.includes('comando')) {
      let r = `💜 **¿En qué te puedo ayudar?**\n\n`;
      r += `Puedes preguntarme:\n\n`;
      r += `📊 **"Análisis"** - Te cuento todo lo que veo en el gráfico\n`;
      r += `🎯 **"Plan"** - Te digo qué operación buscar\n`;
      r += `📦 **"Zonas"** - Te muestro las zonas de entrada\n`;
      r += `💵 **"Precio"** - Te digo el precio actual\n`;
      r += `🎯 **"Señal"** - Te muestro la operación activa\n`;
      r += `📈 **"Stats"** - Nuestros resultados\n`;
      r += `🧠 **"Modelos"** - Cómo funcionan mis análisis\n\n`;
      r += `O simplemente pregúntame lo que quieras sobre el mercado 😊`;
      
      return { answer: r, type: 'help' };
    }

    // ═══════════════════════════════════════════
    // RESPUESTA DEFAULT - MÁS CONVERSACIONAL
    // ═══════════════════════════════════════════
    let r = `Hmm, déjame pensar sobre "${question}"...\n\n`;
    r += `${ctx.emoji} **${ctx.name}** @ ${ctx.price?.toFixed(ctx.decimals)}\n\n`;
    r += `📊 M5: ${ctx.structureM5} | H1: ${ctx.structureH1}\n`;
    if (ctx.mtfConfluence) r += `✨ Confluencia MTF activa\n`;
    r += `\n¿Quieres que te haga un análisis completo? Solo dime "análisis" 😊`;
    
    return { answer: r, type: 'default' };
  }
};

// =============================================
// AUTO-TRACKING CON TRAILING STOP
// =============================================
function checkSignalHits() {
  for (const [symbol, data] of Object.entries(assetData)) {
    const locked = data.lockedSignal;
    if (!locked || !data.price) continue;
    
    const price = data.price;
    const isLong = locked.action === 'LONG';
    const signal = signalHistory.find(s => s.id === locked.id);
    if (!signal || signal.status !== 'PENDING') continue;
    
    const config = ASSETS[symbol];
    
    // ═══════════════════════════════════════════
    // TRAILING STOP LOGIC
    // ═══════════════════════════════════════════
    
    // Después de TP1: Mover SL a Entry (breakeven)
    if (signal.tp1Hit && !signal.trailingTP1) {
      signal.trailingTP1 = true;
      signal.originalStop = signal.stop;
      signal.stop = signal.entry;
      locked.stop = signal.entry;
      locked.trailingActive = true;
      console.log(`🔄 TRAILING #${signal.id}: SL movido a Breakeven (${signal.entry})`);
    }
    
    // Después de TP2: Mover SL a TP1
    if (signal.tp2Hit && !signal.trailingTP2) {
      signal.trailingTP2 = true;
      signal.stop = signal.tp1;
      locked.stop = signal.tp1;
      console.log(`🔄 TRAILING #${signal.id}: SL movido a TP1 (${signal.tp1})`);
    }
    
    // ═══════════════════════════════════════════
    // CHECK SL (con trailing)
    // ═══════════════════════════════════════════
    const currentSL = signal.stop;
    
    if ((isLong && price <= currentSL) || (!isLong && price >= currentSL)) {
      // Si ya tocó TP1, es WIN parcial, no LOSS
      if (signal.tp1Hit) {
        closeSignal(signal.id, 'WIN', symbol);
        console.log(`✅ #${signal.id} cerrado en TRAILING STOP (WIN parcial - TP1 alcanzado)`);
      } else {
        closeSignal(signal.id, 'LOSS', symbol);
      }
      continue;
    }
    
    // ═══════════════════════════════════════════
    // CHECK TPs
    // ═══════════════════════════════════════════
    if (isLong) {
      if (price >= locked.tp1 && !signal.tp1Hit) { 
        signal.tp1Hit = locked.tp1Hit = true; 
        stats.tp1Hits++; 
        console.log(`🎯 TP1 HIT #${signal.id} - Activando trailing stop`);
      }
      if (price >= locked.tp2 && !signal.tp2Hit) { 
        signal.tp2Hit = locked.tp2Hit = true; 
        stats.tp2Hits++; 
        console.log(`🎯 TP2 HIT #${signal.id}`);
      }
      if (price >= locked.tp3 && !signal.tp3Hit) { 
        signal.tp3Hit = locked.tp3Hit = true; 
        stats.tp3Hits++; 
        closeSignal(signal.id, 'WIN', symbol); 
        console.log(`💎 TP3 HIT #${signal.id} - TRADE COMPLETO`);
      }
    } else {
      if (price <= locked.tp1 && !signal.tp1Hit) { 
        signal.tp1Hit = locked.tp1Hit = true; 
        stats.tp1Hits++; 
        console.log(`🎯 TP1 HIT #${signal.id} - Activando trailing stop`);
      }
      if (price <= locked.tp2 && !signal.tp2Hit) { 
        signal.tp2Hit = locked.tp2Hit = true; 
        stats.tp2Hits++; 
        console.log(`🎯 TP2 HIT #${signal.id}`);
      }
      if (price <= locked.tp3 && !signal.tp3Hit) { 
        signal.tp3Hit = locked.tp3Hit = true; 
        stats.tp3Hits++; 
        closeSignal(signal.id, 'WIN', symbol); 
        console.log(`💎 TP3 HIT #${signal.id} - TRADE COMPLETO`);
      }
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
    stats.learning.scoreAdjustments[signal.model] = (stats.learning.scoreAdjustments[signal.model] || 0) + 2;
  } else if (status === 'LOSS') {
    stats.losses++;
    stats.byModel[signal.model].losses++;
    stats.byAsset[signal.symbol].losses++;
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
    console.error('Error:', err);
    setTimeout(connectDeriv, 5000);
    return;
  }
  
  derivWs.on('open', () => {
    console.log('✅ Conectado a Deriv');
    isConnected = true;
    reconnectAttempts = 0;
    
    for (const symbol of Object.keys(ASSETS)) {
      derivWs.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: 100,
        end: 'latest',
        granularity: 300,
        style: 'candles',
        subscribe: 1
      }));
      
      requestH1(symbol);
      derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    }
  });
  
  derivWs.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData);
      
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
          analyzeAsset(symbol);
        }
      }
      
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
      
      if (msg.tick) {
        const symbol = msg.tick.symbol;
        if (assetData[symbol]) {
          assetData[symbol].price = +msg.tick.quote;
          checkSignalHits();
        }
      }
      
    } catch (err) { /* ignore */ }
  });
  
  derivWs.on('close', () => {
    console.log('❌ Desconectado');
    isConnected = false;
    reconnectAttempts++;
    setTimeout(connectDeriv, Math.min(5000 * reconnectAttempts, 30000));
  });
  
  derivWs.on('error', (err) => console.error('WS Error:', err.message));
}

function requestH1(symbol) {
  if (derivWs?.readyState === WebSocket.OPEN) {
    derivWs.send(JSON.stringify({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: 100,
      end: 'latest',
      granularity: 3600,
      style: 'candles'
    }));
  }
}

// =============================================
// ANÁLISIS DE ACTIVOS (con Telegram)
// =============================================
function analyzeAsset(symbol) {
  const data = assetData[symbol];
  const config = ASSETS[symbol];
  
  if (!data || !config || data.candles.length < 30) return;
  
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
        originalStop: signal.stop,
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
      sendTelegramSignal(newSignal);
    }
  }
}

// =============================================
// API ENDPOINTS - BÁSICOS
// =============================================
app.get('/', (req, res) => res.json({ 
  name: 'Trading Master Pro', 
  version: '13.1', 
  connected: isConnected,
  supabase: !!supabase 
}));

app.get('/api/dashboard', (req, res) => {
  res.json({
    connected: isConnected,
    timestamp: Date.now(),
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
    plans: PLANS
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
  res.json(Elisa.chat(question || '', symbol || 'stpRNG'));
});

// =============================================
// API ENDPOINTS - SUSCRIPCIONES
// =============================================
app.get('/api/plans', (req, res) => {
  res.json({ plans: PLANS });
});

app.get('/api/subscription/:userId', async (req, res) => {
  const { userId } = req.params;
  
  // Default: Free trial de 5 días
  const trialEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const defaultSub = {
    status: 'trial',
    plan: 'free',
    plan_name: 'Free Trial',
    trial_ends_at: trialEnd.toISOString(),
    days_left: 5,
    assets: PLANS.free.assets
  };
  
  try {
    const sub = await getSubscription(userId);
    
    if (!sub) {
      // Usuario nuevo - crear trial
      const newSub = {
        id_de_usuario: userId,
        estado: 'trial',
        plan: 'free',
        trial_ends_at: trialEnd.toISOString(),
        created_at: new Date().toISOString()
      };
      await saveSubscription(newSub);
      return res.json({ subscription: defaultSub });
    }
    
    // Verificar si trial expiró
    if (sub.estado === 'trial' && sub.trial_ends_at) {
      const trialEnds = new Date(sub.trial_ends_at);
      const now = new Date();
      const daysLeft = Math.max(0, Math.ceil((trialEnds - now) / (1000 * 60 * 60 * 24)));
      
      if (daysLeft <= 0) {
        // Trial expirado
        sub.estado = 'expired';
        await saveSubscription(sub);
        return res.json({ 
          subscription: { 
            status: 'expired', 
            plan: 'none',
            plan_name: 'Expirado',
            days_left: 0,
            assets: []
          } 
        });
      }
      
      return res.json({ 
        subscription: {
          status: 'trial',
          plan: 'free',
          plan_name: 'Free Trial',
          trial_ends_at: sub.trial_ends_at,
          days_left: daysLeft,
          assets: PLANS.free.assets
        }
      });
    }
    
    // Usuario con plan activo
    const planKey = sub.plan || 'free';
    const plan = PLANS[planKey] || PLANS.free;
    
    return res.json({ 
      subscription: {
        status: sub.estado || 'active',
        plan: planKey,
        plan_name: plan.name,
        assets: plan.assets,
        period: sub.periodo
      }
    });
    
  } catch (error) {
    console.error('Subscription error:', error);
    res.json({ subscription: defaultSub });
  }
});

// =============================================
// API ENDPOINTS - ADMIN
// =============================================
app.get('/api/admin/users', async (req, res) => {
  try {
    const subs = await getAllSubscriptions();
    
    const users = (subs || []).map(sub => ({
      id: sub.id_de_usuario,
      email: sub.email || `user-${sub.id_de_usuario?.slice(0,8)}`,
      status: sub.estado,
      plan: sub.plan || 'free',
      plan_name: PLANS[sub.plan]?.name || 'Free Trial',
      period: sub.periodo,
      trial_ends_at: sub.trial_ends_at,
      created_at: sub.created_at
    }));
    
    const total = users.length;
    const trial = users.filter(u => u.status === 'trial').length;
    const active = users.filter(u => u.status === 'active' || u.status === 'activo').length;
    const expired = users.filter(u => u.status === 'expired').length;
    
    res.json({ 
      users, 
      stats: { total, trial, active, expired },
      storage: supabase ? 'supabase' : 'memory'
    });
  } catch (error) {
    res.json({ users: [], error: error.message });
  }
});

app.post('/api/admin/users', async (req, res) => {
  const { user_id, email, plan, status, period } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id requerido' });
  
  try {
    const subData = {
      id_de_usuario: user_id,
      email: email,
      plan: plan || 'elite',
      estado: status || 'active',
      periodo: period || 'mensual',
      trial_ends_at: status === 'trial' ? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() : null
    };
    
    const result = await saveSubscription(subData);
    res.json({ success: true, subscription: result.data?.[0] || subData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { plan, status, period } = req.body;
  
  try {
    const existing = await getSubscription(userId);
    const subData = {
      id_de_usuario: userId,
      email: existing?.email,
      plan: plan || existing?.plan || 'free',
      estado: status || existing?.estado || 'active',
      periodo: period || existing?.periodo || 'mensual',
      trial_ends_at: existing?.trial_ends_at
    };
    
    await saveSubscription(subData);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/users/:userId', async (req, res) => {
  try {
    await deleteSubscription(req.params.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// API ENDPOINTS - PAGOS WOMPI
// =============================================
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || '';
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || '';
const WOMPI_INTEGRITY_KEY = process.env.WOMPI_INTEGRITY_KEY || '';
const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || '';

app.post('/api/payments/wompi/create', async (req, res) => {
  const { plan, userId, email, period } = req.body;
  
  // Normalizar nombre del plan a minúsculas y sin acentos
  const planKey = plan?.toLowerCase()
    ?.normalize("NFD")
    ?.replace(/[\u0300-\u036f]/g, "")
    ?.replace('á', 'a')?.replace('é', 'e')?.replace('í', 'i')?.replace('ó', 'o')?.replace('ú', 'u') || '';
  
  const planInfo = PLANS[planKey];
  
  console.log(`💳 Intento de pago: plan="${plan}" -> planKey="${planKey}", userId=${userId}, email=${email}`);
  console.log(`   Planes disponibles: ${Object.keys(PLANS).join(', ')}`);
  
  if (!planInfo) {
    return res.status(400).json({ 
      error: 'Plan inválido', 
      received: plan,
      normalized: planKey,
      available: Object.keys(PLANS)
    });
  }
  
  if (!WOMPI_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Wompi no configurado' });
  }
  
  try {
    const reference = `TMP-${planKey.toUpperCase()}-${userId.slice(0,8)}-${Date.now()}`;
    const amountInCents = planInfo.price * 100;
    const billingPeriod = period || 'mensual';
    
    // Generar link de pago Wompi
    const paymentData = {
      name: `Trading Master Pro - ${planInfo.name}`,
      description: `Suscripción ${planInfo.name} (${billingPeriod})`,
      single_use: true,
      collect_shipping: false,
      currency: 'COP',
      amount_in_cents: amountInCents,
      redirect_url: `https://trading-master-pro.vercel.app/payment/success?ref=${reference}`,
      reference: reference,
      customer_data: { 
        email,
        full_name: email.split('@')[0]
      }
    };
    
    console.log(`   Creando pago Wompi: $${planInfo.price} COP, ref=${reference}`);
    
    const response = await fetch('https://production.wompi.co/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WOMPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentData)
    });
    
    const result = await response.json();
    
    if (result.data?.id) {
      console.log(`   ✅ Link de pago creado: ${result.data.id}`);
      res.json({ 
        success: true, 
        payment_url: `https://checkout.wompi.co/l/${result.data.id}`,
        reference 
      });
    } else {
      console.log(`   ❌ Error Wompi:`, result);
      res.status(400).json({ error: 'Error creando pago', details: result });
    }
  } catch (error) {
    console.log(`   ❌ Exception:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/webhooks/wompi', async (req, res) => {
  const event = req.body;
  
  console.log('🔔 Webhook Wompi recibido:', event.event);
  
  if (event.event === 'transaction.updated' && event.data?.transaction?.status === 'APPROVED') {
    const reference = event.data.transaction.reference;
    // TMP-ELITE-abc12345-1234567890
    const parts = reference.split('-');
    const planFromRef = parts[1]?.toLowerCase();
    const userIdShort = parts[2];
    
    console.log(`   Pago aprobado: ref=${reference}, plan=${planFromRef}`);
    
    // Buscar usuario por ID parcial
    if (userIdShort) {
      try {
        const subs = await getAllSubscriptions();
        const userSub = subs.find(s => s.id_de_usuario?.startsWith(userIdShort));
        
        if (userSub) {
          const updatedSub = {
            ...userSub,
            plan: planFromRef,
            estado: 'active',
            periodo: 'mensual',
            trial_ends_at: null,
            payment_date: new Date().toISOString()
          };
          
          await saveSubscription(updatedSub);
          console.log(`   ✅ Usuario actualizado: ${userSub.id_de_usuario} -> plan ${planFromRef}`);
        } else {
          console.log(`   ⚠️ Usuario no encontrado: ${userIdShort}`);
        }
      } catch (e) {
        console.log(`   ❌ Error actualizando usuario:`, e.message);
      }
    }
  }
  
  res.json({ received: true });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    version: '13.1',
    deriv: isConnected ? 'connected' : 'disconnected',
    supabase: !!supabase,
    telegram: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    assets: Object.keys(ASSETS).length,
    signals: signalHistory.length
  });
});


// =============================================
// INICIO DEL SERVIDOR
// =============================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║     TRADING MASTER PRO v13.1                   ║
║     Motor SMC + ELISA + Telegram + Supabase    ║
╠════════════════════════════════════════════════╣
║  Puerto: ${PORT}                                   ║
║  Supabase: ${supabase ? '✅ Conectado' : '❌ No configurado'}               ║
║  Telegram: ${TELEGRAM_BOT_TOKEN ? '✅ Configurado' : '❌ No configurado'}               ║
╚════════════════════════════════════════════════╝
  `);
  
  connectDeriv();
  
  // Actualizar H1 cada 2 minutos
  setInterval(() => {
    if (derivWs?.readyState === WebSocket.OPEN) {
      for (const symbol of Object.keys(ASSETS)) {
        requestH1(symbol);
      }
    }
  }, 120000);
  
  // Ping cada 30 segundos
  setInterval(() => {
    if (derivWs?.readyState === WebSocket.OPEN) {
      derivWs.send(JSON.stringify({ ping: 1 }));
    }
  }, 30000);
});

export default app;
