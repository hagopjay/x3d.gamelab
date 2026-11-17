// CHASM 2.0 browser gate: live page + frozen 1.0.0 and 2.0.0 standalone releases
// from a Pages-style subpath, and the 2.0.0 standalone again over file://.
// Checks: zero page/console errors and HTTP failures, the FX layer and its grade
// pass are wired, focus slows simulated time, gameplay events spawn particles,
// and every camera renders. Writes cavern/docs/arcade-browser-2.0.json.
// Usage: node cavern/test/arcade-browser.mjs   (CHROME=/path/to/chrome optional)
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.x3d': 'model/x3d+xml' };
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); if (!u.startsWith('/x3d.gamelab/')) { r.writeHead(404); return r.end(); }
  let f = path.join(root, u.slice(13)); if (u.endsWith('/')) f = path.join(f, 'index.html');
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
await new Promise(ok => srv.listen(0, '127.0.0.1', ok)); const base = `http://127.0.0.1:${srv.address().port}/x3d.gamelab/`;
const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = { schema: 'chasm-arcade-browser/1', created_utc: new Date().toISOString(), browser: browser.version(), renderer: 'SwiftShader (software WebGL2 via ANGLE)', targets: [] };
let fails = 0;
async function open(url, deep) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errs = [], checks = [];
  const check = (name, ok, detail) => { checks.push({ name, pass: !!ok, detail }); if (!ok) fails++; };
  page.on('pageerror', e => errs.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
  await page.goto(url); await page.waitForFunction(() => window.__chasm?.view, null, { timeout: 30000 });
  await page.click('#launch'); await page.waitForTimeout(1500);
  const live = await page.evaluate(() => ({ state: __chasm.sim.state, time: __chasm.sim.time, fx: !!__chasm.view.fx, arcade: !!__chasm.sim.params.arcade }));
  check('flight starts and simulated time advances', live.state === 'flying' && live.time > .05, live);
  if (deep) {
    check('arcade world on by default with FX layer', live.fx && live.arcade, live);
    const grade = await page.evaluate(() => __chasm.view.composer.passes.map(p => p.constructor.name));
    check('grade pass sits between bloom and output', grade.indexOf('ShaderPass') > grade.indexOf('UnrealBloomPass') && grade.indexOf('ShaderPass') < grade.indexOf('OutputPass'), grade);
    await page.keyboard.down('ShiftLeft'); await page.waitForTimeout(900);
    const focus = await page.evaluate(() => ({ on: __chasm.focusOn, scale: __chasm.timeScale, meter: __chasm.focus }));
    await page.keyboard.up('ShiftLeft');
    check('holding Shift engages focus and slows simulated time', focus.on && focus.scale < .6, focus);
    const fx = await page.evaluate(() => { const S = __chasm, before = S.view.fx.sparks.alpha.filter(a => a > 0).length; S.paused = true; const types = {};
      while (S.sim.p[2] < 700 && S.sim.state === 'flying') { S.sim.step(1 / 120, {}); for (const e of S.sim.events.splice(0)) { types[e.type] = (types[e.type] || 0) + 1; S.view.fx.onEvent(e, S.sim); } }
      S.view.fx.sparks.update(.016); const after = S.view.fx.sparks.alpha.filter(a => a > 0).length; S.paused = false; S.view.cameraReady = false; return { before, after, types, z: S.sim.p[2], score: S.sim.score, mult: S.sim.multiplier }; });
    check('gate events spawn particles and score through the chain', fx.after > fx.before && fx.types.gate >= 3, fx);
    const cams = [];
    for (const mode of ['chase', 'helmet', 'orbit']) { await page.evaluate(m => { __chasm.view.cameraMode = m; __chasm.view.cameraReady = false; }, mode); await page.waitForTimeout(700); cams.push(await page.evaluate(() => __chasm.view.stats())); }
    check('three cameras render with draw calls', cams.every(c => c.drawCalls > 20), cams.map(c => ({ camera: c.camera, drawCalls: c.drawCalls, triangles: c.triangles })));
  }
  check('zero page errors and HTTP failures', !errs.length, errs);
  report.targets.push({ url: url.replace(/127\.0\.0\.1:\d+/, 'localhost').replace(pathToFileURL(root).href, 'file://<repo>'), checks });
  for (const c of checks) console.log((c.pass ? 'PASS ' : 'FAIL ') + url.replace(base, '/x3d.gamelab/') + ' :: ' + c.name + (c.pass ? '' : ' ' + JSON.stringify(c.detail)));
  await page.close();
}
await open(base + 'cavern/', true);
await open(base + 'cavern/releases/2.0.0/', true);
await open(base + 'cavern/releases/1.0.0/', false);
await open(pathToFileURL(path.join(root, 'cavern/releases/2.0.0/index.html')).href, false);
report.status = fails ? 'fail' : 'pass'; report.failures = fails;
fs.writeFileSync(path.join(root, 'cavern/docs/arcade-browser-2.0.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close(); srv.close(); console.log(report.status.toUpperCase(), report.browser, 'failures', fails); process.exit(fails ? 1 : 0);
