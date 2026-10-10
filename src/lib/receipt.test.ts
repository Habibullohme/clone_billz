import { describe, expect, it } from 'vitest'
import { groupReceiptLines } from './receipt'
import type { SaleLine } from '../types'

const line = (name: string, brand: string, price: number, pairs = 5): SaleLine =>
  ({ productId: name, name, brand, barcode: '', packSize: 5, pairs, price, costPrice: 0, total: pairs * price })

describe('chek qatorlari', () => {
  it("faqat kodi farq qiladiganlar bitta qator, narxi boshqasi alohida", () => {
    const g = groupReceiptLines([
      line("qo'shma A24", 'Velton', 245_000),
      line("qo'shma A25", 'Velton', 245_000),
      line('Barsofka B3', 'Richmen', 210_000),
      line("qo'shma A26", 'Velton', 245_000),
      line("qo'shma A27", 'Velton', 230_000),
    ])
    expect(g.map((x) => [x.title, x.packs, x.pairs, x.price, x.sum])).toEqual([
      ["Velton qo'shma", 3, 15, 245_000, 3_675_000],
      ['Richmen Barsofka', 1, 5, 210_000, 1_050_000],
      ["Velton qo'shma", 1, 5, 230_000, 1_150_000],
    ])
    expect(g[0].codes).toEqual(['A24', 'A25', 'A26'])
  })
  it('nom brend bilan boshlansa takrorlanmaydi', () => {
    expect(groupReceiptLines([line('Little qalin A2', 'Little', 115_000)])[0].title).toBe('Little qalin')
  })
})
