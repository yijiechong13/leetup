import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'leetup:theme'

function readStored(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark') return raw
  } catch {
    /* private mode / blocked storage — fall back to system */
  }
  return 'system'
}

function prefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

/**
 * Theme state with three settings; "system" leaves the root unstamped so the
 * `prefers-color-scheme` block in index.css takes over.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStored)
  const [systemDark, setSystemDark] = useState(prefersDark)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme

    try {
      if (theme === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* not fatal: the choice just won't survive a reload */
    }
  }, [theme])

  const resolved: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  /** Flip to the opposite of what is currently on screen. */
  const toggle = useCallback(
    () => setThemeState(resolved === 'dark' ? 'light' : 'dark'),
    [resolved],
  )

  return { theme, resolved, setTheme: setThemeState, toggle }
}
