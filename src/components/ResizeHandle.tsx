import { useRef } from 'react'

type Props = {
  /** Human label for the divider, e.g. "Problem panel width". */
  label: string
  /** Called once at pointer-down, to capture the widths the drag starts from. */
  onDragStart: () => void
  /** Called with the pointer delta (px) from where the drag started. */
  onDrag: (deltaX: number) => void
  /** Called on double-click and when the drag ends, to settle/reset. */
  onReset: () => void
  /** Keyboard nudge, in px; positive moves the divider right. */
  onNudge: (deltaX: number) => void
  /** When its panel is shut, the seam stays visible so it can be found again. */
  collapsed?: boolean
}

const NUDGE_PX = 16

/**
 * A 1px divider with a fat invisible grab area, so the panels can be pulled
 * wider without the seam itself becoming visual chrome.
 */
export function ResizeHandle({
  label,
  onDragStart,
  onDrag,
  onReset,
  onNudge,
  collapsed = false,
}: Props) {
  const startX = useRef(0)

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    startX.current = e.clientX
    onDragStart()
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    onDrag(e.clientX - startX.current)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onNudge(-NUDGE_PX)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onNudge(NUDGE_PX)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onReset()
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      className="group relative hidden w-4 shrink-0 cursor-col-resize touch-none self-stretch outline-none lg:block"
    >
      {/* The seam only shows on hover/focus, so it is not standing chrome —
          unless the panel is shut, when it is the only way back. */}
      <span
        className={`pointer-events-none absolute inset-y-2 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors group-hover:bg-ink-faint/50 group-focus-visible:bg-accent group-active:bg-accent ${
          collapsed ? 'bg-line' : 'bg-transparent'
        }`}
      />
    </div>
  )
}
