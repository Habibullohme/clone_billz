import type { Product } from '../types'

/** Sinov uchun namunaviy mahsulotlar. Haqiqiy katalog Billz'dan import qilinadi. */
const rows: [brand: string, name: string, pack: number, cost: number, sale: number][] = [
  ['Little', 'Little 01', 5, 95_000, 105_000],
  ['Little', 'Little 02', 5, 95_000, 105_000],
  ['Little', 'Little qalin', 5, 105_000, 115_000],
  ['Ezel', 'Ezel 18', 5, 93_000, 110_000],
  ['Richmen', 'Richmen Pol klassika 29', 5, 150_000, 175_000],
  ['Nike', 'Nike Air 270', 5, 160_000, 190_000],
  ['Velikan', 'Velikan 46-48 qora', 3, 180_000, 215_000],
  ['Adidas', 'Adidas Run 6li', 6, 120_000, 140_000],
]

/** EAN-13 nazorat raqami. */
export function ean13(base12: string): string {
  const sum = base12
    .split('')
    .reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0)
  return base12 + ((10 - (sum % 10)) % 10)
}

export const demoProducts: Product[] = rows.map(([brand, name, packSize, costPrice, salePrice], i) => ({
  id: `demo-${i + 1}`,
  brand,
  name,
  article: `DM-${1000 + i}`,
  barcode: ean13(String(200000000100 + i)),
  packSize,
  costPrice,
  salePrice,
  stock: packSize * 20,
}))
