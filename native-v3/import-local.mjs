// On-demand import of local Codex, Claude and Gemini sessions. No listener is started.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const run=promisify(execFile);
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data=process.env.PROMPTMISTRESS_DATA || path.join(os.homedir(),'.promptmistress-v2','archives');
const vault=process.env.PROMPTMISTRESS_VAULT;
const statusFile=path.join(data,'import-local-v3.json');
const sinceFile=path.join(vault,'.last-import');
const startedAt=new Date().toISOString();
function hasNewSessions(root,since){
 const pending=[root];
 while(pending.length){
  const dir=pending.pop();
  let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{continue;}
  for(const entry of entries){
   const file=path.join(dir,entry.name);
   if(entry.isDirectory())pending.push(file);
   else if(entry.isFile()&&file.endsWith('.jsonl')&&fs.statSync(file).mtimeMs>since)return true;
  }
 }
 return false;
}
function status(value){
 const temp=statusFile+'.'+process.pid+'.tmp';
 fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
 fs.renameSync(temp,statusFile);
}
try{
 if(!vault||!path.isAbsolute(vault))throw Error('Coffre local invalide.');
 const since=fs.existsSync(sinceFile)?fs.readFileSync(sinceFile,'utf8').trim():'';
 const began=Date.now();
 status({state:'running',startedAt,pid:process.pid,sources:['codex','claude','gemini']});
 if(since && ![
  path.join(os.homedir(),'.codex','sessions'),
  path.join(os.homedir(),'.claude','projects'),
  path.join(os.homedir(),'.gemini')
 ].some(root=>hasNewSessions(root,Number(since)))){
  status({state:'complete',startedAt,completedAt:new Date().toISOString(),imported:0,unchanged:true,sources:['codex','claude','gemini']});
  process.exit(0);
 }
 const args=['projects/project-a-chatvault/pv.js','import','--source','all','--vault',vault];
 if(since)args.push('--since',since);
 const {stdout}=await run(process.execPath,args,{cwd:root,maxBuffer:1024*1024});
 fs.writeFileSync(sinceFile,String(began));
 const imported=Number(stdout.match(/^imported:\s*(\d+)/m)?.[1]||0);
 const indexed=Number(stdout.match(/^indexed:\s*(\d+)/m)?.[1]||0);
 status({state:'complete',startedAt,completedAt:new Date().toISOString(),imported,indexed,sources:['codex','claude','gemini']});
}catch(error){
 status({state:'failed',startedAt,completedAt:new Date().toISOString(),error:String(error.stderr||error.message||error).slice(0,1000)});
 process.exitCode=1;
}
