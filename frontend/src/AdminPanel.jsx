import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// Contraseña de admin (cambiar en producción)
const ADMIN_PASSWORD = 'TradingPro2024Admin!';

export default function AdminPanel() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true);
      localStorage.setItem('adminAuth', 'true');
    } else {
      alert('Contraseña incorrecta');
    }
  };

  useEffect(() => {
    if (localStorage.getItem('adminAuth') === 'true') {
      setAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      fetchUsers();
    }
  }, [authenticated]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/users`);
      const data = await res.json();
      if (data.users) {
        setUsers(data.users);
        calculateStats(data.users);
      }
    } catch (e) {
      console.error('Error fetching users:', e);
    }
    setLoading(false);
  };

  const calculateStats = (usersList) => {
    const total = usersList.length;
    const trial = usersList.filter(u => u.subscription?.status === 'trial').length;
    const active = usersList.filter(u => u.subscription?.status === 'active').length;
    const expired = usersList.filter(u => u.subscription?.status === 'expired').length;
    const basic = usersList.filter(u => u.subscription?.plan === 'basic').length;
    const premium = usersList.filter(u => u.subscription?.plan === 'premium').length;
    const elite = usersList.filter(u => u.subscription?.plan === 'elite').length;
    
    const revenue = usersList.reduce((acc, u) => {
      if (u.subscription?.status === 'active') {
        const prices = { basic: 29900, premium: 59900, elite: 99900 };
        return acc + (prices[u.subscription?.plan] || 0);
      }
      return acc;
    }, 0);

    setStats({ total, trial, active, expired, basic, premium, elite, revenue });
  };

  const filteredUsers = users.filter(user => {
    const matchesFilter = filter === 'all' || user.subscription?.status === filter || user.subscription?.plan === filter;
    const matchesSearch = user.email?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'trial': return 'bg-amber-500/20 text-amber-400';
      case 'active': return 'bg-emerald-500/20 text-emerald-400';
      case 'expired': return 'bg-red-500/20 text-red-400';
      default: return 'bg-white/10 text-white/50';
    }
  };

  const getPlanColor = (plan) => {
    switch (plan) {
      case 'basic': return 'bg-slate-500/20 text-slate-400';
      case 'premium': return 'bg-cyan-500/20 text-cyan-400';
      case 'elite': return 'bg-purple-500/20 text-purple-400';
      default: return 'bg-white/10 text-white/50';
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('adminAuth');
    setAuthenticated(false);
  };

  // Login Screen
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#06060a] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-[#0d0d12] rounded-2xl border border-white/10 p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                <span className="text-3xl">👨‍💼</span>
              </div>
              <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
              <p className="text-white/50 mt-2">Trading Master Pro</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-white/50 text-sm block mb-2">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresa la contraseña"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-xl text-black font-bold transition-all"
              >
                Acceder
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Admin Dashboard
  return (
    <div className="min-h-screen bg-[#06060a]">
      {/* Header */}
      <header className="bg-[#0a0a0f] border-b border-white/5 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
              <span className="text-xl">👨‍💼</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Admin Panel</h1>
              <p className="text-xs text-white/50">Trading Master Pro</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchUsers}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 text-sm transition-all"
            >
              🔄 Actualizar
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 text-sm transition-all"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
            <p className="text-white/50 text-xs mb-1">Total Usuarios</p>
            <p className="text-2xl font-bold text-white">{stats.total || 0}</p>
          </div>
          <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
            <p className="text-white/50 text-xs mb-1">En Trial</p>
            <p className="text-2xl font-bold text-amber-400">{stats.trial || 0}</p>
          </div>
          <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
            <p className="text-white/50 text-xs mb-1">Activos</p>
            <p className="text-2xl font-bold text-emerald-400">{stats.active || 0}</p>
          </div>
          <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
            <p className="text-white/50 text-xs mb-1">Expirados</p>
            <p className="text-2xl font-bold text-red-400">{stats.expired || 0}</p>
          </div>
          <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
            <p className="text-white/50 text-xs mb-1">Plan Básico</p>
            <p className="text-2xl font-bold text-slate-400">{stats.basic || 0}</p>
          </div>
          <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
            <p className="text-white/50 text-xs mb-1">Plan Premium</p>
            <p className="text-2xl font-bold text-cyan-400">{stats.premium || 0}</p>
          </div>
          <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
            <p className="text-white/50 text-xs mb-1">Plan Elite</p>
            <p className="text-2xl font-bold text-purple-400">{stats.elite || 0}</p>
          </div>
          <div className="bg-[#0d0d12] rounded-xl p-4 border border-emerald-500/20">
            <p className="text-white/50 text-xs mb-1">Ingresos/mes</p>
            <p className="text-xl font-bold text-emerald-400">${(stats.revenue || 0).toLocaleString()}</p>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Buscar por email..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[
                { key: 'all', label: 'Todos' },
                { key: 'trial', label: '🟡 Trial' },
                { key: 'active', label: '🟢 Activos' },
                { key: 'expired', label: '🔴 Expirados' },
                { key: 'basic', label: '🥉 Básico' },
                { key: 'premium', label: '🥈 Premium' },
                { key: 'elite', label: '🥇 Elite' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    filter === f.key 
                      ? 'bg-emerald-500 text-black' 
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-[#0d0d12] rounded-xl border border-white/5 overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <h2 className="text-white font-bold">👥 Usuarios ({filteredUsers.length})</h2>
          </div>
          
          {loading ? (
            <div className="p-8 text-center">
              <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-white/50">Cargando usuarios...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center">
              <span className="text-4xl block mb-2">🔍</span>
              <p className="text-white/50">No se encontraron usuarios</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr>
                    <th className="text-left p-4 text-white/50 text-xs font-medium">Email</th>
                    <th className="text-left p-4 text-white/50 text-xs font-medium">Estado</th>
                    <th className="text-left p-4 text-white/50 text-xs font-medium">Plan</th>
                    <th className="text-left p-4 text-white/50 text-xs font-medium">Registro</th>
                    <th className="text-left p-4 text-white/50 text-xs font-medium">Trial Expira</th>
                    <th className="text-left p-4 text-white/50 text-xs font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user, i) => (
                    <tr key={user.id || i} className="border-t border-white/5 hover:bg-white/5">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                            <span className="text-black text-xs font-bold">
                              {user.email?.charAt(0).toUpperCase() || '?'}
                            </span>
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium">{user.email}</p>
                            <p className="text-white/40 text-xs">ID: {user.id?.slice(0, 8)}...</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusColor(user.subscription?.status)}`}>
                          {user.subscription?.status || 'Sin suscripción'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getPlanColor(user.subscription?.plan)}`}>
                          {user.subscription?.plan || '-'}
                        </span>
                      </td>
                      <td className="p-4 text-white/60 text-sm">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="p-4 text-white/60 text-sm">
                        {user.subscription?.status === 'trial' 
                          ? formatDate(user.subscription?.trial_ends_at)
                          : '-'
                        }
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              const subject = encodeURIComponent('Trading Master Pro - Oferta Especial');
                              const body = encodeURIComponent(`Hola,\n\nTe contactamos de Trading Master Pro...\n\nSaludos`);
                              window.open(`mailto:${user.email}?subject=${subject}&body=${body}`);
                            }}
                            className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 rounded text-emerald-400 text-xs"
                          >
                            📧 Email
                          </button>
                          <button 
                            onClick={() => navigator.clipboard.writeText(user.email)}
                            className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded text-white/60 text-xs"
                          >
                            📋 Copiar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Marketing Actions */}
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <h3 className="text-white font-bold mb-4">🎯 Acciones de Marketing</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <button 
              onClick={() => {
                const trialUsers = users.filter(u => u.subscription?.status === 'trial');
                const emails = trialUsers.map(u => u.email).join(',');
                navigator.clipboard.writeText(emails);
                alert(`${trialUsers.length} emails copiados`);
              }}
              className="p-4 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl border border-amber-500/20 transition-all"
            >
              <span className="text-2xl block mb-2">🟡</span>
              <p className="text-white font-medium">Copiar emails Trial</p>
              <p className="text-white/50 text-sm">{stats.trial || 0} usuarios</p>
            </button>
            
            <button 
              onClick={() => {
                const expiredUsers = users.filter(u => u.subscription?.status === 'expired');
                const emails = expiredUsers.map(u => u.email).join(',');
                navigator.clipboard.writeText(emails);
                alert(`${expiredUsers.length} emails copiados`);
              }}
              className="p-4 bg-red-500/10 hover:bg-red-500/20 rounded-xl border border-red-500/20 transition-all"
            >
              <span className="text-2xl block mb-2">🔴</span>
              <p className="text-white font-medium">Copiar emails Expirados</p>
              <p className="text-white/50 text-sm">{stats.expired || 0} usuarios</p>
            </button>
            
            <button 
              onClick={() => {
                const allEmails = users.map(u => u.email).join(',');
                navigator.clipboard.writeText(allEmails);
                alert(`${users.length} emails copiados`);
              }}
              className="p-4 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl border border-emerald-500/20 transition-all"
            >
              <span className="text-2xl block mb-2">📧</span>
              <p className="text-white font-medium">Copiar todos los emails</p>
              <p className="text-white/50 text-sm">{stats.total || 0} usuarios</p>
            </button>
          </div>
        </div>

        {/* Export */}
        <div className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
          <h3 className="text-white font-bold mb-4">📊 Exportar Datos</h3>
          <div className="flex gap-3">
            <button
              onClick={() => {
                const csv = [
                  'Email,Estado,Plan,Registro,Trial Expira',
                  ...users.map(u => 
                    `${u.email},${u.subscription?.status || '-'},${u.subscription?.plan || '-'},${u.created_at || '-'},${u.subscription?.trial_ends_at || '-'}`
                  )
                ].join('\n');
                
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `usuarios_tradingpro_${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
              }}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm"
            >
              📥 Exportar CSV
            </button>
            <button
              onClick={() => {
                const json = JSON.stringify(users, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `usuarios_tradingpro_${new Date().toISOString().split('T')[0]}.json`;
                a.click();
              }}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm"
            >
              📥 Exportar JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
