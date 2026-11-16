/* Car Buddy offline support: always try the network first (so updates show up right away),
 * and fall back to the last saved copy when there is no signal. */
const CACHE = "carbuddy-v2";
const FILES = ["./", "index.html", "js/dog-paths.js", "js/dog.js", "js/buddies.js", "js/ascii.js", "js/sky.js", "js/water.js", "js/senses.js",
  "js/motion.js", "js/sfx.js", "sim/drive2.csv", "manifest.webmanifest", "art/icon-192.png", "art/icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;      // weather etc. go straight to the network
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || Response.error()))
  );
});
