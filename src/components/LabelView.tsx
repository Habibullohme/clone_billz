import type { Product } from '../types'
import { fieldNames, fieldText, placedFields, type LabelTemplate } from '../lib/labels'
import { Barcode } from './Barcode'

/**
 * Etiketka haqiqiy o'lchamda (mm) chiziladi — ekranda ham, chopda ham bir xil.
 * Har maydon o'z joyida (x, y, eni, bo'yi); shtrix-kod o'z qutisini to'liq egallaydi.
 */
export function LabelView({ t, p }: { t: LabelTemplate; p: Product }) {
  return (
    <div className="lbl" style={{ width: `${t.width}mm`, height: `${t.height}mm` }}>
      {placedFields(t).filter((f) => f.key in fieldNames).map((f, i) => {
        const box = { left: `${f.x}mm`, top: `${f.y}mm`, width: `${f.w}mm`, height: `${f.h}mm` }
        if (f.key === 'barcode') {
          // Raqamlar alohida chiziladi — chiziqlar cho'zilsa ham raqamlar buzilmaydi.
          const digits = t.barcodeText ? Math.min(3.4, Math.max(1.6, f.h * 0.24)) : 0
          return (
            <div key={i} className="lbl-bc" style={box}>
              <div className="lbl-bars"><Barcode code={p.barcode} format={t.format} text={false} stretch /></div>
              {digits > 0 && <div className="lbl-digits" style={{ fontSize: `${digits * 0.85}mm`, height: `${digits}mm` }}>{p.barcode}</div>}
            </div>
          )
        }
        return (
          <div
            key={i}
            className={`lbl-text ${f.align}`}
            style={{ ...box, fontSize: `${f.size}pt`, fontWeight: f.bold ? 700 : 400, textAlign: f.align }}
          >
            <span>{fieldText(f.key, p)}</span>
          </div>
        )
      })}
    </div>
  )
}
