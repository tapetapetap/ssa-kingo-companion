// 서비스 워커(3단계 research R3): 앱 껍데기만 담고 API 답은 담지 않는다(FR-004). 알림을 띄우고, 누르면 그 화면을 연다
const SHELL = 'kingo-shell-1';

/** index.html과 그것이 가리키는 /assets만 담는다 */
async function store(cache, res) {
  const html = await res.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]);
  if (!assets.length) return; // 앱이 아닌 답(점검 화면 등)으로 껍데기를 바꾸지 않는다
  for (const a of assets) if (!await cache.match(a)) await cache.add(a);
  await cache.put('/index.html', res);
  for (const k of await cache.keys()) {
    const p = new URL(k.url).pathname;
    if (p.startsWith('/assets/') && !assets.includes(p)) await cache.delete(k);
  }
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await store(cache, await fetch('/', { cache: 'no-cache' }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || /^\/(api|ops)(\/|$)/.test(u.pathname)) return;
  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(e.request);
        if (res.ok && !res.redirected) e.waitUntil(caches.open(SHELL).then(c => store(c, res.clone())).catch(() => {}));
        return res;
      } catch (err) {
        const kept = await caches.match('/index.html');
        if (kept) return kept;
        throw err;
      }
    })());
  } else if (u.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(e.request).then(r => r ?? fetch(e.request)));
  }
});

/** 받은 알림을 다듬는다. 꼴이 틀려도 알림은 보여야 한다(iOS) */
function shape(data) {
  let d = {};
  try {
    d = data?.json() ?? {};
  } catch { /* 기본 글을 쓴다 */ }
  const ok = typeof d.title === 'string' && d.title && typeof d.body === 'string';
  return ok ? { title: d.title, body: d.body, url: inApp(d.url), tag: typeof d.tag === 'string' ? d.tag : undefined }
    : { title: '킹고 컴패니언', body: '확인할 공지가 있어요', url: '/list', tag: undefined };
}
/** 앱 안의 주소만 따른다 */
function inApp(url) {
  if (typeof url !== 'string' || !/^\/(?![/\\])/.test(url)) return '/list';
  const u = new URL(url, self.location.origin);
  return u.origin === self.location.origin && !u.pathname.startsWith('//') ? u.pathname + u.search : '/list';
}

self.addEventListener('push', e => {
  const n = shape(e.data);
  e.waitUntil(self.registration.showNotification(n.title, { body: n.body, tag: n.tag, icon: '/icon-192.png', lang: 'ko', data: { url: n.url } }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = inApp(e.notification.data?.url);
  e.waitUntil((async () => {
    const [open] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (!open) return self.clients.openWindow(url);
    await open.focus();
    open.postMessage({ kind: 'open', url }); // 앱이 그 화면으로 옮긴다(쓰던 글이 있으면 앱이 묻는다)
  })());
});
