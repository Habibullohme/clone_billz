import { useEffect, useRef, useState, type ReactNode } from 'react'
import type React from 'react'
import { formatSum, parseSum } from '../lib/money'

export function Toggle({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      className={`toggle${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

export function Segmented<T extends string | number>({
  value, options, onChange,
}: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={String(v)} role="radio" aria-checked={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function Modal({
  title, onClose, children, wide, center,
}: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; center?: boolean }) {
  return (
    <div className={`modal-bg${center ? ' center' : ''}`} onMouseDown={onClose}>
      <div
        className={`modal${wide ? ' wide' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Yopish">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Summa maydoni: yozayotganda oddiy raqam, chiqqanda "1 400 000" ko'rinishida. */
export function MoneyInput({
  value, onChange, className = 'input', ...rest
}: { value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [focused, setFocused] = useState(false)
  const n = parseSum(value)
  const shown = !focused && Number.isFinite(n) ? formatSum(n) : value
  return (
    <input
      {...rest}
      className={className}
      inputMode="numeric"
      value={shown}
      onFocus={(e) => {
        setFocused(true)
        rest.onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        rest.onBlur?.(e)
      }}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export const IconEdit = () => (
  <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
    <path d="M13.6 3.4a2 2 0 0 1 2.9 2.9L7 15.8l-3.6.8.8-3.6z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
)

export const IconTrash = () => (
  <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
    <path d="M4 6h12M8 6V4h4v2M6 6l.8 10h6.4L14 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export interface SelectOption<T extends string> {
  value: T
  label: ReactNode
  hint?: ReactNode
  /** Ro'yxat oxiridagi amal (masalan "+ Yangi brend"). */
  action?: boolean
}

/** Bezatilgan tanlash ro'yxati: ikki mavzuda ham bir xil ko'rinadi, klaviatura bilan ishlaydi. */
export function Select<T extends string>({
  id, value, options, onChange, placeholder = 'Tanlang',
}: { id?: string; value: T | ''; options: SelectOption<T>[]; onChange: (v: T) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const pick = (o: SelectOption<T>) => {
    onChange(o.value)
    setOpen(false)
  }

  return (
    <div className={`sel${open ? ' open' : ''}`} ref={ref}>
      <button
        id={id}
        type="button"
        className="sel-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (!open) return setOpen(true)
            setActive((a) => Math.min(options.length - 1, Math.max(0, a + (e.key === 'ArrowDown' ? 1 : -1))))
          } else if (e.key === 'Enter' && open) {
            e.preventDefault()
            if (options[active]) pick(options[active])
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      >
        <span className={current ? '' : 'sel-ph'}>{current?.label ?? placeholder}</span>
        <svg className="sel-chev" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="sel-list" role="listbox">
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`${i === active ? 'act' : ''}${o.value === value ? ' cur' : ''}${o.action ? ' action' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(o)
              }}
            >
              <span className="sel-label">{o.label}</span>
              {o.hint && <span className="sel-hint">{o.hint}</span>}
              {o.value === value && (
                <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" className="sel-tick">
                  <path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
