import { useEffect, useState } from 'react'
import type { Sale } from '../types'
import { deleteSale, getSales, getSettings, type Settings } from '../data/store'
import { formatSum } from '../lib/money'
import { Receipt } from '../components/Receipt'
import { BackClose, Segmented } from '../components/ui'
import { hueStyle } from '../lib/colors'

type Period = 'today' | 'yesterday' | 'week' | 'month'

function inPeriod(iso: string, period: Period): boolean {
  const d = new Date(iso)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (period === 'today') return d >= start
  if (period === 'yesterday') {
    const y = new Date(start)
    y.setDate(y.getDate() - 1)
    return d >= y && d < start
  }
  const from = new Date(start)
  from.setDate(from.getDate() - (period === 'week' ? 6 : 29))
  return d >= from
}

export function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [open, setOpenRaw] = useState<Sale | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const setOpen = (s: Sale | null) => {
    setOpenRaw(s)
    setConfirmDel(false)
  }
  const [period, setPeriod] = useState<Period>('today')

  useEffect(() => {
    getSales().then(setSales)
    getSettings().then(setSettings)
  }, [])

  const list = sales.filter((s) => inPeriod(s.createdAt, period))
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
        <Segmented<Period>
          value={period}
          onChange={setPeriod}
          options={[['today', 'Bugun'], ['yesterday', 'Kecha'], ['week', '7 kun'], ['month', '30 kun']]}
        />
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
        <h2>Cheklar</h2>
        {list.length === 0 ? (
          <p className="muted">Bu davrda sotuv yo'q.</p>
        ) : (
          <div className="table-wrap">
            <table className="table clickable">
              <thead><tr><th>№</th><th>Vaqt</th><th>Mijoz</th><th className="num">Summa</th><th className="num">Foyda</th><th>To'lov</th></tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} onClick={() => setOpen(s)}>
                    <td className="muted">{s.number}</td>
                    <td>{new Date(s.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{s.customerName || <span className="muted">—</span>}</td>
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
            <div className="modal-actions">
              {confirmDel ? (
                <button
                  className="btn danger"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true)
                    try {
                      await deleteSale(open.id)
                      setSales(await getSales())
                      setOpen(null)
                    } finally {
                      setDeleting(false)
                      setConfirmDel(false)
                    }
                  }}
                >
                  {deleting ? "O'chirilmoqda…" : "Ha, o'chirish"}
                </button>
              ) : (
                <button className="btn ghost danger-text" onClick={() => setConfirmDel(true)} title="Tovarlar omborga qaytadi, nasiya daftardan olinadi">
                  Sotuvni o'chirish
                </button>
              )}
              <button className="btn ghost" onClick={() => window.print()}>Chek chiqarish</button>
              <button className="btn primary grow" onClick={() => setOpen(null)}>Yopish</button>
            </div>
            {confirmDel && <p className="muted small">Chek №{open.number} o'chiriladi: tovarlar omborga qaytadi, hisobotdan chiqadi{open.payment.debt > 0 ? ', nasiya daftardan olinadi' : ''}.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
