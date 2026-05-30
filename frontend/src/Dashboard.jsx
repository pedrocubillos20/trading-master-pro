/**
 * Trading Master Pro — Dashboard v25.0
 * CAMBIO PRINCIPAL: Sistema de IA Institucional (SMC)
 * - Eliminadas: señales automáticas, conflictos, señal card
 * - Agregado: Botón "🧠 Activar IA" que analiza el gráfico en vivo
 * - La IA escribe análisis SMC completo + dibuja zonas automáticamente
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
  yellow:'#f9ca24', green:'#3fb950', bull:'#3fb950', bear:'#ff6b6b',
  purple:'#a78bfa', orange:'#fb923c', blue:'#60a5fa'
}

/* ─────────────────────────────────────────────────── CHART DRAW ENGINE */
function drawChart(canvas, state) {
  const {
    candles=[], demandZones=[], supplyZones=[],
    fvgZones=[], liquidityLevels=[],
    aiZones=null,
    choch, bos, chochM15, bosM15,
    structure={}, zoom=1, offsetX=0,
    premiumDiscount='EQUILIBRIUM',
    isM1=false  // M1 mode: thinner zones, precision drawing
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

  const ML=64, MR=80, MT=24, MB=32
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

  const allP = vis.flatMap(c=>[c.high,c.low])
  const mn=Math.min(...allP), mx=Math.max(...allP), rng=mx-mn||1
  const PN=mn-rng*.09, PX=mx+rng*.13, PR=PX-PN
  const py=p=>MT+CH*(1-(p-PN)/PR)
  const n=vis.length, SL=CW/n, BW=Math.max(Math.floor(SL*.65),2)
  const cx=i=>ML+SL*i+SL/2
  const gs=rng<3?.5:rng<10?1:rng<30?5:10

  /* Grid */
  ctx.strokeStyle='rgba(255,255,255,.04)'; ctx.lineWidth=1
  for(let p=Math.ceil(PN/gs)*gs;p<=PX;p+=gs){
    ctx.beginPath();ctx.moveTo(ML,py(p));ctx.lineTo(ML+CW,py(p));ctx.stroke()
  }

  /* Premium/Discount shading */
  if(premiumDiscount!=='EQUILIBRIUM'){
    const midP=(PN+PX)/2
    if(premiumDiscount==='PREMIUM'){
      ctx.fillStyle='rgba(255,107,107,.04)'
      ctx.fillRect(ML,MT,CW,CH/2)
      ctx.fillStyle='rgba(255,107,107,.5)';ctx.font='8px system-ui';ctx.textAlign='right'
      ctx.fillText('PREMIUM',ML+CW-4,MT+10)
    } else {
      ctx.fillStyle='rgba(63,185,80,.04)'
      ctx.fillRect(ML,MT+CH/2,CW,CH/2)
      ctx.fillStyle='rgba(63,185,80,.5)';ctx.font='8px system-ui';ctx.textAlign='right'
      ctx.fillText('DISCOUNT',ML+CW-4,MT+CH-4)
    }
    // 50% line
    ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1;ctx.setLineDash([4,4])
    ctx.beginPath();ctx.moveTo(ML,py(midP));ctx.lineTo(ML+CW,py(midP));ctx.stroke()
    ctx.setLineDash([])
  }

  /* OB Zones */
  ;[
    {zones:demandZones, fillA:'rgba(63,185,80,.18)', fillS:'rgba(63,185,80,.06)',
     stroke:C.green, strokeS:'rgba(63,185,80,.25)', label:'OB Demanda'},
    {zones:supplyZones, fillA:'rgba(255,107,107,.18)', fillS:'rgba(255,107,107,.06)',
     stroke:C.red,   strokeS:'rgba(255,107,107,.25)', label:'OB Oferta'}
  ].forEach(({zones,fillA,fillS,stroke,strokeS,label})=>{
    zones.forEach(z=>{
      const zi=z.index-visOff
      if(zi<-5||zi>n+2)return
      const x1=zi>=0?Math.max(ML,cx(zi)-SL/2):ML
      const x2=z.mitigated
        ? Math.min(ML+CW, x1+Math.max(60,(zi+15)*SL))
        : ML+CW
      if(x1>=x2)return
      const y1=py(z.high),y2=py(z.low)
      const isMit=z.mitigated, isStruc=z.isStructureOB
      ctx.fillStyle=isMit?fillS:(isM1?fillA.replace('.18','.28'):fillA)
      ctx.fillRect(x1,y1,x2-x1,y2-y1)
      ctx.strokeStyle=isMit?strokeS:stroke
      ctx.lineWidth=isM1?(isStruc?3:2):(isStruc?2:1.5)
      if(isStruc&&!isMit){
        ctx.setLineDash([])
        ctx.strokeRect(x1,y1,x2-x1,y2-y1)
        ctx.strokeStyle=stroke;ctx.lineWidth=3
        ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x1,y2);ctx.stroke()
      } else {
        ctx.setLineDash(isMit?[3,3]:[])
        ctx.strokeRect(x1,y1,x2-x1,y2-y1)
        ctx.setLineDash([])
      }
      if(!isMit){
        // Only draw zone label if zone is tall enough to show text
        const zoneH = Math.abs(y2-y1)
        if(zoneH >= 10){
          ctx.fillStyle=stroke;ctx.font=`${isStruc?'bold ':''  }9px system-ui`;ctx.textAlign='left'
          ctx.fillText(isStruc?label+' ★':label,x1+4,y1+11)
        }
        if(x2>=ML+CW-60){
          ctx.fillStyle=stroke+'cc';ctx.font='8px system-ui'
          ctx.fillText(z.high.toFixed(2),ML+CW+2,y1+4)
          ctx.fillText(z.low.toFixed(2), ML+CW+2,y2+4)
        }
      }
    })
  })

  /* FVG Zones — light blue imbalance zones */
  fvgZones.forEach(z=>{
    const zi=z.index-visOff
    if(zi<-5||zi>n+5)return
    const x1=zi>=0?Math.max(ML,cx(zi)-SL/2):ML
    const x2=ML+CW
    if(x1>=x2)return
    const y1=py(z.high),y2=py(z.low)
    const col=z.side==='BUY'?'rgba(96,165,250,.15)':'rgba(251,146,60,.15)'
    const colS=z.side==='BUY'?C.blue:C.orange
    ctx.fillStyle=col;ctx.fillRect(x1,y1,x2-x1,y2-y1)
    ctx.strokeStyle=colS+'44';ctx.lineWidth=0.8;ctx.setLineDash([3,4])
    ctx.strokeRect(x1,y1,x2-x1,y2-y1)
    ctx.setLineDash([])
    // FVG label only if zone visible (height > 6px)
    if(Math.abs(y2-y1)>=6){
      ctx.fillStyle=colS+'aa';ctx.font='7px system-ui';ctx.textAlign='left'
      ctx.fillText('FVG',x1+3,y1+9)
    }
    ctx.fillText(z.high.toFixed(2),ML+CW+2,y1+4)
    ctx.fillText(z.low.toFixed(2),ML+CW+2,y2+4)
  })

  /* Liquidity Levels — dashed lines */
  liquidityLevels.forEach(lv=>{
    const y=py(lv.price)
    if(y<MT||y>MT+CH)return
    const isHigh=lv.type==='EQUAL_HIGHS'
    const col=isHigh?'rgba(255,107,107,.7)':'rgba(63,185,80,.7)'
    ctx.strokeStyle=col;ctx.lineWidth=1;ctx.setLineDash([2,4])
    ctx.beginPath();ctx.moveTo(ML,y);ctx.lineTo(ML+CW,y);ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle=col;ctx.font='8px system-ui';ctx.textAlign='right'
    ctx.fillText(`${isHigh?'BSL':'SSL'} ${lv.price.toFixed(2)} (${lv.touches}x)`,ML+CW-4,y-2)
  })

  /* AI extra zones (from Claude analysis) */
  if(aiZones){
    // AI Key levels as horizontal lines
    ;(aiZones.keyLevels||[]).forEach(lv=>{
      const y=py(lv.price)
      if(y<MT-10||y>MT+CH+10)return
      const isRes=lv.type==='resistance'
      const col=isRes?'rgba(255,107,107,.75)':'rgba(167,139,250,.75)'
      ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.setLineDash([8,3])
      ctx.beginPath();ctx.moveTo(ML,y);ctx.lineTo(ML+CW,y);ctx.stroke()
      ctx.setLineDash([])
      const lbl=lv.label||lv.type
      const lw=lbl.length*5.5+lv.price.toFixed(2).length*5+14
      ctx.fillStyle=col.replace('.75','.12');ctx.strokeStyle=col;ctx.lineWidth=1
      ctx.beginPath();ctx.roundRect(ML+4,y-9,lw,16,3);ctx.fill();ctx.stroke()
      ctx.fillStyle=col;ctx.font='bold 8px system-ui';ctx.textAlign='left'
      ctx.fillText(`${lbl} ${lv.price.toFixed(2)}`,ML+8,y+4)
    })

    // ── IA Trade Setup: Entrada + SL + TP1 + TP2 ──
    const tr=aiZones.trade
    if(tr && tr.entry && tr.sl && tr.tp1){
      const isBuy=tr.side==='BUY'
      const entryY=py(tr.entry), slY=py(tr.sl), tp1Y=py(tr.tp1)
      const tp2Y=tr.tp2?py(tr.tp2):null
      const entryCol='#f9ca24'       // amarillo — entrada
      const slCol   ='#ff4757'       // rojo — stop loss
      const tpCol   ='#2ed573'       // verde — take profit
      const xL=ML, xR=ML+CW

      // SL zone (shaded area between entry and SL)
      ctx.fillStyle=slCol+'18'
      ctx.fillRect(xL, Math.min(entryY,slY), CW, Math.abs(entryY-slY))

      // TP zones
      if(tp2Y!==null){
        ctx.fillStyle=tpCol+'10'
        ctx.fillRect(xL, Math.min(entryY,tp2Y), CW, Math.abs(entryY-tp2Y))
      } else {
        ctx.fillStyle=tpCol+'10'
        ctx.fillRect(xL, Math.min(entryY,tp1Y), CW, Math.abs(entryY-tp1Y))
      }

      // TP2 line
      if(tp2Y!==null){
        ctx.strokeStyle=tpCol;ctx.lineWidth=1.5;ctx.setLineDash([6,3])
        ctx.beginPath();ctx.moveTo(xL,tp2Y);ctx.lineTo(xR,tp2Y);ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle=tpCol+'22';ctx.strokeStyle=tpCol;ctx.lineWidth=1
        ctx.beginPath();ctx.roundRect(xR+2,tp2Y-8,52,16,3);ctx.fill();ctx.stroke()
        ctx.fillStyle=tpCol;ctx.font='bold 8px system-ui';ctx.textAlign='left'
        ctx.fillText(`TP2 ${tr.tp2.toFixed(2)}`,xR+5,tp2Y+4)
      }

      // TP1 line
      ctx.strokeStyle=tpCol;ctx.lineWidth=2;ctx.setLineDash([6,3])
      ctx.beginPath();ctx.moveTo(xL,tp1Y);ctx.lineTo(xR,tp1Y);ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle=tpCol+'22';ctx.strokeStyle=tpCol;ctx.lineWidth=1
      ctx.beginPath();ctx.roundRect(xR+2,tp1Y-8,52,16,3);ctx.fill();ctx.stroke()
      ctx.fillStyle=tpCol;ctx.font='bold 8px system-ui';ctx.textAlign='left'
      ctx.fillText(`TP1 ${tr.tp1.toFixed(2)}`,xR+5,tp1Y+4)

      // SL line
      ctx.strokeStyle=slCol;ctx.lineWidth=2;ctx.setLineDash([4,3])
      ctx.beginPath();ctx.moveTo(xL,slY);ctx.lineTo(xR,slY);ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle=slCol+'22';ctx.strokeStyle=slCol;ctx.lineWidth=1
      ctx.beginPath();ctx.roundRect(xR+2,slY-8,52,16,3);ctx.fill();ctx.stroke()
      ctx.fillStyle=slCol;ctx.font='bold 8px system-ui';ctx.textAlign='left'
      ctx.fillText(`SL  ${tr.sl.toFixed(2)}`,xR+5,slY+4)

      // ENTRY line — solid, most prominent
      ctx.strokeStyle=entryCol;ctx.lineWidth=2.5;ctx.setLineDash([])
      ctx.beginPath();ctx.moveTo(xL,entryY);ctx.lineTo(xR,entryY);ctx.stroke()
      // Entry pill
      const rrRaw=tr.tp1&&tr.sl?Math.abs(tr.tp1-tr.entry)/Math.abs(tr.entry-tr.sl):0
      const rrStr=rrRaw>0?` R:R ${rrRaw.toFixed(1)}`:''
      const eLabel=`${isBuy?'▲ BUY':'▼ SELL'} ${tr.entry.toFixed(2)}${rrStr}`
      const eW=eLabel.length*6+12
      ctx.fillStyle=entryCol;ctx.beginPath();ctx.roundRect(xR+2,entryY-9,eW,18,4);ctx.fill()
      ctx.fillStyle='#000';ctx.font='bold 9px system-ui';ctx.textAlign='left'
      ctx.fillText(eLabel,xR+6,entryY+4)

      // Triangle arrow at entry point
      ctx.fillStyle=entryCol;ctx.globalAlpha=0.9
      const arrX=xL+6, arrY=entryY, arrS=8
      ctx.beginPath()
      if(isBuy){ ctx.moveTo(arrX,arrY+arrS);ctx.lineTo(arrX-arrS,arrY-arrS);ctx.lineTo(arrX+arrS,arrY-arrS) }
      else      { ctx.moveTo(arrX,arrY-arrS);ctx.lineTo(arrX-arrS,arrY+arrS);ctx.lineTo(arrX+arrS,arrY+arrS) }
      ctx.closePath();ctx.fill();ctx.globalAlpha=1

      // Label for what the trade is
      if(tr.label){
        ctx.fillStyle='rgba(249,202,36,.8)';ctx.font='bold 8px system-ui';ctx.textAlign='left'
        ctx.fillText(`📍 ${tr.label}`,xL+20,entryY+(isBuy?-12:16))
      }
    }
  }

  /* Structure lines */
  const drawLvl=(lvl,color,tag)=>{
    if(!lvl||lvl.level==null)return
    const bi=(lvl.breakIndex||0)-visOff
    if(bi<0||bi>=n)return
    const sx=cx(bi)
    const ex=Math.min(ML+CW, cx(Math.min(n-1, bi+30)))
    if(sx>ML+CW)return
    const y=py(lvl.level)
    ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.setLineDash([6,4])
    ctx.beginPath();ctx.moveTo(sx,y);ctx.lineTo(ex,y);ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(sx,y,3,0,Math.PI*2);ctx.fill()
    const lw=tag.length*5.5+lvl.level.toFixed(2).length*5+14
    const lx=Math.min(ex+2, ML+CW-lw-2)
    ctx.fillStyle=color+'22';ctx.strokeStyle=color;ctx.lineWidth=1
    ctx.beginPath();ctx.roundRect(lx,y-8,lw,16,3);ctx.fill();ctx.stroke()
    ctx.fillStyle=color;ctx.font='bold 8px system-ui';ctx.textAlign='left'
    ctx.fillText(`${tag} ${lvl.level.toFixed(2)}`,lx+4,y+4)
  }
  drawLvl(bos,  C.text,                   bos?.side==='BUY'?'BOS↑ M5':'BOS↓ M5')
  drawLvl(choch, C.yellow,                choch?.type==='BULLISH_CHOCH'?'CHoCH↑ M5':'CHoCH↓ M5')
  drawLvl(bosM15,   'rgba(140,140,255,.9)', bosM15?.side==='BUY'?'BOS↑ M15':'BOS↓ M15')
  drawLvl(chochM15, 'rgba(255,200,60,.8)',  chochM15?.type==='BULLISH_CHOCH'?'CHoCH↑ M15':'CHoCH↓ M15')

  // ── Scenario activation levels ──
  if(aiZones?.scenarios){
    const {s1,s2} = aiZones.scenarios
    // Draw S1 activation line
    if(s1?.activation){
      const y=py(s1.activation)
      if(y>=MT&&y<=MT+CH){
        const col=s1.direction==='UP'?'rgba(63,185,80,.85)':'rgba(255,107,107,.85)'
        ctx.strokeStyle=col;ctx.lineWidth=2;ctx.setLineDash([10,4])
        ctx.beginPath();ctx.moveTo(ML,y);ctx.lineTo(ML+CW,y);ctx.stroke()
        ctx.setLineDash([])
        // S1 pill with arrow
        const arrow=s1.direction==='UP'?'▲':'▼'
        const lbl=`${arrow} S1 ${s1.activation?.toFixed?.(2)||s1.activation} (${s1.probability||'?'}%)`
        const lw=lbl.length*6+16
        ctx.fillStyle=col.replace('.85','.2');ctx.strokeStyle=col;ctx.lineWidth=1.5
        ctx.beginPath();ctx.roundRect(ML+4,y-11,lw,18,4);ctx.fill();ctx.stroke()
        ctx.fillStyle=col;ctx.font='bold 9px system-ui';ctx.textAlign='left'
        ctx.fillText(lbl,ML+8,y+5)
      }
    }
    // Draw S2 activation line
    if(s2?.activation){
      const y=py(s2.activation)
      if(y>=MT&&y<=MT+CH){
        const col=s2.direction==='UP'?'rgba(63,185,80,.5)':'rgba(255,107,107,.5)'
        ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.setLineDash([6,6])
        ctx.beginPath();ctx.moveTo(ML,y);ctx.lineTo(ML+CW,y);ctx.stroke()
        ctx.setLineDash([])
        const arrow=s2.direction==='UP'?'▲':'▼'
        const lbl=`${arrow} S2 ${s2.activation?.toFixed?.(2)||s2.activation} (${s2.probability||'?'}%)`
        const lw=lbl.length*6+16
        ctx.fillStyle=col.replace('.5','.12');ctx.strokeStyle=col;ctx.lineWidth=1
        ctx.beginPath();ctx.roundRect(ML+4,y-10,lw,16,3);ctx.fill();ctx.stroke()
        ctx.fillStyle=col;ctx.font='9px system-ui';ctx.textAlign='left'
        ctx.fillText(lbl,ML+8,y+4)
      }
    }
  }

  // M1 mode: draw confirmation zone indicator
  if(isM1&&aiZones?.trade){
    const tr=aiZones.trade
    const entryY=py(tr.entry)
    // Glow effect on entry level in M1
    const grad=ctx.createLinearGradient(ML,0,ML+CW,0)
    grad.addColorStop(0,'rgba(249,202,36,0)')
    grad.addColorStop(0.1,'rgba(249,202,36,.15)')
    grad.addColorStop(0.9,'rgba(249,202,36,.15)')
    grad.addColorStop(1,'rgba(249,202,36,0)')
    ctx.fillStyle=grad
    ctx.fillRect(ML,entryY-12,CW,24)
    // "CONFIRMAR EN M1" text
    ctx.fillStyle='rgba(249,202,36,.9)';ctx.font='bold 9px system-ui';ctx.textAlign='center'
    ctx.fillText('◉ ZONA CONFIRMACIÓN M1',ML+CW/2,entryY-14)
  }

  /* Structure fractals */
  ;(structure.labels||[]).forEach(lb=>{
    const li=lb.index-visOff
    if(li<0||li>=n||!vis[li])return
    const isBull=lb.type==='HH'||lb.type==='HL'
    const x=cx(li), size=5
    if(!isBull){
      const y=py(vis[li].high)-3
      const clr=lb.type==='HH'?'#ff4757':'#ff6b81'
      ctx.fillStyle=clr;ctx.globalAlpha=0.85
      ctx.beginPath();ctx.moveTo(x,y+size*1.5);ctx.lineTo(x-size,y);ctx.lineTo(x+size,y)
      ctx.closePath();ctx.fill();ctx.globalAlpha=1
    } else {
      const y=py(vis[li].low)+3
      const clr=lb.type==='HL'?'#2ed573':'#7bed9f'
      ctx.fillStyle=clr;ctx.globalAlpha=0.85
      ctx.beginPath();ctx.moveTo(x,y-size*1.5);ctx.lineTo(x-size,y);ctx.lineTo(x+size,y)
      ctx.closePath();ctx.fill();ctx.globalAlpha=1
    }
  })

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
    ctx.fillStyle=C.teal;ctx.beginPath();ctx.roundRect(ML+CW-1,py2-8,60,16,3);ctx.fill()
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

/* ─────────────────────────────────────── CHART CONTAINER — zoom + pan */
function ChartContainer({children,zoom,setZoom,offsetX,setOffsetX}){
  const ref=useRef(null)
  const drag=useRef({active:false,startX:0,startOff:0})

  const onWheel=useCallback(e=>{
    e.preventDefault()
    if(e.ctrlKey){setZoom(z=>+(Math.max(.3,Math.min(8,z-e.deltaY*.01))).toFixed(2))}
    else{setOffsetX(o=>Math.max(0,o+e.deltaY*.3))}
  },[setZoom,setOffsetX])

  useEffect(()=>{
    const el=ref.current;if(!el)return
    el.addEventListener('wheel',onWheel,{passive:false})
    return()=>el.removeEventListener('wheel',onWheel)
  },[onWheel])

  const onMouseDown=useCallback(e=>{
    if(e.button!==0)return
    drag.current={active:true,startX:e.clientX,startOff:offsetX}
  },[offsetX])
  const onMouseMove=useCallback(e=>{
    if(!drag.current.active)return
    const dx=e.clientX-drag.current.startX
    setOffsetX(Math.max(0,drag.current.startOff-dx*.3))
  },[setOffsetX])
  const onMouseUp=useCallback(()=>{drag.current.active=false},[])

  useEffect(()=>{
    window.addEventListener('mousemove',onMouseMove)
    window.addEventListener('mouseup',onMouseUp)
    return()=>{window.removeEventListener('mousemove',onMouseMove);window.removeEventListener('mouseup',onMouseUp)}
  },[onMouseMove,onMouseUp])

  const btns=[
    {lbl:'+',fn:()=>setZoom(z=>+(Math.min(8,z+.3)).toFixed(1)),title:'Zoom in'},
    {lbl:'−',fn:()=>setZoom(z=>+(Math.max(.3,z-.3)).toFixed(1)),title:'Zoom out'},
    {lbl:'◉',fn:()=>{setZoom(1);setOffsetX(0)},title:'Reset'},
  ]

  return(
    <div ref={ref} onMouseDown={onMouseDown}
      style={{flex:1,position:'relative',borderRadius:8,overflow:'hidden',cursor:'grab',minHeight:0}}>
      {children}
      <div style={{position:'absolute',top:6,right:6,display:'flex',gap:3,zIndex:2}}>
        {btns.map(({lbl,fn,title})=>(
          <button key={lbl} onClick={fn} title={title}
            style={{background:'rgba(22,27,34,.85)',border:`1px solid ${C.border}`,
              color:C.muted,width:22,height:22,borderRadius:4,cursor:'pointer',fontSize:12,
              display:'flex',alignItems:'center',justifyContent:'center'}}>
            {lbl}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─────────────── Helper components */
function StatCard({label,value,sub,color}){
  return(
    <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 10px'}}>
      <div style={{fontSize:9,color:C.muted,fontWeight:600,letterSpacing:'.06em'}}>{label}</div>
      <div style={{fontSize:18,fontWeight:800,color:color||C.text}}>{value}</div>
      <div style={{fontSize:9,color:C.muted}}>{sub}</div>
    </div>
  )
}
function StructTag({label,trend}){
  const col=trend==='BULLISH'?C.teal:trend==='BEARISH'?C.red:C.muted
  return(
    <span style={{fontSize:10,fontWeight:700,color:col,background:col+'18',
      padding:'2px 6px',borderRadius:4,border:`1px solid ${col}44`}}>
      {label} {trend==='BULLISH'?'↑':trend==='BEARISH'?'↓':'·'}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════
   AI ANALYSIS PANEL — El corazón del nuevo sistema
   ═══════════════════════════════════════════════════════════════ */
function AIAnalysisPanel({ symbol, onZonesDetected, onActivate, onReset }) {
  const [status, setStatus] = useState('idle') // idle | loading | streaming | done | error
  const [text, setText]     = useState('')
  const [dots, setDots]     = useState(0)
  const scrollRef           = useRef(null)
  const readerRef           = useRef(null)

  // Animate dots during loading
  useEffect(()=>{
    if(status!=='loading')return
    const id=setInterval(()=>setDots(d=>(d+1)%4),350)
    return()=>clearInterval(id)
  },[status])

  // Auto-scroll during streaming
  useEffect(()=>{
    if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight
  },[text])

  // Format markdown-like text
  const renderText = (raw) => {
    if(!raw)return null
    return raw.split('\n').map((line,i)=>{
      if(line.startsWith('## ')){
        const icons = {
          '📅':'#f9ca24','📊':'#60a5fa','🎯':C.teal,
          '📈':'#2ed573','📉':'#ff6b6b','⏰':'#a78bfa',
          '💡':C.yellow,'❌':C.red,'🔍':C.purple
        }
        const col = Object.keys(icons).find(k=>line.includes(k))
        return <div key={i} style={{color:col?icons[col]:C.teal,fontWeight:700,fontSize:12,
          marginTop:14,marginBottom:5,borderBottom:`1px solid ${col?icons[col]+'33':C.tealDark+'33'}`,
          paddingBottom:4,letterSpacing:'.02em'}}>{line.slice(3)}</div>
      }
      if(line.startsWith('ZONAS_IA:'))return null
      if(line.match(/^[•\-] /)||line.match(/^  [•\-] /)){
        const indent = line.startsWith('  ') ? 20 : 10
        return <div key={i} style={{color:C.text,fontSize:11,lineHeight:1.65,
          paddingLeft:indent,position:'relative',marginTop:1}}>
          <span style={{color:C.teal,position:'absolute',left:indent-8}}>›</span>
          {(txt=>(txt.split(/(\*\*[^*]+\*\*)/).map((p,j)=>
            p.startsWith('**')&&p.endsWith('**')
              ?<strong key={j} style={{color:C.teal,fontWeight:700}}>{p.slice(2,-2)}</strong>
              :p
          )))(line.replace(/^  ?[•\-] /,''))}
        </div>
      }
      if(line.match(/^###? /)||line.match(/^Escenario [12]/i)){
        const clean=line.replace(/^###? /,'')
        return <div key={i} style={{color:C.yellow,fontWeight:700,fontSize:11.5,marginTop:8,
          background:'rgba(249,202,36,.06)',padding:'3px 8px',borderRadius:4,
          borderLeft:`3px solid ${C.yellow}`}}>{clean}</div>
      }
      if(line.startsWith('❌')){
        return <div key={i} style={{color:C.red,fontSize:11,lineHeight:1.65,fontWeight:600,marginTop:2}}>{line}</div>
      }
      if(line.startsWith('✅')){
        return <div key={i} style={{color:C.green,fontSize:11,lineHeight:1.65,fontWeight:600,marginTop:2}}>{line}</div>
      }
      if(line.startsWith('⚠️')){
        return <div key={i} style={{color:C.yellow,fontSize:11,lineHeight:1.65,fontWeight:600,marginTop:2}}>{line}</div>
      }
      if(!line.trim())return <div key={i} style={{height:5}}/>
      // Render inline **bold** markdown
      const renderInline = (text) => {
        const parts = text.split(/(\*\*[^*]+\*\*)/)
        if(parts.length === 1) return text
        return parts.map((p,j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j} style={{color:C.teal,fontWeight:700}}>{p.slice(2,-2)}</strong>
            : p
        )
      }
      // Hide JSON code blocks
      if(line.startsWith('```')||line.startsWith('ZONAS_IA:')||line.startsWith('...'))return null
      return <div key={i} style={{color:C.text,fontSize:11,lineHeight:1.65}}>{renderInline(line)}</div>
    }).filter(Boolean)
  }

  const activateAI = useCallback(async()=>{
    if(status==='loading'||status==='streaming')return
    setStatus('loading')
    setText('')
    onZonesDetected(null)

    try {
      const response = await fetch(`${API_URL}/api/ai/analyze-chart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      })

      if(!response.ok){
        const err = await response.json().catch(()=>({}))
        throw new Error(err.error || `Error ${response.status}`)
      }

      setStatus('streaming')
      onActivate()  // chart now shows zones as IA analyzes
      const reader = response.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let fullText = ''
      let buf = ''

      while(true){
        const {done, value} = await reader.read()
        if(done) break
        buf += decoder.decode(value, {stream: true})
        const lines = buf.split('\n')
        buf = lines.pop() // keep incomplete line
        for(const line of lines){
          if(!line.startsWith('data: '))continue
          try{
            const ev = JSON.parse(line.slice(6))
            if(ev.type==='text'){
              fullText += ev.text
              setText(fullText)
            }
            if(ev.type==='done'){
              // Extract AI zones
              // Extract ZONAS_IA — handle nested JSON with balanced braces
              const zonaStart = fullText.indexOf('ZONAS_IA:')
              if(zonaStart !== -1){
                let depth=0, start=zonaStart+9, end=-1
                for(let i=start;i<fullText.length;i++){
                  if(fullText[i]==='{') depth++
                  else if(fullText[i]==='}'){depth--;if(depth===0){end=i+1;break}}
                }
                if(end>start){
                  try{
                    const parsed=JSON.parse(fullText.slice(start,end))
                    // ── Hard validation of trade direction ──
                    if(parsed.trade){
                      const t=parsed.trade
                      const isBuy=t.side==='BUY'
                      const entryNum=parseFloat(t.entry)
                      const slNum=parseFloat(t.sl)
                      const tp1Num=parseFloat(t.tp1)
                      const tp2Num=parseFloat(t.tp2)
                      // Fix SL direction if wrong
                      if(isBuy && slNum>=entryNum){
                        console.warn('IA: SL above entry on BUY — auto-fixing')
                        parsed.trade.sl=+(entryNum-(Math.abs(tp1Num-entryNum)*0.6)).toFixed(2)
                      }
                      if(!isBuy && slNum<=entryNum){
                        console.warn('IA: SL below entry on SELL — auto-fixing')
                        parsed.trade.sl=+(entryNum+(Math.abs(tp1Num-entryNum)*0.6)).toFixed(2)
                      }
                      // Fix SL if too tight (less than 0.3% of price)
                      const slDist=Math.abs(parseFloat(parsed.trade.sl)-entryNum)
                      const minSL=entryNum*0.003 // 0.3% minimum
                      if(slDist < minSL){
                        console.warn(`IA: SL too tight (${slDist.toFixed(2)}) — expanding to 0.3%`)
                        parsed.trade.sl=isBuy
                          ? +(entryNum - minSL).toFixed(2)
                          : +(entryNum + minSL).toFixed(2)
                      }
                      // Fix TP direction if wrong
                      if(isBuy && tp1Num<=entryNum){
                        console.warn('IA: TP1 below entry on BUY — swapping with SL')
                        parsed.trade.tp1=+(entryNum+(Math.abs(entryNum-slNum)*1.5)).toFixed(2)
                      }
                      if(!isBuy && tp1Num>=entryNum){
                        console.warn('IA: TP1 above entry on SELL — fixing')
                        parsed.trade.tp1=+(entryNum-(Math.abs(entryNum-slNum)*1.5)).toFixed(2)
                      }
                    }
                    onZonesDetected(parsed)
                  }catch(e){console.warn('ZONAS_IA parse error',e)}
                }
              }
              setStatus('done')
              return
            }
            if(ev.type==='error') throw new Error(ev.message)
          }catch(parseErr){}
        }
      }
      setStatus('done')

    } catch(err){
      setStatus('error')
      setText(`⚠️ ${err.message}`)
    }
  },[symbol, status, onZonesDetected])

  const stop = useCallback(()=>{
    try{ readerRef.current?.cancel() }catch{}
    setStatus('idle')
  },[])

  const reset = useCallback(()=>{
    try{ readerRef.current?.cancel() }catch{}
    setStatus('idle')
    setText('')
    onZonesDetected(null)
    onReset?.()
  },[onZonesDetected, onReset])

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',gap:0}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',
        background:C.bg1,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,
          background: status==='idle'?C.muted:status==='done'?C.green:status==='error'?C.red:C.teal,
          boxShadow:(status==='loading'||status==='streaming')?`0 0 8px ${C.teal}`:'none',
          transition:'all .3s'}}/>
        <span style={{fontWeight:700,fontSize:12,color:C.text}}>🧠 IA Institucional SMC</span>
        {status!=='idle'&&<span style={{fontSize:10,color:C.muted}}>
          {status==='loading'?`Analizando${'.'.repeat(dots+1)}`
           :status==='streaming'?'Escribiendo en vivo...'
           :status==='done'?`✓ Listo`
           :'Error'}
        </span>}
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          {(status==='loading'||status==='streaming')&&(
            <button onClick={stop} style={{background:'rgba(255,107,107,.12)',border:`1px solid ${C.red}44`,
              color:C.red,borderRadius:5,padding:'2px 9px',fontSize:10,fontWeight:700,cursor:'pointer'}}>
              ■ Detener
            </button>
          )}
          {(status==='done'||status==='error')&&(
            <button onClick={reset} style={{background:C.bg3,border:`1px solid ${C.border}`,
              color:C.muted,borderRadius:5,padding:'2px 9px',fontSize:10,cursor:'pointer'}}>
              ↺
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {status==='idle'?(
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',
          justifyContent:'center',gap:20,padding:'24px 20px'}}>
          {/* Decorative icon */}
          <div style={{position:'relative'}}>
            <div style={{width:64,height:64,borderRadius:'50%',
              background:'linear-gradient(135deg,rgba(0,212,170,.15),rgba(167,139,250,.15))',
              border:`2px solid ${C.teal}33`,
              display:'flex',alignItems:'center',justifyContent:'center',fontSize:28}}>🧠</div>
            <div style={{position:'absolute',inset:-4,borderRadius:'50%',
              border:`1px solid ${C.teal}22`,animation:'pulse 2s ease-in-out infinite'}}/>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{fontWeight:800,fontSize:14,color:C.text,marginBottom:8}}>
              Análisis Institucional SMC
            </div>
            <div style={{fontSize:11,color:C.muted,lineHeight:1.7,maxWidth:260}}>
              La IA lee los datos reales del mercado y analiza como un trader institucional:
              flujo de dinero, zonas de liquidez, order blocks, FVG, escenarios y entradas.
            </div>
          </div>
          <button onClick={activateAI}
            style={{background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',
              border:`2px solid ${C.teal}`,color:C.teal,
              borderRadius:10,padding:'13px 32px',fontSize:14,fontWeight:800,
              cursor:'pointer',letterSpacing:'.04em',
              boxShadow:`0 0 24px ${C.teal}22,inset 0 1px 0 rgba(255,255,255,.08)`}}>
            ⚡ Activar IA
          </button>
          <div style={{display:'flex',flexDirection:'column',gap:4,width:'100%'}}>
            {['📊 Contexto del flujo institucional',
              '🎯 Zonas exactas que marcar',
              '📈 Escenarios de precio',
              '💡 Entrada inteligente SMC',
              '❌ Errores del retail'].map(t=>(
              <div key={t} style={{display:'flex',alignItems:'center',gap:8,
                padding:'4px 8px',background:C.bg2,borderRadius:5,
                border:`1px solid ${C.border}`}}>
                <span style={{fontSize:11,color:C.muted}}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      ):(
        <div ref={scrollRef} style={{flex:1,overflowY:'auto',padding:'12px 14px',
          scrollbarWidth:'thin',scrollbarColor:`${C.border} transparent`}}>
          {/* Loading skeleton */}
          {status==='loading'&&!text&&(
            <div style={{display:'flex',flexDirection:'column',gap:10,padding:8}}>
              {['Leyendo estructura del mercado','Detectando order blocks y FVGs','Analizando liquidez y flujo','Construyendo escenarios','Calculando entradas inteligentes'].map((t,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:10,
                  opacity: i < dots+1 ? 1 : 0.3, transition:'opacity .3s'}}>
                  <div style={{width:6,height:6,borderRadius:'50%',flexShrink:0,
                    background: i < dots+1 ? C.teal : C.border,
                    boxShadow: i < dots+1 ? `0 0 6px ${C.teal}` : 'none',
                    transition:'all .3s'}}/>
                  <span style={{fontSize:11,color: i < dots+1 ? C.text : C.muted}}>{t}</span>
                </div>
              ))}
            </div>
          )}
          {/* Streamed text */}
          {text && renderText(text)}
          {/* Cursor */}
          {status==='streaming'&&(
            <span style={{display:'inline-block',width:2,height:14,background:C.teal,
              animation:'pulse 0.7s ease-in-out infinite',marginLeft:2,verticalAlign:'middle',borderRadius:1}}/>
          )}
        </div>
      )}

      {/* Re-analyze button */}
      {status==='done'&&(
        <div style={{flexShrink:0}}>
          {/* Next action guide */}
          {window._aiTrade&&!window._entryHit&&(
            <div style={{margin:'0 10px 8px',background:'rgba(249,202,36,.08)',
              border:'1px solid rgba(249,202,36,.25)',borderRadius:6,padding:'8px 10px'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#f9ca24',marginBottom:4}}>
                ⏳ QUÉ HACER AHORA
              </div>
              <div style={{fontSize:10,color:'#e6edf3',lineHeight:1.6}}>
                Espera que el precio llegue a <strong style={{color:'#f9ca24'}}>{window._aiTrade?.entry}</strong>.
                Cuando toque esa zona, ve a M1 y confirma un BOS o CHoCH alcista antes de entrar.
              </div>
            </div>
          )}
          <div style={{padding:'6px 12px 10px'}}>
            <button onClick={activateAI}
              style={{width:'100%',background:'rgba(0,212,170,.06)',
                border:`1px solid ${C.tealDark}44`,
                color:C.teal,borderRadius:6,padding:'7px',fontSize:11,fontWeight:700,cursor:'pointer'}}>
              🔄 Re-analizar mercado
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────── CONSTANTS */
const ASSETS={
  stpRNG:{name:'Step Index',shortName:'Step',emoji:'📊'},
  frxXAUUSD:{name:'Oro (XAU/USD)',shortName:'Oro',emoji:'🥇'},
  '1HZ100V':{name:'Volatility 100',shortName:'V100',emoji:'🔥'}
}
const TFS=['M1','M5','M15','H1']
const NAV=[
  {icon:'⊞',label:'Dashboard',key:'dashboard'},
  {icon:'◎',label:'Stats',key:'stats'},
]

/* ═══════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════════════════════ */
export default function Dashboard({user,subscription,onLogout}){
  const navigate=useNavigate()
  const canvasRef=useRef(null)

  const[symbol,   setSymbol]  =useState('frxXAUUSD')
  const[tf,       setTF]      =useState('M5')
  const[section,  setSection] =useState('dashboard')
  const[dash,     setDash]    =useState(null)
  const[analyze,  setAnalyze] =useState(null)
  const[countdown,setCountdown]=useState(60)
  const[sidebarOpen,setSidebarOpen]=useState(true)
  const[zoom,     setZoom]    =useState(1)
  const[offsetX,  setOffsetX] =useState(0)
  const[aiZones,  setAiZones] =useState(null) // zones detected by AI
  const[aiActive, setAiActive]=useState(false) // true = AI has run, show zones on chart
  const[panelW,   setPanelW]  =useState(340)  // AI panel width
  const[alerts,   setAlerts]  =useState([])   // structure alerts
  const[tradeHit, setTradeHit]=useState(null) // 'entry'|'sl'|'tp1'|'tp2' when price hits
  const[entryHit, setEntryHit]=useState(false) // true once price has touched entry zone
  const[cardHidden, setCardHidden]=useState(false) // hide trade card
  const[cardPos, setCardPos]=useState({x:8,y:8})   // trade card position
  const[dragging, setDragging]=useState(null)       // drag state

  /* Fetch data */
  // Reset AI state when switching asset
  useEffect(()=>{
    setAiZones(null)
    setAiActive(false)
    setTradeHit(null)
    setEntryHit(false)
    setCardHidden(false)
  },[symbol])

  const fetchDash=useCallback(async()=>{
    try{
      const r=await fetch(`${API_URL}/api/dashboard/${encodeURIComponent(user.email)}`)
      const d=await r.json();setDash(d)
    }catch{}
  },[user.email])

  const fetchAnalyze=useCallback(async()=>{
    try{const r=await fetch(`${API_URL}/api/analyze/${symbol}`);const d=await r.json();setAnalyze(d)}
    catch{}
  },[symbol])

  useEffect(()=>{
    fetchDash();fetchAnalyze()
    const id=setInterval(()=>{fetchAnalyze()},2000)
    const dashId=setInterval(()=>{fetchDash()},15000)
    return()=>{clearInterval(id);clearInterval(dashId)}
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

  /* Structure alert detection — runs on every price update */
  useEffect(()=>{
    if(!analyze||!aiActive||!aiZones)return
    const price=analyze.price
    if(!price)return
    const dec=ASSETS[symbol]?.decimals||2

    // Check BOS/CHoCH alerts
    const newAlerts=[]
    const choch=analyze.chartOverlays?.choch
    const bos=analyze.chartOverlays?.bos
    const chochM15=analyze.chartOverlays?.chochM15
    const bosM15=analyze.chartOverlays?.bosM15

    // Detect when price crosses structure levels
    const lvls=[
      {lvl:bos,  tf:'M5', type:'BOS'},
      {lvl:choch,tf:'M5', type:'CHoCH'},
      {lvl:bosM15,  tf:'M15',type:'BOS'},
      {lvl:chochM15,tf:'M15',type:'CHoCH'},
    ]
    // Check scenario activation
    if(aiZones?.scenarios){
      const {s1,s2} = aiZones.scenarios
      if(s1?.activation){
        const dist=Math.abs(price-s1.activation)
        const rng=Math.abs((s1.activation||0)-(s2?.activation||s1.activation-10))*0.1||0.5
        if(dist<Math.max(rng,0.3)){
          newAlerts.push({
            id:'scenario-1',
            msg:`🟢 ESCENARIO 1 ACTIVADO — ${s1.label||'Escenario principal'} (${s1.probability||'?'}%)`,
            color:'#2ed573', ts:Date.now()
          })
        }
      }
      if(s2?.activation){
        const dist=Math.abs(price-s2.activation)
        const rng=Math.abs((s2.activation||0)-(s1?.activation||s2.activation-10))*0.1||0.5
        if(dist<Math.max(rng,0.3)){
          newAlerts.push({
            id:'scenario-2',
            msg:`🟡 ESCENARIO 2 ACTIVADO — ${s2.label||'Escenario alternativo'} (${s2.probability||'?'}%)`,
            color:'#f9ca24', ts:Date.now()
          })
        }
      }
    }

    lvls.forEach(({lvl,tf,type})=>{
      if(!lvl?.level)return
      const dist=Math.abs(price-lvl.level)
      const rng=analyze.candles?.length>5?
        Math.abs(analyze.candles.slice(-10).reduce((mx,c)=>Math.max(mx,c.high),-Infinity)-
                 analyze.candles.slice(-10).reduce((mn,c)=>Math.min(mn,c.low),Infinity)):10
      if(dist<rng*0.05){ // within 5% of range = touching level
        const side=(type==='BOS'?lvl.side:lvl.type?.includes('BULLISH')?'BUY':'SELL')
        newAlerts.push({
          id:`${type}-${tf}-${lvl.level}`,
          msg:`⚡ ${type} ${tf}: ${side==='BUY'?'↑ ALCISTA':'↓ BAJISTA'} en ${lvl.level?.toFixed(dec)}`,
          color:side==='BUY'?'#2ed573':'#ff4757',
          ts:Date.now()
        })
      }
    })

    // Check trade levels hit
    const tr=aiZones?.trade
    if(tr?.entry){
      const isBuy=tr.side==='BUY'
      const entryDist=Math.abs(price-tr.entry)
      const entryRange=Math.abs(tr.tp1-tr.entry)
      // STEP 1: Detect entry zone touch first
      if(entryDist<entryRange*0.06){
        setEntryHit(true)
        setTradeHit('entry')
        newAlerts.push({id:'trade-entry',msg:'🎯 Precio en ZONA DE ENTRADA — Confirmar BOS/CHoCH en M1',color:'#f9ca24',ts:Date.now()})
      }
      // STEP 2: TP/SL only fire AFTER entry was touched
      if(entryHit){
        if(tr.tp1&&Math.abs(price-tr.tp1)<(entryRange*0.03)){
          setTradeHit('tp1')
          newAlerts.push({id:'trade-tp1',msg:'✅ TP1 ALCANZADO — Asegurar parcial',color:'#2ed573',ts:Date.now()})
        }
        if(tr.tp2&&Math.abs(price-tr.tp2)<(Math.abs(tr.tp2-tr.entry)*0.03)){
          setTradeHit('tp2')
          newAlerts.push({id:'trade-tp2',msg:'🏆 TP2 ALCANZADO — Objetivo completo',color:'#00d4aa',ts:Date.now()})
        }
        if(Math.abs(price-tr.sl)<(Math.abs(tr.entry-tr.sl)*0.04)){
          setTradeHit('sl')
          newAlerts.push({id:'trade-sl',msg:'⛔ STOP LOSS TOCADO — Salir de la operación',color:'#ff4757',ts:Date.now()})
        }
      }
    }

    if(newAlerts.length>0){
      setAlerts(prev=>{
        const existing=new Set(prev.map(a=>a.id))
        const fresh=newAlerts.filter(a=>!existing.has(a.id))
        if(!fresh.length)return prev
        return [...fresh,...prev].slice(0,5)
      })
    }
  },[analyze,aiActive,aiZones,symbol])

  // Clear alerts after 8 seconds
  useEffect(()=>{
    if(!alerts.length)return
    const id=setTimeout(()=>setAlerts(prev=>prev.slice(1)),8000)
    return()=>clearTimeout(id)
  },[alerts])

  /* Derived */
  const assetData=dash?.assets?.find(a=>a.symbol===symbol)
  const stats=dash?.stats||{total:0,wins:0,losses:0,pending:0}
  const wr=stats.total>0?Math.round(stats.wins/stats.total*100):0
  const plan=subscription?.plan||user?.plan||'free'
  const planColor=plan==='elite'?C.teal:plan==='premium'?'#378ADD':C.muted

  /* Chart render */
  const renderChart=useCallback(()=>{
    if(!analyze||!canvasRef.current)return
    const cKey=tf==='H1'?'candlesH1':tf==='M15'?'candlesM15':tf==='M1'?'candlesM1':'candles'
    const dKey=tf==='H1'?'demandZonesH1':tf==='M15'?'demandZonesM15':'demandZones'
    const sKey=tf==='H1'?'supplyZonesH1':tf==='M15'?'supplyZonesM15':'supplyZones'
    const candles=analyze[cKey]
    if(!candles?.length)return
    // Zones only drawn AFTER AI has analyzed — clean chart until then
    // In M1: show only the most recent/precise zones (last 30 candles worth)
    const isM1 = tf==='M1'
    const demAll = analyze[dKey]||[]
    const supAll = analyze[sKey]||[]
    // M1 refinement: only show unmitigated zones within current price range ±1%
    const priceRange = analyze.price ? analyze.price * 0.01 : 999
    // M1: show only zones within ±0.8% of price (very tight for precision)
    // M5/M15/H1: show all active zones
    const m1Range = priceRange * 0.8
    const demZ = aiActive ? (isM1
      ? demAll.filter(z=>!z.mitigated&&Math.abs((z.high+z.low)/2-(analyze.price||0))<m1Range)
      : demAll) : []
    const supZ = aiActive ? (isM1
      ? supAll.filter(z=>!z.mitigated&&Math.abs((z.high+z.low)/2-(analyze.price||0))<m1Range)
      : supAll) : []

    drawChart(canvasRef.current,{
      candles,
      demandZones:     demZ,
      supplyZones:     supZ,
      fvgZones:        aiActive && (tf==='M5'||tf==='M1') ? (analyze.fvgZones||[]) : [],
      liquidityLevels: aiActive && (tf==='M5'||tf==='M1') ? (analyze.liquidityLevels||[]) : [],
      aiZones:         aiActive ? aiZones : null,
      choch:           aiActive ? analyze.chartOverlays?.choch   : null,
      bos:             aiActive ? analyze.chartOverlays?.bos     : null,
      chochM15:        aiActive ? analyze.chartOverlays?.chochM15: null,
      bosM15:          aiActive ? analyze.chartOverlays?.bosM15  : null,
      structure:       aiActive ? (analyze.structureM5Data||{})  : {},
      zoom, offsetX,
      premiumDiscount: aiActive ? (analyze.premiumDiscount||'EQUILIBRIUM') : 'EQUILIBRIUM',
      isM1
    })
  },[analyze,tf,assetData,zoom,offsetX,aiZones,aiActive])

  useEffect(()=>{renderChart()},[renderChart])
  useEffect(()=>{
    const obs=new ResizeObserver(()=>setTimeout(renderChart,40))
    if(canvasRef.current?.parentElement)obs.observe(canvasRef.current.parentElement)
    return()=>obs.disconnect()
  },[renderChart])

  /* ─── RENDER ─── */
  return(
    <div style={{display:'flex',flexDirection:'column',height:'100dvh',background:C.bg0,overflow:'hidden'}}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes slideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glowPulse{0%,100%{box-shadow:0 0 8px currentColor}50%{box-shadow:0 0 18px currentColor}}
        .btn-ghost{background:none;border:1px solid transparent;color:${C.muted};border-radius:5px;cursor:pointer;transition:all .15s}
        .btn-ghost:hover{background:${C.bg3};border-color:${C.border};color:${C.text}}
        .btn-ghost.active{background:${C.tealBg};border-color:${C.tealDark};color:${C.teal}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
      `}</style>

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
        <span style={{background:'rgba(167,139,250,.1)',color:C.purple,fontSize:10,fontWeight:700,
          padding:'2px 7px',borderRadius:20,border:`1px solid ${C.purple}66`,flexShrink:0}}>🧠 IA SMC</span>
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
            <div key={n.key} onClick={()=>setSection(n.key)}
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
              <div key={sym} onClick={()=>{setSymbol(sym);setAiZones(null)}}
                style={{display:'flex',alignItems:'center',gap:7,padding:'7px 10px',
                  fontSize:11,cursor:'pointer',borderRadius:6,margin:'1px 5px',
                  background:isAct?C.bg3:'transparent',border:`1px solid ${isAct?C.border:'transparent'}`}}>
                <div style={{width:25,height:25,borderRadius:5,background:isAct?'#1a3a2a':C.bg2,
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0}}>{cfg.emoji}</div>
                <div style={{flex:1,minWidth:0,overflow:'hidden'}}>
                  <div style={{fontWeight:600,color:C.text,fontSize:11,whiteSpace:'nowrap'}}>{cfg.shortName}</div>
                  <div style={{fontSize:9,color:tc,fontWeight:700}}>{trend}</div>
                </div>
              </div>
            )
          })}
        </aside>

        {/* MAIN CONTENT */}
        <main style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>

          {/* Stats row */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,
            padding:'6px 10px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            <StatCard label="WIN RATE" value={wr+'%'} sub={stats.total>0?`${stats.total} ops`:'Sin ops'} color={C.teal}/>
            <StatCard label="ACTIVAS"  value={stats.pending||0} sub="En curso"   color={C.teal}/>
            <StatCard label="WINS"     value={stats.wins||0}    sub="Ganadoras"  color={C.green}/>
            <StatCard label="LOSS"     value={stats.losses||0}  sub="Pérdidas"   color={C.red}/>
          </div>

          {/* CHART + AI PANEL LAYOUT */}
          <div style={{flex:1,display:'flex',overflow:'hidden'}}>

            {/* LEFT: Chart area */}
            <div style={{flex:1,display:'flex',flexDirection:'column',padding:'6px 6px 6px 10px',gap:5,overflow:'hidden',minWidth:0}}>

              {/* Asset info bar */}
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
                {analyze?.premiumDiscount&&analyze.premiumDiscount!=='EQUILIBRIUM'&&(
                  <span style={{fontSize:10,fontWeight:700,
                    color:analyze.premiumDiscount==='PREMIUM'?C.red:C.green,
                    background:analyze.premiumDiscount==='PREMIUM'?'rgba(255,107,107,.1)':'rgba(63,185,80,.1)',
                    padding:'2px 7px',borderRadius:4}}>
                    {analyze.premiumDiscount==='PREMIUM'?'⬆ PREMIUM':'⬇ DISCOUNT'}
                  </span>
                )}
                {aiZones&&(
                  <span style={{fontSize:10,fontWeight:700,color:C.purple,background:'rgba(167,139,250,.1)',
                    padding:'2px 7px',borderRadius:4,border:`1px solid ${C.purple}44`}}>🧠 IA activa</span>
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

              {/* Chart */}
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
                {/* ── Structure Alerts ── */}
                {alerts.length>0&&(
                  <div style={{position:'absolute',top:8,left:'50%',transform:'translateX(-50%)',
                    display:'flex',flexDirection:'column',gap:4,zIndex:10,pointerEvents:'none',minWidth:320,maxWidth:500}}>
                    {alerts.map(a=>(
                      <div key={a.id} style={{
                        background:'rgba(13,17,23,.95)',
                        border:`2px solid ${a.color}`,
                        borderRadius:8,padding:'7px 14px',
                        display:'flex',alignItems:'center',gap:8,
                        boxShadow:`0 0 16px ${a.color}44`,
                        animation:'slideIn .3s ease'
                      }}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:a.color,
                          boxShadow:`0 0 6px ${a.color}`,flexShrink:0,
                          animation:'pulse 1s ease-in-out infinite'}}/>
                        <span style={{fontSize:12,fontWeight:700,color:a.color}}>{a.msg}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── AI Trade Card (draggable, hideable) ── */}
                {aiActive&&aiZones?.trade&&!cardHidden&&(
                  <div
                    style={{position:'absolute',
                      top:cardPos.y,right:'auto',left:cardPos.x,
                      background:'rgba(13,17,23,.95)',
                      border:`1px solid ${aiZones.trade.side==='BUY'?'#2ed573':'#ff4757'}`,
                      borderRadius:8,zIndex:20,minWidth:165,
                      boxShadow:`0 4px 20px rgba(0,0,0,.6)`,
                      cursor:'grab',userSelect:'none'}}
                    onMouseDown={e=>{
                      const startX=e.clientX-cardPos.x
                      const startY=e.clientY-cardPos.y
                      const onMove=ev=>setCardPos({x:ev.clientX-startX,y:ev.clientY-startY})
                      const onUp=()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp)}
                      window.addEventListener('mousemove',onMove)
                      window.addEventListener('mouseup',onUp)
                    }}>
                  {/* Header row with hide button */}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                    padding:'5px 8px 3px',borderBottom:'1px solid #30363d33',cursor:'grab'}}>
                    <div style={{display:'flex',alignItems:'center',gap:5}}>
                      <span style={{fontSize:9,color:'#7d8590'}}>⠿</span>
                      <span style={{fontSize:10,color:'#7d8590',fontWeight:600}}>Trade IA</span>
                      {/* Progress dots: pending → entry → tp1 → tp2 */}
                      <div style={{display:'flex',gap:2,marginLeft:4}}>
                        {['entry','tp1','tp2'].map((stage,i)=>{
                          const hit = stage==='entry'?entryHit:tradeHit===stage||tradeHit===(i===1?'tp2':null)
                          const active = tradeHit===stage||(stage==='entry'&&entryHit)
                          return <div key={stage} style={{
                            width:6,height:6,borderRadius:'50%',
                            background:active?'#2ed573':entryHit&&i<(['entry','tp1','tp2'].indexOf(tradeHit)+1)?'#2ed573':'#30363d',
                            transition:'background .3s'
                          }}/>
                        })}
                      </div>
                    </div>
                    <button onClick={e=>{e.stopPropagation();setCardHidden(true)}}
                      style={{background:'none',border:'none',color:'#7d8590',cursor:'pointer',
                        fontSize:14,lineHeight:1,padding:'0 2px'}} title="Ocultar">×</button>
                  </div>
                  <div style={{padding:'5px 10px 8px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                      <span style={{fontSize:16}}>{aiZones.trade.side==='BUY'?'▲':'▼'}</span>
                      <span style={{fontWeight:800,fontSize:13,
                        color:aiZones.trade.side==='BUY'?'#2ed573':'#ff4757'}}>
                        {aiZones.trade.side} — IA
                      </span>
                      {tradeHit&&<span style={{fontSize:10,fontWeight:700,
                        color:tradeHit==='sl'?'#ff4757':tradeHit.startsWith('tp')?'#2ed573':'#f9ca24',
                        background:'rgba(0,0,0,.4)',padding:'1px 5px',borderRadius:3}}>
                        {tradeHit.toUpperCase()} ⚡
                      </span>}
                    </div>
                    {[
                      {l:'Entrada',v:aiZones.trade.entry,c:'#f9ca24'},
                      {l:'SL',     v:aiZones.trade.sl,   c:'#ff4757'},
                      {l:'TP1',    v:aiZones.trade.tp1,  c:'#2ed573'},
                      aiZones.trade.tp2&&{l:'TP2',v:aiZones.trade.tp2,c:'#00d4aa'},
                    ].filter(Boolean).map(({l,v,c})=>(
                      <div key={l} style={{display:'flex',justifyContent:'space-between',
                        gap:12,marginBottom:2}}>
                        <span style={{fontSize:10,color:'#7d8590'}}>{l}</span>
                        <span style={{fontSize:11,fontWeight:700,color:c,fontVariantNumeric:'tabular-nums'}}>
                          {v?.toFixed(ASSETS[symbol]?.decimals||2)}
                        </span>
                      </div>
                    ))}
                    {aiZones.trade.tp1&&aiZones.trade.sl&&aiZones.trade.entry&&(()=>{
                      const rr=Math.abs(aiZones.trade.tp1-aiZones.trade.entry)/Math.abs(aiZones.trade.entry-aiZones.trade.sl)
                      return <div style={{borderTop:'1px solid #30363d',marginTop:4,paddingTop:4,
                        display:'flex',justifyContent:'space-between'}}>
                        <span style={{fontSize:9,color:'#7d8590'}}>R:R</span>
                        <span style={{fontSize:10,fontWeight:800,color:rr>=1.5?'#2ed573':'#f9ca24'}}>
                          1:{rr.toFixed(1)}
                        </span>
                      </div>
                    })()}
                    {aiZones.trade.label&&(
                      <div style={{fontSize:9,color:'#7d8590',marginTop:4,borderTop:'1px solid #30363d',paddingTop:3}}>
                        {aiZones.trade.label}
                      </div>
                    )}
                  </div>
                  </div>
                  </div>
                )}

                {/* ── Show card button when hidden ── */}
                {aiActive&&aiZones?.trade&&cardHidden&&(
                  <button onClick={()=>setCardHidden(false)}
                    style={{position:'absolute',top:8,right:8,zIndex:20,
                      background:'rgba(13,17,23,.92)',
                      border:`1px solid ${aiZones.trade.side==='BUY'?'#2ed573':'#ff4757'}`,
                      borderRadius:6,padding:'4px 10px',cursor:'pointer',
                      color:aiZones.trade.side==='BUY'?'#2ed573':'#ff4757',
                      fontSize:11,fontWeight:700}}>
                    {aiZones.trade.side==='BUY'?'▲':'▼'} Trade IA
                  </button>
                )}

                {/* ── Scenarios mini card ── */}
                {aiActive&&aiZones?.scenarios&&(
                  <div style={{position:'absolute',
                    top: cardHidden ? 8 : cardPos.y+210,
                    left: cardHidden ? 'auto' : cardPos.x, right: cardHidden ? 8 : 'auto',
                    background:'rgba(13,17,23,.92)',
                    border:'1px solid #30363d',
                    borderRadius:8,padding:'8px 12px',zIndex:8,minWidth:160}}>
                    <div style={{fontSize:9,color:'#7d8590',fontWeight:700,marginBottom:6,
                      letterSpacing:'.06em',textTransform:'uppercase'}}>Escenarios</div>
                    {[
                      {s:aiZones.scenarios.s1, n:1, baseCol:'#2ed573'},
                      {s:aiZones.scenarios.s2, n:2, baseCol:'#f9ca24'},
                    ].filter(x=>x.s).map(({s,n,baseCol})=>{
                      const isActive=alerts.some(a=>a.id===`scenario-${n}`)
                      const col=isActive?baseCol:`${baseCol}66`
                      return(
                        <div key={n} style={{
                          display:'flex',alignItems:'center',gap:6,marginBottom:5,
                          background:isActive?`${baseCol}15`:'transparent',
                          borderRadius:4,padding:'3px 5px',
                          border:isActive?`1px solid ${baseCol}44`:'1px solid transparent',
                          transition:'all .3s'
                        }}>
                          <span style={{fontSize:14}}>{s.direction==='UP'?'▲':'▼'}</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:10,fontWeight:700,color:col}}>
                              S{n} {isActive?'⚡ ACTIVO':''}
                            </div>
                            <div style={{fontSize:9,color:'#7d8590',
                              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:120}}>
                              {s.label?.replace(`Escenario ${n} — `,'')?.slice(0,30)||''}
                            </div>
                          </div>
                          <span style={{fontSize:10,fontWeight:700,color:col}}>{s.probability}%</span>
                        </div>
                      )
                    })}
                    {aiZones.scenarios.s1?.activation&&(
                      <div style={{fontSize:8,color:'#7d8590',marginTop:3,
                        borderTop:'1px solid #30363d',paddingTop:4}}>
                        S1 activa en: {aiZones.scenarios.s1.activation}
                        {aiZones.scenarios.s2?.activation&&` · S2: ${aiZones.scenarios.s2.activation}`}
                      </div>
                    )}
                  </div>
                )}

                {analyze&&!aiActive&&(
                  <div style={{position:'absolute',bottom:40,left:'50%',transform:'translateX(-50%)',
                    background:'rgba(13,17,23,.85)',border:`1px solid ${C.teal}44`,
                    borderRadius:8,padding:'8px 16px',display:'flex',alignItems:'center',gap:8,
                    backdropFilter:'blur(4px)',pointerEvents:'none'}}>
                    <span style={{fontSize:14}}>🧠</span>
                    <span style={{fontSize:11,color:C.muted}}>Presiona <strong style={{color:C.teal}}>⚡ Activar IA</strong> para ver las zonas institucionales</span>
                  </div>
                )}
              </ChartContainer>

              {/* Legend row — only show after AI activated */}
              {aiActive&&<div style={{display:'flex',gap:8,flexShrink:0,flexWrap:'wrap',padding:'2px 0',alignItems:'center'}}>
                {[
                  {col:C.green, label:'OB Demanda'},
                  {col:C.red,   label:'OB Oferta'},
                  {col:C.blue,  label:'FVG Alcista'},
                  {col:C.orange,label:'FVG Bajista'},
                  {col:'rgba(255,107,107,.7)',label:'BSL'},
                  {col:'rgba(63,185,80,.7)',  label:'SSL'},
                ].map(({col,label})=>(
                  <div key={label} style={{display:'flex',alignItems:'center',gap:4}}>
                    <div style={{width:8,height:8,borderRadius:2,background:col+'44',border:`1px solid ${col}`}}/>
                    <span style={{fontSize:9,color:C.muted}}>{label}</span>
                  </div>
                ))}
                {aiZones?.trade&&(
                  <div style={{display:'flex',alignItems:'center',gap:4,
                    background:'rgba(249,202,36,.08)',borderRadius:4,padding:'2px 6px',
                    border:'1px solid rgba(249,202,36,.3)'}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:'#f9ca24',
                      boxShadow:'0 0 4px #f9ca24'}}/>
                    <span style={{fontSize:9,color:'#f9ca24',fontWeight:700}}>
                      {aiZones.trade.side==='BUY'?'▲ COMPRA':'▼ VENTA'} IA — R:R {
                        aiZones.trade.tp1&&aiZones.trade.sl&&aiZones.trade.entry
                          ?(Math.abs(aiZones.trade.tp1-aiZones.trade.entry)/Math.abs(aiZones.trade.entry-aiZones.trade.sl)).toFixed(1)
                          :'?'
                      }
                    </span>
                  </div>
                )}
                {tf==='M1'&&aiActive&&(
                  <div style={{display:'flex',alignItems:'center',gap:4,
                    background:'rgba(0,212,170,.08)',borderRadius:4,padding:'2px 6px',
                    border:'1px solid rgba(0,212,170,.3)'}}>
                    <div style={{width:6,height:6,borderRadius:'50%',background:C.teal,
                      animation:'pulse 1s ease-in-out infinite'}}/>
                    <span style={{fontSize:9,color:C.teal,fontWeight:700}}>M1 — Modo Confirmación</span>
                  </div>
                )}
              </div>}
            </div>

            {/* RIGHT: AI Analysis Panel */}
            <div style={{
              width:panelW,
              minWidth:panelW,
              maxWidth:panelW,
              display:'flex',
              flexDirection:'column',
              borderLeft:`1px solid ${C.border}`,
              background:C.bg0,
              flexShrink:0
            }}>
              <AIAnalysisPanel
                symbol={symbol}
                onZonesDetected={setAiZones}
                onActivate={()=>setAiActive(true)}
                onReset={()=>{
                  setAiActive(false)
                  setTradeHit(null)
                  setEntryHit(false)
                  setAlerts([])
                  setCardHidden(false)
                  setCardPos({x:8,y:8})
                }}
              />
            </div>
          </div>

          {/* Bottom status bar */}
          <div style={{background:C.bg1,borderTop:`1px solid ${C.border}`,
            padding:'4px 12px',display:'flex',alignItems:'center',gap:8,flexShrink:0,flexWrap:'wrap'}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:C.teal,display:'inline-block'}}/>
            <span style={{fontSize:10,color:C.muted}}>Datos en vivo · actualiza cada</span>
            <span style={{fontSize:10,fontWeight:700,color:C.teal}}>{countdown}s</span>
            <span style={{fontSize:9,color:C.border,marginLeft:'auto'}}>+/− zoom · ← → pan · 0 reset</span>
            <span style={{fontSize:10,color:C.muted}}>{new Date().toLocaleTimeString('es',{hour12:false})}</span>
            <button onClick={()=>{fetchDash();fetchAnalyze()}}
              className="btn-ghost" style={{padding:'2px 8px',fontSize:10}}>↻</button>
          </div>
        </main>
      </div>
    </div>
  )
}
