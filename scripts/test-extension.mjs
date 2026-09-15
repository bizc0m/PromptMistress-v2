import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ext = path.join(root, 'browser-extension');

let failures = 0;
function ok(m) { console.log('  ✓', m); }
function fail(m, e) { console.error('  ✗', m, e?.message || ''); failures++; }

console.log('TEST Extension (unitaire)');

try {
  const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  ok('manifest.json parsable');
  if (manifest.manifest_version === 3) ok('manifest_version === 3'); else fail('manifest_version');
  if (manifest.name === 'PromptMistress Capturer') ok('nom correct'); else fail('nom');
  if (manifest.permissions?.includes('activeTab')) ok('permission activeTab'); else fail('permission activeTab');
  const matches = manifest.content_scripts?.[0]?.matches || [];
  if (matches.includes('https://chatgpt.com/*') && matches.includes('https://www.perplexity.ai/*')) ok('matches ChatGPT/Perplexity'); else fail('matches');
  if (fs.existsSync(path.join(ext, manifest.icons?.['128']))) ok('icône 128px présente'); else fail('icône 128px');
} catch (e) { fail('manifest', e); }

try {
  const content = fs.readFileSync(path.join(ext, 'content.js'), 'utf8');
  new Function(content);
  ok('content.js syntaxiquement valide');
  if (content.includes('pm-capture-fab')) ok('content.js référence le bouton PM'); else fail('bouton PM manquant');
  if (content.includes('chatgpt') && content.includes('perplexity')) ok('content.js gère les deux providers'); else fail('providers manquants');
} catch (e) { fail('content.js', e); }

try {
  const popup = fs.readFileSync(path.join(ext, 'popup.html'), 'utf8');
  if (popup.includes('open-pm') && popup.includes('start-capture')) ok('popup.html contient les actions'); else fail('actions popup');
} catch (e) { fail('popup.html', e); }

try {
  const bg = fs.readFileSync(path.join(ext, 'background.js'), 'utf8');
  new Function(bg);
  ok('background.js syntaxiquement valide');
} catch (e) { fail('background.js', e); }

console.log('\n' + (failures ? 'FAIL' : 'PASS') + ' — ' + failures + ' échec(s)');
process.exit(failures ? 1 : 0);
