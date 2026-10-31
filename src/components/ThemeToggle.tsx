import { Monitor, Moon, Sun } from 'lucide-react'
import type { Theme } from '../lib/theme'

type Props = {
  theme: Theme
  onChange: (theme: Theme) => void
}

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

/** Three-way appearance switch: light, follow the OS, or dark. */
export function ThemeToggle({ theme, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="flex items-center gap-0.5 rounded-md border border-line p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => onChange(value)}
          className={`rounded p-1.5 transition-colors ${
            theme === value
              ? 'bg-canvas text-ink'
              : 'text-ink-faint hover:text-ink'
          }`}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  )
}
