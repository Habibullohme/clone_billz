import { useEffect, useRef, useState, type ReactNode } from 'react'
import { addBrand, defaultSettings, getBrands, getProducts, getSettings, removeBrand, renameBrand, saveSettings, type Settings } from '../data/store'
import { formatSum } from '../lib/money'
import { Segmented, Toggle } from '../components/ui'
import { applyTheme, type Theme } from '../lib/theme'
import { Receipt } from '../components/Receipt'
import type { Sale } from '../types'
import { cloudEnabled, deviceId, listDevices, revokeDevice, signOutHere, signOutOthers, supabase, type Device } from '../data/cloud'

const sections = [
  ['shop', "Do'kon"],
  ['brands', 'Brendlar'],
  ['pos', 'Kassa'],
  ['receipt', 'Chek'],
  ['stock', 'Ombor'],
  ['security', 'PIN kod'],
  ...(cloudEnabled ? [['devices', 'Qurilmalar'] as const] : []),
  ['data', "Ma'lumotlar"],
] as const
type Section = (typeof sections)[number][0]

function Row({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <label htmlFor={id} className="set-text">
        <b>{title}</b>
        {hint && <span className="muted small">{hint}</span>}
      </label>
      <div className="set-control">{children}</div>
    </div>
  )
}

const sampleSale: Sale = {
  id: 'x', number: 128, createdAt: new Date().toISOString(), customerName: 'Alisher aka Qarshi', note: '',
  lines: [
    { productId: 'a', name: 'Nike Air 270', brand: 'Nike', barcode: '', packSize: 5, pairs: 10, price: 190_000, costPrice: 160_000, total: 1_900_000 },
    { productId: 'b', name: 'Velikan klassika', brand: 'Velikan', barcode: '', packSize: 3, pairs: 3, price: 215_000, costPrice: 180_000, total: 645_000 },
  ],
  subtotal: 2_545_000, discount: 45_000, total: 2_500_000, profit: 0,
  payment: { cash: 1_315_000, usd: 100, usdRate: 11_850, card: 0, debt: 0 }, change: 0,
}

export function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null)
  const [section, setSection] = useState<Section>('shop')
  const [saved, setSaved] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    getSettings().then(setS)
  }, [])
  if (!s) return null

  // O'zgarish darhol saqlanadi.
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const next = { ...s, [key]: value }
    setS(next)
    saveSettings(next)
    setSaved(true)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setSaved(false), 1500)
  }

  const text = (key: 'shopName' | 'shopPhone' | 'shopAddress' | 'receiptFooter', ph = '') => (
    <input id={`set-${key}`} className="input" value={s[key]} placeholder={ph} onChange={(e) => update(key, e.target.value)} />
  )
  const toggle = (key: 'receiptShowLogo' | 'receiptShowCustomer' | 'receiptShowPacks' | 'allowPriceEdit' | 'scanSound') => (
    <Toggle id={`set-${key}`} checked={s[key]} onChange={(v) => update(key, v)} />
  )

  return (
    <div className="page settings">
      <div className="page-head">
        <h1>Sozlamalar</h1>
        <span className={`saved${saved ? ' show' : ''}`}>Saqlandi</span>
      </div>

      <div className="settings-layout">
        <nav className="set-nav">
          {sections.map(([id, label]) => (
            <button key={id} className={section === id ? 'on' : ''} onClick={() => setSection(id)}>{label}</button>
          ))}
        </nav>

        <div className="set-body">
          {section === 'shop' && (
            <>
              <Row id="set-logo" title="Logotip" hint="Kassa tepasida va chekda chiqadi">
                <div className="logo-pick">
                  {s.shopLogo ? <img src={s.shopLogo} alt="" /> : <div className="shop-mark big">{(s.shopName || 'D')[0]}</div>}
                  <label className="btn ghost small">
                    Rasm tanlash
                    <input
                      id="set-logo"
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (f) update('shopLogo', await shrinkImage(f))
                        e.target.value = ''
                      }}
                    />
                  </label>
                  {s.shopLogo && <button className="link small" onClick={() => update('shopLogo', '')}>olib tashlash</button>}
                </div>
              </Row>
              <Row id="set-shopName" title="Do'kon nomi" hint="Kassa tepasida va chekda chiqadi">{text('shopName')}</Row>
              <Row id="set-shopAddress" title="Manzil" hint="Masalan: Abu Saxiy, 3-qator, 112-do'kon">{text('shopAddress')}</Row>
              <Row id="set-shopPhone" title="Telefon">{text('shopPhone', '+998 90 123 45 67')}</Row>
              <Row id="set-theme" title="Mavzu" hint="Avto — kompyuter yoki telefon sozlamasiga qarab">
                <Segmented<Theme>
                  value={s.theme}
                  onChange={(v) => {
                    update('theme', v)
                    applyTheme(v)
                  }}
                  options={[['auto', 'Avto'], ['light', "Yorug'"], ['dark', "Qorong'i"]]}
                />
              </Row>
              {cloudEnabled && <AccountRow />}
            </>
          )}

          {section === 'pos' && (
            <>
              <Row id="set-usdRate" title="Dollar kursi" hint="To'lovda kursni o'zgartirsangiz, shu yerda ham yangilanadi">
                <div className="with-suffix">
                  <input
                    id="set-usdRate"
                    className="input"
                    inputMode="numeric"
                    value={formatSum(s.usdRate)}
                    onChange={(e) => update('usdRate', Number(e.target.value.replace(/\D/g, '')) || 0)}
                  />
                  <span>so'm</span>
                </div>
              </Row>
              <Row id="set-allowPriceEdit" title="Sotuvda narxni o'zgartirish" hint="Savdolashganda narxni qatorning o'zida o'zgartirish">{toggle('allowPriceEdit')}</Row>
              <Row id="set-scanSound" title="Skaner ovozi" hint="Topilganda qisqa ovoz, topilmasa ikki marta past ovoz">{toggle('scanSound')}</Row>
              <Row id="set-roundSteps" title="Yaxlitlash tugmalari" hint="Yakuniy summa ostidagi tezkor tugmalar">
                <Segmented<string>
                  value={s.roundSteps.join(',')}
                  onChange={(v) => update('roundSteps', v.split(',').map(Number))}
                  options={[
                    ['1000,5000,10000', '1/5/10 ming'],
                    ['10000,50000,100000', '10/50/100 ming'],
                    ['50000,100000,500000', '50/100/500 ming'],
                  ]}
                />
              </Row>
            </>
          )}

          {section === 'receipt' && (
            <div className="set-split">
              <div>
                <Row id="set-receiptWidth" title="Chek kengligi" hint="Printeringiz lentasi. Boshqa o'lcham bo'lsa — mm da yozing">
                  <div className="width-pick">
                    <Segmented<number> value={s.receiptWidth} onChange={(v) => update('receiptWidth', v)} options={[[58, '58'], [80, '80']]} />
                    <div className="with-suffix">
                      <input
                        id="set-receiptWidth"
                        className="input"
                        type="number"
                        min={30}
                        max={120}
                        value={s.receiptWidth}
                        onChange={(e) => update('receiptWidth', Math.min(120, Math.max(30, Number(e.target.value) || 58)))}
                      />
                      <span>mm</span>
                    </div>
                  </div>
                </Row>
                <Row id="set-receiptShowLogo" title="Logotip">{toggle('receiptShowLogo')}</Row>
                <Row id="set-receiptShowCustomer" title="Mijoz ismi">{toggle('receiptShowCustomer')}</Row>
                <Row id="set-receiptShowPacks" title="Pachka sonini ko'rsatish" hint="Masalan: 2 pachka · 10 × 190 000">{toggle('receiptShowPacks')}</Row>
                <Row id="set-receiptFooter" title="Pastki matn">{text('receiptFooter')}</Row>
              </div>
              <div className="receipt-preview">
                <div className="label">Namuna</div>
                <Receipt sale={sampleSale} settings={s} />
              </div>
            </div>
          )}

          {section === 'brands' && <BrandsSection />}

          {section === 'stock' && (
            <>
              <Row id="set-lowStockPacks" title="Kam qoldiq chegarasi" hint="Shundan kam pachka qolsa 'Kam qolgan' ro'yxatiga tushadi">
                <div className="with-suffix">
                  <input
                    id="set-lowStockPacks"
                    className="input"
                    type="number"
                    min={1}
                    value={s.lowStockPacks}
                    onChange={(e) => update('lowStockPacks', Math.max(1, Number(e.target.value)))}
                  />
                  <span>pachka</span>
                </div>
              </Row>
            </>
          )}

          {section === 'devices' && <DevicesSection />}

          {section === 'security' && <PinSection s={s} onSave={(pin) => update('ownerPin', pin)} />}

          {section === 'data' && (
            <>
              {cloudEnabled && <AccountRow />}
              {!cloudEnabled && <Row id="set-reset" title="Sinov ma'lumotlarini tozalash" hint="Namunaviy tovarlar, sotuvlar va mijozlar o'chiriladi. Sozlamalar qoladi.">
                {confirmReset ? (
                  <button
                    id="set-reset"
                    className="btn danger"
                    onClick={() => {
                      const keep = JSON.stringify(s)
                      try {
                        const keepKeys = ['dk2.settings', 'dk2.brands', 'dk2.productDraft']
                        Object.keys(localStorage)
                          .filter((k) => /^dk\d\./.test(k) && !keepKeys.includes(k))
                          .forEach((k) => localStorage.removeItem(k))
                        localStorage.setItem('dk2.settings', keep)
                        localStorage.setItem('dk4.products', '[]')
                      } catch {
                        // Xotira yopiq — sahifani yangilash yetarli.
                      }
                      location.reload()
                    }}
                  >
                    Ha, tozalash
                  </button>
                ) : (
                  <button id="set-reset" className="btn ghost danger-text" onClick={() => setConfirmReset(true)}>Tozalash</button>
                )}
              </Row>}
              <Row id="set-defaults" title="Sozlamalarni tiklash" hint="Barcha sozlamalar boshlang'ich holatga qaytadi">
                <button id="set-defaults" className="btn ghost" onClick={() => { setS(defaultSettings); saveSettings(defaultSettings) }}>Tiklash</button>
              </Row>
              <p className="muted small note">
                {cloudEnabled
                  ? "Ma'lumotlar bazada saqlanadi: kassa, telefon va boshqa qurilmalar bir xil ma'lumotni ko'radi."
                  : "Sinov rejimi: ma'lumotlar faqat shu brauzerda saqlanmoqda."}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Logotipni 256px gacha kichraytirib, data URL qiladi. */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 256 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(img.src)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

function PinSection({ s, onSave }: { s: Settings; onSave: (pin: string) => void }) {
  const [oldPin, setOldPin] = useState('')
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6)
  return (
    <>
      <Row id="set-pin-old" title={s.ownerPin ? 'Hozirgi PIN' : 'PIN hali o\'rnatilmagan'} hint="Kassadan boshqa bo'limlarga kirishda so'raladi">
        {s.ownerPin && (
          <input id="set-pin-old" className="input pin" type="text" inputMode="numeric" autoComplete="off" data-lpignore="true" placeholder="••••" value={oldPin} onChange={(e) => setOldPin(digits(e.target.value))} />
        )}
      </Row>
      <Row id="set-pin-new" title="Yangi PIN" hint="4–6 ta raqam">
        <input id="set-pin-new" className="input pin" type="text" inputMode="numeric" autoComplete="off" data-lpignore="true" placeholder="••••" value={pin} onChange={(e) => setPin(digits(e.target.value))} />
      </Row>
      <div className="set-row">
        <span className={msg?.ok ? 'ok' : 'error'}>{msg?.text}</span>
        <button
          className="btn primary"
          onClick={() => {
            if (s.ownerPin && oldPin !== s.ownerPin) return setMsg({ ok: false, text: 'Hozirgi PIN noto\'g\'ri' })
            if (!/^\d{4,6}$/.test(pin)) return setMsg({ ok: false, text: 'PIN 4–6 ta raqam bo\'lsin' })
            onSave(pin)
            setOldPin('')
            setPin('')
            setMsg({ ok: true, text: 'PIN o\'zgartirildi' })
          }}
        >
          PIN ni saqlash
        </button>
      </div>
    </>
  )
}

function BrandsSection() {
  const [brands, setBrands] = useState<string[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null)

  const reload = async () => {
    setBrands(await getBrands())
    const c: Record<string, number> = {}
    for (const p of await getProducts()) c[p.brand] = (c[p.brand] ?? 0) + 1
    setCounts(c)
  }
  useEffect(() => {
    reload()
  }, [])

  return (
    <div className="brands">
      <p className="muted small note">Brendlarni bir marta kiriting — yangi tovar qo'shganda ro'yxatdan tanlanadi.</p>
      <form
        className="brand-add"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          await addBrand(name)
          setName('')
          reload()
        }}
      >
        <input id="brand-new" className="input" placeholder="Brend nomi, masalan Ezel" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" type="submit" disabled={!name.trim()}>Qo'shish</button>
      </form>
      <div className="brand-list">
        {brands.map((b) => (
          <div key={b} className="brand-item">
            <div className="grow">
              {editing?.from === b ? (
                <input
                  id={`brand-${b}`}
                  className="input"
                  autoFocus
                  value={editing.to}
                  onChange={(e) => setEditing({ from: b, to: e.target.value })}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      await renameBrand(b, editing.to)
                      setEditing(null)
                      reload()
                    }
                    if (e.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <b>{b}</b>
              )}
              <div className="muted small">{counts[b] ?? 0} ta tovar</div>
            </div>
            <button className="link small" onClick={() => setEditing({ from: b, to: b })}>nomini o'zgartirish</button>
            {!counts[b] && (
              <button className="icon danger" aria-label="O'chirish" onClick={async () => { await removeBrand(b); reload() }}>✕</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AccountRow() {
  const [email, setEmail] = useState('')
  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
  }, [])
  return (
    <Row id="set-logout" title="Hisobdan chiqish" hint={email ? `Kirgan: ${email}. Qayta kirish uchun email va parol kerak bo'ladi.` : undefined}>
      <button id="set-logout" className="btn ghost danger-text logout-btn" onClick={() => signOutHere()}>
        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true"><path d="M8 4H4.5v12H8M12 6.5 15.5 10 12 13.5M15.5 10H8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Chiqish
      </button>
    </Row>
  )
}

const IconPhone = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M11 18.5h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
)
const IconLaptop = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="4.5" y="5" width="15" height="10.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M2.5 18.5h19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
)

function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 2) return 'hozir faol'
  if (min < 60) return `${min} daqiqa oldin`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} soat oldin`
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Qaysi qurilmalardan kirilgan: kassa kompyuteri, telefon… Keraksizini chiqarib yuborish mumkin. */
function DevicesSection() {
  const [list, setList] = useState<Device[] | null | undefined>(undefined)
  const [busy, setBusy] = useState('')
  const me = deviceId()
  const load = () => listDevices().then(setList)
  useEffect(() => {
    load()
  }, [])
  // Chiqarilayotgan qurilma bor bo'lsa — ro'yxat o'zi yangilanib turadi (u chiqib ketgach yo'qoladi).
  const pending = list?.some((d) => d.revoked && d.id !== me)
  useEffect(() => {
    if (!pending) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [pending])

  if (list === undefined) return <p className="muted note">Yuklanmoqda…</p>
  if (list === null) {
    return (
      <p className="muted small note">
        Qurilmalar ro'yxati hali yoqilmagan: Supabase → SQL Editor'da <b>devices.sql</b> ni bir marta ishga tushiring.
      </p>
    )
  }
  const sorted = [...list].sort((a, b) => Number(b.id === me) - Number(a.id === me))
  const others = sorted.filter((d) => d.id !== me && !d.revoked)
  return (
    <div className="devices">
      <p className="muted small note">Hisobingizga kirilgan qurilmalar. Tanimagan yoki keraksiz qurilmani chiqarib yuboring.</p>
      {sorted.map((d) => {
        const mobile = /Android|iPhone|iPad/.test(d.name)
        return (
          <div key={d.id} className={`device${d.id === me ? ' me' : ''}`}>
            <span className="device-icon">{mobile ? <IconPhone /> : <IconLaptop />}</span>
            <div className="device-text">
              <b>
                {d.name}
                {d.id === me && <span className="device-badge">Bu qurilma</span>}
              </b>
              <span className="muted small">
                {d.email} · {d.revoked ? 'chiqarilmoqda… (qurilma ochiq bo\'lsa, bir necha soniyada; yopiq bo\'lsa — ochilganda)' : d.id === me ? 'hozir faol' : ago(d.last_seen)}
              </span>
            </div>
            {d.id !== me && !d.revoked && (
              <button
                className="btn ghost danger-text small"
                disabled={busy === d.id}
                onClick={async () => {
                  setBusy(d.id)
                  await revokeDevice(d.id).catch(() => {})
                  setBusy('')
                  load()
                }}
              >
                Chiqarish
              </button>
            )}
          </div>
        )
      })}
      {others.length > 1 && (
        <div className="set-row">
          <span className="muted small">Faqat shu qurilmada qolish</span>
          <button
            className="btn ghost danger-text"
            disabled={busy === 'all'}
            onClick={async () => {
              setBusy('all')
              await signOutOthers().catch(() => {})
              setBusy('')
              load()
            }}
          >
            Boshqa barcha qurilmalardan chiqish
          </button>
        </div>
      )}
    </div>
  )
}
