/**
 * Ma'lumotlar qatlami. Hozircha brauzer xotirasida (localStorage) ishlaydi,
 * keyin shu funksiyalar Supabase bilan almashtiriladi — sahifalar o'zgarmaydi.
 */
import type { Customer, HeldCart, Product, Sale } from '../types'
import { demoProducts } from './demo'

export interface Settings {
  shopName: string
  shopPhone: string
  receiptFooter: string
  usdRate: number
  /** Tezkor yakuniy summa tugmalari uchun yaxlitlash qadami, so'm. */
  roundStep: number
}

const defaults: Settings = {
  shopName: "Do'kon",
  shopPhone: '',
  receiptFooter: 'Xaridingiz uchun rahmat!',
  usdRate: 11_850,
  roundStep: 50_000,
}

const memory = new Map<string, string>()

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key) ?? memory.get(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    const raw = memory.get(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  }
}

function write(key: string, value: unknown) {
  const raw = JSON.stringify(value)
  memory.set(key, raw)
  try {
    localStorage.setItem(key, raw)
  } catch {
    // Xotira yopiq bo'lsa (masalan, maxfiy oyna) — faqat sessiya davomida saqlanadi.
  }
}

const K = {
  products: 'dk.products',
  sales: 'dk.sales',
  customers: 'dk.customers',
  held: 'dk.held',
  settings: 'dk.settings',
  saleSeq: 'dk.saleSeq',
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export async function getProducts(): Promise<Product[]> {
  return read<Product[] | null>(K.products, null) ?? demoProducts
}

export async function findByBarcode(code: string): Promise<Product | undefined> {
  const products = await getProducts()
  const c = code.trim()
  return products.find((p) => p.barcode === c) ?? products.find((p) => p.article.toLowerCase() === c.toLowerCase())
}

export function searchProducts(products: Product[], query: string, limit = 8): Product[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const words = q.split(/\s+/)
  return products
    .filter((p) => {
      const hay = `${p.brand} ${p.name} ${p.article} ${p.barcode}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    .slice(0, limit)
}

export async function getSettings(): Promise<Settings> {
  return { ...defaults, ...read<Partial<Settings>>(K.settings, {}) }
}

export async function saveSettings(s: Settings) {
  write(K.settings, s)
}

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

export async function getSales(): Promise<Sale[]> {
  return read<Sale[]>(K.sales, [])
}

export async function nextSaleNumber(): Promise<number> {
  return read<number>(K.saleSeq, 0) + 1
}

/** Sotuvni saqlaydi va qoldiqni kamaytiradi. */
export async function saveSale(sale: Omit<Sale, 'id' | 'number' | 'createdAt'>): Promise<Sale> {
  const number = await nextSaleNumber()
  const full: Sale = { ...sale, id: uid(), number, createdAt: new Date().toISOString() }
  write(K.saleSeq, number)
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
