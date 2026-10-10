import { useEffect, useRef, useState } from 'react'
import { PosPage } from './pages/PosPage'
import { SalesPage } from './pages/SalesPage'
import { ProductsPage } from './pages/ProductsPage'
import { LabelsPage } from './pages/LabelsPage'
import { SettingsPage } from './pages/SettingsPage'
import { PinGate } from './components/PinGate'
import { getSettings, initStore, onSyncError, refresh, saveSettings, type Settings } from './data/store'
import { cloudEnabled, getSession, isRevoked, isStaff, sessionRole, signOut, signOutHere, supabase, touchDevice, watchRevoke } from './data/cloud'
import { isBossMode } from './lib/telegram'
import { LoginPage } from './pages/LoginPage'
import { applyFavicon, cachedBrand, rememberBrand } from './lib/brand'
import { ShopMark } from './components/ShopMark'
import { afterNav, closeTopLayer, dropEntry, hasLayers, setBaseBack } from './lib/nav'
import { BackClose, Modal } from './components/ui'
import { applyTheme, type Theme } from './lib/theme'
import { IconBox, IconCashbox, IconDebt, IconGear, IconSales, IconTag, IconTheme } from './components/icons'
import { DebtsPage } from './pages/DebtsPage'

const ownerTabs = [
  ['sales', 'Sotuvlar', 'Tushum, foyda, brendlar', IconSales],
  ['products', 'Tovarlar', 'Ro\'yxat, Excel import', IconBox],
  ['debts', 'Nasiyalar', 'Kim qancha qarz, to\'lovlar', IconDebt],
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

/**
 * Kirish va ma'lumot yuklanishini kutadi, keyin ilovani ochadi.
 * onStats — panelda (bot egasi uchun): "📊 Statistika" ga qaytish tugmasi.
 */
export function App({ onStats }: { onStats?: () => void } = {}) {
  const [boot, setBoot] = useState<Boot>('loading')

  const start = async () => {
    setBoot('loading')
    try {
      if (cloudEnabled) {
        if (!(await getSession())) return setBoot('login')
        if (!(await isStaff())) return setBoot('denied')
        // Kuzatuvchi hisob saytda ham faqat statistikani ko'radi (kassa va boshqaruv yopiq).
        if (!isBossMode() && (await sessionRole()) === 'stats') {
          location.replace(`${location.pathname}?boss`)
          return
        }
        // Boshqa qurilmadan "chiqarilgan" bo'lsa — kirish oynasi.
        if (!(await touchDevice())) {
          await signOut()
          return setBoot('login')
        }
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

  if (boot === 'ready') return <Shop onStats={onStats} />
  if (boot === 'login') return <LoginPage onDone={start} />
  return (
    <div className="login">
      <div className="login-card">
        <ShopMark brand={cachedBrand()} big />
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

const OWNER_KEY = 'dk.owner'
const isOwnerTab = (t: string): t is OwnerTab => ownerTabs.some(([id]) => id === t)

function ownerUnlocked() {
  try {
    return sessionStorage.getItem(OWNER_KEY) === '1'
  } catch {
    return false
  }
}
function setOwnerUnlocked(on: boolean) {
  try {
    if (on) sessionStorage.setItem(OWNER_KEY, '1')
    else sessionStorage.removeItem(OWNER_KEY)
  } catch {
    // Maxfiy oyna — yangilaganda PIN qayta so'raladi.
  }
}

/** Manzildagi bo'lim (#products) — sahifa yangilansa ham shu bo'limda qoladi. */
function initialTab(): Tab {
  const h = location.hash.slice(1)
  return isOwnerTab(h) && ownerUnlocked() ? h : 'pos'
}

/** Tarix: [ildiz] → [kassa] → [bo'lim]. Ildizga qaytilsa — "Chiqasizmi?" so'raladi. */
function initHistory(tab: Tab) {
  const url = location.pathname + location.search
  const v = (history.state as { v?: string } | null)?.v
  if (!v || v === 'root') {
    history.replaceState({ v: 'root' }, '', url)
    history.pushState({ v: 'app' }, '', url)
    if (tab !== 'pos') history.pushState({ v: 'tab' }, '', `${url}#${tab}`)
  } else {
    // Sahifa yangilandi: tarix saqlangan, faqat joriy qadamni to'g'rilaymiz.
    history.replaceState({ v: tab === 'pos' ? 'app' : 'tab' }, '', tab === 'pos' ? url : `${url}#${tab}`)
  }
}

function Shop({ onStats }: { onStats?: () => void }) {
  const [tab, setTabState] = useState<Tab>(initialTab)
  const [exitAsk, setExitAsk] = useState(false)
  const [menu, setMenu] = useState(false)
  const [asking, setAsking] = useState<OwnerTab | null>(null)
  const [labelsBatch, setLabelsBatch] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [syncError, setSyncError] = useState('')

  useEffect(() => onSyncError(setSyncError), [])

  useEffect(() => {
    initHistory(tab)
    setBaseBack(() => {
      const v = (history.state as { v?: string } | null)?.v
      if (v === 'root') {
        // Kassadan orqaga: avval so'raymiz.
        history.pushState({ v: 'app' }, '', location.pathname + location.search)
        setExitAsk(true)
        return
      }
      const h = location.hash.slice(1)
      if (isOwnerTab(h) && ownerUnlocked()) setTabState(h)
      else {
        setOwnerUnlocked(false)
        setTabState('pos')
      }
    })
    return () => setBaseBack(null)
  }, [])

  // Esc: boshqaruv bo'limlaridan kassaga. Oyna ochiq bo'lsa — avval oyna yopiladi (u o'zi ushlaydi).
  const tabRef = useRef(tab)
  tabRef.current = tab
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const a = document.activeElement as HTMLElement | null
      if (a?.closest('.sel.open')) return
      if (hasLayers()) {
        // Kursor oyna ichida bo'lsa — oynaning o'zi yopadi; tashqarida bo'lsa — biz yopamiz.
        if (!a?.closest('.modal, .pin-card, .lightbox, .drawer')) {
          e.preventDefault()
          closeTopLayer()
        }
        return
      }
      if (tabRef.current === 'pos') return
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) {
        // Yozayotgan bo'lsa — avval maydondan chiqadi, keyingi Esc kassaga.
        a.blur()
        return
      }
      e.preventDefault()
      setTab('pos')
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [])

  /** Bo'lim almashtirish. Bo'limlar orasida — bitta qadam (orqaga → kassa). */
  const setTab = (t: Tab) => {
    setTabState(t)
    afterNav(() => {
      const url = location.pathname + location.search
      const v = (history.state as { v?: string } | null)?.v
      if (t === 'pos') {
        setOwnerUnlocked(false)
        if (v === 'tab') dropEntry()
        else history.replaceState({ v: 'app' }, '', url)
      } else if (v === 'tab') history.replaceState({ v: 'tab' }, '', `${url}#${t}`)
      else history.pushState({ v: 'tab' }, '', `${url}#${t}`)
    })
  }

  const leave = () => {
    setExitAsk(false)
    // Oyna yopilib bo'lgach: kassa va ildiz qadamlarini o'tib, saytdan chiqamiz.
    afterNav(() => {
      setBaseBack(null)
      history.go(-2)
    })
  }

  // Boshqa qurilmada qilingan o'zgarishlar: oynaga qaytganda bazadan yangilanadi.
  useEffect(() => {
    const onFocus = () => {
      refresh().catch(() => {})
      if (cloudEnabled) touchDevice().then((ok) => { if (!ok) signOut() }).catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    // Qurilmalar ro'yxatidagi "oxirgi faollik" yangilanib tursin (har 5 daqiqada).
    const t = setInterval(() => {
      if (cloudEnabled) touchDevice().then((ok) => { if (!ok) signOut() }).catch(() => {})
    }, 5 * 60_000)
    // Boshqa qurilmadan "Chiqarish" bosilsa: darhol (Realtime) yoki ko'pi bilan 15 soniyada chiqib ketadi.
    const kick = () => {
      signOutHere().catch(() => signOut())
    }
    const stopWatch = cloudEnabled ? watchRevoke(kick) : () => {}
    const poll = setInterval(() => {
      if (cloudEnabled && document.visibilityState === 'visible') isRevoked().then((r) => r && kick()).catch(() => {})
    }, 15_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(t)
      clearInterval(poll)
      stopWatch()
    }
  }, [])

  // Kassaga qaytganda sozlamalar (logo, nom) yangilanadi.
  useEffect(() => {
    refresh().catch(() => {}).then(getSettings).then((s) => {
      setSettings(s)
      rememberBrand({ name: s.shopName, logo: s.shopLogo })
      applyFavicon({ name: s.shopName, logo: s.shopLogo })
      document.title = `${s.shopName} — kassa`
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
      <ShopMark brand={{ name: settings?.shopName || cachedBrand().name, logo: settings ? settings.shopLogo : cachedBrand().logo }} />
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
          {onStats && <button className="hbtn stats-btn" onClick={onStats} title="Statistika">📊</button>}
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
            {onStats && <button className="hbtn stats-btn" onClick={onStats} title="Statistika">📊</button>}
            {themeBtn}
            <button className="btn primary to-pos" onClick={() => setTab('pos')}>
              <IconCashbox />
              <span>Kassa</span>
              <kbd className="esc-kbd">Esc</kbd>
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
        {tab === 'debts' && <DebtsPage />}
        {tab === 'labels' && <LabelsPage batchId={labelsBatch} />}
        {tab === 'settings' && <SettingsPage />}
      </main>

      {menu && (
        <div className="drawer-bg" onMouseDown={() => setMenu(false)}>
          <aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
            <BackClose onClose={() => setMenu(false)} />
            <div className="drawer-head">
              {shop}
              <button className="icon" onClick={() => setMenu(false)} aria-label="Yopish">✕</button>
            </div>
            <nav className="drawer-nav">
              {onStats && (
                <button onClick={() => { setMenu(false); onStats() }}>
                  <span className="dn-icon">📊</span>
                  <span className="dn-text">
                    <b>Statistika</b>
                    <span className="muted small">Kuzatuvchi paneliga qaytish</span>
                  </span>
                </button>
              )}
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

      {exitAsk && (
        <Modal title="Saytdan chiqasizmi?" onClose={() => setExitAsk(false)} center>
          <p className="muted">Kassa yopiladi. Savatdagi tovarlar saqlanmaydi.</p>
          <div className="modal-actions">
            <button className="btn ghost grow" onClick={() => setExitAsk(false)} autoFocus>Qolish</button>
            <button className="btn danger grow" onClick={leave}>Chiqish</button>
          </div>
        </Modal>
      )}

      {asking && (
        <PinGate
          onCancel={() => setAsking(null)}
          onOk={() => {
            setOwnerUnlocked(true)
            setTab(asking)
            setAsking(null)
          }}
        />
      )}
    </div>
  )
}
