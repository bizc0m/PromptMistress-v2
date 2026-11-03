import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'promptmistress-local-v3-'));
const home=path.join(temp,'home'),vault=path.join(temp,'vault'),data=path.join(temp,'data');
try{
 for(const dir of [home,vault,data,path.join(home,'.codex','sessions'),path.join(home,'.claude','projects'),path.join(home,'.gemini')])fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(home,'.codex','sessions','one.jsonl'),
  JSON.stringify({type:'session_meta',payload:{id:'codex-test'},timestamp:'2026-01-01T00:00:00Z'})+'\n'+
  JSON.stringify({type:'event_msg',payload:{type:'user_message',message:'Une question Codex locale.'},timestamp:'2026-01-01T00:00:01Z'})+'\n');
 fs.writeFileSync(path.join(home,'.claude','projects','one.jsonl'),
  JSON.stringify({sessionId:'claude-test',message:{role:'user',content:'Une question Claude locale.'},timestamp:'2026-01-01T00:00:00Z'})+'\n');
 fs.writeFileSync(path.join(home,'.gemini','one.jsonl'),
  JSON.stringify({sessionId:'gemini-test',type:'user',content:'Une question Gemini locale.',timestamp:'2026-01-01T00:00:00Z'})+'\n');
 const run=()=>execFileSync(process.execPath,['native-v3/import-local.mjs'],{cwd:process.cwd(),env:{...process.env,HOME:home,PROMPTMISTRESS_DATA:data,PROMPTMISTRESS_VAULT:vault},timeout:30000});
 run();
 const status=JSON.parse(fs.readFileSync(path.join(data,'import-local-v3.json')));
 assert.equal(status.state,'complete');
 assert.equal(status.imported,3);
 const index=JSON.parse(fs.readFileSync(path.join(vault,'index.json'))).items;
 assert.equal(index.length,3);
 assert.deepEqual(new Set(index.map(row=>row.source)),new Set(['codex','claude','gemini']));
 run();
 const repeat=JSON.parse(fs.readFileSync(path.join(data,'import-local-v3.json')));
 assert.equal(repeat.imported,0);
 assert.equal(repeat.unchanged,true);
 console.log('Import local V3 : Codex, Claude et Gemini synchronisés sans serveur.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
