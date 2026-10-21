import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Product } from '../types'

// Brauzer xotirasi (localStorage) — sinov uchun oddiy nusxa.
const ls = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => ls.get(k) ?? null,
  setItem: (k: string, v: string) => void ls.set(k, String(v)),
  removeItem: (k: string) => void ls.delete(k),
})

const product: Product = {
  id: 'p1', brand: 'Clarks', name: 'Velikan A37', size: '', color: '', barcode: '2100000004324',
  packSize: 3, costPrice: 100_000, salePrice: 150_000, stock: 9, createdAt: '2026-10-01T00:00:00Z', batchId: null,
}

// Soxta baza: internetni "uzib-ulab" turamiz.
const net = { up: true, applied: new Map<string, number>(), next: 100 }
vi.mock('./cloud', () => ({
  cloudEnabled: true,
  loadAll: vi.fn(async () => {
    if (!net.up) throw new TypeError('Failed to fetch')
    return { products: [{ ...product }], sales: [], batches: [], customers: [], held: [], brands: ['Clarks'], settings: { shopName: 'Test' }, counters: {} }
  }),
  applySale: vi.fn(async (id: string) => {
    if (!net.up) throw new TypeError('Failed to fetch')
    if (net.applied.has(id)) throw new Error('duplicate key value violates unique constraint "sales_pkey"')
    const n = net.next++
    net.applied.set(id, n)
    return n
  }),
  saleNumber: vi.fn(async (id: string) => net.applied.get(id) ?? null),
  syncDocs: vi.fn(async () => {}),
  syncProducts: vi.fn(async () => {}),
  saveSettingsRow: vi.fn(async () => {}),
  notifyBot: vi.fn(),
  takeSeq: vi.fn(async () => 1),
}))

const store = await import('./store')
const line = { productId: 'p1', name: 'Velikan A37', brand: 'Clarks', barcode: product.barcode, packSize: 3, pairs: 3, price: 150_000, costPrice: 100_000, total: 450_000 }
const sale = (debt = 0) => ({
  customerName: debt ? 'Ali Aka' : '', note: '', lines: [line], subtotal: 450_000, discount: 0, total: 450_000, profit: 150_000, change: 0,
  payment: { cash: 450_000 - debt, usd: 0, usdRate: 12_000, card: 0, debt },
})

describe('internetsiz kassa', () => {
  beforeAll(async () => {
    await store.initStore()
  })

  it("internet yo'q — sotuv navbatga yoziladi, qoldiq kamayadi, chek 'navbatda'", async () => {
    net.up = false
    const s = await store.saveSale(sale(100_000))
    expect(s.pending).toBe(true)
    expect(s.number).toBe(0)
    expect((await store.getProducts())[0].stock).toBe(6)
    expect(JSON.parse(ls.get('dk.offline.outbox')!)).toHaveLength(1)
    // Nasiya daftari hali yozilmaydi (sotuv bazaga yetgach).
    expect((await store.getCustomers()).some((c) => c.ledger?.length)).toBe(false)
    // Bazadan yangilash navbatdagi sotuvni o'chirib yubormasligi kerak.
    await store.refresh().catch(() => {})
    expect((await store.getSales())[0].id).toBe(s.id)
  })

  it('qayta ochilganda (internetsiz) oxirgi nusxadan ishga tushadi', async () => {
    const cache = JSON.parse(ls.get('dk.offline.cache')!)
    expect(cache.data['dk4.products']).toContain('"stock":6')
    expect(store.hasOfflineCache()).toBe(true)
    expect(store.initOffline()).toBe(true)
  })

  it('internet qaytdi — sotuv yuboriladi, raqam oladi, nasiya daftarga tushadi', async () => {
    net.up = true
    expect(await store.syncOutbox()).toBe(1)
    const s = (await store.getSales())[0]
    expect(s.pending).toBeUndefined()
    expect(s.number).toBe(100)
    expect(JSON.parse(ls.get('dk.offline.outbox')!)).toHaveLength(0)
    const ali = (await store.getCustomers()).find((c) => c.name === 'Ali Aka')!
    expect(ali.ledger?.[0]).toMatchObject({ kind: 'debt', amount: 100_000 })
  })

  it("javobi kelmay qolgan sotuv ikki marta yozilmaydi", async () => {
    net.up = false
    const s = await store.saveSale(sale())
    // Sotuv bazaga yetgan, lekin javob kelmagan holat
    net.applied.set(s.id, 555)
    net.up = true
    expect(await store.syncOutbox()).toBe(1)
    expect((await store.getSales()).find((x) => x.id === s.id)!.number).toBe(555)
  })
})
