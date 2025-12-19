// =============================================
// TRADING MASTER PRO - APP.JSX
// =============================================

import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './services/supabase'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Obtener sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-zinc-400">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route 
        path="/login" 
        element={session ? <Navigate to="/" replace /> : <Login />} 
      />
      <Route 
        path="/register" 
        element={session ? <Navigate to="/" replace /> : <Register />} 
      />
      <Route 
        path="/*" 
        element={session ? <Dashboard session={session} /> : <Navigate to="/login" replace />} 
      />
    </Routes>
  )
}

export default App
