/** Do'kon nomi va logotipi — kirishdan oldin ham (login sahifasida) ko'rinishi uchun shu qurilmada eslab qolinadi. */
export interface ShopBrand { name: string; logo: string }

const KEY = 'dk.brand'

export function cachedBrand(): ShopBrand {
  try {
    return { name: "Do'kon", logo: '', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { name: "Do'kon", logo: '' }
  }
}

export function rememberBrand(b: ShopBrand) {
  try {
    localStorage.setItem(KEY, JSON.stringify(b))
  } catch {
    // Saqlab bo'lmasa — login sahifasida oddiy belgi turadi.
  }
}
