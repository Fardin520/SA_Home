import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POST } from './lib/chat/route.js';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
// Node loads local settings without dotenv. Environment variables take precedence.
for (const filename of ['.env.local', '.env']) {
  try { process.loadEnvFile(fileURLToPath(new URL(filename, import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
const security = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'" };
function json(response, status, error) {
  response.writeHead(status, { ...security, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify({ error }));
}

async function serve(request, response) {
  Object.entries(security).forEach(([key, value]) => response.setHeader(key, value));
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { return json(response, 400, 'Invalid URL.'); }
  if (pathname === '/api/chat') {
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return json(response, 405, 'Use POST to send a message.'); }
    const abort = new AbortController();
    const disconnect = () => { if (!response.writableFinished) abort.abort(); };
    response.once('close', disconnect);
    request.once('aborted', () => abort.abort());
    const apiRequest = new Request(`http://localhost${pathname}`, {
      method: 'POST', headers: request.headers, body: Readable.toWeb(request), duplex: 'half', signal: abort.signal,
    });
    try {
      const result = await POST(apiRequest);
      if (response.destroyed) { await result.body?.cancel(); return; }
      response.writeHead(result.status, Object.fromEntries(result.headers));
      if (result.body) await pipeline(Readable.fromWeb(result.body), response);
      else response.end();
    } finally { response.removeListener('close', disconnect); }
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) { response.setHeader('Allow', 'GET, HEAD'); return json(response, 405, 'Method not allowed.'); }
  if (pathname.includes('\\') || pathname.includes('\0')) return json(response, 400, 'Invalid URL.');
  let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  if (!extname(relative)) relative = relative.replace(/\/$/, '') + '.html';
  let filename = resolve(root, relative);
  if (!filename.startsWith(root.endsWith(sep) ? root : root + sep) || !mime[extname(filename)]) return json(response, 404, 'Page not found.');
  let code = 200;
  let info = await stat(filename).catch(() => null);
  if (!info?.isFile()) { filename = resolve(root, '404.html'); info = await stat(filename); code = 404; }
  const type = mime[extname(filename)];
  const etag = `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
  const headers = { 'Content-Type': type, ETag: etag, Vary: 'Accept-Encoding', 'Cache-Control': 'public, max-age=0, must-revalidate' };
  if (request.headers['if-none-match'] === etag && code === 200) { response.writeHead(304, headers).end(); return; }
  if (/\bgzip\b(?!;q=0(?:[,.]|$))/.test(request.headers['accept-encoding'] || '')) {
    const compressed = await stat(filename + '.gz').catch(() => null);
    if (compressed?.isFile()) { filename += '.gz'; info = compressed; headers['Content-Encoding'] = 'gzip'; }
  }
  headers['Content-Length'] = info.size;
  response.writeHead(code, headers);
  if (request.method === 'HEAD') response.end();
  else await pipeline(createReadStream(filename), response);
}

await stat(resolve(root, 'index.html')).catch(() => { throw new Error('Run npm run build before starting the server.'); });
const server = createServer({ requestTimeout: 15000, headersTimeout: 10000, keepAliveTimeout: 5000, maxHeaderSize: 16384 }, (request, response) => {
  serve(request, response).catch(() => {
    if (response.destroyed) return;
    if (!response.headersSent) json(response, 500, 'The request could not be completed. Please try again.');
    else response.destroy();
  });
});
server.on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Choose another PORT or --port.` : `Server could not start: ${error.code || 'unknown error'}`); process.exitCode = 1; });
server.listen(port, host, () => console.log(`Server Anywhere: http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  server.close();
  const timeout = setTimeout(() => server.closeAllConnections(), 2000);
  timeout.unref();
});
