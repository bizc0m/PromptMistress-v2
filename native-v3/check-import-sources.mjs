import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const extensionId='iklpeopdgonmdeldkncapehpmjfobhke';
const hostName='com.bizc0m.promptmistress.v3.json';
const browserFolders=[['Comet','Comet'],['Chrome','Google/Chrome'],['Edge','Microsoft Edge']];
const localFolders=[['Codex','.codex/sessions'],['Claude','.claude/projects'],['Gemini','.gemini']];
const sourceNames=['ChatGPT','Perplexity'];

function readJSON(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
function readableDirectory(file){try{fs.accessSync(file,fs.constants.R_OK);return fs.statSync(file).isDirectory();}catch{return false;}}
function browserStatus(home,name,folder){
  const base=path.join(home,'Library/Application Support',folder);
  const manifest=readJSON(path.join(base,'NativeMessagingHosts',hostName));
  const hostReady=manifest?.name==='com.bizc0m.promptmistress.v3'&&
    manifest?.allowed_origins?.includes(`chrome-extension://${extensionId}/`)&&
    typeof manifest.path==='string'&&fs.existsSync(manifest.path);
  let profile='';
  for(const directory of ['Default',...Array.from({length:30},(_,i)=>`Profile ${i+1}`)]){
    const settings=readJSON(path.join(base,directory,'Secure Preferences'))?.extensions?.settings?.[extensionId];
    if(settings&&settings.state!==0&&Array.isArray(settings.disable_reasons)&&settings.disable_reasons.length===0&&typeof settings.path==='string'&&fs.existsSync(settings.path)){
      profile=directory;break;
    }
  }
  return {name,installed:fs.existsSync(base),hostReady:Boolean(hostReady),extensionReady:Boolean(profile),profile,ready:Boolean(hostReady&&profile)};
}
export function checkImportSources({home=os.homedir(),data=path.join(home,'.promptmistress-v2/archives'),now=new Date()}={}){
  const local=localFolders.map(([name,folder])=>{
    const available=readableDirectory(path.join(home,folder));
    return {name,state:available?'ready':'missing',detail:available?'Dossier local accessible':`Dossier ${folder} absent ou illisible`};
  });
  const browsers=browserFolders.map(([name,folder])=>browserStatus(home,name,folder)).filter(browser=>browser.installed);
  const prefs=readJSON(path.join(data,'preferences.json'))||{};
  const browserHistory=readJSON(path.join(data,'import-browser-v3.json'))||{};
  const cometPerplexity=readJSON(path.join(data,'import-comet-perplexity-v3.json'));
  const browserReady=browsers.some(browser=>browser.ready);
  const remote=sourceNames.map(name=>{
    const extensionReport=browserHistory[name.toLowerCase()];
    const last=name==='Perplexity'&&cometPerplexity&&
      Date.parse(cometPerplexity.checkedAt)>Date.parse(extensionReport?.checkedAt||0)
      ? cometPerplexity : extensionReport;
    if(prefs.autoImport===false)return {name,state:'disabled',detail:'Import automatique désactivé'};
    if(!browserReady)return {name,state:'missing',detail:'Extension et pont natif absents dans les navigateurs détectés'};
    if(last?.state==='error')return {name,state:'error',detail:`Dernier essai en erreur : ${String(last.message||'erreur inconnue').slice(0,120)}`};
    if(last?.state==='running'&&Date.parse(last.checkedAt)>now.getTime()-30*60*1000)
      return {name,state:'running',detail:`Import en cours depuis ${last.checkedAt}`};
    if(last?.state==='complete'&&Date.parse(last.checkedAt)>now.getTime()-24*60*60*1000)
      return {name,state:'ready',detail:`Dernier contrôle réussi : ${last.checkedAt} · ${Number(last.listed)||0} conversations repérées`};
    return {name,state:'pending',detail:'Pont prêt ; session du site à vérifier dans le navigateur'};
  });
  const sources=[...local,...remote];
  return {checkedAt:now.toISOString(),sources,browsers,ready:sources.filter(source=>source.state==='ready').length,total:sources.length};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const data=process.env.PROMPTMISTRESS_DATA||path.join(os.homedir(),'.promptmistress-v2/archives');
  const report=checkImportSources({data});
  fs.mkdirSync(data,{recursive:true});
  const file=path.join(data,'import-health-v3.json');
  const temp=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  fs.renameSync(temp,file);
  process.stdout.write(JSON.stringify(report)+'\n');
}
