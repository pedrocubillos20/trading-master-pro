import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './Login.jsx'
import Dashboard from './Dashboard.jsx'
import AdminPanel from './AdminPanel.jsx'
import Pricing from './Pricing.jsx'
import ModelosGuia from './ModelosGuia.jsx'
import { API_URL } from './config/plans.js'

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tmp_user') || 'null') }
    catch { return null }
  })
  const [subscription, setSubscription] = useState(null)

  useEffect(() => {
    if (!user) return
    fetch(`${API_URL}/api/subscription/${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(d => setSubscription(d.subscription))
      .catch(() => {})
  }, [user])

  const login = (userData) => {
    localStorage.setItem('tmp_user', JSON.stringify(userData))
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('tmp_user')
    setUser(null)
    setSubscription(null)
  }

  if (!user) return <Login onLogin={login} />

  return (
    <Routes>
      <Route path="/" element={
        <Dashboard user={user} subscription={subscription} onLogout={logout} />
      }/>
      <Route path="/admin" element={
        user?.email === 'admin@tradingpro.com'
          ? <AdminPanel user={user} onLogout={logout} />
          : <Navigate to="/" />
      }/>
      <Route path="/pricing" element={<Pricing user={user} subscription={subscription} />}/>
      <Route path="/modelos" element={<ModelosGuia user={user} onBack={() => window.history.back()} />}/>
      <Route path="*" element={<Navigate to="/" />}/>
    </Routes>
  )
}
