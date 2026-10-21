import type { ProductInput } from '../types'

/** Savatdagi bitta model: bir brend, bir nom, bir narx — bir nechta rang. */
export interface CartItem {
  id: string
  brand: string
  name: string
  size: string
  packSize: number
  /** Kelish narxi (1 juft), yo'l kirasiz. */
  cost: number
  /** Yo'l kira (1 juftga) — brend shahridan hisoblanadi. */
  delivery?: number
  sale: number
  colors: { color: string; packs: number }[]
}

/** Tannarx (1 juft): kelish narxi + yo'l kira. */
export const landed = (it: Pick<CartItem, 'cost' | 'delivery'>) => it.cost + (it.delivery ?? 0)

/** Savat → kirim qatorlari (har rang alohida qator, har pachka alohida tovar bo'ladi). */
export function cartToInputs(items: CartItem[]): ProductInput[] {
  return items.flatMap((it) =>
    it.colors.filter((r) => r.packs > 0).map((r) => ({
      brand: it.brand.trim(), name: it.name.trim(), size: it.size.trim(), color: r.color.trim(),
      packSize: it.packSize, packs: r.packs, costPrice: landed(it), salePrice: it.sale,
    })),
  )
}

