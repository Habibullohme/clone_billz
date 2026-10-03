import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

export function Barcode({ code, height = 40, fontSize = 12 }: { code: string; height?: number; fontSize?: number }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current) return
    try {
      JsBarcode(ref.current, code, {
        format: /^\d{13}$/.test(code) ? 'EAN13' : 'CODE128',
        height, fontSize, margin: 0, width: 1.6, background: 'transparent', lineColor: '#000',
        font: 'JetBrains Mono, monospace', textMargin: 1,
      })
    } catch {
      // Noto'g'ri kod — bo'sh qoladi.
    }
  }, [code, height, fontSize])
  return <svg ref={ref} className="barcode" />
}
