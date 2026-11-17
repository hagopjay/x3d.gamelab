// CHASM 2.0 arcade layer: opt-in world on top of the unchanged 1.0 model.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,FlightSim,caveBoundary,arcadeBoundary,windAt,course,obstacles,thermals,embers,gates} from '../src/physics.js';
import {settingsObject,parseSettings,toX3D} from '../src/io.js';
const len=a=>Math.hypot(...a);
const arcade={...DEFAULTS,arcade:true};
const place=(sim,target,v=[0,0,30])=>{const shift=target.map((x,k)=>x-sim.p[k]);for(const j of sim.particles){j.p=j.p.map((x,k)=>x+shift[k]);j.prev=[...j.p];j.v=[...v];}sim._com();};

test('arcade off: wind and collision field are exactly the 1.0 model',()=>{
  for(const t of thermals){const c=course(t.z),p=[t.x,c.y,t.z];
    assert.deepEqual(windAt(p,3,DEFAULTS),windAt(p,3,{...DEFAULTS,arcade:false}));
    assert.equal(windAt(p,3,DEFAULTS)[1],0);}
  const sim=new FlightSim(DEFAULTS),o=obstacles[0],p=[o.a[0],course(o.a[2]).y,o.a[2]];
  assert.deepEqual(sim._boundary(p),caveBoundary(p));
});

test('arcade world is deterministic, bounded and clear of the gate planes',()=>{
  assert.ok(obstacles.length>=15&&obstacles.length<=30,`obstacles ${obstacles.length}`);
  assert.ok(obstacles.some(o=>o.kind==='bar')&&obstacles.some(o=>o.kind==='pillar'));
  for(const o of obstacles)assert.ok(gates.every(g=>Math.abs(g.z-o.a[2])>=30),'obstacle near gate '+o.index);
  assert.ok(embers.length>=80);assert.ok(embers.every(e=>caveBoundary(e.p).distance>1),'every ember is inside the cave');
});

test('thermal core lifts by its declared strength and is pure prescribed wind (no thrust)',()=>{
  const t=thermals[0],c=course(t.z),core=windAt([t.x,c.y,t.z],0,arcade)[1],far=windAt([t.x+40,c.y,t.z],0,arcade)[1];
  assert.ok(core>=t.w*.8&&core<=t.w*1.2,`core ${core}`);assert.ok(Math.abs(far)<1e-6);
  const sim=new FlightSim({...arcade,rho:0,assistance:false});sim.state='flying';place(sim,[t.x,c.y,t.z-20],[0,-10,30]);
  const v0=[...sim.v];for(let i=0;i<120;i++)sim.step(1/120,{});
  assert.ok(Math.abs(sim.v[1]-(v0[1]-DEFAULTS.g))<1e-6,'zero density: thermal cannot push the body');
});

test('columns collide through the same contact pipeline: impact, crash and pushed outside the capsule',()=>{
  const o=obstacles.find(o=>o.kind==='pillar'),c=course(o.a[2]);
  const sim=new FlightSim({...arcade,rho:0,g:0,assistance:false});sim.state='flying';
  place(sim,[o.a[0],c.y,o.a[2]-6],[0,0,60]);
  for(let i=0;i<60&&sim.state==='flying';i++)sim.step(1/120,{limp:true});
  assert.ok(sim.impacts>=1);assert.ok(sim.events.some(e=>e.type==='impact'));
  assert.ok(sim.particles.every(j=>arcadeBoundary(j.p).distance>=j.radius-.05),'no particle left inside a column');
  assert.ok(sim.particles.every(j=>j.p.every(Number.isFinite)));
});

test('embers award once, feed the chain, and an impact breaks the chain',()=>{
  const e=embers[0],sim=new FlightSim({...arcade,assistance:false});sim.state='flying';
  place(sim,[e.p[0],e.p[1],e.p[2]-.3],[0,0,1]);sim.step(1/120,{});
  assert.ok(sim.embersTaken.has(e.index));const once=sim.events.filter(x=>x.type==='ember').length;assert.equal(once,1);
  for(let i=0;i<10;i++)sim._award(100,'test');assert.ok(sim.multiplier>=4,`x${sim.multiplier}`);
  place(sim,[e.p[0],e.p[1],e.p[2]-.3],[0,0,1]);sim.events.length=0;sim.step(1/120,{});
  assert.equal(sim.events.filter(x=>x.type==='ember').length,0,'cannot farm the same ember');
  const c=course(sim.p[2]);place(sim,[c.x+c.rx-4,c.y,sim.p[2]],[40,0,5]);
  for(let i=0;i<40&&sim.multiplier>1;i++)sim.step(1/120,{limp:true});
  assert.equal(sim.multiplier,1);assert.ok(sim.impacts>=1);
});

test('arcade route coach completes the course: >=13 gates, zero impacts',()=>{
  const sim=new FlightSim(arcade);sim.state='flying';
  while(sim.state==='flying'&&sim.time<200)sim.step(1/120,{});
  assert.equal(sim.state,'finished');assert.equal(sim.impacts,0);assert.ok(sim.gatesPassed>=13,`gates ${sim.gatesPassed}`);
});

test('settings: 1.0 files still load (arcade=false); bad arcade values are rejected; X3D carries the arcade world',()=>{
  const old=settingsObject(DEFAULTS);delete old.physics.arcade;
  assert.equal(parseSettings(JSON.stringify(old)).physics.arcade,false);
  const bad=settingsObject(arcade);bad.physics.arcade='yes';assert.throws(()=>parseSettings(JSON.stringify(bad)),/Arcade/);
  const sim=new FlightSim(arcade),x=toX3D(sim);
  assert.equal((x.match(/DEF="Obstacle_/g)||[]).length,obstacles.length);assert.equal((x.match(/DEF="Thermal_/g)||[]).length,thermals.length);
  assert.ok(!toX3D(new FlightSim(DEFAULTS)).includes('ArcadeWorld'));assert.ok(!/NaN|Infinity/.test(x));
});
