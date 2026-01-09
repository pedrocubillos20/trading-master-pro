// =============================================
// SIGNAL GENERATION v16.0 - ZONA VÁLIDA OB
// 12 Modelos con validación de Order Block real
// =============================================
// 
// NOVEDAD v16: Todos los modelos requieren ZONA VÁLIDA
// - LONG: Vela roja + envolvente verde (acumulación)
// - SHORT: Vela verde + envolvente roja (distribución)
//
// Esta es la VERDADERA formación de Order Block según SMC
// =============================================

/**
 * Detecta zona válida de Order Block
 * @param {Array} candles - Array de velas
 * @param {string} side - 'BUY' o 'SELL'
 * @param {number} lookback - Cuántas velas revisar hacia atrás
 * @returns {Object|null} - Información de la zona válida o null
 */
function detectValidOBZone(candles, side, lookback = 10) {
  if (!candles || candles.length < 3) return null;
  
  const recentCandles = candles.slice(-lookback);
  
  for (let i = recentCandles.length - 2; i >= 1; i--) {
    const baseCandle = recentCandles[i - 1];  // Vela base (la que forma la zona)
    const engulfCandle = recentCandles[i];     // Vela envolvente
    
    if (!baseCandle || !engulfCandle) continue;
    
    const baseBody = Math.abs(baseCandle.close - baseCandle.open);
    const engulfBody = Math.abs(engulfCandle.close - engulfCandle.open);
    
    // Verificar que la envolvente sea significativa (al menos 1.2x el cuerpo base)
    const isEngulfing = engulfBody >= baseBody * 1.2;
    
    if (side === 'BUY') {
      // LONG: Vela roja (base) + Vela verde envolvente
      const isBaseRed = baseCandle.close < baseCandle.open;
      const isEngulfGreen = engulfCandle.close > engulfCandle.open;
      const engulfsBody = engulfCandle.close > baseCandle.open && engulfCandle.open <= baseCandle.close;
      
      if (isBaseRed && isEngulfGreen && isEngulfing && engulfsBody) {
        return {
          valid: true,
          side: 'BUY',
          baseCandle: baseCandle,
          engulfCandle: engulfCandle,
          zoneHigh: baseCandle.open,  // Máximo del cuerpo rojo
          zoneLow: baseCandle.close,   // Mínimo del cuerpo rojo
          strength: Math.min(100, (engulfBody / baseBody) * 50), // Fuerza relativa
          candlesAgo: recentCandles.length - i
        };
      }
    } else if (side === 'SELL') {
      // SHORT: Vela verde (base) + Vela roja envolvente
      const isBaseGreen = baseCandle.close > baseCandle.open;
      const isEngulfRed = engulfCandle.close < engulfCandle.open;
      const engulfsBody = engulfCandle.open > baseCandle.close && engulfCandle.close <= baseCandle.open;
      
      if (isBaseGreen && isEngulfRed && isEngulfing && engulfsBody) {
        return {
          valid: true,
          side: 'SELL',
          baseCandle: baseCandle,
          engulfCandle: engulfCandle,
          zoneHigh: baseCandle.close,  // Máximo del cuerpo verde
          zoneLow: baseCandle.open,     // Mínimo del cuerpo verde
          strength: Math.min(100, (engulfBody / baseBody) * 50),
          candlesAgo: recentCandles.length - i
        };
      }
    }
  }
  
  return null;
}

/**
 * Genera señales SMC v16 - Con validación de Zona OB
 * @param {Object} params - Parámetros del análisis
 * @returns {Array} Lista de señales ordenadas por score
 */
function generateSignalsV16({
  candlesM5,
  structureM5,
  structureH1,
  mtfConfluence,
  pullback,
  demandZones,
  supplyZones,
  fvgZones,
  liquidityLevels,
  premiumDiscount,
  choch,
  bos,
  orderFlow,
  avgRange,
  config
}) {
  const signals = [];
  const lastCandle = candlesM5[candlesM5.length - 1];
  const price = lastCandle?.close || 0;
  
  // Pre-detectar zonas válidas para ambos lados
  const validBuyZone = detectValidOBZone(candlesM5, 'BUY', 15);
  const validSellZone = detectValidOBZone(candlesM5, 'SELL', 15);
  
  // ═══════════════════════════════════════════
  // TIER S - MODELOS ELITE (95-100 pts)
  // ═══════════════════════════════════════════
  
  // 1. MTF_CONFLUENCE (95-100) - El mejor modelo
  // REQUIERE: Zona válida OB
  if (mtfConfluence && pullback) {
    const sideMatch = (structureH1.trend === 'BULLISH' && pullback.side === 'BUY') ||
                      (structureH1.trend === 'BEARISH' && pullback.side === 'SELL');
    
    // Verificar zona válida según el lado
    const validZone = pullback.side === 'BUY' ? validBuyZone : validSellZone;
    
    if (sideMatch && validZone) {
      let score = 95;
      if (pullback.side === 'BUY' && premiumDiscount === 'DISCOUNT') score += 3;
      if (pullback.side === 'SELL' && premiumDiscount === 'PREMIUM') score += 3;
      // Bonus por zona muy reciente
      if (validZone.candlesAgo <= 5) score += 2;
      
      signals.push({
        model: 'MTF_CONFLUENCE',
        baseScore: Math.min(100, score),
        pullback,
        validZone,
        reason: `H1+M5 ${structureH1.trend} + Zona OB válida (${validZone.candlesAgo} velas)`
      });
    }
  }
  
  // 2. OTE_ENTRY (82-95) - Entrada en zona Fibonacci 62-79%
  // REQUIERE: Zona válida OB
  if (choch && pullback) {
    const validZone = choch.side === 'BUY' ? validBuyZone : validSellZone;
    
    if (validZone) {
      const recentCandles = candlesM5.slice(-10);
      const moveHigh = Math.max(...recentCandles.map(c => c.high));
      const moveLow = Math.min(...recentCandles.map(c => c.low));
      const moveRange = moveHigh - moveLow;
      
      const ote62 = choch.side === 'BUY' ? moveLow + moveRange * 0.21 : moveHigh - moveRange * 0.21;
      const ote79 = choch.side === 'BUY' ? moveLow + moveRange * 0.38 : moveHigh - moveRange * 0.38;
      
      const inOTE = choch.side === 'BUY' 
        ? (lastCandle.close >= ote62 && lastCandle.close <= ote79)
        : (lastCandle.close <= ote62 && lastCandle.close >= ote79);
      
      if (inOTE) {
        let score = 82;
        if (mtfConfluence) score += 5;
        const pdCorrect = (choch.side === 'BUY' && premiumDiscount === 'DISCOUNT') ||
                          (choch.side === 'SELL' && premiumDiscount === 'PREMIUM');
        if (pdCorrect) score += 5;
        // Bonus por zona fuerte
        if (validZone.strength >= 70) score += 3;
        
        signals.push({
          model: 'OTE_ENTRY',
          baseScore: Math.min(95, score),
          pullback,
          validZone,
          reason: `OTE Fib 62-79% + Zona OB válida${mtfConfluence ? ' + MTF' : ''}`
        });
      }
    }
  }
  
  // ═══════════════════════════════════════════
  // TIER A - MODELOS DE ALTA CALIDAD (80-95 pts)
  // ═══════════════════════════════════════════
  
  // 3. CHOCH_PULLBACK (85-95) - Cambio de estructura + pullback
  // REQUIERE: Zona válida OB
  if (choch && pullback && choch.side === pullback.side) {
    const validZone = choch.side === 'BUY' ? validBuyZone : validSellZone;
    
    if (validZone) {
      const h1NotAgainst = (choch.side === 'BUY' && structureH1.trend !== 'BEARISH') ||
                           (choch.side === 'SELL' && structureH1.trend !== 'BULLISH');
      
      if (h1NotAgainst) {
        let score = 85;
        if (mtfConfluence) score += 5;
        if (structureM5.strength >= 70) score += 3;
        // Bonus por zona reciente
        if (validZone.candlesAgo <= 5) score += 2;
        
        signals.push({
          model: 'CHOCH_PULLBACK',
          baseScore: Math.min(95, score),
          pullback,
          validZone,
          reason: `${choch.type} + Zona OB válida${mtfConfluence ? ' + MTF' : ''}`
        });
      }
    }
  }
  
  // 4. INDUCEMENT (80-92) - Barrido de liquidez + reversión
  // REQUIERE: Zona válida OB para confirmación
  const recentHighs = candlesM5.slice(-20).map(c => c.high);
  const recentLows = candlesM5.slice(-20).map(c => c.low);
  const highestRecent = Math.max(...recentHighs.slice(0, -3));
  const lowestRecent = Math.min(...recentLows.slice(0, -3));
  
  // Barrido de máximos + reversión = SELL
  if (lastCandle.high > highestRecent && lastCandle.close < highestRecent && validSellZone) {
    const sweepWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
    const sweepBody = Math.abs(lastCandle.close - lastCandle.open);
    
    if (sweepWick > sweepBody * 0.5) {
      const indEntry = {
        side: 'SELL',
        entry: lastCandle.close,
        stop: lastCandle.high + avgRange * 0.3,
        tp1: lastCandle.close - avgRange * 2,
        tp2: lastCandle.close - avgRange * 3.5,
        tp3: lastCandle.close - avgRange * 5
      };
      
      let score = 80;
      if (structureH1.trend === 'BEARISH') score += 5;
      if (premiumDiscount === 'PREMIUM') score += 5;
      // Bonus por zona fuerte
      if (validSellZone.strength >= 70) score += 2;
      
      signals.push({
        model: 'INDUCEMENT',
        baseScore: Math.min(92, score),
        pullback: indEntry,
        validZone: validSellZone,
        reason: `Barrido máximos + Zona OB válida${structureH1.trend === 'BEARISH' ? ' + H1 BEAR' : ''}`
      });
    }
  }
  
  // Barrido de mínimos + reversión = BUY
  if (lastCandle.low < lowestRecent && lastCandle.close > lowestRecent && validBuyZone) {
    const sweepWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
    const sweepBody = Math.abs(lastCandle.close - lastCandle.open);
    
    if (sweepWick > sweepBody * 0.5) {
      const indEntry = {
        side: 'BUY',
        entry: lastCandle.close,
        stop: lastCandle.low - avgRange * 0.3,
        tp1: lastCandle.close + avgRange * 2,
        tp2: lastCandle.close + avgRange * 3.5,
        tp3: lastCandle.close + avgRange * 5
      };
      
      let score = 80;
      if (structureH1.trend === 'BULLISH') score += 5;
      if (premiumDiscount === 'DISCOUNT') score += 5;
      if (validBuyZone.strength >= 70) score += 2;
      
      signals.push({
        model: 'INDUCEMENT',
        baseScore: Math.min(92, score),
        pullback: indEntry,
        validZone: validBuyZone,
        reason: `Barrido mínimos + Zona OB válida${structureH1.trend === 'BULLISH' ? ' + H1 BULL' : ''}`
      });
    }
  }
  
  // 5 & 6. BOOM_SPIKE / CRASH_SPIKE (80-92) - Específicos para sintéticos
  // REQUIERE: Zona válida OB
  // (Se detectan en detectBoomCrashSpike con validación de zona)
  
  // ═══════════════════════════════════════════
  // TIER B - MODELOS DE BUENA CALIDAD (75-90 pts)
  // ═══════════════════════════════════════════
  
  // 7. BREAKER_BLOCK (78-90) - OB que falló = zona opuesta
  // REQUIERE: Zona válida OB
  if (bos && choch) {
    const validZone = choch.side === 'BUY' ? validBuyZone : validSellZone;
    
    if (validZone) {
      const breakerEntry = {
        side: choch.side,
        entry: lastCandle.close,
        stop: choch.side === 'BUY' ? choch.level - avgRange * 1.5 : choch.level + avgRange * 1.5,
        tp1: choch.side === 'BUY' ? lastCandle.close + avgRange * 2 : lastCandle.close - avgRange * 2,
        tp2: choch.side === 'BUY' ? lastCandle.close + avgRange * 3.5 : lastCandle.close - avgRange * 3.5,
        tp3: choch.side === 'BUY' ? lastCandle.close + avgRange * 5 : lastCandle.close - avgRange * 5
      };
      
      let score = 78;
      if (mtfConfluence) score += 7;
      const pdCorrect = (choch.side === 'BUY' && premiumDiscount === 'DISCOUNT') ||
                        (choch.side === 'SELL' && premiumDiscount === 'PREMIUM');
      if (pdCorrect) score += 5;
      
      signals.push({
        model: 'BREAKER_BLOCK',
        baseScore: Math.min(90, score),
        pullback: breakerEntry,
        validZone,
        reason: `Breaker ${choch.side} + Zona OB válida${mtfConfluence ? ' + MTF' : ''}`
      });
    }
  }
  
  // 8. LIQUIDITY_GRAB (78-90) - Patrón de 2-3 velas
  // REQUIERE: Zona válida OB
  const prev2Candle = candlesM5[candlesM5.length - 3];
  const prevCandle = candlesM5[candlesM5.length - 2];
  
  if (prev2Candle && prevCandle) {
    const brokeHigh = prevCandle.high > prev2Candle.high && prevCandle.close < prev2Candle.high;
    const brokeLow = prevCandle.low < prev2Candle.low && prevCandle.close > prev2Candle.low;
    
    if (brokeHigh && lastCandle.close < prevCandle.close && validSellZone) {
      const lgEntry = {
        side: 'SELL',
        entry: lastCandle.close,
        stop: prevCandle.high + avgRange * 0.3,
        tp1: lastCandle.close - avgRange * 1.8,
        tp2: lastCandle.close - avgRange * 3,
        tp3: lastCandle.close - avgRange * 4.5
      };
      
      let score = 78;
      if (structureH1.trend === 'BEARISH') score += 5;
      if (premiumDiscount === 'PREMIUM') score += 5;
      if (validSellZone.candlesAgo <= 5) score += 2;
      
      signals.push({
        model: 'LIQUIDITY_GRAB',
        baseScore: Math.min(90, score),
        pullback: lgEntry,
        validZone: validSellZone,
        reason: `Grab alcista + Zona OB válida${structureH1.trend === 'BEARISH' ? ' + H1 BEAR' : ''}`
      });
    }
    
    if (brokeLow && lastCandle.close > prevCandle.close && validBuyZone) {
      const lgEntry = {
        side: 'BUY',
        entry: lastCandle.close,
        stop: prevCandle.low - avgRange * 0.3,
        tp1: lastCandle.close + avgRange * 1.8,
        tp2: lastCandle.close + avgRange * 3,
        tp3: lastCandle.close + avgRange * 4.5
      };
      
      let score = 78;
      if (structureH1.trend === 'BULLISH') score += 5;
      if (premiumDiscount === 'DISCOUNT') score += 5;
      if (validBuyZone.candlesAgo <= 5) score += 2;
      
      signals.push({
        model: 'LIQUIDITY_GRAB',
        baseScore: Math.min(90, score),
        pullback: lgEntry,
        validZone: validBuyZone,
        reason: `Grab bajista + Zona OB válida${structureH1.trend === 'BULLISH' ? ' + H1 BULL' : ''}`
      });
    }
  }
  
  // 9. BOS_CONTINUATION (75-88) - Continuación de tendencia con pullback
  // REQUIERE: Zona válida OB
  if (bos && pullback && bos.side === pullback.side) {
    const validZone = bos.side === 'BUY' ? validBuyZone : validSellZone;
    
    if (validZone) {
      let score = 75;
      if (mtfConfluence) score += 7;
      if (orderFlow?.strength >= 60) score += 3;
      if (validZone.candlesAgo <= 5) score += 3;
      
      signals.push({
        model: 'BOS_CONTINUATION',
        baseScore: Math.min(88, score),
        pullback,
        validZone,
        reason: `${bos.type} + Zona OB válida${mtfConfluence ? ' + MTF' : ''}`
      });
    }
  }
  
  // ═══════════════════════════════════════════
  // TIER C - MODELOS COMPLEMENTARIOS (72-85 pts)
  // ═══════════════════════════════════════════
  
  // 10. SMART_MONEY_TRAP (75-87) - Falso breakout
  // REQUIERE: Zona válida OB
  if (bos && orderFlow?.strength >= 60) {
    const bosRecent = candlesM5.slice(-3).some(c => 
      (bos.side === 'BUY' && c.high > bos.level) ||
      (bos.side === 'SELL' && c.low < bos.level)
    );
    
    const priceReversed = (bos.side === 'BUY' && lastCandle.close < bos.level) ||
                          (bos.side === 'SELL' && lastCandle.close > bos.level);
    
    if (bosRecent && priceReversed) {
      const trapSide = bos.side === 'BUY' ? 'SELL' : 'BUY';
      const validZone = trapSide === 'BUY' ? validBuyZone : validSellZone;
      
      if (validZone) {
        const trapEntry = {
          side: trapSide,
          entry: lastCandle.close,
          stop: trapSide === 'BUY' ? lastCandle.low - avgRange * 0.5 : lastCandle.high + avgRange * 0.5,
          tp1: trapSide === 'BUY' ? lastCandle.close + avgRange * 2 : lastCandle.close - avgRange * 2,
          tp2: trapSide === 'BUY' ? lastCandle.close + avgRange * 3.5 : lastCandle.close - avgRange * 3.5,
          tp3: trapSide === 'BUY' ? lastCandle.close + avgRange * 5 : lastCandle.close - avgRange * 5
        };
        
        let score = 75;
        if (orderFlow.strength >= 70) score += 5;
        const pdCorrect = (trapSide === 'BUY' && premiumDiscount === 'DISCOUNT') ||
                          (trapSide === 'SELL' && premiumDiscount === 'PREMIUM');
        if (pdCorrect) score += 5;
        if (validZone.strength >= 70) score += 2;
        
        signals.push({
          model: 'SMART_MONEY_TRAP',
          baseScore: Math.min(87, score),
          pullback: trapEntry,
          validZone,
          reason: `Trampa ${bos.type} + Zona OB válida${pdCorrect ? ' + P/D' : ''}`
        });
      }
    }
  }
  
  // 11. FVG_ENTRY (72-85) - Entrada en Fair Value Gap
  // REQUIERE: Zona válida OB
  for (const fvg of fvgZones) {
    const inFVG = price >= fvg.low * 0.999 && price <= fvg.high * 1.001;
    const validZone = fvg.side === 'BUY' ? validBuyZone : validSellZone;
    
    if (inFVG && pullback && fvg.side === pullback.side && validZone) {
      let score = 72;
      if (mtfConfluence) score += 8;
      if (validZone.candlesAgo <= 5) score += 3;
      if (validZone.strength >= 70) score += 2;
      
      signals.push({
        model: 'FVG_ENTRY',
        baseScore: Math.min(85, score),
        pullback,
        validZone,
        reason: `En ${fvg.type} + Zona OB válida${mtfConfluence ? ' + MTF' : ''}`
      });
    }
  }
  
  // 12. OB_ENTRY (72-88) - Entrada en Order Block
  // REQUIERE: Zona válida OB (es el modelo principal de OB)
  if (pullback && (pullback.type === 'DEMAND_ZONE' || pullback.type === 'SUPPLY_ZONE')) {
    const validZone = pullback.side === 'BUY' ? validBuyZone : validSellZone;
    
    if (validZone) {
      let score = 72;
      const pdCorrect = (pullback.side === 'BUY' && premiumDiscount === 'DISCOUNT') ||
                        (pullback.side === 'SELL' && premiumDiscount === 'PREMIUM');
      if (pdCorrect) score += 5;
      if (mtfConfluence) score += 5;
      
      // Bonus por rechazo fuerte
      const wickSize = pullback.side === 'BUY' 
        ? (lastCandle.close - lastCandle.low)
        : (lastCandle.high - lastCandle.close);
      const bodySize = Math.abs(lastCandle.close - lastCandle.open);
      if (wickSize > bodySize * 0.5) score += 3;
      
      // Bonus por zona reciente y fuerte
      if (validZone.candlesAgo <= 5) score += 2;
      if (validZone.strength >= 70) score += 1;
      
      signals.push({
        model: 'OB_ENTRY',
        baseScore: Math.min(88, score),
        pullback,
        validZone,
        reason: `Order Block ${pullback.side} + Zona OB válida${pdCorrect ? ' + P/D' : ''}`
      });
    }
  }
  
  return signals;
}

/**
 * Detecta Boom/Crash spikes con zona OB válida
 * @param {Array} candles - Velas M1 o M5
 * @param {string} asset - Nombre del activo
 * @returns {Object|null} - Señal de spike o null
 */
function detectBoomCrashSpikeV16(candles, asset, avgRange) {
  if (!candles || candles.length < 5) return null;
  
  const isBoom = asset.includes('Boom');
  const isCrash = asset.includes('Crash');
  
  if (!isBoom && !isCrash) return null;
  
  const last5 = candles.slice(-5);
  const lastCandle = last5[last5.length - 1];
  
  // Detectar spike
  let spikeDetected = false;
  let spikeSide = null;
  
  if (isBoom) {
    // Boom: Buscar spike alcista (LONG only)
    const avgBody = last5.slice(0, 4).reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / 4;
    const lastBody = lastCandle.close - lastCandle.open;
    
    if (lastBody > avgBody * 3 && lastCandle.close > lastCandle.open) {
      spikeDetected = true;
      spikeSide = 'BUY';
    }
  } else if (isCrash) {
    // Crash: Buscar spike bajista (SHORT only)
    const avgBody = last5.slice(0, 4).reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / 4;
    const lastBody = lastCandle.open - lastCandle.close;
    
    if (lastBody > avgBody * 3 && lastCandle.close < lastCandle.open) {
      spikeDetected = true;
      spikeSide = 'SELL';
    }
  }
  
  if (spikeDetected) {
    // Verificar zona OB válida
    const validZone = detectValidOBZone(candles, spikeSide, 10);
    
    if (validZone) {
      return {
        model: isBoom ? 'BOOM_SPIKE' : 'CRASH_SPIKE',
        side: spikeSide,
        baseScore: 80,
        validZone,
        entry: lastCandle.close,
        stop: spikeSide === 'BUY' ? lastCandle.low - avgRange * 0.5 : lastCandle.high + avgRange * 0.5,
        reason: `${isBoom ? 'Boom' : 'Crash'} Spike + Zona OB válida`
      };
    }
  }
  
  return null;
}

// Lista de modelos activos v16
const ACTIVE_MODELS_V16 = [
  'MTF_CONFLUENCE',
  'OTE_ENTRY',
  'CHOCH_PULLBACK',
  'INDUCEMENT',
  'BOOM_SPIKE',
  'CRASH_SPIKE',
  'BREAKER_BLOCK',
  'LIQUIDITY_GRAB',
  'BOS_CONTINUATION',
  'SMART_MONEY_TRAP',
  'FVG_ENTRY',
  'OB_ENTRY'
];

// Requisito universal v16
const UNIVERSAL_REQUIREMENT = {
  name: 'VALID_OB_ZONE',
  description: 'Zona válida de Order Block',
  buyCondition: 'Vela ROJA + Vela VERDE envolvente',
  sellCondition: 'Vela VERDE + Vela ROJA envolvente',
  mandatory: true
};

export { 
  generateSignalsV16, 
  detectValidOBZone, 
  detectBoomCrashSpikeV16,
  ACTIVE_MODELS_V16, 
  UNIVERSAL_REQUIREMENT 
};
