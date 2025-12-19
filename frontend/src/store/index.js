// =============================================
// TRADING MASTER PRO - ZUSTAND STORES
// =============================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../services/supabase'

// =============================================
// AUTH STORE - Manejo de autenticación
// =============================================
export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      session: null,
      loading: true,
      initialized: false,

      // Inicializar auth
      initialize: async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          
          if (session) {
            set({ 
              user: session.user, 
              session,
              loading: false,
              initialized: true
            })
            
            // Cargar perfil
            await get().fetchProfile()
          } else {
            set({ loading: false, initialized: true })
          }

          // Escuchar cambios de auth
          supabase.auth.onAuthStateChange(async (event, session) => {
            if (session) {
              set({ user: session.user, session })
              await get().fetchProfile()
            } else {
              set({ user: null, profile: null, session: null })
            }
          })
        } catch (error) {
          console.error('Error initializing auth:', error)
          set({ loading: false, initialized: true })
        }
      },

      // Obtener perfil del usuario
      fetchProfile: async () => {
        const { user } = get()
        if (!user) return

        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single()

          if (error && error.code !== 'PGRST116') throw error
          
          set({ profile: data || { id: user.id, email: user.email } })
        } catch (error) {
          console.error('Error fetching profile:', error)
        }
      },

      // Registrar usuario
      signUp: async (email, password, fullName) => {
        set({ loading: true })
        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: fullName }
            }
          })

          if (error) throw error

          set({ loading: false })
          return { success: true, data }
        } catch (error) {
          set({ loading: false })
          return { success: false, error: error.message }
        }
      },

      // Iniciar sesión
      signIn: async (email, password) => {
        set({ loading: true })
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
          })

          if (error) throw error

          set({ 
            user: data.user, 
            session: data.session,
            loading: false 
          })
          
          await get().fetchProfile()
          return { success: true }
        } catch (error) {
          set({ loading: false })
          return { success: false, error: error.message }
        }
      },

      // Cerrar sesión
      signOut: async () => {
        try {
          await supabase.auth.signOut()
          set({ user: null, profile: null, session: null })
        } catch (error) {
          console.error('Error signing out:', error)
        }
      },

      // Actualizar perfil
      updateProfile: async (updates) => {
        const { user } = get()
        if (!user) return { success: false, error: 'No user' }

        try {
          const { data, error } = await supabase
            .from('profiles')
            .upsert({ id: user.id, ...updates, updated_at: new Date().toISOString() })
            .select()
            .single()

          if (error) throw error

          set({ profile: data })
          return { success: true, data }
        } catch (error) {
          return { success: false, error: error.message }
        }
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, profile: state.profile })
    }
  )
)

// =============================================
// UI STORE - Estado de la interfaz
// =============================================
export const useUIStore = create(
  persist(
    (set) => ({
      activeTab: 'dashboard',
      sidebarCollapsed: false,
      theme: 'dark',

      setActiveTab: (tab) => set({ activeTab: tab }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setTheme: (theme) => set({ theme })
    }),
    {
      name: 'ui-storage'
    }
  )
)

// =============================================
// TRADING STORE - Datos de trading
// =============================================
export const useTradingStore = create(
  persist(
    (set, get) => ({
      trades: [],
      analyses: [],
      balance: 1000,
      riskPercent: 1,
      currentEmotion: null,
      checklist: {},

      // Trades
      addTrade: (trade) => {
        const newTrade = {
          id: Date.now(),
          ...trade,
          createdAt: new Date().toISOString()
        }
        set((state) => ({
          trades: [newTrade, ...state.trades],
          balance: state.balance + (trade.profit || 0)
        }))
      },

      updateTrade: (id, updates) => {
        set((state) => ({
          trades: state.trades.map(t => t.id === id ? { ...t, ...updates } : t)
        }))
      },

      deleteTrade: (id) => {
        set((state) => ({
          trades: state.trades.filter(t => t.id !== id)
        }))
      },

      // Análisis
      addAnalysis: (analysis) => {
        set((state) => ({
          analyses: [{ id: Date.now(), ...analysis, createdAt: new Date().toISOString() }, ...state.analyses]
        }))
      },

      // Balance
      setBalance: (balance) => set({ balance }),
      
      // Riesgo
      setRiskPercent: (riskPercent) => set({ riskPercent }),

      // Emoción
      setCurrentEmotion: (emotion) => set({ currentEmotion: emotion }),

      // Checklist
      toggleChecklistItem: (item) => {
        set((state) => ({
          checklist: { ...state.checklist, [item]: !state.checklist[item] }
        }))
      },

      resetChecklist: () => set({ checklist: {} }),

      // Estadísticas
      getStats: () => {
        const { trades } = get()
        const closedTrades = trades.filter(t => t.result && t.result !== 'open')
        const wins = closedTrades.filter(t => t.result === 'win').length
        const losses = closedTrades.filter(t => t.result === 'loss').length
        
        return {
          totalTrades: trades.length,
          wins,
          losses,
          breakeven: closedTrades.filter(t => t.result === 'be').length,
          winRate: (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 0,
          totalProfit: closedTrades.reduce((sum, t) => sum + (t.profit || 0), 0).toFixed(2)
        }
      },

      // Limpiar todo
      clearAllData: () => set({
        trades: [],
        analyses: [],
        balance: 1000,
        checklist: {},
        currentEmotion: null
      })
    }),
    {
      name: 'trading-storage'
    }
  )
)

// =============================================
// ANALYSIS STORE - Estado del análisis actual
// =============================================
export const useAnalysisStore = create((set) => ({
  images: { H1: null, M15: null, M5: null, M1: null },
  selectedAsset: 'EUR/USD',
  selectedCategory: 'Forex Majors',
  isAnalyzing: false,
  currentAnalysis: null,
  analysisHistory: [],

  setImage: (timeframe, imageData) => {
    set((state) => ({
      images: { ...state.images, [timeframe]: imageData }
    }))
  },

  removeImage: (timeframe) => {
    set((state) => ({
      images: { ...state.images, [timeframe]: null }
    }))
  },

  clearAllImages: () => {
    set({ images: { H1: null, M15: null, M5: null, M1: null } })
  },

  setSelectedAsset: (asset) => set({ selectedAsset: asset }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setIsAnalyzing: (value) => set({ isAnalyzing: value }),
  
  setCurrentAnalysis: (analysis) => {
    set((state) => ({
      currentAnalysis: analysis,
      analysisHistory: analysis 
        ? [{ ...analysis, timestamp: new Date().toISOString() }, ...state.analysisHistory.slice(0, 49)]
        : state.currentAnalysis
    }))
  },

  clearAnalysis: () => set({ currentAnalysis: null })
}))
