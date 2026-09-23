import {attachmentFile} from './attachments.mjs';
import crypto from 'node:crypto';
import {corpusPage} from './search-corpus.mjs';
import {importCapture} from './capture.mjs';
import {createPreferencesStore} from './preferences.mjs';
import http from 'node:http';
import {loadArchive} from './archive.mjs';
import {loadWorkspace} from './workspace.mjs';
let workspace;
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn,execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import {createRequire} from 'node:module';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pv=createRequire(import.meta.url)('../projects/project-a-chatvault/pv.js');
function expandHome(p){return typeof p==='string'&&p.startsWith('~')?path.join(os.homedir(),p.slice(1)):p;}
const data=process.env.PROMPTMISTRESS_DATA || path.join(root,'data/private');
// Keep already-open capture pages authorized across a local service restart.
const captureTokenFile=path.join(data,'.capture-token');
if(!fs.existsSync(captureTokenFile))fs.writeFileSync(captureTokenFile,crypto.randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
const captureToken=fs.readFileSync(captureTokenFile,'utf8').trim();
if(!/^[a-f0-9]{64}$/.test(captureToken))throw Error('Session de capture locale invalide.');
let archive;
async function getArchive(){if(!archive)archive=loadArchive(await effectiveSources());return archive;}
const sourcesFile=path.join(data,'sources.json');
if(!fs.existsSync(sourcesFile)){
 fs.mkdirSync(data,{recursive:true});
 const bundled=path.join(root,'data','private','sources.json');
 fs.writeFileSync(sourcesFile,fs.existsSync(bundled)?fs.readFileSync(bundled,'utf8'):JSON.stringify([{name:'Prompt Vault Node',type:'vault',path:'~/.promptmistress-v2/vaults/node'},{name:'Prompt Vault Python',type:'vault',path:'~/.promptmistress-v2/vaults/python'}],null,2));
}
const sourceConfig=JSON.parse(fs.readFileSync(sourcesFile,'utf8')).map(s=>s.path?{...s,path:expandHome(s.path)}:s);
function vaultSource(name){const found=sourceConfig.find(s=>s.type==='vault'&&s.name===name);if(!found)throw Error('Vault source absent: '+name);if(!fs.existsSync(path.join(found.path,'index.json'))){fs.mkdirSync(found.path,{recursive:true});pv.createVault(found.path);pv.rebuildIndex(found.path);}return found.path;}
const preferences=createPreferencesStore(data,vaultSource('Prompt Vault Node'));
const pendingSourceReads=new Map();
async function effectiveSources(){
 const prefs=await preferences.read();const sources=sourceConfig.some(s=>s.type==='vault'&&path.resolve(s.path)===path.resolve(prefs.destination))?sourceConfig:[...sourceConfig,{name:'Captures ChatGPT',type:'vault',path:prefs.destination,capture:true}];
 return Promise.all(sources.map(async s=>{if(s.type!=='exporter')return s;let timer;try{
  if(!pendingSourceReads.has(s.path)){const reading=fs.promises.readFile(s.path,'utf8');pendingSourceReads.set(s.path,reading);reading.then(()=>pendingSourceReads.delete(s.path),()=>pendingSourceReads.delete(s.path));}
  const content=await Promise.race([pendingSourceReads.get(s.path),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Lecture trop lente : réessayez avec Actualiser.')),30000);})]);return {...s,content};
 }catch(e){return {...s,readError:e.message};}finally{clearTimeout(timer);}}));
}
async function bodyJSON(req,max){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max)throw Error('Requête trop volumineuse.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString());}
const children=[];
let closing=false;
let server;
process.on("uncaughtException", error=>{console.error(error.message);for(const child of children)child.kill();process.exit(1)});
function stop(){if(closing)return;closing=true;for(const child of children)child.kill('SIGTERM');if(server)server.close(()=>process.exit(0));else process.exit(0);setTimeout(()=>process.exit(0),2000).unref();}
let nextPort=Number(process.env.PROMPTMISTRESS_MODULE_PORT||18432);
async function port(){return new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(nextPort++,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
async function launch(name,command,args,env={}){const p=await port();const child=spawn(command,args(p),{cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});children.push(child);child.stdout.on('data',()=>{});child.stderr.on('data',b=>process.stderr.write(`[${name}] ${b}`));let failed=false;child.on('error',()=>failed=true);child.on('exit',()=>failed=true);const url=`http://127.0.0.1:${p}/`;for(let n=0;n<60&&!failed;n++){try{const r=await fetch(url);if(r.ok)return {url,child};}catch{}await new Promise(r=>setTimeout(r,100));}return {url:null,child};}
const node=await launch('vault',process.execPath,p=>['projects/project-a-chatvault/pv.js','ui','--port',String(p),'--vault',vaultSource('Prompt Vault Node')]);
let pythonBin=process.env.PROMPTMISTRESS_PYTHON;if(!pythonBin){const candidates=[path.join(root,'..','..','Frameworks','Python3.framework','Versions','3.9','bin','python3'),path.join(root,'..','..','Frameworks','Python3.framework','Versions','3.13','bin','python3'),'python3','python'];for(const candidate of candidates){try{execSync(`command -v ${candidate}`,{shell:true,stdio:'ignore'});pythonBin=candidate;break;}catch{}}if(!pythonBin)pythonBin='python3';}
const python=await launch('python',pythonBin,p=>['-c','import sys; from pathlib import Path; from prompt_vault.ui.server import serve; serve(Path(sys.argv[1]), "127.0.0.1", int(sys.argv[2]))',vaultSource('Prompt Vault Python'),String(p)],{PYTHONPATH:path.join(root,'projects/project-b-python-prompt-vault/src')});
const files={'/scripts/attachment-capture.js':['scripts/attachment-capture.js','text/javascript; charset=utf-8'],'/scripts/workspace-view.mjs':['scripts/workspace-view.mjs','text/javascript; charset=utf-8'],'/scripts/zip.mjs':['scripts/zip.mjs','text/javascript; charset=utf-8'],'/scripts/workspace-rules-ui.js':['scripts/workspace-rules-ui.js','text/javascript; charset=utf-8'],'/scripts/workspace-rules.mjs':['scripts/workspace-rules.mjs','text/javascript; charset=utf-8'],'/scripts/message-content.mjs':['scripts/message-content.mjs','text/javascript; charset=utf-8'],'/scripts/perplexity-bookmarklet.js':['scripts/perplexity-bookmarklet.js','text/javascript; charset=utf-8'],'/scripts/capture-menu.js':['scripts/capture-menu.js','text/javascript; charset=utf-8'],'/scripts/search-highlights.mjs':['scripts/search-highlights.mjs','text/javascript; charset=utf-8'],'/scripts/nyx-boolean-client.js':['scripts/nyx-boolean-client.js','text/javascript; charset=utf-8'],'/scripts/nyx-boolean-worker.js':['scripts/nyx-boolean-worker.js','text/javascript; charset=utf-8'],'/vendor/go-wasm/wasm_exec.js':['vendor/go-wasm/wasm_exec.js','text/javascript; charset=utf-8'],'/vendor/NyxBoolean/nyx-boolean.wasm':['vendor/NyxBoolean/nyx-boolean.wasm','application/wasm'],'/scripts/explorer.mjs':['scripts/explorer.mjs','text/javascript; charset=utf-8'],'/scripts/preferences-ui.js':['scripts/preferences-ui.js','text/javascript; charset=utf-8'],'/workspace':['workspace.html','text/html; charset=utf-8'],'/scripts/workspace-ui.js':['scripts/workspace-ui.js','text/javascript; charset=utf-8'],'/styles/workspace.css':['styles/workspace.css','text/css; charset=utf-8'],'/scripts/unified.js':['scripts/unified.js','text/javascript; charset=utf-8'],'/fusion':['fusion.html','text/html; charset=utf-8'],'/scripts/shell-capture.js':['scripts/shell-capture.js','text/javascript; charset=utf-8'],'/scripts/capture-ui.js':['scripts/capture-ui.js','text/javascript; charset=utf-8'],'/scripts/chatgpt-download.js':['scripts/chatgpt-download.js','text/javascript; charset=utf-8'],'/styles/nyx.css':['styles/nyx.css','text/css; charset=utf-8'],'/capture':['capture.html','text/html; charset=utf-8'],'/scripts/chatgpt-bookmarklet.js':['scripts/chatgpt-bookmarklet.js','text/javascript; charset=utf-8'],'/scripts/exporter-connect.js':['scripts/exporter-connect.js','text/javascript; charset=utf-8'],'/library':['library.html','text/html; charset=utf-8'],'/styles/exporter-embed.css':['styles/exporter-embed.css','text/css; charset=utf-8'],'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/exporter':['projects/project-b-import/codex_history_public_import.html','text/html; charset=utf-8']};
const externalOrigins=new Set(['https://chatgpt.com','https://www.perplexity.ai','https://perplexity.ai']);
// Shared staging area: window names are not shared across origins, so ChatGPT and
// Perplexity cannot reach one browser window. They meet here instead.
const stage={rows:new Map(),conversations:new Map(),wanted:new Set()};
const STAGE_MAX_ROWS=20000;
server=http.createServer(async(req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;
 const reqOrigin=req.headers.origin||'';
 if(externalOrigins.has(reqOrigin)&&(pathname==='/api/capture-token'||pathname==='/api/capture'||pathname==='/api/preferences'||pathname.startsWith('/api/stage'))){res.setHeader('Access-Control-Allow-Origin',reqOrigin);res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Capture-Token');res.setHeader('Vary','Origin');if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}}
 if(pathname==='/api/capture-token'&&req.method==='GET'){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({token:captureToken}));}
 if(pathname.startsWith('/api/stage')){
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const localOrigin=`http://127.0.0.1:${server.address().port}`;
  const originOk=!req.headers.origin||req.headers.origin===localOrigin||externalOrigins.has(req.headers.origin);
  if(req.headers['x-capture-token']!==captureToken||!originOk){res.writeHead(403);return res.end(JSON.stringify({error:'Origine non autorisée.'}));}
  if(pathname==='/api/stage'&&req.method==='GET')return res.end(JSON.stringify({rows:[...stage.rows.values()],receivedIds:[...stage.conversations.keys()],wanted:[...stage.wanted]}));
  if(req.method!=='POST'){res.writeHead(405);return res.end(JSON.stringify({error:'Méthode non autorisée.'}));}
  let body;
  try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>100*1024*1024)throw Error('Maximum 100 Mo.');chunks.push(chunk);}body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}
  catch(e){res.writeHead(400);return res.end(JSON.stringify({error:e.message}));}
  try{
   if(pathname==='/api/stage/rows'){
    if(!Array.isArray(body.rows))throw Error('rows manquant.');
    for(const r of body.rows){if(typeof r?.id!=='string')continue;if(stage.rows.size>=STAGE_MAX_ROWS)break;stage.rows.set(r.id,{id:r.id,title:String(r.title??r.id),source:r.source==='perplexity'?'perplexity':'chatgpt'});}
    return res.end(JSON.stringify({rows:stage.rows.size}));
   }
   if(pathname==='/api/stage/conversations'){
    if(!Array.isArray(body.conversations))throw Error('conversations manquant.');
    for(const c of body.conversations){const id=c?.conversation_id||c?.id;if(typeof id!=='string')continue;stage.conversations.set(id,c);}
    return res.end(JSON.stringify({received:stage.conversations.size}));
   }
   if(pathname==='/api/stage/wanted'){
    if(!Array.isArray(body.ids))throw Error('ids manquant.');
    stage.wanted=new Set(body.ids.filter(i=>typeof i==='string').slice(0,STAGE_MAX_ROWS));
    return res.end(JSON.stringify({wanted:stage.wanted.size}));
   }
   if(pathname==='/api/stage/clear'){
    stage.rows.clear();stage.conversations.clear();stage.wanted.clear();
    return res.end(JSON.stringify({cleared:true}));
   }
   if(pathname==='/api/stage/import'){
    const ids=Array.isArray(body.ids)?body.ids:[...stage.conversations.keys()];
    const conversations=ids.map(i=>stage.conversations.get(i)).filter(Boolean);
    if(!conversations.length)return res.end(JSON.stringify({imported:0,skipped:0,error:'Aucun texte reçu à importer.'}));
    const prefs=await preferences.read();
    const result=importCapture(prefs.destination,{conversations},{duplicates:prefs.duplicates});
    for(const c of conversations)stage.conversations.delete(c.conversation_id||c.id);
    stage.wanted.clear();archive=undefined;workspace=undefined;
    return res.end(JSON.stringify({...result,afterImport:prefs.afterImport,destination:prefs.destination}));
   }
  }catch(e){res.writeHead(400);return res.end(JSON.stringify({error:e.message}));}
  res.writeHead(404);return res.end(JSON.stringify({error:'Inconnu.'}));
 }
 if(pathname==='/api/preferences'){
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 if(req.method==='GET'){try{return res.end(JSON.stringify(await preferences.read()));}catch(e){res.writeHead(409);return res.end(JSON.stringify({error:e.message,defaults:preferences.defaults}));}}
 if(req.method!=='POST'){res.writeHead(405);return res.end();}
 if(req.headers['x-capture-token']!==captureToken||req.headers.origin!==`http://127.0.0.1:${server.address().port}`){res.writeHead(403);return res.end(JSON.stringify({error:'Origine non autorisée.'}));}
 try{const result=await preferences.save(await bodyJSON(req,16384));archive=undefined;workspace=undefined;return res.end(JSON.stringify(result));}catch(e){res.writeHead(400);return res.end(JSON.stringify({error:e.message}));}
}
if(pathname==='/api/capture'&&req.method==='POST'){res.setHeader('Content-Type','application/json');const validOrigin=req.headers.origin===`http://127.0.0.1:${server.address().port}`||externalOrigins.has(req.headers.origin||'');if(req.headers['x-capture-token']!==captureToken||!validOrigin){res.writeHead(403);return res.end(JSON.stringify({error:'Origine non autorisée.'}));}try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>100*1024*1024)throw Error('Maximum 100 Mo.');chunks.push(chunk);}const prefs=await preferences.read();const result={...importCapture(prefs.destination,JSON.parse(Buffer.concat(chunks).toString()),{duplicates:prefs.duplicates}),afterImport:prefs.afterImport,destination:prefs.destination};archive=undefined;workspace=undefined;return res.end(JSON.stringify(result));}catch(e){res.writeHead(400);return res.end(JSON.stringify({error:e.message}));}}if(pathname==='/api/attachment'&&req.method==='GET'){try{const q=new URL(req.url,'http://localhost').searchParams;const a=attachmentFile(sourceConfig.filter(s=>s.type==='vault').map(s=>s.path),q.get('conversation'),q.get('hash')||'');if(!a){res.writeHead(404);return res.end('Fichier indisponible');}res.setHeader('Content-Type','application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(a.item.name));return fs.createReadStream(a.file).pipe(res);}catch{res.writeHead(500);return res.end('Fichier indisponible');}}if(req.method!=='GET'){res.writeHead(405);return res.end();}if(pathname==='/api/workspace'||pathname==='/api/workspace/detail'||pathname==='/api/workspace/corpus'||pathname==='/api/workspace/outputs'){
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 try{const q=new URL(req.url,'http://localhost').searchParams;if(!workspace||q.get('refresh')==='1')workspace=loadWorkspace(await effectiveSources());
 workspace.generation ||= crypto.randomUUID();
 if(pathname==='/api/workspace/corpus'||pathname==='/api/workspace/outputs'){if(q.get('generation')!==workspace.generation){res.writeHead(409);return res.end(JSON.stringify({error:'Sources actualisées : clique Actualiser.'}));}return res.end(JSON.stringify(pathname==='/api/workspace/outputs'?await workspace.outputs(Number(q.get('offset')||0)):await corpusPage(workspace,Number(q.get('offset')||0))));}
 const result=pathname==='/api/workspace'?{rows:workspace.rows,summary:workspace.summary,generation:workspace.generation}:workspace.detail(q.get('key'),Number(q.get('variant')||0));
 if(!result)res.writeHead(404);return res.end(JSON.stringify(result||{}));
 }catch(e){res.writeHead(503);return res.end(JSON.stringify({error:e.message}));}}
if(pathname==='/api/refresh-import'){res.setHeader('Content-Type','application/json');if(global.runImport){global.runImport();return res.end(JSON.stringify({status:'import lancé'}));}else return res.end(JSON.stringify({error:'import non disponible'}));}if(pathname==='/api/exporter'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');try{const payload=(await getArchive()).exporterData;if(!payload)throw Error('Source Codex Exporter indisponible ; les autres modules restent accessibles.');return res.end(JSON.stringify(payload));}catch(e){res.writeHead(503);return res.end(JSON.stringify({error:e.message}));}}if(pathname.startsWith('/api/archive')){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');try{if(pathname==='/api/archive'&&new URL(req.url,'http://localhost').searchParams.get('refresh')==='1')archive=undefined;const a=await getArchive();if(pathname==='/api/archive')return res.end(JSON.stringify({summary:a.summary,rows:a.rows}));if(pathname==='/api/archive/detail'){const query=new URL(req.url,'http://localhost').searchParams;const d=a.detail(query.get('key'),Number(query.get('variant')||0));if(d)return res.end(JSON.stringify(d));}res.writeHead(404);return res.end('{}');}catch(e){res.writeHead(503);return res.end(JSON.stringify({error:e.message}));}}if(pathname==='/health'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify({app:'PromptMistress',ready:!!node.url&&!!python.url&&node.child.exitCode===null&&python.child.exitCode===null,node:node.url||'/unavailable',python:python.url||'/unavailable'}));}if(pathname==='/unavailable'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<p>Ce moteur n’a pas démarré. Consultez le journal local de PromptMistress.</p>');}const file=files[pathname];if(!file){res.writeHead(404);return res.end('Not found');}res.setHeader('Content-Type',file[1]);let content=fs.readFileSync(path.join(root,file[0]));if(pathname==='/exporter')content=content.toString().replace('</head>','<link rel="stylesheet" href="/styles/exporter-embed.css"></head>').replace('</body>','<script src="/scripts/exporter-connect.js"></script></body>');res.end(content);});
server.on('error',e=>{console.error(e.message);for(const child of children)child.kill();process.exit(1)});
server.listen(Number(process.env.PORT||18431),'127.0.0.1',()=>console.log(`READY http://127.0.0.1:${server.address().port}/`));
if(process.env.PROMPTMISTRESS_NO_AUTOIMPORT!=='1'){
 const vaultPath=vaultSource('Prompt Vault Node');
 let importing=false;
 const sinceFile=path.join(vaultPath,'.last-import');
 function runImport(){
  if(importing)return;importing=true;
  const since=fs.existsSync(sinceFile)?fs.readFileSync(sinceFile,'utf8').trim():'';
  const launchAt=Date.now();
  const args=['projects/project-a-chatvault/pv.js','import','--source','all','--vault',vaultPath];
  if(since)args.push('--since',since);
  const imp=spawn(process.execPath,args,{cwd:root,stdio:['ignore','pipe','pipe']});
  children.push(imp);
  imp.stderr.on('data',b=>process.stderr.write(`[import] ${b}`));
  imp.on('exit',code=>{importing=false;if(code===0){fs.writeFileSync(sinceFile,String(launchAt));archive=undefined;workspace=undefined;console.log('[import] terminé, sources disque synchronisées');}else console.error(`[import] échec code ${code}`);});
 }
 runImport();
 global.runImport=runImport;
}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
if(process.stdin.isTTY){process.stdin.resume();process.stdin.on('end',stop);}
