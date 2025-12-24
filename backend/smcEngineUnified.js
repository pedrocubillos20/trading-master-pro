// =======================================
// SMC ENGINE UNIFICADO - INSTITUCIONAL
// LONG / SHORT / CONTINUATION / REVERSAL
// v8.0 - Trading Master Pro
// =======================================

// -------- UTILIDADES --------
function candleBody(c) {
  return Math.abs(c.close - c.open);
}

function candleRange(c) {
  return c.high - c.low;
}

function isBullish(c) {
  return c.close > c.open;
}

function isBearish(c) {
  return c.close < c.open;
}

// -------- 1️⃣ LIQUIDEZ (EQH/EQL) --------
export function detectEqualHighsLows(candles, tolerance = 0.0005) {
  if (candles.length < 20) return { eqh: null, eql: null };
  
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  
  // Encontrar EQH (Equal Highs - liquidez arriba)
  let eqh = null;
  for (let i = highs.length - 10; i < highs.length - 2; i++) {
    for (let j = i + 1; j < highs.length - 1; j++) {
      const diff = Math.abs(highs[i] - highs[j]) / highs[i];
      if (diff < tolerance) {
        eqh = Math.max(highs[i], highs[j]);
        break;
      }
    }
    if (eqh) break;
  }
  
  // Encontrar EQL (Equal Lows - liquidez abajo)
  let eql = null;
  for (let i = lows.length - 10; i < lows.length - 2; i++) {
    for (let j = i + 1; j < lows.length - 1; j++) {
      const diff = Math.abs(lows[i] - lows[j]) / lows[i];
      if (diff < tolerance) {
        eql = Math.min(lows[i], lows[j]);
        break;
      }
    }
    if (eql) break;
  }
  
  // Fallback: usar máximo/mínimo reciente
  if (!eqh) eqh = Math.max(...highs.slice(-15));
  if (!eql) eql = Math.min(...lows.slice(-15));
  
  return { eqh, eql };
}

// -------- 2️⃣ SWEEP DE LIQUIDEZ --------
export function detectLiquiditySweep(candle, eqh, eql) {
  const results = [];
  
  // Sweep de EQH (barrido alcista → posible venta)
  if (candle.high > eqh && candle.close < eqh) {
    results.push({
      type: "EQH_SWEEP",
      side: "SELL",
      level: eqh,
      description: `Sweep EQH en ${eqh.toFixed(5)} - Liquidez tomada arriba`
    });
  }
  
  // Sweep de EQL (barrido bajista → posible compra)
  if (candle.low < eql && candle.close > eql) {
    results.push({
      type: "EQL_SWEEP",
      side: "BUY",
      level: eql,
      description: `Sweep EQL en ${eql.toFixed(5)} - Liquidez tomada abajo`
    });
  }
  
  return results.length > 0 ? results[0] : null;
}

// -------- 3️⃣ ORDER BLOCK --------
export function detectOrderBlock(candles, sweep, displacement = null) {
  if (candles.length < 3) return null;
  
  // Determinar desde dónde buscar el OB
  let searchStart = candles.length - 2;
  let searchEnd = Math.max(0, candles.length - 15);
  
  // Si hay displacement reciente, buscar OB antes del displacement
  if (displacement?.candlesAgo && typeof displacement.candlesAgo === 'number') {
    searchStart = candles.length - 1 - displacement.candlesAgo - 1;
  }
  
  // Determinar dirección esperada del OB
  let expectedSide = null;
  if (sweep?.side) {
    expectedSide = sweep.side;
  } else if (displacement?.direction) {
    expectedSide = displacement.direction === 'BEARISH' ? 'SELL' : 'BUY';
  }
  
  if (!expectedSide) return null;
  
  // Buscar la última vela contraria ANTES del movimiento
  for (let i = searchStart; i >= searchEnd; i--) {
    const c = candles[i];
    
    // Para SELL/BEARISH: buscar última vela alcista (Bearish OB)
    if (expectedSide === "SELL" && isBullish(c)) {
      // Verificar que las velas siguientes son bajistas (confirma que es OB)
      const nextCandles = candles.slice(i + 1, Math.min(i + 4, candles.length));
      const hasBearishFollow = nextCandles.some(nc => isBearish(nc) && candleBody(nc) > candleBody(c) * 0.5);
      
      if (hasBearishFollow || i === searchStart) {
        return {
          type: "BEARISH_OB",
          valid: true,
          entry: c.open,
          zone: { high: c.high, low: c.low },
          invalidation: c.high,
          candleIndex: i,
          description: `Bearish OB: ${c.low.toFixed(2)} - ${c.high.toFixed(2)}`
        };
      }
    }
    
    // Para BUY/BULLISH: buscar última vela bajista (Bullish OB)
    if (expectedSide === "BUY" && isBearish(c)) {
      const nextCandles = candles.slice(i + 1, Math.min(i + 4, candles.length));
      const hasBullishFollow = nextCandles.some(nc => isBullish(nc) && candleBody(nc) > candleBody(c) * 0.5);
      
      if (hasBullishFollow || i === searchStart) {
        return {
          type: "BULLISH_OB",
          valid: true,
          entry: c.open,
          zone: { high: c.high, low: c.low },
          invalidation: c.low,
          candleIndex: i,
          description: `Bullish OB: ${c.low.toFixed(2)} - ${c.high.toFixed(2)}`
        };
      }
    }
  }
  
  return null;
}

// -------- 4️⃣ DISPLACEMENT --------
export function detectDisplacement(candles, avgRange) {
  if (candles.length < 3) return { valid: false };
  
  const last = candles[candles.length - 1];
  
  // 1️⃣ Displacement inmediato (última vela)
  const bodySize = candleBody(last);
  const isDisplaced = bodySize > avgRange * 1.5;
  
  if (isDisplaced) {
    return {
      valid: true,
      type: "SINGLE_CANDLE",
      direction: isBullish(last) ? "BULLISH" : "BEARISH",
      magnitude: (bodySize / avgRange).toFixed(2),
      candlesAgo: 0,
      description: `Displacement ${(bodySize / avgRange).toFixed(1)}x el rango`
    };
  }
  
  // 2️⃣ Combo de 2-3 velas consecutivas en misma dirección
  if (candles.length >= 3) {
    const last3 = candles.slice(-3);
    const allBullish = last3.every(c => isBullish(c));
    const allBearish = last3.every(c => isBearish(c));
    const totalMove = Math.abs(last3[2].close - last3[0].open);
    
    if ((allBullish || allBearish) && totalMove > avgRange * 2) {
      return {
        valid: true,
        type: "COMBO",
        direction: allBullish ? "BULLISH" : "BEARISH",
        magnitude: (totalMove / avgRange).toFixed(2),
        candlesAgo: 0,
        description: `Combo displacement ${(totalMove / avgRange).toFixed(1)}x (3 velas)`
      };
    }
  }
  
  // 3️⃣ 🆕 DISPLACEMENT RECIENTE (últimas 10 velas)
  // Buscar si hubo un movimiento fuerte reciente que aún no se ha retrazado
  const lookback = Math.min(10, candles.length - 1);
  
  for (let i = 1; i <= lookback; i++) {
    const idx = candles.length - 1 - i;
    const candle = candles[idx];
    const body = candleBody(candle);
    
    // Vela individual fuerte
    if (body > avgRange * 1.8) {
      const direction = isBullish(candle) ? "BULLISH" : "BEARISH";
      
      // Verificar que el precio sigue en dirección del displacement
      const priceStillValid = direction === "BULLISH" 
        ? last.close > candle.open  // Precio sigue arriba del inicio
        : last.close < candle.open; // Precio sigue abajo del inicio
      
      if (priceStillValid) {
        return {
          valid: true,
          type: "RECENT_SINGLE",
          direction,
          magnitude: (body / avgRange).toFixed(2),
          candlesAgo: i,
          description: `Displacement reciente ${(body / avgRange).toFixed(1)}x (hace ${i} velas)`
        };
      }
    }
    
    // Combo de velas consecutivas
    if (idx >= 2) {
      const combo = candles.slice(idx - 2, idx + 1);
      const allBullish = combo.every(c => isBullish(c));
      const allBearish = combo.every(c => isBearish(c));
      const totalMove = Math.abs(combo[2].close - combo[0].open);
      
      if ((allBullish || allBearish) && totalMove > avgRange * 2.5) {
        const direction = allBullish ? "BULLISH" : "BEARISH";
        
        const priceStillValid = direction === "BULLISH"
          ? last.close > combo[0].open
          : last.close < combo[0].open;
        
        if (priceStillValid) {
          return {
            valid: true,
            type: "RECENT_COMBO",
            direction,
            magnitude: (totalMove / avgRange).toFixed(2),
            candlesAgo: i,
            description: `Combo reciente ${(totalMove / avgRange).toFixed(1)}x (hace ${i} velas)`
          };
        }
      }
    }
  }
  
  // 4️⃣ 🆕 IMPULSO ESTRUCTURAL (movimiento desde swing)
  // Detectar si hay un movimiento impulsivo desde el último swing
  if (candles.length >= 15) {
    const recent = candles.slice(-15);
    const highPoint = Math.max(...recent.map(c => c.high));
    const lowPoint = Math.min(...recent.map(c => c.low));
    const totalRange = highPoint - lowPoint;
    
    // Si el movimiento total es > 4x el rango promedio, hay impulso
    if (totalRange > avgRange * 4) {
      const direction = last.close < (highPoint + lowPoint) / 2 ? "BEARISH" : "BULLISH";
      return {
        valid: true,
        type: "STRUCTURAL_IMPULSE",
        direction,
        magnitude: (totalRange / avgRange).toFixed(2),
        candlesAgo: 'structure',
        description: `Impulso estructural ${(totalRange / avgRange).toFixed(1)}x el rango`
      };
    }
  }
  
  return { valid: false };
}

// -------- 5️⃣ FVG (Fair Value Gap) --------
export function detectFVG(candles) {
  if (candles.length < 3) return { valid: false };
  
  const c1 = candles[candles.length - 3];
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 1];
  
  // FVG Alcista: gap entre high de c1 y low de c3
  if (c3.low > c1.high) {
    return {
      valid: true,
      type: "BULLISH_FVG",
      zone: { high: c3.low, low: c1.high },
      description: `FVG Alcista: ${c1.high.toFixed(5)} - ${c3.low.toFixed(5)}`
    };
  }
  
  // FVG Bajista: gap entre low de c1 y high de c3
  if (c3.high < c1.low) {
    return {
      valid: true,
      type: "BEARISH_FVG",
      zone: { high: c1.low, low: c3.high },
      description: `FVG Bajista: ${c3.high.toFixed(5)} - ${c1.low.toFixed(5)}`
    };
  }
  
  return { valid: false };
}

// -------- 6️⃣ ESTRUCTURA (Swings) --------
export function detectSwings(candles, lookback = 5) {
  const swings = [];
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];
    const leftCandles = candles.slice(i - lookback, i);
    const rightCandles = candles.slice(i + 1, i + lookback + 1);
    
    // Swing High
    const isSwingHigh = leftCandles.every(c => c.high < current.high) &&
                        rightCandles.every(c => c.high < current.high);
    
    // Swing Low
    const isSwingLow = leftCandles.every(c => c.low > current.low) &&
                       rightCandles.every(c => c.low > current.low);
    
    if (isSwingHigh) {
      swings.push({ type: 'high', price: current.high, index: i, time: current.time });
    }
    if (isSwingLow) {
      swings.push({ type: 'low', price: current.low, index: i, time: current.time });
    }
  }
  
  return swings.slice(-6); // Últimos 6 swings
}

export function detectHigherLows(swings) {
  const lows = swings.filter(s => s.type === 'low').slice(-3);
  if (lows.length < 3) return false;
  return lows[2].price > lows[1].price && lows[1].price > lows[0].price;
}

export function detectLowerHighs(swings) {
  const highs = swings.filter(s => s.type === 'high').slice(-3);
  if (highs.length < 3) return false;
  return highs[2].price < highs[1].price && highs[1].price < highs[0].price;
}

export function detectHigherHighs(swings) {
  const highs = swings.filter(s => s.type === 'high').slice(-3);
  if (highs.length < 3) return false;
  return highs[2].price > highs[1].price && highs[1].price > highs[0].price;
}

export function detectLowerLows(swings) {
  const lows = swings.filter(s => s.type === 'low').slice(-3);
  if (lows.length < 3) return false;
  return lows[2].price < lows[1].price && lows[1].price < lows[0].price;
}

// -------- 7️⃣ CHoCH (Change of Character) --------
export function detectCHoCH(candles, swings) {
  if (swings.length < 4) return { valid: false };
  
  const recentSwings = swings.slice(-4);
  const lastCandle = candles[candles.length - 1];
  
  // CHoCH Alcista: rompe último lower high
  const lowerHighs = recentSwings.filter(s => s.type === 'high');
  if (lowerHighs.length >= 2) {
    const lastLH = lowerHighs[lowerHighs.length - 1];
    if (lastCandle.close > lastLH.price) {
      return {
        valid: true,
        type: "BULLISH_CHOCH",
        level: lastLH.price,
        description: `CHoCH Alcista: rompió LH en ${lastLH.price.toFixed(5)}`
      };
    }
  }
  
  // CHoCH Bajista: rompe último higher low
  const higherLows = recentSwings.filter(s => s.type === 'low');
  if (higherLows.length >= 2) {
    const lastHL = higherLows[higherLows.length - 1];
    if (lastCandle.close < lastHL.price) {
      return {
        valid: true,
        type: "BEARISH_CHOCH",
        level: lastHL.price,
        description: `CHoCH Bajista: rompió HL en ${lastHL.price.toFixed(5)}`
      };
    }
  }
  
  return { valid: false };
}

// -------- 8️⃣ ZONA PREMIUM/DISCOUNT --------
export function detectZone(candle, swings) {
  if (swings.length < 2) return { zone: 'EQUILIBRIUM', percent: 50 };
  
  const highs = swings.filter(s => s.type === 'high').map(s => s.price);
  const lows = swings.filter(s => s.type === 'low').map(s => s.price);
  
  const swingHigh = Math.max(...highs);
  const swingLow = Math.min(...lows);
  const range = swingHigh - swingLow;
  
  if (range === 0) return { zone: 'EQUILIBRIUM', percent: 50 };
  
  const percent = ((candle.close - swingLow) / range) * 100;
  
  if (percent >= 70) return { zone: 'PREMIUM', percent: percent.toFixed(1) };
  if (percent <= 30) return { zone: 'DISCOUNT', percent: percent.toFixed(1) };
  return { zone: 'EQUILIBRIUM', percent: percent.toFixed(1) };
}

// -------- 9️⃣ SCORING --------
function scoreReversal({ sweep, ob, displacement, fvg, choch, zone }) {
  let score = 0;
  let breakdown = [];
  
  if (sweep) {
    score += 30;
    breakdown.push('Sweep +30');
  }
  if (ob?.valid) {
    score += 25;
    breakdown.push('OB +25');
  }
  if (displacement?.valid) {
    score += 30;
    breakdown.push('Displacement +30');
  }
  if (fvg?.valid) {
    score += 10;
    breakdown.push('FVG +10');
  }
  if (choch?.valid) {
    score += 15;
    breakdown.push('CHoCH +15 (bonus)');
  }
  
  // Bonus por zona correcta
  if (sweep?.side === 'BUY' && zone?.zone === 'DISCOUNT') {
    score += 10;
    breakdown.push('Discount zone +10');
  }
  if (sweep?.side === 'SELL' && zone?.zone === 'PREMIUM') {
    score += 10;
    breakdown.push('Premium zone +10');
  }
  
  return { score, breakdown };
}

function scoreContinuation({ displaced, structure, breakout, trend }) {
  let score = 0;
  let breakdown = [];
  
  if (displaced?.valid) {
    score += 30;
    breakdown.push('Displacement +30');
  }
  if (structure) {
    score += 25;
    breakdown.push('Structure +25');
  }
  if (breakout) {
    score += 25;
    breakdown.push('Breakout +25');
  }
  if (trend) {
    score += 20;
    breakdown.push('Trend alignment +20');
  }
  
  return { score, breakdown };
}

// -------- 🔟 MOTOR PRINCIPAL --------
export function generateSMCSignal({
  candle,
  candles,
  swings = null,
  eqh = null,
  eql = null,
  avgRange = null,
  asset = 'STEP_INDEX'
}) {
  // Calcular valores si no se proveen
  if (!swings) swings = detectSwings(candles);
  if (!eqh || !eql) {
    const eq = detectEqualHighsLows(candles);
    eqh = eqh || eq.eqh;
    eql = eql || eq.eql;
  }
  if (!avgRange) {
    const ranges = candles.slice(-20).map(c => candleRange(c));
    avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  }
  
  // Detectar eventos
  const sweep = detectLiquiditySweep(candle, eqh, eql);
  const displacement = detectDisplacement(candles, avgRange);
  const orderBlock = detectOrderBlock(candles, sweep, displacement);
  const fvg = detectFVG(candles);
  const choch = detectCHoCH(candles, swings);
  const zone = detectZone(candle, swings);
  
  // Estructura
  const higherLows = detectHigherLows(swings);
  const lowerHighs = detectLowerHighs(swings);
  const higherHighs = detectHigherHighs(swings);
  const lowerLows = detectLowerLows(swings);
  
  // -----------------------------
  // 🟥 MODELO 1: REVERSAL INMEDIATO (Sweep + OB + Displacement ahora)
  // -----------------------------
  if (sweep && orderBlock?.valid && displacement?.valid && displacement.candlesAgo === 0) {
    const { score, breakdown } = scoreReversal({
      sweep,
      ob: orderBlock,
      displacement,
      fvg,
      choch,
      zone
    });
    
    if (score >= 70) {
      const action = sweep.side === "BUY" ? "LONG" : "SHORT";
      const riskReward = calculateRR(orderBlock, sweep.side, eqh, eql);
      
      return {
        action,
        model: "REVERSAL_OB",
        score,
        breakdown,
        confidence: score >= 90 ? 'ALTA' : score >= 80 ? 'MEDIA-ALTA' : 'MEDIA',
        entry: orderBlock.entry,
        entryZone: orderBlock.zone,
        stop: orderBlock.invalidation,
        tp1: sweep.side === "BUY" ? eqh : eql,
        tp2: sweep.side === "BUY" ? eqh * 1.002 : eql * 0.998,
        riskReward,
        details: {
          sweep: sweep.description,
          ob: orderBlock.description,
          displacement: displacement.description,
          fvg: fvg?.description || 'No FVG',
          choch: choch?.description || 'No CHoCH',
          zone: `${zone.zone} (${zone.percent}%)`
        },
        timestamp: new Date().toISOString()
      };
    }
  }
  
  // -----------------------------
  // 🟧 MODELO 2: POST-DISPLACEMENT (El movimiento ya ocurrió)
  // Buscar reentrada en OB o esperar retroceso
  // -----------------------------
  if (displacement?.valid && displacement.candlesAgo > 0) {
    const obFromDisplacement = detectOrderBlock(candles, null, displacement);
    
    if (obFromDisplacement?.valid) {
      const action = displacement.direction === "BEARISH" ? "SHORT" : "LONG";
      
      // Verificar si el precio está en zona de OB (reentrada)
      const inOBZone = action === "SHORT"
        ? candle.high >= obFromDisplacement.zone.low && candle.close <= obFromDisplacement.zone.high
        : candle.low <= obFromDisplacement.zone.high && candle.close >= obFromDisplacement.zone.low;
      
      // Calcular score
      let score = 0;
      let breakdown = [];
      
      score += 30; breakdown.push('Displacement reciente +30');
      score += 25; breakdown.push('OB identificado +25');
      
      if (inOBZone) {
        score += 25;
        breakdown.push('Precio en zona OB +25');
      }
      
      if (displacement.type === 'STRUCTURAL_IMPULSE') {
        score += 15;
        breakdown.push('Impulso estructural +15');
      }
      
      if (fvg?.valid) {
        score += 10;
        breakdown.push('FVG presente +10');
      }
      
      // Zona correcta bonus
      if ((action === 'SHORT' && zone.zone === 'PREMIUM') || 
          (action === 'LONG' && zone.zone === 'DISCOUNT')) {
        score += 10;
        breakdown.push(`${zone.zone} zone +10`);
      }
      
      if (score >= 65) {
        return {
          action: inOBZone ? action : 'WAIT_REENTRY',
          model: "POST_DISPLACEMENT",
          score,
          breakdown,
          confidence: score >= 85 ? 'ALTA' : score >= 75 ? 'MEDIA-ALTA' : 'MEDIA',
          entry: inOBZone ? candle.close : obFromDisplacement.entry,
          entryZone: obFromDisplacement.zone,
          stop: obFromDisplacement.invalidation,
          tp1: action === "LONG" ? eqh : eql,
          waitingFor: inOBZone ? null : `Retroceso a OB (${obFromDisplacement.zone.low.toFixed(2)} - ${obFromDisplacement.zone.high.toFixed(2)})`,
          details: {
            displacement: displacement.description,
            ob: obFromDisplacement.description,
            priceToOB: inOBZone ? 'EN ZONA' : `${Math.abs(candle.close - obFromDisplacement.entry).toFixed(2)} puntos`,
            fvg: fvg?.description || 'No FVG',
            zone: `${zone.zone} (${zone.percent}%)`
          },
          timestamp: new Date().toISOString()
        };
      }
    }
  }
  
  // -----------------------------
  // 🟩 MODELO 3: CONTINUATION (Tendencia fuerte)
  // Para ORO y activos con momentum
  // -----------------------------
  const bullishContinuation = higherLows && higherHighs && candle.close > eqh;
  const bearishContinuation = lowerHighs && lowerLows && candle.close < eql;
  
  if (bullishContinuation || bearishContinuation) {
    const { score, breakdown } = scoreContinuation({
      displaced: displacement,
      structure: bullishContinuation ? higherLows : lowerHighs,
      breakout: bullishContinuation ? candle.close > eqh : candle.close < eql,
      trend: true
    });
    
    if (score >= 70) {
      const action = bullishContinuation ? "LONG" : "SHORT";
      const lastSwingLow = swings.filter(s => s.type === 'low').slice(-1)[0];
      const lastSwingHigh = swings.filter(s => s.type === 'high').slice(-1)[0];
      
      return {
        action,
        model: "CONTINUATION",
        score,
        breakdown,
        confidence: score >= 90 ? 'ALTA' : score >= 80 ? 'MEDIA-ALTA' : 'MEDIA',
        entry: candle.close,
        entryType: "MARKET_OR_MICRO_OB",
        stop: bullishContinuation ? lastSwingLow?.price : lastSwingHigh?.price,
        tp1: "NEXT_LIQUIDITY",
        details: {
          structure: bullishContinuation ? 'Higher Highs + Higher Lows' : 'Lower Highs + Lower Lows',
          displacement: displacement?.description || 'No displacement',
          zone: `${zone.zone} (${zone.percent}%)`
        },
        timestamp: new Date().toISOString()
      };
    }
  }
  
  // -----------------------------
  // 🟨 MODELO 4: WAITING (Esperando setup)
  // -----------------------------
  const reversalScore = scoreReversal({ sweep, ob: orderBlock, displacement, fvg, choch, zone }).score;
  const continuationScore = scoreContinuation({
    displaced: displacement,
    structure: higherLows || lowerHighs,
    breakout: candle.close > eqh || candle.close < eql,
    trend: higherLows || lowerHighs
  }).score;
  
  const maxScore = Math.max(reversalScore, continuationScore);
  
  // Determinar qué falta y dar contexto útil
  let waiting = [];
  let analysis = {};
  
  if (displacement?.valid && displacement.candlesAgo > 0) {
    // Ya hubo displacement, pero no hay OB claro o el precio no retrocedió
    waiting.push('Retroceso al Order Block');
    analysis.status = 'POST_MOVE';
    analysis.suggestion = `Displacement ${displacement.direction} detectado hace ${displacement.candlesAgo} velas. Esperar retroceso.`;
  } else if (sweep) {
    waiting.push('Displacement (confirmación)');
    analysis.status = 'SWEEP_DETECTED';
    analysis.suggestion = 'Sweep detectado. Esperando vela de confirmación.';
  } else {
    waiting.push('Sweep de liquidez');
    analysis.status = 'MONITORING';
    analysis.suggestion = `Monitoreando EQH: ${eqh?.toFixed(2)} / EQL: ${eql?.toFixed(2)}`;
  }
  
  return {
    action: "WAIT",
    model: "NO_SETUP",
    score: maxScore,
    confidence: 'BAJA',
    waiting,
    suggestion: analysis.suggestion,
    analysis: {
      status: analysis.status,
      sweep: sweep?.description || '❌ Sin sweep',
      ob: orderBlock?.description || '❌ Sin OB',
      displacement: displacement?.description || '❌ Sin displacement',
      fvg: fvg?.description || '❌ Sin FVG',
      choch: choch?.description || '⏳ Sin CHoCH',
      zone: `${zone.zone} (${zone.percent}%)`,
      structure: higherLows ? '📈 Higher Lows' : lowerHighs ? '📉 Lower Highs' : '➡️ Sin estructura clara',
      eqh: eqh?.toFixed(2),
      eql: eql?.toFixed(2)
    },
    timestamp: new Date().toISOString()
  };
}

// -------- UTILIDAD: Calcular R:R --------
function calculateRR(ob, side, eqh, eql) {
  if (!ob || !ob.entry || !ob.invalidation) return null;
  
  const entry = ob.entry;
  const stop = ob.invalidation;
  const target = side === 'BUY' ? eqh : eql;
  
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  
  if (risk === 0) return null;
  
  return {
    risk: risk.toFixed(5),
    reward: reward.toFixed(5),
    ratio: (reward / risk).toFixed(2)
  };
}

// -------- EXPORT DEFAULT --------
export default {
  generateSMCSignal,
  detectLiquiditySweep,
  detectOrderBlock,
  detectDisplacement,
  detectFVG,
  detectSwings,
  detectCHoCH,
  detectZone,
  detectEqualHighsLows,
  detectHigherLows,
  detectLowerHighs,
  detectHigherHighs,
  detectLowerLows
};
