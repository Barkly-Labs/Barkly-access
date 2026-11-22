# PAW-HC review — Barkly Access Stats prototype

- **Agency:** opening a conversation starts collection for that conversation only. The dashboard offers per-conversation and all-data deletion.
- **Privacy:** only message and author metadata is normalized. Bodies and attachments are not read into analytics. Aggregate records and bounded message-ID fingerprints are stored locally.
- **Coverage honesty:** only rows rendered by Discord are observed. Collection remains partial; the plugin does not fetch or claim complete history.
- **Direction:** current integration does not access Discord's internal user store, so sent/received direction is marked unknown.
- **Accessibility:** controls use native buttons, labels, semantic lists and headings, visible focus, text chart summaries, and reduced-motion styling. Manual screen-reader and live-client checks remain outstanding.
- **Platform risk:** the integration uses unstable Discord DOM selectors and has not been validated in a running client. It uses no private endpoints, tokens, or self-bot behavior.
