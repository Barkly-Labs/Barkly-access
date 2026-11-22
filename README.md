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

## Build and install

The installable BetterDiscord plugin is built from the modular source. You need Node.js 20 or newer (the current LTS release is recommended).

1. Install Node.js from [nodejs.org](https://nodejs.org/) if `node --version` and `npm --version` do not work.
2. In this repository folder, install dependencies: `npm install`.
3. Run the automated tests and bundle check: `npm test`.
4. Build the plugin: `npm run build`.
5. Find the standalone file at `dist/BarklyAccess.plugin.js`.
6. In Discord, open **User Settings → BetterDiscord → Plugins → Open Plugins Folder**. Copy `BarklyAccess.plugin.js` into that folder. BetterDiscord’s official [plugin installation guide](https://docs.betterdiscord.app/users/guides/installing-addons) has the current UI steps and [plugin folder paths](https://docs.betterdiscord.app/plugins/introduction/quick-start#plugin-folder).
7. Return to **BetterDiscord → Plugins** and enable **BarklyAccess**. If Discord does not detect it immediately, use the plugin list's reload control or restart Discord.

### Frequent prototype and privacy

Open the Barkly Access panel and its **Frequent** tab, then choose a local JSON file containing an array of messages or an object with a `messages`, `data`, or `items` array. Each record needs a stable message ID and an author ID (for example `id`/`author.id`, or `message_id`/`author_id`). Display names are optional. Records are normalized in memory; message bodies and attachments are omitted before counting. Frequent retains only ranking totals, duplicate IDs needed for the current scan, and optional author labels in memory. These Frequent values are not written to BetterDiscord storage or sent over the network. The existing view-toggle preferences are saved locally by BetterDiscord. **Clear ranking** and disabling/restarting the plugin discard the Frequent values.

The current prototype does not fetch Discord history or call private Discord APIs. It only processes a JSON file you choose. Counts are limited to records included in that file; user names without a stable author ID are not counted. BetterDiscord itself is an unofficial client modification and its continued compatibility is not guaranteed.

## License

MIT — see `LICENSE`.

### Frequent people tab (experimental)

The BetterDiscord adapter includes a local **Frequent** tab that ranks author names in currently rendered messages in the open channel. It is a transient approximate count, not a persisted social ranking. It does not inspect message text or transmit data. See the adapter README for limitations.
