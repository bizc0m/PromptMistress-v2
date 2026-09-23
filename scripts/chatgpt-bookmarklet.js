(function(){
 if(location.hostname!=='chatgpt.com'){alert('Lancez ce favori sur ChatGPT.');return;}
 const old=document.getElementById('pm-capture-badge');if(old){old.remove();return;}
 const PM='http://127.0.0.1:18431';
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 let pmToken='',gptToken='',known=new Set(),sent=new Set(),stop=false;

 const badge=document.createElement('div');badge.id='pm-capture-badge';
 badge.style.cssText='position:fixed;bottom:18px;right:18px;z-index:2147483647;background:#101017;color:#F2F2F5;border:1px solid #30323D;border-radius:8px;padding:10px 12px;font:12px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 12px 40px #0009;max-width:300px';
 const label=document.createElement('div');label.textContent='PM · connexion…';
 const close=document.createElement('button');close.textContent='Arrêter';
 close.style.cssText='margin-top:8px;font:inherit;padding:4px 8px;border:1px solid #30323D;border-radius:5px;background:#17283E;color:#80BDFF;cursor:pointer';
 close.onclick=()=>{stop=true;badge.remove();};
 badge.append(label,close);document.body.appendChild(badge);
 const say=t=>{label.textContent='PM · '+t;};

 async function pm(path,body){
  const r=await fetch(PM+path,{method:body?'POST':'GET',headers:{'X-Capture-Token':pmToken,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(!r.ok)throw Error('PM HTTP '+r.status);return await r.json();
 }
 async function gpt(url){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),30000);
  try{const r=await fetch(url,{credentials:'same-origin',headers:gptToken?{Authorization:'Bearer '+gptToken}:{},signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(t);}
 }

 async function list(){
  try{gptToken=(await gpt('/api/auth/session'))?.accessToken||'';}catch{}
  for(const archived of[false,true]){let offset=0,cursor=null;const seen=new Set();
   try{while(!stop){
    const q=new URLSearchParams({offset:String(offset),limit:'100',order:'updated',is_archived:String(archived)});if(cursor)q.set('cursor',cursor);
    const page=await gpt('/backend-api/conversations?'+q);
    const items=page.items||page.conversations||[];if(!Array.isArray(items)||!items.length)break;
    const fresh=[];for(const it of items){const id=it.id||it.conversation_id;if(typeof id!=='string'||known.has(id))continue;known.add(id);fresh.push({id,title:String(it.title||'Sans titre'),source:'chatgpt'});}
    if(fresh.length)await pm('/api/stage/rows',{rows:fresh});
    say(known.size+' conversation(s) listées');
    offset+=items.length;if(!fresh.length)break;
    const next=page.next_cursor||page.cursor;
    if(next){if(seen.has(next))break;seen.add(next);cursor=next;}
    else if(page.has_more===false||(page.has_more!==true&&items.length<100))break;
    await delay(450);
   }}catch(e){say('liste: '+e.message);}
   if(stop)break;
  }
 }

 async function serve(){
  while(!stop){
   try{
    const s=await pm('/api/stage');
    const todo=(s.wanted||[]).filter(id=>known.has(id)&&!sent.has(id));
    for(const id of todo){
     if(stop)break;
     say('récupération '+id.slice(0,8)+'…');
     try{
      const c=await gpt('/backend-api/conversation/'+encodeURIComponent(id));
      if(!c.mapping||!Object.keys(c.mapping).length)throw Error('vide');
      await pm('/api/stage/conversations',{conversations:[{...c,id,conversation_id:id,url:'https://chatgpt.com/c/'+encodeURIComponent(id),capture:{format:'promptmistress.capture.v1',method:'api',captured_at:new Date().toISOString(),attachments:'not-downloaded'}}]});
      sent.add(id);say(sent.size+' envoyée(s) à PromptMistress');
     }catch(e){sent.add(id);say('erreur '+id.slice(0,8)+': '+e.message);}
     await delay(450);
    }
   }catch(e){say(e.message);}
   await delay(1500);
  }
 }

 (async()=>{
  try{pmToken=(await(await fetch(PM+'/api/capture-token',{credentials:'omit'})).json()).token;}
  catch{say('PromptMistress injoignable');label.textContent='PM injoignable sur '+PM;return;}
  window.open(PM+'/capture','_blank');
  say('listage…');
  await list();
  say(known.size+' listées · en attente de votre sélection dans PromptMistress');
  await serve();
 })();
})();
