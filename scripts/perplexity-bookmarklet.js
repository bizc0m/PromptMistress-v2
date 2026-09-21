(function(){
 if(!['perplexity.ai','www.perplexity.ai'].includes(location.hostname)){alert('Lancez ce favori sur Perplexity.');return;}
 const existing=document.getElementById('pm-capture-panel');if(existing){existing.remove();return;}
 const PM='http://127.0.0.1:18431';
 const host=document.createElement('div');host.id='pm-capture-panel';document.body.appendChild(host);
 const ui=host.attachShadow({mode:'open'});
 ui.innerHTML=`<style>
:host{all:initial;--ink-0:#07070B;--ink-1:#101017;--ink-2:#171820;--ink-3:#20222C;--ink-4:#30323D;--bone-0:#F2F2F5;--bone-1:#C4C5CA;--bone-2:#92949C;--sel:#409CFF;--red:#FF453A;position:fixed;inset:auto 20px 20px auto;z-index:2147483647;font:13px/1.5 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:var(--bone-0);color-scheme:dark}
*{box-sizing:border-box}.panel{background:var(--ink-0);border:1px solid var(--ink-4);border-radius:10px;box-shadow:0 20px 60px #0009;width:420px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden}
.bar{display:flex;gap:6px;align-items:center;padding:7px 10px;background:var(--ink-1);border-bottom:1px solid var(--ink-4);flex-shrink:0}
h1{font:600 12px ui-monospace,monospace;margin:0;flex:1;color:var(--sel)}.bar h1::before{content:'PM '}
button{font:inherit;padding:5px 9px;cursor:pointer;border:1px solid var(--ink-4);border-radius:6px;background:var(--ink-2);color:var(--bone-1);font-size:12px}
button:hover:not(:disabled){background:var(--ink-3);color:var(--bone-0)}button:disabled{opacity:.4;cursor:default}
button:focus-visible{outline:2px solid var(--sel);outline-offset:2px}
#import-btn{background:#0A84FF;color:#fff;border-color:#409CFF}#import-btn:hover:not(:disabled){background:#0873dc}
input[type=search]{flex:1;padding:6px 9px;border:1px solid var(--ink-4);border-radius:6px;background:var(--ink-2);color:var(--bone-0);font:inherit;font-size:12px}
input::placeholder{color:var(--bone-2)}input[type=checkbox]{accent-color:var(--sel);width:13px;height:13px;flex:none;cursor:pointer}
#list{overflow-y:auto;flex:1;background:var(--ink-1)}
label{display:flex;gap:9px;padding:7px 10px;border-bottom:1px solid var(--ink-3);align-items:center;cursor:pointer;min-height:34px}
label:hover{background:var(--ink-2)}label:has(input:checked){background:#409cff12;box-shadow:inset 2px 0 var(--sel)}
label span{flex:1;overflow-wrap:anywhere;font-size:12px;color:var(--bone-1)}label:has(input:checked) span{color:var(--bone-0)}
label small{color:var(--bone-2);font-size:11px;white-space:nowrap}label.done small{color:#30d158}label.skip small{color:var(--bone-2);opacity:.6}
#status{padding:8px 10px;font-size:12px;color:var(--bone-1);background:var(--ink-0);border-top:1px solid var(--ink-4);flex-shrink:0;white-space:pre-wrap;max-height:60px;overflow-y:auto}
#progress{height:3px;background:var(--sel);width:0%;transition:width .3s;flex-shrink:0}
small.count{color:var(--bone-2);font-size:11px;padding:4px 10px;display:block;border-bottom:1px solid var(--ink-3)}
</style>
<div class="panel" role="dialog" aria-label="PM Capturer Perplexity">
 <div class="bar"><h1>Capturer Perplexity</h1><button id="close-btn">✕</button></div>
 <div class="bar"><input id="search" type="search" placeholder="Filtrer les titres…"><button id="all-btn">Tout</button><button id="none-btn">Aucun</button></div>
 <small class="count" id="count">Chargement…</small>
 <div id="list"></div>
 <div id="progress"></div>
 <div id="status">Connexion à PromptMistress…</div>
 <div class="bar"><button id="capture-btn" disabled>Capturer + Importer</button><button id="stop-btn">Arrêter</button><button id="import-btn" disabled>Réessayer import</button></div>
</div>`;

 const $=id=>ui.getElementById(id);
 const rows=new Map(),received=new Map(),known=new Set();
 let busy=false,stopped=false,controller=null,captureToken='';
 const delay=()=>new Promise(r=>setTimeout(r,1000));

 function setStatus(t){$('status').textContent=t;}
 function setProgress(n,total){$('progress').style.width=total?Math.round(n/total*100)+'%':'0%';}
 function updateCount(){$('count').textContent=rows.size+' recherches · '+[...rows.keys()].filter(id=>!known.has(id)).length+' nouvelles · '+[...ui.querySelectorAll('#list input:checked')].length+' sélectionnées · '+received.size+' textes reçus';}
 function render(){
  const q=$('search').value.toLowerCase();$('list').replaceChildren();let shown=0;
  for(const r of rows.values()){
   if(!r.title.toLowerCase().includes(q))continue;shown++;
   const label=document.createElement('label'),box=document.createElement('input'),span=document.createElement('span'),note=document.createElement('small');
   box.type='checkbox';box.checked=!known.has(r.id)&&!busy;
   if(busy)box.disabled=true;
   box.onchange=updateCount;
   span.textContent=r.title;
   const imp=received.get(r.id);
   if(imp?.imported){label.classList.add('done');note.textContent='✓ importé';}
   else if(imp?.skipped){label.classList.add('skip');note.textContent='déjà présent';}
   else if(received.has(r.id)){note.textContent='texte reçu';}
   else if(known.has(r.id)){label.classList.add('skip');note.textContent='déjà dans vault';box.checked=false;}
   else{note.textContent='à récupérer';}
   label.dataset.id=r.id;label.append(box,span,note);$('list').append(label);
  }
  if(!shown)$('list').textContent=rows.size?'Aucun résultat.':'En attente de la liste…';
  $('capture-btn').disabled=busy;
  $('import-btn').disabled=busy||!received.size;
  updateCount();
 }

 $('close-btn').onclick=()=>host.remove();
 $('all-btn').onclick=()=>{for(const b of ui.querySelectorAll('#list input'))if(!b.disabled)b.checked=true;updateCount();};
 $('none-btn').onclick=()=>{for(const b of ui.querySelectorAll('#list input'))b.checked=false;updateCount();};
 $('search').oninput=render;
 $('stop-btn').onclick=()=>{stopped=true;controller?.abort();setStatus('Arrêt demandé.');busy=false;render();};

 async function api(url,body){
  controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
  try{const r=await fetch(url,{credentials:'same-origin',signal:controller.signal,...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}
  finally{clearTimeout(timer);}
 }

 async function listThreads(){
  busy=true;stopped=false;render();setStatus('Liste des recherches…');
  try{
   for(let offset=0;!stopped;offset+=100){
    const d=await api('/rest/thread/list_ask_threads?version=2.18&source=default',{limit:100,offset,ascending:false,search_term:'',exclude_asi:false});
    const items=Array.isArray(d)?d:d.data||d.threads||[];
    if(!Array.isArray(items)||!items.length)break;
    let added=0;for(const t of items){const id=t.slug||t.uuid||t.url_slug||t.id;if(typeof id!=='string'||rows.has(id))continue;rows.set(id,{id,title:String(t.title||t.query||t.name||id)});added++;}
    render();if(!added||items.length<100)break;
    await delay();
   }
  }catch(e){if(!stopped)setStatus('Erreur liste : '+e.message);}
  // Compléter avec les liens visibles dans la page
  for(const a of document.querySelectorAll('a[href*="/search/"]')){try{const u=new URL(a.href);if(u.origin===location.origin&&u.pathname.startsWith('/search/')){const id=decodeURIComponent(u.pathname.slice(8));if(id&&!rows.has(id))rows.set(id,{id,title:a.textContent.trim()||id});}}catch{}}
  busy=false;render();
  setStatus((stopped?'Liste interrompue':'Liste chargée')+' · '+rows.size+' recherches. Sélectionnez puis capturez.');
 }

 $('capture-btn').onclick=async()=>{
  if(busy)return;busy=true;stopped=false;render();
  const ids=[...ui.querySelectorAll('#list input:checked')].map(b=>b.closest('label').dataset.id).filter(Boolean).filter(id=>!received.has(id));
  setStatus('Capture de '+ids.length+' recherche(s)…');setProgress(0,ids.length);
  let done=0;
  for(const id of ids){
   if(stopped)break;
   setStatus('Récupération : '+(rows.get(id)?.title||id));
   try{
    const raw=await api('/rest/thread/'+encodeURIComponent(id)+'?version=2.18&source=default');
    if(!Array.isArray(raw.entries))throw Error('Format non reconnu');
    received.set(id,{id,source:'perplexity',title:raw.title||rows.get(id).title,url:location.origin+'/search/'+encodeURIComponent(id),raw,capture:{captured_at:new Date().toISOString(),scope:'returned-thread-entries',attachments:'not-downloaded'}});
   }catch(e){if(/401|403|429/.test(e.message)){stopped=true;setStatus('Erreur auth : '+e.message);break;}setStatus('Erreur : '+e.message);}
   done++;setProgress(done,ids.length);await delay();
  }
  busy=false;render();
  if(received.size&&captureToken&&!stopped)await doImport();
  else if(received.size)setStatus(received.size+' texte(s) prêts. Cliquez sur Réessayer import.');
  else setStatus('Aucun texte récupéré.');
 };

 async function doImport(){
  busy=true;render();setStatus('Envoi vers PromptMistress…');
  try{
   const conversations=[...received.values()].filter(c=>!c.imported&&!c.skipped);
   if(!conversations.length){setStatus('Tout est déjà présent dans le vault.');busy=false;render();return;}
   const r=await fetch(PM+'/api/capture',{method:'POST',headers:{'Content-Type':'application/json','X-Capture-Token':captureToken},body:JSON.stringify({conversations})});
   if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.error||'HTTP '+r.status);}
   const result=await r.json();
   for(const c of conversations){const rec=received.get(c.id);if(rec)rec.imported=true;}
   setStatus('✓ '+result.imported+' importée(s), '+result.skipped+' déjà présente(s).');
   render();setProgress(0,0);
  }catch(e){setStatus('Erreur import : '+e.message+'\nVérifiez que PromptMistress tourne sur '+PM);}
  finally{busy=false;render();}
 }
 $('import-btn').onclick=()=>doImport();

 (async()=>{
  try{
   const r=await fetch(PM+'/api/capture-token',{credentials:'omit'});
   if(!r.ok)throw Error('HTTP '+r.status);
   const d=await r.json();captureToken=d.token;
   setStatus('Connecté à PromptMistress.');
  }catch(e){
   setStatus('PromptMistress inaccessible ('+PM+').\n'+e.message);
  }
  await listThreads();
  try{
   const ws=await fetch(PM+'/api/workspace',{credentials:'omit'});
   if(ws.ok){const d=await ws.json();for(const row of d.rows||[]){if(row.identity)known.add(row.identity);}}
  }catch{}
  render();
 })();
})();
