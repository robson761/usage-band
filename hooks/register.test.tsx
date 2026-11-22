import { expect, test } from 'claude-code/testing'

const T0 = Date.parse('2026-11-22T10:00:00Z')
const MIN = 60 * 1000

const BAND = {
  plugin: 'usage-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

const reading = (fiveHour: number) => [
  { kind: 'five_hour', percentUsed: fiveHour, resetsAt: new Date(T0 + 4 * 60 * MIN).toISOString() },
  { kind: 'seven_day', percentUsed: 14, resetsAt: new Date(T0 + 4 * 24 * 60 * MIN).toISOString() },
]

const CONTEXT = { tokens: 157_000, window: 1_000_000, percent: 16 }

test('context and pace show, in the system language', async ($, on) => {
  let now = T0
  on('clock.now', () => ({ value: now }))
  on('env.get', (_, e) => ({ value: e.name === 'LANG' ? 'pl_PL.UTF-8' : undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: T0, context: CONTEXT, rateLimits: reading(40) },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  now = T0 + 30 * MIN
  await $.session.measure({ context: CONTEXT, rateLimits: reading(50), changed: ['rateLimits'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /Kontekst/ }))?.text).toContain('Kontekst')
    expect((await ui.find({ type: 'Text', text: /157k \/ 1M/ }))?.text).toBe('157k / 1M')
    // 10 points in 30 minutes, 50 left: the limit in about 2h 30m, before the reset in 3h 30m.
    expect((await ui.find({ type: 'Text', text: /limit za/ }))?.text).toBe('limit za ~2h 30m')
    // The weekly window has not moved: no tempo, so it lasts until the reset.
    expect((await ui.find({ type: 'Text', text: /starczy/ }))?.text).toBe('starczy do resetu')
    await ui.unmount()
  }
})

test('a fresh start forecasts from the window average', async ($, on) => {
  // 5h window began 2h ago (resets in 3h) and is 60% used: 30%/h, 40% left,
  // so the limit comes in about 1h 20m, before the reset.
  const resetsAt = new Date(T0 + 3 * 60 * MIN).toISOString()
  on('clock.now', () => ({ value: T0 }))
  on('env.get', (_, e) => ({ value: e.name === 'LANG' ? 'en_US.UTF-8' : undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: T0, context: CONTEXT, rateLimits: [{ kind: 'five_hour', percentUsed: 60, resetsAt }] },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /limit in/ }))?.text).toBe('limit in ~1h 20m')
  await ui.unmount()
})

for (const [culture, expected] of [['de-DE', 'Wochenlimit'], ['xx-XX', 'Weekly limit']] as const) {
  test(`Windows display language ${culture} labels the band "${expected}"`, async ($, on) => {
    on('clock.now', () => ({ value: T0 }))
    on('env.get', (_, e) => ({ value: e.name === 'OS' ? 'Windows_NT' : undefined }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: `${culture}\r\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('store.get', () => ({ value: undefined }))
    on('store.set', () => ({ value: undefined }))
    on('session.usage', () => ({ value: { startedAt: T0, context: CONTEXT, rateLimits: [] } }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))

    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect((await ui.find({ type: 'Text', text: new RegExp(expected) }))?.text).toBe(expected)
    await ui.unmount()
  })
}
