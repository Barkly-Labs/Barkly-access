# Barkly Access

**Cognitive accessibility tools for Discord.** Reduce cognitive load while preserving the features and social experience people value.

> Discord shouldn't require you to remember everything, process everything, and navigate everything just to participate.

## Project status

Early concept / prototype with an experimental BetterDiscord adapter under `src/integrations/betterdiscord/`. Discord client modifications may violate Discord's Terms and may risk account action; the adapter is experimental and unsupported.

## Initial MVP: Catch Me Up

- Summarize activity since a person's last visit (in a prototype, using sample data).
- Highlight messages that mention or directly involve them.
- Separate actionable items from optional updates.
- Preserve links to the original messages in the eventual integration.
- Give the user control over summaries and what gets surfaced.

## Principles

1. User control and opt-in defaults.
2. Preserve original context; summaries are not authoritative.
3. Don't infer intent, emotions, or urgency without evidence.
4. Minimize data collection and retention.
5. Respect platform rules and privacy boundaries.
6. Co-design and test with disabled users.
7. Features should be modular and individually disableable.

## Proposed modules

- `focus-mode`: configurable decluttering
- `notification-digest`: grouped activity summaries
- `context-recovery`: resume where the user left off
- `reading-assist`: readable text/layout preferences
- `navigation-assist`: shortcuts and reduced interaction steps
- `profile-manager`: editable accessibility presets

## Development

The initial prototype and plugin have no project-managed runtime dependencies. Review `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, and `docs/PAW-HC-REVIEW.md`. The BetterDiscord adapter is located in `src/integrations/betterdiscord/`.

## License

MIT — see `LICENSE`.
