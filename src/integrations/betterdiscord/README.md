# BetterDiscord experimental adapter

This is an experimental, platform-specific integration for the Barkly Access project. It is intentionally kept inside `src/integrations/betterdiscord/`, alongside the project’s core/source assets, rather than as a separate top-level project.

Client modifications may violate Discord's Terms of Service and can carry account risk. This adapter is experimental and uses unstable client selectors. Use at your own discretion.

## Focus Mode (0.1.0)

- Toggle with `Ctrl+Shift+F`.
- Hide the member list.
- Increase message spacing and line-height.
- Highlight the message composer with Barkly pink.
- Restore styles when toggled off or the plugin is stopped.

## Install

For a BetterDiscord installation that supports plugins, copy `BarklyAccess.plugin.js` into its plugin folder and enable it in the client. Client modifications are unsupported by Discord.
