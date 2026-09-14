export const searchText=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
export function retainVisibleSelection(selected,rows){const keys=new Set(rows.map(r=>r.key));return new Set([...selected].filter(key=>keys.has(key)));}
// Local organization only: original prompt files are never moved or edited.
export const splitValues=value=>[...new Set(String(value||'').split(/[,\n]+/).map(s=>s.trim()).filter(Boolean))];
export function parseTags(value){
 const tags=[...new Set(String(value||'').split(/[\s,]+/).filter(Boolean))];
 if(tags.some(t=>!/^[@#][^@#\s,]+$/u.test(t)))throw Error('Chaque tag doit commencer par @ ou #, sans espace. Exemple : #design @client.');
 return tags;
}
export function foldersOf(a){return (a.folders||[]).map(v=>v.split('/').map(p=>p.trim()).filter(Boolean).join('/')).filter(Boolean);}
export function matches(r,a,f){
 const state=a.visibility||'active';
 if(f.view!=='all'&&state!==f.view)return false;
 if(f.project&&r.project!==f.project)return false;
 if(f.tag&&!(a.tags||[]).includes(f.tag))return false;
 if(f.folder&&!foldersOf(a).some(v=>v===f.folder||v.startsWith(f.folder+'/')))return false;
 const hay=searchText([r.title,r.project,...a.tags||[],...a.folders||[],a.note].join(' '));
 const terms=searchText(f.query).match(/-?"[^"]*"|\S+/g)||[];
 return terms.every(term=>{
  const excluded=term.startsWith('-');
  const value=(excluded?term.slice(1):term).replace(/^"|"$/g,'');
  return !value||(excluded?!hay.includes(value):hay.includes(value));
 });
}
export function folderTree(items){
 const root=new Map();
 for(const a of items)for(const folder of foldersOf(a)){
  let nodes=root,path='';for(const part of folder.split('/')){path=path?path+'/'+part:part;if(!nodes.has(part))nodes.set(part,{name:part,path,children:new Map()});nodes=nodes.get(part).children;}
 }
 return root;
}
export function updatedAnnotation(old,action,value){
 const next={...old};
 if(action==='visibility'){
  if(!['active','hidden','archived'].includes(value))throw Error('Vue invalide.');next.visibility=value;
 }else if(action==='color'){
  if(!['','blue','green','yellow','pink'].includes(value))throw Error('Couleur invalide.');next.color=value;
 }else if(action==='tags')next.tags=[...new Set([...(old.tags||[]),...parseTags(value)])];
 else if(action==='folders')next.folders=[...new Set([...foldersOf(old),...foldersOf({folders:splitValues(value)})])];
 else throw Error('Action inconnue.');
 return next;
}
