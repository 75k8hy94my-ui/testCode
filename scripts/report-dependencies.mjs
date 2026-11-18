import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dynamicAssetReferences } from './check-architecture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.git', 'node_modules', 'playwright-report', 'test-results']);

function sourcePaths(root) {
  const paths = [];
  function walk(relative = '') {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const file = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && /\.(?:html|css|m?js)$/.test(file)) paths.push(file);
    }
  }
  walk();
  return paths.sort();
}
function localPath(from, ref) {
  if (/^(?:[a-z][\w+.-]*:|\/\/|\/|#)/i.test(ref)) return null;
  const item = ref.split(/[?#]/, 1)[0];
  return item ? path.posix.normalize(path.posix.join(path.posix.dirname(from), item)) : null;
}
const unique = items => [...new Set(items)].sort();

export function inspectDependencies(root = ROOT) {
  const report = { pages: {}, dynamic: {}, imports: {}, globalDefinitions: {}, events: {}, storageKeys: {}, explicitCycles: [] };
  const edges = new Map();
  for (const file of sourcePaths(root)) {
    const code = fs.readFileSync(path.join(root, file), 'utf8');
    if (file.endsWith('.html')) {
      const refs = [
        ...code.matchAll(/<script\b[^>]*\bsrc\s*=\s*(['"])([^'"]+)\1/gi),
        ...code.matchAll(/<link\b[^>]*\bhref\s*=\s*(['"])([^'"]+\.(?:css|js)(?:[?#][^'"]*)?)\1/gi),
      ];
      report.pages[file] = unique(refs.map(x => localPath(file, x[2])).filter(Boolean));
    }
    if (!/\.m?js$/.test(file)) continue;
    const dynamic = unique(dynamicAssetReferences(code).map(x => localPath(file, x)).filter(Boolean));
    if (dynamic.length) report.dynamic[file] = dynamic;
    // These are explicit edges only; classic script/global calls are not imports.
    const modules = [
      ...code.matchAll(/\b(?:import|export)\s+(?:[\s\S]{0,100}?\s+from\s*)?(['"])(\.[^'"]+)\1/g),
      ...code.matchAll(/\brequire\(\s*(['"])(\.[^'"]+)\1\s*\)/g),
    ];
    report.imports[file] = unique(modules.map(x => localPath(file, x[2])).filter(Boolean));
    edges.set(file, report.imports[file].filter(x => /\.m?js$/.test(x)));
    for (const m of code.matchAll(/\b(?:window|self|root|globalThis)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) {
      (report.globalDefinitions[m[1]] ||= []).push(file);
    }
    const sends = unique([...code.matchAll(/\.dispatchEvent\(\s*new\s+(?:window\.)?CustomEvent\(\s*(['"])([^'"]+)\1/g)].map(x => x[2]));
    const listens = unique([...code.matchAll(/\.addEventListener\(\s*(['"])([^'"]+)\1/g)].map(x => x[2]));
    if (sends.length || listens.length) report.events[file] = { sends, listens };
    const keys = [
      ...code.matchAll(/\b(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*(['"])([^'"]+)\1/g),
      ...code.matchAll(/\b(?:const|let)\s+\w*(?:_KEY|Key)\s*=\s*(['"])([^'"]+)\1/g),
    ];
    if (keys.length) report.storageKeys[file] = unique(keys.map(x => x[2]));
  }
  for (const key of Object.keys(report.globalDefinitions)) report.globalDefinitions[key] = unique(report.globalDefinitions[key]);
  const seen = new Set(), active = new Set(), cycles = new Set();
  function visit(file, chain) {
    if (active.has(file)) {
      const index = chain.indexOf(file);
      if (index >= 0) cycles.add(chain.slice(index).join(' -> '));
      return;
    }
    if (seen.has(file)) return;
    active.add(file);
    for (const target of edges.get(file) || []) {
      if (edges.has(target)) visit(target, [...chain, target]);
    }
    active.delete(file); seen.add(file);
  }
  for (const file of edges.keys()) visit(file, [file]);
  report.explicitCycles = [...cycles].sort();
  return report;
}

export function renderReport(report) {
  const out = ['# testCode dependency inventory', '',
    'Generated from source. This is textual evidence, not a complete runtime call graph.',
    'See docs/ARCHITECTURE.md for authoritative responsibility boundaries.', '',
    '## HTML entrypoints and referenced assets', ''];
  for (const [page, refs] of Object.entries(report.pages)) {
    if (page.startsWith('docs/') || page.startsWith('tests/')) continue;
    out.push('### ' + page, ...(refs.length ? refs.map(x => '- ' + x) : ['- No literal local assets']), '');
  }
  out.push('## JS dynamic loader references', '');
  for (const [file, refs] of Object.entries(report.dynamic)) {
    if (file.startsWith('tests/') || file.startsWith('e2e/')) continue;
    out.push('- ' + file + ' -> ' + refs.join(', '));
  }
  out.push('', '## Global API definition candidates', '');
  for (const [api, owners] of Object.entries(report.globalDefinitions).sort(([a], [b]) => a.localeCompare(b))) {
    if (owners.length) out.push('- ' + api + ': ' + owners.join(', '));
  }
  out.push('', '## Explicit module cycles', ...(report.explicitCycles.length ? report.explicitCycles.map(x => '- ' + x) : ['- None detected']), '',
    'Use --json for per-file import edges, event publishers/subscribers and storage key candidates.');
  return out.join('\n') + '\n';
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectDependencies();
  process.stdout.write(process.argv.includes('--json') ? JSON.stringify(result, null, 2) + '\n' : renderReport(result));
}
