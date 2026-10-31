import type { EngineResult, SessionState } from '../types'
import { isLlmConfigured, llmConfig } from './llmClient'
import { llmProvider } from './llmProvider'
import { scriptedProvider } from './scriptedProvider'

/**
 * Seam between the UI and whatever produces the tutor's next turn.
 *
 * Two implementations, one signature — and they are honestly different things:
 *
 * - `llmProvider`      the tutor. A model interprets what the learner wrote;
 *                      the policy controller decides what happens next.
 * - `scriptedProvider` a labelled demonstration of that behaviour, for running
 *                      without an API key. It recognises its scenario's lines
 *                      and says so plainly when it does not understand.
 *
 * A failing LLM call does NOT silently drop into the scripted demo — the
 * session is preserved and the learner is asked to retry, because scoring
 * someone's reasoning with a scripted walkthrough would be a lie about what
 * just happened.
 */
export interface ResponseProvider {
  name: string
  getNextResponse(state: SessionState, userMessage: string): Promise<EngineResult>
}

export { llmProvider, scriptedProvider }

export type ProviderMode = 'llm' | 'scripted'

function selectProvider(): ResponseProvider {
  if (isLlmConfigured()) return llmProvider

  if (llmConfig().enabled)
    console.warn(
      '[LeetUP] VITE_USE_LLM=true but VITE_LLM_API_KEY / VITE_LLM_API_URL / VITE_LLM_MODEL are not all set. ' +
        'Running the scripted demo instead. Copy .env.example to .env and fill it in.',
    )

  return scriptedProvider
}

export const activeProvider: ResponseProvider = selectProvider()

export const providerMode: ProviderMode =
  activeProvider.name === 'llm' ? 'llm' : 'scripted'
