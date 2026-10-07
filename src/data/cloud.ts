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

/** Botda berilgan login ("ali") — sayt domenidagi email: ali@richmen.netlify.app. */
export const loginToEmail = (login: string, host = location.hostname) => {
  const v = login.trim().toLowerCase()
  return v.includes('@') ? v : `${v}@${host}`
}

export async function signIn(login: string, password: string): Promise<string | null> {
  const { error } = await supabase!.auth.signInWithPassword({ email: loginToEmail(login), password })
  if (!error) return null
  if (/invalid login/i.test(error.message)) return "Login yoki parol noto'g'ri"
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

// ---------- Qurilmalar ----------

export interface Device {
  id: string
  email: string
  name: string
  created_at: string
  last_seen: string
  revoked: boolean
}

/** Shu brauzerning doimiy belgisi. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem('dk.device')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('dk.device', id)
    }
    return id
  } catch {
    return 'nostorage'
  }
}

/** "Windows · Chrome", "Android · Chrome", "iPhone · Safari". */
export function deviceName(ua = navigator.userAgent): string {
  const os = /Android/i.test(ua) ? 'Android'
    : /iPhone/i.test(ua) ? 'iPhone'
    : /iPad/i.test(ua) ? 'iPad'
    : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'Mac'
    : /Linux/i.test(ua) ? 'Linux' : 'Qurilma'
  const browser = /YaBrowser/i.test(ua) ? 'Yandex'
    : /Edg\//i.test(ua) ? 'Edge'
    : /OPR\/|Opera/i.test(ua) ? 'Opera'
    : /Firefox|FxiOS/i.test(ua) ? 'Firefox'
    : /Chrome|CriOS/i.test(ua) ? 'Chrome'
    : /Safari/i.test(ua) ? 'Safari' : 'Brauzer'
  return `${os} · ${browser}`
}

/**
 * Qurilmani ro'yxatga yozadi (oxirgi faollik). Agar boshqa qurilmadan "chiqarilgan" bo'lsa — false
 * (shunda hisobdan chiqiladi). Jadval hali yaratilmagan bo'lsa — jim o'tib ketadi.
 */
export async function touchDevice(): Promise<boolean> {
  const db = supabase!
  const id = deviceId()
  const { data, error } = await db.from('devices').select('revoked').eq('id', id).maybeSingle()
  if (error) return true
  if (data?.revoked) {
    await db.from('devices').delete().eq('id', id)
    return false
  }
  const email = (await db.auth.getUser()).data.user?.email ?? ''
  await db.from('devices').upsert({ id, email, name: deviceName(), last_seen: new Date().toISOString() })
  return true
}

export async function listDevices(): Promise<Device[] | null> {
  const { data, error } = await supabase!.from('devices').select('*').order('last_seen', { ascending: false })
  return error ? null : (data as Device[])
}

/** Boshqa qurilmani chiqarish: u keyingi ochilishida (yoki oynaga qaytganda) hisobdan chiqadi. */
export async function revokeDevice(id: string) {
  await check(supabase!.from('devices').update({ revoked: true }).eq('id', id))
}

/** Shu qurilmadan boshqa hamma joydan chiqish (kirish kalitlari ham bekor qilinadi). */
export async function signOutOthers() {
  const id = deviceId()
  await check(supabase!.from('devices').update({ revoked: true }).neq('id', id))
  await supabase!.auth.signOut({ scope: 'others' })
}

/** Shu qurilmadan chiqish — ro'yxatdan ham o'chadi. */
export async function signOutHere() {
  await supabase?.from('devices').delete().eq('id', deviceId())
  await supabase?.auth.signOut()
}

/** Shu qurilma chiqarilganmi (tez tekshiruv — bitta qator). */
export async function isRevoked(): Promise<boolean> {
  const { data, error } = await supabase!.from('devices').select('revoked').eq('id', deviceId()).maybeSingle()
  return !error && Boolean(data?.revoked)
}

/**
 * Boshqa qurilmadan "Chiqarish" bosilsa — darhol bilib olish (Supabase Realtime).
 * Realtime yoqilmagan bo'lsa ham ishlaydi: chaqiruvchi qo'shimcha ravishda tez-tez tekshiradi.
 */
export function watchRevoke(onRevoked: () => void): () => void {
  const ch = supabase!
    .channel('device-' + deviceId())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'devices', filter: `id=eq.${deviceId()}` }, (p) => {
      if ((p.new as { revoked?: boolean }).revoked) onRevoked()
    })
    .subscribe()
  return () => {
    supabase!.removeChannel(ch)
  }
}

/**
 * Telegram botga xabar: sotilgan (yoki o'chirilgan) tovarlarning postlari kanaldan olinsin.
 * Bot hali ulanmagan bo'lsa — jim o'tib ketadi (sotuvga ta'sir qilmaydi).
 */
export function notifyBot() {
  supabase?.functions.invoke('bot', { body: { action: 'sync' } }).catch(() => {})
}

/** Sotuv yozuvini yangilash (arxivlash / qaytarish) va tovarlar qoldig'ini to'g'rilash. */
export async function updateSaleRow(id: string, data: unknown, stocks: { id: string; stock: number }[]) {
  const db = supabase!
  await Promise.all(stocks.map((s) => check(db.from('products').update({ stock: s.stock }).eq('id', s.id))))
  await check(db.from('sales').update({ data }).eq('id', id))
}

/** Kim bajardi: hisob emaili va qurilma. */
export async function whoAmI(): Promise<string> {
  const email = (await supabase?.auth.getUser())?.data.user?.email
  return [email, deviceName()].filter(Boolean).join(' · ')
}

export type PanelRole = 'admin' | 'boss' | 'seller'

/**
 * Mini app (Telegram): bot adminlari va botda login qilib bog'langanlar parolsiz kiradi.
 * Natija: kirildi (va hisob turi), 'unbound' — avval botda kirish kerak, aks holda xato matni.
 */
export async function telegramSignIn(initData: string): Promise<{ role: PanelRole } | 'unbound' | string> {
  const { data, error } = await supabase!.functions.invoke('bot', { body: { action: 'tg-auth', initData } })
  if (error) return "Botga ulanib bo'lmadi"
  const r = data as { token_hash?: string; role?: PanelRole; unbound?: boolean; error?: string }
  if (r.unbound) return 'unbound'
  if (!r.token_hash || !r.role) return r.error ?? "Kirib bo'lmadi"
  const v = await supabase!.auth.verifyOtp({ token_hash: r.token_hash, type: 'magiclink' })
  return v.error ? v.error.message : { role: r.role }
}

/** Kirgan hisob turi (bot bergan loginlarda app_metadata.role; boshqalar — boss). */
export async function sessionRole(): Promise<PanelRole> {
  const role = (await getSession())?.user.app_metadata?.role
  return role === 'seller' ? 'seller' : role === 'boss' ? 'boss' : 'admin'
}

/** Faqat shu qurilmadagi sessiyani yopadi. */
export async function signOutLocal() {
  await supabase?.auth.signOut({ scope: 'local' })
}
