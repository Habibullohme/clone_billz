import { describe, expect, it } from 'vitest'
import { freeLetter, normalizeCode, peekCode, takeCode, type Brand } from './codes'

const brand = (name: string, letters: string[], last = 0): Brand => ({ id: name, name, letters, last })

describe('tovar kodlari', () => {
  it('har brendga o\'z harfi, kodlar ketma-ket', () => {
    const ezel = brand('Ezel', ['A'])
    const all = [ezel, brand('Nike', ['B'])]
    expect(peekCode(ezel, all)).toBe('A1')
    expect(takeCode(ezel, all, new Set())).toBe('A1')
    expect(takeCode(ezel, all, new Set())).toBe('A2')
    expect(freeLetter(all)).toBe('C')
  })

  it('200 dan keyin brendga yangi bo\'sh harf beriladi', () => {
    const ezel = brand('Ezel', ['A'], 200)
    const all = [ezel, brand('Nike', ['B'])]
    expect(peekCode(ezel, all)).toBe('C1')
    expect(takeCode(ezel, all, new Set())).toBe('C1')
    expect(ezel.letters).toEqual(['A', 'C'])
  })

  it('qo\'lda band qilingan kod o\'tkazib yuboriladi', () => {
    const ezel = brand('Ezel', ['A'], 4)
    expect(takeCode(ezel, [ezel], new Set(['A5']))).toBe('A6')
  })

  it('ruscha klaviaturada skanerlangan kod to\'g\'rilanadi', () => {
    expect(normalizeCode('ф12')).toBe('A12')
    expect(normalizeCode(' a12 ')).toBe('A12')
    expect(normalizeCode('И7')).toBe('B7')
  })
})
