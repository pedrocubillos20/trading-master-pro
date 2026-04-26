import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from './config/plans.js'

// ─── Colores del tema ───────────────────────────────────────────────────
const C = {
  bg0:'#0d1117', bg1:'#161b22', bg2:'#1c2330', bg3:'#21262d',
  border:'#30363d', text:'#e6edf3', muted:'#7d8590',
  teal:'#00d4aa', tealDark:'#00b894', tealBg:'rgba(0,212,170,.12)',
  red:'#ff6b6b',  redBg:'rgba(255,107,107,.12)',
  yellow:'#f9ca24', green:'#3fb950', orange:'#f0883e',
  bull:'#3fb950', bear:'#ff6b6b'
}

// ─── Dibujar gráfico de velas con overlays SMC ──────────────────────────
function drawChart(canvas, state) {
  const { candles, demandZones, supplyZones, choch, bos, swings, structure,
          signal, lockedSignal, currentTF, chochM15, bosM15 } = state
  if (!canvas || !candles || candles.length < 5) return

  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width  = rect.width  * dpr
  canvas.height = rect.height * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  const W = rect.width, H = rect.height

  ctx.fillStyle = C.bg1; ctx.fillRect(0,0,W,H)

  const ML=62, MR=12, MT=18, MB=28
  const CW=W-ML-MR, CH=H-MT-MB
  const vis = candles.slice(-Math.min(candles.length, Math.floor(CW/8)+20))
  if (!vis.length) return

  const allP = vis.flatMap(c=>[c.high,c.low])
  const mn=Math.min(...allP), mx=Math.max(...allP), rng=mx-mn||1
  const PN=mn-rng*.07, PX=mx+rng*.09, PR=PX-PN
  const py = p => MT+CH*(1-(p-PN)/PR)
  const n=vis.length, SL=CW/n, BW=Math.max(Math.floor(SL*.65),2)
  const cx = i => ML+SL*i+SL/2
  const visOff = candles.length - vis.length

  // Grid
  ctx.strokeStyle='rgba(255,255,255,.04)'; ctx.lineWidth=1
  for (let p=Math.ceil(PN/5)*5; p<=PX; p+=5) {
    ctx.beginPath(); ctx.moveTo(ML,py(p)); ctx.lineTo(ML+CW,py(p)); ctx.stroke()
  }

  // ── OB Zones ──
  const drawZone = (zones, fill, stroke, label) => {
    zones.filter(z=>!z.mitigated).forEach(z => {
      const zi = z.index - visOff
      if (zi < -30) return
      const x1 = Math.max(ML, cx(Math.max(0,zi)))
      const x2 = ML+CW
      const y1=py(z.high), y2=py(z.low)
      ctx.fillStyle=fill; ctx.fillRect(x1,y1,x2-x1,y2-y1)
      ctx.strokeStyle=stroke; ctx.lineWidth=1.5
      ctx.strokeRect(x1,y1,x2-x1,y2-y1)
      ctx.fillStyle=stroke; ctx.font='bold 9px system-ui'; ctx.textAlign='left'
      const lbl = z.isStructureOB ? label+' ★' : label
      ctx.fillText(lbl, x1+4, y1+11)
    })
  }
  drawZone(demandZones||[], 'rgba(63,185,80,.12)', C.green, 'OB demanda')
  drawZone(supplyZones||[], 'rgba(255,107,107,.12)', C.red, 'OB oferta')

  // ── BOS lines ──
  const drawLevel = (lvl, color, tag, dashed=true) => {
    if (!lvl) return
    const bi = (lvl.breakIndex||0) - visOff
    const startX = bi >= 0 ? cx(bi) : ML
    if (startX > ML+CW) return
    ctx.strokeStyle=color; ctx.lineWidth=1.5
    if (dashed) ctx.setLineDash([8,5]); else ctx.setLineDash([])
    ctx.beginPath(); ctx.moveTo(startX,py(lvl.level)); ctx.lineTo(ML+CW,py(lvl.level)); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle=color; ctx.font='bold 8px system-ui'; ctx.textAlign='right'
    ctx.fillText(tag, ML+CW-3, py(lvl.level)-3)
  }
  drawLevel(bos,   C.text,   'BOS M5')
  drawLevel(choch, C.yellow, 'CHoCH M5')
  drawLevel(bosM15,   'rgba(200,200,255,.7)', 'BOS M15')
  drawLevel(chochM15, 'rgba(255,220,80,.6)',  'CHoCH M15')

  // ── Swing labels ──
  const labels = structure?.labels || []
  labels.forEach(lb => {
    const li = lb.index - visOff
    if (li < 0 || li >= n) return
    const isBull = lb.type==='HH'||lb.type==='HL'
    const y = isBull ? py(vis[li]?.high||0)-14 : py(vis[li]?.low||0)+14
    const bg  = lb.type==='HH'?'rgba(63,185,80,.18)':lb.type==='LL'?'rgba(255,107,107,.18)':'rgba(249,202,36,.18)'
    const clr = lb.type==='HH'||lb.type==='HL' ? C.green : lb.type==='LL'||lb.type==='LH' ? C.red : C.yellow
    // pill
    const tw = lb.type.length*6+8
    ctx.fillStyle=bg; ctx.strokeStyle=clr; ctx.lineWidth=.8
    ctx.beginPath(); ctx.roundRect(cx(li)-tw/2,y-8,tw,13,3); ctx.fill(); ctx.stroke()
    ctx.fillStyle=clr; ctx.font='bold 8px system-ui'; ctx.textAlign='center'
    ctx.fillText(lb.type, cx(li), y)
  })

  // ── Entry arrows (locked signal) ──
  if (lockedSignal) {
    const { action, entry, stop, tp1, tp2, tp3 } = lockedSignal
    const isLong = action==='LONG'
    const ec = isLong ? C.green : C.red
    // TP/SL dashed lines
    [[tp1,'TP1',C.teal],[tp2,'TP2',C.teal],[tp3,'TP3',C.teal],[stop,'SL',C.red]].forEach(([p,tag,col])=>{
      ctx.strokeStyle=col+'88'; ctx.lineWidth=1; ctx.setLineDash([4,4])
      ctx.beginPath(); ctx.moveTo(ML,py(p)); ctx.lineTo(ML+CW,py(p)); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle=col; ctx.font='bold 8px system-ui'; ctx.textAlign='right'
      ctx.fillText(tag+' '+p.toFixed(2), ML+CW-3, py(p)+(isLong?-3:10))
    })
    // Arrow
    const ex=ML+CW-40, ey=py(entry)
    ctx.strokeStyle=ec; ctx.lineWidth=3; ctx.fillStyle=ec
    ctx.beginPath(); ctx.moveTo(ex, ey+(isLong?30:-30)); ctx.lineTo(ex,ey+(isLong?8:-8)); ctx.stroke()
    ctx.beginPath()
    if (isLong) { ctx.moveTo(ex-8,ey+16); ctx.lineTo(ex,ey); ctx.lineTo(ex+8,ey+16) }
    else        { ctx.moveTo(ex-8,ey-16); ctx.lineTo(ex,ey); ctx.lineTo(ex+8,ey-16) }
    ctx.fill()
  }

  // ── Candles ──
  vis.forEach((c,i) => {
    const x=cx(i), bull=c.close>=c.open, col=bull?C.bull:C.bear
    ctx.strokeStyle=col; ctx.lineWidth=1.5
    ctx.beginPath(); ctx.moveTo(x,py(c.high)); ctx.lineTo(x,py(c.low)); ctx.stroke()
    const bt=py(Math.max(c.open,c.close)), bh=Math.max(py(Math.min(c.open,c.close))-bt,1)
    ctx.fillStyle=bull?C.bull+'cc':C.bear+'cc'; ctx.fillRect(x-BW/2,bt,BW,bh)
    if (!bull) { ctx.strokeStyle=C.bear; ctx.lineWidth=.8; ctx.strokeRect(x-BW/2,bt,BW,bh) }
  })

  // ── Y axis ──
  ctx.fillStyle=C.muted; ctx.font='9px system-ui'; ctx.textAlign='right'
  for (let p=Math.ceil(PN/10)*10; p<=PX; p+=10) {
    const y=py(p); if (y>MT+8&&y<MT+CH) ctx.fillText(p.toFixed(0),ML-4,y+3)
  }

  // ── Current price line ──
  const last=vis[vis.length-1]
  if (last) {
    const py2=py(last.close)
    ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.lineWidth=1; ctx.setLineDash([2,3])
    ctx.beginPath(); ctx.moveTo(ML,py2); ctx.lineTo(ML+CW,py2); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle=C.teal
    ctx.beginPath(); ctx.roundRect(ML+CW-1,py2-8,54,16,3); ctx.fill()
    ctx.fillStyle='#000'; ctx.font='bold 9px system-ui'; ctx.textAlign='left'
    ctx.fillText(last.close.toFixed(2), ML+CW+3, py2+4)
  }

  // Border
  ctx.strokeStyle=C.border+'88'; ctx.lineWidth=1; ctx.setLineDash([])
  ctx.strokeRect(ML,MT,CW,CH)
}

// ─── Componentes UI ───────────────────────────────────────────────────────
const Pill = ({type, text}) => {
  const cls = type==='BUY'||type==='LONG'?'pill pill-buy':type==='SELL'||type==='SHORT'?'pill pill-sell':type==='WAIT'?'pill pill-wait':'pill pill-load'
  return <span className={cls}>{text}</span>
}

const StatCard = ({label, value, sub, color}) => (
  <div className="card" style={{padding:'12px 16px'}}>
    <div style={{fontSize:10,color:C.muted,fontWeight:600,letterSpacing:'.05em',marginBottom:4}}>{label}</div>
    <div style={{fontSize:26,fontWeight:800,color:color||C.text}}>{value}</div>
    {sub && <div style={{fontSize:10,color:C.muted,marginTop:2}}>{sub}</div>}
  </div>
)

const TFBtn = ({label, active, onClick}) => (
  <button className={`btn-ghost${active?' active':''}`} onClick={onClick} style={{padding:'3px 10px',fontSize:11}}>{label}</button>
)

const StructureTag = ({label, trend}) => {
  const color = trend==='BULLISH'?C.teal:trend==='BEARISH'?C.red:C.muted
  const bg    = trend==='BULLISH'?'rgba(0,212,170,.1)':trend==='BEARISH'?'rgba(255,107,107,.1)':'rgba(255,255,255,.05)'
  return (
    <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,border:`1px solid ${color}`,background:bg,color}}>
      {label}: {trend||'···'}
    </span>
  )
}

// ─── ELISA Chat ───────────────────────────────────────────────────────────
function ElisaChat({ symbol, onClose }) {
  const [msgs, setMsgs] = useState([{from:'elisa',text:'¡Hola! Soy Elisa 💜 ¿Qué quieres saber del mercado?'}])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)

  useEffect(() => endRef.current?.scrollIntoView({behavior:'smooth'}), [msgs])

  const send = async () => {
    if (!input.trim() || loading) return
    const q = input.trim(); setInput(''); setLoading(true)
    setMsgs(m => [...m, {from:'user',text:q}])
    try {
      const r = await fetch(`${API_URL}/api/ai/chat`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({question:q, symbol})
      })
      const d = await r.json()
      setMsgs(m => [...m, {from:'elisa', text: d.answer||'Sin respuesta'}])
    } catch { setMsgs(m => [...m, {from:'elisa',text:'Error de conexión 😔'}]) }
    setLoading(false)
  }

  return (
    <div style={{
      position:'fixed', right:20, bottom:80, width:320, height:460,
      background:C.bg1, border:`1px solid ${C.border}`, borderRadius:12,
      display:'flex', flexDirection:'column', zIndex:100, boxShadow:'0 20px 60px #00000080'
    }}>
      <div style={{
        padding:'12px 16px', borderBottom:`1px solid ${C.border}`,
        display:'flex', alignItems:'center', justifyContent:'space-between'
      }}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:32,height:32,borderRadius:50,background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',border:`1px solid ${C.teal}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>💜</div>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:C.teal}}>ELISA IA</div>
            <div style={{fontSize:10,color:C.muted}}>Asistente SMC</div>
          </div>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:18}}>✕</button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:8}}>
        {msgs.map((m,i) => (
          <div key={i} style={{
            alignSelf: m.from==='user'?'flex-end':'flex-start',
            maxWidth:'85%', padding:'8px 12px', borderRadius:10,
            background: m.from==='user'?C.tealBg:C.bg2,
            border:`1px solid ${m.from==='user'?C.tealDark:C.border}`,
            fontSize:12, color:C.text, lineHeight:1.5,
            whiteSpace:'pre-wrap'
          }}>{m.text}</div>
        ))}
        {loading && <div style={{alignSelf:'flex-start',color:C.muted,fontSize:11}}>Elisa está pensando...</div>}
        <div ref={endRef}/>
      </div>
      <div style={{padding:'8px 12px',borderTop:`1px solid ${C.border}`,display:'flex',gap:8}}>
        <input
          value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&send()}
          placeholder="Pregunta algo..."
          style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 10px',color:C.text,fontSize:12,outline:'none'}}
        />
        <button onClick={send} className="btn-teal" style={{padding:'7px 14px',fontSize:12}}>→</button>
      </div>
    </div>
  )
}

// ─── Signal Card ──────────────────────────────────────────────────────────
function SignalCard({ signal, assetConfig, onClose }) {
  if (!signal) return null
  const isLong = signal.action==='LONG'
  const col = isLong?C.teal:C.red
  const bg  = isLong?C.tealBg:C.redBg

  return (
    <div style={{
      position:'fixed', left:20, bottom:80, width:260,
      background:C.bg1, border:`2px solid ${col}`, borderRadius:10,
      padding:14, zIndex:99, boxShadow:`0 0 20px ${col}33`
    }} className="animate-slide-up">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <span style={{fontSize:18}}>{assetConfig?.emoji||'📊'}</span>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:col}}>{isLong?'🟢 COMPRA':'🔴 VENTA'}</div>
            <div style={{fontSize:10,color:C.muted}}>{signal.model} · {signal.score}%</div>
          </div>
        </div>
        {onClose && <button onClick={onClose} style={{background:'none',border:'none',color:C.muted,cursor:'pointer'}}>✕</button>}
      </div>
      <div style={{fontSize:11,display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px 8px'}}>
        {[['Entry',signal.entry],['SL',signal.stop,C.red],['TP1',signal.tp1,C.teal],
          ['TP2',signal.tp2,C.teal],['TP3',signal.tp3,C.teal]].map(([k,v,c])=>(
          <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:`1px solid ${C.border}`}}>
            <span style={{color:C.muted}}>{k}</span>
            <span style={{fontWeight:700,color:c||C.text}}>{v?.toFixed?.(2)}</span>
          </div>
        ))}
      </div>
      <div style={{marginTop:8,fontSize:10,color:C.muted,lineHeight:1.4}}>{signal.reason}</div>
      {signal.tp1Hit && <div style={{marginTop:6,fontSize:10,color:C.teal,fontWeight:700}}>✅ TP1 alcanzado — SL en Breakeven</div>}
      {signal.tp2Hit && <div style={{fontSize:10,color:C.teal,fontWeight:700}}>✅ TP2 alcanzado</div>}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────
const ASSETS = {
  stpRNG: {name:'Step Index', shortName:'Step', emoji:'📊'},
  frxXAUUSD: {name:'Oro (XAU/USD)', shortName:'Oro', emoji:'🥇'},
  '1HZ100V': {name:'Volatility 100', shortName:'V100', emoji:'🔥'}
}
const TFS = ['M1','M5','M15','H1']

export default function Dashboard({ user, subscription, onLogout }) {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const [symbol, setSymbol] = useState('stpRNG')
  const [tf, setTF] = useState('M5')
  const [dash, setDash] = useState(null)
  const [analyze, setAnalyze] = useState(null)
  const [countdown, setCountdown] = useState(60)
  const [showElisa, setShowElisa] = useState(false)
  const [scanMsg, setScanMsg] = useState('Iniciando scanner...')
  const timerRef = useRef(null)
  const cdRef = useRef(60)

  // ── Fetch dashboard ──
  const fetchDash = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/dashboard/${encodeURIComponent(user.email)}`)
      const d = await r.json()
      setDash(d)
      setScanMsg(`Scanner activo · ${new Date().toLocaleTimeString('es',{hour12:false})}`)
    } catch { setScanMsg('Sin conexión al servidor') }
  }, [user.email])

  // ── Fetch analyze for current symbol ──
  const fetchAnalyze = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/analyze/${symbol}`)
      const d = await r.json()
      setAnalyze(d)
    } catch {}
  }, [symbol])

  useEffect(() => {
    fetchDash(); fetchAnalyze()
    // Poll every 5s
    const id = setInterval(() => { fetchDash(); fetchAnalyze() }, 5000)
    return () => clearInterval(id)
  }, [fetchDash, fetchAnalyze])

  // Countdown 60s
  useEffect(() => {
    cdRef.current = 60
    timerRef.current = setInterval(() => {
      cdRef.current--
      if (cdRef.current <= 0) cdRef.current = 60
      setCountdown(cdRef.current)
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  // Draw chart when data changes
  useEffect(() => {
    if (!analyze || !canvasRef.current) return
    const key = tf
    const candles =
      key==='H1'  ? analyze.candlesH1  :
      key==='M15' ? analyze.candlesM15 :
      key==='M1'  ? analyze.candlesM1  : analyze.candles
    if (!candles?.length) return

    drawChart(canvasRef.current, {
      candles,
      demandZones: key==='H1' ? analyze.demandZonesH1 : key==='M15' ? analyze.demandZonesM15 : analyze.demandZones,
      supplyZones: key==='H1' ? analyze.supplyZonesH1 : key==='M15' ? analyze.supplyZonesM15 : analyze.supplyZones,
      choch:    analyze.chartOverlays?.choch,
      bos:      analyze.chartOverlays?.bos,
      chochM15: analyze.chartOverlays?.chochM15,
      bosM15:   analyze.chartOverlays?.bosM15,
      swings:   analyze.swingsM5||[],
      structure: analyze.structureM5Data||{},
      lockedSignal: analyze.lockedSignal,
      currentTF: tf
    })
  }, [analyze, tf])

  // Resize observer
  useEffect(() => {
    const obs = new ResizeObserver(() => {
      if (analyze) {
        const candles = tf==='H1'?analyze.candlesH1:tf==='M15'?analyze.candlesM15:tf==='M1'?analyze.candlesM1:analyze.candles
        if (candles?.length) drawChart(canvasRef.current, {
          candles,
          demandZones:analyze.demandZones||[], supplyZones:analyze.supplyZones||[],
          choch:analyze.chartOverlays?.choch, bos:analyze.chartOverlays?.bos,
          chochM15:analyze.chartOverlays?.chochM15, bosM15:analyze.chartOverlays?.bosM15,
          swings:[], structure:analyze.structureM5Data||{}, lockedSignal:analyze.lockedSignal
        })
      }
    })
    if (canvasRef.current) obs.observe(canvasRef.current.parentElement)
    return () => obs.disconnect()
  }, [analyze, tf])

  const assetData  = dash?.assets?.find(a=>a.symbol===symbol)
  const stats      = dash?.stats || {total:0,wins:0,losses:0,pending:0}
  const wr         = stats.total>0 ? Math.round(stats.wins/stats.total*100) : 0
  const lockedSig  = analyze?.lockedSignal
  const plan       = subscription?.plan || user?.plan || 'free'
  const planColor  = plan==='elite'?C.teal:plan==='premium'?'#378ADD':plan==='basico'?C.green:C.muted

  return (
    <div style={{
      display:'flex', flexDirection:'column', height:'100vh',
      background:C.bg0, overflow:'hidden'
    }}>
      {/* ── Header ── */}
      <header style={{
        background:C.bg1, borderBottom:`1px solid ${C.border}`,
        padding:'6px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0
      }}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{
            width:30,height:30,borderRadius:6,background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',
            border:`1px solid ${C.teal}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14
          }}>📊</div>
          <span style={{fontWeight:800,fontSize:14,color:C.teal}}>TradingPro</span>
        </div>
        <span style={{color:C.muted,fontSize:13,fontWeight:500}}>Dashboard</span>
        <span style={{
          background:'rgba(0,212,170,.1)',color:C.teal,fontSize:10,fontWeight:700,
          padding:'2px 8px',borderRadius:20,border:`1px solid ${C.tealDark}`
        }}>6 Modelos SMC</span>

        {/* Timeframe */}
        <div style={{display:'flex',gap:4,marginLeft:'auto'}}>
          {TFS.map(t=>(
            <TFBtn key={t} label={t} active={tf===t} onClick={()=>setTF(t)}/>
          ))}
          <span style={{
            background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',
            color:C.teal,fontSize:11,fontWeight:800,padding:'3px 10px',
            border:`1px solid ${C.teal}`,borderRadius:5,letterSpacing:'.03em'
          }}>✓ {plan.toUpperCase()}</span>
        </div>

        {/* User */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:8}}>
          <span style={{
            background:planColor+'22',color:planColor,fontSize:10,fontWeight:700,
            padding:'2px 7px',borderRadius:4,border:`1px solid ${planColor}`
          }}>{user.planName||plan}</span>
          {user.isAdmin && (
            <button onClick={()=>navigate('/admin')} className="btn-ghost" style={{padding:'3px 10px',fontSize:11}}>Admin</button>
          )}
          <button onClick={onLogout} className="btn-ghost" style={{padding:'3px 10px',fontSize:11}}>Salir</button>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {/* Sidebar */}
        <aside style={{
          width:176,background:C.bg1,borderRight:`1px solid ${C.border}`,
          display:'flex',flexDirection:'column',flexShrink:0,overflowY:'auto'
        }}>
          {/* Nav */}
          {[
            {icon:'⊞',label:'Dashboard',active:true,onClick:()=>{}},
            {icon:'◎',label:'Señales',onClick:()=>{}},
            {icon:'◇',label:'Stats',onClick:()=>{}},
            {icon:'≡',label:'Historial',onClick:()=>{}},
            {icon:'◈',label:'Modelos',onClick:()=>navigate('/modelos')}
          ].map(n=>(
            <div key={n.label} onClick={n.onClick} style={{
              display:'flex',alignItems:'center',gap:8,padding:'8px 12px',
              fontSize:12,color:n.active?C.teal:C.muted,cursor:'pointer',
              borderRadius:6,margin:'1px 6px',
              background:n.active?C.tealBg:'transparent',
              border:n.active?`1px solid ${C.tealDark}44`:'1px solid transparent'
            }}>
              <span>{n.icon}</span>{n.label}
            </div>
          ))}

          <div style={{padding:'8px 10px',fontSize:10,fontWeight:600,color:C.muted,letterSpacing:'.05em',marginTop:4}}>MERCADOS</div>
          {Object.entries(ASSETS).map(([sym,cfg])=>{
            const ad = dash?.assets?.find(a=>a.symbol===sym)
            const isActive = sym===symbol
            const trend = ad?.structureM5||'LOADING'
            const tc = trend==='BULLISH'?C.teal:trend==='BEARISH'?C.red:C.muted
            return (
              <div key={sym} onClick={()=>setSymbol(sym)} style={{
                display:'flex',alignItems:'center',gap:8,padding:'8px 12px',
                fontSize:11,cursor:'pointer',borderRadius:6,margin:'1px 6px',
                background:isActive?C.bg3:'transparent',
                border:`1px solid ${isActive?C.border:'transparent'}`
              }}>
                <div style={{width:28,height:28,borderRadius:6,background:isActive?'#1a3a2a':C.bg2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14}}>
                  {cfg.emoji}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,color:C.text,fontSize:11}}>{cfg.shortName}</div>
                  <div style={{fontSize:9,color:tc,fontWeight:700}}>{trend}</div>
                </div>
                {ad?.lockedSignal && <span style={{width:7,height:7,borderRadius:'50%',background:C.teal,flexShrink:0}}/>}
              </div>
            )
          })}

          {/* ELISA button */}
          <div style={{padding:'8px 10px',marginTop:'auto'}}>
            <button onClick={()=>setShowElisa(s=>!s)} style={{
              width:'100%',padding:'8px',borderRadius:8,border:`1px solid ${C.teal}44`,
              background:C.tealBg,color:C.teal,cursor:'pointer',fontSize:11,fontWeight:700
            }}>
              💜 Hablar con Elisa
            </button>
          </div>
        </aside>

        {/* Main */}
        <main style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {/* Stats */}
          <div style={{
            display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,
            padding:'8px 12px',borderBottom:`1px solid ${C.border}`,flexShrink:0
          }}>
            <StatCard label="WIN RATE" value={wr+'%'} sub={stats.total>0?`${stats.total} ops`:'Sin ops'} color={C.teal}/>
            <StatCard label="ACTIVAS"  value={stats.pending||0} sub="En curso"    color={C.teal}/>
            <StatCard label="WINS"     value={stats.wins||0}    sub="Ganadoras"   color={C.green}/>
            <StatCard label="LOSS"     value={stats.losses||0}  sub="Pérdidas"    color={C.red}/>
          </div>

          {/* Chart area */}
          <div style={{flex:1,display:'flex',flexDirection:'column',padding:'8px 12px',gap:6,overflow:'hidden'}}>
            {/* Chart header */}
            <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',flexShrink:0}}>
              <span style={{fontSize:20}}>{ASSETS[symbol]?.emoji}</span>
              <span style={{fontWeight:700,fontSize:14,color:C.text}}>{ASSETS[symbol]?.name}</span>
              <StructureTag label="M5"  trend={assetData?.structureM5}/>
              <StructureTag label="M15" trend={assetData?.structureM15}/>
              <StructureTag label="H1"  trend={assetData?.structureH1}/>
              {assetData?.mtfConfluence && (
                <span style={{fontSize:10,fontWeight:700,color:C.teal,background:'rgba(0,212,170,.08)',padding:'2px 7px',borderRadius:4,border:`1px solid ${C.teal}44`}}>
                  ★ MTF
                </span>
              )}
              <div style={{marginLeft:'auto',textAlign:'right'}}>
                <div style={{fontSize:22,fontWeight:800,color:C.text,fontVariantNumeric:'tabular-nums'}}>
                  {analyze?.price?.toFixed(2)||assetData?.price?.toFixed(2)||'···'}
                </div>
                <div style={{fontSize:9,color:C.muted}}>{tf} · {
                  (tf==='M5'?analyze?.candles:tf==='H1'?analyze?.candlesH1:tf==='M15'?analyze?.candlesM15:analyze?.candlesM1)?.length||0
                } velas</div>
              </div>
            </div>

            {/* Canvas */}
            <div style={{flex:1,position:'relative',minHeight:0}}>
              <canvas ref={canvasRef} style={{width:'100%',height:'100%',borderRadius:8,border:`1px solid ${C.border}`}}/>
              {!analyze && (
                <div style={{
                  position:'absolute',inset:0,display:'flex',alignItems:'center',
                  justifyContent:'center',color:C.muted,fontSize:13
                }}>
                  <div style={{textAlign:'center'}}>
                    <div className="animate-spin" style={{fontSize:24,marginBottom:8}}>⟳</div>
                    <div>Cargando datos...</div>
                  </div>
                </div>
              )}
            </div>

            {/* Signal info strip */}
            {analyze?.signal && (
              <div style={{
                background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,
                padding:'6px 12px',display:'flex',alignItems:'center',gap:10,flexShrink:0
              }}>
                <span style={{fontSize:11,color:C.muted}}>Modelo:</span>
                <span style={{fontSize:11,fontWeight:700,color:C.teal}}>{analyze.signal.model}</span>
                <span style={{fontSize:11,color:C.muted}}>Score:</span>
                <span style={{fontSize:11,fontWeight:700,color:analyze.signal.score>=82?C.green:C.yellow}}>
                  {analyze.signal.score}%
                </span>
                <Pill type={analyze.signal.action} text={
                  analyze.signal.action==='LONG'?'COMPRA':analyze.signal.action==='SHORT'?'VENTA':
                  analyze.signal.action==='WAIT'?'ESPERAR':'CARGANDO'
                }/>
                <span style={{fontSize:10,color:C.muted,marginLeft:'auto',maxWidth:300,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {analyze.signal.reason}
                </span>
              </div>
            )}

            {/* M1 precision steps */}
            {analyze?.m1Steps && (
              <div style={{
                background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,
                padding:'6px 12px',display:'flex',alignItems:'center',gap:6,flexShrink:0,flexWrap:'wrap'
              }}>
                <span style={{fontSize:10,color:C.muted,fontWeight:600}}>M1 PRECISION:</span>
                {[
                  ['H1 ✓','h1ok'],['M15 ✓','m15ok'],['M5 ✓','m5ok'],
                  ['Zona M15','zoneok'],['Conf M1','m1conf']
                ].map(([lbl,key])=>(
                  <span key={key} style={{
                    fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:4,
                    background:analyze.m1Steps[key]?C.tealBg:C.bg3,
                    color:analyze.m1Steps[key]?C.teal:C.muted,
                    border:`1px solid ${analyze.m1Steps[key]?C.tealDark:C.border}`
                  }}>{lbl}</span>
                ))}
                <span style={{marginLeft:'auto',fontSize:10,color:C.teal,fontWeight:700}}>
                  {analyze.m1Steps.readyCount}/5
                </span>
              </div>
            )}
          </div>

          {/* Scanner bar */}
          <div style={{
            background:C.bg1,borderTop:`1px solid ${C.border}`,
            padding:'5px 14px',display:'flex',alignItems:'center',gap:10,flexShrink:0,flexWrap:'wrap'
          }}>
            <span className="animate-pulse-teal" style={{
              width:7,height:7,borderRadius:'50%',background:C.teal,display:'inline-block'
            }}/>
            <span style={{fontSize:10,color:C.muted}}>Scanner activo · próx scan en</span>
            <span style={{fontSize:10,fontWeight:700,color:C.teal}}>{countdown}s</span>
            <span style={{fontSize:10,color:C.muted}}>·</span>
            <span style={{fontSize:10,color:C.muted}}>Señal:</span>
            <Pill
              type={lockedSig?lockedSig.action:analyze?.signal?.action||'LOADING'}
              text={lockedSig?`${lockedSig.action==='LONG'?'COMPRA':'VENTA'} #${lockedSig.id}`:
                analyze?.signal?.action==='LONG'?'COMPRA DETECTADA':
                analyze?.signal?.action==='SHORT'?'VENTA DETECTADA':'ESPERANDO'}
            />
            <span style={{fontSize:10,color:C.muted,marginLeft:'auto'}}>{scanMsg}</span>
            <button onClick={()=>fetchAnalyze()} className="btn-ghost" style={{padding:'2px 8px',fontSize:10}}>↻ Refresh</button>
          </div>
        </main>
      </div>

      {/* Locked signal floating card */}
      {lockedSig && <SignalCard signal={lockedSig} assetConfig={ASSETS[symbol]}/>}

      {/* ELISA chat */}
      {showElisa && <ElisaChat symbol={symbol} onClose={()=>setShowElisa(false)}/>}

      {/* Elisa fab */}
      {!showElisa && (
        <button onClick={()=>setShowElisa(true)} style={{
          position:'fixed',right:20,bottom:20,width:52,height:52,
          borderRadius:'50%',background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',
          border:`2px solid ${C.teal}`,color:C.teal,fontSize:22,cursor:'pointer',
          boxShadow:`0 0 20px ${C.teal}44`,zIndex:98
        }}>💜</button>
      )}
    </div>
  )
}
