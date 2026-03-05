// NES Emulator Pro - Service Worker
const CACHE_NAME = 'nes-emulator-pro-v1';
const STATIC_CACHE = 'nes-static-v1';
const ROM_CACHE = 'nes-roms-v1';

// Статические ресурсы для кэширования
const STATIC_ASSETS = [
  '/nes-emulator-pro.html',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/jsnes@1.2.1/dist/jsnes.min.js'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Service Worker installed');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache:', error);
      })
  );
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== STATIC_CACHE && name !== ROM_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated');
        return self.clients.claim();
      })
  );
});

// Обработка запросов
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // ROM файлы - Network First с кэшированием
  if (url.pathname.includes('/games/') && url.pathname.endsWith('.nes')) {
    event.respondWith(networkFirst(event.request, ROM_CACHE));
    return;
  }
  
  // jsnes библиотека - Cache First
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }
  
  // Статические ресурсы - Cache First
  if (url.pathname === '/nes-emulator-pro.html' || url.pathname === '/manifest.json') {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }
  
  // Остальное - Network First
  event.respondWith(networkFirst(event.request, STATIC_CACHE));
});

// Стратегия Cache First
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  
  if (cached) {
    console.log('[SW] Cache hit:', request.url);
    return cached;
  }
  
  console.log('[SW] Cache miss, fetching:', request.url);
  
  try {
    const response = await fetch(request);
    
    if (response.ok) {
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.error('[SW] Fetch failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

// Стратегия Network First
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    const response = await fetch(request);
    
    if (response.ok) {
      console.log('[SW] Network success, caching:', request.url);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    
    const cached = await cache.match(request);
    
    if (cached) {
      return cached;
    }
    
    console.error('[SW] No cache available for:', request.url);
    return new Response('Offline', { status: 503 });
  }
}

// Обработка сообщений от клиента
self.addEventListener('message', (event) => {
  if (event.data.type === 'CACHE_ROM') {
    cacheROM(event.data.url, event.data.name);
  }
  
  if (event.data.type === 'GET_CACHE_SIZE') {
    getCacheSize().then((size) => {
      event.ports[0].postMessage({ size });
    });
  }
  
  if (event.data.type === 'CLEAR_ROM_CACHE') {
    clearROMCache().then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});

// Кэширование ROM
async function cacheROM(url, name) {
  const cache = await caches.open(ROM_CACHE);
  
  try {
    const response = await fetch(url);
    
    if (response.ok) {
      await cache.put(url, response);
      console.log('[SW] ROM cached:', name);
      
      // Сохраняем метаданные в IndexedDB
      await saveROMMetadata(name, url, response.headers.get('content-length'));
    }
  } catch (error) {
    console.error('[SW] Failed to cache ROM:', error);
  }
}

// Получение размера кэша
async function getCacheSize() {
  const cacheNames = await caches.keys();
  let totalSize = 0;
  
  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    
    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.clone().blob();
        totalSize += blob.size;
      }
    }
  }
  
  return totalSize;
}

// Очистка кэша ROM
async function clearROMCache() {
  const cache = await caches.open(ROM_CACHE);
  const keys = await cache.keys();
  
  for (const request of keys) {
    await cache.delete(request);
  }
  
  console.log('[SW] ROM cache cleared');
}

// IndexedDB для метаданных ROM
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NES-emulator-db', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('roms')) {
        db.createObjectStore('roms', { keyPath: 'name' });
      }
      
      if (!db.objectStoreNames.contains('saveStates')) {
        db.createObjectStore('saveStates', { keyPath: 'id' });
      }
    };
  });
}

async function saveROMMetadata(name, url, size) {
  const db = await openDB();
  const tx = db.transaction('roms', 'readwrite');
  const store = tx.objectStore('roms');
  
  await store.put({
    name,
    url,
    size: parseInt(size) || 0,
    cachedAt: Date.now()
  });
  
  db.close();
}

// Background sync для офлайн-действий
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-saves') {
    event.waitUntil(syncSaveStates());
  }
});

async function syncSaveStates() {
  // Синхронизация сохранений при восстановлении связи
  console.log('[SW] Syncing save states...');
}

// Push-уведомления
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'New notification from NES Emulator Pro',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      vibrate: [100, 50, 100],
      data: data.data || {},
      actions: [
        { action: 'play', title: 'Play Now' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'NES Emulator Pro', options)
    );
  }
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'play') {
    event.waitUntil(
      clients.openWindow('/nes-emulator-pro.html')
    );
  }
});

console.log('[SW] Service Worker loaded');
