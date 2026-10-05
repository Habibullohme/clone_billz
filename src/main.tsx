import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import { applyFavicon, cachedBrand } from './lib/brand'

// Kirishdan oldin ham — shu qurilmada eslab qolingan belgi.
applyFavicon(cachedBrand())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
