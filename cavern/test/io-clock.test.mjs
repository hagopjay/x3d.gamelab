import test from 'node:test';
import assert from 'node:assert/strict';
import {FlightSim} from '../src/physics.js';
import {FixedClock} from '../src/clock.js';
import {settingsObject,parseSettings,toX3D,sampleTelemetry,toCSV,CSV_COLUMNS} from '../src/io.js';

test('settings roundtrip rejects unknown, missing, out-of-range and oversized values before mutation',()=>{
  const sim=new FlightSim(),s=settingsObject(sim.params);assert.deepEqual(parseSettings(JSON.stringify(s)),s);
  for(const change of [x=>x.physics.windSpeed=26,x=>x.physics.mass='90',x=>delete x.physics.rho,x=>x.physics.extra=1,x=>x.presentation.theme='script',x=>x.physics.assistance=1,x=>x.__proto__='bad']){
    const candidate=JSON.parse(JSON.stringify(s));change(candidate);
    // __proto__ assignment is inert on this local object; malicious JSON is tested explicitly below.
    if(Object.hasOwn(candidate,'__proto__')||candidate.physics.extra||candidate.physics.windSpeed===26||candidate.physics.mass==='90'||!Object.hasOwn(candidate.physics,'rho')||candidate.presentation.theme==='script'||candidate.physics.assistance===1)assert.throws(()=>parseSettings(JSON.stringify(candidate)));
  }
  assert.throws(()=>parseSettings(JSON.stringify(s).replace('"physics":{','"physics":{"__proto__":{},')));
  assert.throws(()=>parseSettings(' '.repeat(8193)));assert.equal(sim.params.windSpeed,0);
});

test('clock gives identical fixed ticks across monitor frame schedules and explicitly counts overload',()=>{
  const run=frames=>{const c=new FixedClock(),s=new FlightSim();s.state='flying';for(const t of frames)c.advance(t,h=>s.step(h,{bank:.1}));return {c,s};};
  const a=run(Array(60).fill(1/60)),b=run(Array(144).fill(1/144));
  assert.equal(a.c.ticks,120);assert.equal(b.c.ticks,120);assert.deepEqual(a.s.particles,b.s.particles);
  const c=new FixedClock();let ticks=0;c.advance(1,()=>ticks++);assert.equal(ticks,8);assert.ok(c.dropped>.92);assert.ok(c.alpha>=0&&c.alpha<=1);
  c.reset();assert.equal(c.dropped,0);assert.equal(c.ticks,0);assert.equal(c.accumulator,0);
});

test('X3D snapshot is deterministic, finite, disabled, explicit metadata and changes with live pose',()=>{
  const sim=new FlightSim(),snapshot=toX3D(sim);
  assert.equal(snapshot,toX3D(sim));assert.ok(snapshot.includes('enabled="false"'));assert.ok(snapshot.includes('chasm-x3d-snapshot/1'));
  assert.ok(snapshot.includes('<MetadataSet containerField="metadata"'));assert.equal((snapshot.match(/<RigidBody DEF=/g)||[]).length,14);
  assert.equal((snapshot.match(/<Shape DEF="Gate_/g)||[]).length,15);assert.ok(!/NaN|Infinity|<Script|<Inline|<!ENTITY/.test(snapshot));
  sim.state='flying';sim.step(1/120,{});assert.notEqual(toX3D(sim),snapshot);
  sim.particles[0].p[0]=NaN;assert.throws(()=>toX3D(sim),/nonfinite/);
});

test('telemetry carries SI values and sampled parameters across a live change',()=>{
  const sim=new FlightSim();sim.state='flying';sim.step(1/120,{});const a=sampleTelemetry(sim);sim.params.windSpeed=12;sim.params.compliance=.000002;sim.step(1/120,{});const b=sampleTelemetry(sim);
  assert.equal(a.length,CSV_COLUMNS.length);assert.equal(b[CSV_COLUMNS.indexOf('mean_wind_m_s')],12);assert.equal(a[CSV_COLUMNS.indexOf('mean_wind_m_s')],0);
  assert.equal(b[CSV_COLUMNS.indexOf('compliance_m_N')],.000002);assert.ok(a.every(Number.isFinite));
  const csv=toCSV([a,b],settingsObject(sim.params));assert.equal(csv.split('\n')[1],CSV_COLUMNS.join(','));assert.equal(csv.trim().split('\n').length,4);
});
