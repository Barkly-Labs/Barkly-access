/**
 * @name BarklyAccess
 * @author Barkly Labs
 * @version 0.8.0
 * @description Accessible Discord controls and local conversation analytics.
 */
import { AggregationEngine } from '../../core/history/aggregation-engine.js';
import { normalizeMessages } from '../../core/history/normalizer.js';
import { HistoricalStore } from '../../core/storage/historical-store.js';
import { CollectionCoordinator } from '../../core/collection/collection-coordinator.js';
import { summarizeAnalytics } from '../../core/analytics/statistics-engine.js';
import { RenderedHistoryAdapter } from './rendered-history-adapter.js';
import { getSelectedConversationId } from './conversation-selection.js';
import frequentStyles from '../../styles/frequent.css';

export default class BarklyAccess {
  constructor() {
    this.styleId = 'barkly-access-quiet-view';
    this.panelId = 'barkly-access-panel';
    this.memberTabId = 'barkly-access-frequent';
    this.state = { quiet: false, layout: false, numbered: false, showMembers: false, showChannels: false, showToolbar: false };
    this.classes = { quiet: 'ba-quiet', layout: 'ba-readable-layout', numbered: 'ba-numbered-chat', members: 'ba-hide-members', channels: 'ba-hide-channels', toolbar: 'ba-hide-toolbar' };
    this.chunkClasses = ['ba-chunk-start','ba-chunk-middle','ba-chunk-end','ba-chunk-single'];
  }
  start() {
    this.state = Object.assign(this.state, BdApi.Data.load('BarklyAccess', 'state') || {});
    this.frequentEngine = new AggregationEngine();
    this.frequentLabels = new Map();
    this.analyticsStore = new HistoricalStore({
      load: () => BdApi.Data.load('BarklyAccess', 'historicalStats'),
      save: value => BdApi.Data.save('BarklyAccess', 'historicalStats', value),
    });
    this.historyAdapter = new RenderedHistoryAdapter({
      getSelectedConversation: () => this.getSelectedConversation(),
      // The adapter deliberately avoids Discord Webpack/internal stores. If a
      // supported identity provider is added later it can be injected here.
      getCurrentUserId: () => null,
    });
    this.collectionCoordinator = new CollectionCoordinator({
      adapter: this.historyAdapter,
      store: this.analyticsStore,
      onProgress: () => { this.renderStats(); this.refreshFrequent(); },
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
    p.innerHTML=`<button class="ba-main" aria-expanded="false">Barkly Access <span aria-hidden="true">＋</span></button><div class="ba-options" hidden><div class="ba-tabs" role="tablist" aria-label="Barkly Access features"><button type="button" role="tab" aria-selected="true" data-tab="controls" class="ba-tab-active">Access</button><button type="button" role="tab" aria-selected="false" data-tab="frequent">Frequent</button><button type="button" role="tab" aria-selected="false" data-tab="stats">Stats</button></div><section data-pane="controls"><p class="ba-summary">Show less at once. Bring anything back anytime.</p><button data-action="quiet" aria-pressed="false">Quiet view</button><button data-action="layout" aria-pressed="false">Readable chat layout</button><button data-action="numbered" aria-pressed="false">Conversation cards</button><div class="ba-extra"><button data-action="showMembers">Member list</button><button data-action="showChannels">Channel list</button><button data-action="showToolbar">Chat toolbar</button></div><button data-action="restore" class="ba-restore">Restore Discord view</button><p class="ba-help">Ctrl+Shift+F · quiet view<br>Ctrl+Shift+R · restore</p></section><section data-pane="frequent" hidden><p class="ba-summary">Ranks authors from locally stored aggregates for conversations you select. No message text is saved.</p><details class="ba-import-fallback"><summary>Optional testing or fallback import</summary><label class="ba-file-label" for="ba-frequent-file">Choose JSON file</label><input id="ba-frequent-file" type="file" accept=".json,application/json" aria-label="Import message history JSON file"><button type="button" data-action="clearFrequent" class="ba-secondary">Clear imported ranking</button></details><div class="ba-import-status" role="status" aria-live="polite">Automatic stats update while a conversation is open.</div><ol class="ba-frequent-list" aria-label="Frequent authors by message count" aria-live="polite"></ol></section><section data-pane="stats" hidden><h2 class="ba-stats-title">Conversation Stats</h2><p class="ba-summary">Barkly Access counts metadata from messages currently rendered in your selected conversation. Older history is included only as it loads in Discord.</p><div class="ba-collection-status" role="status" aria-live="polite"></div><div class="ba-stat-cards" aria-label="Message totals"></div><label for="ba-stats-search">Search people</label><input id="ba-stats-search" type="search" autocomplete="off"><label for="ba-stats-range">Activity range</label><select id="ba-stats-range"><option value="all">All tracked time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select><label for="ba-stats-granularity">Activity grouping</label><select id="ba-stats-granularity"><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select><h3>Messages by person</h3><ol class="ba-stats-people" aria-label="People ranked by messages received"></ol><h3>Activity over time</h3><p class="ba-chart-summary">Message totals grouped in UTC</p><ol class="ba-daily-chart" aria-label="Message activity chart"></ol><div class="ba-person-detail" aria-live="polite"></div><button type="button" data-action="clearConversation" class="ba-secondary">Clear this conversation</button><button type="button" data-action="clearAnalytics" class="ba-secondary">Clear all analytics</button></section></div>`;
    p.addEventListener('click',e=>{const b=e.target.closest('button[data-action], button[data-tab], button[data-author], button[data-exclude], button.ba-main');if(!b)return;if(b.dataset.tab){p.querySelectorAll('[data-pane]').forEach(x=>x.hidden=x.dataset.pane!==b.dataset.tab);p.querySelectorAll('[data-tab]').forEach(x=>{const selected=x===b;x.classList.toggle('ba-tab-active',selected);x.setAttribute('aria-selected',String(selected));});if(b.dataset.tab==='stats')this.renderStats();if(b.dataset.tab==='frequent')this.refreshFrequent();return;}if(b.classList.contains('ba-main')){const d=p.querySelector('.ba-options');d.hidden=!d.hidden;b.setAttribute('aria-expanded',String(!d.hidden));b.querySelector('span').textContent=d.hidden?'＋':'−';return;}if(b.dataset.exclude){this.toggleExcluded(b.dataset.exclude);return;}if(b.dataset.author){this.showPersonDetail(b.dataset.author);return;}const a=b.dataset.action;if(a==='restore')this.restore();else if(a==='clearFrequent')this.clearFrequent();else if(a==='clearConversation')this.clearCurrentConversation();else if(a==='clearAnalytics')this.clearAllAnalytics();else if(a==='cancelCollection')this.cancelSelectedCollection();else if(a==='quiet')this.toggleQuiet();else if(a)this.toggle(a);});
    p.querySelector('#ba-frequent-file').addEventListener('change',e=>this.importFrequentFile(e));
    p.querySelector('#ba-stats-search').addEventListener('input',()=>this.renderStats());
    p.querySelector('#ba-stats-range').addEventListener('change',()=>this.renderStats());
    p.querySelector('#ba-stats-granularity').addEventListener('change',()=>this.renderStats());
    const cancelButton=document.createElement('button');cancelButton.type='button';cancelButton.dataset.action='cancelCollection';cancelButton.className='ba-secondary';cancelButton.textContent='Stop history collection';cancelButton.hidden=true;
    p.querySelector('.ba-collection-status').insertAdjacentElement('afterend',cancelButton);
    document.body.appendChild(p);this.panel=p;this.updatePanel();
  }
  getSelectedConversation(){
    return getSelectedConversationId(window.location.pathname);
  }
  bindHistoryObserver(){
    if(!this.historyObserver)return;
    const selected=this.getSelectedConversation();
    if(selected!==this.activeConversationId){
      if(this.activeConversationId)this.collectionCoordinator.cancel(this.activeConversationId);
      this.activeConversationId=selected;this.lastHistorySignature="";this.queueHistoryCollection();
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
  async collectSelectedConversation(){
    const conversationId=this.getSelectedConversation();
    if(!conversationId||conversationId!==this.activeConversationId)return;
    if(this.collectionCoordinator.active.has(String(conversationId)))return;
    const root=document.querySelector('[class*="scrollerInner"]');
    const signature=root?[...root.querySelectorAll('[class*="messageListItem"]')].map(row=>row.id||row.getAttribute('data-list-item-id')||'').join('|'):'';
    if(!signature||signature===this.lastHistorySignature)return;
    const collection=this.collectionCoordinator.collect(conversationId);this.renderStats();
    const result=await collection;
    if(result.status!=='failed'){
      const finalRoot=document.querySelector('[class*="scrollerInner"]');
      this.lastHistorySignature=finalRoot?[...finalRoot.querySelectorAll('[class*="messageListItem"]')].map(row=>row.id||row.getAttribute('data-list-item-id')||'').join('|'):signature;
    }
    this.renderStats();this.refreshFrequent();
  }
  renderStats(){
    if(!this.panel)return;
    const snapshot=this.analyticsStore.snapshot();
    const range=this.panel.querySelector('#ba-stats-range')?.value||'all';
    const since=range==='all'?null:Date.now()-Number(range)*24*60*60*1000;
    const search=this.panel.querySelector('#ba-stats-search')?.value||'';
    const granularity=this.panel.querySelector('#ba-stats-granularity')?.value||'day';
    const summary=summarizeAnalytics(snapshot,{since,search,granularity});
    const cards=this.panel.querySelector('.ba-stat-cards');cards.replaceChildren();
    const items=[['Messages tracked',summary.totals.tracked],['Sent',summary.totals.sent],['Received',summary.totals.received],['Direction unknown',summary.totals.unknown],['Conversations',summary.trackedConversations],['Busiest hour (UTC)',summary.busiestHour?`${String(summary.busiestHour.hour).padStart(2,'0')}:00`: '—']];
    items.forEach(([label,value])=>{const card=document.createElement('div');card.className='ba-stat-card';const strong=document.createElement('strong');strong.textContent=Number(value||0).toLocaleString();const caption=document.createElement('span');caption.textContent=label;card.append(strong,caption);cards.appendChild(card);});
    const currentId=this.getSelectedConversation();const current=snapshot.conversations[currentId];
    this.panel.querySelector('[data-action="cancelCollection"]').hidden=!this.collectionCoordinator.active.has(String(currentId));
    const status=this.panel.querySelector('.ba-collection-status');
    status.textContent=current?`Selected conversation ${current.conversationId}: ${current.status}. ${current.coverage.recordsProcessed.toLocaleString()} messages counted. Barkly Access scrolls this conversation's UI to load older rows, then restores your reading position. Coverage remains partial because Discord does not report complete-history availability.${current.error?` Latest error: ${current.error}`:''}`:(this.collectionCoordinator.active.has(String(currentId))?'Loading rendered message history for the selected conversation.':'Open a person or conversation in Discord to begin local counting.');
    const peopleList=this.panel.querySelector('.ba-stats-people');peopleList.replaceChildren();
    summary.people.slice(0,100).forEach(person=>{
      const li=document.createElement('li');li.className='ba-stats-person-row';
      const view=document.createElement('button');view.type='button';view.dataset.author=person.authorId;view.textContent=`${person.name}: ${person.received.toLocaleString()} received, ${person.sent.toLocaleString()} sent${person.unknown?`, ${person.unknown} direction unknown`:''}`;li.appendChild(view);
      if(current?.people[person.authorId]){const exclude=document.createElement('button');exclude.type='button';exclude.dataset.exclude=person.authorId;exclude.setAttribute('aria-pressed',String(current.excludedAuthors.includes(person.authorId)));exclude.textContent=current.excludedAuthors.includes(person.authorId)?'Include':'Exclude';li.appendChild(exclude);}
      peopleList.appendChild(li);
    });
    if(!summary.people.length){const li=document.createElement('li');li.textContent='No matching tracked people yet.';peopleList.appendChild(li);}
    const daily=this.panel.querySelector('.ba-daily-chart');daily.replaceChildren();
    const points=summary.activity.slice(-14);const peak=Math.max(1,...points.map(point=>point.count));
    points.forEach(({period,count})=>{const li=document.createElement('li');li.className='ba-daily-row';li.setAttribute('aria-label',`${period}: ${count} messages`);const label=document.createElement('span');label.textContent=period;const bar=document.createElement('span');bar.className='ba-daily-bar';bar.style.width=`${Math.max(2,count/peak*100)}%`;bar.setAttribute('aria-hidden','true');const amount=document.createElement('strong');amount.textContent=count.toLocaleString();li.append(label,bar,amount);daily.appendChild(li);});
    if(!points.length){const li=document.createElement('li');li.textContent='No timestamped activity in this range.';daily.appendChild(li);}
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
    if(!this.panel)return; const list=this.panel.querySelector('.ba-frequent-list'); if(!list)return; list.replaceChildren();
    const stored=summarizeAnalytics(this.analyticsStore.snapshot()).people.filter(person=>person.received>0).map((person,index)=>({rank:index+1,userId:person.authorId,name:person.name,count:person.received}));
    const ranking=(stored.length?stored:this.frequentEngine.getRanking().map((person,index)=>({...person,name:this.frequentLabels.get(person.userId)||person.userId}))).slice(0,100);
    if(!ranking.length){const li=document.createElement('li');li.textContent='No history collected yet. Open a conversation in Discord to begin.';list.appendChild(li);return;}
    ranking.forEach(({rank,userId,count,name})=>{const li=document.createElement('li');li.className='ba-frequent-item';const rankLabel=document.createElement('span');rankLabel.className='ba-rank';rankLabel.setAttribute('aria-label',`Rank ${rank}`);rankLabel.textContent=String(rank);const label=document.createElement('span');label.className='ba-frequent-name';label.textContent=name||userId;const amount=document.createElement('span');amount.className='ba-frequent-count';amount.textContent=`${count.toLocaleString()} messages`;li.append(rankLabel,label,amount);list.appendChild(li);});
  }
  extractMessages(data){
    if(Array.isArray(data))return data;
    if(data&&typeof data==='object'){
      if(Array.isArray(data.messages))return data.messages;
      if(Array.isArray(data.data))return data.data;
      if(Array.isArray(data.items))return data.items;
    }
    throw new Error('Choose a JSON array or an object containing a messages array.');
  }
  async importFrequentFile(event){
    const file=event.target.files?.[0];if(!file)return;
    const status=this.panel.querySelector('.ba-import-status');
    try{
      const parsed=JSON.parse(await file.text());
      const records=this.extractMessages(parsed);
      const normalized=normalizeMessages(records,{
        getMessageId:m=>m.id??m.messageId??m.message_id,
        getAuthorId:m=>m.author?.id??m.authorId??m.author_id??m.user_id??m.userId??(typeof m.author==='string'?m.author:null),
        getConversationId:m=>m.channel_id??m.conversationId??m.channelId??m.channel,
        getTimestamp:m=>m.timestamp??m.createdAt??m.created_at,
      });
      const labels=new Map();
      records.forEach(m=>{if(!m||typeof m!=='object')return;const id=m.author?.id??m.authorId??m.author_id??m.user_id??m.userId??(typeof m.author==='string'?m.author:null);const label=m.author?.username??m.author?.name??m.authorName??m.username??m.name??m.author;if(id!=null&&typeof label==='string'&&label.trim())labels.set(String(id),label.trim());});
      const engine=new AggregationEngine();engine.processBatch(normalized);
      this.frequentEngine=engine;this.frequentLabels=labels;this.refreshFrequent();
      status.textContent=`Imported ${normalized.length.toLocaleString()} valid records. Message text was discarded.`;
      // Drop references to raw records as soon as the count-only pass completes.
    }catch(error){status.textContent=error instanceof SyntaxError?'Could not read that JSON file. Check that it contains valid JSON.':error.message||'Could not import this file.';}
    finally{event.target.value='';}
  }
  clearFrequent(){this.frequentEngine.reset();this.frequentLabels.clear();this.panel.querySelector('.ba-import-status').textContent='Ranking cleared. No message data is retained.';this.refreshFrequent();}
  updatePanel(){ if(!this.panel)return; this.panel.querySelectorAll('[data-action]').forEach(b=>{const k=b.dataset.action;if(!Object.hasOwn(this.state,k))return;const on=!!this.state[k];b.setAttribute('aria-pressed',String(on));b.classList.toggle('ba-on',on);const labels={quiet:'Quiet view',layout:'Readable chat layout',numbered:'Conversation cards',showMembers:'Member list',showChannels:'Channel list',showToolbar:'Chat toolbar'};b.textContent=(k==='quiet'||k==='layout'||k==='numbered')?`${labels[k]} · ${on?'On':'Off'}`:`${labels[k]} · ${on?'Shown':'Hidden'}`;});}
  stop(){document.removeEventListener('keydown',this.onKeyDown,true);clearTimeout(this.collectionTimer);this.chunkObserver?.disconnect();this.historyObserver?.disconnect();this.messageObserver?.disconnect();for(const id of this.collectionCoordinator?.active.keys()||[])this.collectionCoordinator.cancel(id);document.querySelectorAll('[class*=messageListItem]').forEach(n=>this.chunkClasses.forEach(c=>n.classList.remove(c)));Object.values(this.classes).forEach(c=>document.body.classList.remove(c));BdApi.DOM.removeStyle(this.styleId);document.getElementById(this.panelId)?.remove();this.frequentEngine?.reset();this.frequentLabels?.clear();}
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
    #${this.panelId}{position:fixed;z-index:99999;top:14px;right:16px;width:238px;max-height:80vh;overflow:auto;background:#090909;color:#f1f1f1;border:1px solid #ff4fa3;border-radius:12px;box-shadow:0 8px 28px #0009;font:14px/1.45 sans-serif;}
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
  `;}
};
