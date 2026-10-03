const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

/** 1425000 → "1 425 000" */
export function formatSum(value: number): string {
  return fmt.format(Math.round(value)).replace(/ /g, ' ')
}

/** "1 425 000", "1425k", "1.4m" → 1425000. Noto'g'ri bo'lsa NaN. */
export function parseSum(input: string): number {
  const s = input.trim().toLowerCase().replace(/\s+/g, '').replace(',', '.')
  if (!s) return NaN
  const m = s.match(/^(\d+(?:\.\d+)?)(k|m|ming|mln)?$/)
  if (!m) return NaN
  const n = parseFloat(m[1])
  const mult = m[2] === 'k' || m[2] === 'ming' ? 1_000 : m[2] === 'm' || m[2] === 'mln' ? 1_000_000 : 1
  return Math.round(n * mult)
}

/** 712500 → "712.5 ming", 1200000 → "1.2 mln" (tezkor tugmalar uchun). */
export function shortSum(value: number): string {
  if (value >= 1_000_000) return `${+(value / 1_000_000).toFixed(2)} mln`
  if (value >= 1_000) return `${+(value / 1_000).toFixed(1)} ming`
  return String(value)
}
