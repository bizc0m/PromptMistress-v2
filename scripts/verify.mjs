import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appDir=path.join(process.env.HOME,'.promptmistress-v2','PromptMistress.app');
const distDir=path.join(root,'dist');

let failures=0;
function ok(label){console.log('  ✓',label);}
function fail(label,err){console.error('  ✗',label,err?.message||err);failures++;}

async function req(url,method='GET',body){
  const opts={method,headers:{}};
  if(body){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body);}
  const r=await fetch(url,opts);
  const text=await r.text();
  let json;if(r.headers.get('content-type')?.includes('application/json')){try{json=JSON.parse(text);}catch{}}
  return {status:r.status,json,text};
}

function check(cond,label){if(cond){ok(label);}else{fail(label);}}

console.log('TEST PromptMistress v2');

// 1. Structure repo
console.log('\nStructure');
check(fs.existsSync(path.join(root,'package.json')),'package.json');
check(fs.existsSync(path.join(root,'scripts','server.mjs')),'scripts/server.mjs');
check(fs.existsSync(path.join(root,'native','PromptMistress.swift')),'native/PromptMistress.swift');
check(fs.existsSync(path.join(root,'browser-extension','manifest.json')),'browser-extension/manifest.json');
check(fs.existsSync(path.join(root,'browser-extension','content.js')),'browser-extension/content.js');
check(fs.existsSync(path.join(root,'browser-extension','icons','icon128.png')),'browser-extension/icons/icon128.png');

// 2. Serveur local
console.log('\nServeur local');
try{
  const health=await req('http://127.0.0.1:18431/health');
  check(health.status===200&&health.json?.app==='PromptMistress','/health répond');
  check(health.json?.ready===true,'Node + Python démarrés');
  const prefs=await req('http://127.0.0.1:18431/api/preferences');
  check(prefs.status===200&&prefs.json?.destination,'/api/preferences répond');
  const archive=await req('http://127.0.0.1:18431/api/archive');
  check(archive.status===200,'/api/archive répond');
  const workspace=await req('http://127.0.0.1:18431/api/workspace');
  check(workspace.status===200&&Array.isArray(workspace.json?.rows),'/api/workspace répond');
}catch(e){fail('Serveur local injoignable',e);}

// 3. App buildée
console.log('\nApp macOS');
try{
  check(fs.existsSync(appDir),'PromptMistress.app installée');
  check(fs.existsSync(path.join(appDir,'Contents','MacOS','PromptMistress')),'binaire Swift');
  check(fs.existsSync(path.join(appDir,'Contents','Resources','bin','node')),'Node embarqué');
  check(fs.existsSync(path.join(appDir,'Contents','Resources','Python3','bin','python3')),'Python embarqué');
  check(fs.existsSync(path.join(appDir,'Contents','Resources','Runtime.plist')),'Runtime.plist');
  const sign=execSync(`codesign -dv "${appDir}" 2>&1`,{encoding:'utf8'});
  check(sign.includes('Signature=')||sign.includes('adhoc')||sign.includes('Apple Development')||sign.includes('Developer ID'),'signature présente');
} catch(e){fail('Vérification app',e);}

// 4. Distribution
console.log('\nDistribution');
check(fs.existsSync(path.join(distDir,'PromptMistress-0.2.0-macOS.zip')),'.zip généré');
check(fs.existsSync(path.join(distDir,'PromptMistress-0.2.0-macOS.dmg')),'.dmg généré');

// 5. Scripts bookmarklet accessibles
console.log('\nBookmarklets');
for(const name of ['chatgpt-bookmarklet.js','perplexity-bookmarklet.js','capture-menu.js','attachment-capture.js']){
  const r=await req(`http://127.0.0.1:18431/scripts/${name}`);
  check(r.status===200&&r.text.length>50,`/scripts/${name} accessible`);
}

// 6. Extension valide
console.log('\nExtension');
try{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'browser-extension','manifest.json'),'utf8'));
  check(manifest.manifest_version===3,'manifest V3');
  check(Array.isArray(manifest.content_scripts)&&manifest.content_scripts.length>0,'content_scripts définis');
  check(manifest.permissions?.includes('activeTab'),'permission activeTab');
} catch(e){fail('Manifest extension',e);}

console.log('\n'+(failures?'FAIL':'PASS')+' — '+failures+' échec(s)');
process.exit(failures?1:0);
