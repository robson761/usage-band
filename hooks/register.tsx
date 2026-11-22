import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Limit } from '../types'

const limits = atom({ plugin: 'usage-band', key: 'limits' } as const, null)

const WARN = 80
const GREEN = '#22a559'
const RED = '#e5484d'
const TRACK = '#8884'

const WINDOWS = [
  { kind: 'five_hour', label: 'Limit 5h' },
  { kind: 'seven_day', label: 'Limit tygodniowy' },
] as const

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

function resetText(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return ''
  const mins = Math.max(0, Math.round((at - now) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  const span = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
  return `reset za ${span}`
}

function pick(list: readonly Limit[]): Limit[] {
  return list.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage()
    await update($, limits, () => pick(usage.rateLimits))
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
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const Svg = 'Svg' in ui ? ui.Svg : null

    const cells = WINDOWS.map(w => {
      const l = list.find(x => x.kind === w.kind)
      const pct = l ? l.percentUsed : null
      const isHot = pct !== null && pct >= WARN
      const color = pct === null ? undefined : isHot ? RED : GREEN
      const value = pct === null ? '—' : `${Math.round(pct)}%`
      const reset = l ? resetText(l.resetsAt, now) : 'brak danych'

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
