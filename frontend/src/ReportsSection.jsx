import React, { useState, useEffect, useMemo } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// Configuración de R:R por TP
const TP_RR_RATIOS = {
  1: 1.5,
  2: 2.5,
  3: 3.5
};

// Mini componente de gráfica de líneas mejorado
const LineChart = ({ data, height = 200, color = '#10b981' }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-white/40">
        <p>No hay datos disponibles</p>
      </div>
    );
  }

  const values = data.map(d => parseFloat(d.cumulative_pnl_percent || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  
  const padding = 40;
  const chartWidth = 100;
  const chartHeight = height - padding * 2;
  
  // Calcular puntos para la línea
  const pointsArray = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * 100;
    const y = ((max - v) / range) * chartHeight + padding;
    return { x, y, value: v, date: data[i]?.snapshot_date || '' };
  });
  
  const points = pointsArray.map(p => `${p.x},${p.y}`).join(' ');
  const areaPoints = `0,${height} ${points} 100,${height}`;
  
  // Determinar color basado en si el último valor es positivo o negativo
  const lastValue = values[values.length - 1] || 0;
  const lineColor = lastValue >= 0 ? '#10b981' : '#ef4444';
  const areaColor = lastValue >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
  const pointColor = lastValue >= 0 ? '#10b981' : '#ef4444';

  // Líneas de grilla horizontal
  const gridLines = [];
  const step = range / 4;
  for (let i = 0; i <= 4; i++) {
    const val = max - (step * i);
    const y = ((max - val) / range) * chartHeight + padding;
    gridLines.push({ y, value: val });
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <svg viewBox={`0 0 100 ${height}`} className="w-full h-full" preserveAspectRatio="none">
        {/* Grilla horizontal */}
        {gridLines.map((line, i) => (
          <line
            key={i}
            x1="0"
            y1={line.y}
            x2="100"
            y2={line.y}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="0.3"
          />
        ))}
        
        {/* Área bajo la línea */}
        <polygon points={areaPoints} fill={areaColor} />
        
        {/* Línea principal */}
        <polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        
        {/* Puntos de datos (solo si hay pocos puntos) */}
        {pointsArray.length <= 30 && pointsArray.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="0.8"
            fill={pointColor}
            stroke="white"
            strokeWidth="0.3"
          />
        ))}
        
        {/* Línea de cero */}
        {min < 0 && max > 0 && (
          <line
            x1="0"
            y1={((max - 0) / range) * chartHeight + padding}
            x2="100"
            y2={((max - 0) / range) * chartHeight + padding}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="0.4"
            strokeDasharray="2,2"
          />
        )}
        
        {/* Punto final destacado */}
        {pointsArray.length > 0 && (
          <circle
            cx={pointsArray[pointsArray.length - 1].x}
            cy={pointsArray[pointsArray.length - 1].y}
            r="1.5"
            fill={pointColor}
            stroke="white"
            strokeWidth="0.5"
          />
        )}
      </svg>
      
      {/* Labels */}
      <div className="absolute top-1 left-2 text-xs text-white/40">{max.toFixed(1)}%</div>
      <div className="absolute bottom-1 left-2 text-xs text-white/40">{min.toFixed(1)}%</div>
      <div className="absolute top-1 right-2 text-xs font-medium" style={{ color: lineColor }}>
        {lastValue >= 0 ? '+' : ''}{lastValue.toFixed(2)}%
      </div>
      <div className="absolute bottom-1 right-2 text-xs text-white/40">
        {data.length > 0 ? data[data.length - 1].snapshot_date : ''}
      </div>
      {/* Indicador de datos */}
      <div className="absolute top-1 left-1/2 transform -translate-x-1/2 text-xs text-white/30">
        {data.length} {data.length === 1 ? 'día' : 'días'}
      </div>
    </div>
  );
};

// Componente de barra de progreso
const ProgressBar = ({ value, max, color = 'emerald' }) => {
  const percent = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
      <div 
        className={`h-full bg-${color}-500 rounded-full transition-all duration-500`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
};

// Períodos disponibles
const PERIODS = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: '7 días' },
  { value: '15days', label: '15 días' },
  { value: 'month', label: '1 mes' },
  { value: '3months', label: '3 meses' },
  { value: '6months', label: '6 meses' },
  { value: 'year', label: '1 año' },
  { value: 'all', label: 'Todo' }
];

// Días de la semana
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function ReportsSection({ userId, localStats, localSignals }) {
  const [period, setPeriod] = useState('week');
  const [report, setReport] = useState(null);
  const [equityCurve, setEquityCurve] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [useLocalData, setUseLocalData] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const lastFetchRef = React.useRef(null);
  
  // Capital inicial personalizable
  const [initialCapital, setInitialCapital] = useState(() => {
    const saved = localStorage.getItem('tradingPro_initialCapital');
    return saved ? parseFloat(saved) : 1000;
  });
  const [showCapitalEditor, setShowCapitalEditor] = useState(false);
  const [tempCapital, setTempCapital] = useState(initialCapital);
  
  // Guardar capital cuando cambia
  const handleSaveCapital = () => {
    const newCapital = parseFloat(tempCapital) || 1000;
    setInitialCapital(newCapital);
    localStorage.setItem('tradingPro_initialCapital', newCapital.toString());
    setShowCapitalEditor(false);
  };

  // Calcular datos locales desde las señales del backend
  const localData = useMemo(() => {
    if (!localStats || !localSignals) return null;
    
    const closedSignals = localSignals.filter(s => s.status === 'WIN' || s.status === 'LOSS');
    const wins = closedSignals.filter(s => s.status === 'WIN');
    const losses = closedSignals.filter(s => s.status === 'LOSS');
    
    // Calcular P&L simulado
    let totalPnl = 0;
    let capital = initialCapital;
    const equityData = [];
    
    // Agrupar por día
    const byDay = {};
    closedSignals.forEach(s => {
      const date = new Date(s.timestamp).toISOString().split('T')[0];
      if (!byDay[date]) byDay[date] = { wins: 0, losses: 0, pnl: 0 };
      
      if (s.status === 'WIN') {
        const tpHit = s.tpHit || 1;
        const pnl = TP_RR_RATIOS[tpHit] || 1.5;
        byDay[date].wins++;
        byDay[date].pnl += pnl;
        totalPnl += pnl;
      } else {
        byDay[date].losses++;
        byDay[date].pnl -= 1;
        totalPnl -= 1;
      }
    });
    
    // Generar equity curve
    let cumulative = 0;
    Object.keys(byDay).sort().forEach(date => {
      cumulative += byDay[date].pnl;
      capital = initialCapital * (1 + cumulative / 100);
      equityData.push({
        snapshot_date: date,
        daily_pnl_percent: byDay[date].pnl.toFixed(2),
        cumulative_pnl_percent: cumulative.toFixed(2),
        ending_capital: capital.toFixed(2),
        trades_count: byDay[date].wins + byDay[date].losses,
        wins_count: byDay[date].wins,
        losses_count: byDay[date].losses
      });
    });
    
    const decidedTrades = wins.length + losses.length;
    const winRate = decidedTrades > 0 ? ((wins.length / decidedTrades) * 100).toFixed(2) : 0;
    
    // Stats por modelo
    const byModel = {};
    closedSignals.forEach(s => {
      if (!byModel[s.model]) byModel[s.model] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
      byModel[s.model].trades++;
      if (s.status === 'WIN') {
        byModel[s.model].wins++;
        byModel[s.model].pnl += TP_RR_RATIOS[s.tpHit || 1] || 1.5;
      } else {
        byModel[s.model].losses++;
        byModel[s.model].pnl -= 1;
      }
    });
    
    // Stats por activo
    const byAsset = {};
    closedSignals.forEach(s => {
      if (!byAsset[s.symbol]) byAsset[s.symbol] = { trades: 0, wins: 0, losses: 0, pnl: 0, name: s.assetName || s.symbol };
      byAsset[s.symbol].trades++;
      if (s.status === 'WIN') {
        byAsset[s.symbol].wins++;
        byAsset[s.symbol].pnl += TP_RR_RATIOS[s.tpHit || 1] || 1.5;
      } else {
        byAsset[s.symbol].losses++;
        byAsset[s.symbol].pnl -= 1;
      }
    });
    
    // Stats por día de semana
    const byDayOfWeek = { 0: { trades: 0, pnl: 0 }, 1: { trades: 0, pnl: 0 }, 2: { trades: 0, pnl: 0 }, 3: { trades: 0, pnl: 0 }, 4: { trades: 0, pnl: 0 }, 5: { trades: 0, pnl: 0 }, 6: { trades: 0, pnl: 0 } };
    closedSignals.forEach(s => {
      const day = new Date(s.timestamp).getDay();
      byDayOfWeek[day].trades++;
      if (s.status === 'WIN') {
        byDayOfWeek[day].pnl += TP_RR_RATIOS[s.tpHit || 1] || 1.5;
      } else {
        byDayOfWeek[day].pnl -= 1;
      }
    });
    
    return {
      summary: {
        totalTrades: decidedTrades,
        wins: wins.length,
        losses: losses.length,
        winRate,
        totalPnl: totalPnl.toFixed(2),
        currentCapital: capital.toFixed(2),
        initialCapital: initialCapital,
        roi: totalPnl.toFixed(2),
        bestStreak: localStats.bestStreak || 0,
        worstStreak: localStats.worstStreak || 0,
        currentStreak: 0,
        tp1Hits: localStats.tp1Hits || 0,
        tp2Hits: localStats.tp2Hits || 0,
        tp3Hits: localStats.tp3Hits || 0
      },
      stats: {
        totalTrades: decidedTrades,
        wins: wins.length,
        losses: losses.length,
        breakeven: 0,
        winRate,
        totalPnl: totalPnl.toFixed(2),
        avgPnl: decidedTrades > 0 ? (totalPnl / decidedTrades).toFixed(2) : 0,
        bestTrade: Math.max(...closedSignals.map(s => s.status === 'WIN' ? (TP_RR_RATIOS[s.tpHit || 1] || 1.5) : -1), 0).toFixed(2),
        worstTrade: '-1.00',
        profitFactor: losses.length > 0 ? (wins.length * 1.5 / losses.length).toFixed(2) : wins.length > 0 ? '∞' : 0,
        avgWin: wins.length > 0 ? '1.50' : '0',
        avgLoss: '1.00',
        byModel,
        byAsset,
        byDay: byDayOfWeek
      },
      equityCurve: equityData,
      trades: closedSignals.map(s => ({
        id: s.id,
        symbol: s.symbol,
        asset_name: s.assetName || s.symbol,
        action: s.action,
        model: s.model,
        result: s.status,
        pnl_percent: s.status === 'WIN' ? (TP_RR_RATIOS[s.tpHit || 1] || 1.5) : -1,
        signal_time: s.timestamp
      }))
    };
  }, [localStats, localSignals, initialCapital]);

  // Cargar datos
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setInitialLoadDone(true);
      return;
    }
    
    const fetchData = async () => {
      // Solo mostrar loading en la primera carga
      if (!initialLoadDone) {
        setLoading(true);
      }
      
      try {
        // Obtener resumen
        const summaryRes = await fetch(`${API_URL}/api/reports/summary/${userId}`);
        const summaryData = await summaryRes.json();
        
        // Si hay datos de Supabase, usarlos
        if (summaryData.success && summaryData.summary && summaryData.summary.totalTrades > 0) {
          setSummary(summaryData.summary);
          setUseLocalData(false);

          // Obtener reporte del período
          const reportRes = await fetch(`${API_URL}/api/reports/${userId}?period=${period}`);
          const reportData = await reportRes.json();
          if (reportData.success) {
            setReport(reportData.report);
          }

          // Obtener equity curve
          const equityRes = await fetch(`${API_URL}/api/reports/equity/${userId}?period=${period}`);
          const equityData = await equityRes.json();
          if (equityData.success) {
            setEquityCurve(equityData.equityCurve || []);
          }
        } else {
          // Usar datos locales como fallback
          setUseLocalData(true);
        }
      } catch (error) {
        console.error('Error fetching reports:', error);
        // En caso de error, usar datos locales
        setUseLocalData(true);
      }
      setLoading(false);
      setInitialLoadDone(true);
    };

    fetchData();
  }, [userId, period]); // Removido localData de las dependencias
  
  // Efecto separado para actualizar datos locales cuando cambian
  useEffect(() => {
    if (useLocalData && localData) {
      setSummary(localData.summary);
      setReport({ stats: localData.stats, trades: localData.trades });
      setEquityCurve(localData.equityCurve);
    }
  }, [useLocalData, localStats?.wins, localStats?.losses]); // Solo actualizar cuando cambian wins/losses reales

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/40">Cargando reportes...</p>
        </div>
      </div>
    );
  }

  const stats = report?.stats || {};
  const pnlColor = parseFloat(stats.totalPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400';
  const roiColor = parseFloat(summary?.roi || 0) >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="space-y-4">
      {/* Indicador de fuente de datos */}
      {useLocalData && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center gap-3">
          <span className="text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-amber-400 text-sm font-medium">Datos de sesión actual</p>
            <p className="text-white/40 text-xs">Para reportes persistentes, ejecuta el SQL en Supabase</p>
          </div>
        </div>
      )}
      
      {/* Header con capital simulado EDITABLE */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-purple-500/10 rounded-xl border border-emerald-500/20 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-white/40 text-xs">Capital Simulado</p>
              <button 
                onClick={() => {
                  setTempCapital(initialCapital);
                  setShowCapitalEditor(true);
                }}
                className="text-cyan-400 hover:text-cyan-300 text-xs"
              >
                ✏️ Editar
              </button>
            </div>
            <p className="text-3xl font-bold text-white">
              ${parseFloat(summary?.currentCapital || initialCapital).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-white/40 text-xs">ROI Total</p>
            <p className={`text-2xl font-bold ${roiColor}`}>
              {parseFloat(summary?.roi || 0) >= 0 ? '+' : ''}{summary?.roi || 0}%
            </p>
          </div>
        </div>
        <p className="text-white/40 text-xs">
          Inicio: ${initialCapital.toLocaleString('en-US')} USD (Simulado con 1% de riesgo por operación)
        </p>
        
        {/* Modal para editar capital */}
        {showCapitalEditor && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCapitalEditor(false)}>
            <div className="bg-[#0d0d12] rounded-xl border border-white/10 p-6 w-80" onClick={e => e.stopPropagation()}>
              <h3 className="text-white font-bold mb-4">💰 Capital Inicial</h3>
              <p className="text-white/40 text-xs mb-3">
                Ingresa tu capital inicial para calcular el rendimiento simulado.
              </p>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-white/60">$</span>
                <input
                  type="number"
                  value={tempCapital}
                  onChange={(e) => setTempCapital(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  placeholder="1000"
                  min="100"
                  step="100"
                />
                <span className="text-white/60">USD</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCapitalEditor(false)}
                  className="flex-1 px-4 py-2 bg-white/5 text-white/60 rounded-lg hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveCapital}
                  className="flex-1 px-4 py-2 bg-emerald-500 text-black font-medium rounded-lg hover:bg-emerald-400"
                >
                  Guardar
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[500, 1000, 5000, 10000, 25000].map(amt => (
                  <button
                    key={amt}
                    onClick={() => setTempCapital(amt)}
                    className={`px-2 py-1 text-xs rounded ${tempCapital == amt ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                  >
                    ${amt.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Selector de período */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              period === p.value
                ? 'bg-emerald-500 text-black'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Equity Curve */}
      <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium">📈 Curva de Rendimiento</h3>
          <span className={`text-sm font-bold ${pnlColor}`}>
            {parseFloat(stats.totalPnl || 0) >= 0 ? '+' : ''}{stats.totalPnl || 0}%
          </span>
        </div>
        <LineChart data={equityCurve} height={180} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <p className="text-white/40 text-xs mb-1">Operaciones</p>
          <p className="text-2xl font-bold text-white">{stats.totalTrades || 0}</p>
        </div>
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <p className="text-white/40 text-xs mb-1">Win Rate</p>
          <p className="text-2xl font-bold text-emerald-400">{stats.winRate || 0}%</p>
        </div>
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <p className="text-white/40 text-xs mb-1">Profit Factor</p>
          <p className="text-2xl font-bold text-cyan-400">{stats.profitFactor || 0}</p>
        </div>
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <p className="text-white/40 text-xs mb-1">P&L Período</p>
          <p className={`text-2xl font-bold ${pnlColor}`}>
            {parseFloat(stats.totalPnl || 0) >= 0 ? '+' : ''}{stats.totalPnl || 0}%
          </p>
        </div>
      </div>

      {/* Wins/Losses breakdown */}
      <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-4">
        <h3 className="text-white font-medium mb-4">📊 Distribución</h3>
        <div className="grid grid-cols-3 gap-4 text-center mb-4">
          <div>
            <p className="text-3xl font-bold text-emerald-400">{stats.wins || 0}</p>
            <p className="text-white/40 text-xs">Wins</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-red-400">{stats.losses || 0}</p>
            <p className="text-white/40 text-xs">Losses</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-white/40">{stats.breakeven || 0}</p>
            <p className="text-white/40 text-xs">Breakeven</p>
          </div>
        </div>
        
        {/* Barra visual */}
        <div className="flex h-4 rounded-full overflow-hidden bg-white/5">
          {(stats.wins || 0) > 0 && (
            <div 
              className="bg-emerald-500 transition-all duration-500"
              style={{ width: `${(stats.wins / (stats.totalTrades || 1)) * 100}%` }}
            />
          )}
          {(stats.losses || 0) > 0 && (
            <div 
              className="bg-red-500 transition-all duration-500"
              style={{ width: `${(stats.losses / (stats.totalTrades || 1)) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Rachas */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-4">
          <p className="text-white/40 text-xs mb-1">Mejor Racha</p>
          <p className="text-2xl font-bold text-emerald-400">
            {summary?.bestStreak || 0} <span className="text-sm">wins</span>
          </p>
        </div>
        <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-4">
          <p className="text-white/40 text-xs mb-1">Peor Racha</p>
          <p className="text-2xl font-bold text-red-400">
            {Math.abs(summary?.worstStreak || 0)} <span className="text-sm">losses</span>
          </p>
        </div>
      </div>

      {/* Mejor/Peor Trade */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#0d0d12] rounded-xl border border-emerald-500/20 p-4">
          <p className="text-white/40 text-xs mb-1">🏆 Mejor Trade</p>
          <p className="text-2xl font-bold text-emerald-400">+{stats.bestTrade || 0}%</p>
          <p className="text-white/30 text-xs">Promedio win: +{stats.avgWin || 0}%</p>
        </div>
        <div className="bg-[#0d0d12] rounded-xl border border-red-500/20 p-4">
          <p className="text-white/40 text-xs mb-1">💀 Peor Trade</p>
          <p className="text-2xl font-bold text-red-400">{stats.worstTrade || 0}%</p>
          <p className="text-white/30 text-xs">Promedio loss: -{stats.avgLoss || 0}%</p>
        </div>
      </div>

      {/* Stats por Modelo */}
      {stats.byModel && Object.keys(stats.byModel).length > 0 && (
        <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-4">
          <h3 className="text-white font-medium mb-4">🎯 Por Modelo SMC</h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {Object.entries(stats.byModel)
              .sort((a, b) => b[1].trades - a[1].trades)
              .map(([model, data]) => {
                const winRate = data.trades > 0 ? ((data.wins / data.trades) * 100).toFixed(0) : 0;
                const pnl = parseFloat(data.pnl || 0);
                return (
                  <div key={model} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white/80 text-sm">{model}</span>
                        <span className="text-white/40 text-xs">{data.trades} trades</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${winRate}%` }}
                          />
                        </div>
                        <span className="text-xs text-white/60 w-12">{winRate}% WR</span>
                      </div>
                    </div>
                    <span className={`ml-4 text-sm font-medium ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Stats por Activo */}
      {stats.byAsset && Object.keys(stats.byAsset).length > 0 && (
        <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-4">
          <h3 className="text-white font-medium mb-4">📊 Por Activo</h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {Object.entries(stats.byAsset)
              .sort((a, b) => b[1].trades - a[1].trades)
              .map(([symbol, data]) => {
                const winRate = data.trades > 0 ? ((data.wins / data.trades) * 100).toFixed(0) : 0;
                const pnl = parseFloat(data.pnl || 0);
                return (
                  <div key={symbol} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white/80 text-sm">{data.name || symbol}</span>
                        <span className="text-white/40 text-xs">{data.trades} trades</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-cyan-500 rounded-full"
                            style={{ width: `${winRate}%` }}
                          />
                        </div>
                        <span className="text-xs text-white/60 w-12">{winRate}% WR</span>
                      </div>
                    </div>
                    <span className={`ml-4 text-sm font-medium ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Rendimiento por día de la semana */}
      {stats.byDay && (
        <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-4">
          <h3 className="text-white font-medium mb-4">📅 Por Día de la Semana</h3>
          <div className="grid grid-cols-7 gap-2">
            {DAYS.map((day, i) => {
              const dayData = stats.byDay[i] || { trades: 0, pnl: 0 };
              const pnl = parseFloat(dayData.pnl || 0);
              return (
                <div key={i} className="text-center">
                  <p className="text-white/40 text-xs mb-2">{day}</p>
                  <div className={`py-2 px-1 rounded-lg ${
                    pnl > 0 ? 'bg-emerald-500/20' : pnl < 0 ? 'bg-red-500/20' : 'bg-white/5'
                  }`}>
                    <p className={`text-sm font-bold ${
                      pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-white/40'
                    }`}>
                      {pnl !== 0 ? (pnl > 0 ? '+' : '') + pnl.toFixed(1) : '-'}
                    </p>
                    <p className="text-white/30 text-[10px]">{dayData.trades}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Historial de trades recientes */}
      {report?.trades && report.trades.length > 0 && (
        <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium">📋 Historial de Operaciones</h3>
            <span className="text-white/40 text-xs">{report.trades.length} operaciones</span>
          </div>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {report.trades.map((trade, i) => (
              <div 
                key={trade.id || i}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  trade.result === 'WIN' 
                    ? 'bg-emerald-500/10 border-emerald-500/20' 
                    : trade.result === 'LOSS'
                    ? 'bg-red-500/10 border-red-500/20'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                    trade.action === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'
                  }`}>
                    {trade.action}
                  </span>
                  <div>
                    <p className="text-white text-sm">{trade.asset_name || trade.symbol}</p>
                    <p className="text-white/40 text-xs">{trade.model}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${
                    trade.result === 'WIN' ? 'text-emerald-400' : 
                    trade.result === 'LOSS' ? 'text-red-400' : 'text-white/40'
                  }`}>
                    {parseFloat(trade.pnl_percent || 0) >= 0 ? '+' : ''}{parseFloat(trade.pnl_percent || 0).toFixed(2)}%
                  </p>
                  <p className="text-white/30 text-xs">
                    {new Date(trade.signal_time).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mensaje si no hay datos */}
      {(!report?.trades || report.trades.length === 0) && (
        <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-8 text-center">
          <span className="text-4xl mb-4 block">📊</span>
          <h3 className="text-white font-medium mb-2">Sin operaciones registradas</h3>
          <p className="text-white/40 text-sm">
            Las operaciones que marques como WIN o LOSS se guardarán aquí automáticamente.
          </p>
        </div>
      )}

      {/* Footer info */}
      <div className="text-center text-white/30 text-xs py-4">
        <p>Los resultados son simulados basados en 1% de riesgo por operación.</p>
        <p>Capital inicial: ${initialCapital.toLocaleString('en-US')} USD (personalizable)</p>
      </div>
    </div>
  );
}
