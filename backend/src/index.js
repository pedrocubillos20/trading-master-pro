// =============================================
// TRADING MASTER PRO - BACKEND v6.1
// SMC Institutional + BOS/CHoCH + Narración Viva
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
console.log('\n🔧 TRADING MASTER PRO v6.1');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅' : '❌');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅' : '❌');
console.log('DERIV_APP_ID:', process.env.DERIV_APP_ID ? '✅' : '❌');
console.log('CALLMEBOT_API_KEY:', process.env.CALLMEBOT_API_KEY ? '✅' : '❌');

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
// ÍNDICES SOPORTADOS
// =============================================
const SYNTHETIC_INDICES = {
  'R_75': { name: 'Volatility 75', symbol: 'R_75', pip: 0.0001, executionTF: 'M1', type: 'Volatility' },
  'R_100': { name: 'Volatility 100', symbol: 'R_100', pip: 0.01, executionTF: 'M1', type: 'Volatility' },
  'stpRNG': { name: 'Step Index', symbol: 'stpRNG', pip: 0.01, executionTF: 'M1', type: 'Step' },
  'BOOM300N': { name: 'Boom 300', symbol: 'BOOM300N', pip: 0.01, executionTF: 'M5', type: 'Boom' },
  'BOOM500': { name: 'Boom 500', symbol: 'BOOM500', pip: 0.01, executionTF: 'M5', type: 'Boom' },
  'BOOM1000': { name: 'Boom 1000', symbol: 'BOOM1000', pip: 0.01, executionTF: 'M5', type: 'Boom' },
  'CRASH300N': { name: 'Crash 300', symbol: 'CRASH300N', pip: 0.01, executionTF: 'M5', type: 'Crash' },
  'CRASH500': { name: 'Crash 500', symbol: 'CRASH500', pip: 0.01, executionTF: 'M5', type: 'Crash' },
  'CRASH1000': { name: 'Crash 1000', symbol: 'CRASH1000', pip: 0.01, executionTF: 'M5', type: 'Crash' },
};

const TIMEFRAMES = { M1: 60, M5: 300, M15: 900, H1: 3600 };

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
const marketNarrations = new Map();

// Reset diario
const resetDaily = () => { dailySignals.clear(); console.log('🔄 Reset diario'); };
const scheduleReset = () => {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  setTimeout(() => { resetDaily(); scheduleReset(); }, tomorrow - now);
};
scheduleReset();

// =============================================
// ANALIZADOR SMC v2 (BOS + CHoCH)
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
      if (isHigh) highs.push({ index: i, price: candles[i].high, time: candles[i].time });
      if (isLow) lows.push({ index: i, price: candles[i].low, time: candles[i].time });
    }
    return { highs, lows };
  },

  // Detectar estructura
  detectStructure(candles) {
    if (candles.length < 30) return null;
    const { highs, lows } = this.findSwings(candles);
    if (highs.length < 2 || lows.length < 2) return null;

    const lastHighs = highs.slice(-3);
    const lastLows = lows.slice(-3);
    let trend = 'RANGING', structure = [];

    if (lastHighs.length >= 2 && lastLows.length >= 2) {
      const hh = lastHighs[lastHighs.length - 1].price > lastHighs[lastHighs.length - 2].price;
      const hl = lastLows[lastLows.length - 1].price > lastLows[lastLows.length - 2].price;
      const lh = lastHighs[lastHighs.length - 1].price < lastHighs[lastHighs.length - 2].price;
      const ll = lastLows[lastLows.length - 1].price < lastLows[lastLows.length - 2].price;

      if (hh && hl) { trend = 'BULLISH'; structure = ['HH', 'HL']; }
      else if (lh && ll) { trend = 'BEARISH'; structure = ['LH', 'LL']; }
    }

    return { trend, structure, highs, lows, lastHigh: highs[highs.length - 1], lastLow: lows[lows.length - 1] };
  },

  // DETECTAR BOS (Break of Structure) - CONTINUACIÓN DE TENDENCIA
  detectBOS(candles, structure) {
    if (!structure || candles.length < 10) return null;
    
    const recent = candles.slice(-15);
    
    for (let i = 3; i < recent.length; i++) {
      const current = recent[i];
      const prev = recent[i - 1];
      
      // BOS Alcista: En tendencia alcista, rompe último HH
      if (structure.trend === 'BULLISH' && structure.lastHigh) {
        if (prev.high < structure.lastHigh.price && current.close > structure.lastHigh.price) {
          return {
            type: 'BOS',
            direction: 'BULLISH',
            breakLevel: structure.lastHigh.price,
            breakTime: current.time,
            breakIndex: candles.length - (recent.length - i),
            description: 'Rompimiento de estructura alcista - Continuación de tendencia'
          };
        }
      }
      
      // BOS Bajista: En tendencia bajista, rompe último LL
      if (structure.trend === 'BEARISH' && structure.lastLow) {
        if (prev.low > structure.lastLow.price && current.close < structure.lastLow.price) {
          return {
            type: 'BOS',
            direction: 'BEARISH',
            breakLevel: structure.lastLow.price,
            breakTime: current.time,
            breakIndex: candles.length - (recent.length - i),
            description: 'Rompimiento de estructura bajista - Continuación de tendencia'
          };
        }
      }
    }
    return null;
  },

  // DETECTAR CHoCH (Change of Character) - CAMBIO DE TENDENCIA
  detectCHoCH(candles, structure) {
    if (!structure || candles.length < 10) return null;
    
    const recent = candles.slice(-15);
    
    for (let i = 3; i < recent.length; i++) {
      const current = recent[i];
      const prev = recent[i - 1];
      
      // CHoCH Alcista: En tendencia BAJISTA, rompe último LH
      if (structure.trend === 'BEARISH' && structure.lastHigh) {
        if (prev.high < structure.lastHigh.price && current.close > structure.lastHigh.price) {
          return {
            type: 'CHoCH',
            direction: 'BULLISH',
            breakLevel: structure.lastHigh.price,
            breakTime: current.time,
            breakIndex: candles.length - (recent.length - i),
            description: 'Cambio de carácter - Posible reversión a ALCISTA'
          };
        }
      }
      
      // CHoCH Bajista: En tendencia ALCISTA, rompe último HL
      if (structure.trend === 'BULLISH' && structure.lastLow) {
        if (prev.low > structure.lastLow.price && current.close < structure.lastLow.price) {
          return {
            type: 'CHoCH',
            direction: 'BEARISH',
            breakLevel: structure.lastLow.price,
            breakTime: current.time,
            breakIndex: candles.length - (recent.length - i),
            description: 'Cambio de carácter - Posible reversión a BAJISTA'
          };
        }
      }
    }
    return null;
  },

  // ENCONTRAR ORDER BLOCKS después de BOS o CHoCH
  findOrderBlocks(candles, breakSignal) {
    if (!breakSignal || candles.length < 30) return { decisional: null, original: null };
    
    const direction = breakSignal.direction;
    const breakIndex = breakSignal.breakIndex || candles.length - 10;
    let decisional = null, original = null;

    // Buscar OBs antes del rompimiento
    for (let i = breakIndex - 1; i >= Math.max(0, breakIndex - 25); i--) {
      const c = candles[i];
      const bodySize = Math.abs(c.close - c.open);
      const range = c.high - c.low;
      const isSignificant = bodySize > range * 0.5; // Vela con cuerpo significativo

      if (direction === 'BULLISH') {
        // OB de Demanda: Última vela bajista antes del impulso alcista
        if (c.close < c.open && isSignificant) {
          if (!decisional) {
            decisional = {
              type: 'DECISIONAL',
              obType: 'DEMAND',
              high: c.high,
              low: c.low,
              mid: (c.high + c.low) / 2,
              index: i,
              time: c.time,
              description: 'Order Block Decisional - Última reacción antes del impulso'
            };
          } else if (!original) {
            original = {
              type: 'ORIGINAL',
              obType: 'DEMAND',
              high: c.high,
              low: c.low,
              mid: (c.high + c.low) / 2,
              index: i,
              time: c.time,
              description: 'Order Block Original - Origen del movimiento'
            };
            break;
          }
        }
      }

      if (direction === 'BEARISH') {
        // OB de Oferta: Última vela alcista antes del impulso bajista
        if (c.close > c.open && isSignificant) {
          if (!decisional) {
            decisional = {
              type: 'DECISIONAL',
              obType: 'SUPPLY',
              high: c.high,
              low: c.low,
              mid: (c.high + c.low) / 2,
              index: i,
              time: c.time,
              description: 'Order Block Decisional - Última reacción antes del impulso'
            };
          } else if (!original) {
            original = {
              type: 'ORIGINAL',
              obType: 'SUPPLY',
              high: c.high,
              low: c.low,
              mid: (c.high + c.low) / 2,
              index: i,
              time: c.time,
              description: 'Order Block Original - Origen del movimiento'
            };
            break;
          }
        }
      }
    }

    return { decisional, original };
  },

  // Calcular Fibonacci
  calculateFibonacci(candles, breakSignal, structure) {
    if (!breakSignal) return null;
    
    const direction = breakSignal.direction;
    let impulseHigh, impulseLow;

    // Encontrar el impulso
    if (direction === 'BULLISH') {
      impulseLow = structure?.lastLow?.price || Math.min(...candles.slice(-30).map(c => c.low));
      impulseHigh = Math.max(...candles.slice(-10).map(c => c.high));
    } else {
      impulseHigh = structure?.lastHigh?.price || Math.max(...candles.slice(-30).map(c => c.high));
      impulseLow = Math.min(...candles.slice(-10).map(c => c.low));
    }

    const range = impulseHigh - impulseLow;
    
    if (direction === 'BULLISH') {
      return {
        direction: 'BULLISH',
        impulseHigh,
        impulseLow,
        fib_0: impulseHigh,
        fib_50: impulseHigh - (range * 0.5),
        fib_618: impulseHigh - (range * 0.618),
        fib_706: impulseHigh - (range * 0.706),
        fib_786: impulseHigh - (range * 0.786),
        fib_926: impulseHigh - (range * 0.926),
        fib_100: impulseLow,
        optimalZone: {
          start: impulseHigh - (range * 0.706),
          end: impulseHigh - (range * 0.926)
        }
      };
    } else {
      return {
        direction: 'BEARISH',
        impulseHigh,
        impulseLow,
        fib_0: impulseLow,
        fib_50: impulseLow + (range * 0.5),
        fib_618: impulseLow + (range * 0.618),
        fib_706: impulseLow + (range * 0.706),
        fib_786: impulseLow + (range * 0.786),
        fib_926: impulseLow + (range * 0.926),
        fib_100: impulseHigh,
        optimalZone: {
          start: impulseLow + (range * 0.706),
          end: impulseLow + (range * 0.926)
        }
      };
    }
  },

  // Verificar precio en zona
  isPriceInZone(price, fibonacci, orderBlocks) {
    if (!fibonacci) return { inFibZone: false, inOBZone: false, nearZone: false };
    
    const { optimalZone } = fibonacci;
    const direction = fibonacci.direction;
    
    let inFibZone = false;
    if (direction === 'BULLISH') {
      inFibZone = price <= optimalZone.start && price >= optimalZone.end;
    } else {
      inFibZone = price >= optimalZone.start && price <= optimalZone.end;
    }

    // Verificar si está en OB
    let inOBZone = false;
    const ob = orderBlocks?.decisional || orderBlocks?.original;
    if (ob) {
      inOBZone = price <= ob.high && price >= ob.low;
    }

    // Cerca de zona (para narración)
    const zoneSize = Math.abs(optimalZone.start - optimalZone.end);
    const distanceToZone = direction === 'BULLISH' 
      ? price - optimalZone.start 
      : optimalZone.start - price;
    const nearZone = !inFibZone && distanceToZone > 0 && distanceToZone < zoneSize * 2;

    return { inFibZone, inOBZone, nearZone, distanceToZone };
  },

  // Calcular Score
  calculateScore(analysis) {
    let score = 0;
    const details = {};

    // 1. Estructura clara (20 pts)
    if (analysis.structure?.trend && analysis.structure.trend !== 'RANGING') {
      score += 20;
      details.structure = 20;
    } else {
      details.structure = 0;
    }

    // 2. BOS o CHoCH (20 pts)
    if (analysis.choch) {
      score += 20;
      details.break_signal = 20;
    } else if (analysis.bos) {
      score += 18;
      details.break_signal = 18;
    } else {
      details.break_signal = 0;
    }

    // 3. Fibonacci Zone (20 pts)
    if (analysis.zoneCheck?.inFibZone) {
      score += 20;
      details.fibonacci = 20;
    } else if (analysis.zoneCheck?.nearZone) {
      score += 10;
      details.fibonacci = 10;
    } else {
      details.fibonacci = 0;
    }

    // 4. Order Block (20 pts)
    if (analysis.orderBlocks?.original) {
      score += 20;
      details.order_block = 20;
    } else if (analysis.orderBlocks?.decisional) {
      score += 15;
      details.order_block = 15;
    } else {
      details.order_block = 0;
    }

    // 5. Confluencia OB + Fib (20 pts)
    if (analysis.zoneCheck?.inOBZone && analysis.zoneCheck?.inFibZone) {
      score += 20;
      details.confluence = 20;
    } else if (analysis.zoneCheck?.inOBZone || analysis.zoneCheck?.inFibZone) {
      score += 10;
      details.confluence = 10;
    } else {
      details.confluence = 0;
    }

    let classification = 'C';
    if (score >= 85) classification = 'A+';
    else if (score >= 70) classification = 'A';
    else if (score >= 55) classification = 'B';

    return { score, classification, details, automate: score >= 85 };
  },

  // ANÁLISIS COMPLETO
  analyzeSymbol(symbol, timeframe = 900) {
    const indexConfig = SYNTHETIC_INDICES[symbol];
    if (!indexConfig) return { error: 'Símbolo no soportado' };

    const candles = candleData.get(`${symbol}_${timeframe}`) || [];
    if (candles.length < 50) return { error: 'Datos insuficientes', count: candles.length };

    // 1. Estructura
    const structure = this.detectStructure(candles);
    
    // 2. Buscar BOS y CHoCH
    const bos = this.detectBOS(candles, structure);
    const choch = this.detectCHoCH(candles, structure);
    
    // Usar el más reciente (CHoCH tiene prioridad)
    const breakSignal = choch || bos;
    
    // 3. Order Blocks
    const orderBlocks = this.findOrderBlocks(candles, breakSignal);
    
    // 4. Fibonacci
    const fibonacci = this.calculateFibonacci(candles, breakSignal, structure);
    
    // 5. Precio actual y zonas
    const currentPrice = candles[candles.length - 1]?.close;
    const zoneCheck = this.isPriceInZone(currentPrice, fibonacci, orderBlocks);
    
    // 6. Calcular niveles
    let levels = null;
    if (breakSignal && (orderBlocks.decisional || orderBlocks.original)) {
      const ob = orderBlocks.original || orderBlocks.decisional;
      const direction = breakSignal.direction;
      
      if (direction === 'BULLISH') {
        const entry = ob.high;
        const sl = ob.low - (ob.high - ob.low) * 0.2;
        const risk = entry - sl;
        levels = {
          entry: entry.toFixed(4),
          stopLoss: sl.toFixed(4),
          takeProfit1: (entry + risk * 2).toFixed(4),
          takeProfit2: (entry + risk * 3).toFixed(4),
          riskReward: '1:2 / 1:3'
        };
      } else {
        const entry = ob.low;
        const sl = ob.high + (ob.high - ob.low) * 0.2;
        const risk = sl - entry;
        levels = {
          entry: entry.toFixed(4),
          stopLoss: sl.toFixed(4),
          takeProfit1: (entry - risk * 2).toFixed(4),
          takeProfit2: (entry - risk * 3).toFixed(4),
          riskReward: '1:2 / 1:3'
        };
      }
    }

    // 7. Score
    const analysisData = { structure, bos, choch, orderBlocks, fibonacci, zoneCheck };
    const scoring = this.calculateScore(analysisData);
    
    // 8. Determinar estado del setup
    let setupStatus = 'BUSCANDO';
    let waitingFor = [];
    
    if (!structure || structure.trend === 'RANGING') {
      setupStatus = 'SIN_ESTRUCTURA';
      waitingFor.push('Estructura clara (HH/HL o LH/LL)');
    } else if (!breakSignal) {
      setupStatus = 'ESPERANDO_BREAK';
      waitingFor.push('BOS o CHoCH para confirmar dirección');
    } else if (!orderBlocks.decisional && !orderBlocks.original) {
      setupStatus = 'ESPERANDO_OB';
      waitingFor.push('Order Block válido');
    } else if (!zoneCheck.inFibZone && !zoneCheck.inOBZone) {
      setupStatus = 'ESPERANDO_RETROCESO';
      waitingFor.push('Precio debe retroceder a zona 70.6%-92.6%');
      waitingFor.push('Precio debe llegar al Order Block');
    } else {
      setupStatus = 'ENTRADA_LISTA';
    }

    const hasSignal = setupStatus === 'ENTRADA_LISTA' && scoring.score >= 70;

    return {
      symbol,
      symbolName: indexConfig.name,
      indexType: indexConfig.type,
      timeframe,
      currentPrice,
      
      // Estructura
      structure,
      bos,
      choch,
      breakSignal,
      
      // Zonas
      orderBlocks,
      fibonacci,
      zoneCheck,
      
      // Niveles
      levels,
      
      // Score
      scoring,
      
      // Estado
      setupStatus,
      waitingFor,
      hasSignal,
      direction: breakSignal?.direction || null,
      
      // Datos para gráfico
      candles: candles.slice(-100),
      
      // Marcadores
      chartMarkers: {
        bos: bos ? { price: bos.breakLevel, direction: bos.direction, type: 'BOS' } : null,
        choch: choch ? { price: choch.breakLevel, direction: choch.direction, type: 'CHoCH' } : null,
        fibonacci,
        orderBlocks,
        levels
      }
    };
  }
};

// =============================================
// NARRACIÓN EN VIVO CON IA
// =============================================
async function generateNarration(analysis) {
  if (!openai || !analysis) return { text: 'Analizando mercado...', waiting: [] };

  const { symbol, symbolName, structure, bos, choch, orderBlocks, fibonacci, zoneCheck, currentPrice, setupStatus, waitingFor, levels } = analysis;

  const prompt = `Eres un mentor de trading SMC narrando EN VIVO para un trader.

DATOS DEL ${symbolName}:
- Precio actual: ${currentPrice}
- Tendencia M15: ${structure?.trend || 'N/A'}
- Estructura: ${structure?.structure?.join(', ') || 'N/A'}
- BOS: ${bos ? `SÍ - ${bos.direction} en ${bos.breakLevel}` : 'NO'}
- CHoCH: ${choch ? `SÍ - ${choch.direction} en ${choch.breakLevel}` : 'NO'}
- Order Block: ${orderBlocks?.decisional ? `Decisional en ${orderBlocks.decisional.high}-${orderBlocks.decisional.low}` : orderBlocks?.original ? `Original en ${orderBlocks.original.high}-${orderBlocks.original.low}` : 'No encontrado'}
- Zona Fib (70.6-92.6%): ${fibonacci ? `${fibonacci.optimalZone.start.toFixed(2)} - ${fibonacci.optimalZone.end.toFixed(2)}` : 'N/A'}
- Precio en zona: ${zoneCheck?.inFibZone ? 'SÍ' : 'NO'}
- Estado: ${setupStatus}

INSTRUCCIONES:
1. Narra como si estuvieras viendo el mercado EN VIVO con el trader
2. Explica QUÉ está pasando AHORA
3. Di QUÉ ESTAMOS ESPERANDO para entrar
4. Si hay setup listo, da los niveles de entrada
5. Sé directo, usa lenguaje de trader
6. Máximo 4 oraciones

Responde SOLO la narración, sin formato especial.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 250,
      temperature: 0.7,
    });
    
    return {
      text: response.choices[0]?.message?.content || 'Analizando...',
      waiting: waitingFor,
      status: setupStatus,
      levels
    };
  } catch (e) {
    console.error('Error narración:', e);
    return { text: 'Error generando narración', waiting: waitingFor, status: setupStatus };
  }
}

// =============================================
// WHATSAPP
// =============================================
async function sendWhatsApp(signal) {
  if (!CALLMEBOT_API_KEY) {
    console.log('📱 WhatsApp no configurado');
    return false;
  }

  const phone = WHATSAPP_PHONE.replace('+', '');
  const msg = `🎯 *SEÑAL ${signal.direction}*
📊 ${signal.symbolName}
⏰ ${new Date().toLocaleTimeString()}

📍 Entry: ${signal.levels?.entry}
🛑 SL: ${signal.levels?.stopLoss}
🎯 TP1: ${signal.levels?.takeProfit1}
🎯 TP2: ${signal.levels?.takeProfit2}

🏆 Score: ${signal.scoring?.score}/100 (${signal.scoring?.classification})
📋 Setup: ${signal.breakSignal?.type} ${signal.breakSignal?.direction}`;

  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(msg)}&apikey=${CALLMEBOT_API_KEY}`;
    await fetch(url);
    console.log('📱 WhatsApp enviado');
    return true;
  } catch (e) {
    console.error('Error WhatsApp:', e);
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
    console.log('✅ Conectado a Deriv');
    isDerivConnected = true;

    if (DERIV_API_TOKEN) {
      derivWs.send(JSON.stringify({ authorize: DERIV_API_TOKEN }));
    }

    Object.keys(SYNTHETIC_INDICES).forEach(symbol => {
      derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      [60, 300, 900].forEach(g => {
        derivWs.send(JSON.stringify({
          ticks_history: symbol, adjust_start_time: 1, count: 200,
          end: 'latest', granularity: g, style: 'candles', subscribe: 1,
        }));
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
        const ticks = tickData.get(symbol);
        ticks.push({ time: epoch, price: parseFloat(quote) });
        if (ticks.length > 500) ticks.shift();
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
          if (granularity === 300) await checkForSignal(symbol);
        }
        if (candles.length > 500) candles.shift();
      }

      if (msg.candles) {
        const symbol = msg.echo_req?.ticks_history;
        const granularity = msg.echo_req?.granularity;
        candleData.set(`${symbol}_${granularity}`, msg.candles.map(c => ({
          time: c.epoch, open: parseFloat(c.open), high: parseFloat(c.high),
          low: parseFloat(c.low), close: parseFloat(c.close)
        })));
      }
    } catch (e) {}
  });

  derivWs.on('close', () => {
    console.log('❌ Deriv desconectado');
    isDerivConnected = false;
    setTimeout(connectDeriv, 5000);
  });

  derivWs.on('error', () => {});
}

async function checkForSignal(symbol) {
  const count = dailySignals.get(symbol) || 0;
  if (count >= 7) return;

  const analysis = SMCAnalyzer.analyzeSymbol(symbol, 900);
  if (analysis.hasSignal && analysis.scoring?.automate) {
    const signalId = `${symbol}_${Date.now()}`;
    const signal = { id: signalId, ...analysis, dailyCount: count + 1, createdAt: new Date().toISOString() };
    
    activeSignals.set(signalId, signal);
    signalHistory.unshift(signal);
    if (signalHistory.length > 100) signalHistory.pop();
    dailySignals.set(symbol, count + 1);

    console.log(`🎯 SEÑAL ${analysis.breakSignal?.type} #${count + 1}/7: ${analysis.direction} ${symbol}`);
    await sendWhatsApp(signal);
  }
}

connectDeriv();

// =============================================
// MIDDLEWARE
// =============================================
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
const upload = multer({ storage: multer.memoryStorage() });

// =============================================
// RUTAS
// =============================================
app.get('/', (req, res) => res.json({ status: 'ok', version: '6.1', deriv: isDerivConnected }));
app.get('/health', (req, res) => res.json({ status: 'healthy', deriv: isDerivConnected }));

app.get('/api/deriv/status', (req, res) => res.json({ connected: isDerivConnected, symbols: Object.keys(SYNTHETIC_INDICES) }));
app.get('/api/deriv/symbols', (req, res) => res.json(SYNTHETIC_INDICES));

app.get('/api/deriv/candles/:symbol/:timeframe', (req, res) => {
  const { symbol, timeframe } = req.params;
  const tf = TIMEFRAMES[timeframe] || parseInt(timeframe) || 900;
  const candles = candleData.get(`${symbol}_${tf}`) || [];
  res.json({ symbol, timeframe: tf, count: candles.length, candles });
});

// ANÁLISIS EN VIVO
app.get('/api/analyze/live/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe = 'M15' } = req.query;
  const tf = TIMEFRAMES[timeframe] || 900;
  
  const analysis = SMCAnalyzer.analyzeSymbol(symbol, tf);
  res.json(analysis);
});

// ANÁLISIS MULTI-TIMEFRAME
app.get('/api/analyze/mtf/:symbol', async (req, res) => {
  const { symbol } = req.params;
  
  const m15 = SMCAnalyzer.analyzeSymbol(symbol, 900);
  const m5 = SMCAnalyzer.analyzeSymbol(symbol, 300);
  const m1 = SMCAnalyzer.analyzeSymbol(symbol, 60);
  
  res.json({
    symbol,
    symbolName: SYNTHETIC_INDICES[symbol]?.name,
    m15: { ...m15, candles: m15.candles?.slice(-100) },
    m5: { ...m5, candles: m5.candles?.slice(-100) },
    m1: { ...m1, candles: m1.candles?.slice(-100) }
  });
});

// NARRACIÓN EN VIVO
app.get('/api/narration/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe = 'M15' } = req.query;
  const tf = TIMEFRAMES[timeframe] || 900;
  
  const analysis = SMCAnalyzer.analyzeSymbol(symbol, tf);
  const narration = await generateNarration(analysis);
  
  res.json({
    symbol,
    symbolName: SYNTHETIC_INDICES[symbol]?.name,
    narration: narration.text,
    waiting: narration.waiting,
    status: narration.status,
    levels: analysis.levels,
    analysis: {
      trend: analysis.structure?.trend,
      bos: analysis.bos ? { type: 'BOS', direction: analysis.bos.direction } : null,
      choch: analysis.choch ? { type: 'CHoCH', direction: analysis.choch.direction } : null,
      inFibZone: analysis.zoneCheck?.inFibZone,
      hasOB: !!(analysis.orderBlocks?.decisional || analysis.orderBlocks?.original)
    }
  });
});

// SEÑALES
app.get('/api/signals/active', (req, res) => {
  res.json(Array.from(activeSignals.values()).slice(0, 20));
});

app.get('/api/signals/history', (req, res) => {
  res.json(signalHistory.slice(0, 50));
});

app.get('/api/signals/:id', (req, res) => {
  const signal = activeSignals.get(req.params.id) || signalHistory.find(s => s.id === req.params.id);
  signal ? res.json(signal) : res.status(404).json({ error: 'No encontrada' });
});

app.get('/api/signals/daily-count', (req, res) => {
  const counts = {};
  Object.keys(SYNTHETIC_INDICES).forEach(s => counts[s] = dailySignals.get(s) || 0);
  res.json(counts);
});

// TEST WHATSAPP
app.get('/api/test-whatsapp', async (req, res) => {
  const result = await sendWhatsApp({
    symbolName: 'Test',
    direction: 'COMPRA',
    levels: { entry: '1234.56', stopLoss: '1230.00', takeProfit1: '1240.00', takeProfit2: '1245.00' },
    scoring: { score: 90, classification: 'A+' },
    breakSignal: { type: 'TEST', direction: 'BULLISH' }
  });
  res.json({ success: result });
});

// TRADES
app.get('/api/trades', async (req, res) => {
  if (!supabase) return res.json([]);
  const { data } = await supabase.from('trades').select('*').order('created_at', { ascending: false });
  res.json(data || []);
});

app.post('/api/trades', async (req, res) => {
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
╔════════════════════════════════════════════════════════════╗
║     TRADING MASTER PRO v6.1                                ║
║     BOS + CHoCH + Narración en Vivo                        ║
╠════════════════════════════════════════════════════════════╣
║  🚀 Puerto: ${PORT}                                           ║
║  📱 WhatsApp: ${CALLMEBOT_API_KEY ? '✅' : '❌'}                                       ║
║  📈 Estrategia: BOS/CHoCH → Fib 70.6-92.6% → OB            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;
