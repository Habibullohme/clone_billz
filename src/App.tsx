import { useState } from 'react'
import { PosPage } from './pages/PosPage'
import { SalesPage } from './pages/SalesPage'
import { ProductsPage } from './pages/ProductsPage'
import { LabelsPage } from './pages/LabelsPage'
import { SettingsPage } from './pages/SettingsPage'

const tabs = [
  ['pos', 'Kassa'],
  ['sales', 'Sotuvlar'],
  ['products', 'Tovarlar'],
  ['labels', 'Etiketkalar'],
  ['settings', 'Sozlamalar'],
] as const
type Tab = (typeof tabs)[number][0]

export function App() {
  const [tab, setTab] = useState<Tab>('pos')
  const [labelsBatch, setLabelsBatch] = useState<string | null>(null)

  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">dokon</div>
        <div className="tabs">
          {tabs.map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <span className="demo">sinov rejimi</span>
      </nav>
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
    </div>
  )
}
