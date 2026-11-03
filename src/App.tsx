import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, RotateCcw } from 'lucide-react'
import { ProblemPanel } from './components/ProblemPanel'
import { ChatPanel } from './components/ChatPanel'
import { ReasoningChecklist } from './components/ReasoningChecklist'
import { ResizeHandle } from './components/ResizeHandle'
import { ThemeToggle } from './components/ThemeToggle'
import { useTheme } from './lib/theme'
import { usePanelSizes } from './lib/usePanelSizes'
import { getProblem } from './data/problemBank'
import {
  coreProgress,
  createSession,
  getChecklist,
  startSession,
} from './lib/session'
import { activeProvider } from './lib/responseProvider'
import { exportSession, logTurn, type TurnLog } from './lib/exportLog'
import type { ChatMessage, SessionState } from './types'

/** Small pause so the turn-taking reads as a conversation, not a form submit. */
const THINKING_MS = 420

export default function App() {
  const [state, setState] = useState<SessionState>(() =>
    startSession(createSession()).updatedState,
  )
  const [thinking, setThinking] = useState(false)
  const [pending, setPending] = useState<ChatMessage | null>(null)
  // Per-turn test log; kept beside the session, not in it.
  const [turns, setTurns] = useState<TurnLog[]>([])
  const { theme, setTheme } = useTheme()

  // Panels are only resizable in the side-by-side (lg) layout; below that they
  // stack full-width and the pixel widths are ignored.
  const mainRef = useRef<HTMLElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [isWide, setIsWide] = useState(
    () => window.matchMedia('(min-width: 1024px)').matches,
  )
  const { sizes, beginDrag, dragBy, nudge, reset } =
    usePanelSizes(containerWidth)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => setIsWide(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) =>
      setContainerWidth(entry.contentRect.width),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const problem = useMemo(() => getProblem(state.problemId), [state.problemId])
  const checklist = useMemo(() => getChecklist(state), [state])
  const progress = useMemo(() => coreProgress(state), [state])

  const handleSend = async (text: string) => {
    // Echo the learner's message right away; the provider only adds it to
    // state once the model has replied.
    setPending({
      id: `pending-${Date.now()}`,
      role: 'learner',
      text,
      area: state.focusArea ?? 'system',
    })
    setThinking(true)
    const result = await activeProvider.getNextResponse(state, text)
    const entry = logTurn(result.updatedState, text, result.assistantMessages, result.trace)
    window.setTimeout(() => {
      setState(result.updatedState)
      setTurns((log) => [...log, entry])
      setPending(null)
      setThinking(false)
    }, THINKING_MS)
  }

  const handleReset = () => {
    setState(startSession(createSession(state.problemId)).updatedState)
    setPending(null)
    setThinking(false)
    setTurns([])
  }

  const messages = pending ? [...state.messages, pending] : state.messages

  return (
    <div className="flex h-full min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-[17px] font-semibold tracking-tight text-ink">
              Leet<span className="text-accent">UP</span>
            </h1>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle theme={theme} onChange={setTheme} />
            {(['md', 'json'] as const).map((format) => (
              <button
                key={format}
                onClick={() => void exportSession(state, turns, format)}
                disabled={turns.length === 0}
                title={`Download this session as ${format === 'md' ? 'Markdown' : 'JSON'}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:border-ink-faint hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="size-3.5" />
                Export {format === 'md' ? 'MD' : 'JSON'}
              </button>
            ))}
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
            >
              <RotateCcw className="size-3.5" />
              Reset session
            </button>
          </div>
        </div>
      </header>

      <main
        ref={mainRef}
        className="flex w-full flex-1 flex-col gap-4 p-4 lg:h-[calc(100vh-57px)] lg:flex-row lg:gap-0 lg:overflow-hidden"
      >
        <div
          className="min-h-0 lg:h-full lg:shrink-0 lg:overflow-hidden"
          hidden={isWide && sizes.left === 0}
          style={isWide ? { width: sizes.left } : undefined}
        >
          <div className="h-full max-h-[60vh] lg:max-h-none">
            <ProblemPanel problem={problem} />
          </div>
        </div>

        <ResizeHandle
          label="Resize problem panel"
          collapsed={sizes.left === 0}
          onDragStart={beginDrag}
          onDrag={(dx) => dragBy('left', dx)}
          onNudge={(dx) => nudge('left', dx)}
          onReset={() => reset('left')}
        />

        <div className="min-h-[60vh] lg:h-full lg:min-w-0 lg:flex-1 lg:min-h-0">
          <ChatPanel
            messages={messages}
            onSend={handleSend}
            thinking={thinking}
          />
        </div>

        <ResizeHandle
          label="Resize reasoning panel"
          collapsed={sizes.right === 0}
          onDragStart={beginDrag}
          onDrag={(dx) => dragBy('right', dx)}
          onNudge={(dx) => nudge('right', dx)}
          onReset={() => reset('right')}
        />

        <div
          className="min-h-0 lg:h-full lg:shrink-0 lg:overflow-hidden"
          hidden={isWide && sizes.right === 0}
          style={isWide ? { width: sizes.right } : undefined}
        >
          <div className="h-full max-h-[60vh] lg:max-h-none">
            <ReasoningChecklist
              items={checklist}
              approachName={state.selectedApproach?.name ?? null}
              coreDone={progress.done}
              coreTotal={progress.total}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
