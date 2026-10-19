/**
 * Kamera kadridan CODE128 shtrix-kodni o'qish — chetida oq joyi (quiet zone) yo'q kodlar uchun ham.
 * Brauzer skaneri va kutubxonalar kod oldida oq joy bo'lishini talab qiladi; etiketka chetga surilib
 * chop etilgan bo'lsa, ular kodni umuman ko'rmaydi. Bu yerda oq joy tekshirilmaydi — xato o'qishdan
 * CODE128 nazorat belgisi himoya qiladi.
 */

/** Belgilar chizmasi (1 — qora modul, 0 — oq): 0–105 belgilar va STOP (106). JsBarcode jadvali bilan bir xil. */
const BITS = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100', '10011001000', '10011000100',
  '10001100100', '11001001000', '11001000100', '11000100100', '10110011100', '10011011100', '10011001110', '10111001100',
  '10011101100', '10011100110', '11001110010', '11001011100', '11001001110', '11011100100', '11001110100', '11101101110',
  '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010', '11011011000', '11011000110',
  '11000110110', '10100011000', '10001011000', '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110',
  '11101110110', '11010001110', '11000101110', '11011101000', '11011100010', '11011101110', '11101011000', '11101000110',
  '11100010110', '11101101000', '11101100010', '11100011010', '11101111010', '11001000010', '11110001010', '10100110000',
  '10100001100', '10010110000', '10010000110', '10000101100', '10000100110', '10110010000', '10110000100', '10011010000',
  '10011000010', '10000110100', '10000110010', '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100', '10011110010', '11110100100', '11110010100',
  '11110010010', '11011011110', '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', '10111101000',
  '10111100010', '11110101000', '11110100010', '10111011110', '10111101110', '11101011110', '11110101110', '11010000100',
  '11010010000', '11010011100', '1100011101011',
]

/** "11011001100" → [2, 1, 2, 2, 2, 2] (bar, oq, bar, …). */
function widths(bits: string): number[] {
  const out: number[] = []
  for (let i = 0; i < bits.length; ) {
    let j = i
    while (j < bits.length && bits[j] === bits[i]) j++
    out.push(j - i)
    i = j
  }
  return out
}

const PATTERNS = BITS.slice(0, 106).map(widths)
const STOP = widths(BITS[106])
const START_A = 103
const START_B = 104
const START_C = 105

/**
 * Chegaradan chegaragacha masofalar (bar+oq, oq+bar, …): printer chiziqni yo'g'onroq chiqarsa
 * (bar kengayib, oq torayadi) ham bu yig'indilar o'zgarmaydi — skanerlar ham shunday o'qiydi.
 */
const EDGES = PATTERNS.map((p) => p.slice(0, -1).map((v, k) => v + p[k + 1]))
const STOP_EDGES = STOP.slice(0, -1).map((v, k) => v + STOP[k + 1])

/** Kesmalarni modulga aylantirib, eng yaqin belgini topadi. Mos kelmasa — -1. */
function matchSymbol(runs: number[], at: number): number {
  if (at + 6 > runs.length) return -1
  let sum = 0
  for (let k = 0; k < 6; k++) sum += runs[at + k]
  const unit = sum / 11
  const e = [0, 0, 0, 0, 0].map((_, k) => (runs[at + k] + runs[at + k + 1]) / unit)
  let best = -1
  let bestErr = Infinity
  for (let s = 0; s < EDGES.length; s++) {
    const p = EDGES[s]
    let err = 0
    for (let k = 0; k < 5 && err < bestErr; k++) err += Math.abs(e[k] - p[k])
    if (err < bestErr) {
      bestErr = err
      best = s
    }
  }
  // Har bir masofada o'rtacha ~0,4 moduldan ortiq xato — bu belgi emas.
  return bestErr <= 3.5 ? best : -1
}

function isStop(runs: number[], at: number): boolean {
  if (at + 7 > runs.length) return false
  let sum = 0
  for (let k = 0; k < 7; k++) sum += runs[at + k]
  const unit = sum / 13
  let err = 0
  for (let k = 0; k < 6; k++) err += Math.abs((runs[at + k] + runs[at + k + 1]) / unit - STOP_EDGES[k])
  return err <= 2.4
}

/** Belgilar ketma-ketligini matnga aylantiradi (A, B, C to'plamlari). Noto'g'ri bo'lsa — null. */
function symbolsToText(codes: number[]): string | null {
  let set = codes[0] === START_A ? 'A' : codes[0] === START_B ? 'B' : 'C'
  let text = ''
  for (let i = 1; i < codes.length; i++) {
    const c = codes[i]
    if (set === 'C') {
      if (c < 100) text += String(c).padStart(2, '0')
      else if (c === 100) set = 'B'
      else if (c === 101) set = 'A'
      else if (c !== 102) return null
    } else {
      if (c < 96) text += String.fromCharCode(set === 'B' ? c + 32 : c < 64 ? c + 32 : c - 64)
      else if (c === 99) set = 'C'
      else if (c === 100 && set === 'A') set = 'B'
      else if (c === 101 && set === 'B') set = 'A'
      // SHIFT va FNC belgilar bizning kodlarda yo'q.
      else if (c !== 102) return null
    }
  }
  return text
}

/** Kesmalar (bar, oq, bar, …) ichidan START dan STOP gacha butun kodni qidiradi. */
export function decodeRuns(runs: number[]): string | null {
  for (let i = 0; i + 6 + 6 + 7 <= runs.length; i += 2) {
    const start = matchSymbol(runs, i)
    if (start !== START_A && start !== START_B && start !== START_C) continue
    const codes = [start]
    let at = i + 6
    while (at + 7 <= runs.length) {
      if (isStop(runs, at) && codes.length >= 3) {
        const check = codes.pop()!
        const sum = codes.reduce((s, c, k) => s + c * (k === 0 ? 1 : k), 0)
        if (sum % 103 === check) {
          const text = symbolsToText(codes)
          if (text) return text
        }
        break
      }
      const s = matchSymbol(runs, at)
      if (s < 0 || s >= 103) break
      codes.push(s)
      at += 6
    }
  }
  return null
}

/**
 * Bitta chiziq (yorug'lik qiymatlari) bo'ylab qora/oq kesmalar.
 * Chegara — yorug'lik eng keskin o'zgargan joy (gradiyent cho'qqisi), oddiy "qora/oq" chegarasi emas:
 * printer barni yo'g'on chiqarib, oradagi ingichka oq joy deyarli yo'qolganda ham ikki chet ajraladi.
 * Chet o'rni piksel ichida aniqlanadi (parabola bilan).
 */
export function lineRuns(lum: ArrayLike<number>): number[] {
  const n = lum.length
  if (n < 8) return []
  // Biroz silliqlash (shovqin cho'qqilari chet bo'lib ketmasin).
  const sm = new Float32Array(n)
  for (let x = 0; x < n; x++) sm[x] = (lum[Math.max(0, x - 1)] + 2 * lum[x] + lum[Math.min(n - 1, x + 1)]) / 4
  const d = new Float32Array(n)
  for (let x = 1; x < n - 1; x++) d[x] = (sm[x + 1] - sm[x - 1]) / 2
  // Mahalliy kontrast — kuchsiz o'zgarishlar (qog'oz tolasi, soya) chet hisoblanmaydi.
  const win = 24
  const edges: { pos: number; up: boolean; mag: number }[] = []
  for (let x = 2; x < n - 2; x++) {
    const v = Math.abs(d[x])
    if (v < 3 || v < Math.abs(d[x - 1]) || v < Math.abs(d[x + 1])) continue
    if (v === Math.abs(d[x - 1]) && edges.length && edges[edges.length - 1].pos > x - 2) continue
    let lo = 255
    let hi = 0
    for (let k = Math.max(0, x - win); k <= Math.min(n - 1, x + win); k++) {
      if (sm[k] < lo) lo = sm[k]
      if (sm[k] > hi) hi = sm[k]
    }
    if (hi - lo < 30 || v < (hi - lo) * 0.12) continue
    const a = Math.abs(d[x - 1])
    const c = Math.abs(d[x + 1])
    const den = a - 2 * v + c
    const pos = x + (den === 0 ? 0 : (0.5 * (a - c)) / den)
    const e = { pos, up: d[x] > 0, mag: v }
    const last = edges[edges.length - 1]
    // Ketma-ket bir xil yo'nalishdagi ikki chet — kuchlisini qoldiramiz.
    if (last && last.up === e.up) {
      if (e.mag > last.mag) edges[edges.length - 1] = e
    } else edges.push(e)
  }
  const runs: number[] = []
  for (let i = 1; i < edges.length; i++) runs.push(edges[i].pos - edges[i - 1].pos)
  return runs
}

/**
 * Kutilgan kod (modullarda: bar, oq, bar, …) kesmalarga qanchalik mos — o'rtacha xato (modulda).
 * Printer ingichka (1 modulli) oq joyni chiqarmay, ikki barni qo'shib yuborgan bo'lsa ham mos keladi:
 * bitta kuzatilgan bar kutilgan "bar + 1 oq + bar" ga (yoki ikki marta qo'shilganiga) teng bo'lishi mumkin.
 * Chetdagi barlar fon bilan qo'shilib ketgan bo'lishi mumkin (oq joy yo'q) — ularning eni hisobga olinmaydi.
 * Mos kelmasa — null.
 */
export function templateError(runs: number[], exp: number[]): number | null {
  return templateErrors(runs, [exp], 0)[0]
}

/**
 * Bir nechta kutilgan kod uchun xatolar (templateError bilan bir xil). prefix — hamma kodlarda bir xil
 * boshlanish (kesmalar soni): avval faqat shu qism tekshiriladi, mos kelmagan joydan hech bir kod sinalmaydi.
 */
export function templateErrors(runs: number[], exps: number[][], prefix: number): (number | null)[] {
  const best: (number | null)[] = exps.map(() => null)
  if (!exps.length) return best
  const head = exps[0]
  for (let s = 0; s + 6 < runs.length; s++) {
    // Modul enini taxminan boshlang'ich belgidan olamiz; u ham qo'shilib ketgan bo'lishi mumkin —
    // shuning uchun bir nechta taxmin bilan sinaymiz (keyin en kuzatilgan kesmalardan aniqlashadi).
    let p = 0
    for (let k = 1; k < 6; k++) p += runs[s + k]
    p /= 11 - head[0]
    for (const f of [0.75, 0.87, 1, 1.15, 1.3]) {
      // Birinchi bar fon bilan yoki keyingi bar bilan qo'shilgan bo'lishi mumkin.
      for (let first = 1; first < 6; first += 2) {
        if (first > 1 && head[first - 2] !== 1) break
        let mods0 = 0
        for (let k = 0; k < first; k++) mods0 += head[k]
        if (prefix > first + 6 && alignFrom(runs, s, head, first, p * f, mods0, prefix - 6) === null) continue
        exps.forEach((exp, t) => {
          const e = alignFrom(runs, s, exp, first, p * f, mods0)
          if (e !== null && (best[t] === null || e < best[t]!)) best[t] = e
        })
      }
    }
  }
  return best
}

/** runs[s] — kutilgan exp[0..first-1] (birinchi bar), keyingilari — exp[first..] bilan tekislanadi. */
function alignFrom(runs: number[], s: number, exp: number[], first: number, u: number, mods0: number, stopAt = Infinity): number | null {
  if (runs[s] < mods0 * u * 0.6) return null
  let i = first
  let j = s + 1
  let obs = 0
  let mods = 0
  let err = 0
  let n = 0
  while (i < exp.length) {
    // Faqat boshini tekshirish (prefiks) — shu yergacha mos keldi.
    if (i >= stopAt) return n ? err / n : 0
    if (j >= runs.length) return null
    const unit = mods > 8 ? obs / mods : u
    const v = runs[j] / unit
    let m = exp[i]
    let step = 1
    let e = Math.abs(v - m)
    // Qo'shilib ketgan barlar: bar + 1 oq + bar (+ 1 oq + bar …).
    if (i % 2 === 0) {
      let sum = exp[i]
      for (let k = i + 1; k + 1 < exp.length && exp[k] === 1 && k <= i + 5; k += 2) {
        sum += exp[k] + exp[k + 1]
        const em = Math.abs(v - sum)
        if (em + 0.15 < e) {
          e = em
          m = sum
          step = k + 2 - i
        }
      }
    }
    // Oxirgi bar fon bilan qo'shilgan bo'lishi mumkin — faqat juda tor bo'lmasin.
    if (i + step >= exp.length) return v < m * 0.6 ? null : n >= exp.length / 2 ? err / n : null
    if (e > 0.85) return null
    err += e
    n++
    obs += runs[j]
    mods += m
    i += step
    j++
  }
  return null
}

const expectedRuns = new Map<string, number[]>()

/** Kod qanday chizilishi kerak (modullarda). Chop etishdagidek JsBarcode bilan hisoblanadi. */
async function runsOf(code: string): Promise<number[] | null> {
  const cached = expectedRuns.get(code)
  if (cached) return cached
  const { default: JsBarcode } = await import('jsbarcode')
  const out: { encodings?: { data: string }[] } = {}
  try {
    JsBarcode(out, code, { format: 'CODE128' })
  } catch {
    return null
  }
  const runs = widths(out.encodings!.map((e) => e.data).join(''))
  expectedRuns.set(code, runs)
  return runs
}

/**
 * Nuqsonli chop etilgan etiketka uchun: kadrdagi chiziqlarni do'kondagi tovarlar kodlari bilan solishtiradi.
 * Faqat bitta kod aniq mos kelsa qaytaradi (ikkinchi eng yaqini ancha uzoq bo'lishi shart) — aks holda null.
 */
export async function matchKnown(
  img: { data: ArrayLike<number>; width: number; height: number },
  codes: string[],
): Promise<string | null> {
  const templates: [string, number[]][] = []
  for (const c of codes) {
    const r = await runsOf(c)
    if (r) templates.push([c, r])
  }
  // Hamma kodlarda bir xil boshlanish (masalan "2100000…") — tez saralash uchun.
  let prefix = templates.length ? templates[0][1].length : 0
  for (const [, r] of templates) {
    let k = 0
    while (k < prefix && k < r.length && r[k] === templates[0][1][k]) k++
    prefix = k
  }
  const exps = templates.map(([, r]) => r)
  const votes = new Map<string, number>()
  for (const lum of scanLines(img)) {
    for (const runs of [lineRuns(lum), lineRuns(lum.slice().reverse())]) {
      const errs = templateErrors(runs, exps, prefix)
      let best = -1
      let bestErr = Infinity
      let second = Infinity
      errs.forEach((e, t) => {
        if (e === null) return
        if (e < bestErr) {
          second = bestErr
          bestErr = e
          best = t
        } else if (e < second) second = e
      })
      if (best >= 0 && bestErr < 0.3 && second - bestErr > 0.12) {
        const code = templates[best][0]
        votes.set(code, (votes.get(code) ?? 0) + 1)
      }
    }
  }
  // Kamida ikki chiziq bir xil kodni ko'rsatsin, boshqa kod ovoz olmagan bo'lsin.
  if (votes.size !== 1) return null
  const [[code, n]] = [...votes]
  return n >= 2 ? code : null
}

function* scanLines(img: { data: ArrayLike<number>; width: number; height: number }): Generator<Float32Array> {
  const { data, width: w, height: h } = img
  const lumAt = (x: number, y: number) => {
    const i = (y * w + x) * 4
    return data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11
  }
  const rows = 15
  for (let r = 0; r < rows; r++) {
    const y = Math.round(h * (0.2 + (0.6 * r) / (rows - 1)))
    const line = new Float32Array(w)
    for (let x = 0; x < w; x++) line[x] = lumAt(x, y)
    yield line
  }
  for (let c = 0; c < rows; c++) {
    const x = Math.round(w * (0.2 + (0.6 * c) / (rows - 1)))
    const line = new Float32Array(h)
    for (let y = 0; y < h; y++) line[y] = lumAt(x, y)
    yield line
  }
}

function tryLine(lum: Float32Array): string | null {
  const runs = lineRuns(lum)
  // Birinchi kesma oq bo'lsa ham, qora bo'lsa ham — ikkala juftlikdan boshlab ko'ramiz.
  const fwd = decodeRuns(runs) ?? decodeRuns(runs.slice(1))
  if (fwd) return fwd
  const rev = runs.slice().reverse()
  return decodeRuns(rev) ?? decodeRuns(rev.slice(1))
}

/** Kadrning o'rta qismidan bir nechta gorizontal va vertikal chiziq bo'ylab qidiradi. */
export function scanImage(img: { data: ArrayLike<number>; width: number; height: number }): string | null {
  for (const line of scanLines(img)) {
    const t = tryLine(line)
    if (t) return t
  }
  return null
}
