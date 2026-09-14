// Embedded in both bookmarklets; credentials never leave the source origin.
async function captureAttachments(raw, options={}) {
 const limit=10*1024*1024,totalLimit=30*1024*1024,found=[],seen=new Set();let total=0;
 const walk=(v,depth=0)=>{if(typeof v==='string'){for(const m of v.matchAll(/\[([^\]]+)\]\((sandbox:\/[^)]+)\)/g)){if(found.length>=100)break;if(!seen.has(m[2])){seen.add(m[2]);found.push({name:m[1],ref:m[2],url:null});}}return;}if(!v||typeof v!=='object'||depth>30||found.length>=100)return;
  const url=v.download_url||v.downloadUrl||((v.filename||v.file_name||v.mime_type||v.content_type?.startsWith('image'))?(v.url||v.image_url):null);
  const ref=v.asset_pointer||v.file_id||v.fileId||((v.filename||v.file_name)&&typeof v.id==='string'&&/^file[-_]/.test(v.id)?v.id:null);
  if((typeof url==='string'||typeof ref==='string')&&(v.filename||v.file_name||ref||v.mime_type||v.content_type)){
   const key=ref||url;if(!seen.has(key)){seen.add(key);found.push({name:String(v.filename||v.file_name||v.name||ref||'piece-jointe').slice(0,180),ref:String(ref||'').slice(0,200),url:typeof url==='string'?url:null});}
  }
  for(const x of Object.values(v)){if(Array.isArray(x))x.forEach(a=>walk(a,depth+1));else walk(x,depth+1);}
 };walk(raw);
 const result=[];
 for(const f of found){const item={name:f.name,ref:f.ref,status:'unavailable'};result.push(item);
  if(options.stopped?.()){item.reason='Capture interrompue';continue;}
  if(!f.url&&location.hostname==='chatgpt.com'&&options.resolve){const id=f.ref.replace(/^sediment:\/\//,'');if(/^file[-_][a-zA-Z0-9_-]+$/.test(id)){try{const resolved=await options.resolve('/backend-api/files/'+encodeURIComponent(id)+'/download');f.url=resolved.download_url||resolved.url;}catch(e){item.reason=e.message;continue;}}}
  if(!f.url){item.reason='Aucune URL de téléchargement fournie';continue;}
  let u;try{u=new URL(f.url,location.origin);}catch{item.reason='URL invalide';continue;}
  const hosts=location.hostname==='chatgpt.com'?['chatgpt.com','oaiusercontent.com','openai.com']:['perplexity.ai','pplx.ai','pplxusercontent.com'];
  if(u.protocol!=='https:'||u.username||u.password||!hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))){item.reason='Hôte de fichier non pris en charge';continue;}
  const control=new AbortController(),timer=setTimeout(()=>control.abort(),30000);
  try{const same=u.origin===location.origin;const response=await fetch(u.href,{credentials:same?'same-origin':'omit',headers:same&&options.token?{Authorization:'Bearer '+options.token}:{},redirect:'error',signal:control.signal});
   if(!response.ok)throw Error('HTTP '+response.status);
   const mime=(response.headers.get('content-type')||'application/octet-stream').split(';')[0];if(/html|javascript/.test(mime))throw Error('Réponse non téléchargeable');
   if(Number(response.headers.get('content-length'))>limit)throw Error('Fichier supérieur à 10 Mo');
   const reader=response.body.getReader(),chunks=[];let size=0;
   try{while(true){if(options.stopped?.())throw Error('Capture interrompue');const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit||total+size>totalLimit)throw Error('Limite 10 Mo/fichier ou 30 Mo/conversation');chunks.push(value);}}finally{await reader.cancel();}
   let binary='';for(const chunk of chunks)for(let i=0;i<chunk.length;i+=8192)binary+=String.fromCharCode(...chunk.subarray(i,i+8192));
   item.data=btoa(binary);item.mime=mime;item.size=size;item.status='downloaded';total+=size;
  }catch(e){item.reason=e.message;}finally{clearTimeout(timer);}
 }
 return result;
}
