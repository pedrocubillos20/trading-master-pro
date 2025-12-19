// =============================================
// TRADING MASTER PRO - DASHBOARD v3.0
// Con verificación de conexión y mejor UX
// =============================================

import { useState, useEffect } from 'react'
import toast, { Toaster } from 'react-hot-toast'

// =============================================
// CONFIGURACIÓN
// =============================================
const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app'

// =============================================
// ACTIVOS DISPONIBLES
// =============================================
const ASSETS = {
  'Sintéticos Deriv': [
    'Volatility 10 Index', 'Volatility 25 Index', 'Volatility 50 Index',
    'Volatility 75 Index', 'Volatility 100 Index', 'Step Index',
    'Boom 500 Index', 'Boom 1000 Index', 'Crash 500 Index', 'Crash 1000 Index',
    'Range Break 100', 'Range Break 200', 'Jump 10 Index', 'Jump 25 Index',
    'Jump 50 Index', 'Jump 75 Index', 'Jump 100 Index'
  ],
  'Forex Majors': ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD'],
  'Forex Minors': ['EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'EUR/AUD', 'GBP/AUD', 'AUD/JPY', 'CHF/JPY'],
  'Metales': ['XAU/USD (Oro)', 'XAG/USD (Plata)', 'XPT/USD (Platino)'],
  'Índices': ['US30 (Dow Jones)', 'US100 (Nasdaq)', 'US500 (S&P500)', 'GER40 (DAX)', 'UK100 (FTSE)'],
  'Crypto': ['BTC/USD', 'ETH/USD', 'LTC/USD', 'XRP/USD', 'SOL/USD']
}

const TIMEFRAMES = [
  { id: 'H1', label: 'H1', fullLabel: '1 Hora', desc: 'Contexto y tendencia', color: 'blue' },
  { id: 'M15', label: '15M', fullLabel: '15 Minutos', desc: 'Zonas y OBs', color: 'purple' },
  { id: 'M5', label: '5M', fullLabel: '5 Minutos', desc: 'Refinamiento', color: 'orange' },
  { id: 'M1', label: '1M', fullLabel: '1 Minuto', desc: 'Entrada sniper', color: 'green' }
]

// =============================================
// COMPONENTE PRINCIPAL
// =============================================
export default function Dashboard() {
  // Estados de la app
  const [activeTab, setActiveTab] = useState('analysis')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  
  // Estados del análisis
  const [images, setImages] = useState({})
  const [selectedCategory, setSelectedCategory] = useState('Forex Majors')
  const [selectedAsset, setSelectedAsset] = useState('EUR/USD')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [analysisError, setAnalysisError] = useState(null)
  
  // Estados de conexión
  const [apiStatus, setApiStatus] = useState({ checking: true, connected: false, ai: false })
  
  // Estados de trading
  const [balance, setBalance] = useState(() => parseFloat(localStorage.getItem('balance')) || 1000)
  const [trades, setTrades] = useState(() => JSON.parse(localStorage.getItem('trades') || '[]'))
  const [riskPercent, setRiskPercent] = useState(1)

  // Verificar conexión al cargar
  useEffect(() => {
    checkApiConnection()
  }, [])

  // Guardar datos en localStorage
  useEffect(() => {
    localStorage.setItem('balance', balance.toString())
    localStorage.setItem('trades', JSON.stringify(trades))
  }, [balance, trades])

  // =============================================
  // FUNCIONES DE CONEXIÓN
  // =============================================
  
  const checkApiConnection = async () => {
    setApiStatus({ checking: true, connected: false, ai: false })
    
    try {
      // Verificar servidor
      const healthRes = await fetch(`${API_URL}/health`, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      })
      
      if (!healthRes.ok) throw new Error('Servidor no responde')
      
      const healthData = await healthRes.json()
      
      // Verificar OpenAI
      const aiRes = await fetch(`${API_URL}/api/check-ai`)
      const aiData = await aiRes.json()
      
      setApiStatus({
        checking: false,
        connected: true,
        ai: aiData.connected,
        aiError: aiData.error
      })
      
      if (!aiData.connected) {
        toast.error('⚠️ IA no configurada: ' + (aiData.error || 'Verifica OPENAI_API_KEY'))
      } else {
        toast.success('✅ Conectado al servidor de IA')
      }
      
    } catch (error) {
      console.error('Error de conexión:', error)
      setApiStatus({
        checking: false,
        connected: false,
        ai: false,
        error: error.message
      })
      toast.error('❌ No se pudo conectar al servidor')
    }
  }

  // =============================================
  // FUNCIONES DE ANÁLISIS
  // =============================================
  
  const handleImageUpload = (timeframe, event) => {
    const file = event.target.files[0]
    if (!file) return
    
    // Validar tamaño (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('La imagen es muy grande (máx 10MB)')
      return
    }
    
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target.result
      setImages(prev => ({
        ...prev,
        [timeframe]: {
          file,
          preview: result,
          base64: result // Ya incluye el prefijo data:image/...
        }
      }))
      toast.success(`✅ Imagen ${timeframe} cargada`)
    }
    reader.onerror = () => {
      toast.error('Error al cargar la imagen')
    }
    reader.readAsDataURL(file)
  }

  const removeImage = (timeframe) => {
    setImages(prev => {
      const newImages = { ...prev }
      delete newImages[timeframe]
      return newImages
    })
  }

  const getUploadedCount = () => Object.keys(images).length

  const analyzeCharts = async () => {
    // Validaciones
    if (Object.keys(images).length === 0) {
      toast.error('Sube al menos una imagen')
      return
    }

    if (!apiStatus.connected) {
      toast.error('No hay conexión con el servidor')
      checkApiConnection()
      return
    }

    if (!apiStatus.ai) {
      toast.error('La IA no está configurada en el servidor')
      return
    }

    setIsAnalyzing(true)
    setAnalysis(null)
    setAnalysisError(null)

    try {
      // Preparar imágenes en base64
      const imageArray = TIMEFRAMES
        .filter(tf => images[tf.id])
        .map(tf => images[tf.id].base64)

      console.log('📤 Enviando análisis...')
      console.log('- Imágenes:', imageArray.length)
      console.log('- Activo:', selectedAsset)

      // Obtener token de auth si existe
      let authToken = ''
      try {
        const stored = localStorage.getItem('sb-mtzycmqtxdvoazomipye-auth-token')
        if (stored) {
          const parsed = JSON.parse(stored)
          authToken = parsed?.access_token || ''
        }
      } catch (e) {
        console.log('No auth token found')
      }

      const response = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken && { 'Authorization': `Bearer ${authToken}` })
        },
        body: JSON.stringify({
          asset: selectedAsset,
          images: imageArray,
          accountBalance: balance,
          riskPercent: riskPercent
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Error en el análisis')
      }

      if (data.success && data.analysis) {
        setAnalysis(data.analysis)
        toast.success('🎯 ¡Análisis completado!')
        console.log('✅ Análisis recibido:', data)
      } else {
        throw new Error('Respuesta inválida del servidor')
      }

    } catch (error) {
      console.error('❌ Error:', error)
      setAnalysisError(error.message)
      toast.error(`Error: ${error.message}`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // =============================================
  // FUNCIONES DE TRADING
  // =============================================
  
  const addTrade = (result) => {
    const rr = analysis?.setup_operativo?.ratio_rr?.replace('1:', '') || '2'
    const riskUSD = balance * (riskPercent / 100)
    const profit = result === 'win' ? riskUSD * parseFloat(rr) 
                 : result === 'loss' ? -riskUSD 
                 : 0

    const newTrade = {
      id: Date.now(),
      asset: selectedAsset,
      result,
      profit: parseFloat(profit.toFixed(2)),
      rr: parseFloat(rr),
      emotion: 'neutral',
      date: new Date().toISOString()
    }

    setTrades(prev => [newTrade, ...prev])
    setBalance(prev => parseFloat((prev + profit).toFixed(2)))
    
    toast.success(
      result === 'win' ? `✅ +$${profit.toFixed(2)}` : 
      result === 'loss' ? `❌ -$${Math.abs(profit).toFixed(2)}` : 
      '➖ Break Even'
    )
  }

  // Estadísticas
  const stats = {
    totalTrades: trades.length,
    wins: trades.filter(t => t.result === 'win').length,
    losses: trades.filter(t => t.result === 'loss').length,
    be: trades.filter(t => t.result === 'be').length,
    get winRate() {
      const total = this.wins + this.losses
      return total > 0 ? ((this.wins / total) * 100).toFixed(1) : 0
    },
    get totalProfit() {
      return trades.reduce((sum, t) => sum + (t.profit || 0), 0).toFixed(2)
    }
  }

  // =============================================
  // RENDER
  // =============================================
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="bg-[#111] border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">
              <span className="text-white">Trading Master</span>
              <span className="text-green-500"> Pro</span>
            </h1>
            
            {/* Status de conexión */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs ${
              apiStatus.checking ? 'bg-yellow-500/20 text-yellow-500' :
              apiStatus.ai ? 'bg-green-500/20 text-green-500' :
              apiStatus.connected ? 'bg-orange-500/20 text-orange-500' :
              'bg-red-500/20 text-red-500'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                apiStatus.checking ? 'bg-yellow-500 animate-pulse' :
                apiStatus.ai ? 'bg-green-500' :
                apiStatus.connected ? 'bg-orange-500' :
                'bg-red-500'
              }`}></div>
              {apiStatus.checking ? 'Conectando...' :
               apiStatus.ai ? 'IA Conectada' :
               apiStatus.connected ? 'IA No Config.' :
               'Desconectado'}
            </div>
          </div>
          
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-zinc-500">Balance: </span>
              <span className={`font-bold ${balance >= 1000 ? 'text-green-500' : 'text-red-500'}`}>
                ${balance.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Win Rate: </span>
              <span className="font-bold text-white">{stats.winRate}%</span>
            </div>
            <button
              onClick={checkApiConnection}
              className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs"
            >
              🔄 Reconectar
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-2 mt-4">
          {[
            { id: 'analysis', label: '📊 Análisis SMC', icon: '📊' },
            { id: 'journal', label: '📝 Diario', icon: '📝' },
            { id: 'stats', label: '📈 Estadísticas', icon: '📈' },
            { id: 'settings', label: '⚙️ Ajustes', icon: '⚙️' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-green-500 text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        
        {/* ==================== TAB: ANÁLISIS ==================== */}
        {activeTab === 'analysis' && (
          <div className="space-y-6">
            
            {/* Alerta si no hay conexión */}
            {!apiStatus.ai && !apiStatus.checking && (
              <div className="bg-red-500/10 border border-red-500 rounded-xl p-4">
                <h3 className="text-red-500 font-bold mb-2">⚠️ Problema de Configuración</h3>
                <p className="text-zinc-300 text-sm mb-2">
                  {!apiStatus.connected 
                    ? 'No se puede conectar al servidor. Verifica que Railway esté activo.'
                    : 'La IA no está configurada. Falta la variable OPENAI_API_KEY en Railway.'}
                </p>
                <p className="text-zinc-500 text-xs">
                  Error: {apiStatus.error || apiStatus.aiError || 'Desconocido'}
                </p>
              </div>
            )}

            {/* Selector de Activo */}
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-5">
              <h3 className="text-lg font-semibold mb-4">🎯 Seleccionar Activo</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-zinc-500 text-sm block mb-2">Categoría</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value)
                      setSelectedAsset(ASSETS[e.target.value][0])
                    }}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                  >
                    {Object.keys(ASSETS).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-zinc-500 text-sm block mb-2">Activo</label>
                  <select
                    value={selectedAsset}
                    onChange={(e) => setSelectedAsset(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                  >
                    {ASSETS[selectedCategory].map(asset => (
                      <option key={asset} value={asset}>{asset}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Upload de Imágenes */}
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">📷 Subir Gráficos Multi-Timeframe</h3>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  getUploadedCount() === 4 ? 'bg-green-500/20 text-green-500' :
                  getUploadedCount() > 0 ? 'bg-yellow-500/20 text-yellow-500' :
                  'bg-zinc-700 text-zinc-400'
                }`}>
                  {getUploadedCount()}/4 imágenes
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {TIMEFRAMES.map((tf) => (
                  <div key={tf.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold text-${tf.color}-500`}>{tf.label}</span>
                      <span className="text-xs text-zinc-500">{tf.desc}</span>
                    </div>
                    
                    {images[tf.id] ? (
                      <div className="relative group">
                        <img
                          src={images[tf.id].preview}
                          alt={tf.label}
                          className={`w-full h-36 object-cover rounded-lg border-2 border-${tf.color}-500`}
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                          <button
                            onClick={() => removeImage(tf.id)}
                            className="bg-red-500 text-white px-3 py-1 rounded-lg text-sm"
                          >
                            ✕ Eliminar
                          </button>
                        </div>
                        <div className={`absolute bottom-2 left-2 bg-${tf.color}-500 text-white text-xs px-2 py-1 rounded`}>
                          ✓ {tf.label}
                        </div>
                      </div>
                    ) : (
                      <label className={`border-2 border-dashed border-zinc-700 rounded-lg h-36 flex flex-col items-center justify-center cursor-pointer hover:border-${tf.color}-500 hover:bg-${tf.color}-500/5 transition-all`}>
                        <svg className="w-8 h-8 text-zinc-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-zinc-500 text-sm">Subir {tf.label}</span>
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
                disabled={isAnalyzing || getUploadedCount() === 0 || !apiStatus.ai}
                className={`w-full mt-6 py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 ${
                  isAnalyzing ? 'bg-zinc-700 text-zinc-400' :
                  getUploadedCount() > 0 && apiStatus.ai
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-black hover:from-green-400 hover:to-emerald-500 shadow-lg shadow-green-500/25'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analizando con GPT-4 Vision...
                  </>
                ) : (
                  <>🤖 Analizar con IA ({getUploadedCount()} {getUploadedCount() === 1 ? 'imagen' : 'imágenes'})</>
                )}
              </button>

              {getUploadedCount() < 4 && getUploadedCount() > 0 && (
                <p className="text-center text-yellow-500 text-sm mt-2">
                  💡 Para mejor precisión, sube las 4 temporalidades (H1, 15M, 5M, 1M)
                </p>
              )}
            </div>

            {/* Error del Análisis */}
            {analysisError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
                <h4 className="text-red-500 font-bold mb-2">❌ Error en el Análisis</h4>
                <p className="text-zinc-300">{analysisError}</p>
              </div>
            )}

            {/* ==================== RESULTADO DEL ANÁLISIS ==================== */}
            {analysis && (
              <div className="space-y-4 animate-fadeIn">
                
                {/* Header Principal */}
                <div className={`rounded-xl p-6 ${
                  analysis.analisis_general?.sesgo_operativo === 'COMPRA' ? 'bg-green-500/10 border-2 border-green-500' :
                  analysis.analisis_general?.sesgo_operativo === 'VENTA' ? 'bg-red-500/10 border-2 border-red-500' :
                  'bg-zinc-800 border border-zinc-700'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`text-6xl ${
                        analysis.analisis_general?.sesgo_operativo === 'COMPRA' ? 'animate-bounce' :
                        analysis.analisis_general?.sesgo_operativo === 'VENTA' ? 'animate-bounce' : ''
                      }`}>
                        {analysis.analisis_general?.sesgo_operativo === 'COMPRA' ? '📈' :
                         analysis.analisis_general?.sesgo_operativo === 'VENTA' ? '📉' : '⏸️'}
                      </div>
                      <div>
                        <h2 className={`text-3xl font-bold ${
                          analysis.analisis_general?.sesgo_operativo === 'COMPRA' ? 'text-green-500' :
                          analysis.analisis_general?.sesgo_operativo === 'VENTA' ? 'text-red-500' : 'text-zinc-400'
                        }`}>
                          {analysis.analisis_general?.sesgo_operativo || analysis.analisis_general?.sesgo || 'ANÁLISIS'}
                        </h2>
                        <p className="text-zinc-400">
                          {selectedAsset} • Tendencia {analysis.analisis_general?.tendencia_principal}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-4xl font-bold ${
                        analysis.analisis_general?.confianza === 'ALTA' ? 'text-green-500' :
                        analysis.analisis_general?.confianza === 'MEDIA' ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                        {analysis.analisis_general?.probabilidad_exito || '—'}
                      </div>
                      <p className="text-zinc-500">Probabilidad</p>
                      <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm ${
                        analysis.analisis_general?.confianza === 'ALTA' ? 'bg-green-500/20 text-green-400' :
                        analysis.analisis_general?.confianza === 'MEDIA' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        Confianza {analysis.analisis_general?.confianza}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Setup de Entrada */}
                {(analysis.setup_operativo || analysis.setup_de_entrada) && (
                  <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                      🎯 Setup de Entrada
                    </h3>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-zinc-900 rounded-lg p-4">
                        <p className="text-zinc-500 text-sm">Entrada</p>
                        <p className="text-2xl font-bold text-white">
                          {analysis.setup_operativo?.precio_entrada || analysis.setup_de_entrada?.precio_entrada || '—'}
                        </p>
                      </div>
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                        <p className="text-red-400 text-sm">Stop Loss</p>
                        <p className="text-2xl font-bold text-red-500">
                          {analysis.setup_operativo?.stop_loss || analysis.setup_de_entrada?.stop_loss || '—'}
                        </p>
                        <p className="text-xs text-red-400 mt-1">
                          {analysis.setup_operativo?.pips_riesgo || analysis.setup_de_entrada?.pips_de_riesgo || ''}
                        </p>
                      </div>
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                        <p className="text-green-400 text-sm">Take Profit 1</p>
                        <p className="text-2xl font-bold text-green-500">
                          {analysis.setup_operativo?.take_profit_1 || analysis.setup_de_entrada?.take_profit_1 || '—'}
                        </p>
                      </div>
                      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                        <p className="text-blue-400 text-sm">Ratio R:R</p>
                        <p className="text-2xl font-bold text-blue-500">
                          {analysis.setup_operativo?.ratio_rr || analysis.setup_de_entrada?.ratio_rr || '—'}
                        </p>
                      </div>
                    </div>

                    {/* TPs adicionales */}
                    {(analysis.setup_operativo?.take_profit_2 || analysis.setup_de_entrada?.take_profit_2) && (
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                          <p className="text-green-400 text-sm">Take Profit 2</p>
                          <p className="text-lg font-bold text-green-400">
                            {analysis.setup_operativo?.take_profit_2 || analysis.setup_de_entrada?.take_profit_2}
                          </p>
                        </div>
                        {(analysis.setup_operativo?.take_profit_3 || analysis.setup_de_entrada?.take_profit_3) && (
                          <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                            <p className="text-green-400 text-sm">Take Profit 3</p>
                            <p className="text-lg font-bold text-green-400">
                              {analysis.setup_operativo?.take_profit_3 || analysis.setup_de_entrada?.take_profit_3}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Instrucciones MetaTrader */}
                {(analysis.ejecucion_metatrader || analysis.instrucciones_metatrader) && (
                  <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
                    <h3 className="text-lg font-bold mb-4">💻 Instrucciones MetaTrader</h3>
                    
                    {/* Acción */}
                    <div className={`rounded-lg p-4 mb-4 ${
                      (analysis.ejecucion_metatrader?.accion || analysis.instrucciones_metatrader?.accion_inmediata)?.includes('ENTRAR') 
                        ? 'bg-green-500/20 border border-green-500' :
                      (analysis.ejecucion_metatrader?.accion || analysis.instrucciones_metatrader?.accion_inmediata)?.includes('ESPERAR')
                        ? 'bg-yellow-500/20 border border-yellow-500' :
                      'bg-blue-500/20 border border-blue-500'
                    }`}>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">
                          {(analysis.ejecucion_metatrader?.accion || analysis.instrucciones_metatrader?.accion_inmediata)?.includes('ENTRAR') ? '✅' :
                           (analysis.ejecucion_metatrader?.accion || analysis.instrucciones_metatrader?.accion_inmediata)?.includes('ESPERAR') ? '⏳' : '📋'}
                        </span>
                        <div>
                          <p className="font-bold text-white">
                            {analysis.ejecucion_metatrader?.accion || analysis.instrucciones_metatrader?.accion_inmediata}
                          </p>
                          <p className="text-sm text-zinc-300">
                            Tipo: {analysis.ejecucion_metatrader?.tipo_orden || analysis.instrucciones_metatrader?.tipo_orden}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Pasos */}
                    <div className="space-y-2 mb-4">
                      {(analysis.ejecucion_metatrader?.instrucciones || analysis.instrucciones_metatrader?.pasos || []).map((paso, idx) => (
                        <div key={idx} className="flex gap-3 p-3 bg-zinc-900 rounded-lg">
                          <span className="flex-shrink-0 w-7 h-7 bg-green-500 text-black rounded-full flex items-center justify-center text-sm font-bold">
                            {idx + 1}
                          </span>
                          <p className="text-zinc-300">{paso}</p>
                        </div>
                      ))}
                    </div>

                    {/* Confirmación */}
                    {(analysis.ejecucion_metatrader?.confirmacion_requerida || analysis.instrucciones_metatrader?.confirmacion_necesaria) && (
                      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-4">
                        <p className="text-yellow-500 font-semibold">⏳ Confirmación Necesaria</p>
                        <p className="text-zinc-300 mt-1">
                          {analysis.ejecucion_metatrader?.confirmacion_requerida || analysis.instrucciones_metatrader?.confirmacion_necesaria}
                        </p>
                      </div>
                    )}

                    {/* Invalidación */}
                    {(analysis.ejecucion_metatrader?.invalidacion || analysis.instrucciones_metatrader?.invalidacion) && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                        <p className="text-red-500 font-semibold">⛔ El setup se INVALIDA si:</p>
                        <p className="text-zinc-300 mt-1">
                          {analysis.ejecucion_metatrader?.invalidacion || analysis.instrucciones_metatrader?.invalidacion}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Confluencias */}
                {analysis.confluencias && analysis.confluencias.length > 0 && (
                  <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
                    <h3 className="text-lg font-bold mb-4">✅ Confluencias Encontradas</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {analysis.confluencias.map((conf, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg">
                          <span className="text-green-500">✓</span>
                          <span className="text-zinc-300">{conf}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Advertencias */}
                {analysis.advertencias && analysis.advertencias.length > 0 && (
                  <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-orange-500 mb-4">⚠️ Advertencias</h3>
                    {analysis.advertencias.map((adv, idx) => (
                      <p key={idx} className="text-zinc-300 mb-2">• {adv}</p>
                    ))}
                  </div>
                )}

                {/* Resumen */}
                {analysis.resumen_ejecutivo && (
                  <div className="bg-zinc-800/50 rounded-xl p-6">
                    <h3 className="text-lg font-bold mb-2">📝 Resumen</h3>
                    <p className="text-zinc-300 leading-relaxed">{analysis.resumen_ejecutivo}</p>
                  </div>
                )}

                {/* Botones de Registro */}
                <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
                  <h3 className="text-lg font-bold mb-4">📊 ¿Tomaste el trade?</h3>
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
                      className="flex-1 py-4 bg-zinc-600/20 border border-zinc-500 text-zinc-400 font-bold rounded-xl hover:bg-zinc-600/30 transition-all"
                    >
                      ➖ BE
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB: DIARIO ==================== */}
        {activeTab === 'journal' && (
          <div className="space-y-6">
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4">📋 Historial de Trades</h3>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {trades.length === 0 ? (
                  <p className="text-zinc-500 text-center py-8">No hay trades registrados</p>
                ) : (
                  trades.map(trade => (
                    <div key={trade.id} className="flex items-center justify-between p-4 bg-zinc-900 rounded-lg">
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">
                          {trade.result === 'win' ? '✅' : trade.result === 'loss' ? '❌' : '➖'}
                        </span>
                        <div>
                          <p className="font-medium text-white">{trade.asset}</p>
                          <p className="text-sm text-zinc-500">
                            {new Date(trade.date).toLocaleDateString()} • R:R {trade.rr}
                          </p>
                        </div>
                      </div>
                      <span className={`text-lg font-bold ${
                        trade.profit > 0 ? 'text-green-500' : 
                        trade.profit < 0 ? 'text-red-500' : 'text-zinc-400'
                      }`}>
                        {trade.profit > 0 ? '+' : ''}{trade.profit?.toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB: ESTADÍSTICAS ==================== */}
        {activeTab === 'stats' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
              <p className="text-zinc-500 text-sm">Total Trades</p>
              <p className="text-3xl font-bold text-white">{stats.totalTrades}</p>
            </div>
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
              <p className="text-zinc-500 text-sm">Win Rate</p>
              <p className="text-3xl font-bold text-green-500">{stats.winRate}%</p>
            </div>
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
              <p className="text-zinc-500 text-sm">Ganados / Perdidos</p>
              <p className="text-3xl font-bold">
                <span className="text-green-500">{stats.wins}</span>
                <span className="text-zinc-600"> / </span>
                <span className="text-red-500">{stats.losses}</span>
              </p>
            </div>
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
              <p className="text-zinc-500 text-sm">Profit Total</p>
              <p className={`text-3xl font-bold ${parseFloat(stats.totalProfit) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                ${stats.totalProfit}
              </p>
            </div>
          </div>
        )}

        {/* ==================== TAB: AJUSTES ==================== */}
        {activeTab === 'settings' && (
          <div className="max-w-xl space-y-6">
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4">⚙️ Configuración</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-zinc-500 text-sm block mb-2">Balance</label>
                  <input
                    type="number"
                    value={balance}
                    onChange={(e) => setBalance(parseFloat(e.target.value) || 0)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3"
                  />
                </div>
                <div>
                  <label className="text-zinc-500 text-sm block mb-2">Riesgo por trade (%)</label>
                  <input
                    type="number"
                    value={riskPercent}
                    onChange={(e) => setRiskPercent(parseFloat(e.target.value) || 1)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3"
                    min="0.1"
                    max="10"
                    step="0.1"
                  />
                </div>
              </div>
            </div>
            
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4">🔌 Estado del Servidor</h3>
              <div className="space-y-2 text-sm">
                <p>API URL: <span className="text-zinc-400">{API_URL}</span></p>
                <p>Servidor: <span className={apiStatus.connected ? 'text-green-500' : 'text-red-500'}>
                  {apiStatus.connected ? '✅ Conectado' : '❌ Desconectado'}
                </span></p>
                <p>OpenAI: <span className={apiStatus.ai ? 'text-green-500' : 'text-red-500'}>
                  {apiStatus.ai ? '✅ Configurado' : '❌ No configurado'}
                </span></p>
              </div>
              <button
                onClick={checkApiConnection}
                className="mt-4 w-full py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
              >
                🔄 Verificar Conexión
              </button>
            </div>

            <button
              onClick={() => {
                if (confirm('¿Eliminar todos los datos?')) {
                  setTrades([])
                  setBalance(1000)
                  localStorage.clear()
                  toast.success('Datos eliminados')
                }
              }}
              className="w-full py-3 bg-red-500/20 text-red-500 rounded-xl hover:bg-red-500/30"
            >
              🗑️ Eliminar Todos los Datos
            </button>
          </div>
        )}
      </main>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
