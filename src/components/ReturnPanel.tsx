import { useState } from 'react'
import type { Sale } from '../types'
import { returnSaleLines } from '../data/store'
import { applyReturn } from '../lib/refund'
import { formatSum } from '../lib/money'

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Chekdagi qaytarishlar tarixi. */
export function ReturnNotes({ sale }: { sale: Sale }) {
  return (
    <>
      {sale.returns?.map((r) => (
        <p key={r.id} className="return-note">
          ↩️ Qaytarildi {when(r.at)}{r.by && <> · {r.by}</>}: {r.lines.map((l) => l.name).join(', ')} — <b>{formatSum(r.amount)}</b>
          {r.debtCut > 0 && <> (nasiyadan {formatSum(r.debtCut)})</>}
          {r.reason && <><br />Sabab: {r.reason}</>}
        </p>
      ))}
    </>
  )
}

/**
 * Chekdan tovar qaytarish: pachkalarni tanlash, sabab, oldindan hisob va tugmalar.
 * Hammasi tanlansa — chek butunlay bekor bo'lib arxivga o'tadi.
 */
export function ReturnPanel({ sale, onCancel, onDone }: { sale: Sale; onCancel: () => void; onDone: () => void }) {
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const all = picked.size === sale.lines.length
  const prev = picked.size ? applyReturn(sale, [...picked], { id: '', at: '', by: '', reason: '' }).ret : null
  const toggle = (i: number) => setPicked((x) => {
    const n = new Set(x)
    if (n.has(i)) n.delete(i)
    else n.add(i)
    return n
  })
  const submit = async () => {
    if (busy || !picked.size) return
    setBusy(true)
    try {
      await returnSaleLines(sale.id, [...picked], reason)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="return-panel">
        <div className="return-head">
          <b>Qaysi tovarlar qaytadi?</b>
          <button className="link small" onClick={() => setPicked(all ? new Set() : new Set(sale.lines.map((_, i) => i)))}>{all ? 'Hech qaysi' : 'Hammasi'}</button>
        </div>
        <div className="return-lines">
          {sale.lines.map((l, i) => (
            <label key={i} className={`return-line${picked.has(i) ? ' on' : ''}`}>
              <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} />
              <span className="grow">{l.brand} · <b>{l.name}</b><span className="muted small"> · {l.pairs} juft</span></span>
              <span className="num">{formatSum(l.total)}</span>
            </label>
          ))}
        </div>
        <input
          className="input"
          placeholder="Sabab (masalan: adashib urilgan, razmer to'g'ri kelmadi)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {prev && (
          <p className="muted small">
            Omborga qaytadi: <b>{prev.lines.length} pachka</b> · chekdan ayiriladi: <b>{formatSum(prev.amount)}</b>
            {prev.debtCut > 0 && <> · nasiyadan: <b>{formatSum(prev.debtCut)}</b></>}
            {prev.refund > 0 && <> · <span className="danger-text">mijozga qaytariladigan pul: <b>{formatSum(prev.refund)}</b></span></>}
            {all && <><br />Hammasi tanlandi — chek butunlay bekor qilinib, "Arxiv"ga o'tadi.</>}
          </p>
        )}
      </div>
      <div className="modal-actions">
        <button className="btn ghost" disabled={busy} onClick={onCancel}>Bekor</button>
        <button className="btn danger grow" disabled={busy || !picked.size} onClick={submit}>
          {busy ? 'Qaytarilmoqda…' : `↩️ Qaytarish${picked.size ? ` · ${picked.size} pachka` : ''}`}
        </button>
      </div>
    </>
  )
}
