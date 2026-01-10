-- =============================================
-- TRADING MASTER PRO - TABLAS DE REPORTES
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- Tabla principal de historial de operaciones
CREATE TABLE IF NOT EXISTS trade_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
    risk_amount DECIMAL(20, 8), -- Distancia entry -> SL
    profit_amount DECIMAL(20, 8), -- Distancia entry -> close
    rr_ratio DECIMAL(10, 4), -- Risk:Reward obtenido
    
    -- Simulación de cuenta (basado en 1% de riesgo)
    pnl_percent DECIMAL(10, 4), -- % ganado/perdido
    pnl_amount DECIMAL(20, 8), -- Monto simulado (basado en capital)
    
    -- Timestamps
    signal_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    close_time TIMESTAMPTZ,
    
    -- Plan del usuario al momento de la operación
    user_plan TEXT DEFAULT 'free',
    
    -- Metadata adicional
    reason TEXT, -- Razón del modelo SMC
    timeframe TEXT DEFAULT 'M5',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_trade_history_user_id ON trade_history(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_history_signal_time ON trade_history(signal_time DESC);
CREATE INDEX IF NOT EXISTS idx_trade_history_result ON trade_history(result);
CREATE INDEX IF NOT EXISTS idx_trade_history_symbol ON trade_history(symbol);
CREATE INDEX IF NOT EXISTS idx_trade_history_user_date ON trade_history(user_id, signal_time DESC);

-- Tabla de estadísticas acumuladas por usuario (para consultas rápidas)
CREATE TABLE IF NOT EXISTS user_trading_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    
    -- Estadísticas totales
    total_trades INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_losses INTEGER DEFAULT 0,
    total_breakeven INTEGER DEFAULT 0,
    
    -- Win rate
    win_rate DECIMAL(5, 2) DEFAULT 0,
    
    -- P&L acumulado (simulado)
    total_pnl_percent DECIMAL(20, 4) DEFAULT 0,
    best_trade_percent DECIMAL(10, 4) DEFAULT 0,
    worst_trade_percent DECIMAL(10, 4) DEFAULT 0,
    
    -- Racha
    current_streak INTEGER DEFAULT 0, -- Positivo = wins, negativo = losses
    best_win_streak INTEGER DEFAULT 0,
    worst_loss_streak INTEGER DEFAULT 0,
    
    -- Por modelo
    stats_by_model JSONB DEFAULT '{}',
    
    -- Por activo
    stats_by_asset JSONB DEFAULT '{}',
    
    -- Períodos
    stats_today JSONB DEFAULT '{}',
    stats_week JSONB DEFAULT '{}',
    stats_month JSONB DEFAULT '{}',
    stats_year JSONB DEFAULT '{}',
    
    -- Capital simulado inicial
    initial_capital DECIMAL(20, 2) DEFAULT 1000,
    current_capital DECIMAL(20, 2) DEFAULT 1000,
    
    -- Timestamps
    first_trade_at TIMESTAMPTZ,
    last_trade_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para user_trading_stats
CREATE INDEX IF NOT EXISTS idx_user_trading_stats_user_id ON user_trading_stats(user_id);

-- Tabla de snapshots diarios (para gráficas históricas)
CREATE TABLE IF NOT EXISTS daily_snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    
    -- Estadísticas del día
    trades_count INTEGER DEFAULT 0,
    wins_count INTEGER DEFAULT 0,
    losses_count INTEGER DEFAULT 0,
    
    -- P&L del día
    daily_pnl_percent DECIMAL(10, 4) DEFAULT 0,
    
    -- Capital al final del día
    ending_capital DECIMAL(20, 2),
    
    -- Acumulados hasta ese día
    cumulative_pnl_percent DECIMAL(20, 4) DEFAULT 0,
    cumulative_win_rate DECIMAL(5, 2) DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, snapshot_date)
);

-- Índices para daily_snapshots
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_user_date ON daily_snapshots(user_id, snapshot_date DESC);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
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

-- RLS (Row Level Security) - Los usuarios solo ven sus propios datos
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_trading_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad
DROP POLICY IF EXISTS "Users can view own trades" ON trade_history;
CREATE POLICY "Users can view own trades" ON trade_history
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own trades" ON trade_history;
CREATE POLICY "Users can insert own trades" ON trade_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own trades" ON trade_history;
CREATE POLICY "Users can update own trades" ON trade_history
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own stats" ON user_trading_stats;
CREATE POLICY "Users can view own stats" ON user_trading_stats
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own stats" ON user_trading_stats;
CREATE POLICY "Users can insert own stats" ON user_trading_stats
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own stats" ON user_trading_stats;
CREATE POLICY "Users can update own stats" ON user_trading_stats
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own snapshots" ON daily_snapshots;
CREATE POLICY "Users can view own snapshots" ON daily_snapshots
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own snapshots" ON daily_snapshots;
CREATE POLICY "Users can insert own snapshots" ON daily_snapshots
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- También permitir acceso con service_role key (para el backend)
DROP POLICY IF EXISTS "Service role full access trades" ON trade_history;
CREATE POLICY "Service role full access trades" ON trade_history
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access stats" ON user_trading_stats;
CREATE POLICY "Service role full access stats" ON user_trading_stats
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access snapshots" ON daily_snapshots;
CREATE POLICY "Service role full access snapshots" ON daily_snapshots
    FOR ALL USING (true) WITH CHECK (true);

-- Vista para obtener reportes rápidos
CREATE OR REPLACE VIEW user_report_summary AS
SELECT 
    u.user_id,
    u.total_trades,
    u.total_wins,
    u.total_losses,
    u.win_rate,
    u.total_pnl_percent,
    u.current_capital,
    u.initial_capital,
    ((u.current_capital - u.initial_capital) / u.initial_capital * 100) as roi_percent,
    u.best_win_streak,
    u.worst_loss_streak,
    u.first_trade_at,
    u.last_trade_at,
    u.stats_by_model,
    u.stats_by_asset
FROM user_trading_stats u;

-- Función para calcular P&L basado en resultado
-- WIN TP1 = +1.5R, WIN TP2 = +2.5R, WIN TP3 = +3.5R, LOSS = -1R
CREATE OR REPLACE FUNCTION calculate_trade_pnl(
    p_result TEXT,
    p_tp_hit INTEGER,
    p_risk_percent DECIMAL DEFAULT 1.0
) RETURNS DECIMAL AS $$
BEGIN
    IF p_result = 'LOSS' THEN
        RETURN -p_risk_percent;
    ELSIF p_result = 'BREAKEVEN' THEN
        RETURN 0;
    ELSIF p_result = 'WIN' THEN
        CASE p_tp_hit
            WHEN 1 THEN RETURN p_risk_percent * 1.5;
            WHEN 2 THEN RETURN p_risk_percent * 2.5;
            WHEN 3 THEN RETURN p_risk_percent * 3.5;
            ELSE RETURN p_risk_percent * 1.5; -- Default TP1
        END CASE;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- NOTAS DE USO:
-- =============================================
-- 
-- 1. Ejecutar este script en Supabase SQL Editor
-- 2. El backend usará service_role key para insertar/actualizar
-- 3. El frontend usa el token del usuario para leer sus propios datos
-- 
-- Ejemplo de inserción desde backend:
-- INSERT INTO trade_history (user_id, signal_id, symbol, ...) VALUES (...)
-- 
-- Ejemplo de consulta de reportes:
-- SELECT * FROM trade_history WHERE user_id = ? AND signal_time >= ? ORDER BY signal_time DESC
--
-- =============================================
