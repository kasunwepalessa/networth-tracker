import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../lib/useAuth'

const LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/accounts', label: 'Accounts' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/portfolio', label: 'Assets & Liabilities' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/forecast', label: 'Forecast' },
  { to: '/invoices', label: 'Invoices' },
  { to: '/goals', label: 'Goals' },
]

export default function Layout() {
  const { signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="eyebrow">Nexxel</span>
          <h1>Net Worth</h1>
        </div>
        <nav>
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <button className="signout" onClick={() => signOut()}>Sign out</button>
      </aside>

      <div className="mobile-topbar">
        <h1>Net Worth</h1>
        <button className="icon-btn" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">☰</button>
      </div>
      {mobileOpen && (
        <div className="mobile-nav">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setMobileOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>
              {l.label}
            </NavLink>
          ))}
          <button className="signout" style={{ flex: 'none' }} onClick={() => signOut()}>Sign out</button>
        </div>
      )}

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
