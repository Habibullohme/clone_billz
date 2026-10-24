import { useEffect, useMemo, useState } from 'react'
import type { Product, Sale } from '../types'
import { activeSales, codeOf, getProducts, getSales, restoreProduct, searchProducts, setPrices, setStock, writeOffProducts } from '../data/store'
import { PENDING_KEY } from './LabelsPage'
import { formatSum, parseSum } from '../lib/money'
import { beep, useScanner } from '../lib/useScanner'
import { Modal } from '../components/ui'

/**
 * Qayta sanash (vaqtinchalik): do'kondagi har bir pachka yorlig'ini skaner qilasiz,
 * sayt bazadagi holat bilan solishtiradi. Bazaga hech narsa o'zi yozilmaydi — har bir tuzatish tugma bilan.
 */
interface Session {
  startedAt: string
  /** Shtrix-kod → necha marta skaner qilindi. */
  scans: Record<string, number>
  /** Skanerlar tartibi (oxirgisi yuqorida ko'rinadi). */
  order: string[]
  /** Faqat shu brendlar solishtiriladi (bo'sh — hammasi). */
  brands: string[]
  /** Ko'rib chiqilgan ("e'tiborsiz") shtrix-kodlar. */
  ignored: string[]
  /** Yorlig'i tushib qolgan (qo'lda topilgan) — yangi etiketka kerak. */
  relabel?: string[]
}

const KEY = 'count.session.v1'
const load = (): Session | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null
  } catch {
    return null
  }
}
const store = (s: Session | null) => {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    // Faqat shu oynada qoladi.
  }
}

type View = 'scan' | 'list' | 'missing'

export function CountPage({ onLabels }: { onLabels: () => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [s, setS] = useState<Session | null>(load)
  const [view, setView] = useState<View>('scan')
  const [manual, setManual] = useState('')
  const [last, setLast] = useState<{ code: string; ok: boolean; text: string; note?: string; again?: boolean } | null>(null)
  /** Qayta skaner qilingan yorliq — ro'yxatda silkinadi. */
  const [shake, setShake] = useState<{ code: string; n: number } | null>(null)
  /** Ro'yxatda bosilgan skaner (× chiqadi). */
  const [picked, setPicked] = useState<string | null>(null)
  const [findQ, setFindQ] = useState('')
  const [restoring, setRestoring] = useState<string | null>(null)
  const [pricing, setPricing] = useState<Product | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    setProducts(await getProducts())
    setSales(await getSales())
  }
  useEffect(() => { reload() }, [])

  const save = (next: Session | null) => {
    setS(next)
    store(next)
  }
  const byCode = useMemo(() => new Map(products.map((p) => [p.barcode, p])), [products])
  const lastSale = useMemo(() => {
    const m = new Map<string, Sale>()
    for (const sale of activeSales(sales)) for (const l of sale.lines) {
      const prev = m.get(l.productId)
      if (!prev || prev.createdAt < sale.createdAt) m.set(l.productId, sale)
    }
    return m
  }, [sales])
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand))].sort((a, b) => a.localeCompare(b)), [products])

  const scan = (raw: string) => {
    const code = raw.trim()
    if (!s || !code) return
    const p = byCode.get(code)
    if (s.scans[code]) {
      // Allaqachon skaner qilingan: hisob o'zgarmaydi, ro'yxatdagi yorlig'i qizil bo'lib silkinadi.
      beep(false)
      setShake({ code, n: Date.now() })
      setLast({ code, ok: false, text: `${p ? p.name : code} — bu yorliq allaqachon skaner qilingan`, again: true })
      return
    }
    save({ ...s, scans: { ...s.scans, [code]: 1 }, order: [code, ...s.order] })
    const ok = Boolean(p && p.stock > 0)
    beep(ok)
    setLast({
      code, ok,
      text: !p ? "Bazada yo'q" : p.stock <= 0 ? `${p.name} — bazada sotilgan deb turibdi` : `${p.name} — joyida`,
    })
  }
  /** Yorlig'i tushib qolgan pachka: nom bo'yicha topib "bor" deb belgilash, yangi etiketka ro'yxatiga qo'shiladi. */
  const markNoLabel = (p: Product) => {
    if (!s) return
    const relabel = [...new Set([...(s.relabel ?? []), p.barcode])]
    save({ ...s, relabel, scans: { ...s.scans, [p.barcode]: (s.scans[p.barcode] ?? 0) + 1 }, order: [p.barcode, ...s.order.filter((c) => c !== p.barcode)] })
    setFindQ('')
    setLast({ code: p.barcode, ok: true, text: `${p.name} — joyida (yorliqsiz, yangi etiketka ro'yxatida)` })
  }
  /** Skanerni bekor qilish (noto'g'ri yoki qayta skaner qilish uchun). */
  const unscan = (code: string) => {
    if (!s) return
    const { [code]: _drop, ...rest } = s.scans
    save({ ...s, scans: rest, order: s.order.filter((c) => c !== code), relabel: (s.relabel ?? []).filter((c) => c !== code) })
    setPicked(null)
    if (last?.code === code) setLast(null)
  }
  useScanner(scan, Boolean(s) && !restoring && !pricing)

  if (!s) {
    return (
      <div className="page count-page">
        <div className="page-head"><h1>Qayta sanash</h1></div>
        <section className="card count-intro">
          <h2>Ombordagi tovarni bazaga solishtirish</h2>
          <ol>
            <li>Do'kondagi har bir pachkaning yorlig'ini skaner qiling (tartib muhim emas, bir necha kunda ham bo'ladi — natija shu kompyuterda saqlanib turadi).</li>
            <li>Sayt uch xil farqni ko'rsatadi: <b>bazada yo'q</b> yorliqlar, <b>sotilgan deb turgan</b>, lekin qo'lda bor pachkalar va oxirida <b>bazada bor, lekin topilmagan</b> pachkalar.</li>
            <li>Bazaga hech narsa o'zi yozilmaydi: har bir tuzatishni o'zingiz tugma bilan qilasiz.</li>
          </ol>
          <div className="field">
            <span>Qaysi brendlarni sanaysiz? (hech biri tanlanmasa — hammasi)</span>
            <BrandPick all={brands} value={[]} onStart={(b) => save({ startedAt: new Date().toISOString(), scans: {}, order: [], brands: b, ignored: [] })} />
          </div>
        </section>
      </div>
    )
  }

  const inScope = (p: Product) => !s.brands.length || s.brands.includes(p.brand)
  const scanned = s.order
  const unknown = scanned.filter((c) => !byCode.has(c) && !s.ignored.includes(c))
  const soldHere = scanned.map((c) => byCode.get(c)).filter((p): p is Product => Boolean(p && p.stock <= 0 && !s.ignored.includes(p.barcode)))
  const doubles = scanned.filter((c) => (s.scans[c] ?? 0) > 1)
  const okCount = scanned.filter((c) => { const p = byCode.get(c); return p && p.stock > 0 }).length
  // Sanash boshlangandan keyin kiritilgan tovarlar (yorlig'i yo'q yuk uchun yangi kirim) — joyida deb hisoblanadi.
  const isNew = (p: Product) => p.createdAt > s.startedAt
  const expected = products.filter((p) => p.stock > 0 && inScope(p) && !isNew(p))
  const added = products.filter((p) => p.stock > 0 && inScope(p) && isNew(p))
  const missing = expected.filter((p) => !s.scans[p.barcode] && !s.ignored.includes(p.barcode))
  const ignore = (code: string) => save({ ...s, ignored: [...s.ignored, code] })
  const run = async (job: () => Promise<unknown>) => {
    setBusy(true)
    try { await job(); await reload() } finally { setBusy(false) }
  }

  return (
    <div className="page count-page">
      <div className="page-head">
        <h1>Qayta sanash</h1>
        <div className="head-actions">
          <button className="btn ghost danger-text" onClick={() => { if (window.confirm('Sanashni boshidan boshlaysizmi? Skaner qilinganlar ro\'yxati o\'chadi (bazaga ta\'sir qilmaydi).')) save(null) }}>Boshidan boshlash</button>
        </div>
      </div>

      <div className="kpis four">
        <div className="kpi"><span>Joyida (mos)</span><b>{okCount}</b></div>
        <div className="kpi"><span>Bazada kutilgan</span><b>{expected.length}</b></div>
        <div className="kpi tone-amber"><span>Farqlar</span><b>{unknown.length + soldHere.length}</b></div>
        <div className="kpi tone-red"><span>Hali topilmagan</span><b>{missing.length}</b></div>
      </div>
      <p className="muted small">
        {s.brands.length ? `Brendlar: ${s.brands.join(', ')}` : 'Barcha brendlar'} · boshlangan: {new Date(s.startedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </p>

      <div className="seg-row">
        <button className={`btn ${view === 'scan' ? 'primary' : 'ghost'}`} onClick={() => setView('scan')}>Skaner va farqlar</button>
        <button className={`btn ${view === 'list' ? 'primary' : 'ghost'}`} onClick={() => setView('list')}>Skaner qilinganlar ({scanned.length})</button>
        <button className={`btn ${view === 'missing' ? 'primary' : 'ghost'}`} onClick={() => setView('missing')}>Topilmaganlar ({missing.length})</button>
      </div>

      {view === 'scan' ? (
        <>
          <section className={`card count-scan${last ? (last.ok ? ' ok' : ' bad') : ''}`}>
            <div className="count-title">
              <b>{last ? last.text : 'Yorliqni skaner qiling'}</b>
              {last && byCode.get(last.code) && <span className="count-price">{formatSum(byCode.get(last.code)!.salePrice)} <small>so'm</small></span>}
            </div>
            {last?.note && <span className="count-warn">⚠ {last.note}</span>}
            {last && byCode.get(last.code) ? (() => {
              const p = byCode.get(last.code)!
              return (
                <div className="count-info">
                  <span className="mono">{last.code}</span>
                  <span>Pachkada: <b>{p.packSize} juft</b></span>
                  <span>Qoldiq: <b>{p.stock} juft</b></span>
                  <span>Sotuv: <b>{formatSum(p.salePrice)}</b></span>
                  <span className="muted">Kelish: {formatSum(p.costPrice)}</span>
                  <button className="btn ghost small" onClick={() => setPricing(p)}>✎ Tahrirlash</button>
                  <button className="btn ghost small danger-text" onClick={() => unscan(last.code)}>Skanerni bekor qilish</button>
                </div>
              )
            })() : (
              <span className="muted small">{last ? last.code : 'Skaner har doim tinglaydi. Qo\'lda ham yozish mumkin:'}</span>
            )}
            <form className="row-form" onSubmit={(e) => { e.preventDefault(); scan(manual); setManual('') }}>
              <input className="input" inputMode="numeric" placeholder="Shtrix-kod raqami" value={manual} onChange={(e) => setManual(e.target.value)} />
              <button className="btn ghost" disabled={!manual.trim()}>Qo'shish</button>
            </form>
          </section>

          <section className="card">
            <h2>Yorlig'i tushib qolgan yuk</h2>
            <p className="muted small">Pachka bor, bazada ham bor, lekin yorlig'i tushib qolgan bo'lsa — nomi yoki kodi bilan toping va "Bor" ni bosing. U joyida deb hisoblanadi va yangi etiketka ro'yxatiga tushadi.</p>
            <input className="input" placeholder="Masalan: barsofka A121 yoki A121" value={findQ} onChange={(e) => setFindQ(e.target.value)} />
            {findQ.trim().length >= 2 && (
              <div className="find-list">
                {searchProducts(products.filter((p) => p.stock > 0), findQ, 8).map((p) => {
                  const done = Boolean(s.scans[p.barcode])
                  return (
                    <div key={p.id} className="count-row">
                      <span><b>{p.name}</b><span className="muted small"> · {p.brand} · {p.color} · {p.packSize} juft · {formatSum(p.salePrice)}</span></span>
                      <span className="grow" />
                      {done ? <span className="muted small">allaqachon belgilangan</span> : <button className="btn primary small" onClick={() => markNoLabel(p)}>Bor (yorliqsiz)</button>}
                    </div>
                  )
                })}
              </div>
            )}
            {(s.relabel?.length ?? 0) > 0 && (
              <div className="relabel">
                <span><b>Yangi etiketka kerak: {s.relabel!.length} ta</b> <span className="muted small">· {s.relabel!.map((c) => byCode.get(c)?.name ?? c).join(', ')}</span></span>
                <button
                  className="btn primary"
                  onClick={() => {
                    const ids = s.relabel!.map((c) => byCode.get(c)?.id).filter((x): x is string => Boolean(x))
                    try { localStorage.setItem(PENDING_KEY, JSON.stringify(ids)) } catch { /* xotira yopiq */ }
                    onLabels()
                  }}
                >
                  🏷 Etiketka chiqarish
                </button>
                <button className="btn ghost small" onClick={() => save({ ...s, relabel: [] })}>Chiqarildi — ro'yxatni tozalash</button>
              </div>
            )}
          </section>

          {unknown.length > 0 && (
            <section className="card">
              <h2>Bazada yo'q yorliqlar ({unknown.length})</h2>
              <p className="muted small">Bu pachkalar bazadan o'chirilgan. Yorliqdagi nom va narxni yozib, xuddi shu shtrix-kod bilan qayta kiritish mumkin.</p>
              {unknown.map((c) => (
                <div key={c} className="count-row">
                  <span className="mono">{c}</span>
                  <span className="grow" />
                  <button className="btn ghost small" onClick={() => ignore(c)}>E'tiborsiz</button>
                  <button className="btn primary small" onClick={() => setRestoring(c)}>Qayta kiritish</button>
                </div>
              ))}
            </section>
          )}

          {soldHere.length > 0 && (
            <section className="card">
              <h2>Sotilgan deb turibdi, lekin qo'lda bor ({soldHere.length})</h2>
              <p className="muted small">"Omborga qaytarish" — qoldiq bitta pachkaga tiklanadi. Sotuv cheki o'zgarmaydi.</p>
              {soldHere.map((p) => {
                const sale = lastSale.get(p.id)
                return (
                  <div key={p.id} className="count-row">
                    <span><b>{p.name}</b><span className="muted small"> · {p.brand} · {p.color}{sale ? ` · chek №${sale.number}, ${new Date(sale.createdAt).toLocaleDateString('ru-RU')}` : ' · cheki topilmadi'}</span></span>
                    <span className="grow" />
                    <button className="btn ghost small" onClick={() => ignore(p.barcode)}>E'tiborsiz</button>
                    <button className="btn primary small" disabled={busy} onClick={() => run(() => setStock(p.id, p.packSize))}>Omborga qaytarish</button>
                  </div>
                )
              })}
            </section>
          )}

          {doubles.length > 0 && (
            <section className="card">
              <h2>Ikki marta skaner qilingan ({doubles.length})</h2>
              <p className="muted small">Bir xil yorliq ikki pachkada bo'lishi mumkin (nusxa chiqarilgan) yoki bitta pachka ikki marta skaner qilingan.</p>
              {doubles.map((c) => (
                <div key={c} className="count-row">
                  <span>{byCode.get(c)?.name ?? c} <span className="muted small">· {s.scans[c]} marta</span></span>
                  <span className="grow" />
                  <button className="btn ghost small" onClick={() => save({ ...s, scans: { ...s.scans, [c]: 1 } })}>1 ta deb hisoblash</button>
                </div>
              ))}
            </section>
          )}

          <section className="card">
            <h2>Oxirgi skanerlar ({scanned.length})</h2>
            <p className="muted small">Ustiga bosing — × chiqadi, × bilan skanerni bekor qilasiz. Qizil — ikki marta skaner qilingan, sariq — sotilgan deb turgan, kulrang — bazada yo'q.</p>
            {scanned.length === 0 ? <p className="muted">Hali hech narsa skaner qilinmadi.</p> : (
              <div className="count-log">
                {(shake && scanned.indexOf(shake.code) >= 80 ? [shake.code, ...scanned.slice(0, 79)] : scanned.slice(0, 80)).map((c) => {
                  const p = byCode.get(c)
                  const n = s.scans[c] ?? 1
                  const kind = n > 1 ? 'dup' : !p ? 'none' : p.stock <= 0 ? 'sold' : 'ok'
                  return (
                    <span
                      key={shake?.code === c ? `${c}-${shake.n}` : c}
                      className={`scan-chip ${kind}${picked === c ? ' on' : ''}${shake?.code === c ? ' again' : ''}`}
                      onClick={() => setPicked(picked === c ? null : c)}
                    >
                      {p ? p.name : c}{n > 1 && <b> ×{n}</b>}
                      {picked === c && <button className="scan-x" aria-label="Skanerni bekor qilish" onClick={(e) => { e.stopPropagation(); unscan(c) }}>✕</button>}
                    </span>
                  )
                })}
                {scanned.length > 80 && <span className="muted small">… yana {scanned.length - 80} ta ("Skaner qilinganlar"da)</span>}
              </div>
            )}
          </section>
        </>
      ) : view === 'list' ? (
        <section className="card">
          <h2>Skaner qilinganlar ({scanned.length})</h2>
          <p className="muted small">Narx noto'g'ri bo'lsa — "Narx" tugmasi. Sanash boshlangandan keyin kirim qilingan {added.length} ta pachka ham joyida deb hisoblanadi.</p>
          {scanned.length === 0 ? <p className="muted">Hali hech narsa skaner qilinmadi.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Tovar</th><th>Brend</th><th>Rang</th><th className="num">Qoldiq</th><th className="num">Kelish</th><th className="num">Sotuv</th><th /></tr></thead>
                <tbody>
                  {scanned.map((c) => {
                    const p = byCode.get(c)
                    if (!p) return <tr key={c}><td className="mono">{c}</td><td colSpan={5} className="muted">bazada yo'q</td><td className="num"><button className="btn primary small" onClick={() => setRestoring(c)}>Qayta kiritish</button></td></tr>
                    return (
                      <tr key={c}>
                        <td><b>{p.name}</b></td>
                        <td>{p.brand}</td>
                        <td>{p.color}</td>
                        <td className="num">{p.stock} juft</td>
                        <td className="num">{formatSum(p.costPrice)}</td>
                        <td className="num"><b>{formatSum(p.salePrice)}</b></td>
                        <td className="num"><button className="btn ghost small" onClick={() => setPricing(p)}>✎ Narx</button> <button className="btn ghost small danger-text" title="Skanerni bekor qilish" onClick={() => unscan(c)}>✕</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="card">
          <div className="count-head">
            <h2>Bazada bor, lekin skaner qilinmagan ({missing.length})</h2>
            {missing.length > 0 && (
              <button
                className="btn danger"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`${missing.length} ta pachka bazadan chiqarilsinmi?\n\nHech sotilmaganlari o'chiriladi, sotuvda qatnashganlari qoldig'i 0 qilinadi (cheklar va hisobot o'zgarmaydi).\n\nFaqat hamma yukni skaner qilib bo'lgach bosing.`)) return
                  run(async () => {
                    const r = await writeOffProducts(missing.map((p) => p.id))
                    setLast({ code: '', ok: true, text: `Bazadan chiqarildi: ${r.removed} ta o'chirildi, ${r.zeroed} ta qoldig'i 0` })
                  })
                }}
              >
                Hammasini bazadan chiqarish
              </button>
            )}
          </div>
          <p className="muted small">
            Hamma yukni skaner qilib bo'lgach qarang. Bular bazada "omborda" turibdi, lekin yorlig'i topilmadi.
            "Bazadan chiqarish": hech sotilmagan pachka o'chiriladi, sotuvda qatnashgani qoldig'i 0 qilinadi (cheklar o'zgarmaydi).
          </p>
          {missing.length === 0 ? <p className="muted">Hammasi topildi 👍</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Tovar</th><th>Brend</th><th>Rang</th><th className="num">Qoldiq</th><th className="num">Narx</th><th /></tr></thead>
                <tbody>
                  {missing.map((p) => (
                    <tr key={p.id}>
                      <td><b>{p.name}</b></td>
                      <td>{p.brand}</td>
                      <td>{p.color}</td>
                      <td className="num">{p.stock} juft</td>
                      <td className="num">{formatSum(p.salePrice)}</td>
                      <td className="num">
                        <button className="btn ghost small" onClick={() => ignore(p.barcode)}>Bor (e'tiborsiz)</button>{' '}
                        <button className="btn ghost small danger-text" disabled={busy} onClick={() => { if (window.confirm(`${p.name}: bazadan chiqarilsinmi?`)) run(() => writeOffProducts([p.id])) }}>Bazadan chiqarish</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {pricing && (
        <PriceForm
          p={pricing}
          siblings={products.filter((x) => x.id !== pricing.id && x.brand === pricing.brand && baseName(x.name) === baseName(pricing.name) && x.salePrice === pricing.salePrice && x.stock > 0)}
          onClose={() => setPricing(null)}
          onDone={async () => { setPricing(null); await reload() }}
        />
      )}

      {restoring && (
        <RestoreForm
          code={restoring}
          brands={brands}
          onClose={() => setRestoring(null)}
          onDone={async () => { setRestoring(null); await reload() }}
        />
      )}
    </div>
  )
}

/** "Little qalin A69" → "Little qalin" (oxiridagi yorliq kodisiz). */
const baseName = (name: string) => {
  const code = codeOf(name)
  return code ? name.slice(0, -code.length).trim() : name.trim()
}

function PriceForm({ p, siblings, onClose, onDone }: { p: Product; siblings: Product[]; onClose: () => void; onDone: () => void }) {
  const [sale, setSale] = useState(formatSum(p.salePrice))
  const [cost, setCost] = useState(formatSum(p.costPrice))
  const [all, setAll] = useState(siblings.length > 0)
  const [busy, setBusy] = useState(false)
  const ok = parseSum(sale) > 0
  return (
    <Modal title="Narxni o'zgartirish" onClose={onClose}>
      <p><b>{p.name}</b> <span className="muted small">· {p.brand} · {p.color} · {p.size}</span></p>
      <div className="grid2">
        <label className="field"><span>Sotuv narxi (1 juft)</span><input className="input" inputMode="numeric" autoFocus value={sale} onFocus={(e) => e.target.select()} onChange={(e) => setSale(formatSum(parseSum(e.target.value)))} /></label>
        <label className="field"><span>Kelish narxi (1 juft)</span><input className="input" inputMode="numeric" value={cost} onFocus={(e) => e.target.select()} onChange={(e) => setCost(formatSum(parseSum(e.target.value)))} /></label>
      </div>
      {siblings.length > 0 && (
        <label className="check-row">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          <span>
            Shu modelning <b>barcha {siblings.length} ta</b> boshqa pachkasiga ham — hali skaner qilinmaganlariga ham
            <span className="muted small"> ("{baseName(p.name)}", {p.brand}, hozirgi narxi {formatSum(p.salePrice)})</span>
          </span>
        </label>
      )}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>Bekor</button>
        <button
          className="btn primary grow"
          disabled={!ok || busy}
          onClick={async () => {
            setBusy(true)
            await setPrices([p.id, ...(all ? siblings.map((x) => x.id) : [])], parseSum(sale), parseSum(cost))
            onDone()
          }}
        >
          Saqlash{all && siblings.length ? ` (${siblings.length + 1} ta)` : ''}
        </button>
      </div>
    </Modal>
  )
}

function BrandPick({ all, value, onStart }: { all: string[]; value: string[]; onStart: (b: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(value)
  return (
    <>
      <div className="chips-row wrap">
        {all.map((b) => (
          <button key={b} className={`chip${sel.includes(b) ? ' on' : ''}`} onClick={() => setSel(sel.includes(b) ? sel.filter((x) => x !== b) : [...sel, b])}>{b}</button>
        ))}
      </div>
      <button className="btn primary" onClick={() => onStart(sel)}>Sanashni boshlash{sel.length ? ` (${sel.length} brend)` : ''}</button>
    </>
  )
}

function RestoreForm({ code, brands, onClose, onDone }: { code: string; brands: string[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ brand: '', name: '', size: '', color: '', packSize: '5', costPrice: '', salePrice: '' })
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v })
  const ok = f.brand.trim() && f.name.trim() && Number(f.packSize) > 0 && parseSum(f.salePrice) > 0
  return (
    <Modal title="Qayta kiritish" onClose={onClose}>
      <p className="muted small">Shtrix-kod: <b className="mono">{code}</b>. Yorliqdagi nomni kodi bilan yozing (masalan "Little qalin A69").</p>
      <label className="field"><span>Brend</span>
        <input className="input" list="count-brands" value={f.brand} onChange={(e) => set('brand', e.target.value)} />
        <datalist id="count-brands">{brands.map((b) => <option key={b} value={b} />)}</datalist>
      </label>
      <label className="field"><span>Nomi (kodi bilan)</span><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
      <div className="grid2">
        <label className="field"><span>Razmer</span><input className="input" value={f.size} onChange={(e) => set('size', e.target.value)} /></label>
        <label className="field"><span>Rang</span><input className="input" value={f.color} onChange={(e) => set('color', e.target.value)} /></label>
        <label className="field"><span>Pachkada (juft)</span><input className="input" inputMode="numeric" value={f.packSize} onChange={(e) => set('packSize', e.target.value.replace(/\D/g, ''))} /></label>
        <label className="field"><span>Sotuv narxi (1 juft)</span><input className="input" inputMode="numeric" value={f.salePrice} onChange={(e) => set('salePrice', e.target.value)} /></label>
        <label className="field"><span>Kelish narxi (1 juft)</span><input className="input" inputMode="numeric" value={f.costPrice} onChange={(e) => set('costPrice', e.target.value)} /></label>
      </div>
      {err && <p className="danger-text small">{err}</p>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>Bekor</button>
        <button
          className="btn primary grow"
          disabled={!ok}
          onClick={async () => {
            const e = await restoreProduct({
              barcode: code, brand: f.brand, name: f.name, size: f.size, color: f.color,
              packSize: Number(f.packSize), costPrice: parseSum(f.costPrice), salePrice: parseSum(f.salePrice),
            })
            if (e) setErr(e)
            else onDone()
          }}
        >
          Bazaga qaytarish
        </button>
      </div>
    </Modal>
  )
}
