/* The unchanged Go reference engine runs off the UI thread. */
importScripts('/vendor/go-wasm/wasm_exec.js');
const ready=(async()=>{
 const go=new Go();const response=await fetch('/vendor/NyxBoolean/nyx-boolean.wasm');
 if(!response.ok)throw Error('Module NyxBoolean indisponible.');
 const {instance}=await WebAssembly.instantiate(await response.arrayBuffer(),go.importObject);
 go.run(instance).catch(error=>{throw error;});
})();
onmessage=async({data})=>{try{await ready;const result=JSON.parse(nyxBooleanEvaluate(JSON.stringify(data.request)));postMessage({id:data.id,...result});}catch(error){postMessage({id:data.id,error:error.message,keys:[]});}};
