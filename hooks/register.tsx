import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit } from '../types'

const limits = atom({ plugin: 'usage-band', key: 'limits' } as const, null)
const lang = atom({ plugin: 'usage-band', key: 'lang' } as const, null)

const WARN = 80
const GREEN = '#22a559'
const RED = '#e5484d'
const TRACK = '#8884'

const WINDOWS = ['five_hour', 'seven_day'] as const

type Strings = {
  five_hour: string
  seven_day: string
  noData: string
  resetIn: (span: string) => string
}

// Translations, keyed by ISO 639-1 language code. English is the fallback.
const STRINGS: Record<string, Strings> = {
  en: { five_hour: '5-hour limit', seven_day: 'Weekly limit', noData: 'no data', resetIn: s => `resets in ${s}` },
  pl: { five_hour: 'Limit 5h', seven_day: 'Limit tygodniowy', noData: 'brak danych', resetIn: s => `reset za ${s}` },
  de: { five_hour: '5-Stunden-Limit', seven_day: 'Wochenlimit', noData: 'keine Daten', resetIn: s => `Reset in ${s}` },
  fr: { five_hour: 'Limite 5 h', seven_day: 'Limite hebdo', noData: 'aucune donnée', resetIn: s => `réinit. dans ${s}` },
  es: { five_hour: 'Límite 5 h', seven_day: 'Límite semanal', noData: 'sin datos', resetIn: s => `se reinicia en ${s}` },
  it: { five_hour: 'Limite 5 ore', seven_day: 'Limite settimanale', noData: 'nessun dato', resetIn: s => `reset tra ${s}` },
  pt: { five_hour: 'Limite 5 h', seven_day: 'Limite semanal', noData: 'sem dados', resetIn: s => `reinicia em ${s}` },
  nl: { five_hour: '5-uurslimiet', seven_day: 'Weeklimiet', noData: 'geen gegevens', resetIn: s => `reset over ${s}` },
  cs: { five_hour: 'Limit 5 h', seven_day: 'Týdenní limit', noData: 'žádná data', resetIn: s => `reset za ${s}` },
  uk: { five_hour: 'Ліміт 5 год', seven_day: 'Тижневий ліміт', noData: 'немає даних', resetIn: s => `скидання через ${s}` },
  ru: { five_hour: 'Лимит 5 ч', seven_day: 'Недельный лимит', noData: 'нет данных', resetIn: s => `сброс через ${s}` },
  ja: { five_hour: '5時間の上限', seven_day: '週間の上限', noData: 'データなし', resetIn: s => `リセットまで ${s}` },
  ko: { five_hour: '5시간 한도', seven_day: '주간 한도', noData: '데이터 없음', resetIn: s => `${s} 후 초기화` },
  zh: { five_hour: '5 小时限额', seven_day: '每周限额', noData: '暂无数据', resetIn: s => `${s} 后重置` },
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

function resetText(resetsAt: string | undefined, now: number, t: Strings): string {
  if (!resetsAt) return ''
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return ''
  const mins = Math.max(0, Math.round((at - now) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  const span = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
  return t.resetIn(span)
}

function pick(list: readonly Limit[]): Limit[] {
  return list.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage()
    await update($, limits, () => pick(usage.rateLimits))
    const locale = await detectLocale($)
    await update($, lang, () => locale)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, limits, () => pick(e.rateLimits))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const stored = await read($, limits)
    const list = stored ?? pick((await $.session.usage()).rateLimits)
    const now = await $.clock.now()
    const t = stringsFor(await read($, lang))
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const Svg = 'Svg' in ui ? ui.Svg : null

    const cells = WINDOWS.map(kind => {
      const w = { kind, label: t[kind] }
      const l = list.find(x => x.kind === w.kind)
      const pct = l ? l.percentUsed : null
      const isHot = pct !== null && pct >= WARN
      const color = pct === null ? undefined : isHot ? RED : GREEN
      const value = pct === null ? '—' : `${Math.round(pct)}%`
      const reset = l ? resetText(l.resetsAt, now, t) : t.noData

      if (!Svg) {
        return (
          <Box key={w.kind} flexDirection="row" gap={1}>
            <Text color={color} bold={isHot}>{pieGlyph(pct ?? 0)}</Text>
            <Text>{w.label}:</Text>
            <Text color={color} bold>{value}</Text>
            <Text dimColor>{reset}</Text>
          </Box>
        )
      }

      return (
        <Box key={w.kind} flexDirection="row" alignItems="center" gap={1}>
          <Svg
            source={pieSvg(pct ?? 0)}
            alt={`${w.label}: ${value}`}
            width={32}
            height={32}
            isInteractive={isHot}
          />
          <Box flexDirection="column">
            <Text size="footnote" dimColor>{w.label}</Text>
            <Text weight="semibold" color={color} tabular>{value}</Text>
            {reset ? <Text size="caption" dimColor>{reset}</Text> : null}
          </Box>
        </Box>
      )
    })

    return (
      <Box flexDirection="row" alignItems="center" gap={3}>
        {cells}
      </Box>
    )
  })
}
