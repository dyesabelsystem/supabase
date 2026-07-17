/// <reference lib="webworker" />

import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { BackgroundSyncPlugin } from 'workbox-background-sync';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;
declare global {
  interface ServiceWorkerGlobalScope {
    __WB_DISABLE_DEV_LOGS?: boolean;
  }
}

self.__WB_DISABLE_DEV_LOGS = true;

// Do not call skipWaiting() or clientsClaim() here. Updated workers should
// finish installing in the background, then wait for existing tabs to close
// before activating so an in-progress session is never refreshed or split
// across two app versions.

const CACHE_VERSION = 'v2';
const CACHE_NAMES = {
  pages: `pages-${CACHE_VERSION}`,
  gasApi: `gas-api-${CACHE_VERSION}`,
  googleFonts: `google-fonts-${CACHE_VERSION}`,
  images: `images-${CACHE_VERSION}`,
};

const notifyClients = async (message: { type: string; [key: string]: unknown }) => {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage(message);
  }
};

// Background Sync for Offline Mutations (GAS API support)
const gasApiBackgroundSync = new BackgroundSyncPlugin('gas-api-queue', {
  maxRetentionTime: 24 * 60, // Retry for up to 24 hours
  onSync: async ({ queue }) => {
    try {
      await queue.replayRequests();
      await notifyClients({ type: 'OFFLINE_QUEUE_SYNCED' });
    } catch (error) {
      throw error;
    }
  },
});

const notifyOnFailedWritePlugin = {
  fetchDidFail: async ({ request }: { request: Request }) => {
    await notifyClients({
      type: 'OFFLINE_WRITE_QUEUED',
      url: request.url,
      method: request.method,
    });
  },
};

const isBackgroundSyncCandidate = (request: Request, url: URL) => {
  if (request.method === 'GET') return false;
  // Exclude uploads to avoid large blob retries in background sync
  if (url.pathname.toLowerCase().includes('upload')) return false;
  
  // Supabase writes are safe to queue except file uploads.
  if (url.origin === 'https://rtmpjojqzfrggmmlseam.supabase.co') {
    return true;
  }
  return false;
};

// Precache generated assets
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Strategy for Navigation (HTML)
const pageStrategy = new NetworkFirst({
  cacheName: CACHE_NAMES.pages,
  networkTimeoutSeconds: 5,
  plugins: [
    new ExpirationPlugin({
      maxEntries: 30,
      maxAgeSeconds: 60 * 60 * 24 * 7,
    }),
  ],
});

registerRoute(
  ({ request }) => request.mode === 'navigate',
  async ({ request, event }) => {
    try {
      const response = await pageStrategy.handle({ request, event });
      if (response) return response;
    } catch {
      // Fallback behavior
    }
    // Return cached app shell if network fails
    const appShell = await caches.match('/index.html', { ignoreSearch: true });
    return appShell || Response.error();
  }
);

// Strategy for Background Sync (Supabase writes)
registerRoute(
  ({ request, url }) => isBackgroundSyncCandidate(request, url),
  new NetworkOnly({
    plugins: [gasApiBackgroundSync, notifyOnFailedWritePlugin],
  })
);

// Strategy for Supabase API Reads (GET)
registerRoute(
  ({ request, url }) =>
    request.method === 'GET' &&
    url.origin === 'https://rtmpjojqzfrggmmlseam.supabase.co',
  new NetworkFirst({
    cacheName: CACHE_NAMES.gasApi,
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24,
      }),
    ],
  })
);

// Strategy for Fonts
registerRoute(
  /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//,
  new StaleWhileRevalidate({
    cacheName: CACHE_NAMES.googleFonts,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
    ],
  })
);

// Strategy for Images
registerRoute(
  ({ request, url }) =>
    request.destination === 'image' &&
    (
      url.hostname === 'drive.google.com' ||
      url.hostname === 'lh3.googleusercontent.com' ||
      url.hostname === 'drive.usercontent.google.com' ||
      url.hostname.endsWith('.googleusercontent.com')
    ),
  new NetworkOnly()
);

registerRoute(
  ({ request, url }) =>
    request.destination === 'image' &&
    !(
      url.hostname === 'drive.google.com' ||
      url.hostname === 'lh3.googleusercontent.com' ||
      url.hostname === 'drive.usercontent.google.com' ||
      url.hostname.endsWith('.googleusercontent.com')
    ),
  new CacheFirst({
    cacheName: CACHE_NAMES.images,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  })
);
