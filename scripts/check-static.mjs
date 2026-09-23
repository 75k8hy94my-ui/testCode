import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['index.html', 'sync.html', 'home.html', 'profile.html', 'manga.html', 'manga-sandbox.html', 'video.html', 'reader.html', 'video-player.html'];
const standalone = [
  'app-desktop-rail.js', 'app-global-shell.js', 'author-summary.js', 'backup-format.js', 'browser-storage.js', 'desktop-navigation.js',
  'encrypted-chunk-cache.js', 'encrypted-chunk-crypto.js', 'encrypted-chunk-sync.js', 'feature-flags.js', 'home-dashboard.js',
  'home-profile-spa.js', 'mobile-bottom-nav.js', 'manga-sandbox.js', 'media-access-gate.js', 'profile-menu.js', 'shelf-search.js',
  'status-message.js', 'reader-shell.js', 'reader-saved-list.js', 'reader-saved-list-template.js', 'reader-video-list.js', 'reader-author-list.js', 'reader-author-list-template.js', 'reader-toc-template.js', 'reader-mobile-nav-template.js', 'reader-settings.js', 'reader-backup.js',
  'supabase-config.js', 'url-parser.js', 'vault-payload.js', 'vault-session.js', 'video-data.js', 'video-library.js', 'video-routing-fix.js', 'video-thumbnail-time.js', 'video-list-route.js', 'video-list-template.js'
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
