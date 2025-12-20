// =============================================
// TRADING MASTER PRO - SMC ANALYZER
// Análisis automático de Smart Money Concepts
// =============================================

class SMCAnalyzer {
  constructor() {
    this.swingLength = 5; // Velas para detectar swings
    this.obLookback = 10; // Velas para buscar OB
    this.fvgThreshold = 0.0001; // Mínimo tamaño de FVG
  }

  // =============================================
  // DETECCIÓN DE ESTRUCTURA
  // =============================================

  // Encontrar Swing Highs y Swing Lows
  findSwings(candles, length = 5) {
    const swingHighs = [];
    const swingLows = [];

    for (let i = length; i < candles.length - length; i++) {
      let isSwingHigh = true;
      let isSwingLow = true;

      for (let j = 1; j <= length; j++) {
        if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
          isSwingHigh = false;
        }
        if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
          isSwingLow = false;
        }
      }

      if (isSwingHigh) {
        swingHighs.push({ index: i, price: candles[i].high, time: candles[i].time });
      }
      if (isSwingLow) {
        swingLows.push({ index: i, price: candles[i].low, time: candles[i].time });
      }
    }

    return { swingHighs, swingLows };
  }

  // Detectar estructura de mercado (HH, HL, LH, LL)
  detectStructure(candles) {
    const { swingHighs, swingLows } = this.findSwings(candles);
    
    if (swingHighs.length < 2 || swingLows.length < 2) {
      return { trend: 'UNDEFINED', structure: [] };
    }

    const structure = [];
    let trend = 'UNDEFINED';

    // Analizar últimos swings
    const lastHighs = swingHighs.slice(-3);
    const lastLows = swingLows.slice(-3);

    // Detectar tendencia
    if (lastHighs.length >= 2 && lastLows.length >= 2) {
      const higherHighs = lastHighs[lastHighs.length - 1].price > lastHighs[lastHighs.length - 2].price;
      const higherLows = lastLows[lastLows.length - 1].price > lastLows[lastLows.length - 2].price;
      const lowerHighs = lastHighs[lastHighs.length - 1].price < lastHighs[lastHighs.length - 2].price;
      const lowerLows = lastLows[lastLows.length - 1].price < lastLows[lastLows.length - 2].price;

      if (higherHighs && higherLows) {
        trend = 'BULLISH';
        structure.push({ type: 'HH', price: lastHighs[lastHighs.length - 1].price });
        structure.push({ type: 'HL', price: lastLows[lastLows.length - 1].price });
      } else if (lowerHighs && lowerLows) {
        trend = 'BEARISH';
        structure.push({ type: 'LH', price: lastHighs[lastHighs.length - 1].price });
        structure.push({ type: 'LL', price: lastLows[lastLows.length - 1].price });
      } else {
        trend = 'RANGING';
      }
    }

    return { 
      trend, 
      structure,
      swingHighs,
      swingLows,
      lastSwingHigh: swingHighs[swingHighs.length - 1],
      lastSwingLow: swingLows[swingLows.length - 1],
    };
  }

  // Detectar BOS (Break of Structure)
  detectBOS(candles, structure) {
    if (!structure.lastSwingHigh || !structure.lastSwingLow) return null;

    const currentPrice = candles[candles.length - 1].close;
    const lastHigh = structure.lastSwingHigh.price;
    const lastLow = structure.lastSwingLow.price;

    // BOS Alcista: precio rompe último swing high
    if (currentPrice > lastHigh && structure.trend === 'BULLISH') {
      return { type: 'BOS', direction: 'BULLISH', level: lastHigh };
    }

    // BOS Bajista: precio rompe último swing low
    if (currentPrice < lastLow && structure.trend === 'BEARISH') {
      return { type: 'BOS', direction: 'BEARISH', level: lastLow };
    }

    return null;
  }

  // Detectar CHoCH (Change of Character)
  detectCHoCH(candles, structure) {
    if (!structure.lastSwingHigh || !structure.lastSwingLow) return null;

    const currentPrice = candles[candles.length - 1].close;
    const lastHigh = structure.lastSwingHigh.price;
    const lastLow = structure.lastSwingLow.price;

    // CHoCH Alcista: en tendencia bajista, precio rompe último swing high
    if (currentPrice > lastHigh && structure.trend === 'BEARISH') {
      return { type: 'CHoCH', direction: 'BULLISH', level: lastHigh };
    }

    // CHoCH Bajista: en tendencia alcista, precio rompe último swing low
    if (currentPrice < lastLow && structure.trend === 'BULLISH') {
      return { type: 'CHoCH', direction: 'BEARISH', level: lastLow };
    }

    return null;
  }

  // =============================================
  // ORDER BLOCKS
  // =============================================

  // Encontrar Order Blocks
  findOrderBlocks(candles, lookback = 20) {
    const orderBlocks = [];

    for (let i = lookback; i < candles.length - 1; i++) {
      const current = candles[i];
      const next = candles[i + 1];
      
      // OB de Demanda: vela bajista seguida de movimiento alcista fuerte
      if (current.close < current.open) { // Vela bajista
        const moveAfter = this.calculateMoveStrength(candles, i + 1, 5);
        if (moveAfter.direction === 'UP' && moveAfter.strength > 1.5) {
          orderBlocks.push({
            type: 'DEMAND',
            high: current.high,
            low: current.low,
            index: i,
            time: current.time,
            mitigated: false,
            strength: moveAfter.strength,
          });
        }
      }

      // OB de Oferta: vela alcista seguida de movimiento bajista fuerte
      if (current.close > current.open) { // Vela alcista
        const moveAfter = this.calculateMoveStrength(candles, i + 1, 5);
        if (moveAfter.direction === 'DOWN' && moveAfter.strength > 1.5) {
          orderBlocks.push({
            type: 'SUPPLY',
            high: current.high,
            low: current.low,
            index: i,
            time: current.time,
            mitigated: false,
            strength: moveAfter.strength,
          });
        }
      }
    }

    // Verificar mitigación
    return this.checkOBMitigation(candles, orderBlocks);
  }

  // Calcular fuerza del movimiento
  calculateMoveStrength(candles, startIndex, length) {
    if (startIndex + length >= candles.length) return { direction: 'NONE', strength: 0 };

    const startPrice = candles[startIndex].close;
    const endPrice = candles[startIndex + length - 1].close;
    const avgRange = this.calculateATR(candles.slice(startIndex - 20, startIndex), 14);

    const move = endPrice - startPrice;
    const strength = Math.abs(move) / avgRange;

    return {
      direction: move > 0 ? 'UP' : 'DOWN',
      strength,
    };
  }

  // Verificar si OBs han sido mitigados
  checkOBMitigation(candles, orderBlocks) {
    const currentPrice = candles[candles.length - 1].close;

    return orderBlocks.map(ob => {
      if (ob.type === 'DEMAND' && currentPrice < ob.low) {
        ob.mitigated = true;
      }
      if (ob.type === 'SUPPLY' && currentPrice > ob.high) {
        ob.mitigated = true;
      }
      return ob;
    });
  }

  // =============================================
  // FAIR VALUE GAPS (FVG)
  // =============================================

  findFVGs(candles) {
    const fvgs = [];

    for (let i = 2; i < candles.length; i++) {
      const candle1 = candles[i - 2];
      const candle2 = candles[i - 1];
      const candle3 = candles[i];

      // FVG Alcista: gap entre high de vela 1 y low de vela 3
      if (candle3.low > candle1.high) {
        const gapSize = candle3.low - candle1.high;
        if (gapSize > this.fvgThreshold) {
          fvgs.push({
            type: 'BULLISH',
            top: candle3.low,
            bottom: candle1.high,
            index: i - 1,
            time: candle2.time,
            filled: false,
            size: gapSize,
          });
        }
      }

      // FVG Bajista: gap entre low de vela 1 y high de vela 3
      if (candle3.high < candle1.low) {
        const gapSize = candle1.low - candle3.high;
        if (gapSize > this.fvgThreshold) {
          fvgs.push({
            type: 'BEARISH',
            top: candle1.low,
            bottom: candle3.high,
            index: i - 1,
            time: candle2.time,
            filled: false,
            size: gapSize,
          });
        }
      }
    }

    // Verificar si FVGs han sido rellenados
    return this.checkFVGFilled(candles, fvgs);
  }

  checkFVGFilled(candles, fvgs) {
    return fvgs.map(fvg => {
      for (let i = fvg.index + 2; i < candles.length; i++) {
        if (fvg.type === 'BULLISH' && candles[i].low <= fvg.bottom) {
          fvg.filled = true;
          break;
        }
        if (fvg.type === 'BEARISH' && candles[i].high >= fvg.top) {
          fvg.filled = true;
          break;
        }
      }
      return fvg;
    });
  }

  // =============================================
  // LIQUIDEZ
  // =============================================

  findLiquidity(candles, structure) {
    const liquidity = {
      BSL: [], // Buy Side Liquidity (stops sobre highs)
      SSL: [], // Sell Side Liquidity (stops bajo lows)
      EQH: [], // Equal Highs
      EQL: [], // Equal Lows
    };

    const { swingHighs, swingLows } = structure;

    // Buscar Equal Highs (EQH)
    for (let i = 1; i < swingHighs.length; i++) {
      const diff = Math.abs(swingHighs[i].price - swingHighs[i - 1].price);
      const avgPrice = (swingHighs[i].price + swingHighs[i - 1].price) / 2;
      
      if (diff / avgPrice < 0.001) { // Menos de 0.1% diferencia
        liquidity.EQH.push({
          price: avgPrice,
          indexes: [swingHighs[i - 1].index, swingHighs[i].index],
        });
        liquidity.BSL.push({ price: avgPrice, type: 'EQH' });
      }
    }

    // Buscar Equal Lows (EQL)
    for (let i = 1; i < swingLows.length; i++) {
      const diff = Math.abs(swingLows[i].price - swingLows[i - 1].price);
      const avgPrice = (swingLows[i].price + swingLows[i - 1].price) / 2;
      
      if (diff / avgPrice < 0.001) {
        liquidity.EQL.push({
          price: avgPrice,
          indexes: [swingLows[i - 1].index, swingLows[i].index],
        });
        liquidity.SSL.push({ price: avgPrice, type: 'EQL' });
      }
    }

    // Swing highs son BSL
    swingHighs.forEach(sh => {
      liquidity.BSL.push({ price: sh.price, type: 'SWING_HIGH', index: sh.index });
    });

    // Swing lows son SSL
    swingLows.forEach(sl => {
      liquidity.SSL.push({ price: sl.price, type: 'SWING_LOW', index: sl.index });
    });

    return liquidity;
  }

  // Detectar barrido de liquidez
  detectLiquiditySweep(candles, liquidity) {
    const current = candles[candles.length - 1];
    const previous = candles[candles.length - 2];
    const sweeps = [];

    // Buscar barrido de BSL (wicks por encima de highs)
    liquidity.BSL.forEach(bsl => {
      if (current.high > bsl.price && current.close < bsl.price) {
        sweeps.push({ type: 'BSL_SWEEP', price: bsl.price, direction: 'BEARISH' });
      }
    });

    // Buscar barrido de SSL (wicks por debajo de lows)
    liquidity.SSL.forEach(ssl => {
      if (current.low < ssl.price && current.close > ssl.price) {
        sweeps.push({ type: 'SSL_SWEEP', price: ssl.price, direction: 'BULLISH' });
      }
    });

    return sweeps;
  }

  // =============================================
  // ZONAS PREMIUM/DISCOUNT
  // =============================================

  calculatePremiumDiscount(candles, structure) {
    if (!structure.lastSwingHigh || !structure.lastSwingLow) return null;

    const high = structure.lastSwingHigh.price;
    const low = structure.lastSwingLow.price;
    const range = high - low;
    const currentPrice = candles[candles.length - 1].close;

    const equilibrium = low + (range * 0.5);
    const premiumStart = low + (range * 0.5);
    const discountEnd = low + (range * 0.5);

    const position = (currentPrice - low) / range;

    return {
      high,
      low,
      equilibrium,
      premiumZone: { start: premiumStart, end: high },
      discountZone: { start: low, end: discountEnd },
      currentPosition: position > 0.5 ? 'PREMIUM' : 'DISCOUNT',
      positionPercent: (position * 100).toFixed(1),
    };
  }

  // =============================================
  // ATR (Average True Range)
  // =============================================

  calculateATR(candles, period = 14) {
    if (candles.length < period + 1) return 0;

    let trSum = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1]?.close || candles[i].open;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trSum += tr;
    }

    return trSum / period;
  }

  // =============================================
  // ANÁLISIS COMPLETO
  // =============================================

  analyze(candles) {
    if (!candles || candles.length < 50) {
      return { error: 'Insufficient data', minCandles: 50, received: candles?.length || 0 };
    }

    // 1. Detectar estructura
    const structure = this.detectStructure(candles);
    
    // 2. Detectar BOS y CHoCH
    const bos = this.detectBOS(candles, structure);
    const choch = this.detectCHoCH(candles, structure);
    
    // 3. Encontrar Order Blocks
    const orderBlocks = this.findOrderBlocks(candles);
    const validOBs = orderBlocks.filter(ob => !ob.mitigated).slice(-5);
    
    // 4. Encontrar FVGs
    const fvgs = this.findFVGs(candles);
    const validFVGs = fvgs.filter(fvg => !fvg.filled).slice(-5);
    
    // 5. Encontrar Liquidez
    const liquidity = this.findLiquidity(candles, structure);
    
    // 6. Detectar barridos
    const sweeps = this.detectLiquiditySweep(candles, liquidity);
    
    // 7. Zonas Premium/Discount
    const zones = this.calculatePremiumDiscount(candles, structure);
    
    // 8. ATR para volatilidad
    const atr = this.calculateATR(candles);

    // 9. Precio actual
    const currentPrice = candles[candles.length - 1].close;

    return {
      timestamp: new Date().toISOString(),
      currentPrice,
      atr,
      structure: {
        trend: structure.trend,
        lastSwingHigh: structure.lastSwingHigh?.price,
        lastSwingLow: structure.lastSwingLow?.price,
        structurePoints: structure.structure,
      },
      signals: {
        bos,
        choch,
        sweeps,
      },
      orderBlocks: validOBs,
      fvgs: validFVGs,
      liquidity: {
        nearestBSL: liquidity.BSL.sort((a, b) => a.price - b.price).find(l => l.price > currentPrice),
        nearestSSL: liquidity.SSL.sort((a, b) => b.price - a.price).find(l => l.price < currentPrice),
        eqh: liquidity.EQH,
        eql: liquidity.EQL,
      },
      zones,
    };
  }

  // =============================================
  // GENERAR SEÑAL DE TRADING
  // =============================================

  generateSignal(analysis, riskPercent = 1, accountBalance = 1000) {
    const { structure, signals, orderBlocks, fvgs, zones, currentPrice, atr } = analysis;

    // Verificar condiciones para señal
    const conditions = {
      hasStructure: structure.trend !== 'UNDEFINED' && structure.trend !== 'RANGING',
      hasBOSorCHoCH: signals.bos || signals.choch,
      hasOB: orderBlocks.length > 0,
      hasFVG: fvgs.length > 0,
      hasSweep: signals.sweeps.length > 0,
      inCorrectZone: false,
    };

    // Verificar zona correcta
    if (zones) {
      if (structure.trend === 'BULLISH' && zones.currentPosition === 'DISCOUNT') {
        conditions.inCorrectZone = true;
      }
      if (structure.trend === 'BEARISH' && zones.currentPosition === 'PREMIUM') {
        conditions.inCorrectZone = true;
      }
    }

    // Contar condiciones cumplidas
    const metConditions = Object.values(conditions).filter(Boolean).length;
    const totalConditions = Object.keys(conditions).length;
    const confidence = ((metConditions / totalConditions) * 100).toFixed(0);

    // Si no hay suficientes condiciones, no hay señal
    if (metConditions < 3) {
      return {
        hasSignal: false,
        reason: 'Insufficient conditions met',
        conditions,
        confidence: `${confidence}%`,
      };
    }

    // Generar señal
    const direction = signals.choch?.direction || signals.bos?.direction || 
                     (structure.trend === 'BULLISH' ? 'BULLISH' : 'BEARISH');

    // Calcular niveles
    let entry, sl, tp1, tp2, tp3;
    
    if (direction === 'BULLISH') {
      const nearestOB = orderBlocks.find(ob => ob.type === 'DEMAND');
      entry = nearestOB ? nearestOB.high : currentPrice;
      sl = nearestOB ? nearestOB.low - (atr * 0.5) : currentPrice - (atr * 2);
      const risk = entry - sl;
      tp1 = entry + (risk * 2);
      tp2 = entry + (risk * 3);
      tp3 = entry + (risk * 5);
    } else {
      const nearestOB = orderBlocks.find(ob => ob.type === 'SUPPLY');
      entry = nearestOB ? nearestOB.low : currentPrice;
      sl = nearestOB ? nearestOB.high + (atr * 0.5) : currentPrice + (atr * 2);
      const risk = sl - entry;
      tp1 = entry - (risk * 2);
      tp2 = entry - (risk * 3);
      tp3 = entry - (risk * 5);
    }

    return {
      hasSignal: true,
      direction,
      confidence: `${confidence}%`,
      conditions,
      entry: entry.toFixed(5),
      stopLoss: sl.toFixed(5),
      takeProfit1: tp1.toFixed(5),
      takeProfit2: tp2.toFixed(5),
      takeProfit3: tp3.toFixed(5),
      riskReward: {
        tp1: '1:2',
        tp2: '1:3',
        tp3: '1:5',
      },
      analysis,
    };
  }
}

export default SMCAnalyzer;
