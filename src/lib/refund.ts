import type { Payment, Sale, SaleLine } from '../types'

/** Chekdan qaytarilgan tovarlar yozuvi (chekda tarix bo'lib qoladi). */
export interface SaleReturn {
  id: string
  at: string
  by: string
  reason: string
  lines: SaleLine[]
  /** Qaytarilgan summa (chegirma hisobga olingan). */
  amount: number
  /** Shundan nasiyadan ayirilgani. */
  debtCut: number
  /** Shundan mijozga qo'lda qaytarilgan pul. */
  refund: number
}

/**
 * Chekdan tanlangan qatorlarni qaytarish: chek summasi, foydasi, chegirmasi va to'lovi qayta hisoblanadi.
 * Pul avval nasiyadan ayiriladi, qolgani mijozga qaytariladi (naqd → karta → dollar tartibida).
 */
export function applyReturn(sale: Sale, idx: number[], meta: Pick<SaleReturn, 'id' | 'at' | 'by' | 'reason'>): { sale: Sale; ret: SaleReturn } {
  const pick = new Set(idx.filter((i) => i >= 0 && i < sale.lines.length))
  const back = sale.lines.filter((_, i) => pick.has(i))
  const keep = sale.lines.filter((_, i) => !pick.has(i))
  const amount = back.reduce((a, l) => a + l.total, 0)
  const gross = back.reduce((a, l) => a + l.price * l.pairs, 0)
  const cost = back.reduce((a, l) => a + l.costPrice * l.pairs, 0)

  const p: Payment = { ...sale.payment }
  const debtCut = Math.min(p.debt, amount)
  p.debt -= debtCut
  let left = amount - debtCut
  let change = sale.change
  // Naqd: mijoz bergan puldan qaytim allaqachon chiqarilgan — sof naqd = cash − change.
  const cashNet = Math.max(0, p.cash - change)
  const fromCash = Math.min(cashNet, left)
  p.cash -= fromCash
  left -= fromCash
  const fromCard = Math.min(p.card, left)
  p.card -= fromCard
  left -= fromCard
  if (left > 0 && p.usd > 0 && p.usdRate > 0) {
    const usdSum = Math.round(p.usd * p.usdRate)
    const fromUsd = Math.min(usdSum, left)
    p.usd = Math.round(((usdSum - fromUsd) / p.usdRate) * 100) / 100
    left -= fromUsd
  }
  if (p.cash < change) change = p.cash

  const next: Sale = {
    ...sale,
    lines: keep,
    subtotal: sale.subtotal - gross,
    discount: sale.discount - (gross - amount),
    total: sale.total - amount,
    profit: sale.profit - (amount - cost),
    payment: p,
    change,
    returns: [...(sale.returns ?? []), {
      ...meta, lines: back, amount, debtCut, refund: amount - debtCut,
    }],
  }
  return { sale: next, ret: next.returns!.at(-1)! }
}
