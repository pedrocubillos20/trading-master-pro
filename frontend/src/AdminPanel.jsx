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
  
  // Estados para modales
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newUser, setNewUser] = useState({ email: '', plan: 'free', status: 'trial', period: 'mensual' });
  const [saving, setSaving] = useState(false);

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
        setStats(data.stats || {});
      }
    } catch (e) {
      console.error('Error fetching users:', e);
    }
    setLoading(false);
  };

  // Filtrar usuarios
  const filteredUsers = users.filter(user => {
    const status = user.status || user.estado;
    const plan = user.plan;
    const matchesFilter = filter === 'all' || status === filter || plan === filter;
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
      case 'basico': return 'bg-slate-500/20 text-slate-400';
      case 'premium': return 'bg-cyan-500/20 text-cyan-400';
      case 'elite': return 'bg-purple-500/20 text-purple-400';
      case 'free': return 'bg-amber-500/20 text-amber-400';
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

  // Abrir modal de edición
  const openEditModal = (user) => {
    setEditingUser({
      email: user.email,
      plan: user.plan || 'free',
      status: user.status || user.estado || 'trial',
      period: user.period || user.periodo || 'mensual'
    });
    setShowEditModal(true);
  };

  // Guardar cambios de usuario
  const handleSaveUser = async () => {
    if (!editingUser) return;
    setSaving(true);
    
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${encodeURIComponent(editingUser.email)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: editingUser.plan,
          status: editingUser.status,
          period: editingUser.period
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        alert('✅ Usuario actualizado correctamente');
        setShowEditModal(false);
        fetchUsers();
      } else {
        alert('❌ Error: ' + (data.error || 'No se pudo actualizar'));
      }
    } catch (e) {
      alert('❌ Error de conexión: ' + e.message);
    }
    
    setSaving(false);
  };

  // Agregar nuevo usuario
  const handleAddUser = async () => {
    if (!newUser.email) {
      alert('El email es requerido');
      return;
    }
    setSaving(true);
    
    try {
      const res = await fetch(`${API_URL}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUser.email,
          plan: newUser.plan,
          status: newUser.status,
          period: newUser.period
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        alert('✅ Usuario agregado correctamente');
        setShowAddModal(false);
        setNewUser({ email: '', plan: 'free', status: 'trial', period: 'mensual' });
        fetchUsers();
      } else {
        alert('❌ Error: ' + (data.error || 'No se pudo agregar'));
      }
    } catch (e) {
      alert('❌ Error de conexión: ' + e.message);
    }
    
    setSaving(false);
  };

  // Eliminar usuario
  const handleDeleteUser = async (email) => {
    if (!confirm(`¿Estás seguro de eliminar a ${email}?`)) return;
    
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${encodeURIComponent(email)}`, {
        method: 'DELETE'
      });
      
      const data = await res.json();
      
      if (data.success) {
        alert('✅ Usuario eliminado');
        fetchUsers();
      } else {
        alert('❌ Error: ' + (data.error || 'No se pudo eliminar'));
      }
    } catch (e) {
      alert('❌ Error: ' + e.message);
    }
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
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 rounded-lg text-black font-medium text-sm transition-all"
            >
              ➕ Agregar
            </button>
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
            <p className="text-2xl font-bold text-white">{stats.total || users.length}</p>
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
            <p className="text-2xl font-bold text-slate-400">{stats.basico || 0}</p>
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
            <p className="text-xl font-bold text-emerald-400">${(stats.monthlyRevenue || 0).toLocaleString()}</p>
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
                { key: 'basico', label: '🥉 Básico' },
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
                    <th className="text-left p-4 text-white/50 text-xs font-medium">Período</th>
                    <th className="text-left p-4 text-white/50 text-xs font-medium">Registro</th>
                    <th className="text-left p-4 text-white/50 text-xs font-medium">Días Restantes</th>
                    <th className="text-left p-4 text-white/50 text-xs font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user, i) => (
                    <tr key={user.id || user.email || i} className="border-t border-white/5 hover:bg-white/5">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                            <span className="text-black text-xs font-bold">
                              {user.email?.charAt(0).toUpperCase() || '?'}
                            </span>
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium">{user.email}</p>
                            <p className="text-white/40 text-xs">ID: {user.id?.slice(0, 8) || '-'}...</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusColor(user.status || user.estado)}`}>
                          {user.status || user.estado || 'Sin estado'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getPlanColor(user.plan)}`}>
                          {user.plan || 'free'}
                        </span>
                      </td>
                      <td className="p-4 text-white/60 text-sm">
                        {user.period || user.periodo || 'mensual'}
                      </td>
                      <td className="p-4 text-white/60 text-sm">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="p-4 text-white/60 text-sm">
                        {user.days_left !== null && user.days_left !== undefined
                          ? <span className={`font-medium ${
                              user.days_left <= 0 ? 'text-red-400' : 
                              user.days_left <= 5 ? 'text-red-400' : 
                              user.days_left <= 10 ? 'text-amber-400' : 'text-emerald-400'
                            }`}>
                              {user.days_left <= 0 ? 'Expirado' : `${user.days_left} días`}
                            </span>
                          : '-'
                        }
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => openEditModal(user)}
                            className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 rounded text-blue-400 text-xs"
                          >
                            ✏️ Editar
                          </button>
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
          <div className="grid sm:grid-cols-4 gap-4">
            <button 
              onClick={() => {
                const trialUsers = users.filter(u => (u.status || u.estado) === 'trial');
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
                const expiredUsers = users.filter(u => (u.status || u.estado) === 'expired');
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
              <p className="text-white/50 text-sm">{stats.total || users.length} usuarios</p>
            </button>

            <button 
              onClick={() => {
                const csv = [
                  'Email,Estado,Plan,Periodo,Registro,Dias Restantes',
                  ...users.map(u => 
                    `${u.email},${u.status || u.estado},${u.plan},${u.period || u.periodo},${u.created_at || '-'},${u.days_left !== undefined ? u.days_left : '-'}`
                  )
                ].join('\n');
                
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `usuarios_tradingpro_${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
              }}
              className="p-4 bg-purple-500/10 hover:bg-purple-500/20 rounded-xl border border-purple-500/20 transition-all"
            >
              <span className="text-2xl block mb-2">📊</span>
              <p className="text-white font-medium">Exportar CSV</p>
              <p className="text-white/50 text-sm">Descargar datos</p>
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Edición */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d0d12] rounded-2xl border border-white/10 p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-white mb-4">✏️ Editar Suscripción</h3>
            <p className="text-white/50 text-sm mb-6">{editingUser.email}</p>
            
            <div className="space-y-4">
              <div>
                <label className="text-white/50 text-sm block mb-2">Plan</label>
                <select
                  value={editingUser.plan}
                  onChange={(e) => setEditingUser({...editingUser, plan: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="free">🆓 Free (Trial)</option>
                  <option value="basico">🥉 Básico - $29,900</option>
                  <option value="premium">🥈 Premium - $59,900</option>
                  <option value="elite">🥇 Elite - $99,900</option>
                </select>
              </div>
              
              <div>
                <label className="text-white/50 text-sm block mb-2">Estado</label>
                <select
                  value={editingUser.status}
                  onChange={(e) => setEditingUser({...editingUser, status: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="trial">🟡 Trial (Prueba)</option>
                  <option value="active">🟢 Activo</option>
                  <option value="expired">🔴 Expirado</option>
                  <option value="cancelled">⚫ Cancelado</option>
                </select>
              </div>
              
              <div>
                <label className="text-white/50 text-sm block mb-2">Período</label>
                <select
                  value={editingUser.period}
                  onChange={(e) => setEditingUser({...editingUser, period: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="mensual">Mensual</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-medium transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveUser}
                disabled={saving}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-black font-bold transition-all disabled:opacity-50"
              >
                {saving ? 'Guardando...' : '💾 Guardar'}
              </button>
            </div>
            
            <button
              onClick={() => {
                handleDeleteUser(editingUser.email);
                setShowEditModal(false);
              }}
              className="w-full mt-3 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-xl text-red-400 text-sm transition-all"
            >
              🗑️ Eliminar Usuario
            </button>
          </div>
        </div>
      )}

      {/* Modal de Agregar */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d0d12] rounded-2xl border border-white/10 p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-white mb-6">➕ Agregar Usuario</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-white/50 text-sm block mb-2">Email *</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  placeholder="usuario@email.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500"
                />
              </div>
              
              <div>
                <label className="text-white/50 text-sm block mb-2">Plan</label>
                <select
                  value={newUser.plan}
                  onChange={(e) => setNewUser({...newUser, plan: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="free">🆓 Free (Trial)</option>
                  <option value="basico">🥉 Básico</option>
                  <option value="premium">🥈 Premium</option>
                  <option value="elite">🥇 Elite</option>
                </select>
              </div>
              
              <div>
                <label className="text-white/50 text-sm block mb-2">Estado</label>
                <select
                  value={newUser.status}
                  onChange={(e) => setNewUser({...newUser, status: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="trial">🟡 Trial</option>
                  <option value="active">🟢 Activo</option>
                </select>
              </div>
              
              <div>
                <label className="text-white/50 text-sm block mb-2">Período</label>
                <select
                  value={newUser.period}
                  onChange={(e) => setNewUser({...newUser, period: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="mensual">Mensual</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-medium transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddUser}
                disabled={saving || !newUser.email}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-black font-bold transition-all disabled:opacity-50"
              >
                {saving ? 'Agregando...' : '➕ Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
