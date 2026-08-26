import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['index.html', 'sync.html', 'home.html', 'reader.html', 'local-reader.html', 'links.html', 'study.html'];
const standalone = [
  'author-summary.js', 'backup-format.js', 'browser-storage.js', 'desktop-navigation.js', 'feature-flags.js', 'home-dashboard.js', 'shelf-search.js',
  'status-message.js', 'study-data.js', 'study-sync.js', 'study-quiz.js', 'study-audio.js', 'study-ai.js',
  'study-offline.js', 'supabase-config.js', 'url-parser.js', 'vault-payload.js', 'vault-session.js', 'video-thumbnail-time.js'
];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

for (const file of standalone) new vm.Script(read(file), { filename: file });
for (const file of pages) {
  const source = read(file);
  for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1], { filename: `${file}:inline` });
  for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
    const ref = match[1].split('#')[0].split('?')[0];
    if (!ref || /^(?:https?:|data:|#)/i.test(ref)) continue;
    if (!fs.existsSync(path.join(root, ref))) throw new Error(`${file} references missing ${ref}`);
  }
}
const allSource = pages.concat(standalone).map(read).join('\n');
if (/service_role|BEGIN (?:RSA|OPENSSH)|sk-[A-Za-z0-9]/i.test(allSource)) throw new Error('potential secret material found');
console.log(`static verification passed: ${pages.length} HTML pages, ${standalone.length} JS files`);