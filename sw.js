// Service worker: lets browsers install DIN Stack as an app and keeps it working offline.
// Network first, so a new version on the server is used as soon as it's reachable; the cached
// copy is only a fallback when offline.

importScripts("js/version.js");

const CACHE = "dinstack-" + APP_VERSION;
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/version.js",
  "js/defaults.js",
  "js/cables.js",
  "js/render.js",
  "js/reports.js",
  "js/routing.js",
  "js/dxf.js",
  "js/xlsx.js",
  "js/checks.js",
  "js/tpl-editor.js",
  "js/app.js",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "examples/mechatronics.json",
  "RELEASE_NOTES.md",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))) // older versions' copies
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      // Offline: the cached copy, or the app's page for a page load. Anything else that isn't cached
      // fails as it would online (so, for example, the .dev marker isn't mistaken for present).
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
