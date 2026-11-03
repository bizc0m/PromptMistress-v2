import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadArchive} from './archive.mjs';
import {loadWorkspace} from './workspace.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'promptmistress-native-v3-'));
const bin=path.join(temp,'PromptMistressNative');
try {
  execFileSync('swiftc',[
    'native-v3/ArchiveCore.swift','native-v3/PromptTitle.swift',
    'native-v3/NativeWorkspace.swift','native-v3/main.swift','-o',bin
  ],{cwd:root,stdio:'pipe'});
  const vault=path.join(temp,'vault');
  for(const dir of ['RAW','02_PROMPTS'])fs.mkdirSync(path.join(vault,dir),{recursive:true});
  const chat='---\nsource_id: "chat-1"\n---\n\n## Messages\n\n### 1. user\nBonjour\n\n### 2. assistant\nSalut\n';
  fs.writeFileSync(path.join(vault,'RAW','chat.md'),chat);
  fs.writeFileSync(path.join(vault,'02_PROMPTS','p1.md'),'---\nid: "p1"\nproject: "Projet"\norigin_chat: "chat-1"\n---\n\n# Prompt\n\nRédige un résumé de cette conversation.\n');
  fs.writeFileSync(path.join(vault,'index.json'),JSON.stringify({items:[{
    id:'chat-1',path:'RAW/chat.md',source:'chatgpt',source_url:'https://chatgpt.com/c/chat-1',
    title:'Conversation test',project:'Projet',updated:'2026-01-02T10:00:00Z'
  }]}));
  const exporter=path.join(temp,'exporter.html');
  fs.writeFileSync(exporter,'<script id="codex-data" type="application/json">'+JSON.stringify({rows:[{
    id:'codex-1',name:'Session Codex',project:'Code',updatedAt:'2026-01-01T10:00:00Z',
    deeplink:'https://example.test/1',fullText:'Texte de session'
  }]})+'</script>');
  const config=path.join(temp,'sources.json');
  fs.writeFileSync(config,JSON.stringify([
    {name:'Prompt Vault Node',type:'vault',path:vault},
    {name:'Codex Exporter',type:'exporter',path:exporter}
  ]));
  const native=(command,...args)=>JSON.parse(execFileSync(bin,[command,config,...args],{encoding:'utf8'}));
  const archive=loadArchive(config),workspace=loadWorkspace(config);
  const compare=(actual,expected,label)=>assert.deepEqual(actual,expected,label);
  compare(native('archive'),{rows:archive.rows,summary:archive.summary},'archive');
  const nWorkspace=native('workspace');
  compare(nWorkspace.rows,workspace.rows,'workspace rows');
  compare(nWorkspace.summary,workspace.summary,'workspace summary');
  for(const row of archive.rows)compare(native('detail',row.key),archive.detail(row.key),`archive detail ${row.identity}`);
  for(const row of workspace.rows)compare(native('workspace-detail',row.key),workspace.detail(row.key),`workspace detail ${row.identity}`);
  const readerTest=path.join(temp,'main.swift');
  fs.writeFileSync(readerTest,`import Foundation
let messages = [
  ["role":"user", "content":"Première question"],
  ["role":"assistant", "content":"Première réponse"],
  ["role":"user", "content":"Question suivante"]
]
let full = NativeChatReader.render(messages:messages,kind:"chat",mode:"conversation")
precondition(full.contains("QUESTION 1 · PROMPT INITIAL\\n\\nPremière question"))
precondition(full.contains("RÉPONSE 1\\n\\nPremière réponse"))
precondition(full.contains("QUESTION 2 · PROMPT DE SUIVI\\n\\nQuestion suivante"))
let prompts = NativeChatReader.render(messages:messages,kind:"chat",mode:"prompts")
precondition(!prompts.contains("Première réponse"))
precondition(prompts.contains("Première question") && prompts.contains("Question suivante"))
let answers = NativeChatReader.render(messages:messages,kind:"chat",mode:"responses")
precondition(!answers.contains("Première question") && answers.contains("Première réponse"))
let saved = NativeChatReader.render(messages:[messages[0]],kind:"prompt",mode:"conversation")
precondition(saved.contains("QUESTION · PROMPT ENREGISTRÉ"))
`);
  const readerBin=path.join(temp,'ChatReaderTest');
  execFileSync('swiftc',['native-v3/NativeChatReader.swift',readerTest,'-o',readerBin],{cwd:root,stdio:'pipe'});
  execFileSync(readerBin,[],{stdio:'pipe'});
  console.log('V3 native : archives, prompts et détails identiques à la V2.');
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
