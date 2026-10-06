/**
 * decision: the agent chose something on its own; risk: something may be wrong;
 * gap: something was skipped or not verified; concept: something the user should understand.
 */
export type FindingKind = 'decision' | 'risk' | 'gap' | 'concept'

export type Finding = {
  /** Identifies the finding a banner action was drawn for, so a stale press cannot touch a newer one. */
  id: string
  kind: FindingKind
  headline: string
  details: string
  nextStep: string
  isOpen: boolean
  wasOpened: boolean
  /** Prompts the user sent while the finding stood unopened. */
  promptsUnread: number
}

/** engaged: opened or asked about; rejected: muted unopened; ignored: closed, expired or replaced unopened. */
export type Fate = 'engaged' | 'ignored' | 'rejected'

export type Reaction = { kind: FindingKind; fate: Fate; at: number }

/** How much the review threshold is raised for one project; it decays with time since `changedAt`. */
export type QuietEntry = { level: number; changedAt: number }

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
    'blind-spots': { finding: Finding | null; lastReview: ReviewRecord | null; lastAnswer: string | null }
  }
}
