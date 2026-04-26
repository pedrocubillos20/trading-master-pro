import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from './config/plans.js'

const C = {
  bg0:'#0d1117',bg1:'#161b22',bg2:'#1c2330',border:'#30363d',
  text:'#e6edf3',muted:'#7d8590',teal:'#00d4aa',tealDark:'#00b894',
  red:'#ff6b6b',green:'#3fb950',yellow:'#f9ca24'
}

export default function AdminPanel({ user, onLogout }) {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState({})
  const [signals, setSignals] = useState([])
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('users')
  const [form, setForm] = useState({ email:'', plan:'free', status:'trial', period:'mensual' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [uRes, sRes, hRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/users`),
        fetch(`${API_URL}/api/signals`),
        fetch(`${API_URL}/api/health`)
      ])
      const u = await uRes.json(); setUsers(u.users||[]); setStats(u.stats||{})
      const s = await sRes.json(); setSignals(s.signals||[])
      const h = await hRes.json(); setHealth(h)
    } catch(e) { setMsg('Error cargando datos') }
    setLoading(false)
  }

  useEffect(() => { load(); const id=setInterval(load,10000); return()=>clearInterval(id) }, [])

  const saveUser = async () => {
    setSaving(true); setMsg('')
    try {
      const r = await fetch(`${API_URL}/api/admin/users`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)
      })
      const d = await r.json()
      if(d.success){ setMsg('✅ Usuario guardado'); load(); setForm({email:'',plan:'free',status:'trial',period:'mensual'}) }
      else setMsg('❌ Error: '+(d.error||'Desconocido'))
    } catch { setMsg('❌ Error de red') }
    setSaving(false)
  }

  const updateUser = async (email, plan, status) => {
    try {
      await fetch(`${API_URL}/api/admin/users/${encodeURIComponent(email)}`,{
        method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,status})
      })
      load()
    } catch {}
  }

  const deleteUser = async (email) => {
    if(!confirm(`¿Eliminar ${email}?`)) return
    await fetch(`${API_URL}/api/admin/users/${encodeURIComponent(email)}`,{method:'DELETE'})
    load()
  }

  const planColor = p => p==='elite'?C.teal:p==='premium'?'#378ADD':p==='basico'?C.green:C.muted

  const statusBg = s =>
    s==='active'?'rgba(63,185,80,.15)':s==='trial'?'rgba(249,202,36,.15)':'rgba(255,107,107,.15)'
  const statusColor = s =>
    s==='active'?C.green:s==='trial'?C.yellow:C.red

  const inp = (label,key,type='text',opts=null) => (
    <div>
      <label style={{display:'block',color:C.muted,fontSize:11,marginBottom:4}}>{label}</label>
      {opts ? (
        <select value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
          style={{width:'100%',background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 10px',color:C.text,fontSize:12}}>
          {opts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={type} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
          style={{width:'100%',background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 10px',color:C.text,fontSize:12}}/>
      )}
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:C.bg0,color:C.text}}>
      {/* Header */}
      <div style={{background:C.bg1,borderBottom:`1px solid ${C.border}`,padding:'10px 20px',display:'flex',alignItems:'center',gap:12}}>
        <span style={{fontWeight:800,fontSize:15,color:C.teal}}>📊 Admin Panel</span>
        <span style={{color:C.muted,fontSize:12}}>Trading Master Pro</span>
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          <button onClick={()=>navigate('/')} className="btn-ghost" style={{fontSize:11}}>← Dashboard</button>
          <button onClick={onLogout} className="btn-ghost" style={{fontSize:11}}>Salir</button>
        </div>
      </div>

      <div style={{padding:20,maxWidth:1200,margin:'0 auto'}}>
        {/* Health */}
        {health && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,marginBottom:20}}>
            {[
              {l:'Deriv',v:health.deriv==='connected'?'✅ Conectado':'❌ Desconectado',c:health.deriv==='connected'?C.green:C.red},
              {l:'OpenAI',v:health.openai?'✅ Activo':'⚠️ Sin clave',c:health.openai?C.green:C.yellow},
              {l:'Supabase',v:health.supabase?'✅ Activo':'⚠️ Sin DB',c:health.supabase?C.green:C.yellow},
              {l:'Telegram',v:health.telegram?'✅ Activo':'⚠️ No config',c:health.telegram?C.green:C.yellow},
              {l:'Señales',v:signals.length+' total',c:C.teal},
              {l:'Usuarios',v:stats.total||0+' total',c:C.teal}
            ].map(({l,v,c})=>(
              <div key={l} style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 14px'}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
                <div style={{fontSize:12,fontWeight:700,color:c}}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:8,marginBottom:20}}>
          {[
            {l:'Total',v:stats.total||0},
            {l:'Trial',v:stats.trial||0,c:C.yellow},
            {l:'Activos',v:stats.active||0,c:C.green},
            {l:'Expirados',v:stats.expired||0,c:C.red},
            {l:'Básico',v:stats.basico||0},
            {l:'Premium',v:stats.premium||0,c:'#378ADD'},
            {l:'Elite',v:stats.elite||0,c:C.teal},
            {l:'Revenue/mes',v:`$${((stats.monthlyRevenue||0)/1000).toFixed(1)}k`,c:C.teal}
          ].map(({l,v,c})=>(
            <div key={l} style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 14px'}}>
              <div style={{fontSize:9,color:C.muted,marginBottom:4,textTransform:'uppercase',letterSpacing:'.05em'}}>{l}</div>
              <div style={{fontSize:20,fontWeight:800,color:c||C.text}}>{v}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:4,marginBottom:16}}>
          {['users','signals','add'].map(t=>(
            <button key={t} onClick={()=>setTab(t)} className={`btn-ghost${tab===t?' active':''}`}>
              {t==='users'?`👥 Usuarios (${users.length})`:t==='signals'?`📡 Señales (${signals.length})`:'➕ Nuevo usuario'}
            </button>
          ))}
          <button onClick={load} className="btn-ghost" style={{marginLeft:'auto'}}>↻ Actualizar</button>
        </div>

        {msg && <div style={{background:msg.includes('✅')?'rgba(63,185,80,.1)':'rgba(255,107,107,.1)',border:`1px solid ${msg.includes('✅')?C.green:C.red}`,borderRadius:6,padding:'8px 12px',marginBottom:12,fontSize:12,color:msg.includes('✅')?C.green:C.red}}>{msg}</div>}

        {/* Users table */}
        {tab==='users' && (
          <div style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{background:C.bg2}}>
                  {['Email','Plan','Estado','Días','Período','Acciones'].map(h=>(
                    <th key={h} style={{padding:'10px 12px',textAlign:'left',color:C.muted,fontWeight:600,fontSize:11,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{padding:20,textAlign:'center',color:C.muted}}>Cargando...</td></tr>
                ) : users.map((u,i)=>(
                  <tr key={u.id||i} style={{borderBottom:`1px solid ${C.border}22`}}>
                    <td style={{padding:'9px 12px',color:C.text}}>{u.email}</td>
                    <td style={{padding:'9px 12px'}}>
                      <select value={u.plan} onChange={e=>updateUser(u.email,e.target.value,u.status)}
                        style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:4,padding:'3px 6px',color:planColor(u.plan),fontSize:11,fontWeight:700}}>
                        {['free','basico','premium','elite'].map(p=><option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td style={{padding:'9px 12px'}}>
                      <span style={{
                        background:statusBg(u.status),color:statusColor(u.status),
                        padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:700
                      }}>{u.status}</span>
                    </td>
                    <td style={{padding:'9px 12px',color:u.days_left>5?C.green:u.days_left>0?C.yellow:C.red,fontWeight:700}}>{u.days_left??'∞'}</td>
                    <td style={{padding:'9px 12px',color:C.muted}}>{u.periodo||'-'}</td>
                    <td style={{padding:'9px 12px',display:'flex',gap:6}}>
                      <button onClick={()=>updateUser(u.email,u.plan,'active')} style={{background:'rgba(63,185,80,.1)',color:C.green,border:`1px solid ${C.green}44`,borderRadius:4,padding:'3px 8px',fontSize:10,cursor:'pointer'}}>Activar</button>
                      <button onClick={()=>deleteUser(u.email)} style={{background:'rgba(255,107,107,.1)',color:C.red,border:`1px solid ${C.red}44`,borderRadius:4,padding:'3px 8px',fontSize:10,cursor:'pointer'}}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Signals table */}
        {tab==='signals' && (
          <div style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{background:C.bg2}}>
                  {['#','Activo','Acción','Modelo','Score','Entry','SL','TP1','Estado','Tiempo'].map(h=>(
                    <th key={h} style={{padding:'9px 10px',textAlign:'left',color:C.muted,fontWeight:600,fontSize:11,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {signals.slice(0,50).map(s=>(
                  <tr key={s.id} style={{borderBottom:`1px solid ${C.border}22`}}>
                    <td style={{padding:'8px 10px',color:C.muted}}>#{s.id}</td>
                    <td style={{padding:'8px 10px',color:C.text}}>{s.assetName||s.symbol}</td>
                    <td style={{padding:'8px 10px'}}>
                      <span style={{
                        color:s.action==='LONG'?C.teal:C.red,fontWeight:700,fontSize:11,
                        background:s.action==='LONG'?'rgba(0,212,170,.1)':'rgba(255,107,107,.1)',
                        padding:'2px 6px',borderRadius:4
                      }}>{s.action==='LONG'?'COMPRA':'VENTA'}</span>
                    </td>
                    <td style={{padding:'8px 10px',color:C.teal,fontSize:10}}>{s.model}</td>
                    <td style={{padding:'8px 10px',color:s.score>=82?C.green:C.yellow,fontWeight:700}}>{s.score}%</td>
                    <td style={{padding:'8px 10px',color:C.text,fontVariantNumeric:'tabular-nums'}}>{s.entry?.toFixed(2)}</td>
                    <td style={{padding:'8px 10px',color:C.red}}>{s.stop?.toFixed(2)}</td>
                    <td style={{padding:'8px 10px',color:C.teal}}>{s.tp1?.toFixed(2)}</td>
                    <td style={{padding:'8px 10px'}}>
                      <span style={{
                        color:s.status==='WIN'?C.green:s.status==='LOSS'?C.red:C.yellow,
                        fontWeight:700,fontSize:10
                      }}>{s.status}</span>
                    </td>
                    <td style={{padding:'8px 10px',color:C.muted,fontSize:10}}>
                      {new Date(s.timestamp).toLocaleString('es-CO',{timeZone:'America/Bogota',hour12:false,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add user form */}
        {tab==='add' && (
          <div style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:8,padding:20,maxWidth:400}}>
            <h3 style={{color:C.text,marginBottom:16,fontSize:14,fontWeight:700}}>➕ Nuevo Usuario</h3>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {inp('Email','email','email')}
              {inp('Plan','plan','text',[
                {value:'free',label:'Free Trial'},{value:'basico',label:'Básico'},
                {value:'premium',label:'Premium'},{value:'elite',label:'Elite'}
              ])}
              {inp('Estado','status','text',[
                {value:'trial',label:'Trial'},{value:'active',label:'Activo'},{value:'expired',label:'Expirado'}
              ])}
              {inp('Período','period','text',[
                {value:'mensual',label:'Mensual'},{value:'semestral',label:'Semestral'},{value:'anual',label:'Anual'}
              ])}
              <button onClick={saveUser} disabled={saving} className="btn-teal" style={{marginTop:4}}>
                {saving?'Guardando...':'Guardar Usuario'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
