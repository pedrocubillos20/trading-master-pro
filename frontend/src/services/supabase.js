// =============================================
// TRADING MASTER PRO - SUPABASE CLIENT
// =============================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Some features may not work.')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  }
)

// =============================================
// AUTH HELPERS
// =============================================

export const auth = {
  // Obtener sesión actual
  getSession: async () => {
    const { data, error } = await supabase.auth.getSession()
    return { session: data.session, error }
  },

  // Obtener usuario actual
  getUser: async () => {
    const { data, error } = await supabase.auth.getUser()
    return { user: data.user, error }
  },

  // Registro
  signUp: async (email, password, metadata = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata }
    })
    return { data, error }
  },

  // Login
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    return { data, error }
  },

  // Logout
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  // Reset password
  resetPassword: async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email)
    return { data, error }
  },

  // Actualizar password
  updatePassword: async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    })
    return { data, error }
  }
}

// =============================================
// DATABASE HELPERS
// =============================================

export const db = {
  // Profiles
  profiles: {
    get: async (userId) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      return { data, error }
    },
    update: async (userId, updates) => {
      const { data, error } = await supabase
        .from('profiles')
        .upsert({ id: userId, ...updates, updated_at: new Date().toISOString() })
        .select()
        .single()
      return { data, error }
    }
  },

  // Trades
  trades: {
    getAll: async (userId) => {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      return { data, error }
    },
    create: async (trade) => {
      const { data, error } = await supabase
        .from('trades')
        .insert(trade)
        .select()
        .single()
      return { data, error }
    },
    update: async (id, updates) => {
      const { data, error } = await supabase
        .from('trades')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      return { data, error }
    },
    delete: async (id) => {
      const { error } = await supabase
        .from('trades')
        .delete()
        .eq('id', id)
      return { error }
    }
  },

  // Analyses
  analyses: {
    getAll: async (userId, limit = 50) => {
      const { data, error } = await supabase
        .from('analyses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
      return { data, error }
    },
    create: async (analysis) => {
      const { data, error } = await supabase
        .from('analyses')
        .insert(analysis)
        .select()
        .single()
      return { data, error }
    }
  },

  // Alerts
  alerts: {
    getAll: async (userId) => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      return { data, error }
    },
    create: async (alert) => {
      const { data, error } = await supabase
        .from('alerts')
        .insert(alert)
        .select()
        .single()
      return { data, error }
    },
    delete: async (id) => {
      const { error } = await supabase
        .from('alerts')
        .delete()
        .eq('id', id)
      return { error }
    }
  },

  // Trading Plans
  tradingPlans: {
    get: async (userId) => {
      const { data, error } = await supabase
        .from('trading_plans')
        .select('*')
        .eq('user_id', userId)
        .single()
      return { data, error }
    },
    update: async (userId, updates) => {
      const { data, error } = await supabase
        .from('trading_plans')
        .upsert({ user_id: userId, ...updates, updated_at: new Date().toISOString() })
        .select()
        .single()
      return { data, error }
    }
  }
}

// =============================================
// API CLIENT
// =============================================

const API_URL = import.meta.env.VITE_API_URL || ''

export const api = {
  // Obtener token de autenticación
  getAuthToken: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  },

  // Análisis SMC
  analyze: async (formData) => {
    const token = await api.getAuthToken()
    
    const response = await fetch(`${API_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Error en el análisis')
    }

    return response.json()
  },

  // Análisis con JSON (imágenes en base64)
  analyzeJson: async (data) => {
    const token = await api.getAuthToken()
    
    const response = await fetch(`${API_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Error en el análisis')
    }

    return response.json()
  },

  // Análisis rápido (1 imagen)
  analyzeQuick: async (imageData, asset, timeframe) => {
    const token = await api.getAuthToken()
    
    const response = await fetch(`${API_URL}/api/analyze-quick`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ image: imageData, asset, timeframe })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Error en el análisis')
    }

    return response.json()
  },

  // Stats
  getStats: async () => {
    const token = await api.getAuthToken()
    
    const response = await fetch(`${API_URL}/api/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error('Error obteniendo estadísticas')
    }

    return response.json()
  },

  // Health check
  health: async () => {
    const response = await fetch(`${API_URL}/health`)
    return response.json()
  }
}

export default supabase
