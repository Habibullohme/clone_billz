import { useEffect, useState } from 'react'
import type { Sale } from '../types'
import { getSales, getSettings, type Settings } from '../data/store'
import { formatSum } from '../lib/money'
import { Receipt } from '../components/Receipt'

const sameDay = (iso: string, d: Date) => new Date(iso).toDateString() === d.toDateString()

export function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [open, setOpen] = useState<Sale | null>(null)

  useEffect(() => {
    getSales().then(setSales)
    getSettings().then(setSettings)
  }, [])

  const today = sales.filter((s) => sameDay(s.createdAt, new Date()))
  const sum = (f: (s: Sale) => number) => today.reduce((a, s) => a + f(s), 0)
  const usd = sum((s) => s.payment.usd)

  const byBrand = new Map<string, { pairs: number; total: number; profit: number }>()
  for (const s of today)
    for (const l of s.lines) {
      const b = byBrand.get(l.brand) ?? { pairs: 0, total: 0, profit: 0 }
      b.pairs += l.pairs
      b.total += l.total
      b.profit += l.total - l.costPrice * l.pairs
      byBrand.set(l.brand, b)
    }

  return (
    <div className="page">
      <h1>Bugungi sotuvlar</h1>
      <div className="stats">
        <div className="stat"><span>Tushum</span><b>{formatSum(sum((s) => s.total))}</b></div>
        <div className="stat"><span>Foyda</span><b>{formatSum(sum((s) => s.profit))}</b></div>
        <div className="stat"><span>Sotuvlar</span><b>{today.length}</b></div>
        <div className="stat"><span>Juft</span><b>{sum((s) => s.lines.reduce((a, l) => a + l.pairs, 0))}</b></div>
        <div className="stat"><span>Naqd so'm</span><b>{formatSum(sum((s) => s.payment.cash - s.change))}</b></div>
        <div className="stat"><span>Dollar</span><b>{usd} $</b></div>
        <div className="stat"><span>Karta</span><b>{formatSum(sum((s) => s.payment.card))}</b></div>
        <div className="stat"><span>Nasiya</span><b>{formatSum(sum((s) => s.payment.debt))}</b></div>
      </div>

      {byBrand.size > 0 && (
        <>
          <h2>Brendlar bo'yicha</h2>
          <table className="table">
            <thead><tr><th>Brend</th><th>Juft</th><th>Tushum</th><th>Foyda</th></tr></thead>
            <tbody>
              {[...byBrand].sort((a, b) => b[1].total - a[1].total).map(([brand, b]) => (
                <tr key={brand}><td>{brand}</td><td>{b.pairs}</td><td>{formatSum(b.total)}</td><td>{formatSum(b.profit)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>Barcha sotuvlar</h2>
      {sales.length === 0 ? (
        <p className="muted">Hali sotuv yo'q.</p>
      ) : (
        <table className="table clickable">
          <thead><tr><th>№</th><th>Vaqt</th><th>Mijoz</th><th>Tovar</th><th>Summa</th><th>Foyda</th><th>To'lov</th></tr></thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} onClick={() => setOpen(s)}>
                <td>{s.number}</td>
                <td>{new Date(s.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                <td>{s.customerName || '—'}</td>
                <td>{s.lines.reduce((a, l) => a + l.pairs, 0)} juft</td>
                <td>{formatSum(s.total)}</td>
                <td>{formatSum(s.profit)}</td>
                <td className="small">
                  {[s.payment.cash && 'naqd', s.payment.usd && `${s.payment.usd}$`, s.payment.card && 'karta', s.payment.debt && 'nasiya']
                    .filter(Boolean).join(' + ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open && settings && (
        <div className="modal-bg" onMouseDown={() => setOpen(null)}>
          <div className="modal receipt-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="print-area"><Receipt sale={open} settings={settings} /></div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => window.print()}>Chop etish</button>
              <button className="btn primary" onClick={() => setOpen(null)}>Yopish</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
