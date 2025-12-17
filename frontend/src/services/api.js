// =============================================
// API SERVICE - Conexión con el Backend
// =============================================

import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Helper para obtener el token de autenticación
const getAuthToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
}

// Helper para hacer peticiones autenticadas
const fetchWithAuth = async (endpoint, options = {}) => {
  const token = await getAuthToken()
  
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  }

  const response = await fetch(`${API_URL}${endpoint}`, config)
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Error de red' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }
  
  return response.json()
}

// ============ API DE ANÁLISIS ============
export const analysisAPI = {
  // Analizar gráficos con IA
  analyze: async (images, asset, category) => {
    return fetchWithAuth('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ images, asset, category }),
    })
  },

  // Obtener historial de análisis
  getHistory: async (limit = 20) => {
    return fetchWithAuth(`/api/analyses?limit=${limit}`)
  },
}

// ============ API DE TRADES ============
export const tradesAPI = {
  // Obtener todos los trades
  getAll: async (options = {}) => {
    const params = new URLSearchParams()
    if (options.limit) params.append('limit', options.limit)
    if (options.offset) params.append('offset', options.offset)
    if (options.result) params.append('result', options.result)
    
    return fetchWithAuth(`/api/trades?${params}`)
  },

  // Crear nuevo trade
  create: async (trade) => {
    return fetchWithAuth('/api/trades', {
      method: 'POST',
      body: JSON.stringify(trade),
    })
  },

  // Actualizar trade
  update: async (id, updates) => {
    return fetchWithAuth(`/api/trades/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  },

  // Eliminar trade
  delete: async (id) => {
    return fetchWithAuth(`/api/trades/${id}`, {
      method: 'DELETE',
    })
  },
}

// ============ API DE ESTADÍSTICAS ============
export const statsAPI = {
  // Obtener todas las estadísticas
  getAll: async () => {
    return fetchWithAuth('/api/stats')
  },
}

// ============ API DE ALERTAS ============
export const alertsAPI = {
  // Obtener todas las alertas
  getAll: async () => {
    return fetchWithAuth('/api/alerts')
  },

  // Crear nueva alerta
  create: async (alert) => {
    return fetchWithAuth('/api/alerts', {
      method: 'POST',
      body: JSON.stringify(alert),
    })
  },

  // Eliminar alerta
  delete: async (id) => {
    return fetchWithAuth(`/api/alerts/${id}`, {
      method: 'DELETE',
    })
  },
}

// ============ API DE COMUNIDAD ============
export const communityAPI = {
  // Obtener posts
  getPosts: async (limit = 20, offset = 0) => {
    return fetchWithAuth(`/api/community/posts?limit=${limit}&offset=${offset}`)
  },

  // Crear post
  createPost: async (post) => {
    return fetchWithAuth('/api/community/posts', {
      method: 'POST',
      body: JSON.stringify(post),
    })
  },

  // Like/Unlike post
  toggleLike: async (postId) => {
    return fetchWithAuth(`/api/community/posts/${postId}/like`, {
      method: 'POST',
    })
  },
}

// ============ API DE PERFIL ============
export const profileAPI = {
  // Obtener perfil completo
  get: async () => {
    return fetchWithAuth('/api/profile')
  },

  // Actualizar perfil
  update: async (profile, tradingPlan) => {
    return fetchWithAuth('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ profile, trading_plan: tradingPlan }),
    })
  },
}

// ============ API DE NOTIFICACIONES ============
export const notificationsAPI = {
  // Obtener notificaciones
  getAll: async () => {
    return fetchWithAuth('/api/notifications')
  },

  // Marcar como leídas
  markRead: async (ids) => {
    return fetchWithAuth('/api/notifications/read', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    })
  },
}

// ============ API DE STRIPE (PAGOS) ============
export const stripeAPI = {
  // Crear sesión de checkout
  createCheckout: async (priceId, planId) => {
    return fetchWithAuth('/api/stripe/create-checkout', {
      method: 'POST',
      body: JSON.stringify({ priceId, planId }),
    })
  },

  // Obtener URL del portal de facturación
  getPortalUrl: async () => {
    return fetchWithAuth('/api/stripe/portal', {
      method: 'POST',
    })
  },
}

// ============ EXPORT ALL ============
export default {
  analysis: analysisAPI,
  trades: tradesAPI,
  stats: statsAPI,
  alerts: alertsAPI,
  community: communityAPI,
  profile: profileAPI,
  notifications: notificationsAPI,
  stripe: stripeAPI,
}
