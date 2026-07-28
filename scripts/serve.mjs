import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
http.createServer((request, response) => {
  const raw = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(root, '.' + (raw === '/' ? '/index.html' : raw));
  if (target !== root && !target.startsWith(root + path.sep)) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  fs.readFile(target, (error, body) => {
    if (error) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
    response.end(body);
  });
}).listen(8002, '127.0.0.1');
