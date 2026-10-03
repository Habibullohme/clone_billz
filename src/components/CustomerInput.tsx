import { useEffect, useState } from 'react'
import type { Customer } from '../types'
import { getCustomers, matchCustomers } from '../data/store'

interface Props {
  value: string
  onChange: (name: string) => void
}

/** Faqat ism yoziladi. Avval yozilgan ismlar avtomatik taklif qilinadi. */
export function CustomerInput({ value, onChange }: Props) {
  const [all, setAll] = useState<Customer[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  useEffect(() => {
    getCustomers().then(setAll)
  }, [value === ''])

  const matches = matchCustomers(all, value).filter((c) => c.name !== value)

  const pick = (c: Customer) => {
    onChange(c.name)
    setOpen(false)
  }

  return (
    <div className="ac">
      <input
        className="input"
        placeholder="Mijoz ismi, masalan: Alisher aka Qarshi"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, matches.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (matches[active]) {
              e.preventDefault()
              pick(matches[active])
            }
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
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
