# Barkly Access

**Cognitive accessibility tools for Discord.** Reduce cognitive load while preserving the features and social experience people value.

> Discord shouldn't require you to remember everything, process everything, and navigate everything just to participate.

## Project status

Early prototype with an experimental BetterDiscord adapter in `src/integrations/betterdiscord/`. Discord client modifications are unofficial, may violate Discord's Terms, and can carry account risk. The integration is experimental and relies on unstable UI selectors.

## Current experiment: reversible decluttering (0.2.0)

- Floating Barkly Access control panel with independent toggles for focus mode, channel list, member list, server rail and chat header.
- Restore everything button and `Ctrl+Shift+R` shortcut.
- `Ctrl+Shift+F` toggles focus mode.
- Preferences saved locally using BetterDiscord data API.
- No message-content collection or network calls.

## PAW-HC principles

1. User control and opt-in defaults.
2. Preserve context and functionality; hidden areas are reversible.
3. Don't infer intent, emotions, or urgency.
4. Minimize data collection and retention.
5. Respect platform rules and privacy boundaries.
6. Co-design and test with disabled users.
7. Features should be modular and individually disableable.

## Development

Review `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, and `docs/PAW-HC-REVIEW.md`. Prototype assets live in `prototype/`; integrations are isolated under `src/integrations/`.

## License

MIT — see `LICENSE`.
