// The fifth tab now owns one list and one inspector. Original engines stay mounted.
function updateUnified(){
 variant.hidden=true;standalone.hidden=true;document.getElementById('vault-back').hidden=true;
 description.textContent='Une bibliothèque · une fiche · tes outils réunis.';
 panels.forEach(p=>p.hidden=p.id!=='unified');
}
window.PMWorkspace={
 exporter(){const w=document.querySelector('#exporter iframe').contentWindow;if(!w.CodexHistoryApp?.rows.length)throw Error('Exporter encore en chargement.');return w;},
 annotation(id){return this.exporter().ann(id);},
 saveAnnotation(id,value){
  const w=this.exporter();if(!w.CodexHistoryApp.rows.some(r=>r.id===id))throw Error('Fiche Exporter introuvable.');
  w.setActive(id);
  for(const [field,key] of [['folders','folders'],['tags','tags'],['note','note'],['status','status'],['priority','priority']])w.document.getElementById('ann-'+field).value=Array.isArray(value[key])?value[key].join(', '):value[key]||'';
  w.saveActive();
 },
 zip(files){return this.exporter().zipFiles(files);},
 index(ids){const w=this.exporter();return w.notePlanIndex(w.CodexHistoryApp.rows.filter(r=>ids.includes(r.id)));}
};

window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==document.getElementById('workspace-frame').contentWindow||e.data?.pm!=='workspace-action')return;const action=e.data.action;if(action==='preferences')document.getElementById('preferences-open').click();else if(action==='tools'){document.getElementById('legacy-nav').open=!document.getElementById('legacy-nav').open;}else if(action==='capture')showCapture();else if(action==='bookmarklet')openBookmarkletInstall();else if(['exporter','vault','final'].includes(action))select(action);});
select('unified');
