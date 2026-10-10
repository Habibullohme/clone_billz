import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type React from 'react'
import type { Product } from '../types'
import { fieldNames, fieldText, placedFields, type LabelTemplate, type PlacedField } from '../lib/labels'
import { Barcode } from './Barcode'

/** Ustma-ust turgan shu maydonlar bitta matn bo'lib oqadi: "richmen barsofka / qoshma qora". */
const FLOW_KEYS = new Set(['name', 'size', 'color'])

type Block = { kind: 'barcode'; f: PlacedField } | { kind: 'text'; fields: PlacedField[] }

function blocks(fields: PlacedField[]): Block[] {
  const out: Block[] = []
  const sorted = [...fields].sort((a, b) => a.y - b.y)
  for (const f of sorted) {
    if (f.key === 'barcode') {
      out.push({ kind: 'barcode', f })
      continue
    }
    const last = out[out.length - 1]
    const prev = last?.kind === 'text' ? last.fields[last.fields.length - 1] : null
    const overlap = prev ? Math.min(prev.x + prev.w, f.x + f.w) - Math.max(prev.x, f.x) : 0
    const joins = prev && last?.kind === 'text'
      && FLOW_KEYS.has(prev.key) && FLOW_KEYS.has(f.key)
      && f.y - (prev.y + prev.h) < 1.5 && overlap > Math.min(prev.w, f.w) / 2
    if (joins) last.fields.push(f)
    else out.push({ kind: 'text', fields: [f] })
  }
  return out
}

/** Matn qutiga sig'masa — shrift sig'guncha kichrayadi (so'zlar bo'linmaydi). */
function FitText({ style, align, children }: { style: React.CSSProperties; align: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current
      if (!el) return
      const inner = el.firstElementChild as HTMLElement
      // O'rtaga tekislangan matn qutidan tepaga ham chiqadi — shuning uchun ichki qism o'lchanadi.
      const over = () => inner.scrollHeight > el.clientHeight + 0.5 || inner.scrollWidth > el.clientWidth + 0.5
      let k = 1
      el.style.setProperty('--k', '1')
      while (k > 0.45 && over()) {
        k -= 0.05
        el.style.setProperty('--k', String(k))
      }
    }
    fit()
    // Shriftlar keyinroq yuklansa — qayta o'lchaymiz.
    document.fonts?.ready.then(fit)
  })
  return <div ref={ref} className={`lbl-text ${align}`} style={style}>{children}</div>
}

/**
 * Etiketka haqiqiy o'lchamda (mm) chiziladi — ekranda ham, chopda ham bir xil.
 * Har maydon o'z joyida (x, y, eni, bo'yi); shtrix-kod o'z qutisini to'liq egallaydi.
 */
export function LabelView({ t, p }: { t: LabelTemplate; p: Product }) {
  const fields = placedFields(t).filter((f) => f.key in fieldNames)
  return (
    <div className="lbl" style={{ width: `${t.width}mm`, height: `${t.height}mm` }}>
      {blocks(fields).map((b, i) => {
        if (b.kind === 'barcode') {
          const f = b.f
          // Raqamlar alohida chiziladi — chiziqlar cho'zilsa ham raqamlar buzilmaydi.
          const digits = t.barcodeText ? Math.min(3.4, Math.max(1.6, f.h * 0.24)) : 0
          return (
            <div key={i} className="lbl-bc" style={{ left: `${f.x}mm`, top: `${f.y}mm`, width: `${f.w}mm`, height: `${f.h}mm` }}>
              <div className="lbl-bars"><Barcode code={p.barcode} format={t.format} text={false} stretch /></div>
              {digits > 0 && <div className="lbl-digits" style={{ fontSize: `${digits * 0.85}mm`, height: `${digits}mm` }}>{p.barcode}</div>}
            </div>
          )
        }
        const fs = b.fields
        const x = Math.min(...fs.map((f) => f.x))
        const y = Math.min(...fs.map((f) => f.y))
        const right = Math.max(...fs.map((f) => f.x + f.w))
        const bottom = Math.max(...fs.map((f) => f.y + f.h))
        return (
          <FitText
            key={i}
            align={fs[0].align}
            style={{ left: `${x}mm`, top: `${y}mm`, width: `${right - x}mm`, height: `${bottom - y}mm`, textAlign: fs[0].align }}
          >
            <p style={{ fontSize: `calc(${Math.max(...fs.map((f) => f.size))}pt * var(--k, 1))` }}>
              {fs.map((f, j) => (
                <span key={j} style={{ fontSize: `calc(${f.size}pt * var(--k, 1))`, fontWeight: f.bold ? 700 : 400 }}>
                  {j > 0 && ' '}{fieldText(f.key, p)}
                </span>
              ))}
            </p>
          </FitText>
        )
      })}
    </div>
  )
}
