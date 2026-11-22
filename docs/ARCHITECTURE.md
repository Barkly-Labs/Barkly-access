# Architecture (proposal)

Keep the core preferences and UI independent of any Discord-specific integration.

```text
Accessibility UI / Prototype
          |
     Access Core
 (preferences, profiles)
          |
   Feature Modules
 (digest, focus, recovery)
          |
   Integration Adapter
 (only policy-compliant, supported paths)
```

## Data boundaries

- Prototype uses locally defined sample data only.
- Avoid storing message content by default.
- If an integration is later considered, minimize scopes and retention, and provide clear deletion controls.
- Summaries must link to source context and be clearly labeled as generated.

## Module interface (concept)

Modules should declare their name, settings, data requirements, and whether they can operate without integration data. Keep modules isolated and easy to disable.

## Source layout

Platform-specific integrations live beneath `src/integrations/<platform>/` to keep them within the source tree and isolated from platform-independent assets and logic. The current BetterDiscord experiment lives in `src/integrations/betterdiscord/`.
