export const viewKey='promptmistress.workspace.view.v1';
export const columns=[['date','Date',115],['llm','LLM',100],['title','Titre',390],['project','Projet',125],['status','Statut',95],['source','Source',95]];
export const viewOptions=[['explorer','Explorateur',true],['inspector','Fiche / Réglages / Index',true],['counts','Compteurs de résultats',true],['tags','Tags dans les lignes',true],['versions','Nombre de variantes',false],['hints','Textes d’aide',false],['footer','Pied de page',false],['clean','Vue épurée',false]];
export function normalizeView(raw={}){
 const v=raw&&typeof raw==='object'?raw:{};
 const result={columns:{},widths:{},options:{},projectColorMode:'auto'};
 for(const [id,,width] of columns){result.columns[id]=id==='title'||v.columns?.[id]!==false;const n=Number(v.widths?.[id]);result.widths[id]=Number.isFinite(n)&&n>0?Math.max(60,Math.min(900,Math.round(n))):width;}
 for(const [id,,defaultValue] of viewOptions)result.options[id]=typeof v.options?.[id]==='boolean'?v.options[id]:defaultValue;
 result.projectColorMode=['auto','neutral','manual'].includes(v.projectColorMode)?v.projectColorMode:'auto';
 return result;
}
export function loadView(){try{return normalizeView(JSON.parse(localStorage.getItem(viewKey)||'{}'));}catch{return normalizeView();}}
export function saveView(value){const v=normalizeView(value);localStorage.setItem(viewKey,JSON.stringify(v));window.dispatchEvent(new CustomEvent('pm-view-change',{detail:v}));return v;}
export function applyViewOptions(v){for(const [id] of viewOptions)document.body.dataset['view'+id[0].toUpperCase()+id.slice(1)]=String(v.options[id]);document.body.classList.toggle('clean-view',v.options.clean);}
// No source timestamp implies a remote-sync timestamp. Count local reread failures only.
export function unreadPrompts(previous,current,summary){
 const known=new Map([...previous,...current].filter(r=>r.kind==='prompt').map(r=>[r.key,r]));
 const present=new Set(current.map(r=>r.key));const errors=summary.errors||[];
 const failed=r=>r.variants.some(v=>errors.some(e=>e.source===v.source||e.source.startsWith(v.source+' /')));
 return {count:[...known.values()].filter(r=>!present.has(r.key)||failed(r)).length,unknown:errors.some(e=>![...known.values()].some(r=>r.variants.some(v=>e.source===v.source||e.source.startsWith(v.source+' /'))))};
}
export function mountViewSettings(container,onSaved=()=>{}){
 container.replaceChildren();const title=document.createElement('h2');title.textContent='Affichage de la bibliothèque';container.append(title);
 const description=document.createElement('p');description.textContent='Colonnes masquables, largeur en pixels. Le titre reste visible. Réglages conservés dans ce navigateur.';container.append(description);
 const controls=[];
 for(const [id,label] of columns){const row=document.createElement('div');row.className='view-setting';const l=document.createElement('label'),show=document.createElement('input');show.type='checkbox';show.disabled=id==='title';l.append(show,document.createTextNode(label));const width=document.createElement('input');width.type='number';width.min='60';width.max='900';width.step='1';width.setAttribute('aria-label','Largeur '+label+' en pixels');row.append(l,width);container.append(row);controls.push({id,show,width});}
 const opts=[];for(const [id,label] of viewOptions){const l=document.createElement('label');l.className='view-option';const box=document.createElement('input');box.type='checkbox';l.append(box,document.createTextNode(label));container.append(l);opts.push({id,box});}
 const projectLabel=document.createElement('label');projectLabel.className='view-setting project-color-setting';projectLabel.append(document.createTextNode('Couleurs des projets'));const projectMode=document.createElement('select');projectMode.setAttribute('aria-label','Couleurs des projets');for(const [value,label] of [['auto','Automatique : une couleur par projet'],['neutral','Neutre : même badge pour tous'],['manual','Couleur de fiche si définie']])projectMode.append(new Option(label,value));projectLabel.append(projectMode);container.append(projectLabel);
 const status=document.createElement('p');status.setAttribute('role','status');const save=document.createElement('button'),reset=document.createElement('button');save.type=reset.type='button';save.textContent='Appliquer l’affichage';reset.textContent='Rétablir l’affichage par défaut';container.append(save,reset,status);
 const fill=()=>{const v=loadView();for(const c of controls){c.show.checked=v.columns[c.id];c.width.value=v.widths[c.id];}for(const o of opts)o.box.checked=v.options[o.id];projectMode.value=v.projectColorMode;};fill();
 save.onclick=()=>{try{if(controls.some(c=>!c.width.reportValidity()))return;const v=loadView();for(const c of controls){v.columns[c.id]=c.show.checked;v.widths[c.id]=Number(c.width.value);}for(const o of opts)v.options[o.id]=o.box.checked;v.projectColorMode=projectMode.value;onSaved(saveView(v));status.textContent='Affichage enregistré.';}catch(e){status.textContent='Non enregistré : '+e.message;}};
 reset.onclick=()=>{try{onSaved(saveView({}));fill();status.textContent='Affichage par défaut restauré.';}catch(e){status.textContent=e.message;}};
 return fill;
}
