// =============================================
// TRADING MASTER PRO v14.0 - ELISA AI EDITION
// Motor SMC Puro + ELISA con OpenAI + Telegram + Supabase
// SIN indicadores tradicionales - Solo Smart Money Concepts
// =============================================

import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// =============================================
// CONFIGURACIÓN PRINCIPAL
// =============================================

const CONFIG = {
  MIN_SCORE: 75,
  ANALYSIS_COOLDOWN: 30000,
  POST_SIGNAL_COOLDOWN: 300000,
  MAX_PENDING_TOTAL: 5,
  TRADING_HOURS: { start: 7, end: 21 }
};

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// =============================================
// CARGAR MODELOS SMC DESDE JSON
// =============================================

let SMC_MODELS = {};
try {
  const modelsPath = path.join(__dirname, 'data', 'smc-models.json');
  if (fs.existsSync(modelsPath)) {
    SMC_MODELS = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
    console.log('✅ SMC Models JSON loaded');
  }
} catch (e) {
  console.log('⚠️ SMC Models JSON not found');
}

// =============================================
// CONFIGURACIÓN OPENAI
// =============================================

let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log('✅ OpenAI API configured for ELISA');
} else {
  console.log('⚠️ OPENAI_API_KEY not found - ELISA fallback mode');
}

// =============================================
// CONFIGURACIÓN TELEGRAM
// =============================================

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramSignal(signal) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const emoji = signal.action === 'LONG' ? '🟢' : '🔴';
    const actionText = signal.action === 'LONG' ? 'COMPRA' : 'VENTA';
    const message = `${emoji} *SEÑAL #${signal.id}*\n\n📊 *${signal.assetName}*\n📈 ${actionText}\n🎯 Modelo: ${signal.model}\n💯 Score: ${signal.score}%\n\n💰 Entry: ${signal.entry}\n🛑 SL: ${signal.stop}\n✅ TP1: ${signal.tp1}\n✅ TP2: ${signal.tp2}\n✅ TP3: ${signal.tp3}\n\n📝 ${signal.reason}\n🤖 ELISA AI`;
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' })
    });
    console.log(`📱 Telegram: Señal #${signal.id} enviada`);
  } catch (e) { console.log('⚠️ Telegram error:', e.message); }
}

// =============================================
// CONFIGURACIÓN SUPABASE
// =============================================

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log('✅ Supabase configured');
}

async function getSubscription(userId) {
  if (!supabase || !userId) return null;
  try {
    const { data } = await supabase.from('suscripciones').select('*').eq('email', userId).single();
    if (!data) return null;
    let trialDaysLeft = 0;
    if (data.trial_ends_at) {
      trialDaysLeft = Math.max(0, Math.ceil((new Date(data.trial_ends_at) - new Date()) / 86400000));
    }
    return { ...data, trial_days_left: trialDaysLeft };
  } catch (e) { return null; }
}

async function saveSubscription(userId, plan, status, period = 'mensual') {
  if (!supabase || !userId) return false;
  try {
    const { data: existing } = await supabase.from('suscripciones').select('id').eq('email', userId).single();
    const record = { email: userId, plan, estado: status, periodo: period };
    if (existing) await supabase.from('suscripciones').update(record).eq('email', userId);
    else await supabase.from('suscripciones').insert(record);
    return true;
  } catch (e) { return false; }
}

// =============================================
// CONFIGURACIÓN DE ACTIVOS
// =============================================

const ASSETS = {
  'stpRNG': { name: 'Step Index', decimals: 2 },
  '1HZ75V': { name: 'Volatility 75', decimals: 2 },
  'frxXAUUSD': { name: 'Gold (XAU/USD)', decimals: 2 },
  'frxGBPUSD': { name: 'GBP/USD', decimals: 5 },
  'cryBTCUSD': { name: 'Bitcoin', decimals: 2 },
  'BOOM1000': { name: 'Boom 1000', decimals: 2 },
  'BOOM500': { name: 'Boom 500', decimals: 2 },
  'CRASH1000': { name: 'Crash 1000', decimals: 2 },
  'CRASH500': { name: 'Crash 500', decimals: 2 }
};

// =============================================
// DATOS EN MEMORIA
// =============================================

const assetData = {};
const signalHistory = [];
let signalIdCounter = 1;
const stats = { wins: 0, losses: 0, total: 0, byModel: {}, byAsset: {}, learning: { scoreAdjustments: {} } };

for (const symbol of Object.keys(ASSETS)) {
  assetData[symbol] = { price: 0, candles: [], candlesH1: [], analysis: null, signal: null, lockedSignal: null, lastAnalysis: 0, lastSignalClosed: 0 };
  stats.byAsset[symbol] = { wins: 0, losses: 0, total: 0 };
}

// =============================================
// MOTOR SMC PURO v2.0 - Sin Indicadores
// =============================================

const SMCEngine = {
  findSwingPoints(candles, lookback = 5) {
    const swingHighs = [], swingLows = [];
    if (!candles || candles.length < lookback * 2 + 1) return { swingHighs, swingLows };
    for (let i = lookback; i < candles.length - lookback; i++) {
      const c = candles[i];
      let isHigh = true, isLow = true;
      for (let j = 1; j <= lookback; j++) {
        if (candles[i-j].high >= c.high || candles[i+j].high >= c.high) isHigh = false;
        if (candles[i-j].low <= c.low || candles[i+j].low <= c.low) isLow = false;
      }
      if (isHigh) swingHighs.push({ index: i, price: c.high, time: c.time });
      if (isLow) swingLows.push({ index: i, price: c.low, time: c.time });
    }
    return { swingHighs, swingLows };
  },

  determineTrend(candles) {
    if (!candles || candles.length < 20) return { trend: 'NEUTRAL', strength: 0 };
    const { swingHighs, swingLows } = this.findSwingPoints(candles);
    if (swingHighs.length < 2 || swingLows.length < 2) return { trend: 'NEUTRAL', strength: 0 };
    const rh = swingHighs.slice(-2), rl = swingLows.slice(-2);
    const hh = rh[1]?.price > rh[0]?.price, hl = rl[1]?.price > rl[0]?.price;
    const lh = rh[1]?.price < rh[0]?.price, ll = rl[1]?.price < rl[0]?.price;
    if (hh && hl) return { trend: 'BULLISH', strength: 80, structure: { hh, hl, lh, ll } };
    if (lh && ll) return { trend: 'BEARISH', strength: 80, structure: { hh, hl, lh, ll } };
    if (hh || hl) return { trend: 'BULLISH', strength: 50, structure: { hh, hl, lh, ll } };
    if (lh || ll) return { trend: 'BEARISH', strength: 50, structure: { hh, hl, lh, ll } };
    return { trend: 'NEUTRAL', strength: 0 };
  },

  detectBOS(candles) {
    if (!candles || candles.length < 20) return null;
    const { swingHighs, swingLows } = this.findSwingPoints(candles.slice(0, -3));
    const recent = candles.slice(-5);
    if (!swingHighs.length || !swingLows.length) return null;
    const lastHigh = swingHighs[swingHighs.length-1], lastLow = swingLows[swingLows.length-1];
    for (const c of recent) {
      if (c.close > lastHigh.price) return { type: 'BULLISH_BOS', side: 'BUY', level: lastHigh.price };
      if (c.close < lastLow.price) return { type: 'BEARISH_BOS', side: 'SELL', level: lastLow.price };
    }
    return null;
  },

  detectCHoCH(candles) {
    if (!candles || candles.length < 20) return null;
    const trend = this.determineTrend(candles.slice(0, -5));
    const { swingHighs, swingLows } = this.findSwingPoints(candles.slice(0, -3));
    const recent = candles.slice(-5);
    if (!swingHighs.length || !swingLows.length) return null;
    if (trend.trend === 'BEARISH') {
      const h = swingHighs[swingHighs.length-1];
      for (const c of recent) if (c.close > h.price) return { type: 'BULLISH_CHOCH', side: 'BUY', level: h.price };
    }
    if (trend.trend === 'BULLISH') {
      const l = swingLows[swingLows.length-1];
      for (const c of recent) if (c.close < l.price) return { type: 'BEARISH_CHOCH', side: 'SELL', level: l.price };
    }
    return null;
  },

  findDemandZones(candles) {
    const zones = [];
    if (!candles || candles.length < 5) return zones;
    for (let i = 2; i < candles.length - 1; i++) {
      const prev = candles[i-1], curr = candles[i], next = candles[i+1];
      if (prev.close < prev.open && curr.close > curr.open && next.close > next.open) {
        const imp = (next.high - prev.low) / prev.low * 100;
        if (imp >= 0.8) zones.push({ type: 'DEMAND', high: prev.high, low: prev.low, mid: (prev.high + prev.low) / 2, strength: Math.min(100, imp * 15) });
      }
    }
    return zones.slice(-5);
  },

  findSupplyZones(candles) {
    const zones = [];
    if (!candles || candles.length < 5) return zones;
    for (let i = 2; i < candles.length - 1; i++) {
      const prev = candles[i-1], curr = candles[i], next = candles[i+1];
      if (prev.close > prev.open && curr.close < curr.open && next.close < next.open) {
        const imp = (prev.high - next.low) / prev.high * 100;
        if (imp >= 0.8) zones.push({ type: 'SUPPLY', high: prev.high, low: prev.low, mid: (prev.high + prev.low) / 2, strength: Math.min(100, imp * 15) });
      }
    }
    return zones.slice(-5);
  },

  findFVGs(candles) {
    const fvgs = [];
    if (!candles || candles.length < 5) return fvgs;
    for (let i = 2; i < candles.length; i++) {
      const c1 = candles[i-2], c3 = candles[i];
      if (c3.low > c1.high) fvgs.push({ type: 'BULLISH_FVG', side: 'BUY', high: c3.low, low: c1.high, mid: (c3.low + c1.high) / 2 });
      if (c3.high < c1.low) fvgs.push({ type: 'BEARISH_FVG', side: 'SELL', high: c1.low, low: c3.high, mid: (c1.low + c3.high) / 2 });
    }
    return fvgs.slice(-5);
  },

  findLiquidityLevels(candles) {
    const { swingHighs, swingLows } = this.findSwingPoints(candles);
    const levels = [], tol = 0.001;
    for (let i = 0; i < swingHighs.length - 1; i++) {
      for (let j = i + 1; j < swingHighs.length; j++) {
        if (Math.abs(swingHighs[i].price - swingHighs[j].price) / swingHighs[i].price <= tol) {
          const avg = (swingHighs[i].price + swingHighs[j].price) / 2;
          if (!levels.find(l => l.type === 'EQUAL_HIGHS' && Math.abs(l.price - avg) / avg < tol))
            levels.push({ type: 'EQUAL_HIGHS', price: avg });
        }
      }
    }
    for (let i = 0; i < swingLows.length - 1; i++) {
      for (let j = i + 1; j < swingLows.length; j++) {
        if (Math.abs(swingLows[i].price - swingLows[j].price) / swingLows[i].price <= tol) {
          const avg = (swingLows[i].price + swingLows[j].price) / 2;
          if (!levels.find(l => l.type === 'EQUAL_LOWS' && Math.abs(l.price - avg) / avg < tol))
            levels.push({ type: 'EQUAL_LOWS', price: avg });
        }
      }
    }
    return levels;
  },

  detectLiquiditySweep(candles, levels) {
    const last3 = candles.slice(-3);
    for (const lv of levels) {
      for (const c of last3) {
        if (lv.type === 'EQUAL_HIGHS' && c.high > lv.price && c.close < lv.price) return { type: 'SWEEP_HIGHS', side: 'SELL', level: lv.price };
        if (lv.type === 'EQUAL_LOWS' && c.low < lv.price && c.close > lv.price) return { type: 'SWEEP_LOWS', side: 'BUY', level: lv.price };
      }
    }
    return null;
  },

  calculatePD(candles) {
    if (!candles || candles.length < 10) return { zone: 'NEUTRAL' };
    const rel = candles.slice(-50);
    let hi = -Infinity, lo = Infinity;
    for (const c of rel) { if (c.high > hi) hi = c.high; if (c.low < lo) lo = c.low; }
    const eq = lo + (hi - lo) * 0.5, price = rel[rel.length-1].close;
    return { highest: hi, lowest: lo, equilibrium: eq, zone: price > eq ? 'PREMIUM' : 'DISCOUNT' };
  },

  detectPullback(candles, demand, supply, fvgs) {
    if (!candles || candles.length < 3) return null;
    const last = candles[candles.length-1], price = last.close, tol = 0.002;
    const hasRejection = (c, dir) => {
      const body = Math.abs(c.close - c.open);
      if (dir === 'BUY') return (Math.min(c.close, c.open) - c.low) > body * 0.5;
      return (c.high - Math.max(c.close, c.open)) > body * 0.5;
    };
    for (const z of demand) {
      if (price >= z.low * (1-tol) && price <= z.high * (1+tol) && hasRejection(last, 'BUY')) {
        const r = z.high - z.low;
        return { type: 'DEMAND_PULLBACK', side: 'BUY', zone: z, entry: price, stop: z.low - r*0.5, tp1: price + r*1.5, tp2: price + r*2.5, tp3: price + r*4 };
      }
    }
    for (const z of supply) {
      if (price >= z.low * (1-tol) && price <= z.high * (1+tol) && hasRejection(last, 'SELL')) {
        const r = z.high - z.low;
        return { type: 'SUPPLY_PULLBACK', side: 'SELL', zone: z, entry: price, stop: z.high + r*0.5, tp1: price - r*1.5, tp2: price - r*2.5, tp3: price - r*4 };
      }
    }
    for (const f of fvgs) {
      if (price >= f.low * (1-tol) && price <= f.high * (1+tol)) {
        const r = f.high - f.low;
        return { type: 'FVG_PULLBACK', side: f.side, zone: f, entry: price, stop: f.side === 'BUY' ? f.low - r : f.high + r, tp1: f.side === 'BUY' ? price + r*2 : price - r*2, tp2: f.side === 'BUY' ? price + r*3 : price - r*3, tp3: f.side === 'BUY' ? price + r*4 : price - r*4 };
      }
    }
    return null;
  },

  analyze(candlesM5, candlesH1 = null) {
    const structureM5 = this.determineTrend(candlesM5);
    const structureH1 = candlesH1?.length > 10 ? this.determineTrend(candlesH1) : { trend: 'NEUTRAL', strength: 0 };
    const demandZones = this.findDemandZones(candlesM5);
    const supplyZones = this.findSupplyZones(candlesM5);
    const fvgZones = this.findFVGs(candlesM5);
    const liquidityLevels = this.findLiquidityLevels(candlesM5);
    const premiumDiscount = this.calculatePD(candlesM5);
    const bos = this.detectBOS(candlesM5);
    const choch = this.detectCHoCH(candlesM5);
    const liquiditySweep = this.detectLiquiditySweep(candlesM5, liquidityLevels);
    const mtfConfluence = structureM5.trend !== 'NEUTRAL' && structureH1.trend !== 'NEUTRAL' && structureM5.trend === structureH1.trend;
    const pullback = this.detectPullback(candlesM5, demandZones, supplyZones, fvgZones);
    return { structureM5, structureH1, demandZones, supplyZones, fvgZones, liquidityLevels, premiumDiscount, bos, choch, liquiditySweep, mtfConfluence, pullback, price: candlesM5[candlesM5.length-1]?.close || 0 };
  },

  generateSignal(analysis, decimals = 2) {
    const signals = [];
    const { structureM5, structureH1, mtfConfluence, pullback, bos, choch, liquiditySweep, premiumDiscount } = analysis;
    
    // 1. MTF CONFLUENCE (95pts)
    if (mtfConfluence && pullback) {
      const match = (structureH1.trend === 'BULLISH' && pullback.side === 'BUY') || (structureH1.trend === 'BEARISH' && pullback.side === 'SELL');
      if (match) {
        let score = 95;
        if (pullback.side === 'BUY' && premiumDiscount.zone === 'DISCOUNT') score += 5;
        if (pullback.side === 'SELL' && premiumDiscount.zone === 'PREMIUM') score += 5;
        signals.push({ model: 'MTF_CONFLUENCE', score, side: pullback.side, pullback, reason: `H1 ${structureH1.trend} + M5 + Pullback${score===100?' + PD':''}` });
      }
    }
    // 2. CHOCH PULLBACK (85-90pts)
    if (choch && pullback && choch.side === pullback.side) {
      const ok = (choch.side === 'BUY' && structureH1.trend !== 'BEARISH') || (choch.side === 'SELL' && structureH1.trend !== 'BULLISH');
      if (ok) signals.push({ model: 'CHOCH_PULLBACK', score: mtfConfluence ? 90 : 85, side: choch.side, pullback, reason: `${choch.type} + Pullback${mtfConfluence?' + MTF':''}` });
    }
    // 3. LIQUIDITY SWEEP (82pts)
    if (liquiditySweep && pullback && mtfConfluence && liquiditySweep.side === pullback.side)
      signals.push({ model: 'LIQUIDITY_SWEEP', score: 82, side: liquiditySweep.side, pullback, reason: `${liquiditySweep.type} + MTF` });
    // 4. BOS CONTINUATION (80pts)
    if (bos && pullback && bos.side === pullback.side && mtfConfluence)
      signals.push({ model: 'BOS_CONTINUATION', score: 80, side: bos.side, pullback, reason: `${bos.type} + Pullback + MTF` });
    // 5. ZONE TOUCH (78pts)
    if (pullback && mtfConfluence && (pullback.type.includes('DEMAND') || pullback.type.includes('SUPPLY'))) {
      const pdOk = (pullback.side === 'BUY' && premiumDiscount.zone === 'DISCOUNT') || (pullback.side === 'SELL' && premiumDiscount.zone === 'PREMIUM');
      if (pdOk) signals.push({ model: 'ZONE_TOUCH', score: 78, side: pullback.side, pullback, reason: `OB + ${premiumDiscount.zone} + MTF` });
    }
    // 6. FVG ENTRY (77pts)
    if (pullback?.type === 'FVG_PULLBACK' && mtfConfluence)
      signals.push({ model: 'FVG_ENTRY', score: 77, side: pullback.side, pullback, reason: `FVG + MTF` });

    if (!signals.length) {
      let reason = 'Esperando setup';
      if (!pullback) reason = 'Sin pullback a zona';
      else if (structureM5.trend === 'NEUTRAL') reason = 'M5 neutral';
      else if (!mtfConfluence) reason = 'Sin MTF confluence';
      return { action: 'WAIT', score: 0, model: 'WAIT', reason, analysis };
    }

    signals.sort((a, b) => b.score - a.score);
    const best = signals[0];
    const adj = stats.learning.scoreAdjustments[best.model] || 0;
    best.score = Math.min(100, Math.max(0, best.score + adj));

    if (best.score < CONFIG.MIN_SCORE)
      return { action: 'WAIT', score: best.score, model: best.model, reason: `Score ${best.score}% < ${CONFIG.MIN_SCORE}%`, analysis };

    const pb = best.pullback, fmt = n => +n.toFixed(decimals);
    return { action: best.side === 'BUY' ? 'LONG' : 'SHORT', model: best.model, score: best.score, entry: fmt(pb.entry), stop: fmt(pb.stop), tp1: fmt(pb.tp1), tp2: fmt(pb.tp2), tp3: fmt(pb.tp3), reason: best.reason, analysis };
  }
};

// =============================================
// ELISA IA - SISTEMA INTELIGENTE
// =============================================

const ELISA_PROMPT = `Eres ELISA (Expert Learning Intelligent Signal Analyst), una trader profesional de Smart Money Concepts.

PERSONALIDAD: Amigable, cercana, empática. Hablas natural, no robótico. 8+ años en trading institucional. Usas emojis con moderación. NUNCA dices que eres IA o bot.

EXPERTISE: SMC puro (Market Structure, Order Blocks, FVG, Liquidity, Premium/Discount). Operas M5 con confluencia H1. NO usas RSI, MACD, EMA.

TUS 6 MODELOS:
1. MTF Confluence (95pts) ⭐ - H1+M5 alineados + pullback
2. CHoCH Pullback (85-90pts) - Cambio de carácter + pullback
3. Liquidity Sweep (82pts) - Barrido de stops + reversión
4. BOS Continuation (80pts) - Ruptura de estructura + pullback
5. Zone Touch (78pts) - Toque de Order Block con rechazo
6. FVG Entry (77pts) - Precio llena Fair Value Gap

REGLAS: Score mínimo 75. Siempre esperas confirmación. R:R mínimo 1:1.5. Máx 3 posiciones.

RESPUESTAS: Concisas (máx 200 palabras). Explica el "por qué". Relaciona con Smart Money. Educa al trader.`;

async function elisaChat(message, context = {}) {
  try {
    if (!openai) return { success: false, response: getFallbackResponse(message, context), fallback: true };
    
    let sys = ELISA_PROMPT;
    if (context.marketData) {
      sys += `\n\nCONTEXTO: ${context.marketData.symbol} @ ${context.marketData.price}. M5: ${context.marketData.structureM5?.trend}. H1: ${context.marketData.structureH1?.trend}. MTF: ${context.marketData.mtfConfluence?'SÍ':'NO'}. PD: ${context.marketData.premiumDiscount?.zone}.`;
    }
    if (context.signal?.action !== 'WAIT') {
      sys += `\n\nSEÑAL ACTIVA: ${context.signal.model} ${context.signal.action} Score:${context.signal.score}% Entry:${context.signal.entry}`;
    }
    if (context.stats) sys += `\n\nSTATS: WinRate ${context.stats.winRate}% Total:${context.stats.total}`;

    const messages = [{ role: 'system', content: sys }];
    if (context.conversationHistory) messages.push(...context.conversationHistory.slice(-10));
    messages.push({ role: 'user', content: message });

    const completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages, temperature: 0.75, max_tokens: 800 });
    return { success: true, response: completion.choices[0]?.message?.content || getFallbackResponse(message, context), usage: completion.usage };
  } catch (e) {
    console.error('ELISA Error:', e.message);
    return { success: false, response: getFallbackResponse(message, context), error: e.message };
  }
}

function getFallbackResponse(msg, ctx = {}) {
  const q = msg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (q.includes('hola') || q.includes('hey')) return `¡Hey! 👋 Soy ELISA, tu compañera de trading SMC. ¿En qué te ayudo?`;
  if (q.includes('analisis') || q.includes('mercado') || q.includes('grafico')) {
    if (ctx.marketData && ctx.marketData.price > 0) {
      const m5 = ctx.marketData.structureM5?.trend || 'Analizando...';
      const h1 = ctx.marketData.structureH1?.trend || 'Analizando...';
      const mtf = ctx.marketData.mtfConfluence ? '✅' : '❌';
      const pd = ctx.marketData.premiumDiscount?.zone || 'Neutral';
      return `📊 **${ctx.marketData.symbol}:**\nPrecio: ${ctx.marketData.price}\nM5: **${m5}** | H1: **${h1}**\nMTF Confluence: ${mtf}\nZona: **${pd}**`;
    }
    return `📊 Estoy cargando los datos del mercado. Dame unos segundos y pregúntame de nuevo. ¿Qué activo te interesa analizar?`;
  }
  if (q.includes('senal') || q.includes('entrada')) {
    if (ctx.signal?.action && ctx.signal.action !== 'WAIT') return `🎯 **${ctx.signal.model}** ${ctx.signal.action}\nScore: ${ctx.signal.score}% | Entry: ${ctx.signal.entry}\nSL: ${ctx.signal.stop} | TP1: ${ctx.signal.tp1}`;
    return `🎯 Sin señal activa en este momento. Esperando setup de alta probabilidad (>75%). Calidad sobre cantidad 💎`;
  }
  if (q.includes('modelo') || q.includes('smc')) return `🧠 **Mis 6 Modelos SMC:**\n1️⃣ MTF Confluence (95pts) ⭐\n2️⃣ CHoCH Pullback (85-90pts)\n3️⃣ Liquidity Sweep (82pts)\n4️⃣ BOS Continuation (80pts)\n5️⃣ Zone Touch (78pts)\n6️⃣ FVG Entry (77pts)\n\n¿Quieres que te explique alguno?`;
  if (q.includes('order block') || q.includes('ob')) return `📦 **Order Blocks:** Última vela opuesta antes de impulso fuerte.\n\n• Bullish OB = última vela ROJA antes de subida\n• Bearish OB = última vela VERDE antes de bajada\n\n💡 Los OB frescos (primera vez tocados) son los más fuertes.`;
  if (q.includes('fvg') || q.includes('gap')) return `⚡ **FVG (Fair Value Gap):** Desequilibrio donde el mercado se movió muy rápido.\n\nEl precio tiende a llenar estos gaps antes de continuar. Es una zona de alta probabilidad para entradas.`;
  if (q.includes('liquidez') || q.includes('liquidity')) return `💧 **Liquidez:** Son los stops de otros traders. El Smart Money los caza para llenar sus órdenes.\n\n• Equal Highs = stops de vendedores\n• Equal Lows = stops de compradores`;
  if (q.includes('estructura') || q.includes('tendencia')) return `📈 **Market Structure:**\n\n• Alcista = HH + HL (Higher Highs + Higher Lows)\n• Bajista = LH + LL (Lower Highs + Lower Lows)\n\n🔄 BOS confirma tendencia\n⚠️ CHoCH señala posible cambio`;
  if (q.includes('premium') || q.includes('discount')) return `⚖️ **Premium/Discount:**\n\n• Arriba del 50% = PREMIUM (zona de venta)\n• Abajo del 50% = DISCOUNT (zona de compra)\n\n✅ Solo compra en DISCOUNT\n✅ Solo vende en PREMIUM`;
  if (q.includes('ayuda') || q.includes('help')) return `💜 **¿En qué te ayudo?**\n\n• "análisis" - Estado del mercado\n• "señal" - Operación activa\n• "modelos" - Los 6 modelos SMC\n• "order blocks" - Qué son los OB\n• "fvg" - Fair Value Gaps\n• "liquidez" - Cómo funciona`;
  return `Pregúntame sobre: análisis, señales, modelos SMC, order blocks, FVG, liquidez, estructura, premium/discount... 💜`;
}

// =============================================
// FUNCIONES DE TRADING
// =============================================

function recordResult(model, asset, result) {
  stats.total++; if (result === 'WIN') stats.wins++; else stats.losses++;
  if (!stats.byModel[model]) stats.byModel[model] = { wins: 0, losses: 0, total: 0 };
  stats.byModel[model].total++;
  if (result === 'WIN') { stats.byModel[model].wins++; stats.learning.scoreAdjustments[model] = Math.min(10, (stats.learning.scoreAdjustments[model]||0) + 2); }
  else { stats.byModel[model].losses++; stats.learning.scoreAdjustments[model] = Math.max(-15, (stats.learning.scoreAdjustments[model]||0) - 3); }
  if (stats.byAsset[asset]) { stats.byAsset[asset].total++; if (result === 'WIN') stats.byAsset[asset].wins++; else stats.byAsset[asset].losses++; }
}

function getStats() { return { ...stats, winRate: stats.total > 0 ? (stats.wins / stats.total * 100).toFixed(1) : 0 }; }

function checkSignalHits() {
  for (const [symbol, data] of Object.entries(assetData)) {
    const locked = data.lockedSignal;
    if (!locked || !data.price) continue;
    const sig = signalHistory.find(s => s.id === locked.id);
    if (!sig || sig.status !== 'PENDING') continue;
    const price = data.price, isLong = sig.action === 'LONG';
    if ((isLong && price >= locked.tp1) || (!isLong && price <= locked.tp1)) { if (!sig.tp1Hit) { sig.tp1Hit = true; locked.stop = locked.entry; console.log(`🎯 TP1 #${sig.id}`); } }
    if ((isLong && price >= locked.tp2) || (!isLong && price <= locked.tp2)) { if (!sig.tp2Hit) { sig.tp2Hit = true; locked.stop = locked.tp1; console.log(`🎯 TP2 #${sig.id}`); } }
    if ((isLong && price >= locked.tp3) || (!isLong && price <= locked.tp3)) { closeSignal(sig.id, 'WIN', symbol); continue; }
    if ((isLong && price <= locked.stop) || (!isLong && price >= locked.stop)) closeSignal(sig.id, sig.tp1Hit ? 'WIN' : 'LOSS', symbol);
  }
}

function closeSignal(id, result, symbol) {
  const sig = signalHistory.find(s => s.id === id);
  if (sig) { sig.status = result; sig.closedAt = Date.now(); }
  if (assetData[symbol]) { assetData[symbol].lockedSignal = null; assetData[symbol].lastSignalClosed = Date.now(); }
  recordResult(sig?.model || 'UNKNOWN', symbol, result);
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: `${result==='WIN'?'✅':'❌'} Señal #${id} cerrada: ${result}`, parse_mode: 'Markdown' })
    }).catch(() => {});
  }
  console.log(`${result==='WIN'?'✅':'❌'} #${id} ${result}`);
}

function analyzeAsset(symbol) {
  const data = assetData[symbol], config = ASSETS[symbol];
  if (!data || !config || data.candles.length < 50) return null;
  const now = Date.now();
  if (now - data.lastAnalysis < CONFIG.ANALYSIS_COOLDOWN) return null;
  if (data.lockedSignal) return null;
  if (now - data.lastSignalClosed < CONFIG.POST_SIGNAL_COOLDOWN) return null;
  const hour = new Date().getUTCHours();
  if (hour < CONFIG.TRADING_HOURS.start || hour >= CONFIG.TRADING_HOURS.end) return null;
  if (Object.values(assetData).filter(d => d.lockedSignal).length >= CONFIG.MAX_PENDING_TOTAL) return null;
  
  data.lastAnalysis = now;
  const analysis = SMCEngine.analyze(data.candles, data.candlesH1);
  const signal = SMCEngine.generateSignal(analysis, config.decimals);
  data.analysis = analysis; data.signal = signal;
  
  if (signal.action !== 'WAIT') {
    const id = signalIdCounter++;
    const full = { id, symbol, assetName: config.name, ...signal, status: 'PENDING', createdAt: now };
    signalHistory.push(full); data.lockedSignal = full;
    console.log(`🎯 SEÑAL #${id}: ${config.name} ${signal.action} (${signal.model} ${signal.score}%)`);
    sendTelegramSignal(full);
    return full;
  }
  return null;
}

// =============================================
// DERIV WEBSOCKET
// =============================================

const DERIV_APP_ID = process.env.DERIV_APP_ID || '1089';
let derivWs = null, derivConnected = false;

function connectDeriv() {
  console.log('🔄 Conectando a Deriv...');
  derivWs = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`);
  
  derivWs.on('open', () => {
    derivConnected = true;
    console.log('✅ Deriv connected');
    
    for (const symbol of Object.keys(ASSETS)) {
      // Suscribir a ticks
      derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      
      // Obtener historial de velas M5
      derivWs.send(JSON.stringify({ 
        ticks_history: symbol, 
        count: 200, 
        end: 'latest', 
        style: 'candles', 
        granularity: 300,
        subscribe: 1 
      }));
      
      console.log(`📊 Suscrito a ${symbol}`);
    }
  });
  
  derivWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      // Error de Deriv
      if (msg.error) {
        console.log(`⚠️ Deriv error: ${msg.error.message}`);
        return;
      }
      
      // Tick update (precio actual)
      if (msg.tick?.symbol && assetData[msg.tick.symbol]) {
        assetData[msg.tick.symbol].price = msg.tick.quote;
      }
      
      // Historial de velas inicial
      if (msg.candles && msg.echo_req?.ticks_history) {
        const symbol = msg.echo_req.ticks_history;
        if (assetData[symbol]) {
          assetData[symbol].candles = msg.candles.map(c => ({ 
            time: c.epoch * 1000, 
            open: parseFloat(c.open), 
            high: parseFloat(c.high), 
            low: parseFloat(c.low), 
            close: parseFloat(c.close) 
          }));
          console.log(`📈 ${symbol}: ${msg.candles.length} velas cargadas`);
        }
      }
      
      // Vela en tiempo real (OHLC update)
      if (msg.ohlc?.symbol && assetData[msg.ohlc.symbol]) {
        const symbol = msg.ohlc.symbol;
        const candle = { 
          time: msg.ohlc.epoch * 1000, 
          open: parseFloat(msg.ohlc.open), 
          high: parseFloat(msg.ohlc.high), 
          low: parseFloat(msg.ohlc.low), 
          close: parseFloat(msg.ohlc.close) 
        };
        
        const candles = assetData[symbol].candles;
        if (!candles) {
          assetData[symbol].candles = [candle];
        } else if (candles.length && candles[candles.length - 1].time === candle.time) {
          candles[candles.length - 1] = candle;
        } else {
          candles.push(candle);
          if (candles.length > 200) candles.shift();
          // Nueva vela cerrada - analizar
          analyzeAsset(symbol);
        }
        
        // Actualizar precio también
        assetData[symbol].price = candle.close;
      }
      
    } catch (e) {
      // Ignorar errores de parse
    }
  });
  
  derivWs.on('close', () => { 
    derivConnected = false; 
    console.log('⚠️ Deriv disconnected, reconectando en 5s...'); 
    setTimeout(connectDeriv, 5000); 
  });
  
  derivWs.on('error', (e) => console.error('❌ Deriv error:', e.message));
}

// =============================================
// API ENDPOINTS
// =============================================

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '14.0', deriv: derivConnected, ai: !!openai }));

app.get('/api/market/:symbol', (req, res) => {
  const data = assetData[req.params.symbol];
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json({ symbol: req.params.symbol, name: ASSETS[req.params.symbol]?.name, price: data.price, analysis: data.analysis, signal: data.signal, lockedSignal: data.lockedSignal });
});

// Endpoint para obtener velas y análisis (usado por el frontend)
app.get('/api/analyze/:symbol', (req, res) => {
  const symbol = req.params.symbol;
  const data = assetData[symbol];
  
  if (!data) {
    return res.status(404).json({ error: 'Asset not found', candles: [], candlesH1: [] });
  }
  
  // Asegurar que las velas tienen el formato correcto
  const candles = (data.candles || []).map(c => ({
    time: c.time,
    open: parseFloat(c.open) || 0,
    high: parseFloat(c.high) || 0,
    low: parseFloat(c.low) || 0,
    close: parseFloat(c.close) || 0
  }));
  
  const candlesH1 = (data.candlesH1 || []).map(c => ({
    time: c.time,
    open: parseFloat(c.open) || 0,
    high: parseFloat(c.high) || 0,
    low: parseFloat(c.low) || 0,
    close: parseFloat(c.close) || 0
  }));
  
  console.log(`📊 /api/analyze/${symbol}: ${candles.length} velas M5, ${candlesH1.length} velas H1`);
  
  res.json({
    symbol,
    name: ASSETS[symbol]?.name || symbol,
    price: data.price || 0,
    candles,
    candlesH1,
    analysis: data.analysis ? {
      structureM5: data.analysis.structureM5,
      structureH1: data.analysis.structureH1,
      mtfConfluence: data.analysis.mtfConfluence,
      premiumDiscount: data.analysis.premiumDiscount,
      demandZones: data.analysis.demandZones || [],
      supplyZones: data.analysis.supplyZones || [],
      fvgZones: data.analysis.fvgZones || []
    } : null,
    signal: data.signal,
    lockedSignal: data.lockedSignal
  });
});

app.get('/api/signals/active', (req, res) => {
  const active = Object.entries(assetData).filter(([_,d]) => d.lockedSignal).map(([s,d]) => ({ symbol: s, ...d.lockedSignal }));
  res.json({ signals: active, count: active.length });
});

app.get('/api/signals/history', (req, res) => res.json({ signals: signalHistory.slice(-(req.query.limit||50)).reverse() }));
app.get('/api/stats', (req, res) => res.json(getStats()));

// Dashboard endpoint (para el frontend)
app.get('/api/dashboard', (req, res) => {
  const assets = Object.entries(assetData).map(([symbol, data]) => {
    const candleCount = data.candles?.length || 0;
    return {
      symbol,
      name: ASSETS[symbol]?.name || symbol,
      price: data.price || 0,
      change: 0,
      candles: data.candles || [],
      candlesH1: data.candlesH1 || [],
      analysis: data.analysis ? {
        structureM5: data.analysis.structureM5,
        structureH1: data.analysis.structureH1,
        mtfConfluence: data.analysis.mtfConfluence,
        premiumDiscount: data.analysis.premiumDiscount,
        demandZones: data.analysis.demandZones?.length || 0,
        supplyZones: data.analysis.supplyZones?.length || 0
      } : null,
      signal: data.signal,
      lockedSignal: data.lockedSignal,
      candleCount
    };
  });
  
  const activeSignals = Object.values(assetData).filter(d => d.lockedSignal).map(d => d.lockedSignal);
  const st = getStats();
  
  // Log para debug
  const totalCandles = assets.reduce((sum, a) => sum + (a.candleCount || 0), 0);
  if (totalCandles === 0) {
    console.log('⚠️ Dashboard: No hay velas cargadas aún');
  }
  
  res.json({
    assets,
    signals: activeSignals,
    stats: {
      winRate: st.winRate || 0,
      wins: st.wins || 0,
      losses: st.losses || 0,
      total: st.total || 0,
      tp3Hits: signalHistory.filter(s => s.status === 'WIN' && !s.tp1Hit).length
    },
    connected: derivConnected,
    totalCandles
  });
});

// Alias para compatibilidad con frontend anterior
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { question, symbol } = req.body;
    if (!question) return res.status(400).json({ error: 'Question required', answer: 'Por favor, escribe tu pregunta.' });
    const ctx = { stats: getStats() };
    if (symbol && assetData[symbol]) {
      const d = assetData[symbol];
      ctx.marketData = { symbol, price: d.price, structureM5: d.analysis?.structureM5, structureH1: d.analysis?.structureH1, mtfConfluence: d.analysis?.mtfConfluence, premiumDiscount: d.analysis?.premiumDiscount };
      ctx.signal = d.signal || d.lockedSignal;
    }
    const result = await elisaChat(question, ctx);
    res.json({ answer: result.response, success: result.success });
  } catch (e) { res.status(500).json({ error: e.message, answer: 'Error de conexión. Intenta de nuevo.' }); }
});

app.get('/api/subscription/:userId', async (req, res) => {
  const userId = req.params.userId;
  console.log('📋 Buscando suscripción para:', userId);
  
  // Mapeo de planes a nombres y activos
  const PLAN_CONFIG = {
    free: { name: 'Free Trial', assets: ['stpRNG', '1HZ75V', 'frxXAUUSD', 'frxGBPUSD', 'cryBTCUSD', 'BOOM1000', 'BOOM500', 'CRASH1000', 'CRASH500'] },
    basico: { name: 'Plan Básico', assets: ['stpRNG', '1HZ75V', 'frxXAUUSD', 'cryBTCUSD'] },
    premium: { name: 'Plan Premium', assets: ['stpRNG', '1HZ75V', 'frxXAUUSD', 'frxGBPUSD', 'cryBTCUSD', 'BOOM1000', 'CRASH1000'] },
    elite: { name: 'Plan Elite', assets: ['stpRNG', '1HZ75V', 'frxXAUUSD', 'frxGBPUSD', 'cryBTCUSD', 'BOOM1000', 'BOOM500', 'CRASH1000', 'CRASH500'] }
  };
  
  let sub = null;
  
  if (supabase) {
    try {
      // Intentar buscar por email primero
      const isEmail = userId.includes('@');
      
      if (isEmail) {
        const { data } = await supabase.from('suscripciones').select('*').eq('email', userId).single();
        sub = data;
      } else {
        // Buscar por id o por email que contenga el userId
        const { data: byId } = await supabase.from('suscripciones').select('*').eq('id', userId).single();
        if (byId) {
          sub = byId;
        } else {
          // Último intento: buscar si el userId es parte del email
          const { data: all } = await supabase.from('suscripciones').select('*');
          sub = all?.find(s => s.email?.includes(userId) || s.id?.toString() === userId);
        }
      }
      
      console.log('📋 Suscripción encontrada:', sub ? `${sub.email} - ${sub.plan}` : 'No encontrada');
    } catch (e) {
      console.log('⚠️ Error buscando suscripción:', e.message);
    }
  }
  
  if (sub) {
    const planConfig = PLAN_CONFIG[sub.plan] || PLAN_CONFIG.free;
    res.json({
      subscription: {
        id: sub.id,
        email: sub.email,
        status: sub.estado || 'trial',
        plan: sub.plan || 'free',
        plan_name: planConfig.name,
        period: sub.periodo || 'mensual',
        days_left: sub.trial_days_left || 0,
        assets: planConfig.assets,
        created_at: sub.created_at
      }
    });
  } else {
    res.json({
      subscription: {
        status: 'trial',
        plan: 'free',
        plan_name: 'Free Trial',
        days_left: 5,
        assets: PLAN_CONFIG.free.assets
      }
    });
  }
});

// ELISA Endpoints
app.post('/api/elisa/chat', async (req, res) => {
  try {
    const { message, symbol, conversationHistory } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const ctx = { conversationHistory: conversationHistory || [], stats: getStats() };
    if (symbol && assetData[symbol]) {
      const d = assetData[symbol];
      ctx.marketData = { symbol, price: d.price, structureM5: d.analysis?.structureM5, structureH1: d.analysis?.structureH1, mtfConfluence: d.analysis?.mtfConfluence, premiumDiscount: d.analysis?.premiumDiscount };
      ctx.signal = d.signal || d.lockedSignal;
    }
    const result = await elisaChat(message, ctx);
    res.json({ success: result.success, response: result.response, fallback: result.fallback || false });
  } catch (e) { res.status(500).json({ error: e.message, response: 'Error, intenta de nuevo.' }); }
});

app.get('/api/elisa/models', (req, res) => res.json({ success: true, models: SMC_MODELS.models || {}, concepts: SMC_MODELS.concepts || {} }));

app.get('/api/elisa/analyze/:symbol', async (req, res) => {
  const data = assetData[req.params.symbol];
  if (!data) return res.status(404).json({ error: 'Not found' });
  const analysis = SMCEngine.analyze(data.candles, data.candlesH1);
  const ctx = { marketData: { symbol: req.params.symbol, price: data.price, ...analysis }, stats: getStats() };
  const result = await elisaChat(`Analiza ${req.params.symbol} brevemente (máx 100 palabras)`, ctx);
  res.json({ success: true, response: result.response, analysis: { structure: { m5: analysis.structureM5, h1: analysis.structureH1 }, mtfConfluence: analysis.mtfConfluence, premiumDiscount: analysis.premiumDiscount } });
});

// Admin Endpoints
app.get('/api/admin/users', async (req, res) => {
  if (!supabase) return res.json({ users: [], stats: {} });
  try {
    const { data } = await supabase.from('suscripciones').select('*').order('created_at', { ascending: false });
    const users = (data||[]).map(u => ({ id: u.id, email: u.email, plan: u.plan, status: u.estado, period: u.periodo, trial_ends_at: u.trial_ends_at, created_at: u.created_at }));
    res.json({ users, stats: { total: users.length, trial: users.filter(u=>u.status==='trial').length, active: users.filter(u=>u.status==='active').length } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users', async (req, res) => {
  const { email, plan, status, period } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  res.json({ success: await saveSubscription(email, plan||'free', status||'trial', period||'mensual') });
});

app.put('/api/admin/users/:userId', async (req, res) => {
  const { plan, status, period } = req.body;
  res.json({ success: await saveSubscription(req.params.userId, plan, status, period) });
});

app.delete('/api/admin/users/:userId', async (req, res) => {
  if (!supabase) return res.json({ success: false });
  try { await supabase.from('suscripciones').delete().eq('email', req.params.userId); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// =============================================
// INICIALIZACIÓN
// =============================================

setInterval(checkSignalHits, 5000);
setInterval(() => { for (const s of Object.keys(ASSETS)) analyzeAsset(s); }, 30000);

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║   🤖 TRADING MASTER PRO v14.0 - ELISA AI          ║
║   ──────────────────────────────────────────────  ║
║   ✅ Server: http://localhost:${PORT}              ║
║   ✅ Motor: SMC Puro (sin indicadores)            ║
║   ${openai?'✅':'⚠️'} OpenAI: ${openai?'Conectado':'Fallback'}                       ║
║   ${supabase?'✅':'⚠️'} Supabase: ${supabase?'Conectado':'No config'}                     ║
║   ${TELEGRAM_BOT_TOKEN?'✅':'⚠️'} Telegram: ${TELEGRAM_BOT_TOKEN?'Configurado':'No config'}                    ║
╚════════════════════════════════════════════════════╝
  `);
  connectDeriv();
});

export default app;
