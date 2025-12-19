// =============================================
// TRADING MASTER PRO - DASHBOARD v4.0
// Chat Interactivo + Diseño Profesional
// =============================================

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../services/supabase'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app'

// Activos
const ASSETS = {
  'Sintéticos': ['Step Index', 'Volatility 10', 'Volatility 25', 'Volatility 50', 'Volatility 75', 'Volatility 100', 'Boom 500', 'Boom 1000', 'Crash 500', 'Crash 1000'],
  'Forex': ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'EUR/GBP', 'GBP/JPY'],
  'Metales': ['XAU/USD', 'XAG/USD'],
  'Índices': ['US30', 'US100', 'US500', 'GER40'],
  'Crypto': ['BTC/USD', 'ETH/USD', 'SOL/USD']
}

const TIMEFRAMES = [
  { id: 'H1', label: 'H1', desc: 'Tendencia' },
  { id: 'M15', label: '15M', desc: 'Zonas' },
  { id: 'M5', label: '5M', desc: 'Refinar' },
  { id: 'M1', label: '1M', desc: 'Entrada' }
]

export default function Dashboard({ session }) {
  // Estados principales
  const [tab, setTab] = useState('analysis')
  const [images, setImages] = useState({})
  const [category, setCategory] = useState('Forex')
  const [asset, setAsset] = useState('EUR/USD')
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [apiStatus, setApiStatus] = useState({ connected: false, ai: false })
  
  // Estados de trading
  const [balance, setBalance] = useState(() => parseFloat(localStorage.getItem('balance')) || 1000)
  const [trades, setTrades] = useState(() => JSON.parse(localStorage.getItem('trades') || '[]'))
  const [risk, setRisk] = useState(1)
  const [activeTrade, setActiveTrade] = useState(null)
  
  // Estados del chat
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatImage, setChatImage] = useState(null)
  const [chatLoading, setChatLoading] = useState(false)
  const chatRef = useRef(null)
  
  // Estados de estadísticas
  const [advancedStats, setAdvancedStats] = useState(null)

  // Efectos
  useEffect(() => { checkAPI(); fetchAdvancedStats() }, [])
  useEffect(() => {
    localStorage.setItem('balance', balance.toString())
    localStorage.setItem('trades', JSON.stringify(trades))
  }, [balance, trades])
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
  }, [chatMessages])

  // Funciones API
  const checkAPI = async () => {
    try {
      const res = await fetch(`${API_URL}/health`)
      if (res.ok) {
        const aiRes = await fetch(`${API_URL}/api/check-ai`)
        const aiData = await aiRes.json()
        setApiStatus({ connected: true, ai: aiData.connected })
        if (aiData.connected) toast.success('IA conectada')
      }
    } catch { setApiStatus({ connected: false, ai: false }) }
  }

  const fetchAdvancedStats = async () => {
    try {
      const token = session?.access_token || ''
      const res = await fetch(`${API_URL}/api/stats/advanced`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) setAdvancedStats(await res.json())
    } catch (e) { console.error(e) }
  }

  // Funciones de imagen
  const uploadImage = (tf, e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      setImages(p => ({ ...p, [tf]: { preview: e.target.result, base64: e.target.result } }))
      toast.success(`${tf} ✓`)
    }
    reader.readAsDataURL(file)
  }

  const removeImage = (tf) => setImages(p => { const n = { ...p }; delete n[tf]; return n })

  // Análisis
  const analyze = async () => {
    const imgs = TIMEFRAMES.filter(t => images[t.id]).map(t => images[t.id].base64)
    if (!imgs.length) return toast.error('Sube al menos una imagen')
    
    setAnalyzing(true)
    setAnalysis(null)

    try {
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ asset, images: imgs, accountBalance: balance, riskPercent: risk })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      setAnalysis(data.analysis)
      toast.success(data.analysis?.hay_senal ? '🎯 ¡Señal encontrada!' : '⏸️ Sin señal válida')
      
      // Si hay señal, preparar operación activa
      if (data.analysis?.hay_senal && data.analysis?.setup) {
        setActiveTrade({
          asset,
          direction: data.analysis.setup.direccion,
          entry: data.analysis.setup.precio_entrada,
          sl: data.analysis.setup.stop_loss,
          tp1: data.analysis.setup.take_profit_1,
          tp2: data.analysis.setup.take_profit_2,
          analysis: data.analysis,
          startTime: new Date().toISOString()
        })
      }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  // Chat de seguimiento
  const sendChatMessage = async () => {
    if (!chatInput.trim() && !chatImage) return
    
    const userMsg = { role: 'user', content: chatInput, image: chatImage?.preview, time: new Date() }
    setChatMessages(p => [...p, userMsg])
    setChatInput('')
    setChatLoading(true)

    try {
      const body = {
        message: chatInput,
        tradeContext: activeTrade,
        conversationHistory: chatMessages.map(m => ({ role: m.role, content: m.content }))
      }
      
      if (chatImage) {
        body.images = [chatImage.base64]
      }

      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify(body)
      })

      const data = await res.json()
      
      const aiMsg = {
        role: 'assistant',
        content: data.response?.explicacion || data.response?.mensaje || data.rawMessage || 'Sin respuesta',
        action: data.response?.accion_recomendada,
        data: data.response,
        time: new Date()
      }
      
      setChatMessages(p => [...p, aiMsg])
      setChatImage(null)

      // Si recomienda una acción, mostrar toast
      if (data.response?.accion_recomendada) {
        const action = data.response.accion_recomendada
        if (action.includes('CERRAR')) toast.error(`⚠️ ${action}`)
        else if (action.includes('MOVER')) toast('📍 ' + action, { icon: '🔄' })
        else toast.success(action)
      }
    } catch (e) {
      toast.error('Error en chat')
    } finally {
      setChatLoading(false)
    }
  }

  const handleChatImage = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => setChatImage({ preview: e.target.result, base64: e.target.result })
    reader.readAsDataURL(file)
  }

  // Registrar trade
  const recordTrade = (result) => {
    const rrStr = analysis?.setup?.ratio_rr_tp1 || '1:2'
    const rr = parseFloat(rrStr.split(':')[1]) || 2
    const riskUSD = balance * (risk / 100)
    const profit = result === 'win' ? riskUSD * rr : result === 'loss' ? -riskUSD : 0

    setTrades(p => [{ id: Date.now(), asset, result, profit: +profit.toFixed(2), rr, date: new Date().toISOString() }, ...p])
    setBalance(p => +(p + profit).toFixed(2))
    setActiveTrade(null)
    setChatMessages([])
    toast.success(result === 'win' ? `✅ +$${profit.toFixed(2)}` : result === 'loss' ? `❌ -$${Math.abs(profit).toFixed(2)}` : '➖ BE')
    fetchAdvancedStats()
  }

  // Logout
  const logout = async () => { await supabase.auth.signOut(); window.location.href = '/login' }

  // Stats básicas
  const stats = {
    wins: trades.filter(t => t.result === 'win').length,
    losses: trades.filter(t => t.result === 'loss').length,
    get winRate() { return this.wins + this.losses > 0 ? ((this.wins / (this.wins + this.losses)) * 100).toFixed(1) : 0 }
  }

  const imgCount = Object.keys(images).length

  // =============================================
  // RENDER
  // =============================================
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="bg-[#0f0f11] border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold tracking-tight">
              Trading<span className="text-emerald-500">Pro</span>
            </h1>
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${apiStatus.ai ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${apiStatus.ai ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {apiStatus.ai ? 'Online' : 'Offline'}
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <span className="text-zinc-500">Balance <span className={`font-medium ${balance >= 1000 ? 'text-emerald-500' : 'text-red-500'}`}>${balance.toFixed(2)}</span></span>
            <span className="text-zinc-500">WR <span className="font-medium text-white">{stats.winRate}%</span></span>
            <button onClick={logout} className="text-zinc-500 hover:text-white transition">Salir</button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex gap-1 -mb-px">
          {[
            { id: 'analysis', label: 'Análisis' },
            { id: 'stats', label: 'Estadísticas' },
            { id: 'journal', label: 'Diario' },
            { id: 'settings', label: 'Config' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 ${
                tab === t.id 
                  ? 'border-emerald-500 text-emerald-500' 
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto p-4">
        
        {/* ==================== ANÁLISIS ==================== */}
        {tab === 'analysis' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Panel izquierdo - Configuración y subida */}
            <div className="lg:col-span-2 space-y-4">
              {/* Activo */}
              <div className="bg-[#0f0f11] border border-zinc-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-zinc-400">Activo</h3>
                  <span className="text-xs text-zinc-600">{category}</span>
                </div>
                <div className="flex gap-2">
                  <select
                    value={category}
                    onChange={e => { setCategory(e.target.value); setAsset(ASSETS[e.target.value][0]) }}
                    className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm"
                  >
                    {Object.keys(ASSETS).map(c => <option key={c}>{c}</option>)}
                  </select>
                  <select
                    value={asset}
                    onChange={e => setAsset(e.target.value)}
                    className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm"
                  >
                    {ASSETS[category].map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              {/* Gráficos */}
              <div className="bg-[#0f0f11] border border-zinc-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-zinc-400">Gráficos Multi-TF</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${imgCount === 4 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-800 text-zinc-500'}`}>
                    {imgCount}/4
                  </span>
                </div>
                
                <div className="grid grid-cols-4 gap-2">
                  {TIMEFRAMES.map(tf => (
                    <div key={tf.id}>
                      <div className="text-xs text-zinc-500 mb-1.5 text-center">{tf.label}</div>
                      {images[tf.id] ? (
                        <div className="relative group aspect-video">
                          <img src={images[tf.id].preview} className="w-full h-full object-cover rounded-lg border border-emerald-500/50" />
                          <button
                            onClick={() => removeImage(tf.id)}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center rounded-lg"
                          >
                            <span className="text-xs text-white">✕</span>
                          </button>
                        </div>
                      ) : (
                        <label className="aspect-video border border-dashed border-zinc-800 rounded-lg flex items-center justify-center cursor-pointer hover:border-emerald-500/50 transition">
                          <span className="text-zinc-600 text-lg">+</span>
                          <input type="file" accept="image/*" onChange={e => uploadImage(tf.id, e)} className="hidden" />
                        </label>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={analyze}
                  disabled={analyzing || !imgCount || !apiStatus.ai}
                  className={`w-full mt-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    imgCount && apiStatus.ai
                      ? 'bg-emerald-500 text-black hover:bg-emerald-400'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  {analyzing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Analizando...
                    </span>
                  ) : `Analizar ${imgCount ? `(${imgCount})` : ''}`}
                </button>
              </div>

              {/* Resultado del análisis */}
              {analysis && (
                <div className="space-y-3">
                  {/* Header señal */}
                  <div className={`rounded-xl p-5 ${
                    !analysis.hay_senal ? 'bg-zinc-800/50 border border-zinc-700' :
                    analysis.setup?.direccion === 'COMPRA' ? 'bg-emerald-500/10 border border-emerald-500/50' :
                    'bg-red-500/10 border border-red-500/50'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-4xl">
                          {!analysis.hay_senal ? '⏸️' : analysis.setup?.direccion === 'COMPRA' ? '📈' : '📉'}
                        </span>
                        <div>
                          <h2 className={`text-2xl font-bold ${
                            !analysis.hay_senal ? 'text-zinc-400' :
                            analysis.setup?.direccion === 'COMPRA' ? 'text-emerald-500' : 'text-red-500'
                          }`}>
                            {!analysis.hay_senal ? 'SIN SEÑAL' : analysis.setup?.direccion}
                          </h2>
                          <p className="text-sm text-zinc-400">
                            {analysis.hay_senal 
                              ? `${asset} • ${analysis.analisis_estructura?.tendencia_h1 || 'N/A'}`
                              : analysis.razon_no_senal || 'No se cumplen las reglas SMC'}
                          </p>
                        </div>
                      </div>
                      {analysis.hay_senal && (
                        <div className="text-right">
                          <div className="text-3xl font-bold">{analysis.probabilidad || '—'}</div>
                          <div className={`text-xs px-2 py-0.5 rounded-full inline-block ${
                            analysis.confianza === 'ALTA' ? 'bg-emerald-500/20 text-emerald-500' :
                            analysis.confianza === 'MEDIA' ? 'bg-yellow-500/20 text-yellow-500' :
                            'bg-red-500/20 text-red-500'
                          }`}>
                            {analysis.confianza}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Setup si hay señal */}
                  {analysis.hay_senal && analysis.setup && (
                    <>
                      {/* Niveles */}
                      <div className="bg-[#0f0f11] border border-zinc-800/50 rounded-xl p-4">
                        <h4 className="text-xs font-medium text-zinc-500 mb-3 uppercase tracking-wider">Niveles de Entrada</h4>
                        <div className="grid grid-cols-4 gap-3">
                          <div className="bg-zinc-900/50 rounded-lg p-3">
                            <div className="text-xs text-zinc-500">Entrada</div>
                            <div className="text-lg font-mono font-medium">{analysis.setup.precio_entrada}</div>
                          </div>
                          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                            <div className="text-xs text-red-400">Stop Loss</div>
                            <div className="text-lg font-mono font-medium text-red-500">{analysis.setup.stop_loss}</div>
                          </div>
                          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                            <div className="text-xs text-emerald-400">TP1</div>
                            <div className="text-lg font-mono font-medium text-emerald-500">{analysis.setup.take_profit_1}</div>
                          </div>
                          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                            <div className="text-xs text-blue-400">R:R</div>
                            <div className="text-lg font-mono font-medium text-blue-500">{analysis.setup.ratio_rr_tp1}</div>
                          </div>
                        </div>
                        
                        {(analysis.setup.take_profit_2 || analysis.setup.take_profit_3) && (
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            {analysis.setup.take_profit_2 && (
                              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2">
                                <span className="text-xs text-emerald-400">TP2: </span>
                                <span className="font-mono">{analysis.setup.take_profit_2}</span>
                                <span className="text-xs text-zinc-500 ml-2">({analysis.setup.ratio_rr_tp2})</span>
                              </div>
                            )}
                            {analysis.setup.take_profit_3 && (
                              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2">
                                <span className="text-xs text-emerald-400">TP3: </span>
                                <span className="font-mono">{analysis.setup.take_profit_3}</span>
                                <span className="text-xs text-zinc-500 ml-2">({analysis.setup.ratio_rr_tp3})</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Ejecución */}
                      {analysis.ejecucion && (
                        <div className="bg-[#0f0f11] border border-zinc-800/50 rounded-xl p-4">
                          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg mb-3 ${
                            analysis.ejecucion.accion?.includes('ENTRAR') ? 'bg-emerald-500/20 text-emerald-500' :
                            analysis.ejecucion.accion?.includes('NO OPERAR') ? 'bg-red-500/20 text-red-500' :
                            'bg-yellow-500/20 text-yellow-500'
                          }`}>
                            <span className="font-medium">{analysis.ejecucion.accion}</span>
                            <span className="text-xs opacity-70">• {analysis.ejecucion.tipo_orden}</span>
                          </div>
                          
                          <div className="space-y-2">
                            {analysis.ejecucion.instrucciones?.map((inst, i) => (
                              <div key={i} className="flex gap-2 text-sm">
                                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-xs flex-shrink-0">{i+1}</span>
                                <span className="text-zinc-300">{inst}</span>
                              </div>
                            ))}
                          </div>

                          {analysis.ejecucion.invalidacion && (
                            <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                              ⛔ {analysis.ejecucion.invalidacion}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Explicación */}
                      {analysis.explicacion_detallada && (
                        <div className="bg-zinc-900/30 rounded-xl p-4">
                          <h4 className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Análisis Detallado</h4>
                          <p className="text-sm text-zinc-300 leading-relaxed">{analysis.explicacion_detallada}</p>
                        </div>
                      )}

                      {/* Botón abrir chat */}
                      <button
                        onClick={() => setChatOpen(true)}
                        className="w-full py-3 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-xl hover:bg-blue-500/20 transition text-sm font-medium"
                      >
                        💬 Abrir Chat de Seguimiento
                      </button>

                      {/* Registrar resultado */}
                      <div className="flex gap-2">
                        <button onClick={() => recordTrade('win')} className="flex-1 py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 rounded-xl hover:bg-emerald-500/20 transition font-medium">✅ WIN</button>
                        <button onClick={() => recordTrade('loss')} className="flex-1 py-3 bg-red-500/10 border border-red-500/30 text-red-500 rounded-xl hover:bg-red-500/20 transition font-medium">❌ LOSS</button>
                        <button onClick={() => recordTrade('be')} className="flex-1 py-3 bg-zinc-700/50 border border-zinc-600 text-zinc-400 rounded-xl hover:bg-zinc-700 transition font-medium">➖ BE</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Panel derecho - Info SMC */}
            <div className="space-y-4">
              {/* Reglas SMC */}
              <div className="bg-[#0f0f11] border border-zinc-800/50 rounded-xl p-4">
                <h3 className="text-sm font-medium mb-3">📋 Checklist SMC</h3>
                <div className="space-y-2 text-xs">
                  {[
                    { label: 'BOS o CHoCH confirmado', key: 'bos' },
                    { label: 'Retroceso a OB o FVG', key: 'ob' },
                    { label: 'Liquidez barrida', key: 'liq' },
                    { label: 'Confirmación en 1M/5M', key: 'conf' },
                    { label: 'Alineación Multi-TF', key: 'mtf' }
                  ].map(item => (
                    <div key={item.key} className="flex items-center gap-2 p-2 bg-zinc-900/50 rounded-lg">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                        analysis?.confirmacion?.[item.key.replace('bos', 'en_zona_interes')] 
                          ? 'bg-emerald-500 text-black' 
                          : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        {analysis?.confirmacion?.[item.key] ? '✓' : ''}
                      </div>
                      <span className="text-zinc-400">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* R:R por mercado */}
              <div className="bg-[#0f0f11] border border-zinc-800/50 rounded-xl p-4">
                <h3 className="text-sm font-medium mb-3">📊 R:R Objetivo</h3>
                <div className="space-y-1.5 text-xs">
                  {[
                    { market: 'Sintéticos', rr: '1:3 - 1:5' },
                    { market: 'Forex', rr: '1:2 - 1:3' },
                    { market: 'Metales', rr: '1:2 - 1:3' },
                    { market: 'Crypto', rr: '1:3 - 1:5' }
                  ].map(m => (
                    <div key={m.market} className={`flex justify-between p-2 rounded-lg ${category === m.market ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-zinc-900/50'}`}>
                      <span className={category === m.market ? 'text-emerald-500' : 'text-zinc-500'}>{m.market}</span>
                      <span className={category === m.market ? 'text-emerald-500 font-medium' : 'text-zinc-400'}>{m.rr}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats rápidas */}
              <div className="bg-[#0f0f11] border border-zinc-800/50 rounded-xl p-4">
                <h3 className="text-sm font-medium mb-3">📈 Resumen</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-zinc-900/50 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-emerald-500">{stats.wins}</div>
                    <div className="text-[10px] text-zinc-500 uppercase">Ganados</div>
                  </div>
                  <div className="bg-zinc-900/50 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-red-500">{stats.losses}</div>
                    <div className="text-[10px] text-zinc-500 uppercase">Perdidos</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== ESTADÍSTICAS ==================== */}
        {tab === 'stats' && (
          <div className="space-y-4">
            {/* Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Trades', value: advancedStats?.overview?.totalTrades || trades.length, color: 'text-white' },
                { label: 'Win Rate', value: `${advancedStats?.overview?.winRate || stats.winRate}%`, color: 'text-emerald-500' },
                { label: 'Profit', value: `$${advancedStats?.overview?.totalProfit || trades.reduce((s,t) => s + (t.profit || 0), 0).toFixed(2)}`, color: parseFloat(advancedStats?.overview?.totalProfit || 0) >= 0 ? 'text-emerald-500' : 'text-red-500' },
                { label: 'Avg Win', value: `$${advancedStats?.overview?.avgWin || 0}`, color: 'text-emerald-500' },
                { label: 'Avg Loss', value: `$${advancedStats?.overview?.avgLoss || 0}`, color: 'text-red-500' },
                { label: 'Profit Factor', value: advancedStats?.overview?.profitFactor || 'N/A', color: 'text-blue-500' }
              ].map(s => (
                <div key={s.label} className="bg-[#0f0f11] border border-zinc-800/50 rounded-xl p-4">
                  <div className="text-xs text-zinc-500 mb-1">{s.label}</div>
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Rachas */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#0f0f11] border border-zinc-800/50 rounded-xl p-4">
                <div className="text-xs text-zinc-500 mb-1">Racha Actual</div>
                <div className={`text-2xl font-bold ${(advancedStats?.streaks?.currentStreak || 0) > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {advancedStats?.streaks?.currentStreak || 0}
                </div>
              </div>
              <div className="bg-[#0f0f11] border border-zinc-800/50 rounded-xl p-4">
                <div className="text-xs text-zinc-500 mb-1">Mejor Racha W</div>
                <div className="text-2xl font-bold text-emerald-500">{advancedStats?.streaks?.bestWinStreak || 0}</div>
              </div>
              <div className="bg-[#0f0f11] border border-zinc-800/50 rounded-xl p-4">
                <div className="text-xs text-zinc-500 mb-1">Peor Racha L</div>
                <div className="text-2xl font-bold text-red-500">{advancedStats?.streaks?.worstLossStreak || 0}</div>
              </div>
            </div>

            {/* Por activo */}
            {advancedStats?.byAsset?.length > 0 && (
              <div className="bg-[#0f0f11] border border-zinc-800/50 rounded-xl p-4">
                <h3 className="text-sm font-medium mb-3">Por Activo</h3>
                <div className="space-y-2">
                  {advancedStats.byAsset.map(a => (
                    <div key={a.asset} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg">
                      <span className="font-medium">{a.asset}</span>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-emerald-500">{a.wins}W</span>
                        <span className="text-red-500">{a.losses}L</span>
                        <span className="text-zinc-400">{a.winRate}%</span>
                        <span className={a.profit >= 0 ? 'text-emerald-500' : 'text-red-500'}>${a.profit.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== DIARIO ==================== */}
        {tab === 'journal' && (
          <div className="bg-[#0f0f11] border border-zinc-800/50 rounded-xl p-4">
            <h3 className="text-sm font-medium mb-4">Historial de Operaciones</h3>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {trades.length === 0 ? (
                <p className="text-center text-zinc-500 py-8">Sin operaciones registradas</p>
              ) : trades.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{t.result === 'win' ? '✅' : t.result === 'loss' ? '❌' : '➖'}</span>
                    <div>
                      <div className="font-medium">{t.asset}</div>
                      <div className="text-xs text-zinc-500">{new Date(t.date).toLocaleDateString()} • R:R {t.rr}</div>
                    </div>
                  </div>
                  <span className={`font-bold ${t.profit > 0 ? 'text-emerald-500' : t.profit < 0 ? 'text-red-500' : 'text-zinc-400'}`}>
                    {t.profit > 0 ? '+' : ''}{t.profit?.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== CONFIG ==================== */}
        {tab === 'settings' && (
          <div className="max-w-md space-y-4">
            <div className="bg-[#0f0f11] border border-zinc-800/50 rounded-xl p-4 space-y-4">
              <div>
                <label className="text-xs text-zinc-500">Balance</label>
                <input type="number" value={balance} onChange={e => setBalance(+e.target.value || 0)} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2.5 mt-1" />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Riesgo (%)</label>
                <input type="number" value={risk} onChange={e => setRisk(+e.target.value || 1)} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2.5 mt-1" />
              </div>
            </div>
            <button
              onClick={() => { setTrades([]); setBalance(1000); localStorage.clear(); toast.success('Reset') }}
              className="w-full py-2.5 bg-red-500/10 text-red-500 rounded-xl text-sm"
            >
              Resetear Datos
            </button>
          </div>
        )}
      </main>

      {/* ==================== CHAT MODAL ==================== */}
      {chatOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f0f11] border border-zinc-800 rounded-2xl w-full max-w-2xl h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div>
                <h3 className="font-medium">Chat de Seguimiento</h3>
                <p className="text-xs text-zinc-500">{asset} • {activeTrade?.direction || 'N/A'}</p>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>

            {/* Messages */}
            <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 && (
                <div className="text-center text-zinc-500 text-sm py-8">
                  <p>💬 Envía mensajes o imágenes para actualizar tu operación</p>
                  <p className="text-xs mt-2">La IA te ayudará a decidir si mantener, cerrar o mover el SL</p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl p-3 ${
                    msg.role === 'user' ? 'bg-emerald-500/20 text-emerald-100' : 'bg-zinc-800'
                  }`}>
                    {msg.image && <img src={msg.image} className="rounded-lg mb-2 max-h-32" />}
                    <p className="text-sm">{msg.content}</p>
                    {msg.action && (
                      <div className={`mt-2 text-xs px-2 py-1 rounded inline-block ${
                        msg.action.includes('CERRAR') ? 'bg-red-500/20 text-red-400' :
                        msg.action.includes('MANTENER') ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {msg.action}
                      </div>
                    )}
                    <div className="text-[10px] text-zinc-500 mt-1">
                      {new Date(msg.time).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-zinc-800 rounded-xl p-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-zinc-800">
              {chatImage && (
                <div className="mb-2 relative inline-block">
                  <img src={chatImage.preview} className="h-16 rounded-lg" />
                  <button onClick={() => setChatImage(null)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs">✕</button>
                </div>
              )}
              <div className="flex gap-2">
                <label className="p-2.5 bg-zinc-800 rounded-lg cursor-pointer hover:bg-zinc-700">
                  <span>📷</span>
                  <input type="file" accept="image/*" onChange={handleChatImage} className="hidden" />
                </label>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 bg-zinc-800 rounded-lg px-4 py-2.5 text-sm"
                />
                <button
                  onClick={sendChatMessage}
                  disabled={chatLoading}
                  className="px-4 bg-emerald-500 text-black rounded-lg font-medium disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
