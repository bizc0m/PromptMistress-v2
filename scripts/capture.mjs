import {prepareAttachments,saveAttachments} from './attachments.mjs';
import {normalizePerplexity} from './perplexity-capture.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pv from '../projects/project-a-chatvault/pv.js';
export function importCapture(vault, payload, {duplicates='skip'}={}) {
 if(!['skip','version'].includes(duplicates))throw Error('Politique de doublons invalide.');
 const list=Array.isArray(payload)?payload:payload.conversations||[payload];
 if(!Array.isArray(list)||!list.length||list.length>10000)throw Error('Export ChatGPT vide ou invalide.');
 // Validate the whole input before writing any conversation.
 for(const c of list){if(c?.source==='perplexity'){normalizePerplexity(c);continue;}if(!c||typeof(c.conversation_id||c.id)!=='string'||!c.mapping||typeof c.mapping!=='object'||Array.isArray(c.mapping))throw Error('Conversation sans identifiant ou structure de messages.');}
 const attachmentPlans=new Map(list.filter(c=>c.pmAttachments!==undefined).map(c=>[c,prepareAttachments(c.pmAttachments)]));
 const index=JSON.parse(fs.readFileSync(path.join(vault,'index.json'),'utf8'));
 const seen=new Set();
 for(const row of index.items||index){
  if(!['chatgpt','perplexity'].includes(row.source))continue;
  if(row.source_id){seen.add(row.source+':'+row.source_id);continue;}
  // Fallback for index entries built before source_id was indexed: read the file once.
  const file=path.resolve(vault,row.path);if(!file.startsWith(path.resolve(vault)+path.sep))throw Error('Chemin hors vault');
  const body=fs.readFileSync(file,'utf8');const match=body.match(/^source_id:\s*(.*)$/m);
  if(match){let id=match[1];try{id=JSON.parse(id)}catch{id=id.replace(/^["']|["']$/g,'')}seen.add(row.source+':'+id);}
 }
 let imported=0,skipped=0;
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'promptmistress-capture-'));
 try{for(const c of list){const id=c.conversation_id||c.id;const source=c.source==='perplexity'?'perplexity':'chatgpt',key=source+':'+id;if(seen.has(key)&&duplicates==='skip'){if(attachmentPlans.has(c))saveAttachments(vault,source,id,attachmentPlans.get(c));skipped++;continue;}const clean={...c};delete clean.pmAttachments;const file=path.join(tmp,'conversation.json');fs.writeFileSync(file,JSON.stringify(source==='perplexity'?normalizePerplexity(clean):{...clean,url:`https://chatgpt.com/c/${encodeURIComponent(id)}`}),{mode:0o600});if(source==='perplexity')pv.importSourceFile(vault,source,file);else pv.importChatGptFile(vault,file);if(attachmentPlans.has(c))saveAttachments(vault,source,id,attachmentPlans.get(c));seen.add(key);imported++;}if(imported)pv.rebuildIndex(vault);}finally{fs.rmSync(tmp,{recursive:true,force:true});}
 return {imported,skipped};
}
