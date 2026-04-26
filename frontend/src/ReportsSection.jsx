import React, { useState, useEffect } from 'react'
import { API_URL } from './config/plans.js'

const C = { bg1:'#161b22',bg2:'#1c2330',border:'#30363d',text:'#e6edf3',muted:'#7d8590',teal:'#00d4aa',red:'#ff6b6b',green:'#3fb950',yellow:'#f9ca24' }

export default function ReportsSection({ user }) {
  const [summary, setSummary] = useState(null)
  const [equity, setEquity] = useState([])
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`${API_URL}/api/reports/summary/${encodeURIComponent(user.email)}`).then(r=>r.json()),
      fetch(`${API_URL}/api/reports/equity/${encodeURIComponent(user.email)}?period=${period}`).then(r=>r.json())
    ]).then(([s,e]) => {
      setSummary(s.summary); setEquity(e.equityCurve||[])
    }).catch(()=>{}).finally(()=>setLoading(false))
  }, [user.email, period])

  if (loading) return <div style={{padding:20,color:C.muted,fontSize:13}}>Cargando reportes...</div>
  if (!summary) return <div style={{padding:20,color:C.muted,fontSize:13}}>Sin datos de reportes disponibles.</div>

  const wr = summary.total>0 ? Math.round(summary.wins/summary.total*100) : 0

  return (
    <div style={{padding:16}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:16}}>
        {[
          {l:'Win Rate',v:`${wr}%`,c:wr>=60?C.green:wr>=40?C.yellow:C.red},
          {l:'Total Ops',v:summary.total,c:C.text},
          {l:'Wins',v:summary.wins,c:C.green},
          {l:'Losses',v:summary.losses,c:C.red},
          {l:'TP1 hits',v:summary.tp1Hits||0,c:C.teal},
          {l:'TP2 hits',v:summary.tp2Hits||0,c:C.teal},
          {l:'TP3 hits',v:summary.tp3Hits||0,c:C.teal}
        ].map(({l,v,c})=>(
          <div key={l} style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 14px'}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
            <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Period selector */}
      <div style={{display:'flex',gap:4,marginBottom:12}}>
        {['week','month','all'].map(p=>(
          <button key={p} onClick={()=>setPeriod(p)}
            style={{
              background:period===p?'rgba(0,212,170,.1)':C.bg2,
              color:period===p?C.teal:C.muted,
              border:`1px solid ${period===p?C.teal:C.border}`,
              borderRadius:6,padding:'4px 12px',fontSize:11,cursor:'pointer',fontWeight:period===p?700:400
            }}>
            {p==='week'?'Semana':p==='month'?'Mes':'Todo'}
          </button>
        ))}
      </div>

      {/* Equity curve simple */}
      {equity.length>0 && (
        <div style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:8,padding:12,marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:8,fontWeight:600}}>CURVA DE EQUITY</div>
          <div style={{display:'flex',alignItems:'flex-end',gap:2,height:60}}>
            {equity.slice(-30).map((pt,i)=>{
              const isPos = pt.result==='WIN'
              return (
                <div key={i} title={`${pt.result} - ${new Date(pt.date||pt.timestamp).toLocaleDateString()}`}
                  style={{
                    flex:1,minWidth:6,height:`${Math.max(10,Math.abs(pt.cumulativePnl||20))}px`,
                    maxHeight:55,background:isPos?C.green:C.red,borderRadius:2,opacity:.8
                  }}/>
              )
            })}
          </div>
        </div>
      )}

      {/* By model */}
      {summary.byModel && (
        <div style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead>
              <tr style={{background:C.bg2}}>
                {['Modelo','Wins','Losses','Win Rate'].map(h=>(
                  <th key={h} style={{padding:'8px 12px',textAlign:'left',color:C.muted,fontWeight:600,fontSize:10,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.byModel).map(([model,d])=>{
                const mwr = d.wins+d.losses>0?Math.round(d.wins/(d.wins+d.losses)*100):0
                return (
                  <tr key={model} style={{borderBottom:`1px solid ${C.border}22`}}>
                    <td style={{padding:'7px 12px',color:C.teal,fontWeight:700}}>{model}</td>
                    <td style={{padding:'7px 12px',color:C.green}}>{d.wins}</td>
                    <td style={{padding:'7px 12px',color:C.red}}>{d.losses}</td>
                    <td style={{padding:'7px 12px',color:mwr>=60?C.green:mwr>=40?C.yellow:C.red,fontWeight:700}}>{mwr}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
