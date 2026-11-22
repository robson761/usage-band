# usage-band

A Claude Code mod that shows your current subscription usage in the band above the prompt: the 5-hour limit and the weekly limit, each as its own pie chart, with the percentage used and the time until it resets.

- Below 80% the chart is green.
- From 80% it turns red and pulses.
- In a terminal, which cannot draw graphics, a coloured pie glyph (○ ◔ ◑ ◕ ●) stands in for the chart.

The readings come from the rate-limit figures Claude Code receives with every API response, so the band refreshes after each turn. Without a Claude subscription (for example with an API key) there are no such figures and the band shows "no data".

## Language

The band speaks your operating system's language. It reads `LC_ALL`, `LC_MESSAGES`, `LANG` or `LANGUAGE` first, then the system setting (the Windows display language, or the macOS `AppleLocale`), and falls back to English.

Included languages: English, Polish, German, French, Spanish, Italian, Portuguese, Dutch, Czech, Ukrainian, Russian, Japanese, Korean and Chinese. To add one, add an entry to `STRINGS` in `hooks/register.tsx`.

## Install

At the prompt of a Claude Code session in a terminal:

```
/plugin install usage-band --marketplace robson761/usage-band
```

From a shell:

```
claude plugin install usage-band --marketplace robson761/usage-band
```

Answer `y` to `Add marketplace?`, then pick a scope (user is the default). Installed at the user scope, the mod loads in every later session, including the Code tab of the Claude desktop app.

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `robson761/usage-band`, then Add plugin.

## Where it works

Only in Claude Code: the terminal, the Code tab of the desktop app and the VS Code extension. It does not appear in the regular Chat or Cowork tabs or on claude.ai.

## License

MIT
