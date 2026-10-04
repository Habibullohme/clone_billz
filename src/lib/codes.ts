/** EAN-13 nazorat raqamini qo'shadi. */
export function ean13(base12: string): string {
  const sum = base12.split('').reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0)
  return base12 + ((10 - (sum % 10)) % 10)
}

/** Do'konning o'z shtrix-kodi: "21" + 10 xonali tartib raqami + nazorat raqami. */
export function makeBarcode(seq: number): string {
  return ean13('21' + String(seq).padStart(10, '0'))
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
