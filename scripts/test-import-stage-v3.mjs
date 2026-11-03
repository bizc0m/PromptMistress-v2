import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'promptmistress-stage-v3-'));
const bundle=path.resolve('dist/PromptMistress-V3-preview.app/Contents/Resources');
const node=path.join(bundle,'bin/node');
const vault=path.join(temp,'vault'),data=path.join(temp,'data');
fs.mkdirSync(vault);fs.mkdirSync(data);
try{
 execFileSync(node,[path.join(bundle,'app/projects/project-a-chatvault/pv.js'),'rebuild-index','--vault',vault]);
 const stage={rows:{one:{id:'one',title:'Premier',source:'chatgpt'},two:{id:'two',title:'Second',source:'chatgpt'}},conversations:{one:{conversation_id:'one',title:'Premier',mapping:{a:{message:{author:{role:'user'},content:{parts:['Question de test.']}}}}},two:{conversation_id:'two',title:'Second',mapping:{a:{message:{author:{role:'user'},content:{parts:['Autre question.']}}}}}},wanted:['one','two']};
 fs.writeFileSync(path.join(data,'stage-v3.json'),JSON.stringify(stage));
 const env={...process.env,PROMPTMISTRESS_DATA:data,PROMPTMISTRESS_VAULT:vault,PROMPTMISTRESS_STAGE_IDS:JSON.stringify(['one'])};
 const result=JSON.parse(execFileSync(node,[path.join(bundle,'app/native-v3/import-stage.mjs')],{encoding:'utf8',env}));
 assert.equal(result.imported,1);
 const remaining=JSON.parse(fs.readFileSync(path.join(data,'stage-v3.json'),'utf8'));
 assert.equal(remaining.conversations.one,undefined);
 assert.ok(remaining.conversations.two);
 assert.deepEqual(remaining.wanted,['two']);
 console.log('Import des captures V3 : sélection et conservation des autres captures validées.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
