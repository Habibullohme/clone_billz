import { describe, expect, it } from 'vitest'
import { ledgerRows } from './debt'

describe('nasiya daftari', () => {
  it("har yozuvda oldingi va keyingi qarz; sana bo'yicha tartib", () => {
    const rows = ledgerRows({
      ledger: [
        { id: 'b', kind: 'payment', amount: 30, note: '', date: '2026-10-02T10:00:00Z', createdAt: '2026-10-02T10:00:00Z' },
        { id: 'a', kind: 'debt', amount: 100, note: '', date: '2026-10-01T10:00:00Z', createdAt: '2026-10-01T10:00:00Z' },
        { id: 'c', kind: 'debt', amount: 50, note: '', date: '2026-10-03T10:00:00Z', createdAt: '2026-10-03T10:00:00Z' },
      ],
    })
    expect(rows.map((r) => [r.id, r.before, r.after])).toEqual([['a', 0, 100], ['b', 100, 70], ['c', 70, 120]])
  })
})
