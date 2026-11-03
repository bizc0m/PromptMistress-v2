import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'promptmistress-host-test-'));
const data=path.join(temp,'data'),vault=path.join(temp,'vault');
fs.mkdirSync(data);fs.mkdirSync(vault);
fs.writeFileSync(path.join(vault,'index.json'),JSON.stringify({items:[]}));
fs.writeFileSync(path.join(data,'sources.json'),JSON.stringify([{name:'Prompt Vault Node',type:'vault',path:vault}]));
async function openHost(){
 const child=spawn(process.execPath,[path.join(root,'native-v3/capture-host.mjs')],{env:{...process.env,PROMPTMISTRESS_DATA:data},stdio:['pipe','pipe','pipe']});
 let buffer=Buffer.alloc(0),next=1;const waiters=new Map();let stderr='';
 child.stderr.on('data',chunk=>stderr+=chunk);
 child.stdout.on('data',chunk=>{
  buffer=Buffer.concat([buffer,chunk]);
  while(buffer.length>=4){const size=buffer.readUInt32LE(0);if(buffer.length<4+size)break;
   const result=JSON.parse(buffer.subarray(4,4+size));buffer=buffer.subarray(4+size);
   const waiter=waiters.get(result.requestId);waiters.delete(result.requestId);waiter?.(result);
  }
 });
 const call=(route,body)=>new Promise((resolve,reject)=>{
  const id=next++;waiters.set(id,result=>result.ok?resolve(result.data):reject(Error(result.error)));
  const payload=Buffer.from(JSON.stringify({requestId:id,path:route,body}));
  const size=Buffer.alloc(4);size.writeUInt32LE(payload.length);child.stdin.write(Buffer.concat([size,payload]));
  setTimeout(()=>{if(waiters.has(id)){waiters.delete(id);reject(Error('Hôte sans réponse : '+stderr));}},5000).unref();
 });
 return {child,call};
}
try{
 let host=await openHost();
 assert.deepEqual(await host.call('/api/stage'),{rows:[],receivedIds:[],wanted:[]});
 const sourceStatus=await host.call('/api/source-status',{provider:'chatgpt',state:'complete',listed:12,imported:5});
 assert.equal(sourceStatus.state,'complete');
 assert.equal(JSON.parse(fs.readFileSync(path.join(data,'import-browser-v3.json'))).chatgpt.listed,12);
 assert.deepEqual(await host.call('/api/stage/rows',{rows:[{id:'one',title:'Premier',source:'chatgpt'},{id:'two',title:'Second',source:'perplexity'}]}),{rows:2,added:2});
 assert.deepEqual(await host.call('/api/stage/wanted',{ids:['one','two']}),{wanted:2});
 assert.deepEqual(await host.call('/api/stage/progress'),{total:2,captured:0,pending:2});
 await host.call('/api/stage/conversations',{conversations:[{id:'one',title:'Premier',mapping:{a:{message:{author:{role:'user'},content:{parts:['Bonjour, monde.']}}},b:{message:{author:{role:'assistant'},content:{parts:['Bonjour !']}}}}}]});
 assert.deepEqual(await host.call('/api/stage/progress'),{total:2,captured:1,pending:1});
 const imported=await host.call('/api/stage/import',{ids:['one']});
 assert.equal(imported.imported,1);
 assert.equal(imported.skipped,0);
 const importedRows=JSON.parse(fs.readFileSync(path.join(vault,'index.json'))).items;
 assert.equal(importedRows.length,1);
 assert.match(fs.readFileSync(path.join(vault,importedRows[0].path),'utf8'),/Bonjour, monde/);
 const web={id:'sha256-of-url',source:'web-claude',title:'Discussion Claude',
  url:'https://claude.ai/chat/example',messages:[{role:'user',content:'Résume ce document.'},{role:'assistant',content:'Voici le résumé.'}]};
 const webImport=await host.call('/api/capture',{conversations:[web]});
 assert.equal(webImport.imported,1);
 const webDuplicate=await host.call('/api/capture',{conversations:[web]});
 assert.equal(webDuplicate.skipped,1);
 const webRow=JSON.parse(fs.readFileSync(path.join(vault,'index.json'))).items.find(row=>row.source==='web-claude');
 assert(webRow);
 assert.match(fs.readFileSync(path.join(vault,webRow.path),'utf8'),/Voici le résumé/);
 const chat={id:'auto-chat',title:'Chat automatique',mapping:{
  user:{message:{author:{role:'user'},content:{parts:['Question importée.']}}},
  assistant:{message:{author:{role:'assistant'},content:{parts:['Réponse importée.']}}}
 }};
 const perplexity={id:'auto-perplexity',source:'perplexity',title:'Recherche automatique',
  url:'https://www.perplexity.ai/search/auto-perplexity',raw:{entries:[{text:[
   {step_type:'INITIAL_QUERY',content:{query:'Recherche test'}},
   {step_type:'FINAL',content:{answer:'Réponse test'}}
  ]}]}};
 const batch=await host.call('/api/capture',{conversations:[chat,perplexity]});
 assert.equal(batch.imported,2);
 const repeated=await host.call('/api/capture',{conversations:[chat,perplexity]});
 assert.equal(repeated.skipped,2);
 const mixedRows=JSON.parse(fs.readFileSync(path.join(vault,'index.json'))).items;
 assert(mixedRows.some(row=>row.source==='chatgpt'&&row.source_id==='auto-chat'));
 assert(mixedRows.some(row=>row.source==='perplexity'&&row.source_id==='auto-perplexity'));
 host.child.stdin.end();await new Promise(resolve=>host.child.once('exit',resolve));
 host=await openHost();
 assert.equal((await host.call('/api/stage')).rows.length,2);
 assert.deepEqual(await host.call('/api/stage/progress'),{total:0,captured:0,pending:0});
 await host.call('/api/stage/clear',{});
 assert.deepEqual(await host.call('/api/stage'),{rows:[],receivedIds:[],wanted:[]});
 host.child.stdin.end();await new Promise(resolve=>host.child.once('exit',resolve));
 console.log('Hôte natif : protocole, staging, reprise et remise à zéro validés.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
