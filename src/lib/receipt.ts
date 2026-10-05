import type { SaleLine } from '../types'

/** Chekdagi bitta qator: bir xil brend + model (kodsiz) + narx — birlashtirilgan. */
export interface ReceiptGroup {
  title: string
  packs: number
  pairs: number
  price: number
  sum: number
  codes: string[]
}

const CODE = /\s([A-Z]{1,2}\d{1,3})$/

/** "Velton qo'shma A24" → "Velton qo'shma" (brend nom boshida bo'lmasa — qo'shiladi). */
function modelTitle(l: SaleLine): string {
  const base = l.name.trim().replace(CODE, '')
  const b = l.brand.trim()
  return b && !base.toLowerCase().startsWith(b.toLowerCase()) ? `${b} ${base}` : base
}

/**
 * Qo'lda yoziladigan spiskadagi kabi: "Velton qo'shma — 3 pachka · 15 × 245 000 = 3 675 000".
 * Faqat kodi (A12, A13…) bilan farq qiladigan pachkalar bitta qatorga yig'iladi; tartib — chekdagi kabi.
 */
export function groupReceiptLines(lines: SaleLine[]): ReceiptGroup[] {
  const groups = new Map<string, ReceiptGroup>()
  for (const l of lines) {
    const title = modelTitle(l)
    const key = `${title.toLowerCase()}|${l.price}`
    const g = groups.get(key) ?? { title, packs: 0, pairs: 0, price: l.price, sum: 0, codes: [] }
    g.pairs += l.pairs
    g.packs += l.packSize > 0 ? l.pairs / l.packSize : 0
    g.sum += l.pairs * l.price
    const code = l.name.trim().match(CODE)?.[1]
    if (code) g.codes.push(code)
    groups.set(key, g)
  }
  return [...groups.values()]
}
