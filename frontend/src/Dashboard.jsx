import React, { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from './config/plans.js'

const C = {
  bg0:'#0d1117', bg1:'#161b22', bg2:'#1c2330', bg3:'#21262d',
  border:'#30363d', text:'#e6edf3', muted:'#7d8590',
  teal:'#00d4aa', tealDark:'#00b894', tealBg:'rgba(0,212,170,.12)',
  red:'#ff6b6b', redBg:'rgba(255,107,107,.12)',
  yellow:'#f9ca24', green:'#3fb950', bull:'#3fb950', bear:'#ff6b6b'
}

/* ═══════════════════════════════════════════════════════════════════════
   CHART RENDERER — zoom + pan + todos los overlays
   ═══════════════════════════════════════════════════════════════════════ */
function drawChart(canvas, state) {
  const {
    candles=[], demandZones=[], supplyZones=[],
    choch, bos, chochM15, bosM15,
    structure={}, lockedSignal,
    zoom=1, offsetX=0               // zoom y paneo
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

  const ML=64, MR=66, MT=20, MB=32
  const CW=W-ML-MR, CH=H-MT-MB
  if (CW<40||CH<40) return

  /* Velas visibles según zoom y offset */
  const candlesPerView = Math.max(10, Math.floor((CW/7) / zoom))
  const totalCandles   = candles.length
  const maxOffset      = Math.max(0, totalCandles - candlesPerView)
  const safeOffset     = Math.max(0, Math.min(maxOffset, Math.round(offsetX)))
  const startIdx       = Math.max(0, totalCandles - candlesPerView - safeOffset)
  const endIdx         = Math.max(startIdx+5, totalCandles - safeOffset)
  const vis            = candles.slice(startIdx, endIdx)
  const visOff         = startIdx

  if (!vis.length) return

  /* Rango de precios incluyendo niveles de señal */
  const allP = vis.flatMap(c=>[c.high,c.low])
  if (lockedSignal) {
    const {entry,stop,tp1,tp2,tp3}=lockedSignal
    ;[entry,stop,tp1,tp2,tp3].forEach(v=>{if(v!=null)allP.push(v)})
  }
  const mn=Math.min(...allP), mx=Math.max(...allP)
  const rng=mx-mn||1
  const PN=mn-rng*.09, PX=mx+rng*.13, PR=PX-PN
  const py=p=>MT+CH*(1-(p-PN)/PR)

  const n=vis.length, SL=CW/n, BW=Math.max(Math.floor(SL*.65),2)
  const cx=i=>ML+SL*i+SL/2
  const gridStep=rng<3?.5:rng<10?1:rng<30?5:10

  /* Grid */
  ctx.strokeStyle='rgba(255,255,255,.04)'; ctx.lineWidth=1
  for(let p=Math.ceil(PN/gridStep)*gridStep;p<=PX;p+=gridStep){
    ctx.beginPath();ctx.moveTo(ML,py(p));ctx.lineTo(ML+CW,py(p));ctx.stroke()
  }

  /* OB Zones */
  ;[
    {zones:demandZones,fill:'rgba(63,185,80,.13)',stroke:C.green,label:'OB demanda'},
    {zones:supplyZones,fill:'rgba(255,107,107,.13)',stroke:C.red,label:'OB oferta'}
  ].forEach(({zones,fill,stroke,label})=>{
    zones.filter(z=>!z.mitigated).forEach(z=>{
      const zi=z.index-visOff
      const x1=zi>=0?Math.max(ML,cx(zi)-SL/2):ML
      const x2=ML+CW
      if(x1>=x2)return
      const y1=py(z.high),y2=py(z.low)
      ctx.fillStyle=fill;ctx.fillRect(x1,y1,x2-x1,y2-y1)
      ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.strokeRect(x1,y1,x2-x1,y2-y1)
      ctx.fillStyle=stroke;ctx.font='bold 9px system-ui';ctx.textAlign='left'
      ctx.fillText(z.isStructureOB?label+' ★':label,x1+4,y1+11)
    })
  })

  /* BOS / CHoCH lines */
  const drawLevel=(lvl,color,tag)=>{
    if(!lvl||lvl.level==null)return
    const bi=(lvl.breakIndex||0)-visOff
    const startX=bi>=0?Math.max(ML,cx(bi)):ML
    if(startX>ML+CW)return
    ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.setLineDash([8,5])
    ctx.beginPath();ctx.moveTo(startX,py(lvl.level));ctx.lineTo(ML+CW,py(lvl.level));ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle=color;ctx.font='bold 8px system-ui';ctx.textAlign='right'
    ctx.fillText(tag,ML+CW-3,py(lvl.level)-3)
  }
  drawLevel(bos,C.text,'BOS M5')
  drawLevel(choch,C.yellow,'CHoCH M5')
  drawLevel(bosM15,'rgba(160,160,255,.8)','BOS M15')
  drawLevel(chochM15,'rgba(255,220,80,.7)','CHoCH M15')

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

  /* Signal lines: Entry / TP / SL */
  if(lockedSignal){
    const{action,entry,stop,tp1,tp2,tp3,tp1Hit,tp2Hit}=lockedSignal
    const isLong=action==='LONG'
    const levels=[
      {p:tp3,tag:'TP3',col:'#00b894'},
      {p:tp2,tag:tp2Hit?'✅TP2':'TP2',col:C.teal},
      {p:tp1,tag:tp1Hit?'✅TP1':'TP1',col:C.green},
      {p:entry,tag:'Entry',col:C.yellow},
      {p:stop,tag:'SL',col:C.red}
    ]
    levels.forEach(({p,tag,col})=>{
      if(p==null)return
      const y=py(p)
      if(y<MT-2||y>MT+CH+2)return
      ctx.strokeStyle=col+'bb';ctx.lineWidth=tag==='Entry'?2:1.5;ctx.setLineDash([5,4])
      ctx.beginPath();ctx.moveTo(ML,y);ctx.lineTo(ML+CW,y);ctx.stroke()
      ctx.setLineDash([])
      const lw=tag.length*6.5+p.toFixed(2).length*5.5+12
      ctx.fillStyle=col+'22';ctx.strokeStyle=col;ctx.lineWidth=1
      ctx.beginPath();ctx.roundRect(ML+CW+3,y-9,lw,18,4);ctx.fill();ctx.stroke()
      ctx.fillStyle=col;ctx.font='bold 8.5px system-ui';ctx.textAlign='left'
      ctx.fillText(`${tag}  ${p.toFixed(2)}`,ML+CW+7,y+4)
    })
    /* Flecha entry */
    const ey=py(entry)
    if(ey>=MT&&ey<=MT+CH){
      const ex=cx(Math.max(0,n-4))
      const col=isLong?C.green:C.red
      ctx.strokeStyle=col;ctx.lineWidth=3;ctx.fillStyle=col
      const tail=isLong?ey+34:ey-34
      ctx.beginPath();ctx.moveTo(ex,tail);ctx.lineTo(ex,isLong?ey+8:ey-8);ctx.stroke()
      ctx.beginPath()
      if(isLong){ctx.moveTo(ex-9,ey+18);ctx.lineTo(ex,ey);ctx.lineTo(ex+9,ey+18)}
      else{ctx.moveTo(ex-9,ey-18);ctx.lineTo(ex,ey);ctx.lineTo(ex+9,ey-18)}
      ctx.fill()
    }
  }

  /* Velas */
  vis.forEach((c,i)=>{
    const x=cx(i),bull=c.close>=c.open,col=bull?C.bull:C.bear
    ctx.strokeStyle=col;ctx.lineWidth=1.5
    ctx.beginPath();ctx.moveTo(x,py(c.high));ctx.lineTo(x,py(c.low));ctx.stroke()
    const bt=py(Math.max(c.open,c.close)),bh=Math.max(py(Math.min(c.open,c.close))-bt,1)
    ctx.fillStyle=bull?C.bull+'cc':C.bear+'cc';ctx.fillRect(x-BW/2,bt,BW,bh)
    if(!bull){ctx.strokeStyle=C.bear;ctx.lineWidth=.8;ctx.strokeRect(x-BW/2,bt,BW,bh)}
  })

  /* Eje Y */
  ctx.fillStyle=C.muted;ctx.font='9px system-ui';ctx.textAlign='right'
  for(let p=Math.ceil(PN/gridStep)*gridStep;p<=PX;p+=gridStep){
    const y=py(p)
    if(y>MT+8&&y<MT+CH)ctx.fillText(p.toFixed(gridStep<1?2:0),ML-4,y+3)
  }

  /* Precio actual */
  const last=vis[vis.length-1]
  if(last){
    const py2=py(last.close)
    ctx.strokeStyle='rgba(255,255,255,.2)';ctx.lineWidth=1;ctx.setLineDash([2,3])
    ctx.beginPath();ctx.moveTo(ML,py2);ctx.lineTo(ML+CW,py2);ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle=C.teal;ctx.beginPath();ctx.roundRect(ML+CW-1,py2-8,56,16,3);ctx.fill()
    ctx.fillStyle='#000';ctx.font='bold 9px system-ui';ctx.textAlign='left'
    ctx.fillText(last.close.toFixed(2),ML+CW+3,py2+4)
  }

  /* Indicador de zoom */
  if(zoom!==1||safeOffset>0){
    ctx.fillStyle='rgba(0,212,170,.7)';ctx.font='bold 9px system-ui';ctx.textAlign='left'
    ctx.fillText(`${(zoom).toFixed(1)}x · ${vis.length} velas`,ML+4,MT+14)
  }

  /* Borde */
  ctx.strokeStyle=C.border+'88';ctx.lineWidth=1;ctx.setLineDash([])
  ctx.strokeRect(ML,MT,CW,CH)
}

/* ═══════════════════════════════════════════════════════════════════════
   DRAGGABLE SIGNAL CARD
   ═══════════════════════════════════════════════════════════════════════ */
function SignalCard({ signal, assetConfig, cardPos, setCardPos, cardVisible, setCardVisible }) {
  const dragRef  = useRef(null)
  const isDragging = useRef(false)
  const dragStart  = useRef({x:0,y:0,cx:0,cy:0})

  if (!signal || !cardVisible) return null

  const isLong = signal.action === 'LONG'
  const col    = isLong ? C.teal : C.red

  const onMouseDown = e => {
    if(e.target.closest('button'))return
    isDragging.current=true
    dragStart.current={x:e.clientX,y:e.clientY,cx:cardPos.x,cy:cardPos.y}
    e.preventDefault()
  }
  const onMouseMove = e => {
    if(!isDragging.current)return
    setCardPos({
      x: dragStart.current.cx+(e.clientX-dragStart.current.x),
      y: dragStart.current.cy+(e.clientY-dragStart.current.y)
    })
  }
  const onMouseUp = ()=>{isDragging.current=false}

  useEffect(()=>{
    window.addEventListener('mousemove',onMouseMove)
    window.addEventListener('mouseup',onMouseUp)
    return()=>{window.removeEventListener('mousemove',onMouseMove);window.removeEventListener('mouseup',onMouseUp)}
  },[cardPos])

  /* Touch support */
  const onTouchStart = e => {
    const t=e.touches[0]
    isDragging.current=true
    dragStart.current={x:t.clientX,y:t.clientY,cx:cardPos.x,cy:cardPos.y}
  }
  const onTouchMove = e => {
    if(!isDragging.current)return
    const t=e.touches[0]
    setCardPos({
      x:dragStart.current.cx+(t.clientX-dragStart.current.x),
      y:dragStart.current.cy+(t.clientY-dragStart.current.y)
    })
  }

  return (
    <div ref={dragRef}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={()=>{isDragging.current=false}}
      style={{
        position:'fixed', left:cardPos.x, top:cardPos.y, width:260,
        background:C.bg1, border:`2px solid ${col}`, borderRadius:10,
        padding:'10px 14px', zIndex:200, cursor:'grab', userSelect:'none',
        boxShadow:`0 4px 24px ${col}33`,
        touchAction:'none'
      }}>
      {/* Header drag zone */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <span style={{fontSize:16}}>{assetConfig?.emoji||'📊'}</span>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:col}}>{isLong?'● COMPRA':'● VENTA'}</div>
            <div style={{fontSize:10,color:C.muted}}>{signal.model} · {signal.score}%</div>
          </div>
        </div>
        <div style={{display:'flex',gap:4,alignItems:'center'}}>
          {/* Toggle minimize */}
          <button onClick={()=>setCardVisible(false)} style={{
            background:'none',border:`1px solid ${C.border}`,color:C.muted,
            borderRadius:4,width:20,height:20,cursor:'pointer',fontSize:12,
            display:'flex',alignItems:'center',justifyContent:'center'
          }}>−</button>
        </div>
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

      {/* Drag hint */}
      <div style={{marginTop:6,textAlign:'center',fontSize:9,color:C.border}}>⠿ arrastrar para mover</div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   CHART CONTAINER — zoom wheel + drag to pan
   ═══════════════════════════════════════════════════════════════════════ */
function ChartContainer({ children, zoom, setZoom, offsetX, setOffsetX, canvasRef }) {
  const isPanning   = useRef(false)
  const panStart    = useRef({x:0,off:0})
  const containerRef= useRef(null)

  /* Wheel zoom */
  const onWheel = useCallback(e=>{
    e.preventDefault()
    const delta=e.deltaY>0?-.1:.1
    setZoom(z=>Math.max(.3,Math.min(8,+(z+delta).toFixed(1))))
  },[setZoom])

  useEffect(()=>{
    const el=containerRef.current
    if(!el)return
    el.addEventListener('wheel',onWheel,{passive:false})
    return()=>el.removeEventListener('wheel',onWheel)
  },[onWheel])

  /* Mouse drag to pan */
  const onMouseDown=e=>{
    if(e.button!==0)return
    isPanning.current=true
    panStart.current={x:e.clientX,off:offsetX}
    e.currentTarget.style.cursor='grabbing'
  }
  const onMouseMove=e=>{
    if(!isPanning.current)return
    const dx=e.clientX-panStart.current.x
    const candleW=7/zoom
    setOffsetX(Math.max(0,panStart.current.off-dx/candleW))
  }
  const onMouseUp=e=>{isPanning.current=false;e.currentTarget.style.cursor='crosshair'}

  /* Touch pinch zoom */
  const touchDist=useRef(null)
  const onTouchStart=e=>{
    if(e.touches.length===2){
      touchDist.current=Math.hypot(
        e.touches[0].clientX-e.touches[1].clientX,
        e.touches[0].clientY-e.touches[1].clientY
      )
    } else if(e.touches.length===1){
      isPanning.current=true
      panStart.current={x:e.touches[0].clientX,off:offsetX}
    }
  }
  const onTouchMove=e=>{
    if(e.touches.length===2&&touchDist.current!=null){
      const d=Math.hypot(
        e.touches[0].clientX-e.touches[1].clientX,
        e.touches[0].clientY-e.touches[1].clientY
      )
      const scale=d/touchDist.current
      setZoom(z=>Math.max(.3,Math.min(8,+(z*scale).toFixed(2))))
      touchDist.current=d
    } else if(e.touches.length===1&&isPanning.current){
      const dx=e.touches[0].clientX-panStart.current.x
      const candleW=7/zoom
      setOffsetX(Math.max(0,panStart.current.off-dx/candleW))
    }
  }
  const onTouchEnd=()=>{isPanning.current=false;touchDist.current=null}

  return (
    <div ref={containerRef}
      style={{flex:1,position:'relative',minHeight:0,cursor:'crosshair',touchAction:'none'}}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove}
      onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {children}
      {/* Zoom controls overlay */}
      <div style={{position:'absolute',bottom:10,right:70,display:'flex',
        gap:4,background:'rgba(13,17,23,.85)',borderRadius:6,padding:'3px 4px',
        border:`1px solid ${C.border}`,zIndex:10}}>
        <button onClick={()=>setZoom(z=>Math.min(8,+(z+.2).toFixed(1)))}
          style={zBtn}>+</button>
        <button onClick={()=>setZoom(1)} title="Reset zoom"
          style={{...zBtn,minWidth:38,fontSize:10}}>{zoom.toFixed(1)}x</button>
        <button onClick={()=>setZoom(z=>Math.max(.3,+(z-.2).toFixed(1)))}
          style={zBtn}>−</button>
        <div style={{width:1,background:C.border,margin:'0 2px'}}/>
        <button onClick={()=>setOffsetX(0)} title="Ir al presente"
          style={zBtn}>→|</button>
        <button onClick={()=>setOffsetX(o=>o+10)} title="Ir atrás"
          style={zBtn}>←</button>
      </div>
    </div>
  )
}
const zBtn={background:'transparent',border:'none',color:C.muted,
  cursor:'pointer',padding:'2px 7px',fontSize:13,borderRadius:4,fontWeight:700,
  ':hover':{color:C.teal}}

/* ═══════════════════════════════════════════════════════════════════════
   PANELS
   ═══════════════════════════════════════════════════════════════════════ */
function SenalesPanel({signals}){
  const colDir=a=>a==='LONG'||a==='BUY'?C.teal:C.red
  if(!signals.length)return<p style={{color:C.muted,fontSize:13,padding:'20px 0'}}>Sin señales registradas aún.</p>
  return(
    <div style={{overflowX:'auto',overflowY:'auto',flex:1}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:700}}>
        <thead><tr style={{background:C.bg2}}>
          {['#','Activo','Dir','Modelo','Score','Entry','SL','TP1','Estado','Tiempo'].map(h=>(
            <th key={h} style={{padding:'8px 10px',textAlign:'left',color:C.muted,
              fontWeight:600,fontSize:10,borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>{signals.slice(0,80).map(s=>(
          <tr key={s.id} style={{borderBottom:`1px solid ${C.border}22`}}>
            <td style={{padding:'7px 10px',color:C.muted}}>#{s.id}</td>
            <td style={{padding:'7px 10px',color:C.text,whiteSpace:'nowrap'}}>{s.assetName||s.symbol}</td>
            <td style={{padding:'7px 10px'}}><span style={{color:colDir(s.action),fontWeight:700}}>{s.action==='LONG'?'COMPRA':'VENTA'}</span></td>
            <td style={{padding:'7px 10px',color:C.teal,fontSize:10,whiteSpace:'nowrap'}}>{s.model}</td>
            <td style={{padding:'7px 10px',color:s.score>=82?C.green:C.yellow,fontWeight:700}}>{s.score}%</td>
            <td style={{padding:'7px 10px',fontVariantNumeric:'tabular-nums'}}>{s.entry?.toFixed(2)}</td>
            <td style={{padding:'7px 10px',color:C.red}}>{s.stop?.toFixed(2)}</td>
            <td style={{padding:'7px 10px',color:C.teal}}>{s.tp1?.toFixed(2)}</td>
            <td style={{padding:'7px 10px'}}><span style={{color:s.status==='WIN'?C.green:s.status==='LOSS'?C.red:C.yellow,fontWeight:700}}>{s.status}</span></td>
            <td style={{padding:'7px 10px',color:C.muted,fontSize:10,whiteSpace:'nowrap'}}>
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
    <div style={{overflowY:'auto',flex:1,display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:8}}>
        {[{l:'Win Rate',v:`${wr}%`,c:wr>=60?C.green:wr>=40?C.yellow:C.red},
          {l:'Total ops',v:stats.total||0},{l:'Wins',v:stats.wins||0,c:C.green},
          {l:'Losses',v:stats.losses||0,c:C.red},{l:'Activas',v:stats.pending||0,c:C.yellow},
          {l:'TP1',v:stats.tp1Hits||0,c:C.teal},{l:'TP2',v:stats.tp2Hits||0,c:C.teal},{l:'TP3',v:stats.tp3Hits||0,c:C.teal}
        ].map(({l,v,c})=>(
          <div key={l} className="card" style={{padding:'10px 14px'}}>
            <div style={{fontSize:9,color:C.muted,marginBottom:4,textTransform:'uppercase',letterSpacing:'.05em'}}>{l}</div>
            <div style={{fontSize:22,fontWeight:800,color:c||C.text}}>{v}</div>
          </div>
        ))}
      </div>
      {Object.keys(byModel).length>0&&(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'8px 12px',fontSize:10,fontWeight:600,color:C.muted,borderBottom:`1px solid ${C.border}`,letterSpacing:'.05em'}}>POR MODELO</div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:300}}>
              <thead><tr style={{background:C.bg2}}>
                {['Modelo','Wins','Losses','Win Rate'].map(h=>(
                  <th key={h} style={{padding:'7px 12px',textAlign:'left',color:C.muted,fontWeight:600,fontSize:10,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{Object.entries(byModel).map(([model,d])=>{
                const mwr=d.wins+d.losses>0?Math.round(d.wins/(d.wins+d.losses)*100):0
                return(<tr key={model} style={{borderBottom:`1px solid ${C.border}22`}}>
                  <td style={{padding:'7px 12px',color:C.teal,fontWeight:700}}>{model}</td>
                  <td style={{padding:'7px 12px',color:C.green,fontWeight:700}}>{d.wins}</td>
                  <td style={{padding:'7px 12px',color:C.red}}>{d.losses}</td>
                  <td style={{padding:'7px 12px',color:mwr>=60?C.green:mwr>=40?C.yellow:C.red,fontWeight:700}}>{mwr}%</td>
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
            borderRadius:6,padding:'10px 14px',marginBottom:8}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{color:sc,fontWeight:700,fontSize:12}}>{isWin?'✅ WIN':'❌ LOSS'}</span>
                <span style={{color:C.teal,fontSize:11,fontWeight:700}}>{s.action==='LONG'?'COMPRA':'VENTA'}</span>
                <span style={{color:C.muted,fontSize:11}}>{s.assetName||s.symbol}</span>
              </div>
              <span style={{color:C.muted,fontSize:10}}>#{s.id} · {s.model}</span>
            </div>
            <div style={{display:'flex',gap:16,fontSize:11,flexWrap:'wrap'}}>
              <span style={{color:C.muted}}>Entry <span style={{color:C.text,fontWeight:700}}>{s.entry?.toFixed(2)}</span></span>
              <span style={{color:C.muted}}>SL <span style={{color:C.red}}>{s.stop?.toFixed(2)}</span></span>
              <span style={{color:C.muted}}>TP1 <span style={{color:C.teal}}>{s.tp1?.toFixed(2)}</span></span>
              <span style={{color:C.muted}}>Score <span style={{color:s.score>=82?C.green:C.yellow,fontWeight:700}}>{s.score}%</span></span>
            </div>
            <div style={{fontSize:10,color:C.muted,marginTop:4}}>
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
  const[input,setInput]=useState('');const[loading,setLoading]=useState(false)
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
      <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',border:`1px solid ${C.teal}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>💜</div>
          <div><div style={{fontSize:13,fontWeight:700,color:C.teal}}>ELISA IA</div><div style={{fontSize:10,color:C.muted}}>Asistente SMC</div></div>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:18}}>✕</button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:8}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{alignSelf:m.from==='user'?'flex-end':'flex-start',maxWidth:'85%',
            padding:'8px 12px',borderRadius:10,whiteSpace:'pre-wrap',
            background:m.from==='user'?C.tealBg:C.bg2,
            border:`1px solid ${m.from==='user'?C.tealDark:C.border}`,
            fontSize:12,color:C.text,lineHeight:1.5}}>{m.text}</div>
        ))}
        {loading&&<div style={{alignSelf:'flex-start',color:C.muted,fontSize:11}}>Elisa está pensando...</div>}
        <div ref={endRef}/>
      </div>
      <div style={{padding:'8px 12px',borderTop:`1px solid ${C.border}`,display:'flex',gap:8}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()}
          placeholder="Pregunta algo..."
          style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,
            padding:'7px 10px',color:C.text,fontSize:12,outline:'none'}}/>
        <button onClick={send} className="btn-teal" style={{padding:'7px 14px',fontSize:12}}>→</button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════ */
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
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════════════════════ */
export default function Dashboard({user,subscription,onLogout}){
  const navigate=useNavigate()
  const canvasRef=useRef(null)

  const[symbol,setSymbol]=useState('stpRNG')
  const[tf,setTF]=useState('M5')
  const[section,setSection]=useState('dashboard')
  const[dash,setDash]=useState(null)
  const[analyze,setAnalyze]=useState(null)
  const[signals,setSignals]=useState([])
  const[countdown,setCountdown]=useState(60)
  const[showElisa,setShowElisa]=useState(false)
  const[sidebarOpen,setSidebarOpen]=useState(true)

  /* Chart zoom + pan */
  const[zoom,setZoom]=useState(1)
  const[offsetX,setOffsetX]=useState(0)

  /* Signal card draggable */
  const[cardPos,setCardPos]=useState({x:20,y:120})
  const[cardVisible,setCardVisible]=useState(true)

  /* Reset card visible when new signal arrives */
  useEffect(()=>setCardVisible(true),[analyze?.lockedSignal?.id])

  /* Fetch */
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

  /* Render chart */
  const renderChart=useCallback(()=>{
    if(!analyze||!canvasRef.current)return
    const candleKey=tf==='H1'?'candlesH1':tf==='M15'?'candlesM15':tf==='M1'?'candlesM1':'candles'
    const dKey=tf==='H1'?'demandZonesH1':tf==='M15'?'demandZonesM15':'demandZones'
    const sKey=tf==='H1'?'supplyZonesH1':tf==='M15'?'supplyZonesM15':'supplyZones'
    const candles=analyze[candleKey]
    if(!candles?.length)return
    const assetData=dash?.assets?.find(a=>a.symbol===symbol)
    const lockedSignal=analyze.lockedSignal||assetData?.lockedSignal||null
    drawChart(canvasRef.current,{
      candles,
      demandZones:analyze[dKey]||[],
      supplyZones:analyze[sKey]||[],
      choch:analyze.chartOverlays?.choch,
      bos:analyze.chartOverlays?.bos,
      chochM15:analyze.chartOverlays?.chochM15,
      bosM15:analyze.chartOverlays?.bosM15,
      structure:analyze.structureM5Data||{},
      lockedSignal,zoom,offsetX
    })
  },[analyze,tf,dash,symbol,zoom,offsetX])

  useEffect(()=>{renderChart()},[renderChart])

  useEffect(()=>{
    const obs=new ResizeObserver(()=>setTimeout(renderChart,40))
    if(canvasRef.current?.parentElement)obs.observe(canvasRef.current.parentElement)
    return()=>obs.disconnect()
  },[renderChart])

  /* Keyboard shortcuts */
  useEffect(()=>{
    const h=e=>{
      if(e.key==='+'||e.key==='=')setZoom(z=>Math.min(8,+(z+.2).toFixed(1)))
      if(e.key==='-')setZoom(z=>Math.max(.3,+(z-.2).toFixed(1)))
      if(e.key==='0')setZoom(1)
      if(e.key==='ArrowLeft')setOffsetX(o=>o+5)
      if(e.key==='ArrowRight')setOffsetX(o=>Math.max(0,o-5))
      if(e.key==='End')setOffsetX(0)
    }
    window.addEventListener('keydown',h)
    return()=>window.removeEventListener('keydown',h)
  },[])

  const assetData=dash?.assets?.find(a=>a.symbol===symbol)
  const stats=dash?.stats||{total:0,wins:0,losses:0,pending:0}
  const wr=stats.total>0?Math.round(stats.wins/stats.total*100):0
  const lockedSig=analyze?.lockedSignal||assetData?.lockedSignal
  const plan=subscription?.plan||user?.plan||'free'
  const planColor=plan==='elite'?C.teal:plan==='premium'?'#378ADD':plan==='basico'?C.green:C.muted

  const StructTag=({label,trend})=>{
    const color=trend==='BULLISH'?C.teal:trend==='BEARISH'?C.red:C.muted
    const bg=trend==='BULLISH'?'rgba(0,212,170,.1)':trend==='BEARISH'?'rgba(255,107,107,.1)':'rgba(255,255,255,.05)'
    return(<span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,border:`1px solid ${color}`,background:bg,color}}>{label}: {trend||'···'}</span>)
  }
  const Pill=({type,text})=>{
    const cls=type==='BUY'||type==='LONG'?'pill pill-buy':type==='SELL'||type==='SHORT'?'pill pill-sell':type==='WAIT'?'pill pill-wait':'pill pill-load'
    return<span className={cls}>{text}</span>
  }

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100dvh',background:C.bg0,overflow:'hidden'}}>

      {/* ── HEADER ── */}
      <header style={{background:C.bg1,borderBottom:`1px solid ${C.border}`,
        padding:'6px 12px',display:'flex',alignItems:'center',gap:8,flexShrink:0,flexWrap:'wrap',minHeight:48}}>
        {/* Hamburger (mobile) */}
        <button onClick={()=>setSidebarOpen(o=>!o)}
          style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:18,padding:'0 4px',flexShrink:0}}>☰</button>

        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:28,height:28,borderRadius:6,background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',
            border:`1px solid ${C.teal}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}}>📊</div>
          <span style={{fontWeight:800,fontSize:13,color:C.teal}}>TradingPro</span>
        </div>

        <span style={{background:'rgba(0,212,170,.1)',color:C.teal,fontSize:10,fontWeight:700,
          padding:'2px 8px',borderRadius:20,border:`1px solid ${C.tealDark}`,flexShrink:0}}>6 Modelos SMC</span>

        {/* TF — scrollable on mobile */}
        <div style={{display:'flex',gap:3,marginLeft:'auto',overflowX:'auto'}}>
          {TFS.map(t=>(
            <button key={t} className={`btn-ghost${tf===t?' active':''}`}
              onClick={()=>setTF(t)} style={{padding:'3px 9px',fontSize:11,whiteSpace:'nowrap'}}>
              {t}
            </button>
          ))}
        </div>

        <span style={{background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',color:C.teal,
          fontSize:11,fontWeight:800,padding:'3px 8px',border:`1px solid ${C.teal}`,borderRadius:5,flexShrink:0}}>
          ✓ {plan.toUpperCase()}
        </span>

        {/* Signal badge (mobile shortcut to re-show card) */}
        {lockedSig&&!cardVisible&&(
          <button onClick={()=>setCardVisible(true)}
            style={{background:lockedSig.action==='LONG'?'rgba(0,212,170,.15)':'rgba(255,107,107,.15)',
              color:lockedSig.action==='LONG'?C.teal:C.red,
              border:`1px solid ${lockedSig.action==='LONG'?C.teal:C.red}`,
              borderRadius:6,padding:'3px 8px',fontSize:10,fontWeight:700,cursor:'pointer',flexShrink:0}}>
            {lockedSig.action==='LONG'?'📈':'📉'} Ver señal
          </button>
        )}

        {user.isAdmin&&(
          <button onClick={()=>navigate('/admin')} className="btn-ghost" style={{padding:'3px 9px',fontSize:11}}>Admin</button>
        )}
        <button onClick={onLogout} className="btn-ghost" style={{padding:'3px 9px',fontSize:11}}>Salir</button>
      </header>

      {/* ── BODY ── */}
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* Sidebar */}
        <aside style={{
          width:sidebarOpen?'clamp(140px,18vw,176px)':'0',
          minWidth:sidebarOpen?'clamp(140px,18vw,176px)':'0',
          overflow:'hidden',
          background:C.bg1,borderRight:`1px solid ${C.border}`,
          display:'flex',flexDirection:'column',flexShrink:0,
          transition:'width .2s, min-width .2s'
        }}>
          {/* Nav */}
          {NAV.map(n=>(
            <div key={n.key}
              onClick={()=>n.key==='modelos'?navigate('/modelos'):setSection(n.key)}
              style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',
                fontSize:12,cursor:'pointer',borderRadius:6,margin:'1px 5px',whiteSpace:'nowrap',
                color:section===n.key?C.teal:C.muted,
                background:section===n.key?C.tealBg:'transparent',
                border:`1px solid ${section===n.key?C.tealDark+'44':'transparent'}`}}>
              <span style={{fontSize:13}}>{n.icon}</span>{n.label}
            </div>
          ))}

          <div style={{padding:'8px 10px',fontSize:10,fontWeight:600,color:C.muted,letterSpacing:'.05em',marginTop:4,whiteSpace:'nowrap'}}>MERCADOS</div>

          {Object.entries(ASSETS).map(([sym,cfg])=>{
            const ad=dash?.assets?.find(a=>a.symbol===sym)
            const isActive=sym===symbol
            const trend=ad?.structureM5||'LOADING'
            const tc=trend==='BULLISH'?C.teal:trend==='BEARISH'?C.red:C.muted
            return(
              <div key={sym} onClick={()=>{setSymbol(sym);setSection('dashboard')}}
                style={{display:'flex',alignItems:'center',gap:7,padding:'7px 10px',
                  fontSize:11,cursor:'pointer',borderRadius:6,margin:'1px 5px',
                  background:isActive?C.bg3:'transparent',
                  border:`1px solid ${isActive?C.border:'transparent'}`}}>
                <div style={{width:26,height:26,borderRadius:5,background:isActive?'#1a3a2a':C.bg2,
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0}}>
                  {cfg.emoji}
                </div>
                <div style={{flex:1,minWidth:0,overflow:'hidden'}}>
                  <div style={{fontWeight:600,color:C.text,fontSize:11,whiteSpace:'nowrap'}}>{cfg.shortName}</div>
                  <div style={{fontSize:9,color:tc,fontWeight:700}}>{trend}</div>
                </div>
                {ad?.lockedSignal&&<span style={{width:7,height:7,borderRadius:'50%',background:C.teal,flexShrink:0}}/>}
              </div>
            )
          })}

          <div style={{padding:'8px 8px',marginTop:'auto'}}>
            <button onClick={()=>setShowElisa(s=>!s)} style={{
              width:'100%',padding:'7px',borderRadius:8,border:`1px solid ${C.teal}44`,
              background:C.tealBg,color:C.teal,cursor:'pointer',fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>
              💜 Hablar con Elisa
            </button>
          </div>
        </aside>

        {/* Main */}
        <main style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>

          {/* Stats row */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,
            padding:'6px 10px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            {[
              {l:'WIN RATE',v:wr+'%',sub:stats.total>0?`${stats.total} ops`:'Sin ops',c:C.teal},
              {l:'ACTIVAS', v:stats.pending||0,sub:'En curso',c:C.teal},
              {l:'WINS',    v:stats.wins||0,sub:'Ganadoras',c:C.green},
              {l:'LOSS',    v:stats.losses||0,sub:'Pérdidas',c:C.red}
            ].map(({l,v,sub,c})=>(
              <div key={l} className="card" style={{padding:'8px 12px'}}>
                <div style={{fontSize:9,color:C.muted,fontWeight:600,letterSpacing:'.05em',marginBottom:2}}>{l}</div>
                <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
                <div style={{fontSize:9,color:C.muted}}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Content */}
          <div style={{flex:1,display:'flex',flexDirection:'column',padding:'6px 10px',gap:5,overflow:'hidden'}}>

            {/* DASHBOARD */}
            {section==='dashboard'&&(
              <>
                {/* Chart header */}
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

                {/* Canvas con zoom/pan */}
                <ChartContainer zoom={zoom} setZoom={setZoom} offsetX={offsetX} setOffsetX={setOffsetX} canvasRef={canvasRef}>
                  <canvas ref={canvasRef}
                    style={{width:'100%',height:'100%',borderRadius:8,border:`1px solid ${C.border}`,display:'block'}}/>
                  {!analyze&&(
                    <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',
                      justifyContent:'center',color:C.muted}}>
                      <div style={{textAlign:'center'}}>
                        <div style={{fontSize:24,marginBottom:8}}>⟳</div>
                        <div style={{fontSize:13}}>Cargando datos...</div>
                      </div>
                    </div>
                  )}
                </ChartContainer>

                {/* Strips */}
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
              <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',gap:8}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                  <h2 style={{fontSize:14,fontWeight:700,color:C.text,margin:0}}>◎ Señales</h2>
                  <span style={{fontSize:11,color:C.muted}}>{signals.length} registradas</span>
                  <button onClick={fetchDash} className="btn-ghost" style={{marginLeft:'auto',padding:'3px 10px',fontSize:11}}>↻ Actualizar</button>
                </div>
                <SenalesPanel signals={signals}/>
              </div>
            )}

            {section==='stats'&&(
              <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',gap:8}}>
                <h2 style={{fontSize:14,fontWeight:700,color:C.text,margin:0,flexShrink:0}}>◇ Estadísticas</h2>
                <StatsPanel stats={stats} signals={signals}/>
              </div>
            )}

            {section==='historial'&&(
              <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',gap:8}}>
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
            <span style={{width:7,height:7,borderRadius:'50%',background:C.teal,
              display:'inline-block',animation:'pulse-teal 1.5s infinite'}}/>
            <span style={{fontSize:10,color:C.muted}}>Scanner · próx scan</span>
            <span style={{fontSize:10,fontWeight:700,color:C.teal}}>{countdown}s</span>
            <Pill type={lockedSig?lockedSig.action:analyze?.signal?.action||'LOADING'}
              text={lockedSig?`${lockedSig.action==='LONG'?'COMPRA':'VENTA'} #${lockedSig.id}`:
                analyze?.signal?.action==='LONG'?'COMPRA DETECTADA':
                analyze?.signal?.action==='SHORT'?'VENTA DETECTADA':'ESPERANDO'}/>
            <span style={{fontSize:9,color:C.border,marginLeft:'auto'}}>
              +/− zoom · ← → pan · 0 reset
            </span>
            <span style={{fontSize:10,color:C.muted}}>
              {new Date().toLocaleTimeString('es',{hour12:false})}
            </span>
            <button onClick={()=>{fetchDash();fetchAnalyze()}}
              className="btn-ghost" style={{padding:'2px 8px',fontSize:10}}>↻</button>
          </div>
        </main>
      </div>

      {/* Señal flotante DRAGGABLE */}
      {lockedSig&&section==='dashboard'&&(
        <SignalCard signal={lockedSig} assetConfig={ASSETS[symbol]}
          cardPos={cardPos} setCardPos={setCardPos}
          cardVisible={cardVisible} setCardVisible={setCardVisible}/>
      )}

      {showElisa&&<ElisaChat symbol={symbol} onClose={()=>setShowElisa(false)}/>}
      {!showElisa&&(
        <button onClick={()=>setShowElisa(true)} style={{
          position:'fixed',right:20,bottom:20,width:50,height:50,
          borderRadius:'50%',background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',
          border:`2px solid ${C.teal}`,color:C.teal,fontSize:20,cursor:'pointer',
          boxShadow:`0 0 20px ${C.teal}44`,zIndex:98}}>💜</button>
      )}
    </div>
  )
}
