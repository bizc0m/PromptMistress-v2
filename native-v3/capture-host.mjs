// Chrome Native Messaging host. Chrome starts this process on demand; no port is opened.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {importCapture} from '../scripts/capture.mjs';
import {createPreferencesStore} from '../scripts/preferences.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require=createRequire(import.meta.url);
const pv=require('../projects/project-a-chatvault/pv.js');
const data=process.env.PROMPTMISTRESS_DATA || path.join(os.homedir(),'.promptmistress-v2','archives');
const stageFile=path.join(data,'stage-v3.json');
const importStatusFile=path.join(data,'import-local-v3.json');
const browserStatusFile=path.join(data,'import-browser-v3.json');
const maxRows=20000;
fs.mkdirSync(data,{recursive:true});
const sources=JSON.parse(fs.readFileSync(path.join(data,'sources.json'),'utf8'));
const nodeSource=sources.find(s=>s.type==='vault'&&s.name==='Prompt Vault Node');
if(!nodeSource)throw Error('Coffre Prompt Vault Node introuvable.');
const defaultVault=nodeSource.path.startsWith('~/')?path.join(os.homedir(),nodeSource.path.slice(2)):nodeSource.path;
if(!fs.existsSync(path.join(defaultVault,'index.json'))){fs.mkdirSync(defaultVault,{recursive:true});pv.createVault(defaultVault);pv.rebuildIndex(defaultVault);}
const preferences=createPreferencesStore(data,defaultVault);
function emptyStage(){return {rows:Object.create(null),conversations:Object.create(null),wanted:[]};}
function readStage(){try{const value=JSON.parse(fs.readFileSync(stageFile,'utf8'));return value&&value.rows&&value.conversations&&Array.isArray(value.wanted)?{rows:Object.assign(Object.create(null),value.rows),conversations:Object.assign(Object.create(null),value.conversations),wanted:value.wanted}:emptyStage();}catch(e){if(e.code==='ENOENT')return emptyStage();throw e;}}
function saveStage(stage){const tmp=stageFile+'.'+process.pid+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(stage),{mode:0o600});fs.renameSync(tmp,stageFile);}finally{try{fs.unlinkSync(tmp);}catch{}}}
const stage=readStage();
function response(requestId,data){const payload=Buffer.from(JSON.stringify({requestId,ok:true,data}));const size=Buffer.alloc(4);size.writeUInt32LE(payload.length);process.stdout.write(size);process.stdout.write(payload);}
function failure(requestId,error){const payload=Buffer.from(JSON.stringify({requestId,ok:false,error:String(error?.message||error)}));const size=Buffer.alloc(4);size.writeUInt32LE(payload.length);process.stdout.write(size);process.stdout.write(payload);}
async function route(pathname,body){
  if(pathname==='/api/capture-token')return {token:'native-messaging'};
  if(pathname==='/api/preferences')return preferences.read();
  if(pathname==='/api/source-status'){
    const provider=body?.provider;
    if(!['chatgpt','perplexity'].includes(provider))throw Error('Source navigateur invalide.');
    if(!['complete','error','running'].includes(body?.state))throw Error('État de source invalide.');
    let current={};try{current=JSON.parse(fs.readFileSync(browserStatusFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    current[provider]={state:body.state,checkedAt:new Date().toISOString(),listed:Math.max(0,Number(body.listed)||0),imported:Math.max(0,Number(body.imported)||0),message:String(body.message||'').slice(0,200)};
    const temp=browserStatusFile+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(current,null,2)+'\n',{mode:0o600});fs.renameSync(temp,browserStatusFile);
    return current[provider];
  }
  if(pathname==='/api/import-local/status'){try{return JSON.parse(fs.readFileSync(importStatusFile,'utf8'));}catch(e){if(e.code==='ENOENT')return {state:'idle'};throw e;}}
  if(pathname==='/api/import-local'){
    let state={state:'idle'};try{state=JSON.parse(fs.readFileSync(importStatusFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(state.state==='running'){try{process.kill(state.pid,0);return state;}catch{}}
    if(state.state==='starting'&&Date.now()-Date.parse(state.startedAt)<30000)return state;
    state={state:'starting',startedAt:new Date().toISOString(),sources:['codex','claude','gemini']};
    fs.writeFileSync(importStatusFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});
    const child=spawn(process.execPath,[path.join(root,'native-v3/import-local.mjs')],{cwd:root,detached:true,stdio:'ignore',env:{...process.env,PROMPTMISTRESS_DATA:data,PROMPTMISTRESS_VAULT:defaultVault}});
    child.unref();
    return state;
  }
  if(pathname==='/api/stage')return {rows:Object.values(stage.rows),receivedIds:Object.keys(stage.conversations),wanted:stage.wanted};
  if(pathname==='/api/stage/poll')return {wanted:stage.wanted};
  if(pathname.startsWith('/api/stage/rows-page')){const query=new URL(pathname,'native://host').searchParams;const offset=Math.max(0,Number(query.get('offset'))||0);const rows=Object.values(stage.rows);return {rows:rows.slice(offset,offset+200),total:rows.length,next:offset+200<rows.length?offset+200:null};}
  if(pathname==='/api/stage/progress')return {total:stage.wanted.length,captured:stage.wanted.filter(id=>Object.hasOwn(stage.conversations,id)).length,pending:stage.wanted.filter(id=>!Object.hasOwn(stage.conversations,id)).length};
  if(pathname==='/api/stage/rows'){
    if(!Array.isArray(body?.rows))throw Error('rows manquant.');
    let added=0;let count=Object.keys(stage.rows).length;
    for(const r of body.rows){if(typeof r?.id!=='string')continue;if(count>=maxRows&&!Object.hasOwn(stage.rows,r.id))throw Error(`Limite de ${maxRows} conversations atteinte.`);if(!Object.hasOwn(stage.rows,r.id))count++;stage.rows[r.id]={id:r.id,title:String(r.title??r.id),source:r.source==='perplexity'?'perplexity':'chatgpt'};added++;}
    saveStage(stage);return {rows:Object.keys(stage.rows).length,added};
  }
  if(pathname==='/api/stage/conversations'){
    if(!Array.isArray(body?.conversations))throw Error('conversations manquant.');
    for(const c of body.conversations){const id=c?.conversation_id||c?.id;if(typeof id==='string')stage.conversations[id]=c;}
    saveStage(stage);return {received:Object.keys(stage.conversations).length};
  }
  if(pathname==='/api/stage/wanted'){
    if(!Array.isArray(body?.ids))throw Error('ids manquant.');
    stage.wanted=[...new Set(body.ids.filter(id=>typeof id==='string'))].slice(0,maxRows);
    saveStage(stage);return {wanted:stage.wanted.length};
  }
  if(pathname==='/api/stage/clear'){
    stage.rows=Object.create(null);stage.conversations=Object.create(null);stage.wanted=[];saveStage(stage);return {cleared:true};
  }
  if(pathname==='/api/stage/import'||pathname==='/api/capture'){
    const direct=pathname==='/api/capture';
    const ids=Array.isArray(body?.ids)?body.ids:Object.keys(stage.conversations);
    const conversations=direct?(Array.isArray(body?.conversations)?body.conversations:[body]):ids.map(id=>stage.conversations[id]).filter(Boolean);
    if(!conversations.length)return {imported:0,skipped:0,error:'Aucun texte reçu à importer.'};
    const prefs=await preferences.read();
    const result=importCapture(prefs.destination,{conversations},{duplicates:prefs.duplicates});
    if(!direct){for(const c of conversations)delete stage.conversations[c.conversation_id||c.id];stage.wanted=[];saveStage(stage);}
    return {...result,afterImport:prefs.afterImport,destination:prefs.destination};
  }
  throw Error('Commande inconnue : '+pathname);
}
let input=Buffer.alloc(0);
let processing=Promise.resolve();
process.stdin.on('data',chunk=>{
  input=Buffer.concat([input,chunk]);
  while(input.length>=4){
    const size=input.readUInt32LE(0);
    if(size>64*1024*1024){process.stderr.write('Message trop volumineux.\n');process.exit(1);}
    if(input.length<4+size)break;
    const message=input.subarray(4,4+size);input=input.subarray(4+size);
    processing=processing.then(async()=>{
      let requestId;
      try{const request=JSON.parse(message.toString('utf8'));requestId=request.requestId;response(requestId,await route(request.path,request.body));}
      catch(error){failure(requestId,error);}
    });
  }
});
