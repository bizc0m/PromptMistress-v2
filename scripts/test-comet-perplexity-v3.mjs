import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pv from '../projects/project-a-chatvault/pv.js';
import {importPerplexity,requestFromComet} from '../native-v3/import-comet-perplexity.mjs';

const vault=fs.mkdtempSync(path.join(os.tmpdir(),'pm-comet-v3-test-'));
try{
  pv.createVault(vault);pv.rebuildIndex(vault);
  const calls=[];
  const request=async(url,body)=>{
    calls.push({url,body});
    if(url.includes('list_ask_threads'))return body.offset===0?[{slug:'sample-id',title:'Exemple'}]:[];
    return {title:'Exemple',entries:[{text:JSON.stringify([
      {step_type:'INITIAL_QUERY',content:{query:'Bonjour'}},
      {step_type:'FINAL',content:{answer:'Salut'}}
    ])}]};
  };
  assert.deepEqual(await importPerplexity({request,vault}),{listed:1,imported:1,skipped:0,failed:0});
  assert.deepEqual(await importPerplexity({request,vault}),{listed:1,imported:0,skipped:1,failed:0});
  assert.equal(calls.filter(call=>call.url.includes('/rest/thread/sample-id?')).length,1);
  const partial=await importPerplexity({vault,request:async (url,body)=>{
    if(url.includes('list_ask_threads'))return body.offset===0?[{slug:'empty-id'},{slug:'later-id'}]:[];
    if(url.includes('/empty-id?'))return {entries:[{text:'[]'}]};
    return {entries:[{text:JSON.stringify([{step_type:'INITIAL_QUERY',content:{query:'Question'}},{step_type:'FINAL',content:{answer:'Réponse'}}])}]};
  }});
  assert.deepEqual(partial,{listed:2,imported:1,skipped:0,failed:1});
  const sparse=await importPerplexity({vault,request:async (url,body)=>{
    if(url.includes('list_ask_threads'))return body.offset===0?[{slug:'sample-id'}]:body.offset===100?[{slug:'later-id'}]:[];
    throw Error('Conversation déjà importée : aucun téléchargement attendu');
  }});
  assert.deepEqual(sparse,{listed:2,imported:0,skipped:2,failed:0});
  let started=false;
  const result=await requestFromComet('/example',null,{execute:async js=>{
    if(js.includes("return 'started'")){started=true;return 'started';}
    return JSON.stringify({state:'complete',data:{ok:true}});
  }});
  assert.equal(started,true);
  assert.deepEqual(result,{ok:true});
  console.log('Comet Perplexity V3 : requêtes, import et reprise sans doublon validés.');
}finally{fs.rmSync(vault,{recursive:true,force:true});}
