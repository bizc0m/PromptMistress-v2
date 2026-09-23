(function(){
 if(location.hostname!=='chatgpt.com'){alert('Lancez ce favori sur ChatGPT.');return;}
 const PM='http://127.0.0.1:18431';
 const delay=()=>new Promise(r=>setTimeout(r,450));
 let pmWin,peerNonce,pmToken='',gptToken='',busy=false,stop=false,controller,known=new Set();

 const send=(type,payload)=>pmWin?.postMessage({pm:'bridge-v1',nonce:peerNonce,type,payload},PM);

 async function get(url){
  controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
  try{const r=await fetch(url,{credentials:'same-origin',headers:gptToken?{Authorization:'Bearer '+gptToken}:{},signal:controller.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(timer);}
 }

 async function list(){busy=true;stop=false;const notes=[];
  try{gptToken=(await get('/api/auth/session'))?.accessToken||'';}catch(e){notes.push('Auth: '+e.message);}
  for(const archived of[false,true]){let offset=0,cursor=null;const cursors=new Set();
   try{while(!stop){const q=new URLSearchParams({offset:String(offset),limit:'100',order:'updated',is_archived:String(archived)});if(cursor)q.set('cursor',cursor);
    const page=await get('/backend-api/conversations?'+q);
    const items=page.items||page.conversations||[];if(!Array.isArray(items)){notes.push('Format inattendu.');break;}
    const newRows=[];for(const item of items){const id=item.id||item.conversation_id;if(typeof id!=='string'||known.has(id))continue;known.add(id);newRows.push({id,title:String(item.title||'Sans titre'),archived,updated:item.update_time||''});}
    send('rows',newRows);offset+=items.length;if(!items.length)break;if(!newRows.length)break;
    const next=page.next_cursor||page.cursor;if(next){if(cursors.has(next))break;cursors.add(next);cursor=next;}else if(page.has_more===false||(typeof page.total==='number'&&offset>=page.total)||(page.has_more!==true&&items.length<100))break;
    await delay();
   }}catch(e){notes.push((archived?'Archives':'Conversations')+' : '+e.message);}
   if(stop)break;
  }
  send('listed',{count:known.size,notes,stopped:stop});busy=false;
 }

 async function capture(ids){busy=true;stop=false;
  try{for(const id of ids){if(stop)break;if(!known.has(id))continue;
   try{send('progress',{id});const c=await get('/backend-api/conversation/'+encodeURIComponent(id));
    if(!c.mapping||!Object.keys(c.mapping).length)throw Error('Conversation vide');
    send('conversation',{...c,id,conversation_id:id,url:'https://chatgpt.com/c/'+encodeURIComponent(id),capture:{format:'promptmistress.capture.v1',method:'api',captured_at:new Date().toISOString(),attachments:'not-downloaded'}});
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
  catch{alert('PromptMistress inaccessible ('+PM+'). Verifiez que le service tourne.');return;}
  // Open or reuse PM capture window
  pmWin=window.open(PM+'/capture','pm-capture','popup,width=540,height=760');
  if(!pmWin){alert('Popup bloqué. Autorisez les popups pour chatgpt.com.');return;}
  pmWin.focus();
  // Retry CONNECT until PM window responds (max 6s)
  let attempts=0;
  const retry=setInterval(()=>{
   if(peerNonce||attempts++>30){clearInterval(retry);return;}
   pmWin.postMessage({pm:'bridge-v1',nonce:'CONNECT',token:pmToken,source:'chatgpt'},PM);
  },200);
 })();
})();
