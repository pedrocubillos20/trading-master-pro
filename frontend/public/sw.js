// Trading Master Pro - Service Worker v24.2
const CACHE = 'tmp-v24-2'
const STATIC = ['/', '/index.html', '/src/index.css']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).catch(()=>{}))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  )
})

// Push notifications
self.addEventListener('push', e => {
  let data = {}
  try { data = e.data?.json() } catch { data = { title:'TradingPro', body: e.data?.text()||'Nueva señal disponible' } }

  const options = {
    body: data.body || data.message || 'Nueva señal disponible',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/', signalId: data.signalId },
    actions: [
      { action: 'open', title: 'Ver señal' },
      { action: 'close', title: 'Cerrar' }
    ],
    requireInteraction: data.requireInteraction || false,
    tag: data.tag || 'trading-signal'
  }

  e.waitUntil(
    self.registration.showNotification(data.title || 'Trading Master Pro 📊', options)
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  if (e.action === 'close') return
  e.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true })
      .then(cls => {
        const url = e.notification.data?.url || '/'
        const open = cls.find(c => c.url.includes(url))
        if (open) return open.focus()
        return clients.openWindow(url)
      })
  )
})
