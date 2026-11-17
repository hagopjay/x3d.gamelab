// Build a double-clickable, entirely offline HTML. Only Node built-ins needed.
// Imports are remapped to embedded data modules, retaining the pinned source
// and licenses rather than introducing a second renderer/bundler dependency.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const output=process.argv[2]||path.join(root,'CHASM-Wingsuit-Observatory.html');
const modules=new Map();
function resolve(specifier,from){
  if(specifier==='three')return 'vendor/three/build/three.module.js';
  if(specifier.startsWith('three/addons/'))return 'vendor/three/examples/jsm/'+specifier.slice(13);
  if(specifier.startsWith('.'))return path.posix.normalize(path.posix.join(path.posix.dirname(from),specifier));
  throw Error('Unrecognized module '+specifier+' from '+from);
}
function visit(file){
  if(modules.has(file))return;
  if(file.startsWith('../')||!file.endsWith('.js'))throw Error('Invalid module path '+file);
  modules.set(file,'');
  const src=fs.readFileSync(path.join(root,file),'utf8');
  const rewritten=src.replace(/\b(from\s*|import\s*)(['"])([^'"\n]+)\2/g,(match,prefix,quote,specifier)=>{
    const dependency=resolve(specifier,file);visit(dependency);return prefix+quote+'chasm/'+dependency+quote;
  });
  modules.set(file,'data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64'));
}
visit('cavern/src/app.js');
let html=fs.readFileSync(path.join(root,'cavern/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'cavern/style.css'),'utf8');
const imports=Object.fromEntries([...modules].map(([key,value])=>['chasm/'+key,value]));
html=html.replace('<link rel="stylesheet" href="style.css">','<style>'+css+'</style>')
  .replace(/<script type="importmap">[\s\S]*?<\/script>/,'<script type="importmap">'+JSON.stringify({imports})+'</script>')
  .replace('<script type="module" src="src/app.js"></script>','<script type="module">import "chasm/cavern/src/app.js";</script>');
const guide=fs.readFileSync(path.join(root,'cavern/docs/FIELD-GUIDE.html'),'utf8').replace('href="../index.html"','href="#" onclick="return false"');
const embeddedGuide=`<dialog id="offline-guide" style="width:94vw;height:94vh;max-width:1300px;max-height:96vh;padding:0;border:1px solid #68877e;background:#07101b;border-radius:6px"><button id="guide-close" style="position:absolute;right:16px;top:12px;z-index:2">Return to flight ×</button><iframe title="Pilot field guide" style="border:0;width:100%;height:100%"></iframe></dialog>
<script id="guide-data" type="application/json">${JSON.stringify(guide).replaceAll('<','\\u003c')}</script>
<script>document.querySelectorAll('a[href="docs/FIELD-GUIDE.html"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const d=document.getElementById('offline-guide');d.querySelector('iframe').srcdoc=JSON.parse(document.getElementById('guide-data').textContent);d.showModal();}));document.getElementById('guide-close').onclick=()=>document.getElementById('offline-guide').close();</script>`;
const notice=fs.readFileSync(path.join(root,'vendor/three/LICENSE'),'utf8');
html=html.replace('</body>',embeddedGuide+'\n<!-- Bundled Three.js notice:\n'+notice.replaceAll('--','—')+'\n-->\n</body>');
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,html);
console.log(JSON.stringify({file:path.resolve(output),bytes:Buffer.byteLength(html),embeddedModules:modules.size,externalRuntimeRequests:0}));
