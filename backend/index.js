// =============================================
// TRADING MASTER PRO v10.1
// Con IA: Narración en vivo + Chat
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
    lastAnalysis: 0,
    priceHistory: [] // Para tracking de movimiento
  };
}

let signalHistory = [];
let aiNarrations = []; // Historial de narraciones
let chatHistory = [];  // Historial de chat

// =============================================
// MOTOR SMC (Sin cambios)
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
          magnitude: (body / avgRange).toFixed(1)
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
      breakdown.push('Sweep de liquidez detectado');
    }
    
    if (displacement?.valid) {
      score += 30;
      breakdown.push(`Displacement ${displacement.direction} (${displacement.magnitude}x)`);
    }
    
    const direction = sweep?.side || (displacement?.direction === 'BEARISH' ? 'SELL' : displacement?.direction === 'BULLISH' ? 'BUY' : null);
    const ob = direction ? this.findOrderBlock(candles, direction) : null;
    
    if (ob) {
      score += 25;
      breakdown.push(`Order Block ${ob.type} identificado`);
    }
    
    const lows = swings.filter(s => s.type === 'low').slice(-3);
    const highs = swings.filter(s => s.type === 'high').slice(-3);
    const higherLows = lows.length >= 2 && lows[lows.length - 1].price > lows[lows.length - 2].price;
    const lowerHighs = highs.length >= 2 && highs[highs.length - 1].price < highs[highs.length - 2].price;
    
    if (higherLows || lowerHighs) {
      score += 15;
      breakdown.push(higherLows ? 'Estructura alcista (Higher Lows)' : 'Estructura bajista (Lower Highs)');
    }
    
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
      action, model, score, breakdown,
      entry: entry ? parseFloat(entry.toFixed(config.decimals)) : null,
      stop: stop ? parseFloat(stop.toFixed(config.decimals)) : null,
      tp: tp ? parseFloat(tp.toFixed(config.decimals)) : null,
      analysis: {
        eqh: eqh.toFixed(config.decimals),
        eql: eql.toFixed(config.decimals),
        sweep, displacement,
        ob: ob ? ob.type : null,
        structure: higherLows ? 'Higher Lows' : lowerHighs ? 'Lower Highs' : 'Neutral'
      },
      timestamp: new Date().toISOString()
    };
  }
};

// =============================================
// IA - GENERADOR DE NARRACIÓN Y RESPUESTAS
// =============================================
const AI = {
  // Genera contexto del mercado para la IA
  getMarketContext(symbol) {
    const data = assetData[symbol];
    const config = ASSETS[symbol];
    if (!data || !config) return null;
    
    const candles = data.candles.slice(-20);
    const signal = data.signal;
    const price = data.price;
    
    // Calcular tendencia reciente
    let trend = 'lateral';
    if (candles.length >= 5) {
      const recent5 = candles.slice(-5);
      const firstClose = recent5[0].close;
      const lastClose = recent5[recent5.length - 1].close;
      const change = ((lastClose - firstClose) / firstClose) * 100;
      
      if (change > 0.1) trend = 'alcista';
      else if (change < -0.1) trend = 'bajista';
    }
    
    // Calcular volatilidad
    const ranges = candles.map(c => c.high - c.low);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    const volatility = avgRange > price * 0.002 ? 'alta' : avgRange > price * 0.001 ? 'media' : 'baja';
    
    // Última vela
    const lastCandle = candles[candles.length - 1];
    const lastCandleType = lastCandle?.close >= lastCandle?.open ? 'alcista' : 'bajista';
    
    return {
      asset: config.name,
      symbol,
      price,
      trend,
      volatility,
      lastCandleType,
      signal: signal || { action: 'WAIT', score: 0 },
      eqh: signal?.analysis?.eqh,
      eql: signal?.analysis?.eql,
      structure: signal?.analysis?.structure,
      hasSignal: signal?.action && !['WAIT', 'LOADING'].includes(signal.action)
    };
  },
  
  // Genera narración automática del mercado
  generateNarration(symbol) {
    const ctx = this.getMarketContext(symbol);
    if (!ctx) return null;
    
    const narratives = [];
    
    // Introducción
    narratives.push(`📊 **${ctx.asset}** cotiza en ${ctx.price?.toFixed(ASSETS[symbol].decimals) || '---'}`);
    
    // Tendencia
    if (ctx.trend === 'alcista') {
      narratives.push(`📈 Tendencia alcista en las últimas velas. Los compradores mantienen el control.`);
    } else if (ctx.trend === 'bajista') {
      narratives.push(`📉 Tendencia bajista activa. Presión vendedora dominante.`);
    } else {
      narratives.push(`➡️ Movimiento lateral. El mercado está consolidando.`);
    }
    
    // Volatilidad
    if (ctx.volatility === 'alta') {
      narratives.push(`⚡ Volatilidad ALTA - Movimientos amplios, precaución.`);
    } else if (ctx.volatility === 'baja') {
      narratives.push(`😴 Volatilidad baja - Mercado tranquilo.`);
    }
    
    // Niveles clave
    if (ctx.eqh && ctx.eql) {
      narratives.push(`🎯 Liquidez: EQH en ${ctx.eqh} | EQL en ${ctx.eql}`);
    }
    
    // Estructura
    if (ctx.structure && ctx.structure !== 'Neutral') {
      narratives.push(`🏗️ Estructura: ${ctx.structure}`);
    }
    
    // Señal
    if (ctx.hasSignal) {
      const sig = ctx.signal;
      if (sig.action === 'LONG') {
        narratives.push(`\n🟢 **SEÑAL LONG ACTIVA** (Score: ${sig.score}%)`);
        narratives.push(`Entry: ${sig.entry} | SL: ${sig.stop} | TP: ${sig.tp}`);
        narratives.push(`Modelo: ${sig.model}`);
      } else if (sig.action === 'SHORT') {
        narratives.push(`\n🔴 **SEÑAL SHORT ACTIVA** (Score: ${sig.score}%)`);
        narratives.push(`Entry: ${sig.entry} | SL: ${sig.stop} | TP: ${sig.tp}`);
        narratives.push(`Modelo: ${sig.model}`);
      }
    } else {
      narratives.push(`\n⏳ Sin señal activa. Esperando setup SMC válido.`);
    }
    
    return {
      text: narratives.join('\n'),
      timestamp: new Date().toISOString(),
      symbol,
      asset: ctx.asset
    };
  },
  
  // Responde preguntas del usuario sobre el mercado
  answerQuestion(question, symbol) {
    const ctx = this.getMarketContext(symbol);
    if (!ctx) {
      return {
        answer: "No tengo datos de ese activo en este momento.",
        timestamp: new Date().toISOString()
      };
    }
    
    const q = question.toLowerCase();
    let answer = '';
    
    // Detectar intención de la pregunta
    if (q.includes('señal') || q.includes('signal') || q.includes('entrada') || q.includes('operar')) {
      if (ctx.hasSignal) {
        const sig = ctx.signal;
        answer = `🎯 Sí, hay una señal ${sig.action} activa en ${ctx.asset}.\n\n`;
        answer += `📍 **Entry:** ${sig.entry}\n`;
        answer += `🛑 **Stop Loss:** ${sig.stop}\n`;
        answer += `✅ **Take Profit:** ${sig.tp}\n`;
        answer += `📊 **Score:** ${sig.score}%\n`;
        answer += `🏷️ **Modelo:** ${sig.model}\n\n`;
        
        if (sig.score >= 85) {
          answer += `💪 Es una señal de ALTA confianza. Los elementos SMC están alineados.`;
        } else if (sig.score >= 70) {
          answer += `👍 Señal válida pero no perfecta. Considera gestionar bien el riesgo.`;
        }
      } else {
        answer = `⏳ No hay señal activa en ${ctx.asset} en este momento.\n\n`;
        answer += `El score actual es ${ctx.signal?.score || 0}%. Necesitamos mínimo 70% para una señal válida.\n\n`;
        answer += `📊 Estoy monitoreando:\n`;
        answer += `- Sweep de liquidez en EQH (${ctx.eqh}) o EQL (${ctx.eql})\n`;
        answer += `- Displacement (vela fuerte de confirmación)\n`;
        answer += `- Order Block para entrada\n`;
      }
    }
    else if (q.includes('tendencia') || q.includes('trend') || q.includes('dirección')) {
      answer = `📈 **Tendencia actual de ${ctx.asset}:**\n\n`;
      answer += `La tendencia en M5 es **${ctx.trend.toUpperCase()}**.\n\n`;
      
      if (ctx.trend === 'alcista') {
        answer += `Los compradores están dominando. Las velas recientes cierran al alza.`;
      } else if (ctx.trend === 'bajista') {
        answer += `Los vendedores tienen el control. Velas cerrando a la baja.`;
      } else {
        answer += `El mercado está en consolidación. Sin dirección clara por ahora.`;
      }
      
      if (ctx.structure !== 'Neutral') {
        answer += `\n\n🏗️ Estructura: ${ctx.structure}`;
      }
    }
    else if (q.includes('precio') || q.includes('price') || q.includes('cotiza') || q.includes('está')) {
      answer = `💰 **${ctx.asset}** está en **${ctx.price?.toFixed(ASSETS[symbol].decimals)}**\n\n`;
      answer += `📊 Niveles clave:\n`;
      answer += `- Resistencia (EQH): ${ctx.eqh}\n`;
      answer += `- Soporte (EQL): ${ctx.eql}\n\n`;
      answer += `Volatilidad: ${ctx.volatility}`;
    }
    else if (q.includes('volatilidad') || q.includes('volatility') || q.includes('movimiento')) {
      answer = `⚡ **Volatilidad de ${ctx.asset}:** ${ctx.volatility.toUpperCase()}\n\n`;
      
      if (ctx.volatility === 'alta') {
        answer += `El mercado está muy activo. Las velas tienen rangos amplios. Ideal para scalping pero requiere stops más amplios.`;
      } else if (ctx.volatility === 'media') {
        answer += `Volatilidad normal. Buenos movimientos sin ser excesivos.`;
      } else {
        answer += `Mercado tranquilo. Poca acción. Puede que venga un movimiento fuerte pronto.`;
      }
    }
    else if (q.includes('liquidez') || q.includes('liquidity') || q.includes('eqh') || q.includes('eql')) {
      answer = `🎯 **Zonas de Liquidez en ${ctx.asset}:**\n\n`;
      answer += `📈 **EQH (Equal Highs):** ${ctx.eqh}\n`;
      answer += `Zona donde hay stops de vendedores y órdenes de compra pendientes.\n\n`;
      answer += `📉 **EQL (Equal Lows):** ${ctx.eql}\n`;
      answer += `Zona donde hay stops de compradores y órdenes de venta pendientes.\n\n`;
      answer += `💡 El precio tiende a buscar estas zonas para "barrer" la liquidez antes de moverse.`;
    }
    else if (q.includes('qué hacer') || q.includes('recomend') || q.includes('consejo') || q.includes('debería')) {
      if (ctx.hasSignal) {
        const sig = ctx.signal;
        answer = `🤔 **Mi análisis para ${ctx.asset}:**\n\n`;
        answer += `Hay una señal ${sig.action} con score de ${sig.score}%.\n\n`;
        
        if (sig.score >= 85) {
          answer += `✅ Es una buena oportunidad. Los elementos SMC están presentes:\n`;
          sig.breakdown?.forEach(b => {
            answer += `  • ${b}\n`;
          });
          answer += `\n⚠️ Recuerda: Siempre usa gestión de riesgo. No arriesgues más del 1-2% por operación.`;
        } else {
          answer += `⚠️ La señal es válida pero no es A+. Considera:\n`;
          answer += `  • Esperar mejor confluencia\n`;
          answer += `  • Reducir el tamaño de posición\n`;
          answer += `  • O tomar la operación con precaución`;
        }
      } else {
        answer = `⏳ **Recomendación para ${ctx.asset}:**\n\n`;
        answer += `No hay señal en este momento. Lo mejor es **ESPERAR**.\n\n`;
        answer += `📋 Checklist para entrar:\n`;
        answer += `  ⬜ Sweep de liquidez\n`;
        answer += `  ⬜ Displacement confirmando\n`;
        answer += `  ⬜ Order Block identificado\n`;
        answer += `  ⬜ Score >= 70%\n\n`;
        answer += `La paciencia es clave en SMC. No fuerces operaciones.`;
      }
    }
    else if (q.includes('smc') || q.includes('metodología') || q.includes('cómo funciona')) {
      answer = `📚 **Metodología SMC (Smart Money Concepts):**\n\n`;
      answer += `El SMC busca operar como las instituciones:\n\n`;
      answer += `1️⃣ **Liquidez** - Identificar donde están los stops (EQH/EQL)\n`;
      answer += `2️⃣ **Sweep** - Esperar que el precio barra esa liquidez\n`;
      answer += `3️⃣ **Displacement** - Vela fuerte que confirma la dirección\n`;
      answer += `4️⃣ **Order Block** - Zona de entrada óptima\n\n`;
      answer += `📊 Timeframe: M5 (5 minutos)\n`;
      answer += `🎯 Score mínimo: 70%`;
    }
    else {
      // Respuesta genérica
      answer = `📊 **Estado actual de ${ctx.asset}:**\n\n`;
      answer += `💰 Precio: ${ctx.price?.toFixed(ASSETS[symbol].decimals)}\n`;
      answer += `📈 Tendencia: ${ctx.trend}\n`;
      answer += `⚡ Volatilidad: ${ctx.volatility}\n`;
      answer += `🏗️ Estructura: ${ctx.structure || 'Neutral'}\n\n`;
      
      if (ctx.hasSignal) {
        answer += `🎯 Señal: ${ctx.signal.action} (${ctx.signal.score}%)`;
      } else {
        answer += `⏳ Sin señal activa`;
      }
      
      answer += `\n\n💡 Puedes preguntarme sobre: señales, tendencia, precio, liquidez, volatilidad, o qué hacer.`;
    }
    
    return {
      answer,
      timestamp: new Date().toISOString(),
      symbol,
      asset: ctx.asset,
      context: ctx
    };
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
        }
      }
      
      if (msg.tick) {
        const symbol = msg.tick.symbol;
        if (assetData[symbol]) {
          assetData[symbol].price = parseFloat(msg.tick.quote);
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
  
  if (signal.action !== 'WAIT' && signal.action !== 'LOADING' && signal.score >= 70) {
    const lastSignal = signalHistory[0];
    const isDuplicate = lastSignal && 
      lastSignal.symbol === symbol && 
      lastSignal.action === signal.action &&
      now - new Date(lastSignal.timestamp).getTime() < 300000;
    
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
    }
  }
}

// =============================================
// API ENDPOINTS
// =============================================

app.get('/', (req, res) => {
  res.json({
    name: 'Trading Master Pro',
    version: '10.1',
    features: ['SMC Analysis', 'AI Narration', 'AI Chat'],
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
    candles: data.candles.slice(-60),
    timeframe: 'M5'
  });
});

// =============================================
// API DE IA
// =============================================

// Narración en vivo del mercado
app.get('/api/ai/narrate/:symbol', (req, res) => {
  const { symbol } = req.params;
  const narration = AI.generateNarration(symbol);
  
  if (!narration) {
    return res.status(404).json({ error: 'Activo no encontrado' });
  }
  
  res.json(narration);
});

// Chat con la IA
app.post('/api/ai/chat', (req, res) => {
  const { question, symbol } = req.body;
  
  if (!question || !symbol) {
    return res.status(400).json({ error: 'Se requiere question y symbol' });
  }
  
  const response = AI.answerQuestion(question, symbol);
  
  // Guardar en historial
  chatHistory.unshift({
    question,
    answer: response.answer,
    symbol,
    timestamp: response.timestamp
  });
  if (chatHistory.length > 100) chatHistory.pop();
  
  res.json(response);
});

// Historial de chat
app.get('/api/ai/chat/history', (req, res) => {
  res.json({ history: chatHistory.slice(0, 20) });
});

app.get('/api/signals', (req, res) => {
  res.json({ signals: signalHistory });
});

// =============================================
// INICIO
// =============================================
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         TRADING MASTER PRO v10.1                          ║
║         SMC + IA (Narración y Chat en Vivo)               ║
╠═══════════════════════════════════════════════════════════╣
║  🤖 IA Features:                                          ║
║     • Narración en vivo del mercado                       ║
║     • Chat interactivo sobre el gráfico                   ║
║     • Análisis SMC explicado                              ║
╠═══════════════════════════════════════════════════════════╣
║  Puerto: ${PORT}                                              ║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  connectDeriv();
  
  setInterval(() => {
    if (derivWs?.readyState === WebSocket.OPEN) {
      derivWs.send(JSON.stringify({ ping: 1 }));
    }
  }, 30000);
});

export default app;
