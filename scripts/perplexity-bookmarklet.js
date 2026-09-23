(function(){
 if(!['perplexity.ai','www.perplexity.ai'].includes(location.hostname)){alert('Lancez ce favori sur Perplexity.');return;}
 const old=document.getElementById('pm-capture-badge');if(old){old.remove();return;}
 const PM='http://127.0.0.1:18431';
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 let pmToken='',known=new Set(),sent=new Set(),stop=false;

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
 async function per(url,body){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),30000);
  try{const r=await fetch(url,{credentials:'same-origin',signal:c.signal,...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(t);}
 }

 async function list(){
  for(let offset=0;!stop;offset+=100){
   try{
    const d=await per('/rest/thread/list_ask_threads?version=2.18&source=default',{limit:100,offset,ascending:false,search_term:'',exclude_asi:false});
    const items=Array.isArray(d)?d:d.data||d.threads||[];
    if(!Array.isArray(items)||!items.length)break;
    const fresh=[];for(const t of items){const id=t.slug||t.uuid||t.url_slug||t.id;if(typeof id!=='string'||known.has(id))continue;known.add(id);fresh.push({id,title:String(t.title||t.query||t.name||id),source:'perplexity'});}
    if(fresh.length)await pm('/api/stage/rows',{rows:fresh});
    say(known.size+' recherche(s) listées');
    if(!fresh.length||items.length<100)break;
    await delay(1000);
   }catch(e){say('liste: '+e.message);break;}
  }
  // Supplement with links visible on the page
  const extra=[];
  for(const a of document.querySelectorAll('a[href*="/search/"]')){
   try{const u=new URL(a.href);if(u.origin!==location.origin||!u.pathname.startsWith('/search/'))continue;
    const id=decodeURIComponent(u.pathname.slice(8));if(!id||known.has(id))continue;known.add(id);extra.push({id,title:a.textContent.trim()||id,source:'perplexity'});}catch{}
  }
  if(extra.length)await pm('/api/stage/rows',{rows:extra});
 }

 async function serve(){
  while(!stop){
   try{
    const s=await pm('/api/stage');
    const todo=(s.wanted||[]).filter(id=>known.has(id)&&!sent.has(id));
    for(const id of todo){
     if(stop)break;
     say('récupération '+id.slice(0,12)+'…');
     try{
      const raw=await per('/rest/thread/'+encodeURIComponent(id)+'?version=2.18&source=default');
      if(!Array.isArray(raw.entries))throw Error('format non reconnu');
      await pm('/api/stage/conversations',{conversations:[{id,source:'perplexity',title:raw.title||id,url:location.origin+'/search/'+encodeURIComponent(id),raw,capture:{captured_at:new Date().toISOString(),scope:'returned-thread-entries',attachments:'not-downloaded'}}]});
      sent.add(id);say(sent.size+' envoyée(s) à PromptMistress');
     }catch(e){sent.add(id);say('erreur '+id.slice(0,12)+': '+e.message);}
     await delay(1000);
    }
   }catch(e){say(e.message);}
   await delay(1500);
  }
 }

 (async()=>{
  try{pmToken=(await(await fetch(PM+'/api/capture-token',{credentials:'omit'})).json()).token;}
  catch{label.textContent='PM injoignable sur '+PM;return;}
  window.open(PM+'/capture','_blank');
  say('listage…');
  await list();
  say(known.size+' listées · en attente de votre sélection dans PromptMistress');
  await serve();
 })();
})();
