import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelForkResult, Register } from 'claude-code'

import type { Finding, FindingKind, ReviewOutcome, ReviewRecord } from '../types'
import {
  PROMPTS_BEFORE_EXPIRY,
  afterFate,
  effectiveLevel,
  fateOf,
  quietMap,
  reactionSummary,
  reactions,
  reviewThreshold,
  withQuiet,
  withReaction,
} from './feedback'
import type { FindingEnd } from './feedback'
import {
  MAX_MUTED,
  MAX_RECENT,
  askDraft,
  isReviewDue,
  mentions,
  readVerdict,
  reviewPrompt,
  strings,
  withTopic,
} from './review'

const finding = atom({ plugin: 'blind-spots', key: 'finding' } as const, null)
const lastReview = atom({ plugin: 'blind-spots', key: 'lastReview' } as const, null)

const DEFAULT_MIN_TOOL_CALLS = 8

const KIND_COLOR: Record<FindingKind, 'yellow' | 'red' | 'magenta' | 'cyan'> = {
  decision: 'yellow',
  risk: 'red',
  gap: 'magenta',
  concept: 'cyan',
}

const OUTCOME_TEXT: Record<ReviewOutcome, string> = {
  flagged: 'raised a blind spot',
  clean: 'nothing to raise',
  muted: 'the only finding was a recent or muted topic',
  malformed: 'the reviewer reply could not be read',
  'nothing-to-fork': 'nothing to review yet (no model response in this conversation)',
  'api-error': 'the model request failed',
  'empty-reply': 'the reviewer replied with no text',
  aborted: 'the review was cut short',
  failed: 'the review threw an error',
}

const USAGE = [
  'Usage: /blind-spots [status|review|unmute|reset]',
  '  status  when reviews run, how you reacted so far, and how the last review went (the default)',
  '  review  review the conversation right now',
  '  unmute  forget the muted and recently raised topics',
  '  reset   forget everything learned: muted topics, reactions and the back-off of every project',
].join('\n')

// Module variables start over on a hot reload: a turn in flight then simply goes unreviewed.
let isReviewing = false
const toolCallsByTurn = new Map<string, number>()

async function currentThreshold($: EngineInterface, minToolCalls: number): Promise<{ level: number; threshold: number }> {
  const quiet = quietMap(await $.store.get('quiet'))
  const level = effectiveLevel(quiet[await $.session.root()], Date.now())

  return { level, threshold: reviewThreshold(minToolCalls, level) }
}

/** Records how the user treated a finding: globally per kind, and as this project's back-off. */
async function recordFate($: EngineInterface, ended: Finding, end: FindingEnd) {
  const now = Date.now()
  const fate = fateOf(ended, end)
  await $.store.set('reactions', withReaction(reactions(await $.store.get('reactions')), { kind: ended.kind, fate, at: now }))

  const root = await $.session.root()
  const quiet = quietMap(await $.store.get('quiet'))
  await $.store.set('quiet', withQuiet(quiet, root, afterFate(quiet[root], fate, now)))
}

async function endFinding($: EngineInterface, end: FindingEnd) {
  const ended = await read($, finding)
  if (ended === null) return
  await update($, finding, () => null)
  await recordFate($, ended, end)
}

async function review($: EngineInterface): Promise<ReviewRecord> {
  isReviewing = true
  try {
    const recent = strings(await $.store.get('recent'))
    const muted = strings(await $.store.get('muted'))
    const summary = reactionSummary(reactions(await $.store.get('reactions')))
    const reply = await $.model.fork({ prompt: reviewPrompt(recent, muted, summary) })
    const record = await conclude($, reply)
    await update($, lastReview, () => record)

    return record
  } catch (error) {
    const record: ReviewRecord = { at: Date.now(), outcome: 'failed', detail: String(error) }
    await update($, lastReview, () => record)

    return record
  } finally {
    isReviewing = false
  }
}

async function conclude($: EngineInterface, reply: ModelForkResult): Promise<ReviewRecord> {
  const at = Date.now()
  if (!reply.isAnswered) {
    const detail = reply.reason === 'api-error' ? `HTTP ${reply.status ?? 'none'}, ${reply.error}` : undefined

    return { at, outcome: reply.reason, detail }
  }

  const verdict = readVerdict(reply.text)
  if (verdict.kind === 'clean') return { at, outcome: 'clean' }
  if (verdict.kind === 'malformed') return { at, outcome: 'malformed', detail: verdict.reason }

  // Read again: the user may have muted, unmuted or reset while the model was answering.
  const recent = strings(await $.store.get('recent'))
  const muted = strings(await $.store.get('muted'))
  const { headline } = verdict.finding
  if (mentions([...recent, ...muted], headline)) return { at, outcome: 'muted', detail: headline }

  await endFinding($, 'replaced')
  await $.store.set('recent', withTopic(recent, headline, MAX_RECENT))
  await update($, finding, () => ({ ...verdict.finding, isOpen: false, wasOpened: false, promptsUnread: 0 }))

  return { at, outcome: 'flagged', detail: headline }
}

async function mute($: EngineInterface, headline: string) {
  await $.store.set('muted', withTopic(strings(await $.store.get('muted')), headline, MAX_MUTED))
  await endFinding($, 'muted')
}

async function toggle($: EngineInterface) {
  await update($, finding, f => (f === null ? f : { ...f, isOpen: !f.isOpen, wasOpened: true }))
}

async function askClaude($: EngineInterface, shown: Finding) {
  const box = await $.prompt.read()
  if (box.text.trim() !== '') {
    $.ui.toast('blind-spots: the prompt box is not empty. Send or clear it first.')

    return
  }
  const filled = await $.prompt.fill({ text: askDraft(shown.headline, shown.nextStep) })
  if (!filled.isFilled) {
    $.ui.toast('blind-spots: could not put the question in the prompt box.')

    return
  }
  await endFinding($, 'asked')
}

async function countUnreadPrompt($: EngineInterface) {
  const shown = await read($, finding)
  if (shown === null || shown.wasOpened) return
  if (shown.promptsUnread + 1 >= PROMPTS_BEFORE_EXPIRY) {
    await endFinding($, 'expired')

    return
  }
  await update($, finding, f => (f === null ? f : { ...f, promptsUnread: f.promptsUnread + 1 }))
}

async function status($: EngineInterface, minToolCalls: number): Promise<string> {
  const muted = strings(await $.store.get('muted')).length
  const { level, threshold } = await currentThreshold($, minToolCalls)
  const summary = reactionSummary(reactions(await $.store.get('reactions')))
  const last = await read($, lastReview)

  return [
    `Reviews a turn once it ends with at least ${threshold} tool calls (base ${minToolCalls}, back-off level ${level} in this project); ${muted} topic(s) muted.`,
    summary.length === 0 ? 'No reactions recorded yet.' : `Your recent reactions: ${summary.join('; ')}.`,
    last === null ? 'No review has run in this session yet.' : `Last review: ${describe(last)}`,
  ].join('\n')
}

function describe(record: ReviewRecord): string {
  const when = new Date(record.at).toLocaleTimeString()
  const detail = record.detail === undefined ? '' : ` (${record.detail})`

  return `${when}: ${OUTCOME_TEXT[record.outcome]}${detail}`
}

export const register: Register = (on, options) => {
  const configured = Number(options.minToolCalls)
  const minToolCalls = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MIN_TOOL_CALLS

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'blind-spots',
      description: 'Review long turns for decisions, risks, gaps and concepts you may have missed',
      argumentHint: '[status|review|unmute|reset]',
    })

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId === undefined) {
      toolCallsByTurn.set(e.turnId, (toolCallsByTurn.get(e.turnId) ?? 0) + result.toolUses.length)
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result

    const toolCalls = toolCallsByTurn.get(e.turnId) ?? 0
    toolCallsByTurn.delete(e.turnId)
    if (e.reason !== 'answer') return result

    const { threshold } = await currentThreshold($, minToolCalls)
    if (isReviewDue(toolCalls, threshold, isReviewing)) {
      // Not awaited: the session is idle again and the review lands whenever it is ready.
      void review($)
    }

    return result
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer') await countUnreadPrompt($)

    return next(e)
  })

  on('command.run', { command: 'blind-spots' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'review') {
      if (isReviewing) return { text: 'A review is already running.' }

      return { text: describe(await review($)) }
    }

    if (arg === 'unmute') {
      await $.store.delete('muted')
      await $.store.delete('recent')

      return { text: 'Forgot the muted and recently raised topics.' }
    }

    if (arg === 'reset') {
      for (const key of ['muted', 'recent', 'reactions', 'quiet']) await $.store.delete(key)

      return { text: 'Forgot the muted topics, your reactions and the back-off of every project.' }
    }

    if (arg === '' || arg === 'status') return { text: await status($, minToolCalls) }

    return { text: USAGE }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, finding)
    if (e.props.hasSurvey || shown === null) return next(e)

    const { Box, Button, Markdown, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text wrap="wrap">
          <Text bold color={KIND_COLOR[shown.kind]}>
            blind spot · {shown.kind}
          </Text>{' '}
          {shown.headline}
        </Text>
        {shown.isOpen && <Markdown text={`${shown.details}\n\n**Next step:** ${shown.nextStep}`} />}
        <Box flexDirection="row" gap={2}>
          <Button
            key="toggle"
            plain
            hotkey="d"
            label={shown.isOpen ? 'Hide details' : 'Details'}
            onPress={() => toggle($)}
          />
          <Button key="ask" plain hotkey="a" label="Ask Claude" onPress={() => askClaude($, shown)} />
          <Button
            key="mute"
            plain
            hotkey="m"
            label={shown.kind === 'concept' ? 'I know this' : 'Mute topic'}
            onPress={() => mute($, shown.headline)}
          />
          <Button key="close" plain hotkey="x" role="dismiss" label="Close" onPress={() => endFinding($, 'closed')} />
        </Box>
      </Box>
    )
  })
}
