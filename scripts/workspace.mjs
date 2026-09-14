import {listAttachments} from './attachments.mjs';
// Read-only adapter: keep the original archive grouping and Vault prompt reader.
import fs from 'node:fs';
import {markdownMessages} from './message-content.mjs';
import {scanOutputVariant} from './output-scan.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import pv from '../projects/project-a-chatvault/pv.js';
import {loadArchive} from './archive.mjs';
export function loadWorkspace(configPath){
 const archive=loadArchive(configPath),rows=archive.rows.map(r=>({...r,kind:'chat'})),prompts=new Map(),promptFiles=new Map();
 for(const source of (Array.isArray(configPath)?configPath:JSON.parse(fs.readFileSync(configPath,'utf8')))){
  if(source.type!=='vault')continue;
  try{
   const index=JSON.parse(fs.readFileSync(path.join(source.path,'index.json'),'utf8'));
   for(const p of pv.promptItems(source.path,Array.isArray(index)?index:index.items)){
    const file=path.resolve(source.path,p.path);
    if(!file.startsWith(path.resolve(source.path)+path.sep))continue;
    const existing=promptFiles.get(fs.realpathSync(file));
    if(existing){existing.variants.push({source:source.name,path:file,sourceURL:p.chat_url,hasContent:true,editor:null});existing.copies=existing.variants.length;continue;}
    const key=crypto.createHash('sha256').update('prompt:'+source.name+':'+p.id).digest('hex');
    const v={source:source.name,path:file,sourceURL:p.chat_url,hasContent:true,editor:null};
    prompts.set(key,{file,title:p.title,sourceURL:p.chat_url});
    const promptRow={key,kind:'prompt',identity:p.id,title:p.title,provider:p.source,project:p.project,updated:p.chat_updated,origin:p.origin_chat,hasContent:true,copies:1,variants:[v]};rows.push(promptRow);promptFiles.set(fs.realpathSync(file),promptRow);
   }
  }catch(e){archive.summary.errors.push({source:source.name+' / prompts',message:e.message});}
 }
 const roots=(Array.isArray(configPath)?configPath:JSON.parse(fs.readFileSync(configPath,'utf8'))).filter(s=>s.type==='vault').map(s=>s.path);
 return {rows,summary:archive.summary,async outputs(offset=0){
  if(!Number.isInteger(offset)||offset<0)throw Error('Position de scan invalide.');
  const chats=rows.filter(r=>r.kind==='chat'),items=[],warnings=[];
  for(const row of chats.slice(offset,offset+8)){for(let variant=0;variant<row.variants.length;variant++){
   try{const detail=archive.detail(row.key,variant);const result=await scanOutputVariant(detail,row.variants[variant],roots);
    items.push(...result.pairs.map(pair=>({...pair,key:row.key,variant,title:row.title,provider:row.provider,project:row.project,source:row.variants[variant].source,path:row.variants[variant].path})));
    if(result.warning)warnings.push({key:row.key,variant,message:result.warning});
   }catch(e){warnings.push({key:row.key,variant,message:e.message});}
  }}
  return {items,warnings,total:chats.length,next:offset+8<chats.length?offset+8:null};
 },detail(key,variant=0){
  const p=prompts.get(key);
  const d=p?{title:p.title,path:p.file,sourceURL:p.sourceURL,text:fs.readFileSync(p.file,'utf8')}:archive.detail(key,variant);
  if(!d)return null;
  // Keep raw available; use the original prompt view extraction for the display body.
  let text=d.text;
  if(p){const html=pv.promptViewHtml({id:key,title:p.title},text);const match=html.match(/<pre id="prompt-body">([\s\S]*?)<\/pre>/);if(match)text=match[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');}
  return {...d,attachments:listAttachments(roots,d.sourceURL),text,raw:d.text,messages:p?[{role:'user',content:text}]:markdownMessages(d.text)};
 }};
}
