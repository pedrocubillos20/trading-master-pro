-- =============================================
-- TRADING MASTER PRO - PUSH NOTIFICATIONS SCHEMA
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- Tabla para guardar suscripciones push
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  device_type TEXT DEFAULT 'unknown', -- 'mobile', 'desktop', 'tablet'
  notifications_enabled BOOLEAN DEFAULT true,
  
  -- Configuración de notificaciones por usuario
  notify_all_signals BOOLEAN DEFAULT true,
  notify_high_score_only BOOLEAN DEFAULT false, -- Solo score >= 80
  min_score_threshold INTEGER DEFAULT 70,
  quiet_hours_start TIME DEFAULT NULL, -- Ej: '22:00'
  quiet_hours_end TIME DEFAULT NULL,   -- Ej: '08:00'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_notification_at TIMESTAMPTZ
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_enabled ON push_subscriptions(notifications_enabled);

-- Tabla para historial de notificaciones enviadas
CREATE TABLE IF NOT EXISTS notification_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  signal_id TEXT,
  notification_type TEXT DEFAULT 'signal', -- 'signal', 'alert', 'system', 'promo'
  title TEXT NOT NULL,
  body TEXT,
  data JSONB,
  status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'clicked', 'failed'
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  clicked_at TIMESTAMPTZ
);

-- Índices para historial
CREATE INDEX IF NOT EXISTS idx_notification_history_user_id ON notification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_sent_at ON notification_history(sent_at);

-- Tabla para conteo diario de notificaciones por usuario
CREATE TABLE IF NOT EXISTS daily_notification_counts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  count INTEGER DEFAULT 0,
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_notification_counts_user_date ON daily_notification_counts(user_id, date);

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_push_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_push_subscriptions_timestamp ON push_subscriptions;
CREATE TRIGGER update_push_subscriptions_timestamp
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_push_subscription_timestamp();

-- Función para incrementar conteo diario
CREATE OR REPLACE FUNCTION increment_notification_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  current_count INTEGER;
BEGIN
  INSERT INTO daily_notification_counts (user_id, date, count)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, date) 
  DO UPDATE SET count = daily_notification_counts.count + 1
  RETURNING count INTO current_count;
  
  RETURN current_count;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener conteo diario
CREATE OR REPLACE FUNCTION get_daily_notification_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  current_count INTEGER;
BEGIN
  SELECT count INTO current_count
  FROM daily_notification_counts
  WHERE user_id = p_user_id AND date = CURRENT_DATE;
  
  RETURN COALESCE(current_count, 0);
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_notification_counts ENABLE ROW LEVEL SECURITY;

-- Políticas para push_subscriptions
CREATE POLICY "Users can view own subscriptions" ON push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscriptions" ON push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions" ON push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own subscriptions" ON push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- Políticas para notification_history
CREATE POLICY "Users can view own notifications" ON notification_history
  FOR SELECT USING (auth.uid() = user_id);

-- Políticas para daily_notification_counts
CREATE POLICY "Users can view own counts" ON daily_notification_counts
  FOR SELECT USING (auth.uid() = user_id);

-- Service role puede hacer todo (para el backend)
CREATE POLICY "Service role full access subscriptions" ON push_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access history" ON notification_history
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access counts" ON daily_notification_counts
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- DATOS DE EJEMPLO (opcional)
-- =============================================
-- INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, device_type)
-- VALUES ('user-uuid-here', 'https://fcm.googleapis.com/...', 'key...', 'auth...', 'mobile');
