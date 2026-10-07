import { describe, expect, it } from 'vitest'
import { cartToInputs } from './NewBatch'

describe('kirim savati', () => {
  it("har rang — alohida qator, 0 pachkali rang tashlanadi, har model o'z narxi bilan", () => {
    const inputs = cartToInputs([
      { id: 'a', brand: ' Adidas ', name: 'Klassik 1', size: '39-43', packSize: 5, cost: 150000, sale: 170000, colors: [{ color: 'qora', packs: 2 }, { color: 'oq', packs: 0 }] },
      { id: 'b', brand: 'Nike', name: 'Air', size: '40-44', packSize: 6, cost: 200000, sale: 240000, colors: [{ color: '', packs: 1 }] },
    ])
    expect(inputs).toEqual([
      { brand: 'Adidas', name: 'Klassik 1', size: '39-43', color: 'qora', packSize: 5, packs: 2, costPrice: 150000, salePrice: 170000 },
      { brand: 'Nike', name: 'Air', size: '40-44', color: '', packSize: 6, packs: 1, costPrice: 200000, salePrice: 240000 },
    ])
  })
})
