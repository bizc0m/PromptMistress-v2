import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {importCapture} from '../scripts/capture.mjs';
import {createPreferencesStore} from '../scripts/preferences.mjs';

const data=process.env.PROMPTMISTRESS_DATA||path.join(os.homedir(),'.promptmistress-v2','archives');
const vault=process.env.PROMPTMISTRESS_VAULT;
if(!vault)throw Error('Coffre de destination indisponible.');
const ids=JSON.parse(process.env.PROMPTMISTRESS_STAGE_IDS||'[]');
if(!Array.isArray(ids)||!ids.every(id=>typeof id==='string'))throw Error('Sélection invalide.');
const stagePath=path.join(data,'stage-v3.json');
const stage=JSON.parse(fs.readFileSync(stagePath,'utf8'));
const conversations=ids.map(id=>stage.conversations?.[id]).filter(Boolean);
if(!conversations.length)throw Error('Aucun texte reçu dans la sélection.');
const prefs=await createPreferencesStore(data,vault).read();
const result=importCapture(prefs.destination,{conversations},{duplicates:prefs.duplicates});
for(const id of ids)delete stage.conversations[id];
stage.wanted=(stage.wanted||[]).filter(id=>!ids.includes(id));
const temporary=stagePath+'.'+process.pid+'.tmp';
try{fs.writeFileSync(temporary,JSON.stringify(stage),{mode:0o600});fs.renameSync(temporary,stagePath);}finally{try{fs.unlinkSync(temporary);}catch{}}
process.stdout.write(JSON.stringify({...result,destination:prefs.destination})+'\n');
