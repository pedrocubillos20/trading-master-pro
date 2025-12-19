// =============================================
// TRADING MASTER PRO - DASHBOARD v3.0
// =============================================

import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import toast from 'react-hot-toast'

// API URL del backend
const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app'

// Activos disponibles
const ASSETS = {
  'Sintéticos Deriv': [
    'Volatility 10 Index', 'Volatility 25 Index', 'Volatility 50 Index',
    'Volatility 75 Index', 'Volatility 100 Index', 'Step Index',
    'Boom 500 Index', 'Boom 1000 Index', 'Crash 500 Index', 'Crash 1000 Index'
  ],
  'Forex': ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD'],
  'Metales': ['XAU/USD (Oro)', 'XAG/USD (Plata)'],
  'Índices': ['US30', 'US100', 'US500', 'GER40'],
  'Crypto': ['BTC/USD', 'ETH/USD']
}

const TIMEFRAMES = [
  { id: 'H1', label: 'H1', desc: 'Contexto' },
  { id: 'M15', label: '15M', desc: 'Zonas' },
  { id: 'M5', label: '5M', desc: 'Refinamiento' },
  { id: 'M1', label: '1M', desc: 'Entrada' }
]

export default function Dashboard({ session }) {
  // Estados
  const [activeTab, setActiveTab] = useState('analysis')
  const [images, setImages] = useState({})
  const [selectedCategory, setSelectedCategory] = useState('Forex')
  const [selectedAsset, setSelectedAsset] = useState('EUR/USD')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [apiStatus, setApiStatus] = useState({ connected: false, ai: false })
  const [balance, setBalance] = useState(() => parseFloat(localStorage.getItem('balance')) || 1000)
  const [trades, setTrades] = useState(() => JSON.parse(localStorage.getItem('trades') || '[]'))
  const [riskPercent, setRiskPercent] = useState(1)

  // Verificar API al cargar
  useEffect(() => {
    checkAPI()
  }, [])

  // Guardar en localStorage
  useEffect(() => {
    localStorage.setItem('balance', balance.toString())
    localStorage.setItem('trades', JSON.stringify(trades))
  }, [balance, trades])

  // Verificar conexión API
  const checkAPI = async () => {
    try {
      const res = await fetch(`${API_URL}/health`)
      if (res.ok) {
        setApiStatus(prev => ({ ...prev, connected: true }))
        // Verificar AI
        const aiRes = await fetch(`${API_URL}/api/check-ai`)
        const aiData = await aiRes.json()
        setApiStatus({ connected: true, ai: aiData.connected })
        if (aiData.connected) {
          toast.success('✅ IA conectada')
        }
      }
    } catch (e) {
      console.error('API Error:', e)
      setApiStatus({ connected: false, ai: false })
    }
  }

  // Subir imagen
  const handleImageUpload = (tf, e) => {
    const file = e.target.files[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      setImages(prev => ({
        ...prev,
        [tf]: { preview: e.target.result, base64: e.target.result }
      }))
      toast.success(`✓ ${tf} cargada`)
    }
    reader.readAsDataURL(file)
  }

  // Eliminar imagen
  const removeImage = (tf) => {
    setImages(prev => {
      const newImages = { ...prev }
      delete newImages[tf]
      return newImages
    })
  }

  // Analizar
  const analyzeCharts = async () => {
    const imageArray = TIMEFRAMES.filter(tf => images[tf.id]).map(tf => images[tf.id].base64)
    
    if (imageArray.length === 0) {
      toast.error('Sube al menos una imagen')
      return
    }

    setIsAnalyzing(true)
    setAnalysis(null)

    try {
      const token = session?.access_token || ''
      
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          asset: selectedAsset,
          images: imageArray,
          accountBalance: balance,
          riskPercent
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error en análisis')
      }

      setAnalysis(data.analysis)
      toast.success('🎯 ¡Análisis completado!')

    } catch (error) {
      console.error('Error:', error)
      toast.error(error.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Registrar trade
  const addTrade = (result) => {
    const rr = parseFloat(analysis?.setup_operativo?.ratio_rr?.replace('1:', '') || '2')
    const riskUSD = balance * (riskPercent / 100)
    const profit = result === 'win' ? riskUSD * rr : result === 'loss' ? -riskUSD : 0

    setTrades(prev => [{
      id: Date.now(),
      asset: selectedAsset,
      result,
      profit: parseFloat(profit.toFixed(2)),
      rr,
      date: new Date().toISOString()
    }, ...prev])
    
    setBalance(prev => parseFloat((prev + profit).toFixed(2)))
    toast.success(result === 'win' ? `✅ +$${profit.toFixed(2)}` : result === 'loss' ? `❌ -$${Math.abs(profit).toFixed(2)}` : '➖ BE')
  }

  // Cerrar sesión
  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // Stats
  const stats = {
    wins: trades.filter(t => t.result === 'win').length,
    losses: trades.filter(t => t.result === 'loss').length,
    get winRate() {
      const total = this.wins + this.losses
      return total > 0 ? ((this.wins / total) * 100).toFixed(1) : 0
    }
  }

  const uploadedCount = Object.keys(images).length

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="bg-[#111] border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">
              Trading Master <span className="text-green-500">Pro</span>
            </h1>
            <span className={`px-2 py-1 rounded text-xs ${apiStatus.ai ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
              {apiStatus.ai ? '● IA Online' : '○ IA Offline'}
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <span className="text-zinc-400">Balance: <span className={balance >= 1000 ? 'text-green-500' : 'text-red-500'}>${balance.toFixed(2)}</span></span>
            <span className="text-zinc-400">Win Rate: <span className="text-white">{stats.winRate}%</span></span>
            <span className="text-zinc-500">{session?.user?.email}</span>
            <button onClick={handleLogout} className="text-red-400 hover:text-red-300">Salir</button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-2 mt-4">
          {['analysis', 'journal', 'settings'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm ${activeTab === tab ? 'bg-green-500 text-black font-bold' : 'bg-zinc-800 text-zinc-400'}`}
            >
              {tab === 'analysis' ? '📊 Análisis' : tab === 'journal' ? '📝 Diario' : '⚙️ Ajustes'}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="p-6 max-w-7xl mx-auto">
        
        {/* ANÁLISIS */}
        {activeTab === 'analysis' && (
          <div className="space-y-6">
            {/* Selector Activo */}
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-5">
              <h3 className="font-semibold mb-4">🎯 Seleccionar Activo</h3>
              <div className="grid grid-cols-2 gap-4">
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value)
                    setSelectedAsset(ASSETS[e.target.value][0])
                  }}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3"
                >
                  {Object.keys(ASSETS).map(cat => <option key={cat}>{cat}</option>)}
                </select>
                <select
                  value={selectedAsset}
                  onChange={(e) => setSelectedAsset(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3"
                >
                  {ASSETS[selectedCategory].map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
            </div>

            {/* Upload Imágenes */}
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold">📷 Subir Gráficos</h3>
                <span className={`px-3 py-1 rounded-full text-sm ${uploadedCount === 4 ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                  {uploadedCount}/4
                </span>
              </div>

              <div className="grid grid-cols-4 gap-4">
                {TIMEFRAMES.map(tf => (
                  <div key={tf.id}>
                    <p className="text-sm text-zinc-400 mb-2">{tf.label} - {tf.desc}</p>
                    {images[tf.id] ? (
                      <div className="relative group">
                        <img src={images[tf.id].preview} className="w-full h-28 object-cover rounded-lg border-2 border-green-500" />
                        <button
                          onClick={() => removeImage(tf.id)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs opacity-0 group-hover:opacity-100"
                        >✕</button>
                      </div>
                    ) : (
                      <label className="border-2 border-dashed border-zinc-700 rounded-lg h-28 flex flex-col items-center justify-center cursor-pointer hover:border-green-500">
                        <span className="text-2xl text-zinc-600">+</span>
                        <span className="text-xs text-zinc-500">{tf.label}</span>
                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(tf.id, e)} className="hidden" />
                      </label>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={analyzeCharts}
                disabled={isAnalyzing || uploadedCount === 0 || !apiStatus.ai}
                className={`w-full mt-6 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 ${
                  uploadedCount > 0 && apiStatus.ai
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-black hover:from-green-400'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Analizando...
                  </>
                ) : `🤖 Analizar (${uploadedCount} imágenes)`}
              </button>
            </div>

            {/* Resultado */}
            {analysis && (
              <div className="space-y-4">
                {/* Header */}
                <div className={`rounded-xl p-6 ${
                  analysis.analisis_general?.sesgo_operativo === 'COMPRA' ? 'bg-green-500/10 border-2 border-green-500' :
                  analysis.analisis_general?.sesgo_operativo === 'VENTA' ? 'bg-red-500/10 border-2 border-red-500' :
                  'bg-zinc-800 border border-zinc-700'
                }`}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <span className="text-5xl">
                        {analysis.analisis_general?.sesgo_operativo === 'COMPRA' ? '📈' :
                         analysis.analisis_general?.sesgo_operativo === 'VENTA' ? '📉' : '⏸️'}
                      </span>
                      <div>
                        <h2 className={`text-3xl font-bold ${
                          analysis.analisis_general?.sesgo_operativo === 'COMPRA' ? 'text-green-500' :
                          analysis.analisis_general?.sesgo_operativo === 'VENTA' ? 'text-red-500' : 'text-zinc-400'
                        }`}>
                          {analysis.analisis_general?.sesgo_operativo || 'ANÁLISIS'}
                        </h2>
                        <p className="text-zinc-400">{selectedAsset} • {analysis.analisis_general?.tendencia_principal}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-4xl font-bold text-white">{analysis.analisis_general?.probabilidad_exito || '—'}</p>
                      <p className="text-zinc-500">Probabilidad</p>
                    </div>
                  </div>
                </div>

                {/* Setup */}
                {(analysis.setup_operativo || analysis.setup_de_entrada) && (
                  <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
                    <h3 className="font-bold mb-4">🎯 Setup de Entrada</h3>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-zinc-900 rounded-lg p-4">
                        <p className="text-zinc-500 text-sm">Entrada</p>
                        <p className="text-2xl font-bold">{analysis.setup_operativo?.precio_entrada || analysis.setup_de_entrada?.precio_entrada || '—'}</p>
                      </div>
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                        <p className="text-red-400 text-sm">Stop Loss</p>
                        <p className="text-2xl font-bold text-red-500">{analysis.setup_operativo?.stop_loss || analysis.setup_de_entrada?.stop_loss || '—'}</p>
                      </div>
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                        <p className="text-green-400 text-sm">Take Profit</p>
                        <p className="text-2xl font-bold text-green-500">{analysis.setup_operativo?.take_profit_1 || analysis.setup_de_entrada?.take_profit_1 || '—'}</p>
                      </div>
                      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                        <p className="text-blue-400 text-sm">R:R</p>
                        <p className="text-2xl font-bold text-blue-500">{analysis.setup_operativo?.ratio_rr || analysis.setup_de_entrada?.ratio_rr || '—'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Instrucciones */}
                {(analysis.ejecucion_metatrader || analysis.instrucciones_metatrader) && (
                  <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
                    <h3 className="font-bold mb-4">💻 Instrucciones MetaTrader</h3>
                    <div className={`rounded-lg p-4 mb-4 ${
                      (analysis.ejecucion_metatrader?.accion || analysis.instrucciones_metatrader?.accion_inmediata)?.includes('ENTRAR')
                        ? 'bg-green-500/20 border border-green-500'
                        : 'bg-yellow-500/20 border border-yellow-500'
                    }`}>
                      <p className="font-bold">{analysis.ejecucion_metatrader?.accion || analysis.instrucciones_metatrader?.accion_inmediata}</p>
                      <p className="text-sm text-zinc-300">Tipo: {analysis.ejecucion_metatrader?.tipo_orden || analysis.instrucciones_metatrader?.tipo_orden}</p>
                    </div>
                    <div className="space-y-2">
                      {(analysis.ejecucion_metatrader?.instrucciones || analysis.instrucciones_metatrader?.pasos || []).map((paso, i) => (
                        <div key={i} className="flex gap-3 p-3 bg-zinc-900 rounded-lg">
                          <span className="bg-green-500 text-black w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">{i+1}</span>
                          <p className="text-zinc-300">{paso}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resumen */}
                {analysis.resumen_ejecutivo && (
                  <div className="bg-zinc-800/50 rounded-xl p-6">
                    <h3 className="font-bold mb-2">📝 Resumen</h3>
                    <p className="text-zinc-300">{analysis.resumen_ejecutivo}</p>
                  </div>
                )}

                {/* Botones Trade */}
                <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
                  <h3 className="font-bold mb-4">¿Resultado del trade?</h3>
                  <div className="flex gap-4">
                    <button onClick={() => addTrade('win')} className="flex-1 py-4 bg-green-500/20 border border-green-500 text-green-500 font-bold rounded-xl hover:bg-green-500/30">✅ WIN</button>
                    <button onClick={() => addTrade('loss')} className="flex-1 py-4 bg-red-500/20 border border-red-500 text-red-500 font-bold rounded-xl hover:bg-red-500/30">❌ LOSS</button>
                    <button onClick={() => addTrade('be')} className="flex-1 py-4 bg-zinc-600/20 border border-zinc-500 text-zinc-400 font-bold rounded-xl hover:bg-zinc-600/30">➖ BE</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* DIARIO */}
        {activeTab === 'journal' && (
          <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
            <h3 className="font-bold mb-4">📋 Historial de Trades</h3>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {trades.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">No hay trades</p>
              ) : trades.map(t => (
                <div key={t.id} className="flex justify-between items-center p-4 bg-zinc-900 rounded-lg">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{t.result === 'win' ? '✅' : t.result === 'loss' ? '❌' : '➖'}</span>
                    <div>
                      <p className="font-medium">{t.asset}</p>
                      <p className="text-sm text-zinc-500">{new Date(t.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className={`text-lg font-bold ${t.profit > 0 ? 'text-green-500' : t.profit < 0 ? 'text-red-500' : 'text-zinc-400'}`}>
                    {t.profit > 0 ? '+' : ''}{t.profit?.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AJUSTES */}
        {activeTab === 'settings' && (
          <div className="max-w-xl space-y-6">
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
              <h3 className="font-bold mb-4">⚙️ Configuración</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-zinc-500 text-sm">Balance</label>
                  <input type="number" value={balance} onChange={e => setBalance(parseFloat(e.target.value) || 0)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 mt-1" />
                </div>
                <div>
                  <label className="text-zinc-500 text-sm">Riesgo por trade (%)</label>
                  <input type="number" value={riskPercent} onChange={e => setRiskPercent(parseFloat(e.target.value) || 1)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 mt-1" />
                </div>
              </div>
            </div>
            
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-6">
              <h3 className="font-bold mb-4">🔌 Estado</h3>
              <p className="text-sm">API: <span className={apiStatus.connected ? 'text-green-500' : 'text-red-500'}>{apiStatus.connected ? '✅ Conectado' : '❌ Desconectado'}</span></p>
              <p className="text-sm">OpenAI: <span className={apiStatus.ai ? 'text-green-500' : 'text-red-500'}>{apiStatus.ai ? '✅ Activo' : '❌ Inactivo'}</span></p>
              <button onClick={checkAPI} className="mt-4 px-4 py-2 bg-zinc-800 rounded-lg text-sm">🔄 Reconectar</button>
            </div>

            <button
              onClick={() => { setTrades([]); setBalance(1000); localStorage.clear(); toast.success('Datos eliminados') }}
              className="w-full py-3 bg-red-500/20 text-red-500 rounded-xl"
            >🗑️ Eliminar Datos</button>
          </div>
        )}
      </main>
    </div>
  )
}
