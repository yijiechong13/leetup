import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { ProblemPanel } from './components/ProblemPanel'
import { ChatPanel } from './components/ChatPanel'
import { ReasoningChecklist } from './components/ReasoningChecklist'
import { ResizeHandle } from './components/ResizeHandle'
import { ThemeToggle } from './components/ThemeToggle'
import { useTheme } from './lib/theme'
import { usePanelSizes } from './lib/usePanelSizes'
import { ScenarioPicker } from './components/ScenarioPicker'
import { getProblem } from './data/problemBank'
import {
  coreProgress,
  createSession,
  getChecklist,
  progressLabel,
  startSession,
} from './lib/session'
import { DEFAULT_SCENARIO_ID, getScenario } from './lib/scenarios'
import { activeProvider, providerMode } from './lib/responseProvider'
import type { SessionState } from './types'

/** Small pause so the turn-taking reads as a conversation, not a form submit. */
const THINKING_MS = 420

export default function App() {
  const scripted = providerMode === 'scripted'
  const [state, setState] = useState<SessionState>(() =>
    createSession(undefined, scripted ? DEFAULT_SCENARIO_ID : null),
  )
  const [thinking, setThinking] = useState(false)
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
  /* In demo mode the next scripted line is offered as a one-click reply, so the
     walkthrough is usable without copying text out of the README. */
  const scriptedNextInput = useMemo(
    () =>
      scripted && state.started
        ? (getScenario(state.scenarioId).beats[state.scenarioStep]?.input ?? null)
        : null,
    [scripted, state.started, state.scenarioId, state.scenarioStep],
  )

  const handleStart = () => setState((s) => startSession(s).updatedState)

  const handleSend = async (text: string) => {
    setThinking(true)
    // The provider is async because it may be an LLM call: responseProvider.ts
    // picks the LLM or scripted implementation, and this component neither
    // knows nor cares which one answered.
    const result = await activeProvider.getNextResponse(state, text)
    window.setTimeout(() => {
      setState(result.updatedState)
      setThinking(false)
    }, THINKING_MS)
  }

  const handleReset = () => {
    setState(createSession(state.problemId, state.scenarioId))
    setThinking(false)
  }

  /** Switching demo scenario restarts the session: the scripts are distinct. */
  const handleScenario = (scenarioId: string) => {
    setState(startSession(createSession(state.problemId, scenarioId)).updatedState)
    setThinking(false)
  }

  return (
    <div className="flex h-full min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-[17px] font-semibold tracking-tight text-ink">
              Leet<span className="text-accent">UP</span>
            </h1>
            <p className="hidden text-[13px] text-ink-soft sm:block">
              Think before you solve.
            </p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-[12px] text-ink-faint md:inline">
              {progress.done}/{progress.total} areas explained
            </span>
            {scripted && (
              <ScenarioPicker
                value={state.scenarioId ?? DEFAULT_SCENARIO_ID}
                onChange={handleScenario}
              />
            )}
            <ThemeToggle theme={theme} onChange={setTheme} />
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
            >
              <RotateCcw className="size-3.5" />
              Reset demo
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
            messages={state.messages}
            onSend={handleSend}
            onStart={handleStart}
            started={state.started}
            thinking={thinking}
            stageLabel={progressLabel(state)}
            scripted={scripted}
            scriptedNextInput={scriptedNextInput}
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
              complete={state.phase === 'complete'}
              coreDone={progress.done}
              coreTotal={progress.total}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
