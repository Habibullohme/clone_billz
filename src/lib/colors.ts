import type React from 'react'

/** Nomdan chiqadigan rang (eski usul) — yangi brendga rang tanlashda birinchi nomzod. */
export function hashHue(name: string): number {
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

const key = (name: string) => name.trim().toLowerCase()
let assigned: Record<string, number> = {}

/** Sozlamalardagi brend → rang jadvali (har brendga alohida rang, takrorlanmaydi). */
export function setBrandHues(map: Record<string, number>) {
  assigned = map
}

export function brandHue(name: string): number {
  return assigned[key(name)] ?? hashHue(name)
}

const gap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

/** Ikki rang orasidagi eng kam farq — shundan yaqini "bir xil" ko'rinadi. */
const MIN_GAP = 24

/**
 * Rangsiz brendlarga rang beradi: iloji boricha eski rangi qoladi, aks holda
 * boshqalaridan eng uzoq rang tanlanadi. Yangi jadval qaytaradi (o'zgarmagan bo'lsa — o'sha).
 */
export function assignHues(brands: string[], current: Record<string, number>): Record<string, number> {
  const out = { ...current }
  let changed = false
  for (const b of brands) {
    const k = key(b)
    if (!k || k in out) continue
    const used = Object.values(out)
    const own = hashHue(b)
    let hue = own
    if (used.some((u) => gap(u, own) < MIN_GAP)) {
      let best = -1
      for (let h = 0; h < 360; h += 5) {
        const d = Math.min(...used.map((u) => gap(u, h)))
        if (d > best) {
          best = d
          hue = h
        }
      }
    }
    out[k] = hue
    changed = true
  }
  return changed ? out : current
}

/** Brend nomi o'zgarsa — rangi ham yangi nomga o'tadi. */
export function renameHue(map: Record<string, number>, from: string, to: string): Record<string, number> {
  if (!(key(from) in map) || key(from) === key(to)) return map
  const { [key(from)]: hue, ...rest } = map
  return { ...rest, [key(to)]: hue }
}

export const hueStyle = (name: string) => ({ '--h': brandHue(name) }) as React.CSSProperties
