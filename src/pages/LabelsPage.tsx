import { useEffect, useMemo, useState } from 'react'
import type { ImportBatch, Product } from '../types'
import { getBatches, getProducts, getSettings, searchProducts, type Settings } from '../data/store'
import { formatSum } from '../lib/money'
import { Barcode } from '../components/Barcode'

const sizes = { '58x40': [58, 40], '40x30': [40, 30], '30x20': [30, 20] } as const

export function LabelsPage({ batchId }: { batchId: string | null }) {
  const [products, setProducts] = useState<Product[]>([])
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<string | null>(batchId)
  const [q, setQ] = useState('')

  useEffect(() => {
    getProducts().then(setProducts)
    getSettings().then(setSettings)
    getBatches().then((b) => {
      setBatches(b)
      const pick = b.find((x) => x.id === batchId) ?? b[0]
      if (pick) choose(pick)
    })
  }, [batchId])

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const choose = (b: ImportBatch) => {
    setSelected(b.id)
    setQty({ ...b.packs })
  }

  const hits = searchProducts(products, q, 6)
  const items = Object.entries(qty).filter(([id, n]) => n > 0 && byId.has(id))
  const totalLabels = items.reduce((s, [, n]) => s + n, 0)

  if (!settings) return null
  const [w, h] = sizes[settings.labelSize]

  return (
    <div className="page labels-page">
      <div className="page-head">
        <div>
          <h1>Etiketkalar</h1>
          <div className="muted small">Har pachkaga bitta etiketka · {w}×{h} mm (sozlamalarda o'zgartiriladi)</div>
        </div>
        <button className="btn primary" disabled={!totalLabels} onClick={() => window.print()}>
          {totalLabels} ta chiqarish
        </button>
      </div>

      <div className="labels-layout">
        <div className="labels-side">
          <div className="label">Kirimlar</div>
          {batches.length === 0 && <p className="muted small">Hali kirim yo'q.</p>}
          {batches.slice(0, 12).map((b) => (
            <button key={b.id} className={`batch${selected === b.id ? ' on' : ''}`} onClick={() => choose(b)}>
              <b>Kirim №{b.number}</b>
              <span className="muted small">
                {new Date(b.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} ·{' '}
                {b.productIds.length} model · {Object.values(b.packs).reduce((a, c) => a + c, 0)} pachka
              </span>
            </button>
          ))}
          <div className="label">Qo'lda qo'shish</div>
          <div className="search small-search">
            <input className="input" placeholder="Tovar nomi" value={q} onChange={(e) => setQ(e.target.value)} />
            {hits.length > 0 && (
              <ul className="hits">
                {hits.map((p) => (
                  <li
                    key={p.id}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setSelected(null)
                      setQty((x) => ({ ...x, [p.id]: (x[p.id] ?? 0) + 1 }))
                      setQ('')
                    }}
                  >
                    <span>{p.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="labels-main">
          {items.length === 0 ? (
            <div className="empty"><b>Etiketka tanlanmagan</b><span className="muted">Chapdan kirimni tanlang yoki tovar qo'shing.</span></div>
          ) : (
            <div className="label-rows">
              {items.map(([id, n]) => {
                const p = byId.get(id)!
                return (
                  <div key={id} className="label-row">
                    <LabelPreview p={p} settings={settings} />
                    <div className="grow">
                      <b>{p.name}</b>
                      <div className="muted small">{[p.brand, p.size, p.color].filter(Boolean).join(' · ')}</div>
                    </div>
                    <label className="muted small">
                      <input
                        className="pairs"
                        type="number"
                        min={0}
                        value={n}
                        onChange={(e) => setQty((x) => ({ ...x, [id]: Math.max(0, Number(e.target.value)) }))}
                      />{' '}
                      dona
                    </label>
                    <button className="icon danger" aria-label="Olib tashlash" onClick={() => setQty((x) => ({ ...x, [id]: 0 }))}>✕</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`@media print { @page { size: ${w}mm ${h}mm; margin: 0; } .label-sheet .lbl { width: ${w}mm; height: ${h}mm; } }`}</style>
      <div className="label-sheet print-area">
        {items.flatMap(([id, n]) => Array.from({ length: n }, (_, i) => <LabelPreview key={`${id}-${i}`} p={byId.get(id)!} settings={settings} />))}
      </div>
    </div>
  )
}

function LabelPreview({ p, settings }: { p: Product; settings: Settings }) {
  const small = settings.labelSize !== '58x40'
  return (
    <div className={`lbl lbl-${settings.labelSize}`}>
      <div className="lbl-name">{p.name}</div>
      <div className="lbl-meta">
        {settings.labelShowSize && p.size && <span>{p.size}</span>}
        <span>{p.packSize} juft</span>
        {settings.labelShowPrice && <b>{formatSum(p.salePrice)}</b>}
      </div>
      <Barcode code={p.barcode} height={small ? 22 : 34} fontSize={small ? 9 : 11} />
    </div>
  )
}
