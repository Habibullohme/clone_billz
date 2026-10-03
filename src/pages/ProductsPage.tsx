import { useEffect, useRef, useState } from 'react'
import type { ImportBatch, Product, ProductInput } from '../types'
import { deleteProduct, getProducts, getSettings, importProducts, searchProducts, updateProduct, type Settings } from '../data/store'
import { formatSum, parseSum } from '../lib/money'
import { packsLabel } from '../lib/cart'
import { downloadTemplate, parseRows, readExcel, type ParsedRow } from '../lib/excel'
import { Modal, Segmented } from '../components/ui'

type Filter = 'all' | 'low' | 'out'

const emptyInput: ProductInput = { brand: '', name: '', size: '', color: '', packSize: 5, packs: 1, costPrice: 0, salePrice: 0 }

export function ProductsPage({ onPrintLabels }: { onPrintLabels: (batchId: string) => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<Product | null>(null)
  const [adding, setAdding] = useState(false)
  const [preview, setPreview] = useState<{ items: ParsedRow[]; missing: string[]; file: string } | null>(null)
  const [imported, setImported] = useState<ImportBatch | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const reload = () => getProducts().then(setProducts)
  useEffect(() => {
    reload()
    getSettings().then(setSettings)
  }, [])

  const low = (p: Product) => settings !== null && p.stock > 0 && p.stock < p.packSize * settings.lowStockPacks
  const out = (p: Product) => p.stock < p.packSize
  const base = q ? searchProducts(products, q, 5000) : [...products].reverse()
  const list = base.filter((p) => (filter === 'low' ? low(p) : filter === 'out' ? out(p) : true))
  const stockValue = products.reduce((s, p) => s + Math.max(0, p.stock) * p.costPrice, 0)

  const onFile = async (file: File) => {
    try {
      const rows = await readExcel(file)
      setPreview({ ...parseRows(rows), file: file.name })
    } catch {
      setPreview({ items: [], missing: ['Faylni o\'qib bo\'lmadi. .xlsx formatida saqlang.'], file: file.name })
    }
  }

  const confirmImport = async () => {
    if (!preview) return
    const ok = preview.items.filter((r) => r.errors.length === 0).map((r) => r.input)
    const batch = await importProducts(ok, 'excel')
    setPreview(null)
    setImported(batch)
    reload()
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Tovarlar</h1>
          <div className="muted small">{products.length} model · omborda {formatSum(stockValue)} so'mlik (kelish narxida)</div>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => downloadTemplate()}>Shablon</button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>Excel'dan import</button>
          <button className="btn primary" onClick={() => setAdding(true)}>+ Tovar</button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <div className="toolbar">
        <input className="input" placeholder="Qidirish: nom, brend, razmer, shtrix-kod" value={q} onChange={(e) => setQ(e.target.value)} />
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[['all', 'Hammasi'], ['low', `Kam qolgan (${products.filter(low).length})`], ['out', `Tugagan (${products.filter(out).length})`]]}
        />
      </div>

      <div className="table-wrap">
        <table className="table clickable">
          <thead>
            <tr><th>Model</th><th>Qoldiq</th><th className="num">Sotuv narxi</th><th className="num">Foyda / pachka</th><th>Shtrix-kod</th></tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} onClick={() => setEditing(p)}>
                <td>
                  <b>{p.name}</b>
                  <div className="muted small">{[p.brand, p.size, p.color].filter(Boolean).join(' · ')}</div>
                </td>
                <td>
                  <span className={`stock ${out(p) ? 'out' : low(p) ? 'low' : ''}`}>
                    {p.stock <= 0 ? 'tugagan' : packsLabel(p.stock, p.packSize)}
                  </span>
                </td>
                <td className="num">{formatSum(p.salePrice)}</td>
                <td className="num">{formatSum((p.salePrice - p.costPrice) * p.packSize)}</td>
                <td className="mono muted">{p.barcode}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <p className="muted pad">Hech narsa topilmadi.</p>}
      </div>

      {preview && (
        <Modal title="Excel'dan import" onClose={() => setPreview(null)} wide>
          <div className="muted small">{preview.file}</div>
          {preview.missing.length > 0 ? (
            <p className="error">
              Ustunlar topilmadi: {preview.missing.join(', ')}. Shablonni yuklab olib, shu ustunlar bilan to'ldiring.
            </p>
          ) : (
            <>
              <div className="import-sum">
                <span><b>{preview.items.filter((r) => !r.errors.length).length}</b> ta tovar tayyor</span>
                {preview.items.some((r) => r.errors.length) && (
                  <span className="error"><b>{preview.items.filter((r) => r.errors.length).length}</b> ta qatorda xato — ular qo'shilmaydi</span>
                )}
              </div>
              <div className="table-wrap preview">
                <table className="table">
                  <thead><tr><th>Qator</th><th>Model</th><th>Pachka</th><th className="num">Kelish</th><th className="num">Sotuv</th><th /></tr></thead>
                  <tbody>
                    {preview.items.map((r) => (
                      <tr key={r.row} className={r.errors.length ? 'bad-row' : ''}>
                        <td className="muted">{r.row}</td>
                        <td>
                          <b>{r.input.name || '—'}</b>
                          <div className="muted small">{[r.input.brand, r.input.size, r.input.color].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td>{r.input.packs} × {r.input.packSize} juft</td>
                        <td className="num">{formatSum(r.input.costPrice || 0)}</td>
                        <td className="num">{formatSum(r.input.salePrice || 0)}</td>
                        <td className="error small">{r.errors.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setPreview(null)}>Bekor</button>
            <button className="btn primary" disabled={!preview.items.some((r) => !r.errors.length)} onClick={confirmImport}>
              Qo'shish
            </button>
          </div>
        </Modal>
      )}

      {imported && (
        <Modal title="Tovarlar qo'shildi" onClose={() => setImported(null)}>
          <p>
            Kirim №{imported.number}: <b>{imported.productIds.length}</b> model,{' '}
            <b>{Object.values(imported.packs).reduce((a, b) => a + b, 0)}</b> pachka. Shtrix-kodlar yaratildi.
          </p>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setImported(null)}>Keyinroq</button>
            <button className="btn primary" onClick={() => onPrintLabels(imported.id)}>Etiketkalarni chiqarish</button>
          </div>
        </Modal>
      )}

      {adding && (
        <ProductForm
          title="Yangi tovar"
          initial={emptyInput}
          withPacks
          onClose={() => setAdding(false)}
          onSave={async (inp) => {
            const batch = await importProducts([inp], 'manual')
            setAdding(false)
            setImported(batch)
            reload()
          }}
        />
      )}

      {editing && (
        <ProductForm
          title={editing.name}
          initial={{ ...editing, packs: 0 }}
          product={editing}
          onClose={() => setEditing(null)}
          onDelete={async () => {
            await deleteProduct(editing.id)
            setEditing(null)
            reload()
          }}
          onSave={async (inp, stock) => {
            await updateProduct({ ...editing, ...inp, stock: stock ?? editing.stock })
            setEditing(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

function ProductForm({
  title, initial, product, withPacks, onClose, onSave, onDelete,
}: {
  title: string
  initial: ProductInput
  product?: Product
  withPacks?: boolean
  onClose: () => void
  onSave: (inp: ProductInput, stock?: number) => void
  onDelete?: () => void
}) {
  const [f, setF] = useState({
    ...initial,
    costPrice: initial.costPrice ? String(initial.costPrice) : '',
    salePrice: initial.salePrice ? String(initial.salePrice) : '',
    stock: product ? String(product.stock) : '',
  })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = (k: string, v: string | number) => setF((x) => ({ ...x, [k]: v }))
  const cost = parseSum(f.costPrice)
  const sale = parseSum(f.salePrice)
  const valid = f.brand.trim() && f.name.trim() && f.packSize >= 1 && cost > 0 && sale > 0

  const text = (k: 'brand' | 'name' | 'size' | 'color', label: string, ph = '') => (
    <label className="field">
      <span>{label}</span>
      <input id={`pf-${k}`} className="input" value={f[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
    </label>
  )

  return (
    <Modal title={title} onClose={onClose}>
      <div className="form-grid">
        {text('brand', 'Brend', 'Nike')}
        {text('name', 'Model nomi', 'Nike Air 270')}
        {text('size', 'Razmer', '40-44')}
        {text('color', 'Rang', 'qora')}
        <label className="field">
          <span>Pachkada (juft)</span>
          <input id="pf-pack" className="input" type="number" min={1} value={f.packSize} onChange={(e) => set('packSize', Number(e.target.value))} />
        </label>
        {withPacks ? (
          <label className="field">
            <span>Necha pachka keldi</span>
            <input id="pf-packs" className="input" type="number" min={0} value={f.packs} onChange={(e) => set('packs', Number(e.target.value))} />
          </label>
        ) : (
          <label className="field">
            <span>Qoldiq (juft)</span>
            <input id="pf-stock" className="input" type="number" value={f.stock} onChange={(e) => set('stock', e.target.value)} />
          </label>
        )}
        <label className="field">
          <span>Kelish narxi (1 juft)</span>
          <input id="pf-cost" className="input" inputMode="numeric" value={f.costPrice} onChange={(e) => set('costPrice', e.target.value)} />
        </label>
        <label className="field">
          <span>Sotuv narxi (1 juft)</span>
          <input id="pf-sale" className="input" inputMode="numeric" value={f.salePrice} onChange={(e) => set('salePrice', e.target.value)} />
        </label>
      </div>
      {cost > 0 && sale > 0 && (
        <div className="muted small">
          Bir pachkadan foyda: <b className={sale < cost ? 'error' : 'ok'}>{formatSum((sale - cost) * f.packSize)} so'm</b>
        </div>
      )}
      {product && (
        <div className="muted small">Artikul {product.article} · shtrix-kod <span className="mono">{product.barcode}</span></div>
      )}
      <div className="modal-actions">
        {onDelete &&
          (confirmDelete ? (
            <button className="btn danger" onClick={onDelete}>Ha, o'chirish</button>
          ) : (
            <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>O'chirish</button>
          ))}
        <span className="grow" />
        <button className="btn ghost" onClick={onClose}>Bekor</button>
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() =>
            onSave(
              { brand: f.brand, name: f.name, size: f.size, color: f.color, packSize: f.packSize, packs: f.packs, costPrice: cost, salePrice: sale },
              product ? Number(f.stock) : undefined,
            )
          }
        >
          Saqlash
        </button>
      </div>
    </Modal>
  )
}
