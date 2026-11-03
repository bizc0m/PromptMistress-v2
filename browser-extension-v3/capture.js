const $=id=>document.getElementById(id);
let rows=[],selected=new Set(),busy=false;
async function pm(path,body){
  const reply=await chrome.runtime.sendMessage({action:'pm-fetch',path,body});
  if(!reply?.ok)throw Error(reply?.error||'Hôte natif indisponible.');
  return reply.data;
}
function status(message){$('status').textContent=message;}
function render(){
 const query=$('search').value.trim().toLocaleLowerCase();
 const visible=rows.filter(row=>!query||row.title.toLocaleLowerCase().includes(query)||row.id.toLocaleLowerCase().includes(query));
 const fragment=document.createDocumentFragment();
 for(const row of visible){
  const line=document.createElement('label');line.className='row';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(row.id);checkbox.addEventListener('change',()=>{checkbox.checked?selected.add(row.id):selected.delete(row.id);updateCount();});
  const title=document.createElement('span');title.className='title';title.textContent=row.title;
  const source=document.createElement('span');source.className='source';source.textContent=row.source;
  line.append(checkbox,title,source);fragment.append(line);
 }
 $('rows').replaceChildren(fragment);updateCount();
}
function updateCount(){$('selected').textContent=`${selected.size} sélectionnée${selected.size>1?'s':''}`;}
async function refresh(){
 if(busy)return;
 try{
  $('connection').textContent='Connexion…';
  const next=[];let offset=0;
  for(;;){const page=await pm('/api/stage/rows-page?offset='+offset);next.push(...page.rows);if(page.next===null)break;offset=page.next;}
  rows=next;const known=new Set(rows.map(row=>row.id));selected=new Set([...selected].filter(id=>known.has(id)));
  $('connection').textContent='Hôte natif connecté';status(`${rows.length} conversation${rows.length>1?'s':''} disponible${rows.length>1?'s':''}.`);render();
  const progress=await pm('/api/stage/progress');$('import').disabled=progress.captured===0;
 }catch(error){$('connection').textContent='Hôte indisponible';status(error.message);}
}
async function capture(){
 if(!selected.size){status('Sélectionnez au moins une conversation.');return;}
 try{await pm('/api/stage/wanted',{ids:[...selected]});status(`Capture demandée pour ${selected.size} conversation${selected.size>1?'s':''}. Gardez les onglets sources ouverts.`);}catch(error){status(error.message);}
}
async function tick(){
 try{const progress=await pm('/api/stage/progress');$('import').disabled=progress.captured===0;
  if(progress.total)status(`${progress.captured}/${progress.total} textes reçus · ${progress.pending} en attente. Gardez les onglets sources ouverts.`);
  const count=rows.length;const page=await pm('/api/stage/rows-page?offset='+count);
  if(page.total!==count)await refresh();
 }catch(error){$('connection').textContent='Hôte indisponible';status(error.message);}
 try{
  const local=await pm('/api/import-local/status');
  $('local-status').textContent=local.state==='running'||local.state==='starting'?'Import des sessions locales en cours…':
    local.state==='complete'?`Sessions locales : ${local.imported} importées, ${local.indexed} dans le coffre.`:
    local.state==='failed'?`Import local échoué : ${local.error}`:'';
  $('import-local').disabled=local.state==='running'||local.state==='starting';
 }catch(error){$('local-status').textContent=error.message;}
}
async function importTexts(){
 if(busy)return;busy=true;$('import').disabled=true;
 try{const result=await pm('/api/stage/import',selected.size?{ids:[...selected]}:{});status(`${result.imported} importée${result.imported>1?'s':''}, ${result.skipped} ignorée${result.skipped>1?'s':''}. Destination : ${result.destination||'coffre actuel'}`);}catch(error){status(error.message);}finally{busy=false;}
}
$('search').addEventListener('input',render);$('refresh').onclick=refresh;$('select-all').onclick=()=>{for(const row of rows)selected.add(row.id);render();};$('clear-selection').onclick=()=>{selected.clear();render();};$('capture').onclick=capture;$('import').onclick=importTexts;$('clear').onclick=async()=>{try{await pm('/api/stage/clear',{});selected.clear();await refresh();}catch(error){status(error.message);}};
$('import-local').onclick=async()=>{try{const state=await pm('/api/import-local',{});$('local-status').textContent=state.state==='running'||state.state==='starting'?'Import des sessions locales lancé.':`Import local : ${state.state}`;$('import-local').disabled=true;}catch(error){$('local-status').textContent=error.message;}};
refresh();setInterval(tick,1500);
