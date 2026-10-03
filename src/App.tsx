import { useState } from 'react'
import { PosPage } from './pages/PosPage'
import { SalesPage } from './pages/SalesPage'
import { ProductsPage } from './pages/ProductsPage'
import { SettingsPage } from './pages/SettingsPage'

const tabs = [
  ['pos', 'Yangi sotuv'],
  ['sales', 'Sotuvlar'],
  ['products', 'Mahsulotlar'],
  ['settings', 'Sozlamalar'],
] as const
type Tab = (typeof tabs)[number][0]

export function App() {
  const [tab, setTab] = useState<Tab>('pos')
  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">DO'KON<span>.</span></div>
        {tabs.map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
        <span className="demo">Sinov rejimi · namunaviy tovarlar</span>
      </nav>
      <main className="main">
        {tab === 'pos' && <PosPage />}
        {tab === 'sales' && <SalesPage />}
        {tab === 'products' && <ProductsPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
