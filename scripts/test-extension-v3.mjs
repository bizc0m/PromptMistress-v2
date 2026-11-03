import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const manifest=JSON.parse(fs.readFileSync('browser-extension-v3/manifest.json','utf8'));
const publicKey=Buffer.from(manifest.key,'base64');
const id=[...crypto.createHash('sha256').update(publicKey).digest().subarray(0,16)]
  .flatMap(byte=>[byte>>4,byte&15]).map(n=>String.fromCharCode(97+n)).join('');
assert.equal(id,fs.readFileSync('native-v3/extension-id.txt','utf8').trim());
assert(manifest.permissions.includes('nativeMessaging'));
assert(!manifest.host_permissions.some(origin=>origin.includes('127.0.0.1')||origin.includes('localhost')));
for(const file of ['background.js','content.js','capture.js','popup.js','snapshot.js']){
  execFileSync(process.execPath,['--check','browser-extension-v3/'+file]);
  assert(!fs.readFileSync('browser-extension-v3/'+file,'utf8').includes('127.0.0.1'));
}
assert(fs.readFileSync('browser-extension-v3/popup.html','utf8').includes('capture-page'));
console.log('Extension V3 : identifiant stable, messagerie native et absence de port local validés.');
