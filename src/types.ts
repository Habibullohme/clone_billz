export interface Product {
  id: string
  brand: string
  name: string
  article: string
  barcode: string
  /** Bir pachkadagi juftlar soni (odatda 5, Velikan — 3). */
  packSize: number
  /** Bir juftning kelish narxi, so'm. */
  costPrice: number
  /** Bir juftning sotuv narxi, so'm. */
  salePrice: number
  /** Qoldiq, juftda. */
  stock: number
}

export interface Customer {
  id: string
  name: string
  lastSeen: string
}

export interface CartLine {
  productId: string
  /** Juftlar soni. Odatda pachka hajmiga karrali. */
  pairs: number
  /** Shu savdo uchun bir juft narxi (erkin narx). */
  price: number
}

export interface Payment {
  cash: number
  usd: number
  usdRate: number
  card: number
  /** Nasiyaga qolgan summa, so'm. */
  debt: number
}

export interface SaleLine {
  productId: string
  name: string
  brand: string
  barcode: string
  packSize: number
  pairs: number
  /** Chegirmadan oldingi bir juft narxi. */
  price: number
  costPrice: number
  /** Chegirma taqsimlangandan keyingi qator summasi. */
  total: number
}

export interface Sale {
  id: string
  number: number
  createdAt: string
  customerName: string
  note: string
  lines: SaleLine[]
  subtotal: number
  discount: number
  total: number
  profit: number
  payment: Payment
  change: number
}

export interface HeldCart {
  id: string
  createdAt: string
  customerName: string
  lines: CartLine[]
  finalTotal: number | null
}
