// Ilova (PWA) uchun service worker. Hech narsani keshlamaydi — sayt har doim eng yangi versiyada ochiladi.
// Faqat internet yo'q paytda sahifa o'rniga tushunarli xabar ko'rsatadi.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return
  e.respondWith(
    fetch(e.request).catch(() => new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;text-align:center;color:#1d2a26">' +
      '<div><h2>Internet yo\'q</h2><p>Ulanishni tekshirib, sahifani yangilang.</p>' +
      '<button onclick="location.reload()" style="padding:10px 18px;font-size:16px">Qayta urinish</button></div>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )),
  )
})
