import { useEffect, useRef, useState } from 'react'
import { onHide } from '../lib/resume'
import { useBackClose } from '../lib/nav'
import { matchKnown, scanImage } from '../lib/code128'
import { getProducts } from '../data/store'

interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }

const FORMATS = ['ean_13', 'code_128', 'ean_8', 'upc_a']

/** Brauzerning o'z skaneri (Chrome Android) bo'lsa — o'sha; bo'lmasa (iPhone) — kutubxona. */
async function makeDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats()
      if (supported.includes('ean_13')) return new Native({ formats: FORMATS.filter((f) => supported.includes(f)) })
    } catch {
      // Kutubxonaga o'tamiz.
    }
  }
  const { BarcodeDetector } = await import('barcode-detector/ponyfill')
  return new BarcodeDetector({ formats: FORMATS as never })
}

/**
 * Telefon kamerasi bilan skaner. Oyna ochiq turadi — ketma-ket bir nechta tovarni skaner qilish mumkin.
 * Bir xil kod 2 soniya ichida qayta o'qilmaydi.
 */
export function CameraScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [last, setLast] = useState<{ code: string; n: number } | null>(null)
  const [flash, setFlash] = useState(0)
  useBackClose(onClose)
  // Ekran o'chsa yoki Telegram bloklansa — kamera darhol bo'shatiladi (ochiq qolsa, qaytganda oyna qotishi mumkin).
  useEffect(() => onHide(onClose), [onClose])

  useEffect(() => {
    let stream: MediaStream | null = null
    let stopped = false
    let timer = 0
    const seen = new Map<string, number>()

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        const v = video.current!
        v.srcObject = stream
        await v.play()
        const detector = await makeDetector()
        // Do'kondagi tovarlar kodlari — nuqsonli chop etilgan etiketkani tanish uchun.
        const known = (await getProducts()).map((p) => p.barcode).filter(Boolean)
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        let n = 0
        const found = (raw: string) => {
          const code = raw.trim()
          const now = Date.now()
          if (!code || now - (seen.get(code) ?? 0) < 2000) return
          seen.set(code, now)
          navigator.vibrate?.(60)
          setFlash((f) => f + 1)
          setLast((l) => ({ code, n: (l?.n ?? 0) + 1 }))
          onScan(code)
        }
        const tick = async () => {
          if (stopped) return
          try {
            if (v.readyState >= 2) {
              // Brauzer skaneri xato bersa ham (kutubxona yuklanmadi) — o'zimizning o'quvchi ishlayveradi.
              const hits = await detector.detect(v).catch(() => [] as { rawValue: string }[])
              hits.forEach((r) => found(r.rawValue))
              // Brauzer skaneri o'qimadi: chetida oq joyi yo'q yoki chiziqlari qo'shilib chop etilgan
              // etiketka bo'lishi mumkin — har ikkinchi kadrda o'zimiz o'qiymiz.
              if (!hits.length && ctx && n++ % 2 === 0) {
                const k = Math.min(1, 1280 / v.videoWidth)
                canvas.width = Math.round(v.videoWidth * k)
                canvas.height = Math.round(v.videoHeight * k)
                ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
                const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
                const code = scanImage(img) ?? (await matchKnown(img, known))
                if (code) found(code)
              }
            }
          } catch {
            // Kadr o'qilmadi — keyingisi.
          }
          timer = window.setTimeout(tick, 180)
        }
        tick()
      } catch (e) {
        const name = (e as Error)?.name
        setError(
          name === 'NotAllowedError'
            ? "Kameraga ruxsat berilmadi. Brauzer sozlamasidan shu sayt uchun kamerani yoqing."
            : name === 'NotFoundError'
              ? 'Kamera topilmadi.'
              : "Kamerani ochib bo'lmadi.",
        )
      }
    })()

    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="cam" role="dialog" aria-label="Kamera skaner">
      <video ref={video} className="cam-video" playsInline muted />
      <div className="cam-frame" aria-hidden="true">
        <div key={flash} className={`cam-box${flash ? ' hit' : ''}`}><span className="cam-line" /></div>
      </div>
      <div className="cam-top">
        <b>Shtrix-kodni ramkaga to'g'rilang</b>
        <button className="cam-close" onClick={onClose} aria-label="Yopish">✕</button>
      </div>
      <div className="cam-bottom">
        {error ? (
          <span className="cam-msg bad">{error}</span>
        ) : last ? (
          <span className="cam-msg">✓ {last.code} · {last.n} ta skaner qilindi</span>
        ) : (
          <span className="cam-msg">Kamera ishlamoqda…</span>
        )}
        <button className="btn primary" onClick={onClose}>Tayyor</button>
      </div>
    </div>
  )
}
