# usage-band

A Claude Code mod that shows, in the band above the prompt, three pie charts:

- **5-hour limit** and **weekly limit**: how much of your subscription's usage window is used, and the time until it resets.
- **Context**: how full the current session's context window is, with the tokens used out of the window (for example `157k / 1M`), so you know when to `/compact` or start a fresh session.

Each chart is green below 80% and turns red and pulses from 80%. In a terminal, which cannot draw graphics, a coloured pie glyph (○ ◔ ◑ ◕ ●) stands in for the chart.

### Pace forecast

Under each usage limit the band projects your recent tempo forward:

- **lasts until reset** (green): at this pace the window will not fill before it resets;
- **limit in ~1h 20m** (red): at this pace you will hit the limit in about that time.

The tempo is measured over the last hour for the 5-hour limit and the last 24 hours for the weekly limit. Until the readings span at least 5 minutes, the average tempo since the window began is used instead, so the forecast shows right away. The history is kept between sessions.

The readings come from the figures Claude Code receives with every API response, so the band refreshes after each turn. Without a Claude subscription (for example with an API key) there are no usage-limit figures and those charts show "no data"; the context chart still works.

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

## Credits

This mod and its documentation were created with the help of AI ([Claude](https://claude.ai) by Anthropic).

## License

MIT
