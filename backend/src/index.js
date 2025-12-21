// =============================================
// TRADING MASTER PRO - BACKEND v6.0
// SMC Institutional Core Strategy
// WhatsApp Notifications + Fixed Indices
// =============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// =============================================
// CONFIGURACIÓN
// =============================================
console.log('\n🔧 VERIFICANDO CONFIGURACIÓN v6.0...');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅' : '❌');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅' : '❌');
console.log('DERIV_APP_ID:', process.env.DERIV_APP_ID ? '✅' : '❌');
console.log('DERIV_API_TOKEN:', process.env.DERIV_API_TOKEN ? '✅' : '❌');
console.log('WHATSAPP_PHONE:', process.env.WHATSAPP_PHONE || '+573203921881');

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
const WHATSAPP_PHONE = process.env.WHATSAPP_PHONE || '+573203921881';
const CALLMEBOT_API_KEY = process.env.CALLMEBOT_API_KEY || '';

// =============================================
// ÍNDICES SOPORTADOS (CORREGIDOS)
// Eliminados los (1s), corregidos los símbolos
// =============================================

const SYNTHETIC_INDICES = {
  // Volatility - Solo 75 y 100 funcionan bien, pero incluimos todos con símbolos correctos
  'R_75': { name: 'Volatility 75', symbol: 'R_75', pip: 0.0001, maxSignals: 7, executionTF: 'M1', type: 'Volatility' },
  'R_100': { name: 'Volatility 100', symbol: 'R_100', pip: 0.01, maxSignals: 7, executionTF: 'M1', type: 'Volatility' },
  
  // Step Index
  'stpRNG': { name: 'Step Index', symbol: 'stpRNG', pip: 0.01, maxSignals: 7, executionTF: 'M1', type: 'Step' },
  
  // Boom - Corregidos símbolos
  'BOOM300N': { name: 'Boom 300', symbol: 'BOOM300N', pip: 0.01, maxSignals: 7, executionTF: 'M5', type: 'Boom' },
  'BOOM500': { name: 'Boom 500', symbol: 'BOOM500', pip: 0.01, maxSignals: 7, executionTF: 'M5', type: 'Boom' },
  'BOOM1000': { name: 'Boom 1000', symbol: 'BOOM1000', pip: 0.01, maxSignals: 7, executionTF: 'M5', type: 'Boom' },
  
  // Crash - Corregidos símbolos
  'CRASH300N': { name: 'Crash 300', symbol: 'CRASH300N', pip: 0.01, maxSignals: 7, executionTF: 'M5', type: 'Crash' },
  'CRASH500': { name: 'Crash 500', symbol: 'CRASH500', pip: 0.01, maxSignals: 7, executionTF: 'M5', type: 'Crash' },
  'CRASH1000': { name: 'Crash 1000', symbol: 'CRASH1000', pip: 0.01, maxSignals: 7, executionTF: 'M5', type: 'Crash' },
};

const TIMEFRAMES = { M1: 60, M5: 300, M15: 900, H1: 3600 };

// =============================================
// SMC INSTITUTIONAL STRATEGY (TU JSON)
// =============================================

const SMC_STRATEGY_CONFIG = {
  system_name: "SMC_Institutional_Core_v1",
  methodology: "Smart Money Concepts (SMC)",
  
  // Timeframes
  HTF: "M15",
  refinement_TF: ["M5", "M1"],
  execution_TF: {
    Boom: "M5",
    Crash: "M5",
    Step: "M1",
    Volatility: "M1"
  },
  
  // Reglas obligatorias
  hard_rules: {
    mandatory_choch_m15: true,
    fibonacci_zone: { from: 70.6, to: 92.6 },
    mandatory_order_block: true
  },
  
  // Order Blocks
  order_block_types: {
    decisional: { priority: 2, fib_zone: "70.6-78.6", score: "A/B" },
    original: { priority: 1, fib_zone: "78.6-92.6", score: "A+" },
    extended: { priority: 3, fib_zone: "70.6-92.6", score: "B" }
  },
  
  // Sistema de puntuación
  scoring: {
    HTF_Context: 20,
    CHOCH_Displacement: 20,
    Fibonacci_Zone: 20,
    Order_Block_Type: 20,
    Entry_Refinement: 20
  },
  
  // Clasificación
  classification: {
    "A+": { min: 85, max: 100, automate: true },
    "A": { min: 70, max: 84, automate: false },
    "B": { min: 55, max: 69, automate: false }
  }
};

// =============================================
// ESTADO GLOBAL
// =============================================

let derivWs = null;
let isDerivConnected = false;
const candleData = new Map();
const tickData = new Map();
const dailySignals = new Map();
const activeSignals = new Map();
const signalHistory = [];
const marketAnalysis = new Map();

// Reset diario
const resetDailySignals = () => {
  dailySignals.clear();
  console.log('🔄 Señales diarias reseteadas');
};

const scheduleReset = () => {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  setTimeout(() => { resetDailySignals(); scheduleReset(); }, tomorrow - now);
};
scheduleReset();

// =============================================
// ANALIZADOR SMC INSTITUCIONAL
// =============================================

const SMCAnalyzer = {
  // Encontrar Swings
  findSwings(candles, length = 5) {
    const highs = [], lows = [];
    for (let i = length; i < candles.length - length; i++) {
      let isHigh = true, isLow = true;
      for (let j = 1; j <= length; j++) {
        if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isHigh = false;
        if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isLow = false;
      }
      if (isHigh) highs.push({ index: i, price: candles[i].high, time: candles[i].time, type: 'HIGH' });
      if (isLow) lows.push({ index: i, price: candles[i].low, time: candles[i].time, type: 'LOW' });
    }
    return { highs, lows };
  },

  // Detectar estructura HH/HL/LH/LL
  detectStructure(candles) {
    if (candles.length < 30) return null;
    
    const { highs, lows } = this.findSwings(candles);
    if (highs.length < 2 || lows.length < 2) return null;

    const lastHighs = highs.slice(-3);
    const lastLows = lows.slice(-3);
    
    let trend = 'RANGING';
    let structure = [];

    if (lastHighs.length >= 2 && lastLows.length >= 2) {
      const hh = lastHighs[lastHighs.length - 1].price > lastHighs[lastHighs.length - 2].price;
      const hl = lastLows[lastLows.length - 1].price > lastLows[lastLows.length - 2].price;
      const lh = lastHighs[lastHighs.length - 1].price < lastHighs[lastHighs.length - 2].price;
      const ll = lastLows[lastLows.length - 1].price < lastLows[lastLows.length - 2].price;

      if (hh && hl) {
        trend = 'BULLISH';
        structure = ['HH', 'HL'];
      } else if (lh && ll) {
        trend = 'BEARISH';
        structure = ['LH', 'LL'];
      }
    }

    return { trend, structure, highs, lows, lastHigh: highs[highs.length - 1], lastLow: lows[lows.length - 1] };
  },

  // DETECTAR CHoCH (Change of Character) - OBLIGATORIO EN M15
  detectCHoCH(candles, structure) {
    if (!structure || candles.length < 10) return null;
    
    const recent = candles.slice(-20);
    let choch = null;

    for (let i = 5; i < recent.length; i++) {
      const current = recent[i];
      const prev = recent[i - 1];
      
      // CHoCH Alcista: Rompe último Lower High en tendencia bajista
      if (structure.trend === 'BEARISH' && structure.lastHigh) {
        if (prev.close < structure.lastHigh.price && current.close > structure.lastHigh.price) {
          choch = {
            type: 'CHoCH',
            direction: 'BULLISH',
            breakLevel: structure.lastHigh.price,
            breakTime: current.time,
            index: i,
            displacement: this.measureDisplacement(candles, i)
          };
        }
      }
      
      // CHoCH Bajista: Rompe último Higher Low en tendencia alcista
      if (structure.trend === 'BULLISH' && structure.lastLow) {
        if (prev.close > structure.lastLow.price && current.close < structure.lastLow.price) {
          choch = {
            type: 'CHoCH',
            direction: 'BEARISH',
            breakLevel: structure.lastLow.price,
            breakTime: current.time,
            index: i,
            displacement: this.measureDisplacement(candles, i)
          };
        }
      }
    }

    return choch;
  },

  // Detectar BOS (Break of Structure)
  detectBOS(candles, structure) {
    if (!structure || candles.length < 10) return null;
    
    const current = candles[candles.length - 1];
    
    // BOS Alcista: Rompe último High en tendencia alcista
    if (structure.trend === 'BULLISH' && structure.lastHigh) {
      if (current.close > structure.lastHigh.price) {
        return { type: 'BOS', direction: 'BULLISH', breakLevel: structure.lastHigh.price };
      }
    }
    
    // BOS Bajista: Rompe último Low en tendencia bajista
    if (structure.trend === 'BEARISH' && structure.lastLow) {
      if (current.close < structure.lastLow.price) {
        return { type: 'BOS', direction: 'BEARISH', breakLevel: structure.lastLow.price };
      }
    }

    return null;
  },

  // Medir desplazamiento (fuerza del movimiento)
  measureDisplacement(candles, breakIndex) {
    const afterBreak = candles.slice(breakIndex, breakIndex + 5);
    if (afterBreak.length < 3) return { strong: false, pips: 0 };
    
    const move = Math.abs(afterBreak[afterBreak.length - 1].close - afterBreak[0].open);
    const avgRange = afterBreak.reduce((sum, c) => sum + (c.high - c.low), 0) / afterBreak.length;
    
    return {
      strong: move > avgRange * 2,
      pips: move,
      ratio: move / avgRange
    };
  },

  // CALCULAR FIBONACCI (70.6% - 92.6%)
  calculateFibonacci(impulseHigh, impulseLow, direction) {
    const range = impulseHigh - impulseLow;
    
    if (direction === 'BULLISH') {
      return {
        fib_0: impulseHigh,
        fib_50: impulseHigh - (range * 0.5),
        fib_618: impulseHigh - (range * 0.618),
        fib_706: impulseHigh - (range * 0.706),  // Inicio zona óptima
        fib_786: impulseHigh - (range * 0.786),
        fib_886: impulseHigh - (range * 0.886),
        fib_926: impulseHigh - (range * 0.926),  // Fin zona óptima
        fib_100: impulseLow,
        optimalZone: {
          start: impulseHigh - (range * 0.706),
          end: impulseHigh - (range * 0.926),
          mid: impulseHigh - (range * 0.786)
        }
      };
    } else {
      return {
        fib_0: impulseLow,
        fib_50: impulseLow + (range * 0.5),
        fib_618: impulseLow + (range * 0.618),
        fib_706: impulseLow + (range * 0.706),
        fib_786: impulseLow + (range * 0.786),
        fib_886: impulseLow + (range * 0.886),
        fib_926: impulseLow + (range * 0.926),
        fib_100: impulseHigh,
        optimalZone: {
          start: impulseLow + (range * 0.706),
          end: impulseLow + (range * 0.926),
          mid: impulseLow + (range * 0.786)
        }
      };
    }
  },

  // ENCONTRAR ORDER BLOCKS
  findOrderBlocks(candles, choch) {
    if (!choch || candles.length < 30) return { decisional: null, original: null };
    
    const direction = choch.direction;
    const breakIndex = choch.index || candles.length - 10;
    let decisional = null, original = null;

    // Buscar hacia atrás desde el CHoCH
    for (let i = breakIndex - 1; i >= Math.max(0, breakIndex - 30); i--) {
      const c = candles[i];
      const isBullishCandle = c.close > c.open;
      const isBearishCandle = c.close < c.open;

      if (direction === 'BULLISH' && isBearishCandle) {
        // OB de demanda: última vela bajista antes del impulso alcista
        if (!decisional) {
          decisional = {
            type: 'DECISIONAL',
            obType: 'DEMAND',
            high: c.high,
            low: c.low,
            mid: (c.high + c.low) / 2,
            index: i,
            time: c.time
          };
        } else if (!original) {
          original = {
            type: 'ORIGINAL',
            obType: 'DEMAND',
            high: c.high,
            low: c.low,
            mid: (c.high + c.low) / 2,
            index: i,
            time: c.time
          };
          break;
        }
      }

      if (direction === 'BEARISH' && isBullishCandle) {
        // OB de oferta: última vela alcista antes del impulso bajista
        if (!decisional) {
          decisional = {
            type: 'DECISIONAL',
            obType: 'SUPPLY',
            high: c.high,
            low: c.low,
            mid: (c.high + c.low) / 2,
            index: i,
            time: c.time
          };
        } else if (!original) {
          original = {
            type: 'ORIGINAL',
            obType: 'SUPPLY',
            high: c.high,
            low: c.low,
            mid: (c.high + c.low) / 2,
            index: i,
            time: c.time
          };
          break;
        }
      }
    }

    return { decisional, original };
  },

  // VERIFICAR SI PRECIO ESTÁ EN ZONA FIBONACCI
  isPriceInFibZone(price, fibonacci, direction) {
    const zone = fibonacci.optimalZone;
    if (direction === 'BULLISH') {
      return price <= zone.start && price >= zone.end;
    } else {
      return price >= zone.start && price <= zone.end;
    }
  },

  // CALCULAR SCORE (0-100)
  calculateScore(analysis) {
    let score = 0;
    const details = {};

    // 1. HTF Context (20 pts)
    if (analysis.m15Structure?.trend && analysis.m15Structure.trend !== 'RANGING') {
      score += 20;
      details.htf_context = 20;
    } else {
      details.htf_context = 0;
    }

    // 2. CHoCH + Displacement (20 pts)
    if (analysis.choch) {
      score += 15;
      if (analysis.choch.displacement?.strong) score += 5;
      details.choch_displacement = analysis.choch.displacement?.strong ? 20 : 15;
    } else {
      details.choch_displacement = 0;
    }

    // 3. Fibonacci Zone (20 pts)
    if (analysis.inFibZone) {
      score += 20;
      details.fibonacci_zone = 20;
    } else if (analysis.nearFibZone) {
      score += 10;
      details.fibonacci_zone = 10;
    } else {
      details.fibonacci_zone = 0;
    }

    // 4. Order Block Type (20 pts)
    if (analysis.orderBlocks?.original) {
      score += 20;
      details.order_block = 20;
    } else if (analysis.orderBlocks?.decisional) {
      score += 15;
      details.order_block = 15;
    } else {
      details.order_block = 0;
    }

    // 5. Entry Refinement (20 pts)
    if (analysis.entryConfirmation) {
      score += 20;
      details.entry_refinement = 20;
    } else if (analysis.pendingConfirmation) {
      score += 10;
      details.entry_refinement = 10;
    } else {
      details.entry_refinement = 0;
    }

    // Clasificación
    let classification = 'C';
    if (score >= 85) classification = 'A+';
    else if (score >= 70) classification = 'A';
    else if (score >= 55) classification = 'B';

    return { score, classification, details, automate: score >= 85 };
  },

  // ANÁLISIS COMPLETO MULTI-TIMEFRAME
  analyzeMultiTF(symbol, indexConfig) {
    const m15 = candleData.get(`${symbol}_900`) || [];
    const m5 = candleData.get(`${symbol}_300`) || [];
    const m1 = candleData.get(`${symbol}_60`) || [];
    
    if (m15.length < 50) return { error: 'Insuficientes datos M15', dataCount: m15.length };

    // 1. Estructura M15 (HTF)
    const m15Structure = this.detectStructure(m15);
    
    // 2. CHoCH en M15 (OBLIGATORIO)
    const choch = this.detectCHoCH(m15, m15Structure);
    
    // 3. BOS
    const bos = this.detectBOS(m15, m15Structure);
    
    // Si no hay CHoCH, no hay señal válida
    if (!choch) {
      return {
        symbol,
        hasSignal: false,
        reason: 'Sin CHoCH confirmado en M15',
        m15Structure,
        currentPrice: m15[m15.length - 1]?.close,
        candles: { m15: m15.slice(-100), m5: m5.slice(-100), m1: m1.slice(-100) }
      };
    }

    // 4. Calcular Fibonacci desde el impulso
    let fibonacci = null;
    if (choch && m15Structure) {
      const impulseHigh = m15Structure.lastHigh?.price || Math.max(...m15.slice(-30).map(c => c.high));
      const impulseLow = m15Structure.lastLow?.price || Math.min(...m15.slice(-30).map(c => c.low));
      fibonacci = this.calculateFibonacci(impulseHigh, impulseLow, choch.direction);
    }

    // 5. Order Blocks
    const orderBlocks = this.findOrderBlocks(m15, choch);

    // 6. Precio actual y verificar zona
    const currentPrice = m15[m15.length - 1]?.close;
    const inFibZone = fibonacci ? this.isPriceInFibZone(currentPrice, fibonacci, choch.direction) : false;

    // 7. Refinamiento de entrada según índice
    const executionTF = indexConfig.executionTF;
    let entryConfirmation = false;
    let microChoch = null;

    if (executionTF === 'M1' && m1.length >= 30) {
      const m1Structure = this.detectStructure(m1);
      microChoch = this.detectCHoCH(m1, m1Structure);
      entryConfirmation = microChoch && microChoch.direction === choch.direction;
    } else if (executionTF === 'M5' && m5.length >= 30) {
      const m5Structure = this.detectStructure(m5);
      const m5BOS = this.detectBOS(m5, m5Structure);
      entryConfirmation = m5BOS && m5BOS.direction === choch.direction;
    }

    // 8. Calcular niveles de entrada
    let entry = null, stopLoss = null, takeProfit = null;
    
    if (choch.direction === 'BULLISH') {
      // Entry en OB o Fib zone
      if (orderBlocks.decisional) {
        entry = orderBlocks.decisional.high;
        stopLoss = orderBlocks.original?.low || orderBlocks.decisional.low - (fibonacci?.optimalZone?.end - fibonacci?.optimalZone?.start) * 0.5;
      } else if (fibonacci) {
        entry = fibonacci.fib_786;
        stopLoss = fibonacci.fib_100;
      }
      takeProfit = m15Structure?.lastHigh?.price || (entry ? entry + (entry - stopLoss) * 3 : null);
    } else {
      if (orderBlocks.decisional) {
        entry = orderBlocks.decisional.low;
        stopLoss = orderBlocks.original?.high || orderBlocks.decisional.high + (fibonacci?.optimalZone?.end - fibonacci?.optimalZone?.start) * 0.5;
      } else if (fibonacci) {
        entry = fibonacci.fib_786;
        stopLoss = fibonacci.fib_100;
      }
      takeProfit = m15Structure?.lastLow?.price || (entry ? entry - (stopLoss - entry) * 3 : null);
    }

    // 9. Score
    const analysisForScore = {
      m15Structure,
      choch,
      inFibZone,
      nearFibZone: !inFibZone && fibonacci && Math.abs(currentPrice - fibonacci.optimalZone.mid) < (fibonacci.optimalZone.start - fibonacci.optimalZone.end) * 1.5,
      orderBlocks,
      entryConfirmation,
      pendingConfirmation: !entryConfirmation && inFibZone
    };
    const scoring = this.calculateScore(analysisForScore);

    return {
      symbol,
      symbolName: indexConfig.name,
      indexType: indexConfig.type,
      executionTF,
      currentPrice,
      
      // Estructura
      m15Structure,
      choch,
      bos,
      
      // Fibonacci
      fibonacci,
      inFibZone,
      
      // Order Blocks
      orderBlocks,
      
      // Entry
      entryConfirmation,
      microChoch,
      
      // Niveles
      levels: entry ? {
        entry: entry.toFixed(5),
        stopLoss: stopLoss.toFixed(5),
        takeProfit: takeProfit.toFixed(5),
        riskReward: ((Math.abs(takeProfit - entry) / Math.abs(entry - stopLoss))).toFixed(1) + ':1'
      } : null,
      
      // Score
      scoring,
      
      // Señal final
      hasSignal: scoring.score >= 70 && inFibZone && (orderBlocks.decisional || orderBlocks.original),
      direction: choch?.direction || null,
      
      // Razón
      reason: this.generateReason(scoring, choch, inFibZone, orderBlocks),
      
      // Datos para gráfico
      candles: {
        m15: m15.slice(-100),
        m5: m5.slice(-100),
        m1: m1.slice(-100)
      },
      
      // Marcadores para dibujar
      chartMarkers: {
        choch: choch ? { price: choch.breakLevel, time: choch.breakTime, direction: choch.direction } : null,
        bos: bos ? { price: bos.breakLevel, direction: bos.direction } : null,
        fibonacci: fibonacci,
        orderBlocks: orderBlocks,
        entry: entry,
        stopLoss: stopLoss,
        takeProfit: takeProfit
      }
    };
  },

  generateReason(scoring, choch, inFibZone, orderBlocks) {
    if (!choch) return 'Esperando CHoCH en M15';
    if (!inFibZone) return 'Precio fuera de zona Fibonacci (70.6-92.6%)';
    if (!orderBlocks.decisional && !orderBlocks.original) return 'Sin Order Block válido';
    if (scoring.score < 55) return `Score bajo: ${scoring.score}/100`;
    if (scoring.score < 70) return `Setup B (${scoring.score}/100) - Requiere confirmación manual`;
    if (scoring.score < 85) return `Setup A (${scoring.score}/100) - Buena oportunidad`;
    return `Setup A+ (${scoring.score}/100) - Alta probabilidad`;
  }
};

// =============================================
// WHATSAPP NOTIFICATION
// =============================================

async function sendWhatsAppNotification(signal) {
  const phone = WHATSAPP_PHONE.replace('+', '');
  
  const message = `🎯 *SEÑAL ${signal.direction}*
📊 ${signal.symbolName}
⏰ ${new Date().toLocaleTimeString()}

📍 Entry: ${signal.levels?.entry}
🛑 SL: ${signal.levels?.stopLoss}
🎯 TP: ${signal.levels?.takeProfit}
📈 R:R: ${signal.levels?.riskReward}

🏆 Score: ${signal.scoring?.score}/100 (${signal.scoring?.classification})

💡 ${signal.reason}`;

  // Método 1: CallMeBot (gratis)
  if (CALLMEBOT_API_KEY) {
    try {
      const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=${CALLMEBOT_API_KEY}`;
      const response = await fetch(url);
      console.log('📱 WhatsApp enviado via CallMeBot');
      return true;
    } catch (e) {
      console.error('Error CallMeBot:', e);
    }
  }

  // Método 2: Log para configurar después
  console.log(`\n📱 SEÑAL PARA WHATSAPP (${WHATSAPP_PHONE}):\n${message}\n`);
  
  // Guardar para enviar manualmente o via otro servicio
  return { pending: true, phone: WHATSAPP_PHONE, message };
}

// =============================================
// DERIV WEBSOCKET
// =============================================

function connectDeriv() {
  console.log('🔌 Conectando a Deriv...');
  
  derivWs = new WebSocket(`${DERIV_WS_URL}?app_id=${DERIV_APP_ID}`);

  derivWs.on('open', () => {
    console.log('✅ Conectado a Deriv');
    isDerivConnected = true;

    if (DERIV_API_TOKEN) {
      derivWs.send(JSON.stringify({ authorize: DERIV_API_TOKEN }));
    }

    // Suscribirse solo a índices que funcionan
    const activeSymbols = Object.keys(SYNTHETIC_INDICES);
    
    activeSymbols.forEach(symbol => {
      // Ticks
      derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      
      // Velas M1, M5, M15
      [60, 300, 900].forEach(granularity => {
        derivWs.send(JSON.stringify({
          ticks_history: symbol,
          adjust_start_time: 1,
          count: 200,
          end: 'latest',
          granularity,
          style: 'candles',
          subscribe: 1,
        }));
      });
    });
  });

  derivWs.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.error) {
        console.error('Deriv error:', msg.error.message);
        return;
      }

      // Tick
      if (msg.tick) {
        const { symbol, quote, epoch } = msg.tick;
        if (!tickData.has(symbol)) tickData.set(symbol, []);
        const ticks = tickData.get(symbol);
        ticks.push({ time: epoch, price: parseFloat(quote) });
        if (ticks.length > 500) ticks.shift();
      }

      // OHLC
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
          
          // Analizar en cada nueva vela M5
          if (granularity === 300) {
            await analyzeAndGenerateSignal(symbol);
          }
        }
        
        if (candles.length > 500) candles.shift();
      }

      // Historia
      if (msg.candles) {
        const symbol = msg.echo_req?.ticks_history;
        const granularity = msg.echo_req?.granularity;
        const key = `${symbol}_${granularity}`;
        
        const formatted = msg.candles.map(c => ({
          time: c.epoch,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close)
        }));
        
        candleData.set(key, formatted);
        console.log(`📊 ${symbol} ${granularity}s: ${formatted.length} velas`);
      }

    } catch (e) {
      console.error('Error procesando:', e);
    }
  });

  derivWs.on('close', () => {
    console.log('❌ Deriv desconectado, reconectando...');
    isDerivConnected = false;
    setTimeout(connectDeriv, 5000);
  });

  derivWs.on('error', (e) => console.error('Deriv error:', e.message));
}

// Analizar y generar señal
async function analyzeAndGenerateSignal(symbol) {
  try {
    const indexConfig = SYNTHETIC_INDICES[symbol];
    if (!indexConfig) return;

    const todayCount = dailySignals.get(symbol) || 0;
    if (todayCount >= 7) return;

    const analysis = SMCAnalyzer.analyzeMultiTF(symbol, indexConfig);
    marketAnalysis.set(symbol, { ...analysis, timestamp: new Date().toISOString() });

    if (analysis.hasSignal && analysis.scoring?.automate) {
      const signalId = `${symbol}_${Date.now()}`;
      const signal = {
        id: signalId,
        ...analysis,
        dailyCount: todayCount + 1,
        createdAt: new Date().toISOString()
      };

      activeSignals.set(signalId, signal);
      signalHistory.unshift(signal);
      if (signalHistory.length > 100) signalHistory.pop();
      
      dailySignals.set(symbol, todayCount + 1);

      console.log(`🎯 SEÑAL A+ #${todayCount + 1}/7: ${analysis.direction} ${symbol}`);
      
      // Enviar WhatsApp
      await sendWhatsAppNotification(signal);
    }
  } catch (e) {
    console.error('Error análisis:', e);
  }
}

// Iniciar conexión
connectDeriv();

// =============================================
// MIDDLEWARE
// =============================================

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const authenticate = async (req, res, next) => {
  req.user = { id: 'demo-user' };
  next();
};

// =============================================
// RUTAS
// =============================================

app.get('/', (req, res) => res.json({ 
  status: 'ok', 
  version: '6.0 - SMC Institutional',
  deriv: isDerivConnected,
  strategy: SMC_STRATEGY_CONFIG.system_name
}));

app.get('/health', (req, res) => res.json({ status: 'healthy', deriv: isDerivConnected }));

app.get('/api/deriv/status', (req, res) => {
  res.json({
    connected: isDerivConnected,
    appId: DERIV_APP_ID,
    activeSymbols: Object.keys(SYNTHETIC_INDICES)
  });
});

app.get('/api/deriv/symbols', (req, res) => res.json(SYNTHETIC_INDICES));

app.get('/api/deriv/price/:symbol', (req, res) => {
  const ticks = tickData.get(req.params.symbol) || [];
  const last = ticks[ticks.length - 1];
  res.json({ symbol: req.params.symbol, price: last?.price, time: last?.time });
});

app.get('/api/deriv/candles/:symbol/:timeframe', (req, res) => {
  const { symbol, timeframe } = req.params;
  const tf = TIMEFRAMES[timeframe] || parseInt(timeframe);
  const candles = candleData.get(`${symbol}_${tf}`) || [];
  res.json({ symbol, timeframe: tf, count: candles.length, candles });
});

// ANÁLISIS EN VIVO
app.get('/api/analyze/live/:symbol', authenticate, (req, res) => {
  const { symbol } = req.params;
  const indexConfig = SYNTHETIC_INDICES[symbol];
  
  if (!indexConfig) {
    return res.status(400).json({ error: 'Símbolo no soportado' });
  }

  const analysis = SMCAnalyzer.analyzeMultiTF(symbol, indexConfig);
  res.json(analysis);
});

// SEÑALES
app.get('/api/signals/active', authenticate, (req, res) => {
  const signals = Array.from(activeSignals.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20);
  res.json(signals);
});

app.get('/api/signals/history', authenticate, (req, res) => {
  res.json(signalHistory.slice(0, 50));
});

app.get('/api/signals/:id', authenticate, (req, res) => {
  const signal = activeSignals.get(req.params.id) || signalHistory.find(s => s.id === req.params.id);
  if (signal) {
    res.json(signal);
  } else {
    res.status(404).json({ error: 'Señal no encontrada' });
  }
});

app.get('/api/signals/daily-count', (req, res) => {
  const counts = {};
  Object.keys(SYNTHETIC_INDICES).forEach(symbol => {
    counts[symbol] = dailySignals.get(symbol) || 0;
  });
  res.json(counts);
});

// ESTRATEGIA CONFIG
app.get('/api/strategy', (req, res) => {
  res.json(SMC_STRATEGY_CONFIG);
});

// TEST WHATSAPP
app.post('/api/test-whatsapp', async (req, res) => {
  const testSignal = {
    symbolName: 'Test Signal',
    direction: 'COMPRA',
    levels: { entry: '1234.56', stopLoss: '1230.00', takeProfit: '1245.00', riskReward: '2.3:1' },
    scoring: { score: 90, classification: 'A+' },
    reason: 'Test de notificación WhatsApp'
  };
  
  const result = await sendWhatsAppNotification(testSignal);
  res.json({ success: true, result });
});

// TRADES
app.get('/api/trades', authenticate, async (req, res) => {
  if (!supabase) return res.json([]);
  const { data } = await supabase.from('trades').select('*').order('created_at', { ascending: false });
  res.json(data || []);
});

app.post('/api/trades', authenticate, async (req, res) => {
  const trade = { id: uuidv4(), ...req.body, created_at: new Date().toISOString() };
  if (supabase) {
    const { data } = await supabase.from('trades').insert(trade).select().single();
    return res.json(data);
  }
  res.json(trade);
});

// =============================================
// INICIAR
// =============================================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║     TRADING MASTER PRO - API v6.0                         ║
║     SMC INSTITUTIONAL STRATEGY                            ║
╠═══════════════════════════════════════════════════════════╣
║  🚀 Puerto: ${PORT}                                          ║
║  📈 Estrategia: CHoCH M15 → Fib 70.6-92.6% → OB           ║
║  📱 WhatsApp: ${WHATSAPP_PHONE}                       ║
║  🎯 Max Señales: 7/día por índice                         ║
╠═══════════════════════════════════════════════════════════╣
║  Índices activos:                                         ║
║  • Volatility 75, 100                                     ║
║  • Step Index                                             ║
║  • Boom 300, 500, 1000                                    ║
║  • Crash 300, 500, 1000                                   ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
