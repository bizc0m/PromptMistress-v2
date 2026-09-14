import fs from 'node:fs';import path from 'node:path';
import pv from '../projects/project-a-chatvault/pv.js';
const field=(text,key)=>{const v=text.match(new RegExp('^'+key+':\\s*(.*)$','m'))?.[1];if(!v)return '';try{return JSON.parse(v)}catch{return v.trim()}};
const content=value=>typeof value==='string'?value:Array.isArray(value)?value.map(content).join('\n'):value?.text||value?.parts?.map(content).join('\n')||'';
import {markdownMessages} from './message-content.mjs';
export {markdownMessages} from './message-content.mjs';
export function pairOutputs(messages){
 let prompts=[],outputs=[],turn=0;const pairs=[];
 function flush(){if(outputs.length)pairs.push({turn,prompt:prompts.join('\n\n'),output:outputs.join('\n\n'),association:prompts.length?'prompt précédent dans cette version':'prompt absent'});outputs=[];}
 for(const m of messages){if(m.role==='user'){if(outputs.length){flush();prompts=[];}prompts.push(m.content);turn++;}else if(m.role==='assistant'&&m.content)outputs.push(m.content);}
 flush();return pairs;
}
export function fileReferences(text){
 const refs=new Set();for(const m of text.matchAll(/\]\((?:<([^>]+)>|([^\s)]+))\)/g))refs.add(m[1]||m[2]);
 for(const m of text.matchAll(/`((?:\/Users\/|\/tmp\/|\/private\/|sandbox:)[^`\n]+)`/g))refs.add(m[1]);
 return [...refs].filter(v=>/^(\/|file:|sandbox:|https?:)/.test(v));
}
function chatGPTMessages(raw,id){
 const parsed=JSON.parse(raw),chat=Array.isArray(parsed)?parsed.find(c=>(c.id||c.conversation_id)===id):parsed;
 if(!chat?.mapping)return [];
 const mapping=chat.mapping;let current=chat.current_node;
 if(!current){const leaves=Object.keys(mapping).filter(k=>!mapping[k].children?.length);if(leaves.length!==1)return [];current=leaves[0];}
 const chain=[],seen=new Set();while(current&&mapping[current]&&!seen.has(current)){seen.add(current);chain.push(mapping[current]);current=mapping[current].parent;}
 return chain.reverse().filter(n=>n.message?.author?.role).map(n=>({role:n.message.author.role,content:content(n.message.content)}));
}
export async function scanOutputVariant(detail,variant,roots){
 let messages=[],basis='rôles de l’archive Markdown';
 const rawRelative=field(detail.text,'raw_source'),id=field(detail.text,'source_id');
 if(rawRelative){
  const root=roots.find(root=>variant.path.startsWith(path.resolve(root)+path.sep));
  if(root){const rawPath=path.resolve(path.dirname(variant.path),rawRelative);if(rawPath.startsWith(path.resolve(root)+path.sep)){
   try{const real=await fs.promises.realpath(rawPath),base=await fs.promises.realpath(root);if(!real.startsWith(base+path.sep))throw Error('Hors source');const raw=await fs.promises.readFile(real,'utf8');
    if(variant.provider==='codex')messages=pv.extractCodexMessages(raw).messages;
    else if(variant.provider==='claude')messages=pv.extractClaudeMessages(raw).messages;
    else if(variant.provider==='gemini')messages=pv.extractGeminiMessages(raw).messages;
    else if(variant.provider==='chatgpt')messages=chatGPTMessages(raw,id);
    if(messages.length)basis='rôles de la source RAW';
   }catch{}
  }}
 }
 if(!messages.length)messages=markdownMessages(detail.text);
 const pairs=pairOutputs(messages);
 for(const pair of pairs){pair.basis=basis;pair.files=[];for(const reference of fileReferences(pair.output)){
  let status='lien distant';if(reference.startsWith('sandbox:'))status='référence de session';
  else if(reference.startsWith('/')||reference.startsWith('file:')){try{const target=reference.startsWith('file:')?new URL(reference):reference;const info=await fs.promises.stat(target);status=info.isFile()?'fichier présent':info.isDirectory()?'dossier présent':'autre';}catch{status='introuvable ou inaccessible';}}
  pair.files.push({reference,status});
 }}
 return {pairs,warning:messages.length?'':'Rôles absents : association prompt/output non déterminable.'};
}
