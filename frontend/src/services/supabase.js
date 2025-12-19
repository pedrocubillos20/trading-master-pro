// =============================================
// TRADING MASTER PRO - SUPABASE CLIENT
// =============================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Log para debugging
console.log('Supabase URL:', supabaseUrl ? 'Configurada' : 'NO CONFIGURADA')
console.log('Supabase Key:', supabaseAnonKey ? 'Configurada' : 'NO CONFIGURADA')

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ Variables de Supabase no configuradas!')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  }
)

export default supabase
