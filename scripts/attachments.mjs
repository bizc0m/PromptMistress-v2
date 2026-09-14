import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const dir=vault=>path.join(vault,'ATTACHMENTS');
const manifest=(vault,source,id)=>path.join(dir(vault),digest(source+':'+id)+'.json');
export function prepareAttachments(list){
 if(!Array.isArray(list)||list.length>100)throw Error('Liste de pièces jointes invalide');let total=0;
 return list.map(a=>{if(!a||typeof a.name!=='string')throw Error('Pièce jointe invalide');const out={name:a.name.replace(/[\x00-\x1f/\\]/g,'_').slice(0,180)||'fichier',ref:String(a.ref||'').slice(0,200),status:'unavailable',reason:String(a.reason||'Non téléchargé').slice(0,250)};
 if(a.status==='downloaded'){if(typeof a.data!=='string'||a.data.length>14*1024*1024||(a.data.length%4!==0||! /^[A-Za-z0-9+/]*={0,2}$/.test(a.data)))throw Error('Contenu binaire invalide');const bytes=Buffer.from(a.data,'base64');total+=bytes.length;if(bytes.length>10*1024*1024||total>30*1024*1024)throw Error('Limite de pièces jointes dépassée');return {...out,status:'downloaded',reason:undefined,mime:String(a.mime||'application/octet-stream').slice(0,120),size:bytes.length,hash:digest(bytes),bytes};}return out;});
}
export function saveAttachments(vault,source,id,items){
 fs.mkdirSync(dir(vault),{recursive:true,mode:0o700});const file=manifest(vault,source,id);let old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
 for(const {bytes,...item} of items){if(bytes){const dest=path.join(dir(vault),item.hash);try{fs.writeFileSync(dest,bytes,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}}
 const key=item.ref||item.name;const previous=old.find(a=>(a.ref||a.name)===key);
 if(item.status==='downloaded')old=old.filter(a=>!((a.ref||a.name)===key&&a.status!=='downloaded'));
 if(previous?.status==='downloaded'&&item.status!=='downloaded')continue;
 if(!old.some(a=>(a.ref||a.name)===key&&a.hash===item.hash&&a.status===item.status))old.push(item);
 }
 const tmp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(old,null,2),{mode:0o600});fs.renameSync(tmp,file);return old;
}
export function attachmentIdentity(url){try{const u=new URL(url);const id=u.pathname.match(/^\/(?:c|search)\/([^/]+)\/?$/)?.[1];const source=u.hostname==='chatgpt.com'?'chatgpt':['perplexity.ai','www.perplexity.ai'].includes(u.hostname)?'perplexity':null;return source&&id?{source,id:decodeURIComponent(id)}:null;}catch{return null;}}
export function listAttachments(vaults,url){const identity=attachmentIdentity(url);if(!identity)return [];const out=[];for(const vault of vaults){const file=manifest(vault,identity.source,identity.id);if(fs.existsSync(file))for(const a of JSON.parse(fs.readFileSync(file,'utf8')))if(!out.some(b=>b.hash===a.hash&&b.name===a.name&&b.ref===a.ref))out.push(a);}return out;}
export function attachmentFile(vaults,url,hash){if(!/^[a-f0-9]{64}$/.test(hash))return null;const item=listAttachments(vaults,url).find(a=>a.hash===hash&&a.status==='downloaded');if(!item)return null;for(const vault of vaults){const file=path.join(dir(vault),hash);if(fs.existsSync(file)){const real=fs.realpathSync(file);if(!real.startsWith(fs.realpathSync(dir(vault))+path.sep))return null;return {file:real,item};}}return null;}
