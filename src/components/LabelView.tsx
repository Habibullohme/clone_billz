import type { Product } from '../types'
import { fieldText, type LabelTemplate } from '../lib/labels'
import { Barcode } from './Barcode'

/** Etiketka haqiqiy o'lchamda (mm) chiziladi — ekranda ham, chopda ham bir xil. */
export function LabelView({ t, p }: { t: LabelTemplate; p: Product }) {
  return (
    <div className="lbl" style={{ width: `${t.width}mm`, height: `${t.height}mm` }}>
      {t.fields.map((f, i) =>
        f.key === 'barcode' ? (
          <div key={i} className="lbl-bc" style={{ height: `${f.size}mm` }}>
            <Barcode code={p.barcode} format={t.format} text={t.barcodeText} height={60} fontSize={18} />
          </div>
        ) : (
          <div
            key={i}
            className="lbl-text"
            style={{ fontSize: `${f.size}pt`, fontWeight: f.bold ? 700 : 400, textAlign: f.align }}
          >
            {fieldText(f.key, p)}
          </div>
        ),
      )}
    </div>
  )
}
