// =============================================
// TRADING MASTER PRO - CONFIGURACIÓN DE PLANES
// Solo operamos: Step Index, Oro (XAU/USD) y Volatility 100
// =============================================

const MY_ASSETS = ['stpRNG', 'frxXAUUSD', '1HZ100V'];

export const PLAN_ASSETS = {
  trial:   MY_ASSETS,
  basic:   MY_ASSETS,
  premium: MY_ASSETS,
  elite:   MY_ASSETS,
};

export const ASSETS_INFO = {
  'stpRNG':    { name: 'Step Index',     shortName: 'Step', emoji: '📊', type: 'synthetic', category: 'sinteticos' },
  'frxXAUUSD': { name: 'Oro (XAU/USD)',  shortName: 'XAU',  emoji: '🥇', type: 'forex',     category: 'commodities' },
  '1HZ100V':   { name: 'Volatility 100', shortName: 'V100', emoji: '🔥', type: 'synthetic', category: 'sinteticos' },
};

export const MODULES = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard',    description: 'Vista general y señales activas',       plans: ['trial','basic','premium','elite'] },
  { id: 'signals',   icon: '📈', label: 'Señales IA',   description: 'Señales de trading en tiempo real',     plans: ['trial','basic','premium','elite'] },
  { id: 'chat',      icon: '🧠', label: 'Chat ELISA',   description: 'Asistente IA de trading',               plans: ['basic','premium','elite'], restricted: { basic: 'Versión básica' } },
  { id: 'stats',     icon: '📊', label: 'Estadísticas', description: 'Métricas y rendimiento',                plans: ['trial','basic','premium','elite'] },
  { id: 'alerts',    icon: '🔔', label: 'Alertas',      description: 'Notificaciones Telegram',               plans: ['premium','elite'] },
  { id: 'settings',  icon: '⚙️', label: 'Configuración',description: 'Ajustes de la cuenta',                  plans: ['trial','basic','premium','elite'] },
  { id: 'billing',   icon: '💳', label: 'Plan & Pagos', description: 'Gestionar suscripción',                 plans: ['trial','basic','premium','elite'] },
];

export const PLAN_LIMITS = {
  trial:   { signals_per_day: 5,   models: ['MTF_CONFLUENCE','CHOCH_PULLBACK'],                                                          timeframes: ['M5'],             telegram: false, elisa_chat: false,      backtesting: false, mentor: false, replay: false },
  basic:   { signals_per_day: 10,  models: ['MTF_CONFLUENCE','CHOCH_PULLBACK','BOS_CONTINUATION'],                                       timeframes: ['M5','H1'],        telegram: false, elisa_chat: 'basic',    backtesting: false, mentor: false, replay: false },
  premium: { signals_per_day: 25,  models: ['MTF_CONFLUENCE','CHOCH_PULLBACK','BOS_CONTINUATION','LIQUIDITY_SWEEP','FVG_ENTRY'],          timeframes: ['M5','H1','H4'],   telegram: true,  elisa_chat: true,       backtesting: true,  mentor: false, replay: false },
  elite:   { signals_per_day: 999, models: ['MTF_CONFLUENCE','CHOCH_PULLBACK','BOS_CONTINUATION','LIQUIDITY_SWEEP','FVG_ENTRY','ORDER_FLOW'], timeframes: ['M5','H1','H4','D1'], telegram: true, elisa_chat: 'advanced', backtesting: true, mentor: true,  replay: true  },
};

export const PLANS_INFO = {
  trial:   { name: 'Trial',   color: 'from-amber-500 to-orange-500',  badge: '🆓', price: 'Gratis' },
  basic:   { name: 'Básico',  color: 'from-slate-500 to-slate-600',   badge: '🥉', price: '$29,900/mes' },
  premium: { name: 'Premium', color: 'from-emerald-500 to-cyan-500',  badge: '🥈', price: '$59,900/mes' },
  elite:   { name: 'Elite',   color: 'from-purple-500 to-pink-500',   badge: '🥇', price: '$99,900/mes' },
};

export const hasModuleAccess = (moduleId, planSlug) => {
  const mod = MODULES.find(m => m.id === moduleId);
  return mod ? mod.plans.includes(planSlug || 'trial') : false;
};

export const hasAssetAccess = (assetSymbol, planSlug) => {
  const planAssets = PLAN_ASSETS[planSlug || 'trial'] || PLAN_ASSETS.trial;
  return planAssets.includes(assetSymbol);
};

export const getRequiredPlan = (moduleId) => {
  const mod = MODULES.find(m => m.id === moduleId);
  return mod ? mod.plans[0] : null;
};
