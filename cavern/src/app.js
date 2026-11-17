import {FlightSim,DEFAULTS,gates,COURSE_LENGTH,clamp} from './physics.js';
import {CavernView} from './view.js';
import {FixedClock} from './clock.js';
import {settingsObject,parseSettings,toX3D,sampleTelemetry,toCSV} from './io.js';

const $=id=>document.getElementById(id);
const sim=new FlightSim({...DEFAULTS,windSpeed:0,gust:0});
const clock=new FixedClock();
const keys=new Set(),held=new Set();
const S={sim,clock,paused:false,limp:false,practice:false,guided:false,rows:[],sampleAt:0,view:null,physicsMs:0,renderMs:0,fps:0,started:false};
window.__chasm=S; // Deliberate, read/write local laboratory surface; no eval.
let view,toastUntil=0,uiAt=0,lastTime=performance.now(),lastState='ready',soundOn=false;
const cleanInput=()=>{keys.clear();held.clear();document.querySelectorAll('[data-hold]').forEach(b=>b.classList.remove('held'));};
function toast(message,seconds=2.7){$('toast').textContent=message;$('toast').classList.add('on');toastUntil=performance.now()+seconds*1000;}
function download(name,data,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function config(){return settingsObject(sim.params,{theme:view.theme,quality:view.quality,camera:view.cameraMode});}
function markPractice(){if(S.started)S.practice=true;}
function clearRun(){sim.reset();clock.reset();S.rows=[];S.sampleAt=0;S.limp=false;S.practice=false;cleanInput();view.cameraReady=false;lastState='ready';$('result').hidden=true;$('paused').hidden=true;}
function start(guided=false){clearRun();S.started=true;S.guided=guided;S.paused=false;sim.state='flying';document.body.classList.add('playing');$('intro').hidden=true;$('launch').blur();$('world').focus({preventScroll:true});lastTime=performance.now();toast(guided?'GUIDED FLIGHT / WATCH THE AIR, THEN TAKE CONTROL':'FIND YOUR LINE / A D BANK · W DIVE · S FLARE',3.4);}
function pause(force){if(!S.started||!['flying'].includes(sim.state))return;S.paused=force??!S.paused;$('paused').hidden=!S.paused;$('pause').innerHTML=S.paused?'Resume <kbd>P</kbd>':'Pause <kbd>P</kbd>';cleanInput();clock.accumulator=0;}
function toggleLimp(){if(sim.state!=='flying')return;S.limp=!S.limp;$('limp').innerHTML=(S.limp?'Recover':'Go limp')+' <kbd>F</kbd>';toast(S.limp?'LIMP / MEMBRANES LOSE LIFT':'HARNESS ENGAGED / RECOVERING POSE');}
function cycleCamera(){const modes=['chase','helmet','orbit'];view.cameraMode=modes[(modes.indexOf(view.cameraMode)+1)%modes.length];$('camera').value=view.cameraMode;view.cameraReady=false;toast('CAMERA / '+({chase:'CHASE',helmet:'HELMET',orbit:'WITNESS'}[view.cameraMode]));}
function showLab(open){$('lab').hidden=!open;$('settings-btn').setAttribute('aria-expanded',String(open));if(open)$('close-lab').focus({preventScroll:true});else $('world').focus({preventScroll:true});}

try{view=new CavernView($('world'));S.view=view;}
catch(e){$('fatal').hidden=false;$('fatal-copy').textContent='CHASM needs WebGL 2. Enable browser hardware acceleration, then reload. '+e.message;$('intro').hidden=true;throw e;}
view.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;$('comfort').checked=view.reducedMotion;
// Cheap defaults on small touch screens; the player can raise quality at any time.
if(innerWidth<700){view.setQuality('low');$('quality').value='low';}

const sliders=[
  ['windSpeed','Mean wind',0,25,.5,'m/s',1],['windDirection','Wind direction · 0° = tailwind',0,360,5,'°',0],
  ['gust','Gust amplitude',0,8,.1,'m/s',1],['mass','Pilot + equipment mass',60,120,1,'kg',0],
  ['area','Reference suit area',1.2,2.2,.05,'m²',2],['rho','Air density',.6,1.4,.025,'kg/m³',3],
  ['g','Gravity',1,15,.1,'m/s²',2],['liftScale','Lift coefficient scale',.5,1.5,.05,'×',2],
  ['dragScale','Drag coefficient scale',.5,1.5,.05,'×',2],['compliance','Joint compliance',0,.002,.000002,'m/N',6]
];
for(const [key,label,min,max,step,unit,precision] of sliders){
  const row=document.createElement('div');row.className='slider-row';
  const caption=document.createElement('label');caption.className='slider-caption';caption.htmlFor='param-'+key;
  const title=document.createElement('span');title.textContent=label;const output=document.createElement('output');output.htmlFor='param-'+key;output.id='out-'+key;
  const input=document.createElement('input');input.id='param-'+key;input.type='range';input.min=min;input.max=max;input.step=step;input.value=sim.params[key];input.dataset.key=key;
  const update=()=>{output.textContent=Number(input.value).toFixed(precision)+' '+unit;};update();
  input.addEventListener('input',()=>{sim.params[key]=Number(input.value);update();markPractice();document.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('active'));});
  caption.append(title,output);row.append(caption,input);$('physics-controls').append(row);
}
function syncControls(){for(const [key,,,,,unit,precision] of sliders){const input=$('param-'+key);input.value=sim.params[key];$('out-'+key).textContent=Number(sim.params[key]).toFixed(precision)+' '+unit;}$('assistance').checked=!!sim.params.assistance;}
const presets={calm:{windSpeed:0,gust:0,windDirection:90},crosswind:{windSpeed:8,gust:2,windDirection:90},storm:{windSpeed:14,gust:6,windDirection:135}};
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{Object.assign(sim.params,presets[b.dataset.preset]);syncControls();markPractice();document.querySelectorAll('[data-preset]').forEach(x=>x.classList.toggle('active',x===b));toast('WIND FIELD / '+b.textContent.toUpperCase());}));
$('assistance').onchange=()=>{sim.params.assistance=$('assistance').checked;S.guided=false;markPractice();};
$('launch').onclick=()=>start(false);$('tour').onclick=()=>{sim.params.assistance=true;syncControls();start(true);};$('again').onclick=()=>start(S.guided);$('reset').onclick=()=>start(false);
$('pause').onclick=()=>pause();$('resume').onclick=()=>pause(false);$('limp').onclick=toggleLimp;$('cycle-camera').onclick=cycleCamera;
$('settings-btn').onclick=()=>showLab($('lab').hidden);$('close-lab').onclick=()=>showLab(false);
$('theme').onchange=e=>{view.theme=e.target.value;};$('quality').onchange=e=>{view.setQuality(e.target.value);};
$('camera').onchange=e=>{view.cameraMode=e.target.value;view.cameraReady=false;};$('overlays').onchange=e=>{view.overlays=e.target.checked;};$('comfort').onchange=e=>{view.reducedMotion=e.target.checked;};
$('export-x3d').onclick=()=>{try{download('CHASM-cavern-snapshot.x3d',toX3D(sim,{theme:view.theme,quality:view.quality,camera:view.cameraMode}),'model/x3d+xml');toast('EXPORTED / STATIC X3D SCENE + SOLVER METADATA');}catch(e){toast(e.message,5);}};
const exportCSV=()=>{download('CHASM-flight.csv',toCSV(S.rows,config()),'text/csv');toast('EXPORTED / '+S.rows.length+' TELEMETRY SAMPLES');};
$('export-csv').onclick=exportCSV;$('result-export').onclick=exportCSV;
$('export-settings').onclick=()=>download('CHASM-settings.json',JSON.stringify(config(),null,2)+'\n','application/json');
$('import-settings').onclick=()=>$('settings-file').click();
$('settings-file').onchange=async e=>{
  const f=e.target.files?.[0];if(!f)return;
  try{if(f.size>8192)throw Error('Settings must be smaller than 8 KiB.');const v=parseSettings(await f.text());
    Object.assign(sim.params,v.physics);view.theme=v.presentation.theme;view.setQuality(v.presentation.quality);view.cameraMode=v.presentation.camera;
    $('theme').value=view.theme;$('quality').value=view.quality;$('camera').value=view.cameraMode;syncControls();markPractice();toast('SETTINGS LOADED / APPLIED AS ONE EXPERIMENT');
  }catch(err){toast(err.message,6);}finally{e.target.value='';}
};

const relevant=new Set(['KeyA','KeyD','KeyW','KeyS','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyF','KeyP','KeyR','KeyC','Escape','KeyL']);
window.addEventListener('keydown',e=>{
  if((/INPUT|SELECT|TEXTAREA|SUMMARY/.test(e.target.tagName)||e.target.tagName==='BUTTON'&&e.code==='Space')&&e.code!=='Escape')return;
  if(!relevant.has(e.code))return;e.preventDefault();keys.add(e.code);
  if(e.repeat)return;
  if(e.code==='KeyP')pause();if(e.code==='Escape'){if(!$('lab').hidden)showLab(false);else pause();}
  if(e.code==='KeyR')start(false);if(e.code==='KeyC')cycleCamera();if(e.code==='KeyF')toggleLimp();if(e.code==='KeyL')showLab($('lab').hidden);
  if(e.code==='Space'&&!S.started)start(false);
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{cleanInput();if(S.started&&sim.state==='flying')pause(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cleanInput();pause(true);}});
document.querySelectorAll('[data-hold]').forEach(b=>{
  b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);held.add(b.dataset.hold);b.classList.add('held');};
  const release=()=>{held.delete(b.dataset.hold);b.classList.remove('held');};b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;
});
window.addEventListener('resize',()=>view.resize());
$('world').addEventListener('webglcontextlost',e=>{e.preventDefault();pause(true);$('fatal').hidden=false;$('fatal-copy').textContent='The graphics context was lost. Reload CHASM to restart the renderer.';});

let audio;
$('sound').onclick=()=>{
  try{
    if(!audio){const ctx=new AudioContext(),buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0);let brown=0;
      for(let i=0;i<data.length;i++){brown=(brown+(Math.random()*2-1)*.025)/1.025;data[i]=brown*3;}
      const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=900;
      const gain=ctx.createGain();gain.gain.value=0;source.connect(filter).connect(gain).connect(ctx.destination);source.start();audio={ctx,gain,filter};}
    audio.ctx.resume();soundOn=!soundOn;$('sound').textContent=soundOn?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(soundOn));
  }catch(e){toast('Audio unavailable in this browser.');}
};

function handleEvents(){for(const e of sim.events.splice(0)){
  if(e.type==='gate')toast('THREAD THE NEEDLE / +'+e.points,1.4);
  else if(e.type==='near')toast('CLOSE ENCOUNTER / +100',1.5);
  else if(e.type==='impact')toast('ROCK KISS / '+e.speed.toFixed(1)+' M/S NORMAL IMPACT',1.8);
  else if(e.type==='miss')toast('GATE MISSED / THE NEXT LINE IS YOURS',1.2);
}}
function updateUI(now){
  const t=sim.telemetry,z=clamp(sim.p[2],0,COURSE_LENGTH),stats=view.stats();
  $('airspeed').textContent=(t.airspeed||0).toFixed(0);$('speed-bar').style.width=clamp(t.airspeed/80*100,0,100)+'%';
  const instrument=(id,value,unit)=>{$(id).replaceChildren(document.createTextNode(Number(value||0).toFixed(id==='ld'?2:1)));const small=document.createElement('small');small.textContent=unit;$(id).append(small);};
  instrument('sink',t.sink,'M/S');instrument('ld',t.ld,'RATIO');instrument('wind',Math.hypot(...t.wind),'M/S');instrument('clearance',Math.max(0,t.clearance),'M');
  $('gates').textContent=String(sim.gatesPassed).padStart(2,'0')+' / '+gates.length;$('score').textContent=String(sim.score).padStart(5,'0');
  $('route-dot').style.left=(z/COURSE_LENGTH*100)+'%';$('distance').textContent=String(Math.round(z)).padStart(4,'0')+' / 2400 M';
  $('chapter').textContent=view.theme==='virtual'?'THE CONSTRUCT':view.theme==='natural'?'BASALT CATHEDRAL':z<900?'BASALT CATHEDRAL':z<1700?'THE CONSTRUCT':'INTO THE LIGHT';
  $('flight-state').textContent=S.paused?'FLIGHT PAUSED':S.limp?'LIMP / LOW LIFT':sim.state==='flying'?'DESCENDING / '+sim.time.toFixed(1)+' S':sim.state.toUpperCase();
  $('run-label').textContent=(S.practice?'EXPERIMENT':S.guided?'GUIDED FLIGHT':'LOCAL FLIGHT')+' · COACH '+(sim.params.assistance?'ON':'OFF');
  $('limp').innerHTML=(S.limp?'Recover':'Go limp')+' <kbd>F</kbd>';
  $('diagnostics').textContent=`FIXED STEP     120 Hz\nPHYSICS        ${S.physicsMs.toFixed(2)} ms / tick\nRENDER SUBMIT  ${S.renderMs.toFixed(2)} ms\nOBSERVED RAF   ${S.fps.toFixed(0)} frames/s\nDROPPED TIME   ${clock.dropped.toFixed(3)} s\nJOINTS / LINKS ${sim.particles.length} / ${sim.links.length}\nDRAWS / TRIS   ${stats.drawCalls??stats.calls??'—'} / ${stats.triangles??'—'}\nLOAD RESULTANT ${(t.load||0).toFixed(2)} × weight\nPRESSURE       ${(t.q||0).toFixed(0)} Pa\nGROUND SPEED   ${(t.groundspeed||0).toFixed(1)} m/s\nCAPTURE        ${S.rows.length} / 20000 samples`;
  $('perf').textContent=`120 HZ PHYSICS / ${S.physicsMs.toFixed(2)} MS TICK · ${view.quality.toUpperCase()}${clock.dropped>.1?' · SIM TIME LIMITED':''}`;
  if(now>toastUntil)$('toast').classList.remove('on');
}
function finish(){
  $('result').hidden=false;$('paused').hidden=true;
  $('result-tag').textContent=sim.state==='finished'?'DESCENT COMPLETE':'RESCUE CREW INBOUND';
  $('result-title').textContent=sim.state==='finished'?'Into the light.':'A dramatic entrance.';
  $('result-copy').textContent=`${sim.gatesPassed} of ${gates.length} gates · ${sim.nearMisses} close encounters · ${sim.impacts} impacts. ${sim.score.toLocaleString()} local points in ${sim.time.toFixed(1)} seconds. ${S.practice?'An experimental run with live tuning.':'Try a new wind field, or switch the coach off.'}`;
  cleanInput();
}
function frame(now){
  const dt=Math.max(0,(now-lastTime)/1000);lastTime=now;S.fps+=(1/Math.max(dt,.001)-S.fps)*.04;
  if(sim.state==='flying'&&!S.paused){
    const input={bank:(keys.has('KeyD')||keys.has('ArrowRight')||held.has('right')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')||held.has('left')?1:0),
      pitch:(keys.has('KeyS')||keys.has('ArrowDown')||keys.has('Space')||held.has('flare')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')||held.has('dive')?1:0),limp:S.limp};
    if(input.bank||input.pitch)S.guided=false;
    const start=performance.now();let ticks=clock.advance(dt,h=>{sim.step(h,input);if(sim.time>=S.sampleAt&&S.rows.length<20000){S.rows.push(sampleTelemetry(sim));S.sampleAt=sim.time+.1;}});
    if(ticks)S.physicsMs+=((performance.now()-start)/ticks-S.physicsMs)*.1;
    handleEvents();
  } else clock.accumulator=0;
  // Interpolate articulation between its two most recent physics poses. The
  // authoritative simulation remains available unchanged for X3D and telemetry.
  const visual=Object.create(sim),alpha=sim.state==='flying'&&!S.paused?clock.alpha:1;visual.limp=S.limp;
  visual.particles=sim.particles.map(j=>({...j,p:j.p.map((v,k)=>j.prev[k]+(v-j.prev[k])*alpha)}));
  const rs=performance.now();view.render(visual,S.paused?0:Math.min(dt,.05));S.renderMs+=(performance.now()-rs-S.renderMs)*.08;
  if(sim.state!==lastState){if(sim.state==='finished'||sim.state==='crashed')finish();lastState=sim.state;}
  if(now-uiAt>120){updateUI(now);uiAt=now;}
  if(audio){const active=soundOn&&!S.paused&&sim.state==='flying';audio.gain.gain.setTargetAtTime(active?clamp(sim.telemetry.airspeed/200,0,.35):0,audio.ctx.currentTime,.12);audio.filter.frequency.setTargetAtTime(300+sim.telemetry.airspeed*18,audio.ctx.currentTime,.2);}
  requestAnimationFrame(frame);
}
syncControls();requestAnimationFrame(frame);
