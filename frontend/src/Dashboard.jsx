/**
 * Trading Master Pro — Dashboard v24.3
 * BUGS CORREGIDOS:
 *  - Pantalla negra: hooks después de return null (Rules of Hooks violation)
 *  - Event listeners acumulados en SignalCard
 *  - onMouseMove/Up no memoizados → removeEventListener no limpiaba
 *  - ChartContainer: wheel event no se agregaba con passive:false correctamente
 *  - conflictData causaba re-render infinito por referencia nueva cada render
 *  - drawConflictOverlay llamado después de drawChart borraba el canvas
 */
import React, {
  useState, useEffect, useRef, useCallback, useMemo
} from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from './config/plans.js'

/* ───────────────────────────────────────────────────────────── COLORS */
const C = {
  bg0:'#0d1117', bg1:'#161b22', bg2:'#1c2330', bg3:'#21262d',
  border:'#30363d', text:'#e6edf3', muted:'#7d8590',
  teal:'#00d4aa', tealDark:'#00b894', tealBg:'rgba(0,212,170,.12)',
  red:'#ff6b6b', redBg:'rgba(255,107,107,.12)',
  yellow:'#f9ca24', green:'#3fb950', bull:'#3fb950', bear:'#ff6b6b'
}

/* ─────────────────────────────────────────── CONFLICT DETECTION ENGINE */
function detectConflict(lockedSignal, analyze) {
  if (!lockedSignal || !analyze) return null
  const { action, tp1Hit } = lockedSignal
  const isShort = action === 'SHORT' || action === 'SELL'
  const isLong  = action === 'LONG'  || action === 'BUY'
  const price   = analyze.price || lockedSignal.entry
  const demand  = analyze.demandZones || []
  const supply  = analyze.supplyZones || []
  const scan    = analyze.signal
  const conflicts = [], warnings = []

  const inDemand = demand.some(z => !z.mitigated && price >= z.low && price <= z.high * 1.002)
  const inSupply = supply.some(z => !z.mitigated && price <= z.high && price >= z.low * 0.998)

  if (isShort && inDemand) conflicts.push({
    type:'ZONE', sev:'HIGH', icon:'⚠️',
    title:'VENTA en zona de DEMANDA',
    msg:'Precio dentro de OB de demanda. Alta probabilidad de rechazo alcista.',
    action:'Si el OB no se rompe con cierre M5 → probable continuación ALCISTA.'
  })
  if (isLong && inSupply) conflicts.push({
    type:'ZONE', sev:'HIGH', icon:'⚠️',
    title:'COMPRA en zona de OFERTA',
    msg:'Precio dentro de OB de oferta. Alta probabilidad de rechazo bajista.',
    action:'Si el OB no se rompe con cierre M5 → probable continuación BAJISTA.'
  })
  if (scan && scan.action !== 'WAIT' && scan.score >= 80) {
    const scanLong  = scan.action === 'LONG'  || scan.action === 'BUY'
    const scanShort = scan.action === 'SHORT' || scan.action === 'SELL'
    if (isShort && scanLong) conflicts.push({
      type:'SIGNAL', sev: scan.score >= 90 ? 'HIGH' : 'MEDIUM', icon:'🔄',
      title:`Scanner detecta COMPRA · ${scan.score}%`,
      msg:`Modelo ${scan.model} ve oportunidad ALCISTA mientras el trade activo es VENTA.`,
      action:'Monitorear cierres M5. Si respeta demanda → VENTA se invalida.'
    })
    if (isLong && scanShort) conflicts.push({
      type:'SIGNAL', sev: scan.score >= 90 ? 'HIGH' : 'MEDIUM', icon:'🔄',
      title:`Scanner detecta VENTA · ${scan.score}%`,
      msg:`Modelo ${scan.model} ve oportunidad BAJISTA mientras el trade activo es COMPRA.`,
      action:'Monitorear cierres M5. Si respeta oferta → COMPRA se invalida.'
    })
  }
  const s5=analyze.structureM5?.trend, s15=analyze.structureM15?.trend, sH1=analyze.structureH1?.trend
  if (isShort && sH1==='BULLISH' && s15==='BULLISH' && s5==='BULLISH')
    warnings.push({ icon:'📊', msg:'Triple confluencia BULLISH (H1+M15+M5) en contra de la VENTA.' })
  if (isLong  && sH1==='BEARISH' && s15==='BEARISH' && s5==='BEARISH')
    warnings.push({ icon:'📊', msg:'Triple confluencia BEARISH (H1+M15+M5) en contra de la COMPRA.' })
  if (tp1Hit) warnings.push({ icon:'✅', msg:'TP1 alcanzado · SL en Breakeven · considerar salida parcial.' })

  let reversal = null
  const hasZone = conflicts.some(c=>c.type==='ZONE')
  const hasSig  = conflicts.some(c=>c.type==='SIGNAL')
  if (hasZone || hasSig) {
    const prob = Math.min(92, 55 + (hasSig?(conflicts.find(c=>c.type==='SIGNAL')?.sev==='HIGH'?25:15):0) + (hasZone?12:0))
    reversal = {
      direction: isShort ? 'ALCISTA' : 'BAJISTA',
      prob,
      condition: isShort
        ? 'Cierre M5 por encima del OB de demanda confirma continuación alcista'
        : 'Cierre M5 por debajo del OB de oferta confirma continuación bajista'
    }
  }
  if (!conflicts.length && !warnings.length) return null
  return { conflicts, warnings, reversal }
}

/* ─────────────────────────────────────────────────── CHART DRAW ENGINE */
function drawChart(canvas, state) {
  const {
    candles=[], demandZones=[], supplyZones=[],
    choch, bos, chochM15, bosM15,
    structure={}, lockedSignal,
    zoom=1, offsetX=0, conflictData=null
  } = state
  if (!canvas || candles.length < 5) return
  const dpr  = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return

  canvas.width  = Math.floor(rect.width  * dpr)
  canvas.height = Math.floor(rect.height * dpr)
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  const W = rect.width, H = rect.height
  ctx.fillStyle = C.bg1; ctx.fillRect(0,0,W,H)

  const ML=64, MR=70, MT=conflictData?54:24, MB=32
  const CW=W-ML-MR, CH=H-MT-MB
  if (CW<40||CH<40) return

  const cPerView = Math.max(10, Math.floor((CW/7)/zoom))
  const total    = candles.length
  const maxOff   = Math.max(0, total - cPerView)
  const safeOff  = Math.max(0, Math.min(maxOff, Math.round(offsetX)))
  const startIdx = Math.max(0, total - cPerView - safeOff)
  const vis      = candles.slice(startIdx, Math.max(startIdx+5, total - safeOff))
  const visOff   = startIdx
  if (!vis.length) return

  /* Price range including signal levels */
  const allP = vis.flatMap(c=>[c.high,c.low])
  if (lockedSignal) {
    const {entry,stop,tp1,tp2,tp3}=lockedSignal
    ;[entry,stop,tp1,tp2,tp3].forEach(v=>{if(v!=null)allP.push(v)})
  }
  const mn=Math.min(...allP), mx=Math.max(...allP), rng=mx-mn||1
  const PN=mn-rng*.09, PX=mx+rng*.13, PR=PX-PN
  const py=p=>MT+CH*(1-(p-PN)/PR)
  const n=vis.length, SL=CW/n, BW=Math.max(Math.floor(SL*.65),2)
  const cx=i=>ML+SL*i+SL/2
  const gs=rng<3?.5:rng<10?1:rng<30?5:10

  /* Conflict banner BEFORE grid so it's under everything */
  if (conflictData) {
    const hasHigh = conflictData.conflicts.some(c=>c.sev==='HIGH')
    const col = hasHigh ? C.yellow : '#f0883e'
    const c1  = conflictData.conflicts[0]
    const txt = c1 ? `${c1.icon}  ${c1.title}` : '⚠️  Conflicto detectado'
    ctx.fillStyle = hasHigh ? 'rgba(249,202,36,.09)' : 'rgba(240,136,62,.09)'
    ctx.fillRect(ML, 2, CW, MT-4)
    ctx.strokeStyle = col+'66'; ctx.lineWidth=1; ctx.setLineDash([])
    ctx.strokeRect(ML, 2, CW, MT-4)
    ctx.fillStyle = col; ctx.font='bold 10px system-ui'; ctx.textAlign='center'
    ctx.fillText(txt, ML+CW/2, MT-10)
    if (conflictData.reversal) {
      const {direction,prob} = conflictData.reversal
      ctx.fillStyle = col+'99'; ctx.font='9px system-ui'
      ctx.fillText(`Reversión ${direction}: ${prob}%`, ML+CW/2, MT-1)
    }
    ctx.setLineDash([])
  }

  /* Grid */
  ctx.strokeStyle='rgba(255,255,255,.04)'; ctx.lineWidth=1
  for(let p=Math.ceil(PN/gs)*gs;p<=PX;p+=gs){
    ctx.beginPath();ctx.moveTo(ML,py(p));ctx.lineTo(ML+CW,py(p));ctx.stroke()
  }

  /* OB Zones */
  ;[
    {zones:demandZones,fill:'rgba(63,185,80,.13)',stroke:C.green,label:'OB demanda'},
    {zones:supplyZones,fill:'rgba(255,107,107,.13)',stroke:C.red,label:'OB oferta'}
  ].forEach(({zones,fill,stroke,label})=>{
    zones.filter(z=>!z.mitigated).forEach(z=>{
      const zi=z.index-visOff
      const x1=zi>=0?Math.max(ML,cx(zi)-SL/2):ML, x2=ML+CW
      if(x1>=x2)return
      const y1=py(z.high),y2=py(z.low)
      ctx.fillStyle=fill;ctx.fillRect(x1,y1,x2-x1,y2-y1)
      ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.strokeRect(x1,y1,x2-x1,y2-y1)
      ctx.fillStyle=stroke;ctx.font='bold 9px system-ui';ctx.textAlign='left'
      ctx.fillText(z.isStructureOB?label+' ★':label,x1+4,y1+11)
    })
  })

  /* Structure lines */
  const drawLvl=(lvl,color,tag)=>{
    if(!lvl||lvl.level==null)return
    const bi=(lvl.breakIndex||0)-visOff
    const sx=bi>=0?Math.max(ML,cx(bi)):ML
    if(sx>ML+CW)return
    ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.setLineDash([8,5])
    ctx.beginPath();ctx.moveTo(sx,py(lvl.level));ctx.lineTo(ML+CW,py(lvl.level));ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle=color;ctx.font='bold 8px system-ui';ctx.textAlign='right'
    ctx.fillText(tag,ML+CW-3,py(lvl.level)-3)
  }
  drawLvl(bos,C.text,'BOS M5'); drawLvl(choch,C.yellow,'CHoCH M5')
  drawLvl(bosM15,'rgba(160,160,255,.8)','BOS M15'); drawLvl(chochM15,'rgba(255,220,80,.7)','CHoCH M15')

  /* Swing labels */
  ;(structure.labels||[]).forEach(lb=>{
    const li=lb.index-visOff
    if(li<0||li>=n||!vis[li])return
    const isBull=lb.type==='HH'||lb.type==='HL'
    const y=isBull?py(vis[li].high)-14:py(vis[li].low)+14
    const clr=(lb.type==='HH'||lb.type==='HL')?C.green:(lb.type==='LL'||lb.type==='LH')?C.red:C.yellow
    const tw=lb.type.length*6+10
    ctx.fillStyle=clr+'33';ctx.strokeStyle=clr;ctx.lineWidth=.8
    ctx.beginPath();ctx.roundRect(cx(li)-tw/2,y-8,tw,13,3);ctx.fill();ctx.stroke()
    ctx.fillStyle=clr;ctx.font='bold 8px system-ui';ctx.textAlign='center'
    ctx.fillText(lb.type,cx(li),y)
  })

  /* Signal lines */
  if(lockedSignal){
    const{action,entry,stop,tp1,tp2,tp3,tp1Hit,tp2Hit}=lockedSignal
    const isLong=action==='LONG'||action==='BUY'
    ;[
      {p:tp3,tag:'TP3',col:'#00b894'},
      {p:tp2,tag:tp2Hit?'✅TP2':'TP2',col:C.teal},
      {p:tp1,tag:tp1Hit?'✅TP1':'TP1',col:C.green},
      {p:entry,tag:'Entry',col:C.yellow},
      {p:stop,tag:'SL',col:C.red}
    ].forEach(({p,tag,col})=>{
      if(p==null)return
      const y=py(p)
      if(y<MT-2||y>MT+CH+2)return
      ctx.strokeStyle=col+'bb';ctx.lineWidth=tag==='Entry'?2:1.5;ctx.setLineDash([5,4])
      ctx.beginPath();ctx.moveTo(ML,y);ctx.lineTo(ML+CW,y);ctx.stroke()
      ctx.setLineDash([])
      const lw=tag.length*7+p.toFixed(2).length*6+12
      ctx.fillStyle=col+'22';ctx.strokeStyle=col;ctx.lineWidth=1
      ctx.beginPath();ctx.roundRect(ML+CW+2,y-9,lw,18,4);ctx.fill();ctx.stroke()
      ctx.fillStyle=col;ctx.font='bold 8.5px system-ui';ctx.textAlign='left'
      ctx.fillText(`${tag}  ${p.toFixed(2)}`,ML+CW+6,y+4)
    })
    const ey=py(entry)
    if(ey>=MT&&ey<=MT+CH){
      const ex=cx(Math.max(0,n-4)), col=isLong?C.green:C.red
      ctx.strokeStyle=col;ctx.lineWidth=3;ctx.fillStyle=col
      ctx.beginPath();ctx.moveTo(ex,isLong?ey+34:ey-34);ctx.lineTo(ex,isLong?ey+8:ey-8);ctx.stroke()
      ctx.beginPath()
      if(isLong){ctx.moveTo(ex-9,ey+18);ctx.lineTo(ex,ey);ctx.lineTo(ex+9,ey+18)}
      else{ctx.moveTo(ex-9,ey-18);ctx.lineTo(ex,ey);ctx.lineTo(ex+9,ey-18)}
      ctx.fill()
    }
  }

  /* Candles */
  vis.forEach((c,i)=>{
    const x=cx(i),bull=c.close>=c.open,col=bull?C.bull:C.bear
    ctx.strokeStyle=col;ctx.lineWidth=1.5
    ctx.beginPath();ctx.moveTo(x,py(c.high));ctx.lineTo(x,py(c.low));ctx.stroke()
    const bt=py(Math.max(c.open,c.close)),bh=Math.max(py(Math.min(c.open,c.close))-bt,1)
    ctx.fillStyle=bull?C.bull+'cc':C.bear+'cc';ctx.fillRect(x-BW/2,bt,BW,bh)
    if(!bull){ctx.strokeStyle=C.bear;ctx.lineWidth=.8;ctx.strokeRect(x-BW/2,bt,BW,bh)}
  })

  /* Y axis */
  ctx.fillStyle=C.muted;ctx.font='9px system-ui';ctx.textAlign='right'
  for(let p=Math.ceil(PN/gs)*gs;p<=PX;p+=gs){
    const y=py(p);if(y>MT+8&&y<MT+CH)ctx.fillText(p.toFixed(gs<1?2:0),ML-4,y+3)
  }

  /* Current price */
  const last=vis[vis.length-1]
  if(last){
    const py2=py(last.close)
    ctx.strokeStyle='rgba(255,255,255,.2)';ctx.lineWidth=1;ctx.setLineDash([2,3])
    ctx.beginPath();ctx.moveTo(ML,py2);ctx.lineTo(ML+CW,py2);ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle=C.teal;ctx.beginPath();ctx.roundRect(ML+CW-1,py2-8,58,16,3);ctx.fill()
    ctx.fillStyle='#000';ctx.font='bold 9px system-ui';ctx.textAlign='left'
    ctx.fillText(last.close.toFixed(2),ML+CW+3,py2+4)
  }

  /* Zoom indicator */
  if(zoom!==1||safeOff>0){
    ctx.fillStyle='rgba(0,212,170,.7)';ctx.font='bold 9px system-ui';ctx.textAlign='left'
    ctx.fillText(`${zoom.toFixed(1)}x · ${vis.length} velas`,ML+4,MT+14)
  }

  ctx.strokeStyle=C.border+'88';ctx.lineWidth=1;ctx.setLineDash([])
  ctx.strokeRect(ML,MT,CW,CH)
}

/* ──────────────────────────────────────────────── SIGNAL CARD (fixed) */
// FIX: TODOS los hooks están al inicio, SIN return null antes de ellos
function SignalCard({ signal, assetConfig, cardPos, setCardPos, cardVisible, setCardVisible, hasConflict }) {
  /* ✅ HOOKS PRIMERO — sin condicionales antes */
  const isDragging = useRef(false)
  const dragStart  = useRef({ x:0, y:0, cx:0, cy:0 })

  // ✅ FIX: useCallback memoiza las funciones para que removeEventListener funcione
  const onMouseMove = useCallback(e => {
    if (!isDragging.current) return
    setCardPos({
      x: dragStart.current.cx + (e.clientX - dragStart.current.x),
      y: dragStart.current.cy + (e.clientY - dragStart.current.y)
    })
  }, [setCardPos])

  const onMouseUp = useCallback(() => { isDragging.current = false }, [])

  // ✅ FIX: dependencias correctas — solo se registra/limpia cuando cambian las funciones
  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  // ✅ FIX: return null DESPUÉS de todos los hooks
  if (!signal || !cardVisible) return null

  const isLong = signal.action === 'LONG' || signal.action === 'BUY'
  const col    = isLong ? C.teal : C.red

  const onMouseDown = e => {
    if (e.target.closest('button')) return
    isDragging.current = true
    dragStart.current  = { x:e.clientX, y:e.clientY, cx:cardPos.x, cy:cardPos.y }
    e.preventDefault()
  }
  const onTouchStart = e => {
    const t = e.touches[0]
    isDragging.current = true
    dragStart.current  = { x:t.clientX, y:t.clientY, cx:cardPos.x, cy:cardPos.y }
  }
  const onTouchMove = e => {
    if (!isDragging.current) return
    const t = e.touches[0]
    setCardPos({
      x: dragStart.current.cx + (t.clientX - dragStart.current.x),
      y: dragStart.current.cy + (t.clientY - dragStart.current.y)
    })
  }

  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => { isDragging.current = false }}
      style={{
        position:'fixed', left: Math.max(0,cardPos.x), top: Math.max(48,cardPos.y),
        width:'min(268px,90vw)',
        background:C.bg1, border:`2px solid ${hasConflict?C.yellow:col}`,
        borderRadius:10, padding:'10px 14px', zIndex:200,
        cursor:'grab', userSelect:'none', touchAction:'none',
        boxShadow:`0 4px 24px ${hasConflict?C.yellow:col}33`
      }}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <span style={{fontSize:16}}>{assetConfig?.emoji||'📊'}</span>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:12,fontWeight:700,color:col}}>{isLong?'● COMPRA':'● VENTA'}</span>
              {hasConflict && (
                <span style={{fontSize:9,fontWeight:800,padding:'1px 5px',borderRadius:3,
                  background:'rgba(249,202,36,.15)',color:C.yellow,border:'1px solid rgba(249,202,36,.4)'}}>
                  ⚠️ CONFLICTO
                </span>
              )}
            </div>
            <div style={{fontSize:10,color:C.muted}}>{signal.model} · {signal.score}%</div>
          </div>
        </div>
        <button
          onClick={() => setCardVisible(false)}
          style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,
            borderRadius:4,width:22,height:22,cursor:'pointer',fontSize:14,
            display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          −
        </button>
      </div>

      <div style={{fontSize:11,display:'grid',gridTemplateColumns:'1fr 1fr',gap:'3px 8px'}}>
        {[['Entry',signal.entry,C.text],['SL',signal.stop,C.red],
          ['TP1',signal.tp1,C.teal],['TP2',signal.tp2,C.teal],['TP3',signal.tp3,C.teal]
        ].map(([k,v,c])=>(
          <div key={k} style={{display:'flex',justifyContent:'space-between',
            padding:'3px 0',borderBottom:`1px solid ${C.border}`}}>
            <span style={{color:C.muted}}>{k}</span>
            <span style={{fontWeight:700,color:c}}>{v?.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div style={{marginTop:8,fontSize:10,color:C.muted,lineHeight:1.4}}>{signal.reason}</div>
      {signal.tp1Hit&&<div style={{marginTop:4,fontSize:10,color:C.teal,fontWeight:700}}>✅ TP1 — SL en Breakeven</div>}
      {signal.tp2Hit&&<div style={{fontSize:10,color:C.teal,fontWeight:700}}>✅ TP2 alcanzado</div>}
      <div style={{marginTop:6,textAlign:'center',fontSize:9,color:C.border}}>⠿ arrastra para mover</div>
    </div>
  )
}

/* ─────────────────────────────────────── CONFLICT ALERT PANEL (fixed) */
function ConflictAlert({ conflictData, onDismiss }) {
  const [expanded, setExpanded] = useState(true)
  // ✅ FIX: return null DESPUÉS de hooks
  if (!conflictData) return null

  const { conflicts, warnings, reversal } = conflictData
  const hasHigh = conflicts.some(c => c.sev === 'HIGH')
  const borderCol = hasHigh ? C.yellow : '#f0883e'

  return (
    <div style={{
      position:'fixed', right:20, top:58, width:'min(330px,90vw)',
      background:C.bg1, border:`2px solid ${borderCol}`,
      borderRadius:10, zIndex:250, boxShadow:`0 4px 24px ${borderCol}33`,
      maxHeight:'80vh', display:'flex', flexDirection:'column'
    }}>
      <div style={{
        background: hasHigh?'rgba(249,202,36,.07)':'rgba(240,136,62,.07)',
        padding:'8px 12px', display:'flex', alignItems:'center', gap:8,
        cursor:'pointer', borderBottom:`1px solid ${borderCol}44`, flexShrink:0
      }} onClick={()=>setExpanded(e=>!e)}>
        <span style={{fontSize:15}}>{hasHigh?'⚠️':'🔔'}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:11,fontWeight:700,color:borderCol}}>
            {hasHigh?'CONFLICTO CRÍTICO':'ADVERTENCIA SMC'}
          </div>
          <div style={{fontSize:9,color:C.muted}}>
            {conflicts.length} conflicto{conflicts.length!==1?'s':''} · {warnings.length} aviso{warnings.length!==1?'s':''}
          </div>
        </div>
        <span style={{color:C.muted,fontSize:11}}>{expanded?'▲':'▼'}</span>
        <button onClick={e=>{e.stopPropagation();onDismiss()}} style={{
          background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:16,padding:'0 2px'}}>✕</button>
      </div>

      {expanded && (
        <div style={{padding:'10px 12px',display:'flex',flexDirection:'column',gap:8,overflowY:'auto'}}>
          {conflicts.map((c,i)=>(
            <div key={i} style={{
              background:c.sev==='HIGH'?'rgba(249,202,36,.07)':'rgba(240,136,62,.07)',
              border:`1px solid ${c.sev==='HIGH'?'#f9ca2444':'#f0883e44'}`,
              borderLeft:`3px solid ${c.sev==='HIGH'?C.yellow:'#f0883e'}`,
              borderRadius:6,padding:'8px 10px'
            }}>
              <div style={{fontSize:11,fontWeight:700,color:c.sev==='HIGH'?C.yellow:'#f0883e',marginBottom:4}}>
                {c.icon} {c.title}
              </div>
              <div style={{fontSize:11,color:C.text,lineHeight:1.5,marginBottom:4}}>{c.msg}</div>
              <div style={{fontSize:10,color:C.muted,lineHeight:1.4}}>
                <span style={{color:c.sev==='HIGH'?C.yellow:'#f0883e',fontWeight:600}}>→ </span>{c.action}
              </div>
            </div>
          ))}
          {warnings.map((w,i)=>(
            <div key={i} style={{background:'rgba(63,185,80,.07)',border:'1px solid rgba(63,185,80,.2)',
              borderLeft:`3px solid ${C.green}`,borderRadius:6,padding:'7px 10px',
              fontSize:11,color:C.text,lineHeight:1.5}}>{w.icon} {w.msg}</div>
          ))}
          {reversal&&(
            <div style={{background:'rgba(0,212,170,.06)',border:`1px solid ${C.teal}44`,borderRadius:8,padding:'10px 12px'}}>
              <div style={{fontSize:11,fontWeight:700,color:C.teal,marginBottom:6}}>
                📈 Probabilidad reversión {reversal.direction}: {reversal.prob}%
              </div>
              <div style={{height:6,background:C.bg2,borderRadius:3,marginBottom:6,overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:3,width:`${reversal.prob}%`,
                  background:reversal.prob>=80?`linear-gradient(90deg,${C.yellow},${C.red})`:`linear-gradient(90deg,${C.teal},${C.green})`}}/>
              </div>
              <div style={{fontSize:10,color:C.muted,lineHeight:1.5,fontStyle:'italic'}}>{reversal.condition}</div>
            </div>
          )}
          <div style={{background:C.bg2,borderRadius:6,padding:'8px 10px',
            fontSize:10,color:C.muted,lineHeight:1.6}}>
            <span style={{color:C.text,fontWeight:600}}>Recomendación: </span>
            {hasHigh
              ?'No abrir nuevas posiciones hasta que una vela M5 cierre fuera de la zona. Gestionar riesgo de la posición activa.'
              :'Monitorear cierre de las próximas 2-3 velas M5 antes de tomar decisiones.'}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────── CHART CONTAINER — zoom + pan */
function ChartContainer({ children, zoom, setZoom, offsetX, setOffsetX }) {
  const containerRef = useRef(null)
  const isPanning    = useRef(false)
  const panStart     = useRef({ x:0, off:0 })
  const pinchDist    = useRef(null)

  // ✅ FIX: wheel listener con passive:false en useEffect para que preventDefault funcione
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = e => {
      e.preventDefault()
      setZoom(z => +(Math.max(.3, Math.min(8, z + (e.deltaY>0?-.12:.12)))).toFixed(2))
    }
    el.addEventListener('wheel', onWheel, { passive:false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setZoom])

  const onMouseDown = e => {
    if (e.button !== 0) return
    isPanning.current = true
    panStart.current  = { x:e.clientX, off:offsetX }
    e.currentTarget.style.cursor = 'grabbing'
  }
  const onMouseMove = e => {
    if (!isPanning.current) return
    const dx = e.clientX - panStart.current.x
    setOffsetX(Math.max(0, panStart.current.off - dx / (7/zoom)))
  }
  const onMouseUp = e => { isPanning.current=false; if(e.currentTarget)e.currentTarget.style.cursor='crosshair' }

  const onTouchStart = e => {
    if (e.touches.length===2) {
      pinchDist.current = Math.hypot(
        e.touches[0].clientX-e.touches[1].clientX,
        e.touches[0].clientY-e.touches[1].clientY
      )
    } else {
      isPanning.current=true
      panStart.current={x:e.touches[0].clientX, off:offsetX}
    }
  }
  const onTouchMove = e => {
    if (e.touches.length===2 && pinchDist.current) {
      const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)
      setZoom(z=>+(Math.max(.3,Math.min(8,z*(d/pinchDist.current)))).toFixed(2))
      pinchDist.current=d
    } else if (e.touches.length===1 && isPanning.current) {
      setOffsetX(Math.max(0,panStart.current.off-(e.touches[0].clientX-panStart.current.x)/(7/zoom)))
    }
  }
  const onTouchEnd=()=>{ isPanning.current=false; pinchDist.current=null }

  return (
    <div ref={containerRef} style={{flex:1,position:'relative',minHeight:0,cursor:'crosshair',touchAction:'none'}}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove}
      onMouseUp={onMouseUp} onMouseLeave={e=>{isPanning.current=false;e.currentTarget.style.cursor='crosshair'}}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {children}
      {/* Zoom controls */}
      <div style={{position:'absolute',bottom:8,right:72,display:'flex',gap:3,
        background:'rgba(13,17,23,.9)',borderRadius:6,padding:'3px 5px',
        border:`1px solid ${C.border}`,zIndex:10}}>
        {[
          {lbl:'+',fn:()=>setZoom(z=>+(Math.min(8,z+.2)).toFixed(1))},
          {lbl:`${zoom.toFixed(1)}x`,fn:()=>{setZoom(1);setOffsetX(0)},title:'Reset'},
          {lbl:'−',fn:()=>setZoom(z=>+(Math.max(.3,z-.2)).toFixed(1))},
          {lbl:'|←',fn:()=>setOffsetX(o=>o+15),title:'Retroceder'},
          {lbl:'→|',fn:()=>setOffsetX(0),title:'Ir al precio actual'}
        ].map(({lbl,fn,title})=>(
          <button key={lbl} onClick={fn} title={title}
            style={{background:'transparent',border:'none',color:C.muted,cursor:'pointer',
              padding:'2px 7px',fontSize:lbl.includes('x')?10:13,borderRadius:4,fontWeight:700,
              minWidth:lbl.includes('x')?36:undefined}}>
            {lbl}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────── SMALL COMPONENTS */
const Pill = ({ type, text }) => {
  const cls = type==='BUY'||type==='LONG'?'pill pill-buy'
            : type==='SELL'||type==='SHORT'?'pill pill-sell'
            : type==='WAIT'?'pill pill-wait':'pill pill-load'
  return <span className={cls}>{text}</span>
}
const StatCard = ({ label, value, sub, color }) => (
  <div className="card" style={{padding:'8px 12px'}}>
    <div style={{fontSize:9,color:C.muted,fontWeight:600,letterSpacing:'.05em',marginBottom:2}}>{label}</div>
    <div style={{fontSize:22,fontWeight:800,color:color||C.text}}>{value}</div>
    <div style={{fontSize:9,color:C.muted}}>{sub}</div>
  </div>
)
const StructTag = ({ label, trend }) => {
  const color=trend==='BULLISH'?C.teal:trend==='BEARISH'?C.red:C.muted
  const bg=trend==='BULLISH'?'rgba(0,212,170,.1)':trend==='BEARISH'?'rgba(255,107,107,.1)':'rgba(255,255,255,.05)'
  return(<span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,
    border:`1px solid ${color}`,background:bg,color}}>{label}: {trend||'···'}</span>)
}

/* ─────────────────────────────────────────────── SECTION PANELS */
function SenalesPanel({signals}){
  if(!signals.length)return<p style={{color:C.muted,fontSize:13,padding:'20px 0'}}>Sin señales aún.</p>
  const col=a=>a==='LONG'||a==='BUY'?C.teal:C.red
  return(
    <div style={{overflowX:'auto',overflowY:'auto',flex:1}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:680}}>
        <thead><tr style={{background:C.bg2}}>
          {['#','Activo','Dir','Modelo','Score','Entry','SL','TP1','Estado','Tiempo'].map(h=>(
            <th key={h} style={{padding:'7px 10px',textAlign:'left',color:C.muted,fontWeight:600,
              fontSize:10,borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>{signals.slice(0,80).map(s=>(
          <tr key={s.id} style={{borderBottom:`1px solid ${C.border}22`}}>
            <td style={{padding:'6px 10px',color:C.muted}}>#{s.id}</td>
            <td style={{padding:'6px 10px',color:C.text,whiteSpace:'nowrap'}}>{s.assetName||s.symbol}</td>
            <td style={{padding:'6px 10px'}}><span style={{color:col(s.action),fontWeight:700}}>{s.action==='LONG'?'COMPRA':'VENTA'}</span></td>
            <td style={{padding:'6px 10px',color:C.teal,fontSize:10,whiteSpace:'nowrap'}}>{s.model}</td>
            <td style={{padding:'6px 10px',color:s.score>=82?C.green:C.yellow,fontWeight:700}}>{s.score}%</td>
            <td style={{padding:'6px 10px',fontVariantNumeric:'tabular-nums'}}>{s.entry?.toFixed(2)}</td>
            <td style={{padding:'6px 10px',color:C.red}}>{s.stop?.toFixed(2)}</td>
            <td style={{padding:'6px 10px',color:C.teal}}>{s.tp1?.toFixed(2)}</td>
            <td style={{padding:'6px 10px'}}><span style={{color:s.status==='WIN'?C.green:s.status==='LOSS'?C.red:C.yellow,fontWeight:700}}>{s.status}</span></td>
            <td style={{padding:'6px 10px',color:C.muted,fontSize:10,whiteSpace:'nowrap'}}>
              {new Date(s.timestamp).toLocaleString('es-CO',{timeZone:'America/Bogota',hour12:false,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function StatsPanel({stats,signals}){
  const wr=stats.total>0?Math.round(stats.wins/stats.total*100):0
  const byModel={}
  signals.forEach(s=>{
    if(!s.model||s.status==='PENDING')return
    if(!byModel[s.model])byModel[s.model]={wins:0,losses:0}
    s.status==='WIN'?byModel[s.model].wins++:byModel[s.model].losses++
  })
  return(
    <div style={{overflowY:'auto',flex:1,display:'flex',flexDirection:'column',gap:10}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:7}}>
        {[{l:'Win Rate',v:`${wr}%`,c:wr>=60?C.green:wr>=40?C.yellow:C.red},
          {l:'Total',v:stats.total||0},{l:'Wins',v:stats.wins||0,c:C.green},
          {l:'Losses',v:stats.losses||0,c:C.red},{l:'Activas',v:stats.pending||0,c:C.yellow},
          {l:'TP1',v:stats.tp1Hits||0,c:C.teal},{l:'TP2',v:stats.tp2Hits||0,c:C.teal},{l:'TP3',v:stats.tp3Hits||0,c:C.teal}
        ].map(({l,v,c})=>(
          <div key={l} className="card" style={{padding:'10px 14px'}}>
            <div style={{fontSize:9,color:C.muted,marginBottom:3,textTransform:'uppercase',letterSpacing:'.05em'}}>{l}</div>
            <div style={{fontSize:22,fontWeight:800,color:c||C.text}}>{v}</div>
          </div>
        ))}
      </div>
      {Object.keys(byModel).length>0&&(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'7px 12px',fontSize:10,fontWeight:600,color:C.muted,borderBottom:`1px solid ${C.border}`,letterSpacing:'.05em'}}>POR MODELO</div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:280}}>
              <thead><tr style={{background:C.bg2}}>
                {['Modelo','Wins','Losses','Win Rate'].map(h=>(
                  <th key={h} style={{padding:'6px 12px',textAlign:'left',color:C.muted,fontWeight:600,fontSize:10,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{Object.entries(byModel).map(([model,d])=>{
                const mwr=d.wins+d.losses>0?Math.round(d.wins/(d.wins+d.losses)*100):0
                return(<tr key={model} style={{borderBottom:`1px solid ${C.border}22`}}>
                  <td style={{padding:'6px 12px',color:C.teal,fontWeight:700}}>{model}</td>
                  <td style={{padding:'6px 12px',color:C.green,fontWeight:700}}>{d.wins}</td>
                  <td style={{padding:'6px 12px',color:C.red}}>{d.losses}</td>
                  <td style={{padding:'6px 12px',color:mwr>=60?C.green:mwr>=40?C.yellow:C.red,fontWeight:700}}>{mwr}%</td>
                </tr>)
              })}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function HistorialPanel({signals}){
  const closed=signals.filter(s=>s.status!=='PENDING')
  if(!closed.length)return<p style={{color:C.muted,fontSize:13,padding:'20px 0'}}>Sin operaciones cerradas aún.</p>
  return(
    <div style={{overflowY:'auto',flex:1}}>
      {closed.map(s=>{
        const isWin=s.status==='WIN';const sc=isWin?C.green:C.red
        return(
          <div key={s.id} style={{background:isWin?'rgba(63,185,80,.07)':'rgba(255,107,107,.07)',
            border:`1px solid ${sc}22`,borderLeft:`3px solid ${sc}`,
            borderRadius:6,padding:'9px 13px',marginBottom:7}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{color:sc,fontWeight:700,fontSize:12}}>{isWin?'✅ WIN':'❌ LOSS'}</span>
                <span style={{color:C.teal,fontSize:11,fontWeight:700}}>{s.action==='LONG'?'COMPRA':'VENTA'}</span>
                <span style={{color:C.muted,fontSize:11}}>{s.assetName||s.symbol}</span>
              </div>
              <span style={{color:C.muted,fontSize:10}}>#{s.id} · {s.model}</span>
            </div>
            <div style={{display:'flex',gap:14,fontSize:11,flexWrap:'wrap'}}>
              <span style={{color:C.muted}}>Entry <b style={{color:C.text}}>{s.entry?.toFixed(2)}</b></span>
              <span style={{color:C.muted}}>SL <b style={{color:C.red}}>{s.stop?.toFixed(2)}</b></span>
              <span style={{color:C.muted}}>TP1 <b style={{color:C.teal}}>{s.tp1?.toFixed(2)}</b></span>
              <span style={{color:C.muted}}>Score <b style={{color:s.score>=82?C.green:C.yellow}}>{s.score}%</b></span>
            </div>
            <div style={{fontSize:10,color:C.muted,marginTop:3}}>
              {new Date(s.timestamp).toLocaleString('es-CO',{timeZone:'America/Bogota',hour12:false})} · {s.reason}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ElisaChat({symbol,onClose}){
  const[msgs,setMsgs]=useState([{from:'elisa',text:'¡Hola! Soy Elisa 💜 ¿Qué quieres saber del mercado?'}])
  const[input,setInput]=useState('')
  const[loading,setLoading]=useState(false)
  const endRef=useRef(null)
  useEffect(()=>endRef.current?.scrollIntoView({behavior:'smooth'}),[msgs])
  const send=async()=>{
    if(!input.trim()||loading)return
    const q=input.trim();setInput('');setLoading(true)
    setMsgs(m=>[...m,{from:'user',text:q}])
    try{
      const r=await fetch(`${API_URL}/api/ai/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,symbol})})
      const d=await r.json();setMsgs(m=>[...m,{from:'elisa',text:d.answer||'Sin respuesta'}])
    }catch{setMsgs(m=>[...m,{from:'elisa',text:'Error de conexión 😔'}])}
    setLoading(false)
  }
  return(
    <div style={{position:'fixed',right:20,bottom:80,width:'min(320px,90vw)',height:460,
      background:C.bg1,border:`1px solid ${C.border}`,borderRadius:12,
      display:'flex',flexDirection:'column',zIndex:300,boxShadow:'0 20px 60px #00000090'}}>
      <div style={{padding:'11px 15px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:30,height:30,borderRadius:'50%',background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',
            border:`1px solid ${C.teal}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15}}>💜</div>
          <div><div style={{fontSize:13,fontWeight:700,color:C.teal}}>ELISA IA</div>
          <div style={{fontSize:10,color:C.muted}}>Asistente SMC</div></div>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:18}}>✕</button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:11,display:'flex',flexDirection:'column',gap:7}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{alignSelf:m.from==='user'?'flex-end':'flex-start',maxWidth:'85%',
            padding:'8px 11px',borderRadius:10,whiteSpace:'pre-wrap',
            background:m.from==='user'?C.tealBg:C.bg2,
            border:`1px solid ${m.from==='user'?C.tealDark:C.border}`,
            fontSize:12,color:C.text,lineHeight:1.5}}>{m.text}</div>
        ))}
        {loading&&<div style={{alignSelf:'flex-start',color:C.muted,fontSize:11}}>Elisa está pensando...</div>}
        <div ref={endRef}/>
      </div>
      <div style={{padding:'8px 11px',borderTop:`1px solid ${C.border}`,display:'flex',gap:7,flexShrink:0}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()}
          placeholder="Pregunta algo..."
          style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,
            padding:'7px 10px',color:C.text,fontSize:12,outline:'none'}}/>
        <button onClick={send} className="btn-teal" style={{padding:'7px 14px',fontSize:12}}>→</button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────── CONSTANTS */
const ASSETS={
  stpRNG:{name:'Step Index',shortName:'Step',emoji:'📊'},
  frxXAUUSD:{name:'Oro (XAU/USD)',shortName:'Oro',emoji:'🥇'},
  '1HZ100V':{name:'Volatility 100',shortName:'V100',emoji:'🔥'}
}
const TFS=['M1','M5','M15','H1']
const NAV=[
  {icon:'⊞',label:'Dashboard',key:'dashboard'},
  {icon:'◎',label:'Señales',key:'senales'},
  {icon:'◇',label:'Stats',key:'stats'},
  {icon:'≡',label:'Historial',key:'historial'},
  {icon:'◈',label:'Modelos',key:'modelos'}
]

/* ═══════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD — hooks audit: todos al nivel superior, sin condicionales
   ═══════════════════════════════════════════════════════════════════════ */
export default function Dashboard({user,subscription,onLogout}){
  const navigate=useNavigate()
  const canvasRef=useRef(null)

  /* State — todos declarados incondicionalmente */
  const[symbol,   setSymbol]  =useState('stpRNG')
  const[tf,       setTF]      =useState('M5')
  const[section,  setSection] =useState('dashboard')
  const[dash,     setDash]    =useState(null)
  const[analyze,  setAnalyze] =useState(null)
  const[signals,  setSignals] =useState([])
  const[countdown,setCountdown]=useState(60)
  const[showElisa,setShowElisa]=useState(false)
  const[sidebarOpen,setSidebarOpen]=useState(true)
  const[zoom,     setZoom]    =useState(1)
  const[offsetX,  setOffsetX] =useState(0)
  const[cardPos,  setCardPos] =useState({x:20,y:120})
  const[cardVisible,setCardVisible]=useState(true)
  const[conflictDismissed,setConflictDismissed]=useState(false)
  const prevConflictKey=useRef('')

  /* Reset cardVisible on new signal */
  useEffect(()=>{setCardVisible(true)},[analyze?.lockedSignal?.id])

  /* Fetch data */
  const fetchDash=useCallback(async()=>{
    try{
      const[dRes,sRes]=await Promise.all([
        fetch(`${API_URL}/api/dashboard/${encodeURIComponent(user.email)}`),
        fetch(`${API_URL}/api/signals`)
      ])
      const d=await dRes.json();setDash(d)
      const s=await sRes.json();setSignals(s.signals||[])
    }catch{}
  },[user.email])

  const fetchAnalyze=useCallback(async()=>{
    try{const r=await fetch(`${API_URL}/api/analyze/${symbol}`);const d=await r.json();setAnalyze(d)}
    catch{}
  },[symbol])

  useEffect(()=>{
    fetchDash();fetchAnalyze()
    const id=setInterval(()=>{fetchDash();fetchAnalyze()},5000)
    return()=>clearInterval(id)
  },[fetchDash,fetchAnalyze])

  useEffect(()=>{
    let cd=60;const id=setInterval(()=>{cd--;if(cd<=0)cd=60;setCountdown(cd)},1000)
    return()=>clearInterval(id)
  },[])

  /* Keyboard shortcuts */
  useEffect(()=>{
    const h=e=>{
      if(e.target.tagName==='INPUT')return
      if(e.key==='+'||e.key==='=')setZoom(z=>+(Math.min(8,z+.2)).toFixed(1))
      if(e.key==='-')setZoom(z=>+(Math.max(.3,z-.2)).toFixed(1))
      if(e.key==='0')setZoom(1)
      if(e.key==='ArrowLeft')setOffsetX(o=>o+8)
      if(e.key==='ArrowRight')setOffsetX(o=>Math.max(0,o-8))
      if(e.key==='End')setOffsetX(0)
    }
    window.addEventListener('keydown',h)
    return()=>window.removeEventListener('keydown',h)
  },[])

  /* Derived data */
  const assetData =dash?.assets?.find(a=>a.symbol===symbol)
  const stats     =dash?.stats||{total:0,wins:0,losses:0,pending:0}
  const wr        =stats.total>0?Math.round(stats.wins/stats.total*100):0
  const lockedSig =analyze?.lockedSignal||assetData?.lockedSignal
  const plan      =subscription?.plan||user?.plan||'free'
  const planColor =plan==='elite'?C.teal:plan==='premium'?'#378ADD':plan==='basico'?C.green:C.muted

  /* ✅ FIX: conflictData memoized para evitar re-renders infinitos */
  const conflictData=useMemo(()=>detectConflict(lockedSig,analyze),[
    lockedSig?.id, lockedSig?.action,
    analyze?.price, analyze?.signal?.action, analyze?.signal?.score
  ])

  /* Auto-reset dismiss on new conflict */
  useEffect(()=>{
    if(!conflictData)return
    const key=conflictData.conflicts.map(c=>c.type+c.title).join('|')
    if(key!==prevConflictKey.current){prevConflictKey.current=key;setConflictDismissed(false)}
  },[conflictData])

  /* Chart render */
  const renderChart=useCallback(()=>{
    if(!analyze||!canvasRef.current)return
    const cKey=tf==='H1'?'candlesH1':tf==='M15'?'candlesM15':tf==='M1'?'candlesM1':'candles'
    const dKey=tf==='H1'?'demandZonesH1':tf==='M15'?'demandZonesM15':'demandZones'
    const sKey=tf==='H1'?'supplyZonesH1':tf==='M15'?'supplyZonesM15':'supplyZones'
    const candles=analyze[cKey]
    if(!candles?.length)return
    const ls=analyze.lockedSignal||assetData?.lockedSignal||null
    drawChart(canvasRef.current,{
      candles,
      demandZones:analyze[dKey]||[],
      supplyZones:analyze[sKey]||[],
      choch:analyze.chartOverlays?.choch,
      bos:analyze.chartOverlays?.bos,
      chochM15:analyze.chartOverlays?.chochM15,
      bosM15:analyze.chartOverlays?.bosM15,
      structure:analyze.structureM5Data||{},
      lockedSignal:ls, zoom, offsetX,
      conflictData: section==='dashboard'?conflictData:null
    })
  },[analyze,tf,assetData,zoom,offsetX,conflictData,section])

  useEffect(()=>{renderChart()},[renderChart])

  useEffect(()=>{
    const obs=new ResizeObserver(()=>setTimeout(renderChart,40))
    if(canvasRef.current?.parentElement)obs.observe(canvasRef.current.parentElement)
    return()=>obs.disconnect()
  },[renderChart])

  /* ─── RENDER ─── */
  return(
    <div style={{display:'flex',flexDirection:'column',height:'100dvh',background:C.bg0,overflow:'hidden'}}>

      {/* HEADER */}
      <header style={{background:C.bg1,borderBottom:`1px solid ${C.border}`,
        padding:'5px 12px',display:'flex',alignItems:'center',gap:8,flexShrink:0,flexWrap:'wrap',minHeight:46}}>
        <button onClick={()=>setSidebarOpen(o=>!o)}
          style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:17,padding:'0 3px',flexShrink:0}}>☰</button>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:27,height:27,borderRadius:5,background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',
            border:`1px solid ${C.teal}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}}>📊</div>
          <span style={{fontWeight:800,fontSize:13,color:C.teal}}>TradingPro</span>
        </div>
        <span style={{background:'rgba(0,212,170,.1)',color:C.teal,fontSize:10,fontWeight:700,
          padding:'2px 7px',borderRadius:20,border:`1px solid ${C.tealDark}`,flexShrink:0}}>6 Modelos SMC</span>
        <div style={{display:'flex',gap:3,marginLeft:'auto',overflowX:'auto'}}>
          {TFS.map(t=>(
            <button key={t} className={`btn-ghost${tf===t?' active':''}`}
              onClick={()=>setTF(t)} style={{padding:'3px 9px',fontSize:11,whiteSpace:'nowrap'}}>{t}</button>
          ))}
        </div>
        <span style={{background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',color:C.teal,
          fontSize:11,fontWeight:800,padding:'3px 8px',border:`1px solid ${C.teal}`,borderRadius:5,flexShrink:0}}>
          ✓ {plan.toUpperCase()}
        </span>
        {/* Mostrar señal oculta */}
        {lockedSig&&!cardVisible&&(
          <button onClick={()=>setCardVisible(true)} style={{
            background:lockedSig.action==='LONG'||lockedSig.action==='BUY'?'rgba(0,212,170,.15)':'rgba(255,107,107,.15)',
            color:lockedSig.action==='LONG'||lockedSig.action==='BUY'?C.teal:C.red,
            border:`1px solid ${lockedSig.action==='LONG'||lockedSig.action==='BUY'?C.teal:C.red}`,
            borderRadius:6,padding:'3px 8px',fontSize:10,fontWeight:700,cursor:'pointer',flexShrink:0}}>
            {lockedSig.action==='LONG'||lockedSig.action==='BUY'?'📈':'📉'} Ver señal
          </button>
        )}
        {user.isAdmin&&(
          <button onClick={()=>navigate('/admin')} className="btn-ghost" style={{padding:'3px 9px',fontSize:11}}>Admin</button>
        )}
        <button onClick={onLogout} className="btn-ghost" style={{padding:'3px 9px',fontSize:11}}>Salir</button>
      </header>

      {/* BODY */}
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* SIDEBAR */}
        <aside style={{
          width:sidebarOpen?'clamp(138px,18vw,174px)':'0',
          minWidth:sidebarOpen?'clamp(138px,18vw,174px)':'0',
          overflow:'hidden',background:C.bg1,
          borderRight:`1px solid ${C.border}`,
          display:'flex',flexDirection:'column',
          flexShrink:0,transition:'width .2s,min-width .2s'
        }}>
          {NAV.map(n=>(
            <div key={n.key}
              onClick={()=>n.key==='modelos'?navigate('/modelos'):setSection(n.key)}
              style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
                fontSize:12,cursor:'pointer',borderRadius:6,margin:'1px 5px',whiteSpace:'nowrap',
                color:section===n.key?C.teal:C.muted,
                background:section===n.key?C.tealBg:'transparent',
                border:`1px solid ${section===n.key?C.tealDark+'44':'transparent'}`}}>
              <span style={{fontSize:13}}>{n.icon}</span>{n.label}
            </div>
          ))}
          <div style={{padding:'7px 10px',fontSize:10,fontWeight:600,color:C.muted,letterSpacing:'.05em',marginTop:3,whiteSpace:'nowrap'}}>MERCADOS</div>
          {Object.entries(ASSETS).map(([sym,cfg])=>{
            const ad=dash?.assets?.find(a=>a.symbol===sym)
            const isAct=sym===symbol
            const trend=ad?.structureM5||'LOADING'
            const tc=trend==='BULLISH'?C.teal:trend==='BEARISH'?C.red:C.muted
            return(
              <div key={sym} onClick={()=>{setSymbol(sym);setSection('dashboard')}}
                style={{display:'flex',alignItems:'center',gap:7,padding:'7px 10px',
                  fontSize:11,cursor:'pointer',borderRadius:6,margin:'1px 5px',
                  background:isAct?C.bg3:'transparent',border:`1px solid ${isAct?C.border:'transparent'}`}}>
                <div style={{width:25,height:25,borderRadius:5,background:isAct?'#1a3a2a':C.bg2,
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0}}>{cfg.emoji}</div>
                <div style={{flex:1,minWidth:0,overflow:'hidden'}}>
                  <div style={{fontWeight:600,color:C.text,fontSize:11,whiteSpace:'nowrap'}}>{cfg.shortName}</div>
                  <div style={{fontSize:9,color:tc,fontWeight:700}}>{trend}</div>
                </div>
                {ad?.lockedSignal&&<span style={{width:7,height:7,borderRadius:'50%',background:C.teal,flexShrink:0}}/>}
              </div>
            )
          })}
          <div style={{padding:'7px 8px',marginTop:'auto'}}>
            <button onClick={()=>setShowElisa(s=>!s)} style={{
              width:'100%',padding:'7px',borderRadius:8,border:`1px solid ${C.teal}44`,
              background:C.tealBg,color:C.teal,cursor:'pointer',fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>
              💜 Hablar con Elisa
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>
          {/* Stats row */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,
            padding:'6px 10px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            <StatCard label="WIN RATE" value={wr+'%'} sub={stats.total>0?`${stats.total} ops`:'Sin ops'} color={C.teal}/>
            <StatCard label="ACTIVAS"  value={stats.pending||0} sub="En curso"   color={C.teal}/>
            <StatCard label="WINS"     value={stats.wins||0}    sub="Ganadoras"  color={C.green}/>
            <StatCard label="LOSS"     value={stats.losses||0}  sub="Pérdidas"   color={C.red}/>
          </div>

          <div style={{flex:1,display:'flex',flexDirection:'column',padding:'6px 10px',gap:5,overflow:'hidden'}}>

            {/* DASHBOARD */}
            {section==='dashboard'&&(
              <>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',flexShrink:0}}>
                  <span style={{fontSize:18}}>{ASSETS[symbol]?.emoji}</span>
                  <span style={{fontWeight:700,fontSize:13,color:C.text}}>{ASSETS[symbol]?.name}</span>
                  <StructTag label="M5"  trend={assetData?.structureM5}/>
                  <StructTag label="M15" trend={assetData?.structureM15}/>
                  <StructTag label="H1"  trend={assetData?.structureH1}/>
                  {assetData?.mtfConfluence&&(
                    <span style={{fontSize:10,fontWeight:700,color:C.teal,background:'rgba(0,212,170,.08)',
                      padding:'2px 7px',borderRadius:4,border:`1px solid ${C.teal}44`}}>★ MTF</span>
                  )}
                  <div style={{marginLeft:'auto',textAlign:'right'}}>
                    <div style={{fontSize:20,fontWeight:800,color:C.text,fontVariantNumeric:'tabular-nums'}}>
                      {analyze?.price?.toFixed(2)||assetData?.price?.toFixed(2)||'···'}
                    </div>
                    <div style={{fontSize:9,color:C.muted}}>
                      {tf} · {(tf==='M5'?analyze?.candles:tf==='H1'?analyze?.candlesH1:tf==='M15'?analyze?.candlesM15:analyze?.candlesM1)?.length||0} velas
                    </div>
                  </div>
                </div>

                <ChartContainer zoom={zoom} setZoom={setZoom} offsetX={offsetX} setOffsetX={setOffsetX}>
                  <canvas ref={canvasRef}
                    style={{width:'100%',height:'100%',borderRadius:8,border:`1px solid ${C.border}`,display:'block'}}/>
                  {!analyze&&(
                    <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',
                      justifyContent:'center',color:C.muted}}>
                      <div style={{textAlign:'center'}}>
                        <div style={{fontSize:22,marginBottom:8}}>⟳</div>
                        <div style={{fontSize:13}}>Cargando datos del mercado...</div>
                      </div>
                    </div>
                  )}
                </ChartContainer>

                {analyze?.signal&&(
                  <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,
                    padding:'5px 10px',display:'flex',alignItems:'center',gap:8,flexShrink:0,flexWrap:'wrap'}}>
                    <span style={{fontSize:10,color:C.muted}}>Modelo:</span>
                    <span style={{fontSize:11,fontWeight:700,color:C.teal}}>{analyze.signal.model}</span>
                    <span style={{fontSize:10,color:C.muted}}>Score:</span>
                    <span style={{fontSize:11,fontWeight:700,color:analyze.signal.score>=82?C.green:C.yellow}}>{analyze.signal.score}%</span>
                    <Pill type={analyze.signal.action} text={
                      analyze.signal.action==='LONG'?'COMPRA':analyze.signal.action==='SHORT'?'VENTA':
                      analyze.signal.action==='WAIT'?'ESPERAR':'CARGANDO'}/>
                    <span style={{fontSize:10,color:C.muted,marginLeft:'auto',
                      maxWidth:300,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {analyze.signal.reason}
                    </span>
                  </div>
                )}

                {analyze?.m1Steps&&(
                  <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,
                    padding:'4px 10px',display:'flex',alignItems:'center',gap:5,flexShrink:0,flexWrap:'wrap'}}>
                    <span style={{fontSize:10,color:C.muted,fontWeight:600}}>M1 PRECISION:</span>
                    {[['H1 ✓','h1ok'],['M15 ✓','m15ok'],['M5 ✓','m5ok'],['Zona M15','zoneok'],['Conf M1','m1conf']].map(([lbl,key])=>(
                      <span key={key} style={{fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:4,
                        background:analyze.m1Steps[key]?C.tealBg:C.bg3,
                        color:analyze.m1Steps[key]?C.teal:C.muted,
                        border:`1px solid ${analyze.m1Steps[key]?C.tealDark:C.border}`}}>{lbl}</span>
                    ))}
                    <span style={{marginLeft:'auto',fontSize:10,color:C.teal,fontWeight:700}}>{analyze.m1Steps.readyCount}/5</span>
                  </div>
                )}
              </>
            )}

            {section==='senales'&&(
              <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',gap:7}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                  <h2 style={{fontSize:14,fontWeight:700,color:C.text,margin:0}}>◎ Señales</h2>
                  <span style={{fontSize:11,color:C.muted}}>{signals.length} registradas</span>
                  <button onClick={fetchDash} className="btn-ghost" style={{marginLeft:'auto',padding:'3px 10px',fontSize:11}}>↻ Actualizar</button>
                </div>
                <SenalesPanel signals={signals}/>
              </div>
            )}
            {section==='stats'&&(
              <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',gap:7}}>
                <h2 style={{fontSize:14,fontWeight:700,color:C.text,margin:0,flexShrink:0}}>◇ Estadísticas</h2>
                <StatsPanel stats={stats} signals={signals}/>
              </div>
            )}
            {section==='historial'&&(
              <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',gap:7}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                  <h2 style={{fontSize:14,fontWeight:700,color:C.text,margin:0}}>≡ Historial</h2>
                  <span style={{fontSize:11,color:C.muted}}>{signals.filter(s=>s.status!=='PENDING').length} cerradas</span>
                </div>
                <HistorialPanel signals={signals}/>
              </div>
            )}
          </div>

          {/* Scanner bar */}
          <div style={{background:C.bg1,borderTop:`1px solid ${C.border}`,
            padding:'4px 12px',display:'flex',alignItems:'center',gap:8,flexShrink:0,flexWrap:'wrap'}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:C.teal,display:'inline-block'}}/>
            <span style={{fontSize:10,color:C.muted}}>Scanner · próx</span>
            <span style={{fontSize:10,fontWeight:700,color:C.teal}}>{countdown}s</span>
            <Pill type={lockedSig?lockedSig.action:analyze?.signal?.action||'LOADING'}
              text={lockedSig?`${lockedSig.action==='LONG'||lockedSig.action==='BUY'?'COMPRA':'VENTA'} #${lockedSig.id}`:
                analyze?.signal?.action==='LONG'?'COMPRA':analyze?.signal?.action==='SHORT'?'VENTA':'ESPERANDO'}/>
            {conflictData&&!conflictDismissed&&(
              <span style={{fontSize:9,fontWeight:700,color:C.yellow,
                background:'rgba(249,202,36,.1)',padding:'1px 6px',borderRadius:4,
                border:'1px solid rgba(249,202,36,.3)'}}>⚠️ CONFLICTO</span>
            )}
            <span style={{fontSize:9,color:C.border,marginLeft:'auto'}}>+/− zoom · ← → pan · 0 reset</span>
            <span style={{fontSize:10,color:C.muted}}>{new Date().toLocaleTimeString('es',{hour12:false})}</span>
            <button onClick={()=>{fetchDash();fetchAnalyze()}}
              className="btn-ghost" style={{padding:'2px 8px',fontSize:10}}>↻</button>
          </div>
        </main>
      </div>

      {/* FLOATING PANELS — renderizados FUERA del layout principal */}

      {/* Signal card — draggable */}
      {lockedSig&&section==='dashboard'&&(
        <SignalCard
          signal={lockedSig} assetConfig={ASSETS[symbol]}
          cardPos={cardPos} setCardPos={setCardPos}
          cardVisible={cardVisible} setCardVisible={setCardVisible}
          hasConflict={!!conflictData}/>
      )}

      {/* Conflict alert */}
      {conflictData&&!conflictDismissed&&section==='dashboard'&&(
        <ConflictAlert conflictData={conflictData} onDismiss={()=>setConflictDismissed(true)}/>
      )}

      {/* Elisa chat */}
      {showElisa&&<ElisaChat symbol={symbol} onClose={()=>setShowElisa(false)}/>}

      {/* FAB */}
      {!showElisa&&(
        <button onClick={()=>setShowElisa(true)} style={{
          position:'fixed',right:20,bottom:20,width:48,height:48,
          borderRadius:'50%',background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',
          border:`2px solid ${C.teal}`,color:C.teal,fontSize:19,cursor:'pointer',
          boxShadow:`0 0 20px ${C.teal}44`,zIndex:98}}>💜</button>
      )}
    </div>
  )
}
