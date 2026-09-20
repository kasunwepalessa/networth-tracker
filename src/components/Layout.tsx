import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../lib/useAuth'
import ThemeSwitcher from './ThemeSwitcher'

const LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/accounts', label: 'Accounts' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/portfolio', label: 'Assets & Liabilities' },
  { to: '/subscriptions', label: 'Subscriptions' },
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '0 4px' }}>
          <button className="signout" style={{ flex: 1 }} onClick={() => signOut()}>Sign out</button>
          <ThemeSwitcher placement="up" />
        </div>
      </aside>

      <div className="mobile-topbar">
        <h1>Net Worth</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThemeSwitcher />
          <button className="icon-btn" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">☰</button>
        </div>
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
