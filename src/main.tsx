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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isBossMode() ? <BossApp /> : <App />}
  </StrictMode>,
)
