import {parseTags,splitValues,searchText} from './explorer.mjs';

const fields=['title','provider','project','kind','tags','text'];
const actions=['tags','folders','color','status','priority'];
export function validateRules(rules){
 if(!Array.isArray(rules)||rules.length>100)throw Error('Maximum 100 règles.');
 const ids=new Set();
 return rules.map(r=>{
  if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id))throw Error('Identifiant de règle invalide ou répété.');ids.add(r.id);
  if(!fields.includes(r.field)||!['contains','equals','notContains'].includes(r.operator)||!String(r.value||'').trim())throw Error('Condition de règle incomplète.');
  if(!actions.includes(r.action))throw Error('Action de règle inconnue.');
  const value=String(r.actionValue||'').trim();
  if(!value)throw Error('Valeur de classement vide.');
  if(r.action==='tags')parseTags(value);
  if(r.action==='color'&&!['blue','green','yellow','pink'].includes(value))throw Error('Couleur invalide.');
  if(r.action==='status'&&!['fini','classe','en-retard','urgent'].includes(value))throw Error('Statut invalide.');
  if(r.action==='priority'&&!['essentielle','prioritaire','important','a-faire','futile','inutile'].includes(value))throw Error('Priorité invalide.');
  return {id:r.id,name:String(r.name||r.value),enabled:r.enabled!==false,field:r.field,operator:r.operator,value:String(r.value).trim(),action:r.action,actionValue:value,stop:!!r.stop};
 });
}

// Rule results remain separate from manual annotations and from source files.
// The first scalar action wins; tags and folders accumulate in rule order.
export function applyRules(row,manual,rules,text=''){
 const result={},matched=[];
 for(const rule of rules){
  if(!rule.enabled||(rule.field==='text'&&text===null))continue;
  const input=rule.field==='text'?text:rule.field==='tags'?(manual.tags||[]).join(' '):row[rule.field];
  const hay=searchText(input),needle=searchText(rule.value);
  const hit=rule.operator==='equals'?hay===needle:rule.operator==='notContains'?!hay.includes(needle):hay.includes(needle);
  if(!hit)continue;matched.push(rule.id);
  const field=rule.action;
  if(field==='tags'||field==='folders')result[field]=[...new Set([...(result[field]||[]),...(field==='tags'?parseTags(rule.actionValue):splitValues(rule.actionValue))])];
  else if(result[field]===undefined)result[field]=rule.actionValue;
  if(rule.stop)break;
 }
 return {...result,_rules:matched};
}
export function mergeRuleAnnotation(manual,automatic={}){
 const result={...automatic,...manual};
 for(const field of ['tags','folders'])result[field]=manual._manual?.includes(field)?(manual[field]||[]):[...new Set([...(manual[field]||[]),...(automatic[field]||[])])];
 for(const field of ['color','status','priority'])if(!manual._manual?.includes(field)&&!manual[field])result[field]=automatic[field]||manual[field]||'';
 return result;
}
