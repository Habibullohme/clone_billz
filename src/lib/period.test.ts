import { describe, expect, it } from 'vitest'
import { inPeriod, maskDate, parseDay } from './period'

describe('davr', () => {
  const now = new Date(2026, 9, 7, 12)
  it('sana yozish', () => {
    expect(maskDate('05102026')).toBe('05.10.2026')
    expect(maskDate('0510')).toBe('05.10')
    expect(maskDate('05.1')).toBe('05.1')
    expect(parseDay('05.10.2026', now)).toBe('2026-10-05')
    expect(parseDay('5.10.26', now)).toBe('2026-10-05')
    expect(parseDay('05.10', now)).toBe('2026-10-05')
    expect(parseDay('31.02.2026', now)).toBeNull()
    expect(parseDay('05.1', now)).toBe('2026-01-05')
    expect(parseDay('abc', now)).toBeNull()
  })
  it('bitta kun', () => {
    expect(inPeriod(new Date(2026, 9, 5, 23, 59).toISOString(), 'd:2026-10-05', now)).toBe(true)
    expect(inPeriod(new Date(2026, 9, 6, 0, 1).toISOString(), 'd:2026-10-05', now)).toBe(false)
    expect(inPeriod(new Date(2026, 9, 6, 10).toISOString(), 'yesterday', now)).toBe(true)
  })
})
