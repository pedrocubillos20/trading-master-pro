import React, { useState } from 'react'
import { API_URL } from './config/plans.js'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState('login') // 'login' | 'register'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return setErr('Ingresa tu email')
    setLoading(true); setErr('')
    try {
      // Verify / create subscription
      const res = await fetch(`${API_URL}/api/subscription/${encodeURIComponent(email.trim())}`)
      const data = await res.json()
      const sub = data.subscription || {}

      if (sub.status === 'expired') {
        setErr('Tu suscripción ha expirado. Contacta soporte.')
        setLoading(false); return
      }

      const userData = {
        email: email.trim(),
        plan: sub.plan || 'free',
        planName: sub.plan_name || 'Free Trial',
        daysLeft: sub.days_left || 5,
        isAdmin: email.trim() === 'admin@tradingpro.com'
      }
      onLogin(userData)
    } catch {
      setErr('Error de conexión. Verifica tu internet.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg0)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 14,
            background: 'linear-gradient(135deg, #0d4f3c, #1a6b52)',
            border: '2px solid var(--teal)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 28
          }}>📊</div>
          <h1 style={{ color: 'var(--teal)', fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>
            Trading Master Pro
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
            Motor SMC · Señales en Tiempo Real
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 28 }}>
          <h2 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 600, margin: '0 0 20px' }}>
            {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
          </h2>

          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              style={{
                width: '100%', padding: '10px 14px',
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text)', fontSize: 14,
                marginBottom: 16, outline: 'none'
              }}
              onFocus={e => e.target.style.borderColor = 'var(--teal)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />

            {err && (
              <div style={{
                background: '#2a0d0d', border: '1px solid #a32d2d',
                borderRadius: 6, padding: '8px 12px', marginBottom: 12,
                color: 'var(--red)', fontSize: 12
              }}>{err}</div>
            )}

            <button
              type="submit"
              className="btn-teal"
              style={{ width: '100%', padding: '11px', fontSize: 14 }}
              disabled={loading}
            >
              {loading ? 'Verificando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
            </span>
            <button
              onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setErr('') }}
              style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, cursor: 'pointer' }}
            >
              {mode === 'login' ? 'Empieza gratis' : 'Inicia sesión'}
            </button>
          </div>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 11, marginTop: 20 }}>
          Ingresando aceptas nuestros términos · Solo para uso educativo
        </p>
      </div>
    </div>
  )
}
