/**
 * Ma'lumotlar qatlami. Hozircha brauzer xotirasida (localStorage) ishlaydi,
 * keyin shu funksiyalar Supabase bilan almashtiriladi — sahifalar o'zgarmaydi.
 */
import type { Customer, HeldCart, ImportBatch, Product, ProductInput, Sale } from '../types'
import { brandCode, makeBarcode } from '../lib/codes'
import { demoInputs } from './demo'
import type { Theme } from '../lib/theme'
import { defaultTemplates, type LabelTemplate } from '../lib/labels'

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

const memory = new Map<string, string>()

function read<T>(key: string, fallback: T): T {
  let raw: string | null | undefined
  try {
    raw = localStorage.getItem(key)
  } catch {
    // Xotira yopiq (maxfiy oyna) — sessiya xotirasidan o'qiymiz.
  }
  raw ??= memory.get(key)
  return raw ? (JSON.parse(raw) as T) : fallback
}

function write(key: string, value: unknown) {
  const raw = JSON.stringify(value)
  memory.set(key, raw)
  try {
    localStorage.setItem(key, raw)
  } catch {
    // Faqat sessiya davomida saqlanadi.
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

type SeqName = 'product' | 'sale' | 'batch'

function nextSeq(name: SeqName): number {
  const seq = read<Record<string, number>>(K.seq, {})
  seq[name] = (seq[name] ?? 0) + 1
  write(K.seq, seq)
  return seq[name]
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ---------- Mahsulotlar ----------

let seeded = false
function ensureSeed() {
  if (seeded) return
  seeded = true
  if (read<Product[] | null>(K.products, null) === null) {
    write(K.products, [])
    createBatch(demoInputs, 'manual')
  }
}

export async function getProducts(): Promise<Product[]> {
  ensureSeed()
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
function createBatch(inputs: ProductInput[], source: ImportBatch['source']): ImportBatch {
  const products = read<Product[]>(K.products, [])
  const brandSeq = read<Record<string, number>>(K.brandSeq, {})
  const now = new Date().toISOString()
  const batch: ImportBatch = {
    id: uid(), number: nextSeq('batch'), createdAt: now, source,
    productIds: [], packs: {}, costTotal: 0, saleTotal: 0,
  }
  for (const inp of inputs) {
    for (let k = 0; k < Math.max(1, inp.packs); k++) {
      const seq = nextSeq('product')
      const bk = brandSeqKey(inp.brand)
      // Qo'lda o'zgartirilgan nom bilan to'qnashmasin — band bo'lsa keyingi kod.
      let name: string
      do {
        brandSeq[bk] = (brandSeq[bk] ?? 0) + 1
        name = `${inp.name.trim()} ${brandCode(brandSeq[bk])}`
      } while (nameTaken(products, name) || codeTaken(products, inp.brand, brandCode(brandSeq[bk])))
      const p: Product = {
        id: uid(), brand: inp.brand.trim(), name,
        size: inp.size.trim(), color: inp.color.trim(),
        barcode: makeBarcode(seq),
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
  write(K.brandSeq, brandSeq)
  write(K.batches, [batch, ...read<ImportBatch[]>(K.batches, [])])
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
  return { removed, kept: ids.length - removed }
}

/** Butun kirimni o'chiradi (sotilmagan tovarlari bilan). */
export async function deleteBatch(id: string): Promise<{ removed: number; kept: number }> {
  const batch = (await getBatches()).find((b) => b.id === id)
  if (!batch) return { removed: 0, kept: 0 }
  return deleteProducts(batch.productIds)
}

export async function importProducts(inputs: ProductInput[], source: ImportBatch['source'] = 'excel'): Promise<ImportBatch> {
  ensureSeed()
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
  return null
}

export async function deleteProduct(id: string): Promise<void> {
  const products = await getProducts()
  write(K.products, products.filter((x) => x.id !== id))
}

export async function getBatches(): Promise<ImportBatch[]> {
  ensureSeed()
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
}

export async function renameBrand(from: string, to: string): Promise<void> {
  if (!to.trim()) return
  write(K.brands, read<string[]>(K.brands, []).map((b) => (b === from ? to.trim() : b)))
  const products = await getProducts()
  write(K.products, products.map((p) => (p.brand === from ? { ...p, brand: to.trim() } : p)))
}

/** Faqat tovari yo'q brendni o'chiradi. */
export async function removeBrand(name: string): Promise<boolean> {
  if ((await getProducts()).some((p) => p.brand === name)) return false
  write(K.brands, read<string[]>(K.brands, []).filter((b) => b !== name))
  return true
}

// ---------- Sozlamalar ----------

export async function getSettings(): Promise<Settings> {
  return { ...defaultSettings, ...read<Partial<Settings>>(K.settings, {}) }
}

export async function saveSettings(s: Settings) {
  write(K.settings, s)
}

// ---------- Mijozlar ----------

export async function getCustomers(): Promise<Customer[]> {
  return read<Customer[]>(K.customers, [])
}

/** Mijoz ismini eslab qoladi (yangi bo'lsa qo'shadi, bor bo'lsa oxirgi xaridni yangilaydi). */
export async function rememberCustomer(name: string): Promise<void> {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (!clean) return
  const list = await getCustomers()
  const now = new Date().toISOString()
  const existing = list.find((c) => c.name.toLowerCase() === clean.toLowerCase())
  if (existing) existing.lastSeen = now
  else list.push({ id: uid(), name: clean, lastSeen: now })
  write(K.customers, list)
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

/** Sotuvni saqlaydi va qoldiqni kamaytiradi. */
export async function saveSale(sale: Omit<Sale, 'id' | 'number' | 'createdAt'>): Promise<Sale> {
  const full: Sale = { ...sale, id: uid(), number: nextSeq('sale'), createdAt: new Date().toISOString() }
  write(K.sales, [full, ...(await getSales())])

  const products = await getProducts()
  for (const line of sale.lines) {
    const p = products.find((x) => x.id === line.productId)
    if (p) p.stock -= line.pairs
  }
  write(K.products, products)
  await rememberCustomer(sale.customerName)
  return full
}

// ---------- Kechiktirilgan savatlar ----------

export async function getHeld(): Promise<HeldCart[]> {
  return read<HeldCart[]>(K.held, [])
}

export async function holdCart(cart: Omit<HeldCart, 'id' | 'createdAt'>): Promise<void> {
  const list = await getHeld()
  write(K.held, [{ ...cart, id: uid(), createdAt: new Date().toISOString() }, ...list])
}

export async function takeHeld(id: string): Promise<HeldCart | undefined> {
  const list = await getHeld()
  const found = list.find((h) => h.id === id)
  write(K.held, list.filter((h) => h.id !== id))
  return found
}
