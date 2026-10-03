import { useState } from 'react'
import type { CartLine, Product } from '../types'
import { formatSum, parseSum } from '../lib/money'
import { packsLabel } from '../lib/cart'

interface Props {
  line: CartLine
  product: Product
  /** Yakuniy summa kiritilgan bo'lsa, shu qatorga tushgan summa. */
  discountedTotal: number | null
  highlight: boolean
  onChange: (line: CartLine) => void
  onRemove: () => void
}

export function CartRow({ line, product, discountedTotal, highlight, onChange, onRemove }: Props) {
  const [priceDraft, setPriceDraft] = useState<string | null>(null)
  const total = line.pairs * line.price
  const changed = line.price !== product.salePrice
  const pack = product.packSize

  const commitPrice = () => {
    if (priceDraft === null) return
    const v = parseSum(priceDraft)
    if (v > 0) onChange({ ...line, price: v })
    setPriceDraft(null)
  }

  const setPairs = (pairs: number) => onChange({ ...line, pairs: Math.max(1, pairs) })

  return (
    <div className={`row${highlight ? ' flash' : ''}`}>
      <div className="row-name">
        <div className="title">{product.name}</div>
        <div className="muted">
          {product.brand} · {product.barcode} · pachkada {pack}
        </div>
      </div>

      <div className="qty">
        <button className="qbtn" onClick={() => setPairs(line.pairs - pack)} disabled={line.pairs <= pack} title="1 pachka kam">
          −
        </button>
        <div className="qval">
          <b>{packsLabel(line.pairs, pack)}</b>
          <label className="muted">
            <input
              className="pairs"
              type="number"
              min={1}
              value={line.pairs}
              onChange={(e) => setPairs(Number(e.target.value) || 1)}
            />{' '}
            juft
          </label>
        </div>
        <button className="qbtn" onClick={() => setPairs(line.pairs + pack)} title="1 pachka ko'p">
          +
        </button>
      </div>

      <div className="price">
        <input
          className={`input price-in${changed ? ' changed' : ''}`}
          value={priceDraft ?? formatSum(line.price)}
          onFocus={(e) => {
            setPriceDraft(String(line.price))
            requestAnimationFrame(() => e.target.select())
          }}
          onChange={(e) => setPriceDraft(e.target.value)}
          onBlur={commitPrice}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setPriceDraft(null)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          title="Narxni o'zgartirish uchun bosing"
        />
        {changed && (
          <button className="link small" onClick={() => onChange({ ...line, price: product.salePrice })}>
            asl narx: {formatSum(product.salePrice)}
          </button>
        )}
      </div>

      <div className="sum">
        <div className="muted small">
          {line.pairs} × {formatSum(line.price)}
        </div>
        {discountedTotal !== null && discountedTotal !== total ? (
          <>
            <s className="muted small">{formatSum(total)}</s>
            <b>{formatSum(discountedTotal)}</b>
            <span className="muted small">≈ {formatSum(discountedTotal / line.pairs)} / juft</span>
          </>
        ) : (
          <b>{formatSum(total)}</b>
        )}
      </div>

      <button className="icon danger" onClick={onRemove} title="O'chirish">
        ✕
      </button>
    </div>
  )
}
