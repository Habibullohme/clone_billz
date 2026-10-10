/** Telefon rasmini kichraytirish (uzun tomoni max px, JPEG) — tez yuklanadi, Telegram uchun yetarli sifat. */
export function compressImage(file: File, max = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(img.src)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error("Rasmni o'qib bo'lmadi"))
    img.src = URL.createObjectURL(file)
  })
}
