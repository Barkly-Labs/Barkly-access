/**
 * @name BarklyAccess
 * @author Barkly Labs
 * @version 0.6.0
 * @description Reduce competing chat UI elements with a reversible, user-controlled Quiet View.
 */
module.exports = class BarklyAccess {
  constructor() {
    this.styleId = 'barkly-access-quiet-view';
    this.panelId = 'barkly-access-panel';
    this.state = { quiet: false, layout: false, numbered: false, showMembers: false, showChannels: false, showToolbar: false };
    this.classes = { quiet: 'ba-quiet', layout: 'ba-readable-layout', numbered: 'ba-numbered-chat', members: 'ba-hide-members', channels: 'ba-hide-channels', toolbar: 'ba-hide-toolbar' };
    this.chunkClasses = ['ba-chunk-start','ba-chunk-middle','ba-chunk-end','ba-chunk-single'];
  }
  start() {
    this.state = Object.assign(this.state, BdApi.Data.load('BarklyAccess', 'state') || {});
    this.apply(); this.createPanel(); this.groupMessages();
    this.chunkObserver = new MutationObserver(() => this.groupMessages());
    this.chunkObserver.observe(document.querySelector('[class*=scrollerInner]') || document.body, { childList:true, subtree:true });
    this.onKeyDown = e => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); this.toggleQuiet(); }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') { e.preventDefault(); this.restore(); }
    };
    document.addEventListener('keydown', this.onKeyDown, true);
    BdApi.UI.showToast('Barkly Access · Ctrl+Shift+F quiet view · Ctrl+Shift+R restore', {type:'info'});
  }
  save(){ BdApi.Data.save('BarklyAccess','state',this.state); }
  toggleQuiet(){ this.state.quiet=!this.state.quiet; this.apply(); this.save(); this.updatePanel(); }
  toggle(key){ this.state[key]=!this.state[key]; this.apply(); this.save(); this.updatePanel(); }
  restore(){ this.state={quiet:false,layout:false,numbered:false,showMembers:false,showChannels:false,showToolbar:false}; this.apply(); this.save(); this.updatePanel(); BdApi.UI.showToast('Barkly Access · view restored',{type:'success'}); }
  apply(){
    const b=document.body;
    b.classList.toggle(this.classes.quiet,!!this.state.quiet);
    b.classList.toggle(this.classes.layout,!!this.state.layout);
    b.classList.toggle(this.classes.numbered,!!this.state.numbered);
    b.classList.toggle(this.classes.members,!!this.state.quiet && !this.state.showMembers);
    b.classList.toggle(this.classes.channels,!!this.state.quiet && !this.state.showChannels);
    b.classList.toggle(this.classes.toolbar,!!this.state.quiet && !this.state.showToolbar);
    BdApi.DOM.addStyle(this.styleId,this.css());
  }
  createPanel(){
    if(document.getElementById(this.panelId)) return;
    const p=document.createElement('aside'); p.id=this.panelId; p.setAttribute('aria-label','Barkly Access');
    p.innerHTML=`<button class="ba-main" aria-expanded="false">Barkly Access <span>＋</span></button><div class="ba-options" hidden><p class="ba-summary">Show less at once. Bring anything back anytime.</p><button data-action="quiet" aria-pressed="false">Quiet view</button><button data-action="layout" aria-pressed="false">Readable chat layout</button><button data-action="numbered" aria-pressed="false">Conversation cards</button><div class="ba-extra"><button data-action="showMembers">Member list</button><button data-action="showChannels">Channel list</button><button data-action="showToolbar">Chat toolbar</button></div><button data-action="restore" class="ba-restore">Restore Discord view</button><p class="ba-help">Ctrl+Shift+F · quiet view<br>Ctrl+Shift+R · restore</p></div>`;
    p.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.classList.contains('ba-main')){const d=p.querySelector('.ba-options');d.hidden=!d.hidden;b.setAttribute('aria-expanded',String(!d.hidden));b.querySelector('span').textContent=d.hidden?'＋':'−';return;}const a=b.dataset.action;if(a==='restore')this.restore();else if(a==='quiet')this.toggleQuiet();else if(a)this.toggle(a);});
    document.body.appendChild(p);this.panel=p;this.updatePanel();
  }
  updatePanel(){ if(!this.panel)return; this.panel.querySelectorAll('[data-action]').forEach(b=>{const k=b.dataset.action;if(k==='restore')return;const on=k==='quiet'?this.state.quiet:this.state[k];b.setAttribute('aria-pressed',String(!!on));b.classList.toggle('ba-on',!!on);const labels={quiet:'Quiet view',layout:'Readable chat layout',numbered:'Conversation cards',showMembers:'Member list',showChannels:'Channel list',showToolbar:'Chat toolbar'};b.textContent=(k==='quiet'||k==='layout'||k==='numbered')?`${labels[k]} · ${on?'On':'Off'}`:`${labels[k]} · ${on?'Shown':'Hidden'}`;});}
  stop(){document.removeEventListener('keydown',this.onKeyDown,true);this.chunkObserver?.disconnect();document.querySelectorAll('[class*=messageListItem]').forEach(n=>this.chunkClasses.forEach(c=>n.classList.remove(c)));Object.values(this.classes).forEach(c=>document.body.classList.remove(c));BdApi.DOM.removeStyle(this.styleId);document.getElementById(this.panelId)?.remove();}
  groupMessages(){
    const root=document.querySelector('[class*=scrollerInner]'); if(!root)return;
    const nodes=[...root.querySelectorAll('[class*=messageListItem]')]; if(!nodes.length)return;
    const readTime=n=>{const t=n.querySelector('time');if(t){const d=t.dateTime?new Date(t.dateTime):new Date(t.textContent);if(!Number.isNaN(d.getTime()))return d.getTime();}return null;};
    let group=0,prevTime=null,prevNode=null,members=[];
    const finish=()=>{if(!members.length)return;members.forEach((n,i)=>{this.chunkClasses.forEach(c=>n.classList.remove(c));n.classList.add(members.length===1?'ba-chunk-single':i===0?'ba-chunk-start':i===members.length-1?'ba-chunk-end':'ba-chunk-middle');});members=[];};
    nodes.forEach(n=>{const t=readTime(n);const gap=(t!==null&&prevTime!==null)?t-prevTime:null;const split=!prevNode||gap===null||gap<0||gap>15*60*1000;if(split){finish();group++;}members.push(n);prevNode=n;prevTime=t;});finish();
  }
  css(){return `
    /* Numbered conversation chunks: group nearby messages into a cohesive unit. */
    body.${this.classes.numbered} [class*='scrollerInner'] {counter-reset:barkly-chunk;}
    body.${this.classes.numbered} [class*='messageListItem'] {position:relative; margin:0 12px !important; padding:12px 18px 12px 62px !important; background:#101010; border-left:3px solid #ff4fa3; border-right:1px solid #292929; min-height:64px; box-shadow:none;}
    body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-start, body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-single {counter-increment:barkly-chunk; margin-top:14px !important; border-top:1px solid #292929; border-radius:16px 16px 0 0; background:linear-gradient(110deg,#151015,#101010 42%);}
    body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-start::before, body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-single::before {content:counter(barkly-chunk); position:absolute; left:16px; top:16px; display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:10px; background:#ff4fa3; color:#090909; font-weight:800; font-size:14px;}
    body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-middle, body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-end {border-top:1px solid #292929; background:#101010;}
    body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-end, body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-single {border-bottom:1px solid #292929; border-radius:0 0 16px 16px; margin-bottom:14px !important;}
    body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-single {border-radius:16px;}
    body.${this.classes.numbered} [class*='messageListItem']:hover {background:#171217;}
    body.${this.classes.numbered} [class*='messageListItem'] [class*='contents'] {min-width:0;}
    body.${this.classes.numbered} [class*='messageContent'] {line-height:1.65; max-width:72ch; overflow-wrap:anywhere;}
    body.${this.classes.numbered} [class*='messageListItem'] [class*='header'] {display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; margin-bottom:5px;}
    body.${this.classes.numbered} [class*='messageListItem'] [class*='avatar'] {border-radius:12px;}
    body.${this.classes.numbered} [class*='messageListItem'] [class*='markup'] p {margin-block:4px;}
    body.${this.classes.numbered} [class*='messageListItem'] [class*='attachment'], body.${this.classes.numbered} [class*='messageListItem'] [class*='embed'] {margin-top:10px; border-radius:12px;}
    body.${this.classes.numbered} [class*='messageListItem'] [class*='repliedMessage'] {border-left:3px solid #ff8bc5; border-radius:6px; padding:6px 10px; margin-bottom:8px; background:#ff4fa308;}
    body.${this.classes.numbered} [class*='timestamp'] {opacity:.68; font-size:.82em;}
    body.${this.classes.layout} [class*="messageListItem"] {padding-block:8px !important;}
    body.${this.classes.layout} [class*="messageContent"] {line-height:1.6 !important;max-width:78ch;}
    body.${this.classes.layout} [class*="messageListItem"] [class*="avatar"] {margin-top:3px;}
    body.${this.classes.layout} [class*="messageListItem"] [class*="timestamp"] {opacity:.72;font-size:.82em;}
    body.${this.classes.layout} [class*="reaction"] {opacity:.88;}
    body.${this.classes.layout} [class*="messageListItem"] [class*="reply"] {border-left:2px solid #ff8bc5;padding-left:8px;}
    body.${this.classes.layout} [class*="messageListItem"] [class*="embed"] {margin-top:8px;border-radius:8px;}
    /* Quiet view: progressive disclosure, never remove chat content itself. */
    body.${this.classes.quiet} [class*="membersWrap"] {display:none !important;}
    body.${this.classes.channels} [class*="sidebar"] {display:none !important;}
    body.${this.classes.toolbar} [class*="chatContent"] [class*="toolbar"] {display:none !important;}
    body.${this.classes.quiet} [class*="messageListItem"] {padding-block:5px !important;}
    body.${this.classes.quiet} [class*="messageContent"] {line-height:1.65 !important;}
    body.${this.classes.quiet} [class*="channelTextArea"] {border:1px solid #ff4fa3 !important;}
    body.${this.classes.quiet} *:focus-visible {outline:2px solid #ff8bc5 !important;outline-offset:2px;}
    #${this.panelId}{position:fixed;z-index:99999;top:14px;right:16px;width:238px;max-height:80vh;overflow:auto;background:#090909;color:#f1f1f1;border:1px solid #ff4fa3;border-radius:12px;box-shadow:0 8px 28px #0009;font:14px/1.45 sans-serif;}
    #${this.panelId} button{display:block;width:100%;text-align:left;background:#101010;color:#f1f1f1;border:1px solid #444;border-radius:8px;padding:9px 10px;margin:6px 0;cursor:pointer;}
    #${this.panelId} button:focus-visible{outline:3px solid #ff8bc5;outline-offset:2px;}
    #${this.panelId} .ba-main{font-weight:700;background:#ff4fa3;color:#090909;border:0;margin:0;display:flex;justify-content:space-between;}
    #${this.panelId} .ba-options{padding:8px 10px 10px;} #${this.panelId} .ba-options[hidden]{display:none;}
    #${this.panelId} .ba-summary,#${this.panelId} .ba-help{color:#ccc;font-size:12px;margin:8px 2px;}
    #${this.panelId} .ba-extra{border-top:1px solid #292929;margin-top:8px;padding-top:4px;}
    #${this.panelId} button.ba-on{border-color:#ff8bc5;box-shadow:inset 3px 0 #ff4fa3;}
    #${this.panelId} .ba-restore{background:#ff8bc5;color:#090909;font-weight:700;}
  `;}
};
