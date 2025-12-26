// =============================================
// TRADING MASTER PRO v10.4
// IA Expresiva + Diseño Profesional
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

const stats = {
  total: 0, wins: 0, losses: 0, notTaken: 0, pending: 0,
  tp1Hits: 0, tp2Hits: 0, tp3Hits: 0,
  byModel: { REVERSAL: { wins: 0, losses: 0 }, CONTINUATION: { wins: 0, losses: 0 }, CHOCH: { wins: 0, losses: 0 } },
  byAsset: {}
};

for (const symbol of Object.keys(ASSETS)) {
  stats.byAsset[symbol] = { wins: 0, losses: 0 };
}

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
    return swings.slice(-10);
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

  detectCHoCH(candles, swings) {
    if (swings.length < 4) return null;
    
    const highs = swings.filter(s => s.type === 'high').slice(-3);
    const lows = swings.filter(s => s.type === 'low').slice(-3);
    
    if (highs.length < 2 || lows.length < 2) return null;
    
    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    const lastLow = lows[lows.length - 1];
    const lastHigh = highs[highs.length - 1];
    const prevHigh = highs[highs.length - 2];
    const prevLow = lows[lows.length - 2];
    
    if (prevHigh && lastHigh && lastHigh.price > prevHigh.price) {
      if (lastCandle.close < lastLow.price && prevCandle.close > lastLow.price) {
        return { type: 'BEARISH_CHOCH', side: 'SELL', level: lastLow.price };
      }
    }
    
    if (prevLow && lastLow && lastLow.price < prevLow.price) {
      if (lastCandle.close > lastHigh.price && prevCandle.close < lastHigh.price) {
        return { type: 'BULLISH_CHOCH', side: 'BUY', level: lastHigh.price };
      }
    }
    
    return null;
  },

  detectBOS(candles, swings) {
    if (swings.length < 3) return null;
    
    const lastCandle = candles[candles.length - 1];
    const highs = swings.filter(s => s.type === 'high').slice(-3);
    const lows = swings.filter(s => s.type === 'low').slice(-3);
    
    if (highs.length >= 2) {
      const lastHigh = highs[highs.length - 1];
      if (lastCandle.close > lastHigh.price) {
        return { type: 'BULLISH_BOS', side: 'BUY', level: lastHigh.price };
      }
    }
    
    if (lows.length >= 2) {
      const lastLow = lows[lows.length - 1];
      if (lastCandle.close < lastLow.price) {
        return { type: 'BEARISH_BOS', side: 'SELL', level: lastLow.price };
      }
    }
    
    return null;
  },

  detectDisplacement(candles) {
    if (candles.length < 5) return null;
    
    const ranges = candles.slice(-20).map(c => c.high - c.low);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    
    for (let i = 1; i <= 5; i++) {
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
    const currentPrice = lastCandle.close;
    const { eqh, eql } = this.findLiquidity(candles);
    const swings = this.findSwings(candles);
    
    const sweep = this.detectSweep(lastCandle, eqh, eql);
    const choch = this.detectCHoCH(candles, swings);
    const bos = this.detectBOS(candles, swings);
    const displacement = this.detectDisplacement(candles);
    
    let score = 0;
    let breakdown = [];
    let action = 'WAIT';
    let entry = null, stop = null, tp1 = null, tp2 = null, tp3 = null;
    let model = 'NO_SETUP';
    
    if (sweep) { score += 30; breakdown.push(`Sweep ${sweep.type}`); }
    if (choch) { score += 35; breakdown.push(`CHoCH ${choch.type}`); }
    if (bos && !choch) { score += 20; breakdown.push(`BOS ${bos.type}`); }
    if (displacement?.valid) { score += 25; breakdown.push(`Displacement ${displacement.direction}`); }
    
    let direction = null;
    if (choch) { direction = choch.side; model = 'CHOCH'; }
    else if (sweep) { direction = sweep.side; model = 'REVERSAL'; }
    else if (displacement?.valid) { direction = displacement.direction === 'BULLISH' ? 'BUY' : 'SELL'; model = 'CONTINUATION'; }
    else if (bos) { direction = bos.side; model = 'CONTINUATION'; }
    
    const ob = direction ? this.findOrderBlock(candles, direction) : null;
    if (ob) { score += 15; breakdown.push(`Order Block ${ob.type}`); }
    
    const lows = swings.filter(s => s.type === 'low').slice(-3);
    const highs = swings.filter(s => s.type === 'high').slice(-3);
    const higherLows = lows.length >= 2 && lows[lows.length - 1].price > lows[lows.length - 2].price;
    const lowerHighs = highs.length >= 2 && highs[highs.length - 1].price < highs[highs.length - 2].price;
    
    if (score >= 70 && direction) {
      if (direction === 'BUY') {
        action = 'LONG';
        entry = ob ? ob.entry : currentPrice;
        stop = ob ? ob.low * 0.9995 : eql * 0.999;
        const risk = entry - stop;
        tp1 = entry + risk; tp2 = entry + risk * 2; tp3 = entry + risk * 3;
      } else {
        action = 'SHORT';
        entry = ob ? ob.entry : currentPrice;
        stop = ob ? ob.high * 1.0005 : eqh * 1.001;
        const risk = stop - entry;
        tp1 = entry - risk; tp2 = entry - risk * 2; tp3 = entry - risk * 3;
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
      }
    };
  }
};

// =============================================
// IA EXPRESIVA Y ANALÍTICA
// =============================================
const AI = {
  // Análisis profundo del mercado
  getFullContext(symbol) {
    const data = assetData[symbol];
    const config = ASSETS[symbol];
    if (!data || !config) return null;
    
    const candles = data.candles;
    const signal = data.signal;
    const price = data.price;
    
    if (candles.length < 20) return { asset: config.name, price, trend: 'sin datos', volatility: 'desconocida' };
    
    // Tendencia
    const recent = candles.slice(-20);
    const firstPrice = recent[0].close;
    const lastPrice = recent[recent.length - 1].close;
    const changePercent = ((lastPrice - firstPrice) / firstPrice * 100);
    
    let trend = 'lateral';
    let trendStrength = 'débil';
    if (changePercent > 0.5) { trend = 'alcista'; trendStrength = changePercent > 1 ? 'fuerte' : 'moderada'; }
    else if (changePercent < -0.5) { trend = 'bajista'; trendStrength = changePercent < -1 ? 'fuerte' : 'moderada'; }
    
    // Volatilidad
    const ranges = recent.map(c => ((c.high - c.low) / c.low) * 100);
    const avgVolatility = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    let volatility = 'baja';
    if (avgVolatility > 0.3) volatility = 'alta';
    else if (avgVolatility > 0.15) volatility = 'media';
    
    // Momentum
    const last5 = candles.slice(-5);
    const greenCandles = last5.filter(c => c.close > c.open).length;
    const momentum = greenCandles >= 4 ? 'muy alcista' : greenCandles >= 3 ? 'alcista' : greenCandles <= 1 ? 'muy bajista' : greenCandles <= 2 ? 'bajista' : 'neutral';
    
    // Distancia a liquidez
    const eqh = parseFloat(signal?.analysis?.eqh || 0);
    const eql = parseFloat(signal?.analysis?.eql || 0);
    const distToEQH = eqh ? ((eqh - price) / price * 100).toFixed(2) : null;
    const distToEQL = eql ? ((price - eql) / price * 100).toFixed(2) : null;
    
    return {
      asset: config.name,
      symbol,
      price,
      decimals: config.decimals,
      trend,
      trendStrength,
      changePercent: changePercent.toFixed(2),
      volatility,
      momentum,
      eqh,
      eql,
      distToEQH,
      distToEQL,
      signal,
      structure: signal?.analysis?.structure,
      hasSignal: signal?.action && !['WAIT', 'LOADING'].includes(signal.action)
    };
  },

  // Narración expresiva del mercado
  generateNarration(symbol) {
    const ctx = this.getFullContext(symbol);
    if (!ctx) return null;
    
    const lines = [];
    
    // Precio y cambio
    if (ctx.changePercent > 0) {
      lines.push(`📈 **${ctx.asset}** sube a **${ctx.price?.toFixed(ctx.decimals)}** (+${ctx.changePercent}%)`);
    } else if (ctx.changePercent < 0) {
      lines.push(`📉 **${ctx.asset}** baja a **${ctx.price?.toFixed(ctx.decimals)}** (${ctx.changePercent}%)`);
    } else {
      lines.push(`➡️ **${ctx.asset}** lateral en **${ctx.price?.toFixed(ctx.decimals)}**`);
    }
    
    // Análisis de tendencia
    if (ctx.trend === 'alcista') {
      lines.push(`🟢 Tendencia ${ctx.trendStrength} alcista. ${ctx.momentum === 'muy alcista' ? 'Compradores dominando con fuerza.' : 'Los bulls mantienen el control.'}`);
    } else if (ctx.trend === 'bajista') {
      lines.push(`🔴 Tendencia ${ctx.trendStrength} bajista. ${ctx.momentum === 'muy bajista' ? 'Vendedores en control total.' : 'Presión vendedora activa.'}`);
    } else {
      lines.push(`⚪ Mercado en consolidación. Esperando definición de dirección.`);
    }
    
    // Volatilidad
    if (ctx.volatility === 'alta') {
      lines.push(`⚡ Volatilidad ALTA - Movimientos amplios, ideal para scalping pero cuidado con los stops.`);
    } else if (ctx.volatility === 'baja') {
      lines.push(`😴 Volatilidad baja - Mercado tranquilo, posible explosión próxima.`);
    }
    
    // Niveles clave
    if (ctx.distToEQH && ctx.distToEQL) {
      const nearEQH = parseFloat(ctx.distToEQH) < 0.2;
      const nearEQL = parseFloat(ctx.distToEQL) < 0.2;
      
      if (nearEQH) {
        lines.push(`🎯 ¡Precio muy cerca del EQH ${ctx.eqh}! Posible sweep de liquidez inminente.`);
      } else if (nearEQL) {
        lines.push(`🎯 ¡Precio muy cerca del EQL ${ctx.eql}! Los stops de compradores están en peligro.`);
      } else {
        lines.push(`💧 Liquidez: Resistencia en ${ctx.eqh} | Soporte en ${ctx.eql}`);
      }
    }
    
    // Señal activa
    if (ctx.hasSignal) {
      const sig = ctx.signal;
      const emoji = sig.action === 'LONG' ? '🚀' : '🔻';
      lines.push(`\n${emoji} **SEÑAL ${sig.action} ACTIVA** - Modelo: ${sig.model}`);
      lines.push(`📊 Score: ${sig.score}% | Entry: ${sig.entry} | TP1: ${sig.tp1}`);
    }
    
    return { text: lines.join('\n'), timestamp: new Date().toISOString() };
  },

  // Chat expresivo y útil
  chat(question, symbol) {
    const ctx = this.getFullContext(symbol);
    if (!ctx) return { answer: "No tengo datos de este activo aún. Espera unos segundos mientras cargo la información." };
    
    const q = question.toLowerCase().trim();
    let answer = '';
    
    // TENDENCIA
    if (q.includes('tendencia') || q.includes('trend') || q.includes('dirección') || q.includes('alcista') || q.includes('bajista')) {
      answer = `📊 **Análisis de Tendencia - ${ctx.asset}**\n\n`;
      
      if (ctx.trend === 'alcista') {
        answer += `🟢 La tendencia actual es **ALCISTA** con fuerza **${ctx.trendStrength}**.\n\n`;
        answer += `El precio ha subido ${ctx.changePercent}% en las últimas 20 velas. `;
        answer += ctx.momentum === 'muy alcista' 
          ? `El momentum es muy fuerte con velas verdes dominando. Los compradores tienen el control total.`
          : `Los compradores mantienen la presión pero no hay euforia extrema.`;
        answer += `\n\n💡 **Mi opinión:** `;
        answer += ctx.structure === 'Higher Lows' 
          ? `La estructura de Higher Lows confirma la tendencia. Busca entradas en retrocesos.`
          : `Aunque sube, la estructura no es perfecta. Precaución con compras aquí arriba.`;
      } else if (ctx.trend === 'bajista') {
        answer += `🔴 La tendencia actual es **BAJISTA** con fuerza **${ctx.trendStrength}**.\n\n`;
        answer += `El precio ha caído ${Math.abs(ctx.changePercent)}% en las últimas 20 velas. `;
        answer += ctx.momentum === 'muy bajista'
          ? `Velas rojas dominando completamente. Los vendedores controlan el mercado.`
          : `Hay presión vendedora pero no es pánico total.`;
        answer += `\n\n💡 **Mi opinión:** `;
        answer += ctx.structure === 'Lower Highs'
          ? `La estructura de Lower Highs confirma la bajada. Busca shorts en rebotes.`
          : `Puede ser solo una corrección. Espera confirmación antes de vender.`;
      } else {
        answer += `⚪ El mercado está **LATERAL** (consolidando).\n\n`;
        answer += `El precio prácticamente no ha cambiado (${ctx.changePercent}%). `;
        answer += `Esto suele preceder un movimiento fuerte. El mercado está acumulando energía.\n\n`;
        answer += `💡 **Mi opinión:** Espera que el precio rompa el EQH (${ctx.eqh}) o EQL (${ctx.eql}) para definir dirección.`;
      }
    }
    
    // SEÑAL
    else if (q.includes('señal') || q.includes('signal') || q.includes('entrada') || q.includes('operar') || q.includes('trade')) {
      if (ctx.hasSignal) {
        const sig = ctx.signal;
        answer = `🎯 **¡Hay Señal Activa en ${ctx.asset}!**\n\n`;
        answer += `**Dirección:** ${sig.action === 'LONG' ? '🟢 COMPRA (Long)' : '🔴 VENTA (Short)'}\n`;
        answer += `**Modelo:** ${sig.model}\n`;
        answer += `**Score:** ${sig.score}/100\n\n`;
        answer += `📍 **Niveles:**\n`;
        answer += `• Entry: ${sig.entry}\n`;
        answer += `• Stop Loss: ${sig.stop}\n`;
        answer += `• TP1 (1:1): ${sig.tp1}\n`;
        answer += `• TP2 (1:2): ${sig.tp2}\n`;
        answer += `• TP3 (1:3): ${sig.tp3}\n\n`;
        
        if (sig.model === 'CHOCH') {
          answer += `⚡ **Análisis:** Esta es una señal de CHoCH (Change of Character). El mercado cambió de estructura, lo que indica un posible cambio de tendencia. Son señales de alta probabilidad.`;
        } else if (sig.model === 'REVERSAL') {
          answer += `🔄 **Análisis:** Señal de reversión por sweep de liquidez. El precio barrió los stops y ahora debería ir en la dirección opuesta.`;
        } else {
          answer += `📈 **Análisis:** Señal de continuación. El mercado muestra fuerza en la dirección actual con displacement confirmado.`;
        }
      } else {
        answer = `⏳ **No hay señal activa en ${ctx.asset}**\n\n`;
        answer += `El score actual es ${ctx.signal?.score || 0}%. Necesitamos 70% mínimo.\n\n`;
        answer += `**¿Qué falta para una señal?**\n`;
        answer += `• Sweep de liquidez (barrida de EQH/EQL)\n`;
        answer += `• CHoCH o BOS (cambio/ruptura de estructura)\n`;
        answer += `• Displacement (vela de impulso fuerte)\n`;
        answer += `• Order Block (zona de entrada óptima)\n\n`;
        answer += `💡 **Consejo:** La paciencia es clave. Espera el setup completo.`;
      }
    }
    
    // LIQUIDEZ
    else if (q.includes('liquidez') || q.includes('eqh') || q.includes('eql') || q.includes('soporte') || q.includes('resistencia')) {
      answer = `💧 **Zonas de Liquidez - ${ctx.asset}**\n\n`;
      answer += `📈 **Resistencia (EQH):** ${ctx.eqh}\n`;
      answer += `   Distancia: ${ctx.distToEQH}% ${parseFloat(ctx.distToEQH) < 0.2 ? '⚠️ MUY CERCA' : ''}\n\n`;
      answer += `📉 **Soporte (EQL):** ${ctx.eql}\n`;
      answer += `   Distancia: ${ctx.distToEQL}% ${parseFloat(ctx.distToEQL) < 0.2 ? '⚠️ MUY CERCA' : ''}\n\n`;
      answer += `**¿Qué significa?**\n`;
      answer += `• EQH = Equal Highs = Donde están los stop loss de vendedores\n`;
      answer += `• EQL = Equal Lows = Donde están los stop loss de compradores\n\n`;
      answer += `💡 El "smart money" suele llevar el precio a estas zonas para tomar liquidez antes de moverse.`;
    }
    
    // SMC / METODOLOGÍA
    else if (q.includes('smc') || q.includes('metodología') || q.includes('funciona') || q.includes('cómo')) {
      answer = `📚 **Metodología SMC (Smart Money Concepts)**\n\n`;
      answer += `El SMC busca operar como las instituciones:\n\n`;
      answer += `**1️⃣ Liquidez** - Identificar EQH/EQL\n`;
      answer += `   Zonas donde hay stops acumulados\n\n`;
      answer += `**2️⃣ Sweep** - Barrida de liquidez\n`;
      answer += `   El precio toma esos stops y regresa\n\n`;
      answer += `**3️⃣ CHoCH/BOS** - Cambio de estructura\n`;
      answer += `   CHoCH = Cambio de tendencia\n`;
      answer += `   BOS = Continuación de tendencia\n\n`;
      answer += `**4️⃣ Displacement** - Vela de impulso\n`;
      answer += `   Confirma la dirección institucional\n\n`;
      answer += `**5️⃣ Order Block** - Zona de entrada\n`;
      answer += `   Última vela opuesta antes del movimiento\n\n`;
      answer += `⏱️ Timeframe: M5 (5 minutos)\n`;
      answer += `🎯 Score mínimo: 70%`;
    }
    
    // ESTADÍSTICAS
    else if (q.includes('estadística') || q.includes('resultado') || q.includes('win') || q.includes('rate') || q.includes('rendimiento')) {
      const totalDecided = stats.wins + stats.losses;
      const winRate = totalDecided > 0 ? ((stats.wins / totalDecided) * 100).toFixed(1) : 0;
      
      answer = `📊 **Estadísticas de Trading**\n\n`;
      answer += `**Resumen General:**\n`;
      answer += `• ✅ Wins: ${stats.wins}\n`;
      answer += `• ❌ Losses: ${stats.losses}\n`;
      answer += `• ⏭️ No tomadas: ${stats.notTaken}\n`;
      answer += `• ⏳ Pendientes: ${stats.pending}\n\n`;
      answer += `**📈 Win Rate: ${winRate}%**\n\n`;
      answer += `**TPs Alcanzados:**\n`;
      answer += `• TP1: ${stats.tp1Hits} | TP2: ${stats.tp2Hits} | TP3: ${stats.tp3Hits}\n\n`;
      
      if (Object.values(stats.byModel).some(m => m.wins + m.losses > 0)) {
        answer += `**Por Modelo:**\n`;
        for (const [model, s] of Object.entries(stats.byModel)) {
          if (s.wins + s.losses > 0) {
            const wr = ((s.wins / (s.wins + s.losses)) * 100).toFixed(0);
            answer += `• ${model}: ${s.wins}W/${s.losses}L (${wr}%)\n`;
          }
        }
      }
    }
    
    // VOLATILIDAD
    else if (q.includes('volatilidad') || q.includes('movimiento') || q.includes('rango')) {
      answer = `⚡ **Volatilidad - ${ctx.asset}**\n\n`;
      answer += `**Nivel actual:** ${ctx.volatility.toUpperCase()}\n\n`;
      
      if (ctx.volatility === 'alta') {
        answer += `El mercado está muy activo con movimientos amplios.\n\n`;
        answer += `**Implicaciones:**\n`;
        answer += `• ✅ Más oportunidades de profit\n`;
        answer += `• ⚠️ Necesitas stops más amplios\n`;
        answer += `• ⚠️ Mayor riesgo por operación\n\n`;
        answer += `💡 Reduce el tamaño de posición para compensar.`;
      } else if (ctx.volatility === 'baja') {
        answer += `El mercado está tranquilo con poco movimiento.\n\n`;
        answer += `**Implicaciones:**\n`;
        answer += `• ⚠️ Menos oportunidades claras\n`;
        answer += `• ✅ Stops más ajustados posibles\n`;
        answer += `• ⚡ Posible explosión de volatilidad próxima\n\n`;
        answer += `💡 Prepárate para cuando el mercado despierte.`;
      } else {
        answer += `Volatilidad normal. Condiciones estándar de trading.`;
      }
    }
    
    // PRECIO / COTIZACIÓN
    else if (q.includes('precio') || q.includes('cotiza') || q.includes('cuánto') || q.includes('está')) {
      answer = `💰 **${ctx.asset}**\n\n`;
      answer += `**Precio actual:** ${ctx.price?.toFixed(ctx.decimals)}\n`;
      answer += `**Cambio reciente:** ${ctx.changePercent > 0 ? '+' : ''}${ctx.changePercent}%\n`;
      answer += `**Tendencia:** ${ctx.trend}\n`;
      answer += `**Momentum:** ${ctx.momentum}\n\n`;
      answer += `📍 **Niveles clave:**\n`;
      answer += `• Resistencia: ${ctx.eqh}\n`;
      answer += `• Soporte: ${ctx.eql}`;
    }
    
    // QUÉ HACER / RECOMENDACIÓN
    else if (q.includes('qué hacer') || q.includes('recomien') || q.includes('consejo') || q.includes('debería') || q.includes('opino')) {
      answer = `🤔 **Mi Análisis para ${ctx.asset}**\n\n`;
      
      if (ctx.hasSignal) {
        const sig = ctx.signal;
        answer += `✅ **Hay una señal ${sig.action} activa**\n\n`;
        
        if (sig.score >= 85) {
          answer += `💪 Es una señal de ALTA calidad (${sig.score}%). Los elementos SMC están bien alineados.\n\n`;
          answer += `**Mi recomendación:** Puedes considerar la entrada. Respeta siempre el stop loss.`;
        } else {
          answer += `👍 Señal válida pero no perfecta (${sig.score}%).\n\n`;
          answer += `**Mi recomendación:** Puedes tomarla con gestión conservadora (menor tamaño de posición).`;
        }
      } else {
        answer += `⏳ **No hay señal válida**\n\n`;
        
        if (ctx.trend === 'lateral') {
          answer += `El mercado está consolidando. Es momento de **ESPERAR**.\n\n`;
          answer += `💡 No fuerces operaciones en rangos. La paciencia paga.`;
        } else if (ctx.signal?.score >= 50) {
          answer += `El setup está formándose (${ctx.signal?.score}%). Falta confirmación.\n\n`;
          answer += `💡 Vigila de cerca. Una señal podría activarse pronto.`;
        } else {
          answer += `No hay setup claro. El mercado no muestra intención definida.\n\n`;
          answer += `💡 Mejor esperar condiciones más claras.`;
        }
      }
    }
    
    // CHOCH específico
    else if (q.includes('choch') || q.includes('cambio de caracter') || q.includes('change')) {
      answer = `⚡ **CHoCH - Change of Character**\n\n`;
      answer += `El CHoCH es uno de los conceptos más poderosos de SMC.\n\n`;
      answer += `**¿Qué es?**\n`;
      answer += `Un cambio en la estructura del mercado que indica posible reversión de tendencia.\n\n`;
      answer += `**CHoCH Alcista:**\n`;
      answer += `• El mercado hacía Lower Lows (bajista)\n`;
      answer += `• Rompe un High anterior\n`;
      answer += `• Señal de posible cambio a alcista\n\n`;
      answer += `**CHoCH Bajista:**\n`;
      answer += `• El mercado hacía Higher Highs (alcista)\n`;
      answer += `• Rompe un Low anterior\n`;
      answer += `• Señal de posible cambio a bajista\n\n`;
      
      if (ctx.signal?.analysis?.choch) {
        answer += `🎯 **DETECTADO en ${ctx.asset}:** ${ctx.signal.analysis.choch}`;
      } else {
        answer += `📍 Actualmente no hay CHoCH en ${ctx.asset}.`;
      }
    }
    
    // RESPUESTA GENÉRICA
    else {
      answer = `📊 **${ctx.asset} - Resumen**\n\n`;
      answer += `💰 Precio: ${ctx.price?.toFixed(ctx.decimals)}\n`;
      answer += `📈 Tendencia: ${ctx.trend} (${ctx.trendStrength})\n`;
      answer += `⚡ Volatilidad: ${ctx.volatility}\n`;
      answer += `🎯 Momentum: ${ctx.momentum}\n\n`;
      
      if (ctx.hasSignal) {
        answer += `✅ **Señal activa:** ${ctx.signal.action} (${ctx.signal.score}%)\n`;
      } else {
        answer += `⏳ Sin señal activa\n`;
      }
      
      answer += `\n💬 Puedes preguntarme sobre:\n`;
      answer += `• tendencia, señal, liquidez, SMC\n`;
      answer += `• volatilidad, estadísticas, CHoCH\n`;
      answer += `• qué hacer, recomendaciones`;
    }
    
    return { answer, timestamp: new Date().toISOString() };
  }
};

// =============================================
// AUTO-TRACKING
// =============================================
function checkSignalHits() {
  const pending = signalHistory.filter(s => s.status === 'PENDING');
  
  for (const signal of pending) {
    const data = assetData[signal.symbol];
    if (!data?.price) continue;
    
    const price = data.price;
    const isLong = signal.action === 'LONG';
    
    if ((isLong && price <= signal.stop) || (!isLong && price >= signal.stop)) {
      markSignal(signal.id, 'LOSS', 'AUTO');
      continue;
    }
    
    if (isLong) {
      if (price >= signal.tp3 && !signal.tp3Hit) { signal.tp3Hit = true; signal.tpLevel = 3; stats.tp3Hits++; markSignal(signal.id, 'WIN', 'AUTO-TP3'); }
      else if (price >= signal.tp2 && !signal.tp2Hit) { signal.tp2Hit = true; signal.tpLevel = 2; stats.tp2Hits++; }
      else if (price >= signal.tp1 && !signal.tp1Hit) { signal.tp1Hit = true; signal.tpLevel = 1; stats.tp1Hits++; }
    } else {
      if (price <= signal.tp3 && !signal.tp3Hit) { signal.tp3Hit = true; signal.tpLevel = 3; stats.tp3Hits++; markSignal(signal.id, 'WIN', 'AUTO-TP3'); }
      else if (price <= signal.tp2 && !signal.tp2Hit) { signal.tp2Hit = true; signal.tpLevel = 2; stats.tp2Hits++; }
      else if (price <= signal.tp1 && !signal.tp1Hit) { signal.tp1Hit = true; signal.tpLevel = 1; stats.tp1Hits++; }
    }
  }
}

function markSignal(id, status, source = 'MANUAL') {
  const signal = signalHistory.find(s => s.id === id);
  if (!signal || signal.status !== 'PENDING') return null;
  
  signal.status = status;
  signal.closedAt = new Date().toISOString();
  signal.closedBy = source;
  
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
// CONEXIÓN DERIV
// =============================================
function connectDeriv() {
  const appId = process.env.DERIV_APP_ID || '117347';
  
  try {
    derivWs = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
  } catch (err) {
    setTimeout(connectDeriv, 5000);
    return;
  }
  
  derivWs.on('open', () => {
    console.log('✅ Conectado a Deriv');
    isConnected = true;
    reconnectAttempts = 0;
    
    for (const symbol of Object.keys(ASSETS)) {
      derivWs.send(JSON.stringify({
        ticks_history: symbol, adjust_start_time: 1, count: 100, end: 'latest',
        granularity: 300, style: 'candles', subscribe: 1
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
            open: parseFloat(c.open), high: parseFloat(c.high),
            low: parseFloat(c.low), close: parseFloat(c.close)
          }));
          analyzeAsset(symbol);
        }
      }
      
      if (msg.ohlc) {
        const symbol = msg.ohlc.symbol;
        if (assetData[symbol]) {
          const newCandle = {
            time: msg.ohlc.open_time * 1000,
            open: parseFloat(msg.ohlc.open), high: parseFloat(msg.ohlc.high),
            low: parseFloat(msg.ohlc.low), close: parseFloat(msg.ohlc.close)
          };
          
          const candles = assetData[symbol].candles;
          if (candles.length > 0) {
            const last = candles[candles.length - 1];
            if (last.time === newCandle.time) candles[candles.length - 1] = newCandle;
            else if (newCandle.time > last.time) {
              candles.push(newCandle);
              if (candles.length > 200) candles.shift();
              analyzeAsset(symbol);
            }
          }
          assetData[symbol].price = newCandle.close;
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
  
  if (signal.action !== 'WAIT' && signal.action !== 'LOADING' && signal.score >= 70) {
    const hasPending = signalHistory.some(s => s.symbol === symbol && s.status === 'PENDING' && now - new Date(s.timestamp).getTime() < 600000);
    
    if (!hasPending) {
      const newSignal = {
        id: signalIdCounter++, symbol, assetName: config.name, emoji: config.emoji,
        action: signal.action, model: signal.model, score: signal.score,
        entry: signal.entry, stop: signal.stop, tp1: signal.tp1, tp2: signal.tp2, tp3: signal.tp3,
        tp1Hit: false, tp2Hit: false, tp3Hit: false, tpLevel: 0,
        price: data.price, status: 'PENDING', timestamp: new Date().toISOString(),
        breakdown: signal.breakdown
      };
      
      signalHistory.unshift(newSignal);
      stats.total++;
      stats.pending++;
      if (signalHistory.length > 100) signalHistory.pop();
    }
  }
}

// =============================================
// API ENDPOINTS
// =============================================
app.get('/', (req, res) => res.json({ name: 'Trading Master Pro', version: '10.4', connected: isConnected }));

app.get('/api/dashboard', (req, res) => {
  res.json({
    connected: isConnected,
    timestamp: new Date().toISOString(),
    assets: Object.entries(assetData).map(([symbol, data]) => ({
      symbol, ...ASSETS[symbol], price: data.price, signal: data.signal
    })),
    recentSignals: signalHistory.slice(0, 20),
    stats
  });
});

app.get('/api/analyze/:symbol', (req, res) => {
  const { symbol } = req.params;
  const data = assetData[symbol];
  const config = ASSETS[symbol];
  if (!data || !config) return res.status(404).json({ error: 'Not found' });
  res.json({ symbol, ...config, price: data.price, signal: data.signal, candles: data.candles.slice(-60) });
});

app.get('/api/signals', (req, res) => res.json({ signals: signalHistory, stats }));

app.put('/api/signals/:id', (req, res) => {
  const signal = markSignal(parseInt(req.params.id), req.body.status, 'MANUAL');
  if (!signal) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, signal, stats });
});

app.get('/api/ai/narrate/:symbol', (req, res) => {
  const narration = AI.generateNarration(req.params.symbol);
  if (!narration) return res.status(404).json({ error: 'Not found' });
  res.json(narration);
});

app.post('/api/ai/chat', (req, res) => {
  const { question, symbol } = req.body;
  if (!question || !symbol) return res.status(400).json({ error: 'Missing params' });
  res.json(AI.chat(question, symbol));
});

app.get('/api/stats', (req, res) => res.json({ ...stats, winRate: stats.wins + stats.losses > 0 ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1) : 0 }));

// =============================================
// INICIO
// =============================================
app.listen(PORT, () => {
  console.log(`\n🚀 Trading Master Pro v10.4 - Puerto ${PORT}\n`);
  connectDeriv();
  setInterval(() => { if (derivWs?.readyState === WebSocket.OPEN) derivWs.send(JSON.stringify({ ping: 1 })); }, 30000);
});

export default app;
