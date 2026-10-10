import type { CartLine, Product } from '../types'

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

export interface PaymentInput {
  usd: number
  usdRate: number
  card: number
  debt: number
  /** Kassir naqdni o'zi yozgan bo'lsa — shu summa; aks holda null (naqd avtomatik qolganiga teng). */
  cashManual: number | null
}

export interface PaymentSummary {
  cash: number
  /** Naqd avtomatik hisoblandimi. */
  cashAuto: boolean
  paid: number
  /** Yetmayotgan summa (nasiyaga o'tkazish yoki ko'proq olish kerak). */
  short: number
  /** Qaytim, so'm. */
  change: number
}

/**
 * Naqd — "qolgani" maydoni: karta, dollar yoki nasiya o'zgarsa, naqd o'zi moslashadi.
 * Kassir naqdni o'zi yozsa (masalan mijoz 3 mln berdi), qaytim hisoblanadi.
 */
export function balancePayment(total: number, p: PaymentInput): PaymentSummary {
  const usdUzs = Math.round(p.usd * p.usdRate)
  const others = usdUzs + p.card + p.debt
  const cashAuto = p.cashManual === null
  const cash = cashAuto ? Math.max(0, total - others) : p.cashManual!
  const covered = cash + others
  return {
    cash,
    cashAuto,
    paid: cash + usdUzs + p.card,
    short: Math.max(0, total - covered),
    change: Math.max(0, covered - total),
  }
}
