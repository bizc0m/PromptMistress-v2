// Only numbered role headings from the existing Vault format are interpreted.
export function markdownMessages(text){
 const lines=String(text).split('\n'),messages=[];let current=null,fence='',expected=1,inMessages=false;
 for(const line of lines){
  const f=line.match(/^\s*(`{3,}|~{3,})/);
  if(f){if(!fence)fence=f[1];else if(f[1][0]===fence[0]&&f[1].length>=fence.length)fence='';}
  if(!fence&&/^## Messages\s*$/.test(line)&&!inMessages){inMessages=true;continue;}
  if(!inMessages)continue;
  const heading=!fence&&line.match(/^### (\d+)\. (user|assistant|system|tool)\s*$/);
  if(heading&&Number(heading[1])===expected){current={role:heading[2],content:''};messages.push(current);expected++;}
  else if(current)current.content+=(current.content?'\n':'')+line;
 }
 return messages.map(m=>({...m,content:m.content.trim()}));
}
export function exportContent(detail,kind,mode='all'){
 if(mode==='raw')return detail.raw??detail.text;
 if(mode==='all')return detail.text;
 if(!['questions','answers'].includes(mode))throw Error('Contenu d’export inconnu.');
 const messages=detail.messages?.length?detail.messages:markdownMessages(detail.raw??detail.text);
 if(kind==='prompt'&&!messages.length){if(mode==='questions')return detail.text;throw Error('Ce prompt individuel ne contient pas de réponse.');}
 if(!messages.length)throw Error('Rôles non identifiables : choisir Conversation complète ou RAW.');
 const filtered=messages.filter(m=>m.role===(mode==='questions'?'user':'assistant'));
 if(!filtered.length)throw Error(mode==='questions'?'Aucune question dans cette version.':'Aucune réponse dans cette version.');
 return filtered.map(m=>m.content).join('\n\n---\n\n');
}

// Presentation ranges preserve every source character and highlight offset.
export function readerBlocks(text){
 const blocks=[];let offset=0,role='',fence='',expected=1,inMessages=false;
 const front=text.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
 if(front){blocks.push({start:0,end:front[0].length,role:'metadata'});offset=front[0].length;}
 let start=offset;
 for(const line of text.slice(offset).split(/(?<=\n)/)){
  const f=line.match(/^\s*(`{3,}|~{3,})/);
  if(f){if(!fence)fence=f[1];else if(f[1][0]===fence[0]&&f[1].length>=fence.length)fence='';}
  if(!fence&&/^## Messages\s*$/.test(line))inMessages=true;
  const heading=!fence&&inMessages&&line.match(/^### (\d+)\. (user|assistant|system|tool)\s*$/);
  if(heading&&Number(heading[1])===expected){if(offset>start)blocks.push({start,end:offset,role});start=offset;role=heading[2];expected++;}
  offset+=line.length;
 }
 if(offset>start)blocks.push({start,end:offset,role});
 return blocks;
}

// Readable exports never infer roles from arbitrary headings in a prompt.
export function corpusEntry(record,detail,mode='all'){
 const raw=String(detail.raw??detail.text??'');
 if(!raw.trim()||raw.trim()==='Cette entrée ne contient que les métadonnées.')return {...record,content:'',warning:'Texte absent de la source locale'};
 if(mode==='raw')return {...record,content:raw,warning:''};
 const messages=detail.messages?.length?detail.messages:markdownMessages(raw);
 if(messages.length){
  const wanted=mode==='questions'?['user']:mode==='answers'?['assistant']:['user','assistant'];
  const chosen=messages.filter(m=>wanted.includes(m.role)&&m.content.trim());
  return {...record,content:chosen.map((m,i)=>`### ${i+1}. ${m.role==='user'?'Question':'Réponse'}\n\n${m.content}`).join('\n\n'),warning:chosen.length?'':'Aucun message correspondant au contenu choisi'};
 }
 if(record.kind==='prompt')return {...record,content:mode==='answers'?'':String(detail.text??raw),warning:mode==='answers'?'Prompt individuel sans réponse':''};
 if(mode!=='all')return {...record,content:'',warning:'Rôles non identifiables : export filtré indisponible'};
 return {...record,content:String(detail.text??raw),warning:'Rôles non identifiables : texte conservé sans découpage question/réponse'};
}
export function corpusFiles(entries){
 const files=[],included=[],report=[];
 const safe=s=>String(s||'Sans titre').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/\s+/g,' ').trim().slice(0,100).replace(/[. ]+$/,'')||'Sans titre';
 const oneLine=s=>String(s??'').replace(/[\r\n]+/g,' ');
 for(const [i,e] of entries.entries()){
  if(!e.content){report.push(`- ${oneLine(e.title)} : ${e.warning||'Sans contenu'}`);continue;}
  const filename=`${e.kind==='prompt'?'Prompts':'Conversations'}/${String(i+1).padStart(3,'0')}-${safe(e.title)}.md`;
  const header=`# ${oneLine(e.title)}\n\nPlateforme : ${oneLine(e.provider)}\nDate : ${oneLine(e.updated)}\nSource : ${oneLine(e.sourceURL)||'Non disponible'}\n`;
  const content=header+(e.warning?`\nLimite : ${e.warning}\n`:'')+'\n'+e.content;
  files.push({name:filename,text:content});included.push(content);
  report.push(`- [${oneLine(e.title).replace(/[\[\]]/g,'')}](${filename.split('/').map(encodeURIComponent).join('/')})${e.warning?' — '+e.warning:''}`);
 }
 const readme=`# Corpus PromptMistress\n\n${included.length} éléments avec texte sur ${entries.length} entrées demandées.\n\nCorpus.md et Corpus.txt regroupent les textes ci-dessous. Les fichiers individuels sont dans Conversations et Prompts.\nLes pièces jointes ne sont pas incluses. Les rôles inconnus sont signalés ; leur texte n’est pas supprimé.\n\n## Sommaire et limites\n\n${report.join('\n')}\n`;
 const corpus=readme+'\n\n---\n\n'+included.join('\n\n---\n\n');
 // Preserve literal code, URLs and punctuation in the plain-text file too.
 const txt=corpus;
 return [{name:'LIRE-MOI.md',text:readme},{name:'Corpus.md',text:corpus},{name:'Corpus.txt',text:txt},...files];
}
