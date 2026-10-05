import { useEffect, useState } from 'react'
import type { Customer } from '../types'
import { getCustomers, matchCustomers } from '../data/store'

interface Props {
  value: string
  onChange: (name: string) => void
  /** Ro'yxatdan tanlanganda (telefonini ham olish uchun). */
  onPick?: (c: Customer) => void
  /** Taklif tanlanmay Enter bosilsa. */
  onEnter?: () => void
  id?: string
  autoFocus?: boolean
}

/** Faqat ism yoziladi. Avval yozilgan ismlar avtomatik taklif qilinadi. */
export function CustomerInput({ value, onChange, onPick, onEnter, id, autoFocus }: Props) {
  const [all, setAll] = useState<Customer[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  useEffect(() => {
    getCustomers().then(setAll)
  }, [value === ''])

  const matches = matchCustomers(all, value).filter((c) => c.name !== value)

  const pick = (c: Customer) => {
    onChange(c.name)
    onPick?.(c)
    setOpen(false)
  }

  return (
    <div className="ac">
      <input
        id={id}
        className="input"
        placeholder="Mijoz ismi, masalan: Alisher aka Qarshi"
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          const list = open ? matches : []
          if (e.key === 'ArrowDown' && list.length) {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, list.length - 1))
          } else if (e.key === 'ArrowUp' && list.length) {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if ((e.key === 'Enter' || e.key === 'Tab') && list[active]) {
            e.preventDefault()
            pick(list[active])
          } else if (e.key === 'Enter' && onEnter) {
            e.preventDefault()
            setOpen(false)
            onEnter()
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul className="ac-list">
          {matches.map((c, i) => (
            <li
              key={c.id}
              className={i === active ? 'on' : ''}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(c)
              }}
            >
              <span>{c.name}</span>
              {c.phone && <span className="muted small">{c.phone}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
