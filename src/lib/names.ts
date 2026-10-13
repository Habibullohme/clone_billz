/**
 * Ism: har so'z bosh harf bilan ("alisher aka qarshi" → "Alisher Aka Qarshi").
 * Faqat so'z boshi o'zgaradi — qolgan harflar yozilganidek qoladi; apostrofdan keyingi harf (o'g'il) tegilmaydi.
 */
export function capitalizeWords(s: string): string {
  return s.replace(/(^|\s)(\p{Ll})/gu, (_, sp: string, ch: string) => sp + ch.toLocaleUpperCase('uz'))
}
