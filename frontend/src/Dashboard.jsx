import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from './config/plans.js'

const C = {
  bg0:'#0d1117', bg1:'#161b22', bg2:'#1c2330', bg3:'#21262d',
  border:'#30363d', text:'#e6edf3', muted:'#7d8590',
  teal:'#00d4aa', tealDark:'#00b894', tealBg:'rgba(0,212,170,.12)',
  red:'#ff6b6b', redBg:'rgba(255,107,107,.12)',
  yellow:'#f9ca24', green:'#3fb950', bull:'#3fb950', bear:'#ff6b6b',
  purple:'#a78bfa', orange:'#fb923c', blue:'#60a5fa'
}

/* ─────────────────────────────────────── CHART */
function drawChart(canvas, state) {
  const {
    candles=[], demandZones=[], supplyZones=[],
    fvgZones=[], liquidityLevels=[],
    aiZones=null,
    choch, bos, chochM15, bosM15,
    structure={}, zoom=1, offsetX=0,
    premiumDiscount='EQUILIBRIUM',
    isM1=false
  } = state
  if (!canvas || candles.length < 5) return
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  canvas.width = Math.floor(rect.width * dpr)
  canvas.height = Math.floor(rect.height * dpr)
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  const W = rect.width, H = rect.height
  ctx.fillStyle = C.bg1; ctx.fillRect(0,0,W,H)
  const ML=64, MR=80, MT=24, MB=32
  const CW=W-ML-MR, CH=H-MT-MB
  if (CW<40||CH<40) return
  const cPerView = Math.max(10, Math.floor((CW/7)/zoom))
  const total = candles.length
  const maxOff = Math.max(0, total - cPerView)
  const safeOff = Math.max(0, Math.min(maxOff, Math.round(offsetX)))
  const startIdx = Math.max(0, total - cPerView - safeOff)
  const vis = candles.slice(startIdx, Math.max(startIdx+5, total - safeOff))
  const visOff = startIdx
  if (!vis.length) return
  const allP = vis.flatMap(c=>[c.high,c.low])
  const mn=Math.min(...allP), mx=Math.max(...allP), rng=mx-mn||1
  const PN=mn-rng*.09, PX=mx+rng*.13, PR=PX-PN
  const py=p=>MT+CH*(1-(p-PN)/PR)
  const n=vis.length, SL=CW/n, BW=Math.max(Math.floor(SL*.65),2)
  const cx=i=>ML+SL*i+SL/2
  const gs=rng<3?.5:rng<10?1:rng<30?5:10
  // Grid
  ctx.strokeStyle='rgba(255,255,255,.04)'; ctx.lineWidth=1
  for(let p=Math.ceil(PN/gs)*gs;p<=PX;p+=gs){
    ctx.beginPath();ctx.moveTo(ML,py(p));ctx.lineTo(ML+CW,py(p));ctx.stroke()
  }
  // Premium/Discount
  if(premiumDiscount!=='EQUILIBRIUM'){
    const midP=(PN+PX)/2
    if(premiumDiscount==='PREMIUM'){
      ctx.fillStyle='rgba(255,107,107,.04)';ctx.fillRect(ML,MT,CW,CH/2)
    } else {
      ctx.fillStyle='rgba(63,185,80,.04)';ctx.fillRect(ML,MT+CH/2,CW,CH/2)
    }
    ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1;ctx.setLineDash([4,4])
    ctx.beginPath();ctx.moveTo(ML,py(midP));ctx.lineTo(ML+CW,py(midP));ctx.stroke()
    ctx.setLineDash([])
  }
  // OB Zones
  ;[
    {zones:demandZones,fillA:'rgba(63,185,80,.18)',fillS:'rgba(63,185,80,.06)',stroke:C.green,strokeS:'rgba(63,185,80,.25)',label:'OB Demanda'},
    {zones:supplyZones,fillA:'rgba(255,107,107,.18)',fillS:'rgba(255,107,107,.06)',stroke:C.red,strokeS:'rgba(255,107,107,.25)',label:'OB Oferta'}
  ].forEach(({zones,fillA,fillS,stroke,strokeS,label})=>{
    zones.forEach(z=>{
      const zi=z.index-visOff
      if(zi<-5||zi>n+2)return
      const x1=zi>=0?Math.max(ML,cx(zi)-SL/2):ML
      const x2=z.mitigated?Math.min(ML+CW,x1+Math.max(60,(zi+15)*SL)):ML+CW
      if(x1>=x2)return
      const y1=py(z.high),y2=py(z.low)
      const isMit=z.mitigated,isStruc=z.isStructureOB
      ctx.fillStyle=isMit?fillS:(isM1?fillA.replace('.18','.28'):fillA)
      ctx.fillRect(x1,y1,x2-x1,y2-y1)
      ctx.strokeStyle=isMit?strokeS:stroke
      ctx.lineWidth=isM1?(isStruc?3:2):(isStruc?2:1.5)
      ctx.setLineDash(isMit?[3,3]:[])
      ctx.strokeRect(x1,y1,x2-x1,y2-y1)
      ctx.setLineDash([])
      if(!isMit&&Math.abs(y2-y1)>=10){
        ctx.fillStyle=stroke;ctx.font=(isStruc?'bold ':'')+`9px system-ui`;ctx.textAlign='left'
        ctx.fillText(isStruc?label+' ★':label,x1+4,y1+11)
      }
      if(!isMit&&x2>=ML+CW-60){
        ctx.fillStyle=stroke+'cc';ctx.font='8px system-ui';ctx.textAlign='left'
        ctx.fillText(z.high.toFixed(2),ML+CW+2,y1+4)
        ctx.fillText(z.low.toFixed(2),ML+CW+2,y2+4)
      }
    })
  })
  // FVG Zones
  fvgZones.forEach(z=>{
    const zi=z.index-visOff
    if(zi<-5||zi>n+5)return
    const x1=zi>=0?Math.max(ML,cx(zi)-SL/2):ML
    const x2=ML+CW
    if(x1>=x2)return
    const y1=py(z.high),y2=py(z.low)
    const col=z.side==='BUY'?'rgba(96,165,250,.12)':'rgba(251,146,60,.12)'
    const colS=z.side==='BUY'?C.blue:C.orange
    ctx.fillStyle=col;ctx.fillRect(x1,y1,x2-x1,y2-y1)
    ctx.strokeStyle=colS+'44';ctx.lineWidth=0.8;ctx.setLineDash([3,4])
    ctx.strokeRect(x1,y1,x2-x1,y2-y1);ctx.setLineDash([])
    if(Math.abs(y2-y1)>=6){
      ctx.fillStyle=colS+'aa';ctx.font='7px system-ui';ctx.textAlign='left'
      ctx.fillText('FVG',x1+3,y1+9)
      ctx.fillText(z.high.toFixed(2),ML+CW+2,y1+4)
      ctx.fillText(z.low.toFixed(2),ML+CW+2,y2+4)
    }
  })
  // Liquidity
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
  // AI Zones
  if(aiZones){
    ;(aiZones.keyLevels||[]).forEach(lv=>{
      const y=py(lv.price)
      if(y<MT-10||y>MT+CH+10)return
      const col='rgba(167,139,250,.75)'
      ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.setLineDash([8,3])
      ctx.beginPath();ctx.moveTo(ML,y);ctx.lineTo(ML+CW,y);ctx.stroke()
      ctx.setLineDash([])
      const lbl=lv.label||lv.type
      const lw=lbl.length*5.5+lv.price.toFixed(2).length*5+14
      ctx.fillStyle='rgba(167,139,250,.12)';ctx.strokeStyle=col;ctx.lineWidth=1
      ctx.beginPath();ctx.roundRect(ML+4,y-9,lw,16,3);ctx.fill();ctx.stroke()
      ctx.fillStyle=col;ctx.font='bold 8px system-ui';ctx.textAlign='left'
      ctx.fillText(`${lbl} ${lv.price.toFixed(2)}`,ML+8,y+4)
    })
    // Trade setup
    const tr=aiZones.trade
    if(tr&&tr.entry&&tr.sl&&tr.tp1){
      const isBuy=tr.side==='BUY'
      const entryY=py(tr.entry),slY=py(tr.sl),tp1Y=py(tr.tp1)
      const tp2Y=tr.tp2?py(tr.tp2):null
      const xL=ML,xR=ML+CW
      // Zones
      ctx.fillStyle='rgba(255,71,87,.12)';ctx.fillRect(xL,Math.min(entryY,slY),CW,Math.abs(entryY-slY))
      if(tp2Y!==null){ctx.fillStyle='rgba(46,213,115,.08)';ctx.fillRect(xL,Math.min(entryY,tp2Y),CW,Math.abs(entryY-tp2Y))}
      else{ctx.fillStyle='rgba(46,213,115,.08)';ctx.fillRect(xL,Math.min(entryY,tp1Y),CW,Math.abs(entryY-tp1Y))}
      // TP2
      if(tp2Y!==null){
        ctx.strokeStyle=C.green;ctx.lineWidth=1.5;ctx.setLineDash([6,3])
        ctx.beginPath();ctx.moveTo(xL,tp2Y);ctx.lineTo(xR,tp2Y);ctx.stroke();ctx.setLineDash([])
        ctx.fillStyle='rgba(63,185,80,.15)';ctx.strokeStyle=C.green;ctx.lineWidth=1
        ctx.beginPath();ctx.roundRect(xR+2,tp2Y-8,52,16,3);ctx.fill();ctx.stroke()
        ctx.fillStyle=C.green;ctx.font='bold 8px system-ui';ctx.textAlign='left'
        ctx.fillText('TP2 '+tr.tp2.toFixed(2),xR+5,tp2Y+4)
      }
      // TP1
      ctx.strokeStyle=C.green;ctx.lineWidth=2;ctx.setLineDash([6,3])
      ctx.beginPath();ctx.moveTo(xL,tp1Y);ctx.lineTo(xR,tp1Y);ctx.stroke();ctx.setLineDash([])
      ctx.fillStyle='rgba(63,185,80,.15)';ctx.strokeStyle=C.green;ctx.lineWidth=1
      ctx.beginPath();ctx.roundRect(xR+2,tp1Y-8,52,16,3);ctx.fill();ctx.stroke()
      ctx.fillStyle=C.green;ctx.font='bold 8px system-ui';ctx.textAlign='left'
      ctx.fillText('TP1 '+tr.tp1.toFixed(2),xR+5,tp1Y+4)
      // SL
      ctx.strokeStyle=C.red;ctx.lineWidth=2;ctx.setLineDash([4,3])
      ctx.beginPath();ctx.moveTo(xL,slY);ctx.lineTo(xR,slY);ctx.stroke();ctx.setLineDash([])
      ctx.fillStyle='rgba(255,107,107,.15)';ctx.strokeStyle=C.red;ctx.lineWidth=1
      ctx.beginPath();ctx.roundRect(xR+2,slY-8,52,16,3);ctx.fill();ctx.stroke()
      ctx.fillStyle=C.red;ctx.font='bold 8px system-ui';ctx.textAlign='left'
      ctx.fillText('SL  '+tr.sl.toFixed(2),xR+5,slY+4)
      // Entry
      ctx.strokeStyle=C.yellow;ctx.lineWidth=2.5;ctx.setLineDash([])
      ctx.beginPath();ctx.moveTo(xL,entryY);ctx.lineTo(xR,entryY);ctx.stroke()
      const rrRaw=tr.tp1&&tr.sl?Math.abs(tr.tp1-tr.entry)/Math.abs(tr.entry-tr.sl):0
      const eLabel=(isBuy?'▲ BUY ':'▼ SELL ')+tr.entry.toFixed(2)+(rrRaw>0?' R:R '+rrRaw.toFixed(1):'')
      const eW=eLabel.length*6+12
      ctx.fillStyle=C.yellow;ctx.beginPath();ctx.roundRect(xR+2,entryY-9,eW,18,4);ctx.fill()
      ctx.fillStyle='#000';ctx.font='bold 9px system-ui';ctx.textAlign='left'
      ctx.fillText(eLabel,xR+6,entryY+4)
      // Arrow
      ctx.fillStyle=C.yellow;ctx.globalAlpha=0.9
      const arrX=xL+8,arrY=entryY,arrS=7
      ctx.beginPath()
      if(isBuy){ctx.moveTo(arrX,arrY+arrS);ctx.lineTo(arrX-arrS,arrY-arrS);ctx.lineTo(arrX+arrS,arrY-arrS)}
      else{ctx.moveTo(arrX,arrY-arrS);ctx.lineTo(arrX-arrS,arrY+arrS);ctx.lineTo(arrX+arrS,arrY+arrS)}
      ctx.closePath();ctx.fill();ctx.globalAlpha=1
    }
    // Scenario lines
    if(aiZones.scenarios){
      const {s1,s2}=aiZones.scenarios
      if(s1&&s1.activation){
        const y=py(s1.activation)
        if(y>=MT&&y<=MT+CH){
          const col=s1.direction==='UP'?'rgba(63,185,80,.85)':'rgba(255,107,107,.85)'
          ctx.strokeStyle=col;ctx.lineWidth=2;ctx.setLineDash([10,4])
          ctx.beginPath();ctx.moveTo(ML,y);ctx.lineTo(ML+CW,y);ctx.stroke();ctx.setLineDash([])
          const arr=s1.direction==='UP'?'▲':'▼'
          const lbl=arr+' S1 '+s1.activation.toFixed(2)+' ('+( s1.probability||'?')+'%)'
          ctx.fillStyle=col.replace('.85','.15');ctx.strokeStyle=col;ctx.lineWidth=1.5
          ctx.beginPath();ctx.roundRect(ML+4,y-11,lbl.length*6+16,18,4);ctx.fill();ctx.stroke()
          ctx.fillStyle=col;ctx.font='bold 9px system-ui';ctx.textAlign='left'
          ctx.fillText(lbl,ML+8,y+5)
        }
      }
      if(s2&&s2.activation){
        const y=py(s2.activation)
        if(y>=MT&&y<=MT+CH){
          const col=s2.direction==='UP'?'rgba(63,185,80,.5)':'rgba(255,107,107,.5)'
          ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.setLineDash([6,6])
          ctx.beginPath();ctx.moveTo(ML,y);ctx.lineTo(ML+CW,y);ctx.stroke();ctx.setLineDash([])
          const lbl=(s2.direction==='UP'?'▲':'▼')+' S2 '+s2.activation.toFixed(2)+' ('+(s2.probability||'?')+'%)'
          ctx.fillStyle=col.replace('.5','.1');ctx.strokeStyle=col;ctx.lineWidth=1
          ctx.beginPath();ctx.roundRect(ML+4,y-10,lbl.length*6+16,16,3);ctx.fill();ctx.stroke()
          ctx.fillStyle=col;ctx.font='9px system-ui';ctx.textAlign='left'
          ctx.fillText(lbl,ML+8,y+4)
        }
      }
    }
    // M1 confirmation glow
    if(isM1&&aiZones.trade){
      const entryY=py(aiZones.trade.entry)
      const grad=ctx.createLinearGradient(ML,0,ML+CW,0)
      grad.addColorStop(0,'rgba(249,202,36,0)')
      grad.addColorStop(0.1,'rgba(249,202,36,.12)')
      grad.addColorStop(0.9,'rgba(249,202,36,.12)')
      grad.addColorStop(1,'rgba(249,202,36,0)')
      ctx.fillStyle=grad;ctx.fillRect(ML,entryY-12,CW,24)
      ctx.fillStyle='rgba(249,202,36,.85)';ctx.font='bold 9px system-ui';ctx.textAlign='center'
      ctx.fillText('◉ ZONA CONFIRMACIÓN M1',ML+CW/2,entryY-14)
    }
  }
  // Structure levels
  const drawLvl=(lvl,color,tag)=>{
    if(!lvl||lvl.level==null)return
    const bi=(lvl.breakIndex||0)-visOff
    if(bi<0||bi>=n)return
    const sx=cx(bi),ex=Math.min(ML+CW,cx(Math.min(n-1,bi+30)))
    if(sx>ML+CW)return
    const y=py(lvl.level)
    ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.setLineDash([6,4])
    ctx.beginPath();ctx.moveTo(sx,y);ctx.lineTo(ex,y);ctx.stroke();ctx.setLineDash([])
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(sx,y,3,0,Math.PI*2);ctx.fill()
    const lw=tag.length*5.5+lvl.level.toFixed(2).length*5+14
    const lx=Math.min(ex+2,ML+CW-lw-2)
    ctx.fillStyle=color+'22';ctx.strokeStyle=color;ctx.lineWidth=1
    ctx.beginPath();ctx.roundRect(lx,y-8,lw,16,3);ctx.fill();ctx.stroke()
    ctx.fillStyle=color;ctx.font='bold 8px system-ui';ctx.textAlign='left'
    ctx.fillText(tag+' '+lvl.level.toFixed(2),lx+4,y+4)
  }
  drawLvl(bos,C.text,bos?.side==='BUY'?'BOS↑ M5':'BOS↓ M5')
  drawLvl(choch,C.yellow,choch?.type==='BULLISH_CHOCH'?'CHoCH↑ M5':'CHoCH↓ M5')
  drawLvl(bosM15,'rgba(140,140,255,.9)',bosM15?.side==='BUY'?'BOS↑ M15':'BOS↓ M15')
  drawLvl(chochM15,'rgba(255,200,60,.8)',chochM15?.type==='BULLISH_CHOCH'?'CHoCH↑ M15':'CHoCH↓ M15')
  // Structure fractals
  ;(structure.labels||[]).forEach(lb=>{
    const li=lb.index-visOff
    if(li<0||li>=n||!vis[li])return
    const isBull=lb.type==='HH'||lb.type==='HL'
    const x=cx(li),size=5
    if(!isBull){
      const y=py(vis[li].high)-3
      ctx.fillStyle=lb.type==='HH'?'#ff4757':'#ff6b81';ctx.globalAlpha=0.85
      ctx.beginPath();ctx.moveTo(x,y+size*1.5);ctx.lineTo(x-size,y);ctx.lineTo(x+size,y)
      ctx.closePath();ctx.fill();ctx.globalAlpha=1
    } else {
      const y=py(vis[li].low)+3
      ctx.fillStyle=lb.type==='HL'?'#2ed573':'#7bed9f';ctx.globalAlpha=0.85
      ctx.beginPath();ctx.moveTo(x,y-size*1.5);ctx.lineTo(x-size,y);ctx.lineTo(x+size,y)
      ctx.closePath();ctx.fill();ctx.globalAlpha=1
    }
  })
  // Candles
  vis.forEach((c,i)=>{
    const x=cx(i),bull=c.close>=c.open,col=bull?C.bull:C.bear
    ctx.strokeStyle=col;ctx.lineWidth=1.5
    ctx.beginPath();ctx.moveTo(x,py(c.high));ctx.lineTo(x,py(c.low));ctx.stroke()
    const bt=py(Math.max(c.open,c.close)),bh=Math.max(py(Math.min(c.open,c.close))-bt,1)
    ctx.fillStyle=bull?C.bull+'cc':C.bear+'cc';ctx.fillRect(x-BW/2,bt,BW,bh)
    if(!bull){ctx.strokeStyle=C.bear;ctx.lineWidth=.8;ctx.strokeRect(x-BW/2,bt,BW,bh)}
  })
  // Y axis
  ctx.fillStyle=C.muted;ctx.font='9px system-ui';ctx.textAlign='right'
  for(let p=Math.ceil(PN/gs)*gs;p<=PX;p+=gs){
    const y=py(p);if(y>MT+8&&y<MT+CH)ctx.fillText(p.toFixed(gs<1?2:0),ML-4,y+3)
  }
  // Current price
  const last=vis[vis.length-1]
  if(last){
    const py2=py(last.close)
    ctx.strokeStyle='rgba(255,255,255,.2)';ctx.lineWidth=1;ctx.setLineDash([2,3])
    ctx.beginPath();ctx.moveTo(ML,py2);ctx.lineTo(ML+CW,py2);ctx.stroke();ctx.setLineDash([])
    ctx.fillStyle=C.teal;ctx.beginPath();ctx.roundRect(ML+CW-1,py2-8,60,16,3);ctx.fill()
    ctx.fillStyle='#000';ctx.font='bold 9px system-ui';ctx.textAlign='left'
    ctx.fillText(last.close.toFixed(2),ML+CW+3,py2+4)
  }
  if(zoom!==1||safeOff>0){
    ctx.fillStyle='rgba(0,212,170,.7)';ctx.font='bold 9px system-ui';ctx.textAlign='left'
    ctx.fillText(zoom.toFixed(1)+'x · '+vis.length+' velas',ML+4,MT+14)
  }
  ctx.strokeStyle=C.border+'88';ctx.lineWidth=1;ctx.setLineDash([])
  ctx.strokeRect(ML,MT,CW,CH)
}

/* ─────────────── Chart zoom/pan container */
function ChartContainer({children,zoom,setZoom,offsetX,setOffsetX}){
  const ref=useRef(null)
  const drag=useRef({active:false,startX:0,startOff:0})
  const onWheel=useCallback(e=>{
    e.preventDefault()
    if(e.ctrlKey)setZoom(z=>+(Math.max(.3,Math.min(8,z-e.deltaY*.01))).toFixed(2))
    else setOffsetX(o=>Math.max(0,o+e.deltaY*.3))
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
    setOffsetX(Math.max(0,drag.current.startOff-( e.clientX-drag.current.startX)*.3))
  },[setOffsetX])
  const onMouseUp=useCallback(()=>{drag.current.active=false},[])
  useEffect(()=>{
    window.addEventListener('mousemove',onMouseMove)
    window.addEventListener('mouseup',onMouseUp)
    return()=>{window.removeEventListener('mousemove',onMouseMove);window.removeEventListener('mouseup',onMouseUp)}
  },[onMouseMove,onMouseUp])
  return(
    <div ref={ref} onMouseDown={onMouseDown}
      style={{flex:1,position:'relative',borderRadius:8,overflow:'hidden',cursor:'grab',minHeight:0}}>
      {children}
      <div style={{position:'absolute',top:6,right:6,display:'flex',gap:3,zIndex:2}}>
        {[{l:'+',f:()=>setZoom(z=>+(Math.min(8,z+.3)).toFixed(1))},
          {l:'−',f:()=>setZoom(z=>+(Math.max(.3,z-.3)).toFixed(1))},
          {l:'◉',f:()=>{setZoom(1);setOffsetX(0)}}].map(({l,f})=>(
          <button key={l} onClick={f}
            style={{background:'rgba(22,27,34,.85)',border:`1px solid ${C.border}`,
              color:C.muted,width:22,height:22,borderRadius:4,cursor:'pointer',fontSize:12,
              display:'flex',alignItems:'center',justifyContent:'center'}}>{l}</button>
        ))}
      </div>
    </div>
  )
}

/* ─────────────── AI Analysis Panel */
function AIAnalysisPanel({symbol, onZonesDetected, onActivate, onReset}){
  const [status,setStatus]=useState('idle')
  const [text,setText]=useState('')
  const [dots,setDots]=useState(0)
  const scrollRef=useRef(null)
  const readerRef=useRef(null)

  useEffect(()=>{
    if(status!=='loading')return
    const id=setInterval(()=>setDots(d=>(d+1)%4),350)
    return()=>clearInterval(id)
  },[status])

  useEffect(()=>{
    if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight
  },[text])

  // Parse **bold** text — NO regex, split on literal **
  const bold = (txt) => {
    if(!txt||txt.indexOf('**')===-1) return txt
    const parts = txt.split('**')
    return parts.map((s,j) =>
      j%2===1
        ? React.createElement('strong',{key:j,style:{color:C.teal,fontWeight:700}},s)
        : s
    )
  }

  const sectionColMap = {
    '📅':'#f9ca24','📊':'#60a5fa','🎯':'#00d4aa',
    '📈':'#3fb950','📉':'#ff6b6b','⏰':'#a78bfa',
    '💡':'#f9ca24','❌':'#ff6b6b','🔍':'#a78bfa'
  }

  const renderText = (raw) => {
    if(!raw) return null
    return raw.split('\n').map((line, i) => {
      if(!line.trim()) return React.createElement('div',{key:i,style:{height:5}})
      // Hide raw JSON/code
      if(line.startsWith('ZONAS_IA:')||line.startsWith('```')||line.startsWith('...')) return null
      // Section headers ## 
      if(line.startsWith('## ')){
        const text2 = line.slice(3)
        const ck = Object.keys(sectionColMap).find(k=>text2.indexOf(k)!==-1)
        const col = ck ? sectionColMap[ck] : C.teal
        return React.createElement('div',{key:i,style:{color:col,fontWeight:700,fontSize:12,
          marginTop:14,marginBottom:5,paddingBottom:4,letterSpacing:'.02em',
          borderBottom:'1px solid '+col+'33'}},text2)
      }
      // ### headings and Escenario
      if(line.startsWith('#')||(line.indexOf('Escenario 1')===0)||(line.indexOf('Escenario 2')===0)){
        let text2 = line
        while(text2.startsWith('#')) text2=text2.slice(1)
        text2=text2.trimStart()
        return React.createElement('div',{key:i,style:{color:C.yellow,fontWeight:700,fontSize:11.5,marginTop:8,
          background:'rgba(249,202,36,.06)',padding:'3px 8px',borderRadius:4,
          borderLeft:'3px solid '+C.yellow}},text2)
      }
      // Bullets
      const isBullet = line.startsWith('- ')||line.startsWith('• ')||line.startsWith('› ')||
                       line.startsWith('  - ')||line.startsWith('  • ')||line.startsWith('  › ')||
                       line.startsWith('›- ')
      if(isBullet){
        let clean = line
        ;['  › ','  - ','  • ','›- ','› ','- ','• '].forEach(p=>{ if(clean.startsWith(p)) clean=clean.slice(p.length) })
        const indent = line.startsWith('  ') ? 20 : 10
        return React.createElement('div',{key:i,style:{color:C.text,fontSize:11,lineHeight:1.65,
          paddingLeft:indent,position:'relative',marginTop:2}},
          React.createElement('span',{style:{color:C.teal,position:'absolute',left:indent-8}},'›'),
          bold(clean)
        )
      }
      // Emoji lines
      if(line.startsWith('❌')) return React.createElement('div',{key:i,style:{color:C.red,fontSize:11,lineHeight:1.65,fontWeight:600,marginTop:2}},bold(line))
      if(line.startsWith('✅')) return React.createElement('div',{key:i,style:{color:C.green,fontSize:11,lineHeight:1.65,fontWeight:600,marginTop:2}},bold(line))
      if(line.startsWith('⚠️')) return React.createElement('div',{key:i,style:{color:C.yellow,fontSize:11,lineHeight:1.65,fontWeight:600,marginTop:2}},line)
      return React.createElement('div',{key:i,style:{color:C.text,fontSize:11,lineHeight:1.65}},bold(line))
    }).filter(Boolean)
  }

  const activateAI = useCallback(async()=>{
    if(status==='loading'||status==='streaming')return
    setStatus('loading');setText('');onZonesDetected(null)
    try{
      const resp = await fetch(`${API_URL}/api/ai/analyze-chart`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({symbol})
      })
      if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.error||`Error ${resp.status}`)}
      setStatus('streaming');onActivate()
      const reader=resp.body.getReader();readerRef.current=reader
      const dec=new TextDecoder();let full='';let buf=''
      while(true){
        const {done,value}=await reader.read();if(done)break
        buf+=dec.decode(value,{stream:true})
        const lines=buf.split('\n');buf=lines.pop()
        for(const ln of lines){
          if(!ln.startsWith('data: '))continue
          try{
            const ev=JSON.parse(ln.slice(6))
            if(ev.type==='text'){full+=ev.text;setText(full)}
            if(ev.type==='done'){
              // Parse ZONAS_IA
              const zi=full.indexOf('ZONAS_IA:')
              if(zi!==-1){
                let depth=0,si=zi+9,ei=-1
                for(let k=si;k<full.length;k++){
                  if(full[k]==='{')depth++
                  else if(full[k]==='}'){depth--;if(depth===0){ei=k+1;break}}
                }
                if(ei>si){
                  try{
                    const parsed=JSON.parse(full.slice(si,ei))
                    // Validate trade direction
                    if(parsed.trade){
                      const t=parsed.trade
                      const isBuy=t.side==='BUY'
                      const eN=parseFloat(t.entry),sN=parseFloat(t.sl),tp1N=parseFloat(t.tp1)
                      if(isBuy&&sN>=eN) t.sl=+(eN-(Math.abs(tp1N-eN)*0.6)).toFixed(2)
                      if(!isBuy&&sN<=eN) t.sl=+(eN+(Math.abs(tp1N-eN)*0.6)).toFixed(2)
                      if(isBuy&&tp1N<=eN) t.tp1=+(eN+(Math.abs(eN-parseFloat(t.sl))*1.5)).toFixed(2)
                      if(!isBuy&&tp1N>=eN) t.tp1=+(eN-(Math.abs(eN-parseFloat(t.sl))*1.5)).toFixed(2)
                      // Fix TP2 direction — CRITICAL: tp2 must be beyond tp1 in same direction
                      if(t.tp2){
                        const tp2N=parseFloat(t.tp2)
                        const tp1Fixed=parseFloat(t.tp1)
                        if(isBuy&&tp2N<=tp1Fixed) t.tp2=+(tp1Fixed+(Math.abs(tp1Fixed-eN)*0.8)).toFixed(2)
                        if(!isBuy&&tp2N>=tp1Fixed) t.tp2=+(tp1Fixed-(Math.abs(tp1Fixed-eN)*0.8)).toFixed(2)
                      }
                      // Min SL distance 0.3% of price
                      const slDist=Math.abs(parseFloat(t.sl)-eN)
                      const minSL=eN*0.003
                      if(slDist<minSL) t.sl=isBuy?+(eN-minSL).toFixed(2):+(eN+minSL).toFixed(2)
                    }
                    onZonesDetected(parsed)
                  }catch(e2){console.warn('ZONAS_IA parse',e2)}
                }
              }
              setStatus('done');return
            }
            if(ev.type==='error')throw new Error(ev.message)
          }catch{}
        }
      }
      setStatus('done')
    }catch(err){setStatus('error');setText('⚠️ '+err.message)}
  },[symbol,status,onZonesDetected,onActivate])

  const stop=useCallback(()=>{try{readerRef.current?.cancel()}catch{};setStatus('idle')},[])
  const reset=useCallback(()=>{try{readerRef.current?.cancel()}catch{};setStatus('idle');setText('');onZonesDetected(null);onReset?.()},[onZonesDetected,onReset])

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',
        background:C.bg1,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,
          background:status==='idle'?C.muted:status==='done'?C.green:status==='error'?C.red:C.teal,
          boxShadow:(status==='loading'||status==='streaming')?`0 0 8px ${C.teal}`:'none',transition:'all .3s'}}/>
        <span style={{fontWeight:700,fontSize:12,color:C.text}}>🧠 IA Institucional SMC</span>
        {status!=='idle'&&<span style={{fontSize:10,color:C.muted}}>
          {status==='loading'?'Analizando'+'...'.slice(0,dots+1):status==='streaming'?'Escribiendo...':status==='done'?'✓ Listo':'Error'}
        </span>}
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          {(status==='loading'||status==='streaming')&&(
            <button onClick={stop} style={{background:'rgba(255,107,107,.12)',border:`1px solid ${C.red}44`,
              color:C.red,borderRadius:5,padding:'2px 9px',fontSize:10,fontWeight:700,cursor:'pointer'}}>■ Stop</button>
          )}
          {(status==='done'||status==='error')&&(
            <button onClick={reset} style={{background:C.bg3,border:`1px solid ${C.border}`,
              color:C.muted,borderRadius:5,padding:'2px 9px',fontSize:10,cursor:'pointer'}}>↺</button>
          )}
        </div>
      </div>
      {/* Content */}
      {status==='idle'?(
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,padding:'20px 16px'}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:8}}>🧠</div>
            <div style={{fontWeight:800,fontSize:14,color:C.text,marginBottom:6}}>Análisis Institucional SMC</div>
            <div style={{fontSize:11,color:C.muted,lineHeight:1.7,maxWidth:260}}>
              La IA analiza el mercado en tiempo real con contexto institucional: flujo de dinero, zonas de liquidez, OB, FVG, escenarios y entradas.
            </div>
          </div>
          <button onClick={activateAI}
            style={{background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',border:`2px solid ${C.teal}`,
              color:C.teal,borderRadius:10,padding:'12px 28px',fontSize:14,fontWeight:800,cursor:'pointer',
              boxShadow:`0 0 20px ${C.teal}22`}}>⚡ Activar IA</button>
          <div style={{display:'flex',flexDirection:'column',gap:4,width:'100%',maxWidth:260}}>
            {['📅 Sesgo del día y timing','📊 Flujo institucional','📈 Escenario 1 (más probable)','📉 Escenario 2 (alternativo)','⏰ Plan de trading institucional','💡 Entrada inteligente SMC'].map(t=>(
              <div key={t} style={{fontSize:10,color:C.muted,background:C.bg2,borderRadius:4,padding:'3px 8px',border:`1px solid ${C.border}`}}>{t}</div>
            ))}
          </div>
        </div>
      ):(
        <div ref={scrollRef} style={{flex:1,overflowY:'auto',padding:'10px 12px',scrollbarWidth:'thin',scrollbarColor:`${C.border} transparent`}}>
          {status==='loading'&&!text&&(
            <div style={{display:'flex',flexDirection:'column',gap:8,padding:8}}>
              {['Leyendo estructura del mercado','Detectando order blocks y FVGs','Analizando liquidez y flujo','Construyendo escenarios','Calculando entradas'].map((t,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:10,opacity:i<=dots?1:0.3,transition:'opacity .3s'}}>
                  <div style={{width:6,height:6,borderRadius:'50%',flexShrink:0,
                    background:i<=dots?C.teal:C.border,transition:'all .3s'}}/>
                  <span style={{fontSize:11,color:i<=dots?C.text:C.muted}}>{t}</span>
                </div>
              ))}
            </div>
          )}
          {text&&renderText(text)}
          {status==='streaming'&&(
            <span style={{display:'inline-block',width:2,height:14,background:C.teal,
              animation:'pulse .7s ease-in-out infinite',marginLeft:2,verticalAlign:'middle',borderRadius:1}}/>
          )}
        </div>
      )}
      {status==='done'&&(
        <div style={{padding:'8px 12px',borderTop:`1px solid ${C.border}`,flexShrink:0}}>
          <button onClick={activateAI}
            style={{width:'100%',background:'rgba(0,212,170,.06)',border:`1px solid ${C.tealDark}44`,
              color:C.teal,borderRadius:6,padding:'7px',fontSize:11,fontWeight:700,cursor:'pointer'}}>
            🔄 Re-analizar mercado
          </button>
        </div>
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════
   M1 MONITOR — Confirmación de entrada en tiempo real
   Detecta CHoCH/BOS en M1 y lanza alerta cuando hay pullback
   ═══════════════════════════════════════════════════════════════ */
function M1Monitor({ symbol, aiZones, active, onEntryAlert, pos, setPos, hidden, setHidden }) {
  const [m1Data, setM1Data] = useState(null)
  const [phase, setPhase] = useState('waiting') // waiting | zone_reached | choch_detected | bos_detected | pullback | ENTER
  const [lastAlert, setLastAlert] = useState(null)
  const intervalRef = useRef(null)

  const pollM1 = useCallback(async () => {
    if (!active || !aiZones?.trade) return
    try {
      const r = await fetch(`${API_URL}/api/m1/status/${symbol}`)
      const d = await r.json()
      if (!d.ready) return
      setM1Data(d)

      const tr = aiZones.trade
      const price = d.price
      const entry = parseFloat(tr.entry)
      const isBuy = tr.side === 'BUY'
      const zoneRange = Math.abs(parseFloat(tr.tp1) - entry) * 0.08 // 8% of trade range

      // Phase detection
      const inZone = Math.abs(price - entry) < zoneRange
      const choch = d.chochM1
      const bos = d.bosM1
      const hasConfirmation = (isBuy && (choch?.type === 'BULLISH_CHOCH_M1' || bos?.side === 'BUY')) ||
                              (!isBuy && (choch?.type === 'BEARISH_CHOCH_M1' || bos?.side === 'SELL'))

      if (inZone && hasConfirmation) {
        const confirmType = bos ? 'BOS M1' : 'CHoCH M1'
        const newPhase = 'ENTER'
        if (phase !== 'ENTER') {
          setPhase('ENTER')
          const alert = {
            type: 'ENTRY',
            side: tr.side,
            price: entry,
            confirm: confirmType,
            sl: tr.sl,
            tp1: tr.tp1,
            tp2: tr.tp2,
            msg: `🎯 ENTRADA CONFIRMADA — ${tr.side} @ ${entry}
${confirmType} detectado en M1
SL: ${tr.sl} | TP1: ${tr.tp1}`,
            ts: Date.now()
          }
          setLastAlert(alert)
          onEntryAlert(alert)
        }
      } else if (inZone && !hasConfirmation) {
        setPhase('zone_reached')
      } else if (hasConfirmation && !inZone) {
        setPhase(bos ? 'bos_detected' : 'choch_detected')
      } else {
        setPhase('waiting')
      }
    } catch(e) {}
  }, [active, aiZones, symbol, phase, onEntryAlert])

  useEffect(() => {
    if (!active || !aiZones?.trade) { setPhase('waiting'); setM1Data(null); return }
    pollM1()
    intervalRef.current = setInterval(pollM1, 3000) // poll every 3s
    return () => clearInterval(intervalRef.current)
  }, [active, aiZones, symbol, pollM1])

  if (!active || !aiZones?.trade) return null

  const tr = aiZones.trade
  const isBuy = tr.side === 'BUY'
  const tradeCol = isBuy ? '#2ed573' : '#ff4757'

  const phaseInfo = {
    waiting:       { icon: '⏳', text: 'Esperando que el precio llegue a la zona', col: '#7d8590' },
    zone_reached:  { icon: '🎯', text: 'Precio en ZONA — Esperando CHoCH/BOS en M1', col: '#f9ca24', pulse: true },
    choch_detected:{ icon: '🔄', text: 'CHoCH M1 detectado — Esperando pullback', col: '#60a5fa', pulse: true },
    bos_detected:  { icon: '💥', text: 'BOS M1 detectado — Esperando pullback', col: '#a78bfa', pulse: true },
    pullback:      { icon: '↩️', text: 'Pullback detectado — Posicionarse', col: '#fb923c', pulse: true },
    ENTER:         { icon: '⚡', text: 'ENTRADA CONFIRMADA', col: tradeCol, pulse: true, glow: true },
  }

  const info = phaseInfo[phase] || phaseInfo.waiting

  if (hidden) return (
    <button onClick={()=>setHidden(false)}
      style={{position:'absolute',bottom:8,right:8,zIndex:25,
        background:'rgba(13,17,23,.92)',border:`2px solid ${tradeCol}`,
        borderRadius:6,padding:'4px 10px',cursor:'pointer',
        color:tradeCol,fontSize:11,fontWeight:700}}>
      📡 M1 Monitor
    </button>
  )

  return (
    <div style={{
      position: 'absolute',
      top: pos?.y ?? 44, left: pos?.x ?? 8,
      zIndex: 25,
      background: 'rgba(13,17,23,.97)',
      border: `2px solid ${info.col}`,
      borderRadius: 10, minWidth: 230, maxWidth: 280,
      boxShadow: info.glow ? `0 0 24px ${info.col}55` : `0 4px 16px rgba(0,0,0,.5)`,
      cursor: 'grab', userSelect: 'none',
      transition: 'border-color .3s, box-shadow .3s'
    }}
    onMouseDown={e=>{
      const sx=e.clientX-(pos?.x??8), sy=e.clientY-(pos?.y??44)
      const mv=ev=>setPos({x:ev.clientX-sx, y:ev.clientY-sy})
      const up=()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up)}
      window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up)
    }}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:7,padding:'8px 12px 6px',
        borderBottom:`1px solid ${info.col}33`,cursor:'grab'}}>
        <div style={{width:8,height:8,borderRadius:'50%',background:info.col,flexShrink:0,
          animation: info.pulse ? 'pulse 1s ease-in-out infinite' : 'none'}}/>
        <span style={{fontSize:9,color:'#7d8590'}}>⠿ MONITOR M1</span>
        <span style={{marginLeft:'auto',fontSize:10,fontWeight:700,color:tradeCol}}>
          {isBuy ? '▲ BUY' : '▼ SELL'} @ {tr.entry}
        </span>
        <button onClick={e=>{e.stopPropagation();setHidden(true)}}
          style={{background:'none',border:'none',color:'#7d8590',cursor:'pointer',
            fontSize:14,lineHeight:1,padding:'0 2px',marginLeft:4}}>×</button>
      </div>
      <div style={{padding:'8px 12px 10px'}}>

      {/* Phase status */}
      <div style={{
        background: info.col + '18', border: `1px solid ${info.col}44`,
        borderRadius: 6, padding: '6px 10px', marginBottom: 8
      }}>
        <div style={{fontSize:13,marginBottom:2}}>{info.icon}</div>
        <div style={{fontSize:11,fontWeight:700,color:info.col,lineHeight:1.4}}>{info.text}</div>
      </div>

      {/* M1 structure */}
      {m1Data && (
        <div style={{display:'flex',flexDirection:'column',gap:3}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:10}}>
            <span style={{color:'#7d8590'}}>Estructura M1</span>
            <span style={{fontWeight:700,color:m1Data.m1Structure==='BULLISH'?'#2ed573':m1Data.m1Structure==='BEARISH'?'#ff4757':'#7d8590'}}>
              {m1Data.m1Structure} {m1Data.m1Structure==='BULLISH'?'↑':m1Data.m1Structure==='BEARISH'?'↓':'·'}
            </span>
          </div>
          {m1Data.chochM1 && (
            <div style={{display:'flex',justifyContent:'space-between',fontSize:10}}>
              <span style={{color:'#7d8590'}}>CHoCH M1</span>
              <span style={{color:'#f9ca24',fontWeight:700}}>
                {m1Data.chochM1.type.includes('BULL') ? '↑ Alcista' : '↓ Bajista'} en {m1Data.chochM1.level}
              </span>
            </div>
          )}
          {m1Data.bosM1 && (
            <div style={{display:'flex',justifyContent:'space-between',fontSize:10}}>
              <span style={{color:'#7d8590'}}>BOS M1</span>
              <span style={{color:'#a78bfa',fontWeight:700}}>
                {m1Data.bosM1.side === 'BUY' ? '↑ Alcista' : '↓ Bajista'} en {m1Data.bosM1.level}
              </span>
            </div>
          )}
          <div style={{display:'flex',justifyContent:'space-between',fontSize:10}}>
            <span style={{color:'#7d8590'}}>Precio actual</span>
            <span style={{fontWeight:700,color:'#e6edf3'}}>{m1Data.price?.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Entry details when confirmed */}
      {phase === 'ENTER' && (
        <div style={{marginTop:8,borderTop:'1px solid #30363d',paddingTop:8}}>
          <div style={{fontSize:10,fontWeight:800,color:tradeCol,marginBottom:4}}>⚡ ENTRAR AHORA</div>
          {[{l:'Entry',v:tr.entry,c:tradeCol},{l:'SL',v:tr.sl,c:'#ff4757'},{l:'TP1',v:tr.tp1,c:'#2ed573'}].map(({l,v,c})=>(
            <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:11}}>
              <span style={{color:'#7d8590'}}>{l}</span>
              <span style={{fontWeight:700,color:c}}>{parseFloat(v).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Waiting instructions */}
      {phase === 'waiting' && (
        <div style={{marginTop:6,fontSize:9,color:'#7d8590',lineHeight:1.6,borderTop:'1px solid #30363d',paddingTop:6}}>
          Zona entrada: <strong style={{color:tradeCol}}>{tr.entry}</strong><br/>
          Confirmar: CHoCH o BOS en M1<br/>
          Luego pullback → entrada
        </div>
      )}
      </div>
    </div>
  )
}

/* ─────────────── Constants */
const ASSETS={
  stpRNG:{name:'Step Index',shortName:'Step',emoji:'📊',decimals:2},
  frxXAUUSD:{name:'Oro (XAU/USD)',shortName:'Oro',emoji:'🥇',decimals:2},
  '1HZ100V':{name:'Volatility 100',shortName:'V100',emoji:'🔥',decimals:2}
}
const TFS=['M1','M5','M15','H1']

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

/* ═══════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════════════════════ */
export default function Dashboard({user,subscription,onLogout}){
  const navigate=useNavigate()
  const canvasRef=useRef(null)
  const[symbol,setSymbol]=useState('frxXAUUSD')
  const[tf,setTF]=useState('M5')
  const[dash,setDash]=useState(null)
  const[analyze,setAnalyze]=useState(null)
  const[countdown,setCountdown]=useState(60)
  const[sidebarOpen,setSidebarOpen]=useState(true)
  const[zoom,setZoom]=useState(1)
  const[offsetX,setOffsetX]=useState(0)
  const[aiZones,setAiZones]=useState(null)
  const[aiActive,setAiActive]=useState(false)
  const[alerts,setAlerts]=useState([])
  const[tradeHit,setTradeHit]=useState(null)
  const[entryHit,setEntryHit]=useState(false)
  const[cardHidden,setCardHidden]=useState(false)
  const[cardPos,setCardPos]=useState({x:8,y:8})
  const[entryAlerts,setEntryAlerts]=useState([])  // M1 entry alerts
  const[m1MonitorActive,setM1MonitorActive]=useState(false) // M1 monitor running
  const[m1Pos,setM1Pos]=useState({x:8,y:44})    // M1 monitor position
  const[m1Hidden,setM1Hidden]=useState(false)    // M1 monitor hidden

  // Reset on symbol change
  useEffect(()=>{setAiZones(null);setAiActive(false);setTradeHit(null);setEntryHit(false);setAlerts([]);setCardHidden(false);setCardPos({x:8,y:8});setEntryAlerts([]);setM1MonitorActive(false);setM1Pos({x:8,y:44});setM1Hidden(false)},[symbol])

  const fetchDash=useCallback(async()=>{
    try{const r=await fetch(`${API_URL}/api/dashboard/${encodeURIComponent(user.email)}`);setDash(await r.json())}catch{}
  },[user.email])

  const fetchAnalyze=useCallback(async()=>{
    try{const r=await fetch(`${API_URL}/api/analyze/${symbol}`);setAnalyze(await r.json())}catch{}
  },[symbol])

  useEffect(()=>{
    fetchDash();fetchAnalyze()
    const id=setInterval(()=>{fetchAnalyze()},2000)
    const dashId=setInterval(()=>{fetchDash()},15000)
    return()=>{clearInterval(id);clearInterval(dashId)}
  },[fetchDash,fetchAnalyze])

  useEffect(()=>{let cd=60;const id=setInterval(()=>{cd--;if(cd<=0)cd=60;setCountdown(cd)},1000);return()=>clearInterval(id)},[])

  useEffect(()=>{
    const h=e=>{
      if(e.target.tagName==='INPUT')return
      if(e.key==='+'||e.key==='=')setZoom(z=>+(Math.min(8,z+.2)).toFixed(1))
      if(e.key==='-')setZoom(z=>+(Math.max(.3,z-.2)).toFixed(1))
      if(e.key==='0')setZoom(1)
      if(e.key==='ArrowLeft')setOffsetX(o=>o+8)
      if(e.key==='ArrowRight')setOffsetX(o=>Math.max(0,o-8))
    }
    window.addEventListener('keydown',h)
    return()=>window.removeEventListener('keydown',h)
  },[])

  // Alert detection
  useEffect(()=>{
    if(!analyze||!aiActive||!aiZones)return
    const price=analyze.price;if(!price)return
    const newAlerts=[]
    const choch=analyze.chartOverlays?.choch,bos=analyze.chartOverlays?.bos
    const chochM15=analyze.chartOverlays?.chochM15,bosM15=analyze.chartOverlays?.bosM15
    const rng=analyze.candles?.length>5?Math.abs(
      analyze.candles.slice(-10).reduce((mx,c)=>Math.max(mx,c.high),-Infinity)-
      analyze.candles.slice(-10).reduce((mn,c)=>Math.min(mn,c.low),Infinity)):10
    ;[{lvl:bos,tf:'M5',type:'BOS'},{lvl:choch,tf:'M5',type:'CHoCH'},
      {lvl:bosM15,tf:'M15',type:'BOS'},{lvl:chochM15,tf:'M15',type:'CHoCH'}].forEach(({lvl,tf:t,type})=>{
      if(!lvl?.level)return
      if(Math.abs(price-lvl.level)<rng*0.05){
        const side=type==='BOS'?lvl.side:lvl.type?.includes('BULLISH')?'BUY':'SELL'
        newAlerts.push({id:`${type}-${t}-${lvl.level}`,
          msg:`⚡ ${type} ${t}: ${side==='BUY'?'↑ ALCISTA':'↓ BAJISTA'} en ${lvl.level?.toFixed(2)}`,
          color:side==='BUY'?'#2ed573':'#ff4757',ts:Date.now()})
      }
    })
    // Scenario activation
    if(aiZones.scenarios){
      const {s1,s2}=aiZones.scenarios
      if(s1?.activation&&Math.abs(price-s1.activation)<0.5)
        newAlerts.push({id:'scenario-1',msg:'🟢 ESCENARIO 1 ACTIVADO — '+(s1.label||'')+' ('+(s1.probability||'?')+'%)',color:'#2ed573',ts:Date.now()})
      if(s2?.activation&&Math.abs(price-s2.activation)<0.5)
        newAlerts.push({id:'scenario-2',msg:'🟡 ESCENARIO 2 ACTIVADO — '+(s2.label||'')+' ('+(s2.probability||'?')+'%)',color:'#f9ca24',ts:Date.now()})
    }
    // Trade hit detection
    const tr=aiZones.trade
    if(tr?.entry){
      const eN=parseFloat(tr.entry),tp1N=parseFloat(tr.tp1),range=Math.abs(tp1N-eN)
      if(Math.abs(price-eN)<range*0.06){
        setEntryHit(true);setTradeHit('entry')
        newAlerts.push({id:'trade-entry',msg:'🎯 Precio en ZONA DE ENTRADA — Confirmar BOS/CHoCH en M1',color:'#f9ca24',ts:Date.now()})
      }
      if(entryHit){
        if(tr.tp1&&Math.abs(price-tp1N)<range*0.03){setTradeHit('tp1');newAlerts.push({id:'trade-tp1',msg:'✅ TP1 ALCANZADO — Asegurar parcial',color:'#2ed573',ts:Date.now()})}
        if(tr.tp2&&Math.abs(price-parseFloat(tr.tp2))<Math.abs(parseFloat(tr.tp2)-eN)*0.03){setTradeHit('tp2');newAlerts.push({id:'trade-tp2',msg:'🏆 TP2 ALCANZADO',color:'#00d4aa',ts:Date.now()})}
        if(Math.abs(price-parseFloat(tr.sl))<Math.abs(eN-parseFloat(tr.sl))*0.04){setTradeHit('sl');newAlerts.push({id:'trade-sl',msg:'⛔ STOP LOSS TOCADO — Salir',color:'#ff4757',ts:Date.now()})}
      }
    }
    if(newAlerts.length>0){
      setAlerts(prev=>{
        const existing=new Set(prev.map(a=>a.id))
        const fresh=newAlerts.filter(a=>!existing.has(a.id))
        return fresh.length?[...fresh,...prev].slice(0,5):prev
      })
    }
  },[analyze,aiActive,aiZones,symbol,entryHit])

  useEffect(()=>{
    if(!alerts.length)return
    const id=setTimeout(()=>setAlerts(p=>p.slice(1)),8000)
    return()=>clearTimeout(id)
  },[alerts])

  // Render chart
  const renderChart=useCallback(()=>{
    if(!analyze||!canvasRef.current)return
    const cKey=tf==='H1'?'candlesH1':tf==='M15'?'candlesM15':tf==='M1'?'candlesM1':'candles'
    const dKey=tf==='H1'?'demandZonesH1':tf==='M15'?'demandZonesM15':'demandZones'
    const sKey=tf==='H1'?'supplyZonesH1':tf==='M15'?'supplyZonesM15':'supplyZones'
    const candles=analyze[cKey];if(!candles?.length)return
    const isM1=tf==='M1'
    const price=analyze.price||0
    const priceRange=price*0.008
    const demAll=analyze[dKey]||[],supAll=analyze[sKey]||[]
    const demZ=aiActive?(isM1?demAll.filter(z=>!z.mitigated&&Math.abs((z.high+z.low)/2-price)<priceRange):demAll):[]
    const supZ=aiActive?(isM1?supAll.filter(z=>!z.mitigated&&Math.abs((z.high+z.low)/2-price)<priceRange):supAll):[]
    drawChart(canvasRef.current,{
      candles,
      demandZones:demZ,
      supplyZones:supZ,
      fvgZones:aiActive&&(tf==='M5'||isM1)?(analyze.fvgZones||[]):[],
      liquidityLevels:aiActive&&(tf==='M5'||isM1)?(analyze.liquidityLevels||[]):[],
      aiZones:aiActive?aiZones:null,
      choch:aiActive?analyze.chartOverlays?.choch:null,
      bos:aiActive?analyze.chartOverlays?.bos:null,
      chochM15:aiActive?analyze.chartOverlays?.chochM15:null,
      bosM15:aiActive?analyze.chartOverlays?.bosM15:null,
      structure:aiActive?(analyze.structureM5Data||{}):{},
      zoom,offsetX,
      premiumDiscount:aiActive?(analyze.premiumDiscount||'EQUILIBRIUM'):'EQUILIBRIUM',
      isM1
    })
  },[analyze,tf,zoom,offsetX,aiZones,aiActive])

  useEffect(()=>{renderChart()},[renderChart])
  useEffect(()=>{
    const obs=new ResizeObserver(()=>setTimeout(renderChart,40))
    if(canvasRef.current?.parentElement)obs.observe(canvasRef.current.parentElement)
    return()=>obs.disconnect()
  },[renderChart])

  const assetData=dash?.assets?.find(a=>a.symbol===symbol)
  const stats=dash?.stats||{total:0,wins:0,losses:0,pending:0}
  const wr=stats.total>0?Math.round(stats.wins/stats.total*100):0
  const plan=subscription?.plan||user?.plan||'free'
  const dec=ASSETS[symbol]?.decimals||2

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100dvh',background:C.bg0,overflow:'hidden'}}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes slideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        .btn-g{background:none;border:1px solid transparent;color:${C.muted};border-radius:5px;cursor:pointer;transition:all .15s;padding:3px 9px;font-size:11px}
        .btn-g:hover{background:${C.bg3};border-color:${C.border};color:${C.text}}
        .btn-g.act{background:${C.tealBg};border-color:${C.tealDark};color:${C.teal}}
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
      `}</style>

      {/* HEADER */}
      <header style={{background:C.bg1,borderBottom:`1px solid ${C.border}`,padding:'5px 12px',
        display:'flex',alignItems:'center',gap:8,flexShrink:0,flexWrap:'wrap',minHeight:46}}>
        <button onClick={()=>setSidebarOpen(o=>!o)}
          style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:17,padding:'0 3px'}}>☰</button>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:27,height:27,borderRadius:5,background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',
            border:`1px solid ${C.teal}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}}>📊</div>
          <span style={{fontWeight:800,fontSize:13,color:C.teal}}>TradingPro</span>
        </div>
        <span style={{background:'rgba(167,139,250,.1)',color:C.purple,fontSize:10,fontWeight:700,
          padding:'2px 7px',borderRadius:20,border:`1px solid ${C.purple}66`}}>🧠 IA SMC</span>
        <div style={{display:'flex',gap:3,marginLeft:'auto',overflowX:'auto'}}>
          {TFS.map(t=>(
            <button key={t} className={`btn-g${tf===t?' act':''}`} onClick={()=>setTF(t)}>{t}</button>
          ))}
        </div>
        <span style={{background:'linear-gradient(135deg,#0d4f3c,#1a6b52)',color:C.teal,
          fontSize:11,fontWeight:800,padding:'3px 8px',border:`1px solid ${C.teal}`,borderRadius:5}}>
          ✓ {plan.toUpperCase()}
        </span>
        {user.isAdmin&&<button onClick={()=>navigate('/admin')} className="btn-g">Admin</button>}
        <button onClick={onLogout} className="btn-g">Salir</button>
      </header>

      {/* BODY */}
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {/* SIDEBAR */}
        <aside style={{width:sidebarOpen?'clamp(138px,18vw,174px)':'0',minWidth:sidebarOpen?'clamp(138px,18vw,174px)':'0',
          overflow:'hidden',background:C.bg1,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',
          flexShrink:0,transition:'width .2s,min-width .2s'}}>
          <div style={{padding:'7px 10px',fontSize:10,fontWeight:600,color:C.muted,letterSpacing:'.05em',marginTop:6}}>MERCADOS</div>
          {Object.entries(ASSETS).map(([sym,cfg])=>{
            const ad=dash?.assets?.find(a=>a.symbol===sym)
            const isAct=sym===symbol
            const trend=ad?.structureM5||'LOADING'
            const tc=trend==='BULLISH'?C.teal:trend==='BEARISH'?C.red:C.muted
            return(
              <div key={sym} onClick={()=>setSymbol(sym)}
                style={{display:'flex',alignItems:'center',gap:7,padding:'7px 10px',fontSize:11,cursor:'pointer',
                  borderRadius:6,margin:'1px 5px',background:isAct?C.bg3:'transparent',
                  border:`1px solid ${isAct?C.border:'transparent'}`}}>
                <div style={{width:25,height:25,borderRadius:5,background:isAct?'#1a3a2a':C.bg2,
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0}}>{cfg.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,color:C.text,fontSize:11}}>{cfg.shortName}</div>
                  <div style={{fontSize:9,color:tc,fontWeight:700}}>{trend}</div>
                </div>
              </div>
            )
          })}
        </aside>

        {/* MAIN */}
        <main style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>
          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,padding:'6px 10px',
            borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            <StatCard label="WIN RATE" value={wr+'%'} sub={stats.total>0?`${stats.total} ops`:'Sin ops'} color={C.teal}/>
            <StatCard label="ACTIVAS" value={stats.pending||0} sub="En curso" color={C.teal}/>
            <StatCard label="WINS" value={stats.wins||0} sub="Ganadoras" color={C.green}/>
            <StatCard label="LOSS" value={stats.losses||0} sub="Pérdidas" color={C.red}/>
          </div>

          {/* Chart + Panel */}
          <div style={{flex:1,display:'flex',overflow:'hidden'}}>
            {/* Left: chart */}
            <div style={{flex:1,display:'flex',flexDirection:'column',padding:'6px 6px 6px 10px',gap:5,overflow:'hidden',minWidth:0}}>
              {/* Asset bar */}
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',flexShrink:0}}>
                <span style={{fontSize:18}}>{ASSETS[symbol]?.emoji}</span>
                <span style={{fontWeight:700,fontSize:13,color:C.text}}>{ASSETS[symbol]?.name}</span>
                <StructTag label="M5" trend={assetData?.structureM5}/>
                <StructTag label="M15" trend={assetData?.structureM15}/>
                <StructTag label="H1" trend={assetData?.structureH1}/>
                {assetData?.mtfConfluence&&<span style={{fontSize:10,fontWeight:700,color:C.teal,background:'rgba(0,212,170,.08)',padding:'2px 7px',borderRadius:4,border:`1px solid ${C.teal}44`}}>★ MTF</span>}
                {analyze?.premiumDiscount&&analyze.premiumDiscount!=='EQUILIBRIUM'&&(
                  <span style={{fontSize:10,fontWeight:700,color:analyze.premiumDiscount==='PREMIUM'?C.red:C.green,
                    background:analyze.premiumDiscount==='PREMIUM'?'rgba(255,107,107,.1)':'rgba(63,185,80,.1)',
                    padding:'2px 7px',borderRadius:4}}>
                    {analyze.premiumDiscount==='PREMIUM'?'⬆ PREMIUM':'⬇ DISCOUNT'}
                  </span>
                )}
                {aiActive&&<span style={{fontSize:10,fontWeight:700,color:C.purple,background:'rgba(167,139,250,.1)',padding:'2px 7px',borderRadius:4,border:`1px solid ${C.purple}44`}}>🧠 IA activa</span>}
                <div style={{marginLeft:'auto',textAlign:'right'}}>
                  <div style={{fontSize:20,fontWeight:800,color:C.text,fontVariantNumeric:'tabular-nums'}}>
                    {analyze?.price?.toFixed(dec)||assetData?.price?.toFixed(dec)||'···'}
                  </div>
                  <div style={{fontSize:9,color:C.muted}}>{tf} · {(tf==='M5'?analyze?.candles:tf==='H1'?analyze?.candlesH1:tf==='M15'?analyze?.candlesM15:analyze?.candlesM1)?.length||0} velas</div>
                </div>
              </div>

              {/* Chart */}
              <ChartContainer zoom={zoom} setZoom={setZoom} offsetX={offsetX} setOffsetX={setOffsetX}>
                <canvas ref={canvasRef} style={{width:'100%',height:'100%',borderRadius:8,border:`1px solid ${C.border}`,display:'block'}}/>
                {!analyze&&(
                  <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:C.muted}}>
                    <div style={{textAlign:'center'}}><div style={{fontSize:22,marginBottom:8}}>⟳</div><div>Cargando datos...</div></div>
                  </div>
                )}
                {analyze&&!aiActive&&(
                  <div style={{position:'absolute',bottom:40,left:'50%',transform:'translateX(-50%)',
                    background:'rgba(13,17,23,.85)',border:`1px solid ${C.teal}44`,borderRadius:8,
                    padding:'8px 16px',display:'flex',alignItems:'center',gap:8,backdropFilter:'blur(4px)',pointerEvents:'none'}}>
                    <span style={{fontSize:14}}>🧠</span>
                    <span style={{fontSize:11,color:C.muted}}>Presiona <strong style={{color:C.teal}}>⚡ Activar IA</strong> para ver las zonas institucionales</span>
                  </div>
                )}
                {/* Alerts */}
                {/* Entry alerts from M1 monitor */}
                {entryAlerts.length>0&&(
                  <div style={{position:'absolute',top:8,left:'50%',transform:'translateX(-50%)',
                    display:'flex',flexDirection:'column',gap:4,zIndex:30,pointerEvents:'none',minWidth:340}}>
                    {entryAlerts.slice(0,2).map((a,i)=>(
                      <div key={i} style={{background:'rgba(13,17,23,.98)',
                        border:`3px solid ${a.side==='BUY'?'#2ed573':'#ff4757'}`,
                        borderRadius:10,padding:'10px 16px',
                        boxShadow:`0 0 30px ${a.side==='BUY'?'#2ed57355':'#ff475755'}`,
                        animation:'slideIn .3s ease'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{fontSize:20}}>{a.side==='BUY'?'▲':'▼'}</span>
                          <div>
                            <div style={{fontSize:13,fontWeight:800,color:a.side==='BUY'?'#2ed573':'#ff4757'}}>
                              ⚡ ENTRADA CONFIRMADA — {a.side}
                            </div>
                            <div style={{fontSize:11,color:'#e6edf3'}}>{a.confirm} en M1 | @ {a.price}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                                {alerts.length>0&&(
                  <div style={{position:'absolute',top:8,left:'50%',transform:'translateX(-50%)',
                    display:'flex',flexDirection:'column',gap:4,zIndex:10,pointerEvents:'none',minWidth:320,maxWidth:500}}>
                    {alerts.map(a=>(
                      <div key={a.id} style={{background:'rgba(13,17,23,.95)',border:`2px solid ${a.color}`,
                        borderRadius:8,padding:'7px 14px',display:'flex',alignItems:'center',gap:8,
                        boxShadow:`0 0 16px ${a.color}44`,animation:'slideIn .3s ease'}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:a.color,flexShrink:0,animation:'pulse 1s ease-in-out infinite'}}/>
                        <span style={{fontSize:12,fontWeight:700,color:a.color}}>{a.msg}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Trade card */}
                {aiActive&&aiZones?.trade&&!cardHidden&&(
                  <div style={{position:'absolute',top:cardPos.y,left:cardPos.x,
                    background:'rgba(13,17,23,.95)',border:`1px solid ${aiZones.trade.side==='BUY'?C.green:C.red}`,
                    borderRadius:8,zIndex:20,minWidth:165,boxShadow:'0 4px 20px rgba(0,0,0,.6)',cursor:'grab',userSelect:'none'}}
                    onMouseDown={e=>{
                      const sx=e.clientX-cardPos.x,sy=e.clientY-cardPos.y
                      const mv=ev=>setCardPos({x:ev.clientX-sx,y:ev.clientY-sy})
                      const up=()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up)}
                      window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up)
                    }}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'5px 8px 3px',borderBottom:'1px solid #30363d33'}}>
                      <div style={{display:'flex',alignItems:'center',gap:5}}>
                        <span style={{fontSize:9,color:C.muted}}>⠿</span>
                        <span style={{fontSize:10,color:C.muted,fontWeight:600}}>Trade IA</span>
                        <div style={{display:'flex',gap:2,marginLeft:4}}>
                          {['entry','tp1','tp2'].map((s,i)=>(
                            <div key={s} style={{width:6,height:6,borderRadius:'50%',transition:'background .3s',
                              background:(s==='entry'&&entryHit)||(s==='tp1'&&(tradeHit==='tp1'||tradeHit==='tp2'))||(s==='tp2'&&tradeHit==='tp2')?C.green:C.bg3}}/>
                          ))}
                        </div>
                      </div>
                      <button onClick={e=>{e.stopPropagation();setCardHidden(true)}}
                        style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:14,lineHeight:1,padding:'0 2px'}}>×</button>
                    </div>
                    <div style={{padding:'5px 10px 8px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                        <span style={{fontSize:16}}>{aiZones.trade.side==='BUY'?'▲':'▼'}</span>
                        <span style={{fontWeight:800,fontSize:13,color:aiZones.trade.side==='BUY'?C.green:C.red}}>
                          {aiZones.trade.side} — IA
                        </span>
                        {tradeHit&&<span style={{fontSize:10,fontWeight:700,padding:'1px 5px',borderRadius:3,background:'rgba(0,0,0,.4)',
                          color:tradeHit==='sl'?C.red:tradeHit==='entry'?C.yellow:C.green}}>{tradeHit.toUpperCase()} ⚡</span>}
                      </div>
                      {[{l:'Entrada',v:aiZones.trade.entry,c:C.yellow},{l:'SL',v:aiZones.trade.sl,c:C.red},{l:'TP1',v:aiZones.trade.tp1,c:C.green},
                        aiZones.trade.tp2&&{l:'TP2',v:aiZones.trade.tp2,c:'#00d4aa'}].filter(Boolean).map(({l,v,c})=>(
                        <div key={l} style={{display:'flex',justifyContent:'space-between',gap:12,marginBottom:2}}>
                          <span style={{fontSize:10,color:C.muted}}>{l}</span>
                          <span style={{fontSize:11,fontWeight:700,color:c,fontVariantNumeric:'tabular-nums'}}>{parseFloat(v)?.toFixed(dec)}</span>
                        </div>
                      ))}
                      {aiZones.trade.tp1&&aiZones.trade.sl&&aiZones.trade.entry&&(()=>{
                        const rr=Math.abs(parseFloat(aiZones.trade.tp1)-parseFloat(aiZones.trade.entry))/Math.abs(parseFloat(aiZones.trade.entry)-parseFloat(aiZones.trade.sl))
                        return(
                          <div style={{borderTop:'1px solid #30363d',marginTop:4,paddingTop:4,display:'flex',justifyContent:'space-between'}}>
                            <span style={{fontSize:9,color:C.muted}}>R:R</span>
                            <span style={{fontSize:10,fontWeight:800,color:rr>=1.5?C.green:C.yellow}}>1:{rr.toFixed(1)}</span>
                          </div>
                        )
                      })()}
                      {aiZones.trade.label&&<div style={{fontSize:9,color:C.muted,marginTop:4,borderTop:'1px solid #30363d',paddingTop:3}}>{aiZones.trade.label}</div>}
                    </div>
                  </div>
                )}
                <M1Monitor
                  symbol={symbol}
                  aiZones={aiZones}
                  active={m1MonitorActive&&aiActive}
                  pos={m1Pos}
                  setPos={setM1Pos}
                  hidden={m1Hidden}
                  setHidden={setM1Hidden}
                  onEntryAlert={alert=>{
                    setEntryAlerts(prev=>[alert,...prev].slice(0,3))
                    setAlerts(prev=>[{
                      id:'m1-entry-'+Date.now(),
                      msg:alert.side==='BUY'?'⚡ M1 CONFIRMADO — ENTRADA BUY LISTA':'⚡ M1 CONFIRMADO — ENTRADA SELL LISTA',
                      color:alert.side==='BUY'?'#2ed573':'#ff4757',
                      ts:Date.now()
                    },...prev].slice(0,5))
                  }}
                />
                {/* Show card button when hidden */}}
                {aiActive&&aiZones?.trade&&cardHidden&&(
                  <button onClick={()=>setCardHidden(false)}
                    style={{position:'absolute',top:8,right:8,zIndex:20,background:'rgba(13,17,23,.92)',
                      border:`1px solid ${aiZones.trade.side==='BUY'?C.green:C.red}`,
                      borderRadius:6,padding:'4px 10px',cursor:'pointer',
                      color:aiZones.trade.side==='BUY'?C.green:C.red,fontSize:11,fontWeight:700}}>
                    {aiZones.trade.side==='BUY'?'▲':'▼'} Trade IA
                  </button>
                )}
              </ChartContainer>

              {/* Legend */}
              {aiActive&&(
                <div style={{display:'flex',gap:8,flexShrink:0,flexWrap:'wrap',padding:'2px 0',alignItems:'center'}}>
                  {[{col:C.green,l:'OB Demanda'},{col:C.red,l:'OB Oferta'},{col:C.blue,l:'FVG Alcista'},
                    {col:C.orange,l:'FVG Bajista'},{col:'rgba(255,107,107,.7)',l:'BSL'},{col:'rgba(63,185,80,.7)',l:'SSL'}].map(({col,l})=>(
                    <div key={l} style={{display:'flex',alignItems:'center',gap:4}}>
                      <div style={{width:8,height:8,borderRadius:2,background:col+'44',border:`1px solid ${col}`}}/>
                      <span style={{fontSize:9,color:C.muted}}>{l}</span>
                    </div>
                  ))}
                  {aiZones?.trade&&(
                    <div style={{display:'flex',alignItems:'center',gap:4,background:'rgba(249,202,36,.08)',borderRadius:4,padding:'2px 6px',border:'1px solid rgba(249,202,36,.3)'}}>
                      <div style={{width:8,height:8,borderRadius:'50%',background:C.yellow,boxShadow:`0 0 4px ${C.yellow}`}}/>
                      <span style={{fontSize:9,color:C.yellow,fontWeight:700}}>
                        {aiZones.trade.side==='BUY'?'▲ COMPRA':'▼ VENTA'} IA
                      </span>
                    </div>
                  )}
                  {tf==='M1'&&(
                    <div style={{display:'flex',alignItems:'center',gap:4,background:'rgba(0,212,170,.08)',borderRadius:4,padding:'2px 6px',border:`1px solid ${C.teal}44`}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:C.teal,animation:'pulse 1s ease-in-out infinite'}}/>
                      <span style={{fontSize:9,color:C.teal,fontWeight:700}}>M1 — Confirmación</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: AI Panel */}
            <div style={{width:340,minWidth:340,display:'flex',flexDirection:'column',borderLeft:`1px solid ${C.border}`,background:C.bg0,flexShrink:0}}>
              <AIAnalysisPanel
                symbol={symbol}
                onZonesDetected={setAiZones}
                onActivate={()=>{setAiActive(true);setM1MonitorActive(true)}}
                onReset={()=>{setAiActive(false);setTradeHit(null);setEntryHit(false);setAlerts([]);setCardHidden(false);setCardPos({x:8,y:8});setEntryAlerts([]);setM1MonitorActive(false);setM1Pos({x:8,y:44});setM1Hidden(false)}}
              />
            </div>
          </div>

          {/* Status bar */}
          <div style={{background:C.bg1,borderTop:`1px solid ${C.border}`,padding:'4px 12px',
            display:'flex',alignItems:'center',gap:8,flexShrink:0,flexWrap:'wrap'}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:C.teal,display:'inline-block'}}/>
            <span style={{fontSize:10,color:C.muted}}>Datos en vivo · actualiza cada</span>
            <span style={{fontSize:10,fontWeight:700,color:C.teal}}>{countdown}s</span>
            <span style={{fontSize:9,color:C.border,marginLeft:'auto'}}>+/− zoom · ← → pan</span>
            <span style={{fontSize:10,color:C.muted}}>{new Date().toLocaleTimeString('es',{hour12:false})}</span>
            <button onClick={()=>{fetchDash();fetchAnalyze()}} className="btn-g">↻</button>
          </div>
        </main>
      </div>
    </div>
  )
}
