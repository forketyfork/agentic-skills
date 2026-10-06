/** decision: the agent chose something on its own; risk: something may be wrong; gap: something was skipped or not verified. */
export type FindingKind = 'decision' | 'risk' | 'gap'

export type Finding = {
  kind: FindingKind
  headline: string
  details: string
  nextStep: string
  isOpen: boolean
}

export type ReviewOutcome =
  | 'flagged'
  | 'clean'
  | 'muted'
  | 'malformed'
  | 'nothing-to-fork'
  | 'api-error'
  | 'empty-reply'
  | 'aborted'
  | 'failed'

export type ReviewRecord = {
  at: number
  outcome: ReviewOutcome
  detail?: string
}

declare module 'claude-code' {
  interface PluginState {
    'blind-spots': { finding: Finding | null; lastReview: ReviewRecord | null }
  }
}
