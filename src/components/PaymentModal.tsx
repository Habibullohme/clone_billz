import { useEffect, useRef, useState } from 'react'
import { formatSum, parseSum } from '../lib/money'
import { summarizePayment } from '../lib/cart'
import type { Payment } from '../types'

interface Props {
  total: number
  usdRate: number
  customerName: string
  onCancel: () => void
  onConfirm: (payment: Payment, change: number, usdRate: number) => void
}

const num = (s: string) => {
  const v = parseSum(s)
  return Number.isFinite(v) ? v : 0
}

export function PaymentModal({ total, usdRate: initialRate, customerName, onCancel, onConfirm }: Props) {
  const [cash, setCash] = useState('')
  const [usd, setUsd] = useState('')
  const [rate, setRate] = useState(String(initialRate))
  const [card, setCard] = useState('')
  const cashRef = useRef<HTMLInputElement>(null)

  useEffect(() => cashRef.current?.focus(), [])

  const usdRate = num(rate)
  const usdAmount = parseFloat(usd.replace(',', '.')) || 0
  const p = { cash: num(cash), usd: usdAmount, usdRate, card: num(card) }
  const s = summarizePayment(total, p)
  const debt = s.remaining
  const debtNeedsName = debt > 0 && !customerName.trim()
  const nothingPaid = s.paid === 0 && debt === total

  // "Qolganini shu yerga" — boshqa maydonlar to'ldirilgandan keyin qolgan summani qo'yadi.
  const restFor = (field: 'cash' | 'card') => {
    const other = field === 'cash' ? p.card : p.cash
    return Math.max(0, total - other - Math.round(p.usd * p.usdRate))
  }

  const sent = useRef(false)
  const confirm = () => {
    if (debtNeedsName || sent.current) return
    sent.current = true
    onConfirm({ ...p, debt }, s.change, usdRate)
  }

  return (
    <div className="modal-bg" onMouseDown={onCancel}>
      <div
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          if (e.key === 'Enter' && !e.defaultPrevented) {
            // Enter tugmani bosib yubormasin (aks holda keyingi oynadagi tugma ham bosiladi).
            e.preventDefault()
            confirm()
          }
        }}
      >
        <div className="modal-head">
          <h2>To'lov</h2>
          <div className="big">{formatSum(total)} so'm</div>
        </div>

        <label className="field">
          <span>💵 Naqd, so'm</span>
          <div className="with-btn">
            <input ref={cashRef} className="input" inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" />
            <button className="btn ghost" onClick={() => setCash(String(restFor('cash')))}>qolgani</button>
          </div>
        </label>

        <div className="field">
          <span>💲 Dollar</span>
          <div className="usd">
            <input className="input" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} placeholder="0 $" />
            <span className="muted">×</span>
            <input className="input rate" inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} title="Kurs" />
            <span className="muted">= {formatSum(Math.round(p.usd * p.usdRate))}</span>
          </div>
        </div>

        <label className="field">
          <span>💳 Karta, so'm</span>
          <div className="with-btn">
            <input className="input" inputMode="numeric" value={card} onChange={(e) => setCard(e.target.value)} placeholder="0" />
            <button className="btn ghost" onClick={() => setCard(String(restFor('card')))}>qolgani</button>
          </div>
        </label>

        <div className="pay-sum">
          <div><span>To'landi</span><b>{formatSum(s.paid)}</b></div>
          {s.change > 0 && (
            <div className="ok"><span>Qaytim</span><b>{formatSum(s.change)} so'm</b></div>
          )}
          {debt > 0 && (
            <div className="warn"><span>Nasiyaga</span><b>{formatSum(debt)} so'm</b></div>
          )}
        </div>
        {debtNeedsName && <p className="error">Nasiya uchun mijoz ismini yozing (o'ng tomonda).</p>}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>Bekor (Esc)</button>
          <button className="btn primary" onClick={confirm} disabled={debtNeedsName}>
            {nothingPaid ? "To'liq nasiyaga" : debt > 0 ? 'Saqlash (qisman nasiya)' : 'Saqlash'} · Enter
          </button>
        </div>
      </div>
    </div>
  )
}
