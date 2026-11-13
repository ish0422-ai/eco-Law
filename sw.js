/* 친환경농업 법령 검색 — 서비스 워커
   앱 껍데기와 조문 자료(laws.json)는 설치할 때 저장하고,
   별표·서식 이미지는 한 번 본 것과 설정에서 내려받은 것을 저장한다. */
const SHELL = 'eco-law-shell-v1';
const IMAGES = 'eco-law-images';
const SHELL_FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'data/laws.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
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
  const isImage = /\/(pages|guide)\/[^/]+\.webp$/.test(url.pathname);
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit && !isImage) {
      // 앱 파일·조문 자료: 저장본을 바로 보여 주고, 연결돼 있으면 뒤에서 새 판으로 갈아 둔다(다음 실행부터 반영)
      e.waitUntil(fetch(req, { cache: 'no-cache' }).then(async (res) => {
        if (res.ok) await (await caches.open(SHELL)).put(req, res.clone());
      }).catch(() => {}));
      return hit;
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
