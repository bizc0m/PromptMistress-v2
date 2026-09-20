/*
v0.2 2026-09-14 STABLE-INTERNE
DEMANDE: Ajouter indicateur visuel de tri actif sur les headers de colonnes, recherche full-text dans Importer (via capture-ui.js) et glisser-deposer sur dossiers.
SORTIE: Headers de colonnes reflectent le tri actif (asc/desc). Support drag & drop des lignes sur les dossiers de l'explorateur.
PREUVE: Test visuel dans /workspace apres redemarrage du serveur.
Fichier precedent: workspace-ui.js (v0.1 initiale)
*/
import {columns,loadView,saveView,applyViewOptions,mountViewSettings,viewKey,unreadPrompts} from './workspace-view.mjs';
import {exportContent,readerBlocks,corpusEntry,corpusFiles} from './message-content.mjs';
import {zipFiles} from './zip.mjs';
import {mergeRuleAnnotation} from './workspace-rules.mjs';
import {setupRules} from './workspace-rules-ui.js';
import {searchRanges,segments,snippet} from './search-highlights.mjs';
import {createBooleanSearch,booleanDocument} from './nyx-boolean-client.js';
import {retainVisibleSelection,parseTags,splitValues,matches,folderTree,updatedAnnotation} from './explorer.mjs';
const $=id=>document.getElementById(id),bridge=()=>parent.PMWorkspace;
const storageKey='promptmistress.workspace.annotations.v1';
let saved;try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}');if(!saved||typeof saved!=='object'||Array.isArray(saved))throw Error();}catch{$('notice').textContent='Annotations locales illisibles : enregistrement désactivé pour préserver les données.';saved=null;}
const draftKey=storageKey+'.drafts';
let drafts={};try{const data=JSON.parse(localStorage.getItem(draftKey)||'{}');if(data&&typeof data==='object'&&!Array.isArray(data))drafts=data;}catch{}
const annotationFields=['tags','folders','note','status','priority','color'];
const favoriteTagsKey='promptmistress.workspace.favoriteTags.v1';
let favoriteTags=[];try{const ft=JSON.parse(localStorage.getItem(favoriteTagsKey)||'[]');if(Array.isArray(ft))favoriteTags=ft;}catch{}
function saveFavoriteTags(){localStorage.setItem(favoriteTagsKey,JSON.stringify(favoriteTags));}
function renderFavoriteTags(){const box=$('favorite-tags');if(!box)return;box.replaceChildren();for(const t of favoriteTags){if(!t.tag)continue;const b=document.createElement('button');b.type='button';b.className='favorite-tag';b.textContent=t.tag;b.style.setProperty('--tag-color',t.color||'#409cff');b.title='Ajouter '+t.tag;b.onclick=()=>{if(!active){notify('Sélectionne une fiche.');return;}const tags=parseTags($('tags').value);if(!tags.includes(t.tag))tags.push(t.tag);$('tags').value=tags.join(', ');dirty=true;retainDraft();$('annotation-status').textContent='Tag ajouté · à enregistrer';};box.append(b);}box.hidden=!box.childElementCount;}
function renderFavoriteTagsDialog(){const list=$('favorite-tags-list');list.replaceChildren();for(const t of favoriteTags){const row=document.createElement('div');row.className='favorite-tag-row';const color=document.createElement('input');color.type='color';color.value=t.color||'#409cff';color.onchange=()=>{t.color=color.value;};const input=document.createElement('input');input.value=t.tag;input.placeholder='#tag ou @mention';input.oninput=()=>{t.tag=input.value.trim();};const del=document.createElement('button');del.type='button';del.textContent='×';del.title='Supprimer';del.onclick=()=>{favoriteTags=favoriteTags.filter(x=>x!==t);renderFavoriteTagsDialog();};row.append(color,input,del);list.append(row);}}
function openFavoriteTagsDialog(){$('favorite-tags-dialog').showModal();renderFavoriteTagsDialog();}
let view=loadView();applyViewOptions(view);document.body.classList.toggle('embedded',parent!==window);
let showMetadata=false;
let facetsDirty=true;
let dirty=false;
function retainDraft(){if(!active||!dirty)return;const next={...drafts,[active.key]:Object.fromEntries(annotationFields.map(k=>[k,$(k).value]))};try{localStorage.setItem(draftKey,JSON.stringify(next));drafts=next;}catch{notify('Brouillon non sauvegardé : espace local indisponible.');drafts=next;}}
function removeDraft(key){const next={...drafts};delete next[key];localStorage.setItem(draftKey,JSON.stringify(next));drafts=next;}

let explorerFolder='',explorerTag='';
const expandedFolders=new Set();
let rows=[],active=null,detail=null,limit=100,serial=0,hash='',selected=new Set(),visible=[];
const booleanEngine=createBooleanSearch();
let corpus=null,corpusPromise=null,corpusGeneration='',corpusEpoch=0,matchedVariants=new Map(),searchTerms=[],hitIndex=-1;
let booleanSignature='',booleanKeys=new Set(),booleanRun=0,booleanTimer=null,booleanPending=false,searchRevision=0;
const format=n=>n.toLocaleString('fr-FR');
const exporterId=r=>r?.variants.find(v=>v.editor?.module==='exporter')?.editor.id;
function manualAnnotation(r){const id=exporterId(r);let original={};try{if(id)original=bridge().annotation(id);}catch{}return {...original,...(saved?.[r.key]||{})};}
let rulesController;
function annotation(r){return mergeRuleAnnotation(manualAnnotation(r),rulesController?.annotation(r.key));}
function projectColorHash(name){let hash=2166136261;const text=String(name||'Sans projet');for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)>>>0;}return hash;}
function clearProjectBadgeColor(el){el.style.removeProperty('--project-hue');el.style.removeProperty('--project-bg');el.style.removeProperty('--project-fg');el.style.removeProperty('--project-border');delete el.dataset.projectColor;}
function decorateProjectBadge(el,project,a){const mode=view.projectColorMode||'auto';el.dataset.projectMode=mode;clearProjectBadgeColor(el);if(mode==='auto'){const hue=projectColorHash(project)%360;el.dataset.projectColor=String(hue);el.style.setProperty('--project-hue',String(hue));el.style.setProperty('--project-bg','hsl('+hue+' 48% 16%)');el.style.setProperty('--project-fg','hsl('+hue+' 88% 78%)');el.style.setProperty('--project-border','hsl('+hue+' 56% 36%)');}else if(mode==='manual'&&a.color){el.dataset.projectColor=a.color;}el.title=mode==='auto'?'Projet : '+(project||'Sans projet')+' · couleur automatique':'Projet : '+(project||'Sans projet');}
function persist(key,value){if(!saved)throw Error('Stockage des annotations indisponible.');const next={...saved,[key]:value};localStorage.setItem(storageKey,JSON.stringify(next));saved=next;facetsDirty=true;searchRevision++;}
let noticeTimer;function notify(e){clearTimeout(noticeTimer);$('notice').textContent=e instanceof Error?e.message:e;if(!(e instanceof Error))noticeTimer=setTimeout(()=>{$('notice').textContent='';},8000);}
function render(){
 const q=$('search').value.trim(),booleanMode=$('search-mode').value==='boolean';
 $('boolean-help').hidden=!booleanMode;$('full-text').disabled=false;$('full-text').closest('label').hidden=false;
 const useBoolean=booleanMode||(!!q&&$('full-text').checked);
 if(useBoolean&&q)ensureBoolean(q,$('kind').value);else resetBoolean();
 if(facetsDirty){renderExplorer();facetsDirty=false;}
 updateFacets();
 const extras=[$('search-mode').value==='boolean',$('has-content').checked,$('date-from').value,$('date-to').value,$('filter-status').value].filter(Boolean).length;$('advanced-filters').querySelector('summary').textContent='Filtres'+(extras?' ('+extras+')':'');
 $('provider').dataset.provider=$('provider').value;
 for(const b of document.querySelectorAll("[data-kind-view]"))b.setAttribute("aria-pressed",String(b.dataset.kindView===$("kind").value));
 for(const b of document.querySelectorAll("[data-source-view]"))b.setAttribute("aria-pressed",String(b.dataset.sourceView===$("provider").value));
 const kind=$('kind').value,provider=$('provider').value,content=$('has-content').checked,filter={view:$('visibility').value,project:$('project-filter').value,tag:explorerTag,folder:explorerFolder,query:useBoolean?'':q};
 visible=rows.filter(r=>(!kind||r.kind===kind)&&(!provider||r.provider===provider)&&(!content||r.hasContent)&&matches(r,annotation(r),filter)&&(!$('date-from').value||String(r.updated).slice(0,10)>=$('date-from').value)&&(!$('date-to').value||(r.updated&&String(r.updated).slice(0,10)<=$('date-to').value))&&(!$('filter-status').value||annotation(r).status===$('filter-status').value)&&(!useBoolean||!q||booleanKeys.has(r.key)));
 // Preserve selection across filters; prune only when a source refresh removes a key.
 if(active&&!visible.some(r=>r.key===active.key)){retainDraft();active=null;dirty=false;detail=null;serial++;$('record').hidden=true;$('empty').hidden=false;$('body').textContent='Sélectionne un élément';$('body-fold').open=false;}
 $('no-results').hidden=visible.length>0||booleanPending;
 const sorting=$('sort').value;visible.sort((a,b)=>sorting==='title'?a.title.localeCompare(b.title):sorting==='title-desc'?b.title.localeCompare(a.title):sorting==='provider'||sorting==='project'?String(a[sorting]||'').localeCompare(String(b[sorting]||'')):sorting==='oldest'?String(a.updated).localeCompare(String(b.updated)):String(b.updated).localeCompare(String(a.updated)));
 const rowTerms=booleanMode?searchTerms:simpleSearchTerms(q);
 const fold=$('body-fold');fold.remove();
 $('list').replaceChildren();
 const table=document.createElement('table');table.className='vault-table';
 const colgroup=document.createElement('colgroup');const checkCol=document.createElement('col');checkCol.style.width='32px';colgroup.append(checkCol);table.append(colgroup);
 const head=document.createElement('thead'),header=document.createElement('tr'),selectTh=document.createElement('th');
 const selectAll=document.createElement('input');selectAll.type='checkbox';selectAll.id='select-all-rows';selectAll.setAttribute('aria-label','Sélectionner tous les résultats');selectAll.onchange=()=>{for(const r of visible)selectAll.checked?selected.add(r.key):selected.delete(r.key);render();};selectTh.append(selectAll);header.append(selectTh);
 let tableWidth=32;
 for(const [id,label] of columns){
  const th=document.createElement('th');th.scope='col';th.dataset.column=id;th.hidden=!view.columns[id];
  const button=document.createElement('button');button.textContent=label.toUpperCase();const sorting={date:'date',llm:'provider',title:'title',project:'project'}[id];
   if(sorting){button.onclick=()=>{$('sort').value=sorting;render();};th.append(button);
    const activeSort=$('sort').value;
    const isActive=(activeSort===sorting)||(sorting==='title'&&['title','title-desc'].includes(activeSort))||(sorting==='date'&&['date','oldest'].includes(activeSort));
    if(isActive){th.classList.add('sort-active');const isDesc=activeSort.endsWith('-desc')||activeSort==='date';th.classList.add(isDesc?'sort-desc':'sort-asc');button.setAttribute('aria-sort',isDesc?'descending':'ascending');}
   }else th.append(document.createTextNode(label.toUpperCase()));
  if(view.columns[id]){
   const col=document.createElement('col');col.style.width=view.widths[id]+'px';colgroup.append(col);tableWidth+=view.widths[id];
   const grip=document.createElement('span');grip.className='column-grip';grip.tabIndex=0;grip.setAttribute('role','separator');grip.setAttribute('aria-orientation','vertical');grip.setAttribute('aria-label','Redimensionner '+label);grip.setAttribute('aria-valuemin','60');grip.setAttribute('aria-valuemax','900');grip.setAttribute('aria-valuenow',view.widths[id]);
   const resize=value=>{view.widths[id]=Math.max(60,Math.min(900,Math.round(value)));col.style.width=view.widths[id]+'px';table.style.width=(32+columns.reduce((n,[key])=>n+(view.columns[key]?view.widths[key]:0),0))+'px';grip.setAttribute('aria-valuenow',view.widths[id]);};
   grip.onpointerdown=e=>{e.preventDefault();e.stopPropagation();const start=e.clientX,width=view.widths[id];grip.setPointerCapture(e.pointerId);grip.onpointermove=m=>resize(width+m.clientX-start);const finish=()=>{grip.onpointermove=null;grip.onpointerup=null;grip.onpointercancel=null;try{saveView(view);}catch(error){notify(error);}};grip.onpointerup=finish;grip.onpointercancel=finish;};
   grip.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();resize(view.widths[id]+(e.key==='ArrowRight'?10:-10));try{saveView(view);}catch(error){notify(error);}document.querySelector('[data-column="'+id+'"] .column-grip')?.focus();};th.append(grip);
  }header.append(th);
 }
 table.style.width=tableWidth+'px';head.append(header);table.append(head);
 const tbody=document.createElement('tbody');table.append(tbody);
 for(const r of visible.slice(0,limit)){
   const a=annotation(r),item=document.createElement('tr');item.className='item'+(r.key===active?.key?' active':'');item.dataset.color=a.color||'';item.draggable=true;item.ondragstart=e=>{e.dataTransfer.setData('text/plain',r.key);e.dataTransfer.effectAllowed='move';};
   item.oncontextmenu=e=>{e.preventDefault();choose(r);openReaderMenu(e,true);};
  let cellIndex=-1;const cell=()=>{const td=document.createElement('td');if(cellIndex>=0){td.dataset.column=columns[cellIndex][0];td.hidden=!view.columns[columns[cellIndex][0]];}cellIndex++;item.append(td);return td;};
  const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(r.key);check.setAttribute('aria-label','Sélectionner '+r.title);check.onchange=()=>{check.checked?selected.add(r.key):selected.delete(r.key);selectionCount();};cell().append(check);
  const date=cell();date.className='date-cell';const d=new Date(r.updated);
  if(r.updated&&!Number.isNaN(d.valueOf())){
   const visible=d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
   const full=d.toLocaleString('fr-FR',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
   const stamp=document.createElement('span');stamp.className='date-tip';stamp.tabIndex=0;stamp.textContent=visible;stamp.dataset.tip=full;stamp.title=full;date.append(stamp);
  }else date.textContent='—';
  const llm=document.createElement('span');llm.className='vault-badge provider';llm.dataset.provider=r.provider;llm.textContent=r.provider||'—';cell().append(llm);
  const title=cell();title.className='title-cell';const toggle=document.createElement('button');toggle.className='row-fold';toggle.textContent=r.key===active?.key&&fold.open?'▾':'▸';toggle.setAttribute('aria-label','Déplier / replier '+r.title);toggle.setAttribute('aria-expanded',String(r.key===active?.key&&fold.open));toggle.onclick=async()=>{if(active?.key===r.key){fold.open=!fold.open;render();}else {await choose(r);fold.open=true;render();}};title.append(toggle);
  const hits=occurrenceCount(r,a,rowTerms);if(hits){const hit=document.createElement('span');hit.className='row-occurrences';hit.textContent=hits;hit.title=hits+' occurrence(s) dans cette ligne ou son texte chargé';title.append(hit);}
  const button=document.createElement('button');button.className='row-title';appendMarked(button,r.title||r.identity);button.title=r.title;button.onclick=toggle.onclick;title.append(button);
  const type=document.createElement('span');type.className='row-type';type.textContent=r.kind==='prompt'?'Prompt':r.copies>1?r.copies+' versions':'';title.append(type);
  const badges=document.createElement('div');badges.className='tag-badges';addBadges(badges,a.tags||[]);if(badges.childElementCount)title.append(badges);
  const project=document.createElement('span');project.className='vault-badge project';project.textContent=r.project||'—';decorateProjectBadge(project,r.project,a);cell().append(project);
  const statusValue=a.visibility==='archived'?'archived':a.visibility==='hidden'?'hidden':a.status||'none';
  const statusLabel=a.visibility==='archived'?'Archivé':a.visibility==='hidden'?'Masqué':a.status||'—';
  const status=document.createElement('span');status.className='status-dot';status.dataset.status=statusValue;status.title=statusLabel;status.setAttribute('aria-label','Statut : '+statusLabel);cell().append(status);
  const source=cell(),url=r.variants.find(v=>/^(https?:|codex:|promptvault:)/.test(v.sourceURL||''))?.sourceURL;
  if(url){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.textContent='Source ↗';source.append(link);}else source.textContent='—';
  const actions=document.createElement('td');actions.className='row-actions';
  const hideBtn=document.createElement('button');hideBtn.className='row-action';hideBtn.textContent='🚫';hideBtn.title='Masquer';hideBtn.onclick=e=>{e.stopPropagation();setVisibility(r,'hidden');};
  const archiveBtn=document.createElement('button');archiveBtn.className='row-action';archiveBtn.textContent='📦';archiveBtn.title='Archiver';archiveBtn.onclick=e=>{e.stopPropagation();setVisibility(r,'archived');};
  actions.append(hideBtn,archiveBtn);item.append(actions);
  tbody.append(item);
  if(r.key===active?.key){const contentRow=document.createElement('tr');contentRow.className='content-row';const contentCell=document.createElement('td');contentCell.colSpan=1+columns.filter(([id])=>view.columns[id]).length;contentCell.append(fold);contentRow.append(contentCell);tbody.append(contentRow);}
 }
 $('list').append(table);if(!fold.isConnected){$('body-parking').append(fold);}
 $('more').hidden=visible.length<=limit;selectionCount();
 const chatCount=rows.filter(r=>r.kind==='chat').length,promptCount=rows.filter(r=>r.kind==='prompt').length;
 $('counts').textContent=booleanPending?'Recherche…':format(visible.length)+' res · '+format(chatCount)+' C · '+format(promptCount)+' P';
 $('counts').title=format(visible.length)+' résultats · '+format(chatCount)+' conversations · '+format(promptCount)+' prompts';
}
function selectionCount(){const count=selected.size;$('selected-count').textContent=count?format(count)+' sélectionné(s)':'';document.querySelector('.selection').hidden=false;$('export-selection').disabled=!count;$('export-selection').textContent='Export ('+format(count)+')';const topExport=$('top-export');if(topExport){topExport.textContent=count?'⬇ Exporter ('+format(count)+')':'⬇ Exporter';topExport.title=count?'Exporter les '+format(count)+' éléments sélectionnés':'Exporter la fiche ouverte ou une sélection';}document.querySelector('.bulk').hidden=!count;const all=$('select-all-rows');if(all){const n=visible.filter(r=>selected.has(r.key)).length;all.checked=!!visible.length&&n===visible.length;all.indeterminate=n>0&&n<visible.length;}}
function fillAnnotation(){const a={...annotation(active),...(drafts[active.key]||{})};dirty=!!drafts[active.key];$('record-tags').replaceChildren();addBadges($('record-tags'),a.tags||[]);$('visibility-label').textContent=a.visibility==='hidden'?'Masqué':a.visibility==='archived'?'Archivé':'Actif';for(const key of ['tags','folders','note','status','priority','color'])$(key).value=Array.isArray(a[key])?a[key].join(', '):a[key]||'';$('annotation-status').textContent=dirty?'Brouillon conservé · à enregistrer':'';renderFavoriteTags();}
async function choose(r){
 retainDraft();dirty=false;active=r;detail=null;$('empty').hidden=true;$('record').hidden=false;$('title').textContent=r.title;$('meta').textContent=[r.kind==='prompt'?'Prompt':'Conversation',r.provider,r.project,r.updated].filter(Boolean).join(' · ');
 $('versions').replaceChildren();r.variants.forEach((v,i)=>{const o=document.createElement('option');o.value=i;o.textContent=v.source+' · '+(v.hasContent?'contenu':'métadonnées');$('versions').append(o);});$('versions').value=matchedVariants.get(r.key)?.variant??Math.max(0,r.variants.findIndex(v=>v.hasContent));
 fillAnnotation();render();await readDetail();
}
async function readDetail(){
 $('attachments').replaceChildren();const turn=++serial;detail=null;hash='';$('body-fold').open=false;$('body').textContent='Chargement…';$('source').hidden=true;
 for(const id of ['copy','menu-highlight','clear-highlights'])$(id).disabled=true;
 try{const res=await fetch('/api/workspace/detail?'+new URLSearchParams({key:active.key,variant:$('versions').value}));if(!res.ok)throw Error('Contenu indisponible.');const d=await res.json();const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(d.text));if(turn!==serial)return;detail=d;renderAttachments(d);hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');paint();$('provenance').textContent=active.variants.map((v,i)=>(i+1)+'. '+v.source+'\n'+v.path+'\n'+(v.sourceURL||'')).join('\n\n');
 if(/^(https?:|codex:|promptvault:)/.test(d.sourceURL||'')){$('source').href=d.sourceURL;$('source').hidden=false;}
 for(const id of ['copy','menu-highlight','clear-highlights'])$(id).disabled=false;
 }catch(e){if(turn===serial){$('body').textContent=e.message;notify(e);}}
}
function highlightKey(){return $('versions').value+':'+hash;}
function paint(){
 if(!detail||!active)return;
 const body=$('body'),manual=saved?.[active.key]?.highlights?.[highlightKey()]||[];
 body.replaceChildren();const search=searchRanges(detail.text,searchTerms);
 for(const block of readerBlocks(detail.text)){
  const span=document.createElement('span');span.className='reader-block';span.dataset.role=block.role;
  span.hidden=block.role==='metadata'&&!showMetadata;
  const clip=ranges=>ranges.filter(r=>r.end>block.start&&r.start<block.end).map(r=>({start:Math.max(r.start,block.start)-block.start,end:Math.min(r.end,block.end)-block.start,text:detail.text.slice(Math.max(r.start,block.start),Math.min(r.end,block.end))}));
  const valid=manual.filter(r=>detail.text.slice(r.start,r.end)===r.text);
  for(const part of segments(detail.text.slice(block.start,block.end),clip(search),clip(valid))){
   const node=part.types.length?document.createElement('mark'):document.createTextNode(part.text);
   if(part.types.length){node.className=part.types.map(t=>t+'-hit').join(' ');node.textContent=part.text;}span.append(node);
  }body.append(span);
 }
 $('reader-raw').setAttribute('aria-pressed',String(showMetadata));
 hitIndex=-1;const count=body.querySelectorAll('.reader-block:not([hidden]) .search-hit').length;$('hit-count').textContent=count?count+' passage(s) surligné(s)':'';$('next-hit').disabled=!count;
}
$('search').addEventListener('input',()=>render());
$('search-mode').addEventListener('change',()=>render());
$('kind').addEventListener('change',()=>render());
$('provider').addEventListener('change',()=>render());
$('sort').addEventListener('change',()=>render());
$('visibility').addEventListener('change',()=>{facetsDirty=true;render();});
$('project-filter').addEventListener('change',()=>{facetsDirty=true;render();});
$('has-content').addEventListener('change',()=>render());
$('date-from').addEventListener('change',()=>render());
$('date-to').addEventListener('change',()=>render());
$('filter-status').addEventListener('change',()=>render());
$('full-text').addEventListener('change',()=>render());
$('next-hit').onclick=()=>{const hits=$('body').querySelectorAll('.reader-block:not([hidden]) .search-hit');if(!hits.length)return;hitIndex=(hitIndex+1)%hits.length;hits[hitIndex].scrollIntoView({block:'center'});$('hit-count').textContent=(hitIndex+1)+' / '+hits.length;};
$('annotation').onsubmit=e=>{e.preventDefault();try{
 const value=Object.fromEntries(['tags','folders','note','status','priority'].map(k=>[k,['tags','folders'].includes(k)?(k==='tags'?parseTags($(k).value):splitValues($(k).value)):$(k).value]));
 const id=exporterId(active),old=saved?.[active.key]||{};
 if(!saved)throw Error('Stockage indisponible.');
 if(id){try{bridge().saveAnnotation(id,value);}catch{notify('Fiche conservée dans la Bibliothèque ; synchronisation Exporter indisponible.');}}
 persist(active.key,{...old,...value,color:$('color').value,_manual:[...new Set([...(old._manual||[]),...annotationFields])]});
 removeDraft(active.key);dirty=false;$('annotation-status').textContent='Enregistré';render();
 }catch(error){notify(error);}};
$('menu-highlight').onclick=()=>{try{
 $('reader-menu').hidden=true;
 if(!detail)return;const selection=window.getSelection();if(!selection.rangeCount||selection.isCollapsed)throw Error('Sélectionne un passage dans le contenu.');const range=selection.getRangeAt(0),body=$('body');if(!body.contains(range.startContainer)||!body.contains(range.endContainer))throw Error('Sélectionne uniquement du texte dans le contenu.');
 const before=document.createRange();before.selectNodeContents(body);before.setEnd(range.startContainer,range.startOffset);const start=before.toString().length,end=start+range.toString().length,old=saved?.[active.key]||{},highlights={...old.highlights},key=highlightKey();
 const ranges=highlights[key]||[];if(ranges.some(r=>start<r.end&&end>r.start))throw Error('Ce passage recoupe un surlignage existant.');highlights[key]=[...ranges,{start,end,text:detail.text.slice(start,end)}];persist(active.key,{...old,highlights});paint();notify('Surlignage enregistré ; texte original préservé.');
 }catch(e){notify(e);}};
$('clear-highlights').onclick=()=>{try{const old=saved?.[active.key]||{},highlights={...old.highlights};delete highlights[highlightKey()];persist(active.key,{...old,highlights});paint();}catch(e){notify(e);}};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(exportContent(detail,active.kind,$('export-content').value));notify('Texte copié sans annotations.');}catch(e){notify(e);}};
function exportName(targets,extension,label='',date=new Date()){
 const title=targets.length===1?(targets[0].title||'Prompt'):'Corpus-'+targets.length+'-elements';
 const stem=(label?label+'-':'')+title;
 const safe=stem.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,'-').replace(/\s+/g,' ').trim().slice(0,100).replace(/[. ]+$/g,'')||'Export';
 const day=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
 return safe+'-'+day+'-PromptMistress.'+extension;
}
function download(name,content,type){const url=URL.createObjectURL(content instanceof Blob?content:new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportSelection(format,options={}){
 const targets=options.targets||(selected.size?rows.filter(r=>selected.has(r.key)):active?[active]:[]);
 const mode=options.mode||$('export-content').value,allVariants=options.allVariants??$('export-all-variants').checked;
 if(!targets.length)return;const activeKey=active?.key,activeVersion=Number($('versions').value);notify('Préparation de '+targets.length+' élément(s)…');
 try{const results=[];for(const r of targets){options.progress?.(results.length,targets.length);const variants=allVariants?r.variants.map((_,i)=>i):[r.key===activeKey?activeVersion:Math.max(0,r.variants.findIndex(v=>v.hasContent))];for(const variant of variants){const res=await fetch('/api/workspace/detail?'+new URLSearchParams({key:r.key,variant}));if(!res.ok)throw Error('Export interrompu : '+r.title);const d=await res.json();results.push(corpusEntry({key:r.key,identity:r.identity,title:r.title,kind:r.kind,provider:r.provider,project:r.project,updated:r.updated,variant,source:r.variants[variant].source,sourceURL:d.sourceURL,variants:r.variants,annotation:annotation(r),exportMode:mode},d,mode));}}

 const files=corpusFiles(results);
 if(format==='json')download(exportName(targets,'json'),JSON.stringify(results,null,2),'application/json');
 else if(format==='zip')download(exportName(targets,'zip'),zipFiles(files),'application/zip');
 else download(exportName(targets,format==='txt'?'txt':'md'),files.find(f=>f.name===(format==='txt'?'Corpus.txt':'Corpus.md')).text,format==='txt'?'text/plain':'text/markdown');notify(targets.length+' élément(s) exporté(s), contenu choisi ; variantes selon les réglages.');return true;
 }catch(e){notify(e);options.error?.(e.message);return false;}
}
for(const format of ['md','txt','json','zip'])$('export-'+format).onclick=()=>exportSelection(format);
$('export-legacy-index').onclick=()=>{try{const targets=selected.size?rows.filter(r=>selected.has(r.key)):active?[active]:[],ids=targets.map(exporterId);if(ids.some(id=>!id))throw Error('L’index NotePlan existant accepte les conversations Exporter. Sélectionne uniquement ces conversations.');download(exportName(targets,'md','Index'),bridge().index(ids),'text/markdown');notify('Index généré avec le moteur Exporter.');}catch(e){notify(e);}};
for(const id of ['search','search-mode','full-text','kind','provider','sort','has-content','visibility','project-filter','date-from','date-to','filter-status'])$(id).oninput=()=>{if(id==='kind'){explorerFolder='';explorerTag='';facetsDirty=true;searchRevision++;}limit=100;render();};
$('versions').onchange=readDetail;$('more').onclick=()=>{limit+=100;render();};$('select-visible').onclick=()=>{visible.forEach(r=>selected.add(r.key));render();};$('clear').onclick=()=>{selected.clear();render();};
function refreshState(state){
 const button=$('refresh');button.dataset.state=state;button.disabled=state==='loading';button.setAttribute('aria-busy',String(state==='loading'));
 button.textContent=state==='fresh'?'✓ À jour':state==='loading'?'↻ Relecture…':'↻ Refresh';
 button.title=state==='fresh'?'Sources relues à '+new Date().toLocaleTimeString('fr-FR')+' — cliquer pour rafraîchir à nouveau.':state==='loading'?'Relecture des sources en cours.':'Rafraîchissement nécessaire ou dernière lecture incomplète.';
}
async function load(refresh=false){if($('refresh').disabled)return;const previous=rows;const knownPrompts=rows.filter(r=>r.kind==='prompt').length;$('unread-count').textContent='Prompts à relire localement : '+(knownPrompts||'…');rulesController?.invalidate();refreshState(refresh?'loading':'stale');try{const r=await fetch('/api/workspace'+(refresh?'?refresh=1':''));if(!r.ok)throw Error('Bibliothèque indisponible.');const data=await r.json();retainDraft();outputScanEpoch++;outputScanRunning=false;outputItems=[];$('rescan-outputs').disabled=false;corpusEpoch++;corpus=null;corpusPromise=null;corpusGeneration=data.generation;$('corpus-status').textContent='';rows=data.rows;const unread=unreadPrompts(previous,rows,data.summary);$('unread-count').textContent='Prompts à relire localement : '+(unread.unknown?'au moins ':'')+format(unread.count)+(unread.unknown?' · total inconnu':'');$('unread-count').dataset.pending=String(unread.count>0||unread.unknown);await rulesController?.run();facetsDirty=true;searchRevision++;selected=new Set([...selected].filter(key=>rows.some(r=>r.key===key)));const provider=$('provider').value;$('provider').replaceChildren(new Option('Plateforme',''));for(const p of [...new Set(rows.map(r=>r.provider).filter(Boolean))].sort()){const option=new Option(p,p);option.dataset.provider=p;$('provider').append(option);}$('provider').value=provider;render();if(active){const next=rows.find(r=>r.key===active.key);if(next)await choose(next);else {active=null;$('record').hidden=true;$('empty').hidden=false;}}$('source-status').textContent=data.summary.errors.length?'Sources partielles — '+data.summary.errors.map(e=>e.source+' : '+e.message).join(' · '):'';refreshState(refresh&&!data.summary.errors.length?'fresh':'stale');}catch(e){$('unread-count').textContent='Prompts à relire localement : '+(previous.length?format(previous.filter(r=>r.kind==='prompt').length):'inconnu');$('unread-count').dataset.pending='true';refreshState('stale');notify(e);}}
$('refresh').onclick=()=>load(true);
startExplorer();

$('annotation').addEventListener('input',()=>{dirty=true;retainDraft();$('annotation-status').textContent='Brouillon conservé · à enregistrer';});
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.pm!=='refresh-annotations'||!rows.length)return;facetsDirty=true;searchRevision++;render();if(active&&!dirty)fillAnnotation();});


function setupFolderDrop(element,path){
 element.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';element.classList.add('drag-over');};
 element.ondragleave=()=>element.classList.remove('drag-over');
 element.ondrop=e=>{
  e.preventDefault();element.classList.remove('drag-over');
  const key=e.dataTransfer.getData('text/plain');
  const dragged=key?rows.find(r=>r.key===key):null;
  const targets=dragged?(selected.size?rows.filter(r=>selected.has(r.key)):[dragged]):[];
  if(!targets.length){notify('Aucun élément à déposer.');return;}
  if(dirty&&targets.some(r=>r.key===active?.key)){notify('Enregistre la fiche en cours avant ce classement.');return;}
  if(!saved){notify('Stockage indisponible.');return;}
  const next={...saved};
  for(const r of targets){
   const folders=[...(annotation(r).folders||[])];
   if(!folders.includes(path))folders.push(path);
   folders.sort();
   next[r.key]={...(saved[r.key]||{}),folders,_manual:[...new Set([...(saved[r.key]?._manual||[]),'folders'])]};
  }
  localStorage.setItem(storageKey,JSON.stringify(next));saved=next;facetsDirty=true;searchRevision++;
  render();if(active)fillAnnotation();notify(targets.length+' élément(s) déposé(s) dans '+path+'.');
 };
}
function renderExplorer(){
 const sourceNav=$('source-nav');sourceNav.replaceChildren();
 for(const provider of [...new Set(rows.map(r=>r.provider).filter(Boolean))].sort()){const button=document.createElement('button');button.className='rail-item';button.dataset.sourceView=provider;button.dataset.provider=provider;const name=document.createElement('span');name.textContent=provider;const count=document.createElement('span');count.textContent=rows.filter(r=>r.provider===provider).length;button.append(name,count);button.onclick=()=>{$('provider').value=$('provider').value===provider?'':provider;render();};button.setAttribute('aria-pressed',String($('provider').value===provider));sourceNav.append(button);}
 const scope=rows.filter(r=>!$('kind').value||r.kind===$('kind').value);
 const items=scope.map(annotation),project=$('project-filter').value;
 $('project-filter').replaceChildren(new Option('Projet',''));
 for(const name of [...new Set(scope.map(r=>r.project).filter(Boolean))].sort())$('project-filter').append(new Option(name,name));
 $('project-filter').value=project;
 $('folder-tree').replaceChildren();
 function branch(nodes,container){for(const node of [...nodes.values()].sort((a,b)=>a.name.localeCompare(b.name))){
   const button=document.createElement('button');button.textContent=node.name;button.className='facet';button.dataset.folder=node.path;button.setAttribute('aria-pressed',String(explorerFolder===node.path));button.onclick=()=>{explorerFolder=explorerFolder===node.path?'':node.path;limit=100;render();};setupFolderDrop(button,node.path);
   if(node.children.size){const fold=document.createElement('details'),summary=document.createElement('summary');fold.open=expandedFolders.has(node.path);summary.append(button);button.onclick=e=>{e.preventDefault();explorerFolder=explorerFolder===node.path?'':node.path;expandedFolders.add(node.path);fold.open=true;limit=100;render();};setupFolderDrop(fold,node.path);fold.append(summary);fold.ontoggle=()=>{fold.open?expandedFolders.add(node.path):expandedFolders.delete(node.path);};branch(node.children,fold);container.append(fold);}else container.append(button);
 }}branch(folderTree(items),$('folder-tree'));
 for(const [prefix,id] of [['#','theme-list'],['@','mention-list']]){
  $(id).replaceChildren();for(const tag of [...new Set(items.flatMap(a=>a.tags||[]).filter(t=>t.startsWith(prefix)))].sort()){
   const button=document.createElement('button');button.className='facet';button.dataset.tag=tag;button.textContent=tag;button.setAttribute('aria-pressed',String(explorerTag===tag));button.onclick=()=>{explorerTag=explorerTag===tag?'':tag;limit=100;render();};$(id).append(button);
  }if(!$(id).childElementCount)$(id).textContent='Aucun tag';
 }
 if(!$('folder-tree').childElementCount)$('folder-tree').textContent='Aucun dossier classé';
}
function organize(action,value,one=false){try{
 const targets=one?(active?[active]:[]):rows.filter(r=>selected.has(r.key));
 if(!targets.length)throw Error('Sélectionne au moins un résultat.');
 if(dirty&&targets.some(r=>r.key===active?.key))throw Error('Enregistre la fiche en cours avant cette action ; son brouillon est conservé.');
 if(!saved)throw Error('Stockage indisponible.');
 if((action==='tags'||action==='folders')&&!String(value).trim())throw Error('Saisis les tags ou les dossiers à ajouter.');
 const next={...saved};const field=action==='tags'?'tags':action==='folders'?'folders':action;for(const r of targets){const updated=updatedAnnotation(annotation(r),action,value);next[r.key]={...(saved[r.key]||{}),[field]:updated[field],_manual:[...new Set([...(saved[r.key]?._manual||[]),field])]};}
 localStorage.setItem(storageKey,JSON.stringify(next));saved=next;facetsDirty=true;searchRevision++;
 render();if(active)fillAnnotation();notify(targets.length+' élément(s) mis à jour. Sources conservées.');return true;
 }catch(e){notify(e);return false;}}
function setVisibility(r,state){try{const old=saved?.[r.key]||{};const updated=updatedAnnotation(annotation(r),'visibility',state);persist(r.key,{...old,visibility:updated.visibility,_manual:[...new Set([...(old._manual||[]),'visibility'])]});notify('Élément '+state);}catch(e){notify(e);}}
function startExplorer(){
 $('reset-explorer').onclick=()=>{explorerFolder='';explorerTag='';$('project-filter').value='';$('search').value='';limit=100;render();};
 for(const [suffix,state] of [['hide','hidden'],['archive','archived'],['restore','active']]){
  $('bulk-'+suffix).onclick=()=>organize('visibility',state);
  $('record-'+suffix).onclick=()=>organize('visibility',state,true);
 }
 $('apply-color').onclick=()=>organize('color',$('bulk-color').value);
 $('bulk-tags').onclick=()=>organize('tags',$('bulk-value').value);
 $('bulk-folders').onclick=()=>organize('folders',$('bulk-value').value);
 $('manage-favorite-tags').onclick=openFavoriteTagsDialog;
 $('add-favorite-tag').onclick=()=>{if(favoriteTags.length>=10){notify('10 tags favoris maximum.');return;}favoriteTags.push({tag:'',color:'#409cff'});renderFavoriteTagsDialog();};
 $('favorite-tags-form').onsubmit=e=>{e.preventDefault();favoriteTags=favoriteTags.filter(t=>t.tag.trim());saveFavoriteTags();renderFavoriteTags();$('favorite-tags-dialog').close();notify('Tags favoris sauvegardés.');};
 $('close-favorite-tags').onclick=()=>{$('favorite-tags-dialog').close();};
}

function updateFacets(){
 for(const button of document.querySelectorAll('[data-folder]'))button.setAttribute('aria-pressed',String(button.dataset.folder===explorerFolder));
 for(const button of document.querySelectorAll('[data-tag]'))button.setAttribute('aria-pressed',String(button.dataset.tag===explorerTag));
 const box=$('active-filters');box.replaceChildren();
 for(const [label,clear] of [[explorerFolder?('Dossier : '+explorerFolder):'',()=>explorerFolder=''],[explorerTag,()=>explorerTag='']]){
  if(!label)continue;const button=document.createElement('button');button.textContent=label+' ×';button.setAttribute('aria-label','Retirer le filtre '+label);button.onclick=()=>{clear();render();};box.append(button);
 }box.hidden=!box.childElementCount;
}

function resetBoolean(){
 if(booleanSignature){booleanRun++;clearTimeout(booleanTimer);booleanEngine.cancel();booleanSignature='';booleanKeys=new Set();}
 booleanPending=false;searchTerms=[];matchedVariants=new Map();$('boolean-status').textContent='';if(detail)paint();
}
function ensureBoolean(query,kind){
 const booleanMode=$('search-mode').value==='boolean';
 const signature=JSON.stringify([query,kind,searchRevision,$('full-text').checked,booleanMode]);if(signature===booleanSignature)return;
 booleanSignature=signature;booleanKeys=new Set();booleanPending=true;
 const run=++booleanRun;clearTimeout(booleanTimer);booleanEngine.cancel();$('boolean-status').textContent='Recherche…';
 booleanTimer=setTimeout(async()=>{try{
  const useContent=$('full-text').checked;
  const content=useContent?await loadCorpus():[];if(run!==booleanRun)return;
  // Mode simple + full-text : recherche JS sans WASM
  if(!booleanMode&&useContent){
   const terms=query.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().split(/\s+/).filter(Boolean);
   matchedVariants=new Map();booleanKeys=new Set();
   for(const entry of content){
    const hay=(entry.text||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
    if(terms.every(t=>hay.includes(t))){booleanKeys.add(entry.key);if(!matchedVariants.has(entry.key))matchedVariants.set(entry.key,entry);}
   }
   searchTerms=terms.map(t=>({op:'term',value:t}));booleanPending=false;$('boolean-status').textContent='Texte · '+booleanKeys.size+' résultat(s)';render();if(detail)paint();return;
  }
  const scope=rows.filter(r=>!kind||r.kind===kind),byKey=new Map(scope.map(r=>[r.key,r]));
  const documents=[],candidates=new Map();
  if(useContent){for(const entry of content){const row=byKey.get(entry.key);if(!row)continue;const d=booleanDocument(row,annotation(row));d.Key=JSON.stringify([entry.key,entry.variant]);d.Fields.push(entry.text.slice(0,8000));documents.push(d);candidates.set(d.Key,entry);}}
  else for(const row of scope)documents.push(booleanDocument(row,annotation(row)));
  const keys=await booleanEngine.search(query,documents);if(run!==booleanRun)return;
  searchTerms=keys.terms||[];matchedVariants=new Map();booleanKeys=new Set();
  for(const key of keys){if(useContent){const entry=candidates.get(key);booleanKeys.add(entry.key);if(!matchedVariants.has(entry.key))matchedVariants.set(entry.key,entry);}else booleanKeys.add(key);}
  booleanPending=false;$('boolean-status').textContent='NyxBoolean · '+booleanKeys.size+' correspondance(s) avant filtres';render();if(detail)paint();
 }catch(error){if(run!==booleanRun)return;booleanPending=false;searchTerms=[];$('boolean-status').textContent=error.message;render();}},220);
}
function appendMarked(container,text){for(const part of segments(text,searchRanges(text,searchTerms))){if(part.types.length){const mark=document.createElement('mark');mark.className='search-hit';mark.textContent=part.text;container.append(mark);}else container.append(document.createTextNode(part.text));}}
function simpleSearchTerms(query){return (String(query||'').match(/-?"[^"]*"|\S+/g)||[]).filter(v=>!v.startsWith('-')).map(v=>({op:v.startsWith('"')?'phrase':'term',value:v.replace(/^"|"$/g,'')})).filter(v=>v.value);}
function occurrenceCount(r,a,terms){
 if(!terms.length)return 0;
 const variant=matchedVariants.get(r.key);
 const text=variant?.text||[r.title,r.project,...(a.tags||[]),...(a.folders||[]),a.note].join(' ');
 return searchRanges(text,terms).length;
}
function addBadges(container,tags){for(const tag of tags){const badge=document.createElement('button');badge.className='tag-badge';badge.textContent=tag;badge.setAttribute('aria-label','Filtrer par '+tag);badge.onclick=()=>{explorerTag=tag;render();};container.append(badge);}}
async function loadCorpus(){
 if(corpus)return corpus;if(corpusPromise)return corpusPromise;
 const epoch=corpusEpoch,generation=corpusGeneration;
 corpusPromise=(async()=>{const documents=[];let offset=0,failed=0,total=0;
  do{const response=await fetch('/api/workspace/corpus?'+new URLSearchParams({generation,offset}));if(!response.ok)throw Error('Lecture du contenu interrompue : Actualiser pour réessayer.');const page=await response.json();if(epoch!==corpusEpoch)throw Error('Sources actualisées.');documents.push(...page.documents);failed+=page.errors.length;offset=page.next;total=page.total;$('corpus-status').textContent='Lecture des textes : '+documents.length+' / '+total+' versions…';}while(offset!==null);
  corpus=documents;$('corpus-status').textContent='Texte disponible : '+documents.length+' / '+total+' versions'+(failed?' · '+failed+' erreur(s) de lecture':'')+'. Couverture limitée aux sources chargées.';return documents;
 })().catch(error=>{if(epoch===corpusEpoch)corpusPromise=null;throw error;});
 return corpusPromise;
}

let outputItems=[],outputWarnings=[],outputScanRunning=false,outputLimit=20,outputScanEpoch=0;
$('show-output-scan').onclick=()=>{document.querySelector('.desk').hidden=true;$('output-view').hidden=false;if(!outputItems.length&&!outputScanRunning)scanOutputs();};
$('back-explorer').onclick=()=>{$('output-view').hidden=true;document.querySelector('.desk').hidden=false;};
$('rescan-outputs').onclick=()=>scanOutputs();
$('output-query').oninput=()=>{outputLimit=20;renderOutputs();};$('output-files-only').onchange=()=>{outputLimit=20;renderOutputs();};
$('more-outputs').onclick=()=>{outputLimit+=20;renderOutputs();};
async function scanOutputs(){
 if(!corpusGeneration){$('output-progress').textContent='Attends le chargement des sources, puis relance le scan.';return;}
 const epoch=++outputScanEpoch,generation=corpusGeneration;outputScanRunning=true;outputItems=[];outputWarnings=[];outputLimit=20;$('output-results').replaceChildren();$('rescan-outputs').disabled=true;
 let offset=0;
 try{do{
  const response=await fetch('/api/workspace/outputs?'+new URLSearchParams({generation,offset}));if(!response.ok)throw Error('Scan interrompu : actualise les sources puis relance le scan.');const page=await response.json();if(epoch!==outputScanEpoch)return;
  outputItems.push(...page.items);outputWarnings.push(...page.warnings);offset=page.next;
  $('output-progress').textContent='Scan : '+(offset??page.total)+' / '+page.total+' conversations · '+outputItems.length+' réponses';if(outputItems.length===page.items.length)renderOutputs();
 }while(offset!==null);
 $('output-progress').textContent=outputItems.length+' réponses · '+outputItems.filter(p=>!p.prompt).length+' sans prompt identifiable · '+outputItems.reduce((n,p)=>n+p.files.length,0)+' références (fichiers/liens) · '+outputWarnings.length+' version(s) non associable(s). Sources limitées au catalogue chargé.';renderOutputs();
 }catch(e){$('output-progress').textContent=e.message+' '+outputItems.length+' réponses déjà lues.';}finally{if(epoch===outputScanEpoch){outputScanRunning=false;$('rescan-outputs').disabled=false;}}
}
function outputText(container,text,query){const terms=query?[{op:'phrase',value:query}]:[];for(const part of segments(text,searchRanges(text,terms))){const node=part.types.length?document.createElement('mark'):document.createTextNode(part.text);if(part.types.length){node.className='search-hit';node.textContent=part.text;}container.append(node);}}
function renderOutputs(){
 const query=$('output-query').value.trim(),q=query.toLocaleLowerCase();
 const found=outputItems.filter(p=>(!$('output-files-only').checked||p.files.length)&&(!q||[p.prompt,p.output,p.title,...p.files.map(f=>f.reference)].join(' ').toLocaleLowerCase().includes(q)));
 $('output-results').replaceChildren();
 for(const pair of found.slice(0,outputLimit)){
  const card=document.createElement('article');card.className='output-card';
  const meta=document.createElement('p');meta.className='hint';meta.textContent=pair.title+' · '+pair.source+' · version '+(pair.variant+1)+' · tour '+pair.turn+' · '+pair.basis;card.append(meta);
  const title=document.createElement('h3');title.textContent='Prompt';const prompt=document.createElement('pre');outputText(prompt,pair.prompt||'Prompt absent de cette archive.',query);card.append(title,prompt);
  const fold=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Output · réponse de l’IA';fold.open=!!q;fold.append(summary);const response=document.createElement('pre');outputText(response,pair.output,query);fold.append(response);card.append(fold);
  if(pair.files.length){const title=document.createElement('h4');title.textContent='Fichiers et liens cités';card.append(title);for(const file of pair.files){const line=document.createElement('p');line.className='output-file';line.textContent=file.reference+' — '+file.status;card.append(line);}}
  const button=document.createElement('button');button.textContent='Ouvrir la conversation source';button.onclick=async()=>{const row=rows.find(r=>r.key===pair.key);if(!row)return;$('back-explorer').click();$('search').value='';$('kind').value='';$('provider').value='';$('visibility').value='all';explorerFolder='';explorerTag='';$('project-filter').value='';facetsDirty=true;render();await choose(row);$('versions').value=pair.variant;await readDetail();};card.append(button);
  $('output-results').append(card);
 }
 if(!found.length&&!outputScanRunning)$('output-results').textContent='Aucun output pour ces critères.';
 $('more-outputs').hidden=found.length<=outputLimit;
}

function attachmentMeta(a){
 const mime=String(a?.mime||'').toLowerCase();
 const name=String(a?.name||'').toLowerCase();
 if(/^image\//.test(mime)||/\.(png|jpe?g|webp|gif|bmp|svg|avif|heic)(\.[^.]*)?$/.test(name))return {kind:'image',label:'Image',icon:'🖼',className:'file-icon-image'};
 if(/^(application|text)\//.test(mime)||/\.(pdf|docx?|xlsx?|pptx?|md|txt|csv|json|xml|yaml|yml|rtf|odt|ods|odp)(\.[^.]*)?$/.test(name))return {kind:'document',label:'Document',icon:'📄',className:'file-icon-document'};
 return {kind:'other',label:'Fichier',icon:'📎',className:'file-icon-other'};
}
function buildAttachmentStats(attachments){
 const counts={image:0,document:0,other:0};
 for(const a of attachments)counts[attachmentMeta(a).kind]=(counts[attachmentMeta(a).kind]||0)+1;
 return Object.entries(counts).filter(([,count])=>count>0).map(([kind,count])=>`${count} ${kind}`).join(' · ');
}

const inspectorTabs=[...document.querySelectorAll('[data-inspector]')];
function inspectorTab(name){for(const t of inspectorTabs){const on=t.dataset.inspector===name;t.setAttribute('aria-selected',on);t.tabIndex=on?0:-1;$('pane-'+t.dataset.inspector).hidden=!on;}}
inspectorTabs.forEach((t,i)=>{t.onclick=()=>inspectorTab(t.dataset.inspector);t.onkeydown=e=>{const n=e.key==='ArrowRight'?(i+1)%3:e.key==='ArrowLeft'?(i+2)%3:e.key==='Home'?0:e.key==='End'?2:-1;if(n>=0){e.preventDefault();inspectorTabs[n].click();inspectorTabs[n].focus();}};});
$('open-capture').onclick=()=>{if(parent!==window)parent.postMessage({pm:'workspace-action',action:'capture'},location.origin);else location.assign('/?capture=1');};
$('install-capture').onclick=()=>{if(parent!==window)parent.postMessage({pm:'workspace-action',action:'bookmarklet'},location.origin);else location.assign('/capture?install=1');};
for(const button of document.querySelectorAll('[data-original]'))button.onclick=()=>{if(parent!==window)parent.postMessage({pm:'workspace-action',action:button.dataset.original},location.origin);else notify('Ouvre le cockpit pour accéder aux outils d’origine.');};
const viewFields=['search','search-mode','full-text','kind','provider','sort','has-content','visibility','project-filter','date-from','date-to','filter-status'];
const viewsKey='promptmistress.workspace.views.v1';
let views={},viewsValid=true;try{views=JSON.parse(localStorage.getItem(viewsKey)||'{}');if(!views||typeof views!=='object'||Array.isArray(views))throw Error();}catch{viewsValid=false;notify('Vues illisibles : stockage conservé.');}
function renderViews(){const previous=$('saved-views').value;$('saved-views').replaceChildren(new Option('Vue',''));for(const name of Object.keys(views))$('saved-views').append(new Option(name,name));$('saved-views').value=previous;}
function saveViews(){if(!viewsValid)throw Error('Vues illisibles : enregistrement bloqué.');localStorage.setItem(viewsKey,JSON.stringify(views));renderViews();}
$('save-view').onclick=()=>{try{const name=$('view-name').value.trim();if(!name)throw Error('Donne un nom à la vue.');views={...views,[name]:{fields:Object.fromEntries(viewFields.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value])),folder:explorerFolder,tag:explorerTag}};saveViews();$('saved-views').value=name;notify('Vue enregistrée.');}catch(e){notify(e);}};
$('saved-views').onchange=()=>{const v=views[$('saved-views').value];if(!v)return;for(const id of viewFields){if(v.fields?.[id]!==undefined){if($(id).type==='checkbox')$(id).checked=!!v.fields[id];else $(id).value=v.fields[id];}}explorerFolder=v.folder||'';explorerTag=v.tag||'';limit=100;facetsDirty=true;render();};
$('delete-view').onclick=()=>{try{const name=$('saved-views').value;const next={...views};delete next[name];views=next;saveViews();}catch(e){notify(e);}};renderViews();
const md=value=>String(value??'').replace(/[\[\]\\]/g,'\\$&').replace(/\r?\n/g,' ');
$('export-index').onclick=()=>{try{const targets=selected.size?rows.filter(r=>selected.has(r.key)):active?[active]:[];if(!targets.length)throw Error('Sélectionne au moins un élément.');const fields=[...document.querySelectorAll('#index-fields input:checked')].map(e=>e.value),lines=['# PromptMistress — Index',''];for(const r of targets){const a=annotation(r);lines.push('## '+md(r.title),'');for(const field of fields){const value=field==='source'?r.variants.find(v=>v.sourceURL)?.sourceURL:a[field]??r[field];if(!value)continue;lines.push('- '+field+' : '+(field==='source'&&/^(https?:|codex:|promptvault:)/.test(value)?'[Ouvrir la source](<'+String(value).replace(/[<>\r\n]/g,'')+'>)':md(Array.isArray(value)?value.join(', '):value)));}lines.push('');}download(exportName(targets,'md','Index'),lines.join('\n'),'text/markdown');$('index-summary').textContent=targets.length+' élément(s) exporté(s).';}catch(e){notify(e);}};
const ruleChoices={color:[['blue','Bleu'],['green','Vert'],['yellow','Jaune'],['pink','Rose']],status:[['fini','Fini'],['classe','Classé'],['en-retard','En retard'],['urgent','Urgent']],priority:[['essentielle','Essentiel'],['prioritaire','Priorité'],['important','Important'],['a-faire','À faire'],['futile','Futile'],['inutile','Inutile']]};
$('rule-action').onchange=()=>{const values=ruleChoices[$('rule-action').value],input=$('rule-actionValue'),select=$('rule-choice');input.type=values?'hidden':'text';input.required=!values;select.hidden=!values;if(values){const previous=input.value;select.replaceChildren(...values.map(([v,label])=>new Option(label,v)));if(values.some(([v])=>v===previous))select.value=previous;input.value=select.value;}else input.placeholder=$('rule-action').value==='tags'?'#recherche @client':'Travail/Recherche';$('rule-values').textContent=values?'':$('rule-action').value==='tags'?'Tags précédés de # ou @.':'Dossiers virtuels séparés par une virgule.';};
$('rule-choice').onchange=()=>{$('rule-actionValue').value=$('rule-choice').value;};$('rule-action').onchange();
rulesController=setupRules({rows:()=>rows,manual:manualAnnotation,corpus:loadCorpus,notify,changed:()=>{facetsDirty=true;searchRevision++;render();if(active&&!dirty)fillAnnotation();}});
load(true);

for(const b of document.querySelectorAll('[data-kind-view]'))b.onclick=()=>{$('kind').value=b.dataset.kindView;limit=100;facetsDirty=true;render();};

function toggleClean(){view.options.clean=!view.options.clean;try{saveView(view);}catch(error){notify(error);}$('reader-menu').hidden=true;}
function toggleMetadata(){showMetadata=!showMetadata;paint();$('reader-menu').hidden=true;}
$('clean-view').onclick=toggleClean;$('menu-clean').onclick=toggleClean;
$('reader-raw').onclick=toggleMetadata;$('menu-meta').onclick=toggleMetadata;
let tagOne=false;
function openReaderMenu(e,one=false){tagOne=one;const menu=$('reader-menu');menu.hidden=false;menu.style.left=Math.max(0,Math.min(e.clientX,innerWidth-260))+'px';menu.style.top=Math.max(0,Math.min(e.clientY,innerHeight-180))+'px';menu.querySelector('button').focus();}
$('body').oncontextmenu=e=>{e.preventDefault();openReaderMenu(e,true);};
$('explorer').oncontextmenu=e=>{e.preventDefault();openReaderMenu(e,false);};
document.addEventListener('click',e=>{if(!$('reader-menu').contains(e.target))$('reader-menu').hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('reader-menu').hidden=true;});
for(const b of document.querySelectorAll('[data-add-tag]'))b.onclick=()=>{
 if(!b.closest('#reader-menu'))tagOne=!selected.size;
 if((tagOne&&!active)||(!tagOne&&!selected.size&&!active)){notify('Sélectionne un élément ou coche plusieurs lignes pour les classer.');return;}
 if(!selected.size)tagOne=true;
 $('reader-menu').hidden=true;$('tag-target').textContent=tagOne?active.title:selected.size+' éléments sélectionnés';$('quick-tag-value').value=b.dataset.addTag;$('tag-dialog').showModal();$('quick-tag-value').focus();
};
$('cancel-tag').onclick=()=>$('tag-dialog').close();
$('quick-tag').onsubmit=e=>{e.preventDefault();try{parseTags($('quick-tag-value').value);if(organize('tags',$('quick-tag-value').value,tagOne))$('tag-dialog').close();}catch(error){notify(error);}};

function updateView(){view=loadView();applyViewOptions(view);$('clean-view').setAttribute('aria-pressed',String(view.options.clean));render();}
window.addEventListener('pm-view-change',updateView);window.addEventListener('storage',e=>{if(e.key===viewKey)updateView();});
const fillViewSettings=mountViewSettings($('local-view-preferences'));
$('view-settings-open').onclick=()=>{if(parent!==window)parent.postMessage({pm:'workspace-action',action:'preferences'},location.origin);else{fillViewSettings();$('view-dialog').showModal();}};
$('view-dialog-close').onclick=()=>$('view-dialog').close();
$('legacy-tools').onclick=()=>{if(parent!==window)parent.postMessage({pm:'workspace-action',action:'tools'},location.origin);else location.assign('/');};
for(const button of document.querySelectorAll('.top-menu button'))button.addEventListener('click',()=>button.closest('details').open=false);

function renderAttachments(d){
 const box=$('attachments');
 box.replaceChildren();
 const files=d.attachments||[];
 if(!files.length)return;
 const title=document.createElement('h3');
 const stats=buildAttachmentStats(files);
 title.textContent='Version + · Pièces jointes'+(stats?` (${stats})`:'');
 box.append(title);
 for(const a of files){
  const info=attachmentMeta(a);
  const line=document.createElement('p');
  line.className='attachment-line';
  const pill=document.createElement('span');
  pill.className='file-icon '+info.className;
  pill.textContent=`${info.icon} ${info.label}`;
  line.append(pill);
  if(a.status==='downloaded'){
   const link=document.createElement('a');
   link.textContent=' · '+a.name+' · '+Math.ceil(a.size/1024)+' Ko ↓';
   link.href='/api/attachment?'+new URLSearchParams({conversation:d.sourceURL,hash:a.hash});
   line.append(link);
  }else{
   line.append(document.createTextNode(' · '+a.name+' — '+(a.reason||'Non récupéré')));
  }
  box.append(line);
 }
}

let corpusTargets=[],corpusBusy=false;
function openCorpusExport(){
 corpusTargets=rows.filter(r=>selected.has(r.key));
 if(!corpusTargets.length&&active)corpusTargets=[active];
 if(!corpusTargets.length){notify('Sélectionne au moins un élément ou ouvre une fiche.');return;}
 const visibleKeys=new Set(visible.map(r=>r.key)),outside=corpusTargets.filter(r=>!visibleKeys.has(r.key)).length;
 $('corpus-scope').textContent=corpusTargets.length+' élément(s) '+(selected.size?'sélectionné(s)':'depuis la fiche ouverte')+(outside?' — dont '+outside+' hors des filtres actuels.':'.');
 $('corpus-progress').textContent='';$('corpus-dialog').showModal();
}
$('export-selection').onclick=openCorpusExport;
const topExport=$('top-export');if(topExport)topExport.onclick=openCorpusExport;
$('corpus-close').onclick=()=>{if(!corpusBusy)$('corpus-dialog').close();};
$('corpus-dialog').addEventListener('cancel',e=>{if(corpusBusy)e.preventDefault();});
$('corpus-download').onclick=async()=>{
 if(corpusBusy)return;corpusBusy=true;
 for(const id of ['corpus-download','corpus-close','corpus-content','corpus-format','corpus-variants'])$(id).disabled=true;
 try{const ok=await exportSelection($('corpus-format').value,{targets:corpusTargets.slice(),mode:$('corpus-content').value,allVariants:$('corpus-variants').checked,progress:(n,total)=>{$('corpus-progress').textContent='Préparation : '+n+' / '+total+' éléments…';},error:message=>{$('corpus-progress').textContent=message;}});if(ok)$('corpus-progress').textContent='Téléchargement lancé — '+corpusTargets.length+' élément(s).';}
 finally{corpusBusy=false;for(const id of ['corpus-download','corpus-close','corpus-content','corpus-format','corpus-variants'])$(id).disabled=false;}
};
