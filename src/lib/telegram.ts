/** Telegram mini app (Boss panel) bilan ishlash. Telegram'dan tashqarida ochilsa — null. */
export interface TgWebApp {
  initData: string
  colorScheme: 'light' | 'dark'
  ready(): void
  expand(): void
  close(): void
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium'): void }
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void }
}

declare global {
  interface Window { Telegram?: { WebApp?: TgWebApp } }
}

/**
 * Panel (mini app) rejimi: manzilda "?boss" bor yoki sahifa Telegram ichida ochilgan
 * (Telegram manzil oxiriga #tgWebAppData=… qo'shadi — masalan BotFather'dagi "Open" tugmasi "?boss"siz ochsa ham).
 * Sahifa yangilansa ham shu rejimda qoladi.
 */
export function isBossMode(): boolean {
  const KEY = 'dk.panel'
  let on = new URLSearchParams(location.search).has('boss') || /tgWebApp(Data|Version|Platform)=/.test(location.hash)
  try {
    if (on) sessionStorage.setItem(KEY, '1')
    else on = sessionStorage.getItem(KEY) === '1'
  } catch {
    // Xotira yopiq — faqat manzilga qaraymiz.
  }
  return on
}

let loading: Promise<TgWebApp | null> | null = null

export function loadTelegram(): Promise<TgWebApp | null> {
  loading ??= new Promise((resolve) => {
    const done = () => {
      const app = window.Telegram?.WebApp
      if (app?.initData) {
        app.ready()
        app.expand()
        resolve(app)
      } else resolve(null)
    }
    const s = document.createElement('script')
    s.src = 'https://telegram.org/js/telegram-web-app.js'
    s.onload = done
    s.onerror = () => resolve(null)
    document.head.appendChild(s)
    // Internet sekin bo'lsa ham kutib qolmaymiz.
    setTimeout(() => resolve(window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null), 5000)
  })
  return loading
}
