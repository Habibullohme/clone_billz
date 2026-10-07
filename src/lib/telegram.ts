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

/** Boss panel rejimi: sayt manzili "?boss" bilan ochilgan. */
export const isBossMode = () => new URLSearchParams(location.search).has('boss')

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
