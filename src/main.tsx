import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { BossApp } from './boss/BossApp'
import { isBossMode } from './lib/telegram'
import './styles.css'
import { applyFavicon, cachedBrand } from './lib/brand'
import { enableWheelHScroll } from './lib/hscroll'

// Kirishdan oldin ham — shu qurilmada eslab qolingan belgi.
applyFavicon(cachedBrand())
enableWheelHScroll()

// Ilova qilib o'rnatish (Chrome: "Ilovani o'rnatish") uchun service worker. Telegram mini app ichida kerak emas.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !isBossMode()) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isBossMode() ? <BossApp /> : <App />}
  </StrictMode>,
)
