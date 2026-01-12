-- =============================================
-- TRADING MASTER PRO - TABLAS DE REPORTES v2
-- Schema actualizado para usar email como identificador
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- IMPORTANTE: Primero eliminar las tablas anteriores si existen
DROP TABLE IF EXISTS daily_snapshots CASCADE;
DROP TABLE IF EXISTS user_trading_stats CASCADE;
DROP TABLE IF EXISTS trade_history CASCADE;

-- Tabla principal de historial de operaciones
CREATE TABLE trade_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL, -- Cambiado de UUID a TEXT para usar email
    signal_id TEXT NOT NULL,
    
    -- Información del activo
    symbol TEXT NOT NULL,
    asset_name TEXT NOT NULL,
    
    -- Información de la señal
    action TEXT NOT NULL CHECK (action IN ('LONG', 'SHORT')),
    model TEXT NOT NULL,
    score INTEGER NOT NULL,
    
    -- Niveles de precio
    entry_price DECIMAL(20, 8) NOT NULL,
    stop_loss DECIMAL(20, 8) NOT NULL,
    tp1 DECIMAL(20, 8),
    tp2 DECIMAL(20, 8),
    tp3 DECIMAL(20, 8),
    
    -- Resultado
    result TEXT NOT NULL CHECK (result IN ('WIN', 'LOSS', 'BREAKEVEN', 'PENDING')),
    close_price DECIMAL(20, 8),
    tp_hit INTEGER, -- 1, 2, 3 o NULL si fue LOSS
    
    -- Cálculos de riesgo/beneficio
    risk_amount DECIMAL(20, 8),
    profit_amount DECIMAL(20, 8),
    rr_ratio DECIMAL(10, 4),
    
    -- Simulación de cuenta
    pnl_percent DECIMAL(10, 4),
    pnl_amount DECIMAL(20, 8),
    
    -- Timestamps
    signal_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    close_time TIMESTAMPTZ,
    
    -- Plan del usuario
    user_plan TEXT DEFAULT 'free',
    
    -- Metadata
    reason TEXT,
    timeframe TEXT DEFAULT 'M5',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_trade_history_user_id ON trade_history(user_id);
CREATE INDEX idx_trade_history_signal_time ON trade_history(signal_time DESC);
CREATE INDEX idx_trade_history_result ON trade_history(result);
CREATE INDEX idx_trade_history_symbol ON trade_history(symbol);
CREATE INDEX idx_trade_history_user_date ON trade_history(user_id, signal_time DESC);

-- Tabla de estadísticas acumuladas por usuario
CREATE TABLE user_trading_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE, -- Cambiado de UUID a TEXT
    
    -- Estadísticas totales
    total_trades INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_losses INTEGER DEFAULT 0,
    total_breakeven INTEGER DEFAULT 0,
    
    -- Win rate
    win_rate DECIMAL(5, 2) DEFAULT 0,
    
    -- P&L acumulado
    total_pnl_percent DECIMAL(20, 4) DEFAULT 0,
    best_trade_percent DECIMAL(10, 4) DEFAULT 0,
    worst_trade_percent DECIMAL(10, 4) DEFAULT 0,
    avg_win_percent DECIMAL(10, 4) DEFAULT 0,
    avg_loss_percent DECIMAL(10, 4) DEFAULT 0,
    profit_factor DECIMAL(10, 4) DEFAULT 0,
    
    -- Rachas
    current_streak INTEGER DEFAULT 0,
    best_win_streak INTEGER DEFAULT 0,
    worst_loss_streak INTEGER DEFAULT 0,
    
    -- Estadísticas por modelo (JSON)
    stats_by_model JSONB DEFAULT '{}',
    
    -- Estadísticas por activo (JSON)
    stats_by_asset JSONB DEFAULT '{}',
    
    -- Conteo de TPs
    tp1_hits INTEGER DEFAULT 0,
    tp2_hits INTEGER DEFAULT 0,
    tp3_hits INTEGER DEFAULT 0,
    
    -- Score promedio
    avg_score DECIMAL(5, 2) DEFAULT 0,
    
    -- Capital simulado
    initial_capital DECIMAL(20, 4) DEFAULT 1000,
    current_capital DECIMAL(20, 4) DEFAULT 1000,
    max_capital DECIMAL(20, 4) DEFAULT 1000,
    max_drawdown_percent DECIMAL(10, 4) DEFAULT 0,
    
    -- Timestamps
    first_trade_at TIMESTAMPTZ,
    last_trade_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para user_id en stats
CREATE INDEX idx_user_trading_stats_user_id ON user_trading_stats(user_id);

-- Tabla de snapshots diarios para gráficas
CREATE TABLE daily_snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL, -- Cambiado de UUID a TEXT
    snapshot_date DATE NOT NULL,
    
    -- Estadísticas del día
    trades_count INTEGER DEFAULT 0,
    wins_count INTEGER DEFAULT 0,
    losses_count INTEGER DEFAULT 0,
    daily_pnl_percent DECIMAL(10, 4) DEFAULT 0,
    
    -- Capital al cierre del día
    ending_capital DECIMAL(20, 4),
    cumulative_pnl_percent DECIMAL(20, 4) DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraint único para user_id + fecha
    UNIQUE(user_id, snapshot_date)
);

-- Índices para daily_snapshots
CREATE INDEX idx_daily_snapshots_user_id ON daily_snapshots(user_id);
CREATE INDEX idx_daily_snapshots_date ON daily_snapshots(snapshot_date DESC);
CREATE INDEX idx_daily_snapshots_user_date ON daily_snapshots(user_id, snapshot_date DESC);

-- Función para actualizar el timestamp de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para actualizar updated_at
DROP TRIGGER IF EXISTS update_trade_history_updated_at ON trade_history;
CREATE TRIGGER update_trade_history_updated_at
    BEFORE UPDATE ON trade_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_trading_stats_updated_at ON user_trading_stats;
CREATE TRIGGER update_user_trading_stats_updated_at
    BEFORE UPDATE ON user_trading_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Habilitar RLS (Row Level Security) pero permitir acceso público para la app
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_trading_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso (permitir todo para service_role)
CREATE POLICY "Allow all for service role" ON trade_history FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON user_trading_stats FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON daily_snapshots FOR ALL USING (true);

-- Mensaje de éxito
DO $$
BEGIN
    RAISE NOTICE '✅ Tablas de reportes creadas exitosamente con user_id como TEXT';
    RAISE NOTICE '📊 trade_history - Historial de operaciones';
    RAISE NOTICE '📈 user_trading_stats - Estadísticas por usuario';
    RAISE NOTICE '📅 daily_snapshots - Snapshots diarios';
END $$;
