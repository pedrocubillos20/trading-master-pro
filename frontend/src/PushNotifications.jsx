// =============================================
// TRADING MASTER PRO - PUSH NOTIFICATIONS COMPONENT
// =============================================

import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// Límites por plan (usando nombres exactos de la API)
const PLAN_LIMITS = {
  free: { enabled: false, maxPerDay: 0, description: 'No disponible' },
  trial: { enabled: false, maxPerDay: 0, description: 'No disponible' },
  basico: { enabled: true, maxPerDay: 10, description: 'Hasta 10/día' },
  basic: { enabled: true, maxPerDay: 10, description: 'Hasta 10/día' },
  premium: { enabled: true, maxPerDay: 25, description: 'Hasta 25/día' },
  elite: { enabled: true, maxPerDay: 999, description: 'Ilimitadas' }
};

export default function PushNotifications({ userId, userPlan = 'trial' }) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Normalizar plan
  const normalizedPlan = userPlan?.toLowerCase() || 'trial';
  const planLimits = PLAN_LIMITS[normalizedPlan] || PLAN_LIMITS.trial;

  useEffect(() => {
    checkSupport();
  }, []);

  const checkSupport = async () => {
    try {
      if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
        setStatus('unsupported');
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setStatus(subscription ? 'subscribed' : 'ready');
      } catch (e) {
        setStatus('ready');
      }
    } catch (err) {
      setStatus('ready');
    }
  };

  const handleSubscribe = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Permiso denegado');
      }

      const vapidRes = await fetch(`${API_URL}/api/push/vapid-key`);
      if (!vapidRes.ok) throw new Error('Server no disponible');
      const { publicKey } = await vapidRes.json();

      const applicationServerKey = urlBase64ToUint8Array(publicKey);
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      await fetch(`${API_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          subscription: subscription.toJSON(),
          deviceInfo: { deviceType: 'web' }
        })
      });

      setStatus('subscribed');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await fetch(`${API_URL}/api/push/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, endpoint: subscription.endpoint })
        });
      }
      setStatus('ready');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTest = async () => {
    setIsLoading(true);
    try {
      await fetch(`${API_URL}/api/push/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      alert('¡Notificación de prueba enviada!');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // No soportado
  if (status === 'unsupported') {
    return (
      <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
            <span className="text-2xl">🔕</span>
          </div>
          <div>
            <h3 className="text-white font-semibold">Notificaciones Push</h3>
            <p className="text-white/40 text-sm">No soportado en este navegador</p>
          </div>
        </div>
      </div>
    );
  }

  // Plan sin notificaciones (free o trial)
  if (!planLimits.enabled) {
    return (
      <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
            <span className="text-2xl">🔔</span>
          </div>
          <div>
            <h3 className="text-white font-semibold">Notificaciones Push</h3>
            <p className="text-white/40 text-sm">Disponible desde plan Básico</p>
          </div>
        </div>
        <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
          <p className="text-amber-400 text-sm">
            ⚡ Actualiza tu plan para recibir alertas de señales
          </p>
        </div>
      </div>
    );
  }

  // Loading
  if (status === 'loading') {
    return (
      <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin"></div>
          </div>
          <div>
            <h3 className="text-white font-semibold">Notificaciones Push</h3>
            <p className="text-white/40 text-sm">Verificando...</p>
          </div>
        </div>
      </div>
    );
  }

  // Componente principal - Plan con notificaciones habilitadas
  return (
    <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            status === 'subscribed' ? 'bg-emerald-500/20' : 'bg-white/10'
          }`}>
            <span className="text-2xl">{status === 'subscribed' ? '🔔' : '🔕'}</span>
          </div>
          <div>
            <h3 className="text-white font-semibold">Notificaciones Push</h3>
            <p className="text-white/40 text-sm">
              {status === 'subscribed' ? 'Activadas' : 'Desactivadas'} • {planLimits.description}
            </p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          status === 'subscribed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/60'
        }`}>
          {status === 'subscribed' ? '● Activo' : '○ Inactivo'}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">⚠️ {error}</p>
        </div>
      )}

      {/* Info del plan */}
      <div className="mb-4 p-3 bg-white/5 rounded-lg">
        <p className="text-white/60 text-sm">
          📋 <strong className="text-white/80">Tu plan ({normalizedPlan}):</strong>{' '}
          {normalizedPlan === 'basico' && 'Notificaciones de Step, Oro, V75 (máx 10/día)'}
          {normalizedPlan === 'premium' && 'Notificaciones de 5 activos (máx 25/día)'}
          {normalizedPlan === 'elite' && '✨ TODAS las señales sin límite'}
        </p>
      </div>

      {/* Botones */}
      <div className="flex flex-col gap-3">
        {status !== 'subscribed' ? (
          <button
            onClick={handleSubscribe}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-black font-semibold rounded-xl transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
            ) : (
              <span>🔔</span>
            )}
            {isLoading ? 'Activando...' : 'Activar Notificaciones'}
          </button>
        ) : (
          <>
            <button
              onClick={handleTest}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 w-full py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-all"
            >
              <span>🧪</span>
              Enviar Prueba
            </button>
            <button
              onClick={handleUnsubscribe}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/20"
            >
              <span>🔕</span>
              Desactivar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
