// Trading Master Pro v25.0 — IA SMC Institucional
// Señales automáticas ELIMINADAS — la IA analiza y el humano decide

// =============================================
// TRADING MASTER PRO v16.0 - PLATAFORMA COMPLETA
// Motor SMC + ELISA IA + Telegram + Supabase + Admin
// v16.0: 12 Modelos SMC con Zona Válida de Order Block
// =============================================
// 
// CAMBIOS v16.0:
// - 12 Modelos SMC optimizados con validación de Zona OB
// - Eliminados: ZONE_TOUCH, LIQUIDITY_SWEEP, STRUCTURE_BREAK, REVERSAL_PATTERN, PREMIUM_DISCOUNT
// - Todos los modelos requieren zona válida de Order Block
// - LONG: Vela ROJA + VERDE envolvente (acumulación)
// - SHORT: Vela VERDE + ROJA envolvente (distribución)
//
// VARIABLES DE ENTORNO REQUERIDAS:
// --------------------------------
// PORT                    - Puerto del servidor (default: 3001)
// DERIV_APP_ID           - App ID de Deriv (default: 1089)
// ANTHROPIC_API_KEY      - API Key de Anthropic para IA SMC Institucional
// SUPABASE_URL           - URL del proyecto Supabase
// SUPABASE_SERVICE_ROLE_KEY - Service Role Key de Supabase
// TELEGRAM_BOT_TOKEN     - Token del bot de Telegram
// TELEGRAM_CHAT_ID       - ID del chat/grupo de Telegram
//
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


const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// =============================================
// CONFIGURACIÓN TELEGRAM
// =============================================
const TELEGRAM_BOT_TOKEN = process.env.TOKEN_BOT_DE_TELEGRAM || process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.ID_DE_CHAT_DE_TELEGRAM || process.env.TELEGRAM_CHAT_ID;


// CONFIGURACIÓN OPENAI - IA SMC INSTITUCIONAL
// =============================================
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log('✅ OpenAI conectado - IA SMC activa');
} else {
  console.log('⚠️ OPENAI_API_KEY no encontrada - IA en modo sin análisis');
}

// Cargar modelos SMC desde JSON
let SMC_MODELS_DATA = {};
try {
  const modelsPath = path.join(__dirname, 'data', 'smc-models.json');
  if (fs.existsSync(modelsPath)) {
    SMC_MODELS_DATA = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
    console.log('✅ SMC Models JSON cargado');
  }
} catch (e) {
  console.log('⚠️ Error cargando smc-models.json:', e.message);
}


// =============================================
// SUPABASE — Solo para usuarios y suscripciones
// =============================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log('✅ Supabase conectado');
} else {
  console.log('⚠️ Supabase no configurado - modo local');
}

// Almacenamiento en memoria fallback
const memoryStore = { subscriptions: new Map() };


const PERIOD_DAYS = { mensual: 30, semestral: 180, anual: 365 };

async function getSubscription(userId) {
  if (supabase) {
    try {
      // Leer de tabla 'users' que tiene email + plan
      const { data, error } = await supabase
        .from('users')
        .select('id, email, plan, is_active, created_at')
        .eq('email', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.log('getSubscription error:', error.message);
      }

      if (data) {
        const plan = data.plan || 'free';

        // Assets según plan — SOLO Step Index, Oro y Volatility 100
        const planAssets = {
          free:    MY_ASSETS,
          basico:  MY_ASSETS,
          pro:     MY_ASSETS,
          premium: MY_ASSETS,
          elite:   MY_ASSETS,
        };

        return {
          id:                  data.id,
          email:               data.email,
          plan:                plan,
          estado:              'activo',
          status:              'active',
          periodo:             'mensual',
          days_left:           3650,
          is_active:           true,
          assets:              planAssets[plan] || ['stpRNG'],
          plan_name:           { free:'Free Trial', basico:'Básico', pro:'Pro', premium:'Premium', elite:'Elite' }[plan] || 'Free Trial',
          trial_ends_at:       new Date(Date.now() + 3650*86400000).toISOString(),
          subscription_ends_at: new Date(Date.now() + 3650*86400000).toISOString(),
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
      const userId = subData.userId || subData.user_id;
      const plan   = subData.plan || 'free';
      const months = subData.months || 1;
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + months);

      const { data, error } = await supabase
        .from('suscripciones')
        .upsert({
          user_id:    userId,
          plan:       plan,
          status:     'active',
          price:      0,
          start_date: new Date().toISOString(),
          end_date:   endDate.toISOString(),
        }, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) {
        console.log('Supabase upsert error:', error.message);
        return null;
      }
      return data;
    } catch (e) {
      console.log('saveSubscription error:', e.message);
      return null;
    }
  }
  return null;
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
      
      // Normalizar datos para el admin panel
      return (data || []).map(sub => {
        // Calcular días restantes para cualquier plan
        const daysLeft = calculateDaysLeft(
          sub.subscription_ends_at,
          sub.trial_ends_at,
          sub.estado,
          sub.periodo
        );
        
        const isActive = isSubscriptionActive(sub.estado, daysLeft);
        
        return {
          id: sub.id,
          email: sub.email,
          plan: sub.plan || 'free',
          estado: sub.estado || 'trial',
          periodo: sub.periodo || 'mensual',
          days_left: daysLeft,
          is_active: isActive,
          trial_ends_at: sub.trial_ends_at,
          subscription_ends_at: sub.subscription_ends_at,
          created_at: sub.created_at
        };
      });
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
        .eq('email', userId);
      
      if (result.error) {
        console.log('Supabase delete error:', result.error.message);
      } else {
        console.log(`✅ Suscripción eliminada: ${userId}`);
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
    assets: MY_ASSETS,
    duration: 5,
    price: 0
  },
  basico: {
    name: 'Básico',
    assets: MY_ASSETS,
    price: 29900
  },
  premium: {
    name: 'Premium',
    assets: MY_ASSETS,
    price: 59900
  },
  elite: {
    name: 'Elite',
    assets: MY_ASSETS,
    price: 99900
  }
};

const ASSETS = {
  // ═══════════════════════════════════════════════
  // 🎰 SINTÉTICOS - VOLATILITY
  // ═══════════════════════════════════════════════
  'stpRNG': { name: 'Step Index', shortName: 'Step', emoji: '📊', decimals: 2, pip: 0.01, plan: 'free', type: 'standard', category: 'sinteticos' },
  'R_75': { name: 'Volatility 75', shortName: 'V75', emoji: '📈', decimals: 2, pip: 0.01, plan: 'basico', type: 'standard', category: 'sinteticos' },
  '1HZ100V': { name: 'Volatility 100', shortName: 'V100', emoji: '🔥', decimals: 2, pip: 0.01, plan: 'premium', type: 'standard', category: 'sinteticos' },
  'JD75': { name: 'Jump 75', shortName: 'Jump75', emoji: '⚡', decimals: 2, pip: 0.01, plan: 'premium', type: 'standard', category: 'sinteticos' },
  
  // ═══════════════════════════════════════════════
  // 🚀 SINTÉTICOS - BOOM (Solo COMPRAS)
  // ═══════════════════════════════════════════════
  'BOOM1000': { name: 'Boom 1000', shortName: 'Boom1K', emoji: '🚀', decimals: 2, pip: 0.01, plan: 'elite', type: 'boom', onlyDirection: 'BUY', spikeFreq: 1000, category: 'boom' },
  'BOOM500': { name: 'Boom 500', shortName: 'Boom500', emoji: '💥', decimals: 2, pip: 0.01, plan: 'elite', type: 'boom', onlyDirection: 'BUY', spikeFreq: 500, category: 'boom' },
  'BOOM300N': { name: 'Boom 300', shortName: 'Boom300', emoji: '⚡', decimals: 2, pip: 0.01, plan: 'elite', type: 'boom', onlyDirection: 'BUY', spikeFreq: 300, category: 'boom' },
  
  // ═══════════════════════════════════════════════
  // 📉 SINTÉTICOS - CRASH (Solo VENTAS)
  // ═══════════════════════════════════════════════
  'CRASH1000': { name: 'Crash 1000', shortName: 'Crash1K', emoji: '📉', decimals: 2, pip: 0.01, plan: 'elite', type: 'crash', onlyDirection: 'SELL', spikeFreq: 1000, category: 'crash' },
  'CRASH500': { name: 'Crash 500', shortName: 'Crash500', emoji: '💣', decimals: 2, pip: 0.01, plan: 'elite', type: 'crash', onlyDirection: 'SELL', spikeFreq: 500, category: 'crash' },
  'CRASH300N': { name: 'Crash 300', shortName: 'Crash300', emoji: '🔻', decimals: 2, pip: 0.01, plan: 'elite', type: 'crash', onlyDirection: 'SELL', spikeFreq: 300, category: 'crash' },
  
  // ═══════════════════════════════════════════════
  // 💱 FOREX - Pares de Divisas
  // ═══════════════════════════════════════════════
  'frxEURUSD': { name: 'EUR/USD', shortName: 'EUR/USD', emoji: '💶', decimals: 5, pip: 0.0001, plan: 'free', type: 'standard', category: 'forex' },
  'frxGBPUSD': { name: 'GBP/USD', shortName: 'GBP/USD', emoji: '💷', decimals: 5, pip: 0.0001, plan: 'premium', type: 'standard', category: 'forex' },
  'frxUSDJPY': { name: 'USD/JPY', shortName: 'USD/JPY', emoji: '💴', decimals: 3, pip: 0.01, plan: 'basico', type: 'standard', category: 'forex' },
  
  // ═══════════════════════════════════════════════
  // 🏆 COMMODITIES - Metales
  // ═══════════════════════════════════════════════
  'frxXAUUSD': { name: 'Oro (XAU/USD)', shortName: 'Oro', emoji: '🥇', decimals: 2, pip: 0.01, plan: 'free', type: 'standard', category: 'commodities' },
  'frxXAGUSD': { name: 'Plata (XAG/USD)', shortName: 'Plata', emoji: '🥈', decimals: 4, pip: 0.001, plan: 'basico', type: 'standard', category: 'commodities' },
  
  // ═══════════════════════════════════════════════
  // ₿ CRYPTO - Criptomonedas
  // ═══════════════════════════════════════════════
  'cryBTCUSD': { name: 'Bitcoin', shortName: 'BTC', emoji: '₿', decimals: 2, pip: 1, plan: 'premium', type: 'standard', category: 'crypto' },
  'cryETHUSD': { name: 'Ethereum', shortName: 'ETH', emoji: '⟠', decimals: 2, pip: 0.1, plan: 'premium', type: 'standard', category: 'crypto' }
};

// =============================================
// REGLAS ESPECIALES BOOM/CRASH SMC
// =============================================
const BOOM_CRASH_RULES = {
  // BOOM: Solo compras en zonas de demanda después de caída
  boom: {
    direction: 'BUY',
    lookFor: 'demand',           // Buscar zonas de demanda
    entryCondition: 'discount',  // Entrar en zona de descuento (precio bajo)
    avoidCondition: 'premium',   // Evitar zona premium (precio alto)
    spikeDetection: true,        // Detectar patrones pre-spike
    minScore: 70,                // Score mínimo más bajo (más oportunidades)
    tpMultiplier: 2.5,           // TP más amplio para capturar spike
    slMultiplier: 0.8,           // SL más ajustado
    description: 'Boom: Comprar en zonas de demanda esperando spike alcista'
  },
  // CRASH: Solo ventas en zonas de supply después de subida
  crash: {
    direction: 'SELL',
    lookFor: 'supply',           // Buscar zonas de supply
    entryCondition: 'premium',   // Entrar en zona premium (precio alto)
    avoidCondition: 'discount',  // Evitar zona de descuento
    spikeDetection: true,        // Detectar patrones pre-spike
    minScore: 70,                // Score mínimo más bajo
    tpMultiplier: 2.5,           // TP más amplio para capturar spike
    slMultiplier: 0.8,           // SL más ajustado
    description: 'Crash: Vender en zonas de supply esperando spike bajista'
  }
};

// =============================================

// =============================================
// ESTADO EN MEMORIA — Datos de mercado en vivo
// =============================================
let assetData = {};
for (const [symbol, config] of Object.entries(ASSETS)) {
  assetData[symbol] = {
    candles:    [],
    candlesH1:  [],
    candlesM15: [],
    candlesM1:  [],
    price:      null,
    lastAnalysis: 0,
    // SMC zones (updated by analyzeAsset)
    structure:      null,
    structureH1:    null,
    structureM15:   null,
    demandZones:    [],
    supplyZones:    [],
    demandZonesH1:  [],
    supplyZonesH1:  [],
    demandZonesM15: [],
    supplyZonesM15: [],
    fvgZones:        [],
    liquidityLevels: [],
    swings:          [],
    swingsM15:       [],
    choch:      null,
    bos:        null,
    chochM15:   null,
    bosM15:     null,
    premiumDiscount: 'EQUILIBRIUM',
    mtfConfluence:   false,
    h1Loaded:   false,
    m15Loaded:  false,
    m1Loaded:   false,
    m1Steps:    null,
    orderFlow:  null,
    pullback:   null,
    chartOverlays: {},
    // No señales — la IA las sugiere, el humano las toma
  };
}


const SMC = {
  
  getAvgRange(candles, period = 14) {
    const recent = candles.slice(-period);
    if (!recent.length) return 0;
    return recent.reduce((sum, c) => sum + (c.high - c.low), 0) / recent.length;
  },

  // ═══════════════════════════════════════════════════════════════════
  // WILLIAMS FRACTALS — detección estándar de pivots
  // Un fractal alto: la vela del medio tiene el HIGH más alto de 5 velas
  // Un fractal bajo: la vela del medio tiene el LOW más bajo de 5 velas
  // Más limpio que swing detection personalizada — sin false pivots
  // ═══════════════════════════════════════════════════════════════════
  findSwings(candles, lookback = 3) {
    const swings = [];
    if (candles.length < 10) return swings;

    // Williams Fractal: ventana de 5 velas (2 a cada lado)
    // Para M5 usamos 3 a cada lado (más sensible), M15/H1 usa 5
    const lb = Math.max(2, Math.min(lookback, 4));

    for (let i = lb; i < candles.length - lb; i++) {
      const c = candles[i];
      let isHigh = true, isLow = true;

      for (let j = 1; j <= lb; j++) {
        if (candles[i-j].high > c.high || candles[i+j].high > c.high) isHigh = false;
        if (candles[i-j].low  < c.low  || candles[i+j].low  < c.low)  isLow  = false;
      }

      if (isHigh) swings.push({ type:'high', price:c.high, index:i,
        time:c.time, epoch:c.epoch||(c.time?Math.floor(c.time/1000):null) });
      if (isLow)  swings.push({ type:'low',  price:c.low,  index:i,
        time:c.time, epoch:c.epoch||(c.time?Math.floor(c.time/1000):null) });
    }
    return swings;
  },

  analyzeStructure(swings, candles = null) {
    // ── MOMENTUM OVERRIDE: impulso fuerte reciente → estructura clara ──
    // FIX CRÍTICO: bug donde M15 BULLISH era reportado como BEARISH
    // porque swings históricos acumulados ganaban por volumen
    if (candles && candles.length >= 20) {
      const recent20 = candles.slice(-20);
      const avg20 = recent20.reduce((s,c)=>s+Math.abs(c.high-c.low),0)/20;
      let bullMom=0, bearMom=0;
      recent20.forEach(c => {
        const body = c.close - c.open;
        if (body > 0) bullMom += body;
        else          bearMom -= body;
      });
      const totalMom = bullMom + bearMom;
      const bPct = totalMom > 0 ? bullMom/totalMom : 0.5;
      const maxBody = Math.max(...recent20.map(c=>Math.abs(c.close-c.open)));
      const hasImpulse = maxBody > avg20 * 2.5;

      if (hasImpulse && bPct >= 0.68) return { trend:'BULLISH', strength:Math.min(100,Math.round(bPct*120)), hh:1,hl:1,lh:0,ll:0, labels:[], momentum:true };
      if (hasImpulse && bPct <= 0.32) return { trend:'BEARISH', strength:Math.min(100,Math.round((1-bPct)*120)), hh:0,hl:0,lh:1,ll:1, labels:[], momentum:true };
    }

    if (swings.length < 4) return { trend:'NEUTRAL', strength:0, labels:[] };
    const highs = swings.filter(s=>s.type==='high');
    const lows  = swings.filter(s=>s.type==='low');
    if (highs.length < 2 || lows.length < 2) return { trend:'NEUTRAL', strength:0, labels:[] };

    let hh=0,hl=0,lh=0,ll=0;
    const labels = [];

    // Solo últimos 8 fractales por tipo — no acumular historia vieja
    const rH = highs.slice(-8), rL = lows.slice(-8);
    for (let i=1;i<rH.length;i++) {
      if (rH[i].price > rH[i-1].price) { hh++; labels.push({type:'HH',price:rH[i].price,index:rH[i].index,time:rH[i].time}); }
      else { lh++; labels.push({type:'LH',price:rH[i].price,index:rH[i].index,time:rH[i].time}); }
    }
    for (let i=1;i<rL.length;i++) {
      if (rL[i].price > rL[i-1].price) { hl++; labels.push({type:'HL',price:rL[i].price,index:rL[i].index,time:rL[i].time}); }
      else { ll++; labels.push({type:'LL',price:rL[i].price,index:rL[i].index,time:rL[i].time}); }
    }

    // Últimos 4 fractales tienen 3x más peso
    const sorted = labels.sort((a,b)=>a.index-b.index);
    const last4 = sorted.slice(-4), older = sorted.slice(0,-4);
    const lBull=last4.filter(l=>l.type==='HH'||l.type==='HL').length;
    const lBear=last4.filter(l=>l.type==='LH'||l.type==='LL').length;
    const oBull=older.filter(l=>l.type==='HH'||l.type==='HL').length;
    const oBear=older.filter(l=>l.type==='LH'||l.type==='LL').length;

    const bW=lBull*3+oBull, brW=lBear*3+oBear, tot=bW+brW;
    if (tot===0) return { trend:'NEUTRAL', strength:20, labels };

    const bPctF=bW/tot, brPctF=brW/tot;
    const str=Math.min(100,Math.round(Math.max(bPctF,brPctF)*130));
    const lastL=sorted[sorted.length-1];
    const lastBull=lastL?.type==='HH'||lastL?.type==='HL';

    if (bPctF>=0.55) return { trend:'BULLISH', strength:str, hh,hl,lh,ll, labels };
    if (brPctF>=0.55) return { trend:'BEARISH', strength:str, hh,hl,lh,ll, labels };
    if (lastL) return { trend:lastBull?'BULLISH':'BEARISH', strength:40, hh,hl,lh,ll, labels };
    return { trend:'NEUTRAL', strength:20, labels };
  },


  analyzeStructureBoomCrash(candles, assetType) {
    if (!candles || candles.length < 30) return { trend: 'NEUTRAL', strength: 0 };
    
    const recent = candles.slice(-30);
    const avgRange = this.getAvgRange(candles.slice(-50));
    
    // Buscar spike en las últimas 30 velas
    let biggestBullSpike = 0;
    let biggestBearSpike = 0;
    let bullSpikeIndex = -1;
    let bearSpikeIndex = -1;
    
    for (let i = 5; i < recent.length; i++) {
      const candle = recent[i];
      const candleRange = Math.abs(candle.close - candle.open);
      
      // Spike alcista: vela verde muy grande (>3x promedio)
      if (candle.close > candle.open && candleRange > avgRange * 3) {
        if (candleRange > biggestBullSpike) {
          biggestBullSpike = candleRange;
          bullSpikeIndex = i;
        }
      }
      
      // Spike bajista: vela roja muy grande (>3x promedio)
      if (candle.close < candle.open && candleRange > avgRange * 3) {
        if (candleRange > biggestBearSpike) {
          biggestBearSpike = candleRange;
          bearSpikeIndex = i;
        }
      }
    }
    
    // Para Crash: si hubo spike bajista reciente, la estructura es BEARISH
    // aunque las últimas velas sean de rebote
    if (assetType === 'crash' && bearSpikeIndex > bullSpikeIndex && biggestBearSpike > avgRange * 3) {
      // Verificar que no se ha recuperado completamente
      const spikeCandle = recent[bearSpikeIndex];
      const currentPrice = recent[recent.length - 1].close;
      const spikeRecovery = (currentPrice - spikeCandle.low) / (spikeCandle.open - spikeCandle.low);
      
      // Si no se ha recuperado más del 80%, la estructura sigue siendo BEARISH
      if (spikeRecovery < 0.8) {
        return { 
          trend: 'BEARISH', 
          strength: Math.min(100, Math.round(biggestBearSpike / avgRange * 10)),
          reason: 'Spike bajista reciente'
        };
      }
    }
    
    // Para Boom: si hubo spike alcista reciente, la estructura es BULLISH
    if (assetType === 'boom' && bullSpikeIndex > bearSpikeIndex && biggestBullSpike > avgRange * 3) {
      const spikeCandle = recent[bullSpikeIndex];
      const currentPrice = recent[recent.length - 1].close;
      const spikeRetracement = (spikeCandle.high - currentPrice) / (spikeCandle.high - spikeCandle.open);
      
      if (spikeRetracement < 0.8) {
        return { 
          trend: 'BULLISH', 
          strength: Math.min(100, Math.round(biggestBullSpike / avgRange * 10)),
          reason: 'Spike alcista reciente'
        };
      }
    }
    
    // Si no hay spike claro, analizar estructura normal
    // Pero usar más velas (últimas 20 en lugar de 8)
    const last20 = candles.slice(-20);
    let higherHighs = 0, higherLows = 0, lowerHighs = 0, lowerLows = 0;
    
    // Comparar cada 5 velas
    for (let i = 5; i < last20.length; i += 5) {
      const prev = last20.slice(i - 5, i);
      const curr = last20.slice(i, i + 5);
      if (curr.length < 5) continue;
      
      const prevHigh = Math.max(...prev.map(c => c.high));
      const prevLow = Math.min(...prev.map(c => c.low));
      const currHigh = Math.max(...curr.map(c => c.high));
      const currLow = Math.min(...curr.map(c => c.low));
      
      if (currHigh > prevHigh) higherHighs++;
      if (currHigh < prevHigh) lowerHighs++;
      if (currLow > prevLow) higherLows++;
      if (currLow < prevLow) lowerLows++;
    }
    
    const bullScore = higherHighs + higherLows;
    const bearScore = lowerHighs + lowerLows;
    
    if (bearScore > bullScore && bearScore >= 2) {
      return { trend: 'BEARISH', strength: Math.min(100, bearScore * 25) };
    }
    if (bullScore > bearScore && bullScore >= 2) {
      return { trend: 'BULLISH', strength: Math.min(100, bullScore * 25) };
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

  // =============================================
  // ANÁLISIS ESPECÍFICO BOOM/CRASH v17 - ESTRATEGIA SMC ORGANIZADA
  // =============================================
  // 
  // ╔══════════════════════════════════════════════════════════════════════════════╗
  // ║  ESTRATEGIA BOOM (SOLO COMPRAS)                                              ║
  // ╠══════════════════════════════════════════════════════════════════════════════╣
  // ║  PASO 1 - H1: Analizar dirección (debe ser BULLISH o NEUTRAL)               ║
  // ║  PASO 2 - H1: El precio viene bajista, se forma estructura                   ║
  // ║  PASO 3 - H1: Order Block = vela ROJA + vela VERDE envolvente (acumulación) ║
  // ║  PASO 4 - H1: Después del OB → impulso → CHOCH/BOS → nuevo alto             ║
  // ║  PASO 5 - H1: Esperar pullback/retroceso al Order Block                     ║
  // ║  PASO 6 - M5: Confirmar estructura alcista O precio toca OB de H1           ║
  // ║  PASO 7 - Entrada en el Order Block de H1                                   ║
  // ║  PASO 8 - Stop Loss: Debajo del Order Block de H1                           ║
  // ║  PASO 9 - TP1, TP2, TP3: Basados en la estructura                          ║
  // ╚══════════════════════════════════════════════════════════════════════════════╝
  // 
  // ╔══════════════════════════════════════════════════════════════════════════════╗
  // ║  ESTRATEGIA CRASH (SOLO VENTAS) - INVERSO                                   ║
  // ╠══════════════════════════════════════════════════════════════════════════════╣
  // ║  PASO 1 - H1: Analizar dirección (debe ser BEARISH o NEUTRAL)               ║
  // ║  PASO 2 - H1: El precio viene alcista, se forma estructura                   ║
  // ║  PASO 3 - H1: Order Block = vela VERDE + vela ROJA envolvente (distribución)║
  // ║  PASO 4 - H1: Después del OB → impulso bajista → CHOCH/BOS → nuevo bajo     ║
  // ║  PASO 5 - H1: Esperar pullback/retroceso al Order Block                     ║
  // ║  PASO 6 - M5: Confirmar estructura bajista O precio toca OB de H1           ║
  // ║  PASO 7 - Entrada en el Order Block de H1                                   ║
  // ║  PASO 8 - Stop Loss: Arriba del Order Block de H1                           ║
  // ║  PASO 9 - TP1, TP2, TP3: Basados en la estructura                          ║
  // ╚══════════════════════════════════════════════════════════════════════════════╝
  //
  analyzeBoomCrash(candles, config, state, rules, candlesH1 = null) {
    if (candles.length < 50) return null;
    
    const assetType = config.type; // 'boom' o 'crash'
    const avgRange = this.getAvgRange(candles);
    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    const price = lastCandle.close;
    
    // Log cada 15 segundos para Boom/Crash
    const shouldLog = Date.now() % 15000 < 1000;
    
    // Obtener swings M5
    const swingsM5 = this.findSwings(candles, 2);
    const structureM5 = this.analyzeStructureBoomCrash(candles, assetType);
    
    // ════════════════════════════════════════════════════════════════════════════
    // ANÁLISIS H1 (OBLIGATORIO para Boom/Crash)
    // ════════════════════════════════════════════════════════════════════════════
    if (!candlesH1 || candlesH1.length < 20) {
      if (shouldLog) {
        console.log(`⚠️ [${config.shortName}] Sin datos H1 suficientes (${candlesH1?.length || 0} velas)`);
      }
      return null;
    }
    
    const swingsH1 = this.findSwings(candlesH1, 2);
    const structureH1 = this.analyzeStructure(swingsH1, candlesH1);
    
    if (shouldLog) {
      console.log(`📊 [${config.shortName}] Análisis ${assetType.toUpperCase()}:`);
      console.log(`   H1: ${structureH1.trend} (${structureH1.strength}%) | M5: ${structureM5.trend}`);
      console.log(`   Velas H1: ${candlesH1.length} | Velas M5: ${candles.length}`);
      console.log(`   Precio: ${price.toFixed(2)} | AvgRange: ${avgRange.toFixed(2)}`);
    }
    
    // ════════════════════════════════════════════════════════════════════════════
    // DETECTAR ORDER BLOCK CON CHOCH/BOS EN H1
    // ════════════════════════════════════════════════════════════════════════════
    const obAnalysis = this.detectOBWithChochBos(candlesH1, assetType);
    
    if (shouldLog) {
      if (obAnalysis) {
        console.log(`   ✅ OB encontrado: ${obAnalysis.side} zona ${obAnalysis.zone.low.toFixed(2)}-${obAnalysis.zone.high.toFixed(2)}`);
        console.log(`   CHOCH: ${obAnalysis.hasChoch} | BOS: ${obAnalysis.hasBos}`);
      } else {
        console.log(`   ❌ No se encontró OB válido con CHOCH/BOS en H1`);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    //                    B O O M  -  S O L O  C O M P R A S
    // ═══════════════════════════════════════════════════════════════════════════
    if (assetType === 'boom') {
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 1: H1 debe ser BULLISH o NEUTRAL (NO BEARISH)
      // ──────────────────────────────────────────────────────────────────────────
      if (structureH1.trend === 'BEARISH' && structureH1.strength > 60) {
        if (Date.now() % 30000 < 1000) {
          console.log(`⛔ [${config.shortName}] BOOM bloqueado: H1 es BEARISH fuerte - Esperando cambio de estructura`);
        }
        return null;
      }
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 2-4: Verificar que existe OB válido con CHOCH/BOS posterior
      // El OB de demanda: vela ROJA + vela VERDE envolvente + impulso + CHOCH/BOS
      // ──────────────────────────────────────────────────────────────────────────
      if (!obAnalysis || !obAnalysis.valid || obAnalysis.side !== 'BUY') {
        if (Date.now() % 30000 < 1000) {
          console.log(`⏳ [${config.shortName}] BOOM esperando: No hay OB de demanda válido con CHOCH/BOS en H1`);
        }
        return null;
      }
      
      const obZone = obAnalysis.zone;
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 5: El precio debe estar en pullback hacia el OB (retroceso)
      // El precio debe tocar o estar cerca de la zona del OB
      // ──────────────────────────────────────────────────────────────────────────
      const tolerance = avgRange * 1.5; // Aumentar tolerancia
      const priceAboveOBLow = price >= (obZone.low - tolerance);
      const priceBelowOBHigh = lastCandle.low <= (obZone.high + tolerance);
      const priceNearOB = priceAboveOBLow && priceBelowOBHigh;
      
      // Log detallado para debug
      if (Date.now() % 30000 < 1000) {
        console.log(`📊 [${config.shortName}] BOOM análisis:`);
        console.log(`   H1: ${structureH1.trend} | M5: ${structureM5.trend}`);
        console.log(`   OB H1: ${obZone.low.toFixed(2)} - ${obZone.high.toFixed(2)} (CHOCH:${obAnalysis.hasChoch} BOS:${obAnalysis.hasBos})`);
        console.log(`   Precio actual: ${price.toFixed(2)} | Low: ${lastCandle.low.toFixed(2)}`);
        console.log(`   Tolerancia: ${tolerance.toFixed(2)}`);
        console.log(`   ¿Cerca del OB?: ${priceNearOB} (Above low: ${priceAboveOBLow}, Below high: ${priceBelowOBHigh})`);
      }
      
      if (!priceNearOB) {
        if (Date.now() % 30000 < 1000) {
          if (price > obZone.high + tolerance) {
            console.log(`⏳ [${config.shortName}] BOOM esperando: Precio MUY ARRIBA del OB - Esperando pullback`);
          } else if (price < obZone.low - tolerance) {
            console.log(`⏳ [${config.shortName}] BOOM esperando: Precio MUY ABAJO del OB - Zona invalidada`);
          }
        }
        return null;
      }
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 6: M5 debe confirmar - estructura alcista O señal de reversión
      // ──────────────────────────────────────────────────────────────────────────
      const m5Bullish = structureM5.trend === 'BULLISH';
      const m5Neutral = structureM5.trend === 'NEUTRAL';
      const hasChochM5 = state.choch?.type === 'BULLISH_CHOCH';
      const hasBullishEngulfing = prevCandle.close < prevCandle.open && 
                                   lastCandle.close > lastCandle.open &&
                                   lastCandle.close > prevCandle.open;
      
      // También aceptar si las últimas 3 velas muestran presión alcista
      const last3 = candles.slice(-3);
      const greenCandles = last3.filter(c => c.close > c.open).length;
      const hasBullishPressure = greenCandles >= 2;
      
      const m5Confirmed = m5Bullish || m5Neutral || hasChochM5 || hasBullishEngulfing || hasBullishPressure;
      
      if (Date.now() % 30000 < 1000) {
        console.log(`   M5 confirmación: Bullish=${m5Bullish} Neutral=${m5Neutral} CHOCH=${hasChochM5} Engulf=${hasBullishEngulfing} Pressure=${hasBullishPressure}`);
        console.log(`   M5 confirmado: ${m5Confirmed}`);
      }
      
      if (!m5Confirmed) {
        if (Date.now() % 30000 < 1000) {
          console.log(`⏳ [${config.shortName}] BOOM esperando: M5 sin confirmación alcista (M5: ${structureM5.trend})`);
        }
        return null;
      }
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 7-9: SETUP VÁLIDO - Calcular entrada, SL y TPs
      // ──────────────────────────────────────────────────────────────────────────
      console.log(`✅ [${config.shortName}] BOOM SETUP VÁLIDO - OB H1 + CHOCH/BOS + M5 confirma`);
      
      const entry = lastCandle.close;
      
      // SL: Debajo de la zona del OB H1
      const slBuffer = avgRange * 0.3;
      const stop = Math.min(obZone.low, lastCandle.low) - slBuffer;
      
      if (stop >= entry) {
        console.log(`⛔ [${config.shortName}] BOOM bloqueado: SL inválido`);
        return null;
      }
      
      const risk = entry - stop;
      
      // TPs basados en estructura H1 y swings
      const recentHighsH1 = swingsH1.filter(s => s.type === 'high').slice(-3);
      const targetHigh = recentHighsH1.length > 0 ? Math.max(...recentHighsH1.map(h => h.price)) : entry + risk * 5;
      
      const tp1 = entry + risk * 1.5;  // 1:1.5 RR
      const tp2 = entry + risk * 2.5;  // 1:2.5 RR
      const tp3 = Math.max(targetHigh, entry + risk * 4);  // Máximo estructural o 1:4
      
      // Calcular score
      let score = 70;
      let reasons = ['BOOM OB H1'];
      
      if (structureH1.trend === 'BULLISH') { score += 10; reasons.push('H1↑'); }
      if (m5Bullish) { score += 5; reasons.push('M5↑'); }
      if (hasChochM5) { score += 5; reasons.push('CHOCH M5'); }
      if (hasBullishEngulfing) { score += 5; reasons.push('Engulfing'); }
      if (obAnalysis.hasChoch) { score += 5; reasons.push('CHOCH H1'); }
      if (obAnalysis.hasBos) { score += 3; reasons.push('BOS H1'); }
      
      return {
        action: 'LONG',
        model: 'BOOM_SPIKE',
        score: Math.min(100, score),
        entry: +entry.toFixed(config.decimals),
        stop: +stop.toFixed(config.decimals),
        tp1: +tp1.toFixed(config.decimals),
        tp2: +tp2.toFixed(config.decimals),
        tp3: +tp3.toFixed(config.decimals),
        reason: reasons.join(' + '),
        analysis: {
          type: 'boom',
          structureM5: structureM5.trend,
          structureH1: structureH1.trend,
          obH1: `${obZone.low.toFixed(2)}-${obZone.high.toFixed(2)}`,
          hasChochH1: obAnalysis.hasChoch,
          hasBosH1: obAnalysis.hasBos,
          m5Confirmation: hasChochM5 ? 'CHOCH' : hasBullishEngulfing ? 'ENGULFING' : m5Bullish ? 'STRUCTURE' : 'NEUTRAL',
          risk: +risk.toFixed(config.decimals)
        }
      };
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    //                    C R A S H  -  S O L O  V E N T A S
    // ═══════════════════════════════════════════════════════════════════════════
    if (assetType === 'crash') {
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 1: H1 debe ser BEARISH o NEUTRAL (NO BULLISH)
      // ──────────────────────────────────────────────────────────────────────────
      if (structureH1.trend === 'BULLISH' && structureH1.strength > 60) {
        if (Date.now() % 30000 < 1000) {
          console.log(`⛔ [${config.shortName}] CRASH bloqueado: H1 es BULLISH fuerte - Esperando cambio de estructura`);
        }
        return null;
      }
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 2-4: Verificar que existe OB válido con CHOCH/BOS posterior
      // El OB de supply: vela VERDE + vela ROJA envolvente + impulso + CHOCH/BOS
      // ──────────────────────────────────────────────────────────────────────────
      if (!obAnalysis || !obAnalysis.valid || obAnalysis.side !== 'SELL') {
        if (Date.now() % 30000 < 1000) {
          console.log(`⏳ [${config.shortName}] CRASH esperando: No hay OB de supply válido con CHOCH/BOS en H1`);
        }
        return null;
      }
      
      const obZone = obAnalysis.zone;
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 5: El precio debe estar en pullback hacia el OB (retroceso)
      // El precio debe tocar o estar cerca de la zona del OB
      // ──────────────────────────────────────────────────────────────────────────
      const tolerance = avgRange * 1.5;
      const priceBelowOBHigh = price <= (obZone.high + tolerance);
      const priceAboveOBLow = lastCandle.high >= (obZone.low - tolerance);
      const priceNearOB = priceBelowOBHigh && priceAboveOBLow;
      
      // Log detallado para debug
      if (Date.now() % 30000 < 1000) {
        console.log(`📊 [${config.shortName}] CRASH análisis:`);
        console.log(`   H1: ${structureH1.trend} | M5: ${structureM5.trend}`);
        console.log(`   OB H1: ${obZone.low.toFixed(2)} - ${obZone.high.toFixed(2)} (CHOCH:${obAnalysis.hasChoch} BOS:${obAnalysis.hasBos})`);
        console.log(`   Precio actual: ${price.toFixed(2)} | High: ${lastCandle.high.toFixed(2)}`);
        console.log(`   ¿Cerca del OB?: ${priceNearOB}`);
      }
      
      if (!priceNearOB) {
        if (Date.now() % 30000 < 1000) {
          if (price < obZone.low - tolerance) {
            console.log(`⏳ [${config.shortName}] CRASH esperando: Precio MUY ABAJO del OB - Esperando pullback`);
          } else if (price > obZone.high + tolerance) {
            console.log(`⏳ [${config.shortName}] CRASH esperando: Precio MUY ARRIBA del OB - Zona invalidada`);
          }
        }
        return null;
      }
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 6: M5 debe confirmar - estructura bajista O señal de reversión
      // ──────────────────────────────────────────────────────────────────────────
      const m5Bearish = structureM5.trend === 'BEARISH';
      const m5Neutral = structureM5.trend === 'NEUTRAL';
      const hasChochM5 = state.choch?.type === 'BEARISH_CHOCH';
      const hasBearishEngulfing = prevCandle.close > prevCandle.open && 
                                   lastCandle.close < lastCandle.open &&
                                   lastCandle.close < prevCandle.open;
      
      // También aceptar si las últimas 3 velas muestran presión bajista
      const last3 = candles.slice(-3);
      const redCandles = last3.filter(c => c.close < c.open).length;
      const hasBearishPressure = redCandles >= 2;
      
      const m5Confirmed = m5Bearish || m5Neutral || hasChochM5 || hasBearishEngulfing || hasBearishPressure;
      
      if (Date.now() % 30000 < 1000) {
        console.log(`   M5 confirmación: Bearish=${m5Bearish} Neutral=${m5Neutral} CHOCH=${hasChochM5} Engulf=${hasBearishEngulfing} Pressure=${hasBearishPressure}`);
        console.log(`   M5 confirmado: ${m5Confirmed}`);
      }
      
      if (!m5Confirmed) {
        if (Date.now() % 30000 < 1000) {
          console.log(`⏳ [${config.shortName}] CRASH esperando: M5 sin confirmación bajista (M5: ${structureM5.trend})`);
        }
        return null;
      }
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 7-9: SETUP VÁLIDO - Calcular entrada, SL y TPs
      // ──────────────────────────────────────────────────────────────────────────
      console.log(`✅ [${config.shortName}] CRASH SETUP VÁLIDO - OB H1 + CHOCH/BOS + M5 confirma`);
      
      const entry = lastCandle.close;
      
      // SL: Arriba de la zona del OB H1
      const slBuffer = avgRange * 0.3;
      const stop = Math.max(obZone.high, lastCandle.high) + slBuffer;
      
      if (stop <= entry) {
        console.log(`⛔ [${config.shortName}] CRASH bloqueado: SL inválido`);
        return null;
      }
      
      const risk = stop - entry;
      
      // TPs basados en estructura H1 y swings
      const recentLowsH1 = swingsH1.filter(s => s.type === 'low').slice(-3);
      const targetLow = recentLowsH1.length > 0 ? Math.min(...recentLowsH1.map(l => l.price)) : entry - risk * 5;
      
      const tp1 = entry - risk * 1.5;  // 1:1.5 RR
      const tp2 = entry - risk * 2.5;  // 1:2.5 RR
      const tp3 = Math.min(targetLow, entry - risk * 4);  // Mínimo estructural o 1:4
      
      // Calcular score
      let score = 70;
      let reasons = ['CRASH OB H1'];
      
      if (structureH1.trend === 'BEARISH') { score += 10; reasons.push('H1↓'); }
      if (m5Bearish) { score += 5; reasons.push('M5↓'); }
      if (hasChochM5) { score += 5; reasons.push('CHOCH M5'); }
      if (hasBearishEngulfing) { score += 5; reasons.push('Engulfing'); }
      if (obAnalysis.hasChoch) { score += 5; reasons.push('CHOCH H1'); }
      if (obAnalysis.hasBos) { score += 3; reasons.push('BOS H1'); }
      
      return {
        action: 'SHORT',
        model: 'CRASH_SPIKE',
        score: Math.min(100, score),
        entry: +entry.toFixed(config.decimals),
        stop: +stop.toFixed(config.decimals),
        tp1: +tp1.toFixed(config.decimals),
        tp2: +tp2.toFixed(config.decimals),
        tp3: +tp3.toFixed(config.decimals),
        reason: reasons.join(' + '),
        analysis: {
          type: 'crash',
          structureM5: structureM5.trend,
          structureH1: structureH1.trend,
          obH1: `${obZone.low.toFixed(2)}-${obZone.high.toFixed(2)}`,
          hasChochH1: obAnalysis.hasChoch,
          hasBosH1: obAnalysis.hasBos,
          m5Confirmation: hasChochM5 ? 'CHOCH' : hasBearishEngulfing ? 'ENGULFING' : m5Bearish ? 'STRUCTURE' : 'NEUTRAL',
          risk: +risk.toFixed(config.decimals)
        }
      };
    }
    
    return null;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DETECTAR ORDER BLOCK CON CHOCH/BOS EN H1
  // ═══════════════════════════════════════════════════════════════════════════
  // Esta función busca:
  // 1. Order Block (vela base + vela envolvente)
  // 2. Impulso después del OB
  // 3. CHOCH o BOS de confirmación
  // 4. Nuevo alto/bajo estructural
  // ═══════════════════════════════════════════════════════════════════════════
  detectOBWithChochBos(candlesH1, assetType, lookback = 30) {
    if (!candlesH1 || candlesH1.length < 10) return null;
    
    const recentCandles = candlesH1.slice(-lookback);
    const avgRange = this.getAvgRange(candlesH1);
    
    // Log para debug
    const shouldLog = Date.now() % 15000 < 1000;
    
    // Buscar Order Blocks válidos con confirmación posterior
    let bestOB = null;
    let bestScore = 0;
    
    if (shouldLog) {
      console.log(`   🔍 Buscando OB en últimas ${recentCandles.length} velas H1...`);
    }
    
    for (let i = 0; i < recentCandles.length - 2; i++) {
      const baseCandle = recentCandles[i];
      const engulfCandle = recentCandles[i + 1];
      
      if (!baseCandle || !engulfCandle) continue;
      
      const baseBody = Math.abs(baseCandle.close - baseCandle.open);
      const engulfBody = Math.abs(engulfCandle.close - engulfCandle.open);
      
      // Requisito mínimo muy relajado
      if (baseBody < avgRange * 0.05 || engulfBody < avgRange * 0.05) continue;
      
      // ═══════════════════════════════════════════════════════════════════════
      // BOOM (BUY): Buscar OB de DEMANDA
      // Patrón: Vela ROJA + Vela VERDE que cierra arriba
      // ═══════════════════════════════════════════════════════════════════════
      if (assetType === 'boom') {
        const isBaseRed = baseCandle.close < baseCandle.open;
        const isEngulfGreen = engulfCandle.close > engulfCandle.open;
        
        // Solo necesita cerrar arriba del cierre de la roja
        const isValidPattern = isBaseRed && isEngulfGreen && 
                              engulfCandle.close > baseCandle.close;
        
        if (isValidPattern) {
          // Verificar que hubo movimiento alcista después
          const candlesAfterOB = recentCandles.slice(i + 2);
          if (candlesAfterOB.length < 1) continue;
          
          const obHigh = Math.max(engulfCandle.high, baseCandle.high);
          const obLow = Math.min(baseCandle.low, baseCandle.close);
          let hasChoch = false;
          let hasBos = false;
          let newHigh = obHigh;
          
          // Buscar máximo antes del OB
          const candlesBeforeOB = recentCandles.slice(Math.max(0, i - 10), i);
          const prevHighs = candlesBeforeOB.map(c => c.high);
          const prevSwingHigh = prevHighs.length > 0 ? Math.max(...prevHighs) : obHigh;
          
          for (const candle of candlesAfterOB) {
            if (candle.high > prevSwingHigh * 0.995) hasChoch = true;
            if (candle.high > obHigh) {
              hasBos = true;
              newHigh = Math.max(newHigh, candle.high);
            }
          }
          
          // Calcular score - dar puntos incluso sin CHOCH/BOS si el patrón es bueno
          let obScore = 20; // Base score por encontrar el patrón
          obScore += (engulfBody / baseBody) * 20;
          if (hasChoch) obScore += 30;
          if (hasBos) obScore += 20;
          obScore += Math.max(0, 15 - (recentCandles.length - i)); // Más reciente = mejor
          
          // Aceptar si tiene buen score O si tiene CHOCH/BOS
          if (obScore > bestScore && (hasChoch || hasBos || obScore > 40)) {
            bestScore = obScore;
            bestOB = {
              valid: true,
              side: 'BUY',
              zone: {
                high: Math.max(baseCandle.open, engulfCandle.open),
                low: obLow,
                mid: (baseCandle.open + obLow) / 2
              },
              hasChoch,
              hasBos,
              newHigh,
              candlesAgo: recentCandles.length - i,
              strength: Math.min(100, obScore)
            };
          }
        }
      }
      
      // ═══════════════════════════════════════════════════════════════════════
      // CRASH (SELL): Buscar OB de SUPPLY
      // Patrón: Vela VERDE + Vela ROJA que cierra abajo
      // ═══════════════════════════════════════════════════════════════════════
      if (assetType === 'crash') {
        const isBaseGreen = baseCandle.close > baseCandle.open;
        const isEngulfRed = engulfCandle.close < engulfCandle.open;
        
        // Solo necesita cerrar abajo del cierre de la verde
        const isValidPattern = isBaseGreen && isEngulfRed && 
                              engulfCandle.close < baseCandle.close;
        
        if (isValidPattern) {
          const candlesAfterOB = recentCandles.slice(i + 2);
          if (candlesAfterOB.length < 1) continue;
          
          const obHigh = Math.max(baseCandle.high, baseCandle.close);
          const obLow = Math.min(engulfCandle.low, baseCandle.low);
          let hasChoch = false;
          let hasBos = false;
          let newLow = obLow;
          
          const candlesBeforeOB = recentCandles.slice(Math.max(0, i - 10), i);
          const prevLows = candlesBeforeOB.map(c => c.low);
          const prevSwingLow = prevLows.length > 0 ? Math.min(...prevLows) : obLow;
          
          for (const candle of candlesAfterOB) {
            if (candle.low < prevSwingLow * 1.005) hasChoch = true;
            if (candle.low < obLow) {
              hasBos = true;
              newLow = Math.min(newLow, candle.low);
            }
          }
          
          let obScore = 20;
          obScore += (engulfBody / baseBody) * 20;
          if (hasChoch) obScore += 30;
          if (hasBos) obScore += 20;
          obScore += Math.max(0, 15 - (recentCandles.length - i));
          
          if (obScore > bestScore && (hasChoch || hasBos || obScore > 40)) {
            bestScore = obScore;
            bestOB = {
              valid: true,
              side: 'SELL',
              zone: {
                high: obHigh,
                low: Math.min(baseCandle.open, engulfCandle.open),
                mid: (obHigh + baseCandle.open) / 2
              },
              hasChoch,
              hasBos,
              newLow,
              candlesAgo: recentCandles.length - i,
              strength: Math.min(100, obScore)
            };
          }
        }
      }
    }
    
    if (shouldLog && bestOB) {
      console.log(`   🎯 Mejor OB: ${bestOB.side} en ${bestOB.zone.low.toFixed(2)}-${bestOB.zone.high.toFixed(2)} (Score: ${bestScore.toFixed(0)})`);
    }
    
    return bestOB;
  },

  findZones(candles) {
    const demandZones = [];
    const supplyZones = [];
    if (candles.length < 10) return { demandZones, supplyZones };

    const avgRange  = this.getAvgRange(candles);
    const lastIndex = candles.length - 1;

    // ── Find swing extremities to use as OB anchors ──
    // OBs are ONLY valid at fractal highs/lows (extremities of impulse moves)
    const swings = this.findSwings(candles, 2);
    const swingHighIdx = new Set(swings.filter(s=>s.type==='high').map(s=>s.index));
    const swingLowIdx  = new Set(swings.filter(s=>s.type==='low').map(s=>s.index));

    for (let i = 1; i < candles.length - 2; i++) {
      const base  = candles[i];
      const next1 = candles[Math.min(i + 1, lastIndex)];
      const next2 = candles[Math.min(i + 2, lastIndex)];
      const next3 = candles[Math.min(i + 3, lastIndex)];
      const baseBody = Math.abs(base.close - base.open);
      if (baseBody < avgRange * 0.08) continue; // skip doji

      // ══════════════════════════════════════════════════════════════
      // DEMAND OB (BUY): Last RED candle at a swing LOW before bullish impulse
      // The OB must be AT or NEAR a swing low extremity
      // ══════════════════════════════════════════════════════════════
      if (base.close < base.open) {
        // Must be at a swing low OR within 3 candles of one
        // BUG FIX: ventana ±4 velas (era ±2) — Step Index necesita más holgura
        const nearSwingLow = swingLowIdx.has(i) ||
          swingLowIdx.has(i-1) || swingLowIdx.has(i+1) ||
          swingLowIdx.has(i-2) || swingLowIdx.has(i+2) ||
          swingLowIdx.has(i-3) || swingLowIdx.has(i+3) ||
          swingLowIdx.has(i-4) || swingLowIdx.has(i+4);

        const n1Body = Math.abs(next1.close - next1.open);
        const n2Body = Math.abs(next2.close - next2.open);
        const n1Bull = next1.close > next1.open;
        const n2Bull = next2.close > next2.open;

        // Impulse rules (SMC exact):
        // Rule 1: 1 green candle body > red body
        const rule1 = n1Bull && n1Body > baseBody * 0.5 && next1.close > base.open;
        // Rule 2: 2 green candles combined exceed red body
        const rule2 = n1Bull && n2Bull && (n1Body + n2Body) > baseBody && next2.close > base.open;
        // Rule 3: Strong impulse from extremity
        const rule3 = nearSwingLow && Math.max(next1.high, next2.high, next3.high) - base.low > avgRange * 1.2;

        if (!rule1 && !rule2 && !rule3) continue;
        if (!nearSwingLow && !rule1 && !rule2) continue; // must be near extremity OR engulfing

        const obHigh = base.open;
        const obLow  = base.close;
        const obMid  = (obHigh + obLow) / 2;

        if (demandZones.some(z => Math.abs(z.mid - obMid) < avgRange * 0.5)) continue;

        // Mitigation: closed below OB low afterward
        let mitigated = false;
        // BUG FIX: requiere 2 cierres consecutivos para mitigar (evita falsos mitigados)
        for (let j = i + 2; j <= lastIndex - 1; j++) {
          if (candles[j].close < obLow && candles[j+1]?.close < obLow) { mitigated = true; break; }
        }

        const futureC   = candles.slice(i+1, Math.min(i+12, lastIndex+1));
        const impulseH  = futureC.length ? Math.max(...futureC.map(c=>c.high)) : obHigh;
        const impulseSize = Math.max(0, impulseH - obHigh);
        const pattern   = rule1 ? 'ENGULFING' : rule2 ? '2-CANDLE' : 'IMPULSE';

        demandZones.push({
          type:'DEMAND', side:'BUY',
          high:obHigh, low:obLow, mid:obMid,
          wickLow:base.low, index:i,
          epoch: base.epoch || (base.time ? Math.floor(base.time/1000) : null),
          impulseSize, pattern,
          strength: (rule1 || impulseSize > avgRange*2) ? 'STRONG' : 'NORMAL',
          mitigated, tested:false, atExtremity: nearSwingLow
        });
      }

      // ══════════════════════════════════════════════════════════════
      // SUPPLY OB (SELL): Last GREEN candle at a swing HIGH before bearish impulse
      // ══════════════════════════════════════════════════════════════
      if (base.close > base.open) {
        const nearSwingHigh = swingHighIdx.has(i) ||
          swingHighIdx.has(i-1) || swingHighIdx.has(i+1) ||
          swingHighIdx.has(i-2) || swingHighIdx.has(i+2) ||
          swingHighIdx.has(i-3) || swingHighIdx.has(i+3) ||
          swingHighIdx.has(i-4) || swingHighIdx.has(i+4);

        const n1Body = Math.abs(next1.close - next1.open);
        const n2Body = Math.abs(next2.close - next2.open);
        const n1Bear = next1.close < next1.open;
        const n2Bear = next2.close < next2.open;

        const rule1 = n1Bear && n1Body > baseBody * 0.5 && next1.close < base.open;
        const rule2 = n1Bear && n2Bear && (n1Body + n2Body) > baseBody && next2.close < base.open;
        const rule3 = nearSwingHigh && base.high - Math.min(next1.low, next2.low, next3.low) > avgRange * 1.2;

        if (!rule1 && !rule2 && !rule3) continue;
        if (!nearSwingHigh && !rule1 && !rule2) continue;

        const obHigh = base.close;
        const obLow  = base.open;
        const obMid  = (obHigh + obLow) / 2;

        if (supplyZones.some(z => Math.abs(z.mid - obMid) < avgRange * 0.5)) continue;

        let mitigated = false;
        for (let j = i + 2; j <= lastIndex - 1; j++) {
          if (candles[j].close > obHigh && candles[j+1]?.close > obHigh) { mitigated = true; break; }
        }

        const futureC   = candles.slice(i+1, Math.min(i+12, lastIndex+1));
        const impulseL  = futureC.length ? Math.min(...futureC.map(c=>c.low)) : obLow;
        const impulseSize = Math.max(0, obLow - impulseL);
        const pattern   = rule1 ? 'ENGULFING' : rule2 ? '2-CANDLE' : 'IMPULSE';

        supplyZones.push({
          type:'SUPPLY', side:'SELL',
          high:obHigh, low:obLow, mid:obMid,
          wickHigh:base.high, index:i,
          epoch: base.epoch || (base.time ? Math.floor(base.time/1000) : null),
          impulseSize, pattern,
          strength: (rule1 || impulseSize > avgRange*2) ? 'STRONG' : 'NORMAL',
          mitigated, tested:false, atExtremity: nearSwingHigh
        });
      }
    }

    // ── Keep only OBs from the MOST RECENT structure ──
    // Priority: 1) at extremity + unmitigated  2) STRONG + unmitigated  3) recent
    const filterOBs = (zones) => {
      // Only consider OBs from last 120 candles — old zones are irrelevant
      // FIX: OBs frescos máximo 40 velas (estructura actual, como LuxAlgo PRESENT mode)
      const recentEnough = zones.filter(z => z.index >= lastIndex - 40);
      const sorted = recentEnough.sort((a,b) => {
        if (a.atExtremity !== b.atExtremity) return a.atExtremity ? -1 : 1;
        if (a.mitigated !== b.mitigated) return a.mitigated ? 1 : -1;
        return b.index - a.index;
      });
      // Show max 3 fresh (unmitigated) OBs — no mitigated ones in display
      const fresh = sorted.filter(z => !z.mitigated).slice(0, 3);
      // Only 1 mitigated if it's from the last 30 candles (context only)
      const mitigated = sorted.filter(z => z.mitigated && z.index >= lastIndex - 30).slice(0, 1);
      return [...fresh, ...mitigated];
    };

    return { demandZones: filterOBs(demandZones), supplyZones: filterOBs(supplyZones) };
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
    if (swings.length < 4 || candles.length < 20) return null;

    const highs = swings.filter(s => s.type === 'high').slice(-8);
    const lows  = swings.filter(s => s.type === 'low').slice(-8);
    if (highs.length < 2 || lows.length < 2) return null;

    const candidates = [];

    // ── BEARISH CHoCH ──
    // Rule SMC: estructura BULLISH previa (últimos 3 highs/lows muestran HH+HL)
    // → precio cierra DEBAJO del ÚLTIMO HL formado
    // FIX: solo mirar el HL MÁS RECIENTE, no cualquier low histórico
    const recentHighs = highs.slice(-4).sort((a,b)=>a.index-b.index);
    const recentLows  = lows.slice(-4).sort((a,b)=>a.index-b.index);

    const recentHHs = recentHighs.filter((h,i) => i>0 && h.price > recentHighs[i-1].price);
    const priorStructBull = recentHHs.length >= 1; // al menos 1 HH reciente = estructura bullish

    if (priorStructBull && recentLows.length >= 2) {
      // Target: el HL más reciente ANTES del último high
      // (el que se rompe hacia abajo = CHoCH bajista)
      const lastHigh = recentHighs[recentHighs.length - 1];
      const hlsBeforeLastHigh = recentLows.filter(l => l.index < lastHigh.index);
      if (hlsBeforeLastHigh.length >= 1) {
        const targetHL = hlsBeforeLastHigh[hlsBeforeLastHigh.length - 1]; // el HL más reciente antes del HH
        // Buscar la primera vela DESPUÉS del HH que cierre POR DEBAJO del HL
        for (let j = lastHigh.index + 1; j < candles.length; j++) {
          if (candles[j].close < targetHL.price) {
            const recency = candles.length - 1 - j;
            if (recency <= 20) { // max 20 velas = 100 min en M5 (LuxAlgo: solo ÚLTIMO pivot)
              const epoch = candles[j]?.epoch || (candles[j]?.time ? Math.floor(candles[j].time/1000) : null);
              let obIndex = j - 1;
              while (obIndex > targetHL.index && candles[obIndex].close < candles[obIndex].open) obIndex--;
              candidates.push({
                type: 'BEARISH_CHOCH', side: 'SELL',
                level: targetHL.price, breakIndex: j,
                epoch, obCandleIndex: obIndex,
                priority: candles.length - j // más reciente = mayor prioridad
              });
            }
            break;
          }
        }
      }
    }

    // ── BULLISH CHoCH ──
    // Rule SMC: estructura BEARISH previa (LH+LL)
    // → precio cierra ENCIMA del ÚLTIMO LH formado
    const recentLLs = recentLows.filter((l,i) => i>0 && l.price < recentLows[i-1].price);
    const priorStructBear = recentLLs.length >= 1; // al menos 1 LL reciente = estructura bearish

    if (priorStructBear && recentHighs.length >= 2) {
      const lastLow = recentLows[recentLows.length - 1];
      const lhsBeforeLastLow = recentHighs.filter(h => h.index < lastLow.index);
      if (lhsBeforeLastLow.length >= 1) {
        const targetLH = lhsBeforeLastLow[lhsBeforeLastLow.length - 1]; // LH más reciente antes del LL
        for (let j = lastLow.index + 1; j < candles.length; j++) {
          if (candles[j].close > targetLH.price) {
            const recency = candles.length - 1 - j;
            if (recency <= 60) {
              const epoch = candles[j]?.epoch || (candles[j]?.time ? Math.floor(candles[j].time/1000) : null);
              let obIndex = j - 1;
              while (obIndex > targetLH.index && candles[obIndex].close > candles[obIndex].open) obIndex--;
              candidates.push({
                type: 'BULLISH_CHOCH', side: 'BUY',
                level: targetLH.price, breakIndex: j,
                epoch, obCandleIndex: obIndex,
                priority: candles.length - j
              });
            }
            break;
          }
        }
      }
    }

    if (!candidates.length) return null;

    // Elegir el CHoCH más reciente
    candidates.sort((a,b) => a.priority - b.priority);
    const best = candidates[0];

    if (best.obCandleIndex >= 0 && candles[best.obCandleIndex]) {
      const obc = candles[best.obCandleIndex];
      best.obEpoch = obc.epoch || (obc.time ? Math.floor(obc.time/1000) : null);
    }
    return best;
  },

  // ── Find the exact OB formed at a CHoCH or BOS impulse ──
  // The SMC rule: OB = LAST candle of opposite color BEFORE the impulse
  // that created the structure break (CHoCH or BOS)
  findStructureOB(candles, breakIndex, direction) {
    if (!candles || breakIndex < 2) return null;
    const avgRange = this.getAvgRange(candles);

    if (direction === 'BUY') {
      // Find last RED candle before the bullish impulse
      // Go backward from breakIndex until we find the last RED candle
      let lastRedIdx = -1;
      for (let i = breakIndex - 1; i >= Math.max(0, breakIndex - 20); i--) {
        if (candles[i].close < candles[i].open) { lastRedIdx = i; break; }
      }
      if (lastRedIdx < 0) return null;
      const base = candles[lastRedIdx];
      const obHigh = base.open;
      const obLow  = base.close;
      if (obHigh - obLow < avgRange * 0.05) return null; // skip doji
      return {
        type: 'DEMAND', side: 'BUY',
        high: obHigh, low: obLow, mid: (obHigh+obLow)/2,
        wickLow: base.low,
        index: lastRedIdx,
        epoch: base.epoch || (base.time ? Math.floor(base.time/1000) : null),
        pattern: 'CHOCH_OB', strength: 'STRONG',
        mitigated: false, atExtremity: true, isStructureOB: true
      };
    }
    if (direction === 'SELL') {
      // Find last GREEN candle before the bearish impulse
      let lastGreenIdx = -1;
      for (let i = breakIndex - 1; i >= Math.max(0, breakIndex - 20); i--) {
        if (candles[i].close > candles[i].open) { lastGreenIdx = i; break; }
      }
      if (lastGreenIdx < 0) return null;
      const base = candles[lastGreenIdx];
      const obHigh = base.close;
      const obLow  = base.open;
      if (obHigh - obLow < avgRange * 0.05) return null;
      return {
        type: 'SUPPLY', side: 'SELL',
        high: obHigh, low: obLow, mid: (obHigh+obLow)/2,
        wickHigh: base.high,
        index: lastGreenIdx,
        epoch: base.epoch || (base.time ? Math.floor(base.time/1000) : null),
        pattern: 'CHOCH_OB', strength: 'STRONG',
        mitigated: false, atExtremity: true, isStructureOB: true
      };
    }
    return null;
  },

  detectBOS(candles, swings, structure) {
    if (swings.length < 3 || candles.length < 5) return null;

    // FIX: BOS = when price closes BEYOND the PREVIOUS swing high/low
    // Not just the last candle vs last swing — need to find where the break actually occurred
    if (structure.trend === 'BULLISH') {
      const highs = swings.filter(s => s.type === 'high').slice(-5);
      if (highs.length >= 2) {
        // Target: the previous swing high (second-to-last) — breaking it = BOS continuation
        const targetHigh = highs[highs.length - 2]; // previous HH
        // Find where price first broke above it
        let breakIdx = -1;
        for (let j = targetHigh.index + 1; j < candles.length; j++) {
          if (candles[j].close > targetHigh.price) {
            breakIdx = j;
            break;
          }
        }
        if (breakIdx > 0 && breakIdx >= candles.length - 50) {
          const c = candles[breakIdx];
          return { type: 'BULLISH_BOS', side: 'BUY', level: targetHigh.price,
            epoch: c?.epoch || (c?.time ? Math.floor(c.time/1000) : null),
            breakIndex: breakIdx };
        }
      }
    }
    if (structure.trend === 'BEARISH') {
      const lows = swings.filter(s => s.type === 'low').slice(-5);
      if (lows.length >= 2) {
        const targetLow = lows[lows.length - 2]; // previous LL
        let breakIdx = -1;
        for (let j = targetLow.index + 1; j < candles.length; j++) {
          if (candles[j].close < targetLow.price) {
            breakIdx = j;
            break;
          }
        }
        if (breakIdx > 0 && breakIdx >= candles.length - 50) {
          const c = candles[breakIdx];
          return { type: 'BEARISH_BOS', side: 'SELL', level: targetLow.price,
            epoch: c?.epoch || (c?.time ? Math.floor(c.time/1000) : null),
            breakIndex: breakIdx };
        }
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

    const last   = candles[candles.length - 1];
    const avgRange = this.getAvgRange(candles);

    // touchedRecently: wick del precio rozó el OB en las últimas N velas
    // FIX: tolerancia 0.15x avgRange (era 0.5x — demasiado amplio)
    // FIX: ventana máx 5 velas = 25 min en M5 (era 8 = 40 min)
    const touchedRecently = (zone, n, side) => {
      const window = candles.slice(-Math.min(n, 5));
      return window.some(c => {
        if (side === 'BUY')  return c.low  <= zone.high + avgRange * 0.15 && c.high >= zone.low;
        if (side === 'SELL') return c.high >= zone.low  - avgRange * 0.15 && c.low  <= zone.high;
        return false;
      });
    };

    // ── Helper: check if any candle in last N shows rejection ──
    const recentConf = (zone, n, side) => {
      const window = candles.slice(-n);
      if (side === 'BUY') {
        return window.some(c => {
          const wickBull = (Math.min(c.open,c.close)-c.low) > Math.abs(c.close-c.open)*0.3;
          const bullClose = c.close > c.open;
          const pinBar = c.low < zone.low && c.close > zone.mid;
          return bullClose || wickBull || pinBar;
        });
      }
      if (side === 'SELL') {
        return window.some(c => {
          const wickBear = (c.high-Math.max(c.open,c.close)) > Math.abs(c.close-c.open)*0.3;
          const bearClose = c.close < c.open;
          const pinBar = c.high > zone.high && c.close < zone.mid;
          return bearClose || wickBear || pinBar;
        });
      }
      return false;
    };

    // ══════════════════════════════════════════════════════════════════════
    // PULLBACK A ZONA DE DEMANDA (COMPRAS)
    // ══════════════════════════════════════════════════════════════════════
    for (const zone of demandZones) {
      if (zone.mitigated) continue;

      // Touch check: últimas 8 velas (40 min en M5)
      const touched = touchedRecently(zone, 8, 'BUY');
      if (!touched) continue;

      const isStructOB = zone.isStructureOB || zone.pattern === 'CHOCH_OB';

      // FIX CONFIRMACIÓN: exigir que el precio esté EN el OB primero,
      // luego la vela de confirmación debe cerrar ENCIMA del piso del OB
      // lastBullClose con "c.close > zone.low" sola no es suficiente —
      // puede ser una vela verde ENCIMA del OB sin que el precio haya retrocedido
      // NUEVO: verificar que al menos 1 vela en las últimas 5 tocó el OB (low dentro)
      // Y que después de ese toque hay confirmación alcista
      const touchIdx = candles.slice(-5).findIndex(c => c.low <= zone.high + avgRange * 0.15 && c.low >= zone.low - avgRange * 0.5);
      const hasOBTouch = touchIdx >= 0;
      // Confirmación: vela alcista DESPUÉS del toque (cierre encima del piso del OB)
      const afterTouch = hasOBTouch ? candles.slice(-(5-touchIdx)) : [];
      const confAfterTouch = afterTouch.some(c => c.close > c.open && c.close >= zone.low);
      const hasConf = isStructOB
        ? hasOBTouch && (confAfterTouch || recentConf(zone, 3, 'BUY'))
        : hasOBTouch && confAfterTouch;

      if (!hasConf) continue;

      // ENTRADA INSTITUCIONAL: en el borde del OB, no en el cierre de vela
      // BUY → entry en zone.high (techo del OB de demanda)
      // SL → debajo del wick más bajo del OB
      // Si precio ya pasó el OB → usar last.close pero verificar sigue cerca
      const priceInOB      = last.close >= zone.low && last.close <= zone.high;
      const priceJustBelow = last.close < zone.low  && last.close >= zone.low - avgRange * 0.3;
      if (!priceInOB && !priceJustBelow) continue;

      // Entrada en el techo del OB (zona de mayor valor) — SL más corto
      const entry   = priceInOB
        ? +(zone.high).toFixed(config.decimals)  // precio llega al OB → entrada en el techo
        : +(last.close).toFixed(config.decimals); // precio justo debajo → entrada en close
      const slLevel = +((zone.wickLow || zone.low) - avgRange * 0.2).toFixed(config.decimals);
      const risk    = entry - slLevel;
      if (risk <= 0 || risk > avgRange * 8) continue;

      const conf = candles.slice(-3).some(c => c.close>c.open && c.close>candles[candles.length-4]?.close)
        ? 'BULLISH_CLOSE'
        : isStructOB ? 'CHOCH_OB' : 'ZONE_TOUCH';

      return {
        type: 'DEMAND_ZONE', side: 'BUY', zone,
        entry, stop: slLevel,
        tp1: +(entry + risk*1.5).toFixed(config.decimals),
        tp2: +(entry + risk*2.5).toFixed(config.decimals),
        tp3: +(entry + risk*4.0).toFixed(config.decimals),
        touchedOB: true, entryType: 'OB_CURRENT_CLOSE', confirmation: conf
      };
    }

    // ══════════════════════════════════════════════════════════════════════
    // PULLBACK A ZONA DE SUPPLY (VENTAS)
    // ══════════════════════════════════════════════════════════════════════
    for (const zone of supplyZones) {
      if (zone.mitigated) continue;

      // Touch check: últimas 8 velas
      const touched = touchedRecently(zone, 8, 'SELL');
      if (!touched) continue;

      const isStructOB = zone.isStructureOB || zone.pattern === 'CHOCH_OB';

      // FIX: mismo patrón que BUY — toque real del OB primero, confirmación después
      const touchIdxS = candles.slice(-5).findIndex(c => c.high >= zone.low - avgRange * 0.15 && c.high <= zone.high + avgRange * 0.5);
      const hasOBTouchS = touchIdxS >= 0;
      const afterTouchS = hasOBTouchS ? candles.slice(-(5-touchIdxS)) : [];
      const confAfterTouchS = afterTouchS.some(c => c.close < c.open && c.close <= zone.high);
      const hasConf = isStructOB
        ? hasOBTouchS && (confAfterTouchS || recentConf(zone, 3, 'SELL'))
        : hasOBTouchS && confAfterTouchS;

      if (!hasConf) continue;

      // ENTRADA INSTITUCIONAL SELL: en el piso del OB de oferta → SL más corto
      const priceInOB      = last.close >= zone.low && last.close <= zone.high;
      const priceJustAbove = last.close > zone.high && last.close <= zone.high + avgRange * 0.3;
      if (!priceInOB && !priceJustAbove) continue;

      const entry   = priceInOB
        ? +(zone.low).toFixed(config.decimals)   // en OB → entrada en el piso (nivel más bajo)
        : +(last.close).toFixed(config.decimals); // justo encima → entrada en close
      const slLevel = +((zone.wickHigh || zone.high) + avgRange * 0.2).toFixed(config.decimals);
      const risk    = slLevel - entry;
      if (risk <= 0 || risk > avgRange * 8) continue;

      const conf = candles.slice(-3).some(c => c.close<c.open && c.close<candles[candles.length-4]?.close)
        ? 'BEARISH_CLOSE'
        : isStructOB ? 'CHOCH_OB' : 'ZONE_TOUCH';

      return {
        type: 'SUPPLY_ZONE', side: 'SELL', zone,
        entry, stop: slLevel,
        tp1: +(entry - risk*1.5).toFixed(config.decimals),
        tp2: +(entry - risk*2.5).toFixed(config.decimals),
        tp3: +(entry - risk*4.0).toFixed(config.decimals),
        touchedOB: true, entryType: 'OB_CURRENT_CLOSE', confirmation: conf
      };
    }

    return null;
  },
  // ═══════════════════════════════════════════════════════════════
  // ANÁLISIS M1_PRECISION
  // Lógica: H1 define tendencia → M15 define zona de interés → M1 da entrada
  // Requiere triple confluencia + confirmación de vela en M1
  // ═══════════════════════════════════════════════════════════════
  analyzeM1Precision(candlesM1, candlesM15, candlesH1, structureH1, structureM15, structureM5, config, avgRange, premiumDiscount) {
    if (!candlesM1 || candlesM1.length < 20) return null;
    if (structureH1.trend === 'LOADING' || structureH1.trend === 'NEUTRAL') return null;
    if (structureM15.trend === 'LOADING' || structureM15.trend === 'NEUTRAL') return null;

    // ── FILTRO 1: Triple confluencia H1 = M15 = M5 ──
    const tripleAlign = structureH1.trend === structureM15.trend && structureM15.trend === structureM5.trend;
    if (!tripleAlign) return null;

    const direction = structureH1.trend; // 'BULLISH' o 'BEARISH'
    const isBuy = direction === 'BULLISH';

    // ── FILTRO 2: Premium/Discount correcto en H1 ──
    // Compras en zonas Discount, ventas en Premium
    const pdOk = (isBuy && premiumDiscount === 'DISCOUNT') || (!isBuy && premiumDiscount === 'PREMIUM') || premiumDiscount === 'EQUILIBRIUM';
    if (!pdOk) return null;

    // ── ANÁLISIS M15: Encontrar zona de interés ──
    const { demandZones: demM15, supplyZones: supM15 } = this.findZones(candlesM15);
    const avgM15 = this.getAvgRange(candlesM15);
    const zonesM15 = isBuy ? demM15 : supM15;
    if (zonesM15.length === 0) return null;

    // ── ANÁLISIS M1: Confirmación de entrada precisa ──
    const m1 = candlesM1;
    const lastM1 = m1[m1.length - 1];
    const prevM1 = m1[m1.length - 2];
    const prev2M1 = m1[m1.length - 3];
    if (!lastM1 || !prevM1 || !prev2M1) return null;

    const price = lastM1.close;
    const avgM1 = this.getAvgRange(m1.slice(-30));

    // ── PATRÓN M1: CHoCH o Order Block en M1 ──
    // Para LONG: necesitamos vela roja seguida de verde que la envuelva (micro OB)
    // Para SHORT: vela verde seguida de roja envolvente
    const m1BullEngulf = isBuy &&
      prev2M1.close < prev2M1.open &&  // vela roja (base OB)
      prevM1.close > prevM1.open &&    // vela verde
      prevM1.close > prev2M1.open &&   // envuelve
      prevM1.open <= prev2M1.close;

    const m1BearEngulf = !isBuy &&
      prev2M1.close > prev2M1.open &&  // vela verde (base OB)
      prevM1.close < prevM1.open &&    // vela roja
      prevM1.close < prev2M1.open &&   // envuelve
      prevM1.open >= prev2M1.close;

    // Rechazo de mecha en M1 (pin bar)
    const m1BullWick = isBuy &&
      (lastM1.low < Math.min(lastM1.open, lastM1.close) - avgM1 * 0.5) && // mecha larga abajo
      lastM1.close > lastM1.open &&  // vela alcista
      lastM1.close > (lastM1.high + lastM1.low) / 2;

    const m1BearWick = !isBuy &&
      (lastM1.high > Math.max(lastM1.open, lastM1.close) + avgM1 * 0.5) && // mecha larga arriba
      lastM1.close < lastM1.open &&  // vela bajista
      lastM1.close < (lastM1.high + lastM1.low) / 2;

    // CHoCH en M1: dos mínimos/máximos consecutivos rompen la estructura local
    const swingsM1 = this.findSwings(m1.slice(-20), 1);
    const m1Choch = this.detectCHoCH(m1.slice(-20), swingsM1);
    const m1ChochOk = m1Choch && (
      (isBuy && m1Choch.side === 'BUY') ||
      (!isBuy && m1Choch.side === 'SELL')
    );

    const hasM1Confirmation = m1BullEngulf || m1BearEngulf || m1BullWick || m1BearWick || m1ChochOk;
    if (!hasM1Confirmation) return null;

    // ── VERIFICAR que el precio está en/cerca de zona M15 ──
    const nearZone = zonesM15.some(z => {
      const zoneRange = z.high - z.low;
      const buffer = zoneRange * 0.5 + avgM15 * 1.0;
      return price >= z.low - buffer && price <= z.high + buffer;
    });
    if (!nearZone) return null;

    // ── CALCULAR NIVELES ──
    // Entry: precio actual
    // SL: basado en la zona M15 más cercana (más robusto que solo M1 structure)
    // Usar zona M15 para que el SL sea estructural, no un mínimo de 10 velas M1
    const { demandZones: demM15sl, supplyZones: supM15sl } = this.findZones(candlesM15);
    const avgM15sl = this.getAvgRange(candlesM15);
    const nearestM15Zone = isBuy
      ? demM15sl.filter(z => !z.mitigated).sort((a,b) => b.high - a.high)[0]
      : supM15sl.filter(z => !z.mitigated).sort((a,b) => a.low - b.low)[0];

    let entry, stop, risk;
    if (isBuy) {
      entry = price;
      // SL: bajo del OB M15 más cercano, o mínimo de las últimas 15 velas M1
      const m1Low15 = Math.min(...m1.slice(-15).map(c => c.low));
      stop  = nearestM15Zone
        ? +((nearestM15Zone.wickLow || nearestM15Zone.low) - avgM15sl * 0.3).toFixed(config.decimals)
        : +(m1Low15 - avgM1 * 0.5).toFixed(config.decimals);
      risk  = entry - stop;
    } else {
      entry = price;
      const m1High15 = Math.max(...m1.slice(-15).map(c => c.high));
      stop  = nearestM15Zone
        ? +((nearestM15Zone.wickHigh || nearestM15Zone.high) + avgM15sl * 0.3).toFixed(config.decimals)
        : +(m1High15 + avgM1 * 0.5).toFixed(config.decimals);
      risk  = stop - entry;
    }

    if (risk <= 0 || risk > avgM15sl * 5) return null; // Riesgo inválido

    // ── SCORE ──
    let score = 82; // Base alta porque requiere triple confluencia
    if (structureH1.strength > 70) score += 5;
    if (structureM15.strength > 70) score += 4;
    if (m1ChochOk) score += 5;                       // CHoCH en M1 = confirmación fuerte
    if (m1BullEngulf || m1BearEngulf) score += 4;    // Engulfing en M1
    if (premiumDiscount !== 'EQUILIBRIUM') score += 3; // P/D correcto
    if (m1BullWick || m1BearWick) score += 3;        // Pin bar en M1

    score = Math.min(score, 97);

    const confDetail = [
      m1ChochOk ? 'CHoCH_M1' : null,
      m1BullEngulf || m1BearEngulf ? 'OB_M1' : null,
      m1BullWick || m1BearWick ? 'WICK_M1' : null,
    ].filter(Boolean).join('+');

    return {
      model: 'M1_PRECISION',
      baseScore: score,
      pullback: {
        side: isBuy ? 'BUY' : 'SELL',
        entry: +entry.toFixed(config.decimals),
        stop:  +stop.toFixed(config.decimals),
        tp1:   isBuy ? +(entry + risk * 1.5).toFixed(config.decimals) : +(entry - risk * 1.5).toFixed(config.decimals),
        tp2:   isBuy ? +(entry + risk * 2.5).toFixed(config.decimals) : +(entry - risk * 2.5).toFixed(config.decimals),
        tp3:   isBuy ? +(entry + risk * 4.0).toFixed(config.decimals) : +(entry - risk * 4.0).toFixed(config.decimals),
        type: 'M1_ENTRY'
      },
      reason: `Triple MTF ${direction} | M15 zona | ${confDetail}`
    };
  },

  analyze(candlesM5, candlesH1, config, state, candlesM15 = null, candlesM1 = null) {
    if (candlesM5.length < 30) {
      return { action: 'LOADING', score: 0, model: 'LOADING', reason: 'Cargando datos M5...' };
    }
    
    const swingsM5 = this.findSwings(candlesM5, 2); // lb=2 for M5 — detects smaller swings
    
    // Para Boom/Crash usar función de estructura específica
    const isBoomCrash = config.type === 'boom' || config.type === 'crash';
    const structureM5 = isBoomCrash 
      ? this.analyzeStructureBoomCrash(candlesM5, config.type)
      : this.analyzeStructure(swingsM5, candlesM5);
    
    const { demandZones, supplyZones } = this.findZones(candlesM5);
    const fvgZones = this.findFVGs(candlesM5);
    const avgRange = this.getAvgRange(candlesM5);
    const liquidityLevels = this.findLiquidityLevels(swingsM5, avgRange);
    const orderFlow = this.analyzeOrderFlow(candlesM5);
    const choch = this.detectCHoCH(candlesM5, swingsM5);
    const bos = this.detectBOS(candlesM5, swingsM5, structureM5);

    // ── STRUCTURE OB: The OB formed at the CHoCH or BOS impulse ──
    // This is the MOST IMPORTANT OB — it's where smart money entered to create the break
    // Prepend it to the zone list so it's always shown first and used for entry
    if (choch) {
      const structOB = this.findStructureOB(candlesM5, choch.breakIndex, choch.side);
      if (structOB) {
        if (choch.side === 'BUY' && !demandZones.some(z => Math.abs(z.mid - structOB.mid) < avgRange * 0.3)) {
          demandZones.unshift(structOB); // add to front
          demandZones.splice(4); // keep max 4
        }
        if (choch.side === 'SELL' && !supplyZones.some(z => Math.abs(z.mid - structOB.mid) < avgRange * 0.3)) {
          supplyZones.unshift(structOB);
          supplyZones.splice(4);
        }
      }
    }
    if (bos && !choch) {
      const structOB = this.findStructureOB(candlesM5, bos.breakIndex, bos.side);
      if (structOB) {
        if (bos.side === 'BUY' && !demandZones.some(z => Math.abs(z.mid - structOB.mid) < avgRange * 0.3)) {
          demandZones.unshift(structOB);
          demandZones.splice(4);
        }
        if (bos.side === 'SELL' && !supplyZones.some(z => Math.abs(z.mid - structOB.mid) < avgRange * 0.3)) {
          supplyZones.unshift(structOB);
          supplyZones.splice(4);
        }
      }
    }

    const pullback = this.detectPullback(candlesM5, demandZones, supplyZones, config);

    state.swings = swingsM5;
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
      const swingsH1 = this.findSwings(candlesH1, 3); // lb=3 for cleaner H1 swings
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
    
    // ═══════════════════════════════════════════
    // ANÁLISIS ESPECIAL PARA BOOM/CRASH v16
    // Ahora con confirmación H1 + OB Válido
    // ═══════════════════════════════════════════
    if (config.type === 'boom' || config.type === 'crash') {
      const rules = BOOM_CRASH_RULES[config.type];
      const boomCrashSignal = this.analyzeBoomCrash(candlesM5, config, state, rules, candlesH1);
      
      if (boomCrashSignal) {
        console.log(`🚀 [${config.shortName}] Señal ${config.type.toUpperCase()}: ${boomCrashSignal.reason} (Score: ${boomCrashSignal.score})`);
        return boomCrashSignal;
      }
      
      // Si no hay señal Boom/Crash, retornar WAIT con info específica
      return {
        action: 'WAIT',
        score: 0,
        model: config.type === 'boom' ? 'BOOM_WAIT' : 'CRASH_WAIT',
        reason: `${config.type === 'boom' ? 'Esperando setup LONG en zona Discount' : 'Esperando setup SHORT en zona Premium'}`,
        analysis: {
          structureM5: structureM5.trend,
          premiumDiscount,
          type: config.type,
          onlyDirection: config.onlyDirection
        }
      };
    }
    
    // ═══════════════════════════════════════════
    // ANÁLISIS ESTÁNDAR (Step, V75, XAU, etc.)
    // ═══════════════════════════════════════════
    const mtfConfluence = h1Loaded && 
                          structureH1.trend === structureM5.trend && 
                          structureH1.trend !== 'NEUTRAL';
    
    state.mtfConfluence = mtfConfluence;

    // ═══════════════════════════════════════════
    // ANÁLISIS M15 — Tendencia intermedia
    // ═══════════════════════════════════════════
    let structureM15 = { trend: 'LOADING', strength: 0 };
    let m15Loaded = false;
    if (candlesM15 && candlesM15.length >= 20) {
      m15Loaded = true;
      const swingsM15 = this.findSwings(candlesM15, 3);
      structureM15 = this.analyzeStructure(swingsM15, candlesM15);
      state.structureM15 = structureM15;
      state.swingsM15 = swingsM15; // save for frontend labels

      // M15 CHoCH and BOS
      const chochM15 = this.detectCHoCH(candlesM15, swingsM15);
      const bosM15   = this.detectBOS(candlesM15, swingsM15, structureM15);
      state.chochM15 = chochM15;
      state.bosM15   = bosM15;

      // M15 Order Block zones
      const zonesM15 = this.findZones(candlesM15);
      let demandM15 = zonesM15.demandZones;
      let supplyM15 = zonesM15.supplyZones;

      // ── Add Structure OBs from M15 CHoCH/BOS (same logic as M5) ──
      const avgRangeM15 = this.getAvgRange(candlesM15);
      if (chochM15) {
        const structOB15 = this.findStructureOB(candlesM15, chochM15.breakIndex, chochM15.side);
        if (structOB15) {
          if (chochM15.side === 'BUY' && !demandM15.some(z => Math.abs(z.mid - structOB15.mid) < avgRangeM15 * 0.3)) {
            demandM15.unshift(structOB15); demandM15.splice(4);
          }
          if (chochM15.side === 'SELL' && !supplyM15.some(z => Math.abs(z.mid - structOB15.mid) < avgRangeM15 * 0.3)) {
            supplyM15.unshift(structOB15); supplyM15.splice(4);
          }
        }
      }
      if (bosM15 && !chochM15) {
        const structOB15 = this.findStructureOB(candlesM15, bosM15.breakIndex, bosM15.side);
        if (structOB15) {
          if (bosM15.side === 'BUY' && !demandM15.some(z => Math.abs(z.mid - structOB15.mid) < avgRangeM15 * 0.3)) {
            demandM15.unshift(structOB15); demandM15.splice(4);
          }
          if (bosM15.side === 'SELL' && !supplyM15.some(z => Math.abs(z.mid - structOB15.mid) < avgRangeM15 * 0.3)) {
            supplyM15.unshift(structOB15); supplyM15.splice(4);
          }
        }
      }

      state.demandZonesM15 = demandM15;
      state.supplyZonesM15 = supplyM15;
    }
    state.structureM15 = structureM15;
    state.m15Loaded = m15Loaded;

    // Triple confluencia: H1 + M15 + M5 en la misma dirección
    const tripleConfluence = h1Loaded && m15Loaded &&
      structureH1.trend === structureM15.trend &&
      structureM15.trend === structureM5.trend &&
      structureH1.trend !== 'NEUTRAL';

    // ── FILTRO GLOBAL: H1 y M15 deben estar alineados para cualquier señal ──
    // Si H1 y M15 no están en la misma dirección → no operar
    // h1m15Aligned: H1 and M15 same direction,
    //   OR H1 strong + M15 NEUTRAL (clear trend, no opposition),
    //   OR M15 fresh CHoCH (market just changed — respect that direction)
    const sameDirection = structureH1.trend === structureM15.trend &&
                          structureH1.trend !== 'NEUTRAL' &&
                          structureH1.trend !== 'LOADING';
    const h1StrongM15Neutral = structureH1.trend !== 'NEUTRAL' &&
                               structureH1.trend !== 'LOADING' &&
                               structureM15.trend === 'NEUTRAL' &&
                               structureH1.strength >= 55;
    // ── CRITICAL SMC RULE: H1+M5 agreement = primary direction, no override ──
    // If H1 BEARISH + M5 BEARISH: M15 bounce CHoCH = PULLBACK for SELL, NOT a buy signal
    // If H1 BULLISH + M5 BULLISH: M15 dip CHoCH   = PULLBACK for BUY,  NOT a sell signal
    const h1m5Agree = structureH1.trend === structureM5.trend &&
                      structureH1.trend !== 'NEUTRAL' &&
                      structureH1.trend !== 'LOADING';

    // m15ChochOverride ONLY activates when H1 and M5 DISAGREE
    // (genuine reversal scenario, not a retracement)
    const m15ChochOverride = !!(state.chochM15 &&
      state.chochM15.breakIndex >= (candlesM15?.length||0) - 40 &&
      !h1m5Agree && // ← Never override when H1+M5 both agree on direction
      (() => {
        const chochDir = state.chochM15.side;
        const lastM5  = candlesM5?.[candlesM5.length - 1];
        const prev5M5 = candlesM5?.[Math.max(0, candlesM5.length - 6)];
        if (!lastM5 || !prev5M5) return false;
        if (chochDir === 'BUY')  return lastM5.close > prev5M5.close || structureM5.strength < 45;
        if (chochDir === 'SELL') return lastM5.close < prev5M5.close || structureM5.strength < 45;
        return false;
      })()
    );
    // FIX 3: m15m5Aligned fue el origen de los BUY contra H1 BEARISH.
    // Se mantiene solo cuando M15+M5+BOS todos confirman la misma dirección.
    // La diferencia clave vs el bug anterior: requiere BOS confirmado.

    // ── NUEVA CONDICIÓN: M15 + M5 + BOS alineados (contra H1) ──
    // Caso exacto: H1 BULL + M15 BEAR(76%) + M5 BEAR(74%) + BOS↓
    // En SMC esto es: pullback dentro de H1 bullish → SHORT válido
    // Con threshold de score más alto (90%) por ser counter-H1
    // M15+M5 alineados — dos variantes:
    // A) Con BOS confirmado (alta confianza)
    // B) Sin BOS pero M15+M5 muy fuertes (≥70%) — momentum claro
    const m15m5BosAligned = m15Loaded &&
      structureM15.trend !== 'NEUTRAL' &&
      structureM5.trend  !== 'NEUTRAL' &&
      structureM15.trend === structureM5.trend &&
      structureM15.strength >= 65 &&
      structureM5.strength  >= 60 &&
      bos !== null &&
      bos.side === (structureM15.trend === 'BEARISH' ? 'SELL' : 'BUY') &&
      structureM15.trend !== structureH1.trend;

    // NUEVO: M15+M5 fuertes sin BOS — permite operar momentum claro
    // Caso Oro: M5 BULL + M15 BULL fuertes aunque H1 BEAR → señal BUY válida
    const m15m5MomentumAligned = m15Loaded &&
      structureM15.trend !== 'NEUTRAL' &&
      structureM5.trend  !== 'NEUTRAL' &&
      structureM15.trend === structureM5.trend &&
      structureM15.strength >= 70 &&   // M15 muy fuerte
      structureM5.strength  >= 65 &&   // M5 muy fuerte
      structureM15.trend !== structureH1.trend; // contra H1 (requiere más evidencia)

    const h1m15Aligned = h1Loaded && m15Loaded && (
      sameDirection || h1StrongM15Neutral || m15ChochOverride ||
      m15m5BosAligned || m15m5MomentumAligned || // M15+M5 alineados
      // M5 CHoCH+BOS solo si la dirección coincide con H1
      (choch !== null && bos !== null &&
       bos.side === choch.side &&
       choch.side === (structureH1.trend === 'BULLISH' ? 'BUY' : 'SELL'))
    );

    // ── FILTRO GLOBAL: necesitamos también confirmación de fuerza ──
    const h1Strong  = structureH1.strength  >= 40;
    const m15Strong = structureM15.strength >= 35;
    // FIX 2: Oro score=0 — H1 BEAR 100% + M15 NEUTRAL (20%) + M5 BEAR 79%
    // h1StrongM15Neutral=true → h1m15Aligned=true PERO marketReady=false porque m15Strong=false
    // Solución: cuando H1 es muy fuerte (≥70%) Y M5 confirma la dirección → marketReady=true
    // Esto captura exactamente: H1 BEAR 100% + M15 NEUTRAL + M5 BEAR → operar en dirección H1
    const h1VeryStrongM5Confirms = structureH1.strength >= 70 &&
      structureH1.trend !== 'NEUTRAL' &&
      structureM5.trend === structureH1.trend; // M5 confirma H1
    const marketReady = h1m15Aligned && h1Strong && (m15Strong || m15ChochOverride || h1VeryStrongM5Confirms || m15m5BosAligned);

    // ── EXCEPCIÓN: CHoCH en M5/M15 cuando el mercado cambia de dirección ──
    // Caso 1: M15 NEUTRAL + M5 CHoCH + BOS = transición de tendencia
    // Caso 2: M15 CHoCH reciente + M5 confirma = reversión en marcha
    // m15ChochFresh: M15 CHoCH within 40 candles — also blocked when H1+M5 agree
    // Same rule: H1+M5 BEARISH + M15 bounce CHoCH = PULLBACK not reversal
    const m15ChochFresh = !!(state.chochM15 &&
      state.chochM15.breakIndex >= (candlesM15?.length||0) - 40 &&
      !h1m5Agree && // same guard
      (() => {
        const chochDir = state.chochM15.side;
        const lastM5  = candlesM5?.[candlesM5.length - 1];
        const prev5M5 = candlesM5?.[Math.max(0, candlesM5.length - 6)];
        if (!lastM5 || !prev5M5) return true;
        if (chochDir === 'BUY')  return lastM5.close > prev5M5.close || structureM5.strength < 45;
        if (chochDir === 'SELL') return lastM5.close < prev5M5.close || structureM5.strength < 45;
        return true;
      })()
    );

    // m5ChochReversal: M5 CHoCH+BOS detected against H1+M15 trend
    // Triggers when:
    //   • M15 NEUTRAL + M5 CHoCH+BOS (classic transition)
    //   • M15 BEARISH + M5 CHoCH+BOS (clear reversal from LL/HH extremity)
    //   • m15ChochFresh (M15 already confirmed)
    const m5ChochReversal = h1Loaded && h1Strong &&
      choch !== null && bos !== null &&
      (
        structureM15.trend === 'NEUTRAL' ||
        m15ChochFresh ||
        // New: M5 CHoCH goes AGAINST H1+M15 (reversal from extremity)
        (choch.side !== (structureH1.trend === 'BULLISH' ? 'BUY' : 'SELL') &&
         bos.side === choch.side) // CHoCH + BOS confirm same new direction
      );

    // ── signals array, minScore, opDir ──
    const signals = [];

    // opDir: dirección operativa con prioridad clara
    // 1. CHoCH M15 fresco → dirección del CHoCH M15
    // 2. M15+M5+BOS alineados contra H1 → dirección de M15 (setup counter-H1 con evidencia fuerte)
    // 3. M5 CHoCH con M15 neutral → dirección CHoCH M5
    // 4. DEFAULT: siempre H1
    // BUG FIX 1: H1 muy fuerte (≥85%) = NO override permitido
    // H1 BEAR 99% + M15 BULL = M15 es pullback, no reversión
    // Las instituciones no van contra tendencia H1 con esa fuerza
    const h1VeryStrong = structureH1.trend !== 'NEUTRAL' && structureH1.strength >= 85;

    const opDir = h1VeryStrong && !m15m5MomentumAligned
      ? structureH1.trend  // H1 domina — EXCEPTO si M15+M5 tienen momentum muy claro
      : m15ChochFresh
        ? (state.chochM15.side === 'BUY' ? 'BULLISH' : 'BEARISH')
        : m15m5BosAligned || m15m5MomentumAligned
          ? (structureM15.trend === 'BEARISH' ? 'BEARISH' : 'BULLISH')
          : (m5ChochReversal && choch && structureM15.trend === 'NEUTRAL')
            ? (choch.side === 'BUY' ? 'BULLISH' : 'BEARISH')
            : structureH1.trend;
    const opSide = opDir === 'BULLISH' ? 'BUY' : 'SELL';

    const isCounterTrend = opDir !== structureH1.trend && structureH1.trend !== 'NEUTRAL';
    // Con H1 muy fuerte: siempre con tendencia (no counter-trend posible)
    // Counter-trend normal: mínimo 92%
    const minScore = h1VeryStrong && !m15m5MomentumAligned
      ? 88   // con tendencia H1 pura
      : isCounterTrend
        ? (m15m5BosAligned ? 90 : m15m5MomentumAligned ? 91 : 92)
        : Math.max(88, 85);

    if (!marketReady && !m5ChochReversal) {
      return {
        action: 'WAIT', score: 0, model: 'WAIT',
        reason: `Esperando alineación H1(${structureH1.trend})+M15(${structureM15.trend})`,
        analysis: { structureM5: structureM5.trend, structureH1: structureH1.trend,
          structureM15: structureM15.trend, mtfConfluence, premiumDiscount,
          orderFlow: orderFlow.momentum }
      };
    }

    // MTF_CONFLUENCE — DATOS REALES: 38% WR, 128 ops, -66.51 pts
    // Rediseñado: solo señales con OB estructural ★ + CHoCH + zona correcta
    // Sin OB estructural: penalización severa (evitar señales débiles)
    if (pullback && pullback.side === opSide) {
      const hasStructOB = pullback.zone?.isStructureOB || pullback.confirmation === 'CHOCH_OB';
      const correctZone = (opSide==='BUY' && premiumDiscount==='DISCOUNT') ||
                          (opSide==='SELL' && premiumDiscount==='PREMIUM');
      // NUEVO: requerir CHoCH O triple confluencia — sin estos dos, muy poca probabilidad
      const hasHighConf  = m15ChochFresh || tripleConfluence || (choch && choch.side === opSide && m15Strong);

      let score = 84; // base baja — acumular solo con confirmaciones REALES
      if (hasStructOB)   score += 6; // OB estructural ★ = mayor bonus
      else               score -= 4; // sin ★ = penalizar
      if (correctZone)   score += 6; // zona correcta es CRÍTICO para MTF
      else               score -= 5; // zona incorrecta = muy penalizado
      if (m15Strong)     score += 4;
      if (tripleConfluence) score += 5;
      if (m15ChochFresh) score += 5; // CHoCH M15 = timing perfecto
      if (choch && choch.side === opSide) score += 3;
      if (pullback.confirmation === 'CHOCH_OB') score += 4;
      if (!hasHighConf)  score -= 6; // sin CHoCH ni triple = señal débil
      if (isCounterTrend) score -= 12; // counter-trend: penalización máxima
      score = Math.min(score, 96);

      const trendCtx = m15ChochFresh
        ? `CHoCH M15(${state.chochM15?.side}) + M5 OB`
        : `H1(${opDir})+M15(${structureM15.trend})`;

      // ✅ FIX CRÍTICO: signals.push faltaba — MTF_CONFLUENCE nunca generaba señales
      signals.push({
        model: 'MTF_CONFLUENCE',
        baseScore: score,
        pullback,
        reason: `${trendCtx} + OB ${pullback.confirmation || ''} ${premiumDiscount !== 'EQUILIBRIUM' ? '+ ' + premiumDiscount : ''}`.trim()
      });
    }
    
    // ── CHOCH_PULLBACK: CHoCH en M5 + retroceso al OB ──
    // Also fires when: CHoCH is fresh (last 15 candles) + structureOB exists near price
    // This catches cases where the touch happened 4-10 candles ago
    if (choch && choch.side === opSide && !pullback) {
      // Try to synthesize a pullback from the structureOB
      const structOBs = opSide === 'BUY'
        ? demandZones.filter(z => z.isStructureOB && !z.mitigated)
        : supplyZones.filter(z => z.isStructureOB && !z.mitigated);
      if (structOBs.length > 0) {
        const ob = structOBs[0];
        const price = candlesM5[candlesM5.length-1]?.close || 0;
        // Precio debe estar DENTRO del OB o muy cerca
        const priceInOB = opSide === 'BUY'
          ? price >= ob.low - avgRange*0.3 && price <= ob.high + avgRange*0.5
          : price >= ob.low - avgRange*0.5 && price <= ob.high + avgRange*0.3;
        const chochFresh = choch.breakIndex >= (candlesM5?.length||0) - 20;
        // Confirmación de vela DESPUÉS del CHoCH: al menos 1 vela cerrada en la dirección
        const last3M5 = candlesM5.slice(-3);
        const hasDirectionalConf = opSide === 'BUY'
          ? last3M5.some(c => c.close > c.open && c.close > ob.low) // vela verde sobre el OB
          : last3M5.some(c => c.close < c.open && c.close < ob.high); // vela roja bajo el OB
        if (priceInOB && chochFresh && hasDirectionalConf) {
          const slLevel = opSide === 'BUY'
            ? +((ob.wickLow||ob.low) - avgRange*0.3).toFixed(config.decimals)
            : +((ob.wickHigh||ob.high) + avgRange*0.3).toFixed(config.decimals);
          const risk = Math.abs(price - slLevel);
          if (risk > 0 && risk <= avgRange * 8) {
            const synthPullback = {
              side: opSide, zone: ob,
              entry: +(price).toFixed(config.decimals), stop: slLevel,
              tp1: opSide==='BUY' ? +(price+risk*1.5).toFixed(config.decimals) : +(price-risk*1.5).toFixed(config.decimals),
              tp2: opSide==='BUY' ? +(price+risk*2.5).toFixed(config.decimals) : +(price-risk*2.5).toFixed(config.decimals),
              tp3: opSide==='BUY' ? +(price+risk*4.0).toFixed(config.decimals) : +(price-risk*4.0).toFixed(config.decimals),
              touchedOB: true, entryType: 'CHOCH_STRUCTURE_OB', confirmation: 'CHOCH_OB'
            };
            let score = 87;
            if (m15Strong) score += 3;
            if (m15ChochFresh) score += 4;
            if (tripleConfluence) score += 4;
            score = Math.min(score, 97);
            signals.push({
              model: 'CHOCH_PULLBACK', baseScore: score, pullback: synthPullback,
              reason: `${choch.type} + structureOB ${ob.pattern||''} + conf.vela + ${opDir}`
            });
          }
        } // end priceInOB && chochFresh && hasDirectionalConf
      }
    }

    // ── CHOCH_PULLBACK: CHoCH en M5 + retroceso al OB ──
    if (choch && pullback && choch.side === opSide && pullback.side === opSide) {
      let score = 86;
      if (tripleConfluence) score += 5;
      if (m15Strong)        score += 4;
      if (m15ChochFresh)    score += 4; // M15 CHoCH confirms reversal
      if (pullback.confirmation === 'ENGULFING' || pullback.confirmation === 'PIN_BAR') score += 4;
      if (pullback.confirmation === 'CHOCH_OB' || pullback.zone?.isStructureOB) score += 5;
      if (premiumDiscount === (opSide==='BUY'?'DISCOUNT':'PREMIUM')) score += 3;
      score = Math.min(score, 99);

      signals.push({
        model: 'CHOCH_PULLBACK',
        baseScore: score,
        pullback,
        reason: `${choch.type}${m15ChochFresh?' + CHoCH M15':''} + OB ${pullback.confirmation||''} + ${opDir}`
      });
    }
    
    const last3 = candlesM5.slice(-3);
    // ═══════════════════════════════════════════════════════════════
    // LIQUIDITY_SWEEP — ELIMINADO (reemplazado por LIQUIDITY_GRAB)

    // v24.0: BOS_CONTINUATION requiere MTF para mejor calidad
    if (bos && pullback && bos.side === pullback.side) {
      // Verificar que Premium/Discount sea correcto
      const pdCorrect = (bos.side === 'BUY' && premiumDiscount === 'DISCOUNT') ||
                        (bos.side === 'SELL' && premiumDiscount === 'PREMIUM');
      
      // Must match opSide — BOS must go in the H1+M15 direction
      if (bos.side === opSide) {
        const pdBonus = (opSide==='BUY'&&premiumDiscount==='DISCOUNT') || (opSide==='SELL'&&premiumDiscount==='PREMIUM');
        let score = 84;
        if (tripleConfluence) score += 5;
        if (pdBonus) score += 4;
        if (m15Strong) score += 3;
        score = Math.min(score, 97);
        signals.push({
          model: 'BOS_CONTINUATION',
          baseScore: score,
          pullback,
          reason: `${bos.type} H1/M15 ${opDir} + OB 50%${pdBonus?' + '+premiumDiscount:''}`
        });
      }
    }
    
    const price = candlesM5[candlesM5.length - 1].close;
    const lastCandle = candlesM5[candlesM5.length - 1];
    
    // ═══════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════
    // OB_REJECTION — Rechazo en zona de OB (supply o demand)
    // FIX: busca en las últimas 5 velas, no solo la actual
    // FIX: CHoCH M5 confirmado agrega bonus grande para superar umbral
    // FIX: threshold counter-trend baja a 87 si BOS M5 confirma dirección
    // ═══════════════════════════════════════════════════════════════
    {
      // Ventana de búsqueda: máx 8 velas para rechazo (40 min en M5)
      // Pero la ENTRADA siempre es en lastCandle — el precio actual DEBE estar cerca del OB
      const last8 = candlesM5.slice(-8);

      // ── SELL: buscar vela de rechazo en últimas 8 velas dentro de supply zone ──
      for (const zone of supplyZones) {
        if (zone.mitigated) continue;

        // El precio ACTUAL debe estar cerca del OB (no entrar cuando ya viajó lejos)
        const priceNearZone = lastCandle.close >= zone.low - avgRange * 0.2 &&
                              lastCandle.close <= zone.high + avgRange * 0.2;
        if (!priceNearZone) continue;

        // Buscar la vela de rechazo más fuerte dentro de las últimas 8
        let bestBear = null, bestScore = 0;
        for (let ci = last8.length - 1; ci >= 0; ci--) {
          const c = last8[ci];
          const touchedZone = c.high >= zone.low * 0.998; // mecha tocó la zona
          const strongBear  = c.close < c.open;
          const candleSize  = Math.abs(c.close - c.open);
          const bigCandle   = candleSize > avgRange * 0.6;
          if (touchedZone && strongBear && bigCandle) {
            const s = candleSize + (c.high >= zone.high ? 2 : 0); // bonus si tocó techo
            if (s > bestScore) { bestScore = s; bestBear = { c, ci }; }
          }
        }
        if (!bestBear) continue;

        const { c: rejCandle, ci: rejIdx } = bestBear;
        // La vela de rechazo no puede ser más antigua de 5 velas (25 min en M5)
        // Si el rechazo fue hace mucho y el precio ya volvió, es una entrada stale
        if (rejIdx < last8.length - 5) continue;

        const closedBelow  = rejCandle.close < zone.low;
        const wick         = rejCandle.high - Math.max(rejCandle.open, rejCandle.close);
        const candleSize   = Math.abs(rejCandle.close - rejCandle.open);
        const giantCandle  = candleSize > avgRange * 2.0; // vela enorme (27 puntos en Step)
        const m5Bearish    = structureM5?.trend === 'BEARISH'; // M5 CHoCH confirmado
        const chochConfirm = choch && choch.side === 'SELL' && choch.breakIndex >= (candlesM5.length - 15);

        let score = 82;
        if (closedBelow)           score += 6;
        if (wick > candleSize*0.4) score += 3;
        if (zone.isStructureOB)    score += 6;
        if (giantCandle)           score += 5;
        if (m5Bearish)             score += 6;
        if (chochConfirm)          score += 4;
        if (bos && bos.side==='SELL') score += 3;
        if (structureH1.trend  === 'BEARISH') score += 5;
        if (structureM15?.trend === 'BEARISH') score += 4;
        if (premiumDiscount === 'PREMIUM') score += 3;
        if (structureH1.trend === 'BULLISH') {
          // Counter-trend: SOLO si hay evidencia muy fuerte (OB★ + CHoCH M5 + vela gigante)
          if (!(zone.isStructureOB && m5Bearish && giantCandle)) continue;
          score -= 5; // penalización por ir contra H1
        }
        score = Math.min(score, 97);

        const entry   = lastCandle.close;
        // SL: por encima del wick/techo del OB de supply + buffer
        // NO usar risk*0.5 — eso ponía el SL DENTRO del OB (causa principal de SL tocados)
        const rawStop = (zone.wickHigh || zone.high) + avgRange * 0.35;
        const stop    = +rawStop.toFixed(config.decimals);
        const risk    = Math.abs(stop - entry);
        if (risk <= 0 || risk > avgRange * 6) continue;
        signals.push({
          model: 'OB_REJECTION',
          baseScore: score,
          pullback: {
            side:  'SELL', entry, stop,
            tp1:   +(entry - risk * 1.5).toFixed(config.decimals),
            tp2:   +(entry - risk * 2.5).toFixed(config.decimals),
            tp3:   +(entry - risk * 4.0).toFixed(config.decimals)
          },
          reason: `Rechazo OB oferta${zone.isStructureOB?' ★':''}${giantCandle?' + vela gigante':''}${m5Bearish?' + CHoCH M5↓':''}${premiumDiscount==='PREMIUM'?' + PREMIUM':''}`
        });
        break;
      }

      // ── BUY: buscar vela de rechazo en últimas 8 velas dentro de demand zone ──
      for (const zone of demandZones) {
        if (zone.mitigated) continue;

        // El precio ACTUAL debe estar cerca del OB
        const priceNearZoneB = lastCandle.close <= zone.high + avgRange * 0.2 &&
                               lastCandle.close >= zone.low - avgRange * 0.2;
        if (!priceNearZoneB) continue;

        let bestBull = null, bestScore = 0;
        for (let ci = last8.length - 1; ci >= 0; ci--) {
          const c = last8[ci];
          const touchedZone = c.low <= zone.high * 1.002;
          const strongBull  = c.close > c.open;
          const candleSize  = Math.abs(c.close - c.open);
          const bigCandle   = candleSize > avgRange * 0.6;
          if (touchedZone && strongBull && bigCandle) {
            const s = candleSize + (c.low <= zone.low ? 2 : 0);
            if (s > bestScore) { bestScore = s; bestBull = { c, ci }; }
          }
        }
        if (!bestBull) continue;

        const { c: rejCandle, ci: rejIdxB } = bestBull;
        // Vela de rechazo no puede ser más antigua de 5 velas
        if (rejIdxB < last8.length - 5) continue;
        const closedAbove  = rejCandle.close > zone.high;
        const wick         = Math.min(rejCandle.open, rejCandle.close) - rejCandle.low;
        const candleSize   = Math.abs(rejCandle.close - rejCandle.open);
        const giantCandle  = candleSize > avgRange * 2.0;
        const m5Bullish    = structureM5?.trend === 'BULLISH';
        const chochConfirm = choch && choch.side === 'BUY' && choch.breakIndex >= (candlesM5.length - 15);

        let score = 82;
        if (closedAbove)           score += 6;
        if (wick > candleSize*0.4) score += 3;
        if (zone.isStructureOB)    score += 6;
        if (giantCandle)           score += 5;
        if (m5Bullish)             score += 6;
        if (chochConfirm)          score += 4;
        if (bos && bos.side==='BUY') score += 3;
        if (structureH1.trend  === 'BULLISH') score += 5;
        if (structureM15?.trend === 'BULLISH') score += 4;
        if (premiumDiscount === 'DISCOUNT') score += 3;
        if (structureH1.trend === 'BEARISH') {
          if (!(zone.isStructureOB && m5Bullish && giantCandle)) continue;
          score -= 5;
        }
        score = Math.min(score, 97);

        const entry   = lastCandle.close;
        // SL: por debajo del wick/suelo del OB de demanda + buffer
        // NO usar risk*0.5 — eso ponía el SL DENTRO del OB (causa principal de SL tocados)
        const rawStopB = (zone.wickLow || zone.low) - avgRange * 0.35;
        const stopB    = +rawStopB.toFixed(config.decimals);
        const riskB    = Math.abs(entry - stopB);
        if (riskB <= 0 || riskB > avgRange * 6) continue;
        signals.push({
          model: 'OB_REJECTION',
          baseScore: score,
          pullback: {
            side: 'BUY', entry, stop: stopB,
            tp1:  +(entry + riskB * 1.5).toFixed(config.decimals),
            tp2:  +(entry + riskB * 2.5).toFixed(config.decimals),
            tp3:  +(entry + riskB * 4.0).toFixed(config.decimals)
          },
          reason: `Rechazo OB demanda${zone.isStructureOB?' ★':''}${giantCandle?' + vela gigante':''}${m5Bullish?' + CHoCH M5↑':''}${premiumDiscount==='DISCOUNT'?' + DISCOUNT':''}`
        });
        break;
      }
    }
    // ── CHoCH M5 + ZONA — señal cuando M5 hace CHoCH confirmado Y precio EN zona ──
    // Requisito estricto: el precio DEBE estar dentro o muy cerca del OB (máx 1.5x avgRange)
    // Antes era 5x avgRange → entraba cuando el precio ya había viajado lejos de la zona
    if (choch && bos && choch.side === bos.side &&
        choch.breakIndex >= (candlesM5.length - 25)) {

      const isChochSell = choch.side === 'SELL';
      const isChochBuy  = choch.side === 'BUY';
      const zones = isChochSell ? supplyZones : demandZones;
      // Buscar zona donde el precio actual esté dentro o muy cerca
      const relevantZone = zones.find(z => {
        if (z.mitigated) return false;
        const p = lastCandle.close;
        if (isChochSell) return p >= z.low - avgRange * 0.5 && p <= z.high + avgRange * 1.5;
        return p <= z.high + avgRange * 0.5 && p >= z.low - avgRange * 1.5;
      });

      if (relevantZone) {
        const price = lastCandle.close;
        const distToZone = isChochSell
          ? Math.abs(price - relevantZone.low)
          : Math.abs(price - relevantZone.high);
        // Máximo 1.5x avgRange — el precio DEBE estar en zona o muy cerca
        const maxDist = avgRange * 1.5;

        if (distToZone < maxDist) {
          let score = 82;
          if (relevantZone.isStructureOB)                                    score += 6;
          if (structureM5.strength >= 80)                                    score += 5;
          if (structureH1.trend === (isChochSell?'BEARISH':'BULLISH'))       score += 6;
          else                                                               score -= 8; // H1 contra = penalización mayor
          if (structureM15?.trend === (isChochSell?'BEARISH':'BULLISH'))     score += 5;
          if (premiumDiscount === (isChochSell?'PREMIUM':'DISCOUNT'))        score += 3;
          const inZone = price >= relevantZone.low && price <= relevantZone.high;
          if (inZone) score += 4;
          // Si H1 va contra Y no hay OB estructural → no operar
          if (structureH1.trend !== (isChochSell?'BEARISH':'BULLISH') && !relevantZone.isStructureOB) {
            // No agregar señal
          } else {
            score = Math.min(score, 95);
            // SL: por encima/debajo del wick del OB + buffer (NO risk*0.5 que pone SL dentro del OB)
            const stopChoch = isChochSell
              ? +((relevantZone.wickHigh || relevantZone.high) + avgRange * 0.35).toFixed(config.decimals)
              : +((relevantZone.wickLow  || relevantZone.low)  - avgRange * 0.35).toFixed(config.decimals);
            const riskChoch = Math.abs(price - stopChoch);
            if (riskChoch > 0 && riskChoch <= avgRange * 6) {
              signals.push({
                model: 'OB_REJECTION',
                baseScore: score,
                pullback: {
                  side:  isChochSell ? 'SELL' : 'BUY',
                  entry: price,
                  stop:  stopChoch,
                  tp1: isChochSell ? +(price-riskChoch*1.5).toFixed(config.decimals) : +(price+riskChoch*1.5).toFixed(config.decimals),
                  tp2: isChochSell ? +(price-riskChoch*2.5).toFixed(config.decimals) : +(price+riskChoch*2.5).toFixed(config.decimals),
                  tp3: isChochSell ? +(price-riskChoch*4.0).toFixed(config.decimals) : +(price+riskChoch*4.0).toFixed(config.decimals)
                },
                reason: `CHoCH M5${isChochSell?'↓':'↑'} + BOS confirmado + OB${relevantZone.isStructureOB?' ★':''}${inZone?' en zona':' cerca zona'}`
              });
            }
          }
        }
      }
    }
    // ═══════════════════════════════════════════
    // FVG_ENTRY: must align with opDir (H1+M15), not just M5
    for (const fvg of fvgZones) {
      const fvgSide = fvg.side === 'BUY' ? 'BUY' : 'SELL';
      if (fvgSide !== opSide) continue; // strictly aligned with H1+M15
      const inFVG = price >= fvg.low * 0.999 && price <= fvg.high * 1.001;
      if (inFVG && pullback && fvg.side === opSide && pullback.side === opSide) {
        const pdBonus = (opSide==='BUY'&&premiumDiscount==='DISCOUNT') || (opSide==='SELL'&&premiumDiscount==='PREMIUM');
        let score = 84; // base already high — requires H1+M15+FVG alignment
        if (pdBonus)        score += 4;
        if (tripleConfluence) score += 4;
        if (choch)          score += 3;
        score = Math.min(score, 98);
        signals.push({
          model: 'FVG_ENTRY',
          baseScore: score,
          pullback,
          reason: `${fvg.type} H1/M15 ${opDir}${pdBonus?' + '+premiumDiscount:''}${choch?' + CHoCH':''}`
        });
      }
    }
    
    // ═══════════════════════════════════════════
    // MODELOS SMC AVANZADOS v24.3
    // ═══════════════════════════════════════════
    
    // 2. INDUCEMENT — FIX 5: wick ratio mínimo 0.7 (antes 0.5 = demasiado permisivo)
    // + H1 DEBE estar alineado (antes solo sumaba +5, ahora es requisito)
    const recentHighs = candlesM5.slice(-20).map(c => c.high);
    const recentLows  = candlesM5.slice(-20).map(c => c.low);
    const highestRecent = Math.max(...recentHighs.slice(0, -3));
    const lowestRecent  = Math.min(...recentLows.slice(0, -3));

    // Barrido de máximos + reversión = SELL
    if (lastCandle.high > highestRecent && lastCandle.close < highestRecent) {
      const sweepWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
      const sweepBody = Math.abs(lastCandle.close - lastCandle.open);
      const wickRatioOk = sweepWick > sweepBody * 0.7;
      const h1Confirms  = structureH1.trend === 'BEARISH';
      if (wickRatioOk && h1Confirms && opDir === 'BEARISH') {
        // INDUCEMENT SELL — DESACTIVADO (0% win rate histórico)
        // Se reactiva cuando tenga >50% WR en al menos 5 operaciones
      } // end if wickRatioOk SELL
    } // end if highestRecent SELL

    // Barrido de mínimos + reversión = BUY
    if (lastCandle.low < lowestRecent && lastCandle.close > lowestRecent) {
      const sweepWick2 = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
      const sweepBody2 = Math.abs(lastCandle.close - lastCandle.open);
      const wickRatioOk2 = sweepWick2 > sweepBody2 * 0.7;
      const h1Confirms2  = structureH1.trend === 'BULLISH';
      if (wickRatioOk2 && h1Confirms2 && opDir === 'BULLISH') {
        // INDUCEMENT BUY — DESACTIVADO (0% win rate histórico)
      } // end if wickRatioOk BUY
    } // end if lowestRecent BUY
    // 3. OPTIMAL_TRADE_ENTRY (OTE) - Entrada en el 62-79% del movimiento (Fibonacci)
    if (choch && pullback) {
      // Calcular el rango del movimiento
      const moveHigh = Math.max(...candlesM5.slice(-10).map(c => c.high));
      const moveLow = Math.min(...candlesM5.slice(-10).map(c => c.low));
      const moveRange = moveHigh - moveLow;
      
      // Zona OTE = 62% - 79% del retroceso
      const ote62 = choch.side === 'BUY' ? moveLow + moveRange * 0.21 : moveHigh - moveRange * 0.21;
      const ote79 = choch.side === 'BUY' ? moveLow + moveRange * 0.38 : moveHigh - moveRange * 0.38;
      
      const inOTE = choch.side === 'BUY' 
        ? (lastCandle.close >= ote62 && lastCandle.close <= ote79)
        : (lastCandle.close <= ote62 && lastCandle.close >= ote79);
      
      if (inOTE && choch.side === opSide) { // Must align with H1+M15
        const pdBonus = (opSide==='BUY'&&premiumDiscount==='DISCOUNT')||(opSide==='SELL'&&premiumDiscount==='PREMIUM');
        let score = 85;
        if (tripleConfluence) score += 5;
        if (pdBonus) score += 4;
        if (m15Strong) score += 3;
        score = Math.min(score, 97);
        signals.push({
          model: 'OTE_ENTRY',
          baseScore: score,
          pullback,
          reason: `OTE 62-79% H1/M15 ${opDir}${pdBonus?' + '+premiumDiscount:''}`
        });
      }
    }
    
    // 4. LIQUIDITY_GRAB — FIX 6: requiere triple confluencia + riesgo máximo 4x avgRange
    const prev2Candle = candlesM5[candlesM5.length - 3];
    const prevCandle  = candlesM5[candlesM5.length - 2];

    if (prev2Candle && prevCandle) {
      const brokeHigh = prevCandle.high > prev2Candle.high && prevCandle.close < prev2Candle.high;
      const brokeLow  = prevCandle.low  < prev2Candle.low  && prevCandle.close > prev2Candle.low;

      if (brokeHigh && lastCandle.close < prevCandle.close && opSide === 'SELL') {
        // FIX: requiere H1 BEARISH Y M15 BEARISH (antes solo H1+M15 BEARISH implícito)
        if (structureH1.trend === 'BEARISH' && structureM15?.trend === 'BEARISH') {
          const risk = prevCandle.high + avgRange*0.3 - lastCandle.close;
          if (risk > 0 && risk < avgRange * 4) { // FIX: era 6x, ahora 4x máximo
            const lgEntry = {
              side:  'SELL',
              entry: +(lastCandle.close).toFixed(config.decimals),
              stop:  +(prevCandle.high + avgRange*0.25).toFixed(config.decimals),
              tp1:   +(lastCandle.close - risk*1.5).toFixed(config.decimals),
              tp2:   +(lastCandle.close - risk*2.5).toFixed(config.decimals),
              tp3:   +(lastCandle.close - risk*4.0).toFixed(config.decimals),
              entryType: 'LIQUIDITY_GRAB'
            };
            let score = 84;
            if (tripleConfluence)             score += 6; // triple = bonus grande
            if (premiumDiscount==='PREMIUM')  score += 4;
            score = Math.min(score, 96);
            signals.push({
              model: 'LIQUIDITY_GRAB', baseScore: score, pullback: lgEntry,
              reason: `Sweep alcista + H1↓ + M15↓${premiumDiscount==='PREMIUM'?' + PREMIUM':''}`
            });
          }
        }
      }

      if (brokeLow && lastCandle.close > prevCandle.close && opSide === 'BUY') {
        if (structureH1.trend === 'BULLISH' && structureM15?.trend === 'BULLISH') {
          const risk = lastCandle.close - (prevCandle.low - avgRange*0.25);
          if (risk > 0 && risk < avgRange * 4) {
            const lgEntry = {
              side:  'BUY',
              entry: +(lastCandle.close).toFixed(config.decimals),
              stop:  +(prevCandle.low - avgRange*0.25).toFixed(config.decimals),
              tp1:   +(lastCandle.close + risk*1.5).toFixed(config.decimals),
              tp2:   +(lastCandle.close + risk*2.5).toFixed(config.decimals),
              tp3:   +(lastCandle.close + risk*4.0).toFixed(config.decimals),
              entryType: 'LIQUIDITY_GRAB'
            };
            let score = 84;
            if (tripleConfluence)             score += 6;
            if (premiumDiscount==='DISCOUNT') score += 4;
            score = Math.min(score, 96);
            signals.push({
              model: 'LIQUIDITY_GRAB', baseScore: score, pullback: lgEntry,
              reason: `Sweep bajista + H1↑ + M15↑${premiumDiscount==='DISCOUNT'?' + DISCOUNT':''}`
            });
          }
        }
      }
    }
    
    // SMART_MONEY_TRAP — ELIMINADO (entradas a mercado sin OB, SL inconsistente)

    // ═══════════════════════════════════════════════════════════════
    // MODELO M1_PRECISION — Timing de entrada preciso con triple confluencia
    // Requiere H1=M15=M5 + patrón M1 (CHoCH, engulfing o pin bar) + precio en zona M15
    // Solo genera señal cuando hay triple confluencia fuerte — muy selectivo
    // ═══════════════════════════════════════════════════════════════
    if (candlesM1 && candlesM1.length >= 20 && m15Loaded && h1Loaded) {
      const m1Result = this.analyzeM1Precision(
        candlesM1, candlesM15 || [], candlesH1, structureH1, structureM15, structureM5,
        config, avgRange, premiumDiscount
      );
      if (m1Result && m1Result.pullback && m1Result.baseScore >= 85) {
        // M1_PRECISION solo activa cuando hay triple confluencia — ya valida internamente
        // Verificar que la dirección coincide con opSide (misma dirección que H1+M15)
        if (m1Result.pullback.side === opSide) {
          signals.push({
            model: 'M1_PRECISION',
            baseScore: m1Result.baseScore,
            pullback: m1Result.pullback,
            reason: m1Result.reason
          });
        }
      }
    }


    // ════════════════════════════════════════════════════════════════════
    // MODELOS INSTITUCIONALES — Smart Money Institucional v25
    // ════════════════════════════════════════════════════════════════════
    // Operativa real institucional — NO retail:
    // 1. BREAKER_BLOCK   — OB que fue mitigado y se convierte en soporte/resistencia
    // 2. JUDAS_SWING     — Barrido falso de liquidez al inicio de sesión
    // 3. MITIGATION_BLOCK— Precio regresa a zona donde se cerró una posición
    // 4. PROPULSION_BLOCK— Bloque de continuación después de CHoCH con gap
    // ════════════════════════════════════════════════════════════════════

    const lastC  = candlesM5[candlesM5.length - 1];
    const prevC  = candlesM5[candlesM5.length - 2];
    const prev2C = candlesM5[candlesM5.length - 3];

    // ── Kill Zones institucionales (cuando las instituciones operan) ──
    // NY Open:     12:00-15:00 UTC (7:00-10:00 AM NY)
    // London Open: 07:00-10:00 UTC (3:00-6:00 AM NY)
    // London Close:15:00-17:00 UTC (10:00-12:00 NY)
    const utcH = new Date().getUTCHours() + new Date().getUTCMinutes()/60;
    const inNYOpen     = utcH >= 12.0 && utcH < 15.0;
    const inLondonOpen = utcH >= 7.0  && utcH < 10.0;
    const inLondonClose= utcH >= 15.0 && utcH < 17.0;
    const inKillZone   = inNYOpen || inLondonOpen || inLondonClose;
    const killZoneName = inNYOpen ? 'NY_OPEN' : inLondonOpen ? 'LONDON_OPEN' : inLondonClose ? 'LONDON_CLOSE' : null;

    // ── 1. BREAKER BLOCK ──
    // Cuando un OB es mitigado (precio lo atravesó) y luego el precio regresa,
    // ese OB se convierte en Breaker: zona de oferta se convierte en demanda y viceversa
    // Instituciones usan Breakers para entrar en la dirección del bias HTF
    const allDemandMitigated = (state.demandZonesAll || []).filter(z => z.mitigated && !z.tested);
    const allSupplyMitigated = (state.supplyZonesAll || []).filter(z => z.mitigated && !z.tested);

    // Breaker alcista: OB supply mitigado (precio subió a través) — ahora actúa como demand
    if (opSide === 'BUY' && allSupplyMitigated.length > 0) {
      const breakerZone = allSupplyMitigated
        .filter(z => lastC.close >= z.low - avgRange*0.5 && lastC.close <= z.high + avgRange*0.3)
        .sort((a,b) => b.index - a.index)[0];

      if (breakerZone && structureH1.trend === 'BULLISH' && choch?.side === 'BUY') {
        const entry = +(lastC.close).toFixed(config.decimals);
        const sl    = +(breakerZone.low - avgRange * 0.3).toFixed(config.decimals);
        const risk  = entry - sl;
        if (risk > 0 && risk < avgRange * 6) {
          let score = 86;
          if (inKillZone)                                           score += 5;
          if (premiumDiscount === 'DISCOUNT')                       score += 4;
          if (tripleConfluence)                                     score += 4;
          if (m15Strong)                                            score += 3;
          score = Math.min(score, 97);
          signals.push({
            model: 'BREAKER_BLOCK',
            baseScore: score,
            pullback: {
              side: 'BUY', entry, stop: sl,
              tp1: +(entry + risk * 1.5).toFixed(config.decimals),
              tp2: +(entry + risk * 2.5).toFixed(config.decimals),
              tp3: +(entry + risk * 4.0).toFixed(config.decimals),
              zone: { ...breakerZone, isStructureOB: true }, touchedOB: true,
              confirmation: 'BREAKER_FLIP'
            },
            reason: `Breaker alcista H1 BULL + CHoCH BUY${inKillZone?' + '+killZoneName:''}${premiumDiscount==='DISCOUNT'?' + DISCOUNT':''}`
          });
        }
      }
    }

    // Breaker bajista: OB demand mitigado — ahora actúa como supply
    if (opSide === 'SELL' && allDemandMitigated.length > 0) {
      const breakerZone = allDemandMitigated
        .filter(z => lastC.close <= z.high + avgRange*0.5 && lastC.close >= z.low - avgRange*0.3)
        .sort((a,b) => b.index - a.index)[0];

      if (breakerZone && structureH1.trend === 'BEARISH' && choch?.side === 'SELL') {
        const entry = +(lastC.close).toFixed(config.decimals);
        const sl    = +(breakerZone.high + avgRange * 0.3).toFixed(config.decimals);
        const risk  = sl - entry;
        if (risk > 0 && risk < avgRange * 6) {
          let score = 86;
          if (inKillZone)                                           score += 5;
          if (premiumDiscount === 'PREMIUM')                        score += 4;
          if (tripleConfluence)                                     score += 4;
          if (m15Strong)                                            score += 3;
          score = Math.min(score, 97);
          signals.push({
            model: 'BREAKER_BLOCK',
            baseScore: score,
            pullback: {
              side: 'SELL', entry, stop: sl,
              tp1: +(entry - risk * 1.5).toFixed(config.decimals),
              tp2: +(entry - risk * 2.5).toFixed(config.decimals),
              tp3: +(entry - risk * 4.0).toFixed(config.decimals),
              zone: { ...breakerZone, isStructureOB: true }, touchedOB: true,
              confirmation: 'BREAKER_FLIP'
            },
            reason: `Breaker bajista H1 BEAR + CHoCH SELL${inKillZone?' + '+killZoneName:''}${premiumDiscount==='PREMIUM'?' + PREMIUM':''}`
          });
        }
      }
    }

    // ── 2. JUDAS SWING (Engaño institucional) ──
    // Patrón: precio hace un movimiento falso para liquidar stops minoristas,
    // luego revierte bruscamente hacia la dirección real (bias HTF)
    // Condición: vela con mecha larga que rompió equal high/low y cerró de vuelta
    // La "trampa" ya se ejecutó — entramos en la dirección real
    if (candlesM5.length >= 5) {
      const judas = candlesM5[candlesM5.length - 2]; // vela anterior (la trampa)
      const curr  = candlesM5[candlesM5.length - 1]; // vela actual (reversión)

      // JUDAS SELL (falso alza, real bajista):
      // - Vela anterior: subió a nuevo HH luego cerró DEBAJO del high anterior
      // - Vela actual: cierra bajista confirmando
      // - H1 BEARISH
      if (opSide === 'SELL' && structureH1.trend === 'BEARISH') {
        const recentHigh = Math.max(...candlesM5.slice(-8, -2).map(c => c.high));
        const judas_swept_high = judas.high > recentHigh; // rompió high (sweep)
        const judas_reversed   = judas.close < recentHigh; // cerró por debajo (trampa)
        const curr_bearish     = curr.close < curr.open && curr.close < judas.close;
        const wickRatio        = (judas.high - Math.max(judas.open, judas.close)) / (Math.abs(judas.close - judas.open) || 0.001);

        if (judas_swept_high && judas_reversed && curr_bearish && wickRatio > 1.5) {
          const entry = +(curr.close).toFixed(config.decimals);
          const sl    = +(judas.high + avgRange * 0.2).toFixed(config.decimals);
          const risk  = sl - entry;
          if (risk > 0 && risk < avgRange * 5) {
            let score = 87;
            if (inKillZone)                score += 6; // Judas swings ocurren MÁS en kill zones
            if (m15Strong)                 score += 4;
            if (premiumDiscount==='PREMIUM') score += 3;
            if (tripleConfluence)          score += 3;
            score = Math.min(score, 98);
            signals.push({
              model: 'JUDAS_SWING',
              baseScore: score,
              pullback: {
                side: 'SELL', entry, stop: sl,
                tp1: +(entry - risk * 1.5).toFixed(config.decimals),
                tp2: +(entry - risk * 2.5).toFixed(config.decimals),
                tp3: +(entry - risk * 4.0).toFixed(config.decimals),
                touchedOB: true, confirmation: 'JUDAS_REVERSAL'
              },
              reason: `Judas Swing ↑FALSO H1 BEAR${inKillZone?' + '+killZoneName:''}${premiumDiscount==='PREMIUM'?' + PREMIUM':''}`
            });
          }
        }
      }

      // JUDAS BUY (falso bajada, real alcista):
      if (opSide === 'BUY' && structureH1.trend === 'BULLISH') {
        const recentLow  = Math.min(...candlesM5.slice(-8, -2).map(c => c.low));
        const judas_swept_low  = judas.low < recentLow;
        const judas_reversed   = judas.close > recentLow;
        const curr_bullish     = curr.close > curr.open && curr.close > judas.close;
        const wickRatio        = (Math.min(judas.open, judas.close) - judas.low) / (Math.abs(judas.close - judas.open) || 0.001);

        if (judas_swept_low && judas_reversed && curr_bullish && wickRatio > 1.5) {
          const entry = +(curr.close).toFixed(config.decimals);
          const sl    = +(judas.low - avgRange * 0.2).toFixed(config.decimals);
          const risk  = entry - sl;
          if (risk > 0 && risk < avgRange * 5) {
            let score = 87;
            if (inKillZone)                score += 6;
            if (m15Strong)                 score += 4;
            if (premiumDiscount==='DISCOUNT') score += 3;
            if (tripleConfluence)          score += 3;
            score = Math.min(score, 98);
            signals.push({
              model: 'JUDAS_SWING',
              baseScore: score,
              pullback: {
                side: 'BUY', entry, stop: sl,
                tp1: +(entry + risk * 1.5).toFixed(config.decimals),
                tp2: +(entry + risk * 2.5).toFixed(config.decimals),
                tp3: +(entry + risk * 4.0).toFixed(config.decimals),
                touchedOB: true, confirmation: 'JUDAS_REVERSAL'
              },
              reason: `Judas Swing ↓FALSO H1 BULL${inKillZone?' + '+killZoneName:''}${premiumDiscount==='DISCOUNT'?' + DISCOUNT':''}`
            });
          }
        }
      }
    }

    // ── 3. PROPULSION BLOCK ──
    // Después de un CHoCH, el precio crea un imbalance (FVG) y regresa a llenarlo
    // Instituciones reentran en el gap antes de la continuación
    // Es el modelo más preciso — combina CHoCH + FVG + retroceso
    if (choch && choch.side === opSide && candlesM5.length >= 6) {
      // Buscar FVG creado DESPUÉS del CHoCH
      const chochIdx = choch.breakIndex || (candlesM5.length - 10);
      const postChoch = candlesM5.slice(chochIdx);

      for (let k = 1; k < postChoch.length - 1; k++) {
        const c0 = postChoch[k-1], c1 = postChoch[k], c2 = postChoch[k+1];

        // FVG alcista: gap entre low de c2 y high de c0
        if (opSide === 'BUY' && c2.low > c0.high && c1.close > c1.open) {
          const fvgTop    = c2.low;
          const fvgBottom = c0.high;
          const fvgMid    = (fvgTop + fvgBottom) / 2;

          // Precio actual está en el FVG (retroceso al gap)
          if (lastC.close >= fvgBottom - avgRange*0.2 && lastC.close <= fvgTop + avgRange*0.2) {
            const entry = +(lastC.close).toFixed(config.decimals);
            const sl    = +(fvgBottom - avgRange * 0.4).toFixed(config.decimals);
            const risk  = entry - sl;
            if (risk > 0 && risk < avgRange * 5) {
              let score = 88;
              if (inKillZone)                    score += 5;
              if (premiumDiscount === 'DISCOUNT') score += 4;
              if (m15Strong)                     score += 4;
              if (tripleConfluence)              score += 3;
              score = Math.min(score, 98);
              signals.push({
                model: 'PROPULSION_BLOCK',
                baseScore: score,
                pullback: {
                  side: 'BUY', entry, stop: sl,
                  tp1: +(entry + risk * 1.5).toFixed(config.decimals),
                  tp2: +(entry + risk * 2.5).toFixed(config.decimals),
                  tp3: +(entry + risk * 4.0).toFixed(config.decimals),
                  zone: { low: fvgBottom, high: fvgTop, mid: fvgMid, isStructureOB: true },
                  touchedOB: true, confirmation: 'FVG_PROPULSION'
                },
                reason: `Propulsion Block BUY: CHoCH + FVG retroceso${inKillZone?' + '+killZoneName:''}${premiumDiscount==='DISCOUNT'?' + DISCOUNT':''}`
              });
              break;
            }
          }
        }

        // FVG bajista
        if (opSide === 'SELL' && c2.high < c0.low && c1.close < c1.open) {
          const fvgBottom = c2.high;
          const fvgTop    = c0.low;

          if (lastC.close >= fvgBottom - avgRange*0.2 && lastC.close <= fvgTop + avgRange*0.2) {
            const entry = +(lastC.close).toFixed(config.decimals);
            const sl    = +(fvgTop + avgRange * 0.4).toFixed(config.decimals);
            const risk  = sl - entry;
            if (risk > 0 && risk < avgRange * 5) {
              let score = 88;
              if (inKillZone)                   score += 5;
              if (premiumDiscount === 'PREMIUM') score += 4;
              if (m15Strong)                    score += 4;
              if (tripleConfluence)             score += 3;
              score = Math.min(score, 98);
              signals.push({
                model: 'PROPULSION_BLOCK',
                baseScore: score,
                pullback: {
                  side: 'SELL', entry, stop: sl,
                  tp1: +(entry - risk * 1.5).toFixed(config.decimals),
                  tp2: +(entry - risk * 2.5).toFixed(config.decimals),
                  tp3: +(entry - risk * 4.0).toFixed(config.decimals),
                  zone: { low: fvgBottom, high: fvgTop, isStructureOB: true },
                  touchedOB: true, confirmation: 'FVG_PROPULSION'
                },
                reason: `Propulsion Block SELL: CHoCH + FVG retroceso${inKillZone?' + '+killZoneName:''}${premiumDiscount==='PREMIUM'?' + PREMIUM':''}`
              });
              break;
            }
          }
        }
      }
    }

    // ── 4. KILL ZONE + OB PURO ──
    // En kill zones (NY Open, London), cualquier OB estructural tiene mayor prioridad
    // Las instituciones mueven el mercado desde estas horas — el OB tiene mayor probabilidad
    if (inKillZone && pullback && pullback.side === opSide &&
        pullback.zone?.isStructureOB && pullback.touchedOB) {
      const entry = +(lastC.close).toFixed(config.decimals);
      const isBuyKZ = pullback.side === 'BUY';
      const sl = isBuyKZ
        ? +((pullback.zone.wickLow || pullback.zone.low) - avgRange * 0.3).toFixed(config.decimals)
        : +((pullback.zone.wickHigh || pullback.zone.high) + avgRange * 0.3).toFixed(config.decimals);
      const risk = Math.abs(entry - sl);
      if (risk > 0 && risk < avgRange * 8) {
        let score = 88;
        if (sameDirection)   score += 5;
        if (m15Strong)       score += 4;
        if (tripleConfluence) score += 4;
        if (choch)           score += 3;
        if ((isBuyKZ && premiumDiscount==='DISCOUNT') || (!isBuyKZ && premiumDiscount==='PREMIUM')) score += 4;
        score = Math.min(score, 99);
        signals.push({
          model: 'KILL_ZONE_OB',
          baseScore: score,
          pullback: {
            ...pullback, entry, stop: sl,
            tp1: isBuyKZ ? +(entry + risk*1.5).toFixed(config.decimals) : +(entry - risk*1.5).toFixed(config.decimals),
            tp2: isBuyKZ ? +(entry + risk*2.5).toFixed(config.decimals) : +(entry - risk*2.5).toFixed(config.decimals),
            tp3: isBuyKZ ? +(entry + risk*4.0).toFixed(config.decimals) : +(entry - risk*4.0).toFixed(config.decimals),
          },
          reason: `${killZoneName}: OB★ ${pullback.side} ${premiumDiscount} ${tripleConfluence?'+ Triple':''}`
        });
      }
    }

    if (signals.length === 0) {
      let reason = 'Esperando setup';
      if (!pullback) reason = 'Sin pullback a zona';
      else if (structureM5.trend === 'NEUTRAL') reason = 'Estructura M5 neutral';
      else if (!mtfConfluence && !choch) reason = 'Sin MTF Confluence ni CHoCH';
      else if (choch && !pullback) reason = `CHoCH ${choch.type} detectado pero sin pullback a zona`;
      else if (!choch && pullback) reason = `Pullback ${pullback.side} detectado pero sin CHoCH`;
      
      // Log detallado cada 30 segundos para debug
      const now = Date.now();
      if (!this._lastDebugLog || now - this._lastDebugLog > 30000) {
        this._lastDebugLog = now;
        console.log(`🔍 [DEBUG ${config.shortName}] Sin señales:`);
        console.log(`   M5=${structureM5.trend} H1=${structureH1.trend} MTF=${mtfConfluence ? 'SÍ' : 'NO'}`);
        console.log(`   CHoCH=${choch ? choch.type + ' @' + choch.level : 'NO'}`);
        console.log(`   Pullback=${pullback ? pullback.side + ' @' + pullback.entry : 'NO'}`);
        console.log(`   BOS=${bos?.type || 'NO'}`);
        console.log(`   Zonas: Demand=${demandZones.length} Supply=${supplyZones.length}`);
        console.log(`   P/D=${premiumDiscount} | Razón: ${reason}`);
      }
      
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
    
    // Log cuando SÍ hay señales potenciales
    // Filtrar modelos deshabilitados
    const enabledSignals = signals.filter(s => !([]).includes(s.model));
    if (enabledSignals.length !== signals.length) console.log(`🚫 [${config.shortName}] ${signals.length - enabledSignals.length} modelos deshabilitados filtrados`);
    signals.length = 0; enabledSignals.forEach(s => signals.push(s));
    console.log(`✨ [${config.shortName}] ${signals.length} candidatas: ${signals.map(s=>s.model+'('+s.baseScore+')').join(', ')}`);
    
    signals.sort((a, b) => b.baseScore - a.baseScore);
    const best = signals[0];

    // GUARD: si después del filtro no quedan señales → WAIT inmediato
    if (!best) {
      return {
        action: 'WAIT', score: 0, model: 'WAIT',
        reason: 'Sin candidatas tras filtro de modelos',
        analysis: { structureM5: structureM5.trend, structureH1: structureH1.trend, mtfConfluence, premiumDiscount }
      };
    }

    // OB_REJECTION puede operar counter-trend:
    // - Si M5 hizo CHoCH en la misma dirección → umbral 85 (mismo que tendencia)
    // - Si solo tiene OB estructural sin CHoCH M5 → umbral 90
    // - Esto captura exactamente el caso: H1 BULLISH + OB rechazo + CHoCH M5 BEARISH
    const obRejM5Confirms = best.model === 'OB_REJECTION' && (() => {
      const isShort = best.pullback?.side === 'SELL';
      const isLong  = best.pullback?.side === 'BUY';
      const m5Agrees = (isShort && structureM5?.trend === 'BEARISH') ||
                       (isLong  && structureM5?.trend === 'BULLISH');
      return m5Agrees;
    })();
    const effectiveMinScore = best.model === 'OB_REJECTION'
      ? (obRejM5Confirms ? 85 : 90)  // M5 CHoCH confirma → mismo umbral que tendencia
      : minScore;
    
    // 🔍 LOG: Mostrar score de la mejor señal
    console.log(`🎯 [${config.shortName}] Mejor: ${best.model} | Score Base: ${best.baseScore} | Side: ${best.pullback?.side}`);
    
    // ═══════════════════════════════════════════
    // AJUSTE DE SCORE CON SISTEMA DE APRENDIZAJE
    // ═══════════════════════════════════════════
    // Nota: Usamos config.shortName en lugar de symbol (que no existe en este contexto)
    const learningAdj = 0; // learning system removed
    const finalScore  = Math.min(100, Math.max(0, best.baseScore + learningAdj));

    console.log(`📊 [${config.shortName}] Score Final: ${finalScore} vs Min: ${effectiveMinScore} → ${finalScore >= effectiveMinScore ? '✅ PASA' : '❌ NO PASA'} | Modelo: ${best.model}`);

    if (finalScore < effectiveMinScore) {
      console.log(`❌ [${config.shortName}] Rechazada: ${finalScore} < ${effectiveMinScore}${best.model==='OB_REJECTION'?' (OB_REJECTION necesita ≥90)':''}`);
      return {
        action: 'WAIT',
        score: finalScore,
        model: best.model,
        reason: `Score ${finalScore}% < ${effectiveMinScore}% min`,
        analysis: {
          structureM5: structureM5.trend,
          structureH1: structureH1.trend,
          mtfConfluence,
          premiumDiscount
        }
      };
    }
    
    // ✅ SCORE SUFICIENTE - GENERAR SEÑAL
    console.log(`✅ [${config.shortName}] APROBADA: ${best.model} con score ${finalScore}`);
    
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
  } // close analyze()
}; // close SMC

// Verificar mercados inactivos y resubscribir
function checkAndResubscribeMarkets() {
  if (!isConnected) return;
  // FIX: no resubscribir durante los primeros 60s del arranque — evita "already subscribed"
  if (!initialSubscriptionDone) return;
  
  const now = Date.now();
  const inactivityThreshold = 60000; // 1 minuto sin datos = inactivo
  
  for (const symbol of MY_ASSETS) {
    const status = marketStatus[symbol];
    const config = ASSETS[symbol];
    const shouldBeOpen = isMarketOpenNow(symbol);
    
    // Si el mercado debería estar abierto pero no recibimos datos
    if (shouldBeOpen) {
      const timeSinceLastData = now - status.lastDataReceived;
      const timeSinceLastAttempt = now - status.lastSubscriptionAttempt;
      
      // Si no hay datos recientes y no intentamos recientemente (cada 30 segundos)
      if (timeSinceLastData > inactivityThreshold && timeSinceLastAttempt > 30000) {
        console.log(`⚠️ [${config?.shortName}] Sin datos por ${Math.round(timeSinceLastData/1000)}s - resubscribiendo`);
        resubscribeToAsset(symbol);
      }
    }
  }
}

// Iniciar verificación periódica de mercados
// FIX: guardar TODOS los IDs de intervalos para poder limpiarlos en reconexión
let marketCheckInterval = null;
let m15RefreshInterval  = null;
let h1RefreshInterval   = null;
let pingWatchdogInterval = null;

function clearAllMonitorIntervals() {
  if (marketCheckInterval)  { clearInterval(marketCheckInterval);  marketCheckInterval  = null; }
  if (m15RefreshInterval)   { clearInterval(m15RefreshInterval);   m15RefreshInterval   = null; }
  if (h1RefreshInterval)    { clearInterval(h1RefreshInterval);    h1RefreshInterval    = null; }
  if (pingWatchdogInterval) { clearInterval(pingWatchdogInterval); pingWatchdogInterval = null; }
}

function startMarketMonitoring() {
  // FIX: limpiar todos los intervalos previos antes de crear nuevos
  // Sin esto, cada reconexión acumula 3-4 intervalos → el scanner se degrada
  clearAllMonitorIntervals();

  // Verificar mercados cada 30 segundos
  marketCheckInterval = setInterval(checkAndResubscribeMarkets, 30000);
  console.log('✅ Monitor de mercados iniciado (verificación cada 30s)');

  // Refrescar M15 + M1 cada 60 segundos
  m15RefreshInterval = setInterval(() => {
    if (derivWs?.readyState !== WebSocket.OPEN) return;
    for (const symbol of MY_ASSETS) {
      try { requestM15(symbol); } catch(e) {}
      try { requestM1(symbol);  } catch(e) {}
    }
  }, 60 * 1000);

  // Refrescar H1 cada 5 minutos
  h1RefreshInterval = setInterval(() => {
    if (derivWs?.readyState !== WebSocket.OPEN) return;
    for (const symbol of MY_ASSETS) {
      try { requestH1(symbol); } catch(e) {}
    }
  }, 5 * 60 * 1000);

  // Ping + Watchdog cada 25 segundos
  // Si no llegan datos en 90s → forzar reconexión (conexión zombie)
  pingWatchdogInterval = setInterval(() => {
    if (derivWs?.readyState !== WebSocket.OPEN) return;
    try { derivWs.send(JSON.stringify({ ping: 1 })); } catch(e) {}
    const maxSilence = 90000;
    const anyData = MY_ASSETS.some(s =>
      Date.now() - (marketStatus[s]?.lastDataReceived || 0) < maxSilence
    );
    if (!anyData) {
      console.log('🔁 Watchdog: sin datos en 90s — terminando conexión zombie');
      try { derivWs.terminate(); } catch(e) {}
    }
  }, 25000);
}


// =============================================
// INTERVALOS — Actualizaciones periódicas de mercado
// =============================================


function connectDeriv() {
  const appId = process.env.DERIV_APP_ID || '1089';
  
  console.log(`   App ID: ${appId}`);
  console.log(`   URL: wss://ws.derivws.com/websockets/v3`);
  
  try {
    derivWs = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
  } catch (err) {
    console.error('❌ Error creando WebSocket:', err.message);
    setTimeout(connectDeriv, 5000);
    return;
  }
  
  derivWs.on('open', () => {
    console.log('✅ Conectado a Deriv WebSocket');
    isConnected = true;
    reconnectAttempts = 0;
    
    // Iniciar monitor de mercados
    startMarketMonitoring();
    
    console.log('\n📊 Suscribiendo a activos (Step · Oro · V100):');
    for (const symbol of MY_ASSETS) {
      // Solo suscribir a mercados que deberían estar abiertos
      if (isMarketOpenNow(symbol)) {
        console.log(`   → ${ASSETS[symbol].shortName} (${symbol})`);
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
        requestM15(symbol);
        requestM1(symbol);
        derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
        marketStatus[symbol].lastSubscriptionAttempt = Date.now();
      } else {
        console.log(`   ⏸️ ${ASSETS[symbol].shortName} (${symbol}) - Mercado cerrado`);
      }
    }
    console.log('\n✅ Suscripciones enviadas (M1 · M5 · M15 · H1) - Esperando datos...\n');
    // FIX: marcar suscripción inicial como completa después de 60s
    // Evita que checkAndResubscribeMarkets dispare duplicados durante el arranque
    setTimeout(() => { initialSubscriptionDone = true; }, 60000);
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
          // Actualizar estado del mercado
          marketStatus[symbol].lastDataReceived = Date.now();
          marketStatus[symbol].isActive = true;
          console.log(`📊 [${ASSETS[symbol]?.shortName}] M5: ${assetData[symbol].candles.length} velas cargadas`);
          analyzeAsset(symbol);
        }
      }
      
      if (msg.candles && msg.echo_req?.granularity === 3600) {
        const symbol = msg.echo_req.ticks_history;
        if (assetData[symbol]) {
          let h1 = msg.candles.map(c => ({
            time: c.epoch * 1000, open: +c.open, high: +c.high, low: +c.low, close: +c.close
          }));
          // FIX: cap H1 at 200 candles — sin cap crecen indefinidamente
          if (h1.length > 200) h1 = h1.slice(-200);
          assetData[symbol].candlesH1 = h1;
          assetData[symbol].h1Loaded = true;
          marketStatus[symbol].lastDataReceived = Date.now();
          marketStatus[symbol].isActive = true;
          console.log(`📊 H1 ${ASSETS[symbol]?.shortName}: ${assetData[symbol].candlesH1.length} velas`);
          analyzeAsset(symbol);
        }
      }

      // M15 — Tendencia intermedia
      if (msg.candles && msg.echo_req?.granularity === 900) {
        const symbol = msg.echo_req.ticks_history;
        if (assetData[symbol]) {
          let m15 = msg.candles.map(c => ({
            time: c.epoch * 1000, open: +c.open, high: +c.high, low: +c.low, close: +c.close, epoch: c.epoch
          }));
          // FIX: cap M15 at 300 candles
          if (m15.length > 300) m15 = m15.slice(-300);
          assetData[symbol].candlesM15 = m15;
          assetData[symbol].m15Loaded = true;
          console.log(`📊 M15 ${ASSETS[symbol]?.shortName}: ${assetData[symbol].candlesM15.length} velas`);
          analyzeAsset(symbol);
        }
      }

      // M1 — Entrada precisa (histórico inicial)
      if (msg.candles && msg.echo_req?.granularity === 60) {
        const symbol = msg.echo_req.ticks_history;
        if (assetData[symbol]) {
          let m1 = msg.candles.map(c => ({
            time: c.epoch * 1000, open: +c.open, high: +c.high, low: +c.low, close: +c.close, epoch: c.epoch
          }));
          // FIX: cap M1 at 200 candles
          if (m1.length > 200) m1 = m1.slice(-200);
          assetData[symbol].candlesM1 = m1;
          assetData[symbol].m1Loaded = true;
          console.log(`📊 M1 ${ASSETS[symbol]?.shortName}: ${assetData[symbol].candlesM1.length} velas`);
          analyzeAsset(symbol);
        }
      }

      // M1 — Actualización en tiempo real
      if (msg.ohlc && msg.ohlc.granularity === 60) {
        const symbol = msg.ohlc.symbol;
        if (assetData[symbol]) {
          const nc = { time: msg.ohlc.open_time * 1000, open: +msg.ohlc.open, high: +msg.ohlc.high, low: +msg.ohlc.low, close: +msg.ohlc.close, epoch: msg.ohlc.open_time };
          const m1 = assetData[symbol].candlesM1;
          if (m1.length > 0) {
            if (m1[m1.length-1].time === nc.time) { m1[m1.length-1] = nc; }
            else if (nc.time > m1[m1.length-1].time) { m1.push(nc); if (m1.length > 200) m1.shift(); analyzeAsset(symbol); }
          }
          assetData[symbol].price = nc.close;
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
              // ── FIX: re-analyze on EVERY M5 update, not just on new candle ──
              // This ensures pullback detection fires when price re-enters an OB
              analyzeAsset(symbol);
            } else if (newCandle.time > last.time) {
              candles.push(newCandle);
              if (candles.length > 600) candles.shift(); // 600 candles = ~50 hours of M5 history
              analyzeAsset(symbol);
            }
          }
          
          assetData[symbol].price = newCandle.close;
          // Actualizar estado del mercado
          marketStatus[symbol].lastDataReceived = Date.now();
          marketStatus[symbol].isActive = true;
    // [REMOVED] checkSignalHits — signal engine disabled
        }
      }
      
      if (msg.tick) {
        const symbol = msg.tick.symbol;
        if (assetData[symbol]) {
          assetData[symbol].price = +msg.tick.quote;
          // Actualizar estado del mercado
          marketStatus[symbol].lastDataReceived = Date.now();
          marketStatus[symbol].isActive = true;
    // [REMOVED] checkSignalHits — signal engine disabled
        }
      }
      
      // Manejar errores de suscripción (mercado cerrado, símbolo inválido, etc.)
      if (msg.error) {
        const symbol = msg.echo_req?.ticks_history || msg.echo_req?.ticks;
        if (symbol && ASSETS[symbol]) {
          console.log(`⚠️ [${ASSETS[symbol].shortName}] Error: ${msg.error.message}`);
          marketStatus[symbol].isActive = false;
        }
      }
      
    } catch (err) { /* ignore */ }
  });
  
  derivWs.on('close', () => {
    console.log('❌ Desconectado de Deriv');
    isConnected = false;
    // FIX: limpiar TODOS los intervalos, no solo marketCheckInterval
    clearAllMonitorIntervals();
    reconnectAttempts++;
    const delay = Math.min(5000 * reconnectAttempts, 30000);
    console.log(`   🔄 Reconectando en ${delay/1000}s... (intento ${reconnectAttempts})`);
    setTimeout(connectDeriv, delay);
  });
  
  derivWs.on('error', (err) => {
    console.error('❌ Error WebSocket:', err.message);
  });
}

// =============================================
// ANÁLISIS SMC — Solo detección de zonas para la IA
// Sin señales automáticas, sin Telegram, sin guardado
// =============================================
async function analyzeAsset(symbol) {
  const data = assetData[symbol];
  const config = ASSETS[symbol];
  if (!data || !config || data.candles.length < 30) return;

  const now = Date.now();
  // Cooldown de 30s para no sobrecargar el análisis
  if (now - data.lastAnalysis < 30000) return;
  data.lastAnalysis = now;

  // ── Log estructural en consola ──
  const logStruct = (tf, s) => s?.trend ? `${tf}:${s.trend.slice(0,4)}(${s.strength||0}%)` : `${tf}:---`;
  console.log(
    `📈 [${config.shortName}] ${logStruct('H1',data.structureH1)} | ${logStruct('M15',data.structureM15)} | ${logStruct('M5',data.structure)}` +
    ` | OBs:D${(data.demandZones||[]).filter(z=>!z.mitigated).length}/S${(data.supplyZones||[]).filter(z=>!z.mitigated).length}` +
    ` | Price:${(data.price||0).toFixed(config.decimals)} | ${data.premiumDiscount||'EQ'}`
  );

  // ── Análisis SMC puro: estructura + zonas ──
  // Solo llama al motor para detectar OBs, FVGs, liquidez, CHoCH, BOS
  // No genera señales, no guarda en BD, no envía Telegram
  await SMC.analyze(data.candles, data.candlesH1, config, data, data.candlesM15, data.candlesM1);
}


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
    candles: data.candles.slice(-500),       // 500 M5 candles for full zoom-out
    candlesH1: data.candlesH1?.slice(-120) || [],
    candlesM15: data.candlesM15?.slice(-300) || [],
    candlesM1: data.candlesM1?.slice(-150) || [],
    // M5 zones
    demandZones:   data.demandZones   || [],
    supplyZones:   data.supplyZones   || [],
    // M15 zones
    demandZonesM15: data.demandZonesM15 || [],
    supplyZonesM15: data.supplyZonesM15 || [],
    // H1 zones
    demandZonesH1: data.demandZonesH1 || [],
    supplyZonesH1: data.supplyZonesH1 || [],
    // Structure with swing labels (HH/HL/LH/LL) per timeframe
    structureM5:      data.structure?.trend,
    structureM5Data:  data.structure   || {},
    structureH1:      data.structureH1?.trend,
    structureH1Data:  data.structureH1 || {},
    structureM15:     data.structureM15?.trend || 'LOADING',
    structureM15Data: data.structureM15 || {},
    // Swings with epoch for time-based positioning on chart
    swingsM5: (data.swings||[]).map(s=>({ type:s.type, price:s.price, index:s.index, epoch: s.time ? Math.floor(s.time/1000) : null })),
    swingsM15: (data.swingsM15||[]).map(s=>({ type:s.type, price:s.price, index:s.index, epoch: s.time ? Math.floor(s.time/1000) : null })),
    // Live analysis details for the "what we're looking for" panel
    liveState: {
      hasChoch:     !!data.choch,
      chochSide:    data.choch?.side || null,
      chochType:    data.choch?.type || null,
      chochLevel:   data.choch?.level || null,
      chochEpoch:   data.choch?.epoch || null,
      hasBos:       !!data.bos,
      bosSide:      data.bos?.side  || null,
      bosLevel:     data.bos?.level || null,
      bosEpoch:     data.bos?.epoch || null,
      hasPullback:  !!data.pullback,
      pullbackSide: data.pullback?.side || null,
      pullbackConf: data.pullback?.confirmation || null,
      orderFlowMom: data.orderFlow?.momentum || 'NEUTRAL',
      orderFlowStr: data.orderFlow?.strength || 0,
      mtfConfluence: !!data.mtfConfluence,
      tripleConfl:  !!(data.mtfConfluence && data.structureM15?.trend === data.structureH1?.trend && data.structureM15?.trend !== 'NEUTRAL'),
      h1Strong:     (data.structureH1?.strength || 0) >= 55,
      m15Strong:    (data.structureM15?.strength || 0) >= 45,
      demandM5:     (data.demandZones||[]).filter(z=>!z.mitigated).length,
      supplyM5:     (data.supplyZones||[]).filter(z=>!z.mitigated).length,
      demandM15:    (data.demandZonesM15||[]).filter(z=>!z.mitigated).length,
      supplyM15:    (data.supplyZonesM15||[]).filter(z=>!z.mitigated).length,
    },
    // Chart overlay lines: CHoCH, BOS for visualization (M5 and M15)
    chartOverlays: {
      // M5 CHoCH — the entry signal (more recent, smaller timeframe)
      choch: data.choch ? {
        type: data.choch.type, side: data.choch.side,
        level: data.choch.level, epoch: data.choch.epoch,
        breakIndex: data.choch.breakIndex, tf: 'M5'
      } : null,
      bos: data.bos ? {
        type: data.bos.type, side: data.bos.side,
        level: data.bos.level, epoch: data.bos.epoch,
        breakIndex: data.bos.breakIndex, tf: 'M5'
      } : null,
      // M15 CHoCH — trend confirmation (higher timeframe)
      chochM15: data.chochM15 ? {
        type: data.chochM15.type, side: data.chochM15.side,
        level: data.chochM15.level, epoch: data.chochM15.epoch,
        breakIndex: data.chochM15.breakIndex, tf: 'M15'
      } : null,
      bosM15: data.bosM15 ? {
        type: data.bosM15.type, side: data.bosM15.side,
        level: data.bosM15.level, epoch: data.bosM15.epoch,
        tf: 'M15'
      } : null,
    },
    // Signal explanation — why the last signal fired
    signalExplanation: data.signal ? {
      model:     data.signal.model,
      action:    data.signal.action,
      reason:    data.signal.reason,
      score:     data.signal.score,
      entryType: data.signal.entryType || null,
      structureAtSignal: {
        m5:  data.structure?.trend,
        m15: data.structureM15?.trend,
        h1:  data.structureH1?.trend,
        pd:  data.premiumDiscount,
      }
    } : null,
    // M1 precision checklist
    m1Steps: data.m1Steps || null,
    h1Loaded:  data.h1Loaded,
    m15Loaded: data.m15Loaded,
    m1Loaded:  data.m1Loaded,
    mtfConfluence:  data.mtfConfluence,
    premiumDiscount: data.premiumDiscount,
    // SMC zones for AI analysis and chart drawing
    fvgZones:        data.fvgZones        || [],
    liquidityLevels: data.liquidityLevels || [],
  });
});

// ── RESET ANALYSIS: clear cooldowns, force fresh zones + structure ──
app.post('/api/reset/:symbol', (req, res) => {
  const { symbol } = req.params;
  const data = assetData[symbol];
  if (!data) return res.status(404).json({ error: 'Not found' });

  // Clear all cooldowns so analysis runs immediately
  data.lastAnalysis      = 0;
  data.lastSignalClosed  = 0;

  // Clear stored overlays so they get recomputed fresh
  data.demandZones    = [];
  data.supplyZones    = [];
  data.demandZonesH1  = [];
  data.supplyZonesH1  = [];
  data.demandZonesM15 = [];
  data.supplyZonesM15 = [];
  data.swings         = [];
  data.structure      = null;
  data.structureH1    = null;
  data.structureM15   = null;
  data.m1Steps        = null;

  // Trigger immediate re-analysis
  try { analyzeAsset(symbol); } catch(e) {}

  console.log(`🔄 [${symbol}] Analysis reset — zones + structure recomputed`);
  res.json({ ok: true, symbol, ts: Date.now() });
});

// [REMOVED] /api/signals — no longer needed

app.get('/api/dashboard/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    // Obtener suscripción del usuario
    const sub = await getSubscription(userId);
    
    // Procesar la suscripción
    let subscription = null;
    if (sub) {
      const planKey = sub.plan || 'free';
      const plan = PLANS[planKey] || PLANS.free;
      subscription = {
        plan: planKey,
        plan_name: plan.name,
        status: sub.estado || 'trial',
        days_left: sub.days_left || sub.trial_days_left || 5,
        hasNightAccess: planKey === 'premium' || planKey === 'elite'
      };
    } else {
      subscription = {
        plan: 'free',
        plan_name: 'Free Trial',
        status: 'trial',
        days_left: 5,
        hasNightAccess: false
      };
    }
    
    const userPlan = subscription.plan;
    const planConfig = PLANS[userPlan] || PLANS.free;
    // Usar sub.assets si está disponible (ya filtrado por getSubscription), sino MY_ASSETS
    const allowedAssets = (sub?.assets?.length > 0 ? sub.assets : planConfig.assets) || MY_ASSETS;
    
    // Filtrar activos según el plan del usuario
    const userAssets = Object.entries(assetData)
      .filter(([symbol]) => allowedAssets.includes(symbol))
      .map(([symbol, data]) => ({
        symbol,
        ...ASSETS[symbol],
        price: data.price,
        signal: data.signal,
        lockedSignal: data.lockedSignal,
        structureM5: data.structure?.trend || 'LOADING',
        structureH1: data.structureH1?.trend || 'LOADING',
        structureM15: data.structureM15?.trend || 'LOADING',
        h1Loaded: data.h1Loaded || false,
        mtfConfluence: data.mtfConfluence || false,
        premiumDiscount: data.premiumDiscount || 'EQUILIBRIUM',
        demandZones: data.demandZones?.length || 0,
        supplyZones: data.supplyZones?.length || 0,
        fvgZones: data.fvgZones?.length || 0
      }));
    
    // Filtrar señales solo de activos del plan del usuario
    const userSignals = []; // signals removed — AI handles analysis
    
    // Calcular estadísticas SOLO de los activos del usuario
    const userStats = {
      total: 0,
      wins: 0,
      losses: 0,
      pending: 0,
      tp1Hits: 0,
      tp2Hits: 0,
      tp3Hits: 0,
      winRate: 0
    };
    
    userSignals.forEach(signal => {
      if (signal.status === 'PENDING') {
        userStats.pending++;
      } else if (signal.status === 'WIN') {
        userStats.wins++;
        userStats.total++;
        if (signal.tpHit === 1) userStats.tp1Hits++;
        else if (signal.tpHit === 2) userStats.tp2Hits++;
        else if (signal.tpHit === 3) userStats.tp3Hits++;
      } else if (signal.status === 'LOSS') {
        userStats.losses++;
        userStats.total++;
      }
    });
    
    userStats.winRate = userStats.total > 0 
      ? Math.round((userStats.wins / userStats.total) * 100) 
      : 0;
    
    // Estadísticas siempre calculadas fresh — solo los 3 activos permitidos
    const finalStats = userStats;
    
    res.json({
      connected: isConnected,
      timestamp: Date.now(),
      userId,
      userPlan,
      planName: planConfig.name,
      assets: userAssets,
      recentSignals: userSignals.slice(0, 30),
      stats: finalStats,
      subscription: {
        plan: userPlan,
        planName: planConfig.name,
        status: subscription?.status || 'trial',
        daysLeft: subscription?.days_left,
        assetsCount: allowedAssets.length,
        hasNightAccess: userPlan === 'premium' || userPlan === 'elite'
      }
    });
    
  } catch (error) {
    console.error('Error getting user dashboard:', error);
    res.status(500).json({ error: 'Error loading dashboard' });
  }
});


// =============================================
// Fetch noticias y sesgo del día para contexto macro
// =============================================
async function fetchMarketContext(assetName, symbol) {
  const now = new Date();
  const hora = now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' });
  const fecha = now.toLocaleDateString('es', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
  const sesionNY = now.getUTCHours() >= 13 && now.getUTCHours() < 21;
  const sesionLondon = now.getUTCHours() >= 7 && now.getUTCHours() < 16;
  const sesionAsiatica = now.getUTCHours() >= 0 && now.getUTCHours() < 8;
  const sesionActual = sesionNY ? 'Nueva York (sesión principal)' : sesionLondon ? 'Londres' : sesionAsiatica ? 'Asiática' : 'Pre-mercado';

  // Determinar activos relacionados para buscar noticias relevantes
  const isGold = symbol === 'frxXAUUSD';
  const isForex = symbol.startsWith('frx');
  const isSynthetic = !isForex;

  let newsContext = '';
  
  try {
    // Intentar obtener noticias relevantes del activo
    if (isGold) {
      const r = await fetch('https://www.investing.com/economic-calendar/', { 
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }, 
        signal: AbortSignal.timeout(4000) 
      });
      // Si falla, usamos contexto estático inteligente
    }
  } catch {}

  // Contexto macro estático inteligente basado en activo y sesión
  if (isGold) {
    newsContext = `ACTIVO MACROECONÓMICO: El Oro (XAU/USD) reacciona a:
- Datos de inflación USA (CPI, PCE) y decisiones de la Fed
- Tensiones geopolíticas: Rusia-Ucrania, Medio Oriente, Asia
- DXY (Dólar Index): DXY sube → Oro baja, DXY baja → Oro sube
- Bonos del Tesoro USA a 10 años: yields altos presionan Oro
- Sesión NY es la de mayor volatilidad para Oro`;
  } else if (isSynthetic) {
    newsContext = `ACTIVO SINTÉTICO DERIV: ${assetName}
- No correlaciona con noticias fundamentales externas
- Precio generado algorítmicamente con volatilidad controlada
- El flujo institucional y SMC puro domina el movimiento
- Sesión NY y London tienen mayor liquidez incluso en sintéticos
- Foco 100% en estructura de precio, OB, FVG y liquidez`;
  }

  return {
    fecha,
    hora,
    sesionActual,
    sesionNY,
    sesionLondon,
    diaTrading: !['Saturday', 'Sunday'].includes(now.toLocaleDateString('en', { weekday: 'long', timeZone: 'America/New_York' })),
    newsContext
  };
}

app.post('/api/ai/analyze-chart', async (req, res) => {
  const { symbol } = req.body;

  if (!openai) {
    return res.status(503).json({ error: 'OPENAI_API_KEY no configurada en Railway.' });
  }

  const data = assetData[symbol];
  const config = ASSETS[symbol];
  if (!data || !config) {
    return res.status(404).json({ error: 'Activo no encontrado.' });
  }

  // ── Construir contexto SMC real del mercado ──
  const dec = config.decimals || 2;
  const price = data.price;

  const candles5 = (data.candles || []).slice(-5).map(c => ({
    o: c.open?.toFixed(dec), h: c.high?.toFixed(dec),
    l: c.low?.toFixed(dec),  c: c.close?.toFixed(dec)
  }));

  // Últimas 20 velas para detectar impulsos recientes
  const candles20 = (data.candles || []).slice(-20).map(c => ({
    o: c.open?.toFixed(dec), h: c.high?.toFixed(dec),
    l: c.low?.toFixed(dec),  c: c.close?.toFixed(dec)
  }));

  const demandActivas = (data.demandZones || []).filter(z => !z.mitigated).slice(0, 5);
  const supplyActivas = (data.supplyZones || []).filter(z => !z.mitigated).slice(0, 5);
  const fvgs = (data.fvgZones || []).slice(-6);
  const liquidity = (data.liquidityLevels || []);
  const swings = (data.swings || []);

  const swingHighs = swings.filter(s => s.type === 'high').slice(-5).map(s => s.price?.toFixed(dec));
  const swingLows  = swings.filter(s => s.type === 'low').slice(-5).map(s => s.price?.toFixed(dec));

  // OTE Fibonacci del último impulso
  const lastHigh = swingHighs.length ? parseFloat(swingHighs[swingHighs.length - 1]) : null;
  const lastLow  = swingLows.length  ? parseFloat(swingLows[swingLows.length - 1])  : null;
  const impulseRange = lastHigh && lastLow ? Math.abs(lastHigh - lastLow) : null;
  const structUp = data.structure?.trend === 'BULLISH';
  const fib50  = impulseRange ? (structUp ? lastHigh - impulseRange * 0.500 : lastLow + impulseRange * 0.500).toFixed(dec) : null;
  const fib618 = impulseRange ? (structUp ? lastHigh - impulseRange * 0.618 : lastLow + impulseRange * 0.618).toFixed(dec) : null;
  const fib705 = impulseRange ? (structUp ? lastHigh - impulseRange * 0.705 : lastLow + impulseRange * 0.705).toFixed(dec) : null;
  const fib786 = impulseRange ? (structUp ? lastHigh - impulseRange * 0.786 : lastLow + impulseRange * 0.786).toFixed(dec) : null;

  const choch = data.choch;
  const bos   = data.bos;
  const chochM15 = data.chochM15;
  const bosM15   = data.bosM15;
  const pd    = data.premiumDiscount || 'EQUILIBRIUM';

  // Obtener contexto macro y sesión
  const mktCtx = await fetchMarketContext(config.name, symbol);

  const systemPrompt = `Eres un trader institucional con 15 años de experiencia en Smart Money Concepts (SMC).
NUNCA usas indicadores (sin RSI, MACD, EMA, Bollinger, Stoch, nada).
Solo precio puro: estructura, liquidez, order blocks, FVG, premium/discount, BOS, CHoCH.

ESTILO DE ANÁLISIS:
- Hablas directamente al trader, tutéalo
- Explicas el POR QUÉ institucional de cada zona con lógica real
- Dices qué hace el dinero institucional VS qué hace el retail
- Eres específico con precios exactos del contexto dado
- Incluyes SIEMPRE el sesgo del día basado en la sesión y contexto macro

ESTRUCTURA OBLIGATORIA (usa estos títulos exactos con los emojis):

## 📅 SESGO DEL DÍA
## 📊 CONTEXTO DEL FLUJO INSTITUCIONAL  
## 🎯 ZONAS QUE DEBES MARCAR
## 📈 ESCENARIOS DE PRECIO
## 💡 ENTRADA INTELIGENTE
## ❌ ERRORES DEL RETAIL
## 🔍 LECTURA DEL FLUJO AHORA

En ZONAS QUE DEBES MARCAR lista cada zona con precio exacto, nombre SMC y por qué importa.
En ESCENARIOS DE PRECIO escribe Escenario 1 (más probable) y Escenario 2 paso a paso con precios.
En ENTRADA INTELIGENTE especifica: zona de entrada, SL exacto, TP1 TP2, confirmación necesaria (BOS/CHOCH en M1).
Al final incluye esta línea JSON con los niveles clave detectados (6-8 niveles, precios numéricos reales del contexto):
ZONAS_IA:{"keyLevels":[{"price":NUMERO,"type":"resistance","label":"TEXTO CORTO"},{"price":NUMERO,"type":"support","label":"TEXTO CORTO"}]}`;

  const userMsg = `Analiza este mercado AHORA. Estos son los datos reales en tiempo real:

━━━ INFORMACIÓN TEMPORAL ━━━
Fecha: ${mktCtx.fecha}
Hora NY: ${mktCtx.hora}
Sesión activa: ${mktCtx.sesionActual}
Día de trading: ${mktCtx.diaTrading ? 'Sí' : 'FIN DE SEMANA — liquidez reducida'}

━━━ ACTIVO ━━━
${config.name} (${symbol})
Precio actual: ${price?.toFixed(dec)}
Tipo: ${config.type === 'standard' ? 'Par estándar' : config.type || 'Sintético Deriv'}

━━━ CONTEXTO MACRO ━━━
${mktCtx.newsContext}

━━━ ESTRUCTURA MULTI-TIMEFRAME ━━━
H1  (tendencia mayor):  ${data.structureH1?.trend || 'CARGANDO'} — fuerza ${data.structureH1?.strength || 0}%
M15 (tendencia media):  ${data.structureM15?.trend || 'CARGANDO'} — fuerza ${data.structureM15?.strength || 0}%
M5  (tendencia corta):  ${data.structure?.trend || 'NEUTRAL'} — fuerza ${data.structure?.strength || 0}%
Confluencia MTF: ${data.mtfConfluence ? 'SÍ ✅ (H1+M15+M5 alineados)' : 'NO ❌'}
Zona de precio: ${pd}

━━━ CHoCH y BOS (cambios de estructura) ━━━
CHoCH M5:  ${choch  ? `${choch.type  === 'BULLISH_CHOCH' ? '↑ ALCISTA' : '↓ BAJISTA'} en ${choch.level?.toFixed(dec)}`  : 'No detectado'}
BOS   M5:  ${bos    ? `${bos.side    === 'BUY'           ? '↑ ALCISTA' : '↓ BAJISTA'} en ${bos.level?.toFixed(dec)}`    : 'No detectado'}
CHoCH M15: ${chochM15 ? `${chochM15.type === 'BULLISH_CHOCH' ? '↑ ALCISTA' : '↓ BAJISTA'} en ${chochM15.level?.toFixed(dec)}` : 'No detectado'}
BOS   M15: ${bosM15   ? `${bosM15.side   === 'BUY'           ? '↑ ALCISTA' : '↓ BAJISTA'} en ${bosM15.level?.toFixed(dec)}`   : 'No detectado'}

━━━ ORDER BLOCKS ACTIVOS (sin mitigar) ━━━
OB DEMANDA — compras institucionales:
${demandActivas.length ? demandActivas.map((z,i) => `  ${i+1}. [${z.low?.toFixed(dec)} — ${z.high?.toFixed(dec)}] mid:${z.mid?.toFixed(dec)}${z.isStructureOB ? ' ★ ESTRUCTURAL' : ''}`).join('\n') : '  Ninguno activo'}

OB OFERTA — ventas institucionales:
${supplyActivas.length ? supplyActivas.map((z,i) => `  ${i+1}. [${z.low?.toFixed(dec)} — ${z.high?.toFixed(dec)}] mid:${z.mid?.toFixed(dec)}${z.isStructureOB ? ' ★ ESTRUCTURAL' : ''}`).join('\n') : '  Ninguno activo'}

━━━ FAIR VALUE GAPS — imanes de precio ━━━
${fvgs.length ? fvgs.map(f => `  • FVG ${f.side === 'BUY' ? 'ALCISTA ↑' : 'BAJISTA ↓'}: [${f.low?.toFixed(dec)} — ${f.high?.toFixed(dec)}] mid:${f.mid?.toFixed(dec)}`).join('\n') : '  Sin FVGs recientes'}

━━━ LIQUIDEZ EXTERNA — donde están los stops ━━━
Buy Side Liquidity  (BSL - stops vendedores): ${swingHighs.slice(-3).join(' | ') || 'N/A'}
Sell Side Liquidity (SSL - stops compradores): ${swingLows.slice(-3).join(' | ') || 'N/A'}
Equal levels detectados:
${liquidity.length ? liquidity.map(l => `  • ${l.type === 'EQUAL_HIGHS' ? 'Equal Highs → BSL' : 'Equal Lows → SSL'}: ${l.price?.toFixed(dec)} (${l.touches} toques)`).join('\n') : '  Ninguno detectado'}

━━━ OTE — FIBONACCI DEL IMPULSO ━━━
50.0%: ${fib50  || 'N/A'}
61.8%: ${fib618 || 'N/A'} ← zona OTE inicio
70.5%: ${fib705 || 'N/A'} ← zona OTE óptima  
78.6%: ${fib786 || 'N/A'} ← zona OTE profunda
Impulso calculado de: ${lastLow || 'N/A'} a ${lastHigh || 'N/A'}

━━━ ÚLTIMAS 20 VELAS M5 ━━━
${candles20.map((c, i) => `  ${String(i+1).padStart(2,'0')}: O:${c.o} H:${c.h} L:${c.l} C:${c.c}`).join('\n')}

━━━ INSTRUCCIÓN ━━━
Con todos estos datos reales, escribe el análisis SMC institucional completo.
Usa los PRECIOS EXACTOS del contexto en cada sección.
El sesgo del día debe reflejar la sesión activa (${mktCtx.sesionActual}) y contexto macro.
Incluye al final la línea JSON con 6-8 niveles clave reales:
ZONAS_IA:{"keyLevels":[{"price":NUMERO,"type":"resistance","label":"TEXTO CORTO"},{"price":NUMERO,"type":"support","label":"TEXTO CORTO"}]}`;

  // ── Streaming con Server-Sent Events ──
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    console.log(`🧠 [IA] Analizando ${config.name} @ ${price?.toFixed(dec)}`);

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1800,
      stream: true,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMsg }
      ]
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        res.write(`data: ${JSON.stringify({ type: 'text', text: delta })}\n\n`);
      }
      if (chunk.choices[0]?.finish_reason === 'stop') {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      }
    }

  } catch (err) {
    console.error('⚠️ [IA] Error OpenAI:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

// =============================================
// API ENDPOINTS - PUSH NOTIFICATIONS
// =============================================

// Obtener VAPID public key
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
        email: userId,
        estado: 'trial',
        plan: 'free',
        periodo: 'mensual',
        created_at: new Date().toISOString()
      };
      await saveSubscription(newSub);
      return res.json({ subscription: defaultSub });
    }
    
    console.log(`📋 Suscripción encontrada para ${userId}:`, {
      plan: sub.plan,
      estado: sub.estado,
      periodo: sub.periodo,
      trial_days_left: sub.trial_days_left
    });
    
    // Si es trial, verificar días restantes
    if (sub.estado === 'trial' || sub.plan === 'free') {
      const daysLeft = sub.trial_days_left !== null ? sub.trial_days_left : 5;
      
      if (daysLeft <= 0) {
        // Trial expirado
        return res.json({ 
          subscription: { 
            status: 'expired', 
            plan: 'none',
            plan_name: 'Expirado - Adquiere un plan',
            days_left: 0,
            assets: [],
            message: 'Tu período de prueba ha terminado. Adquiere un plan para continuar.'
          } 
        });
      }
      
      return res.json({ 
        subscription: {
          status: 'trial',
          plan: 'free',
          plan_name: 'Free Trial',
          trial_ends_at: sub.trial_ends_at || trialEnd.toISOString(),
          days_left: daysLeft,
          assets: PLANS.free.assets
        }
      });
    }
    
    // Usuario con plan activo (active, basico, premium, elite)
    const planKey = sub.plan || 'free';
    const plan = PLANS[planKey] || PLANS.free;
    
    // Verificar si el plan está expirado
    if (!sub.is_active || sub.days_left <= 0) {
      console.log(`⚠️ Usuario ${userId} plan expirado: ${planKey}`);
      return res.json({ 
        subscription: {
          status: 'expired',
          plan: planKey,
          plan_name: `${plan.name} - Expirado`,
          days_left: 0,
          assets: [],
          period: sub.periodo,
          email: sub.email,
          message: 'Tu suscripción ha expirado. Renueva para continuar.'
        }
      });
    }
    
    console.log(`✅ Usuario ${userId} tiene plan: ${planKey} (${plan.name}) - ${sub.days_left} días restantes`);
    
    return res.json({ 
      subscription: {
        status: sub.estado === 'active' ? 'active' : sub.estado,
        plan: planKey,
        plan_name: plan.name,
        assets: plan.assets,
        period: sub.periodo,
        days_left: sub.days_left,
        subscription_ends_at: sub.subscription_ends_at,
        email: sub.email
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
    
    const users = (subs || []).map(sub => {
      const planKey = sub.plan || 'free';
      const planInfo = PLANS[planKey] || PLANS.free;
      
      return {
        id: sub.id,
        email: sub.email,
        status: sub.estado,
        plan: planKey,
        plan_name: planInfo.name,
        period: sub.periodo,
        days_left: sub.days_left,
        is_active: sub.is_active,
        trial_ends_at: sub.trial_ends_at,
        subscription_ends_at: sub.subscription_ends_at,
        created_at: sub.created_at
      };
    });
    
    const total = users.length;
    const trial = users.filter(u => u.status === 'trial').length;
    const active = users.filter(u => u.status === 'active').length;
    const expired = users.filter(u => u.status === 'expired' || (u.days_left !== undefined && u.days_left <= 0)).length;
    const basico = users.filter(u => u.plan === 'basico' && u.status === 'active').length;
    const premium = users.filter(u => u.plan === 'premium' && u.status === 'active').length;
    const elite = users.filter(u => u.plan === 'elite' && u.status === 'active').length;
    
    // Calcular ingresos estimados
    const monthlyRevenue = (basico * 29900) + (premium * 59900) + (elite * 99900);
    
    res.json({ 
      users, 
      stats: { 
        total, 
        trial, 
        active, 
        expired,
        basico,
        premium,
        elite,
        monthlyRevenue
      },
      storage: supabase ? 'supabase' : 'memory'
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.json({ users: [], error: error.message });
  }
});

app.post('/api/admin/users', async (req, res) => {
  const { email, plan, status, period } = req.body;
  if (!email) return res.status(400).json({ error: 'email requerido' });
  
  try {
    const subData = {
      email: email,
      plan: plan || 'free',
      estado: status || 'trial',
      periodo: period || 'mensual'
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
    // userId es el email
    const existing = await getSubscription(userId);
    
    const subData = {
      email: userId,
      plan: plan || existing?.plan || 'free',
      estado: status || existing?.estado || 'trial',
      periodo: period || existing?.periodo || 'mensual'
    };
    
    const result = await saveSubscription(subData);
    
    if (result.error) {
      return res.status(500).json({ error: result.error.message });
    }
    
    res.json({ success: true, subscription: subData });
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

// Endpoint para ver estado de mercados
app.get('/api/markets/status', (req, res) => {
  const marketsInfo = {};
  for (const symbol of MY_ASSETS) {
    const config = ASSETS[symbol];
    const status = marketStatus[symbol];
    const data = assetData[symbol];
    
    marketsInfo[symbol] = {
      name: config.shortName,
      category: config.category,
      isOpen: isMarketOpenNow(symbol),
      isActive: status.isActive,
      lastDataReceived: status.lastDataReceived ? new Date(status.lastDataReceived).toISOString() : null,
      hasCandles: data.candles?.length > 0,
      candleCount: data.candles?.length || 0,
      currentPrice: data.price,
      subscriptionAttempts: status.subscriptionAttempts
    };
  }
  
  res.json({
    connected: isConnected,
    timestamp: new Date().toISOString(),
    markets: marketsInfo
  });
});

// Endpoint para forzar resubscripción de un mercado
app.post('/api/markets/resubscribe/:symbol', (req, res) => {
  const { symbol } = req.params;
  
  if (!ASSETS[symbol]) {
    return res.status(404).json({ error: 'Mercado no encontrado' });
  }
  
  if (!isConnected) {
    return res.status(503).json({ error: 'No conectado a Deriv' });
  }
  
  resubscribeToAsset(symbol);
  
  res.json({
    success: true,
    message: `Resubscripción enviada para ${ASSETS[symbol].shortName}`,
    symbol
  });
});

// Endpoint para forzar resubscripción de todos los mercados
app.post('/api/markets/resubscribe-all', (req, res) => {
  if (!isConnected) {
    return res.status(503).json({ error: 'No conectado a Deriv' });
  }
  
  const resubscribed = [];
  for (const symbol of MY_ASSETS) {
    if (isMarketOpenNow(symbol)) {
      resubscribeToAsset(symbol);
      resubscribed.push(ASSETS[symbol].shortName);
    }
  }
  
  res.json({
    success: true,
    message: `Resubscripción enviada para ${resubscribed.length} mercados`,
    markets: resubscribed
  });
});

app.get('/api/health', (req, res) => {
  // FIX: responder INMEDIATAMENTE sin llamadas externas
  // Railway mata el proceso si no responde en el timeout configurado
  res.json({
    status: 'ok',
    version: '24.3',
    deriv:    isConnected ? 'connected' : 'disconnected',
    openai:   !!openai,
    supabase: !!supabase,
    telegram: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    assets:   MY_ASSETS.length,
    signals:  0,
    uptime:   Math.floor(process.uptime()),
    memory:   Math.floor(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
  });
});


// =============================================
// INICIO DEL SERVIDOR
// =============================================
// Asegurar que admin tenga plan elite al iniciar
async function ensureAdminElite() {
  if (!supabase) return;
  try {
    await supabase.from('users')
      .update({ plan: 'elite', is_active: true })
      .eq('email', 'admin@tradingpro.com');
    console.log('✅ Admin actualizado a plan Elite');
  } catch(e) { console.log('Admin update:', e.message); }
}




// =============================================
// INICIO DEL SERVIDOR
// =============================================

// =============================================
// INICIO DEL SERVIDOR
// =============================================
async function startServer() {
  if (supabase) {
    try {
      const { data } = await supabase.from('users').select('email, plan');
      if (data) console.log('✅ ' + data.length + ' usuarios cargados');
    } catch(e) {}
  }
  connectDeriv();
  startMarketMonitoring();
}

app.listen(PORT, () => {
  console.log('\n=== TRADING MASTER PRO v25.0 - IA SMC ===');
  console.log('Puerto: ' + PORT);
  console.log('OpenAI: ' + (openai ? 'Conectado' : 'No configurado'));
  console.log('Supabase: ' + (supabase ? 'Conectado' : 'No configurado'));
  console.log('Senales automaticas: DESACTIVADAS');
  console.log('IA institucional: ACTIVA (bajo demanda)');
  console.log('=========================================\n');
  startServer();
});
