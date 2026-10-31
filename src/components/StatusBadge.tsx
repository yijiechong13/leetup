import { Check, CircleDashed, Dot, HelpCircle, RotateCcw } from 'lucide-react'
import type { AreaDisplayStatus } from '../lib/session'

/**
 * Status vocabulary for the reasoning record.
 *
 * The distinction that matters is between "explained" and "explained with
 * help": completing the activity and demonstrating independent understanding
 * are different things, and the panel says which one happened.
 */
const styles: Record<
  AreaDisplayStatus,
  { label: string; dot: string; text: string; chip: string }
> = {
  unaddressed: {
    label: 'Not yet',
    dot: 'border-line text-ink-faint bg-surface',
    text: 'text-ink-faint',
    chip: 'bg-canvas text-ink-faint border-line',
  },
  focus: {
    label: 'In focus',
    dot: 'border-hint text-hint bg-hint-soft',
    text: 'text-ink font-medium',
    chip: 'bg-hint-soft text-hint border-hint/30',
  },
  partial: {
    label: 'Partly',
    dot: 'border-hint/50 text-hint bg-surface',
    text: 'text-ink-soft',
    chip: 'bg-hint-soft/60 text-hint border-hint/20',
  },
  independent: {
    label: 'Explained',
    dot: 'border-accent text-on-accent bg-accent',
    text: 'text-ink-soft',
    chip: 'bg-accent-soft text-accent border-accent/30',
  },
  supported: {
    label: 'With help',
    dot: 'border-accent/50 text-accent bg-accent-soft',
    text: 'text-ink-soft',
    chip: 'bg-accent-soft/70 text-accent border-accent/20',
  },
  revisit: {
    label: 'Revisit',
    dot: 'border-revise text-revise bg-revise-soft',
    text: 'text-ink-soft',
    chip: 'bg-revise-soft text-revise border-revise/30',
  },
}

export function StatusChip({ status }: { status: AreaDisplayStatus }) {
  const s = styles[status]
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] leading-4 ${s.chip}`}
    >
      {s.label}
    </span>
  )
}

export function StatusDot({ status }: { status: AreaDisplayStatus }) {
  const s = styles[status]
  const Icon =
    status === 'independent' || status === 'supported'
      ? Check
      : status === 'revisit'
        ? RotateCcw
        : status === 'focus'
          ? Dot
          : status === 'partial'
            ? HelpCircle
            : CircleDashed

  return (
    <span
      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${s.dot}`}
      aria-hidden
    >
      <Icon
        className={status === 'focus' ? 'size-5' : 'size-3'}
        strokeWidth={status === 'independent' ? 3 : 2}
      />
    </span>
  )
}

export const statusTextClass = (status: AreaDisplayStatus) => styles[status].text
