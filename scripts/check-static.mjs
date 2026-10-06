import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['index.html', 'sync.html', 'home.html', 'profile.html', 'manga.html', 'manga-sandbox.html', 'video.html', 'reader.html', 'video-player.html'];
const standalone = [
  'app-desktop-rail.js', 'app-global-shell.js', 'author-summary.js', 'backup-format.js', 'browser-storage.js', 'desktop-navigation.js',
  'encrypted-asset-backend.js', 'encrypted-asset-cache.js', 'encrypted-asset-crypto.js', 'encrypted-asset-import.js', 'encrypted-asset-item.js', 'encrypted-asset-reader.js', 'encrypted-asset-storage.js', 'encrypted-asset-sync.js',
  'encrypted-chunk-cache.js', 'encrypted-chunk-crypto.js', 'encrypted-chunk-sync.js', 'image-compression-profile.js', 'image-photo-processor.js', 'image-processing-worker.js', 'image-pyramid-builder.js', 'image-remote-access.js', 'image-transfer-ledger.js', 'image-transfer-settings.js', 'feature-flags.js', 'home-dashboard.js',
  'home-profile-spa.js', 'mobile-bottom-nav.js', 'manga-sandbox.js', 'media-access-gate.js', 'profile-menu.js', 'shelf-search.js',
  'manga-import-validator.js', 'manga-import-candidate.js', 'manga-import-author-sync.js', 'manga-import-batch.js', 'manga-import-bridge.js', 'manga-import-dialog.js',
  'reader-target.js', 'reader-item-repository.js', 'reader-image-loader.js', 'reader-lifecycle.js', 'reader-page-transition.js', 'reader-page-source.js', 'reader-progress-repository.js', 'reader-runtime.js',
  'status-message.js',
  'supabase-config.js', 'url-parser.js', 'vault-payload.js', 'vault-session.js', 'video-data.js', 'video-library.js', 'video-routing-fix.js', 'video-thumbnail-time.js', 'video-list-route.js', 'video-list-template.js'
];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const extensionRoot = path.join(root, 'extensions', 'momon-ga-importer');
const extensionManifest = JSON.parse(read('extensions/momon-ga-importer/manifest.json'));
const allowedHostPermissions = ['https://momon-ga.com/*', 'https://75k8hy94my-ui.github.io/*'];
const allowedContentMatches = ['https://momon-ga.com/fanzine/*', 'https://75k8hy94my-ui.github.io/testCode/manga.html'];
if (extensionManifest.manifest_version !== 3) throw new Error('momon importer must use Manifest V3');
if (JSON.stringify(extensionManifest.host_permissions) !== JSON.stringify(allowedHostPermissions)) throw new Error('momon importer has unexpected host permissions');
if (!Array.isArray(extensionManifest.permissions) || extensionManifest.permissions.some((permission) => !['storage', 'activeTab'].includes(permission))) throw new Error('momon importer has unexpected permissions');
if (JSON.stringify((extensionManifest.content_scripts || []).map((script) => script.matches)) !== JSON.stringify([['https://momon-ga.com/fanzine/*'], ['https://75k8hy94my-ui.github.io/testCode/manga.html']])) throw new Error('momon importer content-script matches are too broad or unexpected');
if (JSON.stringify(extensionManifest).includes('<all_urls>')) throw new Error('momon importer must not request all-site access');
const extensionFiles = [extensionManifest.background?.service_worker, extensionManifest.action?.default_popup,
  ...(extensionManifest.content_scripts || []).flatMap((script) => script.js || [])].filter(Boolean);
for (const relativeFile of extensionFiles) {
  const resolved = path.resolve(extensionRoot, relativeFile);
  if (path.isAbsolute(relativeFile) || relativeFile.split(/[\\/]/).includes('..') || !resolved.startsWith(extensionRoot + path.sep)) throw new Error(`invalid momon extension path: ${relativeFile}`);
  if (!fs.existsSync(resolved)) throw new Error(`momon extension references missing ${relativeFile}`);
  if (relativeFile.endsWith('.js')) new vm.Script(fs.readFileSync(resolved, 'utf8'), { filename: `extensions/momon-ga-importer/${relativeFile}` });
}

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
const allSource = pages.concat(standalone, extensionFiles.filter((file) => file.endsWith('.js')).map((file) => `extensions/momon-ga-importer/${file}`)).map(read).join('\n');
if (/service_role|BEGIN (?:RSA|OPENSSH)|sk-[A-Za-z0-9]/i.test(allSource)) throw new Error('potential secret material found');
console.log(`static verification passed: ${pages.length} HTML pages, ${standalone.length} JS files, momon:GA extension manifest and scripts`);
