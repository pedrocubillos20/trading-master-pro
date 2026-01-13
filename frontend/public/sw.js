// Trading Master Pro - Service Worker v2.0 con Push Notifications
const CACHE_NAME = 'trading-master-pro-v2';
const OFFLINE_URL = '/offline.html';

// Archivos para cachear en instalación
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker v2.0...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cacheando archivos esenciales');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.log('[SW] Error en cache:', err))
  );
});

// Activación - Limpiar caches viejos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando Service Worker v2.0...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Eliminando cache viejo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia de fetch: Network First, fallback to Cache
self.addEventListener('fetch', (event) => {
  // Solo manejar requests GET
  if (event.request.method !== 'GET') return;
  
  // Ignorar requests a APIs externas y WebSockets
  const url = new URL(event.request.url);
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.hostname.includes('supabase') || url.hostname.includes('railway')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cachear respuestas exitosas
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        // Si falla la red, buscar en cache
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // Si es una navegación y no hay cache, mostrar página offline
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      })
  );
});

// Manejar mensajes desde la app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// =============================================
// PUSH NOTIFICATIONS
// =============================================

// Recibir notificación push
self.addEventListener('push', (event) => {
  console.log('[SW] Push recibido');
  
  let data = {
    title: 'Trading Master Pro',
    body: 'Nueva notificación',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: 'default',
    data: { url: '/' }
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = { ...data, ...payload };
    }
  } catch (e) {
    console.error('[SW] Error parseando push data:', e);
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/icon-72x72.png',
    tag: data.tag || 'signal-notification',
    renotify: data.renotify !== false,
    requireInteraction: data.requireInteraction || false,
    vibrate: data.vibrate || [100, 50, 100, 50, 100],
    data: data.data || { url: '/' },
    actions: data.actions || [
      { action: 'view', title: '👀 Ver' },
      { action: 'dismiss', title: '❌ Cerrar' }
    ],
    // Estilo visual
    image: data.image || null,
    timestamp: data.timestamp || Date.now()
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Click en notificación
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event.action);
  
  event.notification.close();

  // Si el usuario hace click en "dismiss", solo cerrar
  if (event.action === 'dismiss') {
    return;
  }

  // Obtener la URL de destino
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Buscar si ya hay una ventana abierta
        for (const client of windowClients) {
          if (client.url.includes(self.registration.scope) && 'focus' in client) {
            // Navegar a la URL y enfocar
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // Si no hay ventana abierta, abrir una nueva
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Cerrar notificación
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification cerrada');
});

// Push subscription change (cuando el token cambia)
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push subscription changed');
  
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: self.VAPID_PUBLIC_KEY
    })
    .then((subscription) => {
      // Enviar nueva suscripción al servidor
      return fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          // userId se debe manejar desde el frontend
        })
      });
    })
  );
});

console.log('[SW] Service Worker v2.0 con Push Notifications cargado');
