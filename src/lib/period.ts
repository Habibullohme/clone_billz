/** Hisobot davri: tayyor davrlar yoki bitta kun ("d:2026-10-05"). */
export type Period = 'today' | 'yesterday' | 'week' | 'month' | `d:${string}`

export function inPeriod(iso: string, period: Period, now = new Date()): boolean {
  const d = new Date(iso)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (period.startsWith('d:')) {
    const [y, m, day] = period.slice(2).split('-').map(Number)
    const from = new Date(y, m - 1, day)
    const to = new Date(y, m - 1, day + 1)
    return d >= from && d < to
  }
  if (period === 'today') return d >= start
  if (period === 'yesterday') {
    const y = new Date(start)
    y.setDate(y.getDate() - 1)
    return d >= y && d < start
  }
  const from = new Date(start)
  from.setDate(from.getDate() - (period === 'week' ? 6 : 29))
  return d >= from
}

/** Yozilayotgan sanaga nuqtalarni o'zi qo'yadi: "0510" → "05.10", "05102026" → "05.10.2026". */
export function maskDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('.')
}

/**
 * "05.10.2026", "5.10.26", "05.10" (joriy yil) → "2026-10-05". Noto'g'ri bo'lsa — null.
 */
export function parseDay(text: string, now = new Date()): string | null {
  const m = text.trim().match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4}))?$/)
  if (!m) return null
  const day = Number(m[1]), month = Number(m[2])
  let year = m[3] ? Number(m[3]) : now.getFullYear()
  if (year < 100) year += 2000
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${year}-${p(month)}-${p(day)}`
}
