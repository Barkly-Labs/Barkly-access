# Roadmap

## Phase 0 — Product framing
- [x] Define purpose and principles
- [x] Identify initial feature: Catch Me Up
- [ ] Collect user stories and co-design feedback
- [ ] Review Discord policies and supported integration paths

## Phase 1 — Data-free prototype
- [ ] Create mock server/channel activity data
- [ ] Build Catch Me Up interface
- [ ] Show unread activity, direct involvement, and optional items separately
- [ ] Add controls for dismissing, expanding, and correcting summaries
- [ ] Test with keyboard and screen readers

## Phase 2 — Accessibility testing
- [ ] Recruit voluntary disabled-user feedback
- [ ] Test cognitive load, navigation, readability, and error recovery
- [ ] Document findings and revisions

## Phase 3 — Integration research
- [ ] Confirm platform-supported options and policy constraints
- [ ] Privacy and threat-model review
- [ ] Design connector only after policy review

## Future modules
- Focus mode
- Notification digest
- Context recovery
- Reading assist
- Navigation assist
- Profile manager

## BetterDiscord experiment

- [x] Place experimental Focus Mode adapter in `src/integrations/betterdiscord/`.
- [ ] Validate selector behavior in a test environment and document limitations.
- [ ] Review compatibility, policy, and PAW-HC concerns before expanding features.
