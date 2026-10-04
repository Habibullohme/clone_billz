import { useEffect, useState } from 'react'
import { PosPage } from './pages/PosPage'
import { SalesPage } from './pages/SalesPage'
import { ProductsPage } from './pages/ProductsPage'
import { LabelsPage } from './pages/LabelsPage'
import { SettingsPage } from './pages/SettingsPage'
import { PinGate } from './components/PinGate'
import { getSettings, saveSettings, type Settings } from './data/store'
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

export function App() {
  const [tab, setTab] = useState<Tab>('pos')
  const [menu, setMenu] = useState(false)
  const [asking, setAsking] = useState<OwnerTab | null>(null)
  const [labelsBatch, setLabelsBatch] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)

  // Kassaga qaytganda sozlamalar (logo, nom) yangilanadi.
  useEffect(() => {
    getSettings().then((s) => {
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
