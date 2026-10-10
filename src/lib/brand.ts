/** Do'kon nomi va logotipi — kirishdan oldin ham (login sahifasida) ko'rinishi uchun shu qurilmada eslab qolinadi. */
export interface ShopBrand { name: string; logo: string }

const KEY = 'dk.brand'

export function cachedBrand(): ShopBrand {
  try {
    return { name: "Do'kon", logo: '', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { name: "Do'kon", logo: '' }
  }
}

export function rememberBrand(b: ShopBrand) {
  try {
    localStorage.setItem(KEY, JSON.stringify(b))
  } catch {
    // Saqlab bo'lmasa — login sahifasida oddiy belgi turadi.
  }
}

/** Brauzer yorlig'idagi belgi: logotip yoki nomning birinchi harfi (yashil kvadratda). */
export function applyFavicon(b: ShopBrand) {
  const letter = (b.name.trim() || 'D')[0].toUpperCase().replace(/[<>&"']/g, '')
  const href = b.logo || 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#14a37f"/><stop offset="1" stop-color="#2f7fd1"/></linearGradient></defs>` +
    `<rect width="64" height="64" rx="16" fill="url(#g)"/>` +
    `<text x="32" y="45" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" fill="#fff">${letter}</text></svg>`,
  )
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = href
}
