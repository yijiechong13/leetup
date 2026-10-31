import { useEffect, useRef, useState } from 'react'
import { Mic, Play, SendHorizontal, Sparkles } from 'lucide-react'
import type { ChatMessage } from '../types'

/* Minimal inline renderer: **bold**, *bold*, `code`, and ```fenced``` blocks.
   Deliberately tiny — a markdown library would be overkill for a prototype.
   Single and double asterisks both read as bold: the dialogue content uses
   them interchangeably for emphasis, and there is no italic style here. */
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      )
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*'))
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-ink">
          {part.slice(1, -1)}
        </strong>
      )
    if (part.startsWith('`') && part.endsWith('`'))
      return (
        <code
          key={`${keyPrefix}-${i}`}
          className="rounded bg-canvas px-1 py-0.5 font-mono text-[12.5px]"
        >
          {part.slice(1, -1)}
        </code>
      )
    return <span key={`${keyPrefix}-${i}`}>{part}</span>
  })
}

function MessageBody({ message }: { message: ChatMessage }) {
  const blocks = message.text.split(/```(?:\w+)?\n?/)
  return (
    <>
      {blocks.map((block, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            className="scroll-thin my-1 overflow-x-auto rounded-md bg-ink px-3 py-2.5 font-mono text-[12.5px] leading-5 text-on-ink/90"
          >
            {block.replace(/\n$/, '')}
          </pre>
        ) : (
          block && (
            <p key={i} className="whitespace-pre-wrap">
              {renderInline(block, `${message.id}-${i}`)}
            </p>
          )
        ),
      )}
    </>
  )
}

const kindStyle: Record<string, string> = {
  hint: 'border-hint/40 bg-hint-soft',
  reveal: 'border-hint/40 bg-hint-soft',
  repair: 'border-line bg-surface',
  summary: 'border-accent/40 bg-accent-soft',
  /* Out-of-band: a demo-mode notice or a failed model call. Deliberately
     distinct from tutor speech so it is never mistaken for assessment. */
  notice: 'border-dashed border-ink-faint/50 bg-canvas',
}

const QUICK_REPLIES = ["I don't know", 'Give me a hint', 'Just give me the answer']

export function ChatPanel({
  messages,
  onSend,
  onStart,
  started,
  thinking,
  stageLabel,
  scripted,
  scriptedNextInput,
}: {
  messages: ChatMessage[]
  onSend: (text: string) => void
  onStart: () => void
  started: boolean
  thinking: boolean
  stageLabel: string
  scripted: boolean
  /** In demo mode, the line this scenario expects next. */
  scriptedNextInput: string | null
}) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, thinking])

  /* The textarea is disabled while the tutor composes, and disabling an element
     blurs it — so focus is restored once it is usable again, not at submit
     time, where the next render would immediately undo it. */
  useEffect(() => {
    if (started && !thinking) inputRef.current?.focus()
  }, [started, thinking])

  const submit = (text: string) => {
    const value = text.trim()
    if (!value || thinking || !started) return
    onSend(value)
    setDraft('')
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col rounded-lg border border-line bg-surface"
      aria-labelledby="chat-heading"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Sparkles className="size-4 text-ink-faint" />
        <h2
          id="chat-heading"
          className="text-[13px] font-semibold tracking-wide text-ink-soft uppercase"
        >
          Socratic session
        </h2>
        <span className="ml-auto rounded-full border border-line bg-canvas px-2.5 py-1 text-[11.5px] text-ink-soft">
          {stageLabel}
        </span>
      </header>

      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!started && (
          <div className="mx-auto mt-10 max-w-md text-center">
            <h3 className="text-[15px] font-semibold text-ink">
              Think before you solve.
            </h3>
            <p className="mt-2 text-[13.5px] leading-6 text-ink-soft">
              LeetUP is a Socratic CUI for guided algorithmic reasoning. Bring your own
              approach and explain it — the reasoning path on the right records what you
              show, and I ask about the gaps rather than a fixed list of questions.
            </p>
            {scripted && (
              <p className="mt-3 rounded-md border border-dashed border-ink-faint/50 bg-canvas px-3 py-2 text-[12.5px] leading-5 text-ink-faint">
                <span className="font-medium text-ink-soft">Scripted demo mode.</span>{' '}
                No API key configured, so this plays a fixed walkthrough and
                recognises only its own lines. Use the suggested line below each
                turn, or configure <code>.env</code> for a live tutor.
              </p>
            )}
            <button
              onClick={onStart}
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[13.5px] font-medium text-on-accent transition-colors hover:bg-accent/90"
            >
              <Play className="size-3.5" fill="currentColor" />
              Start guided session
            </button>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((m) =>
            m.role === 'learner' ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[82%] rounded-lg rounded-br-sm bg-ink px-3.5 py-2.5 text-[13.5px] leading-6 text-on-ink">
                  <p className="whitespace-pre-wrap">{m.text}</p>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex gap-2.5">
                <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-[10px] font-semibold text-ink-soft">
                  LU
                </div>
                <div
                  className={`max-w-[88%] space-y-2 rounded-lg rounded-tl-sm border px-3.5 py-2.5 text-[13.5px] leading-6 text-ink-soft ${
                    kindStyle[m.kind ?? 'question'] ?? 'border-line bg-surface'
                  }`}
                >
                  <MessageBody message={m} />
                </div>
              </div>
            ),
          )}

          {thinking && (
            <div className="flex gap-2.5">
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-[10px] font-semibold text-ink-soft">
                LU
              </div>
              <div className="flex items-center gap-1 rounded-lg rounded-tl-sm border border-line px-3.5 py-3">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 animate-pulse rounded-full bg-ink-faint"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-line px-4 py-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {scripted && scriptedNextInput ? (
            <button
              disabled={!started || thinking}
              onClick={() => submit(scriptedNextInput)}
              title={scriptedNextInput}
              className="max-w-full truncate rounded-full border border-dashed border-ink-faint/60 bg-canvas px-2.5 py-1 text-left text-[12px] text-ink-soft transition-colors hover:border-ink-faint disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next demo line: “{scriptedNextInput}”
            </button>
          ) : (
          QUICK_REPLIES.map((q) => (
            <button
              key={q}
              disabled={!started || thinking}
              onClick={() => submit(q)}
              className="rounded-full border border-line bg-canvas px-2.5 py-1 text-[12px] text-ink-soft transition-colors hover:border-ink-faint disabled:cursor-not-allowed disabled:opacity-50"
            >
              {q}
            </button>
          )))}
        </div>

        <div className="flex items-end gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 focus-within:border-ink-faint">
          <button
            type="button"
            disabled
            title="Voice input — planned extension, not implemented in this prototype"
            className="mb-0.5 cursor-not-allowed rounded-md p-1.5 text-ink-faint opacity-50"
            aria-label="Voice input (future extension)"
          >
            <Mic className="size-4" />
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={!started || thinking}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit(draft)
              }
            }}
            placeholder={
              started ? 'Type your reasoning…' : 'Start the session to begin'
            }
            className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[13.5px] leading-6 text-ink outline-none placeholder:text-ink-faint disabled:cursor-not-allowed"
          />
          <button
            onClick={() => submit(draft)}
            disabled={!started || thinking || !draft.trim()}
            className="mb-0.5 rounded-md bg-accent p-1.5 text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
            aria-label="Send"
          >
            <SendHorizontal className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[11.5px] text-ink-faint">
          Enter to send · Shift+Enter for a new line · voice input is a planned extension
        </p>
      </div>
    </section>
  )
}
