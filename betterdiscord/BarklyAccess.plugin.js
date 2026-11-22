/**
 * @name BarklyAccess
 * @author Barkly Labs
 * @version 0.1.0
 * @description Optional focus mode for Discord chat. Toggle with Ctrl+Shift+F.
 * @website https://barklylabs.space
 */
module.exports = class BarklyAccess {
  start() {
    this.styleId = 'barkly-access-focus-mode';
    this.active = false;
    this.onKeyDown = (event) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        this.toggle();
      }
    };
    document.addEventListener('keydown', this.onKeyDown, true);
    BdApi.UI.showToast('Barkly Access loaded · Ctrl+Shift+F toggles focus mode', { type: 'info' });
  }

  toggle() {
    this.active = !this.active;
    document.body.classList.toggle('barkly-access-focus', this.active);
    if (this.active) BdApi.DOM.addStyle(this.styleId, this.css());
    else BdApi.DOM.removeStyle(this.styleId);
    BdApi.UI.showToast(`Barkly Access focus mode ${this.active ? 'on' : 'off'}`, { type: 'info' });
  }

  stop() {
    document.removeEventListener('keydown', this.onKeyDown, true);
    document.body.classList.remove('barkly-access-focus');
    BdApi.DOM.removeStyle(this.styleId);
  }

  css() {
    return `
      /* PAW-HC: user-triggered, reversible decluttering; no content is removed. */
      body.barkly-access-focus [class*="membersWrap"] { display: none !important; }
      body.barkly-access-focus [class*="membersList"] { display: none !important; }
      body.barkly-access-focus [class*="chatContent"] { min-width: 0 !important; }
      body.barkly-access-focus [class*="messageListItem"] { padding-block: 5px !important; }
      body.barkly-access-focus [class*="messageContent"] { line-height: 1.6 !important; }
      body.barkly-access-focus [class*="channelTextArea"] { border: 2px solid #ff4fa3 !important; }
      body.barkly-access-focus [class*="chatContent"]:focus-within { outline: 2px solid #ff8bc5; outline-offset: -2px; }
      body.barkly-access-focus [class*="membersWrap"] { width: 0 !important; }
      /* Barkly palette used for focus indicators only; host theme remains intact. */
      body.barkly-access-focus *:focus-visible { outline: 2px solid #ff8bc5 !important; outline-offset: 2px; }
    `;
  }
};
