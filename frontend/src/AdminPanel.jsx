import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

const ADMIN_PASSWORD = 'TradingPro2024Admin!';

export default function AdminPanel() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ user_id: '', email: '', plan: 'elite', status: 'active', period: 'anual' });

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
    if (localStorage.getItem('adminAuth') === 'true') setAuthenticated(true);
  }, []);

  useEffect(() => {
    if (authenticated) fetchUsers();
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
      console.error('Error:', e);
    }
    setLoading(false);
  };

  const addUser = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: newUser.user_id,
          email: newUser.email,
          plan_slug: newUser.plan,
          status: newUser.status,
          period: newUser.period
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Usuario agregado/actualizado');
        setShowAddUser(false);
        setNewUser({ user_id: '', email: '', plan: 'elite', status: 'active', period: 'anual' });
        fetchUsers();
      } else {
        alert('Error: ' + (data.error || 'Error desconocido'));
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const deleteUser = async (userId) => {
    if (!confirm('¿Eliminar suscripción de este usuario?')) return;
    try {
      await fetch(`${API_URL}/api/admin/users/${userId}`, { method: 'DELETE' });
      fetchUsers();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const copyEmails = (filterFn) => {
    const emails = users.filter(filterFn).map(u => u.email).filter(Boolean).join('\n');
    navigator.clipboard.writeText(emails);
    alert(`✅ ${emails.split('\n').length} emails copiados`);
  };

  const exportCSV = () => {
    const csv = 'Email,Status,Plan,Period,Created\n' + users.map(u => 
      `${u.email},${u.subscription?.status},${u.subscription?.plan},${u.subscription?.period},${u.created_at}`
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'usuarios.csv';
    a.click();
  };

  const filteredUsers = users.filter(u => {
    const matchFilter = filter === 'all' || u.subscription?.status === filter || u.subscription?.plan?.includes(filter);
    const matchSearch = !search || u.email?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('es-CO') : '-';

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#06060a] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#0d0d12] rounded-2xl border border-white/10 p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-3xl">👨‍💼</div>
            <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white" />
            <button className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl text-black font-bold">Acceder</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06060a]">
      <header className="bg-[#0a0a0f] border-b border-white/5 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-xl">👨‍💼</div>
            <div>
              <h1 className="text-lg font-bold text-white">Admin Panel</h1>
              <p className="text-xs text-white/50">Trading Master Pro</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAddUser(true)} className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-lg text-emerald-400 text-sm">➕ Agregar</button>
            <button onClick={fetchUsers} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 text-sm">🔄 Actualizar</button>
            <button onClick={() => { localStorage.removeItem('adminAuth'); setAuthenticated(false); }} className="px-4 py-2 bg-red-500/20 rounded-lg text-red-400 text-sm">Salir</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: 'Total', value: stats.total || 0, color: 'text-white' },
            { label: 'Trial', value: stats.trial || 0, color: 'text-amber-400' },
            { label: 'Activos', value: stats.active || 0, color: 'text-emerald-400' },
            { label: 'Expirados', value: stats.expired || 0, color: 'text-red-400' },
            { label: 'Básico', value: stats.basic || 0, color: 'text-slate-400' },
            { label: 'Premium', value: stats.premium || 0, color: 'text-cyan-400' },
            { label: 'Elite', value: stats.elite || 0, color: 'text-purple-400' },
            { label: 'Ingresos/mes', value: `$${((stats.active || 0) * 99900).toLocaleString()}`, color: 'text-emerald-400' },
          ].map((s, i) => (
            <div key={i} className="bg-[#0d0d12] rounded-xl p-4 border border-white/5">
              <p className="text-white/50 text-xs mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Buscar por email..." className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm" />
          {['all', 'trial', 'active', 'expired', 'básico', 'premium', 'elite'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 rounded-lg text-sm ${filter === f ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white/70'}`}>
              {f === 'all' ? 'Todos' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Users Table */}
        <div className="bg-[#0d0d12] rounded-xl border border-white/5 overflow-hidden">
          <div className="p-4 border-b border-white/5 flex justify-between items-center">
            <h2 className="text-white font-bold">👥 Usuarios ({filteredUsers.length})</h2>
          </div>
          
          {loading ? (
            <div className="p-8 text-center text-white/50">Cargando...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-white/50">No se encontraron usuarios</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="text-left p-3 text-white/50 font-medium">Email</th>
                    <th className="text-left p-3 text-white/50 font-medium">Estado</th>
                    <th className="text-left p-3 text-white/50 font-medium">Plan</th>
                    <th className="text-left p-3 text-white/50 font-medium">Período</th>
                    <th className="text-left p-3 text-white/50 font-medium">Registro</th>
                    <th className="text-left p-3 text-white/50 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => (
                    <tr key={user.id} className="border-t border-white/5 hover:bg-white/5">
                      <td className="p-3 text-white">{user.email || user.id?.slice(0,8)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          user.subscription?.status === 'active' || user.subscription?.status === 'activo' ? 'bg-emerald-500/20 text-emerald-400' :
                          user.subscription?.status === 'trial' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>{user.subscription?.status || 'trial'}</span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          user.subscription?.plan?.includes('elite') || user.subscription?.plan?.includes('élite') ? 'bg-purple-500/20 text-purple-400' :
                          user.subscription?.plan?.includes('premium') ? 'bg-cyan-500/20 text-cyan-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>{user.subscription?.plan_name || user.subscription?.plan || 'Trial'}</span>
                      </td>
                      <td className="p-3 text-white/70">{user.subscription?.period || '-'}</td>
                      <td className="p-3 text-white/50">{formatDate(user.created_at)}</td>
                      <td className="p-3 flex gap-2">
                        <button onClick={() => { setNewUser({ user_id: user.id, email: user.email, plan: 'elite', status: 'active', period: 'anual' }); setShowAddUser(true); }} className="p-1 hover:bg-white/10 rounded text-cyan-400">✏️</button>
                        <button onClick={() => deleteUser(user.id)} className="p-1 hover:bg-white/10 rounded text-red-400">🗑️</button>
                        <button onClick={() => navigator.clipboard.writeText(user.email)} className="p-1 hover:bg-white/10 rounded text-white/50">📋</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Marketing Actions */}
        <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-4">
          <h3 className="text-white font-bold mb-4">🎯 Acciones de Marketing</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <button onClick={() => copyEmails(u => u.subscription?.status === 'trial')} className="p-4 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl text-amber-400">
              <div className="text-2xl mb-2">🟡</div>
              <div className="font-bold">Copiar emails Trial</div>
              <div className="text-sm opacity-70">{stats.trial || 0} usuarios</div>
            </button>
            <button onClick={() => copyEmails(u => u.subscription?.status === 'expired')} className="p-4 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-red-400">
              <div className="text-2xl mb-2">🔴</div>
              <div className="font-bold">Copiar emails Expirados</div>
              <div className="text-sm opacity-70">{stats.expired || 0} usuarios</div>
            </button>
            <button onClick={() => copyEmails(() => true)} className="p-4 bg-white/5 hover:bg-white/10 rounded-xl text-white/70">
              <div className="text-2xl mb-2">📧</div>
              <div className="font-bold">Copiar todos los emails</div>
              <div className="text-sm opacity-70">{stats.total || 0} usuarios</div>
            </button>
            <button onClick={exportCSV} className="p-4 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl text-emerald-400">
              <div className="text-2xl mb-2">📥</div>
              <div className="font-bold">Exportar CSV</div>
              <div className="text-sm opacity-70">Descargar datos</div>
            </button>
          </div>
        </div>
      </div>

      {/* Modal Agregar Usuario */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d0d12] rounded-2xl border border-white/10 p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-4">➕ Agregar/Editar Usuario</h2>
            <form onSubmit={addUser} className="space-y-4">
              <div>
                <label className="text-white/50 text-sm block mb-1">User ID (de Supabase Auth)</label>
                <input value={newUser.user_id} onChange={(e) => setNewUser({...newUser, user_id: e.target.value})} placeholder="ej: e7229c80-ea49-478c-..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm" required />
              </div>
              <div>
                <label className="text-white/50 text-sm block mb-1">Email (opcional)</label>
                <input value={newUser.email} onChange={(e) => setNewUser({...newUser, email: e.target.value})} placeholder="usuario@email.com" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm" />
              </div>
              <div>
                <label className="text-white/50 text-sm block mb-1">Plan</label>
                <select value={newUser.plan} onChange={(e) => setNewUser({...newUser, plan: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm">
                  <option value="básico">Básico</option>
                  <option value="de primera calidad">Premium</option>
                  <option value="élite">Elite</option>
                </select>
              </div>
              <div>
                <label className="text-white/50 text-sm block mb-1">Estado</label>
                <select value={newUser.status} onChange={(e) => setNewUser({...newUser, status: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm">
                  <option value="activo">Activo</option>
                  <option value="trial">Trial</option>
                  <option value="expired">Expirado</option>
                </select>
              </div>
              <div>
                <label className="text-white/50 text-sm block mb-1">Período</label>
                <select value={newUser.period} onChange={(e) => setNewUser({...newUser, period: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm">
                  <option value="mensual">Mensual</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddUser(false)} className="flex-1 py-2 bg-white/10 rounded-xl text-white">Cancelar</button>
                <button type="submit" className="flex-1 py-2 bg-emerald-500 rounded-xl text-black font-bold">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
