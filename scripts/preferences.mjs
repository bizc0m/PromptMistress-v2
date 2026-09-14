import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export function createPreferencesStore(data,defaultDestination){
 const file=path.join(data,'preferences.json');
 const defaults={autoImport:true,destination:defaultDestination,afterImport:'stay',duplicates:'skip'};
 async function validate(value){
  if(!value||typeof value.autoImport!=='boolean'||!['stay','library'].includes(value.afterImport)||!['skip','version'].includes(value.duplicates)||typeof value.destination!=='string'||!path.isAbsolute(value.destination))throw Error('Préférences invalides. Indiquez le chemin absolu d’un coffre Prompt Vault existant.');
  const destination=await bounded(fs.promises.realpath(value.destination));
  const index=JSON.parse(await bounded(fs.promises.readFile(path.join(destination,'index.json'),'utf8')));
  if(!Array.isArray(index.items)&&!Array.isArray(index))throw Error('Ce dossier ne contient pas un index Prompt Vault valide.');
  for(const name of ['00_INBOX','02_PROMPTS','RAW'])if(!(await bounded(fs.promises.stat(path.join(destination,name)))).isDirectory())throw Error('Dossier Prompt Vault incomplet.');
  return {autoImport:value.autoImport,destination,afterImport:value.afterImport,duplicates:value.duplicates};
 }
 async function read(){try{return await validate(JSON.parse(await bounded(fs.promises.readFile(file,'utf8'))));}catch(e){if(e.code==='ENOENT'&&!fs.existsSync(file))return {...defaults};throw Error('Préférences enregistrées illisibles ou coffre inaccessible. Ouvrez Préférences pour les corriger.');}}
 async function save(value){const next=await validate(value);const tmp=file+'.tmp-'+crypto.randomUUID();try{await fs.promises.writeFile(tmp,JSON.stringify(next,null,2)+'\n',{flag:'wx',mode:0o600});await fs.promises.rename(tmp,file);}finally{if(fs.existsSync(tmp))await fs.promises.unlink(tmp);}return next;}
 return {read,save,defaults,file};
}
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Ce dossier ne répond pas. Choisissez un coffre local accessible.')),5000);})]);}finally{clearTimeout(timer);}}
