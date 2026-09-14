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
