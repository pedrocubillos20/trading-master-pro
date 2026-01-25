-- =============================================
-- TRADING MASTER PRO - MIGRACIÓN DE PIPS v25.0
-- Agregar soporte para pips/ticks por activo
-- =============================================

-- =============================================
-- 1. AGREGAR COLUMNAS A trade_history
-- =============================================
ALTER TABLE trade_history
ADD COLUMN IF NOT EXISTS profit_pips DECIMAL(10,1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS risk_pips DECIMAL(10,1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS asset_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS asset_category VARCHAR(50);

-- Comentarios para documentación
COMMENT ON COLUMN trade_history.profit_pips IS 'Pips de ganancia/pérdida de la operación';
COMMENT ON COLUMN trade_history.risk_pips IS 'Pips en riesgo (distancia al SL)';
COMMENT ON COLUMN trade_history.asset_type IS 'Tipo de activo: synthetic, forex, commodity, crypto';
COMMENT ON COLUMN trade_history.asset_category IS 'Categoría específica: boom, crash, volatility, major, metal, etc';

-- =============================================
-- 2. AGREGAR COLUMNAS A user_trading_stats
-- =============================================
ALTER TABLE user_trading_stats
ADD COLUMN IF NOT EXISTS total_pips DECIMAL(12,1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS best_trade_pips DECIMAL(10,1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS worst_trade_pips DECIMAL(10,1) DEFAULT 0;

COMMENT ON COLUMN user_trading_stats.total_pips IS 'Pips totales acumulados del usuario';
COMMENT ON COLUMN user_trading_stats.best_trade_pips IS 'Mejor operación en pips';
COMMENT ON COLUMN user_trading_stats.worst_trade_pips IS 'Peor operación en pips';

-- =============================================
-- 3. AGREGAR COLUMNAS A daily_snapshots
-- =============================================
ALTER TABLE daily_snapshots
ADD COLUMN IF NOT EXISTS daily_pips DECIMAL(10,1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cumulative_pips DECIMAL(12,1) DEFAULT 0;

COMMENT ON COLUMN daily_snapshots.daily_pips IS 'Pips ganados/perdidos en el día';
COMMENT ON COLUMN daily_snapshots.cumulative_pips IS 'Pips acumulados totales hasta ese día';

-- =============================================
-- 4. CREAR ÍNDICES PARA MEJOR RENDIMIENTO
-- =============================================
CREATE INDEX IF NOT EXISTS idx_trade_history_asset_type ON trade_history(asset_type);
CREATE INDEX IF NOT EXISTS idx_trade_history_asset_category ON trade_history(asset_category);
CREATE INDEX IF NOT EXISTS idx_trade_history_profit_pips ON trade_history(profit_pips);

-- =============================================
-- 5. FUNCIÓN PARA RECALCULAR PIPS HISTÓRICOS
-- Ejecutar después de la migración si hay datos existentes
-- =============================================
-- Esta función es opcional, solo si necesitas recalcular trades antiguos
-- Requerirá la configuración de pips por activo desde el backend

-- =============================================
-- 6. VISTAS ÚTILES PARA REPORTES
-- =============================================

-- Vista de rendimiento por activo con pips
CREATE OR REPLACE VIEW v_performance_by_asset AS
SELECT 
    user_id,
    symbol,
    asset_name,
    asset_type,
    asset_category,
    COUNT(*) as total_trades,
    SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
    ROUND(AVG(CASE WHEN result IN ('WIN', 'LOSS') THEN 
        CASE WHEN result = 'WIN' THEN 1.0 ELSE 0.0 END 
    END) * 100, 2) as win_rate,
    SUM(pnl_percent) as total_pnl,
    SUM(profit_pips) as total_pips,
    AVG(profit_pips) as avg_pips_per_trade
FROM trade_history
GROUP BY user_id, symbol, asset_name, asset_type, asset_category;

-- Vista de rendimiento por modelo con pips
CREATE OR REPLACE VIEW v_performance_by_model AS
SELECT 
    user_id,
    model,
    COUNT(*) as total_trades,
    SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
    ROUND(AVG(CASE WHEN result IN ('WIN', 'LOSS') THEN 
        CASE WHEN result = 'WIN' THEN 1.0 ELSE 0.0 END 
    END) * 100, 2) as win_rate,
    SUM(pnl_percent) as total_pnl,
    SUM(profit_pips) as total_pips,
    AVG(profit_pips) as avg_pips_per_trade
FROM trade_history
GROUP BY user_id, model;

-- Vista de rendimiento diario con pips
CREATE OR REPLACE VIEW v_daily_performance AS
SELECT 
    user_id,
    DATE(signal_time) as trade_date,
    COUNT(*) as trades,
    SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
    SUM(pnl_percent) as daily_pnl,
    SUM(profit_pips) as daily_pips
FROM trade_history
GROUP BY user_id, DATE(signal_time)
ORDER BY trade_date DESC;

-- =============================================
-- 7. PERMISOS (si usas RLS)
-- =============================================
-- Asegurar que las nuevas columnas tienen los permisos correctos
-- Ya deberían heredar los permisos de la tabla

-- =============================================
-- NOTAS DE LA MIGRACIÓN:
-- =============================================
-- 1. Esta migración es segura para ejecutar múltiples veces (IF NOT EXISTS)
-- 2. Los valores default son 0 para no afectar registros existentes
-- 3. Las vistas se recrean con CREATE OR REPLACE
-- 4. Después de ejecutar, reiniciar el backend para usar las nuevas funciones
-- =============================================
