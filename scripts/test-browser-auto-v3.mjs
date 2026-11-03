import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'promptmistress-browser-auto-'));
const resources=path.resolve('dist/PromptMistress-V3-preview.app/Contents/Resources');
const vault=path.join(temp,'vault'),data=path.join(temp,'data'),binary=path.join(temp,'browser-auto-test');
try{
 fs.mkdirSync(vault);fs.mkdirSync(data);
 execFileSync(path.join(resources,'bin/node'),[path.join(resources,'app/projects/project-a-chatvault/pv.js'),'rebuild-index','--vault',vault]);
 execFileSync('swiftc',['native-v3/BrowserVisibleCapture.swift','native-v3/BrowserAutoImporter.swift','native-v3/tests/main.swift','-o',binary]);
 execFileSync(binary,[resources,data,vault],{timeout:15000});
 const index=JSON.parse(fs.readFileSync(path.join(vault,'index.json'))).items;
 assert.equal(index.length,1);
 assert.equal(index[0].source,'web-claude-ai');
 const body=fs.readFileSync(path.join(vault,index[0].path),'utf8');
 assert.match(body,/résumé complet/);
 assert.match(body,/deuxième réponse/);
 console.log('Capture navigateur V3 : page visible importée puis mise à jour sans doublon.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
