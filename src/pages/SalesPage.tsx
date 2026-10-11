import { useEffect, useState } from 'react'
import type { Sale } from '../types'
import { activeSales, archiveSale, getSales, restoreSale, returnSaleLines, getSettings, type Settings } from '../data/store'
import { applyReturn } from '../lib/refund'
import { formatSum } from '../lib/money'
import { Receipt } from '../components/Receipt'
import { BackClose, Segmented } from '../components/ui'
import { hueStyle } from '../lib/colors'
import { inPeriod, type Period } from '../lib/period'
import { PeriodPicker } from '../components/PeriodPicker'

export function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [open, setOpenRaw] = useState<Sale | null>(null)
  /** Chek oynasidagi amal: arxivlash (butun chek) yoki tovar qaytarish (tanlangan qatorlar). */
  const [mode, setMode] = useState<'none' | 'archive' | 'return'>('none')
  const confirm = mode === 'archive'
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const setOpen = (s: Sale | null) => {
    setOpenRaw(s)
    setMode('none')
    setPicked(new Set())
    setReason('')
  }
  const [period, setPeriod] = useState<Period>('today')
  const [view, setView] = useState<'sales' | 'archive'>('sales')

  useEffect(() => {
    getSales().then(setSales)
    getSettings().then(setSettings)
  }, [])

  const list = activeSales(sales).filter((s) => inPeriod(s.createdAt, period))
  const archived = sales.filter((s) => s.archivedAt).sort((a, b) => b.archivedAt!.localeCompare(a.archivedAt!))
  const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  const run = async (job: () => Promise<void>) => {
    setBusy(true)
    try {
      await job()
      setSales(await getSales())
      setOpen(null)
    } finally {
      setBusy(false)
    }
  }
  const sum = (f: (s: Sale) => number) => list.reduce((a, s) => a + f(s), 0)
  const revenue = sum((s) => s.total)
  const profit = sum((s) => s.profit)

  const byBrand = new Map<string, { total: number; profit: number }>()
  for (const s of list)
    for (const l of s.lines) {
      const b = byBrand.get(l.brand) ?? { total: 0, profit: 0 }
      b.total += l.total
      b.profit += l.total - l.costPrice * l.pairs
      byBrand.set(l.brand, b)
    }
  const brands = [...byBrand].sort((a, b) => b[1].total - a[1].total)
  const maxBrand = brands[0]?.[1].total ?? 0

  const payments = [
    ['Naqd', sum((s) => s.payment.cash - s.change)],
    ['Karta', sum((s) => s.payment.card)],
    ['Dollar', sum((s) => Math.round(s.payment.usd * s.payment.usdRate))],
    ['Nasiya', sum((s) => s.payment.debt)],
  ].filter(([, v]) => (v as number) > 0) as [string, number][]
  const usd = sum((s) => s.payment.usd)

  return (
    <div className="page">
      <div className="page-head">
        <h1>Sotuvlar</h1>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      <div className="kpis">
        <div className="kpi tone-violet"><span>Tushum</span><b>{formatSum(revenue)}</b></div>
        <div className="kpi tone-green"><span>Foyda</span><b>{formatSum(profit)}</b></div>
        <div className="kpi tone-blue"><span>Sotuvlar</span><b>{list.length}</b></div>
      </div>

      {payments.length > 0 && (
        <div className="pay-split">
          {payments.map(([k, v]) => (
            <span key={k} className={`pm pm-${k.toLowerCase()}`}>
              {k} <b>{formatSum(v)}</b>
              {k === 'Dollar' && <span className="muted"> ({usd} $)</span>}
            </span>
          ))}
        </div>
      )}

      {brands.length > 0 && (
        <section className="card">
          <h2>Brendlar</h2>
          <div className="brand-bars">
            {brands.map(([brand, b]) => (
              <div key={brand} className="brand-bar" style={hueStyle(brand)}>
                <span className="bb-name"><i className="dot" />{brand}</span>
                <div className="bb-track"><div className="bb-fill" style={{ width: `${(b.total / maxBrand) * 100}%` }} /></div>
                <span className="num">{formatSum(b.total)}</span>
                <span className="num ok">+{formatSum(b.profit)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="section-head">
          <h2>{view === 'sales' ? 'Cheklar' : 'Arxiv'}</h2>
          {(archived.length > 0 || view === 'archive') && (
            <Segmented<'sales' | 'archive'>
              value={view}
              onChange={setView}
              options={[['sales', 'Cheklar'], ['archive', `Arxiv (${archived.length})`]]}
            />
          )}
        </div>
        {view === 'archive' ? (
          archived.length === 0 ? (
            <p className="muted">Arxiv bo'sh.</p>
          ) : (
            <div className="table-wrap">
              <table className="table clickable">
                <thead><tr><th>№</th><th>Sotilgan</th><th>Arxivlangan</th><th>Kim</th><th>Sabab</th><th className="num">Summa</th></tr></thead>
                <tbody>
                  {archived.map((s) => (
                    <tr key={s.id} onClick={() => setOpen(s)}>
                      <td className="muted">{s.number}</td>
                      <td>{when(s.createdAt)}</td>
                      <td className="danger-text">{when(s.archivedAt!)}</td>
                      <td className="small">{s.archivedBy || <span className="muted">—</span>}</td>
                      <td>{s.archiveReason || <span className="muted">—</span>}</td>
                      <td className="num"><s className="muted">{formatSum(s.total)}</s></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : list.length === 0 ? (
          <p className="muted">Bu davrda sotuv yo'q.</p>
        ) : (
          <div className="table-wrap">
            <table className="table clickable">
              <thead><tr><th>№</th><th>Vaqt</th><th>Mijoz</th><th className="num">Summa</th><th className="num">Foyda</th><th>To'lov</th></tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} onClick={() => setOpen(s)}>
                    <td className="muted">{s.number}</td>
                    <td>{when(s.createdAt)}</td>
                    <td>{s.customerName || <span className="muted">—</span>}{s.returns?.length ? <span className="tag t-return">↩️ qaytarish</span> : null}</td>
                    <td className="num"><b>{formatSum(s.total)}</b></td>
                    <td className="num ok">{formatSum(s.profit)}</td>
                    <td>
                      <div className="tags">
                        {s.payment.cash > 0 && <span className="tag t-naqd">naqd</span>}
                        {s.payment.card > 0 && <span className="tag t-karta">karta</span>}
                        {s.payment.usd > 0 && <span className="tag t-dollar">{s.payment.usd}$</span>}
                        {s.payment.debt > 0 && <span className="tag t-nasiya">nasiya</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && settings && (
        <div className="modal-bg" onMouseDown={() => setOpen(null)}>
          <BackClose onClose={() => setOpen(null)} />
          <div className="modal receipt-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="print-area"><Receipt sale={open} settings={settings} /></div>
            {open.archivedAt && (
              <p className="archived-note">
                Arxivlangan: {when(open.archivedAt)}
                {open.archivedBy && <> · {open.archivedBy}</>}
                {open.archiveReason && <><br />Sabab: {open.archiveReason}</>}
              </p>
            )}
            {open.returns?.map((r) => (
              <p key={r.id} className="return-note">
                ↩️ Qaytarildi {when(r.at)}{r.by && <> · {r.by}</>}: {r.lines.map((l) => l.name).join(', ')} — <b>{formatSum(r.amount)}</b>
                {r.debtCut > 0 && <> (nasiyadan {formatSum(r.debtCut)})</>}
                {r.reason && <><br />Sabab: {r.reason}</>}
              </p>
            ))}
            {mode === 'return' && !open.archivedAt && (() => {
              const all = picked.size === open.lines.length
              const prev = picked.size ? applyReturn(open, [...picked], { id: '', at: '', by: '', reason: '' }).ret : null
              const toggle = (i: number) => setPicked((x) => {
                const n = new Set(x)
                if (n.has(i)) n.delete(i)
                else n.add(i)
                return n
              })
              return (
                <div className="return-panel">
                  <div className="return-head">
                    <b>Qaysi tovarlar qaytadi?</b>
                    <button className="link small" onClick={() => setPicked(all ? new Set() : new Set(open.lines.map((_, i) => i)))}>{all ? 'Hech qaysi' : 'Hammasi'}</button>
                  </div>
                  <div className="return-lines">
                    {open.lines.map((l, i) => (
                      <label key={i} className={`return-line${picked.has(i) ? ' on' : ''}`}>
                        <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} />
                        <span className="grow">{l.brand} · <b>{l.name}</b><span className="muted small"> · {l.pairs} juft</span></span>
                        <span className="num">{formatSum(l.total)}</span>
                      </label>
                    ))}
                  </div>
                  <input className="input" placeholder="Sabab (masalan: adashib urilgan, razmer to'g'ri kelmadi)" value={reason} onChange={(e) => setReason(e.target.value)} />
                  {prev && (
                    <p className="muted small">
                      Omborga qaytadi: <b>{prev.lines.length} pachka</b> · chekdan ayiriladi: <b>{formatSum(prev.amount)}</b>
                      {prev.debtCut > 0 && <> · nasiyadan: <b>{formatSum(prev.debtCut)}</b></>}
                      {prev.refund > 0 && <> · <span className="danger-text">mijozga qaytariladigan pul: <b>{formatSum(prev.refund)}</b></span></>}
                      {all && <><br />Hammasi tanlandi — chek butunlay bekor qilinib, "Arxiv"ga o'tadi.</>}
                    </p>
                  )}
                </div>
              )
            })()}
            {confirm && !open.archivedAt && (
              <div className="archive-confirm">
                <input
                  className="input"
                  autoFocus
                  placeholder="Sabab (masalan: sinov, xato urilgan)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !busy) run(() => archiveSale(open.id, reason)) }}
                />
                <p className="muted small">
                  Chek №{open.number} arxivga o'tadi: tovarlar omborga qaytadi, hisobotdan chiqadi
                  {open.payment.debt > 0 ? ', nasiya daftardan olinadi' : ''}. Chek o'chmaydi — "Arxiv"da kim va qachon arxivlagani ko'rinib turadi.
                </p>
              </div>
            )}
            <div className="modal-actions">
              {open.archivedAt ? (
                <button className="btn ghost" disabled={busy} onClick={() => run(() => restoreSale(open.id))} title="Sotuv yana hisobotga kiradi, tovar qoldig'i kamayadi">
                  {busy ? 'Qaytarilmoqda…' : 'Sotuvga qaytarish'}
                </button>
              ) : confirm ? (
                <>
                  <button className="btn ghost" disabled={busy} onClick={() => setMode('none')}>Bekor</button>
                  <button className="btn danger" disabled={busy} onClick={() => run(() => archiveSale(open.id, reason))}>
                    {busy ? 'Arxivlanmoqda…' : 'Ha, arxivlash'}
                  </button>
                </>
              ) : mode === 'return' ? (
                <>
                  <button className="btn ghost" disabled={busy} onClick={() => { setMode('none'); setPicked(new Set()) }}>Bekor</button>
                  <button className="btn danger" disabled={busy || !picked.size} onClick={() => run(async () => { await returnSaleLines(open.id, [...picked], reason) })}>
                    {busy ? 'Qaytarilmoqda…' : `↩️ Qaytarish${picked.size ? ` · ${picked.size} pachka` : ''}`}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn ghost" onClick={() => setMode('return')} title="Tanlangan tovarlar omborga qaytadi, chek summasi kamayadi">
                    ↩️ Qaytarish
                  </button>
                  <button className="btn ghost danger-text" onClick={() => setMode('archive')} title="Butun chek bekor bo'ladi: tovarlar omborga qaytadi, chek arxivda saqlanadi">
                    Arxivlash
                  </button>
                </>
              )}
              {mode === 'none' && <button className="btn ghost" onClick={() => window.print()}>Chek chiqarish</button>}
              {mode === 'none' && <button className="btn primary grow" onClick={() => setOpen(null)}>Yopish</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
