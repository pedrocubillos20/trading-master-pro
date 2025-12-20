// =============================================
// TRADING MASTER PRO - BACKEND v5.1
// Deriv API + Estrategia SMC Personalizada
// Máximo 7 señales por día por índice
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
console.log('\n🔧 VERIFICANDO CONFIGURACIÓN...');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅' : '❌');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅' : '❌');
console.log('DERIV_APP_ID:', process.env.DERIV_APP_ID ? '✅' : '❌');
console.log('DERIV_API_TOKEN:', process.env.DERIV_API_TOKEN ? '✅' : '❌');

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

// =============================================
// CONFIGURACIÓN DE ÍNDICES Y LÍMITES
// =============================================

const SYNTHETIC_INDICES = {
  'R_10': { name: 'Volatility 10', pip: 0.001, maxSignals: 7 },
  'R_25': { name: 'Volatility 25', pip: 0.001, maxSignals: 7 },
  'R_50': { name: 'Volatility 50', pip: 0.0001, maxSignals: 7 },
  'R_75': { name: 'Volatility 75', pip: 0.0001, maxSignals: 7 },
  'R_100': { name: 'Volatility 100', pip: 0.01, maxSignals: 7 },
  '1HZ10V': { name: 'Volatility 10 (1s)', pip: 0.001, maxSignals: 7 },
  '1HZ25V': { name: 'Volatility 25 (1s)', pip: 0.001, maxSignals: 7 },
  '1HZ50V': { name: 'Volatility 50 (1s)', pip: 0.0001, maxSignals: 7 },
  '1HZ75V': { name: 'Volatility 75 (1s)', pip: 0.0001, maxSignals: 7 },
  '1HZ100V': { name: 'Volatility 100 (1s)', pip: 0.01, maxSignals: 7 },
  'stpRNG': { name: 'Step Index', pip: 0.1, maxSignals: 7 },
  'BOOM500': { name: 'Boom 500', pip: 0.01, maxSignals: 7 },
  'BOOM1000': { name: 'Boom 1000', pip: 0.01, maxSignals: 7 },
  'CRASH500': { name: 'Crash 500', pip: 0.01, maxSignals: 7 },
  'CRASH1000': { name: 'Crash 1000', pip: 0.01, maxSignals: 7 },
};

const TIMEFRAMES = { M1: 60, M5: 300, M15: 900, H1: 3600 };

// =============================================
// ESTADO GLOBAL
// =============================================

let derivWs = null;
let isDerivConnected = false;
const candleData = new Map(); // symbol_timeframe -> candles[]
const tickData = new Map(); // symbol -> ticks[]
const dailySignals = new Map(); // symbol -> count (reset diario)
const activeSignals = new Map(); // signalId -> signal
const signalHistory = [];
const marketNarration = new Map(); // symbol -> narration
const userSettings = new Map(); // userId -> { signalsEnabled, symbols[] }

// Reset diario de señales
const resetDailySignals = () => {
  dailySignals.clear();
  console.log('🔄 Contador de señales diarias reseteado');
};

// Reset a medianoche
const scheduleReset = () => {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const msUntilMidnight = tomorrow - now;
  setTimeout(() => {
    resetDailySignals();
    scheduleReset();
  }, msUntilMidnight);
};
scheduleReset();

// =============================================
// ESTRATEGIA SMC PERSONALIZADA
// =============================================

const SMC_STRATEGY = {
  // Detectar estructura de mercado
  detectStructure(candles) {
    if (candles.length < 20) return null;
    
    const swings = this.findSwings(candles);
    if (swings.highs.length < 2 || swings.lows.length < 2) return null;

    const lastHighs = swings.highs.slice(-3);
    const lastLows = swings.lows.slice(-3);

    // Determinar tendencia
    let trend = 'RANGING';
    let structure = [];

    if (lastHighs.length >= 2 && lastLows.length >= 2) {
      const hh = lastHighs[lastHighs.length - 1].price > lastHighs[lastHighs.length - 2].price;
      const hl = lastLows[lastLows.length - 1].price > lastLows[lastLows.length - 2].price;
      const lh = lastHighs[lastHighs.length - 1].price < lastHighs[lastHighs.length - 2].price;
      const ll = lastLows[lastLows.length - 1].price < lastLows[lastLows.length - 2].price;

      if (hh && hl) {
        trend = 'BULLISH';
        structure = [{ type: 'HH' }, { type: 'HL' }];
      } else if (lh && ll) {
        trend = 'BEARISH';
        structure = [{ type: 'LH' }, { type: 'LL' }];
      }
    }

    return {
      trend,
      structure,
      swings,
      lastHigh: swings.highs[swings.highs.length - 1],
      lastLow: swings.lows[swings.lows.length - 1],
    };
  },

  // Encontrar swings
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

  // Detectar CHoCH (Change of Character) - TU SETUP FAVORITO
  detectCHoCH(candles, structure) {
    if (!structure || !structure.lastHigh || !structure.lastLow) return null;
    
    const current = candles[candles.length - 1];
    const lastHigh = structure.lastHigh.price;
    const lastLow = structure.lastLow.price;

    // CHoCH Alcista: en bajista, rompe último high
    if (current.close > lastHigh && structure.trend === 'BEARISH') {
      return { type: 'CHoCH', direction: 'BULLISH', breakLevel: lastHigh, time: current.time };
    }

    // CHoCH Bajista: en alcista, rompe último low
    if (current.close < lastLow && structure.trend === 'BULLISH') {
      return { type: 'CHoCH', direction: 'BEARISH', breakLevel: lastLow, time: current.time };
    }

    return null;
  },

  // Encontrar Order Blocks
  findOrderBlocks(candles, lookback = 30) {
    const obs = [];
    
    for (let i = lookback; i < candles.length - 3; i++) {
      const c = candles[i];
      const nextMove = this.measureMove(candles, i + 1, 5);
      
      // OB de Demanda: vela bajista + movimiento alcista fuerte después
      if (c.close < c.open && nextMove.direction === 'UP' && nextMove.strength > 2) {
        obs.push({
          type: 'DEMAND',
          high: c.high,
          low: c.low,
          mid: (c.high + c.low) / 2,
          index: i,
          time: c.time,
          strength: nextMove.strength,
        });
      }
      
      // OB de Oferta: vela alcista + movimiento bajista fuerte después
      if (c.close > c.open && nextMove.direction === 'DOWN' && nextMove.strength > 2) {
        obs.push({
          type: 'SUPPLY',
          high: c.high,
          low: c.low,
          mid: (c.high + c.low) / 2,
          index: i,
          time: c.time,
          strength: nextMove.strength,
        });
      }
    }
    
    return obs.slice(-5); // Últimos 5 OBs
  },

  // Medir fuerza del movimiento
  measureMove(candles, start, length) {
    if (start + length >= candles.length) return { direction: 'NONE', strength: 0 };
    
    const startPrice = candles[start].close;
    const endPrice = candles[start + length - 1].close;
    const atr = this.calculateATR(candles.slice(Math.max(0, start - 14), start), 14);
    
    const move = endPrice - startPrice;
    return {
      direction: move > 0 ? 'UP' : 'DOWN',
      strength: Math.abs(move) / (atr || 1),
    };
  },

  // Calcular niveles Fibonacci (78.6% y 92.6% - TUS FAVORITOS)
  calculateFibLevels(high, low, direction) {
    const range = high - low;
    
    if (direction === 'BULLISH') {
      return {
        fib786: high - (range * 0.786),
        fib926: high - (range * 0.926),
        fib618: high - (range * 0.618),
        fib50: high - (range * 0.5),
      };
    } else {
      return {
        fib786: low + (range * 0.786),
        fib926: low + (range * 0.926),
        fib618: low + (range * 0.618),
        fib50: low + (range * 0.5),
      };
    }
  },

  // Calcular ATR
  calculateATR(candles, period = 14) {
    if (candles.length < period) return 0;
    let sum = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - (candles[i - 1]?.close || candles[i].open)),
        Math.abs(candles[i].low - (candles[i - 1]?.close || candles[i].open))
      );
      sum += tr;
    }
    return sum / period;
  },

  // =============================================
  // ANÁLISIS MULTI-TIMEFRAME (Tu estilo)
  // H1/15M: Estructura y dirección
  // 5M: Zonas de entrada
  // 1M: Entrada sniper
  // =============================================
  
  analyzeMultiTimeframe(symbol) {
    const h1 = candleData.get(`${symbol}_3600`) || [];
    const m15 = candleData.get(`${symbol}_900`) || [];
    const m5 = candleData.get(`${symbol}_300`) || [];
    const m1 = candleData.get(`${symbol}_60`) || [];

    // H1: Tendencia principal
    const h1Structure = h1.length >= 50 ? this.detectStructure(h1) : null;
    
    // M15: Confirmar estructura
    const m15Structure = m15.length >= 50 ? this.detectStructure(m15) : null;
    
    // M5: Zonas de entrada (OBs)
    const m5OBs = m5.length >= 50 ? this.findOrderBlocks(m5) : [];
    const m5Structure = m5.length >= 50 ? this.detectStructure(m5) : null;
    
    // M1: Entrada sniper - buscar CHoCH
    const m1Structure = m1.length >= 30 ? this.detectStructure(m1) : null;
    const m1CHoCH = m1.length >= 30 ? this.detectCHoCH(m1, m1Structure) : null;

    return {
      h1: { structure: h1Structure, candles: h1.slice(-100) },
      m15: { structure: m15Structure, candles: m15.slice(-100) },
      m5: { structure: m5Structure, orderBlocks: m5OBs, candles: m5.slice(-100) },
      m1: { structure: m1Structure, choch: m1CHoCH, candles: m1.slice(-100) },
    };
  },

  // =============================================
  // GENERAR SEÑAL (Tu estrategia específica)
  // CHoCH → Pullback a OB/78.6%/92.6% → Stop corto → TP en nuevos máximos
  // =============================================
  
  generateSignal(symbol, mtfAnalysis) {
    const { h1, m15, m5, m1 } = mtfAnalysis;
    
    // 1. Verificar tendencia en H1/M15
    const mainTrend = h1.structure?.trend || m15.structure?.trend;
    if (!mainTrend || mainTrend === 'RANGING') {
      return { hasSignal: false, reason: 'Sin tendencia clara en H1/M15' };
    }

    // 2. Buscar CHoCH en M1 (tu entrada favorita)
    if (!m1.choch) {
      return { hasSignal: false, reason: 'Esperando CHoCH en M1' };
    }

    // 3. Verificar que CHoCH va en dirección de la tendencia principal
    if (m1.choch.direction !== mainTrend) {
      return { hasSignal: false, reason: 'CHoCH contra tendencia principal' };
    }

    // 4. Buscar zona de entrada (OB en M5 o Fibonacci)
    const currentPrice = m1.candles[m1.candles.length - 1]?.close;
    if (!currentPrice) return { hasSignal: false, reason: 'Sin precio actual' };

    // Buscar OB cercano
    let entryZone = null;
    const relevantOBs = m5.orderBlocks.filter(ob => 
      (mainTrend === 'BULLISH' && ob.type === 'DEMAND') ||
      (mainTrend === 'BEARISH' && ob.type === 'SUPPLY')
    );

    if (relevantOBs.length > 0) {
      const nearestOB = relevantOBs[relevantOBs.length - 1];
      entryZone = {
        type: 'ORDER_BLOCK',
        high: nearestOB.high,
        low: nearestOB.low,
        mid: nearestOB.mid,
      };
    }

    // Calcular Fibonacci si no hay OB
    if (!entryZone && m1.structure) {
      const lastHigh = m1.structure.lastHigh?.price;
      const lastLow = m1.structure.lastLow?.price;
      
      if (lastHigh && lastLow) {
        const fibs = this.calculateFibLevels(lastHigh, lastLow, mainTrend);
        entryZone = {
          type: 'FIBONACCI',
          fib786: fibs.fib786,
          fib926: fibs.fib926,
        };
      }
    }

    if (!entryZone) {
      return { hasSignal: false, reason: 'Sin zona de entrada válida' };
    }

    // 5. Calcular niveles de entrada
    const atr = this.calculateATR(m5.candles, 14);
    let entry, sl, tp1, tp2, tp3;

    if (mainTrend === 'BULLISH') {
      entry = entryZone.type === 'ORDER_BLOCK' ? entryZone.high : entryZone.fib786;
      sl = entryZone.type === 'ORDER_BLOCK' ? entryZone.low - (atr * 0.3) : entryZone.fib926 - (atr * 0.3);
      const risk = entry - sl;
      tp1 = entry + (risk * 2);
      tp2 = entry + (risk * 3);
      tp3 = m1.structure?.lastHigh?.price || entry + (risk * 5);
    } else {
      entry = entryZone.type === 'ORDER_BLOCK' ? entryZone.low : entryZone.fib786;
      sl = entryZone.type === 'ORDER_BLOCK' ? entryZone.high + (atr * 0.3) : entryZone.fib926 + (atr * 0.3);
      const risk = sl - entry;
      tp1 = entry - (risk * 2);
      tp2 = entry - (risk * 3);
      tp3 = m1.structure?.lastLow?.price || entry - (risk * 5);
    }

    return {
      hasSignal: true,
      direction: mainTrend === 'BULLISH' ? 'COMPRA' : 'VENTA',
      confidence: 'ALTA',
      setup: {
        type: `CHoCH + ${entryZone.type}`,
        mainTrend,
        chochLevel: m1.choch.breakLevel,
        entryZone,
      },
      levels: {
        entry: entry.toFixed(5),
        stopLoss: sl.toFixed(5),
        takeProfit1: tp1.toFixed(5),
        takeProfit2: tp2.toFixed(5),
        takeProfit3: tp3.toFixed(5),
      },
      riskReward: {
        tp1: '1:2',
        tp2: '1:3',
        tp3: '1:5',
      },
      reasoning: `CHoCH ${mainTrend} detectado en M1. Tendencia H1/M15: ${mainTrend}. Entrada en ${entryZone.type}. Stop loss corto debajo de la zona.`,
    };
  },
};

// =============================================
// NARRACIÓN DEL MERCADO CON IA
// =============================================

async function generateMarketNarration(symbol, analysis) {
  if (!openai) return 'IA no disponible';

  const prompt = `Eres un trader profesional de SMC narrando el mercado en tiempo real para ${symbol}.

DATOS ACTUALES:
- Tendencia H1: ${analysis.h1?.structure?.trend || 'N/A'}
- Tendencia M15: ${analysis.m15?.structure?.trend || 'N/A'}
- Estructura M5: ${analysis.m5?.structure?.trend || 'N/A'}
- CHoCH en M1: ${analysis.m1?.choch ? `SÍ - ${analysis.m1.choch.direction}` : 'NO'}
- Order Blocks M5: ${analysis.m5?.orderBlocks?.length || 0}
- Precio actual: ${analysis.m1?.candles?.[analysis.m1?.candles?.length - 1]?.close || 'N/A'}

INSTRUCCIONES:
1. Narra qué está pasando en el mercado AHORA
2. Explica la estructura actual (HH, HL, LH, LL)
3. Indica si hay setup formándose
4. Di qué hay que esperar
5. Sé breve y directo (máximo 3-4 oraciones)
6. Usa lenguaje de trader SMC

Responde solo la narración, sin formato especial.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
    });
    return response.choices[0]?.message?.content || 'Sin narración disponible';
  } catch (e) {
    return 'Error generando narración';
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

    // Autorizar con token si existe
    if (DERIV_API_TOKEN) {
      derivWs.send(JSON.stringify({ authorize: DERIV_API_TOKEN }));
    }

    // Suscribirse a símbolos principales
    const symbols = ['R_75', 'R_100', 'stpRNG', 'BOOM500', 'CRASH500'];
    symbols.forEach(symbol => {
      // Ticks
      derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      
      // Velas multi-timeframe
      Object.values(TIMEFRAMES).forEach(granularity => {
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
        console.error('Deriv error:', msg.error);
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

      // Vela OHLC
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
          close: parseFloat(close),
        };

        if (candles.length > 0 && candles[candles.length - 1].time === newCandle.time) {
          candles[candles.length - 1] = newCandle;
        } else {
          candles.push(newCandle);
          
          // Analizar en nueva vela de M5
          if (granularity === 300) {
            await analyzeAndSignal(symbol);
          }
        }
        
        if (candles.length > 500) candles.shift();
      }

      // Historia de velas
      if (msg.candles) {
        const symbol = msg.echo_req?.ticks_history;
        const granularity = msg.echo_req?.granularity;
        const key = `${symbol}_${granularity}`;
        
        const formatted = msg.candles.map(c => ({
          time: c.epoch,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
        }));
        
        candleData.set(key, formatted);
      }

    } catch (e) {
      console.error('Error procesando mensaje:', e);
    }
  });

  derivWs.on('close', () => {
    console.log('❌ Deriv desconectado');
    isDerivConnected = false;
    setTimeout(connectDeriv, 5000);
  });

  derivWs.on('error', (e) => console.error('Deriv WS error:', e));
}

// Analizar y generar señal
async function analyzeAndSignal(symbol) {
  try {
    // Verificar límite diario
    const todayCount = dailySignals.get(symbol) || 0;
    if (todayCount >= 7) {
      console.log(`⚠️ ${symbol}: Límite de 7 señales alcanzado hoy`);
      return;
    }

    const mtfAnalysis = SMC_STRATEGY.analyzeMultiTimeframe(symbol);
    const signal = SMC_STRATEGY.generateSignal(symbol, mtfAnalysis);

    // Generar narración
    const narration = await generateMarketNarration(symbol, mtfAnalysis);
    marketNarration.set(symbol, {
      text: narration,
      timestamp: new Date().toISOString(),
      analysis: mtfAnalysis,
    });

    if (signal.hasSignal) {
      const signalId = `${symbol}_${Date.now()}`;
      const fullSignal = {
        id: signalId,
        symbol,
        symbolName: SYNTHETIC_INDICES[symbol]?.name || symbol,
        ...signal,
        narration,
        createdAt: new Date().toISOString(),
        dailyCount: todayCount + 1,
      };

      activeSignals.set(signalId, fullSignal);
      signalHistory.push(fullSignal);
      dailySignals.set(symbol, todayCount + 1);

      if (signalHistory.length > 100) signalHistory.shift();

      console.log(`🎯 SEÑAL #${todayCount + 1}/7: ${signal.direction} en ${symbol}`);
    }
  } catch (e) {
    console.error('Error en análisis:', e);
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
  try {
    const authHeader = req.headers.authorization;
    if (!supabase || !authHeader?.startsWith('Bearer ')) {
      req.user = { id: 'demo-user' };
      return next();
    }
    const { data } = await supabase.auth.getUser(authHeader.split(' ')[1]);
    req.user = data?.user || { id: 'demo-user' };
    next();
  } catch { req.user = { id: 'demo-user' }; next(); }
};

// =============================================
// RUTAS - ESTADO
// =============================================

app.get('/', (req, res) => res.json({ 
  status: 'ok', 
  version: '5.1',
  deriv: isDerivConnected,
  openai: !!openai,
}));

app.get('/health', (req, res) => res.json({ status: 'healthy', deriv: isDerivConnected }));

app.get('/api/check-ai', async (req, res) => {
  if (!openai) return res.json({ connected: false });
  try {
    await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: 'test' }], max_tokens: 5 });
    res.json({ connected: true });
  } catch { res.json({ connected: false }); }
});

// =============================================
// RUTAS - DERIV EN VIVO
// =============================================

app.get('/api/deriv/status', (req, res) => {
  res.json({
    connected: isDerivConnected,
    appId: DERIV_APP_ID,
    symbolsTracking: Array.from(candleData.keys()).map(k => k.split('_')[0]).filter((v, i, a) => a.indexOf(v) === i),
  });
});

app.get('/api/deriv/symbols', (req, res) => res.json(SYNTHETIC_INDICES));

app.get('/api/deriv/price/:symbol', (req, res) => {
  const ticks = tickData.get(req.params.symbol) || [];
  const last = ticks[ticks.length - 1];
  res.json({ symbol: req.params.symbol, price: last?.price, time: last?.time, ticks: ticks.slice(-100) });
});

app.get('/api/deriv/candles/:symbol/:timeframe', (req, res) => {
  const { symbol, timeframe } = req.params;
  const tf = TIMEFRAMES[timeframe] || parseInt(timeframe);
  const candles = candleData.get(`${symbol}_${tf}`) || [];
  res.json({ symbol, timeframe: tf, candles });
});

// =============================================
// RUTAS - ANÁLISIS Y SEÑALES
// =============================================

app.get('/api/analyze/live/:symbol', authenticate, async (req, res) => {
  const { symbol } = req.params;
  const mtfAnalysis = SMC_STRATEGY.analyzeMultiTimeframe(symbol);
  const signal = SMC_STRATEGY.generateSignal(symbol, mtfAnalysis);
  const narration = marketNarration.get(symbol);

  res.json({
    symbol,
    symbolName: SYNTHETIC_INDICES[symbol]?.name || symbol,
    analysis: mtfAnalysis,
    signal,
    narration: narration?.text || 'Analizando mercado...',
    dailySignals: dailySignals.get(symbol) || 0,
    maxSignals: 7,
  });
});

app.get('/api/narration/:symbol', (req, res) => {
  const narration = marketNarration.get(req.params.symbol);
  res.json(narration || { text: 'Sin narración disponible' });
});

app.get('/api/signals/active', authenticate, (req, res) => {
  const signals = Array.from(activeSignals.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20);
  res.json(signals);
});

app.get('/api/signals/history', authenticate, (req, res) => {
  res.json(signalHistory.slice(-50).reverse());
});

app.get('/api/signals/daily-count', (req, res) => {
  const counts = {};
  dailySignals.forEach((count, symbol) => { counts[symbol] = count; });
  res.json(counts);
});

// =============================================
// RUTAS - CONFIGURACIÓN USUARIO
// =============================================

app.get('/api/settings', authenticate, (req, res) => {
  const settings = userSettings.get(req.user.id) || {
    signalsEnabled: false,
    symbols: ['R_75', 'R_100', 'stpRNG'],
  };
  res.json(settings);
});

app.post('/api/settings', authenticate, (req, res) => {
  const { signalsEnabled, symbols } = req.body;
  userSettings.set(req.user.id, { signalsEnabled, symbols });
  res.json({ success: true });
});

// =============================================
// RUTAS - ANÁLISIS CON IMÁGENES
// =============================================

app.post('/api/analyze', authenticate, upload.array('images', 4), async (req, res) => {
  try {
    if (!openai) return res.status(500).json({ error: 'OpenAI no configurado' });
    
    const { asset } = req.body;
    let images = [];
    
    if (req.files?.length) {
      images = req.files.map(f => ({
        type: 'image_url',
        image_url: { url: `data:${f.mimetype};base64,${f.buffer.toString('base64')}`, detail: 'high' }
      }));
    }
    
    if (req.body.images) {
      const imgs = typeof req.body.images === 'string' ? JSON.parse(req.body.images) : req.body.images;
      imgs.forEach(img => {
        const data = typeof img === 'string' ? img : img.data;
        if (data?.length > 100) {
          images.push({ type: 'image_url', image_url: { url: data.startsWith('data:') ? data : `data:image/png;base64,${data}`, detail: 'high' } });
        }
      });
    }

    if (!images.length) return res.status(400).json({ error: 'Sin imágenes' });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `Analiza SMC para ${asset}. Busca: CHoCH, OB, FVG. Responde JSON con: hay_senal, direccion, setup, niveles.` },
          ...images
        ]
      }],
      max_tokens: 2000,
    });

    const text = response.choices[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    const analysis = match ? JSON.parse(match[0]) : { raw: text };

    res.json({ success: true, analysis });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// TRADES
// =============================================

app.get('/api/trades', authenticate, async (req, res) => {
  if (!supabase) return res.json([]);
  const { data } = await supabase.from('trades').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
  res.json(data || []);
});

app.post('/api/trades', authenticate, async (req, res) => {
  const trade = { id: uuidv4(), user_id: req.user.id, ...req.body, created_at: new Date().toISOString() };
  if (supabase && req.user.id !== 'demo-user') {
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
║       TRADING MASTER PRO - API v5.1                       ║
║       DERIV + SMC + NARRACIÓN IA                          ║
╠═══════════════════════════════════════════════════════════╣
║  🚀 Puerto: ${PORT}                                          ║
║  🤖 OpenAI: ${openai ? '✅' : '❌'}                                        ║
║  💾 Supabase: ${supabase ? '✅' : '❌'}                                      ║
║  📈 Deriv: Conectando...                                  ║
║  🎯 Máx señales/día: 7 por índice                         ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
