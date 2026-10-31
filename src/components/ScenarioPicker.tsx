import { FlaskConical } from 'lucide-react'
import { SCENARIOS } from '../lib/scenarios'

/**
 * Scenario selector, shown only in scripted demo mode.
 *
 * Visible and labelled on purpose: the learner should never be in doubt about
 * whether they are talking to a tutor that read what they wrote, or watching a
 * scripted walkthrough.
 */
export function ScenarioPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  return (
    <label className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] text-ink-soft">
      <FlaskConical className="size-3.5 text-ink-faint" />
      <span className="hidden text-ink-faint sm:inline">Demo</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Demo scenario"
        className="cursor-pointer bg-transparent text-[12px] text-ink-soft outline-none"
      >
        {SCENARIOS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  )
}
