import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProductInput } from '../types'
import { cartToInputs, type CartItem } from '../lib/kirim'
import { addBrand, getBrands, previewCodes } from '../data/store'
import { formatSum, parseSum } from '../lib/money'
import { hueStyle } from '../lib/colors'
import { useBackClose } from '../lib/nav'
import { MoneyInput, Select } from '../components/ui'

interface FormState {
  brand: string
  name: string
  size: string
  packSize: number
  cost: string
  sale: string
  colors: { color: string; packs: number }[]
}

const CART_KEY = 'dk.kirimCart'
const emptyColors = () => [{ color: '', packs: 1 }]
const packsOf = (it: Pick<CartItem, 'colors'>) => it.colors.reduce((a, r) => a + r.packs, 0)

function loadCart(): { items: CartItem[]; form: FormState | null } {
  try {
    return { items: [], form: null, ...JSON.parse(localStorage.getItem(CART_KEY) ?? '{}') }
  } catch {
    return { items: [], form: null }
  }
}
function saveCart(items: CartItem[], form: FormState) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify({ items, form }))
  } catch {
    // Saqlanmasa — faqat shu oyna ochiq turganda turadi.
  }
}
export function clearCart() {
  try {
    localStorage.removeItem(CART_KEY)
  } catch {
    // ahamiyatsiz
  }
}

/**
 * Yangi kirim — "savatcha": har xil brend, model va narxdagi tovarlarni bir oynada yig'ib,
 * bir martada saqlash. Yarim yo'lda yopilsa ham savat shu qurilmada saqlanib turadi.
 */
export function NewBatchSheet({
  initialBrand, onClose, onSave,
}: { initialBrand: string | null; onClose: () => void; onSave: (inputs: ProductInput[]) => Promise<void> }) {
  useBackClose(onClose)
  const restored = useRef(loadCart())
  const lastForm = restored.current.form
  const [items, setItems] = useState<CartItem[]>(restored.current.items)
  const [form, setForm] = useState<FormState>(() => ({
    brand: initialBrand ?? lastForm?.brand ?? '', name: '', size: lastForm?.size ?? '', packSize: lastForm?.packSize ?? 5,
    cost: '', sale: '', colors: emptyColors(),
    ...(lastForm && (lastForm.name || lastForm.cost) ? lastForm : {}),
  }))
  const [brands, setBrands] = useState<string[]>([])
  const [newBrand, setNewBrand] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [step, setStep] = useState<'fill' | 'confirm'>('fill')
  const [codes, setCodes] = useState<Record<string, [string, string]>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getBrands().then((list) => {
      setBrands(list)
      if (!list.length) setNewBrand(true)
      else if (!form.brand || !list.includes(form.brand)) setForm((f) => ({ ...f, brand: list.includes(f.brand) ? f.brand : list[0] }))
    })
  }, [])
  useEffect(() => saveCart(items, form), [items, form])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setRow = (i: number, patch: Partial<{ color: string; packs: number }>) =>
    setForm((f) => ({ ...f, colors: f.colors.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))

  const c = parseSum(form.cost)
  const sp = parseSum(form.sale)
  const formPacks = packsOf(form)
  const touched = Boolean(form.name.trim() || form.cost || form.sale)
  const problems = [
    !form.brand.trim() && 'brend',
    !form.name.trim() && 'model nomi',
    !(form.packSize >= 1) && 'pachkadagi juft',
    !(c > 0) && 'kelish narxi',
    !(sp > 0) && 'sotuv narxi',
    !(formPacks > 0) && 'pachka soni',
  ].filter(Boolean) as string[]
  const formValid = problems.length === 0

  const buildItem = (): CartItem => ({
    id: editing ?? Math.random().toString(36).slice(2),
    brand: form.brand.trim(), name: form.name.trim().replace(/\s+/g, ' '), size: form.size.trim(), packSize: form.packSize,
    cost: c, sale: sp, colors: form.colors.filter((r) => r.packs > 0).map((r) => ({ color: r.color.trim(), packs: r.packs })),
  })

  /** Formadagini savatga qo'shadi (yangi savatni qaytaradi); brend, razmer va pachka hajmi keyingisi uchun qoladi. */
  const addToCart = (): CartItem[] | null => {
    if (!formValid) {
      setError(`To'ldiring: ${problems.join(', ')}`)
      return null
    }
    const item = buildItem()
    const next = editing ? items.map((x) => (x.id === editing ? item : x)) : [...items, item]
    setItems(next)
    setEditing(null)
    setForm((f) => ({ ...f, name: '', cost: '', sale: '', colors: emptyColors() }))
    setError('')
    setFlash(item.id)
    setTimeout(() => setFlash(null), 900)
    setTimeout(() => nameRef.current?.focus(), 30)
    return next
  }

  const edit = (it: CartItem) => {
    if (touched && editing !== it.id && !confirm("Formadagi to'ldirilgan ma'lumot o'chadi. Davom etilsinmi?")) return
    setEditing(it.id)
    setNewBrand(!brands.includes(it.brand))
    setForm({ brand: it.brand, name: it.name, size: it.size, packSize: it.packSize, cost: String(it.cost), sale: String(it.sale), colors: it.colors.map((r) => ({ ...r })) })
    setError('')
    setTimeout(() => nameRef.current?.focus(), 30)
  }
  /** Nusxa: o'sha brend/razmer/ranglar, yangi nom va narx uchun. */
  const copy = (it: CartItem) => {
    if (touched && !confirm("Formadagi to'ldirilgan ma'lumot o'chadi. Davom etilsinmi?")) return
    setEditing(null)
    setNewBrand(!brands.includes(it.brand))
    setForm({ brand: it.brand, name: '', size: it.size, packSize: it.packSize, cost: '', sale: '', colors: it.colors.map((r) => ({ ...r })) })
    setTimeout(() => nameRef.current?.focus(), 30)
  }
  const remove = (id: string) => {
    setItems((list) => list.filter((x) => x.id !== id))
    if (editing === id) setEditing(null)
  }

  const totals = useMemo(() => {
    const packs = items.reduce((a, it) => a + packsOf(it), 0)
    const pairs = items.reduce((a, it) => a + packsOf(it) * it.packSize, 0)
    const cost = items.reduce((a, it) => a + packsOf(it) * it.packSize * it.cost, 0)
    const sale = items.reduce((a, it) => a + packsOf(it) * it.packSize * it.sale, 0)
    return { packs, pairs, cost, sale }
  }, [items])

  /** Saqlash: formada to'ldirilgan model qolgan bo'lsa — avval savatga qo'shiladi. */
  const toConfirm = async () => {
    let list = items
    if (touched || editing) {
      if (!formValid) {
        setError(`Formadagi tovar to'liq emas (${problems.join(', ')}). To'ldiring yoki tozalang.`)
        return
      }
      list = addToCart()!
    }
    if (!list.length) {
      setError("Savat bo'sh — avval tovar qo'shing.")
      return
    }
    // Kodlar oldindan ko'rsatiladi: har brend uchun ketma-ket.
    const byBrand = new Map<string, number>()
    for (const it of list) byBrand.set(it.brand, (byBrand.get(it.brand) ?? 0) + packsOf(it))
    const pool = new Map<string, string[]>()
    for (const [b, n] of byBrand) pool.set(b, await previewCodes(b, Math.min(n, 2000)))
    const out: Record<string, [string, string]> = {}
    for (const it of list) {
      const taken = (pool.get(it.brand) ?? []).splice(0, packsOf(it))
      if (taken.length) out[it.id] = [taken[0], taken[taken.length - 1]]
    }
    setCodes(out)
    setStep('confirm')
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      for (const b of new Set(items.map((it) => it.brand))) if (!brands.some((x) => x.toLowerCase() === b.toLowerCase())) await addBrand(b)
      await onSave(cartToInputs(items))
      clearCart()
    } catch (e) {
      console.error(e)
      setError("Saqlanmadi — internetni tekshirib, qayta urinib ko'ring.")
      setSaving(false)
    }
  }

  const onFormKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || (e.target as HTMLElement).tagName === 'BUTTON') return
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) toConfirm()
    else addToCart()
  }

  const brandOptions = [
    ...brands.map((b) => ({ value: b, label: <><i className="dot" style={hueStyle(b)} />{b}</> })),
    { value: '__new', label: '+ Yangi brend…', action: true },
  ]

  return (
    <div className="modal-bg sheet-bg" onMouseDown={onClose}>
      <div className="sheet" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && (step === 'confirm' ? setStep('fill') : onClose())}>
        <header className="sheet-head">
          <div>
            <h2>{step === 'fill' ? 'Yangi kirim' : 'Tekshiring va tasdiqlang'}</h2>
            <span className="muted small">
              {step === 'fill'
                ? "Tovarni to'ldiring → \"Savatga qo'shish\". Har xil brend va narxdagilarni yig'ib, oxirida bir marta saqlang."
                : "Hammasi to'g'rimi? Tasdiqlasangiz — omborga tushadi va har pachkaga shtrix-kod beriladi."}
            </span>
          </div>
          <button className="icon" aria-label="Yopish" onClick={onClose}>✕</button>
        </header>

        {step === 'fill' ? (
          <div className="sheet-body">
            <section className="nb-form" onKeyDown={onFormKey}>
              <h3>{editing ? '✎ Tahrirlash' : "Tovar qo'shish"}</h3>
              <div className="form-grid">
                <label className="field">
                  <span>Brend</span>
                  {newBrand ? (
                    <input id="nb-brand" className="input" value={form.brand} placeholder="Yangi brend nomi" onChange={(e) => set('brand', e.target.value)} />
                  ) : (
                    <Select<string>
                      id="nb-brand"
                      value={form.brand}
                      onChange={(v) => {
                        if (v === '__new') {
                          setNewBrand(true)
                          set('brand', '')
                        } else set('brand', v)
                      }}
                      options={brandOptions}
                    />
                  )}
                </label>
                <label className="field">
                  <span>Model nomi</span>
                  <input id="nb-name" ref={nameRef} className="input" autoFocus value={form.name} placeholder="Ezel 18" onChange={(e) => set('name', e.target.value)} />
                </label>
                <label className="field">
                  <span>Razmer</span>
                  <input id="nb-size" className="input" value={form.size} placeholder="39-43" onChange={(e) => set('size', e.target.value)} />
                </label>
                <label className="field">
                  <span>Pachkada (juft)</span>
                  <input id="nb-pack" className="input" type="number" min={1} value={form.packSize} onChange={(e) => set('packSize', Number(e.target.value))} />
                </label>
                <label className="field">
                  <span>Kelish narxi (1 juft)</span>
                  <MoneyInput id="nb-cost" value={form.cost} onChange={(v) => set('cost', v)} />
                </label>
                <label className="field">
                  <span>Sotuv narxi (1 juft)</span>
                  <MoneyInput id="nb-sale" value={form.sale} onChange={(v) => set('sale', v)} />
                </label>
              </div>
              <div className="colors">
                <div className="colors-head"><span>Rang</span><span>Pachka</span></div>
                {form.colors.map((r, i) => (
                  <div key={i} className="color-row">
                    <input id={`nb-color-${i}`} className="input" value={r.color} placeholder={i === 0 ? 'qora' : 'jigarrang'} onChange={(e) => setRow(i, { color: e.target.value })} />
                    <input id={`nb-packs-${i}`} className="input" type="number" min={0} value={r.packs} onChange={(e) => setRow(i, { packs: Math.max(0, Number(e.target.value)) })} />
                    <button className="icon danger" aria-label="Rangni olib tashlash" disabled={form.colors.length === 1} onClick={() => set('colors', form.colors.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
                <button className="link small left" onClick={() => set('colors', [...form.colors, { color: '', packs: 1 }])}>+ yana rang</button>
              </div>
              {c > 0 && sp > 0 && (
                <div className="muted small">
                  {formPacks} pachka · bir pachkadan foyda <b className={sp < c ? 'error' : 'ok'}>{formatSum((sp - c) * form.packSize)}</b>
                </div>
              )}
              {error && <div className="error small">{error}</div>}
              <div className="nb-form-actions">
                {editing && <button className="btn ghost" onClick={() => { setEditing(null); setForm((f) => ({ ...f, name: '', cost: '', sale: '', colors: emptyColors() })) }}>Bekor</button>}
                <button className="btn primary grow" onClick={addToCart}>
                  {editing ? 'Savatda yangilash' : "➕ Savatga qo'shish"} <kbd>Enter</kbd>
                </button>
              </div>
            </section>

            <section className="nb-cart">
              <h3>🛒 Savat {items.length > 0 && <span className="muted">· {items.length} model</span>}</h3>
              {items.length === 0 ? (
                <div className="nb-empty muted">
                  Savat bo'sh.<br />Chapda tovarni to'ldirib, <b>Savatga qo'shish</b> ni bosing.
                </div>
              ) : (
                <div className="nb-items">
                  {items.map((it) => (
                    <div key={it.id} className={`nb-item${editing === it.id ? ' editing' : ''}${flash === it.id ? ' flash' : ''}`} style={hueStyle(it.brand)}>
                      <div className="nb-item-main">
                        <b><i className="dot" />{it.brand} · {it.name}</b>
                        <span className="muted small">
                          {[it.size, `${it.packSize} juftlik`].filter(Boolean).join(' · ')} · {it.colors.map((r) => `${r.color || 'rangsiz'} ×${r.packs}`).join(', ')}
                        </span>
                        <span className="small">
                          {formatSum(it.cost)} → <b>{formatSum(it.sale)}</b> · foyda {formatSum((it.sale - it.cost) * it.packSize)}/pachka
                        </span>
                      </div>
                      <div className="nb-item-side">
                        <b>{packsOf(it)}</b><span className="muted small">pachka</span>
                      </div>
                      <div className="nb-item-actions">
                        <button className="btn ghost small" title="Tahrirlash" onClick={() => edit(it)}>✎</button>
                        <button className="btn ghost small" title="Nusxa: shu brend va ranglar, yangi nom/narx" onClick={() => copy(it)}>⧉</button>
                        <button className="btn ghost small danger-text" title="Olib tashlash" onClick={() => remove(it.id)}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="nb-totals">
                <div><span>Pachka</span><b>{totals.packs}</b></div>
                <div><span>Juft</span><b>{totals.pairs}</b></div>
                <div><span>Kelish</span><b>{formatSum(totals.cost)}</b></div>
                <div><span>Sotuv</span><b>{formatSum(totals.sale)}</b></div>
              </div>
              <button className="btn primary big" onClick={toConfirm} disabled={!items.length && !touched}>
                Saqlash… <kbd>Ctrl+Enter</kbd>
              </button>
            </section>
          </div>
        ) : (
          <div className="sheet-body confirm">
            <div className="nb-confirm">
              <table className="table">
                <thead><tr><th>Tovar</th><th>Ranglar</th><th className="num">Pachka</th><th className="num">Kelish</th><th className="num">Sotuv</th><th>Kodlar</th></tr></thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} style={hueStyle(it.brand)}>
                      <td><b><i className="dot" />{it.brand} · {it.name}</b><div className="muted small">{[it.size, `${it.packSize} juftlik`].filter(Boolean).join(' · ')}</div></td>
                      <td className="small">{it.colors.map((r) => `${r.color || '—'} ×${r.packs}`).join(', ')}</td>
                      <td className="num"><b>{packsOf(it)}</b></td>
                      <td className="num">{formatSum(it.cost)}</td>
                      <td className="num"><b>{formatSum(it.sale)}</b></td>
                      <td>{codes[it.id] && <span className="code-chip">{codes[it.id][0]}{codes[it.id][0] !== codes[it.id][1] && `–${codes[it.id][1]}`}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="nb-totals big">
              <div><span>Model</span><b>{items.length}</b></div>
              <div><span>Pachka</span><b>{totals.packs}</b></div>
              <div><span>Juft</span><b>{totals.pairs}</b></div>
              <div><span>Kelish summasi</span><b>{formatSum(totals.cost)}</b></div>
              <div><span>Sotuv summasi</span><b>{formatSum(totals.sale)}</b></div>
              <div><span>Kutilayotgan foyda</span><b className="ok">{formatSum(totals.sale - totals.cost)}</b></div>
            </div>
            {error && <div className="error small">{error}</div>}
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setStep('fill')} disabled={saving}>← Savatga qaytish</button>
              <span className="grow" />
              <button className="btn primary big" onClick={save} disabled={saving}>{saving ? 'Saqlanmoqda…' : `✅ Tasdiqlash — ${totals.packs} pachka`}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
