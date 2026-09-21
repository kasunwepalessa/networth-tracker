import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
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
  { to: '/businesses', label: 'Businesses' },
  { to: '/goals', label: 'Goals' },
]

// The four highest-frequency destinations live in the fixed bottom tab bar; everything
// else opens in the "More" bottom sheet.
const TABS: { to: string; label: string; end?: boolean; icon: NavIconName }[] = [
  { to: '/', label: 'Home', end: true, icon: 'home' },
  { to: '/invoices', label: 'Invoices', icon: 'invoice' },
  { to: '/transactions', label: 'Activity', icon: 'swap' },
  { to: '/accounts', label: 'Accounts', icon: 'wallet' },
]

const MORE_LINKS: { to: string; label: string; icon: NavIconName }[] = [
  { to: '/portfolio', label: 'Assets & Liabilities', icon: 'portfolio' },
  { to: '/subscriptions', label: 'Subscriptions', icon: 'calendar' },
  { to: '/budgets', label: 'Budgets', icon: 'pie' },
  { to: '/forecast', label: 'Forecast', icon: 'trend' },
  { to: '/businesses', label: 'Businesses', icon: 'building' },
  { to: '/goals', label: 'Goals', icon: 'target' },
]

type NavIconName = 'home' | 'invoice' | 'swap' | 'wallet' | 'more' | 'portfolio' | 'calendar' | 'pie' | 'trend' | 'building' | 'target' | 'signout'

function NavIcon({ name }: { name: NavIconName }) {
  const c = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'home':
      return <svg {...c}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 9.8V20h13V9.8" /></svg>
    case 'invoice':
      return <svg {...c}><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" /><line x1="9" y1="7" x2="15" y2="7" /><line x1="9" y1="11.5" x2="15" y2="11.5" /></svg>
    case 'swap':
      return <svg {...c}><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
    case 'wallet':
      return <svg {...c}><rect x="1" y="5" width="22" height="14" rx="2.5" /><path d="M1 9h22" /><circle cx="17.5" cy="14.5" r="1.3" fill="currentColor" stroke="none" /></svg>
    case 'more':
      return <svg {...c}><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>
    case 'portfolio':
      return <svg {...c}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
    case 'calendar':
      return <svg {...c}><rect x="3" y="4.5" width="18" height="17" rx="2" /><line x1="16" y1="2.5" x2="16" y2="6.5" /><line x1="8" y1="2.5" x2="8" y2="6.5" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
    case 'pie':
      return <svg {...c}><path d="M21.21 15.89A10 10 0 118 2.83" /><path d="M22 12A10 10 0 0012 2v10z" /></svg>
    case 'trend':
      return <svg {...c}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>
    case 'building':
      return <svg {...c}><path d="M4 21V7l8-4 8 4v14" /><path d="M3 21h18" /><line x1="9" y1="9.5" x2="9" y2="9.5" /><line x1="12" y1="21" x2="12" y2="15" /><line x1="9" y1="13" x2="9" y2="13" /><line x1="15" y1="13" x2="15" y2="13" /></svg>
    case 'target':
      return <svg {...c}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></svg>
    case 'signout':
      return <svg {...c}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
  }
}

export default function Layout() {
  const { signOut } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  // Close the More sheet automatically on navigation.
  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  const moreActive = MORE_LINKS.some((l) => location.pathname === l.to || location.pathname.startsWith(l.to + '/'))

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
        <ThemeSwitcher />
      </div>

      <main className="content">
        <Outlet />
      </main>

      <nav className="bottom-tabbar" aria-label="Primary">
        <div className="bottom-tabbar-row">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <NavIcon name={t.icon} />
              <span>{t.label}</span>
            </NavLink>
          ))}
          <button type="button" className={moreActive ? 'active' : ''} onClick={() => setMoreOpen(true)} aria-haspopup="true" aria-expanded={moreOpen}>
            <NavIcon name="more" />
            <span>More</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="more-sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="more-sheet-grabber" />
            <div className="more-sheet-grid">
              {MORE_LINKS.map((l) => (
                <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <NavIcon name={l.icon} />
                  <span>{l.label}</span>
                </NavLink>
              ))}
            </div>
            <div className="more-sheet-foot">
              <button className="signout" style={{ flex: 1 }} onClick={() => signOut()}>
                <NavIcon name="signout" /> Sign out
              </button>
              <ThemeSwitcher placement="up" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
