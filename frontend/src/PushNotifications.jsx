import React, { useState, useEffect } from 'react'
import { API_URL } from './config/plans.js'

const C = { bg1:'#161b22',bg2:'#1c2330',border:'#30363d',text:'#e6edf3',muted:'#7d8590',teal:'#00d4aa',tealDark:'#00b894',red:'#ff6b6b',green:'#3fb950' }

export default function PushNotifications({ user }) {
  const [status, setStatus] = useState('idle') // idle | requesting | subscribed | unsupported | error
  const [vapidKey, setVapidKey] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported'); return
    }
    fetch(`${API_URL}/api/push/vapid-key`).then(r=>r.json())
      .then(d=>{ if(d.publicKey) setVapidKey(d.publicKey) })
      .catch(()=>{})
  }, [])

  const urlBase64ToUint8Array = (base64) => {
    const padding = '='.repeat((4 - base64.length % 4) % 4)
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = window.atob(b64)
    return new Uint8Array([...raw].map(c => c.charCodeAt(0)))
  }

  const subscribe = async () => {
    if (!vapidKey) { setMsg('No se pudo obtener la clave del servidor'); return }
    setStatus('requesting')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      })
      const r = await fetch(`${API_URL}/api/push/subscribe`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ userId: user.email, subscription: sub.toJSON(), deviceInfo: { userAgent: navigator.userAgent } })
      })
      const d = await r.json()
      if (d.success) { setStatus('subscribed'); setMsg('✅ Notificaciones activadas') }
      else { setStatus('error'); setMsg('Error: '+(d.error||'Desconocido')) }
    } catch(e) {
      setStatus('error'); setMsg('Error activando notificaciones: '+e.message)
    }
  }

  const test = async () => {
    const r = await fetch(`${API_URL}/api/push/test`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:user.email})})
    const d = await r.json()
    setMsg(d.success?'✅ Notificación de prueba enviada':'Error: '+(d.error||''))
  }

  if (status==='unsupported') return (
    <div style={{padding:16,color:C.muted,fontSize:12}}>
      ⚠️ Tu navegador no soporta notificaciones push.
    </div>
  )

  return (
    <div style={{padding:16}}>
      <div style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:10,padding:16,maxWidth:360}}>
        <h3 style={{color:C.text,fontSize:14,fontWeight:700,margin:'0 0 12px'}}>🔔 Notificaciones Push</h3>
        <p style={{color:C.muted,fontSize:12,lineHeight:1.5,margin:'0 0 16px'}}>
          Recibe alertas de señales, TP y SL directamente en tu dispositivo, incluso cuando la app está cerrada.
        </p>
        {msg && <div style={{marginBottom:12,fontSize:12,color:msg.includes('✅')?C.green:C.red,background:msg.includes('✅')?'rgba(63,185,80,.1)':'rgba(255,107,107,.1)',padding:'8px 12px',borderRadius:6,border:`1px solid ${msg.includes('✅')?C.green:C.red}44`}}>{msg}</div>}
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {status!=='subscribed' ? (
            <button onClick={subscribe} disabled={status==='requesting'} style={{
              background:C.tealDark,color:'#000',border:'none',borderRadius:6,
              padding:'8px 16px',fontSize:12,fontWeight:700,cursor:'pointer'
            }}>
              {status==='requesting'?'Activando...':'Activar notificaciones'}
            </button>
          ) : (
            <div style={{display:'flex',gap:8}}>
              <span style={{color:C.green,fontSize:12,fontWeight:700,alignSelf:'center'}}>✅ Activas</span>
              <button onClick={test} style={{background:C.bg2,color:C.teal,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 12px',fontSize:11,cursor:'pointer'}}>
                Enviar prueba
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
