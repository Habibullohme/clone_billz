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

export function PosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [lines, setLines] = useState<CartLine[]>([])
  const [customer, setCustomer] = useState('')
  const [note, setNote] = useState('')
  const [finalDraft, setFinalDraft] = useState('')
  const [query, setQuery] = useState('')
  const [activeHit, setActiveHit] = useState(0)
  const [flashId, setFlashId] = useState<string | null>(null)
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

  const add = useCallback((p: Product) => {
    setLines((ls) => addProduct(ls, p))
    setFlashId(p.id)
    setTimeout(() => setFlashId((f) => (f === p.id ? null : f)), 600)
  }, [])

  const onScan = useCallback(
    async (code: string) => {
      const p = await findByBarcode(code)
      if (p) {
        beep(true)
        setDone(null)
        add(p)
      } else {
        beep(false)
        showToast(`Topilmadi: ${code}`, true)
      }
    },
    [add],
  )

  useScanner(onScan, !paying)

  // "/" — qidiruvga o'tish, F2 — to'lov.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'F2' && lines.length && !paying && !done) {
        e.preventDefault()
        setPaying(true)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
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
  const totalPairs = lines.reduce((s, l) => s + l.pairs, 0)

  // Tezkor yaxlitlash tugmalari: pastga yaxlitlangan summalar.
  const quickTotals = useMemo(() => {
    if (sub <= 0) return []
    const steps = [10_000, 50_000, 100_000]
    const out = new Set<number>()
    for (const st of steps) {
      const v = Math.floor(sub / st) * st
      if (v > 0 && v < sub) out.add(v)
    }
    return [...out].sort((a, b) => b - a).slice(0, 3)
  }, [sub])

  const reset = () => {
    setLines([])
    setCustomer('')
    setNote('')
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
    const sale = await saveSale({
      customerName: customer.trim(), note: note.trim(), lines: saleLines,
      subtotal: sub, discount, total, profit, payment, change,
    })
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
    showToast('Savatcha keyinga qoldirildi')
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
        <div className="search">
          <span className="scan-dot" title="Skaner doim tayyor" />
          <input
            ref={searchRef}
            className="input search-in"
            placeholder="Qidiruv: nom, artikul, shtrix-kod   ( / )"
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
                    <div className="muted small">{p.brand} · {p.article} · {p.barcode}</div>
                  </div>
                  <div className="hit-r">
                    <b>{formatSum(p.salePrice)}</b>
                    <div className="muted small">
                      qoldiq: {Math.floor(p.stock / p.packSize)} pachka
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="cart-head">
          <h1>Savatcha</h1>
          {lines.length > 0 && (
            <>
              <span className="pill">{lines.length} xil · {totalPairs} juft</span>
              <button className="link" onClick={reset}>tozalash</button>
            </>
          )}
          <span className="muted scan-hint">Skaner doim ishlaydi — hech narsani bosish shart emas</span>
        </div>

        {lines.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">▥</div>
            <b>Savatcha bo'sh</b>
            <span className="muted">Tovarni skaner qiling — bir pachka avtomatik tushadi</span>
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
                  onChange={(nl) => setLines((ls) => ls.map((x) => (x.productId === nl.productId ? nl : x)))}
                  onRemove={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))}
                />
              )
            })}
          </div>
        )}
      </section>

      <aside className="pos-side">
        <div className="block">
          <div className="label">Mijoz</div>
          <CustomerInput value={customer} onChange={setCustomer} />
        </div>

        <div className="block">
          <div className="label">Yakuniy summa (chegirma)</div>
          <input
            className="input"
            inputMode="numeric"
            placeholder={sub ? formatSum(sub) : 'masalan 1 400 000'}
            value={finalDraft}
            onChange={(e) => setFinalDraft(e.target.value)}
            disabled={!lines.length}
          />
          {finalDraft && finalTotal === null && (
            <div className="error small">Summa jamidan katta bo'lmasligi kerak</div>
          )}
          <div className="quick">
            {quickTotals.map((v) => (
              <button key={v} className="chip" onClick={() => setFinalDraft(String(v))}>
                {shortSum(v)}
              </button>
            ))}
            {finalDraft && (
              <button className="chip" onClick={() => setFinalDraft('')}>bekor</button>
            )}
          </div>
        </div>

        <div className="block">
          <div className="label">Eslatma</div>
          <input className="input" placeholder="ixtiyoriy" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {held.length > 0 && (
          <div className="block">
            <div className="label">Kechiktirilganlar</div>
            {held.map((h) => (
              <button key={h.id} className="held" onClick={() => resume(h.id)}>
                <span>{h.customerName || 'Mijozsiz'}</span>
                <span className="muted small">
                  {h.lines.length} xil · {new Date(h.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="totals">
          <div><span>Oraliq jami</span><span>{formatSum(sub)}</span></div>
          <div><span>Chegirma</span><span>{discount ? `−${formatSum(discount)}` : '0'}</span></div>
          <button className="btn primary pay" disabled={!lines.length} onClick={() => setPaying(true)}>
            <span>TO'LASH <kbd>F2</kbd></span>
            <span>{formatSum(total)} so'm</span>
          </button>
          <button className="btn ghost" disabled={!lines.length} onClick={hold}>Kechiktirish</button>
        </div>
      </aside>

      {paying && (
        <PaymentModal
          total={total}
          usdRate={settings.usdRate}
          customerName={customer}
          onCancel={() => setPaying(false)}
          onConfirm={pay}
        />
      )}

      {done && (
        <div className="modal-bg">
          <div className="modal receipt-modal">
            <div className="done-head">
              <b>✓ Sotuv saqlandi</b>
              {done.change > 0 && <span className="ok">Qaytim: {formatSum(done.change)} so'm</span>}
            </div>
            <div className="print-area">
              <Receipt sale={done} settings={settings} />
            </div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => window.print()}>Chek chop etish</button>
              <button className="btn primary" autoFocus onClick={() => setDone(null)}>Yangi sotuv · Enter</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast${toast.bad ? ' bad' : ''}`}>{toast.text}</div>}
    </div>
  )
}
