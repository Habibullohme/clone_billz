import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

interface Props {
  code: string
  /** Chiziqlar balandligi, px. */
  height?: number
  fontSize?: number
  format?: 'CODE128' | 'EAN13'
  text?: boolean
  /** Qutini to'liq egallasin (chiziqlar eniga va bo'yiga cho'ziladi). */
  stretch?: boolean
}

export function Barcode({ code, height = 40, fontSize = 12, format = 'CODE128', text = true, stretch = false }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const fmt = format === 'EAN13' && !/^\d{12,13}$/.test(code) ? 'CODE128' : format
    try {
      JsBarcode(ref.current, code, {
        format: fmt, height, fontSize, margin: 0, width: 2, background: 'transparent', lineColor: '#000',
        font: 'JetBrains Mono, monospace', textMargin: 1, displayValue: text,
      })
      if (stretch) {
        const svg = ref.current
        const w = svg.getAttribute('width')
        const h = svg.getAttribute('height')
        svg.setAttribute('viewBox', `0 0 ${parseFloat(w ?? '0')} ${parseFloat(h ?? '0')}`)
        svg.setAttribute('preserveAspectRatio', 'none')
        svg.removeAttribute('width')
        svg.removeAttribute('height')
      }
    } catch {
      // Noto'g'ri kod — bo'sh qoladi.
    }
  }, [code, height, fontSize, format, text, stretch])
  return <svg ref={ref} className="barcode" />
}
