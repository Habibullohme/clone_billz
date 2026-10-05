import { describe, expect, it } from 'vitest'
import { addLedgerEntry, balanceOf, getCustomers, getProducts, saveSale } from './store'

describe('nasiya daftari', () => {
  it("sotuvdagi nasiya va qo'lda yozuvlar qoldiqni to'g'ri hisoblaydi", async () => {
    const p = (await getProducts())[0]
    await saveSale({
      customerName: 'Alisher aka Qarshi', customerPhone: '+998901234567', note: '',
      lines: [{ productId: p.id, name: p.name, brand: p.brand, barcode: p.barcode, packSize: 5, pairs: 5, price: 100_000, costPrice: 90_000, total: 500_000 }],
      subtotal: 500_000, discount: 0, total: 500_000, profit: 50_000, change: 0,
      payment: { cash: 200_000, usd: 0, usdRate: 12_000, card: 0, debt: 300_000 },
    })
    await addLedgerEntry('alisher aka qarshi', undefined, { kind: 'payment', amount: 100_000, note: '', date: new Date().toISOString() })
    await addLedgerEntry('Bobur Urgut', '+998901112233', { kind: 'debt', amount: 1_000_000, note: 'daftardan', date: '2026-09-01T00:00:00.000Z' })
    const list = await getCustomers()
    const a = list.find((c) => c.name === 'Alisher aka Qarshi')!
    expect(a.phone).toBe('+998901234567')
    expect(a.ledger).toHaveLength(2)
    expect(a.ledger![0].saleNumber).toBe(1)
    expect(balanceOf(a)).toBe(200_000)
    expect(balanceOf(list.find((c) => c.name === 'Bobur Urgut')!)).toBe(1_000_000)
  })
})
