/* eslint-disable no-undef */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

self.skipWaiting();
cleanupOutdatedCaches();

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
  const options = {
    body: payload.body || 'Откройте приложение, чтобы проверить растения.',
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    tag: payload.tag || 'plant-pwa-reminder',
    data: {
      url: payload.url || '/mini-app'
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/mini-app';
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
