import type { ChatMessage, SessionState } from '../types'
import { getProblem } from '../data/problemBank'
import { matchApproach } from './reasoningAreas'
import { applyEvidence, createMessage } from './session'
import {
  buildSummaryText,
  referenceFor,
  referenceUnavailableMessage,
} from './summary'
import { getScenario, type ScenarioBeat } from './scenarios'
import type { ResponseProvider } from './responseProvider'

/**
 * Scripted demo provider.
 *
 * This plays a *labelled demonstration*, not a tutor. It recognises the
 * scripted learner inputs for the selected scenario and nothing else. That
 * limitation is the honest part: an off-script message gets a notice saying so
 * and records no evidence, rather than being quietly scored as understanding.
 *
 * The evidence updates come from the scenario, including the support level, so
 * the checklist reflects what the demonstration actually shows.
 */

/**
 * Canonical form for comparing a submitted line against the script.
 *
 * Forgiving about presentation only — case, spacing, and the several
 * characters that get used as an apostrophe. Every word survives, so a negation ("I would NOT
 * keep a map") can never canonicalise to the line it contradicts.
 */
export function canonical(text: string): string {
  return text
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Does this message match the beat?
 *
 * Exact match on the canonical form, or on one of the beat's authored
 * alternatives. Word-overlap scoring was tried and removed: it accepted "map"
 * as a full hash-map explanation, and accepted a sentence that negated the
 * script, because overlap cannot tell agreement from contradiction.
 */
export function matchesBeat(message: string, beat: ScenarioBeat): boolean {
  const said = canonical(message)
  if (!said) return false
  return [beat.input, ...(beat.accepts ?? [])].some(
    (accepted) => canonical(accepted) === said,
  )
}

/**
 * Quotes must come from what the learner actually submitted.
 *
 * When they typed the canonical line, the authored quote IS their text. When
 * they used an accepted variant that does not contain it, the authored quote
 * would be words they never wrote, so their own message is recorded instead.
 */
function resolveQuote(authored: string | undefined, submitted: string): string {
  const trimmed = submitted.trim()
  if (!authored) return trimmed
  return canonical(submitted).includes(canonical(authored)) ? authored : trimmed
}

function offScriptNotice(beat: ScenarioBeat | undefined, scenarioLabel: string) {
  if (!beat)
    return `This scripted demo (${scenarioLabel}) has reached its end. Pick another scenario from the header, or reset to run it again.`

  return [
    `**Demo mode.** This is a scripted scenario (${scenarioLabel}), not live assessment — I only recognise this walkthrough's lines, and I won't pretend to have understood something else.`,
    '',
    'The next line in this scenario is:',
    `> ${beat.input}`,
    '',
    'For a tutor that reads what you actually write, set `VITE_USE_LLM=true` and configure `.env`.',
  ].join('\n')
}

export const scriptedProvider: ResponseProvider = {
  name: 'scripted',

  async getNextResponse(state, userMessage) {
    const problem = getProblem(state.problemId)
    const scenario = getScenario(state.scenarioId)
    const beat: ScenarioBeat | undefined = scenario.beats[state.scenarioStep]

    const withLearner: SessionState = {
      ...state,
      turn: state.turn + 1,
      messages: [
        ...state.messages,
        createMessage('learner', userMessage, state.focusArea ?? 'system'),
      ],
      learnerResponses: [
        ...state.learnerResponses,
        {
          area: state.focusArea ?? 'system',
          turn: state.turn + 1,
          text: userMessage,
        },
      ],
    }

    /* Off script: say so, record nothing, and leave the position alone. */
    if (!beat || !matchesBeat(userMessage, beat)) {
      const notice = createMessage(
        'assistant',
        offScriptNotice(beat, scenario.label),
        'system',
        'notice',
      )
      return {
        assistantMessages: [notice],
        updatedState: {
          ...withLearner,
          messages: [...withLearner.messages, notice],
        },
      }
    }

    /* On script: apply the authored evidence and play the beat. Quotes are
       re-resolved against what was actually submitted. */
    let next = applyEvidence(
      withLearner,
      (beat.evidence ?? []).map((update) => ({
        ...update,
        quote: update.quote
          ? resolveQuote(update.quote, userMessage)
          : undefined,
      })),
    )

    if (beat.approach) {
      const matched = matchApproach(problem, beat.approach)
      next = {
        ...next,
        selectedApproach: {
          name: matched?.name ?? beat.approach,
          recognised: matched !== null,
          changedFrom:
            next.selectedApproach && next.selectedApproach.name !== beat.approach
              ? next.selectedApproach.name
              : null,
          selectedAtTurn: next.turn,
        },
      }
    }

    if (beat.attention)
      next = { ...next, attention: { ...next.attention, ...beat.attention } }

    if (beat.assistance)
      next = { ...next, assistance: { ...next.assistance, ...beat.assistance } }

    next = {
      ...next,
      focusArea: beat.focus,
      phase: beat.complete ? 'complete' : next.phase,
      scenarioStep: state.scenarioStep + 1,
    }

    const out: ChatMessage[] = []

    if (beat.summarise) {
      out.push(
        createMessage('assistant', buildSummaryText(next, problem), 'summary', 'summary'),
      )
      out.push(
        createMessage(
          'assistant',
          'Would you like to see a reference implementation of your approach?',
          'summary',
          'feedback',
        ),
      )
    } else if (beat.reference) {
      const reference = referenceFor(next, problem)
      if (reference) {
        out.push(
          createMessage(
            'assistant',
            `Here is a reference implementation of **${reference.name}** — the approach you worked through. Read it against your own explanation:`,
            'summary',
            'reveal',
          ),
        )
        out.push(
          createMessage(
            'assistant',
            '```python\n' + reference.code + '\n```',
            'summary',
            'reveal',
          ),
        )
      } else {
        out.push(
          createMessage(
            'assistant',
            referenceUnavailableMessage(next, problem),
            'summary',
            'feedback',
          ),
        )
      }
    } else {
      for (const reply of beat.replies ?? [])
        out.push(
          createMessage(
            'assistant',
            reply.text,
            beat.focus ?? 'system',
            reply.kind ?? 'question',
          ),
        )
    }

    return {
      assistantMessages: out,
      updatedState: { ...next, messages: [...next.messages, ...out] },
    }
  },
}
