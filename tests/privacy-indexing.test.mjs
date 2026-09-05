import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname).replace(/[/\\]tests$/, '');
const pages = fs.readdirSync(root).filter((name) => name.endsWith('.html'));

test('published site opts out of crawler indexing on every HTML entry point', () => {
  assert.ok(pages.length > 0);
  for (const page of pages.filter((name) => name !== 'roppo.html')) {
    const source = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(source, /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']/i, page);
    assert.match(source, /nofollow/i, page);
  }
});

test('published site provides a deny-all robots policy without a sitemap', () => {
  const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
  assert.match(robots, /User-agent:\s*\*/i);
  assert.match(robots, /Disallow:\s*\//i);
  assert.doesNotMatch(robots, /Sitemap:/i);
});
