import { describe, expect, it } from 'vitest'
import { deliveryPerPair, originOf } from './delivery'
import { cartToInputs } from './kirim'

const cfg = {
  origins: [{ id: 'and', name: 'Andijon', perBox: 7_000 }, { id: 'nam', name: 'Namangan', perBox: 10_000 }],
  brandOrigins: { ezel: 'and', richmen: 'nam', clarks: 'nam' },
}

describe("yo'l kira", () => {
  it('brend shahri va bir juftga tushadigan ulush', () => {
    expect(originOf(cfg, ' Richmen ')?.name).toBe('Namangan')
    expect(deliveryPerPair(cfg, 'Richmen', 5)).toBe(2_000)
    expect(deliveryPerPair(cfg, 'Clarks', 3)).toBe(3_333)
    expect(deliveryPerPair(cfg, 'Ezel', 5)).toBe(1_400)
    expect(deliveryPerPair(cfg, 'Noma\'lum', 5)).toBe(0)
  })

  it('kirimda tannarx yo\'l kira bilan yoziladi', () => {
    const [row] = cartToInputs([{ id: '1', brand: 'Richmen', name: 'X', size: '', packSize: 5, cost: 175_000, delivery: 2_000, sale: 200_000, colors: [{ color: '', packs: 1 }] }])
    expect(row.costPrice).toBe(177_000)
  })
})
