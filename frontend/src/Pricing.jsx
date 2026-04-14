import React, { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

const CheckIcon = () => (
  <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);
const XIcon = () => (
  <svg className="w-4 h-4 text-white/20 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const PLANS = [
  {
    slug: 'basico',
    name: 'Básico',
    emoji: '🥉',
    description: 'Para empezar con los mejores activos',
    color: 'from-slate-500 to-slate-600',
    features: [
      '🥇 Oro (XAU/USD)',
      '📊 Step Index',
      '6 modelos SMC',
      'Gráfico M5 en tiempo real',
      'Horario: 6AM–2PM Colombia',
      'Soporte por email',
    ],
    notIncluded: ['Volatility 100', 'Acceso 24/7', 'Alertas Telegram'],
    prices: { monthly:{cop:29900,usd:9}, semiannual:{cop:152000,usd:46,discount:15}, annual:{cop:269000,usd:81,discount:25} }
  },
  {
    slug: 'premium',
    name: 'Premium',
    emoji: '🥈',
    description: 'Los mejores 3 activos + acceso 24/7',
    popular: true,
    color: 'from-emerald-500 to-cyan-500',
    features: [
      '🥇 Oro (XAU/USD)',
      '📊 Step Index',
      '🔥 Volatility 100 (24/7)',
      '9 modelos SMC',
      'Gráficos M5 y H1',
      'Acceso 24/7 🌙',
      'Alertas Telegram',
    ],
    notIncluded: ['Boom/Crash', 'Forex avanzado'],
    prices: { monthly:{cop:59900,usd:19}, semiannual:{cop:305000,usd:97,discount:15}, annual:{cop:539000,usd:171,discount:25} }
  },
  {
    slug: 'elite',
    name: 'Elite',
    emoji: '🥇',
    description: 'Todo desbloqueado, sin límites',
    color: 'from-purple-500 to-pink-500',
    features: [
      '🥇 Oro (XAU/USD)',
      '📊 Step Index',
      '🔥 Volatility 100',
      '📈 Volatility 75',
      '💥 Boom & Crash 1000/500',
      '12 modelos SMC completos',
      'Todos los timeframes',
      'Acceso 24/7 🌙',
      'Alertas Telegram + Canal privado',
      'Soporte prioritario 24/7',
    ],
    notIncluded: [],
    prices: { monthly:{cop:99900,usd:29}, semiannual:{cop:509000,usd:148,discount:15}, annual:{cop:899000,usd:261,discount:25} }
  }
];

const PERIODS = [
  { key:'monthly',    label:'Mensual',  months:1  },
  { key:'semiannual', label:'6 Meses',  months:6,  badge:'-15%' },
  { key:'annual',     label:'Anual',    months:12, badge:'-25%' },
];

export default function Pricing({ user, subscription, onClose }) {
  const [period,   setPeriod]   = useState('monthly');
  const [currency, setCurrency] = useState('COP');
  const [loading,  setLoading]  = useState(null);
  const [error,    setError]    = useState('');

  const fmt = (plan) => {
    const p = plan.prices[period];
    return currency === 'COP'
      ? `$${(p.cop).toLocaleString('es-CO')}`
      : `$${p.usd} USD`;
  };

  const monthly = (plan) => {
    const p = plan.prices[period];
    const months = PERIODS.find(x=>x.key===period)?.months || 1;
    const total = currency === 'COP' ? p.cop : p.usd;
    if (months === 1) return null;
    const m = Math.round(total / months);
    return currency === 'COP' ? `$${m.toLocaleString('es-CO')}/mes` : `$${m} USD/mes`;
  };

  const handleSelect = async (plan) => {
    if (!user) { setError('Debes iniciar sesión'); return; }
    setLoading(plan.slug);
    setError('');
    try {
      const months = PERIODS.find(x=>x.key===period)?.months || 1;
      const r = await fetch(`${API_URL}/api/subscription/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.email || user.id, plan: plan.slug, periodo: period, months })
      });
      const d = await r.json();
      if (d.success || d.ok) { onClose?.(); window.location.reload(); }
      else setError(d.error || 'Error al procesar. Contacta soporte.');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    }
    setLoading(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0d1117] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-[#0d1117]/95 backdrop-blur px-6 pt-6 pb-4 border-b border-white/8 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Elige tu Plan</h2>
            <p className="text-white/50 text-sm mt-1">5 días de prueba gratis en todos los planes</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Period + currency */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
            <div className="flex bg-white/5 rounded-xl p-1 gap-1">
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${period===p.key?'bg-emerald-500 text-white':'text-white/60 hover:text-white'}`}>
                  {p.label}
                  {p.badge && <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded-full">{p.badge}</span>}
                </button>
              ))}
            </div>
            <div className="flex bg-white/5 rounded-xl p-1 gap-1">
              {['COP','USD'].map(c => (
                <button key={c} onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${currency===c?'bg-white/15 text-white':'text-white/50 hover:text-white'}`}>
                  {c === 'COP' ? '🇨🇴 COP' : '🌎 USD'}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm text-center mb-4 bg-red-500/10 rounded-lg p-2">{error}</p>}

          {/* Plans grid */}
          <div className="grid md:grid-cols-3 gap-4">
            {PLANS.map(plan => (
              <div key={plan.slug} className={`relative rounded-2xl border p-5 flex flex-col transition ${
                plan.popular
                  ? 'border-emerald-500/50 bg-emerald-500/5 shadow-lg shadow-emerald-500/10'
                  : 'border-white/10 bg-white/3 hover:border-white/20'
              }`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">MÁS POPULAR</span>
                  </div>
                )}

                <div className="text-3xl mb-2">{plan.emoji}</div>
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <p className="text-white/40 text-xs mb-3">{plan.description}</p>

                <div className="mb-1">
                  <span className="text-3xl font-bold text-white">{fmt(plan)}</span>
                  <span className="text-white/40 text-sm ml-1">/mes</span>
                </div>
                {monthly(plan) && <p className="text-white/30 text-xs mb-4">{monthly(plan)}</p>}
                {!monthly(plan) && <div className="mb-4"/>}

                <button onClick={() => handleSelect(plan)} disabled={!!loading}
                  className={`w-full py-2.5 rounded-xl font-bold text-sm transition mb-5 ${
                    plan.popular
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                      : 'bg-white/10 hover:bg-white/15 text-white'
                  } disabled:opacity-50`}>
                  {loading === plan.slug ? 'Procesando...' : 'Empezar ahora'}
                </button>

                <div className="space-y-2 flex-1">
                  {plan.features.map((f,i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckIcon/>
                      <span className="text-white/80 text-xs">{f}</span>
                    </div>
                  ))}
                  {plan.notIncluded.map((f,i) => (
                    <div key={i} className="flex items-start gap-2">
                      <XIcon/>
                      <span className="text-white/25 text-xs line-through">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-white/30 text-xs mt-5">
            Todos los planes incluyen 5 días de prueba gratuita · Cancela cuando quieras
          </p>
        </div>
      </div>
    </div>
  );
}
