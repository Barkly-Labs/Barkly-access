# BetterDiscord experimental adapter

Experimental Discord client modification; client mods may violate Discord's Terms and carry account risk. Discord's internal selectors are unstable.

## Barkly Access 0.2.0 — declutter controls

The floating Barkly Access control panel provides independent, reversible controls:

- Focus mode: hides member list, increases message spacing and line-height, highlights composer and keyboard focus.
- Channel list: hide/show the channel sidebar (selector is experimental).
- Member list: hide/show members.
- Server rail: hide/show server navigation.
- Chat header: hide/show toolbar controls.
- Restore everything: returns all regions to visible and exits focus mode.

Keyboard shortcuts:
- `Ctrl+Shift+F`: toggle focus mode.
- `Ctrl+Shift+R`: restore all areas and exit focus mode.

Preferences are stored locally via BetterDiscord's data API. Hidden areas are not deleted; they can be restored through the control panel or shortcut. Verify selectors and usability in your client before relying on them.

## Install
Copy `BarklyAccess.plugin.js` into BetterDiscord's plugin directory and enable it. BetterDiscord is unofficial and unsupported by Discord.
