const captureFrame=document.getElementById('capture-frame');
const captureNonce=new URLSearchParams(location.search).has('capture')?location.hash.slice(1):'';
const perCapture=new URLSearchParams(location.search).get('provider')==='perplexity';
const requestedOrigin=new URLSearchParams(location.search).get('origin');
const sourceOrigin=perCapture?(['https://perplexity.ai','https://www.perplexity.ai'].includes(requestedOrigin)?requestedOrigin:'https://www.perplexity.ai'):'https://chatgpt.com';
let captureLoaded=false,chatWindow=window.opener,helloMessage;
function showCapture(){select('unified');if(!document.getElementById('capture-fold').open)document.getElementById('capture-fold').showModal();captureFrame.hidden=false;if(!captureFrame.getAttribute('src'))captureFrame.src='/capture'+(captureNonce?'?bridge='+encodeURIComponent(captureNonce)+(perCapture?'&provider=perplexity':''):'');}
document.getElementById('capture-link').onclick=e=>{e.preventDefault();showCapture();};
document.getElementById('vault-back').onclick=()=>{captureFrame.hidden=true;update();};
window.addEventListener('message',e=>{
 if(e.origin===sourceOrigin&&e.source===chatWindow&&captureNonce&&e.data?.pm==='bridge-v1'&&e.data.nonce===captureNonce){
  if(e.data.type==='hello'){helloMessage=e.data;if(captureLoaded){captureFrame.contentWindow.postMessage(e.data,location.origin);chatWindow.postMessage({pm:'bridge-v1',nonce:captureNonce,type:'ready'},e.origin);}return;}
  if(captureLoaded)captureFrame.contentWindow.postMessage(e.data,location.origin);
 }
 if(e.origin===location.origin&&e.source===captureFrame.contentWindow&&e.data?.pm==='capture-ui'&&e.data.nonce===(captureNonce||null)){
  if(e.data.type==='ready'){captureLoaded=true;if(helloMessage){captureFrame.contentWindow.postMessage(helloMessage,location.origin);chatWindow?.postMessage({pm:'bridge-v1',nonce:captureNonce,type:'ready'},sourceOrigin);}}
  if(['capture','stop'].includes(e.data.type)&&chatWindow&&captureNonce)chatWindow.postMessage({...e.data,pm:'bridge-v1'},sourceOrigin);
  if(e.data.type==='imported'){for(const id of ['node-frame']){const f=document.getElementById(id);if(f.src)f.src=f.src;}for(const selector of ['#final iframe','#workspace-frame']){const f=document.querySelector(selector);if(f?.src)f.src=f.src;}if(e.data.payload?.afterImport==='library'){document.getElementById('capture-fold').close();captureFrame.hidden=true;select('unified');}}
 }
});
if(captureNonce){showCapture();setTimeout(()=>{if(!helloMessage)document.getElementById('description').textContent='Liaison ChatGPT non établie : ouvrez les instructions de connexion dans le panneau.';},15000);}

function openBookmarkletInstall(){location.assign('/capture?install=1');}
document.getElementById('bookmarklet-link').onclick=openBookmarkletInstall;

document.getElementById('capture-close').onclick=()=>document.getElementById('capture-fold').close();
if(new URLSearchParams(location.search).has('capture')&&!captureNonce)showCapture();
