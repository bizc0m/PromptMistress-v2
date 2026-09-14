import {loadView,applyViewOptions,mountViewSettings,viewKey} from './workspace-view.mjs';
const prefsDialog=document.getElementById('preferences-dialog'),prefsForm=document.getElementById('preferences-form'),prefsStatus=document.getElementById('preferences-status');
const pref=id=>document.getElementById('pref-'+id);
let preferencesSaving=false;
function fillPreferences(p){pref('auto').checked=p.autoImport;pref('destination').value=p.destination;pref('after').value=p.afterImport;pref('duplicates').value=p.duplicates;}
const refreshViewSettings=mountViewSettings(document.getElementById('view-preferences'),applyViewOptions);applyViewOptions(loadView());window.addEventListener('storage',e=>{if(e.key===viewKey)applyViewOptions(loadView());});
async function openPreferences(){refreshViewSettings();prefsDialog.showModal();prefsStatus.textContent='Chargement…';pref('save').disabled=true;try{const r=await fetch('/api/preferences');const p=await r.json();if(!r.ok){if(p.defaults)fillPreferences(p.defaults);throw Error(p.error);}fillPreferences(p);prefsStatus.textContent='';}catch(e){prefsStatus.textContent=e.message;}finally{pref('save').disabled=false;}}
document.getElementById('preferences-open').onclick=openPreferences;
document.getElementById('preferences-close').onclick=()=>{if(!preferencesSaving)prefsDialog.close();};
prefsDialog.addEventListener('cancel',e=>{if(preferencesSaving)e.preventDefault();});
prefsForm.onsubmit=async e=>{e.preventDefault();if(preferencesSaving)return;preferencesSaving=true;pref('save').disabled=true;prefsStatus.textContent='Enregistrement…';try{
 const auth=await fetch('/api/capture-token').then(r=>r.json());
 const value={autoImport:pref('auto').checked,destination:pref('destination').value.trim(),afterImport:pref('after').value,duplicates:pref('duplicates').value};
 const r=await fetch('/api/preferences',{method:'POST',headers:{'Content-Type':'application/json','X-Capture-Token':auth.token},body:JSON.stringify(value)});const p=await r.json();if(!r.ok)throw Error(p.error);fillPreferences(p);prefsStatus.textContent='Préférences enregistrées. Elles seront conservées au prochain lancement.';
 document.getElementById('capture-frame').contentWindow.postMessage({pm:'preferences-saved'},location.origin);
 for(const selector of ['#final iframe','#workspace-frame']){const f=document.querySelector(selector);if(f?.src)f.src=f.src;}
}catch(e){prefsStatus.textContent='Non enregistré : '+e.message;}finally{preferencesSaving=false;pref('save').disabled=false;}};
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key===','){e.preventDefault();if(!prefsDialog.open)void openPreferences();}});
