function dateOf(entry, kind) {
 const direct=entry[kind+'_at']||entry[kind+'_datetime'];
 if(direct&&Number.isFinite(Date.parse(direct)))return new Date(direct).toISOString();
 const micros=Number(entry[kind+'_us']);return micros>0?new Date(micros/1000).toISOString():'';
}
function answerText(value){
 let parsed=value;
 if(typeof value==='string'){try{parsed=JSON.parse(value);}catch{return value;}}
 if(!parsed||typeof parsed!=='object'||typeof parsed.answer!=='string')return typeof value==='string'?value:'';
 const links=(parsed.web_results||[]).filter(s=>typeof s.url==='string'&&/^https?:\/\//.test(s.url));
 return parsed.answer+(links.length?'\n\n### Sources\n\n'+links.map((s,i)=>`${i+1}. [${String(s.name||s.url).replace(/[\[\]\n]/g,' ')}](<${s.url.replace(/[<>\n]/g,'')}>)`).join('\n'):'');
}
export function normalizePerplexity(c){
 if(!c||typeof c.id!=='string'||!Array.isArray(c.raw?.entries))throw Error('Capture Perplexity invalide');
 const messages=[];
 for(const entry of c.raw.entries){let steps=entry.text;if(typeof steps==='string'){try{steps=JSON.parse(steps);}catch{throw Error('Réponse Perplexity non reconnue : données conservées dans la fenêtre');}}
 if(!Array.isArray(steps)){if(steps==null)continue;throw Error('Étapes Perplexity non reconnues');}
 for(const step of steps){const content=step.content||{};let role,text;if(['INITIAL_QUERY','FOLLOWUP_QUERY'].includes(step.step_type)){role='user';text=content.query;}else if(step.step_type==='FINAL'){role='assistant';text=answerText(content.answer);}else if(step.step_type==='LLM_RESPONSE'&&!steps.some(s=>s.step_type==='FINAL')){role='assistant';text=answerText(content.response);}if(typeof text==='string'&&text.trim())messages.push({role,content:text,created_at:dateOf(entry,'created')});}}
 if(c.raw.entries.length&&!messages.length)throw Error('Aucun texte Perplexity reconnu : données conservées dans la fenêtre');
 const created=c.raw.entries.map(e=>dateOf(e,'created')).filter(Boolean).sort();const updated=c.raw.entries.map(e=>dateOf(e,'updated')).filter(Boolean).sort();
 return {id:c.id,title:c.title,url:c.url,messages,created:c.raw.created_at||created[0]||'',updated:c.raw.updated_at||updated.at(-1)||created.at(-1)||'',capture:c.capture,raw:c.raw};
}
