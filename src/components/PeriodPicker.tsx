import { useState } from 'react'
import { Segmented } from './ui'
import { maskDate, parseDay, type Period } from '../lib/period'

type Preset = Exclude<Period, `d:${string}`>

/** Bugun / Kecha / 7 kun / 30 kun + istalgan kunni qo'lda yozish (kalendarsiz: kk.oo.yyyy). */
export function PeriodPicker({ value, onChange, month = true }: { value: Period; onChange: (p: Period) => void; month?: boolean }) {
  const [text, setText] = useState(() => (value.startsWith('d:') ? value.slice(2).split('-').reverse().join('.') : ''))
  const day = parseDay(text)
  const digits = text.replace(/\D/g, '').length
  const bad = (digits === 4 || digits === 8) && !day
  const presets: [Preset, string][] = [['today', 'Bugun'], ['yesterday', 'Kecha'], ['week', '7 kun']]
  if (month) presets.push(['month', '30 kun'])
  return (
    <div className="period">
      <Segmented<Preset | ''>
        value={value.startsWith('d:') ? '' : (value as Preset)}
        onChange={(v) => {
          if (!v) return
          setText('')
          onChange(v)
        }}
        options={presets}
      />
      <input
        className={`input period-day${value.startsWith('d:') ? ' on' : ''}${bad ? ' bad' : ''}`}
        inputMode="numeric"
        placeholder="kk.oo.yyyy"
        aria-label="Sana"
        value={text}
        onChange={(e) => {
          // O'chirayotganda nuqtani qayta qo'ymaymiz.
          const raw = e.target.value
          const next = raw.length < text.length ? raw : maskDate(raw)
          setText(next)
          const d = parseDay(next)
          // "05.10" — joriy yil, "05.10.2026" — to'liq (yarim yozilgan yil hisobga olinmaydi).
          const n = next.replace(/\D/g, '').length
          if (d && (n === 4 || n === 8)) onChange(`d:${d}`)
          else if (!next) onChange('today')
        }}
      />
    </div>
  )
}
