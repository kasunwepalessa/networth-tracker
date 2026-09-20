import { useEffect, useRef, useState } from 'react'
import { COLOR_THEMES, useTheme, type Mode } from '../lib/useTheme'

export default function ThemeSwitcher({ placement = 'down' }: { placement?: 'up' | 'down' }) {
  const { colorTheme, setColorTheme, mode, setMode } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="theme-switch-wrap" ref={ref}>
      <button className="icon-pill" onClick={() => setOpen((v) => !v)} aria-label="Change theme" title="Theme">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
          <path d="M12 2a10 10 0 100 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.3-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3c1.8 0 3.2-1.4 3.2-3.2C20.5 6.6 16.7 2 12 2z" />
        </svg>
      </button>
      {open && (
        <div className={`theme-pop${placement === 'up' ? ' theme-pop-up' : ''}`}>
          <p className="theme-pop-label">Color theme</p>
          <div className="theme-swatch-row">
            {COLOR_THEMES.map((t) => (
              <button
                key={t.id}
                className={`theme-swatch${colorTheme === t.id ? ' active' : ''}`}
                style={{ background: t.swatch }}
                title={t.label}
                aria-label={t.label}
                onClick={() => setColorTheme(t.id)}
              >
                {colorTheme === t.id && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </button>
            ))}
          </div>
          <p className="theme-pop-label">Appearance</p>
          <div className="mode-row">
            {(['light', 'system', 'dark'] as Mode[]).map((m) => (
              <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
                {m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'Auto'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
