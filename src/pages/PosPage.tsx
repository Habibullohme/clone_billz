import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CartLine, HeldCart, Payment, Product, Sale } from '../types'
import {
  findByBarcode, getHeld, getProducts, getSettings, holdCart, saveSale, saveSettings,
  searchProducts, takeHeld, type Settings,
} from '../data/store'
import { addProduct, distributeTotal, lineTotal, subtotal } from '../lib/cart'
import { formatSum, parseSum, shortSum } from '../lib/money'
import { beep, useScanner } from '../lib/useScanner'
import { CartRow } from '../components/CartRow'
import { CustomerInput } from '../components/CustomerInput'
import { PaymentModal } from '../components/PaymentModal'
import { Receipt } from '../components/Receipt'
import { BackClose, MoneyInput } from '../components/ui'

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement

export function PosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [lines, setLines] = useState<CartLine[]>([])
  const [customer, setCustomer] = useState('')
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [finalDraft, setFinalDraft] = useState('')
  const [query, setQuery] = useState('')
  const [activeHit, setActiveHit] = useState(0)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [shakeId, setShakeId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null)
  const [paying, setPaying] = useState(false)
  const [done, setDone] = useState<Sale | null>(null)
  const [held, setHeld] = useState<HeldCart[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getProducts().then(setProducts)
    getSettings().then(setSettings)
    getHeld().then(setHeld)
  }, [])

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const showToast = (text: string, bad = false) => {
    setToast({ text, bad })
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 2200)
  }

  const linesRef = useRef(lines)
  linesRef.current = lines

  const add = useCallback(
    (p: Product) => {
      const inCart = linesRef.current.find((l) => l.productId === p.id)?.pairs ?? 0
      // Bitta shtrix-kod — bitta pachka: omborda boridan ortiq qo'shilmaydi.
      if (inCart + p.packSize > p.stock) {
        if (settings?.scanSound) beep(false)
        if (inCart > 0) {
          // Savatdagi o'sha qator silkinadi — qaysi tovar ekani darhol ko'rinadi.
          setShakeId(null)
          requestAnimationFrame(() => setShakeId(p.id))
          setTimeout(() => setShakeId((x) => (x === p.id ? null : x)), 600)
        }
        showToast(
          inCart > 0
            ? `${p.name} savatda bor`
            : p.stock <= 0
              ? `${p.name} sotilgan — omborda yo'q`
              : `${p.name}: omborda faqat ${p.stock} juft bor`,
          true,
        )
        return false
      }
      // Ikki skaner juda tez kelsa ham — holat yangilanayotganda yana tekshiramiz.
      setLines((ls) => ((ls.find((l) => l.productId === p.id)?.pairs ?? 0) + p.packSize > p.stock ? ls : addProduct(ls, p)))
      setFlashId(p.id)
      setTimeout(() => setFlashId((f) => (f === p.id ? null : f)), 700)
      return true
    },
    [lines, settings],
  )

  const onScan = useCallback(
    async (code: string) => {
      const p = await findByBarcode(code)
      if (!p) {
        if (settings?.scanSound) beep(false)
        showToast(`Bunday shtrix-kod yo'q: ${code}`, true)
        return
      }
      setDone(null)
      if (add(p) && settings?.scanSound) beep(true)
    },
    [add, settings],
  )

  useScanner(onScan, !paying)

  // Space — qidiruv, F2 — to'lov.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done) {
        // Chek oynasi: Space — chop etish, Enter — yangi sotuv.
        if (e.code === 'Space') {
          e.preventDefault()
          window.print()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          setDone(null)
        }
        return
      }
      if (paying) return
      if (e.code === 'Space' && !isTyping(e.target)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'F2' && lines.length) {
        e.preventDefault()
        setPaying(true)
      }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [lines.length, paying, done])

  const hits = searchProducts(products, query)
  const sub = subtotal(lines)
  const finalTotal = (() => {
    const v = parseSum(finalDraft)
    return Number.isFinite(v) && v > 0 && v <= sub ? v : null
  })()
  const total = finalTotal ?? sub
  const discount = sub - total
  const distributed = finalTotal !== null ? distributeTotal(lines.map(lineTotal), finalTotal) : null
  const packs = lines.reduce((s, l) => s + l.pairs / (byId.get(l.productId)?.packSize ?? 1), 0)

  // Tezkor yaxlitlash: jamini pastga yaxlitlangan summalar.
  const quickTotals = useMemo(() => {
    if (sub <= 0 || !settings) return []
    const out = new Set<number>()
    for (const st of settings.roundSteps) {
      const v = Math.floor(sub / st) * st
      if (v > 0 && v < sub) out.add(v)
    }
    return [...out].sort((a, b) => b - a).slice(0, 3)
  }, [sub, settings])

  const reset = () => {
    setLines([])
    setCustomer('')
    setNote('')
    setShowNote(false)
    setFinalDraft('')
    setQuery('')
  }

  const pay = async (payment: Payment, change: number, usdRate: number) => {
    const saleLines = lines.map((l, i) => {
      const p = byId.get(l.productId)!
      return {
        productId: p.id, name: p.name, brand: p.brand, barcode: p.barcode, packSize: p.packSize,
        pairs: l.pairs, price: l.price, costPrice: p.costPrice,
        total: distributed ? distributed[i] : lineTotal(l),
      }
    })
    const profit = saleLines.reduce((s, l) => s + l.total - l.costPrice * l.pairs, 0)
    let sale: Sale
    try {
      sale = await saveSale({
        customerName: customer.trim(), note: note.trim(), lines: saleLines,
        subtotal: sub, discount, total, profit, payment, change,
      })
    } catch (e) {
      console.error(e)
      showToast("Sotuv saqlanmadi — internetni tekshirib, qayta urinib ko'ring", true)
      return
    }
    if (settings && usdRate !== settings.usdRate && usdRate > 0) {
      const s = { ...settings, usdRate }
      setSettings(s)
      saveSettings(s)
    }
    setPaying(false)
    setDone(sale)
    reset()
    getProducts().then(setProducts)
  }

  const hold = async () => {
    await holdCart({ customerName: customer, lines, finalTotal })
    setHeld(await getHeld())
    reset()
    showToast('Savat keyinga qoldirildi')
  }

  const resume = async (id: string) => {
    if (lines.length) await holdCart({ customerName: customer, lines, finalTotal })
    const h = await takeHeld(id)
    if (h) {
      setLines(h.lines)
      setCustomer(h.customerName)
      setFinalDraft(h.finalTotal ? String(h.finalTotal) : '')
    }
    setHeld(await getHeld())
  }

  if (!settings) return null

  return (
    <div className="pos">
      <section className="pos-main">
        <div className="search-bar">
        <div className="search">
          <svg className="search-ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M14 14l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          <input
            ref={searchRef}
            className="search-in"
            placeholder="Tovar qidirish"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveHit(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveHit((a) => Math.min(a + 1, hits.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveHit((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter' && hits[activeHit]) {
                add(hits[activeHit])
                setQuery('')
              } else if (e.key === 'Escape') {
                setQuery('')
                e.currentTarget.blur()
              }
            }}
          />
          <kbd className="search-kbd">Space</kbd>
          {hits.length > 0 && (
            <ul className="hits">
              {hits.map((p, i) => (
                <li
                  key={p.id}
                  className={i === activeHit ? 'on' : ''}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    add(p)
                    setQuery('')
                  }}
                >
                  <div>
                    <b>{p.name}</b>
                    <div className="muted small">{[p.brand, p.size, p.color].filter(Boolean).join(' · ')}</div>
                  </div>
                  <b>{formatSum(p.salePrice)}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
        {lines.length > 0 && <ClearCart onClear={reset} />}
        </div>

        {lines.length === 0 ? (
          <div className="empty">
            <div className="scan-ready"><span className="scan-dot" /> Skaner tayyor</div>
            <b>Tovarni skaner qiling</b>
            <span className="muted">Har skanerda bir pachka qo'shiladi. Qidirish uchun Space bosing.</span>
          </div>
        ) : (
          <div className="rows">
            {lines.map((l, i) => {
              const p = byId.get(l.productId)
              if (!p) return null
              return (
                <CartRow
                  key={l.productId}
                  line={l}
                  product={p}
                  discountedTotal={distributed ? distributed[i] : null}
                  highlight={flashId === l.productId}
                  shake={shakeId === l.productId}
                  allowPriceEdit={settings.allowPriceEdit}
                  onChange={(nl) => setLines((ls) => ls.map((x) => (x.productId === nl.productId ? nl : x)))}
                  onRemove={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))}
                />
              )
            })}
          </div>
        )}
      </section>

      <aside className="pos-side">
        {held.length > 0 && (
          <div className="block">
            <div className="label">Kutayotganlar</div>
            <div className="held-list">
              {held.map((h) => (
                <button key={h.id} className="held" onClick={() => resume(h.id)}>
                  <b>{h.customerName || 'Mijozsiz'}</b>
                  <span className="small">
                    {formatSum(subtotal(h.lines))} · {new Date(h.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="block">
          <div className="label">Mijoz</div>
          <CustomerInput value={customer} onChange={setCustomer} />
        </div>

        <div className="block">
          <div className="label">Yakuniy summa</div>
          <MoneyInput
            placeholder={sub ? formatSum(sub) : 'chegirma uchun'}
            value={finalDraft}
            onChange={setFinalDraft}
            disabled={!lines.length}
          />
          {finalDraft && finalTotal === null && <div className="error small">Jamidan katta bo'lmasin</div>}
          {quickTotals.length > 0 && (
            <div className="quick">
              {quickTotals.map((v) => (
                <button key={v} className={`chip${finalTotal === v ? ' on' : ''}`} onClick={() => setFinalDraft(String(v))}>
                  {shortSum(v)}
                </button>
              ))}
              {finalDraft && <button className="chip" onClick={() => setFinalDraft('')}>✕</button>}
            </div>
          )}
        </div>

        {showNote ? (
          <div className="block">
            <div className="label">Eslatma</div>
            <input className="input" autoFocus value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        ) : (
          <button className="link small left" onClick={() => setShowNote(true)}>+ eslatma</button>
        )}

        <div className="totals">
          {discount > 0 && (
            <>
              <div className="muted"><span>Jami</span><span>{formatSum(sub)}</span></div>
              <div className="muted"><span>Chegirma</span><span>−{formatSum(discount)}</span></div>
            </>
          )}
          <div className="grand">
            <span>{lines.length ? `${+packs.toFixed(1)} pachka` : 'Jami'}</span>
            <b>{formatSum(total)}</b>
          </div>
          <button className="btn primary pay" disabled={!lines.length} onClick={() => setPaying(true)}>
            To'lash <kbd>F2</kbd>
          </button>
          <button className="btn ghost" disabled={!lines.length} onClick={hold}>Kechiktirish</button>
        </div>
      </aside>

      {paying && (
        <PaymentModal
          total={total}
          usdRate={settings.usdRate}
          customerName={customer}
          onCustomerChange={setCustomer}
          onCancel={() => setPaying(false)}
          onConfirm={pay}
        />
      )}

      {done && (
        <div className="modal-bg">
          <BackClose onClose={() => setDone(null)} />
          <div className="modal receipt-modal">
            <div className="done-head">
              <b>Sotuv saqlandi</b>
              {done.change > 0 && <span className="change">Qaytim {formatSum(done.change)}</span>}
            </div>
            <div className="print-area">
              <Receipt sale={done} settings={settings} />
            </div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => window.print()}>Chek chiqarish <kbd>Space</kbd></button>
              <button className="btn primary grow" onClick={() => setDone(null)}>Yangi sotuv <kbd>Enter</kbd></button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast${toast.bad ? ' bad' : ''}`}>{toast.text}</div>}
    </div>
  )
}

/** Savatni tozalash: tasodifan bosilmasligi uchun ikki bosqichli ("Rostdanmi?"). */
function ClearCart({ onClear }: { onClear: () => void }) {
  const [ask, setAsk] = useState(false)
  useEffect(() => {
    if (!ask) return
    const t = setTimeout(() => setAsk(false), 3000)
    return () => clearTimeout(t)
  }, [ask])
  return (
    <button
      className={`clear-btn${ask ? ' ask' : ''}`}
      onClick={() => (ask ? (setAsk(false), onClear()) : setAsk(true))}
      title="Savatni tozalash"
    >
      <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l.8 10h6.4L14 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span>{ask ? 'Rostdanmi?' : 'Tozalash'}</span>
    </button>
  )
}
