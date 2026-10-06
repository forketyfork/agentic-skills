import { describe, expect, mock, test } from 'claude-code/testing'
import type { ModelForkResult, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { afterFate, effectiveLevel, fateOf, reactionSummary, withQuiet } from '../hooks/feedback'
import { KINDS, readVerdict, reviewPrompt } from '../hooks/review'
import type { Finding } from '../types'

const COMMAND = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const DAY = 24 * 60 * 60 * 1000

function flagged(kind: string, headline: string): string {
  return JSON.stringify({
    flag: true,
    kind,
    headline,
    details: `Details about ${headline}.`,
    next_step: 'Run the migration tests before merging.',
  })
}

const GAP = flagged('gap', 'The migration test suite was skipped')

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

/** The engine beneath the plugin, as far as these tests need it. */
function world(on: On, replies: string[] = [], fork?: ModelForkResult) {
  const project = { root: '/projects/one' }
  const prompts: string[] = []
  /** While `held` is set, the model call waits for it, as a slow request would. */
  const gate: { held?: Promise<void> } = {}
  mock.store(on)
  on('session.root', async () => ({ value: project.root }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine-band" />
  })
  on('model.fork', async (_$, e) => {
    prompts.push(e.prompt)
    if (gate.held !== undefined) await gate.held
    const value: ModelForkResult = fork ?? { isAnswered: true, text: replies.shift() ?? '{"flag": false}', usage: USAGE }

    return { value }
  })

  return { project, prompts, gate }
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

async function blindSpots($: Engine, args: string): Promise<string> {
  return (await $.command.run({ ...COMMAND, command: 'blind-spots', args })).text ?? ''
}

/** A review starts unawaited at the end of a turn; give it engine round trips until `isDone` holds. */
async function until($: Engine, isDone: () => boolean): Promise<boolean> {
  for (let n = 0; n < 20 && !isDone(); n += 1) await blindSpots($, 'status')

  return isDone()
}

function shown(over: Partial<Finding> = {}): Finding {
  return { kind: 'gap', headline: 'h', details: 'd', nextStep: 'n', isOpen: false, wasOpened: false, promptsUnread: 0, ...over }
}

describe('reading the reviewer reply', () => {
  test('a clean or a flagged reply is read, fenced or not', () => {
    expect(readVerdict('{"flag": false}')).toEqual({ kind: 'clean' })
    expect(readVerdict('```json\n' + GAP + '\n```').kind).toBe('flagged')
    expect(readVerdict(flagged('concept', 'How the prompt cache bills reviews')).kind).toBe('flagged')
  })

  test('the output schema in the prompt offers every kind the parser accepts', () => {
    const schema = reviewPrompt([], [], []).split('\n').find(line => line.startsWith('{"flag": true')) ?? ''
    for (const kind of KINDS) expect(schema).toContain(`"${kind}"`)
  })

  test('a reply missing a field or with an unknown kind is malformed', () => {
    expect(readVerdict('{"flag": true, "kind": "gap", "headline": "x", "details": "y"}').kind).toBe('malformed')
    expect(readVerdict(flagged('trivia', 'x')).kind).toBe('malformed')
    expect(readVerdict('Sure! Nothing stands out.').kind).toBe('malformed')
  })
})

describe('feedback arithmetic', () => {
  test('a finding read or asked about is engaged; muted unread is rejected; otherwise ignored', () => {
    expect(fateOf(shown({ wasOpened: true }), 'muted')).toBe('engaged')
    expect(fateOf(shown(), 'asked')).toBe('engaged')
    expect(fateOf(shown(), 'muted')).toBe('rejected')
    for (const end of ['closed', 'expired', 'replaced'] as const) expect(fateOf(shown(), end)).toBe('ignored')
  })

  test('the level rises on neglect, falls on engagement, stays within 0..3 and decays a step a day', () => {
    let entry = afterFate(undefined, 'ignored', 0)
    expect(entry.level).toBe(1)
    for (const _ of [1, 2, 3, 4]) entry = afterFate(entry, 'rejected', 0)
    expect(entry.level).toBe(3)
    expect(afterFate(entry, 'engaged', 0).level).toBe(2)
    expect(afterFate(undefined, 'engaged', 0).level).toBe(0)

    expect(effectiveLevel(entry, DAY - 1)).toBe(3)
    expect(effectiveLevel(entry, 2 * DAY)).toBe(1)
    expect(effectiveLevel(entry, 10 * DAY)).toBe(0)
    expect(afterFate(entry, 'ignored', 2 * DAY)).toEqual({ level: 2, changedAt: 2 * DAY })
  })

  test('the summary counts each kind the user reacted to', () => {
    const summary = reactionSummary([
      { kind: 'concept', fate: 'ignored', at: 0 },
      { kind: 'concept', fate: 'ignored', at: 0 },
      { kind: 'concept', fate: 'rejected', at: 0 },
      { kind: 'risk', fate: 'engaged', at: 0 },
    ])
    expect(summary).toEqual(['risk: 1 engaged', 'concept: 2 ignored, 1 muted'])
  })

  test('only the most recently changed projects are kept', () => {
    let map = {}
    for (let n = 0; n < 60; n += 1) map = withQuiet(map, `/p${n}`, { level: 1, changedAt: n })
    expect(Object.keys(map)).toHaveLength(50)
    expect(Object.keys(map)).toContain('/p59')
    expect(Object.keys(map)).not.toContain('/p0')
  })
})

describe('when a review runs', () => {
  test('a long main-agent turn is reviewed; a short one and a subagent turn are not', async ($, on) => {
    const { prompts } = world(on)
    stepsCallTools(on, 3)

    await runTurn($, 'short', 2)
    await runTurn($, 'sub', 5, 'agent-1')
    expect(await until($, () => prompts.length > 0)).toBe(false)

    await runTurn($, 'long', 3)
    expect(await until($, () => prompts.length === 1)).toBe(true)
  })

  test('the threshold is configurable', { options: { minToolCalls: 2 } }, async ($, on) => {
    const { prompts } = world(on)
    stepsCallTools(on, 1)

    await runTurn($, 'turn', 2)
    expect(await until($, () => prompts.length === 1)).toBe(true)
  })
})

describe('the banner', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`shows a finding and opens its details on ${surface}`, async ($, on) => {
      world(on, [GAP])

      expect(await blindSpots($, 'review')).toContain('raised a blind spot')

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

  test('a concept finding offers "I know this", which mutes it', async ($, on) => {
    const { prompts } = world(on, [flagged('concept', 'Reviews re-send the whole conversation')])

    await blindSpots($, 'review')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /concept/ })).toBeDefined()
    expect((await ui.find({ key: 'mute' }))?.text).toBe('I know this')

    await ui.press({ key: 'mute' })
    await blindSpots($, 'review')
    expect(prompts[1]).toContain('Reviews re-send the whole conversation')
    await ui.unmount()
  })

  test('a muted topic is passed to the reviewer and suppressed if raised again', async ($, on) => {
    const { prompts } = world(on, [GAP, GAP])

    await blindSpots($, 'review')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'mute' })
    expect(await ui.find({ type: 'Button' })).toBeUndefined()

    expect(await blindSpots($, 'review')).toContain('recent or muted topic')
    expect(prompts[1]).toContain('never raise them')
    expect(prompts[1]).toContain('The migration test suite was skipped')
    await ui.unmount()
  })

  test('a failed model request shows in the status', async ($, on) => {
    world(on, [], { isAnswered: false, reason: 'api-error', status: 403, error: 'authentication_failed', usage: USAGE })

    await blindSpots($, 'review')
    expect(await blindSpots($, '')).toContain('the model request failed (HTTP 403, authentication_failed)')
  })
})

describe('back-off', () => {
  test('closing a finding unread doubles the threshold, so the next 9-call turn is not reviewed', async ($, on) => {
    const { prompts } = world(on, [GAP])
    stepsCallTools(on, 3)

    await blindSpots($, 'review')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'close' })
    expect(await blindSpots($, 'status')).toContain('at least 16 tool calls (base 8, back-off level 1')

    await runTurn($, 'nine-calls', 3)
    expect(await until($, () => prompts.length > 1)).toBe(false)
    await ui.unmount()
  })

  test('reading a finding brings the threshold back down', async ($, on) => {
    world(on, [GAP, flagged('risk', 'The cache key ignores the locale')])

    await blindSpots($, 'review')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'close' })
    expect(await blindSpots($, 'status')).toContain('back-off level 1')

    await blindSpots($, 'review')
    await ui.press({ key: 'toggle' })
    await ui.press({ key: 'close' })
    expect(await blindSpots($, 'status')).toContain('back-off level 0')
    await ui.unmount()
  })

  test('an unread finding expires after three prompts and counts as ignored', async ($, on) => {
    world(on, [GAP])
    on('prompt.submit', async (_$, e) => ({ text: e.text }))

    await blindSpots($, 'review')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    for (const text of ['one', 'two']) await $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })
    expect(await ui.find({ key: 'toggle' })).toBeDefined()

    await $.prompt.submit({ text: 'three', origin: { kind: 'composer' }, wait: false })
    expect(await ui.find({ key: 'toggle' })).toBeUndefined()
    expect(await blindSpots($, 'status')).toContain('gap: 1 ignored')
    await ui.unmount()
  })

  test('the back-off belongs to the project, the reaction summary to the user', async ($, on) => {
    const { project, prompts } = world(on, [GAP])

    await blindSpots($, 'review')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'close' })

    project.root = '/projects/two'
    const status = await blindSpots($, 'status')
    expect(status).toContain('back-off level 0 in this project')
    expect(status).toContain('gap: 1 ignored')

    await blindSpots($, 'review')
    expect(prompts[1]).toContain('- gap: 1 ignored')
    await ui.unmount()
  })

  test('a reset made while a review is in flight is not undone when the review lands', async ($, on) => {
    const { prompts, gate } = world(on, [GAP, flagged('risk', 'The cache key ignores the locale')])
    stepsCallTools(on, 3)

    await blindSpots($, 'review')
    let release = () => {}
    gate.held = new Promise(resolve => {
      release = resolve
    })
    await runTurn($, 'long', 3)
    expect(await until($, () => prompts.length === 2)).toBe(true)

    await blindSpots($, 'reset')
    release()
    gate.held = undefined
    // Nothing observable marks the held review's end, so give it every round trip `until` allows.
    await until($, () => false)

    await blindSpots($, 'review')
    expect(prompts[2]).not.toContain('The migration test suite was skipped')
    expect(prompts[2]).toContain('The cache key ignores the locale')
  })

  test('reset forgets what was learned', async ($, on) => {
    world(on, [GAP])

    await blindSpots($, 'review')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'close' })
    await blindSpots($, 'reset')

    const status = await blindSpots($, 'status')
    expect(status).toContain('back-off level 0')
    expect(status).toContain('No reactions recorded yet.')
    await ui.unmount()
  })
})
