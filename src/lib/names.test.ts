import { describe, expect, it } from 'vitest'
import { capitalizeWords } from './names'

describe('mijoz ismi', () => {
  it("har so'z bosh harf bilan, apostrof va qolgan harflar tegilmaydi", () => {
    expect(capitalizeWords('alisher aka qarshi')).toBe('Alisher Aka Qarshi')
    expect(capitalizeWords("o'ktam  g'ulomov")).toBe("O'ktam  G'ulomov")
    expect(capitalizeWords('nodir AKA')).toBe('Nodir AKA')
    expect(capitalizeWords('шавкат ака')).toBe('Шавкат Ака')
    expect(capitalizeWords('')).toBe('')
  })
})
