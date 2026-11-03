// Import through the signed-in Perplexity tab in Comet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {importCapture} from '../scripts/capture.mjs';
import {createPreferencesStore} from '../scripts/preferences.mjs';

const data=process.env.PROMPTMISTRESS_DATA||path.join(os.homedir(),'.promptmistress-v2/archives');
const statusFile=path.join(data,'import-comet-perplexity-v3.json');
const lockFile=path.join(data,'import-comet-perplexity-v3.lock');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function status(value){
  fs.mkdirSync(data,{recursive:true});
  const temp=statusFile+'.'+process.pid+'.tmp';
  fs.writeFileSync(temp,JSON.stringify({...value,checkedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600});
  fs.renameSync(temp,statusFile);
}
function asString(value){return '"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n')+'"';}
function runAppleScript(script){
  return new Promise((resolve,reject)=>{
    const child=spawn('/usr/bin/osascript',['-'],{stdio:['pipe','pipe','pipe']});
    let output='',error='',settled=false;
    const fail=e=>{if(!settled){settled=true;reject(e);}};
    const timer=setTimeout(()=>{child.kill();fail(Error('Comet ne répond pas.'));},45000);
    child.stdout.on('data',chunk=>{output+=chunk;if(output.length>16*1024*1024){child.kill();fail(Error('Réponse Perplexity trop volumineuse.'));}});
    child.stderr.on('data',chunk=>{error+=chunk;});
    child.on('error',fail);
    child.on('close',code=>{clearTimeout(timer);if(settled)return;settled=true;code===0?resolve(output.trim()):reject(Error(error.trim().slice(0,300)||'AppleScript échoué'));});
    child.stdin.end(script);
  });
}
async function cometJavaScript(js){
  const script='tell application "Comet"\n'
    +'  repeat with w in windows\n'
    +'    repeat with t in tabs of w\n'
    +'      if URL of t starts with "https://www.perplexity.ai/" or URL of t starts with "https://perplexity.ai/" then\n'
    +'        return execute t javascript '+asString(js)+'\n'
    +'      end if\n'
    +'    end repeat\n'
    +'  end repeat\n'
    +'end tell\n'
    +'error "Ouvre Perplexity dans Comet et connecte-toi."\n';
  return runAppleScript(script);
}

export async function requestFromComet(url,body,{execute=cometJavaScript}={}){
  const key='__pmV3Perplexity';
  const q=JSON.stringify({url,body});
  const js=`(()=>{const k=${JSON.stringify(key)};window[k]={state:'running'};const q=${q};fetch(q.url,{credentials:'same-origin',method:q.body?'POST':'GET',headers:q.body?{'Content-Type':'application/json'}:{},body:q.body?JSON.stringify(q.body):undefined}).then(async r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(data=>window[k]={state:'complete',data}).catch(e=>window[k]={state:'error',message:String(e.message||e)});return 'started'})()`;
  if(await execute(js)!=='started')throw Error('Comet n’a pas lancé la requête Perplexity.');
  for(let i=0;i<80;i++){
    await sleep(400);
    const response=await execute(`JSON.stringify(window[${JSON.stringify(key)}]||{state:'missing'})`);
    let result;try{result=JSON.parse(response);}catch{throw Error('Réponse Comet illisible.');}
    if(result.state==='complete')return result.data;
    if(result.state==='error')throw Error(result.message||'Erreur Perplexity');
    if(result.state==='missing')throw Error('L’onglet Perplexity a été rechargé.');
  }
  throw Error('Perplexity ne répond pas après 32 secondes.');
}

export async function importPerplexity({request=requestFromComet,vault,duplicates='skip',onProgress=()=>{}}){
  const index=JSON.parse(fs.readFileSync(path.join(vault,'index.json'),'utf8'));
  const existing=new Set((index.items||index).filter(row=>row.source==='perplexity'&&row.source_id).map(row=>row.source_id));
  const seen=new Set();let listed=0,imported=0,skipped=0,failed=0;
  for(let offset=0;offset<20000;offset+=100){
    const response=await request('/rest/thread/list_ask_threads?version=2.18&source=default',{limit:100,offset,ascending:false,search_term:'',exclude_asi:false});
    const items=Array.isArray(response)?response:response?.data||response?.threads;
    if(!Array.isArray(items))throw Error('Liste Perplexity non reconnue.');
    for(const row of items){
      const id=row.slug||row.uuid||row.url_slug||row.id;
      if(typeof id!=='string'||seen.has(id))continue;
      seen.add(id);listed++;
      if(existing.has(id)&&duplicates==='skip'){skipped++;continue;}
      try{
        const raw=await request('/rest/thread/'+encodeURIComponent(id)+'?version=2.18&source=default');
        if(!Array.isArray(raw?.entries))throw Error('Conversation Perplexity non reconnue.');
        const result=importCapture(vault,{conversations:[{id,source:'perplexity',title:raw.title||row.title||id,url:'https://www.perplexity.ai/search/'+encodeURIComponent(id),raw,capture:{captured_at:new Date().toISOString(),scope:'returned-thread-entries',attachments:'not-downloaded'}}]},{duplicates});
        imported+=result.imported;skipped+=result.skipped;existing.add(id);
      }catch(error){
        if(/HTTP (401|403|429)/.test(String(error.message)))throw error;
        failed++;
      }
      onProgress({listed,imported,skipped,failed});
      await sleep(450);
    }
    onProgress({listed,imported,skipped,failed});
    if(items.length===0)return {listed,imported,skipped,failed};
    await sleep(500);
  }
  throw Error('Plus de 20 000 conversations : limite de sécurité atteinte.');
}

async function main(){
  fs.mkdirSync(data,{recursive:true});
  let lock;
  try{lock=fs.openSync(lockFile,'wx',0o600);}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const pid=Number(fs.readFileSync(lockFile,'utf8'));
    try{if(pid>0)process.kill(pid,0);return;}
    catch(checkError){if(checkError.code!=='ESRCH')return;}
    fs.rmSync(lockFile,{force:true});
    try{lock=fs.openSync(lockFile,'wx',0o600);}catch(retryError){if(retryError.code==='EEXIST')return;throw retryError;}
  }
  try{
    fs.writeFileSync(lock,String(process.pid));
    const sources=JSON.parse(fs.readFileSync(path.join(data,'sources.json'),'utf8'));
    const source=sources.find(row=>row.type==='vault'&&row.name==='Prompt Vault Node');
    if(!source)throw Error('Coffre Prompt Vault Node introuvable.');
    const defaultVault=source.path.startsWith('~/')?path.join(os.homedir(),source.path.slice(2)):source.path;
    const prefs=await createPreferencesStore(data,defaultVault).read();
    if(!prefs.autoImport){status({state:'disabled'});return;}
    const startedAt=new Date().toISOString();
    status({state:'running',startedAt,listed:0,imported:0,skipped:0,failed:0});
    try{
      const result=await importPerplexity({vault:prefs.destination,duplicates:prefs.duplicates,onProgress:counts=>status({state:'running',startedAt,...counts})});
      status({state:result.failed?'error':'complete',startedAt,...result,message:result.failed?`${result.failed} conversation(s) sans texte exploitable ou non récupérable(s).`:''});
      process.stdout.write(JSON.stringify(result)+'\n');
    }catch(error){status({state:'error',startedAt,message:String(error.message||error).slice(0,300)});process.exitCode=1;}
  }finally{fs.closeSync(lock);fs.rmSync(lockFile,{force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
