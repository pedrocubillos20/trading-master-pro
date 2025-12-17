// =============================================
// GLOBAL STATE STORE - Zustand
// =============================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { auth, db } from '../services/supabase'
import api from '../services/api'

// ============ AUTH STORE ============
export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      tradingPlan: null,
      isLoading: true,
      isAuthenticated: false,

      // Inicializar autenticación
      initialize: async () => {
        try {
          const { session } = await auth.getSession()
          if (session?.user) {
            const { data: profile } = await db.getProfile(session.user.id)
            const { data: tradingPlan } = await db.getTradingPlan(session.user.id)
            set({
              user: session.user,
              profile,
              tradingPlan,
              isAuthenticated: true,
              isLoading: false,
            })
          } else {
            set({ isLoading: false })
          }
        } catch (error) {
          console.error('Error initializing auth:', error)
          set({ isLoading: false })
        }
      },

      // Login
      signIn: async (email, password) => {
        const { data, error } = await auth.signIn(email, password)
        if (error) throw error
        
        const { data: profile } = await db.getProfile(data.user.id)
        const { data: tradingPlan } = await db.getTradingPlan(data.user.id)
        
        set({
          user: data.user,
          profile,
          tradingPlan,
          isAuthenticated: true,
        })
        return data
      },

      // Registro
      signUp: async (email, password, fullName) => {
        const { data, error } = await auth.signUp(email, password, fullName)
        if (error) throw error
        return data
      },

      // Logout
      signOut: async () => {
        await auth.signOut()
        set({
          user: null,
          profile: null,
          tradingPlan: null,
          isAuthenticated: false,
        })
      },

      // Actualizar perfil
      updateProfile: async (updates) => {
        const userId = get().user?.id
        if (!userId) return

        const { data } = await db.updateProfile(userId, updates)
        set({ profile: data })
        return data
      },

      // Actualizar plan de trading
      updateTradingPlan: async (updates) => {
        const userId = get().user?.id
        if (!userId) return

        const { data } = await db.updateTradingPlan(userId, updates)
        set({ tradingPlan: data })
        return data
      },

      // Refrescar datos
      refresh: async () => {
        const userId = get().user?.id
        if (!userId) return

        const { data: profile } = await db.getProfile(userId)
        const { data: tradingPlan } = await db.getTradingPlan(userId)
        set({ profile, tradingPlan })
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

// ============ TRADING STORE ============
export const useTradingStore = create((set, get) => ({
  // Estado
  selectedAsset: { name: 'Step Index', pip: 0.1, type: 'step' },
  selectedCategory: 'Sintéticos Deriv',
  tradeDirection: 'buy',
  entryPrice: '',
  slPrice: '',
  tp1Price: '',
  tp2Price: '',
  tp3Price: '',
  
  // Análisis
  images: [],
  analysis: null,
  isAnalyzing: false,
  analysisHistory: [],

  // Psicotrading
  currentEmotion: null,
  checklist: {},

  // Setters
  setAsset: (asset) => set({ selectedAsset: asset }),
  setCategory: (category) => set({ selectedCategory: category }),
  setDirection: (direction) => set({ tradeDirection: direction }),
  setEntry: (price) => set({ entryPrice: price }),
  setSL: (price) => set({ slPrice: price }),
  setTP1: (price) => set({ tp1Price: price }),
  setTP2: (price) => set({ tp2Price: price }),
  setTP3: (price) => set({ tp3Price: price }),
  setImages: (images) => set({ images }),
  addImage: (image) => set((state) => ({ 
    images: [...state.images, image].slice(0, 4) 
  })),
  removeImage: (index) => set((state) => ({
    images: state.images.filter((_, i) => i !== index)
  })),
  clearImages: () => set({ images: [], analysis: null }),
  setEmotion: (emotion) => set({ currentEmotion: emotion }),
  toggleChecklist: (id) => set((state) => ({
    checklist: { ...state.checklist, [id]: !state.checklist[id] }
  })),
  resetChecklist: () => set({ checklist: {}, currentEmotion: null }),

  // Analizar con IA
  analyze: async () => {
    const { images, selectedAsset, selectedCategory } = get()
    if (images.length === 0) return

    set({ isAnalyzing: true, analysis: null })

    try {
      const result = await api.analysis.analyze(
        images.map(img => ({ data: img.data, type: img.type })),
        selectedAsset.name,
        selectedCategory
      )
      
      set({ 
        analysis: result,
        analysisHistory: [result, ...get().analysisHistory].slice(0, 50)
      })
      
      return result
    } catch (error) {
      console.error('Analysis error:', error)
      throw error
    } finally {
      set({ isAnalyzing: false })
    }
  },

  // Calcular posición
  calculatePosition: () => {
    const { entryPrice, slPrice, selectedAsset } = get()
    const profile = useAuthStore.getState().profile

    if (!entryPrice || !slPrice || !profile) {
      return { lotSize: 0, riskUSD: 0, pipDiff: 0 }
    }

    const entry = parseFloat(entryPrice)
    const sl = parseFloat(slPrice)
    const riskUSD = profile.account_balance * (profile.risk_percent / 100)
    const pipDiff = Math.abs(entry - sl)
    const pipValue = selectedAsset.pip

    let lotSize = 0
    if (pipDiff > 0) {
      const pipsRisk = pipDiff / pipValue
      lotSize = riskUSD / (pipsRisk * 10)
    }

    return {
      lotSize: Math.max(0.01, lotSize).toFixed(2),
      riskUSD: riskUSD.toFixed(2),
      pipDiff: (pipDiff / pipValue).toFixed(1),
    }
  },

  // Calcular R:R
  calculateRR: (tp) => {
    const { entryPrice, slPrice } = get()
    if (!entryPrice || !slPrice || !tp) return '0'

    const entry = parseFloat(entryPrice)
    const sl = parseFloat(slPrice)
    const target = parseFloat(tp)
    const risk = Math.abs(entry - sl)
    const reward = Math.abs(target - entry)

    if (risk === 0) return '0'
    return (reward / risk).toFixed(2)
  },

  // Verificar si puede operar
  canTrade: () => {
    const { currentEmotion, checklist } = get()
    const tradingPlan = useAuthStore.getState().tradingPlan
    const profile = useAuthStore.getState().profile

    const EMOTIONS_RISK = {
      calm: 'low', focused: 'low', confident: 'low',
      neutral: 'medium', anxious: 'medium', tired: 'medium',
      excited: 'medium', bored: 'medium',
      frustrated: 'high', revenge: 'high', fomo: 'high', greedy: 'high',
    }

    const emotionOk = currentEmotion && EMOTIONS_RISK[currentEmotion] === 'low'
    const checklistCount = Object.values(checklist).filter(Boolean).length
    const checklistOk = checklistCount >= 10

    // Verificar horario
    const now = new Date()
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    const inTradingHours = tradingPlan 
      ? currentTime >= tradingPlan.trading_hours_start && currentTime <= tradingPlan.trading_hours_end
      : true

    return {
      canTrade: emotionOk && checklistOk && inTradingHours,
      emotionOk,
      checklistOk,
      checklistCount,
      inTradingHours,
    }
  },
}))

// ============ TRADES STORE ============
export const useTradesStore = create((set, get) => ({
  trades: [],
  stats: null,
  isLoading: false,

  // Cargar trades
  fetchTrades: async (options = {}) => {
    set({ isLoading: true })
    try {
      const result = await api.trades.getAll(options)
      set({ trades: result.trades })
      return result
    } finally {
      set({ isLoading: false })
    }
  },

  // Cargar estadísticas
  fetchStats: async () => {
    try {
      const stats = await api.stats.getAll()
      set({ stats })
      return stats
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  },

  // Crear trade
  createTrade: async (tradeData) => {
    const trade = await api.trades.create(tradeData)
    set((state) => ({ trades: [trade.trade, ...state.trades] }))
    
    // Refrescar perfil para actualizar balance
    await useAuthStore.getState().refresh()
    
    return trade
  },

  // Actualizar trade
  updateTrade: async (id, updates) => {
    const result = await api.trades.update(id, updates)
    set((state) => ({
      trades: state.trades.map(t => t.id === id ? result.trade : t)
    }))
    return result
  },

  // Eliminar trade
  deleteTrade: async (id) => {
    await api.trades.delete(id)
    set((state) => ({
      trades: state.trades.filter(t => t.id !== id)
    }))
  },
}))

// ============ ALERTS STORE ============
export const useAlertsStore = create((set, get) => ({
  alerts: [],
  isLoading: false,

  fetchAlerts: async () => {
    set({ isLoading: true })
    try {
      const result = await api.alerts.getAll()
      set({ alerts: result.alerts })
    } finally {
      set({ isLoading: false })
    }
  },

  createAlert: async (alertData) => {
    const result = await api.alerts.create(alertData)
    set((state) => ({ alerts: [result.alert, ...state.alerts] }))
    return result
  },

  deleteAlert: async (id) => {
    await api.alerts.delete(id)
    set((state) => ({
      alerts: state.alerts.filter(a => a.id !== id)
    }))
  },
}))

// ============ NOTIFICATIONS STORE ============
export const useNotificationsStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,

  fetchNotifications: async () => {
    try {
      const result = await api.notifications.getAll()
      const notifications = result.notifications || []
      set({ 
        notifications,
        unreadCount: notifications.filter(n => !n.read).length
      })
    } catch (error) {
      console.error('Error fetching notifications:', error)
    }
  },

  markAsRead: async (ids) => {
    await api.notifications.markRead(ids)
    set((state) => ({
      notifications: state.notifications.map(n => 
        ids.includes(n.id) ? { ...n, read: true } : n
      ),
      unreadCount: state.notifications.filter(n => !n.read && !ids.includes(n.id)).length
    }))
  },

  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1
    }))
  },
}))

// ============ UI STORE ============
export const useUIStore = create(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      activeTab: 'dashboard',
      theme: 'dark',

      toggleSidebar: () => set((state) => ({ 
        sidebarCollapsed: !state.sidebarCollapsed 
      })),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'ui-storage',
    }
  )
)
