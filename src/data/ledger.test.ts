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

describe('eski nasiya sotuvlari', () => {
  it('daftarga bir marta tushadi, o\'chirilgani qaytmaydi', async () => {
    const { getSales, syncSaleDebts, deleteLedgerEntry } = await import('./store')
    const sales = await getSales()
    // Avvalgi testdagi sotuv allaqachon daftarda — qayta qo'shilmaydi.
    expect(await syncSaleDebts()).toBe(0)
    // Daftarsiz "eski" sotuvni taqlid qilamiz: yozuvni o'chiramiz → qaytmasligi kerak.
    const list = await getCustomers()
    const a = list.find((c) => c.name === 'Alisher aka Qarshi')!
    const fromSale = a.ledger!.find((e) => e.saleId === sales[0].id)!
    await deleteLedgerEntry(a.id, fromSale.id)
    expect(await syncSaleDebts()).toBe(0)
  })
})

describe("sotuvni o'chirish", () => {
  it('qoldiq qaytadi va nasiya daftardan olinadi', async () => {
    const { deleteSale, getSales, getProducts, getCustomers, balanceOf } = await import('./store')
    const sale = (await getSales()).find((s) => s.payment.debt > 0)!
    const pid = sale.lines[0].productId
    const before = (await getProducts()).find((p) => p.id === pid)!.stock
    await deleteSale(sale.id)
    expect((await getSales()).some((s) => s.id === sale.id)).toBe(false)
    expect((await getProducts()).find((p) => p.id === pid)!.stock).toBe(before + sale.lines[0].pairs)
    const a = (await getCustomers()).find((c) => c.name === 'Alisher aka Qarshi')!
    expect(a.ledger!.some((e) => e.saleId === sale.id)).toBe(false)
    expect(balanceOf(a)).toBe(-100_000)
  })
})
