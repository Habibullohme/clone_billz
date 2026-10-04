/** EAN-13 nazorat raqamini qo'shadi. */
export function ean13(base12: string): string {
  const sum = base12.split('').reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0)
  return base12 + ((10 - (sum % 10)) % 10)
}

/** Do'konning o'z shtrix-kodi: "21" + 10 xonali tartib raqami + nazorat raqami. */
export function makeBarcode(seq: number): string {
  return ean13('21' + String(seq).padStart(10, '0'))
}

/** Artikul: brendning 3 harfi + tartib raqami, masalan "NIK-0007". */
const cyr: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E', Ж: 'J', З: 'Z', И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M',
  Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'X', Ц: 'S', Ч: 'C', Ш: 'S', Щ: 'S',
  Ы: 'I', Э: 'E', Ю: 'Y', Я: 'Y', Ў: 'O', Қ: 'Q', Ғ: 'G', Ҳ: 'H',
}

export function makeArticle(brand: string, seq: number): string {
  const letters = brand
    .toUpperCase()
    .replace(/./g, (ch) => cyr[ch] ?? ch)
    .replace(/[^A-Z]/g, '')
    .padEnd(3, 'X')
    .slice(0, 3)
  return `${letters}-${String(seq).padStart(4, '0')}`
}

export const CODES_PER_LETTER = 200

/** n-chi harf: 0 → A, 25 → Z, 26 → AA, … */
function letter(i: number): string {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}

/**
 * Brend ichidagi tartib raqamidan kod: 1 → A1, 200 → A200, 201 → B1, …
 * Har brend o'z hisobini A1 dan boshlaydi; kod model nomi yoniga yoziladi ("Little qalin A20").
 */
export function brandCode(n: number): string {
  const i = n - 1
  return `${letter(Math.floor(i / CODES_PER_LETTER))}${(i % CODES_PER_LETTER) + 1}`
}
