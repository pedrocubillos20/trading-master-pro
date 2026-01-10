import React, { useState } from 'react';

export default function Login({ supabase, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('login'); // 'login' o 'register'

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (error) throw error;
        onLogin(data.user);
      } else {
        // Registro
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        });
        
        if (error) throw error;
        
        if (data.user) {
          setError('');
          setMode('login');
          alert('✅ Cuenta creada. Por favor inicia sesión.');
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      if (err.message.includes('Invalid login')) {
        setError('Email o contraseña incorrectos');
      } else if (err.message.includes('Email not confirmed')) {
        setError('Por favor confirma tu email antes de iniciar sesión');
      } else if (err.message.includes('already registered')) {
        setError('Este email ya está registrado');
      } else {
        setError(err.message || 'Error de autenticación');
      }
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#06060a] flex items-center justify-center p-4">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* ELISA Avatar + Logo */}
        <div className="text-center mb-6">
          {/* ELISA Image */}
          <div className="relative inline-block mb-4">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 via-cyan-400 to-purple-500 p-1 shadow-lg shadow-emerald-500/30">
              <img 
                src="/elisa.png" 
                alt="ELISA - IA Trading Expert" 
                className="w-full h-full rounded-full object-cover bg-[#0a0a0f]"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="w-full h-full rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 items-center justify-center text-3xl hidden">
                🤖
              </div>
            </div>
            {/* Online indicator */}
            <div className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-[#06060a] animate-pulse" />
          </div>
          
          <h1 className="text-2xl font-bold text-white mb-1">Trading Master Pro</h1>
          <p className="text-emerald-400 text-sm font-medium">ELISA - IA Trading Expert</p>
          <p className="text-white/40 text-xs mt-1">12 Modelos SMC · Señales en Tiempo Real</p>
        </div>

        {/* Card */}
        <div className="bg-[#0d0d12] rounded-2xl border border-white/10 p-6 shadow-2xl backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">
            {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-white/60 text-sm mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                placeholder="tu@email.com"
                style={{ fontSize: '16px' }}
              />
            </div>

            <div>
              <label className="block text-white/60 text-sm mb-2">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                placeholder="••••••••"
                style={{ fontSize: '16px' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <span>{mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-white/5 text-center">
            {mode === 'login' ? (
              <p className="text-white/50 text-sm">
                ¿No tienes cuenta?{' '}
                <button
                  onClick={() => { setMode('register'); setError(''); }}
                  className="text-emerald-400 hover:text-emerald-300 font-medium"
                >
                  Regístrate
                </button>
              </p>
            ) : (
              <p className="text-white/50 text-sm">
                ¿Ya tienes cuenta?{' '}
                <button
                  onClick={() => { setMode('login'); setError(''); }}
                  className="text-emerald-400 hover:text-emerald-300 font-medium"
                >
                  Inicia sesión
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Features mini */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          <div className="bg-white/5 rounded-xl p-3">
            <span className="text-xl">🎯</span>
            <p className="text-white/60 text-[10px] mt-1">12 Modelos</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <span className="text-xl">📊</span>
            <p className="text-white/60 text-[10px] mt-1">17 Mercados</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <span className="text-xl">🤖</span>
            <p className="text-white/60 text-[10px] mt-1">IA ELISA</p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-white/30 text-xs mt-6">
          © 2026 Trading Master Pro. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
