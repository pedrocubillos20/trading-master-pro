import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// Ícono de check
const CheckIcon = () => (
  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

// Planes con características
const PLANS = [
  {
    slug: 'basic',
    name: 'Básico',
    description: 'Ideal para comenzar en el trading',
    color: 'from-slate-500 to-slate-600',
    features: [
      '2 activos (Step Index, V75)',
      '5 señales por día',
      '3 modelos SMC',
      'Gráfico M5',
      'Soporte por email'
    ],
    notIncluded: ['Alertas Telegram', 'ELISA IA Chat', 'Trailing Stop'],
    prices: {
      monthly: { cop: 29900, usd: 9 },
      semiannual: { cop: 152000, usd: 46, discount: 15 },
      annual: { cop: 269000, usd: 81, discount: 25 }
    }
  },
  {
    slug: 'premium',
    name: 'Premium',
    description: 'Para traders serios',
    popular: true,
    color: 'from-emerald-500 to-cyan-500',
    features: [
      '4 activos (+XAU/USD, GBP/USD)',
      '15 señales por día',
      '5 modelos SMC',
      'Gráficos M5 y H1',
      'Alertas Telegram',
      'Trailing Stop automático',
      'Soporte por chat'
    ],
    notIncluded: ['ELISA IA Chat completo'],
    prices: {
      monthly: { cop: 59900, usd: 19 },
      semiannual: { cop: 305000, usd: 97, discount: 15 },
      annual: { cop: 539000, usd: 171, discount: 25 }
    }
  },
  {
    slug: 'elite',
    name: 'Elite',
    description: 'Acceso total sin límites',
    color: 'from-purple-500 to-pink-500',
    features: [
      '5 activos (todos incluidos)',
      'Señales ilimitadas',
      '6 modelos SMC',
      'Todos los timeframes',
      'Alertas Telegram + Canal privado',
      'ELISA IA Chat avanzado',
      'Sistema de aprendizaje IA',
      'Análisis semanal PDF',
      'Soporte prioritario 24/7'
    ],
    notIncluded: [],
    prices: {
      monthly: { cop: 99900, usd: 29 },
      semiannual: { cop: 509000, usd: 148, discount: 15 },
      annual: { cop: 899000, usd: 261, discount: 25 }
    }
  }
];

const PERIODS = [
  { key: 'monthly', label: 'Mensual', months: 1 },
  { key: 'semiannual', label: '6 Meses', months: 6, badge: '-15%' },
  { key: 'annual', label: 'Anual', months: 12, badge: '-25%' }
];

export default function Pricing({ user, subscription, onClose }) {
  const [period, setPeriod] = useState('monthly');
  const [currency, setCurrency] = useState('COP');
  const [loading, setLoading] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const formatPrice = (plan) => {
    const price = plan.prices[period];
    if (currency === 'COP') {
      return `$${price.cop.toLocaleString('es-CO')}`;
    }
    return `$${price.usd} USD`;
  };

  const getMonthlyEquivalent = (plan) => {
    const price = plan.prices[period];
    const months = PERIODS.find(p => p.key === period).months;
    const monthly = currency === 'COP' 
      ? Math.round(price.cop / months)
      : Math.round((price.usd / months) * 100) / 100;
    
    if (period === 'monthly') return null;
    
    return currency === 'COP' 
      ? `$${monthly.toLocaleString('es-CO')}/mes`
      : `$${monthly}/mes`;
  };

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan);
    setShowPaymentModal(true);
  };

  const handlePayWithWompi = async () => {
    if (!selectedPlan || !user) return;
    
    setLoading(selectedPlan.slug);
    
    try {
      const response = await fetch(`${API_URL}/api/payments/wompi/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          planSlug: selectedPlan.slug,
          period,
          customerEmail: user.email,
          customerName: user.email.split('@')[0]
        })
      });
      
      const data = await response.json();
      
      if (data.error) {
        alert('Error: ' + data.error);
        setLoading(null);
        return;
      }

      // Abrir widget de Wompi
      const checkout = new window.WidgetCheckout({
        currency: data.currency,
        amountInCents: data.amountCents,
        reference: data.reference,
        publicKey: data.publicKey,
        signature: { integrity: data.signature },
        redirectUrl: data.redirectUrl,
        customerData: {
          email: data.customerEmail,
          fullName: data.customerName
        }
      });
      
      checkout.open((result) => {
        const transaction = result.transaction;
        console.log('Wompi result:', transaction);
        
        if (transaction.status === 'APPROVED') {
          alert('¡Pago exitoso! Tu suscripción está activa.');
          setShowPaymentModal(false);
          onClose?.();
        } else if (transaction.status === 'DECLINED') {
          alert('El pago fue rechazado. Intenta con otro método.');
        }
        
        setLoading(null);
      });
      
    } catch (error) {
      console.error('Error:', error);
      alert('Error procesando el pago');
      setLoading(null);
    }
  };

  // Cargar script de Wompi
  useEffect(() => {
    if (!document.getElementById('wompi-script')) {
      const script = document.createElement('script');
      script.id = 'wompi-script';
      script.src = 'https://checkout.wompi.co/widget.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0d0d12] rounded-3xl border border-white/10 w-full max-w-6xl max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#0d0d12] border-b border-white/10 p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-white">Elige tu Plan</h2>
            <p className="text-white/50 mt-1">5 días de prueba gratis en todos los planes</p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Controles */}
        <div className="p-6 flex flex-col sm:flex-row items-center justify-center gap-4">
          {/* Selector de período */}
          <div className="flex bg-white/5 rounded-xl p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  period === p.key 
                    ? 'bg-emerald-500 text-black' 
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {p.label}
                {p.badge && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    period === p.key ? 'bg-black/20' : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {p.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Selector de moneda */}
          <div className="flex bg-white/5 rounded-xl p-1">
            <button
              onClick={() => setCurrency('COP')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                currency === 'COP' ? 'bg-white/10 text-white' : 'text-white/60'
              }`}
            >
              🇨🇴 COP
            </button>
            <button
              onClick={() => setCurrency('USD')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                currency === 'USD' ? 'bg-white/10 text-white' : 'text-white/60'
              }`}
            >
              🌎 USD
            </button>
          </div>
        </div>

        {/* Planes */}
        <div className="p-6 pt-0 grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div 
              key={plan.slug}
              className={`relative rounded-2xl border ${
                plan.popular 
                  ? 'border-emerald-500/50 bg-emerald-500/5' 
                  : 'border-white/10 bg-white/5'
              } p-6 flex flex-col`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                    MÁS POPULAR
                  </span>
                </div>
              )}

              {/* Nombre y descripción */}
              <div className="text-center mb-6">
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${plan.color} mb-3`}>
                  <span className="text-2xl">
                    {plan.slug === 'basic' ? '🥉' : plan.slug === 'premium' ? '🥈' : '🥇'}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                <p className="text-white/50 text-sm mt-1">{plan.description}</p>
              </div>

              {/* Precio */}
              <div className="text-center mb-6">
                <div className="text-4xl font-bold text-white">
                  {formatPrice(plan)}
                </div>
                <div className="text-white/40 text-sm mt-1">
                  {period === 'monthly' ? 'por mes' : `por ${PERIODS.find(p => p.key === period).months} meses`}
                </div>
                {getMonthlyEquivalent(plan) && (
                  <div className="text-emerald-400 text-sm mt-1">
                    {getMonthlyEquivalent(plan)}
                  </div>
                )}
              </div>

              {/* Features */}
              <div className="flex-1 space-y-3 mb-6">
                {plan.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckIcon />
                    <span className="text-white/80 text-sm">{feature}</span>
                  </div>
                ))}
                {plan.notIncluded.map((feature, i) => (
                  <div key={i} className="flex items-start gap-3 opacity-40">
                    <svg className="w-5 h-5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-white/40 text-sm line-through">{feature}</span>
                  </div>
                ))}
              </div>

              {/* Botón */}
              <button
                onClick={() => handleSelectPlan(plan)}
                disabled={loading === plan.slug}
                className={`w-full py-3 rounded-xl font-semibold transition-all ${
                  plan.popular
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                } disabled:opacity-50`}
              >
                {loading === plan.slug ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    Procesando...
                  </span>
                ) : (
                  subscription?.plan === plan.slug ? 'Plan Actual' : 'Elegir Plan'
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 text-center">
          <p className="text-white/40 text-sm">
            💳 Pagos seguros con Wompi • 🔒 Cancela cuando quieras • 📧 Soporte 24/7
          </p>
        </div>
      </div>

      {/* Modal de confirmación de pago */}
      {showPaymentModal && selectedPlan && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-60 p-4">
          <div className="bg-[#0d0d12] rounded-2xl border border-white/10 w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-white mb-4">Confirmar Suscripción</h3>
            
            <div className="bg-white/5 rounded-xl p-4 mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-white/60">Plan</span>
                <span className="text-white font-medium">{selectedPlan.name}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-white/60">Período</span>
                <span className="text-white font-medium">
                  {PERIODS.find(p => p.key === period).label}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-white/10">
                <span className="text-white/60">Total</span>
                <span className="text-emerald-400 font-bold text-lg">
                  {formatPrice(selectedPlan)}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handlePayWithWompi}
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    💳 Pagar con Wompi
                  </>
                )}
              </button>
              
              <button
                onClick={() => setShowPaymentModal(false)}
                className="w-full py-3 bg-white/5 hover:bg-white/10 text-white font-medium rounded-xl transition-all"
              >
                Cancelar
              </button>
            </div>

            <p className="text-white/30 text-xs text-center mt-4">
              Al continuar, aceptas los términos de servicio
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
