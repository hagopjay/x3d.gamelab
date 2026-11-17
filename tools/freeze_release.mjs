// Freeze the current build as releases/<version>/ so a later build never overwrites a published page.
// Usage: node build.mjs && node tools/freeze_release.mjs   (refuses to overwrite an existing version folder)
import fs from 'fs'; import path from 'path';
const root = new URL('..', import.meta.url).pathname;
const ver = JSON.parse(fs.readFileSync(root + 'package.json', 'utf8')).version;
const dest = path.join(root, 'releases', ver);
if (fs.existsSync(dest)) { console.error(`releases/${ver} already exists; bump package.json version instead of overwriting.`); process.exit(1); }
const cp = (a, b) => fs.cpSync(path.join(root, a), path.join(dest, b ?? a), { recursive: true });
fs.mkdirSync(dest, { recursive: true });
cp('index.html'); cp('vendor/three'); cp('level');
for (const f of fs.readdirSync(root + 'docs')) if (f.endsWith('.html')) cp('docs/' + f);
console.log('froze releases/' + ver);
