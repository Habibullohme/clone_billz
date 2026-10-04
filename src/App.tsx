import { useEffect, useState } from 'react'
import { PosPage } from './pages/PosPage'
import { SalesPage } from './pages/SalesPage'
import { ProductsPage } from './pages/ProductsPage'
import { LabelsPage } from './pages/LabelsPage'
import { SettingsPage } from './pages/SettingsPage'
import { PinGate } from './components/PinGate'
import { getSettings, saveSettings, type Settings } from './data/store'
import { applyTheme, type Theme } from './lib/theme'

const ownerTabs = [
  ['sales', 'Sotuvlar', 'Tushum, foyda, brendlar'],
  ['products', 'Tovarlar', 'Ro\'yxat, Excel import'],
  ['labels', 'Etiketkalar', 'Shtrix-kod chiqarish'],
  ['settings', 'Sozlamalar', 'Do\'kon, chek, PIN'],
] as const
type OwnerTab = (typeof ownerTabs)[number][0]
type Tab = 'pos' | OwnerTab

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  return <span className="clock">{now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
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
      <b>{settings?.shopName || "Do'kon"}</b>
    </div>
  )

  return (
    <div className="app">
      {tab === 'pos' ? (
        <header className="nav">
          {shop}
          <span className="grow" />
          <Clock />
          <button className="burger" onClick={toggleTheme} aria-label="Yorug' / qorong'i">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 2a8 8 0 1 0 0 16z" fill="currentColor" /><circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
          <button className="burger" onClick={() => setMenu(true)} aria-label="Menyu">
            <span /><span /><span />
          </button>
        </header>
      ) : (
        <header className="nav owner">
          <button className="btn primary small" onClick={() => setTab('pos')}>← Kassa</button>
          <div className="tabs">
            {ownerTabs.map(([id, label]) => (
              <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
            ))}
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
              {ownerTabs.map(([id, label, hint]) => (
                <button key={id} onClick={() => open(id)}>
                  <b>{label}</b>
                  <span className="muted small">{hint}</span>
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
