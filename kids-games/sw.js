/* 幼兒遊戲大全 離線快取:第一次打開就把全部遊戲存起來,之後沒網路也能玩 */
const VERSION = "kids-v1";
const FILES = [
  "./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png",
  "./games/toy-tidy.html", "./games/station-master.html", "./games/fire-station.html", "./games/shape-match.html",
  "./games/size-match.html", "./games/abc.html", "./games/zhuyin.html", "./games/rail.html"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("kids-") && k !== VERSION && k !== "kids-fonts").map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  /* 網頁:有網路就拿最新版並存起來,沒網路就用存好的 */
  if (url.origin === location.origin && (req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/"))) {
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match("./index.html"))));
    return;
  }
  /* 其他自己網站的檔案(圖示等):先用存好的 */
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })));
    return;
  }
  /* Google 字型:用過就存起來;沒網路時用存好的,沒存到就用平板內建字型 */
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open("kids-fonts").then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit || new Response("", { status: 504 }));
      return hit || net;
    })));
  }
});
