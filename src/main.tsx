import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import { applyFavicon, cachedBrand } from './lib/brand'
import { enableWheelHScroll } from './lib/hscroll'

// Kirishdan oldin ham — shu qurilmada eslab qolingan belgi.
applyFavicon(cachedBrand())
enableWheelHScroll()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
