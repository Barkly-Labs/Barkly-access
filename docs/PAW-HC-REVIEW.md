# PAW-HC Review — Focus Mode and declutter controls 0.2.0

- **User choice:** all hiding controls are opt-in and independently toggled.
- **Reversibility:** panel controls and Ctrl+Shift+R restore all hidden regions; stopping the plugin removes its styles and UI.
- **No content interpretation:** the plugin does not infer message meaning, tone or urgency.
- **Visual identity:** Barkly palette (`#090909`, `#101010`, `#ff4fa3`, `#ff8bc5`, off-white) is used for plugin controls and focus indicators.
- **Keyboard access:** buttons have focus indicators and shortcut controls are documented.
- **Privacy:** preference state is stored using BetterDiscord local data storage; no network calls or message-content collection.
- **Known limitations:** Discord selectors are unstable and sidebar/header selectors may need adaptation; test with keyboard and screen readers, and verify contrast. This is not a WCAG conformance claim.
- **Platform risk:** client mods may violate Discord's terms and may risk account action.
