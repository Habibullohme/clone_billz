import { useState } from 'react'
import { signIn } from '../data/cloud'

/** Kirish: hisoblar Supabase'da qo'lda yaratiladi. Bir marta kirilgach, qurilma eslab qoladi. */
export function LoginPage({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="login">
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
        <div className="shop-mark big">D</div>
        <h1>Kirish</h1>
        <p className="muted small">Bir marta kirasiz — bu qurilma sizni eslab qoladi.</p>
        <label className="field">
          <span>Email</span>
          <input id="login-email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Parol</span>
          <input id="login-password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="error small">{error}</div>}
        <button className="btn primary big" type="submit" disabled={busy}>{busy ? 'Kirilmoqda…' : 'Kirish'}</button>
      </form>
    </div>
  )
}
