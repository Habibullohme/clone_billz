import { useEffect, useState } from 'react'
import { getSettings, saveSettings } from '../data/store'
import { useBackClose } from '../lib/nav'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'] as const

/**
 * Kassadan boshqa bo'limlarga o'tish uchun PIN. Birinchi marta — PIN yaratiladi.
 * Parol maydoni ishlatilmaydi — brauzer "parolni saqlaysizmi?" deb so'ramaydi.
 */
export function PinGate({ onOk, onCancel }: { onOk: () => void; onCancel: () => void }) {
  const [pin, setPin] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [first, setFirst] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)
  useBackClose(onCancel)

  useEffect(() => {
    getSettings().then((s) => setPin(s.ownerPin))
  }, [])

  const creating = pin === ''
  const length = creating ? Math.max(4, value.length) : (pin?.length ?? 4)

  const fail = (msg: string) => {
    setError(msg)
    setValue('')
    setShake((n) => n + 1)
    navigator.vibrate?.(120)
  }

  const submit = async (v: string) => {
    if (!creating) return v === pin ? onOk() : fail("PIN noto'g'ri")
    if (v.length < 4) return fail('Kamida 4 ta raqam')
    if (first === null) {
      setFirst(v)
      setValue('')
      setError('')
      return
    }
    if (v !== first) {
      setFirst(null)
      return fail('PIN kodlar bir xil emas — qaytadan')
    }
    const s = await getSettings()
    await saveSettings({ ...s, ownerPin: v })
    onOk()
  }

  const press = (k: (typeof KEYS)[number]) => {
    if (k === 'back') return setValue((v) => v.slice(0, -1))
    if (k === 'ok') return submit(value)
    if (value.length >= 6) return
    const v = value + k
    setValue(v)
    setError('')
    // To'liq terilishi bilan o'zi tekshiriladi.
    if (!creating && pin && v.length === pin.length) setTimeout(() => submit(v), 120)
  }

  // Klaviaturadan ham terish mumkin.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number])
      else if (e.key === 'Backspace') press('back')
      else if (e.key === 'Enter') press('ok')
      else if (e.key === 'Escape') onCancel()
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  })

  if (pin === null) return null

  return (
    <div className="modal-bg center pin-bg" onMouseDown={onCancel}>
      <div className="pin-card" role="dialog" aria-label="PIN kod" onMouseDown={(e) => e.stopPropagation()}>
        <button className="icon pin-x" onClick={onCancel} aria-label="Yopish">✕</button>
        <div className="pin-lock" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26"><path d="M7 10V7a5 5 0 0 1 10 0v3M5.5 10h13v10h-13z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>
        </div>
        <h2>{creating ? (first === null ? 'PIN kod yarating' : 'PIN kodni takrorlang') : 'PIN kodni kiriting'}</h2>
        <p className="muted small">
          {creating ? '4–6 ta raqam. Sotuvchi faqat kassani ko\'radi.' : "Boshqaruv bo'limlari uchun egasining PIN kodi"}
        </p>
        <div key={shake} className={`pin-dots${error ? ' bad' : ''}${shake ? ' shake' : ''}`} aria-live="polite">
          {Array.from({ length }, (_, i) => <span key={i} className={i < value.length ? 'on' : ''} />)}
        </div>
        <div className="pin-msg">{error}</div>
        <div className="pin-pad">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`pin-key${k === 'ok' ? ' ok' : ''}${k === 'back' ? ' back' : ''}`}
              onClick={() => press(k)}
              disabled={k === 'ok' && value.length < 4}
              aria-label={k === 'back' ? "O'chirish" : k === 'ok' ? 'Tasdiqlash' : k}
            >
              {k === 'back' ? '⌫' : k === 'ok' ? '✓' : k}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
