export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Context = { percent: number | null; tokens: number | null; window: number }
/** Readings of one rate-limit window, oldest first, for the pace forecast. */
export type Sample = { at: number; pct: number }
export type Samples = Record<string, { resetsAt: string | null; points: Sample[] }>

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      limits: Limit[] | null
      lang: string | null
      context: Context | null
      samples: Samples
    }
  }
}
