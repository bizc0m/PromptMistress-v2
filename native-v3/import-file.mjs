// Import a local transcript/export without a browser extension or HTTP server.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {importCapture} from '../scripts/capture.mjs';
import {markdownMessages} from '../scripts/message-content.mjs';
import {createPreferencesStore} from '../scripts/preferences.mjs';

const file=process.argv[2];
if(!file||!path.isAbsolute(file))throw Error('Fichier d’import invalide.');
const stat=fs.statSync(file);
if(!stat.isFile()||stat.size>100*1024*1024)throw Error('Fichier absent ou supérieur à 100 Mo.');
const text=fs.readFileSync(file,'utf8');
const fileURL=pathToFileURL(file).href;
const data=process.env.PROMPTMISTRESS_DATA||path.join(os.homedir(),'.promptmistress-v2','archives');
const vault=process.env.PROMPTMISTRESS_VAULT;
if(!vault)throw Error('Coffre de destination indisponible.');
const prefs=await createPreferencesStore(data,vault).read();
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const timestamp=stat.mtime.toISOString();
const chunks=value=>value.match(/[\s\S]{1,200000}/g)||[];
function normalizedMessages(value){
 if(Array.isArray(value?.messages)){
  const messages=value.messages.map(message=>{
   const role=String(message?.role||message?.type||'').toLowerCase();
   const content=typeof message?.content==='string'?message.content:JSON.stringify(message?.content??message?.text??'');
   return {role:['user','human'].includes(role)?'user':['assistant','ai','model'].includes(role)?'assistant':'system',content};
  }).filter(message=>message.content.trim());
  if(messages.length&&messages.every(message=>message.content.length<=250000))return messages;
 }
 const markdown=typeof value==='string'?markdownMessages(value):[];
 if(markdown.length)return markdown.filter(message=>['user','assistant','system'].includes(message.role));
 return chunks(typeof value==='string'?value:JSON.stringify(value,null,2)).map(content=>({role:'assistant',content}));
}
function generic(value,index){
 const provider=String(value?.source||value?.provider||'file').toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,64)||'file';
 const source='web-'+provider;
 const title=String(value?.title||path.basename(file)).slice(0,300);
 const originalURL=String(value?.url||value?.source_url||'');
 const url=/^https?:\/\//.test(originalURL)?originalURL:fileURL;
 const messages=normalizedMessages(value);
 if(!messages.length)throw Error('Aucun texte à importer.');
 return {id:digest(source+'|'+(value?.id||value?.conversation_id||fileURL)+'|'+index),source,title,url,messages,
  created:value?.created||timestamp,updated:value?.updated||timestamp,
  capture:{format:'promptmistress.capture.v1',method:'local-file',captured_at:new Date().toISOString(),attachments:'not-downloaded'}};
}
let payload;
if(path.extname(file).toLowerCase()==='.json'){
 let parsed;try{parsed=JSON.parse(text);}catch{throw Error('JSON invalide.');}
 const list=Array.isArray(parsed)?parsed:Array.isArray(parsed?.conversations)?parsed.conversations:[parsed];
 let selected=null;
 if(process.env.PROMPTMISTRESS_SELECTED_INDICES){
  try{selected=JSON.parse(process.env.PROMPTMISTRESS_SELECTED_INDICES);}catch{throw Error('Sélection d’import invalide.');}
  if(!Array.isArray(selected)||!selected.every(index=>Number.isInteger(index)&&index>=0&&index<list.length))throw Error('Sélection d’import invalide.');
  selected=new Set(selected);
 }
 payload={conversations:list.flatMap((item,index)=>selected&&!selected.has(index)?[]:[item?.mapping||item?.source==='perplexity'?item:generic(item,index)])};
}else payload={conversations:[generic(text,0)]};
const duplicateMode=process.env.PROMPTMISTRESS_DUPLICATES==='version'?'version':prefs.duplicates;
const result=importCapture(prefs.destination,payload,{duplicates:duplicateMode});
process.stdout.write(JSON.stringify({...result,destination:prefs.destination})+'\n');
