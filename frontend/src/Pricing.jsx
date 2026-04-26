import React, { useState } from 'react'
import { PLANS, API_URL } from './config/plans.js'

const C = { bg0:'#0d1117',bg1:'#161b22',bg2:'#1c2330',border:'#30363d',text:'#e6edf3',muted:'#7d8590',teal:'#00d4aa',tealDark:'#00b894',red:'#ff6b6b',green:'#3fb950',yellow:'#f9ca24' }

export default function Pricing({ user, subscription }) {
  const [loading, setLoading] = useState(null)
  const [period, setPeriod] = useState('mensual')

  const disc = period==='semestral' ? .15 : period==='anual' ? .25 : 0
  const fmt = p => `$${Math.round(p*(1-disc)/1000).toFixed(0)}k COP/mes`

  const checkout = async (planKey) => {
    if (!user) return
    setLoading(planKey)
    try {
      const r = await fetch(`${API_URL}/api/payments/wompi/create`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ plan:planKey, userId:user.email, email:user.email, period })
      })
      const d = await r.json()
      if (d.payment_url) window.open(d.payment_url, '_blank')
      else alert('Error al generar el pago: '+(d.error||'Intenta de nuevo'))
    } catch { alert('Error de conexión') }
    setLoading(null)
  }

  return (
    <div style={{minHeight:'100vh',background:C.bg0,color:C.text,padding:20}}>
      <div style={{maxWidth:900,margin:'0 auto'}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <h1 style={{fontSize:28,fontWeight:800,color:C.teal,margin:'0 0 8px'}}>Planes Trading Master Pro</h1>
          <p style={{color:C.muted,fontSize:14,margin:'0 0 20px'}}>Señales SMC profesionales en tiempo real · Motor IA + Telegram</p>
          {/* Period toggle */}
          <div style={{display:'inline-flex',gap:0,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
            {['mensual','semestral','anual'].map(p=>(
              <button key={p} onClick={()=>setPeriod(p)} style={{
                padding:'7px 16px',background:period===p?C.tealDark:C.bg2,
                color:period===p?'#000':C.muted,border:'none',cursor:'pointer',fontSize:12,
                fontWeight:period===p?700:400
              }}>
                {p.charAt(0).toUpperCase()+p.slice(1)}
                {p==='semestral'&&<span style={{marginLeft:4,fontSize:9,color:period==='semestral'?'#000':C.teal}}>-15%</span>}
                {p==='anual'&&<span style={{marginLeft:4,fontSize:9,color:period==='anual'?'#000':C.teal}}>-25%</span>}
              </button>
            ))}
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>
          {Object.entries(PLANS).map(([key,plan])=>{
            const isCurrentPlan = subscription?.plan===key
            const isFree = key==='free'
            const isElite = key==='elite'
            return (
              <div key={key} style={{
                background:C.bg1,border:`2px solid ${isElite?C.teal:isCurrentPlan?plan.color:C.border}`,
                borderRadius:12,padding:20,position:'relative',
                boxShadow:isElite?`0 0 20px ${C.teal}33`:undefined
              }}>
                {isElite && <div style={{
                  position:'absolute',top:-12,left:'50%',transform:'translateX(-50%)',
                  background:C.teal,color:'#000',fontSize:10,fontWeight:800,
                  padding:'3px 12px',borderRadius:20,whiteSpace:'nowrap'
                }}>⭐ MÁS POPULAR</div>}
                {isCurrentPlan && <div style={{
                  position:'absolute',top:-12,right:12,
                  background:plan.color,color:'#000',fontSize:10,fontWeight:800,
                  padding:'3px 10px',borderRadius:20
                }}>✓ ACTIVO</div>}

                <div style={{marginBottom:12}}>
                  <div style={{fontSize:16,fontWeight:800,color:plan.color}}>{plan.name}</div>
                  <div style={{fontSize:22,fontWeight:800,color:C.text,margin:'4px 0'}}>
                    {isFree ? 'Gratis' : fmt(plan.price)}
                  </div>
                  {!isFree && disc>0 && <div style={{fontSize:11,color:C.muted,textDecoration:'line-through'}}>{fmt(plan.price/(1-disc))}</div>}
                  {!isFree && <div style={{fontSize:10,color:C.muted}}>{period}</div>}
                </div>

                <ul style={{listStyle:'none',padding:0,margin:'0 0 16px',fontSize:12,display:'flex',flexDirection:'column',gap:6}}>
                  {plan.features.map(f=>(
                    <li key={f} style={{display:'flex',gap:8,color:C.text}}>
                      <span style={{color:plan.color,flexShrink:0}}>✓</span>{f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={()=>isFree?null:checkout(key)}
                  disabled={isFree||isCurrentPlan||loading===key}
                  style={{
                    width:'100%',padding:'9px',borderRadius:8,
                    background:isFree||isCurrentPlan?C.bg2:plan.color,
                    color:isFree||isCurrentPlan?C.muted:'#000',
                    border:`1px solid ${isFree||isCurrentPlan?C.border:plan.color}`,
                    cursor:isFree||isCurrentPlan?'not-allowed':'pointer',
                    fontWeight:700,fontSize:13
                  }}
                >
                  {loading===key?'Procesando...'
                    :isCurrentPlan?'Plan actual'
                    :isFree?'Gratis'
                    :'Suscribirse'}
                </button>
              </div>
            )
          })}
        </div>

        <div style={{marginTop:24,textAlign:'center',color:C.muted,fontSize:12}}>
          Pagos procesados por <strong style={{color:C.text}}>Wompi</strong> · Soporte: admin@tradingpro.com
        </div>
      </div>
    </div>
  )
}
