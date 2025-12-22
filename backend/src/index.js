// =============================================
// TRADING MASTER PRO - BACKEND v7.2
// SMC INSTITUCIONAL + PSICOTRADING + TRACKING
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

console.log('\n🔧 TRADING MASTER PRO v7.2');
console.log('═══════════════════════════════════════');
console.log('SMC + PSICOTRADING + TRACKING');
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

const TF_HTF = 300;
const TF_LTF = 60;

// =============================================
// ESTADO GLOBAL
// =============================================
let derivWs = null;
let isDerivConnected = false;
let aiEnabled = true;
const candleData = new Map();
const tickData = new Map();
const dailySignals = new Map();
const activeSignals = new Map();
const signalHistory = [];
const usedStructures = new Map();

// =============================================
// 📊 TRACKING DE SEÑALES Y ESTADÍSTICAS
// =============================================
const tradingStats = {
  totalSignals: 0,
  operatedSignals: 0,
  wins: 0,
  losses: 0,
  skipped: 0,
  bySymbol: {},
  bySetup: {},
  streaks: { currentWin: 0, currentLoss: 0, maxWin: 0, maxLoss: 0 },
  tradingDiary: [], // Diario de trading
  emotionalLog: [], // Log emocional
};

// Inicializar stats por símbolo
Object.keys(SYNTHETIC_INDICES).forEach(s => {
  tradingStats.bySymbol[s] = { signals: 0, operated: 0, wins: 0, losses: 0 };
});

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
// 🧠 ANALIZADOR SMC v7.1 (sin cambios)
// =============================================
const SMCAnalyzer = {
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

  detectLiquidity(candles, swings) {
    const liquidity = { equalHighs: [], equalLows: [], inducements: [] };
    const recentHighs = swings.highs.slice(-5);
    const recentLows = swings.lows.slice(-5);
    const tolerance = 0.0003;
    
    for (let i = 0; i < recentHighs.length - 1; i++) {
      for (let j = i + 1; j < recentHighs.length; j++) {
        const diff = Math.abs(recentHighs[i].price - recentHighs[j].price) / recentHighs[i].price;
        if (diff <= tolerance && Math.abs(recentHighs[i].index - recentHighs[j].index) >= 3) {
          liquidity.equalHighs.push({
            type: 'EQUAL_HIGHS', price: Math.max(recentHighs[i].price, recentHighs[j].price),
            level: (recentHighs[i].price + recentHighs[j].price) / 2,
            points: [recentHighs[i], recentHighs[j]],
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
            type: 'EQUAL_LOWS', price: Math.min(recentLows[i].price, recentLows[j].price),
            level: (recentLows[i].price + recentLows[j].price) / 2,
            points: [recentLows[i], recentLows[j]],
            age: candles.length - Math.max(recentLows[i].index, recentLows[j].index),
          });
        }
      }
    }
    
    return liquidity;
  },

  detectSweep(candles, liquidity, swings) {
    if (!candles || candles.length < 10) return null;
    const recent = candles.slice(-6);
    const currentIndex = candles.length;
    
    for (const eqHigh of liquidity.equalHighs) {
      if (eqHigh.age > 20) continue;
      for (let i = 0; i < recent.length; i++) {
        const candle = recent[i];
        const wickAbove = candle.high - Math.max(candle.open, candle.close);
        const bodySize = Math.abs(candle.close - candle.open);
        if (candle.high > eqHigh.level && candle.close < eqHigh.level && candle.open < eqHigh.level && wickAbove > bodySize * 0.3) {
          return { type: 'SWEEP_HIGH', direction: 'BEARISH', level: eqHigh.level, sweepCandle: candle, sweepIndex: currentIndex - (recent.length - i), description: 'Sweep de EQH', valid: true };
        }
      }
    }
    
    for (const eqLow of liquidity.equalLows) {
      if (eqLow.age > 20) continue;
      for (let i = 0; i < recent.length; i++) {
        const candle = recent[i];
        const wickBelow = Math.min(candle.open, candle.close) - candle.low;
        const bodySize = Math.abs(candle.close - candle.open);
        if (candle.low < eqLow.level && candle.close > eqLow.level && candle.open > eqLow.level && wickBelow > bodySize * 0.3) {
          return { type: 'SWEEP_LOW', direction: 'BULLISH', level: eqLow.level, sweepCandle: candle, sweepIndex: currentIndex - (recent.length - i), description: 'Sweep de EQL', valid: true };
        }
      }
    }
    
    return null;
  },

  detectDisplacement(candles, sweep) {
    if (!sweep || !sweep.valid || !candles || candles.length < 15) return null;
    const sweepIndex = sweep.sweepIndex || candles.length - 5;
    const afterSweep = candles.slice(sweepIndex);
    if (afterSweep.length < 2) return null;
    
    const lookbackStart = Math.max(0, sweepIndex - 20);
    const lookbackEnd = Math.max(0, sweepIndex - 2);
    const lookback = candles.slice(lookbackStart, lookbackEnd);
    if (lookback.length < 5) return null;
    
    const avgRange = lookback.reduce((sum, c) => sum + (c.high - c.low), 0) / lookback.length;
    if (!avgRange || avgRange === 0 || isNaN(avgRange)) return null;
    
    for (let i = 0; i < Math.min(afterSweep.length, 5); i++) {
      const candle = afterSweep[i];
      const candleRange = candle.high - candle.low;
      const bodySize = Math.abs(candle.close - candle.open);
      const isImpulsive = bodySize > candleRange * 0.6;
      const multiplier = candleRange / avgRange;
      
      if (multiplier > 1.5 && isImpulsive) {
        const isBullish = candle.close > candle.open;
        if ((sweep.direction === 'BULLISH' && isBullish) || (sweep.direction === 'BEARISH' && !isBullish)) {
          return { type: 'DISPLACEMENT', direction: sweep.direction, candle, index: sweepIndex + i, multiplier: multiplier.toFixed(2), description: `Displacement ${multiplier.toFixed(1)}x`, valid: true };
        }
      }
    }
    return null;
  },

  detectCHoCH(candles, swings, sweep, displacement) {
    if (!sweep || !sweep.valid || !displacement || !displacement.valid) return null;
    const { highs, lows } = swings;
    const displacementIndex = displacement.index;
    const afterDisplacement = candles.slice(displacementIndex);
    if (afterDisplacement.length < 2) return null;
    
    if (sweep.direction === 'BULLISH') {
      const structuralHighs = highs.filter(h => h.index < displacementIndex).filter((h, i, arr) => i === 0 || Math.abs(h.index - arr[i-1].index) >= 3).slice(-3);
      const relevantHigh = structuralHighs.reduce((best, h) => (!best || h.price > best.price) ? h : best, null);
      
      if (relevantHigh) {
        for (let i = 0; i < afterDisplacement.length; i++) {
          if (afterDisplacement[i].close > relevantHigh.price) {
            return { id: `${sweep.sweepIndex}_${relevantHigh.price.toFixed(4)}`, type: 'CHoCH', direction: 'BULLISH', breakLevel: relevantHigh.price, breakIndex: displacementIndex + i, description: 'CHoCH Alcista', valid: true };
          }
        }
      }
    }
    
    if (sweep.direction === 'BEARISH') {
      const structuralLows = lows.filter(l => l.index < displacementIndex).filter((l, i, arr) => i === 0 || Math.abs(l.index - arr[i-1].index) >= 3).slice(-3);
      const relevantLow = structuralLows.reduce((best, l) => (!best || l.price < best.price) ? l : best, null);
      
      if (relevantLow) {
        for (let i = 0; i < afterDisplacement.length; i++) {
          if (afterDisplacement[i].close < relevantLow.price) {
            return { id: `${sweep.sweepIndex}_${relevantLow.price.toFixed(4)}`, type: 'CHoCH', direction: 'BEARISH', breakLevel: relevantLow.price, breakIndex: displacementIndex + i, description: 'CHoCH Bajista', valid: true };
          }
        }
      }
    }
    return null;
  },

  findDecisionalOB(candles, choch, displacement) {
    if (!choch || !choch.valid || !displacement) return null;
    const displacementIndex = displacement.index;
    const searchStart = Math.max(0, displacementIndex - 10);
    const searchRange = candles.slice(searchStart, displacementIndex);
    
    if (choch.direction === 'BULLISH') {
      for (let i = searchRange.length - 1; i >= 0; i--) {
        const candle = searchRange[i];
        const isBearish = candle.close < candle.open;
        const bodySize = Math.abs(candle.close - candle.open);
        if (isBearish && bodySize > (candle.high - candle.low) * 0.4) {
          const obIndex = searchStart + i;
          const isMitigated = candles.slice(obIndex + 1).some(c => c.low <= candle.low);
          if (!isMitigated) {
            return { type: 'DECISIONAL', obType: 'DEMAND', high: candle.high, low: candle.low, mid: (candle.high + candle.low) / 2, index: obIndex, description: 'OB Demanda', valid: true };
          }
        }
      }
    } else {
      for (let i = searchRange.length - 1; i >= 0; i--) {
        const candle = searchRange[i];
        const isBullish = candle.close > candle.open;
        const bodySize = Math.abs(candle.close - candle.open);
        if (isBullish && bodySize > (candle.high - candle.low) * 0.4) {
          const obIndex = searchStart + i;
          const isMitigated = candles.slice(obIndex + 1).some(c => c.high >= candle.high);
          if (!isMitigated) {
            return { type: 'DECISIONAL', obType: 'SUPPLY', high: candle.high, low: candle.low, mid: (candle.high + candle.low) / 2, index: obIndex, description: 'OB Oferta', valid: true };
          }
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
          const sweepAndClose = curr.low < prev.low && curr.close > prev.close;
          
          if (isMicroCHoCH || isRejection || sweepAndClose) {
            return { type: 'LTF_CONFIRMATION', confirmationType: isMicroCHoCH ? 'MICRO_CHOCH' : isRejection ? 'REJECTION' : 'SWEEP_CLOSE', direction: 'BULLISH', entryPrice: curr.close, inZone: true, description: 'Confirmación alcista', valid: true };
          }
        }
        
        if (direction === 'BEARISH') {
          const isMicroCHoCH = curr.close < prev.low && curr.close < curr.open;
          const wickAbove = curr.high - Math.max(curr.open, curr.close);
          const isRejection = wickAbove > Math.abs(curr.close - curr.open) * 2 && curr.close < curr.open;
          const sweepAndClose = curr.high > prev.high && curr.close < prev.close;
          
          if (isMicroCHoCH || isRejection || sweepAndClose) {
            return { type: 'LTF_CONFIRMATION', confirmationType: isMicroCHoCH ? 'MICRO_CHOCH' : isRejection ? 'REJECTION' : 'SWEEP_CLOSE', direction: 'BEARISH', entryPrice: curr.close, inZone: true, description: 'Confirmación bajista', valid: true };
          }
        }
      }
    }
    
    return { type: 'WAITING', direction, currentPrice, inZone: inOBZone, description: inOBZone ? 'En zona - esperando confirmación' : 'Esperando precio en OB', valid: false };
  },

  calculateLevels(ob, direction) {
    if (!ob) return null;
    let entry, stopLoss;
    if (direction === 'BULLISH') { entry = ob.high; stopLoss = ob.low - ((ob.high - ob.low) * 0.3); }
    else { entry = ob.low; stopLoss = ob.high + ((ob.high - ob.low) * 0.3); }
    const risk = Math.abs(entry - stopLoss);
    
    return {
      entry: entry.toFixed(4), stopLoss: stopLoss.toFixed(4),
      tp1: (direction === 'BULLISH' ? entry + risk * 2 : entry - risk * 2).toFixed(4),
      tp2: (direction === 'BULLISH' ? entry + risk * 3 : entry - risk * 3).toFixed(4),
      tp3: (direction === 'BULLISH' ? entry + risk * 5 : entry - risk * 5).toFixed(4),
      tp4: (direction === 'BULLISH' ? entry + risk * 10 : entry - risk * 10).toFixed(4),
      risk: risk.toFixed(4), ratios: '1:2 | 1:3 | 1:5 | 1:10'
    };
  },

  calculateScore(analysis) {
    let score = 0;
    const breakdown = {};
    if (analysis.liquidity?.equalHighs?.length > 0 || analysis.liquidity?.equalLows?.length > 0) { score += 20; breakdown.liquidity = 20; }
    if (analysis.sweep?.valid) { score += 25; breakdown.sweep = 25; }
    if (analysis.displacement?.valid) { const pts = Math.min(20, Math.floor(parseFloat(analysis.displacement.multiplier) * 8)); score += pts; breakdown.displacement = pts; }
    if (analysis.choch?.valid) { score += 20; breakdown.choch = 20; }
    if (analysis.orderBlock?.valid) { score += 15; breakdown.orderBlock = 15; }
    
    let classification = 'INVALID';
    if (score >= 90) classification = 'A+';
    else if (score >= 75) classification = 'A';
    else if (score >= 60) classification = 'B';
    
    return { score, classification, breakdown, isValid: score >= 75, canAutomate: score >= 90 };
  },

  analyze(symbol) {
    const config = SYNTHETIC_INDICES[symbol];
    if (!config) return { error: 'Símbolo no soportado' };
    
    const candlesHTF = candleData.get(`${symbol}_${TF_HTF}`) || [];
    const candlesLTF = candleData.get(`${symbol}_${TF_LTF}`) || [];
    
    if (candlesHTF.length < 50) return { symbol, symbolName: config.name, error: 'Cargando...', status: 'LOADING' };
    
    const currentPrice = candlesHTF[candlesHTF.length - 1]?.close;
    const swings = this.findSwings(candlesHTF);
    const liquidity = this.detectLiquidity(candlesHTF, swings);
    const sweep = this.detectSweep(candlesHTF, liquidity, swings);
    const displacement = this.detectDisplacement(candlesHTF, sweep);
    const choch = this.detectCHoCH(candlesHTF, swings, sweep, displacement);
    const orderBlock = this.findDecisionalOB(candlesHTF, choch, displacement);
    const ltfEntry = orderBlock && choch ? this.checkLTFEntry(candlesLTF, orderBlock, choch.direction) : null;
    
    const scoring = this.calculateScore({ liquidity, sweep, displacement, choch, orderBlock });
    const levels = orderBlock && choch ? this.calculateLevels(orderBlock, choch.direction) : null;
    
    let structureUsed = choch?.id ? usedStructures.has(choch.id) : false;
    
    let status = 'BUSCANDO', waiting = [], hasSignal = false;
    if (!liquidity.equalHighs.length && !liquidity.equalLows.length) { status = 'SIN_LIQUIDEZ'; waiting.push('Buscando Equal Highs/Lows'); }
    else if (!sweep?.valid) { status = 'ESPERANDO_SWEEP'; waiting.push('Liquidez detectada - Esperando sweep'); }
    else if (!displacement?.valid) { status = 'ESPERANDO_DISPLACEMENT'; waiting.push('Sweep OK - Esperando desplazamiento'); }
    else if (!choch?.valid) { status = 'ESPERANDO_CHOCH'; waiting.push('Displacement OK - Esperando CHoCH'); }
    else if (!orderBlock?.valid) { status = 'BUSCANDO_OB'; waiting.push('CHoCH OK - Buscando OB'); }
    else if (structureUsed) { status = 'ESTRUCTURA_USADA'; waiting.push('Ya operamos este CHoCH'); }
    else if (!ltfEntry?.valid) { status = 'ESPERANDO_ENTRADA'; waiting.push('OB listo - Esperando confirmación 1M'); }
    else { status = 'SEÑAL_ACTIVA'; hasSignal = scoring.isValid && !structureUsed; }
    
    return {
      symbol, symbolName: config.name, currentPrice,
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
// 🧠 PSICOTRADING IA
// =============================================
const PsychoTrading = {
  
  // Analizar estado emocional basado en historial
  analyzeEmotionalState() {
    const recentTrades = signalHistory.slice(0, 10);
    const operated = recentTrades.filter(s => s.operated);
    const wins = operated.filter(s => s.result === 'WIN').length;
    const losses = operated.filter(s => s.result === 'LOSS').length;
    
    let emotionalState = 'NEUTRAL';
    let riskLevel = 'NORMAL';
    let recommendations = [];
    
    // Detectar racha perdedora
    if (tradingStats.streaks.currentLoss >= 3) {
      emotionalState = 'TILT';
      riskLevel = 'HIGH';
      recommendations.push('⚠️ Llevas 3+ pérdidas seguidas. Considera pausar.');
      recommendations.push('🧘 Respira profundo. Una pausa de 30 min puede salvar tu cuenta.');
    }
    
    // Detectar overtrading
    const todayTrades = operated.filter(s => {
      const d = new Date(s.createdAt);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    });
    
    if (todayTrades.length >= 5) {
      emotionalState = 'OVERTRADING';
      riskLevel = 'HIGH';
      recommendations.push('🛑 Ya operaste 5+ veces hoy. ¿Estás siguiendo tu plan?');
    }
    
    // Detectar revenge trading
    const last3 = operated.slice(0, 3);
    if (last3.length >= 2 && last3.every(s => s.result === 'LOSS')) {
      const timeDiff = last3.length >= 2 ? 
        (new Date(last3[0].operatedAt) - new Date(last3[1].operatedAt)) / 1000 / 60 : 999;
      if (timeDiff < 10) {
        emotionalState = 'REVENGE_TRADING';
        riskLevel = 'CRITICAL';
        recommendations.push('🚨 ALERTA: Posible revenge trading detectado.');
        recommendations.push('🛑 PARA. No operes por al menos 1 hora.');
      }
    }
    
    // Detectar buen momento
    if (tradingStats.streaks.currentWin >= 3) {
      emotionalState = 'CONFIDENT';
      riskLevel = 'MODERATE';
      recommendations.push('✅ Buena racha! Pero no te confíes.');
      recommendations.push('📏 Mantén tu tamaño de posición. No aumentes el riesgo.');
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

  // Generar coaching personalizado con IA
  async getCoaching(userMessage, context = {}) {
    if (!openai) return { response: 'IA no disponible', type: 'error' };
    
    const emotionalState = this.analyzeEmotionalState();
    const stats = getDetailedStats();
    
    const systemPrompt = `Eres un coach de psicotrading experto y empático. Tu trabajo es ayudar a traders a:
1. Mantener disciplina y seguir su plan
2. Manejar emociones (miedo, codicia, frustración)
3. Evitar errores comunes (revenge trading, overtrading, FOMO)
4. Desarrollar mentalidad ganadora

CONTEXTO DEL TRADER:
- Estado emocional detectado: ${emotionalState.emotionalState}
- Nivel de riesgo: ${emotionalState.riskLevel}
- Win rate: ${stats.winRate}%
- Racha actual: ${emotionalState.stats.currentWinStreak} wins / ${emotionalState.stats.currentLossStreak} losses
- Trades hoy: ${emotionalState.stats.todayTrades}
- Total operados: ${stats.totalOperated}

REGLAS:
- Sé directo pero empático
- Da consejos ESPECÍFICOS y accionables
- Si detectas peligro (tilt, revenge), sé firme
- Usa emojis con moderación
- Respuestas cortas (máx 150 palabras)
- En español`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 300,
      });
      
      return {
        response: response.choices[0]?.message?.content || 'Sin respuesta',
        emotionalState,
        type: 'coaching'
      };
    } catch (error) {
      return { response: 'Error al procesar', type: 'error' };
    }
  },

  // Plan de trading personalizado
  async generateTradingPlan(preferences) {
    if (!openai) return { error: 'IA no disponible' };
    
    const prompt = `Genera un PLAN DE TRADING personalizado basado en:
- Capital: ${preferences.capital || 'No especificado'}
- Riesgo por trade: ${preferences.riskPerTrade || '1-2%'}
- Horario disponible: ${preferences.schedule || 'Flexible'}
- Experiencia: ${preferences.experience || 'Intermedio'}
- Objetivo mensual: ${preferences.monthlyGoal || '10%'}

Incluye:
1. Reglas de entrada (máx 5)
2. Reglas de gestión de riesgo
3. Límites diarios (pérdidas/operaciones)
4. Rutina pre-mercado
5. Checklist antes de cada trade

Formato estructurado, claro y accionable.`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
      });
      
      return { plan: response.choices[0]?.message?.content, generatedAt: new Date().toISOString() };
    } catch {
      return { error: 'Error generando plan' };
    }
  },

  // Análisis post-trade
  async analyzePostTrade(signal, result, notes) {
    if (!openai) return { analysis: 'IA no disponible' };
    
    const prompt = `Analiza este trade:
SEÑAL:
- Símbolo: ${signal.symbolName}
- Dirección: ${signal.direction}
- Score: ${signal.scoring?.score}/100
- Setup: Sweep ${signal.sweep?.type} → ${signal.choch?.description} → ${signal.orderBlock?.description}

RESULTADO: ${result}
NOTAS DEL TRADER: ${notes || 'Sin notas'}

Proporciona:
1. ¿Qué se hizo bien?
2. ¿Qué se pudo mejorar?
3. Lección clave para recordar
4. Calificación de ejecución (1-10)

Sé constructivo y específico.`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
      });
      
      return { analysis: response.choices[0]?.message?.content };
    } catch {
      return { analysis: 'Error en análisis' };
    }
  }
};

// =============================================
// 📊 ESTADÍSTICAS DETALLADAS
// =============================================
function getDetailedStats() {
  const operated = signalHistory.filter(s => s.operated);
  const wins = operated.filter(s => s.result === 'WIN');
  const losses = operated.filter(s => s.result === 'LOSS');
  
  // Por símbolo
  const bySymbol = {};
  Object.keys(SYNTHETIC_INDICES).forEach(sym => {
    const symSignals = operated.filter(s => s.symbol === sym);
    const symWins = symSignals.filter(s => s.result === 'WIN');
    bySymbol[sym] = {
      total: symSignals.length,
      wins: symWins.length,
      losses: symSignals.length - symWins.length,
      winRate: symSignals.length > 0 ? ((symWins.length / symSignals.length) * 100).toFixed(1) : 0
    };
  });
  
  // Por tipo de entrada
  const byEntryType = {};
  operated.forEach(s => {
    const type = s.ltfEntry?.confirmationType || 'UNKNOWN';
    if (!byEntryType[type]) byEntryType[type] = { total: 0, wins: 0 };
    byEntryType[type].total++;
    if (s.result === 'WIN') byEntryType[type].wins++;
  });
  
  // Mejor día/hora
  const byHour = {};
  operated.forEach(s => {
    const hour = new Date(s.createdAt).getHours();
    if (!byHour[hour]) byHour[hour] = { total: 0, wins: 0 };
    byHour[hour].total++;
    if (s.result === 'WIN') byHour[hour].wins++;
  });
  
  return {
    totalSignals: signalHistory.length,
    totalOperated: operated.length,
    totalSkipped: signalHistory.length - operated.length,
    wins: wins.length,
    losses: losses.length,
    winRate: operated.length > 0 ? ((wins.length / operated.length) * 100).toFixed(1) : 0,
    bySymbol,
    byEntryType,
    byHour,
    streaks: tradingStats.streaks,
    bestSymbol: Object.entries(bySymbol).sort((a, b) => parseFloat(b[1].winRate) - parseFloat(a[1].winRate))[0]?.[0] || 'N/A',
    worstSymbol: Object.entries(bySymbol).filter(([_, v]) => v.total > 0).sort((a, b) => parseFloat(a[1].winRate) - parseFloat(b[1].winRate))[0]?.[0] || 'N/A'
  };
}

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

Habla como trader profesional SMC.`;

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
  console.log('📱 Enviando WhatsApp via TextMeBot...');
  if (!CALLMEBOT_API_KEY) return false;
  
  const msg = `🎯 *SMC ELITE v7.2*
📊 ${signal.symbolName || 'Test'}
${signal.direction === 'BULLISH' ? '🟢 COMPRA' : '🔴 VENTA'}

✅ Sweep: ${signal.sweep?.description || 'N/A'}
✅ CHoCH: ${signal.choch?.description || 'N/A'}
✅ OB: ${signal.orderBlock?.description || 'N/A'}

📍 Entry: ${signal.levels?.entry || 'N/A'}
🛑 SL: ${signal.levels?.stopLoss || 'N/A'}
🎯 TP1: ${signal.levels?.tp1 || 'N/A'}
🎯 TP3: ${signal.levels?.tp3 || 'N/A'}

🏆 Score: ${signal.scoring?.score || 0}/100`;

  const url = `https://api.textmebot.com/send.php?recipient=${WHATSAPP_PHONE}&apikey=${CALLMEBOT_API_KEY}&text=${encodeURIComponent(msg)}`;

  try {
    const response = await fetch(url);
    const text = await response.text();
    console.log('📱 Response:', text.substring(0, 100));
    return response.ok;
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
        derivWs.send(JSON.stringify({ ticks_history: symbol, adjust_start_time: 1, count: 200, end: 'latest', granularity: g, style: 'candles', subscribe: 1 }));
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
      id: signalId, ...analysis, 
      dailyCount: count + 1, 
      createdAt: new Date().toISOString(),
      // Tracking fields
      operated: false,
      result: null, // 'WIN', 'LOSS', null
      operatedAt: null,
      notes: '',
      exitPrice: null,
      pnl: null
    };
    
    if (analysis.choch?.id) usedStructures.set(analysis.choch.id, true);
    
    activeSignals.set(signalId, signal);
    signalHistory.unshift(signal);
    if (signalHistory.length > 100) signalHistory.pop();
    dailySignals.set(symbol, count + 1);
    tradingStats.totalSignals++;

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

app.get('/', (req, res) => res.json({ status: 'ok', version: '7.2', features: ['SMC', 'Psicotrading', 'Tracking'], deriv: isDerivConnected }));
app.get('/health', (req, res) => res.json({ status: 'healthy', deriv: isDerivConnected }));

// Deriv
app.get('/api/deriv/symbols', (req, res) => res.json(SYNTHETIC_INDICES));
app.get('/api/deriv/status', (req, res) => res.json({ connected: isDerivConnected }));
app.get('/api/analyze/:symbol', (req, res) => res.json(SMCAnalyzer.analyze(req.params.symbol)));
app.get('/api/narration/:symbol', async (req, res) => {
  const analysis = SMCAnalyzer.analyze(req.params.symbol);
  const narration = await generateNarration(analysis);
  res.json(narration);
});

// IA Toggle
app.post('/api/ai/toggle', (req, res) => { aiEnabled = !aiEnabled; res.json({ aiEnabled }); });
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

// =============================================
// 📊 TRACKING DE SEÑALES
// =============================================
app.post('/api/signals/:id/track', (req, res) => {
  const { id } = req.params;
  const { operated, result, notes, exitPrice } = req.body;
  
  const signal = signalHistory.find(s => s.id === id);
  if (!signal) return res.status(404).json({ error: 'Señal no encontrada' });
  
  // Actualizar señal
  signal.operated = operated;
  signal.operatedAt = operated ? new Date().toISOString() : null;
  signal.result = result || null;
  signal.notes = notes || '';
  signal.exitPrice = exitPrice || null;
  
  // Calcular PnL si hay resultado
  if (result && signal.levels && exitPrice) {
    const entry = parseFloat(signal.levels.entry);
    const exit = parseFloat(exitPrice);
    signal.pnl = signal.direction === 'BULLISH' ? exit - entry : entry - exit;
  }
  
  // Actualizar estadísticas
  if (operated) {
    tradingStats.operatedSignals++;
    tradingStats.bySymbol[signal.symbol].operated++;
    
    if (result === 'WIN') {
      tradingStats.wins++;
      tradingStats.bySymbol[signal.symbol].wins++;
      tradingStats.streaks.currentWin++;
      tradingStats.streaks.currentLoss = 0;
      if (tradingStats.streaks.currentWin > tradingStats.streaks.maxWin) {
        tradingStats.streaks.maxWin = tradingStats.streaks.currentWin;
      }
    } else if (result === 'LOSS') {
      tradingStats.losses++;
      tradingStats.bySymbol[signal.symbol].losses++;
      tradingStats.streaks.currentLoss++;
      tradingStats.streaks.currentWin = 0;
      if (tradingStats.streaks.currentLoss > tradingStats.streaks.maxLoss) {
        tradingStats.streaks.maxLoss = tradingStats.streaks.currentLoss;
      }
    }
  } else {
    tradingStats.skipped++;
  }
  
  console.log(`📊 Señal ${id} actualizada: ${operated ? (result || 'operada') : 'no operada'}`);
  res.json({ success: true, signal });
});

// =============================================
// 📈 ESTADÍSTICAS
// =============================================
app.get('/api/stats', (req, res) => {
  res.json(getDetailedStats());
});

app.get('/api/stats/emotional', (req, res) => {
  res.json(PsychoTrading.analyzeEmotionalState());
});

// =============================================
// 🧠 PSICOTRADING
// =============================================
app.post('/api/psycho/coaching', async (req, res) => {
  const { message, context } = req.body;
  const response = await PsychoTrading.getCoaching(message, context);
  res.json(response);
});

app.post('/api/psycho/plan', async (req, res) => {
  const plan = await PsychoTrading.generateTradingPlan(req.body);
  res.json(plan);
});

app.post('/api/psycho/post-trade', async (req, res) => {
  const { signalId, result, notes } = req.body;
  const signal = signalHistory.find(s => s.id === signalId);
  if (!signal) return res.status(404).json({ error: 'Señal no encontrada' });
  
  const analysis = await PsychoTrading.analyzePostTrade(signal, result, notes);
  res.json(analysis);
});

// Quick check emocional
app.get('/api/psycho/check', (req, res) => {
  const state = PsychoTrading.analyzeEmotionalState();
  res.json({
    canTrade: state.riskLevel !== 'CRITICAL',
    state: state.emotionalState,
    risk: state.riskLevel,
    message: state.recommendations[0] || '✅ Estado OK para operar',
    recommendations: state.recommendations
  });
});

// WhatsApp test
app.get('/api/test-whatsapp', async (req, res) => {
  const result = await sendWhatsApp({
    symbolName: '🧪 TEST v7.2', direction: 'BULLISH',
    sweep: { description: 'Test' }, choch: { description: 'Test' }, orderBlock: { description: 'Test' },
    levels: { entry: '100', stopLoss: '99', tp1: '102', tp3: '105' },
    scoring: { score: 95 }
  });
  res.json({ success: result });
});

// Config
app.get('/api/config', (req, res) => {
  res.json({
    version: '7.2',
    features: ['SMC Institucional', 'Psicotrading IA', 'Tracking Señales', 'WhatsApp Alerts'],
    whatsapp: { phone: WHATSAPP_PHONE, configured: !!CALLMEBOT_API_KEY },
    deriv: { connected: isDerivConnected },
    ai: { enabled: aiEnabled, configured: !!openai }
  });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     TRADING MASTER PRO v7.2                                ║
║     SMC + PSICOTRADING + TRACKING                          ║
╠════════════════════════════════════════════════════════════╣
║  📈 SMC Institucional Elite                                ║
║  🧠 Coach de Psicotrading con IA                           ║
║  📊 Tracking de señales (Win/Loss)                         ║
║  📱 Alertas WhatsApp                                       ║
║  📉 Estadísticas detalladas                                ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;
