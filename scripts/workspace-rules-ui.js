import {validateRules,applyRules} from './workspace-rules.mjs';

export function setupRules({rows,manual,corpus,notify,changed}){
 const $=id=>document.getElementById(id),key='promptmistress.workspace.rules.v1';
 let rules=[],results={},epoch=0,valid=true;
 try{rules=validateRules(JSON.parse(localStorage.getItem(key)||'[]'));}catch(e){valid=false;notify('Règles illisibles, conservées sans modification : '+e.message);}
 const status=text=>$('rules-status').textContent=text;
 function save(next){if(!valid)throw Error('Stockage des règles illisible : exportez-le avant toute réparation.');rules=validateRules(next);localStorage.setItem(key,JSON.stringify(rules));epoch++;render();status('Enregistré. Aperçu possible ; application au prochain rafraîchissement.');}
 function button(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{try{action();}catch(e){notify(e);}};return b;}
 function render(){
  $('rules-list').replaceChildren();
  rules.forEach((r,i)=>{
   const item=document.createElement('div');item.className='rule-row';
   const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=r.enabled;check.onchange=()=>{try{save(rules.map(x=>x.id===r.id?{...x,enabled:check.checked}:x));}catch(e){notify(e);}};label.append(check,document.createTextNode((i+1)+'. '+r.name));item.append(label);
   const text=document.createElement('p');text.className='hint';text.textContent=r.field+' '+r.operator+' « '+r.value+' » → '+r.action+' : '+r.actionValue+(r.stop?' · arrêter ici':'');item.append(text);
   const controls=document.createElement('div');controls.className='actions';
   controls.append(button('Modifier',()=>{for(const field of ['id','name','field','operator','value','action','actionValue'])$('rule-'+field).value=r[field];$('rule-stop').checked=r.stop;$('rule-action').onchange();$('rule-name').focus();}),button('↑',()=>{if(i){const next=[...rules];[next[i-1],next[i]]=[next[i],next[i-1]];save(next);}}),button('↓',()=>{if(i<rules.length-1){const next=[...rules];[next[i],next[i+1]]=[next[i+1],next[i]];save(next);}}),button('Retirer',()=>save(rules.filter(x=>x.id!==r.id))));item.append(controls);$('rules-list').append(item);
  });if(!rules.length)$('rules-list').textContent='Aucune règle. Les annotations manuelles restent prioritaires.';
 }
 $('rule-form').onsubmit=e=>{e.preventDefault();try{
  const id=$('rule-id').value||crypto.randomUUID(),existing=rules.find(r=>r.id===id),r={id,enabled:existing?.enabled??true,stop:$('rule-stop').checked};
  for(const field of ['name','field','operator','value','action','actionValue'])r[field]=$('rule-'+field).value;
  save(existing?rules.map(x=>x.id===id?r:x):[...rules,r]);$('rule-form').reset();$('rule-id').value='';$('rule-action').onchange();
 }catch(error){notify(error);}};
 $('rule-reset').onclick=()=>{$('rule-form').reset();$('rule-id').value='';$('rule-action').onchange();};
 async function run(preview=false){
  if(!valid)return;const run=++epoch,snapshot=rules.map(r=>({...r})),items=rows();
  if(!snapshot.some(r=>r.enabled)){if(!preview){results={};changed();}status('Aucune règle active.');return;}
  try{
   status('Évaluation des règles…');const byKey=new Map(),coverage=new Map();
   if(snapshot.some(r=>r.enabled&&r.field==='text'))for(const d of await corpus()){byKey.set(d.key,(byKey.get(d.key)||'')+'\n'+d.text);coverage.set(d.key,(coverage.get(d.key)||0)+1);}
   if(run!==epoch)return;const next={},affected=[];
   for(const row of items){
    if(snapshot.some(r=>r.enabled&&r.field==='text')&&row.hasContent&&(coverage.get(row.key)||0)<row.variants.filter(v=>v.hasContent).length)throw Error('Corpus incomplet : règles non appliquées. Rafraîchissez les sources.');
    const result=applyRules(row,manual(row),snapshot,byKey.get(row.key)??null);if(result._rules.length){next[row.key]=result;affected.push(row);}
   }
   if(!preview){results=next;changed();}
   status((preview?'Aperçu : ':'Appliqué : ')+affected.length+' élément(s) concernés. '+affected.slice(0,5).map(r=>r.title).join(' · ')+(affected.length>5?' …':''));
  }catch(e){status(e.message);notify(e);}
 }
 $('rules-preview').onclick=()=>run(true);$('rules-apply').onclick=()=>run(false);
 $('rules-export').onclick=()=>{const url=URL.createObjectURL(new Blob([localStorage.getItem(key)||'[]'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='promptmistress-regles.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('rules-import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const incoming=validateRules(JSON.parse(await file.text()));save([...rules,...incoming.map(r=>({...r,id:crypto.randomUUID(),enabled:false}))]);status('Règles ajoutées désactivées. Activez-les après vérification.');}catch(error){notify(error);}finally{e.target.value='';}};
 render();return {run,annotation:key=>results[key]||{},invalidate:()=>{epoch++;}};
}
