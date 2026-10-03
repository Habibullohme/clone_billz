import { useEffect, useRef, useState, type ReactNode } from 'react'
import { defaultSettings, getSettings, saveSettings, type Settings } from '../data/store'
import { formatSum } from '../lib/money'
import { Segmented, Toggle } from '../components/ui'
import { Receipt } from '../components/Receipt'
import type { Sale } from '../types'

const sections = [
  ['shop', "Do'kon"],
  ['pos', 'Kassa'],
  ['receipt', 'Chek'],
  ['labels', 'Etiketka'],
  ['stock', 'Ombor'],
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
  const toggle = (key: 'receiptShowCustomer' | 'receiptShowPacks' | 'allowPriceEdit' | 'allowNegativeStock' | 'scanSound' | 'labelShowPrice' | 'labelShowSize') => (
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
              <Row id="set-shopName" title="Do'kon nomi" hint="Chek tepasida chiqadi">{text('shopName')}</Row>
              <Row id="set-shopAddress" title="Manzil" hint="Masalan: Abu Saxiy, 3-qator, 112-do'kon">{text('shopAddress')}</Row>
              <Row id="set-shopPhone" title="Telefon">{text('shopPhone', '+998 90 123 45 67')}</Row>
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
                <Row id="set-receiptWidth" title="Chek kengligi" hint="Printeringiz lentasi">
                  <Segmented<58 | 80> value={s.receiptWidth} onChange={(v) => update('receiptWidth', v)} options={[[58, '58 mm'], [80, '80 mm']]} />
                </Row>
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

          {section === 'labels' && (
            <>
              <Row id="set-labelSize" title="Etiketka o'lchami" hint="Etiketka printeringizdagi lenta">
                <Segmented<Settings['labelSize']>
                  value={s.labelSize}
                  onChange={(v) => update('labelSize', v)}
                  options={[['58x40', '58×40'], ['40x30', '40×30'], ['30x20', '30×20']]}
                />
              </Row>
              <Row id="set-labelShowPrice" title="Narxni yozish">{toggle('labelShowPrice')}</Row>
              <Row id="set-labelShowSize" title="Razmerni yozish">{toggle('labelShowSize')}</Row>
            </>
          )}

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
              <Row id="set-allowNegativeStock" title="Qoldiqsiz sotish" hint="Omborda ko'rinmasa ham sotishga ruxsat (kirim kechikkan bo'lsa)">{toggle('allowNegativeStock')}</Row>
            </>
          )}

          {section === 'data' && (
            <>
              <Row id="set-reset" title="Sinov ma'lumotlarini tozalash" hint="Namunaviy tovarlar, sotuvlar va mijozlar o'chiriladi. Sozlamalar qoladi.">
                {confirmReset ? (
                  <button
                    id="set-reset"
                    className="btn danger"
                    onClick={() => {
                      const keep = JSON.stringify(s)
                      try {
                        Object.keys(localStorage).filter((k) => k.startsWith('dk2.')).forEach((k) => localStorage.removeItem(k))
                        localStorage.setItem('dk2.settings', keep)
                        localStorage.setItem('dk2.products', '[]')
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
              </Row>
              <Row id="set-defaults" title="Sozlamalarni tiklash" hint="Barcha sozlamalar boshlang'ich holatga qaytadi">
                <button id="set-defaults" className="btn ghost" onClick={() => { setS(defaultSettings); saveSettings(defaultSettings) }}>Tiklash</button>
              </Row>
              <p className="muted small note">
                Xodimlar (kassir akkauntlari) va Telegram bot baza ulangach shu yerga qo'shiladi.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
