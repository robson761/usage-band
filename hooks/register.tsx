import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Context, Limit, Sample, Samples } from '../types'

const limits = atom({ plugin: 'usage-band', key: 'limits' } as const, null)
const lang = atom({ plugin: 'usage-band', key: 'lang' } as const, null)
const context = atom({ plugin: 'usage-band', key: 'context' } as const, null)
const samples = atom({ plugin: 'usage-band', key: 'samples' } as const, {} as Samples)

const STORE_SAMPLES = 'samples'

const WARN = 80
const GREEN = '#22a559'
const RED = '#e5484d'
const TRACK = '#8884'

const WINDOWS = ['five_hour', 'seven_day'] as const

// How far back the pace forecast looks: recent tempo, not the whole window.
const LOOKBACK_MS: Record<string, number> = {
  five_hour: 60 * 60 * 1000,
  seven_day: 24 * 60 * 60 * 1000,
}
const MIN_SPAN_MS = 5 * 60 * 1000

type Strings = {
  five_hour: string
  seven_day: string
  context: string
  noData: string
  resetIn: (span: string) => string
  paceOk: string
  paceHit: (span: string) => string
}

// Translations, keyed by ISO 639-1 language code. English is the fallback.
const STRINGS: Record<string, Strings> = {
  en: { five_hour: '5-hour limit', seven_day: 'Weekly limit', context: 'Context', noData: 'no data', resetIn: s => `resets in ${s}`, paceOk: 'lasts until reset', paceHit: s => `limit in ~${s}` },
  pl: { five_hour: 'Limit 5h', seven_day: 'Limit tygodniowy', context: 'Kontekst', noData: 'brak danych', resetIn: s => `reset za ${s}`, paceOk: 'starczy do resetu', paceHit: s => `limit za ~${s}` },
  de: { five_hour: '5-Stunden-Limit', seven_day: 'Wochenlimit', context: 'Kontext', noData: 'keine Daten', resetIn: s => `Reset in ${s}`, paceOk: 'reicht bis zum Reset', paceHit: s => `Limit in ~${s}` },
  fr: { five_hour: 'Limite 5 h', seven_day: 'Limite hebdo', context: 'Contexte', noData: 'aucune donnée', resetIn: s => `réinit. dans ${s}`, paceOk: 'tient jusqu’à la réinit.', paceHit: s => `limite dans ~${s}` },
  es: { five_hour: 'Límite 5 h', seven_day: 'Límite semanal', context: 'Contexto', noData: 'sin datos', resetIn: s => `se reinicia en ${s}`, paceOk: 'alcanza hasta el reinicio', paceHit: s => `límite en ~${s}` },
  it: { five_hour: 'Limite 5 ore', seven_day: 'Limite settimanale', context: 'Contesto', noData: 'nessun dato', resetIn: s => `reset tra ${s}`, paceOk: 'basta fino al reset', paceHit: s => `limite tra ~${s}` },
  pt: { five_hour: 'Limite 5 h', seven_day: 'Limite semanal', context: 'Contexto', noData: 'sem dados', resetIn: s => `reinicia em ${s}`, paceOk: 'dura até reiniciar', paceHit: s => `limite em ~${s}` },
  nl: { five_hour: '5-uurslimiet', seven_day: 'Weeklimiet', context: 'Context', noData: 'geen gegevens', resetIn: s => `reset over ${s}`, paceOk: 'houdt het tot de reset', paceHit: s => `limiet over ~${s}` },
  cs: { five_hour: 'Limit 5 h', seven_day: 'Týdenní limit', context: 'Kontext', noData: 'žádná data', resetIn: s => `reset za ${s}`, paceOk: 'vydrží do resetu', paceHit: s => `limit za ~${s}` },
  uk: { five_hour: 'Ліміт 5 год', seven_day: 'Тижневий ліміт', context: 'Контекст', noData: 'немає даних', resetIn: s => `скидання через ${s}`, paceOk: 'вистачить до скидання', paceHit: s => `ліміт через ~${s}` },
  ru: { five_hour: 'Лимит 5 ч', seven_day: 'Недельный лимит', context: 'Контекст', noData: 'нет данных', resetIn: s => `сброс через ${s}`, paceOk: 'хватит до сброса', paceHit: s => `лимит через ~${s}` },
  ja: { five_hour: '5時間の上限', seven_day: '週間の上限', context: 'コンテキスト', noData: 'データなし', resetIn: s => `リセットまで ${s}`, paceOk: 'リセットまで持ちます', paceHit: s => `約${s}で上限` },
  ko: { five_hour: '5시간 한도', seven_day: '주간 한도', context: '컨텍스트', noData: '데이터 없음', resetIn: s => `${s} 후 초기화`, paceOk: '초기화까지 충분', paceHit: s => `약 ${s} 후 한도 도달` },
  zh: { five_hour: '5 小时限额', seven_day: '每周限额', context: '上下文', noData: '暂无数据', resetIn: s => `${s} 后重置`, paceOk: '可撑到重置', paceHit: s => `约 ${s} 后达到上限` },
}

function stringsFor(locale: string | null): Strings {
  const code = (locale ?? 'en').toLowerCase().split(/[-_.@]/)[0] ?? 'en'
  return STRINGS[code] ?? STRINGS.en!
}

// The OS language: POSIX locale variables first (Linux, macOS terminals),
// then the platform's own setting, then the runtime's default locale.
async function detectLocale($: EngineInterface): Promise<string> {
  const posix = [
    await $.env.get('LC_ALL'),
    await $.env.get('LC_MESSAGES'),
    await $.env.get('LANG'),
    await $.env.get('LANGUAGE'),
  ]
  for (const value of posix) {
    if (value && value !== 'C' && value !== 'POSIX' && !value.startsWith('C.')) return value
  }
  const tries: string[][] =
    (await $.env.get('OS')) === 'Windows_NT'
      ? [['powershell', '-NoProfile', '-NonInteractive', '-Command', '[cultureinfo]::CurrentUICulture.Name']]
      : [['defaults', 'read', '-g', 'AppleLocale']]
  for (const argv of tries) {
    try {
      const { exitCode, stdout } = await $.process.run(argv, { timeoutMs: 5000 })
      const value = stdout.trim()
      if (exitCode === 0 && value) return value
    } catch {
      // not this platform: try the next source
    }
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en'
  } catch {
    return 'en'
  }
}

const clamp = (n: number) => Math.max(0, Math.min(100, n))

// Pie as a circle whose stroke is as wide as its radius: the dash is the slice.
function pieSvg(percent: number): string {
  const p = clamp(percent)
  const isHot = p >= WARN
  const color = isHot ? RED : GREEN
  const r = 7.5
  const c = 2 * Math.PI * r
  const dash = (p / 100) * c
  const pulse = isHot
    ? '<animate attributeName="opacity" values="1;0.3;1" dur="1.1s" repeatCount="indefinite"/>'
    : ''
  const css = isHot
    ? '<style>@keyframes p{0%,100%{opacity:1}50%{opacity:.3}}.s{animation:p 1.1s ease-in-out infinite}</style>'
    : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${css}` +
    `<circle cx="16" cy="16" r="15" fill="${TRACK}"/>` +
    `<g class="s">${pulse}` +
    (p >= 100
      ? `<circle cx="16" cy="16" r="15" fill="${color}"/>`
      : `<circle cx="16" cy="16" r="${r}" fill="none" stroke="${color}" stroke-width="15" ` +
        `stroke-dasharray="${dash.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 16 16)"/>`) +
    `</g>` +
    `<circle cx="16" cy="16" r="15" fill="none" stroke="${color}" stroke-width="1"/></svg>`
  )
}

// Terminal: a quarter-step pie glyph.
function pieGlyph(percent: number): string {
  const p = clamp(percent)
  return p < 12.5 ? '○' : p < 37.5 ? '◔' : p < 62.5 ? '◑' : p < 87.5 ? '◕' : '●'
}

function formatSpan(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

function resetText(resetsAt: string | undefined, now: number, t: Strings): string {
  if (!resetsAt) return ''
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return ''
  return t.resetIn(formatSpan(at - now))
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return `${n}`
}

function pick(list: readonly Limit[]): Limit[] {
  return list.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
}

function pickContext(c: { tokens?: number; window: number; percent?: number }): Context {
  return { percent: c.percent ?? null, tokens: c.tokens ?? null, window: c.window }
}

// Adds this reading to each window's history: a new window (its reset moved)
// or a drop in use starts it over; points older than the lookback are pruned,
// keeping the newest one before the cutoff as the baseline.
function addSamples(prev: Samples, list: readonly Limit[], now: number): Samples {
  const next: Samples = { ...prev }
  for (const l of list) {
    const lookback = LOOKBACK_MS[l.kind]
    if (lookback === undefined) continue
    const resetsAt = l.resetsAt ?? null
    const old = prev[l.kind]
    let points: Sample[] = old && old.resetsAt === resetsAt ? [...old.points] : []
    const last = points[points.length - 1]
    if (last && l.percentUsed < last.pct) points = []
    if (!last || last.pct !== l.percentUsed || points.length === 0) {
      points.push({ at: now, pct: l.percentUsed })
    }
    const cutoff = now - lookback
    const firstInside = points.findIndex(p => p.at >= cutoff)
    if (firstInside > 1) points = points.slice(firstInside - 1)
    next[l.kind] = { resetsAt, points: points.slice(-200) }
  }
  return next
}

type Pace = { kind: 'ok' } | { kind: 'hit'; inMs: number } | null

// Projects the recent tempo forward: will the window fill before it resets?
function forecast(l: Limit, history: Samples[string] | undefined, now: number): Pace {
  if (!history || history.points.length === 0) return null
  const lookback = LOOKBACK_MS[l.kind] ?? 0
  const cutoff = now - lookback
  const base = [...history.points].reverse().find(p => p.at <= cutoff) ?? history.points[0]!
  const span = now - base.at
  const used = l.percentUsed - base.pct
  const resetAt = l.resetsAt ? Date.parse(l.resetsAt) : NaN
  if (span < MIN_SPAN_MS) return null
  if (used <= 0) return Number.isNaN(resetAt) ? null : { kind: 'ok' }
  const inMs = ((100 - l.percentUsed) / used) * span
  if (!Number.isNaN(resetAt) && now + inMs >= resetAt) return { kind: 'ok' }
  return { kind: 'hit', inMs }
}

async function record($: EngineInterface, list: Limit[]): Promise<void> {
  const now = await $.clock.now()
  let saved: Samples = {}
  await update($, samples, prev => {
    saved = addSamples(prev ?? {}, list, now)
    return saved
  })
  try {
    await $.store.set(STORE_SAMPLES, saved)
  } catch {
    // the forecast still works for this session
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      const stored = (await $.store.get(STORE_SAMPLES)) as Samples | undefined
      if (stored && typeof stored === 'object') await update($, samples, prev => ({ ...stored, ...prev }))
    } catch {
      // no history yet
    }
    const usage = await $.session.usage()
    const list = pick(usage.rateLimits)
    await update($, limits, () => list)
    await update($, context, () => pickContext(usage.context))
    await record($, list)
    const locale = await detectLocale($)
    await update($, lang, () => locale)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const list = pick(e.rateLimits)
    await update($, limits, () => list)
    await update($, context, () => pickContext(e.context))
    await record($, list)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const stored = await read($, limits)
    const list = stored ?? pick((await $.session.usage()).rateLimits)
    const ctx = await read($, context)
    const history = (await read($, samples)) ?? {}
    const now = await $.clock.now()
    const t = stringsFor(await read($, lang))
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const Svg = 'Svg' in ui ? ui.Svg : null

    type Cell = { key: string; label: string; pct: number | null; lines: { text: string; color?: string }[] }

    const cells: Cell[] = WINDOWS.map(kind => {
      const l = list.find(x => x.kind === kind)
      if (!l) return { key: kind, label: t[kind], pct: null, lines: [{ text: t.noData }] }
      const lines: Cell['lines'] = []
      const reset = resetText(l.resetsAt, now, t)
      if (reset) lines.push({ text: reset })
      const pace = forecast(l, history[kind], now)
      if (pace?.kind === 'ok') lines.push({ text: t.paceOk, color: GREEN })
      if (pace?.kind === 'hit') lines.push({ text: t.paceHit(formatSpan(pace.inMs)), color: RED })
      return { key: kind, label: t[kind], pct: l.percentUsed, lines }
    })

    cells.push(
      ctx && ctx.percent !== null
        ? {
            key: 'context',
            label: t.context,
            pct: ctx.percent,
            lines: [{ text: `${ctx.tokens !== null ? formatTokens(ctx.tokens) : '?'} / ${formatTokens(ctx.window)}` }],
          }
        : { key: 'context', label: t.context, pct: null, lines: [{ text: t.noData }] },
    )

    const drawn = cells.map(cell => {
      const isHot = cell.pct !== null && cell.pct >= WARN
      const color = cell.pct === null ? undefined : isHot ? RED : GREEN
      const value = cell.pct === null ? '—' : `${Math.round(cell.pct)}%`

      if (!Svg) {
        return (
          <Box key={cell.key} flexDirection="row" gap={1}>
            <Text color={color} bold={isHot}>{pieGlyph(cell.pct ?? 0)}</Text>
            <Text>{cell.label}:</Text>
            <Text color={color} bold>{value}</Text>
            {cell.lines.map((line, i) => (
              <Text key={`l${i}`} color={line.color} dimColor={!line.color}>{line.text}</Text>
            ))}
          </Box>
        )
      }

      return (
        <Box key={cell.key} flexDirection="row" alignItems="center" gap={1}>
          <Svg
            source={pieSvg(cell.pct ?? 0)}
            alt={`${cell.label}: ${value}`}
            width={32}
            height={32}
            isInteractive={isHot}
          />
          <Box flexDirection="column">
            <Text size="footnote" dimColor>{cell.label}</Text>
            <Text weight="semibold" color={color} tabular>{value}</Text>
            {cell.lines.map((line, i) => (
              <Text key={`l${i}`} size="caption" color={line.color} dimColor={!line.color}>{line.text}</Text>
            ))}
          </Box>
        </Box>
      )
    })

    return (
      <Box flexDirection="row" alignItems="center" gap={3} flexWrap="wrap">
        {drawn}
      </Box>
    )
  })
}
