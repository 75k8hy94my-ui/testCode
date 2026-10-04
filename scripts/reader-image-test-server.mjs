import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.READER_IMAGE_TEST_PORT) || 4173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const failedOnce = new Set();

function escape(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]); }

http.createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname.startsWith('/__reader-test/image/')) {
    const page = Math.max(1, Number(url.pathname.match(/(\d+)\.svg$/)?.[1]) || 1);
    const delay = Math.min(5000, Math.max(0, Number(url.searchParams.get('delay')) || 0));
    const large = url.searchParams.get('large') === '1';
    const failOnce = url.searchParams.get('failOnce') === '1';
    if (failOnce && !failedOnce.has(url.pathname)) {
      failedOnce.add(url.pathname);
      response.writeHead(503, { 'Cache-Control': 'no-store' }).end('Temporary test failure');
      return;
    }
    const width = large ? 2200 : 900;
    const height = large ? 3200 : 1300;
    const color = `hsl(${(page * 47) % 360} 72% 50%)`;
    const details = large
      ? Array.from({ length: 900 }, (_, index) => `<rect x="0" y="${index * 4}" width="${width}" height="2" fill="hsl(${(index * 13) % 360} 70% 55%)"/>`).join('')
      : '';
    const body = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><path d="M0 0H${width}V${height}H0Z" fill="${color}" opacity=".18"/>${details}<text x="50%" y="48%" text-anchor="middle" font-size="180" font-family="sans-serif" fill="#111">PAGE ${page}</text><text x="50%" y="54%" text-anchor="middle" font-size="60" font-family="sans-serif" fill="#111">${escape(large ? 'HIGH RESOLUTION' : 'DECODED IMAGE')}</text></svg>`;
    response.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
    setTimeout(() => response.end(body), delay);
    return;
  }
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) { response.writeHead(403).end('Forbidden'); return; }
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404).end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(data);
  });
}).listen(port, '127.0.0.1', () => process.stdout.write(`Reader image browser harness: http://127.0.0.1:${port}/tests/browser/reader-image-harness.html\n`));
