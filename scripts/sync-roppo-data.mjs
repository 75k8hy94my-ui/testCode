import fs from 'node:fs/promises';
import path from 'node:path';
import roppo from '../roppo-data.js';
import { convertLawTree, createMetadata } from './roppo-sync-lib.mjs';

const OUT_DIR = path.resolve('data/roppo');
const API_BASE = 'https://laws.e-gov.go.jp/api/2/law_file/json';

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    }
  }
  throw lastError;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const syncedAt = new Date().toISOString();
  const laws = [];
  for (const meta of Object.values(roppo.LAW_CATALOG)) {
    process.stdout.write(`Fetching ${meta.name} (${meta.id})... `);
    const tree = await fetchJson(`${API_BASE}/${encodeURIComponent(meta.id)}`);
    const law = convertLawTree(tree, meta, syncedAt);
    if (!law.articles.length) throw new Error(`${meta.name}: no articles parsed`);
    laws.push(law);
    await fs.writeFile(path.join(OUT_DIR, `${meta.id}.json`), `${JSON.stringify(law, null, 2)}\n`, 'utf8');
    console.log(`${law.articles.length} articles`);
  }
  const metadata = createMetadata(laws, syncedAt);
  await fs.writeFile(path.join(OUT_DIR, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  console.log(`Synced ${laws.length} laws at ${syncedAt}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
