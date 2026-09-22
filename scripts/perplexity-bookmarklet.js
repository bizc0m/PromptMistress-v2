(function(){
 if(!['perplexity.ai','www.perplexity.ai'].includes(location.hostname)){alert('Lancez ce favori sur Perplexity.');return;}
 const PM='http://127.0.0.1:18431';
 const delay=()=>new Promise(r=>setTimeout(r,1000));
 let pmWin,peerNonce,pmToken='',busy=false,stop=false,controller,known=new Set();

 const send=(type,payload)=>pmWin?.postMessage({pm:'bridge-v1',nonce:peerNonce,type,payload},PM);

 async function api(url,body){
  controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
  try{const r=await fetch(url,{credentials:'same-origin',signal:controller.signal,...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}
  finally{clearTimeout(timer);}
 }

 async function list(){busy=true;stop=false;const notes=[];
  for(let offset=0;!stop;offset+=100){
   try{
    const d=await api('/rest/thread/list_ask_threads?version=2.18&source=default',{limit:100,offset,ascending:false,search_term:'',exclude_asi:false});
    const items=Array.isArray(d)?d:d.data||d.threads||[];
    if(!Array.isArray(items)||!items.length)break;
    const newRows=[];for(const t of items){const id=t.slug||t.uuid||t.url_slug||t.id;if(typeof id!=='string'||known.has(id))continue;known.add(id);newRows.push({id,title:String(t.title||t.query||t.name||id)});}
    send('rows',newRows);if(!newRows.length||items.length<100)break;
    await delay();
   }catch(e){notes.push('Threads : '+e.message);break;}
  }
  for(const a of document.querySelectorAll('a[href*="/search/"]')){try{const u=new URL(a.href);if(u.origin===location.origin&&u.pathname.startsWith('/search/')){const id=decodeURIComponent(u.pathname.slice(8));if(id&&!known.has(id)){known.add(id);send('rows',[{id,title:a.textContent.trim()||id}]);}}}catch{}}
  send('listed',{count:known.size,notes,stopped:stop});busy=false;
 }

 async function capture(ids){busy=true;stop=false;
  try{for(const id of ids){if(stop)break;if(!known.has(id))continue;
   try{send('progress',{id});
    const raw=await api('/rest/thread/'+encodeURIComponent(id)+'?version=2.18&source=default');
    if(!Array.isArray(raw.entries))throw Error('Format non reconnu');
    send('conversation',{id,source:'perplexity',title:raw.title||id,url:location.origin+'/search/'+encodeURIComponent(id),raw,capture:{captured_at:new Date().toISOString(),scope:'returned-thread-entries',attachments:'not-downloaded'}});
   }catch(e){if(stop)break;send('capture-error',{id,message:e.message});if(/HTTP (401|403|429)/.test(e.message)){stop=true;break;}}
   await delay();
  }}finally{busy=false;}
  send('done',{stopped:stop});
 }

 window.addEventListener('message',e=>{
  if(e.source!==pmWin||e.data?.pm!=='capture-ui')return;
  if(e.data.type==='connected'&&!peerNonce){peerNonce=e.data.nonce;send('hello');void list();return;}
  if(!peerNonce||e.data.nonce!==peerNonce)return;
  if(e.data.type==='capture'&&!busy&&Array.isArray(e.data.payload?.ids))void capture([...new Set(e.data.payload.ids)].slice(0,10000));
  else if(e.data.type==='stop'){stop=true;controller?.abort();}
 });

 (async()=>{
  try{const r=await fetch(PM+'/api/capture-token',{credentials:'omit'});if(!r.ok)throw Error();const d=await r.json();pmToken=d.token;}
  catch{alert('PromptMistress inaccessible ('+PM+'). Assurez-vous qu'il tourne.');return;}
  pmWin=window.open(PM+'/capture','pm-capture','popup,width=540,height=760');
  if(!pmWin){alert('Popup bloqué. Autorisez les popups pour perplexity.ai.');return;}
  pmWin.focus();
  let attempts=0;
  const retry=setInterval(()=>{
   if(peerNonce||attempts++>30){clearInterval(retry);return;}
   pmWin.postMessage({pm:'bridge-v1',nonce:'CONNECT',token:pmToken,source:'perplexity'},PM);
  },200);
 })();
})();
