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
