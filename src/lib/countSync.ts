/**
 * Qayta sanash natijasini bir nechta qurilma orasida birlashtirish.
 * Har bir skaner va bekor qilish vaqti bilan yoziladi — keyingisi g'olib. Hech narsa jimgina yo'qolmaydi.
 */
export interface CountSession {
  /** Sanash identifikatori: yangi sanash boshlansa, boshqa qurilmalardagi eskisi almashadi. */
  sid?: string
  startedAt: string
  /** Shtrix-kod → necha marta skaner qilindi. */
  scans: Record<string, number>
  /** Skanerlar tartibi (oxirgisi yuqorida). */
  order: string[]
  /** Faqat shu brendlar solishtiriladi (bo'sh — hammasi). */
  brands: string[]
  /** Ko'rib chiqilgan ("e'tiborsiz") shtrix-kodlar. */
  ignored: string[]
  /** Yorlig'i tushib qolgan — yangi etiketka kerak. */
  relabel?: string[]
  /** Skaner qilingan vaqt (ms). */
  at?: Record<string, number>
  /** Skaner bekor qilingan vaqt (ms). */
  gone?: Record<string, number>
  /** "Yangi etiketka" ro'yxatidan olingan vaqt (ms). */
  relGone?: Record<string, number>
}

/** Bazadagi yozuv: sanash yoki "boshidan boshlandi" belgisi. */
export type CountRow = CountSession | { resetAt: number }

const maxMap = (a: Record<string, number> = {}, b: Record<string, number> = {}) => {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v)
  return out
}

/** Eski yozuvlarga vaqt belgilarini beradi (tartib bo'yicha) va identifikator qo'yadi. */
export function normalize(s: CountSession): CountSession {
  const base = Date.parse(s.startedAt) || 0
  const at = { ...(s.at ?? {}) }
  s.order.forEach((c, i) => { if (s.scans[c] && !at[c]) at[c] = base + (s.order.length - i) })
  for (const c of Object.keys(s.scans)) if (!at[c]) at[c] = base
  return { ...s, sid: s.sid ?? `legacy-${s.startedAt}`, at, gone: s.gone ?? {}, relGone: s.relGone ?? {}, relabel: s.relabel ?? [] }
}

/** Oldingi va yangi holat farqidan vaqt belgilarini yangilaydi. */
export function stamp(prev: CountSession | null, next: CountSession, now = Date.now()): CountSession {
  const n = normalize(next)
  const at = { ...n.at }, gone = { ...n.gone }, relGone = { ...n.relGone }
  for (const c of Object.keys(n.scans)) if (!prev?.scans[c]) at[c] = now
  for (const c of Object.keys(prev?.scans ?? {})) if (!n.scans[c]) gone[c] = now
  for (const c of prev?.relabel ?? []) if (!n.relabel!.includes(c)) relGone[c] = now
  return { ...n, at, gone, relGone }
}

const isReset = (r: CountRow | null): r is { resetAt: number } => Boolean(r && 'resetAt' in r)

/**
 * Ikki holatni birlashtiradi. `local` — shu qurilmadagi, `remote` — bazadagi.
 * null qaytsa — sanash yo'q (boshidan boshlangan).
 */
export function merge(localRaw: CountSession | null, remote: CountRow | null): CountSession | null {
  const local = localRaw ? normalize(localRaw) : null
  if (isReset(remote)) return local && Date.parse(local.startedAt) > remote.resetAt ? local : null
  const r = remote ? normalize(remote) : null
  if (!local) return r
  if (!r) return local
  // Boshqa sanash: keyinroq boshlangani qoladi.
  if (local.sid !== r.sid) {
    return Date.parse(local.startedAt) >= Date.parse(r.startedAt) ? local : r
  }
  const at = maxMap(local.at, r.at), gone = maxMap(local.gone, r.gone), relGone = maxMap(local.relGone, r.relGone)
  const codes = new Set([...Object.keys(local.scans), ...Object.keys(r.scans)])
  const scans: Record<string, number> = {}
  for (const c of codes) if ((at[c] ?? 0) > (gone[c] ?? -1)) scans[c] = Math.max(local.scans[c] ?? 0, r.scans[c] ?? 0) || 1
  const order = Object.keys(scans).sort((a, b) => (at[b] ?? 0) - (at[a] ?? 0))
  const relabel = [...new Set([...local.relabel!, ...r.relabel!])].filter((c) => scans[c] && (at[c] ?? 0) > (relGone[c] ?? -1))
  const startedAt = local.startedAt < r.startedAt ? local.startedAt : r.startedAt
  const brands = !local.brands.length || !r.brands.length ? [] : [...new Set([...local.brands, ...r.brands])]
  return { sid: local.sid, startedAt, brands, scans, order, ignored: [...new Set([...local.ignored, ...r.ignored])], relabel, at, gone, relGone }
}
