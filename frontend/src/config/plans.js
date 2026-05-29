export const PLANS = {
  free: {
    name: 'Free Trial',
    price: 0,
    color: '#7d8590',
    features: ['3 activos (Step, Oro, V100)', 'Gráfico en tiempo real', 'IA Institucional SMC']
  },
  basico: {
    name: 'Básico',
    price: 29900,
    color: '#3fb950',
    features: ['Todo lo del Free', 'Análisis IA ilimitados', 'Soporte básico']
  },
  premium: {
    name: 'Premium',
    price: 59900,
    color: '#378ADD',
    features: ['Todo lo del Básico', 'Multi-timeframe M1/M15/H1', 'Análisis con sesgo macro']
  },
  elite: {
    name: 'Elite',
    price: 99900,
    color: '#00d4aa',
    features: ['Todo lo del Premium', 'Admin dashboard', 'Soporte prioritario']
  }
}

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
