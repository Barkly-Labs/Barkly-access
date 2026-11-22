# Barkly Access — BetterDiscord experimental plugin

**Prototype only (0.1.0).** This plugin offers a user-triggered focus mode that hides the member list, increases message spacing and emphasizes the composer. Toggle with `Ctrl+Shift+F`.

## Installation (experimental)

1. Review Discord's Terms and your client-modification risk first. Client modifications may violate Discord's terms and could result in account action.
2. If you already use BetterDiscord, place `BarklyAccess.plugin.js` in its Plugins folder.
3. Enable the plugin in BetterDiscord's Plugin settings.
4. Toggle focus mode with `Ctrl+Shift+F`.

## Limitations

- This is a DOM/CSS prototype, not a supported Discord integration.
- Discord's internal class names change; focus mode selectors may break.
- The member list is hidden while focus mode is active, but can be restored by toggling focus mode off.
- No messages are read, stored, transmitted, summarized, or modified.
- Accessibility and PAW-HC review is ongoing; this is not a WCAG conformance claim.

## PAW-HC / WCAG development notes

- User-initiated, reversible mode.
- No content collection or external network calls.
- Focus-visible styling uses Barkly pink. Contrast should be independently tested against supported Discord themes.
- Future work: settings, better control than a hotkey alone, reduced-motion handling, screen-reader testing, keyboard testing and co-design.
