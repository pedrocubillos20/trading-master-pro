// =============================================
// SUPABASE CLIENT - Frontend
// =============================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

// ============ AUTH HELPERS ============
export const auth = {
  // Registrar nuevo usuario
  signUp: async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })
    return { data, error }
  },

  // Iniciar sesión
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  },

  // Iniciar sesión con Google
  signInWithGoogle: async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    return { data, error }
  },

  // Cerrar sesión
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  // Obtener sesión actual
  getSession: async () => {
    const { data: { session }, error } = await supabase.auth.getSession()
    return { session, error }
  },

  // Obtener usuario actual
  getUser: async () => {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  },

  // Restablecer contraseña
  resetPassword: async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    return { data, error }
  },

  // Actualizar contraseña
  updatePassword: async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    })
    return { data, error }
  },

  // Escuchar cambios de autenticación
  onAuthStateChange: (callback) => {
    return supabase.auth.onAuthStateChange(callback)
  },
}

// ============ DATABASE HELPERS ============
export const db = {
  // Profiles
  getProfile: async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    return { data, error }
  },

  updateProfile: async (userId, updates) => {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()
    return { data, error }
  },

  // Trading Plan
  getTradingPlan: async (userId) => {
    const { data, error } = await supabase
      .from('trading_plans')
      .select('*')
      .eq('user_id', userId)
      .single()
    return { data, error }
  },

  updateTradingPlan: async (userId, updates) => {
    const { data, error } = await supabase
      .from('trading_plans')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single()
    return { data, error }
  },

  // Trades
  getTrades: async (userId, options = {}) => {
    let query = supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (options.limit) query = query.limit(options.limit)
    if (options.result) query = query.eq('result', options.result)

    const { data, error } = await query
    return { data, error }
  },

  createTrade: async (trade) => {
    const { data, error } = await supabase
      .from('trades')
      .insert(trade)
      .select()
      .single()
    return { data, error }
  },

  updateTrade: async (tradeId, updates) => {
    const { data, error } = await supabase
      .from('trades')
      .update(updates)
      .eq('id', tradeId)
      .select()
      .single()
    return { data, error }
  },

  deleteTrade: async (tradeId) => {
    const { error } = await supabase
      .from('trades')
      .delete()
      .eq('id', tradeId)
    return { error }
  },

  // Analyses
  getAnalyses: async (userId, limit = 20) => {
    const { data, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    return { data, error }
  },

  // Alerts
  getAlerts: async (userId) => {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    return { data, error }
  },

  createAlert: async (alert) => {
    const { data, error } = await supabase
      .from('alerts')
      .insert(alert)
      .select()
      .single()
    return { data, error }
  },

  deleteAlert: async (alertId) => {
    const { error } = await supabase
      .from('alerts')
      .delete()
      .eq('id', alertId)
    return { error }
  },

  // Notifications
  getNotifications: async (userId) => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    return { data, error }
  },

  markNotificationsRead: async (ids) => {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', ids)
    return { error }
  },

  // Community
  getPosts: async (limit = 20, offset = 0) => {
    const { data, error } = await supabase
      .from('community_posts')
      .select(`
        *,
        profiles:user_id (full_name, avatar_url, subscription_plan)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    return { data, error }
  },

  createPost: async (post) => {
    const { data, error } = await supabase
      .from('community_posts')
      .insert(post)
      .select()
      .single()
    return { data, error }
  },

  likePost: async (postId, userId) => {
    // Verificar si ya existe el like
    const { data: existing } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .single()

    if (existing) {
      // Quitar like
      await supabase.from('post_likes').delete().eq('id', existing.id)
      return { liked: false }
    } else {
      // Dar like
      await supabase.from('post_likes').insert({ post_id: postId, user_id: userId })
      return { liked: true }
    }
  },

  // Stats Views
  getUserStats: async (userId) => {
    const { data, error } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single()
    return { data, error }
  },

  getDailyPerformance: async (userId, days = 30) => {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    const { data, error } = await supabase
      .from('daily_performance')
      .select('*')
      .eq('user_id', userId)
      .gte('trade_date', startDate)
      .order('trade_date', { ascending: true })
    return { data, error }
  },
}

// ============ STORAGE HELPERS ============
export const storage = {
  // Subir imagen
  uploadImage: async (bucket, path, file) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })
    return { data, error }
  },

  // Obtener URL pública
  getPublicUrl: (bucket, path) => {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  },

  // Eliminar archivo
  deleteFile: async (bucket, path) => {
    const { error } = await supabase.storage.from(bucket).remove([path])
    return { error }
  },
}

export default supabase
