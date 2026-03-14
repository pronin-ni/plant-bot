/* eslint-disable no-undef */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

self.skipWaiting();
cleanupOutdatedCaches();

const PUSH_RECEIPT_CACHE = 'plant-pwa-push-receipts';
const PUSH_RECEIPT_PATH = '__push-receipt__';

function getScopedUrl(path = '') {
  return new URL(path, self.registration.scope).toString();
}

async function persistPushReceipt(receipt) {
  const cache = await caches.open(PUSH_RECEIPT_CACHE);
  const request = new Request(getScopedUrl(PUSH_RECEIPT_PATH));
  const response = new Response(JSON.stringify(receipt), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
  await cache.put(request, response);
}

async function notifyClients(receipt) {
  const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  await Promise.all(clientList.map((client) => client.postMessage({ type: 'PUSH_RECEIPT', receipt })));
}

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'plant-pwa-pages',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 24 * 60 * 60
      })
    ]
  })
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'plant-pwa-api',
    networkTimeoutSeconds: 4,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 80,
        maxAgeSeconds: 10 * 60
      })
    ]
  }),
  'GET'
);

registerRoute(
  ({ request }) => ['style', 'script', 'worker'].includes(request.destination),
  new StaleWhileRevalidate({
    cacheName: 'plant-pwa-assets',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 120,
        maxAgeSeconds: 7 * 24 * 60 * 60
      })
    ]
  })
);

registerRoute(
  ({ request }) => ['image', 'font'].includes(request.destination),
  new StaleWhileRevalidate({
    cacheName: 'plant-pwa-media',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60
      })
    ]
  })
);

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || 'Напоминание о поливе';
  const body = payload.body || 'Откройте приложение, чтобы проверить растения.';
  const url = payload.url || getScopedUrl('./');
  const tag = payload.tag || 'plant-pwa-reminder';
  const receipt = {
    tag,
    title,
    body,
    url,
    receivedAt: Date.now()
  };
  const options = {
    body,
    icon: getScopedUrl('icons/icon-192.svg'),
    badge: getScopedUrl('icons/icon-192.svg'),
    tag,
    data: {
      url
    }
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      persistPushReceipt(receipt),
      notifyClients(receipt)
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || getScopedUrl('./');
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
