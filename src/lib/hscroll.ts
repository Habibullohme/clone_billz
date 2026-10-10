/**
 * Yonga suriladigan qatorlar (brend tugmalari, bo'limlar): sichqoncha g'ildiragi bilan ham suriladi.
 * Touchpad shart emas — g'ildirakni aylantirsangiz qator chapga/o'ngga siljiydi.
 */
const SELECTOR = '.chips-row, .tabs, .set-nav'

export function enableWheelHScroll() {
  document.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const el = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null
      if (!el || el.scrollWidth <= el.clientWidth + 1) return
      const max = el.scrollWidth - el.clientWidth
      // Chetiga yetgan bo'lsa — sahifa odatdagidek pastga suriladi.
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return
      e.preventDefault()
      const step = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY
      el.scrollLeft = Math.min(max, Math.max(0, el.scrollLeft + step))
    },
    { passive: false },
  )
}
