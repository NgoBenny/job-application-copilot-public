// Static server for synthetic fixtures on the e2e-only origin (see E2E_HOST in wxt.config.ts).
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve('tests/fixtures');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.pdf': 'application/pdf' };

const workday = resolve(root, 'workday');
const greenhouse = resolve(root, 'greenhouse');
const ashby = resolve(root, 'ashby');

function serve(req, res) {
  if (req.url === '/favicon.ico') return res.writeHead(204).end();
  // Workday hostnames are mapped here by the browser; each tenant host gets its own folder.
  const host = (req.headers.host ?? '').split(':')[0];
  // Greenhouse boards share one host; the board token is the first path segment, as live.
  const base = /myworkday(jobs|site)\.com$/.test(host) ? join(workday, host.split('.')[0]) : host === 'job-boards.greenhouse.io' ? greenhouse : host === 'jobs.ashbyhq.com' ? ashby : root;
  let path;
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    path = ['/instrument.js', '/widgets.js', '/live-like.js'].includes(pathname) ? join(workday, pathname.slice(1)) : normalize(join(base, pathname));
    // Greenhouse and Ashby URLs have no extension (/acme/jobs/1001, /acme/<job>/application).
    if ((base === greenhouse || base === ashby) && !extname(path) && statSync(`${path}.html`, { throwIfNoEntry: false })?.isFile()) path = `${path}.html`;
  } catch { return res.writeHead(400).end(); }
  const file = path.endsWith(sep) ? join(path, 'index.html') : path;
  if (!file.startsWith(root + sep) || !statSync(file, { throwIfNoEntry: false })?.isFile()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

createServer(serve).listen(4173, '127.0.0.1');
// Chrome forces HTTPS for ashbyhq.com (built-in HSTS list), so its fixtures are also served over TLS with a
// self-signed, test-only certificate; the e2e browser maps jobs.ashbyhq.com here and accepts it (ignoreHTTPSErrors).
createTlsServer({ key: readFileSync(resolve(root, 'tls/test-only.key')), cert: readFileSync(resolve(root, 'tls/test-only.crt')) }, serve).listen(4174, '127.0.0.1');
