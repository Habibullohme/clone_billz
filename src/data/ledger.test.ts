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

describe('sotuvni arxivlash', () => {
  it("o'chmaydi, qoldiq qaytadi, nasiya olinadi; qaytarsa hammasi tiklanadi", async () => {
    const { archiveSale, restoreSale, activeSales, getSales, getProducts, getCustomers, balanceOf } = await import('./store')
    const sale = (await getSales()).find((s) => s.payment.debt > 0)!
    const pid = sale.lines[0].productId
    const stock = async () => (await getProducts()).find((p) => p.id === pid)!.stock
    const alisher = async () => (await getCustomers()).find((c) => c.name === 'Alisher aka Qarshi')!
    const before = await stock()
    const balance = balanceOf(await alisher())

    await archiveSale(sale.id, 'sinov')
    const archived = (await getSales()).find((s) => s.id === sale.id)!
    expect(archived.archivedAt).toBeTruthy()
    expect(archived.archiveReason).toBe('sinov')
    expect(activeSales(await getSales()).some((s) => s.id === sale.id)).toBe(false)
    expect(await stock()).toBe(before + sale.lines[0].pairs)
    expect((await alisher()).ledger!.some((e) => e.saleId === sale.id)).toBe(false)
    expect(balanceOf(await alisher())).toBe(-100_000)

    await restoreSale(sale.id)
    expect((await getSales()).find((s) => s.id === sale.id)!.archivedAt).toBeUndefined()
    expect(await stock()).toBe(before)
    expect(balanceOf(await alisher())).toBe(balance)
  })
})

describe('chekdan tovar qaytarish', () => {
  it("tanlangan pachka omborga qaytadi, chek va nasiya kamayadi; hammasi tanlansa — arxiv", async () => {
    const { returnSaleLines, getSales, getProducts, getCustomers, balanceOf } = await import('./store')
    const [p1, p2] = (await getProducts()).slice(1, 3)
    const line = (p: typeof p1, total: number) => ({ productId: p.id, name: p.name, brand: p.brand, barcode: p.barcode, packSize: 5, pairs: 5, price: 100_000, costPrice: 80_000, total })
    const sale = await saveSale({
      customerName: 'Qaytarish Mijoz', note: '',
      lines: [line(p1, 450_000), line(p2, 450_000)],
      subtotal: 1_000_000, discount: 100_000, total: 900_000, profit: 100_000, change: 0,
      payment: { cash: 700_000, usd: 0, usdRate: 12_000, card: 0, debt: 200_000 },
    })
    const stock = async (id: string) => (await getProducts()).find((p) => p.id === id)!.stock
    const before = await stock(p1.id)
    const ret = await returnSaleLines(sale.id, [0], 'adashib urilgan')
    expect(ret).toMatchObject({ amount: 450_000, debtCut: 200_000, refund: 250_000, reason: 'adashib urilgan' })
    expect(await stock(p1.id)).toBe(before + 5)
    const s = (await getSales()).find((x) => x.id === sale.id)!
    expect(s.archivedAt).toBeUndefined()
    expect(s.lines.map((l) => l.productId)).toEqual([p2.id])
    expect(s).toMatchObject({ total: 450_000, subtotal: 500_000, discount: 50_000, profit: 50_000 })
    expect(s.payment).toMatchObject({ debt: 0, cash: 450_000 })
    expect(s.returns).toHaveLength(1)
    const c = (await getCustomers()).find((x) => x.name === 'Qaytarish Mijoz')!
    expect(balanceOf(c)).toBe(0)

    // Qolgan oxirgi qator ham qaytarilsa — chek butunlay bekor bo'ladi.
    expect(await returnSaleLines(sale.id, [0], 'hammasi')).toBeNull()
    const gone = (await getSales()).find((x) => x.id === sale.id)!
    expect(gone.archivedAt).toBeTruthy()
    expect(gone.archiveReason).toBe('Qaytarildi: hammasi')
  })
})
