// =============================================
// TRADING MASTER PRO v8.0 - SMC INSTITUCIONAL
// REVERSAL + CONTINUATION + MULTI-ASSET
// =============================================

import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Motor SMC Unificado
import SMCEngine from './smcEngineUnified.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// =============================================
// CONFIGURACIÓN
// =============================================
const CONFIG = {
  DERIV_APP_ID: process.env.DERIV_APP_ID || '117347',
  DERIV_WS_URL: 'wss://ws.derivws.com/websockets/v3',
  
  // Activos soportados
  ASSETS: {
    // Índices Sintéticos
    'stpRNG': { 
      name: 'Step Index', 
      type: 'synthetic',
      tolerance: 0.0003,
      minScore: 70,
      rrTarget: 3
    },
    '1HZ75V': { 
      name: 'Volatility 75', 
      type: 'synthetic',
      tolerance: 0.0005,
      minScore: 70,
      rrTarget: 3
    },
    '1HZ100V': { 
      name: 'Volatility 100', 
      type: 'synthetic',
      tolerance: 0.0008,
      minScore: 70,
      rrTarget: 3
    },
    'BOOM1000': {
      name: 'Boom 1000',
      type: 'synthetic',
      tolerance: 0.001,
      minScore: 75,
      rrTarget: 2
    },
    'CRASH1000': {
      name: 'Crash 1000',
      type: 'synthetic',
      tolerance: 0.001,
      minScore: 75,
      rrTarget: 2
    },
    // Forex / Commodities
    'frxXAUUSD': { 
      name: 'Gold/USD', 
      type: 'commodity',
      tolerance: 0.002,
      minScore: 65, // ORO requiere menos score por tendencias fuertes
      rrTarget: 2,
      useContinuation: true // Priorizar modelo continuation
    },
    'frxEURUSD': { 
      name: 'EUR/USD', 
      type: 'forex',
      tolerance: 0.0003,
      minScore: 70,
      rrTarget: 2
    },
    'frxGBPUSD': {
      name: 'GBP/USD',
      type: 'forex',
      tolerance: 0.0004,
      minScore: 70,
      rrTarget: 2
    }
  },
  
  // Timeframes
  TIMEFRAMES: {
    M1: 60,
    M5: 300,
    M15: 900,
    H1: 3600
  },
  
  // Señales
  MIN_SCORE_VALID: 60,
  MIN_SCORE_AUTO: 75,
  MAX_SIGNALS_PER_DAY: 10,
  SIGNAL_COOLDOWN_MS: 300000 // 5 minutos entre señales
};

// =============================================
// ESTADO GLOBAL
// =============================================
let derivWs = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// Datos por activo
const assetData = {};
for (const symbol of Object.keys(CONFIG.ASSETS)) {
  assetData[symbol] = {
    candles: { M1: [], M5: [], M15: [], H1: [] },
    lastPrice: null,
    lastSignal: null,
    signalsToday: 0,
    lastSignalTime: null
  };
}

// Historial de señales
let signalHistory = [];
const dailySignals = new Map();
const usedStructures = new Set();

// Supabase
const supabase = process.env.SUPABASE_URL ? 
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;

// =============================================
// PERSISTENCIA
// =============================================
const Persistence = {
  async saveSignal(signal) {
    if (!supabase) return;
    try {
      await supabase.from('signals').insert({
        asset: signal.asset,
        action: signal.action,
        model: signal.model,
        score: signal.score,
        entry: signal.entry,
        stop: signal.stop,
        tp1: signal.tp1,
        details: signal.details,
        created_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('❌ Error guardando señal:', err.message);
    }
  },
  
  async loadSignalHistory() {
    if (!supabase) return [];
    try {
      const { data } = await supabase
        .from('signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      return data || [];
    } catch (err) {
      console.error('❌ Error cargando historial:', err.message);
      return [];
    }
  }
};

// =============================================
// CONEXIÓN DERIV
// =============================================
function connectDeriv() {
  console.log('🔌 Conectando a Deriv...');
  
  derivWs = new WebSocket(`${CONFIG.DERIV_WS_URL}?app_id=${CONFIG.DERIV_APP_ID}`);
  
  derivWs.on('open', () => {
    console.log('✅ Conectado a Deriv');
    isConnected = true;
    reconnectAttempts = 0;
    
    // Suscribirse a todos los activos
    for (const symbol of Object.keys(CONFIG.ASSETS)) {
      subscribeToAsset(symbol);
    }
  });
  
  derivWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      handleDerivMessage(msg);
    } catch (err) {
      console.error('❌ Error parseando mensaje:', err.message);
    }
  });
  
  derivWs.on('close', () => {
    console.log('🔌 Desconectado de Deriv');
    isConnected = false;
    attemptReconnect();
  });
  
  derivWs.on('error', (err) => {
    console.error('❌ Error WebSocket:', err.message);
  });
}

function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('❌ Máximo de reconexiones alcanzado');
    return;
  }
  
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  console.log(`🔄 Reconectando en ${delay/1000}s... (intento ${reconnectAttempts})`);
  
  setTimeout(connectDeriv, delay);
}

function subscribeToAsset(symbol) {
  if (!derivWs || derivWs.readyState !== WebSocket.OPEN) return;
  
  const assetConfig = CONFIG.ASSETS[symbol];
  console.log(`📊 Suscribiendo a ${assetConfig.name} (${symbol})...`);
  
  // Solicitar velas históricas para cada timeframe
  for (const [tf, seconds] of Object.entries(CONFIG.TIMEFRAMES)) {
    derivWs.send(JSON.stringify({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: 100,
      end: 'latest',
      granularity: seconds,
      style: 'candles',
      subscribe: 1
    }));
  }
  
  // Suscribirse a ticks en tiempo real
  derivWs.send(JSON.stringify({
    ticks: symbol,
    subscribe: 1
  }));
}

function handleDerivMessage(msg) {
  // Respuesta de velas históricas
  if (msg.candles) {
    const symbol = msg.echo_req?.ticks_history;
    const granularity = msg.echo_req?.granularity;
    
    if (symbol && assetData[symbol]) {
      const tf = Object.entries(CONFIG.TIMEFRAMES).find(([, s]) => s === granularity)?.[0];
      if (tf) {
        assetData[symbol].candles[tf] = msg.candles.map(c => ({
          time: c.epoch * 1000,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close)
        }));
        console.log(`📈 ${CONFIG.ASSETS[symbol].name} ${tf}: ${msg.candles.length} velas cargadas`);
      }
    }
  }
  
  // Nueva vela (OHLC)
  if (msg.ohlc) {
    const symbol = msg.ohlc.symbol;
    const granularity = parseInt(msg.ohlc.granularity);
    
    if (symbol && assetData[symbol]) {
      const tf = Object.entries(CONFIG.TIMEFRAMES).find(([, s]) => s === granularity)?.[0];
      if (tf) {
        const newCandle = {
          time: msg.ohlc.epoch * 1000,
          open: parseFloat(msg.ohlc.open),
          high: parseFloat(msg.ohlc.high),
          low: parseFloat(msg.ohlc.low),
          close: parseFloat(msg.ohlc.close)
        };
        
        const candles = assetData[symbol].candles[tf];
        
        // Actualizar o agregar vela
        if (candles.length > 0 && candles[candles.length - 1].time === newCandle.time) {
          candles[candles.length - 1] = newCandle;
        } else {
          candles.push(newCandle);
          if (candles.length > 200) candles.shift();
          
          // Nueva vela cerrada = analizar
          if (tf === 'M5') {
            analyzeAsset(symbol);
          }
        }
      }
    }
  }
  
  // Tick en tiempo real
  if (msg.tick) {
    const symbol = msg.tick.symbol;
    if (symbol && assetData[symbol]) {
      assetData[symbol].lastPrice = parseFloat(msg.tick.quote);
    }
  }
}

// =============================================
// ANÁLISIS SMC
// =============================================
function analyzeAsset(symbol) {
  const data = assetData[symbol];
  const config = CONFIG.ASSETS[symbol];
  
  if (!data || !config) return null;
  
  const candles = data.candles.M5;
  if (candles.length < 30) return null;
  
  const lastCandle = candles[candles.length - 1];
  
  // Generar señal usando el motor SMC unificado
  const signal = SMCEngine.generateSMCSignal({
    candle: lastCandle,
    candles: candles,
    asset: symbol
  });
  
  // Verificar si es señal válida
  if (signal.action !== 'WAIT' && signal.score >= config.minScore) {
    // Verificar cooldown
    const now = Date.now();
    if (data.lastSignalTime && (now - data.lastSignalTime) < CONFIG.SIGNAL_COOLDOWN_MS) {
      console.log(`⏳ ${config.name}: Cooldown activo`);
      return null;
    }
    
    // Verificar límite diario
    if (data.signalsToday >= CONFIG.MAX_SIGNALS_PER_DAY) {
      console.log(`🚫 ${config.name}: Límite diario alcanzado`);
      return null;
    }
    
    // Señal válida!
    const fullSignal = {
      ...signal,
      asset: symbol,
      assetName: config.name,
      assetType: config.type,
      timeframe: 'M5',
      price: lastCandle.close
    };
    
    // Guardar señal
    data.lastSignal = fullSignal;
    data.lastSignalTime = now;
    data.signalsToday++;
    signalHistory.unshift(fullSignal);
    if (signalHistory.length > 100) signalHistory.pop();
    
    // Persistir
    Persistence.saveSignal(fullSignal);
    
    // Log
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  🎯 SEÑAL ${signal.action} - ${config.name}
╠════════════════════════════════════════════════════════════╣
║  📊 Modelo: ${signal.model}
║  📈 Score: ${signal.score} (${signal.confidence})
║  💰 Entry: ${signal.entry}
║  🛑 Stop: ${signal.stop}
║  🎯 TP1: ${signal.tp1}
╚════════════════════════════════════════════════════════════╝
    `);
    
    // Notificar (WhatsApp/Telegram)
    sendNotification(fullSignal);
    
    return fullSignal;
  }
  
  return null;
}

// =============================================
// NOTIFICACIONES
// =============================================
async function sendNotification(signal) {
  const phone = process.env.WHATSAPP_PHONE;
  const apiKey = process.env.TEXTMEBOT_API_KEY;
  
  if (!phone || !apiKey) return;
  
  const emoji = signal.action === 'LONG' ? '🟢' : '🔴';
  const message = `
${emoji} *${signal.action} ${signal.assetName}*

📊 Modelo: ${signal.model}
📈 Score: ${signal.score}/100
💰 Entry: ${signal.entry}
🛑 Stop: ${signal.stop}
🎯 TP: ${signal.tp1}
⏰ ${new Date().toLocaleTimeString()}

_Trading Master Pro v8.0_
  `.trim();
  
  try {
    const url = `https://api.textmebot.com/send.php?recipient=${phone}&apikey=${apiKey}&text=${encodeURIComponent(message)}`;
    await fetch(url);
    console.log('📱 Notificación enviada');
  } catch (err) {
    console.error('❌ Error enviando notificación:', err.message);
  }
}

// =============================================
// KEEP ALIVE
// =============================================
const KeepAlive = {
  interval: null,
  
  start() {
    this.interval = setInterval(() => {
      if (derivWs && derivWs.readyState === WebSocket.OPEN) {
        derivWs.send(JSON.stringify({ ping: 1 }));
      }
    }, 240000); // 4 minutos
  },
  
  stop() {
    if (this.interval) clearInterval(this.interval);
  }
};

// =============================================
// API ENDPOINTS
// =============================================

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Trading Master Pro API',
    version: '8.0.0',
    model: 'SMC Institucional - Reversal + Continuation',
    connected: isConnected,
    assets: Object.keys(CONFIG.ASSETS).length
  });
});

// Estado de conexión
app.get('/api/status', (req, res) => {
  const assets = {};
  
  for (const [symbol, data] of Object.entries(assetData)) {
    assets[symbol] = {
      name: CONFIG.ASSETS[symbol].name,
      type: CONFIG.ASSETS[symbol].type,
      lastPrice: data.lastPrice,
      candlesM5: data.candles.M5.length,
      signalsToday: data.signalsToday,
      lastSignal: data.lastSignal?.action || null
    };
  }
  
  res.json({
    connected: isConnected,
    reconnectAttempts,
    assets,
    totalSignals: signalHistory.length
  });
});

// Análisis de un activo específico
app.get('/api/analyze/:symbol', (req, res) => {
  const { symbol } = req.params;
  const data = assetData[symbol];
  const config = CONFIG.ASSETS[symbol];
  
  if (!data || !config) {
    return res.status(404).json({ error: 'Activo no encontrado' });
  }
  
  const candles = data.candles.M5;
  if (candles.length < 30) {
    return res.json({ 
      asset: symbol,
      status: 'LOADING',
      message: 'Cargando datos...',
      candlesLoaded: candles.length
    });
  }
  
  const lastCandle = candles[candles.length - 1];
  
  // Análisis completo
  const swings = SMCEngine.detectSwings(candles);
  const { eqh, eql } = SMCEngine.detectEqualHighsLows(candles, config.tolerance);
  const ranges = candles.slice(-20).map(c => c.high - c.low);
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  
  const sweep = SMCEngine.detectLiquiditySweep(lastCandle, eqh, eql);
  const displacement = SMCEngine.detectDisplacement(candles, avgRange);
  const orderBlock = SMCEngine.detectOrderBlock(candles, sweep);
  const fvg = SMCEngine.detectFVG(candles);
  const choch = SMCEngine.detectCHoCH(candles, swings);
  const zone = SMCEngine.detectZone(lastCandle, swings);
  
  // Generar señal
  const signal = SMCEngine.generateSMCSignal({
    candle: lastCandle,
    candles,
    swings,
    eqh,
    eql,
    avgRange,
    asset: symbol
  });
  
  res.json({
    asset: symbol,
    name: config.name,
    type: config.type,
    price: data.lastPrice,
    timeframe: 'M5',
    analysis: {
      eqh,
      eql,
      avgRange,
      sweep: sweep?.description || 'Sin sweep',
      displacement: displacement?.description || 'Sin displacement',
      orderBlock: orderBlock?.description || 'Sin OB',
      fvg: fvg?.description || 'Sin FVG',
      choch: choch?.description || 'Sin CHoCH',
      zone: `${zone.zone} (${zone.percent}%)`
    },
    signal,
    candles: candles.slice(-50) // Últimas 50 velas para el gráfico
  });
});

// Historial de señales
app.get('/api/signals', (req, res) => {
  const { asset, limit = 20 } = req.query;
  
  let signals = signalHistory;
  if (asset) {
    signals = signals.filter(s => s.asset === asset);
  }
  
  res.json({
    count: signals.length,
    signals: signals.slice(0, parseInt(limit))
  });
});

// Última señal de un activo
app.get('/api/signals/:symbol/latest', (req, res) => {
  const { symbol } = req.params;
  const data = assetData[symbol];
  
  if (!data) {
    return res.status(404).json({ error: 'Activo no encontrado' });
  }
  
  res.json({
    asset: symbol,
    signal: data.lastSignal,
    signalsToday: data.signalsToday
  });
});

// Velas de un activo
app.get('/api/candles/:symbol/:timeframe', (req, res) => {
  const { symbol, timeframe } = req.params;
  const { limit = 100 } = req.query;
  
  const data = assetData[symbol];
  if (!data) {
    return res.status(404).json({ error: 'Activo no encontrado' });
  }
  
  const tf = timeframe.toUpperCase();
  if (!data.candles[tf]) {
    return res.status(400).json({ error: 'Timeframe no válido' });
  }
  
  res.json({
    asset: symbol,
    timeframe: tf,
    count: data.candles[tf].length,
    candles: data.candles[tf].slice(-parseInt(limit))
  });
});

// Dashboard data
app.get('/api/dashboard', (req, res) => {
  const assets = Object.entries(assetData).map(([symbol, data]) => {
    const config = CONFIG.ASSETS[symbol];
    const candles = data.candles.M5;
    
    let analysis = null;
    if (candles.length >= 30) {
      const lastCandle = candles[candles.length - 1];
      const signal = SMCEngine.generateSMCSignal({
        candle: lastCandle,
        candles,
        asset: symbol
      });
      analysis = {
        action: signal.action,
        model: signal.model,
        score: signal.score,
        confidence: signal.confidence
      };
    }
    
    return {
      symbol,
      name: config.name,
      type: config.type,
      price: data.lastPrice,
      signalsToday: data.signalsToday,
      lastSignal: data.lastSignal,
      analysis
    };
  });
  
  res.json({
    connected: isConnected,
    timestamp: new Date().toISOString(),
    assets,
    recentSignals: signalHistory.slice(0, 10)
  });
});

// Activos disponibles
app.get('/api/assets', (req, res) => {
  const assets = Object.entries(CONFIG.ASSETS).map(([symbol, config]) => ({
    symbol,
    ...config
  }));
  
  res.json({ assets });
});

// =============================================
// INICIALIZACIÓN
// =============================================
async function init() {
  console.log('🚀 Iniciando Trading Master Pro v8.0...');
  console.log('📋 Modelo: SMC Institucional (Reversal + Continuation)');
  console.log(`📊 Activos: ${Object.keys(CONFIG.ASSETS).length}`);
  
  // Cargar historial
  signalHistory = await Persistence.loadSignalHistory();
  console.log(`📚 Historial: ${signalHistory.length} señales`);
  
  // Conectar a Deriv
  connectDeriv();
  
  // Iniciar keep-alive
  KeepAlive.start();
  
  // Reset diario
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      console.log('🔄 Reset diario de contadores');
      for (const data of Object.values(assetData)) {
        data.signalsToday = 0;
      }
      dailySignals.clear();
      usedStructures.clear();
    }
  }, 60000);
}

// =============================================
// SERVIDOR
// =============================================
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║     TRADING MASTER PRO v8.0 - SMC INSTITUCIONAL               ║
╠═══════════════════════════════════════════════════════════════╣
║  🧠 Motor: SMC Engine Unificado                               ║
║  📋 Modelos:                                                  ║
║     • REVERSAL (Sweep + OB + Displacement)                    ║
║     • CONTINUATION (Tendencia + Estructura)                   ║
║     • INDUCEMENT (incluido en reversal)                       ║
╠═══════════════════════════════════════════════════════════════╣
║  📊 Activos Sintéticos:                                       ║
║     • Step Index                                              ║
║     • Volatility 75 / 100                                     ║
║     • Boom 1000 / Crash 1000                                  ║
║  📊 Commodities:                                              ║
║     • Gold/USD (con modelo Continuation)                      ║
║  📊 Forex:                                                    ║
║     • EUR/USD, GBP/USD                                        ║
╠═══════════════════════════════════════════════════════════════╣
║  🎯 Score mínimo: 70 (válido) / 75 (auto)                     ║
║  📱 Notificaciones: WhatsApp                                  ║
║  💾 Persistencia: Supabase                                    ║
║  🔌 Puerto: ${PORT}                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  
  init();
});

export default app;
