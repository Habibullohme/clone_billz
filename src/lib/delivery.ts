/**
 * Yo'l kira: yuk qaysi shahardan keladi va bir karopka (pachka) uchun qancha to'lanadi.
 * Kirimda tannarx = kelish narxi + (karopka uchun yo'l kira ÷ pachkadagi juft).
 * Masalan: Namangan, karopkasiga 10 000, pachkada 5 juft → har juftga +2 000 (175 000 → 177 000).
 */
export interface Origin {
  id: string
  name: string
  /** Bir karopka (pachka) uchun yo'l kira, so'm. */
  perBox: number
}

export interface DeliveryCfg {
  origins?: Origin[]
  /** Brend (kichik harfda) → shahar id. */
  brandOrigins?: Record<string, string>
}

export const brandKey = (brand: string) => brand.trim().toLowerCase()

export function originOf(cfg: DeliveryCfg, brand: string): Origin | null {
  const id = cfg.brandOrigins?.[brandKey(brand)]
  return (id && cfg.origins?.find((o) => o.id === id)) || null
}

/** Bir juftga tushadigan yo'l kira (so'mgacha yaxlitlangan). */
export function deliveryPerPair(cfg: DeliveryCfg, brand: string, packSize: number): number {
  const o = originOf(cfg, brand)
  return o && o.perBox > 0 ? Math.round(o.perBox / Math.max(1, packSize)) : 0
}
