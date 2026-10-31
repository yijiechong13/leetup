import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'leetup:panels'

export const DEFAULT_SIZES = { left: 340, right: 330 }

/** The chat column never gets squeezed below this, so it stays readable. */
const CENTER_MIN = 320

/**
 * Below this a side panel snaps shut, LeetCode-style, rather than lingering as
 * an unusable sliver. Dragging back past it pops the panel open again.
 */
const COLLAPSE_AT = 150

export type PanelSide = 'left' | 'right'
export type PanelSizes = { left: number; right: number }

function readStored(): PanelSizes {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PanelSizes>
      if (typeof parsed.left === 'number' && typeof parsed.right === 'number') {
        return { left: Math.max(0, parsed.left), right: Math.max(0, parsed.right) }
      }
    }
  } catch {
    /* blocked storage or stale shape — fall back to the defaults */
  }
  return DEFAULT_SIZES
}

/**
 * Pixel widths for the two outer columns of the desktop layout, persisted.
 * A column can be pulled from fully collapsed out to the edge of the chat
 * column's minimum — the only limit in play.
 */
export function usePanelSizes(containerWidth: number) {
  const [sizes, setSizes] = useState<PanelSizes>(readStored)
  /** Widths captured at pointer-down, so a drag is absolute, not incremental. */
  const dragStart = useRef<PanelSizes | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes))
    } catch {
      /* not fatal: the layout just won't survive a reload */
    }
  }, [sizes])

  const apply = useCallback(
    (side: PanelSide, next: number, from: PanelSizes) => {
      const other = side === 'left' ? from.right : from.left
      const max = containerWidth
        ? Math.max(0, containerWidth - other - CENTER_MIN)
        : next
      const width = next < COLLAPSE_AT ? 0 : Math.min(next, max)
      setSizes({ ...from, [side]: width })
    },
    [containerWidth],
  )

  const beginDrag = useCallback(() => {
    dragStart.current = sizes
  }, [sizes])

  /** Drag deltas are signed in screen space; the right column grows leftwards. */
  const dragBy = useCallback(
    (side: PanelSide, deltaX: number) => {
      const from = dragStart.current ?? sizes
      apply(side, from[side] + (side === 'left' ? deltaX : -deltaX), from)
    },
    [apply, sizes],
  )

  const nudge = useCallback(
    (side: PanelSide, deltaX: number) => {
      apply(side, sizes[side] + (side === 'left' ? deltaX : -deltaX), sizes)
    },
    [apply, sizes],
  )

  /** Double-click / Enter: restore the default, or reopen a collapsed panel. */
  const reset = useCallback(
    (side: PanelSide) =>
      setSizes((s) => ({ ...s, [side]: DEFAULT_SIZES[side] })),
    [],
  )

  return { sizes, beginDrag, dragBy, nudge, reset }
}
