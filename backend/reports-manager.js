// =============================================
// TRADING MASTER PRO - MÓDULO DE REPORTES
// Sistema de cuenta auditada y estadísticas
// =============================================

/**
 * Módulo de Reportes
 * 
 * Funcionalidades:
 * - Guardar historial de operaciones en Supabase
 * - Calcular estadísticas por período (día, semana, mes, año)
 * - Generar reportes de rendimiento
 * - Mantener equity curve para gráficas
 */

// Configuración de R:R por TP
const TP_RR_RATIOS = {
  1: 1.5,  // TP1 = 1.5R
  2: 2.5,  // TP2 = 2.5R
  3: 3.5   // TP3 = 3.5R
};

// Riesgo por defecto (% del capital por operación)
const DEFAULT_RISK_PERCENT = 1.0;

/**
 * Clase ReportsManager
 * Maneja toda la lógica de reportes y estadísticas
 */
class ReportsManager {
  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Registrar una nueva operación cerrada
   */
  async recordTrade(userId, tradeData) {
    try {
      const {
        signalId,
        symbol,
        assetName,
        action,
        model,
        score,
        entryPrice,
        stopLoss,
        tp1,
        tp2,
        tp3,
        result, // 'WIN', 'LOSS', 'BREAKEVEN'
        closePrice,
        tpHit, // 1, 2, 3 o null
        reason,
        timeframe = 'M5',
        userPlan = 'free',
        signalTime
      } = tradeData;

      // Calcular riesgo (distancia entry -> SL)
      const riskAmount = Math.abs(entryPrice - stopLoss);
      
      // Calcular profit/loss
      let profitAmount = 0;
      let rrRatio = 0;
      let pnlPercent = 0;

      if (result === 'WIN') {
        profitAmount = Math.abs(closePrice - entryPrice);
        rrRatio = riskAmount > 0 ? profitAmount / riskAmount : 0;
        pnlPercent = (tpHit ? TP_RR_RATIOS[tpHit] : 1.5) * DEFAULT_RISK_PERCENT;
      } else if (result === 'LOSS') {
        profitAmount = -riskAmount;
        rrRatio = -1;
        pnlPercent = -DEFAULT_RISK_PERCENT;
      } else if (result === 'BREAKEVEN') {
        profitAmount = 0;
        rrRatio = 0;
        pnlPercent = 0;
      }

      // Insertar en trade_history
      const { data: trade, error } = await this.supabase
        .from('trade_history')
        .insert({
          user_id: userId,
          signal_id: signalId,
          symbol,
          asset_name: assetName,
          action,
          model,
          score,
          entry_price: entryPrice,
          stop_loss: stopLoss,
          tp1,
          tp2,
          tp3,
          result,
          close_price: closePrice,
          tp_hit: tpHit,
          risk_amount: riskAmount,
          profit_amount: profitAmount,
          rr_ratio: rrRatio,
          pnl_percent: pnlPercent,
          reason,
          timeframe,
          user_plan: userPlan,
          signal_time: signalTime || new Date().toISOString(),
          close_time: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error recording trade:', error);
        throw error;
      }

      // Actualizar estadísticas del usuario
      await this.updateUserStats(userId, result, pnlPercent, model, symbol, tpHit);

      // Actualizar snapshot diario
      await this.updateDailySnapshot(userId, result, pnlPercent);

      return trade;
    } catch (error) {
      console.error('Error in recordTrade:', error);
      throw error;
    }
  }

  /**
   * Actualizar estadísticas acumuladas del usuario
   */
  async updateUserStats(userId, result, pnlPercent, model, symbol, tpHit) {
    try {
      // Obtener stats actuales
      let { data: stats, error } = await this.supabase
        .from('user_trading_stats')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // No existe, crear nuevo registro
        stats = {
          user_id: userId,
          total_trades: 0,
          total_wins: 0,
          total_losses: 0,
          total_breakeven: 0,
          win_rate: 0,
          total_pnl_percent: 0,
          best_trade_percent: 0,
          worst_trade_percent: 0,
          current_streak: 0,
          best_win_streak: 0,
          worst_loss_streak: 0,
          stats_by_model: {},
          stats_by_asset: {},
          initial_capital: 1000,
          current_capital: 1000,
          first_trade_at: new Date().toISOString()
        };
      }

      // Actualizar contadores
      stats.total_trades++;
      if (result === 'WIN') {
        stats.total_wins++;
        stats.current_streak = stats.current_streak > 0 ? stats.current_streak + 1 : 1;
        stats.best_win_streak = Math.max(stats.best_win_streak, stats.current_streak);
      } else if (result === 'LOSS') {
        stats.total_losses++;
        stats.current_streak = stats.current_streak < 0 ? stats.current_streak - 1 : -1;
        stats.worst_loss_streak = Math.min(stats.worst_loss_streak, stats.current_streak);
      } else {
        stats.total_breakeven++;
      }

      // Calcular win rate
      const decidedTrades = stats.total_wins + stats.total_losses;
      stats.win_rate = decidedTrades > 0 
        ? ((stats.total_wins / decidedTrades) * 100).toFixed(2) 
        : 0;

      // Actualizar P&L
      stats.total_pnl_percent = (parseFloat(stats.total_pnl_percent) + pnlPercent).toFixed(4);
      
      // Actualizar mejor/peor trade
      if (pnlPercent > parseFloat(stats.best_trade_percent || 0)) {
        stats.best_trade_percent = pnlPercent;
      }
      if (pnlPercent < parseFloat(stats.worst_trade_percent || 0)) {
        stats.worst_trade_percent = pnlPercent;
      }

      // Actualizar capital simulado
      const capitalChange = (parseFloat(stats.current_capital) * pnlPercent) / 100;
      stats.current_capital = (parseFloat(stats.current_capital) + capitalChange).toFixed(2);

      // Actualizar stats por modelo
      const modelStats = stats.stats_by_model || {};
      if (!modelStats[model]) {
        modelStats[model] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
      }
      modelStats[model].trades++;
      if (result === 'WIN') modelStats[model].wins++;
      if (result === 'LOSS') modelStats[model].losses++;
      modelStats[model].pnl = (parseFloat(modelStats[model].pnl || 0) + pnlPercent).toFixed(4);
      stats.stats_by_model = modelStats;

      // Actualizar stats por activo
      const assetStats = stats.stats_by_asset || {};
      if (!assetStats[symbol]) {
        assetStats[symbol] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
      }
      assetStats[symbol].trades++;
      if (result === 'WIN') assetStats[symbol].wins++;
      if (result === 'LOSS') assetStats[symbol].losses++;
      assetStats[symbol].pnl = (parseFloat(assetStats[symbol].pnl || 0) + pnlPercent).toFixed(4);
      stats.stats_by_asset = assetStats;

      // Actualizar última operación
      stats.last_trade_at = new Date().toISOString();

      // Guardar/actualizar en DB
      const { error: upsertError } = await this.supabase
        .from('user_trading_stats')
        .upsert(stats, { onConflict: 'user_id' });

      if (upsertError) {
        console.error('Error updating user stats:', upsertError);
      }

      return stats;
    } catch (error) {
      console.error('Error in updateUserStats:', error);
    }
  }

  /**
   * Actualizar snapshot diario para gráficas
   */
  async updateDailySnapshot(userId, result, pnlPercent) {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Obtener snapshot de hoy
      let { data: snapshot, error } = await this.supabase
        .from('daily_snapshots')
        .select('*')
        .eq('user_id', userId)
        .eq('snapshot_date', today)
        .single();

      if (error && error.code === 'PGRST116') {
        // No existe, crear nuevo
        snapshot = {
          user_id: userId,
          snapshot_date: today,
          trades_count: 0,
          wins_count: 0,
          losses_count: 0,
          daily_pnl_percent: 0
        };
      }

      // Actualizar
      snapshot.trades_count++;
      if (result === 'WIN') snapshot.wins_count++;
      if (result === 'LOSS') snapshot.losses_count++;
      snapshot.daily_pnl_percent = (parseFloat(snapshot.daily_pnl_percent || 0) + pnlPercent).toFixed(4);

      // Obtener capital actual para el snapshot
      const { data: stats } = await this.supabase
        .from('user_trading_stats')
        .select('current_capital, total_pnl_percent')
        .eq('user_id', userId)
        .single();

      if (stats) {
        snapshot.ending_capital = stats.current_capital;
        snapshot.cumulative_pnl_percent = stats.total_pnl_percent;
      }

      // Guardar
      const { error: upsertError } = await this.supabase
        .from('daily_snapshots')
        .upsert(snapshot, { onConflict: 'user_id,snapshot_date' });

      if (upsertError) {
        console.error('Error updating daily snapshot:', upsertError);
      }
    } catch (error) {
      console.error('Error in updateDailySnapshot:', error);
    }
  }

  /**
   * Obtener reporte por período
   */
  async getReport(userId, period = 'all') {
    try {
      let startDate = null;
      const now = new Date();

      switch (period) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case '15days':
          startDate = new Date(now.setDate(now.getDate() - 15));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case '3months':
          startDate = new Date(now.setMonth(now.getMonth() - 3));
          break;
        case '6months':
          startDate = new Date(now.setMonth(now.getMonth() - 6));
          break;
        case 'year':
          startDate = new Date(now.setFullYear(now.getFullYear() - 1));
          break;
        case 'all':
        default:
          startDate = null;
      }

      // Query base
      let query = this.supabase
        .from('trade_history')
        .select('*')
        .eq('user_id', userId)
        .order('signal_time', { ascending: false });

      if (startDate) {
        query = query.gte('signal_time', startDate.toISOString());
      }

      const { data: trades, error } = await query;

      if (error) {
        throw error;
      }

      // Calcular estadísticas del período
      const stats = this.calculatePeriodStats(trades);

      // Obtener equity curve (snapshots diarios)
      let snapshotQuery = this.supabase
        .from('daily_snapshots')
        .select('*')
        .eq('user_id', userId)
        .order('snapshot_date', { ascending: true });

      if (startDate) {
        snapshotQuery = snapshotQuery.gte('snapshot_date', startDate.toISOString().split('T')[0]);
      }

      const { data: snapshots } = await snapshotQuery;

      // Obtener stats generales del usuario
      const { data: userStats } = await this.supabase
        .from('user_trading_stats')
        .select('*')
        .eq('user_id', userId)
        .single();

      return {
        period,
        startDate: startDate?.toISOString() || null,
        trades,
        stats,
        equityCurve: snapshots || [],
        userStats: userStats || null
      };
    } catch (error) {
      console.error('Error in getReport:', error);
      throw error;
    }
  }

  /**
   * Calcular estadísticas de un conjunto de trades
   */
  calculatePeriodStats(trades) {
    if (!trades || trades.length === 0) {
      return {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        breakeven: 0,
        winRate: 0,
        totalPnl: 0,
        avgPnl: 0,
        bestTrade: 0,
        worstTrade: 0,
        profitFactor: 0,
        avgWin: 0,
        avgLoss: 0,
        byModel: {},
        byAsset: {},
        byDay: {}
      };
    }

    const wins = trades.filter(t => t.result === 'WIN');
    const losses = trades.filter(t => t.result === 'LOSS');
    const breakeven = trades.filter(t => t.result === 'BREAKEVEN');

    const totalPnl = trades.reduce((sum, t) => sum + parseFloat(t.pnl_percent || 0), 0);
    const totalWinPnl = wins.reduce((sum, t) => sum + parseFloat(t.pnl_percent || 0), 0);
    const totalLossPnl = Math.abs(losses.reduce((sum, t) => sum + parseFloat(t.pnl_percent || 0), 0));

    // Por modelo
    const byModel = {};
    trades.forEach(t => {
      if (!byModel[t.model]) {
        byModel[t.model] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
      }
      byModel[t.model].trades++;
      if (t.result === 'WIN') byModel[t.model].wins++;
      if (t.result === 'LOSS') byModel[t.model].losses++;
      byModel[t.model].pnl += parseFloat(t.pnl_percent || 0);
    });

    // Por activo
    const byAsset = {};
    trades.forEach(t => {
      if (!byAsset[t.symbol]) {
        byAsset[t.symbol] = { trades: 0, wins: 0, losses: 0, pnl: 0, name: t.asset_name };
      }
      byAsset[t.symbol].trades++;
      if (t.result === 'WIN') byAsset[t.symbol].wins++;
      if (t.result === 'LOSS') byAsset[t.symbol].losses++;
      byAsset[t.symbol].pnl += parseFloat(t.pnl_percent || 0);
    });

    // Por día de la semana
    const byDay = { 0: { trades: 0, pnl: 0 }, 1: { trades: 0, pnl: 0 }, 2: { trades: 0, pnl: 0 }, 3: { trades: 0, pnl: 0 }, 4: { trades: 0, pnl: 0 }, 5: { trades: 0, pnl: 0 }, 6: { trades: 0, pnl: 0 } };
    trades.forEach(t => {
      const day = new Date(t.signal_time).getDay();
      byDay[day].trades++;
      byDay[day].pnl += parseFloat(t.pnl_percent || 0);
    });

    const decidedTrades = wins.length + losses.length;

    return {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      breakeven: breakeven.length,
      winRate: decidedTrades > 0 ? ((wins.length / decidedTrades) * 100).toFixed(2) : 0,
      totalPnl: totalPnl.toFixed(2),
      avgPnl: trades.length > 0 ? (totalPnl / trades.length).toFixed(2) : 0,
      bestTrade: Math.max(...trades.map(t => parseFloat(t.pnl_percent || 0)), 0).toFixed(2),
      worstTrade: Math.min(...trades.map(t => parseFloat(t.pnl_percent || 0)), 0).toFixed(2),
      profitFactor: totalLossPnl > 0 ? (totalWinPnl / totalLossPnl).toFixed(2) : totalWinPnl > 0 ? '∞' : 0,
      avgWin: wins.length > 0 ? (totalWinPnl / wins.length).toFixed(2) : 0,
      avgLoss: losses.length > 0 ? (totalLossPnl / losses.length).toFixed(2) : 0,
      byModel,
      byAsset,
      byDay
    };
  }

  /**
   * Obtener equity curve para gráficas
   */
  async getEquityCurve(userId, period = 'month') {
    try {
      let startDate = new Date();
      
      switch (period) {
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '15days':
          startDate.setDate(startDate.getDate() - 15);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case '3months':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        case 'all':
          startDate = new Date('2020-01-01');
          break;
      }

      const { data: snapshots, error } = await this.supabase
        .from('daily_snapshots')
        .select('snapshot_date, daily_pnl_percent, ending_capital, cumulative_pnl_percent, trades_count, wins_count, losses_count')
        .eq('user_id', userId)
        .gte('snapshot_date', startDate.toISOString().split('T')[0])
        .order('snapshot_date', { ascending: true });

      if (error) throw error;

      // Si no hay snapshots, generar desde trade_history
      if (!snapshots || snapshots.length === 0) {
        return await this.generateEquityCurveFromTrades(userId, startDate);
      }

      return snapshots;
    } catch (error) {
      console.error('Error getting equity curve:', error);
      return [];
    }
  }

  /**
   * Generar equity curve desde historial de trades
   */
  async generateEquityCurveFromTrades(userId, startDate) {
    try {
      const { data: trades } = await this.supabase
        .from('trade_history')
        .select('signal_time, pnl_percent, result')
        .eq('user_id', userId)
        .gte('signal_time', startDate.toISOString())
        .order('signal_time', { ascending: true });

      if (!trades || trades.length === 0) return [];

      // Agrupar por día
      const byDay = {};
      let cumulative = 0;
      let capital = 1000;

      trades.forEach(t => {
        const date = t.signal_time.split('T')[0];
        if (!byDay[date]) {
          byDay[date] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
        }
        byDay[date].trades++;
        if (t.result === 'WIN') byDay[date].wins++;
        if (t.result === 'LOSS') byDay[date].losses++;
        byDay[date].pnl += parseFloat(t.pnl_percent || 0);
      });

      // Convertir a array
      const curve = Object.keys(byDay).sort().map(date => {
        cumulative += byDay[date].pnl;
        capital = capital * (1 + byDay[date].pnl / 100);
        return {
          snapshot_date: date,
          daily_pnl_percent: byDay[date].pnl.toFixed(2),
          ending_capital: capital.toFixed(2),
          cumulative_pnl_percent: cumulative.toFixed(2),
          trades_count: byDay[date].trades,
          wins_count: byDay[date].wins,
          losses_count: byDay[date].losses
        };
      });

      return curve;
    } catch (error) {
      console.error('Error generating equity curve:', error);
      return [];
    }
  }

  /**
   * Obtener resumen rápido del usuario
   */
  async getUserSummary(userId) {
    try {
      const { data: stats, error } = await this.supabase
        .from('user_trading_stats')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (!stats) {
        return {
          totalTrades: 0,
          winRate: 0,
          totalPnl: 0,
          currentCapital: 1000,
          roi: 0,
          bestStreak: 0,
          worstStreak: 0
        };
      }

      const roi = ((parseFloat(stats.current_capital) - parseFloat(stats.initial_capital)) / parseFloat(stats.initial_capital) * 100).toFixed(2);

      return {
        totalTrades: stats.total_trades,
        wins: stats.total_wins,
        losses: stats.total_losses,
        winRate: stats.win_rate,
        totalPnl: stats.total_pnl_percent,
        currentCapital: stats.current_capital,
        initialCapital: stats.initial_capital,
        roi,
        bestStreak: stats.best_win_streak,
        worstStreak: stats.worst_loss_streak,
        currentStreak: stats.current_streak,
        bestTrade: stats.best_trade_percent,
        worstTrade: stats.worst_trade_percent,
        statsByModel: stats.stats_by_model,
        statsByAsset: stats.stats_by_asset,
        firstTrade: stats.first_trade_at,
        lastTrade: stats.last_trade_at
      };
    } catch (error) {
      console.error('Error getting user summary:', error);
      return null;
    }
  }
}

export default ReportsManager;
