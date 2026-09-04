import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['index.html', 'sync.html', 'home.html', 'reader.html', 'local-reader.html', 'links.html', 'study.html', 'index-search.html', 'hyakusen.html'];
const standalone = [
  'app-desktop-rail.js', 'author-summary.js', 'backup-format.js', 'browser-storage.js', 'desktop-navigation.js',
  'encrypted-chunk-cache.js', 'encrypted-chunk-crypto.js', 'encrypted-chunk-sync.js', 'feature-flags.js', 'home-dashboard.js',
  'hyakusen-catalog.js', 'hyakusen-drive.js', 'hyakusen-page.js',
  'index-conversion-prompt.js', 'index-search-backup.js', 'index-search-conflicts.js', 'index-search-page.js', 'index-search-sync-status.js',
  'index-search-worker-client.js', 'legal-index-schema.js', 'legal-index-search.js', 'legal-index-search-worker.js',
  'recommendations.js', 'shelf-search.js', 'status-message.js', 'study-ai.js', 'study-argument-drafts.js',
  'study-arguments.js', 'study-audio.js', 'study-data.js', 'study-offline.js', 'study-quiz.js', 'study-sync.js',
  'supabase-config.js', 'url-parser.js', 'vault-payload.js', 'vault-session.js',
  'video-data.js', 'video-library.js', 'video-routing-fix.js', 'video-thumbnail-time.js'
];
const rootJsFiles = fs.readdirSync(root).filter((name) => name.endsWith('.js') && fs.statSync(path.join(root, name)).isFile());
const missing = rootJsFiles.filter((name) => !standalone.includes(name));
if (missing.length) throw new Error(`check-static: missing standalone JS files: ${missing.join(', ')}`);
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
