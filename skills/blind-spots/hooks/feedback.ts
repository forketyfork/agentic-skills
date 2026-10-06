import type { Fate, Finding, FindingKind, QuietEntry, Reaction } from '../types'

export const MAX_QUIET_LEVEL = 3
export const MAX_REACTIONS = 30
export const MAX_PROJECTS = 50
/** An unopened finding expires, as ignored, once the user has sent this many prompts past it. */
export const PROMPTS_BEFORE_EXPIRY = 3

const DAY_MS = 24 * 60 * 60 * 1000

export type FindingEnd = 'closed' | 'muted' | 'asked' | 'expired' | 'replaced'

export function fateOf(finding: Finding, end: FindingEnd): Fate {
  if (finding.wasOpened || end === 'asked') return 'engaged'

  return end === 'muted' ? 'rejected' : 'ignored'
}

/** The stored level loses one step per full day since it last changed. */
export function effectiveLevel(entry: QuietEntry | undefined, now: number): number {
  if (entry === undefined) return 0
  const decayed = entry.level - Math.floor(Math.max(0, now - entry.changedAt) / DAY_MS)

  return Math.min(MAX_QUIET_LEVEL, Math.max(0, decayed))
}

export function afterFate(entry: QuietEntry | undefined, fate: Fate, now: number): QuietEntry {
  const level = effectiveLevel(entry, now)
  const next = fate === 'engaged' ? level - 1 : level + 1

  return { level: Math.min(MAX_QUIET_LEVEL, Math.max(0, next)), changedAt: now }
}

export function reviewThreshold(minToolCalls: number, level: number): number {
  return minToolCalls * 2 ** level
}

export function reactions(value: unknown): Reaction[] {
  return Array.isArray(value)
    ? value.filter(
        (one): one is Reaction =>
          typeof one === 'object' && one !== null && typeof one.kind === 'string' && typeof one.fate === 'string',
      )
    : []
}

export function withReaction(list: readonly Reaction[], reaction: Reaction): Reaction[] {
  return [...list, reaction].slice(-MAX_REACTIONS)
}

export type QuietMap = Record<string, QuietEntry>

export function quietMap(value: unknown): QuietMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as QuietMap) : {}
}

/** Keeps the most recently changed projects so the store does not grow without bound. */
export function withQuiet(map: QuietMap, root: string, entry: QuietEntry): QuietMap {
  const entries = Object.entries({ ...map, [root]: entry })
    .sort(([, a], [, b]) => b.changedAt - a.changedAt)
    .slice(0, MAX_PROJECTS)

  return Object.fromEntries(entries)
}

const FATE_WORDS: Record<Fate, string> = { engaged: 'engaged', ignored: 'ignored', rejected: 'muted' }
const KIND_ORDER: readonly FindingKind[] = ['decision', 'risk', 'gap', 'concept']

/** One line per kind the user has reacted to, e.g. "concept: 1 engaged, 4 ignored". */
export function reactionSummary(list: readonly Reaction[]): string[] {
  return KIND_ORDER.flatMap(kind => {
    const ofKind = list.filter(one => one.kind === kind)
    if (ofKind.length === 0) return []
    const counts = (['engaged', 'ignored', 'rejected'] as const)
      .map(fate => [fate, ofKind.filter(one => one.fate === fate).length] as const)
      .filter(([, count]) => count > 0)
      .map(([fate, count]) => `${count} ${FATE_WORDS[fate]}`)

    return [`${kind}: ${counts.join(', ')}`]
  })
}
