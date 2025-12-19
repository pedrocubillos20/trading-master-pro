// =============================================
// TRADING MASTER PRO - DASHBOARD v2.0
// Análisis SMC Multi-Timeframe Visual
// =============================================

import { useState, useEffect } from 'react'
import { useAuthStore, useUIStore } from '../store'
import toast from 'react-hot-toast'

// =============================================
// ICONOS SVG
// =============================================
const Icons = {
  Dashboard: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  Chart: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  Calculator: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
  Brain: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
  Book: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
  Settings: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Logout: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  Menu: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  Upload: () => <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>,
  X: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  Check: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
  AlertTriangle: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
  TrendingUp: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
  TrendingDown: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>,
  Clock: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Target: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  Copy: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
}

// =============================================
// CONSTANTES
// =============================================
const TIMEFRAMES = [
  { id: 'H1', label: 'H1 (1 Hora)', description: 'Contexto y tendencia principal' },
  { id: 'M15', label: '15M (15 Min)', description: 'Zonas de interés y Order Blocks' },
  { id: 'M5', label: '5M (5 Min)', description: 'Refinamiento de entrada' },
  { id: 'M1', label: '1M (1 Min)', description: 'Entrada precisa (sniper)' },
]

const ASSETS = {
  'Sintéticos Deriv': [
    'Volatility 10 Index', 'Volatility 25 Index', 'Volatility 50 Index',
    'Volatility 75 Index', 'Volatility 100 Index', 'Step Index',
    'Boom 500', 'Boom 1000', 'Crash 500', 'Crash 1000',
    'Range Break 100', 'Range Break 200', 'Jump 10', 'Jump 25',
    'Jump 50', 'Jump 75', 'Jump 100'
  ],
  'Forex Majors': [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD'
  ],
  'Forex Minors': [
    'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'EUR/AUD', 'GBP/AUD', 'AUD/JPY'
  ],
  'Metales': ['XAU/USD (Oro)', 'XAG/USD (Plata)'],
  'Índices': ['US30', 'US100', 'US500', 'GER40', 'UK100'],
  'Crypto': ['BTC/USD', 'ETH/USD', 'LTC/USD', 'XRP/USD']
}

const EMOTIONS = [
  { id: 'focused', emoji: '🎯', label: 'Enfocado', color: 'green', canTrade: true },
  { id: 'calm', emoji: '😌', label: 'Tranquilo', color: 'green', canTrade: true },
  { id: 'confident', emoji: '💪', label: 'Confiado', color: 'green', canTrade: true },
  { id: 'neutral', emoji: '😐', label: 'Neutral', color: 'yellow', canTrade: true },
  { id: 'anxious', emoji: '😰', label: 'Ansioso', color: 'orange', canTrade: false },
  { id: 'tired', emoji: '😴', label: 'Cansado', color: 'orange', canTrade: false },
  { id: 'frustrated', emoji: '😤', label: 'Frustrado', color: 'red', canTrade: false },
  { id: 'fomo', emoji: '😱', label: 'FOMO', color: 'red', canTrade: false },
  { id: 'revenge', emoji: '🔥', label: 'Venganza', color: 'red', canTrade: false },
]

// =============================================
// COMPONENTE PRINCIPAL
// =============================================
export default function Dashboard() {
  const { profile, signOut } = useAuthStore()
  const { activeTab, setActiveTab, sidebarCollapsed, toggleSidebar } = useUIStore()
  
  // Estados generales
  const [trades, setTrades] = useState([])
  const [balance, setBalance] = useState(profile?.account_balance || 1000)
  
  // Estados para análisis SMC
  const [images, setImages] = useState({ H1: null, M15: null, M5: null, M1: null })
  const [selectedAsset, setSelectedAsset] = useState('EUR/USD')
  const [selectedCategory, setSelectedCategory] = useState('Forex Majors')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  
  // Estados para calculadora
  const [entryPrice, setEntryPrice] = useState('')
  const [slPrice, setSlPrice] = useState('')
  const [tpPrice, setTpPrice] = useState('')
  const [riskPercent, setRiskPercent] = useState(1)
  
  // Estados para psicotrading
  const [currentEmotion, setCurrentEmotion] = useState(null)
  const [checklist, setChecklist] = useState({})

  // Cargar trades del localStorage
  useEffect(() => {
    const saved = localStorage.getItem('trades')
    if (saved) setTrades(JSON.parse(saved))
    const savedBalance = localStorage.getItem('balance')
    if (savedBalance) setBalance(parseFloat(savedBalance))
  }, [])

  // Guardar trades
  useEffect(() => {
    localStorage.setItem('trades', JSON.stringify(trades))
  }, [trades])

  useEffect(() => {
    localStorage.setItem('balance', balance.toString())
  }, [balance])

  // Calcular estadísticas
  const stats = {
    totalTrades: trades.length,
    wins: trades.filter(t => t.result === 'win').length,
    losses: trades.filter(t => t.result === 'loss').length,
    winRate: trades.length > 0 
      ? ((trades.filter(t => t.result === 'win').length / trades.filter(t => t.result !== 'be').length) * 100).toFixed(1)
      : 0,
    totalProfit: trades.reduce((sum, t) => sum + (t.profit || 0), 0).toFixed(2),
  }

  // =============================================
  // FUNCIONES DE ANÁLISIS
  // =============================================
  
  const handleImageUpload = (timeframe, e) => {
    const file = e.target.files[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      setImages(prev => ({
        ...prev,
        [timeframe]: {
          file,
          preview: e.target.result,
          data: e.target.result.split(',')[1]
        }
      }))
    }
    reader.readAsDataURL(file)
  }

  const removeImage = (timeframe) => {
    setImages(prev => ({ ...prev, [timeframe]: null }))
  }

  const getUploadedCount = () => {
    return Object.values(images).filter(img => img !== null).length
  }

  const analyzeCharts = async () => {
    const uploadedImages = Object.entries(images)
      .filter(([_, img]) => img !== null)
      .map(([tf, img]) => img.data)

    if (uploadedImages.length < 4) {
      toast.error(`Sube las 4 imágenes (H1, 15M, 5M, 1M) para un análisis completo`)
      return
    }

    setIsAnalyzing(true)
    setAnalysis(null)

    try {
      // Obtener token de Supabase
      const token = localStorage.getItem('supabase.auth.token')
      let authToken = ''
      
      if (token) {
        try {
          const parsed = JSON.parse(token)
          authToken = parsed?.currentSession?.access_token || ''
        } catch {
          authToken = ''
        }
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          asset: selectedAsset,
          images: uploadedImages,
          accountBalance: balance,
          riskPercent: riskPercent
        })
      })

      if (!response.ok) {
        throw new Error('Error en el análisis')
      }

      const data = await response.json()
      setAnalysis(data.analysis)
      toast.success('¡Análisis completado!')
      
      // Auto-llenar calculadora si hay datos
      if (data.analysis?.setup_de_entrada) {
        const setup = data.analysis.setup_de_entrada
        if (setup.precio_entrada) setEntryPrice(setup.precio_entrada)
        if (setup.stop_loss) setSlPrice(setup.stop_loss)
        if (setup.take_profit_1) setTpPrice(setup.take_profit_1)
      }

    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al analizar. Verifica tu conexión.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Función para copiar al portapapeles
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado al portapapeles')
  }

  // Calcular posición
  const calculatePosition = () => {
    if (!entryPrice || !slPrice) return { lotSize: 0, riskUSD: 0 }
    const entry = parseFloat(entryPrice)
    const sl = parseFloat(slPrice)
    const riskUSD = balance * (riskPercent / 100)
    const pipValue = selectedAsset.includes('JPY') ? 0.01 : 0.0001
    const pipDiff = Math.abs(entry - sl) / pipValue
    const lotSize = pipDiff > 0 ? (riskUSD / (pipDiff * 10)) : 0
    return {
      lotSize: Math.max(0.01, lotSize).toFixed(2),
      riskUSD: riskUSD.toFixed(2),
      pipDiff: pipDiff.toFixed(1),
    }
  }

  // Calcular R:R
  const calculateRR = () => {
    if (!entryPrice || !slPrice || !tpPrice) return '0'
    const entry = parseFloat(entryPrice)
    const sl = parseFloat(slPrice)
    const tp = parseFloat(tpPrice)
    const risk = Math.abs(entry - sl)
    const reward = Math.abs(tp - entry)
    return risk > 0 ? (reward / risk).toFixed(2) : '0'
  }

  // Registrar trade
  const addTrade = (result) => {
    const profit = result === 'win' ? parseFloat(calculatePosition().riskUSD) * parseFloat(calculateRR()) 
                 : result === 'loss' ? -parseFloat(calculatePosition().riskUSD) 
                 : 0
    const newTrade = {
      id: Date.now(),
      asset: selectedAsset,
      result,
      profit,
      emotion: currentEmotion,
      rr: calculateRR(),
      date: new Date().toISOString(),
    }
    setTrades(prev => [newTrade, ...prev])
    setBalance(prev => prev + profit)
    toast.success(result === 'win' ? '✅ Trade ganador' : result === 'loss' ? '❌ Trade perdedor' : '➖ Break Even')
  }

  // Navegación
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Dashboard },
    { id: 'analysis', label: 'Análisis SMC', icon: Icons.Chart },
    { id: 'calculator', label: 'Calculadora', icon: Icons.Calculator },
    { id: 'psycho', label: 'Psicotrading', icon: Icons.Brain },
    { id: 'journal', label: 'Diario', icon: Icons.Book },
    { id: 'settings', label: 'Ajustes', icon: Icons.Settings },
  ]

  // =============================================
  // RENDER
  // =============================================
  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-screen bg-zinc-900 border-r border-zinc-800 flex flex-col transition-all duration-300 z-50 ${sidebarCollapsed ? 'w-[70px]' : 'w-[260px]'}`}>
        <div className="p-4 border-b border-zinc-800">
          <h1 className={`font-bold text-white ${sidebarCollapsed ? 'text-center text-sm' : 'text-xl'}`}>
            {sidebarCollapsed ? '📊' : '📊 Trading Master Pro'}
          </h1>
        </div>
        <nav className="flex-1 py-4">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 transition-all ${
                activeTab === item.id 
                  ? 'bg-green-500/10 text-green-500 border-r-2 border-green-500' 
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <item.icon />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-zinc-800">
          {!sidebarCollapsed && (
            <p className="text-sm text-zinc-400 mb-2 truncate">{profile?.email}</p>
          )}
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-lg"
          >
            <Icons.Logout />
            {!sidebarCollapsed && <span>Salir</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'ml-[70px]' : 'ml-[260px]'}`}>
        {/* Header */}
        <header className="sticky top-0 z-40 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={toggleSidebar} className="text-zinc-400 hover:text-white">
                <Icons.Menu />
              </button>
              <h2 className="text-xl font-semibold text-white">
                {navItems.find(n => n.id === activeTab)?.label}
              </h2>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">Balance:</span>
                <span className={`font-bold ${balance >= 1000 ? 'text-green-500' : 'text-red-500'}`}>
                  ${balance.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">Win Rate:</span>
                <span className="font-bold text-white">{stats.winRate}%</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          
          {/* ==================== DASHBOARD TAB ==================== */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <p className="text-zinc-400 text-sm">Balance</p>
                  <p className={`text-2xl font-bold ${balance >= 1000 ? 'text-green-500' : 'text-red-500'}`}>
                    ${balance.toFixed(2)}
                  </p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <p className="text-zinc-400 text-sm">Win Rate</p>
                  <p className="text-2xl font-bold text-white">{stats.winRate}%</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <p className="text-zinc-400 text-sm">Total Trades</p>
                  <p className="text-2xl font-bold text-white">{stats.totalTrades}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <p className="text-zinc-400 text-sm">Profit Total</p>
                  <p className={`text-2xl font-bold ${parseFloat(stats.totalProfit) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ${stats.totalProfit}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">📈 Rendimiento</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Ganados</span>
                      <span className="text-green-500 font-bold">{stats.wins}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Perdidos</span>
                      <span className="text-red-500 font-bold">{stats.losses}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Break Even</span>
                      <span className="text-zinc-300 font-bold">{trades.filter(t => t.result === 'be').length}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">📋 Últimos Trades</h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {trades.slice(0, 5).map(trade => (
                      <div key={trade.id} className="flex justify-between items-center p-2 bg-zinc-800/50 rounded-lg">
                        <span className="text-zinc-300">{trade.asset}</span>
                        <span className={trade.result === 'win' ? 'text-green-500' : trade.result === 'loss' ? 'text-red-500' : 'text-zinc-400'}>
                          {trade.result === 'win' ? '+' : ''}{trade.profit?.toFixed(2) || 0}
                        </span>
                      </div>
                    ))}
                    {trades.length === 0 && (
                      <p className="text-zinc-500 text-center py-4">No hay trades registrados</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== ANÁLISIS SMC TAB ==================== */}
          {activeTab === 'analysis' && (
            <div className="space-y-6">
              {/* Selector de Activo */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">🎯 Seleccionar Activo</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-zinc-400 text-sm mb-2 block">Categoría</label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => {
                        setSelectedCategory(e.target.value)
                        setSelectedAsset(ASSETS[e.target.value][0])
                      }}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                    >
                      {Object.keys(ASSETS).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-zinc-400 text-sm mb-2 block">Activo</label>
                    <select
                      value={selectedAsset}
                      onChange={(e) => setSelectedAsset(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                    >
                      {ASSETS[selectedCategory].map(asset => (
                        <option key={asset} value={asset}>{asset}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Upload de Imágenes Multi-Timeframe */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">📊 Subir Gráficos Multi-Timeframe</h3>
                  <span className={`px-3 py-1 rounded-full text-sm ${getUploadedCount() === 4 ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                    {getUploadedCount()}/4 imágenes
                  </span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {TIMEFRAMES.map((tf) => (
                    <div key={tf.id} className="space-y-2">
                      <label className="text-sm font-medium text-white block">{tf.label}</label>
                      <p className="text-xs text-zinc-500">{tf.description}</p>
                      
                      {images[tf.id] ? (
                        <div className="relative group">
                          <img 
                            src={images[tf.id].preview} 
                            alt={tf.label}
                            className="w-full h-32 object-cover rounded-lg border-2 border-green-500"
                          />
                          <button
                            onClick={() => removeImage(tf.id)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Icons.X />
                          </button>
                          <div className="absolute bottom-1 left-1 bg-green-500 text-black text-xs px-2 py-0.5 rounded">
                            ✓ {tf.id}
                          </div>
                        </div>
                      ) : (
                        <label className="border-2 border-dashed border-zinc-700 rounded-lg h-32 flex flex-col items-center justify-center cursor-pointer hover:border-green-500 hover:bg-green-500/5 transition-all">
                          <Icons.Upload />
                          <span className="text-zinc-500 text-xs mt-1">Subir {tf.id}</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={(e) => handleImageUpload(tf.id, e)} 
                            className="hidden" 
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </div>

                {/* Botón de Análisis */}
                <button
                  onClick={analyzeCharts}
                  disabled={isAnalyzing || getUploadedCount() < 4}
                  className={`w-full mt-6 py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 ${
                    getUploadedCount() === 4
                      ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-black hover:from-green-400 hover:to-emerald-500'
                      : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  }`}
                >
                  {isAnalyzing ? (
                    <>
                      <div className="w-6 h-6 border-3 border-black border-t-transparent rounded-full animate-spin"></div>
                      Analizando con IA...
                    </>
                  ) : (
                    <>🤖 Analizar con IA (SMC Multi-Timeframe)</>
                  )}
                </button>
                
                {getUploadedCount() < 4 && (
                  <p className="text-center text-yellow-500 text-sm mt-2">
                    ⚠️ Sube las 4 imágenes (H1, 15M, 5M, 1M) para un análisis completo
                  </p>
                )}
              </div>

              {/* ==================== RESULTADO DEL ANÁLISIS ==================== */}
              {analysis && (
                <div className="space-y-4">
                  {/* Header del Análisis */}
                  <div className={`rounded-xl p-6 ${
                    analysis.analisis_general?.sesgo === 'COMPRA' ? 'bg-green-500/10 border-2 border-green-500' :
                    analysis.analisis_general?.sesgo === 'VENTA' ? 'bg-red-500/10 border-2 border-red-500' :
                    'bg-zinc-800 border border-zinc-700'
                  }`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className={`text-5xl ${
                          analysis.analisis_general?.sesgo === 'COMPRA' ? 'text-green-500' :
                          analysis.analisis_general?.sesgo === 'VENTA' ? 'text-red-500' : 'text-zinc-400'
                        }`}>
                          {analysis.analisis_general?.sesgo === 'COMPRA' ? '📈' : 
                           analysis.analisis_general?.sesgo === 'VENTA' ? '📉' : '⏸️'}
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-white">
                            {analysis.analisis_general?.sesgo || 'NEUTRAL'}
                          </h3>
                          <p className="text-zinc-400">
                            Tendencia: {analysis.analisis_general?.tendencia_principal}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-3xl font-bold ${
                          analysis.analisis_general?.confianza === 'ALTA' ? 'text-green-500' :
                          analysis.analisis_general?.confianza === 'MEDIA' ? 'text-yellow-500' : 'text-red-500'
                        }`}>
                          {analysis.analisis_general?.probabilidad_exito || 'N/A'}
                        </div>
                        <p className="text-zinc-400">Probabilidad de éxito</p>
                        <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm ${
                          analysis.analisis_general?.confianza === 'ALTA' ? 'bg-green-500/20 text-green-500' :
                          analysis.analisis_general?.confianza === 'MEDIA' ? 'bg-yellow-500/20 text-yellow-500' : 
                          'bg-red-500/20 text-red-500'
                        }`}>
                          Confianza {analysis.analisis_general?.confianza}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Setup de Entrada */}
                  {analysis.setup_de_entrada && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                      <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Icons.Target /> Setup de Entrada
                      </h4>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="bg-zinc-800 rounded-lg p-4">
                          <p className="text-zinc-400 text-sm">Entrada</p>
                          <div className="flex items-center gap-2">
                            <p className="text-xl font-bold text-white">{analysis.setup_de_entrada.precio_entrada}</p>
                            <button onClick={() => copyToClipboard(analysis.setup_de_entrada.precio_entrada)} className="text-zinc-500 hover:text-white">
                              <Icons.Copy />
                            </button>
                          </div>
                        </div>
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                          <p className="text-red-400 text-sm">Stop Loss</p>
                          <div className="flex items-center gap-2">
                            <p className="text-xl font-bold text-red-500">{analysis.setup_de_entrada.stop_loss}</p>
                            <button onClick={() => copyToClipboard(analysis.setup_de_entrada.stop_loss)} className="text-red-400 hover:text-red-300">
                              <Icons.Copy />
                            </button>
                          </div>
                          <p className="text-xs text-red-400 mt-1">{analysis.setup_de_entrada.pips_de_riesgo}</p>
                        </div>
                        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                          <p className="text-green-400 text-sm">Take Profit 1</p>
                          <div className="flex items-center gap-2">
                            <p className="text-xl font-bold text-green-500">{analysis.setup_de_entrada.take_profit_1}</p>
                            <button onClick={() => copyToClipboard(analysis.setup_de_entrada.take_profit_1)} className="text-green-400 hover:text-green-300">
                              <Icons.Copy />
                            </button>
                          </div>
                        </div>
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                          <p className="text-blue-400 text-sm">Ratio R:R</p>
                          <p className="text-xl font-bold text-blue-500">{analysis.setup_de_entrada.ratio_rr}</p>
                        </div>
                      </div>

                      {/* TPs adicionales */}
                      {(analysis.setup_de_entrada.take_profit_2 || analysis.setup_de_entrada.take_profit_3) && (
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          {analysis.setup_de_entrada.take_profit_2 && (
                            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                              <p className="text-green-400 text-sm">Take Profit 2</p>
                              <p className="text-lg font-bold text-green-400">{analysis.setup_de_entrada.take_profit_2}</p>
                            </div>
                          )}
                          {analysis.setup_de_entrada.take_profit_3 && (
                            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                              <p className="text-green-400 text-sm">Take Profit 3</p>
                              <p className="text-lg font-bold text-green-400">{analysis.setup_de_entrada.take_profit_3}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Instrucciones MetaTrader */}
                  {analysis.instrucciones_metatrader && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                      <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        💻 Instrucciones para MetaTrader
                      </h4>
                      
                      {/* Acción Inmediata */}
                      <div className={`rounded-lg p-4 mb-4 ${
                        analysis.instrucciones_metatrader.accion_inmediata === 'ENTRAR AHORA' ? 'bg-green-500/20 border border-green-500' :
                        analysis.instrucciones_metatrader.accion_inmediata === 'ESPERAR' ? 'bg-yellow-500/20 border border-yellow-500' :
                        'bg-blue-500/20 border border-blue-500'
                      }`}>
                        <div className="flex items-center gap-3">
                          {analysis.instrucciones_metatrader.accion_inmediata === 'ENTRAR AHORA' ? (
                            <Icons.Check />
                          ) : (
                            <Icons.Clock />
                          )}
                          <div>
                            <p className="font-bold text-white">{analysis.instrucciones_metatrader.accion_inmediata}</p>
                            <p className="text-sm text-zinc-300">Tipo de orden: {analysis.instrucciones_metatrader.tipo_orden}</p>
                          </div>
                        </div>
                      </div>

                      {/* Pasos */}
                      <div className="space-y-2 mb-4">
                        {analysis.instrucciones_metatrader.pasos?.map((paso, idx) => (
                          <div key={idx} className="flex gap-3 p-3 bg-zinc-800/50 rounded-lg">
                            <span className="flex-shrink-0 w-6 h-6 bg-green-500 text-black rounded-full flex items-center justify-center text-sm font-bold">
                              {idx + 1}
                            </span>
                            <p className="text-zinc-300">{paso}</p>
                          </div>
                        ))}
                      </div>

                      {/* Confirmación necesaria */}
                      {analysis.instrucciones_metatrader.confirmacion_necesaria && (
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-4">
                          <p className="text-yellow-500 font-semibold flex items-center gap-2">
                            <Icons.AlertTriangle /> Confirmación Necesaria
                          </p>
                          <p className="text-zinc-300 mt-1">{analysis.instrucciones_metatrader.confirmacion_necesaria}</p>
                        </div>
                      )}

                      {/* Invalidación */}
                      {analysis.instrucciones_metatrader.invalidacion && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                          <p className="text-red-500 font-semibold">⛔ Setup se invalida si:</p>
                          <p className="text-zinc-300 mt-1">{analysis.instrucciones_metatrader.invalidacion}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Gestión de Riesgo */}
                  {analysis.gestion_de_riesgo && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                      <h4 className="text-lg font-semibold text-white mb-4">💰 Gestión de Riesgo</h4>
                      <p className="text-zinc-400 mb-4">Riesgo recomendado: <span className="text-white font-semibold">{analysis.gestion_de_riesgo.riesgo_recomendado}</span></p>
                      
                      {analysis.gestion_de_riesgo.parciales && (
                        <div className="space-y-2">
                          <p className="text-zinc-400 text-sm">Cierre de parciales:</p>
                          {analysis.gestion_de_riesgo.parciales.map((parcial, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-zinc-300">
                              <span className="text-green-500">•</span>
                              {Object.values(parcial)[0]}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Advertencias */}
                  {analysis.advertencias && analysis.advertencias.length > 0 && (
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-6">
                      <h4 className="text-lg font-semibold text-orange-500 mb-4 flex items-center gap-2">
                        <Icons.AlertTriangle /> Advertencias
                      </h4>
                      <div className="space-y-2">
                        {analysis.advertencias.map((adv, idx) => (
                          <p key={idx} className="text-zinc-300 flex items-start gap-2">
                            <span className="text-orange-500">⚠️</span> {adv}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Resumen Ejecutivo */}
                  {analysis.resumen_ejecutivo && (
                    <div className="bg-zinc-800 rounded-xl p-6">
                      <h4 className="text-lg font-semibold text-white mb-2">📝 Resumen</h4>
                      <p className="text-zinc-300 leading-relaxed">{analysis.resumen_ejecutivo}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ==================== CALCULATOR TAB ==================== */}
          {activeTab === 'calculator' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-6">🧮 Calculadora de Posición</h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-zinc-400 text-sm">Precio de Entrada</label>
                      <input
                        type="number"
                        value={entryPrice}
                        onChange={(e) => setEntryPrice(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white mt-1"
                        placeholder="1.08520"
                        step="0.00001"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 text-sm">Stop Loss</label>
                      <input
                        type="number"
                        value={slPrice}
                        onChange={(e) => setSlPrice(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white mt-1"
                        placeholder="1.08350"
                        step="0.00001"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-zinc-400 text-sm">Take Profit</label>
                      <input
                        type="number"
                        value={tpPrice}
                        onChange={(e) => setTpPrice(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white mt-1"
                        placeholder="1.08750"
                        step="0.00001"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 text-sm">Riesgo (%)</label>
                      <input
                        type="number"
                        value={riskPercent}
                        onChange={(e) => setRiskPercent(parseFloat(e.target.value) || 1)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white mt-1"
                        min="0.1"
                        max="10"
                        step="0.1"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-4">
                  <div className="bg-zinc-800 rounded-lg p-4 text-center">
                    <p className="text-zinc-400 text-sm">Lot Size</p>
                    <p className="text-2xl font-bold text-green-500">{calculatePosition().lotSize}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-4 text-center">
                    <p className="text-zinc-400 text-sm">Riesgo USD</p>
                    <p className="text-2xl font-bold text-red-500">${calculatePosition().riskUSD}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-4 text-center">
                    <p className="text-zinc-400 text-sm">R:R</p>
                    <p className="text-2xl font-bold text-white">{calculateRR()}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== PSICOTRADING TAB ==================== */}
          {activeTab === 'psycho' && (
            <div className="space-y-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">🧠 ¿Cómo te sientes ahora?</h3>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                  {EMOTIONS.map(emotion => (
                    <button
                      key={emotion.id}
                      onClick={() => setCurrentEmotion(emotion.id)}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        currentEmotion === emotion.id 
                          ? emotion.color === 'green' ? 'border-green-500 bg-green-500/10'
                          : emotion.color === 'yellow' ? 'border-yellow-500 bg-yellow-500/10'
                          : emotion.color === 'orange' ? 'border-orange-500 bg-orange-500/10'
                          : 'border-red-500 bg-red-500/10'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <div className="text-3xl mb-1">{emotion.emoji}</div>
                      <div className="text-sm text-zinc-300">{emotion.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* GO / NO-GO */}
              {currentEmotion && (
                <div className={`rounded-xl p-6 text-center ${
                  EMOTIONS.find(e => e.id === currentEmotion)?.canTrade
                    ? 'bg-green-500/20 border-2 border-green-500' 
                    : 'bg-red-500/20 border-2 border-red-500'
                }`}>
                  <p className="text-4xl mb-2">
                    {EMOTIONS.find(e => e.id === currentEmotion)?.canTrade ? '✅' : '🚫'}
                  </p>
                  <p className={`text-2xl font-bold ${
                    EMOTIONS.find(e => e.id === currentEmotion)?.canTrade ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {EMOTIONS.find(e => e.id === currentEmotion)?.canTrade ? '¡PUEDES OPERAR!' : 'NO OPERAR HOY'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ==================== JOURNAL TAB ==================== */}
          {activeTab === 'journal' && (
            <div className="space-y-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">📝 Registrar Trade</h3>
                <div className="flex gap-4">
                  <button onClick={() => addTrade('win')} className="flex-1 py-4 bg-green-500/20 border border-green-500 text-green-500 font-bold rounded-xl hover:bg-green-500/30">
                    ✅ WIN
                  </button>
                  <button onClick={() => addTrade('loss')} className="flex-1 py-4 bg-red-500/20 border border-red-500 text-red-500 font-bold rounded-xl hover:bg-red-500/30">
                    ❌ LOSS
                  </button>
                  <button onClick={() => addTrade('be')} className="flex-1 py-4 bg-zinc-500/20 border border-zinc-500 text-zinc-400 font-bold rounded-xl hover:bg-zinc-500/30">
                    ➖ BE
                  </button>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">📋 Historial</h3>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {trades.map(trade => (
                    <div key={trade.id} className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg">
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">
                          {trade.result === 'win' ? '✅' : trade.result === 'loss' ? '❌' : '➖'}
                        </span>
                        <div>
                          <p className="text-white font-medium">{trade.asset}</p>
                          <p className="text-zinc-500 text-sm">{new Date(trade.date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <p className={`font-bold ${
                        trade.profit > 0 ? 'text-green-500' : trade.profit < 0 ? 'text-red-500' : 'text-zinc-400'
                      }`}>
                        {trade.profit > 0 ? '+' : ''}{trade.profit?.toFixed(2) || 0}
                      </p>
                    </div>
                  ))}
                  {trades.length === 0 && (
                    <p className="text-zinc-500 text-center py-8">No hay trades registrados</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== SETTINGS TAB ==================== */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">⚙️ Configuración</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-zinc-400 text-sm">Balance Inicial</label>
                    <input
                      type="number"
                      value={balance}
                      onChange={(e) => setBalance(parseFloat(e.target.value) || 1000)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 text-sm">Riesgo por Trade (%)</label>
                    <input
                      type="number"
                      value={riskPercent}
                      onChange={(e) => setRiskPercent(parseFloat(e.target.value) || 1)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white mt-1"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">📊 Datos</h3>
                <button
                  onClick={() => {
                    if (confirm('¿Eliminar todos los datos?')) {
                      setTrades([])
                      setBalance(1000)
                      localStorage.clear()
                      toast.success('Datos eliminados')
                    }
                  }}
                  className="w-full py-3 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/30"
                >
                  🗑️ Eliminar Todos los Datos
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
