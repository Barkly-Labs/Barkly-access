# PAW-HC Review — Barkly Access 0.4 (experimental readable layout)

- **Agency and reversibility:** readable layout and Quiet View are independent controls; restore resets both and plugin stop removes its CSS.
- **Content preservation:** layout styles change spacing and hierarchy only; they do not filter, summarize, or hide messages.
- **Cognitive load:** more whitespace, bounded text line length, reduced timestamp prominence, and clearer reply/embed styling aim to improve scanning.
- **Visual identity:** controls and focus indicators use Barkly's black/pink palette.
- **Accessibility validation:** not a WCAG conformance claim. Test contrast, zoom, keyboard navigation, screen-reader semantics, selector behavior, and user feedback.
- **Privacy:** no message collection or network calls; preferences remain in BetterDiscord local data.
- **Platform risk:** client mods may violate Discord's terms and may risk account action.

## Conversation chunk grouping

- Group short message bursts into visual chunks, including messages from different people, rather than making each message a standalone card.
- Number each chunk as a navigation landmark; keep message content unchanged and in original order.
- Prototype heuristic: 15-minute time gap. User testing should evaluate whether this grouping window makes sense and should become configurable.
