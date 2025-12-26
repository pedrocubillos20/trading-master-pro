// =============================================
// TRADING MASTER PRO v10.3
// TP1/TP2/TP3 + Auto-tracking + CHoCH
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
// CONFIGURACIÓN
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
    candles: [],
    price: null,
    signal: null,
    lastAnalysis: 0
  };
}

let signalHistory = [];
let signalIdCounter = 1;

// Estadísticas con aprendizaje
const stats = {
  total: 0,
  wins: 0,
  losses: 0,
  notTaken: 0,
  pending: 0,
  tp1Hits: 0,
  tp2Hits: 0,
  tp3Hits: 0,
  // Por modelo
  byModel: {
    REVERSAL: { wins: 0, losses: 0 },
    CONTINUATION: { wins: 0, losses: 0 },
    CHOCH: { wins: 0, losses: 0 }
  },
  // Por activo
  byAsset: {}
};

// Inicializar stats por activo
for (const symbol of Object.keys(ASSETS)) {
  stats.byAsset[symbol] = { wins: 0, losses: 0 };
}

// =============================================
// MOTOR SMC CON CHOCH
// =============================================
const SMC = {
  // Encontrar swings
  findSwings(candles, lookback = 5) {
    const swings = [];
    for (let i = lookback; i < candles.length - lookback; i++) {
      const c = candles[i];
      const left = candles.slice(i - lookback, i);
      const right = candles.slice(i + 1, i + lookback + 1);
      
      if (left.every(x => x.high < c.high) && right.every(x => x.high < c.high)) {
        swings.push({ type: 'high', price: c.high, index: i, time: c.time });
      }
      if (left.every(x => x.low > c.low) && right.every(x => x.low > c.low)) {
        swings.push({ type: 'low', price: c.low, index: i, time: c.time });
      }
    }
    return swings.slice(-10);
  },

  // Encontrar liquidez
  findLiquidity(candles) {
    const recent = candles.slice(-20);
    return {
      eqh: Math.max(...recent.map(c => c.high)),
      eql: Math.min(...recent.map(c => c.low))
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

  // Detectar CHoCH (Change of Character)
  detectCHoCH(candles, swings) {
    if (swings.length < 4) return null;
    
    const recentSwings = swings.slice(-6);
    const highs = recentSwings.filter(s => s.type === 'high');
    const lows = recentSwings.filter(s => s.type === 'low');
    
    if (highs.length < 2 || lows.length < 2) return null;
    
    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    
    // CHoCH Bajista: Estaba haciendo Higher Highs y rompe un Low
    const lastHigh = highs[highs.length - 1];
    const prevHigh = highs[highs.length - 2];
    const lastLow = lows[lows.length - 1];
    
    // CHoCH Alcista: Estaba haciendo Lower Lows y rompe un High
    const prevLow = lows[lows.length - 2];
    
    // Detectar CHoCH bajista (rompe low después de higher highs)
    if (prevHigh && lastHigh && lastHigh.price > prevHigh.price) {
      // Tendencia alcista previa
      if (lastCandle.close < lastLow.price && prevCandle.close > lastLow.price) {
        return {
          type: 'BEARISH_CHOCH',
          side: 'SELL',
          level: lastLow.price,
          description: 'Rompió estructura alcista'
        };
      }
    }
    
    // Detectar CHoCH alcista (rompe high después de lower lows)
    if (prevLow && lastLow && lastLow.price < prevLow.price) {
      // Tendencia bajista previa
      if (lastCandle.close > lastHigh.price && prevCandle.close < lastHigh.price) {
        return {
          type: 'BULLISH_CHOCH',
          side: 'BUY',
          level: lastHigh.price,
          description: 'Rompió estructura bajista'
        };
      }
    }
    
    return null;
  },

  // Detectar BOS (Break of Structure)
  detectBOS(candles, swings) {
    if (swings.length < 3) return null;
    
    const lastCandle = candles[candles.length - 1];
    const highs = swings.filter(s => s.type === 'high').slice(-3);
    const lows = swings.filter(s => s.type === 'low').slice(-3);
    
    // BOS alcista: rompe high previo en tendencia alcista
    if (highs.length >= 2) {
      const lastHigh = highs[highs.length - 1];
      if (lastCandle.close > lastHigh.price) {
        return { type: 'BULLISH_BOS', side: 'BUY', level: lastHigh.price };
      }
    }
    
    // BOS bajista: rompe low previo en tendencia bajista
    if (lows.length >= 2) {
      const lastLow = lows[lows.length - 1];
      if (lastCandle.close < lastLow.price) {
        return { type: 'BEARISH_BOS', side: 'SELL', level: lastLow.price };
      }
    }
    
    return null;
  },

  // Detectar displacement
  detectDisplacement(candles) {
    if (candles.length < 5) return null;
    
    const ranges = candles.slice(-20).map(c => c.high - c.low);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    
    for (let i = 1; i <= Math.min(5, candles.length - 1); i++) {
      const c = candles[candles.length - i];
      const body = Math.abs(c.close - c.open);
      
      if (body > avgRange * 1.5) {
        return {
          valid: true,
          direction: c.close > c.open ? 'BULLISH' : 'BEARISH',
          magnitude: (body / avgRange).toFixed(1)
        };
      }
    }
    return null;
  },

  // Encontrar Order Block
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

  // Análisis completo
  analyze(candles, config) {
    if (candles.length < 30) {
      return { action: 'LOADING', score: 0, model: 'NO_SETUP' };
    }
    
    const lastCandle = candles[candles.length - 1];
    const currentPrice = lastCandle.close;
    const { eqh, eql } = this.findLiquidity(candles);
    const swings = this.findSwings(candles);
    
    // Detectar patrones
    const sweep = this.detectSweep(lastCandle, eqh, eql);
    const choch = this.detectCHoCH(candles, swings);
    const bos = this.detectBOS(candles, swings);
    const displacement = this.detectDisplacement(candles);
    
    let score = 0;
    let breakdown = [];
    let action = 'WAIT';
    let entry = null, stop = null, tp1 = null, tp2 = null, tp3 = null;
    let model = 'NO_SETUP';
    
    // Scoring
    if (sweep) {
      score += 30;
      breakdown.push(`Sweep ${sweep.type}`);
    }
    
    if (choch) {
      score += 35; // CHoCH es muy importante
      breakdown.push(`CHoCH ${choch.type}`);
    }
    
    if (bos && !choch) {
      score += 20;
      breakdown.push(`BOS ${bos.type}`);
    }
    
    if (displacement?.valid) {
      score += 25;
      breakdown.push(`Displacement ${displacement.direction}`);
    }
    
    // Determinar dirección
    let direction = null;
    if (choch) {
      direction = choch.side;
      model = 'CHOCH';
    } else if (sweep) {
      direction = sweep.side;
      model = 'REVERSAL';
    } else if (displacement?.valid) {
      direction = displacement.direction === 'BULLISH' ? 'BUY' : 'SELL';
      model = 'CONTINUATION';
    } else if (bos) {
      direction = bos.side;
      model = 'CONTINUATION';
    }
    
    const ob = direction ? this.findOrderBlock(candles, direction) : null;
    
    if (ob) {
      score += 15;
      breakdown.push(`Order Block ${ob.type}`);
    }
    
    // Estructura
    const lows = swings.filter(s => s.type === 'low').slice(-3);
    const highs = swings.filter(s => s.type === 'high').slice(-3);
    const higherLows = lows.length >= 2 && lows[lows.length - 1].price > lows[lows.length - 2].price;
    const lowerHighs = highs.length >= 2 && highs[highs.length - 1].price < highs[highs.length - 2].price;
    
    // Generar señal si score >= 70
    if (score >= 70 && direction) {
      if (direction === 'BUY') {
        action = 'LONG';
        entry = ob ? ob.entry : currentPrice;
        stop = ob ? ob.low * 0.9995 : eql * 0.999;
        const risk = entry - stop;
        tp1 = entry + risk * 1;      // 1:1 RR
        tp2 = entry + risk * 2;      // 1:2 RR
        tp3 = entry + risk * 3;      // 1:3 RR
      } else if (direction === 'SELL') {
        action = 'SHORT';
        entry = ob ? ob.entry : currentPrice;
        stop = ob ? ob.high * 1.0005 : eqh * 1.001;
        const risk = stop - entry;
        tp1 = entry - risk * 1;      // 1:1 RR
        tp2 = entry - risk * 2;      // 1:2 RR
        tp3 = entry - risk * 3;      // 1:3 RR
      }
    }
    
    return {
      action, model, score, breakdown,
      entry: entry ? parseFloat(entry.toFixed(config.decimals)) : null,
      stop: stop ? parseFloat(stop.toFixed(config.decimals)) : null,
      tp1: tp1 ? parseFloat(tp1.toFixed(config.decimals)) : null,
      tp2: tp2 ? parseFloat(tp2.toFixed(config.decimals)) : null,
      tp3: tp3 ? parseFloat(tp3.toFixed(config.decimals)) : null,
      analysis: {
        eqh: eqh.toFixed(config.decimals),
        eql: eql.toFixed(config.decimals),
        sweep: sweep?.type,
        choch: choch?.type,
        bos: bos?.type,
        displacement: displacement?.valid ? `${displacement.direction} ${displacement.magnitude}x` : null,
        ob: ob?.type,
        structure: higherLows ? 'Higher Lows' : lowerHighs ? 'Lower Highs' : 'Neutral'
      },
      timestamp: new Date().toISOString()
    };
  }
};

// =============================================
// AUTO-TRACKING DE SEÑALES
// =============================================
function checkSignalHits() {
  const pendingSignals = signalHistory.filter(s => s.status === 'PENDING');
  
  for (const signal of pendingSignals) {
    const data = assetData[signal.symbol];
    if (!data || !data.price) continue;
    
    const price = data.price;
    const isLong = signal.action === 'LONG';
    
    // Verificar SL
    if (isLong && price <= signal.stop) {
      markSignal(signal.id, 'LOSS', 'AUTO');
      console.log(`❌ AUTO-LOSS: ${signal.assetName} tocó SL en ${price}`);
      continue;
    }
    if (!isLong && price >= signal.stop) {
      markSignal(signal.id, 'LOSS', 'AUTO');
      console.log(`❌ AUTO-LOSS: ${signal.assetName} tocó SL en ${price}`);
      continue;
    }
    
    // Verificar TPs
    if (isLong) {
      if (price >= signal.tp3 && !signal.tp3Hit) {
        signal.tp3Hit = true;
        signal.tpLevel = 3;
        stats.tp3Hits++;
        markSignal(signal.id, 'WIN', 'AUTO-TP3');
        console.log(`✅ AUTO-WIN TP3: ${signal.assetName} en ${price}`);
      } else if (price >= signal.tp2 && !signal.tp2Hit) {
        signal.tp2Hit = true;
        signal.tpLevel = Math.max(signal.tpLevel || 0, 2);
        stats.tp2Hits++;
        console.log(`🎯 TP2 HIT: ${signal.assetName} en ${price}`);
      } else if (price >= signal.tp1 && !signal.tp1Hit) {
        signal.tp1Hit = true;
        signal.tpLevel = Math.max(signal.tpLevel || 0, 1);
        stats.tp1Hits++;
        console.log(`🎯 TP1 HIT: ${signal.assetName} en ${price}`);
      }
    } else {
      if (price <= signal.tp3 && !signal.tp3Hit) {
        signal.tp3Hit = true;
        signal.tpLevel = 3;
        stats.tp3Hits++;
        markSignal(signal.id, 'WIN', 'AUTO-TP3');
        console.log(`✅ AUTO-WIN TP3: ${signal.assetName} en ${price}`);
      } else if (price <= signal.tp2 && !signal.tp2Hit) {
        signal.tp2Hit = true;
        signal.tpLevel = Math.max(signal.tpLevel || 0, 2);
        stats.tp2Hits++;
        console.log(`🎯 TP2 HIT: ${signal.assetName} en ${price}`);
      } else if (price <= signal.tp1 && !signal.tp1Hit) {
        signal.tp1Hit = true;
        signal.tpLevel = Math.max(signal.tpLevel || 0, 1);
        stats.tp1Hits++;
        console.log(`🎯 TP1 HIT: ${signal.assetName} en ${price}`);
      }
    }
  }
}

function markSignal(id, status, source = 'MANUAL') {
  const signal = signalHistory.find(s => s.id === id);
  if (!signal || signal.status !== 'PENDING') return;
  
  signal.status = status;
  signal.closedAt = new Date().toISOString();
  signal.closedBy = source;
  
  // Actualizar estadísticas
  if (status === 'WIN') {
    stats.wins++;
    stats.byModel[signal.model] = stats.byModel[signal.model] || { wins: 0, losses: 0 };
    stats.byModel[signal.model].wins++;
    stats.byAsset[signal.symbol] = stats.byAsset[signal.symbol] || { wins: 0, losses: 0 };
    stats.byAsset[signal.symbol].wins++;
  } else if (status === 'LOSS') {
    stats.losses++;
    stats.byModel[signal.model] = stats.byModel[signal.model] || { wins: 0, losses: 0 };
    stats.byModel[signal.model].losses++;
    stats.byAsset[signal.symbol] = stats.byAsset[signal.symbol] || { wins: 0, losses: 0 };
    stats.byAsset[signal.symbol].losses++;
  } else if (status === 'NOT_TAKEN') {
    stats.notTaken++;
  }
  
  stats.pending = signalHistory.filter(s => s.status === 'PENDING').length;
  
  return signal;
}

// =============================================
// GENERADOR DE NARRACIÓN
// =============================================
const AI = {
  generateNarration(symbol) {
    const data = assetData[symbol];
    const config = ASSETS[symbol];
    if (!data || !config) return null;
    
    const signal = data.signal;
    const price = data.price;
    const candles = data.candles.slice(-10);
    
    let trend = 'lateral';
    if (candles.length >= 5) {
      const change = ((candles[candles.length - 1].close - candles[0].close) / candles[0].close) * 100;
      if (change > 0.1) trend = 'alcista';
      else if (change < -0.1) trend = 'bajista';
    }
    
    const lines = [];
    lines.push(`📊 **${config.name}** @ ${price?.toFixed(config.decimals) || '---'}`);
    lines.push(`📈 Tendencia: ${trend}`);
    
    if (signal?.analysis?.choch) {
      lines.push(`⚡ **CHoCH DETECTADO**: ${signal.analysis.choch}`);
    }
    
    if (signal?.analysis?.sweep) {
      lines.push(`🎯 Sweep: ${signal.analysis.sweep}`);
    }
    
    if (signal?.analysis?.eqh && signal?.analysis?.eql) {
      lines.push(`💧 Liquidez: EQH ${signal.analysis.eqh} | EQL ${signal.analysis.eql}`);
    }
    
    if (signal?.action && !['WAIT', 'LOADING'].includes(signal.action)) {
      const emoji = signal.action === 'LONG' ? '🟢' : '🔴';
      lines.push(`\n${emoji} **SEÑAL ${signal.action}** (${signal.model})`);
      lines.push(`Score: ${signal.score}%`);
    }
    
    return { text: lines.join('\n'), timestamp: new Date().toISOString() };
  },
  
  answerQuestion(question, symbol) {
    const data = assetData[symbol];
    const config = ASSETS[symbol];
    const signal = data?.signal;
    const q = question.toLowerCase();
    let answer = '';
    
    if (q.includes('estadística') || q.includes('win') || q.includes('rate')) {
      const totalDecided = stats.wins + stats.losses;
      const winRate = totalDecided > 0 ? ((stats.wins / totalDecided) * 100).toFixed(1) : 0;
      
      answer = `📊 **Estadísticas Globales:**\n\n`;
      answer += `✅ Wins: ${stats.wins} | ❌ Losses: ${stats.losses}\n`;
      answer += `📈 Win Rate: ${winRate}%\n\n`;
      answer += `🎯 TPs alcanzados:\n`;
      answer += `  TP1: ${stats.tp1Hits} | TP2: ${stats.tp2Hits} | TP3: ${stats.tp3Hits}\n\n`;
      
      answer += `📋 **Por Modelo:**\n`;
      for (const [model, s] of Object.entries(stats.byModel)) {
        if (s.wins + s.losses > 0) {
          const wr = ((s.wins / (s.wins + s.losses)) * 100).toFixed(0);
          answer += `  ${model}: ${s.wins}W/${s.losses}L (${wr}%)\n`;
        }
      }
    }
    else if (q.includes('choch') || q.includes('cambio')) {
      answer = `⚡ **CHoCH (Change of Character):**\n\n`;
      answer += `Es un cambio de estructura del mercado.\n`;
      answer += `• CHoCH Alcista: Rompe high después de lower lows\n`;
      answer += `• CHoCH Bajista: Rompe low después de higher highs\n\n`;
      
      if (signal?.analysis?.choch) {
        answer += `🎯 **DETECTADO**: ${signal.analysis.choch} en ${config.name}`;
      } else {
        answer += `⏳ No hay CHoCH activo en ${config.name}`;
      }
    }
    else if (q.includes('señal') || q.includes('entrada')) {
      if (signal?.action && !['WAIT', 'LOADING'].includes(signal.action)) {
        answer = `🎯 **Señal ${signal.action}** en ${config.name}\n\n`;
        answer += `📍 Entry: ${signal.entry}\n`;
        answer += `🛑 Stop: ${signal.stop}\n`;
        answer += `✅ TP1: ${signal.tp1} (1:1)\n`;
        answer += `✅ TP2: ${signal.tp2} (1:2)\n`;
        answer += `✅ TP3: ${signal.tp3} (1:3)\n\n`;
        answer += `📊 Modelo: ${signal.model}\n`;
        answer += `Score: ${signal.score}%`;
      } else {
        answer = `⏳ Sin señal activa en ${config.name}`;
      }
    }
    else {
      answer = `📊 ${config.name}: ${data?.price?.toFixed(config.decimals) || '---'}`;
    }
    
    return { answer, timestamp: new Date().toISOString() };
  }
};

// =============================================
// CONEXIÓN DERIV
// =============================================
function connectDeriv() {
  const appId = process.env.DERIV_APP_ID || '117347';
  console.log('🔌 Conectando a Deriv...');
  
  try {
    derivWs = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
  } catch (err) {
    setTimeout(connectDeriv, 5000);
    return;
  }
  
  derivWs.on('open', () => {
    console.log('✅ Conectado a Deriv API');
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
      
      derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    }
  });
  
  derivWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
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
          analyzeAsset(symbol);
        }
      }
      
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
            
            if (lastCandle.time === newCandle.time) {
              candles[candles.length - 1] = newCandle;
            } else if (newCandle.time > lastCandle.time) {
              candles.push(newCandle);
              if (candles.length > 200) candles.shift();
              analyzeAsset(symbol);
            }
          }
          
          assetData[symbol].price = newCandle.close;
          
          // Auto-tracking
          checkSignalHits();
        }
      }
      
      if (msg.tick) {
        const symbol = msg.tick.symbol;
        if (assetData[symbol]) {
          assetData[symbol].price = parseFloat(msg.tick.quote);
          checkSignalHits();
        }
      }
    } catch (err) {}
  });
  
  derivWs.on('close', () => {
    isConnected = false;
    reconnectAttempts++;
    setTimeout(connectDeriv, Math.min(5000 * reconnectAttempts, 30000));
  });
  
  derivWs.on('error', () => {});
}

function analyzeAsset(symbol) {
  const data = assetData[symbol];
  const config = ASSETS[symbol];
  if (!data || !config || data.candles.length < 30) return;
  
  const now = Date.now();
  if (now - data.lastAnalysis < 1000) return;
  data.lastAnalysis = now;
  
  const signal = SMC.analyze(data.candles, config);
  data.signal = signal;
  
  // Crear señal si es válida y no hay pendiente
  if (signal.action !== 'WAIT' && signal.action !== 'LOADING' && signal.score >= 70) {
    const hasPending = signalHistory.some(s => 
      s.symbol === symbol && 
      s.status === 'PENDING' &&
      now - new Date(s.timestamp).getTime() < 600000
    );
    
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
        tpLevel: 0,
        price: data.price,
        status: 'PENDING',
        timestamp: new Date().toISOString(),
        closedAt: null,
        closedBy: null,
        breakdown: signal.breakdown
      };
      
      signalHistory.unshift(newSignal);
      stats.total++;
      stats.pending++;
      
      if (signalHistory.length > 100) signalHistory.pop();
      
      console.log(`\n🎯 SEÑAL #${newSignal.id}: ${signal.action} ${config.name} (${signal.model})`);
      console.log(`   Entry: ${signal.entry} | SL: ${signal.stop}`);
      console.log(`   TP1: ${signal.tp1} | TP2: ${signal.tp2} | TP3: ${signal.tp3}\n`);
    }
  }
}

// =============================================
// API ENDPOINTS
// =============================================

app.get('/', (req, res) => {
  res.json({
    name: 'Trading Master Pro',
    version: '10.3',
    features: ['SMC', 'CHoCH', 'TP1/TP2/TP3', 'Auto-tracking'],
    connected: isConnected
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
    recentSignals: signalHistory.slice(0, 20),
    stats
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
    candles: data.candles.slice(-60),
    timeframe: 'M5'
  });
});

app.get('/api/signals', (req, res) => {
  res.json({ signals: signalHistory, stats });
});

app.put('/api/signals/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  if (!['WIN', 'LOSS', 'NOT_TAKEN'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  
  const signal = markSignal(parseInt(id), status, 'MANUAL');
  
  if (!signal) {
    return res.status(404).json({ error: 'Señal no encontrada o ya cerrada' });
  }
  
  res.json({ success: true, signal, stats });
});

app.get('/api/stats', (req, res) => {
  const totalDecided = stats.wins + stats.losses;
  const winRate = totalDecided > 0 ? ((stats.wins / totalDecided) * 100).toFixed(1) : 0;
  
  res.json({
    ...stats,
    winRate: parseFloat(winRate)
  });
});

app.get('/api/ai/narrate/:symbol', (req, res) => {
  const narration = AI.generateNarration(req.params.symbol);
  if (!narration) return res.status(404).json({ error: 'Activo no encontrado' });
  res.json(narration);
});

app.post('/api/ai/chat', (req, res) => {
  const { question, symbol } = req.body;
  if (!question || !symbol) return res.status(400).json({ error: 'Faltan parámetros' });
  res.json(AI.answerQuestion(question, symbol));
});

// =============================================
// INICIO
// =============================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║         TRADING MASTER PRO v10.3                           ║
║         TP1/TP2/TP3 + Auto-tracking + CHoCH                ║
╠════════════════════════════════════════════════════════════╣
║  🎯 TP1 (1:1) | TP2 (1:2) | TP3 (1:3)                      ║
║  ⚡ CHoCH Detection (Change of Character)                  ║
║  🤖 Auto-tracking: Detecta WIN/LOSS automáticamente        ║
║  📊 Estadísticas por modelo y activo                       ║
╠════════════════════════════════════════════════════════════╣
║  Puerto: ${PORT}                                               ║
╚════════════════════════════════════════════════════════════╝
  `);
  
  connectDeriv();
  
  setInterval(() => {
    if (derivWs?.readyState === WebSocket.OPEN) {
      derivWs.send(JSON.stringify({ ping: 1 }));
    }
  }, 30000);
});

export default app;
