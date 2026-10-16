// Static server for synthetic fixtures on the e2e-only origin (see E2E_HOST in wxt.config.ts).
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve('tests/fixtures');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.pdf': 'application/pdf' };

const workday = resolve(root, 'workday');
const greenhouse = resolve(root, 'greenhouse');

createServer((req, res) => {
  if (req.url === '/favicon.ico') return res.writeHead(204).end();
  // Workday hostnames are mapped here by the browser; each tenant host gets its own folder.
  const host = (req.headers.host ?? '').split(':')[0];
  // Greenhouse boards share one host; the board token is the first path segment, as live.
  const base = /myworkday(jobs|site)\.com$/.test(host) ? join(workday, host.split('.')[0]) : host === 'job-boards.greenhouse.io' ? greenhouse : root;
  let path;
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    path = ['/instrument.js', '/widgets.js', '/live-like.js'].includes(pathname) ? join(workday, pathname.slice(1)) : normalize(join(base, pathname));
    // Greenhouse URLs have no extension (/acme/jobs/1001).
    if (base === greenhouse && !extname(path) && statSync(`${path}.html`, { throwIfNoEntry: false })?.isFile()) path = `${path}.html`;
  } catch { return res.writeHead(400).end(); }
  const file = path.endsWith(sep) ? join(path, 'index.html') : path;
  if (!file.startsWith(root + sep) || !statSync(file, { throwIfNoEntry: false })?.isFile()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(4173, '127.0.0.1');
