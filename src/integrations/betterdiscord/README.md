# Barkly Access · BetterDiscord adapter

Experimental client-mod adapter for cognitive decluttering. The goal is progressive disclosure: a single Quiet View toggle, with optional controls tucked away and a one-step restore. This is not officially supported by Discord and client selectors may break.

- `Ctrl+Shift+F`: toggle Quiet View
- `Ctrl+Shift+R`: restore view
- Quiet View applies spacing and hides selected peripheral areas; content/messages are not filtered. The control panel exposes individual restore switches.

PAW-HC: reversible, user-directed, dignity-preserving; WCAG checks still need manual testing in the client.

## Readable chat layout (0.4 experimental)

The **Readable chat layout** toggle adds a restrained message hierarchy: extra vertical space between message rows, a readable measure for message text, quieter timestamp styling, and clearer reply/embed presentation. It does not filter, summarize, or remove message content. Toggle it independently from Quiet View.

This relies on Discord's internal CSS class names, which are unstable. Validate selectors and keyboard/screen-reader behavior in the live client before relying on them.
