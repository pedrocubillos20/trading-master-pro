import React, { useState, useEffect } from 'react'
import { API_URL } from './config/plans.js'

const C = { bg0:'#0d1117',bg1:'#161b22',bg2:'#1c2330',border:'#30363d',text:'#e6edf3',muted:'#7d8590',teal:'#00d4aa',tealDark:'#00b894',red:'#ff6b6b',green:'#3fb950',yellow:'#f9ca24' }

const MODELS = [
  { id:'MTF_CONFLUENCE', tier:'S', score:'95-100', color:C.teal,
    name:'MTF Confluence', emoji:'⭐',
    desc:'El modelo más potente. Requiere alineación H1+M15+M5 en la misma dirección y pullback a una zona de Order Block válida.',
    steps:['H1 define tendencia (BULLISH o BEARISH)','M15 confirma la dirección de H1','M5 detecta pullback al OB','Entrada con Stop Loss bajo el OB','TP1 1.5R · TP2 2.5R · TP3 4R'] },
  { id:'CHOCH_PULLBACK', tier:'A', score:'85-95', color:'#9b59b6',
    name:'CHoCH + Pullback', emoji:'🔄',
    desc:'Detecta un Change of Character (cambio de estructura) y espera el retroceso al Order Block que generó el cambio.',
    steps:['Estructura bajista hace un CHoCH alcista (o viceversa)','Se forma el OB en el impulso del CHoCH','Precio retrocede al OB','Vela de confirmación en el OB','Entrada en dirección del CHoCH'] },
  { id:'INDUCEMENT', tier:'A', score:'82-92', color:C.yellow,
    name:'Inducement / Sweep', emoji:'💧',
    desc:'El precio barre una zona de liquidez (equal highs o equal lows) y revierte de forma inmediata y agresiva.',
    steps:['Precio alcanza un máximo/mínimo obvio','Lo rompe tomando la liquidez (stops de traders retail)','Vela de reversión con mecha larga','H1+M15 confirman la dirección','Entrada en la reversión con SL detrás del sweep'] },
  { id:'BOS_CONTINUATION', tier:'B', score:'80-90', color:C.green,
    name:'BOS Continuación', emoji:'📈',
    desc:'Break of Structure de continuación. El precio rompe un nivel previo y retrocede al OB del impulso para continuar.',
    steps:['Tendencia establecida en H1+M15','Precio rompe nuevo máximo/mínimo (BOS)','Retrocede al OB del impulso que causó el BOS','Toca el OB con vela de rechazo','Continúa en dirección de la tendencia'] },
  { id:'OTE_ENTRY', tier:'A', score:'85-97', color:'#e67e22',
    name:'OTE (Fibonacci 62-79%)', emoji:'🎯',
    desc:'Optimal Trade Entry — entrada en la zona de retroceso óptima del 62% al 79% de Fibonacci del último impulso.',
    steps:['Identificar el último impulso impulsivo','Calcular zona OTE: 62%-79% del retroceso','CHoCH confirmado en el impulso','Precio entra en la zona OTE','Entrada con SL debajo del mínimo del impulso'] },
  { id:'LIQUIDITY_GRAB', tier:'B', score:'82-92', color:'#e74c3c',
    name:'Liquidity Grab', emoji:'⚡',
    desc:'Barrido rápido de liquidez seguido de reversión fuerte en la siguiente vela. H1+M15 deben confirmar la dirección.',
    steps:['Vela que rompe máximo/mínimo previo','Cierra dentro del rango (no confirma el quiebre)','Siguiente vela revierte con fuerza','H1+M15 en dirección contraria al sweep','Entrada en el cierre de la vela de reversión'] },
  { id:'BOOM_SPIKE', tier:'A', score:'70-90', color:C.teal,
    name:'Boom Spike (Solo COMPRA)', emoji:'🚀',
    desc:'Exclusivo para Boom 500/1000/300. Detecta zona de demanda en H1 con CHoCH/BOS y espera pullback para capturar el spike alcista.',
    steps:['H1 BULLISH o NEUTRAL (no BEARISH fuerte)','OB de demanda en H1 con CHoCH o BOS posterior','Precio retrocede al OB de H1','M5 confirma con estructura alcista o engulfing','Entrada con SL bajo el OB de H1'] },
  { id:'CRASH_SPIKE', tier:'A', score:'70-90', color:C.red,
    name:'Crash Spike (Solo VENTA)', emoji:'📉',
    desc:'Exclusivo para Crash 500/1000/300. Inverso del Boom Spike — detecta zona de supply en H1 y espera el spike bajista.',
    steps:['H1 BEARISH o NEUTRAL (no BULLISH fuerte)','OB de supply en H1 con CHoCH o BOS posterior','Precio retrocede al OB de H1','M5 confirma con estructura bajista o engulfing bajista','Entrada con SL sobre el OB de H1'] },
  { id:'M1_PRECISION', tier:'S', score:'82-97', color:C.teal,
    name:'M1 Precision', emoji:'🔬',
    desc:'Triple confluencia H1+M15+M5 + entrada precisa en M1. El modelo de mayor calidad, requiere todas las condiciones alineadas.',
    steps:['H1 define tendencia (fuerte)','M15 confirma y muestra zona de interés','M5 alineado con H1+M15','M1 muestra patrón de entrada: CHoCH, OB micro o wick','Entrada ultra-precisa con SL mínimo en estructura M1'] },
  { id:'FVG_ENTRY', tier:'B', score:'84-95', color:'#8e44ad',
    name:'Fair Value Gap', emoji:'📊',
    desc:'Entrada en un FVG (desequilibrio de precio / imbalance) durante un pullback alineado con H1+M15.',
    steps:['Identificar FVG: vela 1 high < vela 3 low (bullish) o vela 1 low > vela 3 high (bearish)','H1+M15 alineados con la dirección del FVG','Precio retrocede a llenar el FVG','Vela de rechazo dentro del FVG','Entrada con SL debajo/encima del FVG'] }
]

const CONCEPTS = [
  { title:'Order Block (OB)', icon:'📦', desc:'Última vela de dirección opuesta antes de un impulso fuerte. Para COMPRA: última vela ROJA antes del impulso alcista. Para VENTA: última vela VERDE antes del impulso bajista. Es donde el Smart Money dejó órdenes.' },
  { title:'CHoCH — Change of Character', icon:'🔄', desc:'Cambio de carácter. Cuando una tendencia bajista hace por primera vez un máximo más alto que el anterior (bullish CHoCH), o una tendencia alcista hace un mínimo más bajo (bearish CHoCH). Señal de posible reversión.' },
  { title:'BOS — Break of Structure', icon:'💥', desc:'Ruptura de estructura. El precio rompe el último swing high (BOS alcista) o swing low (BOS bajista). Confirma la continuación de la tendencia, no la reversión.' },
  { title:'HH / HL / LH / LL', icon:'📐', desc:'Higher High (máximo más alto), Higher Low (mínimo más alto), Lower High (máximo más bajo), Lower Low (mínimo más bajo). La secuencia HH+HL = tendencia alcista. LH+LL = tendencia bajista.' },
  { title:'Premium & Discount', icon:'💰', desc:'El rango entre el último swing high y swing low se divide en Premium (50-100%, zona cara) y Discount (0-50%, zona barata). En tendencia alcista se buscan COMPRAS en Discount. En bajista, VENTAS en Premium.' },
  { title:'Liquidity / Stop Hunt', icon:'💧', desc:'Zonas donde se concentran stops de traders retail: equal highs, equal lows, máximos y mínimos obvios. El Smart Money barre estas zonas para acumular/distribuir antes de moverse en la dirección real.' },
  { title:'Fair Value Gap (FVG)', icon:'🕳️', desc:'Desequilibrio de precio cuando una vela grande deja un gap entre la sombra de la vela 1 y la sombra de la vela 3. El precio tiende a volver a "llenar" estos gaps antes de continuar.' },
  { title:'Inducement', icon:'🎣', desc:'Trampa de liquidez deliberada. El precio se mueve hacia un nivel obvio de liquidez, lo barre, y revierte inmediatamente. Los traders que pusieron órdenes en esos niveles quedan atrapados.' }
]

export default function ModelosGuia({ user, onBack }) {
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('models')

  const TierBadge = ({tier}) => {
    const col = tier==='S'?C.teal:tier==='A'?C.yellow:C.green
    return <span style={{background:`${col}22`,color:col,border:`1px solid ${col}44`,padding:'1px 7px',borderRadius:4,fontSize:10,fontWeight:800}}>TIER {tier}</span>
  }

  return (
    <div style={{minHeight:'100vh',background:C.bg0,color:C.text}}>
      <div style={{background:C.bg1,borderBottom:`1px solid ${C.border}`,padding:'10px 20px',display:'flex',alignItems:'center',gap:12}}>
        <button onClick={onBack} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:13}}>← Volver</button>
        <span style={{fontWeight:800,fontSize:15,color:C.teal}}>📊 Guía de Modelos SMC</span>
        <span style={{color:C.muted,fontSize:12}}>10 modelos activos</span>
      </div>

      <div style={{maxWidth:1000,margin:'0 auto',padding:20}}>
        {/* Tabs */}
        <div style={{display:'flex',gap:4,marginBottom:20}}>
          {[['models','🎯 Modelos'],['concepts','📚 Conceptos SMC']].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{
              background:tab===k?'rgba(0,212,170,.1)':C.bg2,
              color:tab===k?C.teal:C.muted,
              border:`1px solid ${tab===k?C.teal:C.border}`,
              borderRadius:6,padding:'6px 16px',fontSize:12,cursor:'pointer',fontWeight:tab===k?700:400
            }}>{l}</button>
          ))}
        </div>

        {tab==='models' && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
            {MODELS.map(m=>(
              <div key={m.id} onClick={()=>setSelected(selected?.id===m.id?null:m)}
                style={{
                  background:C.bg1,border:`1px solid ${selected?.id===m.id?m.color:C.border}`,
                  borderRadius:10,padding:14,cursor:'pointer',transition:'border-color .15s',
                  boxShadow:selected?.id===m.id?`0 0 12px ${m.color}33`:undefined
                }}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <span style={{fontSize:20}}>{m.emoji}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.text}}>{m.name}</div>
                    <div style={{fontSize:10,color:C.muted}}>Score base: {m.score}pts</div>
                  </div>
                  <TierBadge tier={m.tier}/>
                </div>
                <p style={{fontSize:11,color:C.muted,lineHeight:1.5,margin:'0 0 8px'}}>{m.desc}</p>
                {selected?.id===m.id && (
                  <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                    <div style={{fontSize:11,fontWeight:700,color:m.color,marginBottom:6}}>Pasos de activación:</div>
                    {m.steps.map((s,i)=>(
                      <div key={i} style={{display:'flex',gap:8,marginBottom:5,fontSize:11,color:C.text}}>
                        <span style={{color:m.color,fontWeight:700,flexShrink:0}}>0{i+1}</span>
                        <span style={{lineHeight:1.4}}>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab==='concepts' && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
            {CONCEPTS.map(c=>(
              <div key={c.title} style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <span style={{fontSize:20}}>{c.icon}</span>
                  <div style={{fontSize:13,fontWeight:700,color:C.teal}}>{c.title}</div>
                </div>
                <p style={{fontSize:11,color:C.muted,lineHeight:1.6,margin:0}}>{c.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
