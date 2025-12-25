// =============================================
// TRADING MASTER PRO v9.0 - BACKEND LIMPIO
// Solo: V75, V100, Step Index, Oro, GBPUSD, BTC
// =============================================

import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// =============================================
// CONFIGURACIÓN DE ACTIVOS
// =============================================
const ASSETS = {
  // Sintéticos Deriv
  'stpRNG': { 
    name: 'Step Index', 
    emoji: '📊',
    type: 'synthetic',
    decimals: 2,
    minScore: 70
  },
  '1HZ75V': { 
    name: 'Volatility 75', 
    emoji: '📈',
    type: 'synthetic',
    decimals: 2,
    minScore: 70
  },
  '1HZ100V': { 
    name: 'Volatility 100', 
    emoji: '📉',
    type: 'synthetic',
    decimals: 2,
    minScore: 70
  },
  // Commodities
  'frxXAUUSD': { 
    name: 'Oro (XAU/USD)', 
    emoji: '🥇',
    type: 'commodity',
    decimals: 2,
    minScore: 65
  },
  // Forex
  'frxGBPUSD': {
    name: 'GBP/USD',
    emoji: '💷',
    type: 'forex',
    decimals: 5,
    minScore: 70
  },
  // Crypto
  'cryBTCUSD': {
    name: 'Bitcoin (BTC/USD)',
    emoji: '₿',
    type: 'crypto',
    decimals: 2,
    minScore: 70
  }
};

const TIMEFRAMES = { M1: 60, M5: 300, M15: 900, H1: 3600 };

// =============================================
// ESTADO GLOBAL
// =============================================
let derivWs = null;
let isConnected = false;

const assetData = {};
for (const symbol of Object.keys(ASSETS)) {
  assetData[symbol] = {
    candles: { M1: [], M5: [], M15: [], H1: [] },
    price: null,
    signal: null,
    signalsToday: 0
  };
}

let signalHistory = [];
let activeOperations = [];
let tradingPlan = {
  maxRiskPerTrade: 2,
  maxDailyLoss: 6,
  targetRR: 3,
  tradingHours: { start: '08:00', end: '22:00' },
  allowedAssets: Object.keys(ASSETS)
};

// =============================================
// MOTOR SMC - SIMPLIFICADO Y EFECTIVO
// =============================================
const SMC = {
  // Detectar swings
  findSwings(candles, lookback = 5) {
    const swings = [];
    for (let i = lookback; i < candles.length - lookback; i++) {
      const c = candles[i];
      const left = candles.slice(i - lookback, i);
      const right = candles.slice(i + 1, i + lookback + 1);
      
      if (left.every(x => x.high < c.high) && right.every(x => x.high < c.high)) {
        swings.push({ type: 'high', price: c.high, index: i });
      }
      if (left.every(x => x.low > c.low) && right.every(x => x.low > c.low)) {
        swings.push({ type: 'low', price: c.low, index: i });
      }
    }
    return swings.slice(-8);
  },

  // Detectar EQH/EQL
  findLiquidity(candles) {
    const highs = candles.slice(-20).map(c => c.high);
    const lows = candles.slice(-20).map(c => c.low);
    return {
      eqh: Math.max(...highs),
      eql: Math.min(...lows)
    };
  },

  // Detectar sweep
  detectSweep(candle, eqh, eql) {
    if (candle.high > eqh && candle.close < eqh) {
      return { type: 'EQH_SWEEP', side: 'SELL', level: eqh };
    }
    if (candle.low < eql && candle.close > eql) {
      return { type: 'EQL_SWEEP', side: 'BUY', level: eql };
    }
    return null;
  },

  // Detectar displacement
  detectDisplacement(candles) {
    if (candles.length < 3) return null;
    
    const ranges = candles.slice(-20).map(c => c.high - c.low);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    
    // Revisar últimas 10 velas
    for (let i = 1; i <= Math.min(10, candles.length - 1); i++) {
      const c = candles[candles.length - i];
      const body = Math.abs(c.close - c.open);
      
      if (body > avgRange * 1.5) {
        return {
          valid: true,
          direction: c.close > c.open ? 'BULLISH' : 'BEARISH',
          magnitude: (body / avgRange).toFixed(1),
          candlesAgo: i - 1
        };
      }
    }
    return null;
  },

  // Detectar Order Block
  findOrderBlock(candles, direction) {
    for (let i = candles.length - 2; i >= Math.max(0, candles.length - 15); i--) {
      const c = candles[i];
      const isBullish = c.close > c.open;
      
      if (direction === 'SELL' && isBullish) {
        return { type: 'BEARISH_OB', high: c.high, low: c.low, entry: c.open };
      }
      if (direction === 'BUY' && !isBullish) {
        return { type: 'BULLISH_OB', high: c.high, low: c.low, entry: c.open };
      }
    }
    return null;
  },

  // Generar señal
  analyze(candles, assetConfig) {
    if (candles.length < 30) return { action: 'LOADING', score: 0 };
    
    const lastCandle = candles[candles.length - 1];
    const { eqh, eql } = this.findLiquidity(candles);
    const swings = this.findSwings(candles);
    const sweep = this.detectSweep(lastCandle, eqh, eql);
    const displacement = this.detectDisplacement(candles);
    
    let score = 0;
    let breakdown = [];
    let action = 'WAIT';
    let entry = null, stop = null, tp = null;
    let model = 'NO_SETUP';
    
    // Calcular score
    if (sweep) {
      score += 30;
      breakdown.push('Sweep +30');
    }
    
    if (displacement?.valid) {
      score += 30;
      breakdown.push(`Displacement ${displacement.magnitude}x +30`);
    }
    
    const ob = sweep ? this.findOrderBlock(candles, sweep.side) : 
               displacement ? this.findOrderBlock(candles, displacement.direction === 'BEARISH' ? 'SELL' : 'BUY') : null;
    
    if (ob) {
      score += 25;
      breakdown.push('Order Block +25');
    }
    
    // Detectar estructura
    const lows = swings.filter(s => s.type === 'low').slice(-3);
    const highs = swings.filter(s => s.type === 'high').slice(-3);
    
    const higherLows = lows.length >= 2 && lows[lows.length - 1].price > lows[lows.length - 2].price;
    const lowerHighs = highs.length >= 2 && highs[highs.length - 1].price < highs[highs.length - 2].price;
    
    if (higherLows || lowerHighs) {
      score += 15;
      breakdown.push('Estructura +15');
    }
    
    // Generar señal si score >= minScore
    if (score >= assetConfig.minScore) {
      if (sweep?.side === 'BUY' || displacement?.direction === 'BULLISH') {
        action = 'LONG';
        model = sweep ? 'REVERSAL' : 'CONTINUATION';
        entry = ob ? ob.entry : lastCandle.close;
        stop = ob ? ob.low * 0.9995 : eql * 0.999;
        tp = eqh * 1.001;
      } else if (sweep?.side === 'SELL' || displacement?.direction === 'BEARISH') {
        action = 'SHORT';
        model = sweep ? 'REVERSAL' : 'CONTINUATION';
        entry = ob ? ob.entry : lastCandle.close;
        stop = ob ? ob.high * 1.0005 : eqh * 1.001;
        tp = eql * 0.999;
      }
    }
    
    const confidence = score >= 85 ? 'ALTA' : score >= 70 ? 'MEDIA' : 'BAJA';
    
    return {
      action,
      model,
      score,
      confidence,
      breakdown,
      entry: entry ? parseFloat(entry.toFixed(assetConfig.decimals)) : null,
      stop: stop ? parseFloat(stop.toFixed(assetConfig.decimals)) : null,
      tp: tp ? parseFloat(tp.toFixed(assetConfig.decimals)) : null,
      analysis: {
        eqh: eqh.toFixed(assetConfig.decimals),
        eql: eql.toFixed(assetConfig.decimals),
        sweep: sweep ? `${sweep.type} @ ${sweep.level.toFixed(2)}` : null,
        displacement: displacement?.valid ? `${displacement.direction} ${displacement.magnitude}x` : null,
        ob: ob ? `${ob.type} (${ob.low.toFixed(2)} - ${ob.high.toFixed(2)})` : null,
        structure: higherLows ? 'Higher Lows 📈' : lowerHighs ? 'Lower Highs 📉' : 'Neutral ➡️'
      },
      timestamp: new Date().toISOString()
    };
  }
};

// =============================================
// CONEXIÓN DERIV
// =============================================
function connectDeriv() {
  const appId = process.env.DERIV_APP_ID || '117347';
  console.log('🔌 Conectando a Deriv...');
  
  derivWs = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
  
  derivWs.on('open', () => {
    console.log('✅ Conectado a Deriv');
    isConnected = true;
    
    for (const symbol of Object.keys(ASSETS)) {
      // Suscribir a velas M5
      derivWs.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: 100,
        end: 'latest',
        granularity: 300,
        style: 'candles',
        subscribe: 1
      }));
      
      // Suscribir a ticks
      derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    }
  });
  
  derivWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      if (msg.candles) {
        const symbol = msg.echo_req?.ticks_history;
        if (symbol && assetData[symbol]) {
          assetData[symbol].candles.M5 = msg.candles.map(c => ({
            time: c.epoch * 1000,
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close)
          }));
          analyzeAsset(symbol);
        }
      }
      
      if (msg.ohlc) {
        const symbol = msg.ohlc.symbol;
        if (symbol && assetData[symbol]) {
          const candle = {
            time: msg.ohlc.epoch * 1000,
            open: parseFloat(msg.ohlc.open),
            high: parseFloat(msg.ohlc.high),
            low: parseFloat(msg.ohlc.low),
            close: parseFloat(msg.ohlc.close)
          };
          
          const candles = assetData[symbol].candles.M5;
          if (candles.length && candles[candles.length - 1].time === candle.time) {
            candles[candles.length - 1] = candle;
          } else {
            candles.push(candle);
            if (candles.length > 200) candles.shift();
            analyzeAsset(symbol);
          }
        }
      }
      
      if (msg.tick) {
        const symbol = msg.tick.symbol;
        if (symbol && assetData[symbol]) {
          assetData[symbol].price = parseFloat(msg.tick.quote);
        }
      }
    } catch (err) {}
  });
  
  derivWs.on('close', () => {
    isConnected = false;
    setTimeout(connectDeriv, 5000);
  });
  
  derivWs.on('error', () => {});
}

function analyzeAsset(symbol) {
  const data = assetData[symbol];
  const config = ASSETS[symbol];
  if (!data || !config) return;
  
  const signal = SMC.analyze(data.candles.M5, config);
  data.signal = signal;
  
  if (signal.action !== 'WAIT' && signal.action !== 'LOADING' && signal.score >= config.minScore) {
    if (!data.lastSignalTime || Date.now() - data.lastSignalTime > 300000) {
      data.lastSignalTime = Date.now();
      data.signalsToday++;
      
      const fullSignal = {
        ...signal,
        symbol,
        assetName: config.name,
        emoji: config.emoji,
        price: data.price
      };
      
      signalHistory.unshift(fullSignal);
      if (signalHistory.length > 50) signalHistory.pop();
      
      console.log(`\n🎯 SEÑAL ${signal.action} - ${config.name}`);
      console.log(`   Score: ${signal.score} | Entry: ${signal.entry} | SL: ${signal.stop} | TP: ${signal.tp}\n`);
    }
  }
}

// =============================================
// API ENDPOINTS
// =============================================

// Health
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    version: '9.0',
    name: 'Trading Master Pro',
    connected: isConnected,
    assets: Object.keys(ASSETS).length
  });
});

// Dashboard principal
app.get('/api/dashboard', (req, res) => {
  const assets = Object.entries(assetData).map(([symbol, data]) => {
    const config = ASSETS[symbol];
    return {
      symbol,
      name: config.name,
      emoji: config.emoji,
      type: config.type,
      price: data.price,
      decimals: config.decimals,
      signal: data.signal,
      signalsToday: data.signalsToday
    };
  });
  
  res.json({
    connected: isConnected,
    timestamp: new Date().toISOString(),
    assets,
    recentSignals: signalHistory.slice(0, 10),
    activeOperations,
    tradingPlan
  });
});

// Análisis de activo específico
app.get('/api/analyze/:symbol', (req, res) => {
  const { symbol } = req.params;
  const data = assetData[symbol];
  const config = ASSETS[symbol];
  
  if (!data || !config) {
    return res.status(404).json({ error: 'Activo no encontrado' });
  }
  
  res.json({
    symbol,
    name: config.name,
    emoji: config.emoji,
    type: config.type,
    price: data.price,
    decimals: config.decimals,
    signal: data.signal,
    candles: data.candles.M5.slice(-60)
  });
});

// Señales recientes
app.get('/api/signals', (req, res) => {
  res.json({ signals: signalHistory });
});

// =============================================
// OPERACIONES ACTIVAS (Seguimiento)
// =============================================
app.post('/api/operations', (req, res) => {
  const { symbol, action, entry, stop, tp, size, notes } = req.body;
  
  const operation = {
    id: Date.now().toString(),
    symbol,
    assetName: ASSETS[symbol]?.name || symbol,
    action,
    entry,
    stop,
    tp,
    size,
    notes,
    status: 'OPEN',
    openTime: new Date().toISOString(),
    currentPrice: assetData[symbol]?.price,
    pnl: 0
  };
  
  activeOperations.push(operation);
  res.json({ success: true, operation });
});

app.get('/api/operations', (req, res) => {
  // Actualizar PnL de operaciones activas
  activeOperations.forEach(op => {
    if (op.status === 'OPEN' && assetData[op.symbol]) {
      const currentPrice = assetData[op.symbol].price;
      op.currentPrice = currentPrice;
      
      if (op.action === 'LONG') {
        op.pnl = ((currentPrice - op.entry) / op.entry * 100).toFixed(2);
      } else {
        op.pnl = ((op.entry - currentPrice) / op.entry * 100).toFixed(2);
      }
    }
  });
  
  res.json({ operations: activeOperations });
});

app.put('/api/operations/:id', (req, res) => {
  const { id } = req.params;
  const { status, closePrice, result, notes } = req.body;
  
  const op = activeOperations.find(o => o.id === id);
  if (!op) return res.status(404).json({ error: 'Operación no encontrada' });
  
  if (status) op.status = status;
  if (closePrice) op.closePrice = closePrice;
  if (result) op.result = result;
  if (notes) op.notes = notes;
  if (status === 'CLOSED') op.closeTime = new Date().toISOString();
  
  res.json({ success: true, operation: op });
});

// =============================================
// PLAN DE TRADING
// =============================================
app.get('/api/trading-plan', (req, res) => {
  res.json({ plan: tradingPlan });
});

app.put('/api/trading-plan', (req, res) => {
  Object.assign(tradingPlan, req.body);
  res.json({ success: true, plan: tradingPlan });
});

// =============================================
// COACH DE TRADING (Checklist SMC)
// =============================================
const tradingChecklist = [
  { id: 1, category: 'PRE-MARKET', question: '¿Identifiqué la tendencia en H1?', required: true },
  { id: 2, category: 'PRE-MARKET', question: '¿Marqué zonas de liquidez (EQH/EQL)?', required: true },
  { id: 3, category: 'PRE-MARKET', question: '¿Identifiqué Order Blocks importantes?', required: true },
  { id: 4, category: 'ENTRADA', question: '¿Hubo sweep de liquidez?', required: true },
  { id: 5, category: 'ENTRADA', question: '¿Hubo displacement confirmando?', required: true },
  { id: 6, category: 'ENTRADA', question: '¿El precio está en zona de descuento/premium?', required: false },
  { id: 7, category: 'ENTRADA', question: '¿El R:R es mínimo 1:2?', required: true },
  { id: 8, category: 'GESTIÓN', question: '¿El riesgo es máximo 2% del capital?', required: true },
  { id: 9, category: 'GESTIÓN', question: '¿Tengo stop loss definido?', required: true },
  { id: 10, category: 'GESTIÓN', question: '¿Tengo take profit definido?', required: true },
  { id: 11, category: 'EMOCIONAL', question: '¿Estoy en estado emocional neutral?', required: true },
  { id: 12, category: 'EMOCIONAL', question: '¿No estoy operando por venganza?', required: true }
];

app.get('/api/coach/checklist', (req, res) => {
  res.json({ checklist: tradingChecklist });
});

app.post('/api/coach/evaluate', (req, res) => {
  const { answers } = req.body; // { 1: true, 2: true, ... }
  
  let passed = 0;
  let failed = 0;
  let requiredFailed = [];
  
  tradingChecklist.forEach(item => {
    if (answers[item.id]) {
      passed++;
    } else {
      failed++;
      if (item.required) {
        requiredFailed.push(item.question);
      }
    }
  });
  
  const score = Math.round((passed / tradingChecklist.length) * 100);
  const canTrade = requiredFailed.length === 0 && score >= 75;
  
  res.json({
    score,
    passed,
    failed,
    canTrade,
    requiredFailed,
    recommendation: canTrade 
      ? '✅ Puedes operar. Todos los requisitos cumplidos.'
      : `❌ NO operar. Faltan: ${requiredFailed.join(', ')}`
  });
});

// =============================================
// CHAT / MENSAJES
// =============================================
let chatMessages = [];

app.get('/api/chat', (req, res) => {
  res.json({ messages: chatMessages.slice(-50) });
});

app.post('/api/chat', (req, res) => {
  const { user, message, type = 'text' } = req.body;
  
  const msg = {
    id: Date.now().toString(),
    user: user || 'Trader',
    message,
    type,
    timestamp: new Date().toISOString()
  };
  
  chatMessages.push(msg);
  if (chatMessages.length > 100) chatMessages.shift();
  
  res.json({ success: true, message: msg });
});

// =============================================
// INICIO
// =============================================
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║     TRADING MASTER PRO v9.0 - SMC INSTITUCIONAL               ║
╠═══════════════════════════════════════════════════════════════╣
║  📊 Activos:                                                  ║
║     • Step Index                                              ║
║     • Volatility 75 / 100                                     ║
║     • Oro (XAU/USD)                                           ║
║     • GBP/USD                                                 ║
║     • Bitcoin (BTC/USD)                                       ║
╠═══════════════════════════════════════════════════════════════╣
║  🎯 Funciones:                                                ║
║     • Señales SMC con Entry/SL/TP                             ║
║     • Seguimiento de operaciones                              ║
║     • Coach de Trading (Checklist)                            ║
║     • Plan de Trading                                         ║
║     • Chat en vivo                                            ║
╠═══════════════════════════════════════════════════════════════╣
║  🔌 Puerto: ${PORT}                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  
  connectDeriv();
  
  // Keep-alive
  setInterval(() => {
    if (derivWs?.readyState === WebSocket.OPEN) {
      derivWs.send(JSON.stringify({ ping: 1 }));
    }
  }, 240000);
});

export default app;
