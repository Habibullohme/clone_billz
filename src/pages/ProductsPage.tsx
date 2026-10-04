import { useEffect, useRef, useState } from 'react'
import type { ImportBatch, Product, ProductInput } from '../types'
import { addBrand, deleteProduct, getBrands, getProducts, getSettings, importProducts, searchProducts, updateProduct, type Settings } from '../data/store'
import { formatSum, parseSum } from '../lib/money'
import { packsLabel } from '../lib/cart'
import { downloadTemplate, parseRows, readExcel, type ParsedRow } from '../lib/excel'
import { Modal, MoneyInput, Segmented } from '../components/ui'

type Filter = 'all' | 'low' | 'out'

/** Pachkalar soni va qoldiqning sotuv/kelish narxidagi qiymati. */
function totals(items: Product[]) {
  return items.reduce(
    (t, p) => {
      const pairs = Math.max(0, p.stock)
      t.packs += Math.floor(pairs / p.packSize)
      t.sale += pairs * p.salePrice
      t.cost += pairs * p.costPrice
      return t
    },
    { packs: 0, sale: 0, cost: 0 },
  )
}

/** Brendlar: qoldig'i ko'pi (sotuv narxida) birinchi. */
function groupByBrand(products: Product[]): [string, Product[]][] {
  const m = new Map<string, Product[]>()
  for (const p of products) m.set(p.brand, [...(m.get(p.brand) ?? []), p])
  return [...m].sort((a, b) => totals(b[1]).sale - totals(a[1]).sale)
}


export function ProductsPage({ onPrintLabels }: { onPrintLabels: (batchId: string) => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState<string | null>(null)
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

  // Brend ichida yoki qidiruvda — tovarlar ro'yxati; aks holda — brendlar.
  const inBrand = brand !== null ? products.filter((p) => p.brand === brand) : products
  const scope = q ? searchProducts(inBrand, q, 5000) : brand !== null ? [...inBrand].reverse() : []
  const list = scope.filter((p) => (filter === 'low' ? low(p) : filter === 'out' ? out(p) : true))
  const showList = brand !== null || q.trim() !== ''
  const summary = totals(inBrand)
  const brands = groupByBrand(products)

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-title">
          {brand !== null && (
            <button className="icon back" onClick={() => { setBrand(null); setQ(''); setFilter('all') }} aria-label="Barcha brendlar">←</button>
          )}
          <h1>{brand ?? 'Tovarlar'}</h1>
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

      <div className="kpis four">
        <div className="kpi"><span>Pachka</span><b>{summary.packs}</b></div>
        <div className="kpi"><span>Sotuv narxida</span><b>{formatSum(summary.sale)}</b></div>
        <div className="kpi"><span>Kelish narxida</span><b>{formatSum(summary.cost)}</b></div>
        <div className="kpi accent"><span>Kutilayotgan foyda</span><b>{formatSum(summary.sale - summary.cost)}</b></div>
      </div>

      <div className="toolbar">
        <input
          className="input"
          placeholder={brand ? `${brand} ichidan qidirish` : 'Qidirish: model, brend, razmer, rang'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {showList && (
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[['all', 'Hammasi'], ['low', `Kam qolgan (${scope.filter(low).length})`], ['out', `Tugagan (${scope.filter(out).length})`]]}
          />
        )}
      </div>

      {!showList ? (
        brands.length === 0 ? (
          <div className="empty"><b>Hali tovar yo'q</b><span className="muted">Excel'dan import qiling yoki "+ Tovar" bilan qo'shing.</span></div>
        ) : (
          <div className="brand-grid">
            {brands.map(([name, items]) => {
              const t = totals(items)
              return (
                <button key={name} className="brand-card" onClick={() => setBrand(name)}>
                  <div className="bc-head">
                    <b>{name}</b>
                    <span className="muted small">{items.length} model</span>
                  </div>
                  <div className="bc-packs"><b>{t.packs}</b> <span className="muted">pachka</span></div>
                  <div className="bc-rows">
                    <div><span className="muted">Sotuv narxida</span><b>{formatSum(t.sale)}</b></div>
                    <div><span className="muted">Kelish narxida</span><span>{formatSum(t.cost)}</span></div>
                  </div>
                  {items.some(out) && <span className="bc-warn">{items.filter(out).length} ta tugagan</span>}
                </button>
              )
            })}
          </div>
        )
      ) : (
        <div className="table-wrap">
          <table className="table clickable">
            <thead>
              <tr><th>Model</th><th>Qoldiq</th><th className="num">Sotuv narxi</th><th className="num">Kelish narxi</th><th className="num">Jami (sotuv)</th></tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} onClick={() => setEditing(p)}>
                  <td>
                    <b>{p.name}</b>
                    <div className="muted small">{[brand === null && p.brand, p.size, p.color].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td>
                    <span className={`stock ${out(p) ? 'out' : low(p) ? 'low' : ''}`}>
                      {p.stock <= 0 ? 'tugagan' : packsLabel(p.stock, p.packSize)}
                    </span>
                  </td>
                  <td className="num">{formatSum(p.salePrice)}</td>
                  <td className="num muted">{formatSum(p.costPrice)}</td>
                  <td className="num"><b>{formatSum(Math.max(0, p.stock) * p.salePrice)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="muted pad">Hech narsa topilmadi.</p>}
        </div>
      )}

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
                  <thead><tr><th>Qator</th><th>Model</th><th>Pachkada</th><th className="num">Kelish</th><th className="num">Sotuv</th><th /></tr></thead>
                  <tbody>
                    {preview.items.map((r) => (
                      <tr key={r.row} className={r.errors.length ? 'bad-row' : ''}>
                        <td className="muted">{r.row}</td>
                        <td>
                          <b>{r.input.name || '—'}</b>
                          <div className="muted small">{[r.input.brand, r.input.size, r.input.color].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td>{r.input.packSize} juft</td>
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
        <NewProductForm
          initialBrand={brand}
          onClose={() => setAdding(false)}
          onSave={async (inputs) => {
            const batch = await importProducts(inputs, 'manual')
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
  title, initial, product, onClose, onSave, onDelete,
}: {
  title: string
  initial: ProductInput
  product?: Product
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
        <label className="field">
          <span>Qoldiq (juft)</span>
          <input id="pf-stock" className="input" type="number" value={f.stock} onChange={(e) => set('stock', e.target.value)} />
        </label>
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

const DRAFT_KEY = 'dk2.productDraft'

/** Oxirgi kiritilgan brend, razmer va pachka hajmi keyingi safar o'zi turadi. */
function loadDraft(): { brand: string; size: string; packSize: number } {
  try {
    return { brand: '', size: '', packSize: 5, ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') }
  } catch {
    return { brand: '', size: '', packSize: 5 }
  }
}

function NewProductForm({
  initialBrand, onClose, onSave,
}: { initialBrand: string | null; onClose: () => void; onSave: (inputs: ProductInput[]) => void }) {
  const draft = loadDraft()
  const [brand, setBrand] = useState(initialBrand ?? draft.brand)
  const [brands, setBrands] = useState<string[]>([])
  const [newBrand, setNewBrand] = useState(false)
  useEffect(() => {
    getBrands().then((list) => {
      setBrands(list)
      if (!list.length) setNewBrand(true)
      else if (!list.includes(brand)) setBrand(list[0])
    })
  }, [])
  const [name, setName] = useState('')
  const [size, setSize] = useState(draft.size)
  const [packSize, setPackSize] = useState(draft.packSize)
  const [cost, setCost] = useState('')
  const [sale, setSale] = useState('')
  const [colors, setColors] = useState<{ color: string; packs: number }[]>([{ color: '', packs: 1 }])

  const c = parseSum(cost)
  const sp = parseSum(sale)
  const rows = colors.filter((r) => r.packs > 0)
  const totalPacks = rows.reduce((a, r) => a + r.packs, 0)
  const valid = brand.trim() && name.trim() && packSize >= 1 && c > 0 && sp > 0 && totalPacks > 0

  const save = () => {
    if (!valid) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ brand: brand.trim(), size: size.trim(), packSize }))
    } catch {
      // Eslab qolinmasa ham saqlash ishlayveradi.
    }
    if (newBrand) addBrand(brand)
    onSave(rows.map((r) => ({ brand, name, size, color: r.color.trim(), packSize, packs: r.packs, costPrice: c, salePrice: sp })))
  }

  const setRow = (i: number, patch: Partial<{ color: string; packs: number }>) =>
    setColors((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <Modal title="Yangi tovar" onClose={onClose}>
      <div className="form-grid">
        <label className="field">
          <span>Brend</span>
          {newBrand ? (
            <input id="np-brand" className="input" value={brand} placeholder="Yangi brend nomi" onChange={(e) => setBrand(e.target.value)} />
          ) : (
            <select
              id="np-brand"
              className="input"
              value={brand}
              onChange={(e) => {
                if (e.target.value === '__new') {
                  setNewBrand(true)
                  setBrand('')
                } else setBrand(e.target.value)
              }}
            >
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
              <option value="__new">+ Yangi brend…</option>
            </select>
          )}
        </label>
        <label className="field">
          <span>Model nomi</span>
          <input id="np-name" className="input" autoFocus value={name} placeholder="Ezel 18" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Razmer</span>
          <input id="np-size" className="input" value={size} placeholder="39-43" onChange={(e) => setSize(e.target.value)} />
        </label>
        <label className="field">
          <span>Pachkada (juft)</span>
          <input id="np-pack" className="input" type="number" min={1} value={packSize} onChange={(e) => setPackSize(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Kelish narxi (1 juft)</span>
          <MoneyInput id="np-cost" value={cost} onChange={setCost} />
        </label>
        <label className="field">
          <span>Sotuv narxi (1 juft)</span>
          <MoneyInput id="np-sale" value={sale} onChange={setSale} />
        </label>
      </div>

      <div className="colors">
        <div className="colors-head">
          <span>Rang</span>
          <span>Pachka</span>
        </div>
        {colors.map((r, i) => (
          <div key={i} className="color-row">
            <input
              id={`np-color-${i}`}
              className="input"
              value={r.color}
              placeholder={i === 0 ? 'qora' : 'jigarrang'}
              onChange={(e) => setRow(i, { color: e.target.value })}
            />
            <input
              id={`np-packs-${i}`}
              className="input"
              type="number"
              min={0}
              value={r.packs}
              onChange={(e) => setRow(i, { packs: Math.max(0, Number(e.target.value)) })}
            />
            <button
              className="icon danger"
              aria-label="Rangni olib tashlash"
              disabled={colors.length === 1}
              onClick={() => setColors((list) => list.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="link small left" onClick={() => setColors((list) => [...list, { color: '', packs: 1 }])}>
          + yana rang
        </button>
      </div>

      {c > 0 && sp > 0 && (
        <div className="muted small">
          Jami <b>{totalPacks} pachka</b>
          {rows.length > 1 && ` (${rows.length} xil rang — har biri alohida tovar)`} · bir pachkadan foyda{' '}
          <b className={sp < c ? 'error' : 'ok'}>{formatSum((sp - c) * packSize)}</b>
        </div>
      )}

      <div className="modal-actions">
        <span className="grow" />
        <button className="btn ghost" onClick={onClose}>Bekor</button>
        <button className="btn primary" disabled={!valid} onClick={save}>Saqlash</button>
      </div>
    </Modal>
  )
}
