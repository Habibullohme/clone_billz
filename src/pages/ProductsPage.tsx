import { useEffect, useMemo, useRef, useState } from 'react'
import { NewBatchSheet } from './NewBatch'
import type { ImportBatch, Product, ProductInput, Sale } from '../types'
import {
  nameConflict,
  activeSales, deleteBatch, deleteProducts, getBatches, getProducts, getSales, importProducts,
  searchProducts, updateProduct,
} from '../data/store'
import { formatSum, parseSum } from '../lib/money'
import { hueStyle } from '../lib/colors'
import { downloadTemplate, parseRows, readExcel, type ParsedRow } from '../lib/excel'
import { BackClose, IconEdit, IconTrash, Modal, MoneyInput, Segmented } from '../components/ui'

type View = 'brands' | 'imports'
type Filter = 'all' | 'instock' | 'sold'

/** Har bir qator — bitta pachka. Qoldig'i bo'lsa — omborda. */
const inStock = (p: Product) => p.stock > 0

/** Ombordagi pachkalar soni va ularning sotuv/kelish narxidagi qiymati. */
function totals(items: Product[]) {
  return items.reduce(
    (t, p) => {
      if (!inStock(p)) return t
      t.packs += 1
      t.sale += p.stock * p.salePrice
      t.cost += p.stock * p.costPrice
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

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()
const dayTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/**
 * Tugma ikki-uch marta bosilsa ham ish faqat bir marta bajariladi (kirim ikki marta yozilmasin).
 * Ish tugaguncha tugma "Saqlanmoqda…" bo'lib o'chib turadi.
 */
function useOnce(): [boolean, (job: () => Promise<unknown>) => Promise<void>] {
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const run = async (job: () => Promise<unknown>) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    try {
      await job()
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return [busy, run]
}

export function ProductsPage({ onPrintLabels }: { onPrintLabels: (batchId: string) => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [view, setView] = useState<View>('brands')
  const [brand, setBrand] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<{ text: string; run: () => Promise<void> } | null>(null)
  const [toast, setToast] = useState('')
  const [editing, setEditing] = useState<Product | null>(null)
  const [adding, setAdding] = useState(false)
  const [preview, setPreview] = useState<{ items: ParsedRow[]; missing: string[]; file: string } | null>(null)
  const [imported, setImported] = useState<ImportBatch | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const reload = () => {
    getProducts().then(setProducts)
    getSales().then((l) => setSales(activeSales(l)))
    getBatches().then(setBatches)
  }
  useEffect(reload, [])

  // Har bir tovar qachon sotilgan (oxirgi sotuv).
  const soldAt = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of [...sales].reverse()) for (const l of s.lines) m.set(l.productId, s.createdAt)
    return m
  }, [sales])
  // Bugun brend bo'yicha nechta pachka sotilgan.
  const soldToday = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sales.filter((x) => isToday(x.createdAt)))
      for (const l of s.lines) m.set(l.brand, (m.get(l.brand) ?? 0) + l.pairs / l.packSize)
    return m
  }, [sales])

  const flash = (text: string) => {
    setToast(text)
    setTimeout(() => setToast(''), 2500)
  }

  const onFile = async (file: File) => {
    try {
      const rows = await readExcel(file)
      setPreview({ ...parseRows(rows), file: file.name })
    } catch {
      setPreview({ items: [], missing: ['Faylni o\'qib bo\'lmadi. .xlsx formatida saqlang.'], file: file.name })
    }
  }

  const [importing, runImport] = useOnce()
  const confirmImport = () =>
    runImport(async () => {
      if (!preview) return
      const ok = preview.items.filter((r) => r.errors.length === 0).map((r) => r.input)
      const batch = await importProducts(ok, 'excel')
      setPreview(null)
      setImported(batch)
      reload()
    })

  const remove = (ids: string[], what: string) =>
    setConfirm({
      text: `${what} o'chirilsinmi?`,
      run: async () => {
        const r = await deleteProducts(ids)
        setSelected(new Set())
        flash(r.kept ? `${r.removed} ta o'chirildi, ${r.kept} ta sotilgani uchun qoldi` : `${r.removed} ta o'chirildi`)
        reload()
      },
    })

  const inBrand = brand !== null ? products.filter((p) => p.brand === brand) : products
  const scope = q ? searchProducts(inBrand, q, 5000) : brand !== null ? [...inBrand].reverse() : []
  const list = scope.filter((p) => (filter === 'instock' ? inStock(p) : filter === 'sold' ? !inStock(p) : true))
  const showList = brand !== null || q.trim() !== ''
  const summary = totals(inBrand)
  const brands = groupByBrand(products)
  const allChecked = list.length > 0 && list.every((p) => selected.has(p.id))
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-title">
          {brand !== null && <BackClose onClose={() => { setBrand(null); setQ(''); setFilter('all'); setSelected(new Set()) }} />}
          {brand !== null && (
            <button className="icon back" onClick={() => { setBrand(null); setQ(''); setFilter('all'); setSelected(new Set()) }} aria-label="Barcha brendlar">←</button>
          )}
          {brand !== null && <span className="avatar" style={hueStyle(brand)}>{brand.slice(0, 1).toUpperCase()}</span>}
          <h1>{brand ?? 'Tovarlar'}</h1>
          {brand === null && (
            <Segmented<View> value={view} onChange={setView} options={[['brands', 'Brendlar'], ['imports', `Kirimlar (${batches.length})`]]} />
          )}
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => downloadTemplate()}>Shablon</button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>Excel'dan import</button>
          <button className="btn primary" onClick={() => setAdding(true)}>+ Yangi kirim</button>
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

      {view === 'imports' && brand === null ? (
        <ImportsList
          batches={batches}
          products={products}
          soldAt={soldAt}
          onLabels={onPrintLabels}
          onDelete={(b) =>
            setConfirm({
              text: `Kirim №${b.number} (${b.productIds.length} pachka) o'chirilsinmi? Sotilgan tovarlari qoladi.`,
              run: async () => {
                const r = await deleteBatch(b.id)
                flash(r.kept ? `${r.removed} ta o'chirildi, ${r.kept} ta sotilgani uchun qoldi` : `Kirim №${b.number} o'chirildi`)
                reload()
              },
            })
          }
        />
      ) : (
        <>
          <div className="kpis four">
            <div className="kpi tone-blue"><span>Omborda</span><b>{summary.packs} pachka</b></div>
            <div className="kpi tone-violet"><span>Sotuv narxida</span><b>{formatSum(summary.sale)}</b></div>
            <div className="kpi tone-amber"><span>Kelish narxida</span><b>{formatSum(summary.cost)}</b></div>
            <div className="kpi tone-green"><span>Kutilayotgan foyda</span><b>{formatSum(summary.sale - summary.cost)}</b></div>
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
                options={[['all', 'Hammasi'], ['instock', `Omborda (${scope.filter(inStock).length})`], ['sold', `Sotilgan (${scope.filter((p) => !inStock(p)).length})`]]}
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
                  const today = Math.round(soldToday.get(name) ?? 0)
                  return (
                    <button key={name} className="brand-card" style={hueStyle(name)} onClick={() => setBrand(name)}>
                      <div className="bc-head">
                        <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
                        <b className="bc-name">{name}</b>
                      </div>
                      <div className="bc-packs"><b>{t.packs}</b> <span className="muted">pachka</span></div>
                      <div className="bc-rows">
                        <div><span className="muted">Sotuv narxida</span><b>{formatSum(t.sale)}</b></div>
                        <div><span className="muted">Kelish narxida</span><span>{formatSum(t.cost)}</span></div>
                      </div>
                      {today > 0 && <span className="bc-sold">Bugun {today} ta sotildi</span>}
                    </button>
                  )
                })}
              </div>
            )
          ) : (
            <>
              {selected.size > 0 && (
                <div className="bulk">
                  <b>{selected.size} ta tanlandi</b>
                  <button className="link small" onClick={() => setSelected(new Set())}>bekor</button>
                  <span className="grow" />
                  <button className="btn danger small" onClick={() => remove([...selected], `${selected.size} ta tovar`)}>O'chirish</button>
                </div>
              )}
              <div className="table-wrap">
                <table className="table cards">
                  <thead>
                    <tr>
                      <th className="check">
                        <input
                          type="checkbox"
                          aria-label="Hammasini tanlash"
                          checked={allChecked}
                          onChange={() => setSelected(allChecked ? new Set() : new Set(list.map((p) => p.id)))}
                        />
                      </th>
                      <th>Model</th><th>Holat</th><th className="num">Sotuv narxi</th><th className="num">Kelish narxi</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => {
                      const sold = soldAt.get(p.id)
                      return (
                        <tr key={p.id} className={`${selected.has(p.id) ? 'picked' : ''}${inStock(p) ? '' : ' is-sold'}`}>
                          <td className="check">
                            <input type="checkbox" aria-label={`${p.name} tanlash`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                          </td>
                          <td>
                            <b>{p.name}</b>
                            <div className="muted small">{[brand === null && p.brand, p.size, p.color, `${p.packSize} juft`].filter(Boolean).join(' · ')}</div>
                          </td>
                          <td>
                            {inStock(p) ? (
                              p.stock < p.packSize ? <span className="tag warn">{p.stock} juft qoldi</span> : <span className="tag ok-tag">omborda</span>
                            ) : (
                              <span className="tag">sotilgan{sold ? ` · ${isToday(sold) ? 'bugun' : dayTime(sold).slice(0, 5)}` : ''}</span>
                            )}
                          </td>
                          <td className="num">{formatSum(p.salePrice)}</td>
                          <td className="num muted">{formatSum(p.costPrice)}</td>
                          <td>
                            <div className="row-actions">
                              <button className="icon" aria-label="Tahrirlash" title="Tahrirlash" onClick={() => setEditing(p)}><IconEdit /></button>
                              <button className="icon danger" aria-label="O'chirish" title="O'chirish" onClick={() => remove([p.id], p.name)}><IconTrash /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {list.length === 0 && <p className="muted pad">Hech narsa topilmadi.</p>}
              </div>
            </>
          )}
        </>
      )}

      {confirm && (
        <Modal title="Tasdiqlang" onClose={() => setConfirm(null)}>
          <p>{confirm.text}</p>
          <div className="modal-actions">
            <span className="grow" />
            <button className="btn ghost" onClick={() => setConfirm(null)}>Yo'q</button>
            <button
              className="btn danger"
              autoFocus
              onClick={async () => {
                const c = confirm
                setConfirm(null)
                await c.run()
              }}
            >
              Ha, o'chirish
            </button>
          </div>
        </Modal>
      )}
      {toast && <div className="toast">{toast}</div>}

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
            <button className="btn primary" disabled={importing || !preview.items.some((r) => !r.errors.length)} onClick={confirmImport}>
              {importing ? "Qo'shilmoqda…" : "Qo'shish"}
            </button>
          </div>
        </Modal>
      )}

      {imported && (
        <Modal title="Tovarlar qo'shildi" onClose={() => setImported(null)}>
          <p>
            Kirim №{imported.number}: <b>{imported.productIds.length}</b> pachka qo'shildi, har biriga shtrix-kod yaratildi.
          </p>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setImported(null)}>Keyinroq</button>
            <button className="btn primary" onClick={() => onPrintLabels(imported.id)}>Etiketkalarni chiqarish</button>
          </div>
        </Modal>
      )}

      {adding && (
        <NewBatchSheet
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
            const r = await deleteProducts([editing.id])
            setEditing(null)
            flash(r.removed ? 'O\'chirildi' : 'Sotilgan tovarni o\'chirib bo\'lmaydi')
            reload()
          }}
          conflict={(brand, name) => nameConflict(products, brand, name, editing.id)}
          onSave={async (inp, stock) => {
            const err = await updateProduct({ ...editing, ...inp, stock: stock ?? editing.stock })
            if (err) return err
            setEditing(null)
            reload()
            return null
          }}
        />
      )}
    </div>
  )
}

function ProductForm({
  title, initial, product, conflict, onClose, onSave, onDelete,
}: {
  title: string
  initial: ProductInput
  product?: Product
  conflict: (brand: string, name: string) => string | null
  onClose: () => void
  onSave: (inp: ProductInput, stock?: number) => Promise<string | null>
  onDelete?: () => void
}) {
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, runSave] = useOnce()
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
  const dup = f.name.trim() !== '' ? conflict(f.brand, f.name) : null
  const valid = f.brand.trim() && f.name.trim() && !dup && f.packSize >= 1 && cost > 0 && sale > 0

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
        <label className="field">
          <span>Model nomi</span>
          <input id="pf-name" className={`input${dup ? ' invalid' : ''}`} value={f.name} onChange={(e) => set('name', e.target.value)} />
          {dup && <span className="error small">{dup}</span>}
        </label>
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
          <MoneyInput id="pf-cost" value={f.costPrice} onChange={(v) => set('costPrice', v)} />
        </label>
        <label className="field">
          <span>Sotuv narxi (1 juft)</span>
          <MoneyInput id="pf-sale" value={f.salePrice} onChange={(v) => set('salePrice', v)} />
        </label>
      </div>
      {cost > 0 && sale > 0 && (
        <div className="muted small">
          Bir pachkadan foyda: <b className={sale < cost ? 'error' : 'ok'}>{formatSum((sale - cost) * f.packSize)} so'm</b>
        </div>
      )}
      {product && (
        <div className="muted small">Shtrix-kod <span className="mono">{product.barcode}</span> — etiketkada chiqadi, kassada skanerlanadi</div>
      )}
      <div className="modal-actions">
        {onDelete &&
          (confirmDelete ? (
            <button className="btn danger" onClick={onDelete}>Ha, o'chirish</button>
          ) : (
            <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>O'chirish</button>
          ))}
        <span className="grow" />
        {saveError && <span className="error small">{saveError}</span>}
        <button className="btn ghost" onClick={onClose}>Bekor</button>
        <button
          className="btn primary"
          disabled={!valid || saving}
          onClick={() => runSave(async () =>
            setSaveError(
              await onSave(
                { brand: f.brand, name: f.name, size: f.size, color: f.color, packSize: f.packSize, packs: f.packs, costPrice: cost, salePrice: sale },
                product ? Number(f.stock) : undefined,
              ),
            ),
          )}
        >
          {saving ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </div>
    </Modal>
  )
}

function ImportsList({
  batches, products, soldAt, onLabels, onDelete,
}: {
  batches: ImportBatch[]
  products: Product[]
  soldAt: Map<string, string>
  onLabels: (id: string) => void
  onDelete: (b: ImportBatch) => void
}) {
  const byId = new Map(products.map((p) => [p.id, p]))
  if (!batches.length) return <div className="empty"><b>Hali kirim yo'q</b><span className="muted">Excel'dan import qiling yoki "+ Tovar" bilan qo'shing.</span></div>
  return (
    <div className="imports">
      {batches.map((b) => {
        const items = b.productIds.map((id) => byId.get(id)).filter((p): p is Product => !!p)
        const sold = items.filter((p) => soldAt.has(p.id)).length
        const brands = [...new Set(items.map((p) => p.brand))]
        const pct = items.length ? Math.round((sold / items.length) * 100) : 0
        return (
          <div key={b.id} className="import-row">
            <div className="ir-main">
              <b>Kirim №{b.number}</b>
              <span className="muted small">
                {dayTime(b.createdAt)} · {b.source === 'excel' ? 'Excel' : b.source === 'bot' ? 'Telegram bot' : 'qo\'lda'} · {brands.join(', ')}
              </span>
            </div>
            <div className="ir-num"><b>{items.length}</b><span className="muted small">pachka</span></div>
            <div className="ir-num"><b>{formatSum(items.reduce((a, p) => a + p.packSize * p.salePrice, 0))}</b><span className="muted small">sotuv narxida</span></div>
            <div className="ir-progress">
              <div className="bb-track"><div className="bb-fill" style={{ width: `${pct}%` }} /></div>
              <span className="muted small">{sold} ta sotildi · {pct}%</span>
            </div>
            <span className="tag ok-tag">qo'shilgan</span>
            <div className="row-actions">
              <button className="btn ghost small" onClick={() => onLabels(b.id)}>Etiketka</button>
              <button className="icon danger" aria-label="Kirimni o'chirish" title="O'chirish" onClick={() => onDelete(b)}><IconTrash /></button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
