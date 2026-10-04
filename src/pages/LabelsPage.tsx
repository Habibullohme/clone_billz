import { useEffect, useMemo, useState } from 'react'
import type { ImportBatch, Product } from '../types'
import { getBatches, getProducts, getSettings, saveSettings, searchProducts, uid, type Settings } from '../data/store'
import { fieldNames, type LabelFieldKey, type LabelTemplate } from '../lib/labels'
import { formatSum } from '../lib/money'
import { LabelView } from '../components/LabelView'
import { Modal, Segmented, Toggle } from '../components/ui'

type CountMode = 'batch' | 'stock' | 'one'

export function LabelsPage({ batchId }: { batchId: string | null }) {
  const [products, setProducts] = useState<Product[]>([])
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [batch, setBatch] = useState<ImportBatch | null>(null)
  const [ids, setIds] = useState<string[]>([])
  const [qty, setQty] = useState<Record<string, number>>({})
  const [mode, setMode] = useState<CountMode>('batch')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<LabelTemplate | null>(null)
  const [printOnlyOne, setPrintOnlyOne] = useState(false)
  const [picking, setPicking] = useState(false)
  const [custom, setCustom] = useState(false)

  useEffect(() => {
    getProducts().then(setProducts)
    getSettings().then(setSettings)
    getBatches().then((b) => {
      setBatches(b)
      const pick = b.find((x) => x.id === batchId) ?? b[0]
      if (pick) chooseBatch(pick)
    })
  }, [batchId])

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const countFor = (id: string, m: CountMode, b: ImportBatch | null) => {
    const p = byId.get(id)
    if (m === 'one' || !p) return 1
    if (m === 'stock') return Math.max(0, Math.floor(p.stock / p.packSize))
    return b?.packs[id] ?? 1
  }

  const chooseBatch = (b: ImportBatch) => {
    setCustom(false)
    setBatch(b)
    setMode('batch')
    setIds(b.productIds)
    setQty({ ...b.packs })
  }

  const changeMode = (m: CountMode) => {
    setMode(m)
    setQty(Object.fromEntries(ids.map((id) => [id, countFor(id, m, batch)])))
  }

  const addProduct = (p: Product) => {
    if (!ids.includes(p.id)) setIds((x) => [...x, p.id])
    setQty((x) => ({ ...x, [p.id]: (x[p.id] ?? 0) + (mode === 'stock' ? countFor(p.id, 'stock', null) : 1) }))
    setQ('')
  }

  if (!settings) return null
  const template = settings.labelTemplates.find((t) => t.id === settings.labelTemplateId) ?? settings.labelTemplates[0]
  const items = ids.filter((id) => byId.has(id) && (qty[id] ?? 0) > 0)
  const total = items.reduce((s, id) => s + qty[id], 0)
  const hits = searchProducts(products, q, 6)

  const saveTemplates = (list: LabelTemplate[], activeId = settings.labelTemplateId) => {
    const next = { ...settings, labelTemplates: list, labelTemplateId: list.some((t) => t.id === activeId) ? activeId : list[0].id }
    setSettings(next)
    saveSettings(next)
  }

  const print = (one: boolean) => {
    setPrintOnlyOne(one)
    // Chop qilinadigan varaqlar chizilib bo'lgach.
    setTimeout(() => window.print(), 50)
  }

  return (
    <div className="page labels-page">
      <div className="page-head">
        <h1>Etiketkalar</h1>
        <div className="head-actions">
          <button className="btn ghost" disabled={!total} onClick={() => print(true)}>Sinov (1 ta)</button>
          <button className="btn primary" disabled={!total} onClick={() => print(false)}>{total} ta chop etish</button>
        </div>
      </div>

      <div className="tpl-bar">
        <label className="field">
          <span>Shablon</span>
          <select
            id="tpl-select"
            className="input"
            value={template.id}
            onChange={(e) => saveTemplates(settings.labelTemplates, e.target.value)}
          >
            {settings.labelTemplates.map((t) => (
              <option key={t.id} value={t.id}>{t.name} · {t.width}×{t.height} mm</option>
            ))}
          </select>
        </label>
        <button className="btn ghost" onClick={() => setEditing(template)}>Tahrirlash</button>
        <button
          className="btn ghost"
          onClick={() => setEditing({ ...template, id: uid(), name: `${template.name} (nusxa)`, fields: template.fields.map((f) => ({ ...f })) })}
        >
          + Yangi shablon
        </button>
        <div className="field">
          <span>Soni</span>
          <Segmented<CountMode>
            value={mode}
            onChange={changeMode}
            options={[['batch', 'Kirim bo\'yicha'], ['stock', 'Qoldiq bo\'yicha'], ['one', 'Har biriga 1']]}
          />
        </div>
      </div>

      <div className="labels-layout">
        <div className="labels-side">
          <button className={`batch custom${custom ? ' on' : ''}`} onClick={() => setPicking(true)}>
            <b>Qo'lda tanlash</b>
            <span className="muted small">{custom ? `${ids.length} ta tovar tanlangan · o'zgartirish` : 'Istalgan tovarlarni belgilab chiqarish'}</span>
          </button>
          <div className="label">Kirimlar</div>
          {batches.length === 0 && <p className="muted small">Hali kirim yo'q.</p>}
          {batches.slice(0, 12).map((b) => (
            <button key={b.id} className={`batch${batch?.id === b.id ? ' on' : ''}`} onClick={() => chooseBatch(b)}>
              <b>Kirim №{b.number}</b>
              <span className="muted small">
                {new Date(b.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} ·{' '}
                {b.productIds.length} ta tovar
              </span>
            </button>
          ))}
          <div className="label">Tovar qo'shish</div>
          <div className="search">
            <input className="input" placeholder="Nom yoki kod" value={q} onChange={(e) => setQ(e.target.value)} />
            {hits.length > 0 && (
              <ul className="hits">
                {hits.map((p) => (
                  <li key={p.id} onMouseDown={(e) => { e.preventDefault(); addProduct(p) }}>
                    <span>{p.name}</span>
                    <span className="muted small">{p.color}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="labels-main">
          {items.length === 0 ? (
            <div className="empty"><b>Etiketka tanlanmagan</b><span className="muted">Kirimni tanlang yoki tovar qo'shing.</span></div>
          ) : (
            <div className="label-rows">
              {items.map((id) => {
                const p = byId.get(id)!
                return (
                  <div key={id} className="label-row">
                    <div className="lbl-thumb"><LabelView t={template} p={p} /></div>
                    <div className="grow">
                      <b>{p.name}</b>
                      <div className="muted small">{[p.brand, p.size, p.color].filter(Boolean).join(' · ')}</div>
                    </div>
                    <label className="qty-input">
                      <input
                        className="pairs"
                        type="number"
                        min={0}
                        value={qty[id]}
                        onChange={(e) => setQty((x) => ({ ...x, [id]: Math.max(0, Number(e.target.value)) }))}
                      />
                      <span className="muted small">dona</span>
                    </label>
                    <button className="icon danger" aria-label="Olib tashlash" onClick={() => setQty((x) => ({ ...x, [id]: 0 }))}>✕</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`@media print { @page { size: ${template.width}mm ${template.height}mm; margin: 0; } }`}</style>
      <div className="label-sheet print-area">
        {(printOnlyOne ? items.slice(0, 1).map((id) => [id, 1] as const) : items.map((id) => [id, qty[id]] as const)).flatMap(([id, n]) =>
          Array.from({ length: n }, (_, i) => <LabelView key={`${id}-${i}`} t={template} p={byId.get(id)!} />),
        )}
      </div>

      {picking && (
        <ProductPicker
          products={products}
          initial={custom ? ids : []}
          onClose={() => setPicking(false)}
          onDone={(picked) => {
            setPicking(false)
            setCustom(true)
            setBatch(null)
            setIds(picked)
            setQty(Object.fromEntries(picked.map((id) => [id, 1])))
            setMode('one')
          }}
        />
      )}

      {editing && (
        <TemplateEditor
          initial={editing}
          sample={byId.get(items[0]) ?? products[0]}
          canDelete={settings.labelTemplates.length > 1 && settings.labelTemplates.some((t) => t.id === editing.id)}
          onClose={() => setEditing(null)}
          onDelete={() => {
            saveTemplates(settings.labelTemplates.filter((t) => t.id !== editing.id))
            setEditing(null)
          }}
          onSave={(t) => {
            const exists = settings.labelTemplates.some((x) => x.id === t.id)
            saveTemplates(exists ? settings.labelTemplates.map((x) => (x.id === t.id ? t : x)) : [...settings.labelTemplates, t], t.id)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

const allFields = Object.keys(fieldNames) as LabelFieldKey[]

function TemplateEditor({
  initial, sample, canDelete, onClose, onSave, onDelete,
}: {
  initial: LabelTemplate
  sample: Product | undefined
  canDelete: boolean
  onClose: () => void
  onSave: (t: LabelTemplate) => void
  onDelete: () => void
}) {
  const [t, setT] = useState<LabelTemplate>(initial)
  const [sel, setSel] = useState(0)
  const set = (patch: Partial<LabelTemplate>) => setT((x) => ({ ...x, ...patch }))
  const setField = (i: number, patch: Partial<LabelTemplate['fields'][number]>) =>
    set({ fields: t.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= t.fields.length) return
    const f = [...t.fields]
    ;[f[i], f[j]] = [f[j], f[i]]
    set({ fields: f })
    setSel(j)
  }
  const unused = allFields.filter((k) => !t.fields.some((f) => f.key === k))
  const field = t.fields[sel]

  return (
    <Modal title="Etiketka shabloni" onClose={onClose} wide>
      <div className="tpl-top">
        <label className="field grow">
          <span>Nomi</span>
          <input id="tpl-name" className="input" value={t.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="field">
          <span>Eni, mm</span>
          <input id="tpl-w" className="input" type="number" min={20} max={120} value={t.width} onChange={(e) => set({ width: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Bo'yi, mm</span>
          <input id="tpl-h" className="input" type="number" min={10} max={120} value={t.height} onChange={(e) => set({ height: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Shtrix-kod formati</span>
          <select id="tpl-format" className="input" value={t.format} onChange={(e) => set({ format: e.target.value as LabelTemplate['format'] })}>
            <option value="CODE128">CODE128</option>
            <option value="EAN13">EAN-13</option>
          </select>
        </label>
      </div>

      <div className="tpl-body">
        <div className="tpl-fields">
          {t.fields.map((f, i) => (
            <div key={i} className={`tpl-field${sel === i ? ' on' : ''}`} onClick={() => setSel(i)}>
              <span className="grow">{fieldNames[f.key]}</span>
              <button className="icon" aria-label="Yuqoriga" onClick={(e) => { e.stopPropagation(); move(i, -1) }}>↑</button>
              <button className="icon" aria-label="Pastga" onClick={(e) => { e.stopPropagation(); move(i, 1) }}>↓</button>
              <button
                className="icon danger"
                aria-label="Olib tashlash"
                onClick={(e) => {
                  e.stopPropagation()
                  set({ fields: t.fields.filter((_, j) => j !== i) })
                  setSel(0)
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {unused.length > 0 && (
            <select
              id="tpl-add"
              className="input"
              value=""
              onChange={(e) => {
                const key = e.target.value as LabelFieldKey
                set({ fields: [...t.fields, { key, size: key === 'barcode' ? 12 : 9, bold: false, align: 'center' }] })
                setSel(t.fields.length)
              }}
            >
              <option value="">+ Maydon qo'shish</option>
              {unused.map((k) => <option key={k} value={k}>{fieldNames[k]}</option>)}
            </select>
          )}

          {field && (
            <div className="tpl-props">
              <div className="label">{fieldNames[field.key]}</div>
              <label className="field">
                <span>{field.key === 'barcode' ? 'Balandligi, mm' : 'Shrift, pt'}</span>
                <input
                  id="tpl-size"
                  type="range"
                  min={field.key === 'barcode' ? 6 : 5}
                  max={field.key === 'barcode' ? 30 : 24}
                  value={field.size}
                  onChange={(e) => setField(sel, { size: Number(e.target.value) })}
                />
              </label>
              {field.key === 'barcode' ? (
                <div className="set-row">
                  <span>Raqamlarni ko'rsatish</span>
                  <Toggle id="tpl-bctext" checked={t.barcodeText} onChange={(v) => set({ barcodeText: v })} />
                </div>
              ) : (
                <div className="tpl-style">
                  <Segmented<string>
                    value={field.align}
                    onChange={(v) => setField(sel, { align: v as LabelTemplate['fields'][number]['align'] })}
                    options={[['left', 'Chap'], ['center', 'O\'rta'], ['right', 'O\'ng']]}
                  />
                  <button className={`chip${field.bold ? ' on' : ''}`} onClick={() => setField(sel, { bold: !field.bold })}><b>Qalin</b></button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="tpl-preview">
          {sample ? <LabelView t={t} p={sample} /> : <span className="muted">Namuna uchun tovar yo'q</span>}
          <span className="muted small">Haqiqiy o'lchamda: {t.width}×{t.height} mm</span>
        </div>
      </div>

      <div className="modal-actions">
        {canDelete && <button className="btn ghost danger-text" onClick={onDelete}>O'chirish</button>}
        <span className="grow" />
        <button className="btn ghost" onClick={onClose}>Bekor</button>
        <button className="btn primary" disabled={!t.name.trim() || !t.fields.length} onClick={() => onSave(t)}>Saqlash</button>
      </div>
    </Modal>
  )
}

function ProductPicker({
  products, initial, onClose, onDone,
}: { products: Product[]; initial: string[]; onClose: () => void; onDone: (ids: string[]) => void }) {
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set(initial))
  const brands = [...new Set(products.map((p) => p.brand))].sort()
  const inStock = products.filter((p) => p.stock > 0)
  const base = brand ? inStock.filter((p) => p.brand === brand) : inStock
  const list = q ? searchProducts(base, q, 2000) : base
  const all = list.length > 0 && list.every((p) => picked.has(p.id))
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <Modal title="Etiketka uchun tovar tanlash" onClose={onClose} wide>
      <input className="input" autoFocus placeholder="Qidirish: model, razmer, rang" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips-row">
        <button className={`chip${brand === null ? ' on' : ''}`} onClick={() => setBrand(null)}>Hammasi</button>
        {brands.map((b) => (
          <button key={b} className={`chip${brand === b ? ' on' : ''}`} onClick={() => setBrand(b)}>{b}</button>
        ))}
      </div>
      <div className="pick-list">
        <label className="pick-row head">
          <input type="checkbox" className="check" checked={all} onChange={() => setPicked((s) => {
            const n = new Set(s)
            list.forEach((p) => (all ? n.delete(p.id) : n.add(p.id)))
            return n
          })} />
          <span>Ro'yxatdagi hammasi ({list.length})</span>
        </label>
        {list.map((p) => (
          <label key={p.id} className={`pick-row${picked.has(p.id) ? ' on' : ''}`}>
            <input type="checkbox" className="check" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
            <span className="grow">
              <b>{p.name}</b>
              <span className="muted small"> · {[p.brand, p.size, p.color].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="num">{formatSum(p.salePrice)}</span>
          </label>
        ))}
        {list.length === 0 && <p className="muted pad">Hech narsa topilmadi.</p>}
      </div>
      <div className="modal-actions">
        <span className="muted small grow">{picked.size} ta tanlandi</span>
        <button className="btn ghost" onClick={onClose}>Bekor</button>
        <button className="btn primary" disabled={!picked.size} onClick={() => onDone([...picked])}>Qo'shish</button>
      </div>
    </Modal>
  )
}
