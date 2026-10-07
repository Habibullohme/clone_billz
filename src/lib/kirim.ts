import type { ProductInput } from '../types'

/** Savatdagi bitta model: bir brend, bir nom, bir narx — bir nechta rang. */
export interface CartItem {
  id: string
  brand: string
  name: string
  size: string
  packSize: number
  cost: number
  sale: number
  colors: { color: string; packs: number }[]
}

/** Savat → kirim qatorlari (har rang alohida qator, har pachka alohida tovar bo'ladi). */
export function cartToInputs(items: CartItem[]): ProductInput[] {
  return items.flatMap((it) =>
    it.colors.filter((r) => r.packs > 0).map((r) => ({
      brand: it.brand.trim(), name: it.name.trim(), size: it.size.trim(), color: r.color.trim(),
      packSize: it.packSize, packs: r.packs, costPrice: it.cost, salePrice: it.sale,
    })),
  )
}

