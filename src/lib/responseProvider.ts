import type { EngineResult, SessionState } from '../types'
import { llmProvider } from './llmProvider'

/** The live tutor interprets learner text; policy code controls the response. */
export interface ResponseProvider {
  name: string
  getNextResponse(state: SessionState, userMessage: string): Promise<EngineResult>
}

export const activeProvider: ResponseProvider = llmProvider
