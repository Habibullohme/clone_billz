import { useEffect, useMemo, useRef, useState } from 'react'
import type { Product } from '../types'
import { codeOf, getProducts, searchProducts } from '../data/store'
import { attachPhoto, postedProducts } from '../data/cloud'
import { CameraScanner } from '../components/CameraScanner'
import { compressImage } from '../lib/image'
import { formatSum } from '../lib/money'
import { hueStyle } from '../lib/colors'
import { useBackClose } from '../lib/nav'

/** Bir model: brend, nom (kodsiz), razmer, rang, narx bir xil pachkalar. */
const modelKey = (p: Product) => {
  const code = codeOf(p.name)
  const base = (code ? p.name.slice(0, -code.length) : p.name).trim().toLowerCase()
  return [p.brand.trim().toLowerCase(), base, p.size.trim(), p.color.trim().toLowerCase(), p.salePrice].join('|')
}

/**
 * Qo'ldagi tovarga rasm: etiketkani skaner qilasiz (yoki qidirasiz) → rasmga olasiz → kanalga post bo'lib chiqadi.
 * Kanalda bor bo'lsa — postdagi rasm almashtiriladi. Shu modelning boshqa pachkalarini ham bitta postga qo'shsa bo'ladi.
 */
export function PhotoSheet({ onClose }: { onClose: () => void }) {
  useBackClose(onClose)
  const [products, setProducts] = useState<Product[]>([])
  const [posted, setPosted] = useState<Map<string, number>>(new Map())
  const [q, setQ] = useState('')
  const [scan, setScan] = useState(false)
  const [current, setCurrent] = useState<Product | null>(null)
  const [extra, setExtra] = useState<Set<string>>(new Set())
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null)
  const [done, setDone] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const reload = async () => {
    setProducts(await getProducts())
    setPosted(await postedProducts())
  }
  useEffect(() => {
    reload()
  }, [])

  const hits = q.trim() ? searchProducts(products.filter((p) => p.stock > 0), q, 12) : []
  const inPost = current ? posted.get(current.id) : undefined
  /** Shu modelning omborda bor, hali rasmsiz boshqa pachkalari. */
  const siblings = useMemo(() => {
    if (!current || inPost) return []
    const key = modelKey(current)
    return products
      .filter((p) => p.id !== current.id && p.stock > 0 && !posted.has(p.id) && modelKey(p) === key)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [current, products, posted, inPost])

  const pick = (p: Product | undefined, how: string) => {
    setNote(null)
    setPhoto(null)
    setExtra(new Set())
    if (!p) {
      setCurrent(null)
      setNote({ text: `${how} — tovar topilmadi`, bad: true })
      return
    }
    setCurrent(p)
    setQ('')
  }

  const onScan = (code: string) => {
    setScan(false)
    pick(products.find((p) => p.barcode === code.trim()), `Shtrix-kod ${code}`)
  }

  const takePhoto = async (file: File | undefined) => {
    if (!file) return
    try {
      setPhoto(await compressImage(file))
    } catch (e) {
      setNote({ text: String((e as Error).message), bad: true })
    }
  }

  const send = async () => {
    if (!current || !photo || busy) return
    setBusy(true)
    setNote(null)
    const ids = inPost ? (await postedIdsOf(inPost)) : [current.id, ...extra]
    const r = await attachPhoto(ids, photo)
    setBusy(false)
    if (r.error) return setNote({ text: r.error, bad: true })
    setDone((n) => n + 1)
    setNote({ text: r.replaced ? '✅ Kanaldagi rasm almashtirildi' : `✅ Kanalga chiqdi — ${ids.length} pachka` })
    setCurrent(null)
    setPhoto(null)
    setExtra(new Set())
    await reload()
  }

  /** Almashtirishda — o'sha postdagi hamma tovarlar. */
  const postedIdsOf = async (postId: number) => [...posted].filter(([, id]) => id === postId).map(([pid]) => pid)

  const total = 1 + extra.size
  return (
    <>
    <div className="modal-bg sheet-bg" onMouseDown={onClose}>
      <div className="sheet photo-sheet" onMouseDown={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <div>
            <h2>📷 Rasm biriktirish</h2>
            <span className="muted small">Etiketkani skaner qiling → rasmga oling → kanalga chiqadi.{done > 0 && ` Bugun: ${done} ta`}</span>
          </div>
          <button className="icon" aria-label="Yopish" onClick={onClose}>✕</button>
        </header>

        <div className="photo-body">
          {note && <div className={`photo-note${note.bad ? ' bad' : ''}`}>{note.text}</div>}

          {!current && (
            <>
              <button className="btn primary big photo-scan" onClick={() => setScan(true)}>▦ Etiketkani skaner qilish</button>
              <div className="search">
                <input className="input" placeholder="yoki qidiring: model, kod (A23), shtrix-kod" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {hits.length > 0 && (
                <div className="photo-hits">
                  {hits.map((p) => (
                    <button key={p.id} className="photo-hit" style={hueStyle(p.brand)} onClick={() => pick(p, '')}>
                      <span><i className="dot" />{p.brand} · <b>{p.name}</b></span>
                      <span className="muted small">{[p.size, p.color, formatSum(p.salePrice)].filter(Boolean).join(' · ')}{posted.has(p.id) ? ' · 📣 kanalda' : ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {current && (
            <>
              <div className="photo-product" style={hueStyle(current.brand)}>
                <div>
                  <b><i className="dot" />{current.brand} · {current.name}</b>
                  <div className="muted small">{[current.size, current.color, `${current.packSize} juftlik`, `${formatSum(current.salePrice)} so'm`].filter(Boolean).join(' · ')}</div>
                </div>
                <span className={`tag ${inPost ? 'ok-tag' : ''}`}>{inPost ? '📣 kanalda bor' : "rasm yo'q"}</span>
              </div>

              {inPost && <p className="muted small">Bu tovar kanalda bor — yangi rasm bilan <b>postdagi rasm almashtiriladi</b> (matn o'zgarmaydi).</p>}

              {siblings.length > 0 && (
                <div className="photo-sibs">
                  <div className="photo-sibs-head">
                    <b>Shu modeldan yana {siblings.length} pachka (rasmsiz)</b>
                    <button className="link small" onClick={() => setExtra(extra.size === siblings.length ? new Set() : new Set(siblings.map((p) => p.id)))}>
                      {extra.size === siblings.length ? 'Hech qaysi' : 'Hammasi'}
                    </button>
                  </div>
                  <span className="muted small">Belgilanganlar shu rasm bilan bitta postda chiqadi ("Mavjud: N pachka").</span>
                  <div className="photo-sib-list">
                    {siblings.map((p) => (
                      <label key={p.id} className={`photo-sib${extra.has(p.id) ? ' on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={extra.has(p.id)}
                          onChange={() => setExtra((x) => {
                            const n = new Set(x)
                            if (n.has(p.id)) n.delete(p.id)
                            else n.add(p.id)
                            return n
                          })}
                        />
                        {codeOf(p.name) ?? p.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { takePhoto(e.target.files?.[0]); e.target.value = '' }} />
              {photo ? (
                <div className="photo-preview">
                  <img src={photo} alt="" />
                  <button className="btn ghost small" onClick={() => fileRef.current?.click()}>🔁 Qayta olish</button>
                </div>
              ) : (
                <button className="btn ghost big photo-take" onClick={() => fileRef.current?.click()}>📸 Rasmga olish</button>
              )}

              <div className="photo-actions">
                <button className="btn ghost" onClick={() => { setCurrent(null); setPhoto(null); setNote(null) }}>← Boshqa</button>
                <button className="btn primary grow" disabled={!photo || busy} onClick={send}>
                  {busy ? 'Yuborilmoqda…' : inPost ? '🔁 Rasmni almashtirish' : `📣 Kanalga${total > 1 ? ` · ${total} pachka` : ' joylash'}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    {scan && <CameraScanner onScan={onScan} onClose={() => setScan(false)} />}
    </>
  )
}
