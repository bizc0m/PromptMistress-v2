export async function corpusPage(workspace,offset=0,size=20){
 if(!Number.isInteger(offset)||offset<0)throw Error('Position de lecture invalide.');
 const variants=workspace.rows.flatMap(r=>r.variants.map((v,variant)=>({key:r.key,variant,hasContent:v.hasContent})));
 const documents=[],errors=[];
 for(const item of variants.slice(offset,offset+size)){
  if(item.hasContent){try{const detail=await workspace.detail(item.key,item.variant);if(!detail)throw Error('Contenu absent');documents.push({key:item.key,variant:item.variant,text:detail.text});}catch(e){errors.push({...item,error:e.message});}}
  await new Promise(resolve=>setImmediate(resolve));
 }
 return {documents,errors,total:variants.length,next:offset+size<variants.length?offset+size:null};
}
