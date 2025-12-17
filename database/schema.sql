-- =============================================
-- TRADING MASTER PRO - DATABASE SCHEMA
-- Para ejecutar en Supabase SQL Editor
-- =============================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLA: profiles (información del usuario)
-- =============================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    account_balance DECIMAL(15,2) DEFAULT 1000.00,
    account_currency TEXT DEFAULT 'USD',
    risk_percent DECIMAL(5,2) DEFAULT 1.00,
    subscription_plan TEXT DEFAULT 'free' CHECK (subscription_plan IN ('free', 'pro', 'elite', 'institutional')),
    subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'cancelled', 'past_due')),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA: trading_plans (configuración del plan de trading)
-- =============================================
CREATE TABLE trading_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    max_daily_loss DECIMAL(5,2) DEFAULT 3.00,
    max_daily_trades INTEGER DEFAULT 3,
    max_open_trades INTEGER DEFAULT 2,
    min_rr DECIMAL(4,2) DEFAULT 2.00,
    trading_hours_start TIME DEFAULT '08:00',
    trading_hours_end TIME DEFAULT '17:00',
    trading_days TEXT[] DEFAULT ARRAY['MO', 'TU', 'WE', 'TH', 'FR'],
    allowed_assets TEXT[] DEFAULT ARRAY['Step Index', 'EUR/USD', 'GBP/USD', 'XAU/USD'],
    personal_rules TEXT[] DEFAULT ARRAY[
        'Solo opero con tendencia clara',
        'Nunca muevo mi Stop Loss',
        'Si pierdo 2 trades seguidos, paro por hoy'
    ],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- =============================================
-- TABLA: trades (registro de operaciones)
-- =============================================
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    asset TEXT NOT NULL,
    category TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
    entry_price DECIMAL(20,8),
    sl_price DECIMAL(20,8),
    tp1_price DECIMAL(20,8),
    tp2_price DECIMAL(20,8),
    tp3_price DECIMAL(20,8),
    result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'be', 'open')),
    profit DECIMAL(15,2),
    lot_size DECIMAL(10,4),
    rr_ratio DECIMAL(6,2),
    emotion TEXT,
    checklist_score INTEGER,
    notes TEXT,
    images TEXT[],
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA: analyses (historial de análisis SMC)
-- =============================================
CREATE TABLE analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    asset TEXT NOT NULL,
    category TEXT NOT NULL,
    analysis_result TEXT NOT NULL,
    images TEXT[],
    direction_suggested TEXT,
    entry_price_suggested DECIMAL(20,8),
    sl_suggested DECIMAL(20,8),
    tp_suggested DECIMAL(20,8),
    confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
    tokens_used INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA: alerts (alertas de precio)
-- =============================================
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    asset TEXT NOT NULL,
    price DECIMAL(20,8) NOT NULL,
    condition TEXT NOT NULL CHECK (condition IN ('above', 'below')),
    message TEXT,
    triggered BOOLEAN DEFAULT FALSE,
    triggered_at TIMESTAMPTZ,
    notification_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA: emotion_logs (registro de emociones)
-- =============================================
CREATE TABLE emotion_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    emotion TEXT NOT NULL,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA: community_posts (publicaciones de la comunidad)
-- =============================================
CREATE TABLE community_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    asset TEXT,
    direction TEXT CHECK (direction IN ('buy', 'sell', NULL)),
    images TEXT[],
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA: post_likes (likes en publicaciones)
-- =============================================
CREATE TABLE post_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

-- =============================================
-- TABLA: post_comments (comentarios en publicaciones)
-- =============================================
CREATE TABLE post_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA: notifications (notificaciones)
-- =============================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('alert', 'trade', 'community', 'system', 'subscription')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA: api_usage (uso de la API de IA)
-- =============================================
CREATE TABLE api_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,6) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ÍNDICES para mejor rendimiento
-- =============================================
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_created_at ON trades(created_at DESC);
CREATE INDEX idx_trades_result ON trades(result);
CREATE INDEX idx_analyses_user_id ON analyses(user_id);
CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_triggered ON alerts(triggered);
CREATE INDEX idx_community_posts_created_at ON community_posts(created_at DESC);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);

-- =============================================
-- FUNCIONES Y TRIGGERS
-- =============================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trading_plans_updated_at
    BEFORE UPDATE ON trading_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_community_posts_updated_at
    BEFORE UPDATE ON community_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
    
    INSERT INTO trading_plans (user_id)
    VALUES (NEW.id);
    
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Trigger para crear perfil automáticamente
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Función para actualizar contadores de likes
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE community_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE community_posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_likes_count
    AFTER INSERT OR DELETE ON post_likes
    FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();

-- Función para actualizar contadores de comentarios
CREATE OR REPLACE FUNCTION update_post_comments_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE community_posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_comments_count
    AFTER INSERT OR DELETE ON post_comments
    FOR EACH ROW EXECUTE FUNCTION update_post_comments_count();

-- Función para actualizar balance después de cerrar trade
CREATE OR REPLACE FUNCTION update_balance_after_trade()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.result IN ('win', 'loss', 'be') AND OLD.result = 'open' THEN
        UPDATE profiles 
        SET account_balance = account_balance + COALESCE(NEW.profit, 0)
        WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_balance_on_trade_close
    AFTER UPDATE ON trades
    FOR EACH ROW EXECUTE FUNCTION update_balance_after_trade();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE emotion_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Políticas para profiles
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);
    
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Políticas para trading_plans
CREATE POLICY "Users can view own trading plan" ON trading_plans
    FOR SELECT USING (auth.uid() = user_id);
    
CREATE POLICY "Users can update own trading plan" ON trading_plans
    FOR UPDATE USING (auth.uid() = user_id);

-- Políticas para trades
CREATE POLICY "Users can view own trades" ON trades
    FOR SELECT USING (auth.uid() = user_id);
    
CREATE POLICY "Users can insert own trades" ON trades
    FOR INSERT WITH CHECK (auth.uid() = user_id);
    
CREATE POLICY "Users can update own trades" ON trades
    FOR UPDATE USING (auth.uid() = user_id);
    
CREATE POLICY "Users can delete own trades" ON trades
    FOR DELETE USING (auth.uid() = user_id);

-- Políticas para analyses
CREATE POLICY "Users can view own analyses" ON analyses
    FOR SELECT USING (auth.uid() = user_id);
    
CREATE POLICY "Users can insert own analyses" ON analyses
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Políticas para alerts
CREATE POLICY "Users can manage own alerts" ON alerts
    FOR ALL USING (auth.uid() = user_id);

-- Políticas para emotion_logs
CREATE POLICY "Users can manage own emotion logs" ON emotion_logs
    FOR ALL USING (auth.uid() = user_id);

-- Políticas para community_posts (público para leer, propio para escribir)
CREATE POLICY "Anyone can view posts" ON community_posts
    FOR SELECT USING (true);
    
CREATE POLICY "Users can insert own posts" ON community_posts
    FOR INSERT WITH CHECK (auth.uid() = user_id);
    
CREATE POLICY "Users can update own posts" ON community_posts
    FOR UPDATE USING (auth.uid() = user_id);
    
CREATE POLICY "Users can delete own posts" ON community_posts
    FOR DELETE USING (auth.uid() = user_id);

-- Políticas para post_likes
CREATE POLICY "Anyone can view likes" ON post_likes
    FOR SELECT USING (true);
    
CREATE POLICY "Users can manage own likes" ON post_likes
    FOR ALL USING (auth.uid() = user_id);

-- Políticas para post_comments
CREATE POLICY "Anyone can view comments" ON post_comments
    FOR SELECT USING (true);
    
CREATE POLICY "Users can insert own comments" ON post_comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);
    
CREATE POLICY "Users can delete own comments" ON post_comments
    FOR DELETE USING (auth.uid() = user_id);

-- Políticas para notifications
CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);
    
CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- Políticas para api_usage
CREATE POLICY "Users can view own api usage" ON api_usage
    FOR SELECT USING (auth.uid() = user_id);

-- =============================================
-- DATOS INICIALES (Seed Data)
-- =============================================

-- Insertar algunos posts de ejemplo en la comunidad
-- (Se ejecuta solo si la tabla está vacía)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM community_posts LIMIT 1) THEN
        -- Nota: Estos posts no tendrán user_id válido
        -- En producción, crear usuarios de prueba primero
        NULL;
    END IF;
END $$;

-- =============================================
-- VIEWS para estadísticas
-- =============================================

-- Vista de estadísticas por usuario
CREATE OR REPLACE VIEW user_stats AS
SELECT 
    user_id,
    COUNT(*) as total_trades,
    COUNT(*) FILTER (WHERE result = 'win') as wins,
    COUNT(*) FILTER (WHERE result = 'loss') as losses,
    ROUND(COUNT(*) FILTER (WHERE result = 'win')::DECIMAL / NULLIF(COUNT(*), 0) * 100, 2) as win_rate,
    COALESCE(SUM(profit), 0) as total_profit,
    ROUND(AVG(rr_ratio), 2) as avg_rr,
    MAX(created_at) as last_trade_at
FROM trades
WHERE result IN ('win', 'loss')
GROUP BY user_id;

-- Vista de rendimiento diario
CREATE OR REPLACE VIEW daily_performance AS
SELECT 
    user_id,
    DATE(created_at) as trade_date,
    COUNT(*) as trades_count,
    COUNT(*) FILTER (WHERE result = 'win') as wins,
    COUNT(*) FILTER (WHERE result = 'loss') as losses,
    COALESCE(SUM(profit), 0) as daily_pnl
FROM trades
WHERE result IN ('win', 'loss')
GROUP BY user_id, DATE(created_at)
ORDER BY trade_date DESC;

-- =============================================
-- FIN DEL SCHEMA
-- =============================================
