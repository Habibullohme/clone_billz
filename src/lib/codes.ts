/**
 * Tovar kodi: brend harfi + raqam (A1 … A200). Shu kod vitrinaga yoziladi,
 * etiketkada chiqadi va shtrix-kodning (CODE128) ichida ham aynan shu kod bo'ladi.
 */

export const MAX_PER_LETTER = 200
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export interface Brand {
  id: string
  name: string
  /** Brendga berilgan harflar, tartib bilan. Oxirgisi — hozir ishlatilayotgani. */
  letters: string[]
  /** Hozirgi harf bo'yicha oxirgi berilgan raqam. */
  last: number
}

/** Hech bir brendga berilmagan birinchi harf. */
export function freeLetter(brands: Brand[]): string {
  const used = new Set(brands.flatMap((b) => b.letters))
  const l = LETTERS.find((x) => !used.has(x))
  if (l) return l
  // 26 harf tugasa — ikki harfli: AA, AB, …
  for (const a of LETTERS) for (const b of LETTERS) if (!used.has(a + b)) return a + b
  throw new Error('Harflar tugadi')
}

/** Brendning navbatdagi kodi (brendni o'zgartirmaydi). */
export function peekCode(brand: Brand, brands: Brand[]): string {
  const letter = brand.letters[brand.letters.length - 1]
  if (brand.last < MAX_PER_LETTER) return `${letter}${brand.last + 1}`
  return `${freeLetter(brands)}1`
}

/** Navbatdagi kodni beradi va brend hisoblagichini oshiradi. Band kodlar o'tkazib yuboriladi. */
export function takeCode(brand: Brand, brands: Brand[], taken: Set<string>): string {
  for (;;) {
    if (brand.last >= MAX_PER_LETTER) {
      brand.letters.push(freeLetter(brands))
      brand.last = 0
    }
    brand.last++
    const code = `${brand.letters[brand.letters.length - 1]}${brand.last}`
    if (!taken.has(code)) return code
  }
}

const ruToEn: Record<string, string> = {
  Й: 'Q', Ц: 'W', У: 'E', К: 'R', Е: 'T', Н: 'Y', Г: 'U', Ш: 'I', Щ: 'O', З: 'P',
  Ф: 'A', Ы: 'S', В: 'D', А: 'F', П: 'G', Р: 'H', О: 'J', Л: 'K', Д: 'L',
  Я: 'Z', Ч: 'X', С: 'C', М: 'V', И: 'B', Т: 'N', Ь: 'M',
}

/**
 * Skanerdan yoki qo'ldan kelgan kodni bir xil ko'rinishga keltiradi:
 * katta harf, bo'shliqsiz; ruscha klaviaturada terilgan harflar lotinga o'giriladi (Ф12 → A12).
 */
export function normalizeCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/./g, (ch) => ruToEn[ch] ?? ch)
}

export function isValidCode(code: string): boolean {
  return /^[A-Z]{1,2}\d{1,4}$/.test(code)
}
