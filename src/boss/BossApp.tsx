import { useEffect, useMemo, useState } from 'react'
import type { Customer, Product, Sale } from '../types'
import {
  activeSales, balanceOf, getCustomers, getProducts, getSales, getSettings, initStore, refresh, type Settings,
} from '../data/store'
import { cloudEnabled, getSession, isStaff, sessionRole, signOut, signOutLocal, supabase, telegramSignIn, touchDevice, type PanelRole } from '../data/cloud'
import { LoginPage } from '../pages/LoginPage'
import { PinGate } from '../components/PinGate'
import { ShopMark } from '../components/ShopMark'
import { Receipt } from '../components/Receipt'
import { PeriodPicker } from '../components/PeriodPicker'
import { cachedBrand, rememberBrand } from '../lib/brand'
import { hueStyle } from '../lib/colors'
import { formatSum, shortSum } from '../lib/money'
import { inPeriod, type Period } from '../lib/period'
import { applyTheme } from '../lib/theme'
import { loadTelegram, type TgWebApp } from '../lib/telegram'
import { App } from '../App'

type Boot = 'loading' | 'login' | 'unbound' | 'denied' | 'offline' | 'pin' | 'ready' | 'site'

/**
 * Telegram botdagi mini app (panel). Hisob turiga qarab:
 * - 📊 Kuzatuvchi — faqat statistika (sotuv, foyda, ombor, nasiya), do'kon PIN kodi bilan;
 * - 🛠 Admin — to'liq sayt (kassa, tovarlar, kirim…) telefon ko'rinishida;
 * - bot egasi (ADMIN_IDS) — statistika, "🛠 Admin" tugmasi bilan to'liq saytga o'tadi.
 * Telegram ichida login so'ralmaydi: bot har ochilishda Telegram imzosini tekshirib kirgizadi.
 */
export function BossApp() {
  const [boot, setBoot] = useState<Boot>('loading')
  const [tg, setTg] = useState<TgWebApp | null>(null)
  const [note, setNote] = useState('')
  const [role, setRole] = useState<PanelRole>('owner')

  const start = async () => {
    setBoot('loading')
    try {
      const app = await loadTelegram()
      setTg(app)
      if (app) applyTheme(app.colorScheme)
      let r: PanelRole = 'owner'
      if (cloudEnabled) {
        if (app) {
          // Telegram ichida: har ochilishda bot qayta tekshiradi (chiqqan, o'chirilgan yoki
          // paroli almashgan hisob eski sessiya bilan kira olmaydi). Login so'ralmaydi.
          await signOutLocal()
          const res = await telegramSignIn(app.initData)
          if (res === 'unbound') return setBoot('unbound')
          if (typeof res === 'string') {
            setNote(res)
            return setBoot('offline')
          }
          r = res.role
        } else {
          if (!(await getSession())) return setBoot('login')
          r = await sessionRole()
        }
        if (!(await isStaff())) return setBoot('denied')
        if (!(await touchDevice())) {
          await signOut()
          return setBoot('login')
        }
      }
      // Sinov rejimi (baza ulanmagan): ?boss=admin yoki ?boss=stats — o'sha panelni ko'rish.
      else {
        const v = new URLSearchParams(location.search).get('boss')
        if (v === 'admin' || v === 'stats') r = v
      }
      setRole(r)
      // Admin — to'liq sayt (o'zi ma'lumotni yuklaydi, boshqaruv bo'limlarida PIN so'raydi).
      if (r === 'admin') return setBoot('site')
      await initStore()
      const s = await getSettings()
      rememberBrand({ name: s.shopName, logo: s.shopLogo })
      setBoot(s.ownerPin ? 'pin' : 'ready')
    } catch (e) {
      console.error(e)
      setBoot('offline')
    }
  }

  useEffect(() => {
    document.title = 'Panel'
    start()
    const sub = supabase?.auth.onAuthStateChange((event) => {
      // Telegram ichida sessiya har ochilishda qayta olinadi — u yerdagi "chiqish" kirish oynasi emas.
      if (event === 'SIGNED_OUT' && !window.Telegram?.WebApp?.initData) setBoot('login')
    })
    return () => sub?.data.subscription.unsubscribe()
  }, [])

  if (boot === 'site') return <SiteView tg={tg} onBack={role === 'owner' ? () => setBoot('ready') : undefined} />
  if (boot === 'ready') return <Dashboard tg={tg} role={role} onSite={role === 'owner' ? () => setBoot('site') : undefined} />
  if (boot === 'login') return <LoginPage onDone={start} subtitle="Panel" />
  if (boot === 'pin')
    return (
      <div className="boss-pin">
        <PinGate onOk={() => setBoot('ready')} onCancel={() => (tg ? tg.close() : setBoot('pin'))} />
      </div>
    )
  return (
    <div className="login">
      <div className="login-card">
        <ShopMark brand={cachedBrand()} big />
        {boot === 'loading' && <p className="muted">Yuklanmoqda…</p>}
        {boot === 'unbound' && (
          <>
            <h1>Avval botda kiring</h1>
            <p className="muted small">Botda <b>🔐 Kirish</b> tugmasini bosib, do'kon egasi bergan login va parolni kiriting. Keyin bu oyna o'zi ochiladi.</p>
            <button className="btn primary big" onClick={() => tg?.close()}>Botga qaytish</button>
          </>
        )}
        {boot === 'offline' && (
          <>
            <h1>{note ? 'Kirib bo\'lmadi' : "Internet yo'q"}</h1>
            <p className="muted small">{note || "Bazaga ulanib bo'lmadi."}</p>
            <button className="btn primary big" onClick={start}>Qayta urinish</button>
          </>
        )}
        {boot === 'denied' && (
          <>
            <h1>Ruxsat yo'q</h1>
            <p className="muted small">Bu hisobga ruxsat berilmagan.</p>
            <button className="btn ghost big" onClick={() => signOut()}>Boshqa hisob bilan kirish</button>
          </>
        )}
      </div>
    </div>
  )
}

/** Panel sarlavhasi va pastki bo'limlar. */
function PanelShell<T extends string>({ title, tabs, tab, onTab, onReload, busy, updated, tg, action, children }: {
  title: string; tabs: readonly (readonly [T, string, string])[]; tab: T; onTab: (t: T) => void
  onReload: () => void; busy: boolean; updated: Date; tg: TgWebApp | null; action?: React.ReactNode; children: React.ReactNode
}) {
  const brand = cachedBrand()
  return (
    <div className="boss">
      <header className="boss-head">
        <ShopMark brand={brand} />
        <div className="boss-title">
          <b>{brand.name}</b>
          <span>{title} · {updated.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        {action}
        <button className={`boss-refresh${busy ? ' spin' : ''}`} onClick={onReload} aria-label="Yangilash">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </header>
      <main className="boss-body">{children}</main>
      <nav className="boss-tabs" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map(([id, label, icon]) => (
          <button
            key={id}
            className={tab === id ? 'on' : ''}
            onClick={() => {
              tg?.HapticFeedback?.impactOccurred('light')
              onTab(id)
            }}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}

/** Ma'lumotni yuklaydi va ochiq turganda har 30 soniyada yangilaydi. */
function useLiveData() {
  const [sales, setSales] = useState<Sale[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [updated, setUpdated] = useState(new Date())
  const [busy, setBusy] = useState(false)
  const load = async () => {
    setSales(activeSales(await getSales()))
    setProducts(await getProducts())
    setCustomers(await getCustomers())
    setSettings(await getSettings())
    setUpdated(new Date())
  }
  const reload = async () => {
    setBusy(true)
    try {
      await refresh()
      await load()
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    load()
    const t = setInterval(() => document.visibilityState === 'visible' && reload(), 30_000)
    const onVis = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  return { sales, products, customers, settings, updated, busy, reload }
}

type Tab = 'sales' | 'stock' | 'debts'

/** Statistika (kuzatuvchi): sotuv, foyda, ombor, nasiya. Egasida — to'liq saytga o'tish tugmasi. */
function Dashboard({ tg, role, onSite }: { tg: TgWebApp | null; role: PanelRole; onSite?: () => void }) {
  const [tab, setTab] = useState<Tab>('sales')
  const d = useLiveData()
  return (
    <PanelShell
      title={role === 'stats' ? 'Kuzatuvchi panel' : 'Statistika'} tab={tab} onTab={setTab} tg={tg} onReload={d.reload} busy={d.busy} updated={d.updated}
      tabs={[['sales', 'Sotuvlar', '📈'], ['stock', 'Ombor', '📦'], ['debts', 'Nasiyalar', '📒']] as const}
      action={onSite && <button className="btn ghost small boss-site" onClick={onSite}>🛠 Admin</button>}
    >
      {tab === 'sales' && d.settings && <SalesView sales={d.sales} settings={d.settings} tg={tg} />}
      {tab === 'stock' && <StockView products={d.products} />}
      {tab === 'debts' && <DebtsView customers={d.customers} />}
    </PanelShell>
  )
}

/**
 * 🛠 Admin: to'liq sayt (kassa, tovarlar, kirim, etiketka…) telefon ko'rinishida.
 * Bot egasi uchun — Telegram'ning "orqaga" tugmasi (yoki pastdagi tugma) statistikaga qaytaradi.
 */
function SiteView({ tg, onBack }: { tg: TgWebApp | null; onBack?: () => void }) {
  useTgBack(tg, onBack ?? null)
  return (
    <>
      <App />
      {onBack && !tg && <button className="boss-back" onClick={onBack}>📊 Statistika</button>}
    </>
  )
}

/** Telegram'ning "orqaga" tugmasi: ochiq oyna bo'lsa ko'rinadi va uni yopadi. */
function useTgBack(tg: TgWebApp | null, onBack: (() => void) | null) {
  useEffect(() => {
    if (!tg || !onBack) return
    tg.BackButton.show()
    tg.BackButton.onClick(onBack)
    return () => {
      tg.BackButton.offClick(onBack)
      tg.BackButton.hide()
    }
  }, [tg, onBack])
}

const fmtWhen = (iso: string, period: Period) =>
  new Date(iso).toLocaleString('ru-RU', period === 'today' || period.startsWith('d:')
    ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function ReceiptScreen({ sale, settings, onBack }: { sale: Sale; settings: Settings; onBack: () => void }) {
  return (
    <div className="boss-receipt">
      <div className="print-area"><Receipt sale={sale} settings={settings} /></div>
      <button className="btn primary big" onClick={onBack}>← Orqaga</button>
    </div>
  )
}

function SalesView({ sales, settings, tg }: { sales: Sale[]; settings: Settings; tg: TgWebApp | null }) {
  const [period, setPeriod] = useState<Period>('today')
  const [open, setOpen] = useState<Sale | null>(null)

  const close = useMemo(() => (open ? () => setOpen(null) : null), [open])
  useTgBack(tg, close)

  const list = sales.filter((s) => inPeriod(s.createdAt, period))
  const sum = (f: (s: Sale) => number) => list.reduce((a, s) => a + f(s), 0)
  const revenue = sum((s) => s.total)
  const profit = sum((s) => s.profit)
  const packs = list.reduce((a, s) => a + s.lines.reduce((x, l) => x + l.pairs / (l.packSize || 1), 0), 0)
  const payments = ([
    ['Naqd', sum((s) => s.payment.cash - s.change)],
    ['Karta', sum((s) => s.payment.card)],
    ['Dollar', sum((s) => Math.round(s.payment.usd * s.payment.usdRate))],
    ['Nasiya', sum((s) => s.payment.debt)],
  ] as [string, number][]).filter(([, v]) => v > 0)

  const brands = useMemo(() => {
    const m = new Map<string, { total: number; packs: number }>()
    for (const s of list)
      for (const l of s.lines) {
        const b = m.get(l.brand) ?? { total: 0, packs: 0 }
        b.total += l.total
        b.packs += l.pairs / (l.packSize || 1)
        m.set(l.brand, b)
      }
    return [...m].sort((a, b) => b[1].total - a[1].total)
  }, [list])
  const max = brands[0]?.[1].total ?? 0
  const when = (iso: string) => fmtWhen(iso, period)

  if (open) return <ReceiptScreen sale={open} settings={settings} onBack={() => setOpen(null)} />

  return (
    <>
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="boss-kpis">
        <div className="boss-kpi main"><span>Tushum</span><b>{formatSum(revenue)}</b></div>
        <div className="boss-kpi ok"><span>Foyda</span><b>{formatSum(profit)}</b></div>
        <div className="boss-kpi"><span>Cheklar</span><b>{list.length}</b><small className="muted">{+packs.toFixed(1)} pachka sotildi</small></div>
      </div>
      {payments.length > 0 && (
        <div className="boss-card pay-split">
          {payments.map(([k, v]) => (
            <span key={k} className={`pm pm-${k.toLowerCase()}`}>{k} <b>{formatSum(v)}</b></span>
          ))}
        </div>
      )}
      {brands.length > 0 && (
        <section className="boss-card">
          <h2>Brendlar</h2>
          {brands.map(([name, b]) => (
            <div key={name} className="boss-bar" style={hueStyle(name)}>
              <div className="boss-bar-top"><span><i className="dot" />{name}</span><b>{formatSum(b.total)}</b></div>
              <div className="bb-track"><div className="bb-fill" style={{ width: `${(b.total / max) * 100}%` }} /></div>
              <span className="muted small">{+b.packs.toFixed(1)} pachka</span>
            </div>
          ))}
        </section>
      )}
      <section className="boss-card">
        <h2>Cheklar</h2>
        {list.length === 0 && <p className="muted">Bu davrda sotuv yo'q.</p>}
        {list.map((s) => (
          <button key={s.id} className="boss-row" onClick={() => setOpen(s)}>
            <span className="muted">№{s.number}</span>
            <span className="grow">{s.customerName || <span className="muted">Mijozsiz</span>}<small className="muted">{when(s.createdAt)}</small></span>
            <b>{formatSum(s.total)}</b>
          </button>
        ))}
      </section>
    </>
  )
}

function StockView({ products }: { products: Product[] }) {
  const inStock = products.filter((p) => p.stock > 0)
  const total = (f: (p: Product) => number) => inStock.reduce((a, p) => a + f(p), 0)
  const brands = useMemo(() => {
    const m = new Map<string, { packs: number; pairs: number; cost: number; sale: number }>()
    for (const p of inStock) {
      const b = m.get(p.brand) ?? { packs: 0, pairs: 0, cost: 0, sale: 0 }
      b.packs += p.stock / (p.packSize || 1)
      b.pairs += p.stock
      b.cost += p.stock * p.costPrice
      b.sale += p.stock * p.salePrice
      m.set(p.brand, b)
    }
    return [...m].sort((a, b) => b[1].sale - a[1].sale)
  }, [products])
  return (
    <>
      <div className="boss-kpis">
        <div className="boss-kpi main"><span>Omborda</span><b>{+total((p) => p.stock / (p.packSize || 1)).toFixed(1)} pachka</b><small className="muted">{total((p) => p.stock)} juft</small></div>
        <div className="boss-kpi"><span>Tannarxi</span><b>{shortSum(total((p) => p.stock * p.costPrice))}</b></div>
        <div className="boss-kpi ok"><span>Sotuv narxida</span><b>{shortSum(total((p) => p.stock * p.salePrice))}</b></div>
      </div>
      <section className="boss-card">
        <h2>Brendlar bo'yicha</h2>
        {brands.length === 0 && <p className="muted">Omborda tovar yo'q.</p>}
        {brands.map(([name, b]) => (
          <div key={name} className="boss-row static" style={hueStyle(name)}>
            <span className="grow"><i className="dot" />{name}<small className="muted">{+b.packs.toFixed(1)} pachka · {b.pairs} juft</small></span>
            <span className="num"><b>{shortSum(b.sale)}</b><small className="muted">tannarx {shortSum(b.cost)}</small></span>
          </div>
        ))}
      </section>
    </>
  )
}

function DebtsView({ customers }: { customers: Customer[] }) {
  const rows = customers
    .map((c) => ({ c, balance: balanceOf(c) }))
    .filter((x) => x.balance > 0)
    .sort((a, b) => b.balance - a.balance)
  const total = rows.reduce((a, x) => a + x.balance, 0)
  return (
    <>
      <div className="boss-kpis">
        <div className="boss-kpi bad"><span>Jami nasiya</span><b>{formatSum(total)}</b></div>
        <div className="boss-kpi"><span>Qarzdorlar</span><b>{rows.length}</b></div>
      </div>
      <section className="boss-card">
        <h2>Kim qancha qarz</h2>
        {rows.length === 0 && <p className="muted">Nasiya yo'q.</p>}
        {rows.map(({ c, balance }) => (
          <div key={c.id} className="boss-row static">
            <span className="grow">
              {c.name}
              {c.phone && <small><a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a></small>}
            </span>
            <b className="bad">{formatSum(balance)}</b>
          </div>
        ))}
      </section>
    </>
  )
}
