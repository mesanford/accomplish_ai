// Decides which requests the service worker may touch. A plain script (no import or export) so that sw.js can load it
// with importScripts and the unit tests can load it too; both read the result from globalThis.forthrightSwFilter.
//
// The rule is a short allow list with a hard deny list on top. The worker only ever handles:
//   - page navigations (to show the app, or the offline page when there is no signal), and
//   - the app's own built files (/assets/*, icons, fonts and the manifest).
// It never handles anything on another host (Firestore, Cloud Functions, Storage, Google sign-in), and never these
// paths on this host: /s/** (troop websites, built by a function), /cal/** (calendar feeds, which change and carry a
// private key in the address), /__/ (Firebase sign-in helpers) and the worker's own files.
(function (root) {
  var DENIED_PREFIXES = ['/s', '/cal', '/__', '/sw.js', '/sw-filter.js'];
  // Built scripts and styles all live under /assets/ with a fingerprint in the name; other static files are images.
  var STATIC_FILES = /\.(?:png|svg|ico|webmanifest|woff2?|ttf|jpg|jpeg|webp)$/i;

  /** True for the path itself and anything below it ("/s" and "/s/x", but not "/settings"). */
  function underPrefix(path, prefix) {
    return path === prefix || path.indexOf(prefix + '/') === 0;
  }

  /** What to do with a request: 'page' (navigation), 'asset' (built file) or 'ignore' (leave it to the network). */
  function classify(urlString, origin, method, mode) {
    var url;
    try {
      url = new URL(urlString, origin);
    } catch (e) {
      return 'ignore';
    }
    if (method !== 'GET' || url.origin !== origin) {
      return 'ignore';
    }
    for (var i = 0; i < DENIED_PREFIXES.length; i++) {
      if (underPrefix(url.pathname, DENIED_PREFIXES[i])) {
        return 'ignore';
      }
    }
    if (mode === 'navigate') {
      return 'page';
    }
    if (url.pathname.indexOf('/assets/') === 0 || STATIC_FILES.test(url.pathname)) {
      return 'asset';
    }
    return 'ignore';
  }

  root.forthrightSwFilter = { classify: classify, DENIED_PREFIXES: DENIED_PREFIXES };
})(typeof globalThis !== 'undefined' ? globalThis : self);
