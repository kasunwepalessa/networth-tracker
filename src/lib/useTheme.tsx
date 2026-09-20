import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ColorTheme = 'quixotic' | 'indigo' | 'sunset'
export type Mode = 'system' | 'light' | 'dark'

export const COLOR_THEMES: { id: ColorTheme; label: string; swatch: string }[] = [
  { id: 'quixotic', label: 'Quixotic Green', swatch: '#1f9d63' },
  { id: 'indigo', label: 'Indigo Classic', swatch: '#3B4F8A' },
  { id: 'sunset', label: 'Sunset Amber', swatch: '#c8632c' },
]

interface ThemeState {
  colorTheme: ColorTheme
  mode: Mode
  setColorTheme: (t: ColorTheme) => void
  setMode: (m: Mode) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

const CT_KEY = 'nw-color-theme'
const MODE_KEY = 'nw-mode'

function readColorTheme(): ColorTheme {
  const v = localStorage.getItem(CT_KEY)
  return v === 'indigo' || v === 'sunset' || v === 'quixotic' ? v : 'quixotic'
}
function readMode(): Mode {
  const v = localStorage.getItem(MODE_KEY)
  // Default to the light theme (matching the reference design) until the person explicitly
  // picks Auto or Dark from the switcher — after that, their choice is remembered.
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorTheme, setColorTheme] = useState<ColorTheme>(readColorTheme)
  const [mode, setMode] = useState<Mode>(readMode)

  useEffect(() => {
    document.documentElement.setAttribute('data-color-theme', colorTheme)
    try { localStorage.setItem(CT_KEY, colorTheme) } catch { /* ignore */ }
  }, [colorTheme])

  useEffect(() => {
    if (mode === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', mode)
    try { localStorage.setItem(MODE_KEY, mode) } catch { /* ignore */ }
  }, [mode])

  return (
    <ThemeContext.Provider value={{ colorTheme, mode, setColorTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
