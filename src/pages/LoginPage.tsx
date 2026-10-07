import { useState } from 'react'
import { signIn } from '../data/cloud'
import { cachedBrand } from '../lib/brand'
import { ShopMark } from '../components/ShopMark'

/** Kirish: login/parolni bot (👥 Loginlar) beradi; eski email hisoblar ham ishlaydi. Bir marta kirilgach, qurilma eslab qoladi. */
export function LoginPage({ onDone, subtitle = 'Kassa va boshqaruv' }: { onDone: () => void; subtitle?: string }) {
  const brand = cachedBrand()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="login">
      <div className="login-glow" aria-hidden="true" />
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          const err = await signIn(email, password)
          setBusy(false)
          if (err) setError(err)
          else onDone()
        }}
      >
        <ShopMark brand={brand} big />
        <div className="login-head">
          <h1>{brand.name}</h1>
          <p className="muted">{subtitle}</p>
        </div>
        <label className="field">
          <span>Login yoki email</span>
          <input id="login-email" className="input" type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" placeholder="ali yoki siz@pochta.uz" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Parol</span>
          <div className="pw-wrap">
            <input id="login-password" className="input" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="pw-eye" onClick={() => setShow((x) => !x)} aria-label={show ? 'Yashirish' : "Ko'rsatish"}>
              {show ? 'Yashirish' : "Ko'rsatish"}
            </button>
          </div>
        </label>
        {error && <div className="login-error">{error}</div>}
        <button className="btn primary big" type="submit" disabled={busy}>{busy ? 'Kirilmoqda…' : 'Kirish'}</button>
        <p className="muted small">🔒 Bir marta kirasiz — bu qurilma sizni eslab qoladi</p>
      </form>
    </div>
  )
}
