const $=id=>document.getElementById(id), rows=new Map(), selection=new Set(), received=new Map();
let token,busy=false,importing=false,bridge=false,loadedFile=false;
let captureQueue=[],batchTimer=null,captureRun=0,finishing=false;
const FIRST_BATCH=50,NEXT_BATCH=20,BATCH_DELAY=5*60*1000;
function launchBatch(limit){const ids=captureQueue.splice(0,limit);if(!ids.length)return;busy=true;render();status(`Capture de ${ids.length} conversations · ${captureQueue.length} restantes.`);tell('capture',{ids,plus:$('capture-plus').checked});}
async function finishBatch(payload){if(finishing)return;finishing=true;const run=captureRun;try{busy=false;render();const imported=await importSelection(payload.stopped?'Capture interrompue. ':'',true);if(payload.stopped||imported===false||run!==captureRun){captureQueue=[];return;}if(captureQueue.length){status($('status').textContent+` Prochain lot de ${Math.min(NEXT_BATCH,captureQueue.length)} dans 5 minutes. Gardez les deux pages ouvertes.`);busy=true;render();batchTimer=setTimeout(()=>{batchTimer=null;if(run===captureRun)launchBatch(NEXT_BATCH);},BATCH_DELAY);}}finally{finishing=false;}}
const nonce=new URLSearchParams(location.search).get('bridge');
const tell=(type,payload={})=>parent.postMessage({pm:'capture-ui',type,payload,nonce},location.origin);
function status(text){$('status').textContent=text;}
function render(){const q=$('search').value.toLowerCase();$('rows').replaceChildren();let shown=0;for(const r of rows.values()){if(!r.title.toLowerCase().includes(q))continue;shown++;const label=document.createElement('label'),box=document.createElement('input'),title=document.createElement('span'),note=document.createElement('small');box.type='checkbox';box.checked=selection.has(r.id);box.disabled=busy||importing;box.onchange=()=>{box.checked?selection.add(r.id):selection.delete(r.id);counts();};title.textContent=r.title;note.textContent=received.has(r.id)?'Texte reçu':r.archived?'Archivé':'À récupérer';label.append(box,title,note);$('rows').append(label);}if(!shown)$('rows').textContent=rows.size?'Aucun titre correspondant.':'Connectez le site avec le favori, ou ouvrez un export JSON.';counts();}
function counts(){$('count').textContent=`${rows.size} chats · ${selection.size} sélectionnés · ${received.size} reçus`;$('capture').disabled=!bridge||busy||!selection.size;$('import').disabled=busy||importing||![...selection].some(id=>received.has(id));$('all').disabled=$('none').disabled=busy||importing;}
$('search').oninput=render;$('all').onclick=()=>{for(const id of rows.keys())selection.add(id);render();};$('none').onclick=()=>{selection.clear();render();};
$('capture').onclick=()=>{if(busy||importing)return;captureRun++;captureQueue=[...selection].filter(id=>!received.has(id));if(!captureQueue.length){void importSelection();return;}launchBatch(FIRST_BATCH);};
$('stop').onclick=()=>{captureRun++;captureQueue=[];if(batchTimer!==null){clearTimeout(batchTimer);batchTimer=null;busy=false;render();status('Capture en pause. Les textes reçus sont conservés.');}tell('stop');};
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.pm!=='bridge-v1'||e.data.nonce!==nonce)return;const {type,payload}=e.data;if(type==='hello'){bridge=true;busy=true;status('Site connecté · recherche des conversations…');}if(type==='rows'){loadedFile=false;for(const r of payload){rows.set(r.id,r);selection.add(r.id);}render();}if(type==='listed'){busy=false;status(`${payload.stopped?'Liste interrompue':'Liste reçue'} : ${payload.count} chats. ${payload.notes.join(' ')}`);render();}if(type==='progress')status('Récupération : '+(rows.get(payload.id)?.title||payload.id));if(type==='conversation'){received.set(payload.id,payload);render();}if(type==='capture-error'){const p=document.createElement('p');p.textContent=(rows.get(payload.id)?.title||payload.id)+' : '+payload.message;$('errors').append(p);}if(type==='done'){void finishBatch(payload);}if(type==='error'){busy=false;status(payload.message);render();}});
$('file').onchange=async()=>{try{if(busy||importing)throw Error('Attendez la fin de l’opération en cours.');const file=$('file').files[0];if(!file)return;if(file.size>100*1024*1024)throw Error('Maximum 100 Mo.');const d=JSON.parse(await file.text()),list=Array.isArray(d)?d:d.conversations||[d];if(!Array.isArray(list)||!list.length||list.some(c=>!(c.id||c.conversation_id)||(!c.mapping&&c.source!=='perplexity')))throw Error('Export de conversation invalide.');rows.clear();selection.clear();received.clear();for(const c of list){const id=c.id||c.conversation_id;rows.set(id,{id,title:c.title||id});received.set(id,c);selection.add(id);}loadedFile=true;render();await importSelection('Fichier lu. ',true);}catch(e){status(e.message);}};
async function importSelection(prefix='',automatic=false){
 if(busy||importing)return;
 const conversations=[...selection].filter(id=>received.has(id)).map(id=>received.get(id));
 if(!conversations.length){status(prefix+'Aucun texte reçu à importer.');return true;}
 importing=true;render();status(prefix+'Préparation de l’import…');
 try{
  const prefsResponse=await fetch('/api/preferences');const prefs=await prefsResponse.json();if(!prefsResponse.ok)throw Error(prefs.error||'Préférences indisponibles');
  if(automatic&&!prefs.autoImport){status(prefix+'Import automatique désactivé. Cliquez sur Importer pour enregistrer la sélection.');return;}
  await authReady;
  const result={imported:0,skipped:0};
  const batches=conversations.some(c=>c.pmAttachments!==undefined)?conversations.map(c=>[c]):[conversations];
  for(const batch of batches){
   const r=await fetch('/api/capture',{method:'POST',headers:{'Content-Type':'application/json','X-Capture-Token':token},body:JSON.stringify({conversations:batch})});
   const part=await r.json();if(!r.ok)throw Error(part.error||'Service local indisponible');result.imported+=part.imported;result.skipped+=part.skipped;result.afterImport=part.afterImport;
  }
  const attachments=conversations.flatMap(c=>c.pmAttachments||[]);const plusSummary=conversations.some(c=>c.pmAttachments!==undefined)?` Version + : ${attachments.filter(a=>a.status==='downloaded').length} fichier(s) reçu(s), ${attachments.filter(a=>a.status!=='downloaded').length} indisponible(s).`:'';status(prefix+`${result.imported} importée(s), ${result.skipped} déjà présente(s). Aucun fichier source remplacé.`+plusSummary);tell('imported',{afterImport:captureQueue.length?'stay':result.afterImport});return true;
 }catch(e){status(prefix+'Import échoué : '+e.message+'. Les textes sont conservés dans cette fenêtre. Cliquez sur Importer pour réessayer.');return false;}
 finally{importing=false;render();}
}
$('import').onclick=()=>importSelection();
const authReady=fetch('/api/capture-token').then(r=>{if(!r.ok)throw Error('Service local indisponible');return r.json();}).then(auth=>{token=auth.token;});
authReady.catch(()=>status('Service local indisponible.'));
Promise.all(['chatgpt-bookmarklet.js','chatgpt-download.js','perplexity-bookmarklet.js','capture-menu.js','attachment-capture.js'].map(name=>fetch('/scripts/'+name).then(r=>{if(!r.ok)throw Error('Chargement impossible');return r.text();}))).then(([gpt,fallback,per,menu,helper])=>{gpt=gpt.replace('/*PM_ATTACHMENT_HELPER*/',()=>helper);per=per.replace('/*PM_ATTACHMENT_HELPER*/',()=>helper);const direct=menu.replace('__GPT__',()=>gpt).replace('__PERPLEXITY__',()=>per);$('bookmark').href='javascript:'+encodeURIComponent(direct);$('fallback').href='javascript:'+encodeURIComponent(fallback);$('code').value=$('bookmark').href;}).catch(()=>status('Service local indisponible.'));
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('code').value);status('Code du favori copié.');}catch{$('code').select();status('Copiez le code sélectionné.');}};
render();tell('ready');

$("install-bookmarklet").onclick=()=>{$("installation").open=true;$("installation").scrollIntoView({block:"nearest"});};
if(new URLSearchParams(location.search).has('install')){document.body.classList.add('install-mode');$('capture-tools').open=false;$('install-bookmarklet').click();}
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.pm==='capture-install')$('install-bookmarklet').click();});

async function showCapturePreference(){try{const r=await fetch('/api/preferences');const p=await r.json();if(!r.ok)throw Error(p.error);$('capture-mode').textContent=p.autoImport?'Import automatique activé : les textes reçus sont enregistrés après la capture.':'Import automatique désactivé : cliquez sur Importer après la capture.';$('capture').textContent=p.autoImport?'Capturer + importer':'Capturer la sélection';}catch(e){$('capture-mode').textContent=e.message;}}
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.pm==='preferences-saved')void showCapturePreference();});
void showCapturePreference();
