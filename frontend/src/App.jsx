import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Dashboard from './Dashboard';
import Login from './Login';

// =============================================
// CONFIGURACIÓN SUPABASE
// =============================================
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://mtzycmqtxdvoazomipye.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10enljbXF0eGR2b2F6b21pcHllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NjI4NjEsImV4cCI6MjA4MTUzODg2MX0.C9TTNm-a1-BvPXG0T1eCj7AtQ6jZ6nKyvMVNi0pgJQk';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =============================================
// APP PRINCIPAL
// =============================================
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar sesión actual
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user || null);
      } catch (error) {
        console.error('Session error:', error);
      }
      setLoading(false);
    };

    checkSession();

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth event:', event);
        setUser(session?.user || null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Handler de logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // Pantalla de carga
  if (loading) {
    return (
      <div className="min-h-screen bg-[#06060a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/50">Cargando...</p>
        </div>
      </div>
    );
  }

  // Si no hay usuario, mostrar Login
  if (!user) {
    return <Login supabase={supabase} onLogin={setUser} />;
  }

  // Usuario autenticado, mostrar Dashboard
  return <Dashboard user={user} onLogout={handleLogout} />;
}
