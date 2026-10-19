import { describe, expect, it } from 'vitest'
import JsBarcode from 'jsbarcode'
import { decodeRuns, matchKnown, scanImage } from './code128'

/** JsBarcode chizgan modullar ("1101…") — haqiqiy etiketkadagi bilan bir xil. */
function modules(code: string): string {
  const out: { encodings?: { data: string }[] } = {}
  JsBarcode(out, code, { format: 'CODE128' })
  return out.encodings!.map((e) => e.data).join('')
}

/** Rasm qatori: chap tomonda qorong'i fon (oq joy yo'q), px — bitta modul necha piksel, xira chetlar bilan. */
function row(bits: string, px: number, left = 'dark'): number[] {
  const line: number[] = []
  const bg = left === 'dark' ? 40 : 230
  for (let i = 0; i < 30; i++) line.push(bg)
  // Kod etiketka chetidan atigi 1 modul ichkarida.
  for (let i = 0; i < px; i++) line.push(235)
  for (const b of bits) for (let i = 0; i < px; i++) line.push(b === '1' ? 25 : 235)
  for (let i = 0; i < 6 * px; i++) line.push(235)
  for (let i = 0; i < 30; i++) line.push(bg)
  // Kamera xiraligi: 3 nuqtali o'rtacha.
  const blur = line.map((v, i) => (line[Math.max(0, i - 1)] + v + line[Math.min(line.length - 1, i + 1)]) / 3)
  return blur
}

function image(line: number[], height = 40) {
  const width = line.length
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = data[i + 1] = data[i + 2] = line[x]
      data[i + 3] = 255
    }
  return { data, width, height }
}

describe('CODE128 (oq joysiz)', () => {
  it('etiketka chetiga tegib turgan kodni o\'qiydi', () => {
    for (const code of ['2100000006601', '2100000006595', '2100000005673', '2100000003129']) {
      // Kamera yaqin tutilganda bitta modul 3+ piksel bo'ladi.
      for (const px of [3, 4, 5]) {
        expect(scanImage(image(row(modules(code), px)))).toBe(code)
      }
    }
  })

  it('teskari (180°) tutilsa ham o\'qiydi', () => {
    const line = row(modules('2100000006601'), 3).reverse()
    expect(scanImage(image(line))).toBe('2100000006601')
  })

  it('nazorat belgisi mos kelmasa — hech narsa qaytarmaydi', () => {
    const bits = modules('2100000006601')
    // Bitta ma'lumot belgisini boshqasiga almashtiramiz (start 11 modul, keyin belgilar).
    const broken = bits.slice(0, 22) + '11001101100' + bits.slice(33)
    expect(scanImage(image(row(broken, 3)))).toBeNull()
  })

  it('kesmalar bo\'yicha to\'g\'ridan-to\'g\'ri', () => {
    const bits = modules('2100000004898')
    const runs: number[] = []
    for (let i = 0; i < bits.length; ) {
      let j = i
      while (j < bits.length && bits[j] === bits[i]) j++
      runs.push((j - i) * 2.4)
      i = j
    }
    expect(decodeRuns(runs)).toBe('2100000004898')
  })
})

/** Printer 1 modulli oq joylarni chiqarmagan etiketka: shunday oq joylarning bir qismi qora bo'lib qoladi. */
function dropSpaces(bits: string, every: number): string {
  let out = ''
  let seen = 0
  for (let i = 0; i < bits.length; i++) {
    const single = bits[i] === '0' && bits[i - 1] === '1' && bits[i + 1] === '1'
    out += single && seen++ % every === 0 ? '1' : bits[i]
  }
  return out
}

describe("nuqsonli chop etilgan etiketka (ma'lum kodlar bilan solishtirish)", () => {
  const codes = Array.from({ length: 300 }, (_, i) => `21000000${String(4000 + i * 10).padStart(4, '0')}`)
    .map((c) => c.slice(0, 12))
    .map((b) => b + ((10 - (b.split('').reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0) % 10)) % 10))

  it("oddiy o'quvchi o'qiy olmaydi, lekin ro'yxatdagi kod aniq topiladi", async () => {
    const code = codes[137]
    const bits = dropSpaces(modules(code), 3)
    const img = image(row(bits, 3), 40)
    expect(scanImage(img)).toBeNull()
    expect(await matchKnown(img, codes)).toBe(code)
  })

  it("ro'yxatda yo'q kod — hech narsa qaytarmaydi (boshqa tovar bilan adashmaydi)", async () => {
    const code = codes[137]
    const img = image(row(dropSpaces(modules(code), 3), 3), 40)
    expect(await matchKnown(img, codes.filter((c) => c !== code))).toBeNull()
  })
})
