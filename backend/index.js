// =============================================
// TRADING MASTER PRO v14.0
// CON NOTIFICACIONES TELEGRAM
// =============================================

const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════
// CONFIGURACIÓN TELEGRAM
// ═══════════════════════════════════════════
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'TU_BOT_TOKEN_AQUI';
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || '@TuCanalAqui'; // o el chat_id numérico

// Función para enviar mensaje a Telegram
async function sendTelegramMessage(message, parseMode = 'HTML') {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHANNEL_ID,
        text: message,
        parse_mode: parseMode,
        disable_web_page_preview: true
      })
    });
    
    const result = await response.json();
    if (result.ok) {
      console.log('✅ Telegram: Mensaje enviado');
    } else {
      console.error('❌ Telegram error:', result.description);
    }
    return result;
  } catch (error) {
    console.error('❌ Telegram error:', error.message);
    return null;
  }
}

// Función para formatear señal para Telegram
function formatSignalForTelegram(signal, asset) {
  const isLong = signal.action === 'LONG';
  const emoji = isLong ? '🟢' : '🔴';
  const direction = isLong ? '📈 COMPRA' : '📉 VENTA';
  
  const message = `
${emoji} <b>NUEVA SEÑAL - ${asset.name}</b> ${emoji}

${direction} <b>${signal.action}</b>

💰 <b>Entry:</b> <code>${signal.entry}</code>

🎯 <b>Take Profits:</b>
   ├ TP1: <code>${signal.tp1}</code>
   ├ TP2: <code>${signal.tp2}</code>
   └ TP3: <code>${signal.tp3}</code>

🛑 <b>Stop Loss:</b> <code>${signal.stop}</code>

📊 <b>Modelo:</b> ${signal.model}
⭐ <b>Score:</b> ${signal.score}%

⏰ ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}

#${asset.shortName} #${signal.action} #SMC
`;

  return message;
}

// Función para notificar TP alcanzado
function formatTPHitForTelegram(signal, asset, tpLevel) {
  const emoji = '✅';
  
  const message = `
${emoji} <b>¡TP${tpLevel} ALCANZADO!</b> ${emoji}

${asset.emoji} <b>${asset.name}</b>
📊 Señal #${signal.id}

🎯 TP${tpLevel}: <code>${signal[`tp${tpLevel}`]}</code> ✓

${tpLevel === 1 ? '🔄 Trailing Stop activado → SL movido a Entry' : ''}
${tpLevel === 2 ? '🔄 SL movido a TP1' : ''}
${tpLevel === 3 ? '🏆 ¡OPERACIÓN COMPLETADA!' : ''}

#${asset.shortName} #WIN #TP${tpLevel}
`;

  return message;
}

// Función para notificar cierre de operación
function formatCloseForTelegram(signal, asset, result) {
  const isWin = result === 'WIN';
  const emoji = isWin ? '✅💰' : '❌';
  
  const tpsHit = [signal.tp1Hit, signal.tp2Hit, signal.tp3Hit].filter(Boolean).length;
  
  const message = `
${emoji} <b>OPERACIÓN CERRADA</b> ${emoji}

${asset.emoji} <b>${asset.name}</b>
📊 Señal #${signal.id}

<b>Resultado:</b> ${isWin ? '🏆 WIN' : '💔 LOSS'}
${isWin ? `<b>TPs alcanzados:</b> ${tpsHit}/3` : ''}

#${asset.shortName} #${result}
`;

  return message;
}

// ═══════════════════════════════════════════
// CONFIGURACIÓN DE ACTIVOS
// ═══════════════════════════════════════════
const ASSETS = {
  stpRNG: { 
    symbol: 'stpRNG', 
    name: 'Step Index', 
    shortName: 'Step',
    emoji: '📊',
    decimals: 2,
    pipSize: 0.01,
    atrMultiplier: 1.5
  },
  'Volatility 75 Index': { 
    symbol: 'Volatility 75 Index', 
    name: 'Volatility 75', 
    shortName: 'V75',
    emoji: '📈',
    decimals: 2,
    pipSize: 0.01,
    atrMultiplier: 1.8
  },
  'Volatility 100 Index': { 
    symbol: 'Volatility 100 Index', 
    name: 'Volatility 100', 
    shortName: 'V100',
    emoji: '📉',
    decimals: 2,
    pipSize: 0.01,
    atrMultiplier: 2.0
  },
  frxXAUUSD: { 
    symbol: 'frxXAUUSD', 
    name: 'Gold (XAU/USD)', 
    shortName: 'XAU',
    emoji: '🥇',
    decimals: 2,
    pipSize: 0.01,
    atrMultiplier: 1.5
  },
  frxGBPUSD: { 
    symbol: 'frxGBPUSD', 
    name: 'GBP/USD', 
    shortName: 'GBP',
    emoji: '💷',
    decimals: 5,
    pipSize: 0.0001,
    atrMultiplier: 1.2
  },
  cryBTCUSD: { 
    symbol: 'cryBTCUSD', 
    name: 'Bitcoin', 
    shortName: 'BTC',
    emoji: '₿',
    decimals: 2,
    pipSize: 1,
    atrMultiplier: 2.0
  }
};

// Estado global
const state = {
  candles: {},
  candlesH1: {},
  analysis: {},
  signals: [],
  signalId: 1,
  lockedSignals: {},
  stats: {
    total: 0,
    wins: 0,
    losses: 0,
    tp1Hits: 0,
    tp2Hits: 0,
    tp3Hits: 0,
    byModel: {}
  },
  wsConnected: false
};

// ═══════════════════════════════════════════
// DERIVWS CONNECTION
// ═══════════════════════════════════════════
const WebSocket = require('ws');
const DERIV_APP_ID = process.env.DERIV_APP_ID || '1089';

let derivWs = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 50;

function connectDeriv() {
  try {
    derivWs = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${DERIV_APP_ID}`);
    
    derivWs.on('open', () => {
      console.log('✅ Conectado a Deriv');
      state.wsConnected = true;
      reconnectAttempts = 0;
      
      Object.keys(ASSETS).forEach(symbol => {
        // M5 candles
        derivWs.send(JSON.stringify({
          ticks_history: symbol,
          style: 'candles',
          granularity: 300,
          count: 100,
          subscribe: 1
        }));
        
        // H1 candles
        setTimeout(() => {
          derivWs.send(JSON.stringify({
            ticks_history: symbol,
            style: 'candles',
            granularity: 3600,
            count: 50,
            subscribe: 1
          }));
        }, 1000);
      });
    });

    derivWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        
        if (msg.candles) {
          const symbol = msg.echo_req.ticks_history;
          const granularity = msg.echo_req.granularity;
          const candles = msg.candles.map(c => ({
            time: c.epoch * 1000,
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close)
          }));
          
          if (granularity === 3600) {
            state.candlesH1[symbol] = candles;
            console.log(`📊 H1 ${symbol}: ${candles.length} velas`);
          } else {
            state.candles[symbol] = candles;
          }
          
          analyzeAsset(symbol);
        }
        
        if (msg.ohlc) {
          const symbol = msg.ohlc.symbol;
          const granularity = msg.ohlc.granularity;
          const candle = {
            time: msg.ohlc.epoch * 1000,
            open: parseFloat(msg.ohlc.open),
            high: parseFloat(msg.ohlc.high),
            low: parseFloat(msg.ohlc.low),
            close: parseFloat(msg.ohlc.close)
          };
          
          if (granularity === 3600) {
            if (!state.candlesH1[symbol]) state.candlesH1[symbol] = [];
            const arr = state.candlesH1[symbol];
            if (arr.length && arr[arr.length - 1].time === candle.time) {
              arr[arr.length - 1] = candle;
            } else {
              arr.push(candle);
              if (arr.length > 50) arr.shift();
            }
          } else {
            if (!state.candles[symbol]) state.candles[symbol] = [];
            const arr = state.candles[symbol];
            if (arr.length && arr[arr.length - 1].time === candle.time) {
              arr[arr.length - 1] = candle;
            } else {
              arr.push(candle);
              if (arr.length > 100) arr.shift();
            }
          }
          
          analyzeAsset(symbol);
          checkSignalHits(symbol);
        }
      } catch (e) {
        console.error('Parse error:', e.message);
      }
    });

    derivWs.on('close', () => {
      console.log('❌ Deriv desconectado');
      state.wsConnected = false;
      scheduleReconnect();
    });

    derivWs.on('error', (err) => {
      console.error('WS error:', err.message);
    });
  } catch (e) {
    console.error('Connection error:', e.message);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    const delay = Math.min(5000 * reconnectAttempts, 30000);
    console.log(`🔄 Reconectando en ${delay/1000}s (intento ${reconnectAttempts})`);
    setTimeout(connectDeriv, delay);
  }
}

// ═══════════════════════════════════════════
// SMC ANALYSIS ENGINE
// ═══════════════════════════════════════════
function analyzeAsset(symbol) {
  const candles = state.candles[symbol];
  const candlesH1 = state.candlesH1[symbol];
  if (!candles || candles.length < 50) return;

  const asset = ASSETS[symbol];
  const price = candles[candles.length - 1].close;
  
  // Swing points
  const swings = findSwingPoints(candles);
  
  // Structure
  const structureM5 = detectStructure(swings);
  const structureH1 = candlesH1?.length >= 20 ? detectStructure(findSwingPoints(candlesH1)) : 'LOADING';
  
  // MTF Confluence
  const mtfConfluence = structureM5 === structureH1 && structureH1 !== 'RANGING' && structureH1 !== 'LOADING';
  
  // Zones
  const zones = detectZones(candles, swings);
  
  // Premium/Discount
  const premiumDiscount = calculatePremiumDiscount(candles, price);
  
  // FVGs
  const fvgs = detectFVGs(candles);
  
  // Liquidity
  const liquidity = detectLiquidity(swings, price);
  
  // Order Flow
  const orderFlow = analyzeOrderFlow(candles);
  
  state.analysis[symbol] = {
    price,
    structureM5,
    structureH1,
    mtfConfluence,
    zones,
    premiumDiscount,
    fvgs,
    liquidity,
    orderFlow,
    swings,
    lastUpdate: Date.now()
  };
  
  // Generate signal if conditions met
  if (!state.lockedSignals[symbol]) {
    const signal = generateSignal(symbol);
    if (signal && signal.score >= 60) {
      lockSignal(symbol, signal);
    }
  }
}

function findSwingPoints(candles, lookback = 5) {
  const swings = { highs: [], lows: [] };
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true, isLow = true;
    
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isHigh = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isLow = false;
    }
    
    if (isHigh) swings.highs.push({ index: i, price: candles[i].high, time: candles[i].time });
    if (isLow) swings.lows.push({ index: i, price: candles[i].low, time: candles[i].time });
  }
  
  return swings;
}

function detectStructure(swings) {
  if (swings.highs.length < 2 || swings.lows.length < 2) return 'RANGING';
  
  const recentHighs = swings.highs.slice(-3);
  const recentLows = swings.lows.slice(-3);
  
  const higherHighs = recentHighs.length >= 2 && recentHighs[recentHighs.length - 1].price > recentHighs[recentHighs.length - 2].price;
  const higherLows = recentLows.length >= 2 && recentLows[recentLows.length - 1].price > recentLows[recentLows.length - 2].price;
  const lowerHighs = recentHighs.length >= 2 && recentHighs[recentHighs.length - 1].price < recentHighs[recentHighs.length - 2].price;
  const lowerLows = recentLows.length >= 2 && recentLows[recentLows.length - 1].price < recentLows[recentLows.length - 2].price;
  
  if (higherHighs && higherLows) return 'BULLISH';
  if (lowerHighs && lowerLows) return 'BEARISH';
  return 'RANGING';
}

function detectZones(candles, swings) {
  const zones = { demand: [], supply: [] };
  const recent = candles.slice(-30);
  
  swings.lows.slice(-5).forEach(swing => {
    const idx = swing.index - candles.length + recent.length;
    if (idx >= 0 && idx < recent.length) {
      zones.demand.push({
        high: recent[idx].open > recent[idx].close ? recent[idx].open : recent[idx].close,
        low: swing.price,
        strength: calculateZoneStrength(candles, swing.index, 'demand')
      });
    }
  });
  
  swings.highs.slice(-5).forEach(swing => {
    const idx = swing.index - candles.length + recent.length;
    if (idx >= 0 && idx < recent.length) {
      zones.supply.push({
        high: swing.price,
        low: recent[idx].open < recent[idx].close ? recent[idx].open : recent[idx].close,
        strength: calculateZoneStrength(candles, swing.index, 'supply')
      });
    }
  });
  
  return zones;
}

function calculateZoneStrength(candles, index, type) {
  let strength = 50;
  if (index < 3 || index >= candles.length - 1) return strength;
  
  const moveAfter = Math.abs(candles[index + 1].close - candles[index].close);
  const avgMove = candles.slice(index - 3, index).reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / 3;
  
  if (moveAfter > avgMove * 1.5) strength += 20;
  if (moveAfter > avgMove * 2) strength += 15;
  
  return Math.min(strength, 100);
}

function calculatePremiumDiscount(candles, currentPrice) {
  const recent = candles.slice(-50);
  const highest = Math.max(...recent.map(c => c.high));
  const lowest = Math.min(...recent.map(c => c.low));
  const range = highest - lowest;
  const midpoint = lowest + range / 2;
  
  if (currentPrice > midpoint + range * 0.2) return 'PREMIUM';
  if (currentPrice < midpoint - range * 0.2) return 'DISCOUNT';
  return 'EQUILIBRIUM';
}

function detectFVGs(candles) {
  const fvgs = [];
  
  for (let i = 2; i < candles.length; i++) {
    const prev = candles[i - 2];
    const curr = candles[i];
    
    if (curr.low > prev.high) {
      fvgs.push({ type: 'bullish', top: curr.low, bottom: prev.high, index: i });
    }
    if (curr.high < prev.low) {
      fvgs.push({ type: 'bearish', top: prev.low, bottom: curr.high, index: i });
    }
  }
  
  return fvgs.slice(-5);
}

function detectLiquidity(swings, currentPrice) {
  const result = { above: [], below: [] };
  
  swings.highs.slice(-5).forEach(h => {
    if (h.price > currentPrice) {
      result.above.push(h.price);
    }
  });
  
  swings.lows.slice(-5).forEach(l => {
    if (l.price < currentPrice) {
      result.below.push(l.price);
    }
  });
  
  return result;
}

function analyzeOrderFlow(candles) {
  const recent = candles.slice(-10);
  let bullishVolume = 0, bearishVolume = 0;
  
  recent.forEach(c => {
    const bodySize = Math.abs(c.close - c.open);
    if (c.close > c.open) bullishVolume += bodySize;
    else bearishVolume += bodySize;
  });
  
  const total = bullishVolume + bearishVolume;
  return {
    bullishPercent: total > 0 ? (bullishVolume / total) * 100 : 50,
    bearishPercent: total > 0 ? (bearishVolume / total) * 100 : 50,
    bias: bullishVolume > bearishVolume * 1.3 ? 'BULLISH' : bearishVolume > bullishVolume * 1.3 ? 'BEARISH' : 'NEUTRAL'
  };
}

// ═══════════════════════════════════════════
// SIGNAL GENERATION - 6 MODELS
// ═══════════════════════════════════════════
function generateSignal(symbol) {
  const analysis = state.analysis[symbol];
  const candles = state.candles[symbol];
  const asset = ASSETS[symbol];
  
  if (!analysis || !candles?.length) return null;
  
  const price = analysis.price;
  const models = [];
  
  // Model 1: MTF Confluence
  if (analysis.mtfConfluence) {
    const action = analysis.structureH1 === 'BULLISH' ? 'LONG' : 'SHORT';
    const inZone = action === 'LONG' 
      ? analysis.zones.demand.some(z => price >= z.low && price <= z.high)
      : analysis.zones.supply.some(z => price >= z.low && price <= z.high);
    
    if (inZone) {
      models.push({
        name: 'MTF_CONFLUENCE',
        action,
        score: 95,
        reason: 'H1+M5 aligned with zone entry'
      });
    }
  }
  
  // Model 2: CHoCH Pullback
  const choch = detectCHoCH(candles);
  if (choch.detected) {
    const pullbackZone = choch.type === 'bullish' 
      ? analysis.zones.demand.slice(-1)[0]
      : analysis.zones.supply.slice(-1)[0];
    
    if (pullbackZone && isPriceInZone(price, pullbackZone)) {
      models.push({
        name: 'CHOCH_PULLBACK',
        action: choch.type === 'bullish' ? 'LONG' : 'SHORT',
        score: 90,
        reason: 'CHoCH with pullback to zone'
      });
    }
  }
  
  // Model 3: Liquidity Sweep
  const sweep = detectLiquiditySweep(candles, analysis.liquidity);
  if (sweep.detected) {
    models.push({
      name: 'LIQUIDITY_SWEEP',
      action: sweep.type === 'bullish' ? 'LONG' : 'SHORT',
      score: 85,
      reason: 'Liquidity swept with reversal'
    });
  }
  
  // Model 4: BOS Continuation
  const bos = detectBOS(candles, analysis.structureM5);
  if (bos.detected && analysis.structureM5 !== 'RANGING') {
    models.push({
      name: 'BOS_CONTINUATION',
      action: analysis.structureM5 === 'BULLISH' ? 'LONG' : 'SHORT',
      score: 80,
      reason: 'Structure break continuation'
    });
  }
  
  // Model 5: FVG Entry
  const fvgEntry = analysis.fvgs.find(fvg => {
    if (fvg.type === 'bullish' && price <= fvg.top && price >= fvg.bottom) return true;
    if (fvg.type === 'bearish' && price >= fvg.bottom && price <= fvg.top) return true;
    return false;
  });
  
  if (fvgEntry) {
    models.push({
      name: 'FVG_ENTRY',
      action: fvgEntry.type === 'bullish' ? 'LONG' : 'SHORT',
      score: 75,
      reason: 'Price in Fair Value Gap'
    });
  }
  
  // Model 6: Order Flow
  if (analysis.orderFlow.bias !== 'NEUTRAL') {
    const flowStrength = Math.max(analysis.orderFlow.bullishPercent, analysis.orderFlow.bearishPercent);
    if (flowStrength > 65) {
      models.push({
        name: 'ORDER_FLOW',
        action: analysis.orderFlow.bias === 'BULLISH' ? 'LONG' : 'SHORT',
        score: 70,
        reason: `Strong ${analysis.orderFlow.bias.toLowerCase()} flow`
      });
    }
  }
  
  if (models.length === 0) return null;
  
  // Select best model
  const best = models.reduce((a, b) => a.score > b.score ? a : b);
  
  // Calculate levels
  const atr = calculateATR(candles, 14);
  const multiplier = asset.atrMultiplier;
  
  const isLong = best.action === 'LONG';
  const entry = price;
  const stop = isLong ? entry - (atr * multiplier) : entry + (atr * multiplier);
  const tp1 = isLong ? entry + (atr * multiplier) : entry - (atr * multiplier);
  const tp2 = isLong ? entry + (atr * multiplier * 2) : entry - (atr * multiplier * 2);
  const tp3 = isLong ? entry + (atr * multiplier * 3) : entry - (atr * multiplier * 3);
  
  return {
    id: state.signalId++,
    symbol,
    ...best,
    entry: parseFloat(entry.toFixed(asset.decimals)),
    stop: parseFloat(stop.toFixed(asset.decimals)),
    tp1: parseFloat(tp1.toFixed(asset.decimals)),
    tp2: parseFloat(tp2.toFixed(asset.decimals)),
    tp3: parseFloat(tp3.toFixed(asset.decimals)),
    status: 'PENDING',
    tp1Hit: false,
    tp2Hit: false,
    tp3Hit: false,
    trailingActive: false,
    timestamp: Date.now()
  };
}

function detectCHoCH(candles) {
  if (candles.length < 20) return { detected: false };
  
  const recent = candles.slice(-15);
  let prevTrend = null;
  let chochIndex = -1;
  
  for (let i = 5; i < recent.length - 1; i++) {
    const before = recent.slice(i - 5, i);
    const beforeTrend = before[before.length - 1].close > before[0].close ? 'up' : 'down';
    
    if (prevTrend && beforeTrend !== prevTrend) {
      chochIndex = i;
    }
    prevTrend = beforeTrend;
  }
  
  if (chochIndex > 0) {
    const afterChoch = recent.slice(chochIndex);
    const type = afterChoch[afterChoch.length - 1].close > afterChoch[0].close ? 'bullish' : 'bearish';
    return { detected: true, type, index: chochIndex };
  }
  
  return { detected: false };
}

function detectLiquiditySweep(candles, liquidity) {
  const recent = candles.slice(-5);
  const prevCandle = recent[recent.length - 2];
  const currCandle = recent[recent.length - 1];
  
  for (const high of liquidity.above) {
    if (prevCandle.high > high && currCandle.close < high && currCandle.close < currCandle.open) {
      return { detected: true, type: 'bearish' };
    }
  }
  
  for (const low of liquidity.below) {
    if (prevCandle.low < low && currCandle.close > low && currCandle.close > currCandle.open) {
      return { detected: true, type: 'bullish' };
    }
  }
  
  return { detected: false };
}

function detectBOS(candles, structure) {
  if (candles.length < 10) return { detected: false };
  
  const recent = candles.slice(-10);
  const highs = recent.map(c => c.high);
  const lows = recent.map(c => c.low);
  
  const prevHigh = Math.max(...highs.slice(0, -2));
  const prevLow = Math.min(...lows.slice(0, -2));
  const currHigh = recent[recent.length - 1].high;
  const currLow = recent[recent.length - 1].low;
  
  if (structure === 'BULLISH' && currHigh > prevHigh) {
    return { detected: true, type: 'bullish' };
  }
  if (structure === 'BEARISH' && currLow < prevLow) {
    return { detected: true, type: 'bearish' };
  }
  
  return { detected: false };
}

function isPriceInZone(price, zone) {
  return price >= zone.low && price <= zone.high;
}

function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) return 0;
  
  let atrSum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1]?.close || candles[i].open;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    atrSum += tr;
  }
  
  return atrSum / period;
}

// ═══════════════════════════════════════════
// SIGNAL MANAGEMENT
// ═══════════════════════════════════════════
async function lockSignal(symbol, signal) {
  state.lockedSignals[symbol] = signal;
  state.signals.push(signal);
  state.stats.total++;
  
  if (!state.stats.byModel[signal.model]) {
    state.stats.byModel[signal.model] = { wins: 0, losses: 0 };
  }
  
  console.log(`🎯 SEÑAL #${signal.id}: ${signal.action} ${symbol} @ ${signal.entry} | Score: ${signal.score}%`);
  
  // 🔔 ENVIAR A TELEGRAM
  const asset = ASSETS[symbol];
  const telegramMsg = formatSignalForTelegram(signal, asset);
  await sendTelegramMessage(telegramMsg);
}

async function checkSignalHits(symbol) {
  const signal = state.lockedSignals[symbol];
  if (!signal || signal.status !== 'PENDING') return;
  
  const candles = state.candles[symbol];
  if (!candles?.length) return;
  
  const price = candles[candles.length - 1].close;
  const high = candles[candles.length - 1].high;
  const low = candles[candles.length - 1].low;
  const isLong = signal.action === 'LONG';
  const asset = ASSETS[symbol];
  
  // Check TPs
  if (!signal.tp1Hit) {
    if ((isLong && high >= signal.tp1) || (!isLong && low <= signal.tp1)) {
      signal.tp1Hit = true;
      state.stats.tp1Hits++;
      
      // Trailing stop: mover SL a entry
      signal.originalStop = signal.stop;
      signal.stop = signal.entry;
      signal.trailingActive = true;
      
      console.log(`✅ TP1 #${signal.id} | Trailing activado → SL: ${signal.stop}`);
      
      // 🔔 Notificar a Telegram
      await sendTelegramMessage(formatTPHitForTelegram(signal, asset, 1));
    }
  }
  
  if (!signal.tp2Hit && signal.tp1Hit) {
    if ((isLong && high >= signal.tp2) || (!isLong && low <= signal.tp2)) {
      signal.tp2Hit = true;
      state.stats.tp2Hits++;
      
      // Trailing: mover SL a TP1
      signal.stop = signal.tp1;
      
      console.log(`✅ TP2 #${signal.id} | SL movido a TP1: ${signal.stop}`);
      
      // 🔔 Notificar a Telegram
      await sendTelegramMessage(formatTPHitForTelegram(signal, asset, 2));
    }
  }
  
  if (!signal.tp3Hit && signal.tp2Hit) {
    if ((isLong && high >= signal.tp3) || (!isLong && low <= signal.tp3)) {
      signal.tp3Hit = true;
      state.stats.tp3Hits++;
      
      console.log(`🏆 TP3 #${signal.id} | TRADE COMPLETO`);
      
      // 🔔 Notificar a Telegram
      await sendTelegramMessage(formatTPHitForTelegram(signal, asset, 3));
      
      closeSignal(signal.id, 'WIN', symbol);
      return;
    }
  }
  
  // Check SL (con trailing)
  const currentSL = signal.stop;
  if ((isLong && low <= currentSL) || (!isLong && high >= currentSL)) {
    // Si ya tocó TP1, es WIN parcial
    const result = signal.tp1Hit ? 'WIN' : 'LOSS';
    console.log(`${result === 'WIN' ? '✅' : '❌'} SL #${signal.id} | ${result}${signal.tp1Hit ? ' (parcial)' : ''}`);
    closeSignal(signal.id, result, symbol);
  }
}

async function closeSignal(signalId, status, symbol) {
  const signal = state.signals.find(s => s.id === signalId);
  if (!signal) return;
  
  signal.status = status;
  signal.closedAt = Date.now();
  
  if (status === 'WIN') {
    state.stats.wins++;
    if (state.stats.byModel[signal.model]) {
      state.stats.byModel[signal.model].wins++;
    }
  } else {
    state.stats.losses++;
    if (state.stats.byModel[signal.model]) {
      state.stats.byModel[signal.model].losses++;
    }
  }
  
  delete state.lockedSignals[symbol];
  
  // 🔔 Notificar cierre a Telegram
  const asset = ASSETS[symbol];
  await sendTelegramMessage(formatCloseForTelegram(signal, asset, status));
}

// ═══════════════════════════════════════════
// ELISA IA CHAT
// ═══════════════════════════════════════════
class ElisaAI {
  constructor() {
    this.name = 'Elisa';
  }
  
  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return '¡Buenos días!';
    if (hour < 18) return '¡Buenas tardes!';
    return '¡Buenas noches!';
  }

  chat(question, symbol) {
    const q = question?.toLowerCase().trim() || '';
    const analysis = state.analysis[symbol];
    const asset = ASSETS[symbol];
    const locked = state.lockedSignals[symbol];
    
    if (!analysis) {
      return `${this.getGreeting()} 💜 Soy Elisa.\n\nAún estoy cargando los datos de ${asset?.name || symbol}. Dame unos segundos...`;
    }

    const ctx = {
      name: asset?.name || symbol,
      emoji: asset?.emoji || '📊',
      price: analysis.price?.toFixed(asset?.decimals || 2),
      structureM5: analysis.structureM5,
      structureH1: analysis.structureH1,
      mtfConfluence: analysis.mtfConfluence,
      premiumDiscount: analysis.premiumDiscount,
      demandZones: analysis.zones?.demand?.length || 0,
      supplyZones: analysis.zones?.supply?.length || 0
    };

    // Saludo
    if (!q || q === 'hola' || q === 'hey' || q === 'hi') {
      return `${this.getGreeting()} 💜 Soy Elisa, tu asistente de trading.\n\nEstoy viendo ${ctx.emoji} **${ctx.name}** ahora mismo.\n\n💵 Precio actual: **${ctx.price}**\n\n¿Qué quieres saber? Puedo contarte sobre:\n• El análisis actual del gráfico\n• Las zonas de entrada\n• Qué operación buscar\n• O pregúntame lo que quieras 😊`;
    }

    // Análisis
    if (q.includes('anali') || q.includes('qué ves') || q.includes('que ves')) {
      let r = `📊 **Análisis de ${ctx.name}**\n\n`;
      r += `💵 Precio: **${ctx.price}**\n\n`;
      r += `**Estructura:**\n`;
      r += `• M5: ${ctx.structureM5 === 'BULLISH' ? '🟢 ALCISTA' : ctx.structureM5 === 'BEARISH' ? '🔴 BAJISTA' : '⚪ LATERAL'}\n`;
      r += `• H1: ${ctx.structureH1 === 'BULLISH' ? '🟢 ALCISTA' : ctx.structureH1 === 'BEARISH' ? '🔴 BAJISTA' : ctx.structureH1 === 'LOADING' ? '⏳ Cargando' : '⚪ LATERAL'}\n\n`;
      
      if (ctx.mtfConfluence) {
        r += `✨ **¡CONFLUENCIA MTF!** Ambos timeframes apuntan en la misma dirección.\n\n`;
      }
      
      r += `📦 Zonas: ${ctx.demandZones} demanda / ${ctx.supplyZones} oferta\n`;
      r += `💰 Contexto: ${ctx.premiumDiscount === 'PREMIUM' ? 'Zona PREMIUM (caro)' : ctx.premiumDiscount === 'DISCOUNT' ? 'Zona DISCOUNT (barato)' : 'EQUILIBRIO'}`;
      
      return r;
    }

    // Señal activa
    if (q.includes('señal') || q.includes('signal') || q.includes('operacion') || q.includes('trade') || q.includes('entrada')) {
      if (locked) {
        let r = `🎯 **Señal Activa en ${ctx.name}**\n\n`;
        r += `${locked.action === 'LONG' ? '🟢 COMPRA' : '🔴 VENTA'} **${locked.action}**\n\n`;
        r += `📍 Entry: **${locked.entry}**\n`;
        r += `🎯 TP1: ${locked.tp1} ${locked.tp1Hit ? '✅' : ''}\n`;
        r += `🎯 TP2: ${locked.tp2} ${locked.tp2Hit ? '✅' : ''}\n`;
        r += `🎯 TP3: ${locked.tp3} ${locked.tp3Hit ? '✅' : ''}\n`;
        r += `🛑 SL: ${locked.stop}${locked.trailingActive ? ' (Trailing)' : ''}\n\n`;
        r += `⭐ Score: ${locked.score}%\n`;
        r += `📊 Modelo: ${locked.model}`;
        return r;
      } else {
        return `No hay señal activa en ${ctx.name} ahora mismo.\n\nEl sistema está analizando el mercado. Te avisaré cuando detecte una oportunidad de alta probabilidad. 🔍`;
      }
    }

    // Plan
    if (q.includes('plan') || q.includes('qué buscar') || q.includes('que buscar') || q.includes('estrategia')) {
      let r = `🎯 **Plan de Trading para ${ctx.name}**\n\n`;
      
      if (ctx.mtfConfluence) {
        const side = ctx.structureH1 === 'BULLISH' ? 'COMPRAS' : 'VENTAS';
        r += `✅ Buscar **${side}**\n\n`;
        r += `Tenemos confluencia MTF ${ctx.structureH1.toLowerCase()}, esto es ideal.\n\n`;
        r += `**¿Cómo entrar?**\n`;
        r += `1. Esperar pullback a zona de ${side === 'COMPRAS' ? 'demanda' : 'oferta'}\n`;
        r += `2. Ver rechazo en la zona\n`;
        r += `3. Entrar en la siguiente vela de confirmación`;
      } else {
        r += `⚠️ No hay confluencia MTF clara.\n\n`;
        r += `M5: ${ctx.structureM5}\nH1: ${ctx.structureH1}\n\n`;
        r += `Recomiendo esperar a que ambos timeframes se alineen.`;
      }
      
      return r;
    }

    // Zonas
    if (q.includes('zona') || q.includes('demanda') || q.includes('oferta') || q.includes('soporte') || q.includes('resistencia')) {
      let r = `📦 **Zonas en ${ctx.name}**\n\n`;
      r += `🟢 Zonas de Demanda: ${ctx.demandZones}\n`;
      r += `🔴 Zonas de Oferta: ${ctx.supplyZones}\n\n`;
      
      if (ctx.premiumDiscount === 'DISCOUNT') {
        r += `💡 El precio está en DISCOUNT. Ideal para buscar compras en zonas de demanda.`;
      } else if (ctx.premiumDiscount === 'PREMIUM') {
        r += `💡 El precio está en PREMIUM. Ideal para buscar ventas en zonas de oferta.`;
      } else {
        r += `💡 El precio está en equilibrio. Esperar que se mueva a una zona clara.`;
      }
      
      return r;
    }

    // Stats
    if (q.includes('stat') || q.includes('resultado') || q.includes('win rate') || q.includes('rendimiento')) {
      const wr = state.stats.wins + state.stats.losses > 0 
        ? Math.round(state.stats.wins / (state.stats.wins + state.stats.losses) * 100) 
        : 0;
      
      let r = `📊 **Estadísticas**\n\n`;
      r += `📈 Win Rate: **${wr}%**\n`;
      r += `✅ Wins: ${state.stats.wins}\n`;
      r += `❌ Losses: ${state.stats.losses}\n\n`;
      r += `🎯 TPs alcanzados:\n`;
      r += `• TP1: ${state.stats.tp1Hits}\n`;
      r += `• TP2: ${state.stats.tp2Hits}\n`;
      r += `• TP3: ${state.stats.tp3Hits}`;
      
      return r;
    }

    // Default
    return `${this.getGreeting()} 💜\n\nEstoy viendo ${ctx.emoji} ${ctx.name} a ${ctx.price}.\n\nPuedes preguntarme sobre:\n• "análisis" - Ver el análisis completo\n• "señal" - Ver si hay operación activa\n• "plan" - Qué buscar ahora\n• "zonas" - Ver zonas de demanda/oferta\n• "stats" - Ver estadísticas`;
  }
}

const elisa = new ElisaAI();

// ═══════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════
app.get('/api/dashboard', (req, res) => {
  const assets = Object.keys(ASSETS).map(symbol => {
    const analysis = state.analysis[symbol] || {};
    const asset = ASSETS[symbol];
    const locked = state.lockedSignals[symbol];
    
    return {
      symbol,
      ...asset,
      price: analysis.price,
      structureM5: analysis.structureM5 || 'LOADING',
      structureH1: analysis.structureH1 || 'LOADING',
      mtfConfluence: analysis.mtfConfluence || false,
      premiumDiscount: analysis.premiumDiscount || 'EQUILIBRIUM',
      demandZones: analysis.zones?.demand?.length || 0,
      supplyZones: analysis.zones?.supply?.length || 0,
      h1Loaded: state.candlesH1[symbol]?.length > 0,
      lockedSignal: locked,
      signal: locked ? null : {
        score: analysis.orderFlow?.bullishPercent > 60 || analysis.orderFlow?.bearishPercent > 60 ? 55 : 30,
        reason: 'Analizando...'
      }
    };
  });

  res.json({
    connected: state.wsConnected,
    assets,
    recentSignals: state.signals.slice(-50).reverse(),
    stats: state.stats
  });
});

app.get('/api/analyze/:symbol', (req, res) => {
  const { symbol } = req.params;
  const candles = state.candles[symbol] || [];
  const candlesH1 = state.candlesH1[symbol] || [];
  const analysis = state.analysis[symbol] || {};
  
  res.json({
    symbol,
    candles: candles.slice(-100),
    candlesH1: candlesH1.slice(-50),
    analysis
  });
});

app.put('/api/signals/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  
  const signal = state.signals.find(s => s.id === id);
  if (!signal) {
    return res.status(404).json({ error: 'Signal not found' });
  }
  
  const symbol = signal.symbol;
  await closeSignal(id, status, symbol);
  
  res.json({ success: true, signal });
});

app.post('/api/ai/chat', (req, res) => {
  const { question, symbol } = req.body;
  const answer = elisa.chat(question, symbol || 'stpRNG');
  res.json({ answer });
});

// Endpoint para enviar mensaje manual a Telegram
app.post('/api/telegram/send', async (req, res) => {
  const { message } = req.body;
  const result = await sendTelegramMessage(message);
  res.json({ success: result?.ok || false, result });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '14.0',
    wsConnected: state.wsConnected,
    telegramConfigured: !!TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN !== 'TU_BOT_TOKEN_AQUI'
  });
});

// ═══════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Trading Master Pro v14.0 - Puerto ${PORT}`);
  console.log(`📱 Telegram: ${TELEGRAM_BOT_TOKEN !== 'TU_BOT_TOKEN_AQUI' ? '✅ Configurado' : '⚠️ No configurado'}`);
  connectDeriv();
});
