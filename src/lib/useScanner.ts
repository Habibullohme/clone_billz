import { useEffect, useRef } from 'react'
import { ScanDetector } from './scanner'

function isEditable(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
}

/** Skaner kiritgan belgilarni input ichidan olib tashlaydi (React bilan ham ishlaydi). */
function stripTail(el: HTMLInputElement | HTMLTextAreaElement, code: string) {
  if (!el.value.endsWith(code)) return
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, el.value.slice(0, -code.length))
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Sahifa ochiq turgan paytda skanerni doim tinglaydi — qayerda fokus bo'lishidan qat'i nazar.
 * Qidiruvni bosish shart emas.
 */
export function useScanner(onScan: (code: string) => void, enabled = true) {
  const cb = useRef(onScan)
  cb.current = onScan

  useEffect(() => {
    if (!enabled) return
    const detector = new ScanDetector()
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      const active = document.activeElement
      const editable = isEditable(active)
      const code = detector.feed(e.key, e.timeStamp || performance.now(), !editable)
      if (code === null) return
      e.preventDefault()
      // Skaner Enter'i boshqa tugma ishlovchilariga (masalan, Enter — to'lov) yetib bormasin.
      e.stopImmediatePropagation()
      if (editable) stripTail(active, code)
      cb.current(code)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [enabled])
}

let audio: AudioContext | null = null

/** Qisqa ovoz: topildi — baland, topilmadi — past ikki marta. */
export function beep(ok: boolean) {
  try {
    audio ??= new AudioContext()
    const play = (freq: number, at: number, dur: number) => {
      const o = audio!.createOscillator()
      const g = audio!.createGain()
      o.frequency.value = freq
      g.gain.value = 0.08
      o.connect(g).connect(audio!.destination)
      o.start(audio!.currentTime + at)
      o.stop(audio!.currentTime + at + dur)
    }
    if (ok) play(1400, 0, 0.07)
    else {
      play(300, 0, 0.12)
      play(300, 0.18, 0.12)
    }
  } catch {
    // Ovoz bo'lmasa ham ishlayveradi.
  }
}
