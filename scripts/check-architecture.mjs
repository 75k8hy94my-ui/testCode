import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Current dynamic-loader owners. Add new live owners when they gain loaders.
export const DYNAMIC_OWNERS = Object.freeze([
  'app-global-shell.js',
  'home-profile-spa.js',
  'manga-list-route.js',
  'video-list-route.js',
  'recommendations.js',
]);

export function dynamicAssetReferences(source) {
  const patterns = [
    /\b(?:loadScript|loadBrowserScript)\s*\(\s*(['"])([^'"]+)\1/g,
    // Ordered classic scripts in manga-list-route.js (source, DOM id).
    /\[\s*(['"])([^'"]+\.(?:js|css)(?:\?[^'"]*)?)\1\s*,\s*['"][^'"]+['"]\s*\]/g,
    /\b(?:src|href)\s*=\s*(['"])([^'"]+\.(?:js|css)(?:\?[^'"]*)?)\1/g,
    /\bSTYLESHEET_URL\s*=\s*(['"])([^'"]+)\1/g,
  ];
  const refs = new Set();
  for (const pattern of patterns) {
    for (const match of String(source).matchAll(pattern)) {
      if (/\.(?:js|css)(?:[?#]|$)/i.test(match[2])) refs.add(match[2]);
    }
  }
  return [...refs];
}

export function assertDynamicAssets(root, owners = DYNAMIC_OWNERS) {
  for (const owner of owners) {
    const source = fs.readFileSync(path.join(root, owner), 'utf8');
    for (const ref of dynamicAssetReferences(source)) {
      // External and absolute URLs are outside this local-file audit.
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(ref)) continue;
      const pathname = ref.split(/[?#]/, 1)[0];
      const resolved = path.resolve(root, path.dirname(owner), pathname);
      if (!resolved.startsWith(root + path.sep)) {
        throw new Error(owner + ' has an out-of-root dynamic dependency: ' + ref);
      }
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        throw new Error(owner + ' dynamically references missing asset: ' + ref);
      }
    }
  }
}

function scriptSources(source) {
  return [...String(source).matchAll(/<script\b[^>]*\bsrc\s*=\s*(['"])(.*?)\1/gi)]
    .map(match => path.posix.basename(match[2].split(/[?#]/, 1)[0]));
}

export function assertPageBoundaries(root) {
  const reader = scriptSources(fs.readFileSync(path.join(root, 'reader.html'), 'utf8'));
  const manga = scriptSources(fs.readFileSync(path.join(root, 'manga.html'), 'utf8'));
  for (const required of ['reader-target.js', 'reader-page-source.js', 'reader-progress-repository.js', 'reader-runtime.js']) {
    if (!reader.includes(required)) throw new Error('standalone Reader is missing ' + required);
  }
  if (!manga.includes('manga-list-route.js')) throw new Error('bookshelf is missing manga-list-route.js');
  for (const src of reader) {
    if (/^(?:manga-list-[\w-]+|home-profile-spa|reader-entry-page)\.js$/.test(src)) {
      throw new Error('standalone Reader must not depend on ' + src);
    }
  }
  if (manga.includes('reader-runtime.js')) throw new Error('bookshelf must not load reader-runtime.js');
}

export function verifyArchitecture(root = ROOT) {
  assertDynamicAssets(root);
  assertPageBoundaries(root);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyArchitecture();
  console.log('architecture verification passed: dynamic loader assets and Reader/bookshelf boundaries');
}
