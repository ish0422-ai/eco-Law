/* 친환경농업 법령 검색 — 서비스 워커
   앱 껍데기와 조문 자료(laws.json)는 설치할 때 저장하고,
   별표·서식 이미지는 한 번 본 것과 설정에서 내려받은 것을 저장한다. */
const SHELL = 'eco-law-shell-v1.1.0-53451a767b'; /*BUILD*/
const IMAGES = 'eco-law-images';
const SHELL_FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'data/laws.json', 'version.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(SHELL_FILES.map((f) => fetch(f, { cache: 'reload' }).then((r) => { if (!r.ok) throw new Error(f); return c.put(f, r); })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('eco-law-shell-') && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isImage = /\/(pages|pages_hd|guide)\/[^/]+\.(webp|png)$/.test(url.pathname);
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (!isImage) {
      // 앱 파일·조문 자료: 연결돼 있으면 항상 새 판을 받아 저장하고, 끊겼을 때만 저장본을 쓴다(재빌드 즉시 반영)
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
        return res;
      } catch (err) {
        if (hit) return hit;
        if (req.mode === 'navigate') return (await caches.match('index.html')) || Response.error();
        return Response.error();
      }
    }
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && isImage) { const c = await caches.open(IMAGES); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      if (req.mode === 'navigate') return (await caches.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
