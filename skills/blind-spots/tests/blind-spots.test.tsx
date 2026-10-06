import { describe, expect, mock, test } from 'claude-code/testing'
import type { ModelForkResult, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { readVerdict } from '../hooks/review'

const COMMAND = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const FLAGGED = JSON.stringify({
  flag: true,
  kind: 'gap',
  headline: 'The migration test suite was skipped',
  details: 'The agent ran only the unit tests. The **migration tests** need Docker and were not run.',
  next_step: 'Run the migration tests before merging.',
})

const BAND = {
  plugin: 'blind-spots',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 19, contentRows: 0 },
    view: {},
  },
} as const

/** Stands in for the engine's own band beneath the plugin: an empty box. */
function emptyBand(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine-band" />
  })
}

function reviewerReplies(on: On, replies: string[]): string[] {
  const prompts: string[] = []
  on('model.fork', async (_$, e) => {
    prompts.push(e.prompt)

    const value: ModelForkResult = { isAnswered: true, text: replies.shift() ?? '{"flag": false}', usage: USAGE }

    return { value }
  })

  return prompts
}

function stepsCallTools(on: On, perStep: number) {
  on('turn.step', async function* (_$, e) {
    const toolUses = Array.from({ length: perStep }, (_, n) => ({ id: `${e.index}-${n}`, name: 'Bash', input: {} }))

    return { turnId: e.turnId, index: e.index, answer: '', toolUses, stopReason: 'tool_use', usage: null }
  })
  on('turn.complete', async () => ({ text: 'done' }))
}

async function runTurn($: Engine, turnId: string, steps: number, agentId?: string) {
  for (let index = 0; index < steps; index += 1) {
    const stream = $.turn.step({ turnId, index, model: 'test-model', messageCount: 4, agentId })
    for await (const _chunk of stream) {
      // drained so the step completes
    }
  }
  await $.turn.complete({ turnId, reason: 'answer', answer: 'done', durationMs: 1, isAborted: false, agentId })
}

/** The review starts unawaited at the end of a turn; wait until the status command reports its outcome. */
async function reviewed($: Engine) {
  for (let n = 0; n < 20; n += 1) {
    const status = await $.command.run({ ...COMMAND, command: 'blind-spots', args: 'status' })
    if (status.text?.includes('Last review') === true) return true
  }

  return false
}

describe('reading the reviewer reply', () => {
  test('a clean or a flagged reply is read, fenced or not', () => {
    expect(readVerdict('{"flag": false}')).toEqual({ kind: 'clean' })
    expect(readVerdict('```json\n' + FLAGGED + '\n```').kind).toBe('flagged')
  })

  test('a reply missing a field or with an unknown kind is malformed', () => {
    expect(readVerdict('{"flag": true, "kind": "gap", "headline": "x", "details": "y"}').kind).toBe('malformed')
    expect(readVerdict('{"flag": true, "kind": "trivia", "headline": "x", "details": "y", "next_step": "z"}').kind).toBe(
      'malformed',
    )
    expect(readVerdict('Sure! Nothing stands out.').kind).toBe('malformed')
  })
})

describe('when a review runs', () => {
  test('a long main-agent turn is reviewed; a short one and a subagent turn are not', async ($, on) => {
    mock.store(on)
    stepsCallTools(on, 3)
    const prompts = reviewerReplies(on, [])

    await runTurn($, 'short', 2)
    await runTurn($, 'sub', 5, 'agent-1')
    expect(await reviewed($)).toBe(false)
    expect(prompts).toHaveLength(0)

    await runTurn($, 'long', 3)
    expect(await reviewed($)).toBe(true)
    expect(prompts).toHaveLength(1)
  })

  test('the threshold is configurable', { options: { minToolCalls: 2 } }, async ($, on) => {
    mock.store(on)
    stepsCallTools(on, 1)
    const prompts = reviewerReplies(on, [])

    await runTurn($, 'turn', 2)
    expect(await reviewed($)).toBe(true)
    expect(prompts).toHaveLength(1)
  })
})

describe('the banner', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`shows a finding and opens its details on ${surface}`, async ($, on) => {
      mock.store(on)
      emptyBand(on)
      reviewerReplies(on, [FLAGGED])

      const run = await $.command.run({ ...COMMAND, command: 'blind-spots', args: 'review' })
      expect(run.text).toContain('raised a blind spot')

      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: /migration test suite was skipped/ })).toBeDefined()
      expect(await ui.find({ type: 'Markdown' })).toBeUndefined()

      await ui.press({ key: 'toggle' })
      expect(await ui.find({ type: 'Markdown', text: /Run the migration tests before merging/ })).toBeDefined()

      await ui.press({ key: 'close' })
      expect(await ui.find({ type: 'Button' })).toBeUndefined()
      await ui.unmount()
    })
  }

  test('a muted topic is passed to the reviewer and suppressed if raised again', async ($, on) => {
    mock.store(on)
    emptyBand(on)
    const prompts = reviewerReplies(on, [FLAGGED, FLAGGED])

    await $.command.run({ ...COMMAND, command: 'blind-spots', args: 'review' })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'mute' })
    expect(await ui.find({ type: 'Button' })).toBeUndefined()

    const again = await $.command.run({ ...COMMAND, command: 'blind-spots', args: 'review' })
    expect(again.text).toContain('recent or muted topic')
    expect(prompts[1]).toContain('The user muted these topics')
    expect(prompts[1]).toContain('The migration test suite was skipped')
    await ui.unmount()
  })

  test('a failed model request shows in the status', async ($, on) => {
    mock.store(on)
    on('model.fork', async () => {
      const value: ModelForkResult = {
        isAnswered: false,
        reason: 'api-error',
        status: 403,
        error: 'authentication_failed',
        usage: USAGE,
      }

      return { value }
    })

    await $.command.run({ ...COMMAND, command: 'blind-spots', args: 'review' })
    const status = await $.command.run({ ...COMMAND, command: 'blind-spots', args: '' })
    expect(status.text).toContain('the model request failed (HTTP 403, authentication_failed)')
  })
})
