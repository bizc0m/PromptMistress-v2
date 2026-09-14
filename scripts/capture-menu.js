(function(){
 const previous=document.getElementById('pm-capture-menu');if(previous){previous.remove();return;}
 const host=document.createElement('div');host.id='pm-capture-menu';host.style.cssText='position:fixed;top:20px;right:20px;z-index:2147483647';const root=host.attachShadow({mode:'open'});
 root.innerHTML='<style>:host{all:initial}section{width:270px;background:#101017;color:#f2f2f5;padding:20px;border:1px solid #40424d;border-radius:12px;font:14px system-ui;box-shadow:0 10px 40px #0008}h2{font-size:18px;margin:0 0 16px}button{display:block;width:100%;padding:12px;margin:8px 0;border:1px solid #40424d;border-radius:6px;background:#17283e;color:#80bdff;cursor:pointer;font:600 14px system-ui}p{color:#aaa;font-size:12px;line-height:1.5}</style><section role="dialog" aria-label="PM Capturer"><h2>PM Capturer →</h2><button id="gpt">GPT</button><button id="per">Perplexity</button><button id="both">GPT + Perplexity</button><p>Sur le site choisi, relancez ce favori pour capturer.</p><button id="close">Fermer</button></section>';
 document.body.append(host);
 const gpt=()=>{__GPT__};const per=()=>{__PERPLEXITY__};
 const onGPT=location.hostname==='chatgpt.com',onPer=['perplexity.ai','www.perplexity.ai'].includes(location.hostname);
 const note=root.querySelector('p');
 root.getElementById('gpt').textContent=onGPT?'Capturer GPT maintenant':'Ouvrir GPT';
 root.getElementById('per').textContent=onPer?'Capturer Perplexity maintenant':'Ouvrir Perplexity';
 note.textContent='La capture démarre sur le site où vous êtes connecté. Gardez ce site ouvert.';
 const launch=(provider)=>{if(provider==='gpt'&&onGPT){gpt();return;}if(provider==='per'&&onPer){per();return;}window.open(provider==='gpt'?'https://chatgpt.com/':'https://www.perplexity.ai/library','_blank','noopener');note.textContent='Dans le nouvel onglet, cliquez sur PM Capturer → puis Capturer maintenant. Ouvrir le site seul ne lance pas la capture.';};
 root.getElementById('gpt').onclick=()=>launch('gpt');
 root.getElementById('per').onclick=()=>launch('per');
 root.getElementById('both').onclick=()=>{if(onGPT||onPer){launch(onGPT?'gpt':'per');note.textContent='Capture du site actuel ouverte dans PromptMistress. Pour le second site, cliquez sur Ouvrir '+(onGPT?'Perplexity':'GPT')+', puis relancez PM Capturer dans cet onglet.';}else{note.textContent='Deux étapes : ouvrez GPT puis cliquez sur PM Capturer dans cet onglet. Faites ensuite la même chose sur Perplexity. Chaque site doit autoriser sa propre capture.';}root.getElementById('both').disabled=true;};
 root.getElementById('close').onclick=()=>host.remove();
})();
