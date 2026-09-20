import { useState } from 'react'
import { useAuth } from '../lib/useAuth'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const err = await signIn(email, password)
    setLoading(false)
    if (err) setError(err)
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="card-pad">
          <div style={{ marginBottom: 18 }}>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
              Nexxel &middot; Personal &amp; Business
            </div>
            <h1 style={{ margin: '2px 0 0', fontSize: 21, fontWeight: 800 }}>Net Worth Tracker</h1>
          </div>
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <div className="alert critical">{error}</div>}
            <button className="btn primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
