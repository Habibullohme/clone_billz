import { useEffect, useState } from 'react'
import { PosPage } from './pages/PosPage'
import { SalesPage } from './pages/SalesPage'
import { ProductsPage } from './pages/ProductsPage'
import { LabelsPage } from './pages/LabelsPage'
import { SettingsPage } from './pages/SettingsPage'
import { PinGate } from './components/PinGate'
import { getSettings, initStore, onSyncError, refresh, saveSettings, type Settings } from './data/store'
import { cloudEnabled, getSession, isStaff, signOut, supabase } from './data/cloud'
import { LoginPage } from './pages/LoginPage'
import { applyTheme, type Theme } from './lib/theme'
import { IconBox, IconCashbox, IconGear, IconSales, IconTag, IconTheme } from './components/icons'

const ownerTabs = [
  ['sales', 'Sotuvlar', 'Tushum, foyda, brendlar', IconSales],
  ['products', 'Tovarlar', 'Ro\'yxat, Excel import', IconBox],
  ['labels', 'Etiketkalar', 'Shtrix-kod chiqarish', IconTag],
  ['settings', 'Sozlamalar', 'Do\'kon, chek, PIN', IconGear],
] as const
type OwnerTab = (typeof ownerTabs)[number][0]
type Tab = 'pos' | OwnerTab

const months = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr']

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="clock">
      <b>{now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</b>
      <span>{now.getDate()}-{months[now.getMonth()]}</span>
    </div>
  )
}

type Boot = 'loading' | 'login' | 'denied' | 'offline' | 'ready'

/** Kirish va ma'lumot yuklanishini kutadi, keyin ilovani ochadi. */
export function App() {
  const [boot, setBoot] = useState<Boot>('loading')

  const start = async () => {
    setBoot('loading')
    try {
      if (cloudEnabled) {
        if (!(await getSession())) return setBoot('login')
        if (!(await isStaff())) return setBoot('denied')
      }
      await initStore()
      setBoot('ready')
    } catch (e) {
      console.error(e)
      setBoot('offline')
    }
  }

  useEffect(() => {
    start()
    // Boshqa joyda chiqib ketilsa (yoki sessiya tugasa) — kirish oynasi.
    const sub = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setBoot('login')
    })
    return () => sub?.data.subscription.unsubscribe()
  }, [])

  if (boot === 'ready') return <Shop />
  if (boot === 'login') return <LoginPage onDone={start} />
  return (
    <div className="login">
      <div className="login-card">
        <div className="shop-mark big">D</div>
        {boot === 'loading' && <p className="muted">Yuklanmoqda…</p>}
        {boot === 'offline' && (
          <>
            <h1>Internet yo'q</h1>
            <p className="muted small">Bazaga ulanib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.</p>
            <button className="btn primary big" onClick={start}>Qayta urinish</button>
          </>
        )}
        {boot === 'denied' && (
          <>
            <h1>Ruxsat yo'q</h1>
            <p className="muted small">Bu hisobga do'konga kirish ruxsati berilmagan. Do'kon egasiga murojaat qiling.</p>
            <button className="btn ghost big" onClick={() => signOut()}>Boshqa hisob bilan kirish</button>
          </>
        )}
      </div>
    </div>
  )
}

function Shop() {
  const [tab, setTab] = useState<Tab>('pos')
  const [menu, setMenu] = useState(false)
  const [asking, setAsking] = useState<OwnerTab | null>(null)
  const [labelsBatch, setLabelsBatch] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [syncError, setSyncError] = useState('')

  useEffect(() => onSyncError(setSyncError), [])

  // Boshqa qurilmada qilingan o'zgarishlar: oynaga qaytganda bazadan yangilanadi.
  useEffect(() => {
    const onFocus = () => refresh().catch(() => {})
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // Kassaga qaytganda sozlamalar (logo, nom) yangilanadi.
  useEffect(() => {
    refresh().catch(() => {}).then(getSettings).then((s) => {
      setSettings(s)
      applyTheme(s.theme)
    })
  }, [tab])

  // Kassa sarlavhasidagi tugma: yorug' ↔ qorong'i.
  const toggleTheme = async () => {
    const s = await getSettings()
    const dark = s.theme === 'dark' || (s.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
    const next = { ...s, theme: (dark ? 'light' : 'dark') as Theme }
    await saveSettings(next)
    applyTheme(next.theme)
    setSettings(next)
  }

  const open = (t: OwnerTab) => {
    setMenu(false)
    // Egasining bo'limlari ichida yurish uchun qayta PIN so'ralmaydi.
    if (tab !== 'pos') setTab(t)
    else setAsking(t)
  }

  const shop = (
    <div className="shop">
      {settings?.shopLogo ? <img className="shop-logo" src={settings.shopLogo} alt="" /> : <div className="shop-mark">{(settings?.shopName || 'D')[0]}</div>}
      <div className="shop-text">
        <b>{settings?.shopName || "Do'kon"}</b>
        <span>{tab === 'pos' ? 'Kassa' : 'Boshqaruv'}</span>
      </div>
    </div>
  )
  const themeBtn = (
    <button className="hbtn" onClick={toggleTheme} aria-label="Yorug' / qorong'i" title="Yorug' / qorong'i">
      <IconTheme />
    </button>
  )

  return (
    <div className="app">
      {tab === 'pos' ? (
        <header className="nav">
          {shop}
          <span className="grow" />
          <Clock />
          {themeBtn}
          <button className="hbtn" onClick={() => setMenu(true)} aria-label="Menyu" title="Menyu">
            <span className="burger-lines"><span /><span /><span /></span>
          </button>
        </header>
      ) : (
        <header className="nav owner">
          {shop}
          <nav className="tabs">
            {ownerTabs.map(([id, label, , Icon]) => (
              <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="nav-right">
            {themeBtn}
            <button className="btn primary to-pos" onClick={() => setTab('pos')}>
              <IconCashbox />
              <span>Kassa</span>
            </button>
          </div>
        </header>
      )}

      {syncError && (
        <div className="sync-error" role="alert">
          <span>⚠ {syncError}</span>
          <button className="icon" onClick={() => setSyncError('')} aria-label="Yopish">✕</button>
        </div>
      )}

      <main className="main">
        {tab === 'pos' && <PosPage />}
        {tab === 'sales' && <SalesPage />}
        {tab === 'products' && (
          <ProductsPage
            onPrintLabels={(id) => {
              setLabelsBatch(id)
              setTab('labels')
            }}
          />
        )}
        {tab === 'labels' && <LabelsPage batchId={labelsBatch} />}
        {tab === 'settings' && <SettingsPage />}
      </main>

      {menu && (
        <div className="drawer-bg" onMouseDown={() => setMenu(false)}>
          <aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              {shop}
              <button className="icon" onClick={() => setMenu(false)} aria-label="Yopish">✕</button>
            </div>
            <nav className="drawer-nav">
              {ownerTabs.map(([id, label, hint, Icon]) => (
                <button key={id} onClick={() => open(id)}>
                  <span className="dn-icon"><Icon /></span>
                  <span className="dn-text">
                    <b>{label}</b>
                    <span className="muted small">{hint}</span>
                  </span>
                </button>
              ))}
            </nav>
            <p className="muted small">🔒 Bu bo'limlar PIN kod bilan himoyalangan</p>
          </aside>
        </div>
      )}

      {asking && (
        <PinGate
          onCancel={() => setAsking(null)}
          onOk={() => {
            setTab(asking)
            setAsking(null)
          }}
        />
      )}
    </div>
  )
}
