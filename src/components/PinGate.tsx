import { useEffect, useRef, useState } from 'react'
import { getSettings, saveSettings } from '../data/store'
import { Modal } from './ui'

/** Kassadan boshqa bo'limlarga o'tish uchun PIN. Birinchi marta — PIN yaratiladi. */
export function PinGate({ onOk, onCancel }: { onOk: () => void; onCancel: () => void }) {
  const [pin, setPin] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getSettings().then((s) => setPin(s.ownerPin))
  }, [])
  useEffect(() => ref.current?.focus(), [pin])

  if (pin === null) return null
  const creating = pin === ''

  const submit = async () => {
    if (creating) {
      if (!/^\d{4,6}$/.test(value)) return setError('PIN 4–6 ta raqamdan iborat bo\'lsin')
      if (value !== repeat) return setError('PIN kodlar bir xil emas')
      const s = await getSettings()
      await saveSettings({ ...s, ownerPin: value })
      onOk()
    } else if (value === pin) {
      onOk()
    } else {
      setError('PIN noto\'g\'ri')
      setValue('')
    }
  }

  return (
    <Modal title={creating ? 'PIN kod yarating' : 'PIN kodni kiriting'} onClose={onCancel}>
      <p className="muted small">
        {creating
          ? "Sotuvlar, tovarlar va sozlamalarga faqat siz kirishingiz uchun. Sotuvchi faqat kassani ko'radi."
          : 'Kassadan chiqish uchun egasining PIN kodi kerak.'}
      </p>
      <form
        className="pin-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          ref={ref}
          id="pin"
          className="input pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          placeholder="••••"
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/\D/g, ''))
            setError('')
          }}
        />
        {creating && (
          <input
            id="pin-repeat"
            className="input pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            placeholder="yana bir bor"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value.replace(/\D/g, ''))}
          />
        )}
        {error && <div className="error small">{error}</div>}
        <button className="btn primary" type="submit">{creating ? 'Saqlash va kirish' : 'Kirish'}</button>
      </form>
    </Modal>
  )
}
