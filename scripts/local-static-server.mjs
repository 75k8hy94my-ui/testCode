import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = path.join(process.cwd(), pathname === '/' ? 'index.html' : pathname);
  fs.readFile(file, (error, data) => {
    if (error) { response.statusCode = 404; response.end(); return; }
    response.end(data);
  });
});
server.listen(4174);
