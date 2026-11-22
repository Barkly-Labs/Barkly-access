/**
 * @name BarklyAccess
 * @author Barkly Labs
 * @version 0.2.0
 * @description Optional, reversible chat decluttering with a control panel. Ctrl+Shift+F toggles Focus Mode.
 * @website https://barklylabs.space
 */
module.exports = class BarklyAccess {
  constructor() {
    this.styleId = 'barkly-access-focus-mode';
    this.panelId = 'barkly-access-panel';
    this.classes = {
      focus: 'barkly-access-focus',
      channels: 'barkly-access-hide-channels',
      members: 'barkly-access-hide-members',
      servers: 'barkly-access-hide-servers',
      header: 'barkly-access-hide-header'
    };
    this.state = { focus: false, channels: false, members: false, servers: false, header: false };
  }

  start() {
    this.state = Object.assign(this.state, BdApi.Data.load('BarklyAccess', 'state') || {});
    this.applyState();
    this.createPanel();
    this.onKeyDown = (event) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault(); event.stopPropagation(); this.toggleFocus();
      }
      // Re-display sidebars quickly, even when focus mode has hidden them.
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'r') {
        event.preventDefault(); this.restoreAll();
      }
    };
    document.addEventListener('keydown', this.onKeyDown, true);
    BdApi.UI.showToast('Barkly Access · Ctrl+Shift+F focus · Ctrl+Shift+R restore', { type: 'info' });
  }

  save() { BdApi.Data.save('BarklyAccess', 'state', this.state); }
  toggleFocus() { this.state.focus = !this.state.focus; this.applyState(); this.save(); this.updatePanel(); }
  toggle(key) { this.state[key] = !this.state[key]; this.applyState(); this.save(); this.updatePanel(); }
  restoreAll() {
    this.state = { focus: false, channels: false, members: false, servers: false, header: false };
    this.applyState(); this.save(); this.updatePanel();
    BdApi.UI.showToast('Barkly Access · all Discord areas restored', { type: 'success' });
  }

  applyState() {
    const body = document.body;
    Object.entries(this.classes).forEach(([key, cls]) => body.classList.toggle(cls, !!this.state[key]));
    BdApi.DOM.addStyle(this.styleId, this.css());
  }

  createPanel() {
    if (document.getElementById(this.panelId)) return;
    const panel = document.createElement('section');
    panel.id = this.panelId;
    panel.setAttribute('aria-label', 'Barkly Access controls');
    panel.innerHTML = `
      <button type="button" class="ba-toggle" aria-expanded="true">Barkly Access <span class="ba-collapse">−</span></button>
      <div class="ba-controls">
        <button type="button" data-action="focus" aria-pressed="false">Focus mode</button>
        <button type="button" data-action="channels" aria-pressed="false">Channel list</button>
        <button type="button" data-action="members" aria-pressed="false">Member list</button>
        <button type="button" data-action="servers" aria-pressed="false">Server rail</button>
        <button type="button" data-action="header" aria-pressed="false">Chat header</button>
        <button type="button" data-action="restore">Restore everything</button>
        <p class="ba-help">Hidden areas are reversible. Ctrl+Shift+R restores everything.</p>
      </div>`;
    panel.addEventListener('click', (event) => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.classList.contains('ba-toggle')) {
        const controls = panel.querySelector('.ba-controls');
        const hidden = controls.hidden = !controls.hidden;
        button.setAttribute('aria-expanded', String(!hidden)); button.querySelector('.ba-collapse').textContent = hidden ? '+' : '−';
        return;
      }
      const action = button.dataset.action;
      if (action === 'restore') this.restoreAll();
      else if (action === 'focus') this.toggleFocus();
      else if (action) this.toggle(action);
    });
    document.body.appendChild(panel); this.panel = panel; this.updatePanel();
  }

  updatePanel() {
    if (!this.panel) return;
    this.panel.querySelectorAll('[data-action]').forEach(button => {
      const key = button.dataset.action;
      if (key in this.state) {
        button.setAttribute('aria-pressed', String(!!this.state[key]));
        button.classList.toggle('ba-on', !!this.state[key]);
        const labels = { focus: 'Focus mode', channels: 'Channel list', members: 'Member list', servers: 'Server rail', header: 'Chat header' };
        button.textContent = `${labels[key]} · ${this.state[key] ? 'Hidden' : 'Shown'}`;
      }
    });
  }

  stop() {
    document.removeEventListener('keydown', this.onKeyDown, true);
    Object.values(this.classes).forEach(cls => document.body.classList.remove(cls));
    BdApi.DOM.removeStyle(this.styleId);
    document.getElementById(this.panelId)?.remove();
  }

  css() {
    return `
      /* PAW-HC: reversible, user-directed decluttering. No message content is hidden. */
      body.${this.classes.members} [class*="membersWrap"] { display:none !important; }
      body.${this.classes.channels} [class*="sidebar"]:not([class*="sidebarList"]),
      body.${this.classes.channels} [class*="guilds"] ~ [class*="sidebar"] { display:none !important; }
      body.${this.classes.servers} [class*="guilds"] { display:none !important; }
      body.${this.classes.header} [class*="chatContent"] [class*="toolbar"] { display:none !important; }
      body.${this.classes.focus} [class*="messageListItem"] { padding-block:5px !important; }
      body.${this.classes.focus} [class*="messageContent"] { line-height:1.6 !important; }
      body.${this.classes.focus} [class*="channelTextArea"] { border:2px solid #ff4fa3 !important; }
      body.${this.classes.focus} [class*="chatContent"]:focus-within { outline:2px solid #ff8bc5; outline-offset:-2px; }
      body.${this.classes.focus} *:focus-visible { outline:2px solid #ff8bc5 !important; outline-offset:2px; }
      #${this.panelId} { position:fixed; z-index:99999; top:16px; right:20px; width:230px; max-height:80vh; overflow:auto; background:#090909; color:#f1f1f1; border:1px solid #ff4fa3; border-radius:12px; box-shadow:0 8px 28px #0009; font:14px/1.45 sans-serif; }
      #${this.panelId} button { display:block; width:100%; text-align:left; background:#101010; color:#f1f1f1; border:1px solid #444; border-radius:8px; padding:9px 10px; margin:5px 0; cursor:pointer; }
      #${this.panelId} button:focus-visible { outline:3px solid #ff8bc5; outline-offset:2px; }
      #${this.panelId} .ba-toggle { font-weight:700; background:#ff4fa3; color:#090909; border:0; }
      #${this.panelId} .ba-controls { padding:8px 10px 10px; }
      #${this.panelId} .ba-controls[hidden] { display:none; }
      #${this.panelId} button.ba-on { border-color:#ff8bc5; box-shadow:inset 3px 0 #ff4fa3; }
      #${this.panelId} .ba-help { color:#ccc; font-size:12px; margin:8px 2px 2px; }
    `;
  }
};
