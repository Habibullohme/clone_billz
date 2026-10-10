import { describe, expect, it } from 'vitest'
import { assignHues, hashHue, renameHue } from './colors'

const gap = (a: number, b: number) => Math.min(Math.abs(a - b) % 360, 360 - (Math.abs(a - b) % 360))

describe('brend ranglari', () => {
  it('har brendga alohida rang, bir-biriga yaqin emas', () => {
    const brands = Array.from({ length: 12 }, (_, i) => `Brend ${i}`)
    const map = assignHues(brands, {})
    const hues = Object.values(map)
    expect(hues).toHaveLength(12)
    for (let i = 0; i < hues.length; i++)
      for (let j = i + 1; j < hues.length; j++) expect(gap(hues[i], hues[j])).toBeGreaterThanOrEqual(20)
  })
  it('bor rang o\'zgarmaydi, yangi brendga rang qo\'shiladi', () => {
    const a = assignHues(['Little'], {})
    expect(a.little).toBe(hashHue('Little'))
    expect(assignHues(['Little'], a)).toBe(a)
    const b = assignHues(['Little', 'Velton'], a)
    expect(b.little).toBe(a.little)
    expect(b.velton).toBeTypeOf('number')
  })
  it('nomi o\'zgarsa rang ham o\'tadi', () => {
    expect(renameHue({ little: 40 }, 'Little', 'Littl')).toEqual({ littl: 40 })
  })
})
