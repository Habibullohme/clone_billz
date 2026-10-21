import { useState } from 'react'
import type { Settings } from '../data/store'
import type { Origin } from '../lib/delivery'
import { brandKey } from '../lib/delivery'
import { formatSum, parseSum } from '../lib/money'
import { hueStyle } from '../lib/colors'
import { MoneyInput, Modal } from './ui'

const newId = () => Math.random().toString(36).slice(2, 9)

/**
 * "Yuk qayerdan keladi": shaharlar va karopka uchun yo'l kira, har brend — qaysi shahardan.
 * Kirimda shu brend tanlansa, tannarxga yo'l kira avtomatik qo'shiladi.
 */
export function OriginsSheet({
  settings, brands, onSave, onClose,
}: { settings: Settings; brands: string[]; onSave: (patch: Pick<Settings, 'origins' | 'brandOrigins'>) => Promise<void>; onClose: () => void }) {
  const [origins, setOrigins] = useState<(Origin & { draft: string })[]>(
    (settings.origins ?? []).map((o) => ({ ...o, draft: String(o.perBox || '') })),
  )
  const [map, setMap] = useState<Record<string, string>>({ ...(settings.brandOrigins ?? {}) })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const add = () => setOrigins((l) => [...l, { id: newId(), name: '', perBox: 0, draft: '' }])
  const patch = (id: string, p: Partial<Origin & { draft: string }>) => setOrigins((l) => l.map((o) => (o.id === id ? { ...o, ...p } : o)))
  const remove = (id: string) => {
    setOrigins((l) => l.filter((o) => o.id !== id))
    setMap((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== id)))
  }
  const pick = (brand: string, id: string) => setMap((m) => {
    const next = { ...m }
    if (next[brandKey(brand)] === id || !id) delete next[brandKey(brand)]
    else next[brandKey(brand)] = id
    return next
  })

  const save = async () => {
    const clean = origins.map((o) => ({ id: o.id, name: o.name.trim(), perBox: Math.max(0, parseSum(o.draft) || 0) }))
    if (clean.some((o) => !o.name)) return setError('Har shaharga nom yozing')
    const ids = new Set(clean.map((o) => o.id))
    setBusy(true)
    try {
      await onSave({ origins: clean, brandOrigins: Object.fromEntries(Object.entries(map).filter(([, v]) => ids.has(v))) })
      onClose()
    } catch {
      setError("Saqlanmadi — internetni tekshiring")
      setBusy(false)
    }
  }

  return (
    <Modal title="🚚 Yuk qayerdan keladi" onClose={onClose} wide>
      <p className="muted small og-hint">
        Shahar va <b>bir karopka</b> (pachka) uchun yo'l kirani yozing, keyin har brendga shaharini belgilang.
        Kirimda tannarxga o'zi qo'shiladi: masalan karopkasiga 10 000, pachkada 5 juft → har juftga +2 000.
      </p>

      <div className="og-cities">
        {origins.map((o) => (
          <div key={o.id} className="og-city">
            <span className="og-pin">📍</span>
            <input className="input" placeholder="Shahar, masalan Namangan" value={o.name} onChange={(e) => patch(o.id, { name: e.target.value })} />
            <div className="og-price">
              <MoneyInput value={o.draft} onChange={(v) => patch(o.id, { draft: v })} />
              <span className="muted small">so'm / karopka</span>
            </div>
            <button className="icon danger" aria-label="Shaharni o'chirish" onClick={() => remove(o.id)}>✕</button>
          </div>
        ))}
        <button className="og-add" onClick={add}>+ Shahar qo'shish</button>
      </div>

      {origins.length > 0 && brands.length > 0 && (
        <div className="og-brands">
          <h3>Brendlar</h3>
          {brands.map((b) => {
            const cur = map[brandKey(b)]
            return (
              <div key={b} className="og-brand" style={hueStyle(b)}>
                <span className="og-bname"><i className="dot" />{b}</span>
                <div className="og-chips">
                  {origins.map((o) => (
                    <button key={o.id} className={`og-chip${cur === o.id ? ' on' : ''}`} onClick={() => pick(b, o.id)}>
                      {o.name || '…'}
                      {cur === o.id && parseSum(o.draft) > 0 && <span> · {formatSum(parseSum(o.draft))}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {error && <div className="error small">{error}</div>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>Bekor</button>
        <span className="grow" />
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saqlanmoqda…' : 'Saqlash'}</button>
      </div>
    </Modal>
  )
}
