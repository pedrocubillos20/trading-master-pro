// =============================================
// TRADING MASTER PRO v10.0
// Backend con manejo correcto de velas M5/M1
// =============================================

import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// =============================================
// CONFIGURACIÓN DE ACTIVOS
// =============================================
const ASSETS = {
  'stpRNG': { name: 'Step Index', emoji: '📊', type: 'synthetic', decimals: 2 },
  '1HZ75V': { name: 'Volatility 75', emoji: '📈', type: 'synthetic', decimals: 2 },
  '1HZ100V': { name: 'Volatility 100', emoji: '📉', type: 'synthetic', decimals: 2 },
  'frxXAUUSD': { name: 'Oro (XAU/USD)', emoji: '🥇', type: 'commodity', decimals: 2 },
  'frxGBPUSD': { name: 'GBP/USD', emoji: '💷', type: 'forex', decimals: 5 },
  'cryBTCUSD': { name: 'Bitcoin (BTC/USD)', emoji: '₿', type: 'crypto', decimals: 2 }
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
    candles: [],      // Velas M5 completas
    currentCandle: null, // Vela en formación
    price: null,
    signal: null,
    lastAnalysis: 0
  };
}

let signalHistory = [];

// =============================================
// MOTOR SMC
// =============================================
const SMC = {
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

  findLiquidity(candles) {
    const recent = candles.slice(-20);
    return {
      eqh: Math.max(...recent.map(c => c.high)),
      eql: Math.min(...recent.map(c => c.low))
    };
  },

  detectSweep(candle, eqh, eql) {
    if (candle.high > eqh && candle.close < eqh) {
      return { type: 'EQH_SWEEP', side: 'SELL', level: eqh };
    }
    if (candle.low < eql && candle.close > eql) {
      return { type: 'EQL_SWEEP', side: 'BUY', level: eql };
    }
    return null;
  },

  detectDisplacement(candles) {
    if (candles.length < 5) return null;
    
    const ranges = candles.slice(-20).map(c => c.high - c.low);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    
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

  analyze(candles, config) {
    if (candles.length < 30) {
      return { action: 'LOADING', score: 0, model: 'NO_SETUP' };
    }
    
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
    
    if (sweep) {
      score += 30;
      breakdown.push('Sweep +30');
    }
    
    if (displacement?.valid) {
      score += 30;
      breakdown.push(`Displacement ${displacement.magnitude}x +30`);
    }
    
    const direction = sweep?.side || (displacement?.direction === 'BEARISH' ? 'SELL' : displacement?.direction === 'BULLISH' ? 'BUY' : null);
    const ob = direction ? this.findOrderBlock(candles, direction) : null;
    
    if (ob) {
      score += 25;
      breakdown.push('Order Block +25');
    }
    
    const lows = swings.filter(s => s.type === 'low').slice(-3);
    const highs = swings.filter(s => s.type === 'high').slice(-3);
    const higherLows = lows.length >= 2 && lows[lows.length - 1].price > lows[lows.length - 2].price;
    const lowerHighs = highs.length >= 2 && highs[highs.length - 1].price < highs[highs.length - 2].price;
    
    if (higherLows || lowerHighs) {
      score += 15;
      breakdown.push('Estructura +15');
    }
    
    // Generar señal si score >= 70
    if (score >= 70) {
      if (sweep?.side === 'BUY' || displacement?.direction === 'BULLISH') {
        action = 'LONG';
        model = sweep ? 'REVERSAL' : 'CONTINUATION';
        entry = ob ? ob.entry : lastCandle.close;
        stop = ob ? ob.low * 0.9995 : eql * 0.999;
        tp = entry + (entry - stop) * 2;
      } else if (sweep?.side === 'SELL' || displacement?.direction === 'BEARISH') {
        action = 'SHORT';
        model = sweep ? 'REVERSAL' : 'CONTINUATION';
        entry = ob ? ob.entry : lastCandle.close;
        stop = ob ? ob.high * 1.0005 : eqh * 1.001;
        tp = entry - (stop - entry) * 2;
      }
    }
    
    return {
      action,
      model,
      score,
      confidence: score >= 85 ? 'ALTA' : score >= 70 ? 'MEDIA' : 'BAJA',
      breakdown,
      entry: entry ? parseFloat(entry.toFixed(config.decimals)) : null,
      stop: stop ? parseFloat(stop.toFixed(config.decimals)) : null,
      tp: tp ? parseFloat(tp.toFixed(config.decimals)) : null,
      analysis: {
        eqh: eqh.toFixed(config.decimals),
        eql: eql.toFixed(config.decimals),
        sweep: sweep ? `${sweep.type} @ ${sweep.level.toFixed(2)}` : null,
        displacement: displacement?.valid ? `${displacement.direction} ${displacement.magnitude}x` : null,
        ob: ob ? `${ob.type}` : null,
        structure: higherLows ? 'Higher Lows 📈' : lowerHighs ? 'Lower Highs 📉' : 'Neutral ➡️'
      },
      timestamp: new Date().toISOString()
    };
  }
};

// =============================================
// CONEXIÓN DERIV - MANEJO CORRECTO DE VELAS
// =============================================
function connectDeriv() {
  const appId = process.env.DERIV_APP_ID || '117347';
  console.log('🔌 Conectando a Deriv...');
  
  try {
    derivWs = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
  } catch (err) {
    console.error('Error creando WebSocket:', err);
    setTimeout(connectDeriv, 5000);
    return;
  }
  
  derivWs.on('open', () => {
    console.log('✅ Conectado a Deriv API');
    isConnected = true;
    reconnectAttempts = 0;
    
    // Suscribir a cada activo
    for (const symbol of Object.keys(ASSETS)) {
      // 1. Obtener historial de velas M5
      derivWs.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: 100,
        end: 'latest',
        granularity: 300, // M5 = 300 segundos
        style: 'candles',
        subscribe: 1
      }));
      
      // 2. Suscribir a ticks para precio en tiempo real
      derivWs.send(JSON.stringify({
        ticks: symbol,
        subscribe: 1
      }));
    }
  });
  
  derivWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      // Error de Deriv
      if (msg.error) {
        console.error('Deriv error:', msg.error.message);
        return;
      }
      
      // Historial inicial de velas
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
          console.log(`📊 ${ASSETS[symbol].name}: ${assetData[symbol].candles.length} velas M5 cargadas`);
          analyzeAsset(symbol);
        }
      }
      
      // Actualización de vela (OHLC streaming)
      if (msg.ohlc) {
        const symbol = msg.ohlc.symbol;
        if (assetData[symbol]) {
          const newCandle = {
            time: msg.ohlc.open_time * 1000,
            open: parseFloat(msg.ohlc.open),
            high: parseFloat(msg.ohlc.high),
            low: parseFloat(msg.ohlc.low),
            close: parseFloat(msg.ohlc.close)
          };
          
          const candles = assetData[symbol].candles;
          
          if (candles.length > 0) {
            const lastCandle = candles[candles.length - 1];
            
            // Si es la misma vela (mismo tiempo de apertura), actualizarla
            if (lastCandle.time === newCandle.time) {
              candles[candles.length - 1] = newCandle;
            } 
            // Si es una vela nueva (nuevo período), agregarla
            else if (newCandle.time > lastCandle.time) {
              candles.push(newCandle);
              // Mantener máximo 200 velas
              if (candles.length > 200) {
                candles.shift();
              }
              // Analizar cuando hay nueva vela completa
              analyzeAsset(symbol);
            }
          }
          
          // Actualizar precio actual
          assetData[symbol].price = newCandle.close;
        }
      }
      
      // Tick individual (precio en tiempo real)
      if (msg.tick) {
        const symbol = msg.tick.symbol;
        if (assetData[symbol]) {
          assetData[symbol].price = parseFloat(msg.tick.quote);
        }
      }
      
    } catch (err) {
      // Silenciar errores de parse
    }
  });
  
  derivWs.on('close', () => {
    console.log('❌ Desconectado de Deriv');
    isConnected = false;
    reconnectAttempts++;
    const delay = Math.min(5000 * reconnectAttempts, 30000);
    console.log(`🔄 Reconectando en ${delay/1000}s...`);
    setTimeout(connectDeriv, delay);
  });
  
  derivWs.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

// Analizar activo
function analyzeAsset(symbol) {
  const data = assetData[symbol];
  const config = ASSETS[symbol];
  if (!data || !config || data.candles.length < 30) return;
  
  // No analizar más de una vez por segundo
  const now = Date.now();
  if (now - data.lastAnalysis < 1000) return;
  data.lastAnalysis = now;
  
  const signal = SMC.analyze(data.candles, config);
  data.signal = signal;
  
  // Registrar señal si es nueva y válida
  if (signal.action !== 'WAIT' && signal.action !== 'LOADING' && signal.score >= 70) {
    const lastSignal = signalHistory[0];
    const isDuplicate = lastSignal && 
      lastSignal.symbol === symbol && 
      lastSignal.action === signal.action &&
      now - new Date(lastSignal.timestamp).getTime() < 300000; // 5 min cooldown
    
    if (!isDuplicate) {
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

app.get('/', (req, res) => {
  res.json({
    name: 'Trading Master Pro',
    version: '10.0',
    status: 'ok',
    connected: isConnected,
    assets: Object.keys(ASSETS).length,
    methodology: 'SMC (Smart Money Concepts)',
    timeframe: 'M5 (5 minutes)'
  });
});

app.get('/api/dashboard', (req, res) => {
  const assets = Object.entries(assetData).map(([symbol, data]) => {
    const config = ASSETS[symbol];
    return {
      symbol,
      name: config.name,
      emoji: config.emoji,
      type: config.type,
      decimals: config.decimals,
      price: data.price,
      signal: data.signal,
      candleCount: data.candles.length
    };
  });
  
  res.json({
    connected: isConnected,
    timestamp: new Date().toISOString(),
    timeframe: 'M5',
    assets,
    recentSignals: signalHistory.slice(0, 10)
  });
});

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
    decimals: config.decimals,
    price: data.price,
    signal: data.signal,
    candles: data.candles.slice(-60), // Últimas 60 velas M5
    timeframe: 'M5'
  });
});

app.get('/api/signals', (req, res) => {
  res.json({ signals: signalHistory });
});

app.get('/api/status', (req, res) => {
  res.json({
    connected: isConnected,
    reconnectAttempts,
    assets: Object.entries(assetData).map(([s, d]) => ({
      symbol: s,
      name: ASSETS[s].name,
      candles: d.candles.length,
      price: d.price
    }))
  });
});

// =============================================
// INICIO
// =============================================
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║       TRADING MASTER PRO v10.0                    ║
║       SMC • Minimalista • Profesional             ║
╠═══════════════════════════════════════════════════╣
║  Temporalidad: M5 (5 minutos)                     ║
║  Metodología: Smart Money Concepts                ║
║  Puerto: ${PORT}                                      ║
╚═══════════════════════════════════════════════════╝
  `);
  
  connectDeriv();
  
  // Keep-alive ping
  setInterval(() => {
    if (derivWs?.readyState === WebSocket.OPEN) {
      derivWs.send(JSON.stringify({ ping: 1 }));
    }
  }, 30000);
});

export default app;
