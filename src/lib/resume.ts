/**
 * Oynaga qaytish (telefon ochildi, Telegram blokdan chiqdi, boshqa ilovadan qaytildi).
 * Bir necha hodisa (focus, visibilitychange, pageshow, Telegram "activated") birdaniga keladi —
 * ular bitta chaqiruvga yig'iladi va oyna o'ziga kelishi uchun biroz kechiktiriladi.
 */
export function onResume(cb: () => void, delay = 1200): () => void {
  let timer = 0
  const fire = () => {
    if (document.visibilityState !== 'visible') return
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      if (document.visibilityState === 'visible') cb()
    }, delay)
  }
  const tg = (window as { Telegram?: { WebApp?: { onEvent?(e: string, f: () => void): void; offEvent?(e: string, f: () => void): void } } }).Telegram?.WebApp
  window.addEventListener('focus', fire)
  window.addEventListener('pageshow', fire)
  document.addEventListener('visibilitychange', fire)
  tg?.onEvent?.('activated', fire)
  return () => {
    clearTimeout(timer)
    window.removeEventListener('focus', fire)
    window.removeEventListener('pageshow', fire)
    document.removeEventListener('visibilitychange', fire)
    tg?.offEvent?.('activated', fire)
  }
}

/** Oyna yashirilganda (ekran o'chdi, Telegram bloklandi, boshqa ilovaga o'tildi). */
export function onHide(cb: () => void): () => void {
  const tg = (window as { Telegram?: { WebApp?: { onEvent?(e: string, f: () => void): void; offEvent?(e: string, f: () => void): void } } }).Telegram?.WebApp
  const vis = () => document.visibilityState === 'hidden' && cb()
  document.addEventListener('visibilitychange', vis)
  window.addEventListener('pagehide', cb)
  tg?.onEvent?.('deactivated', cb)
  return () => {
    document.removeEventListener('visibilitychange', vis)
    window.removeEventListener('pagehide', cb)
    tg?.offEvent?.('deactivated', cb)
  }
}
