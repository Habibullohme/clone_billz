/**
 * Supabase bilan aloqa. Sayt butun ma'lumotni kirishda bir marta yuklab oladi,
 * keyin har bir o'zgarishni (qo'shildi / o'zgardi / o'chdi) bazaga yozadi.
 */
import { createClient, type Session } from '@supabase/supabase-js'
import type { Product } from '../types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

/** Baza ulanganmi. Ulanmagan bo'lsa sayt brauzer xotirasida ishlaydi (sinov rejimi). */
export const cloudEnabled = Boolean(url && key)

export const supabase = cloudEnabled
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'dk.auth' } })
  : null

export async function getSession(): Promise<Session | null> {
  return (await supabase?.auth.getSession())?.data.session ?? null
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
  if (!error) return null
  if (/invalid login/i.test(error.message)) return "Email yoki parol noto'g'ri"
  if (/fetch|network/i.test(error.message)) return "Internetga ulanib bo'lmadi"
  return error.message
}

export async function signOut() {
  await supabase?.auth.signOut()
}

/** Shu foydalanuvchiga do'konga kirish ruxsati berilganmi (staff ro'yxatida bormi). */
export async function isStaff(): Promise<boolean> {
  const { data, error } = await supabase!.from('staff').select('user_id').limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

// ---------- Jadval ↔ ilova ko'rinishi ----------

interface ProductRow {
  id: string; brand: string; name: string; size: string; color: string; barcode: string
  pack_size: number; cost_price: number; sale_price: number; stock: number; created_at: string; batch_id: string | null
}

const toRow = (p: Product): ProductRow => ({
  id: p.id, brand: p.brand, name: p.name, size: p.size, color: p.color, barcode: p.barcode,
  pack_size: p.packSize, cost_price: p.costPrice, sale_price: p.salePrice, stock: p.stock,
  created_at: p.createdAt, batch_id: p.batchId,
})

const fromRow = (r: ProductRow): Product => ({
  id: r.id, brand: r.brand, name: r.name, size: r.size, color: r.color, barcode: r.barcode,
  packSize: r.pack_size, costPrice: Number(r.cost_price), salePrice: Number(r.sale_price), stock: r.stock,
  createdAt: r.created_at, batchId: r.batch_id,
})

/** jsonb ustunli oddiy jadvallar: { id, data }. */
const docTables = { batches: 'batches', customers: 'customers', held: 'held', brands: 'brands' } as const
export type DocKind = keyof typeof docTables

async function all<T>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

/** Supabase bir so'rovda 1000 qatordan ko'p bermaydi — sahifalab o'qiymiz. */
async function paged<T>(table: string, columns: string, order: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const page = await all<T>(supabase!.from(table).select(columns).order(order).range(from, from + 999) as never)
    out.push(...page)
    if (page.length < 1000) return out
  }
}

export interface CloudSnapshot {
  products: Product[]
  sales: unknown[]
  batches: unknown[]
  customers: unknown[]
  held: unknown[]
  brands: string[]
  settings: Record<string, unknown> | null
  counters: Record<string, number>
}

export async function loadAll(): Promise<CloudSnapshot> {
  const db = supabase!
  const [products, sales, batches, customers, held, brands, settings, counters] = await Promise.all([
    paged<ProductRow>('products', '*', 'created_at'),
    paged<{ data: unknown }>('sales', 'data', 'created_at'),
    all<{ data: unknown }>(db.from('batches').select('data').order('created_at', { ascending: false })),
    all<{ data: unknown }>(db.from('customers').select('data')),
    all<{ data: unknown }>(db.from('held').select('data')),
    all<{ data: string }>(db.from('brands').select('data')),
    all<{ data: Record<string, unknown> }>(db.from('settings').select('data').eq('id', 'main')),
    all<{ name: string; value: number }>(db.from('counters').select('name, value')),
  ])
  return {
    products: products.map(fromRow),
    sales: sales.map((s) => s.data).reverse(),
    batches: batches.map((b) => b.data),
    customers: customers.map((c) => c.data),
    held: held.map((h) => h.data),
    brands: brands.map((b) => b.data),
    settings: settings[0]?.data ?? null,
    counters: Object.fromEntries(counters.map((c) => [c.name, Number(c.value)])),
  }
}

// ---------- Yozish ----------

async function check(q: PromiseLike<{ error: unknown }>) {
  const { error } = await q
  if (error) throw error
}

/** Tovarlar: yangilari to'liq qo'shiladi; o'zgarganlarida qoldiq yozilmaydi (uni faqat sotuv kamaytiradi). */
export async function syncProducts(added: Product[], changed: Product[], removed: string[]) {
  const db = supabase!
  const jobs: Promise<void>[] = []
  if (added.length) jobs.push(check(db.from('products').insert(added.map(toRow))))
  for (const p of changed) {
    const { id, stock: _stock, ...rest } = toRow(p)
    jobs.push(check(db.from('products').update(rest).eq('id', id)))
  }
  if (removed.length) jobs.push(check(db.from('products').delete().in('id', removed)))
  await Promise.all(jobs)
}

export async function syncDocs(kind: DocKind, upsert: { id: string; data: unknown; created_at?: string }[], removed: string[]) {
  const db = supabase!
  const table = docTables[kind]
  const jobs: Promise<void>[] = []
  if (upsert.length) jobs.push(check(db.from(table).upsert(upsert)))
  if (removed.length) jobs.push(check(db.from(table).delete().in('id', removed)))
  await Promise.all(jobs)
}

export async function saveSettingsRow(data: Record<string, unknown>) {
  await check(supabase!.from('settings').upsert({ id: 'main', data }))
}

/** n ta raqamni band qiladi, oxirgisini qaytaradi. */
export async function takeSeq(name: string, count = 1): Promise<number> {
  const { data, error } = await supabase!.rpc('take_seq', { p_name: name, p_count: count })
  if (error) throw error
  return Number(data)
}

/** Sotuvni yozadi va qoldiqni kamaytiradi; chek raqamini qaytaradi. */
export async function applySale(id: string, data: unknown): Promise<number> {
  const { data: n, error } = await supabase!.rpc('apply_sale', { p_id: id, p_data: data })
  if (error) throw error
  return Number(n)
}
