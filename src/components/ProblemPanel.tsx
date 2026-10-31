import { BookOpen } from 'lucide-react'
import type { CuratedProblem } from '../types'

const difficultyClass: Record<CuratedProblem['difficulty'], string> = {
  Easy: 'bg-easy/10 text-easy',
  Medium: 'bg-hint/10 text-hint',
  Hard: 'bg-red-50 text-red-600',
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

        <p className="mt-3 text-[14px] leading-6 text-ink-soft">{problem.statement}</p>

        <h4 className="mt-5 text-[13px] font-semibold text-ink">Example</h4>
        <div className="mt-2 rounded-md bg-canvas px-3 py-2.5 font-mono text-[12.5px] leading-6 text-ink-soft">
          <div>
            <span className="text-ink-faint">Input: </span>
            {problem.example.input}
          </div>
          <div>
            <span className="text-ink-faint">Output: </span>
            {problem.example.output}
          </div>
          {problem.example.explanation && (
            <div className="mt-1 font-sans text-[12.5px] text-ink-faint">
              {problem.example.explanation}
            </div>
          )}
        </div>

        <h4 className="mt-5 text-[13px] font-semibold text-ink">Constraints</h4>
        <ul className="mt-2 space-y-1.5">
          {problem.constraints.map((c) => (
            <li
              key={c}
              className="flex gap-2 font-mono text-[12.5px] leading-5 text-ink-soft"
            >
              <span className="text-ink-faint">•</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>

        <p className="mt-6 border-t border-line pt-3 text-[12px] leading-5 text-ink-faint">
          Curated LeetCode-style problem from LeetUP's local problem bank — nothing is
          fetched from LeetCode. The panel stays pinned so you never have to scroll the
          conversation to re-read the question.
        </p>
      </div>
    </section>
  )
}
