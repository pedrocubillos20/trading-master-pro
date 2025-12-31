// =============================================
// TRADING MASTER PRO - CONFIGURACIÓN DE PLANES
// =============================================

// Activos disponibles por plan
export const PLAN_ASSETS = {
  trial: ['stpRNG', 'frxXAUUSD'],
  basic: ['stpRNG', 'frxXAUUSD', '1HZ75V'],
  premium: ['stpRNG', 'frxXAUUSD', '1HZ75V', 'frxGBPUSD', 'cryBTCUSD'],
  elite: [
    'stpRNG', 'frxXAUUSD', '1HZ75V', 'frxGBPUSD', 'cryBTCUSD',
    'BOOM500', 'BOOM1000', 'CRASH500', 'CRASH1000'
  ]
};

// Información de activos
export const ASSETS_INFO = {
  'stpRNG': { name: 'Step Index', shortName: 'Step', emoji: '📊', type: 'synthetic' },
  'frxXAUUSD': { name: 'Oro (XAU/USD)', shortName: 'XAU', emoji: '🥇', type: 'forex' },
  '1HZ75V': { name: 'Volatility 75', shortName: 'V75', emoji: '📈', type: 'synthetic' },
  'frxGBPUSD': { name: 'GBP/USD', shortName: 'GBP', emoji: '💷', type: 'forex' },
  'cryBTCUSD': { name: 'Bitcoin', shortName: 'BTC', emoji: '₿', type: 'crypto' },
  'BOOM500': { name: 'Boom 500', shortName: 'B500', emoji: '🚀', type: 'synthetic' },
  'BOOM1000': { name: 'Boom 1000', shortName: 'B1K', emoji: '🚀', type: 'synthetic' },
  'CRASH500': { name: 'Crash 500', shortName: 'C500', emoji: '💥', type: 'synthetic' },
  'CRASH1000': { name: 'Crash 1000', shortName: 'C1K', emoji: '💥', type: 'synthetic' }
};

// Módulos y permisos por plan
export const MODULES = [
  {
    id: 'dashboard',
    icon: '📊',
    label: 'Dashboard',
    description: 'Vista general y señales activas',
    plans: ['trial', 'basic', 'premium', 'elite']
  },
  {
    id: 'signals',
    icon: '📈',
    label: 'Señales IA',
    description: 'Señales de trading en tiempo real',
    plans: ['trial', 'basic', 'premium', 'elite']
  },
  {
    id: 'chat',
    icon: '🧠',
    label: 'Chat ELISA',
    description: 'Asistente IA de trading',
    plans: ['basic', 'premium', 'elite'],
    restricted: { basic: 'Versión básica' }
  },
  {
    id: 'stats',
    icon: '📊',
    label: 'Estadísticas',
    description: 'Métricas y rendimiento',
    plans: ['trial', 'basic', 'premium', 'elite']
  },
  {
    id: 'alerts',
    icon: '🔔',
    label: 'Alertas',
    description: 'Notificaciones Telegram',
    plans: ['premium', 'elite']
  },
  {
    id: 'backtesting',
    icon: '🧪',
    label: 'Backtesting',
    description: 'Prueba estrategias históricas',
    plans: ['premium', 'elite'],
    comingSoon: true
  },
  {
    id: 'mentor',
    icon: '🎓',
    label: 'Mentor IA',
    description: 'Coaching personalizado',
    plans: ['elite'],
    comingSoon: true
  },
  {
    id: 'replay',
    icon: '🔁',
    label: 'Replay',
    description: 'Reproduce sesiones pasadas',
    plans: ['elite'],
    comingSoon: true
  },
  {
    id: 'ambassador',
    icon: '🏆',
    label: 'Embajador',
    description: 'Programa de referidos',
    plans: ['elite'],
    comingSoon: true
  },
  {
    id: 'settings',
    icon: '⚙️',
    label: 'Configuración',
    description: 'Ajustes de la cuenta',
    plans: ['trial', 'basic', 'premium', 'elite']
  },
  {
    id: 'billing',
    icon: '💳',
    label: 'Plan & Pagos',
    description: 'Gestionar suscripción',
    plans: ['trial', 'basic', 'premium', 'elite']
  }
];

// Límites por plan
export const PLAN_LIMITS = {
  trial: {
    signals_per_day: 5,
    models: ['MTF_CONFLUENCE', 'CHOCH_PULLBACK'],
    timeframes: ['M5'],
    telegram: false,
    elisa_chat: false,
    backtesting: false,
    mentor: false,
    replay: false
  },
  basic: {
    signals_per_day: 10,
    models: ['MTF_CONFLUENCE', 'CHOCH_PULLBACK', 'BOS_CONTINUATION'],
    timeframes: ['M5', 'H1'],
    telegram: false,
    elisa_chat: 'basic',
    backtesting: false,
    mentor: false,
    replay: false
  },
  premium: {
    signals_per_day: 25,
    models: ['MTF_CONFLUENCE', 'CHOCH_PULLBACK', 'BOS_CONTINUATION', 'LIQUIDITY_SWEEP', 'FVG_ENTRY'],
    timeframes: ['M5', 'H1', 'H4'],
    telegram: true,
    elisa_chat: true,
    backtesting: true,
    mentor: false,
    replay: false
  },
  elite: {
    signals_per_day: 999,
    models: ['MTF_CONFLUENCE', 'CHOCH_PULLBACK', 'BOS_CONTINUATION', 'LIQUIDITY_SWEEP', 'FVG_ENTRY', 'ORDER_FLOW'],
    timeframes: ['M5', 'H1', 'H4', 'D1'],
    telegram: true,
    elisa_chat: 'advanced',
    backtesting: true,
    mentor: true,
    replay: true
  }
};

// Información de planes para mostrar
export const PLANS_INFO = {
  trial: {
    name: 'Trial',
    color: 'from-amber-500 to-orange-500',
    badge: '🆓',
    price: 'Gratis'
  },
  basic: {
    name: 'Básico',
    color: 'from-slate-500 to-slate-600',
    badge: '🥉',
    price: '$29,900/mes'
  },
  premium: {
    name: 'Premium',
    color: 'from-emerald-500 to-cyan-500',
    badge: '🥈',
    price: '$59,900/mes'
  },
  elite: {
    name: 'Elite',
    color: 'from-purple-500 to-pink-500',
    badge: '🥇',
    price: '$99,900/mes'
  }
};

// Helper: verificar si un módulo está disponible
export const hasModuleAccess = (moduleId, planSlug) => {
  const module = MODULES.find(m => m.id === moduleId);
  if (!module) return false;
  return module.plans.includes(planSlug || 'trial');
};

// Helper: verificar si un activo está disponible
export const hasAssetAccess = (assetSymbol, planSlug) => {
  const planAssets = PLAN_ASSETS[planSlug || 'trial'] || PLAN_ASSETS.trial;
  return planAssets.includes(assetSymbol);
};

// Helper: obtener plan requerido para un módulo
export const getRequiredPlan = (moduleId) => {
  const module = MODULES.find(m => m.id === moduleId);
  if (!module) return null;
  
  const planOrder = ['trial', 'basic', 'premium', 'elite'];
  return module.plans[0]; // El primer plan que tiene acceso
};
