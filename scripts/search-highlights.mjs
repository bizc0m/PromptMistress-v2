const words=text=>[...text.matchAll(/[\p{L}\p{N}_]+/gu)].map(m=>({text:m[0].toLowerCase(),start:m.index,end:m.index+m[0].length}));
const glob=pattern=>new RegExp('^'+pattern.toLowerCase().replace(/[.+^${}()|[\]\\]/g,'\\$&').replaceAll('*','.*').replaceAll('?','.')+'$','u');
export function searchRanges(text,terms=[]){
 if(!terms.length)return [];
 const tokens=words(text),ranges=[];
 for(const term of terms){
  if(term.op==='term'){const re=glob(term.value);for(const w of tokens)if(re.test(w.text))ranges.push({start:w.start,end:w.end});}
  if(term.op==='phrase'){const phrase=words(term.value).map(w=>w.text);if(!phrase.length)continue;for(let i=0;i+phrase.length<=tokens.length;i++)if(phrase.every((v,j)=>tokens[i+j].text===v))ranges.push({start:tokens[i].start,end:tokens[i+phrase.length-1].end});}
 }
 return ranges;
}
export function segments(text,search=[],manual=[]){
 const spans=[...search.map(r=>({...r,type:'search'})),...manual.filter(r=>text.slice(r.start,r.end)===r.text).map(r=>({...r,type:'manual'}))].filter(r=>r.start>=0&&r.end<=text.length&&r.end>r.start);
 const events=new Map([[0,{search:0,manual:0}],[text.length,{search:0,manual:0}]]);
 for(const r of spans){for(const [point,delta] of [[r.start,1],[r.end,-1]]){if(!events.has(point))events.set(point,{search:0,manual:0});events.get(point)[r.type]+=delta;}}
 const points=[...events.keys()].sort((a,b)=>a-b),counts={search:0,manual:0},result=[];
 for(let i=0;i<points.length-1;i++){const start=points[i],end=points[i+1];counts.search+=events.get(start).search;counts.manual+=events.get(start).manual;result.push({text:text.slice(start,end),types:Object.keys(counts).filter(k=>counts[k]>0)});}
 return result;
}
export function snippet(text,terms){const start=Math.max(0,(searchRanges(text,terms)[0]?.start||0)-65);return (start?'…':'')+text.slice(start,start+230)+(start+230<text.length?'…':'');}
