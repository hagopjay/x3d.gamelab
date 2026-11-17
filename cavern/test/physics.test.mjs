import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,FlightSim,aeroForces,course,caveBoundary,gates,wallScale,wallPoint} from '../src/physics.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const norm=a=>Math.hypot(...a);
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,`${a} ≈ ${b}`);
const params={...DEFAULTS,windSpeed:0,gust:0,assistance:false};
const orientation={forward:[0,Math.sin(.13),Math.cos(.13)],up:[0,Math.cos(.13),-Math.sin(.13)]};

test('aerodynamic forces scale with dynamic pressure and oppose relative flow',()=>{
  const v=[0,0,40],a=aeroForces(v,[0,0,0],params,orientation);
  const faster=aeroForces([0,0,80],[0,0,0],params,orientation);
  const denser=aeroForces(v,[0,0,0],{...params,rho:params.rho*2},orientation);
  near(faster.lift/a.lift,4);near(faster.drag/a.drag,4);near(denser.lift/a.lift,2);
  near(dot(a.liftVector,v),0,1e-7);assert.ok(dot(a.dragVector,v)<0);
  const shifted=aeroForces([7,3,51],[7,3,11],params,orientation);
  a.force.forEach((x,i)=>near(x,shifted.force[i]));
});

test('zero air density yields ballistic COM with no hidden propulsion',()=>{
  const sim=new FlightSim({...params,rho:0});sim.state='flying';
  const initialV=[...sim.v],initialP=[...sim.p];
  for(let i=0;i<120;i++)sim.step(1/120,{bank:1,pitch:1});
  near(sim.v[0],initialV[0],1e-8);near(sim.v[2],initialV[2],1e-8);
  near(sim.v[1],initialV[1]-params.g,1e-7);
  near(sim.p[2],initialP[2]+initialV[2],1e-7);
});

test('XPBD internal pose and link forces preserve COM momentum without external force',()=>{
  const sim=new FlightSim({...params,rho:0,g:0});sim.state='flying';
  const initial=[...sim.v];sim.particles[7].p[1]+=1;sim._com();
  for(let i=0;i<100;i++)sim.step(1/120,{bank:Math.sin(i*.1)});
  sim.v.forEach((x,k)=>near(x,initial[k],1e-7));
  assert.ok(sim.particles.every(j=>j.p.every(Number.isFinite)));
});

test('fixed input sequence is deterministic and reset clears run events',()=>{
  const a=new FlightSim(params),b=new FlightSim(params);a.state=b.state='flying';
  for(let i=0;i<240;i++){const input={bank:Math.sin(i*.02)*.3,pitch:.1};a.step(1/120,input);b.step(1/120,input);}
  assert.deepEqual(a.particles,b.particles);assert.deepEqual(a.telemetry,b.telemetry);
  a._emit({type:'stale'});a.score=100;a.reset();assert.equal(a.state,'ready');
  assert.equal(a.events.length,0);assert.equal(a.score,0);assert.equal(a._gateResults.size,0);
});

test('high speed swept wall contact stays finite and inside the collision shell',()=>{
  const sim=new FlightSim({...params,rho:0,g:0});sim.state='flying';
  const c=course(10),shift=[c.x+30-sim.p[0],c.y-sim.p[1],10];
  for(const j of sim.particles){j.p=j.p.map((v,k)=>v+shift[k]);j.prev=[...j.p];j.v=[240,0,30];}
  sim._com();sim.step(.08,{limp:true});
  assert.ok(sim.particles.every(j=>j.p.every(Number.isFinite)&&j.v.every(Number.isFinite)));
  assert.ok(sim.particles.every(j=>caveBoundary(j.p).distance>=j.radius-.025));
  assert.ok(sim.p[0]<course(sim.p[2]).x+course(sim.p[2]).rx);
  assert.ok(sim.impacts>=1);assert.equal(sim.state,'crashed');
  assert.ok(sim.events.some(e=>e.type==='impact'&&e.speed>100));
  assert.ok(sim.telemetry.peakImpact>100);
  for(const j of sim.particles.filter(j=>j.contact)){
    assert.ok(dot(j.v,j.contact.normal)>=-.01,'contact velocity points back into cavern');
    assert.ok(norm(j.v)<300,'contact response adds no explosive normal velocity');
  }
});

test('swept gate crossing awards once, and reversing cannot farm the same gate',()=>{
  const sim=new FlightSim({...params,rho:0,g:0});sim.state='flying';
  const gate=gates[0],target=[gate.x,gate.y,gate.z-.1],delta=target.map((v,i)=>v-sim.p[i]);
  for(const j of sim.particles){j.p=j.p.map((v,i)=>v+delta[i]);j.prev=[...j.p];j.v=[0,0,50];}
  sim._com();sim.step(1/120,{});assert.equal(sim.gatesPassed,1);
  const score=sim.score;for(let i=0;i<30;i++)sim.step(1/120,{});
  assert.equal(sim.gatesPassed,1);assert.equal(sim.score,score);
  assert.equal(sim.events.filter(e=>e.type==='gate').length,1);
  assert.ok(sim.passedGates.has(0));assert.equal(sim.gateOutcomes.get(0),'gate');
  for(const j of sim.particles)j.v=[0,0,-50];sim._com();
  for(let i=0;i<40;i++)sim.step(1/120,{});
  for(const j of sim.particles)j.v=[0,0,50];sim._com();
  for(let i=0;i<40;i++)sim.step(1/120,{});
  assert.equal(sim.gatesPassed,1);assert.equal(sim.score,score);
});

test('still air coefficients predict a finite plausible uncalibrated trim oracle',()=>{
  const cl=.55,cd=.14+.24*cl*cl;
  const speed=Math.sqrt(2*params.mass*params.g/(params.rho*params.area*Math.hypot(cl,cd)));
  near(speed,39.081,0.01);near(cl/cd,2.587,0.002);
  const direction=Math.atan2(cd,cl),v=[0,-speed*Math.sin(direction),speed*Math.cos(direction)];
  const alpha=(cl-.19)/2.8,pitch=-direction+alpha;
  const o={forward:[0,Math.sin(pitch),Math.cos(pitch)],up:[0,Math.cos(pitch),-Math.sin(pitch)]};
  const a=aeroForces(v,[0,0,0],params,o);
  near(a.force[0],0);near(a.force[1],params.mass*params.g,1e-7);near(a.force[2],0,1e-7);
});

test('manual bank and pitch override their individual assistance channels',()=>{
  const assisted=new FlightSim({...params,assistance:true}),manual=new FlightSim(params);
  assisted.state=manual.state='flying';
  for(let i=0;i<60;i++){assisted.step(1/120,{bank:.4,pitch:-.3});manual.step(1/120,{bank:.4,pitch:-.3});}
  assisted.p.forEach((v,i)=>near(v,manual.p[i],1e-10));
  near(assisted.bank,manual.bank);near(assisted.pitch,manual.pitch);
});

test('combined extreme control settings remain finite within the advertised envelope',()=>{
  const extremes=[
    {mass:60,area:1.2,rho:.6,g:15,windSpeed:25,windDirection:360,gust:8,liftScale:.5,dragScale:1.5,compliance:.002},
    {mass:120,area:2.2,rho:1.4,g:1,windSpeed:25,windDirection:0,gust:8,liftScale:1.5,dragScale:.5,compliance:0}
  ];
  for(const p of extremes){
    const sim=new FlightSim({...params,...p});sim.state='flying';
    for(let i=0;i<120*8&&sim.state==='flying';i++)sim.step(1/120,{bank:Math.sin(i*.03),pitch:Math.cos(i*.023),limp:i>500});
    assert.ok(sim.particles.every(j=>j.p.every(Number.isFinite)&&j.v.every(Number.isFinite)));
    assert.ok(sim.particles.every(j=>norm(j.v)<300));
    assert.ok(sim.particles.every(j=>caveBoundary(j.p).distance>=j.radius-.04));
    assert.ok(Number.isFinite(sim.telemetry.q));
  }
});

test('calm guided flight completes the entire route with gates and no impact',()=>{
  const sim=new FlightSim();sim.state='flying';
  for(let i=0;i<120*85&&sim.state==='flying';i++)sim.step(1/120,{});
  assert.equal(sim.state,'finished');assert.ok(sim.gatesPassed>=3);assert.equal(sim.impacts,0);
  assert.ok(sim.time>50&&sim.time<85);assert.ok(sim.p.every(Number.isFinite));
});

test('shared natural wall stays bounded and its exact points match collision zero',()=>{
  for(const z of [0,250,779,820,899,900,1200,1700,1701,1780,1820,2350]){
    const c=course(z);
    for(let i=0;i<96;i++){
      const a=i*Math.PI*2/96,scale=wallScale(z,a),point=wallPoint(z,a),b=caveBoundary(point);
      assert.ok(scale>=.91-1e-12&&scale<=1.09+1e-12);near(b.distance,0,1e-10);
      assert.ok(dot(b.normal,[c.x-point[0],c.y-point[1],0])>0,'normal points into tunnel');
      const inside=point.map((v,k)=>v+b.normal[k]*.1),outside=point.map((v,k)=>v-b.normal[k]*.1);
      assert.ok(caveBoundary(inside).distance>0);assert.ok(caveBoundary(outside).distance<0);
      if(z>=900&&z<=1700)near(scale,1);
    }
  }
});

test('wall gradient matches numerical surface gradient through blends and lobes',()=>{
  for(const z of [100,835,895,1710,1780,2200])for(const a of [.2,1.8,3.4,5.7]){
    const p=wallPoint(z,a),normal=caveBoundary(p).normal,epsilon=.0001,gradient=[];
    for(let axis=0;axis<3;axis++){
      const plus=[...p],minus=[...p];plus[axis]+=epsilon;minus[axis]-=epsilon;
      gradient.push((caveBoundary(plus).distance-caveBoundary(minus).distance)/(2*epsilon));
    }
    const gradientLength=norm(gradient);
    gradient.forEach((v,k)=>near(v/gradientLength,normal[k],1e-6));
  }
});
