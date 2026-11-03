import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data=fs.mkdtempSync(path.join(os.tmpdir(),'promptmistress-startup-'));
const occupied=net.createServer();
let child;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const listen=(server,port)=>new Promise((resolve,reject)=>{
 server.once('error',reject);
 server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve(server.address().port)});
});
try{
 fs.writeFileSync(path.join(data,'sources.json'),JSON.stringify([
  {name:'Prompt Vault Node',type:'vault',path:path.join(data,'node')},
  {name:'Prompt Vault Python',type:'vault',path:path.join(data,'python')}
 ]));
 await listen(occupied,18432);
 const probe=net.createServer();
 const mainPort=await listen(probe,0);
 await new Promise(resolve=>probe.close(resolve));
 child=spawn(process.execPath,['scripts/server.mjs'],{
  cwd:root,env:{...process.env,PROMPTMISTRESS_DATA:data,PROMPTMISTRESS_NO_AUTOIMPORT:'1',PORT:String(mainPort)},
  stdio:['ignore','pipe','pipe']
 });
 let output='';
 child.stdout.on('data',chunk=>output+=chunk);
 child.stderr.on('data',chunk=>output+=chunk);
 const deadline=Date.now()+20000;
 while(!output.includes('READY ')&&child.exitCode===null&&Date.now()<deadline)await pause(100);
 assert.match(output,/READY /,'main service did not start: '+output);
 const health=await(await fetch(`http://127.0.0.1:${mainPort}/health`)).json();
 assert.equal(health.ready,true,JSON.stringify(health));
 for(const moduleURL of [health.node,health.python]){
  assert.notEqual(new URL(moduleURL).port,'18432');
  assert.equal((await fetch(moduleURL)).status,200);
 }
 console.log('PASS — démarrage avec 18432 occupé');
}finally{
 if(child){
  child.kill('SIGTERM');
  await new Promise(resolve=>{
   if(child.exitCode!==null||child.signalCode!==null)return resolve();
   child.once('exit',resolve);
   setTimeout(resolve,3000);
  });
 }
 await new Promise(resolve=>occupied.close(resolve));
 fs.rmSync(data,{recursive:true,force:true});
}
