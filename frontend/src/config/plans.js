export const PLANS = {
  free: {
    name: 'Free Trial',
    price: 0,
    color: '#7d8590',
    features: ['3 activos (Step, Oro, V100)', 'Señales M5 en tiempo real', 'Horario diurno (6AM-2PM COL)', 'ELISA IA básica']
  },
  basico: {
    name: 'Básico',
    price: 29900,
    color: '#3fb950',
    features: ['Todo lo del Free', 'Stats avanzadas', 'Historial completo', 'Push notifications']
  },
  premium: {
    name: 'Premium',
    price: 59900,
    color: '#378ADD',
    features: ['Todo lo del Básico', 'Horario nocturno (8:30PM-1AM)', 'Multi-timeframe M1/M15/H1', 'ELISA IA Pro', 'Telegram alerts']
  },
  elite: {
    name: 'Elite',
    price: 99900,
    color: '#00d4aa',
    features: ['Todo lo del Premium', 'Boom & Crash 500/1000/300', 'Sistema de aprendizaje IA', 'Admin dashboard', 'Soporte prioritario']
  }
}

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
