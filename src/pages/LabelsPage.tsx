import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { createPortal } from 'react-dom'
import type { ImportBatch, Product } from '../types'
import { getBatches, getProducts, getSettings, saveSettings, searchProducts, uid, type Settings } from '../data/store'
import { autoLayout, fieldNames, placedFields, textHeight, type LabelField, type LabelFieldKey, type LabelTemplate, type PlacedField } from '../lib/labels'
import { formatSum } from '../lib/money'
import { hueStyle } from '../lib/colors'
import { LabelView } from '../components/LabelView'
import { Modal, Segmented, Select, Toggle } from '../components/ui'

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
  const [viewing, setViewing] = useState<number | null>(null)

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
    // Chop qilinadigan varaqlar chizilib bo'lgach. Chop paytida sahifada faqat etiketkalar qoladi.
    setTimeout(() => {
      document.body.classList.add('print-labels')
      window.addEventListener('afterprint', () => document.body.classList.remove('print-labels'), { once: true })
      window.print()
    }, 50)
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
          <Select<string>
            id="tpl-select"
            value={template.id}
            onChange={(v) => saveTemplates(settings.labelTemplates, v)}
            options={settings.labelTemplates.map((t) => ({ value: t.id, label: t.name, hint: `${t.width}×${t.height} mm` }))}
          />
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
                    <button className="lbl-thumb" onClick={() => setViewing(items.indexOf(id))} aria-label="Etiketkani kattalashtirish">
                      <LabelView t={template} p={p} />
                    </button>
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

      {createPortal(
        <div className="label-sheet">
          <style>{'@media print { @page { margin: 0; } }'}</style>
          {(printOnlyOne ? items.slice(0, 1).map((id) => [id, 1] as const) : items.map((id) => [id, qty[id]] as const)).flatMap(([id, n]) =>
            Array.from({ length: n }, (_, i) => <FitLabel key={`${id}-${i}`} t={template} p={byId.get(id)!} />),
          )}
        </div>,
        document.body,
      )}

      {viewing !== null && items[viewing] && (
        <LabelLightbox
          t={template}
          items={items.map((id) => byId.get(id)!)}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      )}

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
  const fields = placedFields(t)
  const setField = (i: number, patch: Partial<LabelField>) =>
    set({ fields: fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  const unused = allFields.filter((k) => !t.fields.some((f) => f.key === k))
  const field = fields[sel]
  const demo = sample ?? sampleProduct

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
          <Select<LabelTemplate['format']>
            id="tpl-format"
            value={t.format}
            onChange={(v) => set({ format: v })}
            options={[{ value: 'CODE128', label: 'CODE128', hint: 'har qanday kod' }, { value: 'EAN13', label: 'EAN-13', hint: '13 raqam' }]}
          />
        </label>
      </div>

      <div className="tpl-body">
        <div className="tpl-fields">
          {fields.map((f, i) => (
            <div key={f.key} className={`tpl-field${sel === i ? ' on' : ''}`} onClick={() => setSel(i)}>
              <span className="grow">{fieldNames[f.key]}</span>
              <button
                className="icon danger"
                aria-label="Olib tashlash"
                onClick={(e) => {
                  e.stopPropagation()
                  set({ fields: fields.filter((_, j) => j !== i) })
                  setSel(0)
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {unused.length > 0 && (
            <Select<string>
              id="tpl-add"
              value=""
              placeholder="+ Maydon qo'shish"
              onChange={(v) => {
                const key = v as LabelFieldKey
                const h = key === 'barcode' ? Math.min(12, t.height / 2) : textHeight(9)
                set({ fields: [...fields, { key, size: key === 'barcode' ? h : 9, bold: false, align: 'center', x: 1.5, y: Math.max(0, (t.height - h) / 2), w: t.width - 3, h }] })
                setSel(fields.length)
              }}
              options={unused.map((k) => ({ value: k, label: fieldNames[k] }))}
            />
          )}
          <p className="muted small">Maydonni sichqoncha bilan suring, burchagidagi nuqtadan tortib kattalashtiring. Strelka tugmalari — aniq surish.</p>
        </div>

        <div className="tpl-work">
          <div className="tpl-toolbar">
            {field && field.key !== 'barcode' && (
              <>
                <div className="tpl-fs">
                  <Select<string>
                    id="tpl-size"
                    value={String(field.size)}
                    onChange={(v) => setField(sel, { size: Number(v) })}
                    options={fontSizes.map((n) => ({ value: String(n), label: `${n} pt` }))}
                  />
                </div>
                <button className={`tbtn${field.bold ? ' on' : ''}`} aria-label="Qalin" title="Qalin" onClick={() => setField(sel, { bold: !field.bold })}><b>B</b></button>
                <Segmented<string>
                  value={field.align}
                  onChange={(v) => setField(sel, { align: v as LabelField['align'] })}
                  options={[['left', 'Chap'], ['center', 'O\'rta'], ['right', 'O\'ng']]}
                />
              </>
            )}
            {field?.key === 'barcode' && (
              <label className="tpl-check">
                <Toggle id="tpl-bctext" checked={t.barcodeText} onChange={(v) => set({ barcodeText: v })} />
                <span>Raqamlar</span>
              </label>
            )}
            {field && (
              <button className="tbtn" title="Eniga o'rtaga" onClick={() => setField(sel, { x: Math.round(((t.width - field.w) / 2) * 10) / 10 })}>↔ O'rtaga</button>
            )}
            <span className="grow" />
            <button className="btn ghost small" onClick={() => set({ fields: autoLayout({ ...t, fields: t.fields.map(({ x: _x, y: _y, w: _w, h: _h, ...f }) => f) }) })}>
              Asl joylashuv
            </button>
          </div>
          <LabelCanvas t={t} fields={fields} sample={demo} sel={sel} onSel={setSel} onChange={(f) => set({ fields: f })} />
          <span className="muted small">Haqiqiy o'lcham: {t.width}×{t.height} mm</span>
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
          <button key={b} className={`chip${brand === b ? ' on' : ''}`} style={hueStyle(b)} onClick={() => setBrand(b)}><i className="dot" />{b}</button>
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

/** Etiketkani katta ko'rish (Telegram'da rasm ochilgandek): ← → bilan almashtiriladi, Esc yopadi. */
function LabelLightbox({
  t, items, index, onIndex, onClose,
}: { t: LabelTemplate; items: Product[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [index, items.length])
  const p = items[index]
  return (
    <div className="lightbox" onMouseDown={onClose}>
      <button className="lb-close" aria-label="Yopish" onClick={onClose}>✕</button>
      {index > 0 && (
        <button className="lb-nav prev" aria-label="Oldingi" onMouseDown={(e) => { e.stopPropagation(); onIndex(index - 1) }}>‹</button>
      )}
      <div className="lb-body" onMouseDown={(e) => e.stopPropagation()}>
        <div className="lb-label"><LabelView t={t} p={p} /></div>
        <div className="lb-caption">
          <b>{p.name}</b>
          <span>{[p.brand, p.size, p.color, `${t.width}×${t.height} mm`].filter(Boolean).join(' · ')} · {index + 1} / {items.length}</span>
        </div>
      </div>
      {index < items.length - 1 && (
        <button className="lb-nav next" aria-label="Keyingi" onMouseDown={(e) => { e.stopPropagation(); onIndex(index + 1) }}>›</button>
      )}
    </div>
  )
}

const PX_PER_MM = 96 / 25.4

/**
 * Chop uchun: etiketka printerdagi qog'oz o'lchamiga cho'ziladi (Billz kabi).
 * Qog'oz o'lchami printer sozlamasidan olinadi; shablon nisbati saqlanadi.
 */
function FitLabel({ t, p }: { t: LabelTemplate; p: Product }) {
  const w = t.width * PX_PER_MM
  const h = t.height * PX_PER_MM
  return (
    <div className="lbl-page">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
        <foreignObject width={w} height={h}>
          <LabelView t={t} p={p} />
        </foreignObject>
      </svg>
    </div>
  )
}

const fontSizes = [5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32]

const sampleProduct: Product = {
  id: 'demo', brand: 'Brend', name: 'Model A1', size: '40-44', color: 'qora', barcode: '2100000000012',
  packSize: 5, costPrice: 0, salePrice: 120_000, stock: 5, createdAt: '', batchId: null,
}

/** Shablon chizish maydoni: maydonlarni surish va kattalashtirish (Billz kabi). */
function LabelCanvas({
  t, fields, sample, sel, onSel, onChange,
}: {
  t: LabelTemplate
  fields: PlacedField[]
  sample: Product
  sel: number
  onSel: (i: number) => void
  onChange: (f: PlacedField[]) => void
}) {
  // Ekranda 1 mm necha piksel bo'lsin.
  const k = Math.min(560 / t.width, 330 / t.height, 14, (window.innerWidth - 72) / t.width)
  const drag = useRef<{ i: number; mode: 'move' | 'resize'; sx: number; sy: number; f: PlacedField } | null>(null)
  const r = (n: number) => Math.round(n * 2) / 2
  const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi))

  const update = (i: number, box: Pick<PlacedField, 'x' | 'y' | 'w' | 'h'>) =>
    onChange(fields.map((f, j) => {
      if (j !== i) return f
      // Shtrix-kodning "size" i — balandligi.
      return { ...f, ...box, ...(f.key === 'barcode' && { size: box.h }) }
    }))

  const down = (e: React.PointerEvent, i: number, mode: 'move' | 'resize') => {
    e.preventDefault()
    e.stopPropagation()
    onSel(i)
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    drag.current = { i, mode, sx: e.clientX, sy: e.clientY, f: fields[i] }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.sx) / k
    const dy = (e.clientY - d.sy) / k
    const { x, y, w, h } = d.f
    if (d.mode === 'move') update(d.i, { x: clamp(r(x + dx), 0, t.width - w), y: clamp(r(y + dy), 0, t.height - h), w, h })
    else update(d.i, { x, y, w: clamp(r(w + dx), 3, t.width - x), h: clamp(r(h + dy), 1.5, t.height - y) })
  }
  const up = () => {
    drag.current = null
  }

  return (
    <div
      className="tpl-canvas"
      tabIndex={0}
      style={{ width: t.width * k, height: t.height * k }}
      onKeyDown={(e) => {
        const f = fields[sel]
        const step = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, -0.5], ArrowDown: [0, 0.5] }[e.key]
        if (!f || !step) return
        e.preventDefault()
        update(sel, { x: clamp(f.x + step[0], 0, t.width - f.w), y: clamp(f.y + step[1], 0, t.height - f.h), w: f.w, h: f.h })
      }}
    >
      <div className="tpl-zoom" style={{ zoom: k / (96 / 25.4) }}>
        <LabelView t={{ ...t, fields }} p={sample} />
      </div>
      {fields.map((f, i) => (
        <div
          key={f.key}
          className={`tpl-box${sel === i ? ' on' : ''}`}
          style={{ left: f.x * k, top: f.y * k, width: f.w * k, height: f.h * k }}
          onPointerDown={(e) => down(e, i, 'move')}
          onPointerMove={move}
          onPointerUp={up}
          title={fieldNames[f.key]}
        >
          {sel === i && <span className="tpl-handle" onPointerDown={(e) => down(e, i, 'resize')} onPointerMove={move} onPointerUp={up} />}
        </div>
      ))}
    </div>
  )
}
