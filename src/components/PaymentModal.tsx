import { useEffect, useRef, useState } from 'react'
import { formatSum, parseSum } from '../lib/money'
import { balancePayment } from '../lib/cart'
import type { Payment } from '../types'
import { CustomerInput } from './CustomerInput'
import { MoneyInput } from './ui'

interface Props {
  total: number
  usdRate: number
  customerName: string
  onCustomerChange: (name: string) => void
  onCancel: () => void
  onConfirm: (payment: Payment, change: number, usdRate: number) => void
}

const num = (s: string) => {
  const v = parseSum(s)
  return Number.isFinite(v) ? v : 0
}

export function PaymentModal({ total, usdRate: initialRate, customerName, onCustomerChange, onCancel, onConfirm }: Props) {
  const [cash, setCash] = useState<string | null>(null)
  const [usd, setUsd] = useState('')
  const [rate, setRate] = useState(String(initialRate))
  const [card, setCard] = useState('')
  const [debt, setDebt] = useState('')
  const firstRef = useRef<HTMLInputElement>(null)
  const sent = useRef(false)

  useEffect(() => firstRef.current?.focus(), [])

  const usdRate = num(rate)
  const usdAmount = parseFloat(usd.replace(',', '.')) || 0
  const s = balancePayment(total, {
    usd: usdAmount, usdRate, card: num(card), debt: num(debt),
    cashManual: cash === null ? null : num(cash),
  })
  const debtNeedsName = num(debt) > 0 && !customerName.trim()
  const blocked = s.short > 0 || debtNeedsName

  const confirm = () => {
    if (blocked || sent.current) return
    sent.current = true
    onConfirm({ cash: s.cash, usd: usdAmount, usdRate, card: num(card), debt: num(debt) }, s.change, usdRate)
  }

  /** Boshqa maydonlar to'ldirilgandan keyin qolgan summa. */
  const rest = (except: 'card' | 'debt') =>
    Math.max(0, total - Math.round(usdAmount * usdRate) - (except === 'card' ? num(debt) : num(card)))

  return (
    <div className="modal-bg" onMouseDown={onCancel}>
      <div
        className="modal pay-modal"
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
        <div className="pay-total">
          <span>To'lanadi</span>
          <b>{formatSum(total)}</b>
        </div>

        <div className="pay-grid">
          <label className="pay-field">
            <span>Naqd</span>
            <input
              ref={firstRef}
              className={`input${s.cashAuto ? ' auto' : ''}`}
              inputMode="numeric"
              value={cash ?? (s.cash ? formatSum(s.cash) : '')}
              placeholder="0"
              onFocus={(e) => e.target.select()}
              onChange={(e) => setCash(e.target.value)}
            />
            {s.cashAuto ? (
              <small className="muted">avtomatik · qolgani</small>
            ) : (
              <button className="link small" onClick={() => setCash(null)}>avtomatikka qaytarish</button>
            )}
          </label>

          <label className="pay-field">
            <span>Karta</span>
            <MoneyInput value={card} placeholder="0" onChange={setCard} />
            <button className="link small" onClick={() => { setCash(null); setCard(String(rest('card'))) }}>hammasi kartaga</button>
          </label>

          <div className="pay-field">
            <span>Dollar</span>
            <div className="usd">
              <input className="input" inputMode="decimal" value={usd} placeholder="0 $" onChange={(e) => setUsd(e.target.value)} />
              <span className="muted">×</span>
              <input className="input rate" inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Kurs" />
            </div>
            <small className="muted">{usdAmount ? `= ${formatSum(Math.round(usdAmount * usdRate))} so'm` : 'kurs o\'zgarsa eslab qolinadi'}</small>
          </div>

          <label className="pay-field">
            <span>Nasiya</span>
            <MoneyInput value={debt} placeholder="0" onChange={setDebt} />
            <button className="link small" onClick={() => { setCash(null); setDebt(String(rest('debt'))) }}>hammasi nasiyaga</button>
          </label>
        </div>

        {(s.change > 0 || s.short > 0) && (
          <div className={`pay-result ${s.short > 0 ? 'bad' : 'good'}`}>
            {s.short > 0 ? (
              <>
                <span>Yetmayapti</span>
                <b>{formatSum(s.short)}</b>
                <button className="btn ghost small" onClick={() => setDebt(String(num(debt) + s.short))}>Nasiyaga yozish</button>
              </>
            ) : (
              <>
                <span>Qaytim</span>
                <b>{formatSum(s.change)}</b>
              </>
            )}
          </div>
        )}
        {num(debt) > 0 && (
          <div className="pay-field">
            <span>Kimga nasiya{debtNeedsName && <b className="error"> · ism kerak</b>}</span>
            <CustomerInput value={customerName} onChange={onCustomerChange} />
          </div>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>Bekor</button>
          <button className="btn primary grow" onClick={confirm} disabled={blocked}>
            Sotuvni yakunlash <kbd>Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  )
}
