import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const field=(body,key)=>{const m=body.match(new RegExp('^'+key+':\\s*(.*)$','m'));if(!m)return '';let v=m[1].trim();try{return JSON.parse(v)}catch{return v.replace(/^['"]|['"]$/g,'')}};
export function groupRecords(records){const groups=new Map();for(const r of records){const key=r.provider+':'+r.identity;let item=groups.get(key);if(!item){item={key:digest(key),provider:r.provider,identity:r.identity,title:r.title,project:r.project||'',updated:r.updated||'',variants:[]};groups.set(key,item)}item.variants.push(r);if(r.updated>item.updated)item.updated=r.updated;}return [...groups.values()];}
export function loadArchive(configPath){
 const config=Array.isArray(configPath)?configPath:JSON.parse(fs.readFileSync(configPath,'utf8'));const records=[],errors=[],sources=[];let exporterData;
 for(const source of config){try{if(source.readError)throw Error(source.readError);let count=0;
  if(source.type==='exporter'){
   const text=source.content??fs.readFileSync(source.path,'utf8');const match=text.match(/<script[^>]*id="codex-data"[^>]*>([\s\S]*?)<\/script>/);if(!match)throw Error('Données codex-data absentes');const data=JSON.parse(match[1]);exporterData=data;
   for(const row of data.rows){records.push({editor:{module:'exporter',id:row.id},provider:'codex',identity:row.id,title:row.name,project:row.project,updated:row.updatedAt,source:source.name,path:source.path,sourceURL:row.deeplink||'',hasContent:!!(row.fullText||row.promptPreview),read:()=>row.fullText||row.promptPreview||'Cette entrée ne contient que les métadonnées.'});count++}
  }else if(source.type==='vault'){
   const index=JSON.parse(fs.readFileSync(path.join(source.path,'index.json'),'utf8'));for(const row of Array.isArray(index)?index:index.items){const file=path.resolve(source.path,row.path);if(!file.startsWith(path.resolve(source.path)+path.sep))throw Error('Chemin hors vault');const body=fs.readFileSync(file,'utf8');const identity=String(field(body,'source_id')||row.source_url||row.id);records.push({editor:source.name==='Prompt Vault Node'?{module:'node',id:row.id}:source.name==='Prompt Vault Python'?{module:'python',id:row.id}:null,provider:row.source,identity,title:row.title,project:row.project,updated:row.updated,source:source.name,path:file,sourceURL:row.source_url||'',hasContent:body.split('\n---\n').slice(1).join('').trim().length>0,read:()=>fs.readFileSync(file,'utf8')});count++}
  }sources.push({name:source.name,count,path:source.path});
 }catch(e){errors.push({source:source.name,message:e.message})}}
 const grouped=groupRecords(records).sort((a,b)=>b.updated.localeCompare(a.updated));const byId=new Map(grouped.map(g=>[g.key,g]));
 const rows=grouped.map(g=>({...g,variants:g.variants.map(({read,...v})=>v),hasContent:g.variants.some(v=>v.hasContent),copies:g.variants.length}));
 return {exporterData,summary:{input:records.length,unique:rows.length,duplicates:records.length-rows.length,groups:rows.filter(r=>r.copies>1).length,withContent:rows.filter(r=>r.hasContent).length,sources,errors},rows,detail:(key,variant=0)=>{const g=byId.get(key);if(!g)return null;const v=g.variants[variant];if(!v)return null;return {title:g.title,source:v.source,path:v.path,sourceURL:v.sourceURL,text:v.read()}}};
}
