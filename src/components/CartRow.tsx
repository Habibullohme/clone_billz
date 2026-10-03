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
  allowPriceEdit: boolean
  onChange: (line: CartLine) => void
  onRemove: () => void
}

export function CartRow({ line, product, discountedTotal, highlight, allowPriceEdit, onChange, onRemove }: Props) {
  const [priceDraft, setPriceDraft] = useState<string | null>(null)
  const [pairsEdit, setPairsEdit] = useState(false)
  const total = line.pairs * line.price
  const changed = line.price !== product.salePrice
  const pack = product.packSize
  const discounted = discountedTotal !== null && discountedTotal !== total

  const commitPrice = () => {
    if (priceDraft === null) return
    const v = parseSum(priceDraft)
    if (v > 0) onChange({ ...line, price: v })
    setPriceDraft(null)
  }

  const setPairs = (pairs: number) => onChange({ ...line, pairs: Math.max(1, pairs) })
  const meta = [product.article, product.brand, product.size, product.color].filter(Boolean).join(' · ')

  return (
    <div className={`row${highlight ? ' flash' : ''}`}>
      <div className="row-name">
        <div className="title">{product.name}</div>
        <div className="muted small">{meta}</div>
      </div>

      <div className="qty">
        <button className="qbtn" onClick={() => setPairs(line.pairs - pack)} disabled={line.pairs <= pack} aria-label="Bir pachka kam">−</button>
        <div className="qval">
          <b>{packsLabel(line.pairs, pack)}</b>
          {pairsEdit ? (
            <input
              className="pairs"
              type="number"
              min={1}
              autoFocus
              defaultValue={line.pairs}
              onBlur={(e) => {
                setPairs(Number(e.target.value) || line.pairs)
                setPairsEdit(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <button className="pairs-btn" onClick={() => setPairsEdit(true)} title="Donalab o'zgartirish">
              {line.pairs} juft
            </button>
          )}
        </div>
        <button className="qbtn" onClick={() => setPairs(line.pairs + pack)} aria-label="Bir pachka ko'p">+</button>
      </div>

      <div className="price">
        {allowPriceEdit ? (
          <input
            className={`input price-in${changed ? ' changed' : ''}`}
            value={priceDraft ?? formatSum(line.price)}
            aria-label="Bir juft narxi"
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
          />
        ) : (
          <b className="price-static">{formatSum(line.price)}</b>
        )}
        {changed && (
          <button className="link small" onClick={() => onChange({ ...line, price: product.salePrice })}>
            asl: {formatSum(product.salePrice)}
          </button>
        )}
      </div>

      <div className="sum">
        <span className="muted small">{line.pairs} × {formatSum(line.price)}</span>
        {discounted ? (
          <>
            <s className="muted small">{formatSum(total)}</s>
            <b>{formatSum(discountedTotal)}</b>
          </>
        ) : (
          <b>{formatSum(total)}</b>
        )}
      </div>

      <button className="icon danger" onClick={onRemove} aria-label="O'chirish">✕</button>
    </div>
  )
}
