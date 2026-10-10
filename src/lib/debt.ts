import type { Customer, LedgerEntry } from '../types'

export interface LedgerRow extends LedgerEntry {
  /** Shu yozuvdan oldingi va keyingi qarz (musbat — qarzdor). */
  before: number
  after: number
}

/** Daftar yozuvlari vaqt bo'yicha, har birida oldingi va keyingi qarz bilan (eskidan yangiga). */
export function ledgerRows(c: Pick<Customer, 'ledger'>): LedgerRow[] {
  const list = [...(c.ledger ?? [])].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  let bal = 0
  return list.map((e) => {
    const before = bal
    bal += e.kind === 'debt' ? e.amount : -e.amount
    return { ...e, before, after: bal }
  })
}
