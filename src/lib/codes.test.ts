import { describe, expect, it } from 'vitest'
import { brandCode } from './codes'

describe('brend kodi', () => {
  it('A1 … A200, keyin B1', () => {
    expect(brandCode(1)).toBe('A1')
    expect(brandCode(200)).toBe('A200')
    expect(brandCode(201)).toBe('B1')
    expect(brandCode(400)).toBe('B200')
    expect(brandCode(26 * 200 + 1)).toBe('AA1')
  })
})

import { codeOf, codeTaken } from '../data/store'
import type { Product } from '../types'

const prod = (id: string, brand: string, name: string) => ({ id, brand, name }) as Product

describe('kod band', () => {
  it('nom oxiridagi kod', () => {
    expect(codeOf('Barsofka B18')).toBe('B18')
    expect(codeOf('Ezel 18')).toBeNull()
  })
  it('brend ichida boshqa modelda ishlatilgan kod band', () => {
    const list = [prod('1', 'Richmen', 'Pol klassika B18')]
    expect(codeTaken(list, 'Richmen', 'B18')?.id).toBe('1')
    expect(codeTaken(list, 'Ezel', 'B18')).toBeUndefined()
  })
})
