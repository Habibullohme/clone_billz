import { describe, expect, it } from 'vitest'
import { addProduct, balancePayment, distributeTotal, packsLabel, subtotal } from './cart'
import { parseSum } from './money'
import { ScanDetector } from './scanner'
import type { Product } from '../types'

const p = (id: string, packSize = 5, salePrice = 160_000): Product => ({
  id, brand: 'B', name: id, barcode: id, packSize, costPrice: 130_000, salePrice, stock: 100,
  size: '', color: '', createdAt: '', batchId: null,
})

describe('savatcha', () => {
  it('skaner bir pachka qo\'shadi, qayta skaner yana bir pachka', () => {
    let lines = addProduct([], p('a'))
    expect(lines[0].pairs).toBe(5)
    lines = addProduct(lines, p('b', 3))
    lines = addProduct(lines, p('a'))
    expect(lines.map((l) => [l.productId, l.pairs])).toEqual([['a', 10], ['b', 3]])
    expect(subtotal(lines)).toBe(10 * 160_000 + 3 * 160_000)
  })

  it('yakuniy summa butun so\'mlarda aniq taqsimlanadi', () => {
    const parts = distributeTotal([875_000, 550_000], 1_400_000)
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1_400_000)
    expect(parts).toEqual([859_649, 540_351])
  })

  it('pachka yorlig\'i', () => {
    expect(packsLabel(10, 5)).toBe('2 pachka')
    expect(packsLabel(7, 5)).toBe('1 pachka + 2 juft')
    expect(packsLabel(2, 5)).toBe('2 juft')
  })

  it('karta yozilsa naqd o\'zi kamayadi', () => {
    const base = { usd: 0, usdRate: 11_850, card: 0, debt: 0, cashManual: null }
    expect(balancePayment(2_650_000, base).cash).toBe(2_650_000)
    const s = balancePayment(2_650_000, { ...base, card: 500_000 })
    expect(s).toMatchObject({ cash: 2_150_000, short: 0, change: 0 })
  })

  it('100$ kurs bilan, qolgani naqd; mijoz ko\'proq bersa qaytim', () => {
    const base = { usd: 100, usdRate: 11_850, card: 0, debt: 0, cashManual: null }
    expect(balancePayment(1_500_000, base).cash).toBe(315_000)
    expect(balancePayment(1_500_000, { ...base, cashManual: 320_000 }).change).toBe(5_000)
  })

  it('kam berilsa yetmayotgan summa ko\'rinadi, nasiya bilan yopiladi', () => {
    const base = { usd: 0, usdRate: 11_850, card: 0, debt: 0, cashManual: 1_000_000 }
    expect(balancePayment(1_500_000, base).short).toBe(500_000)
    expect(balancePayment(1_500_000, { ...base, debt: 500_000 }).short).toBe(0)
  })
})

describe('summa kiritish', () => {
  it.each([
    ['1 400 000', 1_400_000],
    ['1400k', 1_400_000],
    ['1.4m', 1_400_000],
    ['abc', NaN],
  ])('%s', (input, expected) => {
    expect(parseSum(input)).toEqual(expected)
  })
})

describe('skaner', () => {
  it('tez yozilgan kod + Enter skaner deb olinadi', () => {
    const d = new ScanDetector()
    let t = 1000
    for (const ch of '2000000011790') d.feed(ch, (t += 8))
    expect(d.feed('Enter', (t += 8))).toBe('2000000011790')
  })

  it('odam sekin yozsa skaner emas (input ichida)', () => {
    const d = new ScanDetector()
    let t = 1000
    for (const ch of 'alisher') d.feed(ch, (t += 150))
    expect(d.feed('Enter', (t += 150))).toBeNull()
  })

  it('input fokusda bo\'lmasa qo\'lda yozilgan kod ham qabul qilinadi', () => {
    const d = new ScanDetector()
    let t = 1000
    for (const ch of '2100000000050') d.feed(ch, (t += 150))
    expect(d.feed('Enter', (t += 150), true)).toBe('2100000000050')
  })
})
