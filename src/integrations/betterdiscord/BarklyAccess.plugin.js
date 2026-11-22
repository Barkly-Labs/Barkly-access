/**
 * @name BarklyAccess
 * @author Barkly Labs
 * @version 0.8.0
 * @description Accessible Discord controls and local conversation analytics.
 */
import { HistoricalStore } from '../../core/storage/historical-store.js';
import { CollectionCoordinator } from '../../core/collection/collection-coordinator.js';
import { collectionModeFor } from '../../core/collection/collection-state.js';
import { summarizeAnalytics } from '../../core/analytics/statistics-engine.js';
import { buildFrequentContacts } from '../../core/frequent/contact-index.js';
import { RenderedHistoryAdapter } from './rendered-history-adapter.js';
import { createDiscordConversationLink } from './frequent-contact-link.js';
import { getSelectedConversationId } from './conversation-selection.js';
import frequentStyles from '../../styles/frequent.css';

export default class BarklyAccess {
  constructor() {
    this.styleId = 'barkly-access-quiet-view';
    this.panelId = 'barkly-access-panel';
    this.memberTabId = 'barkly-access-frequent';
    this.state = { quiet: false, layout: false, numbered: false, showMembers: false, showChannels: false, showToolbar: false, currentUserId: '', controlSize: 'normal', density: 'comfortable' };
    this.classes = { quiet: 'ba-quiet', layout: 'ba-readable-layout', numbered: 'ba-numbered-chat', members: 'ba-hide-members', channels: 'ba-hide-channels', toolbar: 'ba-hide-toolbar', largeControls: 'ba-large-controls', dense: 'ba-dense-layout' };
    this.chunkClasses = ['ba-chunk-start','ba-chunk-middle','ba-chunk-end','ba-chunk-single'];
  }
  start() {
    this.stopped=false;
    this.state = Object.assign(this.state, BdApi.Data.load('BarklyAccess', 'state') || {});
    this.analyticsStore = new HistoricalStore({
      load: () => BdApi.Data.load('BarklyAccess', 'historicalStats'),
      save: value => BdApi.Data.save('BarklyAccess', 'historicalStats', value),
    });
    this.historyAdapter = new RenderedHistoryAdapter({
      getSelectedConversation: () => this.getSelectedConversation(),
      // The adapter deliberately avoids Discord Webpack/internal stores. If a
      // supported identity provider is added later it can be injected here.
      getCurrentUserId: () => this.state.currentUserId || null,
      getConversationPath: () => window.location.pathname,
    });
    this.collectionCoordinator = new CollectionCoordinator({
      adapter: this.historyAdapter,
      store: this.analyticsStore,
      onProgress: event => { this.renderStats(); this.refreshFrequent(); this.updateCollectionPopup(event); },
    });
    this.apply(); this.createPanel(); this.groupMessages();
    this.chunkObserver = new MutationObserver(() => this.groupMessages());
    this.chunkObserver.observe(document.querySelector('[class*=scrollerInner]') || document.body, { childList:true, subtree:true });
    this.historyObserver = new MutationObserver(() => this.bindHistoryObserver());
    this.historyObserver.observe(document.body, { childList:true, subtree:true });
    this.bindHistoryObserver();
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
  restore(){ this.state={quiet:false,layout:false,numbered:false,showMembers:false,showChannels:false,showToolbar:false,currentUserId:this.state.currentUserId||'',controlSize:'normal',density:'comfortable'}; this.apply(); this.save(); this.updatePanel(); BdApi.UI.showToast('Barkly Access · view restored',{type:'success'}); }
  apply(){
    const b=document.body;
    b.classList.toggle(this.classes.quiet,!!this.state.quiet);
    b.classList.toggle(this.classes.layout,!!this.state.layout);
    b.classList.toggle(this.classes.numbered,!!this.state.numbered);
    b.classList.toggle(this.classes.members,!!this.state.quiet && !this.state.showMembers);
    b.classList.toggle(this.classes.channels,!!this.state.quiet && !this.state.showChannels);
    b.classList.toggle(this.classes.toolbar,!!this.state.quiet && !this.state.showToolbar);
    b.classList.toggle(this.classes.largeControls,this.state.controlSize==='large');
    b.classList.toggle(this.classes.dense,this.state.density==='compact');
    BdApi.DOM.addStyle(this.styleId,this.css());
  }
  createPanel(){
    if(document.getElementById(this.panelId)) return;
    const p=document.createElement('aside'); p.id=this.panelId; p.setAttribute('aria-label','Barkly Access');
    p.innerHTML=`<button class="ba-main" aria-expanded="false">Barkly Access <span aria-hidden="true">＋</span></button><div class="ba-options" hidden><div class="ba-tabs" role="tablist" aria-label="Barkly Access features"><button type="button" role="tab" aria-selected="true" data-tab="controls" class="ba-tab-active">Access</button><button type="button" role="tab" aria-selected="false" data-tab="frequent">Frequent</button><button type="button" role="tab" aria-selected="false" data-tab="stats">Stats</button></div><section data-pane="controls"><p class="ba-summary">Show less at once. Bring anything back anytime.</p><button data-action="quiet" aria-pressed="false">Quiet view</button><button data-action="layout" aria-pressed="false">Readable chat layout</button><button data-action="numbered" aria-pressed="false">Conversation cards</button><div class="ba-extra"><button data-action="showMembers">Member list</button><button data-action="showChannels">Channel list</button><button data-action="showToolbar">Chat toolbar</button></div><div class="ba-access-settings"><label for="ba-current-user-id">Current Discord user ID <span>(optional; enables reliable sender separation)</span></label><input id="ba-current-user-id" inputmode="numeric" autocomplete="off" maxlength="20" placeholder="Paste your user ID"><label for="ba-control-size">Control size</label><select id="ba-control-size"><option value="normal">Normal</option><option value="large">Large</option></select><label for="ba-density">Visual density</label><select id="ba-density"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div><button data-action="restore" class="ba-restore">Restore Discord view</button><p class="ba-help">Ctrl+Shift+F · quiet view<br>Ctrl+Shift+R · restore</p></section><section data-pane="frequent" hidden><h2 class="ba-frequent-title">Frequent contacts</h2><p class="ba-summary">People and conversations come from the same saved, deduplicated analytics as Stats. Counts mean unique messages collected for that person in that conversation.</p><div class="ba-frequent-controls"><label for="ba-frequent-search">Search people</label><input id="ba-frequent-search" type="search" autocomplete="off" placeholder="Name, username, or ID"><label for="ba-frequent-sort">Sort contacts</label><select id="ba-frequent-sort"><option value="messages">Most messages</option><option value="recent">Most recent interaction</option><option value="name">Name</option></select></div><div class="ba-frequent-status" role="status" aria-live="polite">Frequent contacts update as conversation batches are collected.</div><ul class="ba-frequent-list" aria-label="Tracked people and conversation shortcuts"></ul></section><section data-pane="stats" hidden><h2 class="ba-stats-title">Conversation analytics</h2><p class="ba-summary">Local, metadata-only summaries. Discord exposes only history rendered in the selected conversation, so coverage cannot be confirmed as complete.</p><div class="ba-collection-status" role="status" aria-live="polite"></div><button type="button" data-action="openAnalytics" class="ba-open-analytics">Open Analytics Dashboard</button><button type="button" data-action="collectNow" class="ba-secondary">Backfill selected conversation</button><button type="button" data-action="cancelCollection" class="ba-secondary" hidden>Stop collection</button><button type="button" data-action="clearConversation" class="ba-secondary">Clear this conversation</button><button type="button" data-action="clearAnalytics" class="ba-secondary">Clear all analytics</button></section></div>`;
    p.addEventListener('click',e=>{const b=e.target.closest('button[data-action], button[data-tab], button[data-author], button[data-exclude], button.ba-main');if(!b)return;if(b.dataset.tab){p.querySelectorAll('[data-pane]').forEach(x=>x.hidden=x.dataset.pane!==b.dataset.tab);p.querySelectorAll('[data-tab]').forEach(x=>{const selected=x===b;x.classList.toggle('ba-tab-active',selected);x.setAttribute('aria-selected',String(selected));});if(b.dataset.tab==='stats')this.renderStats();if(b.dataset.tab==='frequent')this.refreshFrequent();return;}if(b.classList.contains('ba-main')){const d=p.querySelector('.ba-options');d.hidden=!d.hidden;b.setAttribute('aria-expanded',String(!d.hidden));b.querySelector('span').textContent=d.hidden?'＋':'−';return;}if(b.dataset.exclude){this.toggleExcluded(b.dataset.exclude);return;}if(b.dataset.author){this.showPersonDetail(b.dataset.author);return;}const a=b.dataset.action;if(a==='restore')this.restore();else if(a==='openAnalytics')this.openAnalyticsDashboard();else if(a==='collectNow')this.startCollectionNow();else if(a==='clearConversation')this.clearCurrentConversation();else if(a==='clearAnalytics')this.clearAllAnalytics();else if(a==='cancelCollection')this.cancelSelectedCollection();else if(a==='quiet')this.toggleQuiet();else if(a)this.toggle(a);});
    p.querySelector('#ba-frequent-search').addEventListener('input',()=>this.refreshFrequent());
    p.querySelector('#ba-frequent-sort').addEventListener('change',()=>this.refreshFrequent());
    const userId=p.querySelector('#ba-current-user-id');userId.value=this.state.currentUserId||'';
    userId.addEventListener('change',()=>{const value=userId.value.trim();this.state.currentUserId=/^\d{15,20}$/.test(value)?value:'';if(!this.state.currentUserId&&value)BdApi.UI.showToast('Enter a numeric Discord user ID, or leave it blank.',{type:'error'});else BdApi.UI.showToast('Sender identity setting saved locally.',{type:'success'});userId.value=this.state.currentUserId;this.save();this.historyAdapter.getCurrentUserId=()=>this.state.currentUserId||null;this.renderStats();});
    const controlSize=p.querySelector('#ba-control-size');controlSize.value=this.state.controlSize||'normal';controlSize.addEventListener('change',()=>{this.state.controlSize=controlSize.value==='large'?'large':'normal';this.apply();this.save();});
    const density=p.querySelector('#ba-density');density.value=this.state.density||'comfortable';density.addEventListener('change',()=>{this.state.density=density.value==='compact'?'compact':'comfortable';this.apply();this.save();});
    p.querySelector('.ba-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...p.querySelectorAll('[data-tab]')];const index=tabs.indexOf(document.activeElement);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:event.key==='ArrowRight'?(index+1)%tabs.length:(index-1+tabs.length)%tabs.length;tabs[next].focus();tabs[next].click();});
    document.body.appendChild(p);this.panel=p;this.updatePanel();this.refreshFrequent();
  }
  getSelectedConversation(){
    return getSelectedConversationId(window.location.pathname);
  }
  bindHistoryObserver(){
    if(!this.historyObserver)return;
    const selected=this.getSelectedConversation();
    if(selected!==this.activeConversationId){
      if(this.activeConversationId)this.collectionCoordinator.cancel(this.activeConversationId);
      this.activeConversationId=selected;this.lastHistorySignature="";this.initialAttemptedFor=null;this.queueHistoryCollection();
    }
    const root=document.querySelector('[class*="scrollerInner"]');
    if(root===this.messageRoot)return;
    this.messageObserver?.disconnect();this.messageRoot=root;
    if(root){this.messageObserver=new MutationObserver(()=>this.queueHistoryCollection());this.messageObserver.observe(root,{childList:true,subtree:true});this.lastHistorySignature="";this.queueHistoryCollection();}
  }
  queueHistoryCollection(){
    if(!this.activeConversationId)return;
    clearTimeout(this.collectionTimer);
    this.collectionTimer=setTimeout(()=>this.collectSelectedConversation(),350);
  }
  startCollectionNow(){const id=this.getSelectedConversation();if(!id)return;this.activeConversationId=id;this.lastHistorySignature='';this.initialAttemptedFor=null;this.collectSelectedConversation({manual:true});}
  async collectSelectedConversation({manual=false}={}){
    const conversationId=this.getSelectedConversation();
    if(!conversationId||conversationId!==this.activeConversationId)return;
    if(this.collectionCoordinator.active.has(String(conversationId)))return;
    const root=document.querySelector('[class*="scrollerInner"]');
    const signature=root?[...root.querySelectorAll('[class*="messageListItem"]')].map(row=>row.id||row.getAttribute('data-list-item-id')||'').join('|'):'';
    if(!signature||signature===this.lastHistorySignature)return;
    const mode=collectionModeFor(this.analyticsStore.getConversation(conversationId)?.collection);
    if(!manual&&mode==='initial'&&this.initialAttemptedFor===conversationId)return;
    if(mode==='initial')this.initialAttemptedFor=conversationId;
    const collection=this.collectionCoordinator.collect(conversationId,{mode});this.renderStats();
    const result=await collection;
    const finalRoot=document.querySelector('[class*="scrollerInner"]');
    this.lastHistorySignature=finalRoot?[...finalRoot.querySelectorAll('[class*="messageListItem"]')].map(row=>row.id||row.getAttribute('data-list-item-id')||'').join('|'):signature;
    this.renderStats();this.refreshFrequent();
  }
  renderStats(){
    if(!this.panel)return;
    const snapshot=this.analyticsStore.snapshot();
    const currentId=this.getSelectedConversation();const current=snapshot.conversations[currentId];
    const active=this.collectionCoordinator.active.has(String(currentId));
    this.panel.querySelector('[data-action="cancelCollection"]').hidden=!active;
    const refresh=this.panel.querySelector('[data-action="collectNow"]');
    refresh.disabled=!currentId||active;
    refresh.textContent=current?.collection?.state==='initial_completed'?'Refresh visible messages':current?.collection?.state==='incomplete'||current?.collection?.state==='interrupted'||current?.collection?.state==='failed'?'Retry initial backfill':'Start initial backfill';
    const status=this.panel.querySelector('.ba-collection-status');
    const entry=current;
    status.textContent=entry?`Conversation ${entry.conversationId}: ${entry.collection.state.replaceAll('_',' ')}. ${entry.coverage.recordsProcessed.toLocaleString()} unique messages stored; ${entry.coverage.encountered.toLocaleString()} encountered in the last run; ${entry.coverage.duplicatesIgnored.toLocaleString()} duplicates ignored. ${entry.collection.lastSuccessfulUpdateAt?`Last successful update ${new Date(entry.collection.lastSuccessfulUpdateAt).toLocaleString()}.`:''} Coverage is limited to rows visible through Discord's UI.${entry.collection.stopReason?` Last stop reason: ${entry.collection.stopReason}.`:''}${entry.collection.error||entry.error?` Latest error: ${entry.collection.error||entry.error}`:''}`:(active?'Collecting visible message history for the selected conversation.':'Open a conversation in Discord to collect locally visible message metadata.');
    if(this.dashboard&&!this.dashboard.hidden)this.renderAnalyticsDashboard();
  }
  conversationLabel(conversationId){
    const heading=[...document.querySelectorAll('main h1, main [role="heading"][aria-level="1"]')].find(node=>node.getClientRects?.().length&&node.textContent?.trim());
    const name=heading?.textContent?.trim();
    return name?`${name} · ${conversationId}`:`Conversation ${conversationId}`;
  }
  updateCollectionPopup(event){
    if(this.stopped||event.mode!=='initial')return;
    if(event.phase==='start'&&this.collectionPopup&&this.collectionPopupConversation!==String(event.conversationId))this.hideCollectionPopup();
    if(event.phase==='start'&&!this.collectionPopup){
      const popup=document.createElement('section');popup.className='ba-collection-popup';popup.setAttribute('role','region');popup.setAttribute('aria-label','Conversation collection status');
      popup.innerHTML='<div class="ba-collection-popup-heading"><h2>Collecting conversation</h2><button type="button" data-popup-cancel>Cancel collection</button></div><p data-popup-conversation></p><p data-popup-state></p><p data-popup-counts></p><p data-popup-duplicates hidden></p><div class="ba-sr-only" role="status" aria-live="polite" aria-atomic="true" data-popup-announcement></div>';
      document.body.appendChild(popup);this.collectionPopup=popup;this.collectionPopupConversation=String(event.conversationId);this.collectionPopupLastAnnouncementAt=0;
      const popupConversation=String(event.conversationId);
      popup.querySelector('[data-popup-cancel]').addEventListener('click',()=>this.collectionCoordinator.cancel(popupConversation));
    }
    const popup=this.collectionPopup;if(!popup||this.collectionPopupConversation!==String(event.conversationId))return;
    clearTimeout(this.collectionPopupTimeout);
    const terminal=event.phase==='finish';
    const count=Number(event.processed||0);
    const stateText=terminal?this.collectionPopupTerminalText(event):event.phase==='start'?'Starting initial backfill…':`Backfilling visible history · ${Number(event.batches||0).toLocaleString()} batches processed`;
    popup.querySelector('[data-popup-conversation]').textContent=this.conversationLabel(event.conversationId);
    popup.querySelector('[data-popup-state]').textContent=stateText;
    popup.querySelector('[data-popup-counts]').textContent=`${count.toLocaleString()} new unique messages collected · ${Number(event.batches||0).toLocaleString()} batches processed`;
    const duplicateLine=popup.querySelector('[data-popup-duplicates]');duplicateLine.hidden=!event.duplicates;duplicateLine.textContent=event.duplicates?`${Number(event.duplicates).toLocaleString()} duplicate messages ignored.`:'';
    popup.querySelector('[data-popup-cancel]').hidden=terminal;
    const now=Date.now();
    if(terminal||event.phase==='start'||now-this.collectionPopupLastAnnouncementAt>=2500){
      popup.querySelector('[data-popup-announcement]').textContent=`${stateText} ${count.toLocaleString()} unique messages collected in ${Number(event.batches||0).toLocaleString()} batches.${event.duplicates?` ${Number(event.duplicates).toLocaleString()} duplicates ignored.`:''}`;
      this.collectionPopupLastAnnouncementAt=now;
    }
    if(terminal){
      const delay=event.collectionState==='completed'?3000:6500;
      this.collectionPopupTimeout=setTimeout(()=>this.hideCollectionPopup(),delay);
    }
  }
  collectionPopupTerminalText(event){
    if(event.collectionState==='completed')return event.mode==='initial'?'Initial backfill reached its observable stopping condition. Discord does not report the total conversation history.':'Visible messages refreshed.';
    if(event.collectionState==='incomplete')return `Initial backfill stopped before the oldest visible edge was confirmed (${event.stopReason||'unknown reason'}). Saved messages are kept; retry when ready.`;
    if(event.collectionState==='interrupted')return 'Collection was interrupted. Messages already saved were kept; retry when ready.';
    return `Collection failed${event.error?`: ${event.error}`:'. Saved messages were kept.'}`;
  }
  hideCollectionPopup(){clearTimeout(this.collectionPopupTimeout);this.collectionPopup?.remove();this.collectionPopup=null;this.collectionPopupConversation=null;}
  openAnalyticsDashboard(){
    if(this.dashboard){this.dashboard.hidden=false;this.renderAnalyticsDashboard();this.dashboard.querySelector('[data-dashboard-back]')?.focus();return;}
    const view=document.createElement('section');view.id='ba-analytics-dashboard';view.className='ba-dashboard';view.setAttribute('role','dialog');view.setAttribute('aria-modal','true');view.setAttribute('aria-labelledby','ba-dashboard-title');
    view.innerHTML=`<header class="ba-dashboard-header"><button type="button" data-dashboard-back>← Back to Barkly Access</button><div><p class="ba-kicker">BARKLY ACCESS · LOCAL ANALYTICS</p><h1 id="ba-dashboard-title" tabindex="-1">Conversation analytics</h1><p class="ba-dashboard-intro">A readable view of the message metadata this plugin has collected on this device. Message text is not retained.</p></div><button type="button" data-dashboard-clear>Clear analytics</button></header>
      <section class="ba-dashboard-filters" aria-label="Analytics filters"><label>Conversation<select data-filter="conversation"><option value="all">All conversations</option></select></label><label>Person<select data-filter="person"><option value="all">All people</option></select></label><label>From<input type="date" data-filter="from"></label><label>Through<input type="date" data-filter="to"></label><label>Group activity<select data-filter="group"><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select></label><label>Search people<input type="search" data-filter="search" placeholder="Name or user ID"></label><label>Sort people<select data-filter="sort"><option value="messages">Most messages</option><option value="name">Name</option><option value="recent">Most recent</option></select></label><label>Text size<select data-filter="text"><option value="normal">Normal</option><option value="large">Large</option><option value="xlarge">Extra large</option></select></label><label class="ba-check-filter"><input type="checkbox" data-filter="contrast"> Higher contrast</label></section>
      <main class="ba-dashboard-content"><section aria-labelledby="ba-overview-title"><h2 id="ba-overview-title">Overview</h2><p class="ba-coverage-note" data-dashboard-coverage role="status"></p><div class="ba-dashboard-metrics" data-dashboard-metrics></div></section>
      <div class="ba-sender-sections"><section aria-labelledby="ba-my-title"><h2 id="ba-my-title">My Messages</h2><p data-dashboard-my role="status"></p></section><section aria-labelledby="ba-other-title"><h2 id="ba-other-title">Other Participant's Messages</h2><p data-dashboard-other role="status"></p></section><section aria-labelledby="ba-compare-title"><h2 id="ba-compare-title">Compare Activity</h2><p data-dashboard-compare role="status"></p></section></div>
      <div class="ba-dashboard-columns"><section><h2>Activity over time</h2><p class="ba-plain-note">Tables keep exact values available to screen readers and keyboard users.</p><div class="ba-table-wrap"><table><caption>Message activity grouped by selected interval (UTC)</caption><thead><tr><th scope="col">Period</th><th scope="col">Messages</th></tr></thead><tbody data-dashboard-activity></tbody></table></div></section><section><h2>Activity by hour</h2><p class="ba-plain-note" data-hour-note></p><div class="ba-table-wrap"><table><caption>Collected messages by hour of day (UTC)</caption><thead><tr><th scope="col">Hour</th><th scope="col">Messages</th></tr></thead><tbody data-dashboard-hours></tbody></table></div></section></div>
      <section><h2>Activity by day of week</h2><p class="ba-plain-note">Derived from stored UTC daily totals.</p><div class="ba-table-wrap"><table><caption>Messages recorded on each weekday (UTC)</caption><thead><tr><th scope="col">Weekday</th><th scope="col">Messages</th></tr></thead><tbody data-dashboard-weekdays></tbody></table></div></section>
      <section><h2>People</h2><p class="ba-plain-note">Select a person row to see their stored totals and activity range.</p><div class="ba-table-wrap"><table><caption>People in the selected conversation scope</caption><thead><tr><th scope="col">Person</th><th scope="col">Total</th><th scope="col">Sent</th><th scope="col">Received</th><th scope="col">Unknown</th><th scope="col">First recorded</th><th scope="col">Most recent</th></tr></thead><tbody data-dashboard-people></tbody></table></div><div class="ba-pagination" aria-label="People table pages"><button type="button" data-page-prev>Previous people</button><span data-page-status aria-live="polite"></span><button type="button" data-page-next>Next people</button><label>Rows per page<select data-filter="page-size"><option>25</option><option>50</option><option>100</option></select></label></div><section class="ba-person-detail" data-dashboard-person aria-live="polite"></section></section>
      <section><h2>Conversations and collection coverage</h2><div class="ba-table-wrap"><table><caption>Stored conversation totals and collection status</caption><thead><tr><th scope="col">Conversation ID</th><th scope="col">Messages</th><th scope="col">People</th><th scope="col">Initial backfill</th><th scope="col">Status</th><th scope="col">Encountered</th><th scope="col">Duplicates</th><th scope="col">Oldest recorded</th><th scope="col">Newest recorded</th><th scope="col">Last stopping reason</th></tr></thead><tbody data-dashboard-conversations></tbody></table></div></section></main></section>`;
    document.body.appendChild(view);this.dashboard=view;this.dashboardReturnFocus=this.panel?.querySelector('[data-action="openAnalytics"]');
    view.addEventListener('click',event=>{const button=event.target.closest('[data-dashboard-back],[data-dashboard-clear],[data-person-id],[data-page-prev],[data-page-next]');if(!button)return;if(button.hasAttribute('data-dashboard-back'))this.closeAnalyticsDashboard();else if(button.hasAttribute('data-dashboard-clear'))this.clearAllAnalytics();else if(button.hasAttribute('data-page-prev')){this.dashboardPage=Math.max(0,(this.dashboardPage||0)-1);this.renderAnalyticsDashboard();}else if(button.hasAttribute('data-page-next')){this.dashboardPage=(this.dashboardPage||0)+1;this.renderAnalyticsDashboard();}else this.renderPersonDetail(button.dataset.personId);});
    view.addEventListener('input',event=>{if(event.target.matches('[data-filter]')){this.dashboardPage=0;this.renderAnalyticsDashboard();}});
    view.addEventListener('change',event=>{if(event.target.matches('[data-filter]')){this.dashboardPage=0;view.classList.toggle('ba-text-large',view.querySelector('[data-filter="text"]').value==='large');view.classList.toggle('ba-text-xlarge',view.querySelector('[data-filter="text"]').value==='xlarge');view.classList.toggle('ba-high-contrast',view.querySelector('[data-filter="contrast"]').checked);this.renderAnalyticsDashboard();}});
    this.dashboardEscape=event=>{if(event.key==='Escape'&&this.dashboard&&!this.dashboard.hidden){event.preventDefault();this.closeAnalyticsDashboard();}};document.addEventListener('keydown',this.dashboardEscape,true);
    this.renderAnalyticsDashboard();view.querySelector('[data-dashboard-back]').focus();
  }
  closeAnalyticsDashboard(){if(!this.dashboard)return;this.dashboard.hidden=true;this.dashboardReturnFocus?.focus();}
  renderAnalyticsDashboard(){
    const view=this.dashboard;if(!view||view.hidden)return;
    const all=this.analyticsStore.snapshot();const entries=Object.values(all.conversations).sort((a,b)=>a.conversationId.localeCompare(b.conversationId));
    const conversationSelect=view.querySelector('[data-filter="conversation"]');const oldConversation=conversationSelect.value||'all';
    conversationSelect.replaceChildren(new Option('All conversations','all'));
    for(const item of entries)conversationSelect.add(new Option(`Conversation ${item.conversationId}`,item.conversationId));
    conversationSelect.value=[...conversationSelect.options].some(option=>option.value===oldConversation)?oldConversation:'all';
    const allPeople=new Map();for(const item of entries)for(const person of Object.values(item.people)){const current=allPeople.get(person.authorId)||person;allPeople.set(person.authorId,current);}
    const personSelect=view.querySelector('[data-filter="person"]');const oldPerson=personSelect.value||'all';personSelect.replaceChildren(new Option('All people','all'));
    [...allPeople.values()].sort((a,b)=>a.name.localeCompare(b.name)).forEach(person=>personSelect.add(new Option(person.name,person.authorId)));
    personSelect.value=[...personSelect.options].some(option=>option.value===oldPerson)?oldPerson:'all';
    const selectedId=conversationSelect.value;const scope=selectedId==='all'?entries:entries.filter(item=>item.conversationId===selectedId);
    const from=view.querySelector('[data-filter="from"]').value;const to=view.querySelector('[data-filter="to"]').value;
    const since=from?Date.parse(`${from}T00:00:00.000Z`):null;const until=to?Date.parse(`${to}T23:59:59.999Z`):null;
    const personFilter=personSelect.value;const analysisScope=personFilter==='all'?scope:scope.map(item=>{const person=item.people[personFilter];if(!person)return {...item,totals:{sent:0,received:0,unknown:0},people:{},daily:{},dailySent:{},dailyReceived:{},dailyUnknown:{},hourly:Array(24).fill(0)};return {...item,totals:{sent:person.sent,received:person.received,unknown:person.unknown},people:{[person.authorId]:person},excludedAuthors:[],daily:person.daily,dailySent:person.dailySent,dailyReceived:person.dailyReceived,dailyUnknown:person.dailyUnknown,hourly:person.hourly};});
    const summary=summarizeAnalytics({version:all.version,conversations:Object.fromEntries(analysisScope.map(item=>[item.conversationId,item]))},{since,until,search:view.querySelector('[data-filter="search"]').value,granularity:view.querySelector('[data-filter="group"]').value});
    const people=summary.people;const sort=view.querySelector('[data-filter="sort"]').value;
    people.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='recent'?(b.lastTimestamp||0)-(a.lastTimestamp||0):b.total-a.total||a.name.localeCompare(b.name));
    const totals=summary.totals;let dates=summary.daily.map(point=>Date.parse(`${point.date}T00:00:00.000Z`)).filter(Number.isFinite);
    if(!dates.length&&!from&&!to&&personFilter==='all')dates=analysisScope.flatMap(item=>[item.coverage.oldestTimestamp,item.coverage.newestTimestamp]).filter(Number.isFinite);
    const firstDate=dates.length?new Date(Math.min(...dates)).toLocaleString():((from||to)?'No timestamped messages in this range':'No timestamp stored');
    const lastDate=dates.length?new Date(Math.max(...dates)+86_399_999).toLocaleString():((from||to)?'No timestamped messages in this range':'No timestamp stored');
    const metrics=[['Messages tracked',totals.tracked.toLocaleString()],['Sent',totals.sent.toLocaleString()],['Received',totals.received.toLocaleString()],['Direction unknown',totals.unknown.toLocaleString()],['Conversations',String(scope.length)],['Unique people',String(people.length)],['First recorded',firstDate],['Most recent',lastDate]];
    const metricRoot=view.querySelector('[data-dashboard-metrics]');metricRoot.replaceChildren();metrics.forEach(([label,value])=>{const card=document.createElement('article');card.className='ba-metric';const caption=document.createElement('h3');caption.textContent=label;const amount=document.createElement('p');amount.textContent=value;card.append(caption,amount);metricRoot.append(card);});
    const coverage=view.querySelector('[data-dashboard-coverage]');const active=scope.filter(item=>this.collectionCoordinator.active.has(item.conversationId)).length;const complete=scope.filter(item=>item.coverage.complete).length;
    coverage.textContent=`Coverage is based on the visible UI only. ${scope.length} tracked conversation(s); ${active} collecting now; ${complete} marked complete by the source. Discord does not expose a definitive total-history count, so “complete” is unavailable for this UI adapter. ${scope.reduce((n,item)=>n+(item.coverage.recordsProcessed||0),0).toLocaleString()} unique message records have been processed. ${scope.reduce((n,item)=>n+(item.coverage.encountered||0),0).toLocaleString()} records encountered in the latest saved runs; ${scope.reduce((n,item)=>n+(item.coverage.duplicatesIgnored||0),0).toLocaleString()} duplicates ignored in those runs.`;
    const currentUserId=String(this.state.currentUserId||'');
    const senderStats=scope.reduce((result,item)=>{for(const person of Object.values(item.people)){if(currentUserId&&person.authorId===currentUserId){result.mine.sent+=person.sent||0;result.mine.unknown+=person.unknown||0;}else{result.other.received+=person.received||0;result.other.unknown+=person.unknown||0;}}return result;},{mine:{sent:0,unknown:0},other:{received:0,unknown:0}});
    const myRoot=view.querySelector('[data-dashboard-my]'),otherRoot=view.querySelector('[data-dashboard-other]'),compareRoot=view.querySelector('[data-dashboard-compare]');
    if(!currentUserId){myRoot.textContent='Set your numeric Discord user ID in Barkly Access settings to separate and verify your sent messages.';otherRoot.textContent='Set your numeric Discord user ID to isolate other participants. Unknown direction or sender records are never silently attributed.';compareRoot.textContent='Comparison is unavailable until a verified current-user ID is set.';}
    else {const mineCount=senderStats.mine.sent+senderStats.mine.unknown;const otherCount=senderStats.other.received+senderStats.other.unknown;myRoot.textContent=`${senderStats.mine.sent.toLocaleString()} reliably current-user sent messages${senderStats.mine.unknown?`; ${senderStats.mine.unknown.toLocaleString()} unknown-direction records remain unattributed`:''}.`;otherRoot.textContent=`${senderStats.other.received.toLocaleString()} participant received messages${senderStats.other.unknown?`; ${senderStats.other.unknown.toLocaleString()} unknown-sender or unknown-direction records remain unattributed`:''}.`;compareRoot.textContent=`Current user: ${mineCount.toLocaleString()} · Other participants: ${otherCount.toLocaleString()} · Difference: ${Math.abs(mineCount-otherCount).toLocaleString()} messages.`;}
    this.fillTable(view.querySelector('[data-dashboard-activity]'),summary.activity.map(point=>[point.period,point.count]));
    const hours=view.querySelector('[data-dashboard-hours]');hours.replaceChildren();
    if(from||to){view.querySelector('[data-hour-note]').textContent='Hourly totals are retained overall, but are not stored per date. Clear the date filter to view all-date hourly totals.';this.fillTable(hours,[],'Not available for a date-filtered view.');}
    else {view.querySelector('[data-hour-note]').textContent='Overall hourly distribution, in UTC.';const hourTotals=Array(24).fill(0);analysisScope.forEach(item=>item.hourly.forEach((count,hour)=>hourTotals[hour]+=count));this.fillTable(hours,hourTotals.map((count,hour)=>[`${String(hour).padStart(2,'0')}:00`,count]));}
    const weekdayTotals=Array(7).fill(0);summary.daily.forEach(({date,count})=>{const day=Date.parse(`${date}T00:00:00.000Z`);if(Number.isFinite(day))weekdayTotals[new Date(day).getUTCDay()]+=count;});this.fillTable(view.querySelector('[data-dashboard-weekdays]'),weekdayTotals.map((count,day)=>[new Date(Date.UTC(2023,0,1+day)).toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'}),count]));
    const peopleBody=view.querySelector('[data-dashboard-people]');peopleBody.replaceChildren();
    const pageSize=Number(view.querySelector('[data-filter="page-size"]').value)||25;const pageCount=Math.max(1,Math.ceil(people.length/pageSize));this.dashboardPage=Math.min(this.dashboardPage||0,pageCount-1);const pagePeople=people.slice(this.dashboardPage*pageSize,(this.dashboardPage+1)*pageSize);
    pagePeople.forEach(person=>{const row=document.createElement('tr');const nameCell=document.createElement('th');nameCell.scope='row';const pick=document.createElement('button');pick.type='button';pick.dataset.personId=person.authorId;pick.textContent=person.name||person.authorId;nameCell.append(pick);row.append(nameCell,...[person.total,person.sent,person.received,person.unknown].map(value=>{const td=document.createElement('td');td.textContent=Number(value||0).toLocaleString();return td;}),...[[person.firstTimestamp,'No timestamp'],[person.lastTimestamp,'No timestamp']].map(([value,fallback])=>{const td=document.createElement('td');td.textContent=value?new Date(value).toLocaleString():fallback;return td;}));peopleBody.append(row);});
    if(!people.length){const row=document.createElement('tr');const cell=document.createElement('td');cell.colSpan=7;cell.textContent='No people match these filters.';row.append(cell);peopleBody.append(row);}
    const pageStatus=view.querySelector('[data-page-status]');pageStatus.textContent=people.length?`Showing ${this.dashboardPage*pageSize+1}–${Math.min((this.dashboardPage+1)*pageSize,people.length)} of ${people.length}`:'No matching people';view.querySelector('[data-page-prev]').disabled=this.dashboardPage===0;view.querySelector('[data-page-next]').disabled=this.dashboardPage>=pageCount-1;
    const conversationsBody=view.querySelector('[data-dashboard-conversations]');conversationsBody.replaceChildren();scope.forEach(item=>{const cells=[item.conversationId,(item.totals.sent+item.totals.received+item.totals.unknown).toLocaleString(),String(Object.keys(item.people).length),item.collection.state.replaceAll('_',' '),item.status,(item.coverage.encountered||0).toLocaleString(),(item.coverage.duplicatesIgnored||0).toLocaleString(),item.coverage.oldestTimestamp?new Date(item.coverage.oldestTimestamp).toLocaleString():'No timestamp',item.coverage.newestTimestamp?new Date(item.coverage.newestTimestamp).toLocaleString():'No timestamp',item.coverage.stopReason||'Not reported'];const row=document.createElement('tr');cells.forEach((value,index)=>{const cell=document.createElement(index===0?'th':'td');if(index===0)cell.scope='row';cell.textContent=value;row.append(cell);});conversationsBody.append(row);});
    if(!scope.length)this.fillTable(conversationsBody,[],'No conversations have been collected yet. Open a conversation in Discord to begin.');
  }
  fillTable(body,rows,emptyText='No timestamped records match these filters.'){body.replaceChildren();if(!rows.length){const row=document.createElement('tr');const cell=document.createElement('td');cell.colSpan=2;cell.textContent=emptyText;row.append(cell);body.append(row);return;}rows.forEach(([label,count])=>{const row=document.createElement('tr');const th=document.createElement('th');th.scope='row';th.textContent=String(label);const td=document.createElement('td');td.textContent=Number(count||0).toLocaleString();row.append(th,td);body.append(row);});}
  renderPersonDetail(authorId){
    const root=this.dashboard?.querySelector('[data-dashboard-person]');if(!root)return;root.replaceChildren();const snapshot=this.analyticsStore.snapshot();const records=Object.values(snapshot.conversations).flatMap(item=>item.people[authorId]?[item.people[authorId]]:[]);if(!records.length){root.textContent='No stored data is available for this person.';return;}
    const name=document.createElement('h3');name.textContent=`Details for ${records[0].name}`;const summary=document.createElement('p');const totals=records.reduce((out,item)=>({sent:out.sent+item.sent,received:out.received+item.received,unknown:out.unknown+(item.unknown||0),first:Math.min(out.first,item.firstTimestamp??Infinity),last:Math.max(out.last,item.lastTimestamp??0)}),{sent:0,received:0,unknown:0,first:Infinity,last:0});summary.textContent=`${totals.sent+totals.received+totals.unknown} total messages: ${totals.sent} sent, ${totals.received} received, ${totals.unknown} unknown direction. First recorded: ${Number.isFinite(totals.first)?new Date(totals.first).toLocaleString():'unavailable'}. Most recent: ${totals.last?new Date(totals.last).toLocaleString():'unavailable'}.`;
    const hours=Array(24).fill(0),days=new Map();records.forEach(item=>{item.hourly.forEach((count,hour)=>hours[hour]+=count);Object.entries(item.daily).forEach(([day,count])=>days.set(day,(days.get(day)||0)+count));});const detail=document.createElement('p');detail.textContent=`Most active hour (UTC): ${hours.indexOf(Math.max(...hours))}:00 (${Math.max(...hours)} messages). Most active recorded day: ${[...days].sort((a,b)=>b[1]-a[1])[0]?.join(' — ')||'unavailable'}.`;
    root.append(name,summary,detail);
  }
  showPersonDetail(authorId){
    const conversation=this.analyticsStore.getConversation(this.getSelectedConversation());
    const detail=this.panel.querySelector('.ba-person-detail');detail.replaceChildren();
    const person=conversation?.people?.[authorId];
    if(!person){detail.textContent='Open that person’s conversation to see conversation-specific details.';return;}
    const title=document.createElement('h3');title.textContent=person.name;const totals=document.createElement('p');totals.textContent=`In this conversation: ${person.received} received, ${person.sent} sent, ${person.unknown||0} direction unknown, ${person.total} total.`;
    const last=document.createElement('p');last.textContent=person.lastTimestamp?`Last recorded activity: ${new Date(person.lastTimestamp).toLocaleString()}.`:'No valid timestamp was available.';
    const coverage=document.createElement('p');coverage.textContent=`Coverage: ${conversation.status}; ${conversation.coverage.recordsProcessed} unique rendered message records. Full-history coverage is not available.`;detail.append(title,totals,last,coverage);
  }
  async clearCurrentConversation(){const id=this.getSelectedConversation();if(!id)return;try{await this.collectionCoordinator.cancel(id);this.analyticsStore.clearConversation(id);this.lastHistorySignature='';this.renderStats();this.refreshFrequent();}catch(error){this.panel.querySelector('.ba-collection-status').textContent=`Could not clear this conversation: ${error.message}`;}}
  async cancelSelectedCollection(){const id=this.getSelectedConversation();if(!id)return;await this.collectionCoordinator.cancel(id);this.renderStats();}
  async clearAllAnalytics(){try{await Promise.all([...this.collectionCoordinator.active.keys()].map(id=>this.collectionCoordinator.cancel(id)));this.analyticsStore.clearAll();this.lastHistorySignature='';this.renderStats();this.refreshFrequent();}catch(error){this.panel.querySelector('.ba-collection-status').textContent=`Could not clear analytics: ${error.message}`;}}
  toggleExcluded(authorId){const id=this.getSelectedConversation();if(!id)return;const entry=this.analyticsStore.getConversation(id);if(!entry)return;this.analyticsStore.setAuthorExcluded(id,authorId,!entry.excludedAuthors.includes(authorId));this.renderStats();this.refreshFrequent();}
  refreshFrequent(){
    if(!this.panel)return;
    const list=this.panel.querySelector('.ba-frequent-list');if(!list)return;list.replaceChildren();
    const contacts=buildFrequentContacts(this.analyticsStore.snapshot(),{
      search:this.panel.querySelector('#ba-frequent-search')?.value||'',
      sort:this.panel.querySelector('#ba-frequent-sort')?.value||'messages',
    });
    const status=this.panel.querySelector('.ba-frequent-status');
    if(!contacts.length){
      const empty=document.createElement('li');empty.className='ba-frequent-empty';
      empty.textContent='No tracked contacts match yet. Open a Discord conversation; collected people will appear here.';list.appendChild(empty);
      status.textContent='No collected contacts match this search.';return;
    }
    status.textContent=`${contacts.length.toLocaleString()} person–conversation entries. Counts are unique messages collected in each conversation; history coverage may be partial.`;
    for(const contact of contacts){
      const item=document.createElement('li');item.className='ba-frequent-item';
      const monogram=document.createElement(contact.avatarUrl?'img':'span');monogram.className='ba-contact-monogram';if(contact.avatarUrl){monogram.src=contact.avatarUrl;monogram.alt='';monogram.loading='lazy';monogram.referrerPolicy='no-referrer';}else {monogram.setAttribute('aria-hidden','true');monogram.textContent=(contact.displayName.trim()[0]||'?').toLocaleUpperCase();}
      const content=document.createElement('div');content.className='ba-contact-content';
      const title=document.createElement('div');title.className='ba-contact-title';
      const link=createDiscordConversationLink(document,contact);
      if(link){title.appendChild(link);}
      else {const unavailable=document.createElement('span');unavailable.className='ba-contact-unavailable';unavailable.textContent=contact.displayName;unavailable.setAttribute('aria-label',`${contact.displayName}; conversation shortcut unavailable`);title.appendChild(unavailable);}
      if(contact.username){const username=document.createElement('span');username.className='ba-contact-username';username.textContent=`@${contact.username.replace(/^@/, '')}`;title.appendChild(username);}
      const identity=document.createElement('p');identity.className='ba-contact-identity';identity.textContent=`User ID ${contact.authorId} · Conversation ${contact.conversationId}`;
      const metadata=document.createElement('p');metadata.className='ba-contact-meta';metadata.textContent=`${contact.messageCount.toLocaleString()} collected messages · ${contact.lastTimestamp?`Last interaction ${new Date(contact.lastTimestamp).toLocaleString()}`:'No timestamp available'} · ${contact.conversationStatus} collection`;
      content.append(title,identity,metadata);
      const count=document.createElement('strong');count.className='ba-contact-count';count.textContent=contact.messageCount.toLocaleString();count.setAttribute('aria-label',`${contact.messageCount.toLocaleString()} collected messages`);
      item.append(monogram,content,count);
      if(!contact.href){const fallback=document.createElement('p');fallback.className='ba-contact-fallback';fallback.textContent='Discord could not safely resolve this conversation shortcut. Reopen this conversation and collect it again to save its route.';item.appendChild(fallback);}
      list.appendChild(item);
    }
  }
  updatePanel(){ if(!this.panel)return; this.panel.querySelectorAll('[data-action]').forEach(b=>{const k=b.dataset.action;if(!Object.hasOwn(this.state,k))return;const on=!!this.state[k];b.setAttribute('aria-pressed',String(on));b.classList.toggle('ba-on',on);const labels={quiet:'Quiet view',layout:'Readable chat layout',numbered:'Conversation cards',showMembers:'Member list',showChannels:'Channel list',showToolbar:'Chat toolbar'};b.textContent=(k==='quiet'||k==='layout'||k==='numbered')?`${labels[k]} · ${on?'On':'Off'}`:`${labels[k]} · ${on?'Shown':'Hidden'}`;});}
  stop(){this.stopped=true;document.removeEventListener('keydown',this.onKeyDown,true);document.removeEventListener('keydown',this.dashboardEscape,true);clearTimeout(this.collectionTimer);this.hideCollectionPopup();this.chunkObserver?.disconnect();this.historyObserver?.disconnect();this.messageObserver?.disconnect();for(const id of this.collectionCoordinator?.active.keys()||[])this.collectionCoordinator.cancel(id);document.querySelectorAll('[class*=messageListItem]').forEach(n=>this.chunkClasses.forEach(c=>n.classList.remove(c)));Object.values(this.classes).forEach(c=>document.body.classList.remove(c));BdApi.DOM.removeStyle(this.styleId);this.dashboard?.remove();document.getElementById(this.panelId)?.remove();}
  groupMessages(){
    const root=document.querySelector('[class*=scrollerInner]'); if(!root)return;
    const nodes=[...root.querySelectorAll('[class*=messageListItem]')]; if(!nodes.length)return;
    const readTime=n=>{const t=n.querySelector('time');if(t){const d=t.dateTime?new Date(t.dateTime):new Date(t.textContent);if(!Number.isNaN(d.getTime()))return d.getTime();}return null;};
    let group=0,prevTime=null,prevNode=null,members=[];
    const finish=()=>{if(!members.length)return;members.forEach((n,i)=>{this.chunkClasses.forEach(c=>n.classList.remove(c));n.classList.add(members.length===1?'ba-chunk-single':i===0?'ba-chunk-start':i===members.length-1?'ba-chunk-end':'ba-chunk-middle');});members=[];};
    nodes.forEach(n=>{const t=readTime(n);const gap=(t!==null&&prevTime!==null)?t-prevTime:null;const split=!prevNode||gap===null||gap<0||gap>15*60*1000;if(split){finish();group++;}members.push(n);prevNode=n;prevTime=t;});finish();
  }
  css(){return `${frequentStyles}
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
    #${this.panelId}{position:fixed;z-index:1000002;top:14px;right:16px;width:min(280px,calc(100vw - 32px));max-height:calc(100vh - 28px);overflow-y:auto;display:block;background:#090909;color:#f1f1f1;border:1px solid #ff4fa3;border-radius:12px;box-shadow:0 8px 28px #0009;font:14px/1.45 sans-serif;}
    #${this.panelId} button{display:block;width:100%;text-align:left;background:#101010;color:#f1f1f1;border:1px solid #444;border-radius:8px;padding:9px 10px;margin:6px 0;cursor:pointer;}
    #${this.panelId} button:focus-visible{outline:3px solid #ff8bc5;outline-offset:2px;}
    #${this.panelId} .ba-main{font-weight:700;background:#ff4fa3;color:#090909;border:0;margin:0;display:flex;justify-content:space-between;}
    #${this.panelId} .ba-options{padding:8px 10px 10px;} #${this.panelId} .ba-options[hidden]{display:none;}
    #${this.panelId} .ba-summary,#${this.panelId} .ba-help{color:#ccc;font-size:12px;margin:8px 2px;}
    #${this.panelId} .ba-extra{border-top:1px solid #292929;margin-top:8px;padding-top:4px;}
    #${this.panelId} .ba-tabs{display:flex;gap:6px;padding:8px 10px 0;}
    #${this.panelId} .ba-tabs button{flex:1;width:auto;text-align:center;margin:0;padding:8px;}
    #${this.panelId} .ba-tab-active{background:#ff4fa3!important;color:#090909!important;font-weight:700;}
    #${this.panelId} [data-pane][hidden]{display:none!important;}
    #${this.panelId} .ba-frequent-list{list-style:none;padding:0;margin:8px 0;display:grid;gap:6px;}
    #${this.panelId} .ba-frequent-item{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px;background:#101010;border:1px solid #292929;border-radius:8px;}
    #${this.panelId} .ba-rank{display:grid;place-items:center;background:#ff4fa3;color:#090909;border-radius:8px;font-weight:800;height:26px;}
    #${this.panelId} .ba-frequent-name{overflow-wrap:anywhere;font-weight:600;}
    #${this.panelId} .ba-frequent-count{color:#aaa;font-size:11px;white-space:nowrap;}
    #${this.panelId} button.ba-on{border-color:#ff8bc5;box-shadow:inset 3px 0 #ff4fa3;}
    #${this.panelId} .ba-restore{background:#ff8bc5;color:#090909;font-weight:700;}
    #${this.panelId} .ba-open-analytics{background:#ff4fa3;color:#090909;font-weight:800;text-align:center;}
    #${this.panelId} .ba-collection-status{color:#f4dce8;font-size:12px;line-height:1.5;padding:9px;background:#171217;border-radius:8px;}
    #${this.panelId} .ba-access-settings{display:grid;gap:7px;margin:10px 0;padding:10px;background:#171217;border:1px solid #493a45;border-radius:8px;}
    #${this.panelId} .ba-access-settings label{font-size:12px;font-weight:700;}#${this.panelId} .ba-access-settings label span{display:block;color:#d8cdd3;font-weight:400;}#${this.panelId} .ba-access-settings input,#${this.panelId} .ba-access-settings select{width:100%;min-height:38px;color:#f1f1f1;background:#101010;border:1px solid #777;border-radius:7px;padding:8px;}#${this.panelId} .ba-access-settings input:focus-visible,#${this.panelId} .ba-access-settings select:focus-visible{outline:3px solid #ff8bc5;outline-offset:2px;}
    body.${this.classes.largeControls} #${this.panelId} button,body.${this.classes.largeControls} #${this.panelId} input,body.${this.classes.largeControls} #${this.panelId} select{min-height:44px;font-size:16px;}body.${this.classes.dense} #${this.panelId}{width:220px;}
    .ba-collection-popup{position:fixed;right:22px;bottom:22px;z-index:1000001;width:min(410px,calc(100vw - 32px));max-height:min(45vh,360px);overflow:auto;background:#100b10;color:#f7eef3;border:1px solid #ff69ad;border-left:5px solid #ff4fa3;border-radius:12px;box-shadow:0 12px 40px #000b;padding:16px 18px;font:14px/1.5 system-ui,sans-serif;}
    .ba-collection-popup *{box-sizing:border-box;}
    .ba-collection-popup h2{margin:0;font-size:16px;color:#ffacd1;}
    .ba-collection-popup p{margin:7px 0 0;overflow-wrap:anywhere;}
    .ba-collection-popup [data-popup-conversation]{font-weight:700;}
    .ba-collection-popup [data-popup-duplicates]{color:#ffd9a6;}
    .ba-collection-popup-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;}
    .ba-collection-popup button{flex:0 0 auto;background:#ff4fa3;color:#120b10;border:0;border-radius:7px;padding:7px 10px;font:inherit;font-weight:750;cursor:pointer;}
    .ba-collection-popup button:hover{background:#ff9bc9;}
    .ba-collection-popup button:focus-visible{outline:3px solid #fff;outline-offset:3px;}
    .ba-sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important;}
    @media(max-width:520px){#${this.panelId}{top:8px;right:8px;width:calc(100vw - 16px);max-height:calc(100vh - 16px)}.ba-collection-popup{right:12px;bottom:12px;width:calc(100vw - 24px);}}
    @media(prefers-reduced-motion:reduce){.ba-collection-popup{scroll-behavior:auto!important;animation:none!important;transition:none!important;}}
    #ba-analytics-dashboard{position:fixed;inset:0;z-index:1000000;overflow:auto;background:#0e0b0e;color:#f5eef2;font:16px/1.55 system-ui,sans-serif;padding:clamp(16px,3vw,44px);--ba-accent:#ff69ad;--ba-panel:#171217;}
    #ba-analytics-dashboard[hidden]{display:none;}
    #ba-analytics-dashboard *{box-sizing:border-box;}
    #ba-analytics-dashboard button,#ba-analytics-dashboard input,#ba-analytics-dashboard select{font:inherit;color:inherit;}
    #ba-analytics-dashboard button,#ba-analytics-dashboard select,#ba-analytics-dashboard input{background:#211a20;border:1px solid #806879;border-radius:8px;padding:9px 12px;}
    #ba-analytics-dashboard button{cursor:pointer;}
    #ba-analytics-dashboard button:hover{border-color:var(--ba-accent);}
    #ba-analytics-dashboard :focus-visible{outline:3px solid #ff9bc9;outline-offset:3px;}
    .ba-dashboard-header{display:grid;grid-template-columns:minmax(180px,1fr) minmax(280px,3fr) minmax(140px,1fr);gap:24px;align-items:start;max-width:1500px;margin:0 auto 26px;padding-bottom:24px;border-bottom:1px solid #493a45;}
    .ba-dashboard-header>button:last-child{justify-self:end;}
    .ba-dashboard-header h1{font-size:clamp(28px,4vw,44px);line-height:1.1;margin:3px 0 8px;}
    .ba-kicker{color:#ff9bc9;font-size:12px;font-weight:800;letter-spacing:.12em;margin:0;}
    .ba-dashboard-intro,.ba-plain-note{color:#d3c7cf;margin:0;}
    .ba-dashboard-filters{max-width:1500px;margin:0 auto 28px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;padding:18px;background:#171217;border:1px solid #40323c;border-radius:14px;}
    .ba-dashboard-filters label{display:grid;gap:5px;font-size:13px;font-weight:650;}
    .ba-dashboard-filters .ba-check-filter{display:flex;align-items:center;gap:8px;}
    .ba-check-filter input{width:18px;height:18px;}
    .ba-dashboard-content{max-width:1500px;margin:auto;display:grid;gap:28px;}
    .ba-dashboard-content h2{font-size:22px;margin:0 0 12px;}
    .ba-coverage-note{background:#241a22;border-left:4px solid #ff69ad;border-radius:8px;padding:14px 16px;margin:0 0 14px;color:#f8edf3;}
    .ba-dashboard-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;}
    .ba-metric{background:#171217;border:1px solid #40323c;border-radius:12px;padding:15px;min-width:0;}
    .ba-metric h3{margin:0 0 8px;color:#d8c9d2;font-size:13px;font-weight:650;}
    .ba-metric p{font-size:clamp(19px,2vw,28px);font-weight:750;margin:0;overflow-wrap:anywhere;}
    .ba-dashboard-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;}
    .ba-sender-sections{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;} .ba-sender-sections section{background:#171217;border:1px solid #40323c;border-radius:12px;padding:16px;} .ba-sender-sections p{margin:0;color:#f5eef2;}
    .ba-dashboard-content>section,.ba-dashboard-columns>section{min-width:0;}
    .ba-table-wrap{max-width:100%;overflow:auto;border:1px solid #453743;border-radius:10px;background:#151115;}
    #ba-analytics-dashboard table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;}
    #ba-analytics-dashboard caption{text-align:left;padding:12px 14px;color:#d3c7cf;font-weight:650;}
    #ba-analytics-dashboard th,#ba-analytics-dashboard td{text-align:left;padding:10px 12px;border-top:1px solid #453743;white-space:nowrap;}
    #ba-analytics-dashboard thead th{background:#211a20;color:#ffd6e8;}
    #ba-analytics-dashboard tbody th{font-weight:600;}
    #ba-analytics-dashboard tbody tr:hover{background:#201820;}
    #ba-analytics-dashboard tbody button{border:0;background:transparent;color:#ff9bc9;text-decoration:underline;padding:2px 0;}
    .ba-person-detail{margin-top:14px;padding:16px;background:#171217;border-radius:10px;}
    .ba-person-detail:empty{display:none;}
    #ba-analytics-dashboard.ba-text-large{font-size:18px;}
    #ba-analytics-dashboard.ba-text-xlarge{font-size:20px;}
    #ba-analytics-dashboard.ba-high-contrast{background:#000;color:#fff;--ba-panel:#000;--ba-accent:#ffb8db;}
    #ba-analytics-dashboard.ba-high-contrast .ba-metric,#ba-analytics-dashboard.ba-high-contrast .ba-dashboard-filters,#ba-analytics-dashboard.ba-high-contrast .ba-table-wrap{background:#000;border-color:#fff;}
    @media(max-width:760px){.ba-sender-sections{grid-template-columns:1fr}.ba-dashboard-header{grid-template-columns:1fr;gap:12px}.ba-dashboard-header>button:last-child{justify-self:start}.ba-dashboard-columns{grid-template-columns:1fr}#ba-analytics-dashboard{padding:14px}.ba-dashboard-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(prefers-reduced-motion:reduce){#ba-analytics-dashboard *,#${this.panelId} *{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
  `;}
};
