import type { ShopBrand } from '../lib/brand'

/** Do'kon belgisi: logotip bo'lsa — rasm, bo'lmasa — nomining birinchi harfi. */
export function ShopMark({ brand, big }: { brand: ShopBrand; big?: boolean }) {
  return brand.logo
    ? <img className={`shop-logo${big ? ' big' : ''}`} src={brand.logo} alt="" />
    : <div className={`shop-mark${big ? ' big' : ''}`}>{(brand.name.trim() || 'D')[0]}</div>
}
