import { useEffect, useState } from 'react'
import { getSettings, saveSettings, type Settings } from '../data/store'

export function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    getSettings().then(setS)
  }, [])
  if (!s) return null

  const field = (key: keyof Settings, label: string, numeric = false) => (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        value={String(s[key])}
        inputMode={numeric ? 'numeric' : undefined}
        onChange={(e) => {
          setSaved(false)
          setS({ ...s, [key]: numeric ? Number(e.target.value.replace(/\D/g, '')) : e.target.value })
        }}
      />
    </label>
  )

  return (
    <div className="page narrow">
      <h1>Sozlamalar</h1>
      {field('shopName', "Do'kon nomi (chekda)")}
      {field('shopPhone', 'Telefon (chekda)')}
      {field('receiptFooter', 'Chek pastidagi matn')}
      {field('usdRate', 'Dollar kursi, so\'m', true)}
      <button
        className="btn primary"
        onClick={async () => {
          await saveSettings(s)
          setSaved(true)
        }}
      >
        Saqlash
      </button>
      {saved && <span className="ok"> Saqlandi</span>}
    </div>
  )
}
