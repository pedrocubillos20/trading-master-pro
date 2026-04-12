-- =============================================
-- SET ADMIN TO ELITE PLAN
-- Run this in Supabase SQL Editor
-- =============================================

-- Update admin user to Elite plan (full access)
UPDATE subscriptions 
SET 
  plan = 'elite',
  plan_name = 'Elite',
  estado = 'activo',
  periodo = 'mensual',
  subscription_ends_at = NOW() + INTERVAL '10 years',
  trial_ends_at = NOW() + INTERVAL '10 years',
  assets = ARRAY[
    'stpRNG', 'R_75', '1HZ100V', 'JD75',
    'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY',
    'frxXAUUSD', 'frxXAGUSD',
    'cryBTCUSD', 'cryETHUSD',
    'BOOM1000', 'BOOM500', 'BOOM300N',
    'CRASH1000', 'CRASH500', 'CRASH300N'
  ],
  updated_at = NOW()
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'admin@tradingpro.com' LIMIT 1
);

-- If no subscription exists, insert one
INSERT INTO subscriptions (
  user_id, plan, plan_name, estado, periodo,
  subscription_ends_at, trial_ends_at, assets
)
SELECT 
  id,
  'elite',
  'Elite',
  'activo',
  'mensual',
  NOW() + INTERVAL '10 years',
  NOW() + INTERVAL '10 years',
  ARRAY[
    'stpRNG', 'R_75', '1HZ100V', 'JD75',
    'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY',
    'frxXAUUSD', 'frxXAGUSD',
    'cryBTCUSD', 'cryETHUSD',
    'BOOM1000', 'BOOM500', 'BOOM300N',
    'CRASH1000', 'CRASH500', 'CRASH300N'
  ]
FROM auth.users 
WHERE email = 'admin@tradingpro.com'
  AND id NOT IN (SELECT user_id FROM subscriptions)
LIMIT 1;

-- Verify
SELECT u.email, s.plan, s.estado, s.subscription_ends_at
FROM auth.users u
JOIN subscriptions s ON s.user_id = u.id
WHERE u.email = 'admin@tradingpro.com';
