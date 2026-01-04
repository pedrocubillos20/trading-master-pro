// =============================================
// SMC ENGINE v2.0 - Pure Smart Money Concepts (ESM)
// Sin indicadores tradicionales - Solo price action y SMC
// =============================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const ENGINE_CONFIG = {
  MIN_SCORE: 75,
  ANALYSIS_COOLDOWN: 30000,
  POST_SIGNAL_COOLDOWN: 300000,
  MAX_PENDING_SIGNALS: 5,
  TRADING_HOURS: { start: 7, end: 21 }
};

// =============================================
// STRUCTURE ANALYSIS (Estructura de Mercado)
// =============================================

const StructureAnalysis = {
  findSwingPoints(candles, lookback = 5) {
    const swingHighs = [];
    const swingLows = [];
    
    for (let i = lookback; i < candles.length - lookback; i++) {
      const current = candles[i];
      let isSwingHigh = true;
      let isSwingLow = true;
      
      for (let j = 1; j <= lookback; j++) {
        if (candles[i - j].high >= current.high || candles[i + j].high >= current.high) {
          isSwingHigh = false;
        }
        if (candles[i - j].low <= current.low || candles[i + j].low <= current.low) {
          isSwingLow = false;
        }
      }
      
      if (isSwingHigh) swingHighs.push({ index: i, price: current.high, time: current.time });
      if (isSwingLow) swingLows.push({ index: i, price: current.low, time: current.time });
    }
    
    return { swingHighs, swingLows };
  },
  
  determineTrend(candles) {
    if (!candles || candles.length < 20) return { trend: 'NEUTRAL', strength: 0 };
    
    const { swingHighs, swingLows } = this.findSwingPoints(candles);
    
    if (swingHighs.length < 2 || swingLows.length < 2) {
      return { trend: 'NEUTRAL', strength: 0, structure: {} };
    }
    
    const recentHighs = swingHighs.slice(-2);
    const recentLows = swingLows.slice(-2);
    
    const hh = recentHighs[1]?.price > recentHighs[0]?.price;
    const hl = recentLows[1]?.price > recentLows[0]?.price;
    const lh = recentHighs[1]?.price < recentHighs[0]?.price;
    const ll = recentLows[1]?.price < recentLows[0]?.price;
    
    let trend = 'NEUTRAL';
    let strength = 0;
    
    if (hh && hl) { trend = 'BULLISH'; strength = 80; }
    else if (lh && ll) { trend = 'BEARISH'; strength = 80; }
    else if (hh || hl) { trend = 'BULLISH'; strength = 50; }
    else if (lh || ll) { trend = 'BEARISH'; strength = 50; }
    
    return {
      trend,
      strength,
      structure: { hh, hl, lh, ll, lastSwingHigh: recentHighs[1], lastSwingLow: recentLows[1] }
    };
  },
  
  detectBOS(candles) {
    if (!candles || candles.length < 20) return null;
    
    const { swingHighs, swingLows } = this.findSwingPoints(candles.slice(0, -3));
    const recentCandles = candles.slice(-5);
    
    if (swingHighs.length === 0 || swingLows.length === 0) return null;
    
    const lastSwingHigh = swingHighs[swingHighs.length - 1];
    const lastSwingLow = swingLows[swingLows.length - 1];
    
    for (const candle of recentCandles) {
      if (candle.close > lastSwingHigh.price) {
        return { type: 'BULLISH_BOS', side: 'BUY', level: lastSwingHigh.price };
      }
      if (candle.close < lastSwingLow.price) {
        return { type: 'BEARISH_BOS', side: 'SELL', level: lastSwingLow.price };
      }
    }
    
    return null;
  },
  
  detectCHoCH(candles) {
    if (!candles || candles.length < 20) return null;
    
    const trend = this.determineTrend(candles.slice(0, -5));
    const { swingHighs, swingLows } = this.findSwingPoints(candles.slice(0, -3));
    const recentCandles = candles.slice(-5);
    
    if (swingHighs.length === 0 || swingLows.length === 0) return null;
    
    if (trend.trend === 'BEARISH') {
      const lastSwingHigh = swingHighs[swingHighs.length - 1];
      for (const candle of recentCandles) {
        if (candle.close > lastSwingHigh.price) {
          return { type: 'BULLISH_CHOCH', side: 'BUY', level: lastSwingHigh.price };
        }
      }
    }
    
    if (trend.trend === 'BULLISH') {
      const lastSwingLow = swingLows[swingLows.length - 1];
      for (const candle of recentCandles) {
        if (candle.close < lastSwingLow.price) {
          return { type: 'BEARISH_CHOCH', side: 'SELL', level: lastSwingLow.price };
        }
      }
    }
    
    return null;
  }
};

// =============================================
// ORDER BLOCKS ANALYSIS
// =============================================

const OrderBlockAnalysis = {
  findDemandZones(candles, minImpulse = 1.0) {
    const zones = [];
    if (!candles || candles.length < 5) return zones;
    
    for (let i = 2; i < candles.length - 1; i++) {
      const prev = candles[i - 1];
      const current = candles[i];
      const next = candles[i + 1];
      
      const isPrevBearish = prev.close < prev.open;
      const isCurrentBullish = current.close > current.open;
      const isNextBullish = next.close > next.open;
      
      if (isPrevBearish && isCurrentBullish && isNextBullish) {
        const impulseSize = (next.high - prev.low) / prev.low * 100;
        
        if (impulseSize >= minImpulse) {
          zones.push({
            type: 'DEMAND',
            high: prev.high,
            low: prev.low,
            mid: (prev.high + prev.low) / 2,
            strength: Math.min(100, impulseSize * 15),
            fresh: true
          });
        }
      }
    }
    
    return zones.slice(-5);
  },
  
  findSupplyZones(candles, minImpulse = 1.0) {
    const zones = [];
    if (!candles || candles.length < 5) return zones;
    
    for (let i = 2; i < candles.length - 1; i++) {
      const prev = candles[i - 1];
      const current = candles[i];
      const next = candles[i + 1];
      
      const isPrevBullish = prev.close > prev.open;
      const isCurrentBearish = current.close < current.open;
      const isNextBearish = next.close < next.open;
      
      if (isPrevBullish && isCurrentBearish && isNextBearish) {
        const impulseSize = (prev.high - next.low) / prev.high * 100;
        
        if (impulseSize >= minImpulse) {
          zones.push({
            type: 'SUPPLY',
            high: prev.high,
            low: prev.low,
            mid: (prev.high + prev.low) / 2,
            strength: Math.min(100, impulseSize * 15),
            fresh: true
          });
        }
      }
    }
    
    return zones.slice(-5);
  },
  
  isPriceTouchingZone(price, zone, tolerance = 0.002) {
    return price >= zone.low * (1 - tolerance) && price <= zone.high * (1 + tolerance);
  },
  
  detectRejection(candle, zone, direction) {
    const body = Math.abs(candle.close - candle.open);
    if (direction === 'BUY') {
      const wickLower = Math.min(candle.close, candle.open) - candle.low;
      return wickLower > body * 0.5;
    } else {
      const wickUpper = candle.high - Math.max(candle.close, candle.open);
      return wickUpper > body * 0.5;
    }
  }
};

// =============================================
// FVG ANALYSIS
// =============================================

const FVGAnalysis = {
  findFVGs(candles, minGapPercent = 0.05) {
    const fvgs = [];
    if (!candles || candles.length < 5) return fvgs;
    
    for (let i = 2; i < candles.length; i++) {
      const candle1 = candles[i - 2];
      const candle3 = candles[i];
      
      // Bullish FVG
      if (candle3.low > candle1.high) {
        const gapSize = (candle3.low - candle1.high) / candle1.high * 100;
        if (gapSize >= minGapPercent) {
          fvgs.push({
            type: 'BULLISH_FVG',
            side: 'BUY',
            high: candle3.low,
            low: candle1.high,
            mid: (candle3.low + candle1.high) / 2,
            size: gapSize
          });
        }
      }
      
      // Bearish FVG
      if (candle3.high < candle1.low) {
        const gapSize = (candle1.low - candle3.high) / candle1.low * 100;
        if (gapSize >= minGapPercent) {
          fvgs.push({
            type: 'BEARISH_FVG',
            side: 'SELL',
            high: candle1.low,
            low: candle3.high,
            mid: (candle1.low + candle3.high) / 2,
            size: gapSize
          });
        }
      }
    }
    
    return fvgs.slice(-5);
  },
  
  isPriceInFVG(price, fvg, tolerance = 0.001) {
    return price >= fvg.low * (1 - tolerance) && price <= fvg.high * (1 + tolerance);
  }
};

// =============================================
// LIQUIDITY ANALYSIS
// =============================================

const LiquidityAnalysis = {
  findLiquidityLevels(candles, tolerance = 0.001) {
    const { swingHighs, swingLows } = StructureAnalysis.findSwingPoints(candles);
    const levels = [];
    
    // Equal Highs
    for (let i = 0; i < swingHighs.length - 1; i++) {
      for (let j = i + 1; j < swingHighs.length; j++) {
        const diff = Math.abs(swingHighs[i].price - swingHighs[j].price) / swingHighs[i].price;
        if (diff <= tolerance) {
          const avgPrice = (swingHighs[i].price + swingHighs[j].price) / 2;
          if (!levels.find(l => l.type === 'EQUAL_HIGHS' && Math.abs(l.price - avgPrice) / avgPrice < tolerance)) {
            levels.push({ type: 'EQUAL_HIGHS', price: avgPrice, liquidity: 'BUY_SIDE' });
          }
        }
      }
    }
    
    // Equal Lows
    for (let i = 0; i < swingLows.length - 1; i++) {
      for (let j = i + 1; j < swingLows.length; j++) {
        const diff = Math.abs(swingLows[i].price - swingLows[j].price) / swingLows[i].price;
        if (diff <= tolerance) {
          const avgPrice = (swingLows[i].price + swingLows[j].price) / 2;
          if (!levels.find(l => l.type === 'EQUAL_LOWS' && Math.abs(l.price - avgPrice) / avgPrice < tolerance)) {
            levels.push({ type: 'EQUAL_LOWS', price: avgPrice, liquidity: 'SELL_SIDE' });
          }
        }
      }
    }
    
    return levels;
  },
  
  detectLiquiditySweep(candles, liquidityLevels) {
    const last3 = candles.slice(-3);
    
    for (const level of liquidityLevels) {
      for (const candle of last3) {
        if (level.type === 'EQUAL_HIGHS' && candle.high > level.price && candle.close < level.price) {
          return { type: 'SWEEP_HIGHS', side: 'SELL', level: level.price };
        }
        if (level.type === 'EQUAL_LOWS' && candle.low < level.price && candle.close > level.price) {
          return { type: 'SWEEP_LOWS', side: 'BUY', level: level.price };
        }
      }
    }
    
    return null;
  }
};

// =============================================
// PREMIUM/DISCOUNT ANALYSIS
// =============================================

const PremiumDiscountAnalysis = {
  calculate(candles, lookback = 50) {
    if (!candles || candles.length < 10) {
      return { zone: 'NEUTRAL', equilibrium: 0, highest: 0, lowest: 0 };
    }
    
    const relevant = candles.slice(-Math.min(lookback, candles.length));
    let highest = -Infinity;
    let lowest = Infinity;
    
    for (const c of relevant) {
      if (c.high > highest) highest = c.high;
      if (c.low < lowest) lowest = c.low;
    }
    
    const equilibrium = lowest + (highest - lowest) * 0.5;
    const currentPrice = relevant[relevant.length - 1].close;
    
    return {
      highest,
      lowest,
      equilibrium,
      currentPrice,
      zone: currentPrice > equilibrium ? 'PREMIUM' : 'DISCOUNT',
      percentFromEQ: ((currentPrice - equilibrium) / (highest - lowest) * 100).toFixed(1)
    };
  }
};

// =============================================
// PULLBACK DETECTION
// =============================================

const PullbackDetection = {
  detect(candles, demandZones, supplyZones, fvgZones) {
    if (!candles || candles.length < 3) return null;
    
    const lastCandle = candles[candles.length - 1];
    const price = lastCandle.close;
    
    // Check demand zones
    for (const zone of demandZones) {
      if (OrderBlockAnalysis.isPriceTouchingZone(price, zone)) {
        if (OrderBlockAnalysis.detectRejection(lastCandle, zone, 'BUY')) {
          const range = zone.high - zone.low;
          return {
            type: 'DEMAND_PULLBACK',
            side: 'BUY',
            zone,
            entry: price,
            stop: zone.low - range * 0.5,
            tp1: price + range * 1.5,
            tp2: price + range * 2.5,
            tp3: price + range * 4
          };
        }
      }
    }
    
    // Check supply zones
    for (const zone of supplyZones) {
      if (OrderBlockAnalysis.isPriceTouchingZone(price, zone)) {
        if (OrderBlockAnalysis.detectRejection(lastCandle, zone, 'SELL')) {
          const range = zone.high - zone.low;
          return {
            type: 'SUPPLY_PULLBACK',
            side: 'SELL',
            zone,
            entry: price,
            stop: zone.high + range * 0.5,
            tp1: price - range * 1.5,
            tp2: price - range * 2.5,
            tp3: price - range * 4
          };
        }
      }
    }
    
    // Check FVGs
    for (const fvg of fvgZones) {
      if (FVGAnalysis.isPriceInFVG(price, fvg)) {
        const range = fvg.high - fvg.low;
        return {
          type: 'FVG_PULLBACK',
          side: fvg.side,
          zone: fvg,
          entry: price,
          stop: fvg.side === 'BUY' ? fvg.low - range : fvg.high + range,
          tp1: fvg.side === 'BUY' ? price + range * 2 : price - range * 2,
          tp2: fvg.side === 'BUY' ? price + range * 3 : price - range * 3,
          tp3: fvg.side === 'BUY' ? price + range * 4 : price - range * 4
        };
      }
    }
    
    return null;
  }
};

// =============================================
// MAIN SMC ENGINE
// =============================================

const SMCEngine = {
  config: ENGINE_CONFIG,
  
  analyze(candlesM5, candlesH1 = null) {
    const structureM5 = StructureAnalysis.determineTrend(candlesM5);
    const structureH1 = candlesH1 ? StructureAnalysis.determineTrend(candlesH1) : { trend: 'NEUTRAL', strength: 0 };
    
    const demandZones = OrderBlockAnalysis.findDemandZones(candlesM5);
    const supplyZones = OrderBlockAnalysis.findSupplyZones(candlesM5);
    const fvgZones = FVGAnalysis.findFVGs(candlesM5);
    const liquidityLevels = LiquidityAnalysis.findLiquidityLevels(candlesM5);
    const premiumDiscount = PremiumDiscountAnalysis.calculate(candlesM5);
    
    const bos = StructureAnalysis.detectBOS(candlesM5);
    const choch = StructureAnalysis.detectCHoCH(candlesM5);
    const liquiditySweep = LiquidityAnalysis.detectLiquiditySweep(candlesM5, liquidityLevels);
    
    const mtfConfluence = structureM5.trend !== 'NEUTRAL' && 
                          structureH1.trend !== 'NEUTRAL' &&
                          structureM5.trend === structureH1.trend;
    
    const pullback = PullbackDetection.detect(candlesM5, demandZones, supplyZones, fvgZones);
    
    const price = candlesM5[candlesM5.length - 1]?.close || 0;
    
    return {
      structureM5,
      structureH1,
      demandZones,
      supplyZones,
      fvgZones,
      liquidityLevels,
      premiumDiscount,
      bos,
      choch,
      liquiditySweep,
      mtfConfluence,
      pullback,
      price
    };
  },
  
  generateSignal(analysis, decimals = 2) {
    const signals = [];
    const { structureM5, structureH1, mtfConfluence, pullback, bos, choch, liquiditySweep, premiumDiscount } = analysis;
    
    // 1. MTF CONFLUENCE (95pts)
    if (mtfConfluence && pullback) {
      const sideMatch = (structureH1.trend === 'BULLISH' && pullback.side === 'BUY') ||
                        (structureH1.trend === 'BEARISH' && pullback.side === 'SELL');
      if (sideMatch) {
        let score = 95;
        if (pullback.side === 'BUY' && premiumDiscount.zone === 'DISCOUNT') score += 5;
        if (pullback.side === 'SELL' && premiumDiscount.zone === 'PREMIUM') score += 5;
        signals.push({
          model: 'MTF_CONFLUENCE',
          score,
          side: pullback.side,
          pullback,
          reason: `H1 ${structureH1.trend} + M5 alineado + Pullback a ${pullback.type}${score === 100 ? ' + PD óptimo' : ''}`
        });
      }
    }
    
    // 2. CHOCH PULLBACK (85-90pts)
    if (choch && pullback && choch.side === pullback.side) {
      const h1NotAgainst = (choch.side === 'BUY' && structureH1.trend !== 'BEARISH') ||
                          (choch.side === 'SELL' && structureH1.trend !== 'BULLISH');
      if (h1NotAgainst) {
        let score = 85;
        if (mtfConfluence) score += 5;
        signals.push({
          model: 'CHOCH_PULLBACK',
          score,
          side: choch.side,
          pullback,
          reason: `${choch.type} + Pullback${mtfConfluence ? ' + MTF Confluence' : ''}`
        });
      }
    }
    
    // 3. LIQUIDITY SWEEP (82pts)
    if (liquiditySweep && pullback && mtfConfluence && liquiditySweep.side === pullback.side) {
      signals.push({
        model: 'LIQUIDITY_SWEEP',
        score: 82,
        side: liquiditySweep.side,
        pullback,
        reason: `${liquiditySweep.type} + Reversión confirmada + MTF`
      });
    }
    
    // 4. BOS CONTINUATION (80pts)
    if (bos && pullback && bos.side === pullback.side && mtfConfluence) {
      signals.push({
        model: 'BOS_CONTINUATION',
        score: 80,
        side: bos.side,
        pullback,
        reason: `${bos.type} + Pullback + MTF Confluence`
      });
    }
    
    // 5. ZONE TOUCH (78pts)
    if (pullback && mtfConfluence && (pullback.type.includes('DEMAND') || pullback.type.includes('SUPPLY'))) {
      const pdCorrect = (pullback.side === 'BUY' && premiumDiscount.zone === 'DISCOUNT') ||
                        (pullback.side === 'SELL' && premiumDiscount.zone === 'PREMIUM');
      if (pdCorrect) {
        signals.push({
          model: 'ZONE_TOUCH',
          score: 78,
          side: pullback.side,
          pullback,
          reason: `Order Block Touch + ${premiumDiscount.zone} + MTF`
        });
      }
    }
    
    // 6. FVG ENTRY (77pts)
    if (pullback && pullback.type === 'FVG_PULLBACK' && mtfConfluence) {
      signals.push({
        model: 'FVG_ENTRY',
        score: 77,
        side: pullback.side,
        pullback,
        reason: `Price in FVG + MTF Confluence`
      });
    }
    
    // No signals
    if (signals.length === 0) {
      let reason = 'Esperando setup de alta probabilidad';
      if (!pullback) reason = 'Sin pullback a zona de interés';
      else if (structureM5.trend === 'NEUTRAL') reason = 'Estructura M5 neutral';
      else if (!mtfConfluence) reason = 'Sin confluencia MTF (H1/M5 no alineados)';
      
      return {
        action: 'WAIT',
        score: 0,
        model: 'WAIT',
        reason,
        analysis
      };
    }
    
    // Select best signal
    signals.sort((a, b) => b.score - a.score);
    const best = signals[0];
    
    if (best.score < ENGINE_CONFIG.MIN_SCORE) {
      return {
        action: 'WAIT',
        score: best.score,
        model: best.model,
        reason: `Score ${best.score}% < mínimo ${ENGINE_CONFIG.MIN_SCORE}%`,
        analysis
      };
    }
    
    const pb = best.pullback;
    const fmt = (n) => +n.toFixed(decimals);
    
    return {
      action: best.side === 'BUY' ? 'LONG' : 'SHORT',
      model: best.model,
      score: best.score,
      entry: fmt(pb.entry),
      stop: fmt(pb.stop),
      tp1: fmt(pb.tp1),
      tp2: fmt(pb.tp2),
      tp3: fmt(pb.tp3),
      reason: best.reason,
      analysis
    };
  }
};

// =============================================
// LEARNING SYSTEM
// =============================================

const LearningSystem = {
  stats: {
    byModel: {},
    byAsset: {},
    overall: { wins: 0, losses: 0, total: 0 }
  },
  
  recordResult(model, asset, result) {
    this.stats.overall.total++;
    if (result === 'WIN') this.stats.overall.wins++;
    else this.stats.overall.losses++;
    
    if (!this.stats.byModel[model]) {
      this.stats.byModel[model] = { wins: 0, losses: 0, total: 0, adjustment: 0 };
    }
    this.stats.byModel[model].total++;
    if (result === 'WIN') {
      this.stats.byModel[model].wins++;
      this.stats.byModel[model].adjustment = Math.min(10, this.stats.byModel[model].adjustment + 2);
    } else {
      this.stats.byModel[model].losses++;
      this.stats.byModel[model].adjustment = Math.max(-15, this.stats.byModel[model].adjustment - 3);
    }
    
    if (!this.stats.byAsset[asset]) {
      this.stats.byAsset[asset] = { wins: 0, losses: 0, total: 0 };
    }
    this.stats.byAsset[asset].total++;
    if (result === 'WIN') this.stats.byAsset[asset].wins++;
    else this.stats.byAsset[asset].losses++;
  },
  
  getStats() {
    const overall = this.stats.overall;
    return {
      overall: {
        ...overall,
        winRate: overall.total > 0 ? (overall.wins / overall.total * 100).toFixed(1) : 0
      },
      byModel: Object.fromEntries(
        Object.entries(this.stats.byModel).map(([k, v]) => [k, {
          ...v,
          winRate: v.total > 0 ? (v.wins / v.total * 100).toFixed(1) : 0
        }])
      ),
      byAsset: Object.fromEntries(
        Object.entries(this.stats.byAsset).map(([k, v]) => [k, {
          ...v,
          winRate: v.total > 0 ? (v.wins / v.total * 100).toFixed(1) : 0
        }])
      )
    };
  },
  
  getScoreAdjustment(model) {
    return this.stats.byModel[model]?.adjustment || 0;
  }
};

// =============================================
// EXPORTS
// =============================================

export {
  SMCEngine,
  StructureAnalysis,
  OrderBlockAnalysis,
  FVGAnalysis,
  LiquidityAnalysis,
  PremiumDiscountAnalysis,
  PullbackDetection,
  LearningSystem,
  ENGINE_CONFIG
};

export default SMCEngine;
