import { ListChecks } from 'lucide-react'
import type { ChecklistItem } from '../lib/session'
import { StatusChip, StatusDot, statusTextClass } from './StatusBadge'

/**
 * The reasoning record.
 *
 * Not a queue of questions to get through: a record of what the learner has
 * shown and how they showed it. The order is not a syllabus — any one response
 * can move several areas at once, and the optional ones may never come up.
 */
export function ReasoningChecklist({
  items,
  approachName,
  coreDone,
  coreTotal,
}: {
  items: ChecklistItem[]
  approachName: string | null
  coreDone: number
  coreTotal: number
}) {
  const pct = Math.round((coreDone / coreTotal) * 100)

  return (
    <section
      className="flex h-full min-h-0 flex-col rounded-lg border border-line bg-surface"
      aria-labelledby="checklist-heading"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <ListChecks className="size-4 text-ink-faint" />
        <h2
          id="checklist-heading"
          className="text-[13px] font-semibold tracking-wide text-ink-soft uppercase"
        >
          Reasoning path
        </h2>
      </header>

      <div className="px-4 pt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {approachName && (
          <p className="mt-2 text-[12px] leading-4 text-ink-faint">
            Your approach: <span className="font-medium text-ink-soft">{approachName}</span>
          </p>
        )}
      </div>

      <ol className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {items.map((item) => (
          <li
            key={item.id}
            className={`rounded-md px-2 py-2 ${
              item.status === 'focus' ? 'bg-hint-soft/60' : ''
            }`}
            aria-current={item.status === 'focus' ? 'step' : undefined}
          >
            <div className="flex gap-2.5">
              <StatusDot status={item.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`text-[13.5px] leading-5 ${statusTextClass(item.status)}`}
                  >
                    {item.label}
                    {item.necessity === 'optional' && (
                      <span className="ml-1.5 text-[11px] text-ink-faint">
                        optional
                      </span>
                    )}
                  </span>
                  {item.status !== 'unaddressed' && (
                    <StatusChip status={item.status} />
                  )}
                </div>
                {item.status === 'focus' && (
                  <p className="mt-1 text-[12px] leading-4 text-ink-faint">
                    {item.goal}
                  </p>
                )}
                {item.gap && item.status === 'partial' && (
                  <p className="mt-1 text-[12px] leading-4 text-ink-faint">
                    Still open: {item.gap}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

    </section>
  )
}
