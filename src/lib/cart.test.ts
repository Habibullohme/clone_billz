import { describe, expect, it } from 'vitest'
import { addProduct, distributeTotal, packsLabel, subtotal, summarizePayment } from './cart'
import { parseSum } from './money'
import { ScanDetector } from './scanner'
import type { Product } from '../types'

const p = (id: string, packSize = 5, salePrice = 160_000): Product => ({
  id, brand: 'B', name: id, article: id, barcode: id, packSize, costPrice: 130_000, salePrice, stock: 100,
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

  it('aralash to\'lov: 100$ kurs bilan, qolgani so\'mda, qaytim', () => {
    const s = summarizePayment(1_500_000, { cash: 320_000, usd: 100, usdRate: 11_850, card: 0 })
    expect(s).toEqual({ paid: 1_505_000, remaining: 0, change: 5_000 })
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
    for (const ch of '11790') d.feed(ch, (t += 150))
    expect(d.feed('Enter', (t += 150), true)).toBe('11790')
  })
})
