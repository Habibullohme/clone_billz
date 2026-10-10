import { useEffect, useState } from 'react'
import type { Sale } from '../types'
import { activeSales, getSales, type Settings } from '../data/store'
import { Receipt } from './Receipt'
import { BackClose } from './ui'
import { PeriodPicker } from './PeriodPicker'
import { inPeriod, type Period } from '../lib/period'

/**
 * Kassadagi "Cheklar": mijozga eski chekni ko'rsatish yoki qayta chiqarish uchun.
 * Ro'yxatda summa yo'q (chek ochilganda ko'rinadi). Tushum, foyda, arxivlash yo'q (ular Sotuvlar bo'limida, PIN bilan).
 */
export function ReceiptsModal({ settings, onClose }: { settings: Settings; onClose: () => void }) {
  const [sales, setSales] = useState<Sale[]>([])
  const [day, setDay] = useState<Period>('today')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Sale | null>(null)

  useEffect(() => {
    getSales().then((l) => setSales(activeSales(l)))
  }, [])

  const query = q.trim().toLowerCase()
  const list = query
    ? sales.filter((s) => String(s.number).includes(query) || s.customerName.toLowerCase().includes(query)).slice(0, 100)
    : sales.filter((s) => inPeriod(s.createdAt, day))
  const when = (iso: string) =>
    new Date(iso).toLocaleString('ru-RU', (day === 'today' || day.startsWith('d:')) && !query
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  if (open)
    return (
      <div className="modal-bg" onMouseDown={() => setOpen(null)}>
        <BackClose onClose={() => setOpen(null)} />
        <div className="modal receipt-modal" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && setOpen(null)}>
          <div className="print-area"><Receipt sale={open} settings={settings} /></div>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setOpen(null)}>← Cheklar</button>
            <button className="btn primary" onClick={() => window.print()}>Chek chiqarish</button>
          </div>
        </div>
      </div>
    )

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <BackClose onClose={onClose} />
      <div className="modal receipts-modal" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="receipts-head">
          <h2>Cheklar</h2>
          <button className="btn ghost small" onClick={onClose}>Yopish <kbd>Esc</kbd></button>
        </div>
        <input className="input" autoFocus placeholder="Chek № yoki mijoz ismi" value={q} onChange={(e) => setQ(e.target.value)} />
        {!query && (
          <PeriodPicker value={day} onChange={setDay} month={false} />
        )}
        <div className="receipts-list">
          {list.length === 0 ? (
            <p className="muted">Chek topilmadi.</p>
          ) : (
            list.map((s) => (
              <button key={s.id} className="receipt-item" onClick={() => setOpen(s)}>
                <span className="muted">№{s.number}</span>
                <span className="ri-name">{s.customerName || <span className="muted">Mijozsiz</span>}</span>
                <span className="muted small">{when(s.createdAt)}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
