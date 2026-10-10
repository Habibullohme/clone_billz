import { useEffect, useRef, useState } from 'react'
import { useBackClose } from '../lib/nav'
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
  customerPhone: string
  onPhoneChange: (phone: string) => void
  onCancel: () => void
  onConfirm: (payment: Payment, change: number, usdRate: number) => void | Promise<void>
}

const num = (s: string) => {
  const v = parseSum(s)
  return Number.isFinite(v) ? v : 0
}

export function PaymentModal({ total, usdRate: initialRate, customerName, onCustomerChange, customerPhone, onPhoneChange, onCancel, onConfirm }: Props) {
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
  const hasDebt = num(debt) > 0
  const debtNeedsName = hasDebt && !customerName.trim()
  // Nasiyada telefon ham shart (kamida 9 raqam).
  const debtNeedsPhone = hasDebt && customerPhone.replace(/\D/g, '').length < 9
  const blocked = s.short > 0 || debtNeedsName || debtNeedsPhone

  /** Tez tanlash: butun summa bitta usulda. */
  const allTo = (kind: 'cash' | 'card' | 'debt') => {
    setUsd('')
    setCash(null)
    setCard(kind === 'card' ? String(total) : '')
    setDebt(kind === 'debt' ? String(total) : '')
    if (kind === 'debt') setTimeout(() => document.getElementById('pay-customer')?.focus(), 30)
  }
  const mode = !usdAmount && !num(card) && !num(debt) ? 'cash' : num(card) === total && !num(debt) && !usdAmount ? 'card' : num(debt) === total && !num(card) && !usdAmount ? 'debt' : null

  const confirm = () => {
    if (blocked || sent.current) return
    sent.current = true
    // Ikki marta bosilsa ham sotuv bir marta yoziladi. Saqlanmasa (internet) — qayta bosish mumkin.
    Promise.resolve(onConfirm({ cash: s.cash, usd: usdAmount, usdRate, card: num(card), debt: num(debt) }, s.change, usdRate))
      .finally(() => (sent.current = false))
  }

  useBackClose(onCancel)

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

        <div className="pay-quick" role="group" aria-label="Tez tanlash">
          <button type="button" className={`pq pq-naqd${mode === 'cash' ? ' on' : ''}`} onClick={() => allTo('cash')}>Hammasi naqd</button>
          <button type="button" className={`pq pq-karta${mode === 'card' ? ' on' : ''}`} onClick={() => allTo('card')}>Hammasi kartaga</button>
          <button type="button" className={`pq pq-nasiya${mode === 'debt' ? ' on' : ''}`} onClick={() => allTo('debt')}>Hammasi nasiyaga</button>
        </div>

        <div className="pay-grid">
          <label className="pay-field">
            <span className="pm pm-naqd">Naqd</span>
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
            <span className="pm pm-karta">Karta</span>
            <MoneyInput value={card} placeholder="0" onChange={setCard} />
          </label>

          <div className="pay-field">
            <span className="pm pm-dollar">Dollar</span>
            <div className="usd">
              <input className="input" inputMode="decimal" value={usd} placeholder="0 $" onChange={(e) => setUsd(e.target.value)} />
              <span className="muted">×</span>
              <input className="input rate" inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Kurs" />
            </div>
            <small className="muted">{usdAmount ? `= ${formatSum(Math.round(usdAmount * usdRate))} so'm` : 'kurs o\'zgarsa eslab qolinadi'}</small>
          </div>

          <label className="pay-field">
            <span className="pm pm-nasiya">Nasiya</span>
            <MoneyInput value={debt} placeholder="0" onChange={setDebt} />
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
        {hasDebt && (
          <div className="pay-debtor">
            <div className="pay-field">
              <span>Kimga nasiya{debtNeedsName && <b className="error"> · ism kerak</b>}</span>
              <CustomerInput
                id="pay-customer"
                value={customerName}
                onChange={onCustomerChange}
                onPick={(c) => c.phone && onPhoneChange(c.phone)}
                onEnter={() => document.getElementById('pay-phone')?.focus()}
              />
            </div>
            <label className="pay-field">
              <span>Telefon{debtNeedsPhone && <b className="error"> · raqam kerak</b>}</span>
              <input
                id="pay-phone"
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="+998 90 123 45 67"
                value={customerPhone}
                onChange={(e) => onPhoneChange(e.target.value.replace(/[^\d+\s()-]/g, ''))}
              />
            </label>
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
