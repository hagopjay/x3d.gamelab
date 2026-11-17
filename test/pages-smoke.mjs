// Serve the repo from a sub-folder (like GitHub Pages project sites) and load the page and each frozen release in headless Chromium.
// Fails on any page error, console error or HTTP >= 400, and requires the simulation loop to be stepping with 255 bodies / 182 joints.
// Usage: node test/pages-smoke.mjs [--url http://host/x3d.gamelab/]   (default: local static server under /x3d.gamelab/)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.x3d': 'model/x3d+xml', '.png': 'image/png', '.css': 'text/css' };
const argUrl = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : null;
let base = argUrl, srv;
if (!base) {
  srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); if (!u.startsWith('/x3d.gamelab/')) { r.writeHead(404); return r.end(); }
    let f = path.join(root, u.slice('/x3d.gamelab/'.length)); if (u.endsWith('/')) f = path.join(f, 'index.html');
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('nf'); }
    r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok)); base = `http://127.0.0.1:${srv.address().port}/x3d.gamelab/`;
}
const ver = JSON.parse(fs.readFileSync(root + '/package.json', 'utf8')).version;
const targets = [base, base + 'releases/' + ver + '/'];
const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
for (const url of targets) {
  const page = await browser.newPage({ viewport: { width: 1360, height: 800 } }); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
  await page.goto(url); await page.waitForFunction(() => window.__flop && window.__flop.S.sim, null, { timeout: 30000 }).catch((e) => { console.log("FAIL " + url + " never started: " + (errs.join(" | ") || e.message)); process.exit(1); }); await page.waitForTimeout(2000);
  const i = await page.evaluate(() => ({ frame: __flop.S.sim.W.frame, bodies: __flop.S.level.bodies.length, joints: __flop.S.level.joints.length, composer: !!__flop.view.composer }));
  const good = !errs.length && i.frame > 5 && i.bodies === 255 && i.joints === 182 && i.composer;
  console.log((good ? 'PASS ' : 'FAIL ') + url + ' ' + JSON.stringify(i) + (errs.length ? ' ' + errs.join(' | ') : '')); if (!good) fails++; await page.close();
}
await browser.close(); srv?.close(); process.exit(fails ? 1 : 0);
