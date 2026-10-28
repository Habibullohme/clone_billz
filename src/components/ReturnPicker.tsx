import { useEffect, useMemo, useState } from 'react'
import type { CartLine, Product, Sale } from '../types'
import { activeSales, getSales, searchProducts } from '../data/store'
import { formatSum, parseSum } from '../lib/money'
import { Modal } from './ui'

/**
 * Qaytgan yuk (kassada): mijoz olib ketgan pachkani qaytarib olib keldi.
 * Ko'pincha yorlig'i bo'lmaydi — nomi yoki kodi (A121) bilan topiladi; yorlig'i bo'lsa skaner/raqam.
 * Savatga minus bilan tushadi: summadan ayiriladi, sotuv saqlanganda pachka omborga qaytadi.
 */
export function ReturnPicker({ products, onAdd, onClose }: {
  products: Product[]
  onAdd: (line: CartLine) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [sales, setSales] = useState<Sale[]>([])
  const [pick, setPick] = useState<Product | null>(null)
  const [packs, setPacks] = useState('1')
  const [price, setPrice] = useState('')
  useEffect(() => { getSales().then(setSales) }, [])

  /** Har tovar oxirgi marta kimga, qaysi narxda sotilgan. */
  const lastSold = useMemo(() => {
    const m = new Map<string, { sale: Sale; price: number }>()
    for (const s of activeSales(sales)) for (const l of s.lines) {
      if (l.pairs <= 0) continue
      const prev = m.get(l.productId)
      if (!prev || prev.sale.createdAt < s.createdAt) m.set(l.productId, { sale: s, price: Math.round(l.total / l.pairs) })
    }
    return m
  }, [sales])

  const code = q.trim()
  const exact = /^\d{8,14}$/.test(code) ? products.find((p) => p.barcode === code) : undefined
  // Qaytgan yuk odatda sotilgan (qoldig'i 0) — shuning uchun hamma tovar ichidan qidiriladi, sotilganlari oldinda.
  const hits = exact ? [exact] : code.length >= 2
    ? searchProducts(products, code, 40).sort((a, b) => Number(a.stock > 0) - Number(b.stock > 0)).slice(0, 12)
    : []

  const choose = (p: Product) => {
    setPick(p)
    setPacks('1')
    setPrice(String(lastSold.get(p.id)?.price ?? p.salePrice))
  }
  const n = Math.max(0, Math.floor(Number(packs) || 0))
  const pr = parseSum(price)
  const ok = pick && n > 0 && pr > 0

  return (
    <Modal title="↩ Qaytgan yuk" onClose={onClose}>
      {!pick ? (
        <>
          <p className="muted small">Yorlig'i bo'lsa — skaner qiling yoki raqamini yozing. Bo'lmasa — nomi yoki kodi bilan toping (masalan "A121" yoki "barsofka A121").</p>
          <input
            className="input"
            autoFocus
            placeholder="Nom, kod (A121) yoki shtrix-kod"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && hits.length === 1) choose(hits[0]) }}
          />
          <div className="ret-list">
            {hits.map((p) => {
              const last = lastSold.get(p.id)
              return (
                <button key={p.id} className="ret-hit" onClick={() => choose(p)}>
                  <span>
                    <b>{p.name}</b>
                    <span className="muted small"> · {p.brand} · {p.color} · {p.size} · {p.packSize} juft</span>
                    <br />
                    <span className="muted small">
                      {last ? `Sotilgan: ${last.sale.customerName || 'mijozsiz'}, chek №${last.sale.number}, ${new Date(last.sale.createdAt).toLocaleDateString('ru-RU')}` : 'Sotuvi topilmadi'}
                      {p.stock > 0 ? ` · omborda ${p.stock} juft` : ''}
                    </span>
                  </span>
                  <b className="ret-price">{formatSum(last?.price ?? p.salePrice)}</b>
                </button>
              )
            })}
            {code.length >= 2 && !hits.length && <p className="muted">Topilmadi.</p>}
          </div>
        </>
      ) : (
        <>
          <div className="ret-picked">
            <b>{pick.name}</b>
            <span className="muted small">{pick.brand} · {pick.color} · {pick.size} · pachkada {pick.packSize} juft</span>
            <button className="btn ghost small" onClick={() => setPick(null)}>Boshqasini tanlash</button>
          </div>
          <div className="grid2">
            <label className="field"><span>Necha pachka qaytdi</span>
              <input className="input" inputMode="numeric" autoFocus value={packs} onFocus={(e) => e.target.select()} onChange={(e) => setPacks(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="field"><span>Qaytariladigan narx (1 juft)</span>
              <input className="input" inputMode="numeric" value={formatSum(pr)} onFocus={(e) => e.target.select()} onChange={(e) => setPrice(String(parseSum(e.target.value)))} />
            </label>
          </div>
          <p className="muted small">
            {lastSold.get(pick.id) ? `Narx — oxirgi sotilgandagi (chek №${lastSold.get(pick.id)!.sale.number}). ` : ''}
            Summadan ayiriladi: <b>−{formatSum(n * pick.packSize * pr)} so'm</b> ({n * pick.packSize} juft). Sotuv saqlanganda {n} pachka omborga qaytadi.
          </p>
          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>Bekor</button>
            <button
              className="btn primary grow"
              disabled={!ok}
              onClick={() => { onAdd({ productId: pick.id, pairs: -n * pick.packSize, price: pr }); onClose() }}
            >
              Savatga qo'shish (qaytgan)
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
