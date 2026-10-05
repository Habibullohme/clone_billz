import { useEffect, useRef, useState } from 'react'
import { useBackClose } from '../lib/nav'

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
        const tick = async () => {
          if (stopped) return
          try {
            if (v.readyState >= 2) {
              for (const r of await detector.detect(v)) {
                const code = r.rawValue.trim()
                const now = Date.now()
                if (!code || now - (seen.get(code) ?? 0) < 2000) continue
                seen.set(code, now)
                navigator.vibrate?.(60)
                setFlash((f) => f + 1)
                setLast((l) => ({ code, n: (l?.n ?? 0) + 1 }))
                onScan(code)
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
