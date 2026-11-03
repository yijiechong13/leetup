import { BookOpen } from 'lucide-react'
import type { CuratedProblem } from '../types'

const difficultyClass: Record<CuratedProblem['difficulty'], string> = {
  Easy: 'bg-easy/10 text-easy',
  Medium: 'bg-hint/10 text-hint',
  Hard: 'bg-red-50 text-red-600',
}

function highlightVariables(text: string, explanation = false) {
  const tokens = explanation
    ? /(\bnums\[[^\]]+\]|-?\d+\s*\+\s*-?\d+\s*=\s*-?\d+|\[\s*-?\d+(?:\s*,\s*-?\d+)*\s*\])/g
    : /(\bnums\b(?:\[[^\]]+\]|\.length\b)?|\btarget\b)/g
  return text.split(tokens).map((part, index) =>
    index % 2 === 1 ? (
      <code key={index} className="rounded border border-line bg-canvas px-1 py-0.5 font-mono text-[0.95em] font-medium text-ink">
        {part}
      </code>
    ) : part,
  )
}

export function ProblemPanel({ problem }: { problem: CuratedProblem }) {
  return (
    <section
      className="flex h-full min-h-0 flex-col rounded-lg border border-line bg-surface"
      aria-labelledby="problem-heading"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <BookOpen className="size-4 text-ink-faint" />
        <h2
          id="problem-heading"
          className="text-[13px] font-semibold tracking-wide text-ink-soft uppercase"
        >
          Problem
        </h2>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="text-[17px] font-semibold text-ink">{problem.title}</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${difficultyClass[problem.difficulty]}`}
          >
            {problem.difficulty}
          </span>
        </div>

        <p className="mt-3 text-[14px] leading-6 text-ink-soft">{highlightVariables(problem.statement)}</p>

        {problem.examples.map((example, index) => (
          <div key={index}>
            <h4 className="mt-5 text-[13px] font-semibold text-ink">Example {index + 1}:</h4>
            <div className="mt-3 text-[14px] leading-7 text-ink">
              <div><span className="font-sans font-semibold text-ink">Input: </span><code className="rounded border border-line bg-canvas px-1 py-0.5 font-mono font-medium text-ink">{example.input}</code></div>
              <div className="mt-3"><span className="font-sans font-semibold text-ink">Output: </span><code className="rounded border border-line bg-canvas px-1 py-0.5 font-mono font-medium text-ink">{example.output}</code></div>
              {example.explanation && (
                <div className="mt-3">
                  <p className="font-semibold">Explanation:</p>
                  <p className="mt-3">{highlightVariables(example.explanation, true)}</p>
                </div>
              )}
            </div>
          </div>
        ))}

        <h4 className="mt-5 text-[13px] font-semibold text-ink">Constraints</h4>
        <ul className="mt-2 space-y-1.5">
          {problem.constraints.map((c) => (
            <li
              key={c}
              className="flex gap-2 font-mono text-[12.5px] leading-5 text-ink-soft"
            >
              <span className="text-ink-faint">•</span>
              <span>{highlightVariables(c)}</span>
            </li>
          ))}
        </ul>

        {problem.followUp && (
          <>
            <h4 className="mt-5 text-[13px] font-semibold text-ink">Follow-up</h4>
            <p className="mt-2 text-[13.5px] leading-6 text-ink-soft">{problem.followUp}</p>
          </>
        )}
      </div>
    </section>
  )
}
