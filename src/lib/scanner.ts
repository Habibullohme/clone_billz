/**
 * USB skaner klaviatura kabi ishlaydi: belgilarni juda tez yozadi va oxirida Enter bosadi.
 * Bu detektor tugmalar orasidagi vaqtga qarab skanerni odam yozishidan ajratadi.
 */
export class ScanDetector {
  private buffer = ''
  private times: number[] = []

  constructor(
    /** Ikki belgi orasidagi maksimal o'rtacha vaqt (ms). */
    private maxAvgGap = 40,
    private minLength = 6,
    /** Shuncha vaqt jim tursa bufer tozalanadi. */
    private resetAfter = 300,
  ) {}

  /**
   * Har bir tugma bosilganda chaqiriladi.
   * Enter kelganda skanerlangan kodni qaytaradi (aks holda null).
   * `relaxed` — fokus input'da bo'lmasa, sekin yozilgan kodni ham qabul qilamiz.
   */
  feed(key: string, time: number, relaxed = false): string | null {
    const last = this.times[this.times.length - 1]
    if (last !== undefined && time - last > this.resetAfter) this.reset()

    if (key === 'Enter') {
      const code = this.buffer
      const fast = this.isFast()
      this.reset()
      if (code.length >= this.minLength && (fast || relaxed)) return code
      return null
    }
    if (key.length === 1) {
      this.buffer += key
      this.times.push(time)
    }
    return null
  }

  reset() {
    this.buffer = ''
    this.times = []
  }

  private isFast(): boolean {
    if (this.times.length < 2) return false
    const span = this.times[this.times.length - 1] - this.times[0]
    return span / (this.times.length - 1) <= this.maxAvgGap
  }
}
