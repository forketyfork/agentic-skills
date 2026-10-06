import type { FindingKind } from '../types'

export const MAX_MUTED = 100
export const MAX_RECENT = 10

export const KINDS: readonly FindingKind[] = ['decision', 'risk', 'gap', 'concept']

export type Verdict =
  | { kind: 'clean' }
  | { kind: 'malformed'; reason: string }
  | { kind: 'flagged'; finding: { kind: FindingKind; headline: string; details: string; nextStep: string } }

export function isReviewDue(toolCalls: number, threshold: number, isReviewing: boolean): boolean {
  return !isReviewing && toolCalls >= threshold
}

/** Two headlines that differ only in case, punctuation or spacing name one topic. */
export function topicKey(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function mentions(list: readonly string[], headline: string): boolean {
  const key = topicKey(headline)

  return list.some(one => topicKey(one) === key)
}

export function withTopic(list: readonly string[], headline: string, limit: number): string[] {
  return [...list.filter(one => topicKey(one) !== topicKey(headline)), headline].slice(-limit)
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []
}

function field(record: Record<string, unknown>, name: string): string {
  const value = record[name]

  return typeof value === 'string' ? value.trim() : ''
}

/** The reviewer is asked for bare JSON, but a fenced block or a sentence around it is tolerated. */
export function readVerdict(text: string): Verdict {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end < start) return { kind: 'malformed', reason: 'no JSON object in the reply' }

  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch (error) {
    return { kind: 'malformed', reason: `invalid JSON: ${String(error)}` }
  }
  if (typeof parsed !== 'object' || parsed === null) return { kind: 'malformed', reason: 'not an object' }

  const record = parsed as Record<string, unknown>
  if (record.flag === false) return { kind: 'clean' }
  if (record.flag !== true) return { kind: 'malformed', reason: '"flag" is neither true nor false' }

  const kind = field(record, 'kind') as FindingKind
  if (!KINDS.includes(kind)) return { kind: 'malformed', reason: `unknown kind "${kind}"` }

  const headline = field(record, 'headline')
  const details = field(record, 'details')
  const nextStep = field(record, 'next_step')
  if (headline === '' || details === '' || nextStep === '') {
    return { kind: 'malformed', reason: 'headline, details or next_step is empty' }
  }

  return { kind: 'flagged', finding: { kind, headline, details, nextStep } }
}

function listed(title: string, items: readonly string[]): string {
  return items.length === 0 ? '' : `\n${title}\n${items.map(item => `- ${item}`).join('\n')}\n`
}

export function reviewPrompt(
  recent: readonly string[],
  muted: readonly string[],
  reactions: readonly string[],
  lastAnswer: string | null,
): string {
  // The forked request ends where the latest turn's last model request did, before its reply.
  const finalAnswer =
    lastAnswer === null
      ? ''
      : `The conversation above stops just before your final reply of the latest turn. That reply was:\n<final_reply>\n${lastAnswer}\n</final_reply>\nReview it together with the work. People skim long replies: a decision, caveat or risk stated in this reply, even clearly, can still be the one thing to put in front of the user. Do not skip a point just because the reply already mentions it.\n`

  const calibration =
    reactions.length === 0
      ? ''
      : `\nHow the user reacted to recent findings, by kind (engaged: opened or asked about it; ignored: closed or left unread; muted: asked never to see it again):\n${reactions.map(line => `- ${line}`).join('\n')}\nFor a kind the user mostly ignores or mutes, raise one only if it is exceptionally important. Kinds they engage with are welcome.\n`

  return `[blind-spots review: an automated request from a Claude Code plugin, not a message the user typed]

Stop working on the task. For this one reply you are a reviewer, not the assistant above. Tool calls are disabled and the main session will not see your answer; only the user will, in a one-line banner above their prompt.

The user is busy, switches between tasks, and skims. The banner is their takeaway from this work: the single thing they most need to know before they move on, whether it is buried in the tool calls or sits in plain sight in the final reply.

${finalAnswer}
Look back at the work done in this conversation, especially the latest turn, and pick the one thing the user should not miss. It is one of:
- decision: you (the assistant) picked an approach, default, scope cut or trade-off on your own, and the user never weighed in on it.
- risk: something in the result may be wrong, fragile or unsafe: a failing or skipped check, an assumption you could not confirm, a change with side effects outside what was asked.
- gap: something the user probably believes is done but is not: a step left out, a test not run, a TODO, a disabled feature, an unverified claim.
- concept: a system, mechanism or design that shapes this work and that the user has not shown they understand: judge from their own messages, not from what you explained. Raise it only if misunderstanding it would plausibly lead them to a wrong decision or wasted effort later; something merely interesting does not qualify.

Raise it only if ALL hold:
1. A reasonable user would want to know before they move on: ignoring it would plausibly cost real time, money, correctness or trust.
2. The user has not taken it up themselves: they did not ask about it, answer it, or discuss it in their own messages. What the assistant wrote does not count as the user knowing it, however prominently it was said.
3. The conversation itself supports it. Do not speculate beyond it.

Pick the single most important one; a concept wins only when there is no decision, risk or gap worth raising. A long turn that changed code or made choices usually has one point worth a line, but do not invent stakes: when nothing meets rule 1, raise nothing.
${listed('Already raised recently; do not raise these again:', recent)}${listed('The user muted these topics or said they already know them; never raise them:', muted)}${calibration}
Reply with ONE JSON object and nothing else, no code fence.

Nothing to raise:
{"flag": false, "reason": "..."}

Something to raise:
{"flag": true, "kind": ${KINDS.map(kind => `"${kind}"`).join(' | ')}, "headline": "...", "details": "...", "next_step": "...", "reason": "..."}

- reason: one sentence for the plugin's log, not shown in the banner: the strongest candidate you considered and why it did or did not clear the bar.
- headline: at most 12 words, the takeaway itself, written so that someone who reads nothing else still gets the point. It must make sense without having read the conversation. Name the concrete thing (the file, endpoint, flag, test).
- details: Markdown, at most 120 words. What happened, why it matters, and how sure you are. Define any term the user has not used themselves. Do not refer to "the second option" or similar; restate what you mean. For a concept, explain it from scratch with a small concrete example from this work.
- next_step: one short imperative sentence the user can act on (check, decide, ask for). For a concept, say where in their work it will matter.

Do not copy secrets, tokens, credentials or personal data from the conversation into the reply. Write the headline, details and next_step in the language the user writes in.`
}

export function askDraft(headline: string, nextStep: string): string {
  return `Your blind-spot reviewer raised: "${headline}". Its suggested next step: ${nextStep} Can you go over this with me?`
}
