import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if(!globalThis.crypto){globalThis.crypto=(await import('node:crypto')).webcrypto;}
const runtime=await fs.readFile(path.join(root,'vendor/go-wasm/wasm_exec.js'),'utf8');
vm.runInThisContext(runtime,{filename:'wasm_exec.js'});
const go=new globalThis.Go();
const wasm=await fs.readFile(path.join(root,'vendor/NyxBoolean/nyx-boolean.wasm'));
const {instance}=await WebAssembly.instantiate(wasm,go.importObject);
go.run(instance);
const deadline=Date.now()+8000;
while(typeof globalThis.nyxBooleanEvaluate!=='function'&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,20));}
if(typeof globalThis.nyxBooleanEvaluate!=='function')throw Error('NyxBoolean indisponible.');
const input=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const result=JSON.parse(globalThis.nyxBooleanEvaluate(JSON.stringify(input)));
process.stdout.write(JSON.stringify(result));
process.exit(0);
