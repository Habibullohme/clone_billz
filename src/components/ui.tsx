import { useState, type ReactNode } from 'react'
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
