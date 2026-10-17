/* Forthright service worker.
 *
 * What it does: keeps the app's own files (the built scripts, styles and icons) so the app opens fast, shows a friendly
 * page when there is no signal, and shows push notifications.
 *
 * What it never touches: anything on another host (Firestore, Cloud Functions, Storage, Google sign-in) and, on this
 * host, /s/** (troop websites), /cal/** (calendar feeds) and /__/ (sign-in helpers). See sw-filter.js, which decides.
 *
 * Updates: pages always ask the network first, so a new release is picked up on the next visit. When a changed copy of
 * this file is found it installs and WAITS; the app shows "A new version is ready. Reload." and, when the person taps
 * Reload, sends SKIP_WAITING. Old caches are deleted when the new worker takes over, so stale code is never kept.
 * The build stamps a fingerprint of the release over the placeholder below, which is what makes this file change on
 * every release.
 */
importScripts('/sw-filter.js');

var BUILD_ID = '__BUILD_ID__';
var CACHE_PREFIX = 'forthright-';
var CACHE = CACHE_PREFIX + BUILD_ID;
var OFFLINE_URL = '/offline.html';
var filter = self.forthrightSwFilter;

self.addEventListener('install', function (event) {
  // No skipWaiting here: the person chooses when to switch (see the message handler below).
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.add(new Request(OFFLINE_URL, { cache: 'reload' })); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names.filter(function (n) { return n.indexOf(CACHE_PREFIX) === 0 && n !== CACHE; }).map(function (n) { return caches.delete(n); }),
        );
      })
      .then(function () { return self.clients.claim(); }),
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/** The key a page is stored under: the app shell for every app address, or the file itself for a static page. */
function pageKey(url) {
  return url.pathname.slice(-5) === '.html' ? url.pathname : '/';
}

function cacheable(response) {
  return response && response.ok && response.type === 'basic' && !response.redirected;
}

function handlePage(request) {
  var key = pageKey(new URL(request.url));
  // "no-cache" makes the browser check with the server instead of trusting its own HTTP cache.
  return fetch(request, { cache: 'no-cache' })
    .then(function (response) {
      if (cacheable(response)) {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) { return cache.put(key, copy); });
      }
      return response;
    })
    .catch(function () {
      return caches.match(key).then(function (hit) { return hit || caches.match(OFFLINE_URL); });
    });
}

function handleAsset(request) {
  return caches.match(request).then(function (hit) {
    if (hit) {
      return hit;
    }
    return fetch(request).then(function (response) {
      if (cacheable(response)) {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) { return cache.put(request, copy); });
      }
      return response;
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  var kind = filter.classify(request.url, self.location.origin, request.method, request.mode);
  if (kind === 'page') {
    event.respondWith(handlePage(request));
  } else if (kind === 'asset') {
    event.respondWith(handleAsset(request));
  }
  // Anything else is not handled here, so the browser fetches it as if there were no worker.
});

/* Push. The server sends a data message {title, body, link, tag}; the text is written there and never includes a Scout's
 * last name, birth data, health notes, message text or money. A notification is always shown (browsers require it). */
self.addEventListener('push', function (event) {
  var payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }
  var data = payload.data || payload.notification || payload;
  var title = data.title || 'Forthright';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      tag: data.tag || 'forthright',
      data: { link: data.link || '/' },
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = new URL('/', self.location.origin);
  try {
    var link = new URL((event.notification.data && event.notification.data.link) || '/', self.location.origin);
    if (link.origin === self.location.origin) {
      target = link; // only addresses inside the app are followed
    }
  } catch (e) {
    // keep the home page
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
      for (var i = 0; i < windows.length; i++) {
        if ('focus' in windows[i] && 'navigate' in windows[i]) {
          return windows[i].focus().then(function (w) { return w.navigate(target.href); });
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
