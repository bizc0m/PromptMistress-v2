export function booleanDocument(row,annotation){
 return {Key:row.key,Fields:[row.title,row.project,annotation.note,...annotation.folders||[]].filter(Boolean),Tags:(annotation.tags||[]).filter(t=>t.startsWith('#')).map(t=>t.slice(1)),Entities:(annotation.tags||[]).filter(t=>t.startsWith('@')).map(t=>t.slice(1))};
}
export function createBooleanSearch(){
 let worker=null,serial=0,pending=null;
 function cancel(reason=new Error('Recherche remplacée.')){if(pending){clearTimeout(pending.timer);pending.reject(reason);pending=null;}worker?.terminate();worker=null;}
 return {cancel,search(Query,Documents){cancel();return new Promise((resolve,reject)=>{
  const id=++serial;worker=new Worker('/scripts/nyx-boolean-worker.js');
  const fail=error=>cancel(error);
  const timer=setTimeout(()=>fail(new Error('Recherche trop longue : précise les critères.')),30000);
  pending={reject,timer};
  worker.onerror=()=>fail(new Error('Impossible de charger NyxBoolean.'));
  worker.onmessage=({data})=>{if(data.id!==id)return;clearTimeout(timer);pending=null;if(data.error)reject(new Error('NyxBoolean : '+data.error));else {const keys=new Set(data.keys);keys.terms=data.terms||[];resolve(keys);}};
  worker.postMessage({id,request:{Query,Documents}});
 });}};
}
