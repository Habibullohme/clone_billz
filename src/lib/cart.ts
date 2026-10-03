import type { CartLine, Payment, Product } from '../types'

/** Skaner yoki qidiruvdan qo'shish: bitta pachka qo'shiladi. */
export function addProduct(lines: CartLine[], product: Product): CartLine[] {
  const i = lines.findIndex((l) => l.productId === product.id)
  if (i === -1) {
    return [{ productId: product.id, pairs: product.packSize, price: product.salePrice }, ...lines]
  }
  const next = [...lines]
  next[i] = { ...next[i], pairs: next[i].pairs + product.packSize }
  // Oxirgi skaner qilingan tovar tepada turadi.
  const [line] = next.splice(i, 1)
  return [line, ...next]
}

export function lineTotal(line: CartLine): number {
  return line.pairs * line.price
}

export function subtotal(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + lineTotal(l), 0)
}

/**
 * Yakuniy summani qatorlarga proporsional taqsimlaydi (Billz'dagi kabi),
 * lekin butun so'mlarda: yig'indi aynan `finalTotal` ga teng bo'ladi.
 */
export function distributeTotal(totals: number[], finalTotal: number): number[] {
  const sum = totals.reduce((a, b) => a + b, 0)
  if (sum === 0) return totals.map(() => 0)
  const raw = totals.map((t) => (t * finalTotal) / sum)
  const floored = raw.map(Math.floor)
  let rest = finalTotal - floored.reduce((a, b) => a + b, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; rest > 0 && k < order.length; k++, rest--) floored[order[k].i]++
  return floored
}

export function packsLabel(pairs: number, packSize: number): string {
  const packs = Math.floor(pairs / packSize)
  const extra = pairs % packSize
  if (packs === 0) return `${extra} juft`
  return extra ? `${packs} pachka + ${extra} juft` : `${packs} pachka`
}

export function paidUzs(p: Omit<Payment, 'debt'>): number {
  return p.cash + Math.round(p.usd * p.usdRate) + p.card
}

export interface PaymentSummary {
  paid: number
  /** To'lanmagan qism (nasiya bo'lishi mumkin). */
  remaining: number
  /** Qaytim, so'm. */
  change: number
}

export function summarizePayment(total: number, p: Omit<Payment, 'debt'>): PaymentSummary {
  const paid = paidUzs(p)
  return {
    paid,
    remaining: Math.max(0, total - paid),
    change: Math.max(0, paid - total),
  }
}
