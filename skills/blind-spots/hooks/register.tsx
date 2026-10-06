import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelForkResult, Register } from 'claude-code'

import type { Finding, FindingKind, ReviewOutcome, ReviewRecord } from '../types'
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

const KIND_COLOR: Record<FindingKind, 'yellow' | 'red' | 'magenta'> = {
  decision: 'yellow',
  risk: 'red',
  gap: 'magenta',
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
  'Usage: /blind-spots [status|review|unmute]',
  '  status  when reviews run and how the last one went (the default)',
  '  review  review the conversation right now',
  '  unmute  forget the muted and recently raised topics',
].join('\n')

// Module variables start over on a hot reload: a turn in flight then simply goes unreviewed.
let isReviewing = false
const toolCallsByTurn = new Map<string, number>()

async function review($: EngineInterface): Promise<ReviewRecord> {
  isReviewing = true
  try {
    const recent = strings(await $.store.get('recent'))
    const muted = strings(await $.store.get('muted'))
    const reply = await $.model.fork({ prompt: reviewPrompt(recent, muted) })
    const record = await conclude($, reply, recent, muted)
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

async function conclude(
  $: EngineInterface,
  reply: ModelForkResult,
  recent: string[],
  muted: string[],
): Promise<ReviewRecord> {
  const at = Date.now()
  if (!reply.isAnswered) {
    const detail = reply.reason === 'api-error' ? `HTTP ${reply.status ?? 'none'}, ${reply.error}` : undefined

    return { at, outcome: reply.reason, detail }
  }

  const verdict = readVerdict(reply.text)
  if (verdict.kind === 'clean') return { at, outcome: 'clean' }
  if (verdict.kind === 'malformed') return { at, outcome: 'malformed', detail: verdict.reason }

  const { headline } = verdict.finding
  if (mentions([...recent, ...muted], headline)) return { at, outcome: 'muted', detail: headline }

  await $.store.set('recent', withTopic(recent, headline, MAX_RECENT))
  await update($, finding, () => ({ ...verdict.finding, isOpen: false }))

  return { at, outcome: 'flagged', detail: headline }
}

async function mute($: EngineInterface, headline: string) {
  await $.store.set('muted', withTopic(strings(await $.store.get('muted')), headline, MAX_MUTED))
  await update($, finding, () => null)
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
  await update($, finding, () => null)
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
      description: 'Review long turns for decisions, risks and gaps you may have missed',
      argumentHint: '[status|review|unmute]',
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
    if (e.reason === 'answer' && isReviewDue(toolCalls, minToolCalls, isReviewing)) {
      // Not awaited: the session is idle again and the review lands whenever it is ready.
      void review($)
    }

    return result
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

    if (arg === '' || arg === 'status') {
      const muted = strings(await $.store.get('muted')).length
      const last = await read($, lastReview)

      return {
        text: [
          `Reviews a turn once it ends with at least ${minToolCalls} tool calls; ${muted} topic(s) muted.`,
          last === null ? 'No review has run in this session yet.' : `Last review: ${describe(last)}`,
        ].join('\n'),
      }
    }

    return { text: USAGE }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, finding)
    if (e.props.hasSurvey || shown === null) return next(e)

    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const toggle = () => update($, finding, f => (f === null ? f : { ...f, isOpen: !f.isOpen }))

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
          <Button key="toggle" plain hotkey="d" label={shown.isOpen ? 'Hide details' : 'Details'} onPress={toggle} />
          <Button key="ask" plain hotkey="a" label="Ask Claude" onPress={() => askClaude($, shown)} />
          <Button key="mute" plain hotkey="m" label="Mute topic" onPress={() => mute($, shown.headline)} />
          <Button key="close" plain hotkey="x" role="dismiss" label="Close" onPress={() => update($, finding, () => null)} />
        </Box>
      </Box>
    )
  })
}
