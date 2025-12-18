// =============================================
// DASHBOARD - PÁGINA PRINCIPAL
// =============================================

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore, useTradingStore, useTradesStore, useUIStore } from '../store'
import toast from 'react-hot-toast'

// Iconos simples con SVG
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
}

// Assets disponibles
const ASSETS = {
  'Sintéticos Deriv': [
    { name: 'Step Index', pip: 0.1 },
    { name: 'Volatility 75', pip: 0.001 },
    { name: 'Volatility 100', pip: 0.001 },
    { name: 'Boom 500', pip: 0.001 },
    { name: 'Crash 500', pip: 0.001 },
  ],
  'Forex': [
    { name: 'EUR/USD', pip: 0.0001 },
    { name: 'GBP/USD', pip: 0.0001 },
    { name: 'USD/JPY', pip: 0.01 },
    { name: 'XAU/USD', pip: 0.01 },
  ],
  'Crypto': [
    { name: 'BTC/USD', pip: 1 },
    { name: 'ETH/USD', pip: 0.1 },
  ],
}

// Emociones
const EMOTIONS = [
  { id: 'calm', emoji: '😌', label: 'Tranquilo', risk: 'low', color: 'green' },
  { id: 'focused', emoji: '🎯', label: 'Enfocado', risk: 'low', color: 'green' },
  { id: 'confident', emoji: '💪', label: 'Confiado', risk: 'low', color: 'green' },
  { id: 'neutral', emoji: '😐', label: 'Neutral', risk: 'medium', color: 'yellow' },
  { id: 'anxious', emoji: '😰', label: 'Ansioso', risk: 'medium', color: 'yellow' },
  { id: 'tired', emoji: '😴', label: 'Cansado', risk: 'medium', color: 'orange' },
  { id: 'frustrated', emoji: '😤', label: 'Frustrado', risk: 'high', color: 'red' },
  { id: 'fomo', emoji: '😱', label: 'FOMO', risk: 'high', color: 'red' },
  { id: 'revenge', emoji: '🔥', label: 'Venganza', risk: 'high', color: 'red' },
]

// Checklist items
const CHECKLIST_ITEMS = [
  { id: 'trend', label: 'Tendencia clara en HTF', category: 'analysis' },
  { id: 'bos', label: 'BOS confirmado', category: 'analysis' },
  { id: 'poi', label: 'En zona de interés (OB/FVG)', category: 'analysis' },
  { id: 'liquidity', label: 'Liquidez barrida', category: 'analysis' },
  { id: 'sl', label: 'Stop Loss lógico', category: 'risk' },
  { id: 'rr', label: 'R:R mínimo 1:2', category: 'risk' },
  { id: 'risk', label: 'Riesgo dentro del plan', category: 'risk' },
  { id: 'emotion', label: 'Estado emocional óptimo', category: 'psych' },
  { id: 'plan', label: 'Dentro del plan de trading', category: 'psych' },
  { id: 'norevenge', label: 'NO es trade de venganza', category: 'psych' },
  { id: 'nofomo', label: 'NO es FOMO', category: 'psych' },
  { id: 'news', label: 'Noticias revisadas', category: 'other' },
]

export default function Dashboard() {
  const { profile, signOut } = useAuthStore()
  const { activeTab, setActiveTab, sidebarCollapsed, toggleSidebar } = useUIStore()
  const [trades, setTrades] = useState([])
  const [balance, setBalance] = useState(profile?.account_balance || 1000)

  // Estados para análisis
  const [images, setImages] = useState([])
  const [selectedAsset, setSelectedAsset] = useState(ASSETS['Sintéticos Deriv'][0])
  const [selectedCategory, setSelectedCategory] = useState('Sintéticos Deriv')
  const [analysis, setAnalysis] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

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

  // Calcular posición
  const calculatePosition = () => {
    if (!entryPrice || !slPrice) return { lotSize: 0, riskUSD: 0 }
    
    const entry = parseFloat(entryPrice)
    const sl = parseFloat(slPrice)
    const riskUSD = balance * (riskPercent / 100)
    const pipDiff = Math.abs(entry - sl) / selectedAsset.pip
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

  // Manejar subida de imágenes
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (e) => {
        setImages(prev => [...prev, { data: e.target.result.split(',')[1], preview: e.target.result }].slice(0, 4))
      }
      reader.readAsDataURL(file)
    })
  }

  // Registrar trade
  const addTrade = (result) => {
    const profit = result === 'win' ? parseFloat(calculatePosition().riskUSD) * parseFloat(calculateRR()) 
                 : result === 'loss' ? -parseFloat(calculatePosition().riskUSD) 
                 : 0

    const newTrade = {
      id: Date.now(),
      asset: selectedAsset.name,
      result,
      profit,
      emotion: currentEmotion,
      rr: calculateRR(),
      date: new Date().toISOString(),
    }

    setTrades(prev => [newTrade, ...prev])
    setBalance(prev => prev + profit)
    toast.success(result === 'win' ? '✅ Trade ganador registrado' : result === 'loss' ? '❌ Trade perdedor registrado' : '➖ Break Even registrado')
  }

  // Toggle checklist
  const toggleChecklist = (id) => {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // Verificar si puede operar
  const canTrade = () => {
    const checklistOk = Object.values(checklist).filter(Boolean).length >= 8
    const emotionOk = currentEmotion && ['calm', 'focused', 'confident'].includes(currentEmotion)
    return checklistOk && emotionOk
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

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-screen bg-zinc-900 border-r border-zinc-800 flex flex-col transition-all duration-300 z-50 ${sidebarCollapsed ? 'w-[70px]' : 'w-[240px]'}`}>
        {/* Logo */}
        <div className="p-4 border-b border-zinc-800">
          <h1 className={`font-bold text-white ${sidebarCollapsed ? 'text-center text-sm' : 'text-lg'}`}>
            {sidebarCollapsed ? 'TMP' : 'Trading Master Pro'}
          </h1>
        </div>

        {/* Navigation */}
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

        {/* User & Logout */}
        <div className="p-4 border-t border-zinc-800">
          {!sidebarCollapsed && (
            <p className="text-sm text-zinc-400 mb-2 truncate">{profile?.email}</p>
          )}
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
          >
            <Icons.Logout />
            {!sidebarCollapsed && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'ml-[70px]' : 'ml-[240px]'}`}>
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
              <div>
                <span className="text-zinc-400">Balance:</span>
                <span className={`ml-2 font-bold ${balance >= 1000 ? 'text-green-500' : 'text-red-500'}`}>
                  ${balance.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-zinc-400">Win Rate:</span>
                <span className="ml-2 font-bold text-white">{stats.winRate}%</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats Grid */}
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

              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Rendimiento</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Trades Ganadores</span>
                      <span className="text-green-500 font-bold">{stats.wins}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Trades Perdedores</span>
                      <span className="text-red-500 font-bold">{stats.losses}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Break Even</span>
                      <span className="text-zinc-300 font-bold">{trades.filter(t => t.result === 'be').length}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Últimos Trades</h3>
                  <div className="space-y-2">
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

          {/* Analysis Tab */}
          {activeTab === 'analysis' && (
            <div className="space-y-6">
              {/* Asset Selector */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Seleccionar Activo</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <select
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value)
                      setSelectedAsset(ASSETS[e.target.value][0])
                    }}
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                  >
                    {Object.keys(ASSETS).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <select
                    value={selectedAsset.name}
                    onChange={(e) => setSelectedAsset(ASSETS[selectedCategory].find(a => a.name === e.target.value))}
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                  >
                    {ASSETS[selectedCategory].map(asset => (
                      <option key={asset.name} value={asset.name}>{asset.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Image Upload */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Subir Gráficos (máx 4)</h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative">
                      <img src={img.preview} alt={`Chart ${idx + 1}`} className="w-full h-32 object-cover rounded-lg" />
                      <button
                        onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 bg-red-500 rounded-full p-1"
                      >
                        <Icons.X />
                      </button>
                    </div>
                  ))}
                  
                  {images.length < 4 && (
                    <label className="border-2 border-dashed border-zinc-700 rounded-xl h-32 flex flex-col items-center justify-center cursor-pointer hover:border-green-500 transition-all">
                      <Icons.Upload />
                      <span className="text-zinc-400 text-sm mt-2">Subir imagen</span>
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" multiple />
                    </label>
                  )}
                </div>

                <button
                  onClick={() => {
                    if (images.length === 0) {
                      toast.error('Sube al menos 1 gráfico')
                      return
                    }
                    setIsAnalyzing(true)
                    // Simular análisis (aquí iría la llamada real a la API)
                    setTimeout(() => {
                      setAnalysis({
                        direction: 'BUY',
                        confidence: 'HIGH',
                        entry: '0.9850',
                        sl: '0.9820',
                        tp: '0.9920',
                        rr: '2.33',
                        notes: 'BOS alcista confirmado. Order Block en zona de demanda. Liquidez barrida bajo el mínimo anterior.',
                      })
                      setIsAnalyzing(false)
                      toast.success('Análisis completado')
                    }, 2000)
                  }}
                  disabled={isAnalyzing || images.length === 0}
                  className="w-full py-3 bg-gradient-to-r from-green-500 to-green-600 text-black font-semibold rounded-lg disabled:opacity-50"
                >
                  {isAnalyzing ? 'Analizando con IA...' : '🤖 Analizar con IA'}
                </button>
              </div>

              {/* Analysis Result */}
              {analysis && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Resultado del Análisis</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-zinc-800 rounded-lg p-4">
                      <p className="text-zinc-400 text-sm">Dirección</p>
                      <p className={`text-xl font-bold ${analysis.direction === 'BUY' ? 'text-green-500' : 'text-red-500'}`}>
                        {analysis.direction}
                      </p>
                    </div>
                    <div className="bg-zinc-800 rounded-lg p-4">
                      <p className="text-zinc-400 text-sm">Confianza</p>
                      <p className="text-xl font-bold text-yellow-500">{analysis.confidence}</p>
                    </div>
                    <div className="bg-zinc-800 rounded-lg p-4">
                      <p className="text-zinc-400 text-sm">R:R</p>
                      <p className="text-xl font-bold text-white">{analysis.rr}</p>
                    </div>
                    <div className="bg-zinc-800 rounded-lg p-4">
                      <p className="text-zinc-400 text-sm">Entry</p>
                      <p className="text-xl font-bold text-white">{analysis.entry}</p>
                    </div>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-4">
                    <p className="text-zinc-400 text-sm mb-2">Notas</p>
                    <p className="text-white">{analysis.notes}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Calculator Tab */}
          {activeTab === 'calculator' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-6">Calculadora de Posición</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-zinc-400 text-sm">Activo</label>
                    <select
                      value={selectedAsset.name}
                      onChange={(e) => setSelectedAsset(ASSETS[selectedCategory].find(a => a.name === e.target.value))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white mt-1"
                    >
                      {Object.entries(ASSETS).map(([cat, assets]) => (
                        <optgroup key={cat} label={cat}>
                          {assets.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-zinc-400 text-sm">Precio de Entrada</label>
                      <input
                        type="number"
                        value={entryPrice}
                        onChange={(e) => setEntryPrice(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white mt-1"
                        placeholder="1.2345"
                        step="0.0001"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 text-sm">Stop Loss</label>
                      <input
                        type="number"
                        value={slPrice}
                        onChange={(e) => setSlPrice(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white mt-1"
                        placeholder="1.2300"
                        step="0.0001"
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
                        placeholder="1.2450"
                        step="0.0001"
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

                {/* Results */}
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

          {/* Psicotrading Tab */}
          {activeTab === 'psycho' && (
            <div className="space-y-6">
              {/* Emotion Selector */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">¿Cómo te sientes ahora?</h3>
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

              {/* Checklist */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">
                  Checklist Pre-Operación ({Object.values(checklist).filter(Boolean).length}/{CHECKLIST_ITEMS.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {CHECKLIST_ITEMS.map(item => (
                    <button
                      key={item.id}
                      onClick={() => toggleChecklist(item.id)}
                      className={`flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                        checklist[item.id]
                          ? 'border-green-500 bg-green-500/10'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded flex items-center justify-center ${
                        checklist[item.id] ? 'bg-green-500 text-black' : 'bg-zinc-700'
                      }`}>
                        {checklist[item.id] && '✓'}
                      </div>
                      <span className="text-zinc-300">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* GO / NO-GO */}
              <div className={`rounded-xl p-6 text-center ${
                canTrade() 
                  ? 'bg-green-500/20 border-2 border-green-500' 
                  : 'bg-red-500/20 border-2 border-red-500'
              }`}>
                <p className="text-4xl mb-2">{canTrade() ? '✅' : '🚫'}</p>
                <p className={`text-2xl font-bold ${canTrade() ? 'text-green-500' : 'text-red-500'}`}>
                  {canTrade() ? '¡PUEDES OPERAR!' : 'NO OPERAR'}
                </p>
                {!canTrade() && (
                  <p className="text-zinc-400 mt-2">
                    Completa el checklist y asegúrate de estar en un estado emocional óptimo
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Journal Tab */}
          {activeTab === 'journal' && (
            <div className="space-y-6">
              {/* Quick Add Trade */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Registrar Trade Rápido</h3>
                <div className="flex gap-4">
                  <button
                    onClick={() => addTrade('win')}
                    className="flex-1 py-4 bg-green-500/20 border border-green-500 text-green-500 font-bold rounded-xl hover:bg-green-500/30 transition-all"
                  >
                    ✅ WIN
                  </button>
                  <button
                    onClick={() => addTrade('loss')}
                    className="flex-1 py-4 bg-red-500/20 border border-red-500 text-red-500 font-bold rounded-xl hover:bg-red-500/30 transition-all"
                  >
                    ❌ LOSS
                  </button>
                  <button
                    onClick={() => addTrade('be')}
                    className="flex-1 py-4 bg-zinc-500/20 border border-zinc-500 text-zinc-400 font-bold rounded-xl hover:bg-zinc-500/30 transition-all"
                  >
                    ➖ BE
                  </button>
                </div>
              </div>

              {/* Trade History */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Historial de Trades</h3>
                <div className="space-y-2">
                  {trades.map(trade => (
                    <div key={trade.id} className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg">
                      <div className="flex items-center gap-4">
                        <span className={`text-2xl ${
                          trade.result === 'win' ? 'text-green-500' : trade.result === 'loss' ? 'text-red-500' : 'text-zinc-400'
                        }`}>
                          {trade.result === 'win' ? '✅' : trade.result === 'loss' ? '❌' : '➖'}
                        </span>
                        <div>
                          <p className="text-white font-medium">{trade.asset}</p>
                          <p className="text-zinc-500 text-sm">{new Date(trade.date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${
                          trade.profit > 0 ? 'text-green-500' : trade.profit < 0 ? 'text-red-500' : 'text-zinc-400'
                        }`}>
                          {trade.profit > 0 ? '+' : ''}{trade.profit?.toFixed(2) || 0}
                        </p>
                        {trade.emotion && (
                          <p className="text-sm text-zinc-500">
                            {EMOTIONS.find(e => e.id === trade.emotion)?.emoji}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {trades.length === 0 && (
                    <p className="text-zinc-500 text-center py-8">No hay trades registrados aún</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Configuración de Cuenta</h3>
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
                      min="0.1"
                      max="10"
                      step="0.1"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Datos</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      const data = { trades, balance, settings: { riskPercent } }
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `trading-data-${new Date().toISOString().split('T')[0]}.json`
                      a.click()
                      toast.success('Datos exportados')
                    }}
                    className="w-full py-3 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-all"
                  >
                    📥 Exportar Datos
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('¿Estás seguro? Esto eliminará todos tus datos.')) {
                        setTrades([])
                        setBalance(1000)
                        localStorage.clear()
                        toast.success('Datos eliminados')
                      }
                    }}
                    className="w-full py-3 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/30 transition-all"
                  >
                    🗑️ Eliminar Todos los Datos
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
