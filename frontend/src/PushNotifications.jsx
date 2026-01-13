// =============================================
// TRADING MASTER PRO - PUSH NOTIFICATIONS COMPONENT
// Componente para gestionar notificaciones push
// =============================================

import { useState, useEffect } from 'react';

// URL del backend
const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// Límites por plan para mostrar al usuario
const PLAN_LIMITS = {
  trial: { enabled: false, maxPerDay: 0, description: 'No disponible' },
  basic: { enabled: true, maxPerDay: 10, description: 'Hasta 10 notificaciones/día' },
  premium: { enabled: true, maxPerDay: 25, description: 'Hasta 25 notificaciones/día' },
  elite: { enabled: true, maxPerDay: 999, description: 'Notificaciones ilimitadas' }
};

// Función para convertir VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Detectar tipo de dispositivo
function getDeviceType() {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

// Verificar si las notificaciones están soportadas
function isPushSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

export default function PushNotifications({ userId, userPlan = 'trial' }) {
  const [permission, setPermission] = useState('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [vapidKey, setVapidKey] = useState(null);
  const [testSent, setTestSent] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  const planLimits = PLAN_LIMITS[userPlan] || PLAN_LIMITS.trial;

  // Verificar soporte y estado inicial
  useEffect(() => {
    // Verificar soporte primero
    if (!isPushSupported()) {
      setIsSupported(false);
      setIsLoading(false);
      return;
    }
    
    setPermission(Notification.permission);
    checkSubscription();
  }, [userId]);

  const checkSubscription = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Obtener VAPID key del servidor
      const vapidResponse = await fetch(`${API_URL}/api/push/vapid-key`);
      if (!vapidResponse.ok) {
        throw new Error('Push notifications no disponibles en el servidor');
      }
      const vapidData = await vapidResponse.json();
      setVapidKey(vapidData.publicKey);

      // Verificar si ya está suscrito
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);

      // Obtener estadísticas si está suscrito
      if (subscription && userId) {
        try {
          const statsResponse = await fetch(`${API_URL}/api/push/stats/${userId}`);
          if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            setStats(statsData.stats);
          }
        } catch (e) {
          console.log('No se pudieron obtener estadísticas');
        }
      }

      setPermission(Notification.permission);
    } catch (err) {
      console.error('Error checking subscription:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Solicitar permiso y suscribir
  const subscribe = async () => {
    if (!planLimits.enabled) {
      setError('Las notificaciones no están disponibles en tu plan actual');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Solicitar permiso
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== 'granted') {
        throw new Error('Permiso de notificaciones denegado');
      }

      // Obtener service worker
      const registration = await navigator.serviceWorker.ready;

      // Crear suscripción
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });

      // Enviar al servidor
      const response = await fetch(`${API_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          subscription: subscription.toJSON(),
          deviceInfo: {
            userAgent: navigator.userAgent,
            deviceType: getDeviceType()
          }
        })
      });

      if (!response.ok) {
        throw new Error('Error al registrar suscripción');
      }

      setIsSubscribed(true);
      
      // Refrescar estadísticas
      await checkSubscription();

    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Cancelar suscripción
  const unsubscribe = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Eliminar del servidor
        await fetch(`${API_URL}/api/push/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            endpoint: subscription.endpoint
          })
        });

        // Cancelar suscripción local
        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
      setStats(null);

    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Enviar notificación de prueba
  const sendTest = async () => {
    setIsLoading(true);
    setTestSent(false);

    try {
      const response = await fetch(`${API_URL}/api/push/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      if (!response.ok) {
        throw new Error('Error al enviar notificación de prueba');
      }

      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);

    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // No soportado
  if (!isSupported) {
    return (
      <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
            <span className="text-2xl">🔕</span>
          </div>
          <div>
            <h3 className="text-white font-semibold">Notificaciones Push</h3>
            <p className="text-white/40 text-sm">No disponible</p>
          </div>
        </div>
        
        <div className="p-4 bg-white/5 rounded-lg border border-white/10">
          <p className="text-white/60 text-sm">
            Tu navegador no soporta notificaciones push. Usa Chrome, Edge o Safari para esta función.
          </p>
        </div>
      </div>
    );
  }

  // Plan no tiene notificaciones
  if (!planLimits.enabled) {
    return (
      <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
            <span className="text-2xl">🔔</span>
          </div>
          <div>
            <h3 className="text-white font-semibold">Notificaciones Push</h3>
            <p className="text-white/40 text-sm">No disponible en tu plan</p>
          </div>
        </div>
        
        <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
          <p className="text-amber-400 text-sm">
            ⚡ Las notificaciones push están disponibles desde el plan <strong>Básico</strong>.
            Actualiza tu plan para recibir alertas de señales en tu dispositivo.
          </p>
        </div>
      </div>
    );
  }

  // Loading inicial
  if (isLoading && !isSubscribed && !error) {
    return (
      <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/30 border-t-emerald-400 rounded-full animate-spin"></div>
          </div>
          <div>
            <h3 className="text-white font-semibold">Notificaciones Push</h3>
            <p className="text-white/40 text-sm">Verificando estado...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0d0d12] rounded-xl border border-white/5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            isSubscribed ? 'bg-emerald-500/20' : 'bg-white/10'
          }`}>
            <span className="text-2xl">{isSubscribed ? '🔔' : '🔕'}</span>
          </div>
          <div>
            <h3 className="text-white font-semibold">Notificaciones Push</h3>
            <p className="text-white/40 text-sm">
              {isSubscribed ? 'Activadas' : 'Desactivadas'} • {planLimits.description}
            </p>
          </div>
        </div>
        
        {/* Badge de estado */}
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          isSubscribed 
            ? 'bg-emerald-500/20 text-emerald-400' 
            : 'bg-white/10 text-white/60'
        }`}>
          {isSubscribed ? '● Activo' : '○ Inactivo'}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">⚠️ {error}</p>
        </div>
      )}

      {/* Estado del permiso */}
      {permission === 'denied' && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-amber-400 text-sm">
            🚫 Has bloqueado las notificaciones. Para activarlas, ve a la configuración de tu navegador y permite notificaciones para este sitio.
          </p>
        </div>
      )}

      {/* Estadísticas si está suscrito */}
      {isSubscribed && stats && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{stats.dailyCount || 0}</p>
            <p className="text-white/40 text-xs">Hoy</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{stats.devicesCount || 0}</p>
            <p className="text-white/40 text-xs">Dispositivos</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{planLimits.maxPerDay === 999 ? '∞' : planLimits.maxPerDay}</p>
            <p className="text-white/40 text-xs">Máximo/día</p>
          </div>
        </div>
      )}

      {/* Información del plan */}
      <div className="mb-6 p-4 bg-white/5 rounded-lg">
        <h4 className="text-white/80 font-medium text-sm mb-2">📋 Tu plan incluye:</h4>
        <ul className="text-white/60 text-sm space-y-1">
          {userPlan === 'basic' && (
            <>
              <li>• Notificaciones de Step, Oro y V75</li>
              <li>• Máximo 10 notificaciones por día</li>
            </>
          )}
          {userPlan === 'premium' && (
            <>
              <li>• Notificaciones de 5 activos (Step, Oro, V75, GBP, BTC)</li>
              <li>• Máximo 25 notificaciones por día</li>
              <li>• Solo señales con Score ≥70</li>
            </>
          )}
          {userPlan === 'elite' && (
            <>
              <li>• Notificaciones de TODOS los activos</li>
              <li>• Sin límite de notificaciones</li>
              <li>• Todas las señales sin filtro de score</li>
            </>
          )}
        </ul>
      </div>

      {/* Botones de acción */}
      <div className="flex flex-col gap-3">
        {!isSubscribed ? (
          <button
            onClick={subscribe}
            disabled={isLoading || permission === 'denied'}
            className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold transition-all ${
              isLoading || permission === 'denied'
                ? 'bg-white/10 text-white/40 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-black'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                Activando...
              </>
            ) : (
              <>
                <span>🔔</span>
                Activar Notificaciones
              </>
            )}
          </button>
        ) : (
          <>
            {/* Botón de prueba */}
            <button
              onClick={sendTest}
              disabled={isLoading}
              className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold transition-all ${
                testSent
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {testSent ? (
                <>
                  <span>✓</span>
                  ¡Notificación enviada!
                </>
              ) : (
                <>
                  <span>🧪</span>
                  Enviar Notificación de Prueba
                </>
              )}
            </button>

            {/* Botón de desactivar */}
            <button
              onClick={unsubscribe}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-medium transition-all border border-red-500/20"
            >
              <span>🔕</span>
              Desactivar Notificaciones
            </button>
          </>
        )}
      </div>

      {/* Últimas notificaciones */}
      {isSubscribed && stats?.recentNotifications?.length > 0 && (
        <div className="mt-6">
          <h4 className="text-white/60 text-sm mb-3">Últimas notificaciones:</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {stats.recentNotifications.slice(0, 5).map((notif, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                <span className="text-lg">{notif.title?.includes('LONG') ? '🟢' : notif.title?.includes('SHORT') ? '🔴' : '🔔'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white/80 text-xs truncate">{notif.title}</p>
                  <p className="text-white/40 text-[10px]">
                    {new Date(notif.sent_at).toLocaleString('es-CO', { 
                      day: '2-digit', 
                      month: 'short', 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
