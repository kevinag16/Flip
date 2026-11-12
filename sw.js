/* Flip service worker: works offline, picks up updates when online. */
const VERSION = "flip-1.0.2";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./captions.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== "flip-fonts").map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts: cache first
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open("flip-fonts").then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // App files: network first (so updates arrive), cache when offline
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([fetch(req), timeout(3500)]);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") return cache.match("./index.html");
      throw new Error("offline");
    }
  })());
});
