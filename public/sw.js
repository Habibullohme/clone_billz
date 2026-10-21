// Ilova (PWA) uchun service worker.
// Internet bor paytda sahifa har doim yangisidan olinadi; internet yo'q bo'lsa — oxirgi saqlangan nusxa ochiladi
// (kassa internetsiz ishlaydi, sotuvlar navbatga yoziladi). Baza so'rovlariga tegilmaydi.
const CACHE = 'kassa-shell-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const offlinePage = () => new Response(
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;text-align:center;color:#1d2a26">' +
  '<div><h2>Internet yo\'q</h2><p>Ulanishni tekshirib, sahifani yangilang.</p>' +
  '<button onclick="location.reload()" style="padding:10px 18px;font-size:16px">Qayta urinish</button></div>',
  { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
)

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Sahifa: avval internetdan (yangi versiya), bo'lmasa — saqlangan nusxa.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then(async (c) => {
              const html = await copy.clone().text()
              await c.put('/', copy)
              // Yangi versiya chiqqan bo'lsa — eski dastur fayllari o'chiriladi (xotira to'lib ketmasin).
              const used = new Set([...html.matchAll(/\/assets\/[^"'\s)]+/g)].map((m) => m[0]))
              for (const k of await c.keys()) {
                const p = new URL(k.url).pathname
                if (/^\/assets\/index-[^/]+\.(js|css)$/.test(p) && !used.has(p)) await c.delete(k)
              }
            }).catch(() => {})
          }
          return res
        })
        .catch(() => caches.match('/').then((r) => r || offlinePage())),
    )
    return
  }

  // Dastur fayllari (nomida xesh bor — o'zgarmaydi): avval saqlanganidan, bo'lmasa internetdan va saqlab qo'yamiz.
  if (url.pathname.startsWith('/assets/') || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })),
    )
  }
})
