/**
 * Ma'lumotlar qatlami. Baza (Supabase) ulangan bo'lsa — hammasi bazada, xotirada esa
 * tez o'qish uchun nusxasi turadi. Ulanmagan bo'lsa — brauzer xotirasida (sinov rejimi).
 */
import type { Customer, HeldCart, ImportBatch, LedgerEntry, Product, ProductInput, Sale } from '../types'
import { brandCode, makeBarcode } from '../lib/codes'
import { demoInputs } from './demo'
import type { Theme } from '../lib/theme'
import { defaultTemplates, type LabelTemplate } from '../lib/labels'
import * as cloud from './cloud'

export interface Settings {
  // Do'kon
  shopName: string
  shopPhone: string
  shopAddress: string
  /** Logotip (data URL, kichraytirilgan). */
  shopLogo: string
  /** Kassadan boshqa bo'limlarga kirish PIN kodi. Bo'sh — hali o'rnatilmagan. */
  ownerPin: string
  // Chek
  /** Chek lentasi kengligi, mm. */
  receiptWidth: number
  receiptFooter: string
  receiptShowCustomer: boolean
  receiptShowPacks: boolean
  receiptShowLogo: boolean
  // Ko'rinish
  theme: Theme
  // Valyuta
  usdRate: number
  // Kassa
  allowPriceEdit: boolean
  allowNegativeStock: boolean
  scanSound: boolean
  /** Yakuniy summa tugmalari uchun yaxlitlash qadamlari, so'm. */
  roundSteps: number[]
  // Ombor
  lowStockPacks: number
  // Etiketka
  labelTemplates: LabelTemplate[]
  labelTemplateId: string
}

export const defaultSettings: Settings = {
  shopName: "Do'kon",
  shopPhone: '',
  shopAddress: '',
  shopLogo: '',
  ownerPin: '',
  receiptWidth: 58,
  receiptFooter: 'Xaridingiz uchun rahmat!',
  receiptShowCustomer: true,
  receiptShowPacks: true,
  receiptShowLogo: true,
  usdRate: 11_850,
  theme: 'auto',
  allowPriceEdit: true,
  allowNegativeStock: true,
  scanSound: true,
  roundSteps: [10_000, 50_000, 100_000],
  lowStockPacks: 2,
  labelTemplates: defaultTemplates,
  labelTemplateId: defaultTemplates[0].id,
}

/** Ma'lumot nusxasi (JSON matn ko'rinishida — har o'qishda yangi nusxa qaytadi). */
const memory = new Map<string, string>()
let mode: 'local' | 'cloud' = 'local'

function read<T>(key: string, fallback: T): T {
  let raw = memory.get(key)
  if (raw === undefined && mode === 'local') {
    try {
      raw = localStorage.getItem(key) ?? undefined
    } catch {
      // Xotira yopiq (maxfiy oyna) — faqat sessiya xotirasi.
    }
    if (raw !== undefined) memory.set(key, raw)
  }
  return raw ? (JSON.parse(raw) as T) : fallback
}

/** Faqat nusxani yangilaydi (bazaga yozilmaydi). */
function put(key: string, value: unknown) {
  memory.set(key, JSON.stringify(value))
}

/** Har yozuvda oshadi — bazadan yangilash paytida yozuv bo'lsa, eski ma'lumot ustiga yozilmasin. */
let writeCount = 0

function write(key: string, value: unknown) {
  writeCount++
  const raw = JSON.stringify(value)
  const prev = memory.get(key)
  memory.set(key, raw)
  if (mode === 'local') {
    try {
      localStorage.setItem(key, raw)
    } catch {
      // Faqat sessiya davomida saqlanadi.
    }
  } else if (prev !== raw) {
    pending.push(syncKey(key, prev ? JSON.parse(prev) : undefined, value))
  }
}

const K = {
  products: 'dk4.products',
  batches: 'dk4.batches',
  sales: 'dk4.sales',
  customers: 'dk2.customers',
  held: 'dk4.held',
  settings: 'dk2.settings',
  brands: 'dk2.brands',
  seq: 'dk2.seq',
  brandSeq: 'dk4.brandSeq',
}

// ---------- Baza bilan sinxronlash ----------

let pending: Promise<void>[] = []
const errorListeners = new Set<(msg: string) => void>()

/** Bazaga yozib bo'lmaganda chaqiriladi (sarlavhada ogohlantirish chiqadi). */
export function onSyncError(cb: (msg: string) => void): () => void {
  errorListeners.add(cb)
  return () => errorListeners.delete(cb)
}

function syncFailed(e: unknown) {
  console.error(e)
  const msg = /fetch|network/i.test(String((e as Error)?.message ?? e))
    ? "Internet yo'q — o'zgarish saqlanmadi"
    : "Bazaga saqlanmadi: " + ((e as Error)?.message ?? String(e))
  errorListeners.forEach((cb) => cb(msg))
}

/** Navbatdagi yozuvlar tugashini kutadi. Xato bo'lsa — xabar beradi va bazadan qayta yuklaydi. */
async function flush() {
  const jobs = pending
  pending = []
  const failed = (await Promise.allSettled(jobs)).find((r) => r.status === 'rejected')
  if (failed) {
    syncFailed((failed as PromiseRejectedResult).reason)
    await refresh().catch(() => {})
  }
}

function diff<T>(prev: T[] = [], next: T[], id: (x: T) => string) {
  const before = new Map(prev.map((x) => [id(x), JSON.stringify(x)]))
  const added: T[] = []
  const changed: T[] = []
  for (const x of next) {
    const b = before.get(id(x))
    if (b === undefined) added.push(x)
    else if (b !== JSON.stringify(x)) changed.push(x)
    before.delete(id(x))
  }
  return { added, changed, removed: [...before.keys()] }
}

async function syncKey(key: string, prev: unknown, next: unknown) {
  const byId = (x: { id: string }) => x.id
  if (key === K.products) {
    const d = diff(prev as Product[], next as Product[], byId)
    return cloud.syncProducts(d.added, d.changed, d.removed)
  }
  if (key === K.settings) return cloud.saveSettingsRow(next as Record<string, unknown>)
  const kinds: Record<string, cloud.DocKind> = { [K.batches]: 'batches', [K.customers]: 'customers', [K.held]: 'held' }
  if (kinds[key]) {
    const d = diff(prev as { id: string; createdAt?: string }[], next as { id: string; createdAt?: string }[], byId)
    const rows = [...d.added, ...d.changed].map((x) => ({ id: x.id, data: x, ...(key === K.batches && { created_at: x.createdAt }) }))
    return cloud.syncDocs(kinds[key], rows, d.removed)
  }
  if (key === K.brands) {
    const brandId = (b: string) => b.trim().toLowerCase()
    const d = diff(prev as string[], next as string[], brandId)
    return cloud.syncDocs('brands', [...d.added, ...d.changed].map((b) => ({ id: brandId(b), data: b })), d.removed)
  }
  // Sotuvlar va hisoblagichlar alohida (atomar) yoziladi.
}

/** Kirishdan keyin: baza ulangan bo'lsa, hamma ma'lumotni yuklab oladi. */
export async function initStore(): Promise<void> {
  if (!cloud.cloudEnabled) return
  mode = 'cloud'
  await refresh()
  // Nasiyaga qilingan sotuvlar Nasiyalar daftarida bo'lsin (oldingilari ham).
  await syncSaleDebts().catch((e) => console.error(e))
  // Birinchi marta: shu brauzerda sozlangan do'kon sozlamalari va brendlar bazaga ko'chadi.
  if (!memory.has(K.settings)) {
    const local = localRead(K.settings)
    write(K.settings, local ?? {})
    const brands = localRead(K.brands)
    if (Array.isArray(brands) && brands.length) write(K.brands, brands)
    await flush()
  }
}

function localRead(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Bazadan yangilab oladi (boshqa kassada qilingan sotuvlar, kirimlar ko'rinadi). */
export async function refresh(): Promise<void> {
  if (mode !== 'cloud' || pending.length) return
  const before = writeCount
  const snap = await cloud.loadAll()
  // Yuklash davomida biror narsa yozilgan bo'lsa — bu ma'lumot eskirgan, tashlab yuboramiz.
  if (writeCount !== before || pending.length) return
  put(K.products, snap.products)
  put(K.sales, snap.sales)
  put(K.batches, snap.batches)
  put(K.customers, snap.customers)
  put(K.held, snap.held)
  put(K.brands, snap.brands)
  if (snap.settings) put(K.settings, snap.settings)
  else memory.delete(K.settings)
  put(K.brandSeq, Object.fromEntries(
    Object.entries(snap.counters).filter(([k]) => k.startsWith('brand:')).map(([k, v]) => [k.slice(6), v]),
  ))
}

type SeqName = 'product' | 'sale' | 'batch'

/** n ta tartib raqamini band qiladi, oxirgisini qaytaradi. */
async function takeSeq(name: SeqName, count = 1): Promise<number> {
  if (mode === 'cloud') return cloud.takeSeq(name, count)
  const seq = read<Record<string, number>>(K.seq, {})
  seq[name] = (seq[name] ?? 0) + count
  write(K.seq, seq)
  return seq[name]
}

/** Brendning n ta kod raqamini band qiladi, oxirgisini qaytaradi. */
async function takeBrandSeq(bk: string, count: number): Promise<number> {
  const map = read<Record<string, number>>(K.brandSeq, {})
  if (mode === 'cloud') {
    map[bk] = await cloud.takeSeq('brand:' + bk, count)
    put(K.brandSeq, map)
  } else {
    map[bk] = (map[bk] ?? 0) + count
    write(K.brandSeq, map)
  }
  return map[bk]
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ---------- Mahsulotlar ----------

let seeded: Promise<unknown> | null = null
function ensureSeed() {
  // Sinov rejimida birinchi ochilganda namunaviy tovarlar qo'shiladi.
  if (!seeded) {
    seeded = mode === 'local' && read<Product[] | null>(K.products, null) === null
      ? (write(K.products, []), createBatch(demoInputs, 'manual'))
      : Promise.resolve()
  }
  return seeded
}

export async function getProducts(): Promise<Product[]> {
  await ensureSeed()
  return read<Product[]>(K.products, [])
}

export async function findByBarcode(code: string): Promise<Product | undefined> {
  const products = await getProducts()
  const c = code.trim()
  return products.find((p) => p.barcode === c)
}

export function searchProducts(products: Product[], query: string, limit = 8): Product[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const words = q.split(/\s+/)
  return products
    .filter((p) => {
      const hay = `${p.brand} ${p.name} ${p.size} ${p.color} ${p.barcode}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    .slice(0, limit)
}

/** Kirim: har bir qator alohida tovar bo'lib, o'z kodini oladi. */
function brandSeqKey(brand: string) {
  return brand.trim().toLowerCase()
}

/** Brendning keyingi tartib raqami (kod uchun), hisoblagichni o'zgartirmaydi. */
export async function nextBrandNumber(brand: string): Promise<number> {
  return (read<Record<string, number>>(K.brandSeq, {})[brandSeqKey(brand)] ?? 0) + 1
}

/** Keyingi `count` ta kod (band kodlar o'tkazib yuboriladi) — formada oldindan ko'rsatish uchun. */
export async function previewCodes(brand: string, count: number): Promise<string[]> {
  const products = await getProducts()
  let n = (read<Record<string, number>>(K.brandSeq, {})[brandSeqKey(brand)] ?? 0)
  const out: string[] = []
  while (out.length < count) {
    const code = brandCode(++n)
    if (!codeTaken(products, brand, code)) out.push(code)
  }
  return out
}

/**
 * Kirim: har bir pachka — alohida tovar (qator). Nomi yoniga brend bo'yicha kod
 * qo'shiladi: "Little qalin A20". Har brendning hisobi A1 dan boshlanadi.
 */
async function createBatch(inputs: ProductInput[], source: ImportBatch['source']): Promise<ImportBatch> {
  const packsOf = (inp: ProductInput) => Math.max(1, inp.packs)
  const total = inputs.reduce((s, inp) => s + packsOf(inp), 0)
  // Raqamlar oldindan bir yo'la band qilinadi — ikki kassa bir vaqtda kiritsa ham takrorlanmaydi.
  let seq = (await takeSeq('product', total)) - total
  const pool = new Map<string, number[]>()
  for (const inp of inputs) {
    const bk = brandSeqKey(inp.brand)
    pool.set(bk, [...(pool.get(bk) ?? []), ...Array<number>(packsOf(inp)).fill(0)])
  }
  for (const [bk, list] of pool) {
    const last = await takeBrandSeq(bk, list.length)
    pool.set(bk, list.map((_, i) => last - list.length + 1 + i))
  }
  const number = await takeSeq('batch')

  const products = read<Product[]>(K.products, [])
  const now = new Date().toISOString()
  const batch: ImportBatch = {
    id: uid(), number, createdAt: now, source,
    productIds: [], packs: {}, costTotal: 0, saleTotal: 0,
  }
  for (const inp of inputs) {
    const bk = brandSeqKey(inp.brand)
    for (let k = 0; k < packsOf(inp); k++) {
      // Qo'lda o'zgartirilgan nom bilan to'qnashmasin — band bo'lsa keyingi kod.
      let name: string
      let n: number
      do {
        n = pool.get(bk)!.shift() ?? (await takeBrandSeq(bk, 1))
        name = `${inp.name.trim()} ${brandCode(n)}`
      } while (nameTaken(products, name) || codeTaken(products, inp.brand, brandCode(n)))
      const p: Product = {
        id: uid(), brand: inp.brand.trim(), name,
        size: inp.size.trim(), color: inp.color.trim(),
        barcode: makeBarcode(++seq),
        packSize: inp.packSize, costPrice: inp.costPrice, salePrice: inp.salePrice,
        stock: inp.packSize, createdAt: now, batchId: batch.id,
      }
      products.push(p)
      batch.productIds.push(p.id)
      batch.packs[p.id] = 1
      batch.costTotal += inp.packSize * inp.costPrice
      batch.saleTotal += inp.packSize * inp.salePrice
    }
  }
  write(K.products, products)
  write(K.batches, [batch, ...read<ImportBatch[]>(K.batches, [])])
  await flush()
  return batch
}

/** Sotuvda qatnashgan tovarlar (ularni o'chirib bo'lmaydi — hisobot buziladi). */
function soldIds(): Set<string> {
  return new Set(read<Sale[]>(K.sales, []).flatMap((s) => s.lines.map((l) => l.productId)))
}

/** Tovarlarni o'chiradi. Sotilganlari o'chirilmaydi; nechta o'chgani qaytadi. */
export async function deleteProducts(ids: string[]): Promise<{ removed: number; kept: number }> {
  const sold = soldIds()
  const want = new Set(ids)
  const products = await getProducts()
  const keep = products.filter((p) => !want.has(p.id) || sold.has(p.id))
  const removed = products.length - keep.length
  write(K.products, keep)
  // Kirimlardan ham olib tashlaymiz; bo'shab qolgan kirim o'chadi.
  const alive = new Set(keep.map((p) => p.id))
  write(
    K.batches,
    read<ImportBatch[]>(K.batches, [])
      .map((b) => ({ ...b, productIds: b.productIds.filter((id) => alive.has(id)) }))
      .filter((b) => b.productIds.length > 0),
  )
  await flush()
  if (mode === 'cloud' && removed) cloud.notifyBot()
  return { removed, kept: ids.length - removed }
}

/** Butun kirimni o'chiradi (sotilmagan tovarlari bilan). */
export async function deleteBatch(id: string): Promise<{ removed: number; kept: number }> {
  const batch = (await getBatches()).find((b) => b.id === id)
  if (!batch) return { removed: 0, kept: 0 }
  return deleteProducts(batch.productIds)
}

export async function importProducts(inputs: ProductInput[], source: ImportBatch['source'] = 'excel'): Promise<ImportBatch> {
  await ensureSeed()
  return createBatch(inputs, source)
}

/** Nom oxiridagi kod: "Barsofka B18" → "B18". */
export function codeOf(name: string): string | null {
  return name.trim().match(/\s([A-Z]{1,2}\d{1,3})$/)?.[1] ?? null
}

/** Shu brendda bu kod boshqa tovarda ishlatilganmi. */
export function codeTaken(products: Product[], brand: string, code: string, exceptId?: string): Product | undefined {
  const b = brand.trim().toLowerCase()
  return products.find((x) => x.id !== exceptId && x.brand.trim().toLowerCase() === b && codeOf(x.name) === code)
}

/** Tovar nomi bo'yicha to'qnashuv: bir xil nom yoki brend ichida band kod. */
export function nameConflict(products: Product[], brand: string, name: string, exceptId?: string): string | null {
  const same = nameTaken(products, name, exceptId)
  if (same) return `"${same.name}" nomli tovar allaqachon bor`
  const code = codeOf(name)
  const owner = code ? codeTaken(products, brand, code, exceptId) : undefined
  return owner ? `${code} kodi band: ${owner.name}` : null
}

/** Shu nomli boshqa tovar bormi (katta-kichik harf farqsiz). */
export function nameTaken(products: Product[], name: string, exceptId?: string): Product | undefined {
  const n = name.trim().replace(/\s+/g, ' ').toLowerCase()
  return products.find((x) => x.id !== exceptId && x.name.trim().replace(/\s+/g, ' ').toLowerCase() === n)
}

/** Tovarni saqlaydi. Nomi boshqa tovarniki bilan bir xil bo'lsa — xato matnini qaytaradi. */
export async function updateProduct(p: Product): Promise<string | null> {
  const products = await getProducts()
  const clash = nameConflict(products, p.brand, p.name, p.id)
  if (clash) return clash
  write(K.products, products.map((x) => (x.id === p.id ? { ...p, name: p.name.trim().replace(/\s+/g, ' ') } : x)))
  await flush()
  return null
}

export async function deleteProduct(id: string): Promise<void> {
  const products = await getProducts()
  write(K.products, products.filter((x) => x.id !== id))
  await flush()
}

export async function getBatches(): Promise<ImportBatch[]> {
  await ensureSeed()
  return read<ImportBatch[]>(K.batches, [])
}

// ---------- Brendlar ----------

/** Brendlar: sozlamalarda kiritilganlar + tovarlarda uchraganlar, alifbo tartibida. */
export async function getBrands(): Promise<string[]> {
  const saved = read<string[]>(K.brands, [])
  const fromProducts = (await getProducts()).map((p) => p.brand)
  const seen = new Map<string, string>()
  for (const b of [...saved, ...fromProducts]) {
    const name = b.trim()
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

export async function addBrand(name: string): Promise<void> {
  const saved = read<string[]>(K.brands, [])
  if (!saved.some((b) => b.toLowerCase() === name.trim().toLowerCase())) write(K.brands, [...saved, name.trim()])
  await flush()
}

export async function renameBrand(from: string, to: string): Promise<void> {
  if (!to.trim()) return
  write(K.brands, read<string[]>(K.brands, []).map((b) => (b === from ? to.trim() : b)))
  const products = await getProducts()
  write(K.products, products.map((p) => (p.brand === from ? { ...p, brand: to.trim() } : p)))
  await flush()
}

/** Faqat tovari yo'q brendni o'chiradi. */
export async function removeBrand(name: string): Promise<boolean> {
  if ((await getProducts()).some((p) => p.brand === name)) return false
  write(K.brands, read<string[]>(K.brands, []).filter((b) => b !== name))
  await flush()
  return true
}

// ---------- Sozlamalar ----------

const THEME_KEY = 'dk.theme'

export async function getSettings(): Promise<Settings> {
  const s = { ...defaultSettings, ...read<Partial<Settings>>(K.settings, {}) }
  // Bazada ishlaganda mavzu har qurilmaning o'zida saqlanadi.
  if (mode === 'cloud') s.theme = (localRead(THEME_KEY) as Theme | null) ?? 'auto'
  return s
}

export async function saveSettings(s: Settings) {
  if (mode === 'cloud') {
    try {
      localStorage.setItem(THEME_KEY, JSON.stringify(s.theme))
    } catch {
      // Mavzu faqat shu sessiyada qoladi.
    }
    const { theme: _theme, ...shared } = s
    write(K.settings, shared)
  } else write(K.settings, s)
  await flush()
}

// ---------- Mijozlar ----------

export async function getCustomers(): Promise<Customer[]> {
  return read<Customer[]>(K.customers, [])
}

const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ')
const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Mijozni topadi yoki yaratadi (ro'yxatga yozilmaydi — chaqiruvchi yozadi). */
function upsertCustomer(list: Customer[], name: string, phone?: string): Customer {
  const clean = cleanName(name)
  let c = list.find((x) => sameName(x.name, clean))
  if (!c) {
    c = { id: uid(), name: clean, lastSeen: new Date().toISOString() }
    list.push(c)
  }
  c.lastSeen = new Date().toISOString()
  if (phone?.trim()) c.phone = phone.trim()
  return c
}

/** Mijoz ismini eslab qoladi (yangi bo'lsa qo'shadi, bor bo'lsa oxirgi xaridni yangilaydi). */
export async function rememberCustomer(name: string, phone?: string): Promise<void> {
  if (!cleanName(name)) return
  const list = await getCustomers()
  upsertCustomer(list, name, phone)
  write(K.customers, list)
  await flush()
}

/** Nasiya qoldig'i: berilgan nasiyalar − qaytarilgan pullar. */
export function balanceOf(c: Customer): number {
  return (c.ledger ?? []).reduce((s, e) => s + (e.kind === 'debt' ? e.amount : -e.amount), 0)
}

/** Daftarga yozuv qo'shadi (mijoz bo'lmasa — yaratiladi). */
export async function addLedgerEntry(
  name: string,
  phone: string | undefined,
  entry: Omit<LedgerEntry, 'id' | 'createdAt'>,
): Promise<Customer> {
  const list = await getCustomers()
  const c = upsertCustomer(list, name, phone)
  c.ledger = [...(c.ledger ?? []), { ...entry, id: uid(), createdAt: new Date().toISOString() }]
  write(K.customers, list)
  await flush()
  return c
}

/**
 * Kassada nasiyaga qilingan barcha sotuvlar daftarda bo'lsin (Nasiyalar bo'limidan oldingi sotuvlar ham).
 * Har sotuv bir marta qo'shiladi; qo'lda o'chirilgani qayta qo'shilmaydi.
 */
export async function syncSaleDebts(): Promise<number> {
  const list = await getCustomers()
  const known = new Set(list.flatMap((c) => [...(c.ledger ?? []).map((e) => e.saleId), ...(c.ignoredSales ?? [])]))
  let added = 0
  for (const sale of [...(await getSales())].reverse()) {
    if (!(sale.payment?.debt > 0) || sale.archivedAt || known.has(sale.id)) continue
    const c = upsertCustomer(list, sale.customerName.trim() || `Noma'lum mijoz (chek №${sale.number})`, sale.customerPhone)
    c.lastSeen = sale.createdAt > (c.lastSeen ?? '') ? sale.createdAt : c.lastSeen
    c.ledger = [...(c.ledger ?? []), {
      id: uid(), kind: 'debt', amount: sale.payment.debt, note: '', saleId: sale.id, saleNumber: sale.number,
      date: sale.createdAt, createdAt: new Date().toISOString(),
    }]
    known.add(sale.id)
    added++
  }
  if (added) {
    write(K.customers, list)
    await flush()
  }
  return added
}

export async function deleteLedgerEntry(customerId: string, entryId: string): Promise<void> {
  const list = await getCustomers()
  const c = list.find((x) => x.id === customerId)
  if (!c) return
  const gone = (c.ledger ?? []).find((e) => e.id === entryId)
  if (gone?.saleId) c.ignoredSales = [...(c.ignoredSales ?? []), gone.saleId]
  c.ledger = (c.ledger ?? []).filter((e) => e.id !== entryId)
  write(K.customers, list)
  await flush()
}

/** Mijozning ismi va telefonini o'zgartirish. Ism boshqa mijozniki bilan bir xil bo'lsa — xato matni. */
export async function updateCustomer(id: string, name: string, phone: string): Promise<string | null> {
  const list = await getCustomers()
  const c = list.find((x) => x.id === id)
  if (!c) return null
  const clean = cleanName(name)
  if (!clean) return 'Ism kerak'
  if (list.some((x) => x.id !== id && sameName(x.name, clean))) return `"${clean}" ismli mijoz allaqachon bor`
  c.name = clean
  c.phone = phone.trim()
  write(K.customers, list)
  await flush()
  return null
}

export function matchCustomers(list: Customer[], query: string, limit = 6): Customer[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const words = q.split(/\s+/)
  return list
    .filter((c) => words.every((w) => c.name.toLowerCase().split(/\s+/).some((part) => part.startsWith(w))))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, limit)
}

// ---------- Sotuvlar ----------

export async function getSales(): Promise<Sale[]> {
  return read<Sale[]>(K.sales, [])
}

/** Sotuvni saqlaydi va qoldiqni kamaytiradi. Bazaga yozilmasa — xato tashlaydi (sotuv bo'lmagan hisoblanadi). */
export async function saveSale(sale: Omit<Sale, 'id' | 'number' | 'createdAt'>): Promise<Sale> {
  const id = uid()
  const createdAt = new Date().toISOString()
  const number = mode === 'cloud'
    ? await cloud.applySale(id, { ...sale, createdAt })
    : await takeSeq('sale')
  const full: Sale = { ...sale, id, number, createdAt }

  const products = await getProducts()
  for (const line of sale.lines) {
    const p = products.find((x) => x.id === line.productId)
    if (p) p.stock -= line.pairs
  }
  // Bazada qoldiq allaqachon kamaygan — bu yerda faqat nusxa yangilanadi.
  const save = mode === 'cloud' ? put : write
  save(K.sales, [full, ...(await getSales())])
  save(K.products, products)
  // Nasiyaga sotilgan bo'lsa — mijozning daftariga yoziladi.
  if (sale.payment.debt > 0 && sale.customerName.trim()) {
    await addLedgerEntry(sale.customerName, sale.customerPhone, {
      kind: 'debt', amount: sale.payment.debt, note: '', saleId: id, saleNumber: number, date: createdAt,
    })
  } else await rememberCustomer(sale.customerName, sale.customerPhone)
  // Kanaldagi sotilgan postlar "Sotilganlar"ga o'tsin.
  if (mode === 'cloud') cloud.notifyBot()
  return full
}

/** Hisobotga kiradigan sotuvlar (arxivlanganlarsiz). */
export const activeSales = (list: Sale[]) => list.filter((s) => !s.archivedAt)

/** Sotuv qoldiqqa ta'sirini qaytaradi: sign=+1 — tovar omborga qaytadi, -1 — yana chiqadi. */
async function setSaleArchived(id: string, patch: Pick<Sale, 'archivedAt' | 'archivedBy' | 'archiveReason'>, sign: 1 | -1) {
  const sales = await getSales()
  const sale = sales.find((x) => x.id === id)
  if (!sale || Boolean(sale.archivedAt) === Boolean(patch.archivedAt)) return
  const products = await getProducts()
  const touched: { id: string; stock: number }[] = []
  for (const l of sale.lines) {
    const p = products.find((x) => x.id === l.productId)
    if (!p) continue
    p.stock += sign * l.pairs
    touched.push({ id: p.id, stock: p.stock })
  }
  const next: Sale = { ...sale, ...patch }
  if (!patch.archivedAt) {
    delete next.archivedAt
    delete next.archivedBy
    delete next.archiveReason
  }
  const list = sales.map((x) => (x.id === id ? next : x))
  if (mode === 'cloud') {
    await cloud.updateSaleRow(id, next, touched)
    put(K.products, products)
    put(K.sales, list)
  } else {
    write(K.products, products)
    write(K.sales, list)
  }
}

/**
 * Sotuvni arxivlash (xato yoki sinov sotuvi). O'chirilmaydi: chek "Arxiv"da kim, qachon va nega
 * arxivlagani bilan qoladi. Tovarlar omborga qaytadi, hisobotdan chiqadi, nasiya daftardan olinadi.
 */
export async function archiveSale(id: string, reason = ''): Promise<void> {
  const by = mode === 'cloud' ? await cloud.whoAmI() : ''
  await setSaleArchived(id, { archivedAt: new Date().toISOString(), archivedBy: by, archiveReason: reason.trim() }, 1)
  const customers = await getCustomers()
  if (customers.some((c) => c.ledger?.some((e) => e.saleId === id))) {
    write(K.customers, customers.map((c) => ({ ...c, ledger: c.ledger?.filter((e) => e.saleId !== id) })))
  }
  await flush()
}

/** Arxivdan qaytarish: sotuv yana hisobotga kiradi, tovar qoldig'i yana kamayadi, nasiya qaytadi. */
export async function restoreSale(id: string): Promise<void> {
  await setSaleArchived(id, {}, -1)
  await syncSaleDebts()
  await flush()
}

// ---------- Kechiktirilgan savatlar ----------

export async function getHeld(): Promise<HeldCart[]> {
  return read<HeldCart[]>(K.held, [])
}

export async function holdCart(cart: Omit<HeldCart, 'id' | 'createdAt'>): Promise<void> {
  const list = await getHeld()
  write(K.held, [{ ...cart, id: uid(), createdAt: new Date().toISOString() }, ...list])
  await flush()
}

export async function takeHeld(id: string): Promise<HeldCart | undefined> {
  const list = await getHeld()
  const found = list.find((h) => h.id === id)
  write(K.held, list.filter((h) => h.id !== id))
  await flush()
  return found
}
