'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.otf': 'font/otf', '.ttf': 'font/ttf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.bin': 'application/octet-stream'
};

function createLocalServer(directory) {
  const root = path.resolve(directory);
  let port;
  const server = http.createServer(async (request, response) => {
    const error = (code) => {
      response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(code === 404 ? 'Not found' : 'Request denied');
    };
    if (request.headers.host !== `localhost:${port}` || !['GET', 'HEAD'].includes(request.method)) return error(403);
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, `http://localhost:${port}`).pathname); }
    catch { return error(400); }
    if (pathname.includes('\0') || pathname.includes('\\')) return error(400);
    if (pathname === '/') pathname = '/index.html';
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(root + path.sep)) return error(403);
    const relative = path.relative(root, target);
    if (relative.split(path.sep).some(segment => segment.startsWith('.'))) return error(404);
    const extension = path.extname(target).toLowerCase();
    if (!Object.hasOwn(TYPES, extension)) return error(404);
    let stat;
    try { stat = await fs.promises.stat(target); }
    catch { return error(404); }
    if (!stat.isFile()) return error(404);
    response.writeHead(200, {
      'Content-Type': TYPES[extension],
      'Content-Length': stat.size,
      'Cache-Control': extension === '.html' || extension === '.js' ? 'no-store' : 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: blob:; connect-src 'self' https://qianze-kards-diy.cengyufeng654.chatgpt.site; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    if (request.method === 'HEAD') return response.end();
    const stream = fs.createReadStream(target);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      port = server.address().port;
      resolve({ server, origin: `http://localhost:${port}` });
    });
  });
}

module.exports = { createLocalServer };
