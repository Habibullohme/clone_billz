import { useEffect, useState } from 'react'
import { getSettings, saveSettings } from '../data/store'
import { useBackClose } from '../lib/nav'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'] as const

/**
 * Shaxsiy PIN (kuzatuvchi hisob): bazada saqlanadi va bot (server) tekshiradi.
 * Xato bo'lsa — xabar matni, to'g'ri bo'lsa — null.
 */
export interface PinBackend {
  hasPin(): Promise<boolean>
  check(pin: string): Promise<string | null>
  create(pin: string): Promise<string | null>
}

type Mode = 'local' | 'check' | 'create'

/**
 * PIN oynasi. Odatda — do'konning PIN kodi (kassadan boshqa bo'limlar uchun); birinchi marta yaratiladi.
 * `backend` berilsa — hisobning shaxsiy PIN kodi (birinchi kirishda o'zi yaratadi).
 * Parol maydoni ishlatilmaydi — brauzer "parolni saqlaysizmi?" deb so'ramaydi.
 */
export function PinGate({ onOk, onCancel, backend }: { onOk: () => void; onCancel: () => void; backend?: PinBackend }) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [pin, setPin] = useState('')
  const [value, setValue] = useState('')
  const [first, setFirst] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)
  useBackClose(onCancel)

  useEffect(() => {
    if (backend) backend.hasPin().then((h) => setMode(h ? 'check' : 'create')).catch(() => setError("Internetga ulanib bo'lmadi"))
    else getSettings().then((s) => {
      setPin(s.ownerPin)
      setMode(s.ownerPin ? 'local' : 'create')
    })
  }, [])

  const creating = mode === 'create'
  const length = mode === 'local' ? pin.length : Math.max(4, value.length)

  const fail = (msg: string) => {
    setError(msg)
    setValue('')
    setShake((n) => n + 1)
    navigator.vibrate?.(120)
  }

  const submit = async (v: string) => {
    if (busy) return
    if (mode === 'local') return v === pin ? onOk() : fail("PIN noto'g'ri")
    if (v.length < 4) return fail('Kamida 4 ta raqam')
    if (mode === 'check') {
      setBusy(true)
      const err = await backend!.check(v).catch(() => "Internetga ulanib bo'lmadi")
      setBusy(false)
      return err ? fail(err) : onOk()
    }
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
    if (backend) {
      setBusy(true)
      const err = await backend.create(v).catch(() => "Internetga ulanib bo'lmadi")
      setBusy(false)
      if (err) {
        setFirst(null)
        return fail(err)
      }
    } else {
      const s = await getSettings()
      await saveSettings({ ...s, ownerPin: v })
    }
    onOk()
  }

  const press = (k: (typeof KEYS)[number]) => {
    if (k === 'back') return setValue((v) => v.slice(0, -1))
    if (k === 'ok') return submit(value)
    if (value.length >= 6) return
    const v = value + k
    setValue(v)
    setError('')
    // Do'kon PIN kodi: to'liq terilishi bilan o'zi tekshiriladi.
    if (mode === 'local' && pin && v.length === pin.length) setTimeout(() => submit(v), 120)
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

  if (mode === null && !error) return null

  const title = creating ? (first === null ? 'PIN kod yarating' : 'PIN kodni takrorlang') : 'PIN kodni kiriting'
  const hint = backend
    ? creating ? "4–6 ta raqam. Keyin botda /changepass bilan o'zgartirasiz." : 'Shaxsiy PIN kodingiz'
    : creating ? "4–6 ta raqam. Sotuvchi faqat kassani ko'radi." : "Boshqaruv bo'limlari uchun egasining PIN kodi"

  return (
    <div className="modal-bg center pin-bg" onMouseDown={onCancel}>
      <div className="pin-card" role="dialog" aria-label="PIN kod" onMouseDown={(e) => e.stopPropagation()}>
        <button className="icon pin-x" onClick={onCancel} aria-label="Yopish">✕</button>
        <div className="pin-lock" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26"><path d="M7 10V7a5 5 0 0 1 10 0v3M5.5 10h13v10h-13z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>
        </div>
        <h2>{title}</h2>
        <p className="muted small">{hint}</p>
        <div key={shake} className={`pin-dots${error ? ' bad' : ''}${shake ? ' shake' : ''}`} aria-live="polite">
          {Array.from({ length }, (_, i) => <span key={i} className={i < value.length ? 'on' : ''} />)}
        </div>
        <div className="pin-msg">{busy ? 'Tekshirilmoqda…' : error}</div>
        <div className="pin-pad">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`pin-key${k === 'ok' ? ' ok' : ''}${k === 'back' ? ' back' : ''}`}
              onClick={() => press(k)}
              disabled={busy || (k === 'ok' && value.length < 4)}
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
