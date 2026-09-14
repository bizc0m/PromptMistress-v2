// Adapter only: keep the original Exporter parser, UI, search and export functions.
(async()=>{
  const startRows=app.rows;
  els.meta.textContent='Chargement de l’historique local…';
  try{
    const response=await fetch('/api/exporter');
    if(!response.ok)throw Error('Source locale indisponible');
    const data=await response.json();
    if(!Array.isArray(data.rows))throw Error('Historique local absent');
    if(app.rows!==startRows)return; // Do not overwrite a manual import completed meanwhile.
    const byId=new Map();
    for(const row of data.rows){
      const prev=byId.get(row.id);
      if(!prev){byId.set(row.id,{...row,runCount:row.runCount||1});continue;}
      const newer=String(row.updatedAt)>String(prev.updatedAt);
      for(const [key,value] of Object.entries(row)){
        if(value===null||value===undefined||value==='')continue;
        if(key==='fullText'||key==='promptPreview'){if(String(value).length>String(prev[key]||'').length)prev[key]=value;}
        else if(newer||!prev[key])prev[key]=value;
      }
    }
    app.rows=[...byId.values()];app.sourceLines=data.sourceLines||0;app.fileCount=1;
    app.lastScan={at:data.generatedAt,files:1,lines:app.sourceLines,chats:app.rows.length};
    selected.clear();render();
  }catch(e){els.meta.textContent='Historique local : '+e.message;}
})();
