// =============================================
// TRADING MASTER PRO - LOGIN
// =============================================

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import toast from 'react-hot-toast'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    
    if (!email || !password) {
      toast.error('Completa todos los campos')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) throw error

      toast.success('¡Bienvenido de vuelta!')
      
      // Forzar redirección
      window.location.href = '/'
      
    } catch (error) {
      console.error('Error:', error)
      toast.error(error.message || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">
            <span className="text-white">Trading Master</span>
            <span className="text-green-500"> Pro</span>
          </h1>
          <p className="text-zinc-400 mt-2">Inicia sesión para continuar</p>
        </div>

        <form onSubmit={handleLogin} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <div className="space-y-4">
            <div>
              <label className="text-zinc-400 text-sm block mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:border-green-500 focus:outline-none"
                placeholder="tu@email.com"
              />
            </div>

            <div>
              <label className="text-zinc-400 text-sm block mb-2">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:border-green-500 focus:outline-none"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-500 text-black font-bold py-3 rounded-lg hover:bg-green-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Iniciando...
                </span>
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-zinc-500">
              ¿No tienes cuenta?{' '}
              <Link to="/register" className="text-green-500 hover:text-green-400">
                Regístrate gratis
              </Link>
            </p>
          </div>
        </form>

        <p className="text-center text-zinc-600 text-sm mt-8">
          Trading Master Pro © 2025
        </p>
      </div>
    </div>
  )
}
