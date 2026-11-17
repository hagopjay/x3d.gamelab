/* Cavern flight: SI units. Coefficients are game-design estimates, not suit data.
 * One aerodynamic resultant acts on the mass-weighted articulated body. Internal
 * pose forces and XPBD links preserve linear momentum. No translational thrust.
 * References and limitations are recorded in ../docs/FIELD-GUIDE.html. */
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const COURSE_LENGTH = 2400;
export const DEFAULTS = Object.freeze({mass:90,area:1.6,rho:1.225,g:9.80665,
  windSpeed:0,windDirection:90,gust:0,liftScale:1,dragScale:1,
  compliance:0.000002,assistance:true,arcade:false});
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const len=a=>Math.hypot(...a);
const unit=(a,fallback=[0,0,1])=>len(a)>1e-9?mul(a,1/len(a)):[...fallback];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);

export function course(z) {
  return {x:12*Math.sin(z*.003)+6*Math.sin(z*.008),y:1200-z*.40,
    rx:42+5*Math.sin(z*.004),ry:32+4*Math.sin(z*.005+.7),
    theme:z>=900&&z<=1700?'virtual':'natural'};
}
export const gates=Array.from({length:15},(_,i)=>{
  const z=120+i*155,c=course(z);
  return {x:c.x+Math.sin(i*.9)*8,y:c.y+Math.sin(i*.7)*5,z,radius:7,index:i};
});
// ---------------------------------------------------------------------------
// ARCADE LAYER (CHASM 2.0). Opt-in with params.arcade. A deterministic,
// prescribed game world on top of the unchanged 1.0 flight model: rock
// columns and construct light-bars (capsule colliders sharing the same contact
// pipeline as the walls), thermal updrafts (prescribed wind, never thrust) and
// collectible embers. Off by default, so the 1.0 model and its tests hold.
export const COACH={reach:190,full:60,pitchGain:.05,yBias:0};
export const EMBER_RADIUS=2.8;
const h1=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453123;return v-Math.floor(v);};
const nearGate=z=>gates.some(g=>Math.abs(g.z-z)<30);
export const obstacles=(()=>{
  const out=[];let k=0;
  for(let z=165;z<2330;z+=58){
    k++;if(nearGate(z))continue;
    const c=course(z),r1=h1(k*3.7),r2=h1(k*9.1),side=k%2?1:-1;
    if(z>=905&&z<=1695){
      // Construct light-bars span the passage above or below the flight line.
      const dy=r1<.5?-(10.5+r2*2):(14.5+r2*3);
      out.push({kind:'bar',a:[c.x-c.rx-4,c.y+dy,z],b:[c.x+c.rx+4,c.y+dy,z],r:1.1,index:out.length});
    } else if(z>1790||z<860){
      // Natural columns: most hug the walls; every fourth stands mid-passage.
      const central=k%4===0,off=central?side*(r1*5):side*(19+r2*7),r=central?2.3+r1*.9:2+r2*1.6;
      out.push({kind:'pillar',a:[c.x+off,c.y-c.ry-6,z],b:[c.x+off,c.y+c.ry+6,z],r,index:out.length});
    }
  }
  return out;
})();
export const thermals=[260,560,1240,1520,1960,2200].map((z,i)=>{
  const c=course(z),side=i%2?1:-1;return {x:c.x+side*(15+h1(i*5.3)*6),z,R:7.5,w:10+h1(i)*3,index:i};
});
export const embers=(()=>{
  const out=[];
  // Risky lines: beside columns, near light-bars, inside thermals, near walls.
  for(const o of obstacles){
    const c=course(o.a[2]);
    if(o.kind==='pillar'){const dir=Math.sign(c.x-o.a[0])||1;
      for(let j=0;j<3;j++)out.push([o.a[0]+dir*(o.r+2.6),c.y+1+j*1.6,o.a[2]-6+j*6]);}
    else {const y=o.a[1]+(o.a[1]>c.y?-3.2:3.2);for(let j=-1;j<=1;j++)out.push([c.x+j*7,y,o.a[2]]);}
  }
  for(const t of thermals){const c=course(t.z);for(let j=0;j<4;j++)out.push([t.x,c.y-2+j*4,t.z+(j-1.5)*3]);}
  for(let i=0;i<24;i++){const z=140+i*92;if(nearGate(z))continue;const c=course(z),a=i*2.1+.6;
    out.push([c.x+Math.cos(a)*c.rx*.62,c.y+Math.sin(a)*c.ry*.62,z]);}
  return out.map((p,index)=>({p,index}));
})();
function capsule(p,o){
  const ab=sub(o.b,o.a),t=clamp(dot(sub(p,o.a),ab)/dot(ab,ab),0,1),q=add(o.a,mul(ab,t)),d=sub(p,q),l=len(d);
  return {distance:l-o.r,normal:l>1e-9?mul(d,1/l):[0,1,0],obstacle:o};
}
// Wall field combined with exact capsule distances (min of the two).
export function arcadeBoundary(p){
  const best=caveBoundary(p);let out=best;
  for(const o of obstacles){if(Math.abs(p[2]-o.a[2])>o.r+6)continue;const b=capsule(p,o);if(b.distance<out.distance)out={...b,course:best.course};}
  return out;
}


const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function naturalWeight(z) {
  if(z<900){const t=clamp((z-780)/120,0,1);return {w:1-smooth(780,900,z),dz:t>0&&t<1?-6*t*(1-t)/120:0};}
  if(z>1700){const t=clamp((z-1700)/120,0,1);return {w:smooth(1700,1820,z),dz:t>0&&t<1?6*t*(1-t)/120:0};}
  return {w:0,dz:0};
}
function wallShape(z,a) {
  const {w,dz}=naturalWeight(z);
  if(w===0)return {scale:1,da:0,dz:0};
  const a5=5*a+.025*z,a9=9*a-.018*z,a3=3*a+.04*z;
  const wave=.045*Math.sin(a5)+.025*Math.sin(a9)+.020*Math.sin(a3);
  return {scale:1+w*wave,
    da:w*(.225*Math.cos(a5)+.225*Math.cos(a9)+.060*Math.cos(a3)),
    dz:dz*wave+w*(.001125*Math.cos(a5)-.000450*Math.cos(a9)+.000800*Math.cos(a3))};
}
// Smooth star-shaped cross-sections share their geometry between rendering,
// collision and export. Angular harmonics vary along z; their sum is bounded
// by 9%. The engineered virtual cavern becomes an exact ellipse.
export function wallScale(z,a){return wallShape(z,a).scale;}
export function wallPoint(z,a){
  const c=course(z),scale=wallScale(z,a);
  return [c.x+c.rx*scale*Math.cos(a),c.y+c.ry*scale*Math.sin(a),z];
}

// Clearance is 0.8 times the first-order implicit-surface distance, with an
// inward gradient that includes angular lobes, taper and centerline slope.
// The margin deliberately keeps finite-size joint proxies off the visual wall;
// this is an analytic collision field, not an exact Euclidean signed distance.
export function caveBoundary(pOrX,y,z) {
  const p=Array.isArray(pOrX)?pOrX:[pOrX,y,z],c=course(p[2]);
  const dx=p[0]-c.x,dy=p[1]-c.y,X=dx/c.rx,Y=dy/c.ry,r=Math.hypot(X,Y);
  if(r<1e-8)return {distance:Math.min(c.rx,c.ry)*.8*.91,normal:[0,1,0],course:c};
  const a=Math.atan2(Y,X),shape=wallShape(p[2],a),s=shape.scale;
  const cxp=.036*Math.cos(p[2]*.003)+.048*Math.cos(p[2]*.008);
  const rxp=.020*Math.cos(p[2]*.004),ryp=.020*Math.cos(p[2]*.005+.7);
  const Xz=-cxp/c.rx-X*rxp/c.rx,Yz=.4/c.ry-Y*ryp/c.ry;
  const rx=X/(r*c.rx),ry=Y/(r*c.ry),rz=(X*Xz+Y*Yz)/r;
  const ax=-Y/(r*r*c.rx),ay=X/(r*r*c.ry),az=(X*Yz-Y*Xz)/(r*r);
  const dfdx=rx/s-r*shape.da*ax/(s*s);
  const dfdy=ry/s-r*shape.da*ay/(s*s);
  const dfdz=rz/s-r*(shape.dz+shape.da*az)/(s*s);
  const gradientLength=Math.hypot(dfdx,dfdy,dfdz);
  return {distance:(1-r/s)/Math.max(gradientLength,1e-8)*.8,
    normal:unit([-dfdx,-dfdy,-dfdz],[0,1,0]),course:c};
}

export function windAt(p,t,params) {
  const direction=(params.windDirection??0)*Math.PI/180;
  const gust=params.gust??0,s=params.windSpeed??0;
  // Smooth prescribed gust field; deliberately not CFD or a turbulence spectrum.
  let lift=0;
  if(params.arcade)for(const th of thermals){const dz=p[2]-th.z;if(Math.abs(dz)>th.R*3)continue;
    const dx=p[0]-th.x;lift+=th.w*Math.exp(-(dx*dx+dz*dz)/(th.R*th.R))*(1+.2*Math.sin(t*1.3+th.index));}
  return [s*Math.sin(direction)+gust*Math.sin(t*.71+p[2]*.013),
    gust*.32*Math.sin(t*.93+p[0]*.11)+lift,
    s*Math.cos(direction)+gust*.6*Math.sin(t*.43+p[2]*.007)];
}

export function aeroForces(v,wind,params=DEFAULTS,orientation={forward:[0,0,1],up:[0,1,0]},limp=false) {
  const u=sub(v,wind),speed=len(u),uh=unit(u);
  const forward=orientation.forward??[0,0,1],up=orientation.up??[0,1,0];
  const alpha=Math.atan2(-dot(uh,up),dot(uh,forward));
  // Finite-wing heuristic with a smooth loss of lift through stall.
  const alphaAbs=Math.abs(alpha),stallBlend=clamp((alphaAbs-.30)/.18,0,1);
  const clAttached=clamp(.19+2.8*alpha,-1.1,1.1);
  const clStalled=.65*Math.sin(2*alpha);
  const cl=(clAttached*(1-stallBlend)+clStalled*stallBlend)*(params.liftScale??1)*(limp?.12:1);
  const cd=(.14+.24*cl*cl+.55*stallBlend+(limp?.7:0))*(params.dragScale??1);
  const q=.5*Math.max(0,params.rho??1.225)*speed*speed;
  const area=Math.max(0,params.area??1.6);
  const liftDirection=unit(sub(up,mul(uh,dot(up,uh))),[0,1,0]);
  // In the degenerate case projected up is zero, lift is zero, not a thrust.
  const lift=speed>1e-8&&len(sub(up,mul(uh,dot(up,uh))))>1e-8?q*area*cl:0;
  const drag=q*area*cd;
  return {force:add(mul(liftDirection,lift),mul(uh,-drag)),lift,drag,q,cl,cd,alpha,
    airspeed:speed,ld:Math.abs(cl)/(cd||1),liftVector:mul(liftDirection,lift),dragVector:mul(uh,-drag)};
}

// Rest coordinates: x right, y up, z towards helmet. Harness surrounds the
// torso; it is clothing/equipment, not an invisible tether to the environment.
export const SKELETON=[
  ['head',[0,.12,.82],.075,.18],['chest',[0,0,.38],.19,.22],
  ['pelvis',[0,0,-.27],.18,.22],['shoulderL',[-.32,.02,.36],.035,.12],
  ['shoulderR',[.32,.02,.36],.035,.12],['elbowL',[-.9,0,.14],.035,.11],
  ['elbowR',[.9,0,.14],.035,.11],['handL',[-1.48,0,-.1],.025,.11],
  ['handR',[1.48,0,-.1],.025,.11],['kneeL',[-.33,0,-.85],.075,.13],
  ['kneeR',[.33,0,-.85],.075,.13],['footL',[-.56,0,-1.40],.035,.12],
  ['footR',[.56,0,-1.40],.035,.12],['spine',[0,0,.05],.115,.18]
].map(([name,rest,mass,radius])=>({name,rest,mass,radius}));
const MASS_SUM=SKELETON.reduce((s,j)=>s+j.mass,0);
const REST_COM=SKELETON.reduce((s,j)=>add(s,mul(j.rest,j.mass/MASS_SUM)),[0,0,0]);
const LINK_PAIRS=[[0,1],[1,13],[13,2],[1,2],[3,4],[3,1],[4,1],[3,5],[5,7],
  [4,6],[6,8],[2,9],[9,11],[2,10],[10,12],[9,10],[11,12],[3,2],[4,2],
  [5,4],[6,3],[7,2],[8,2],[0,13]];

function orientation(heading,pitch,bank) {
  const forward=[Math.sin(heading)*Math.cos(pitch),Math.sin(pitch),Math.cos(heading)*Math.cos(pitch)];
  const r=[Math.cos(heading),0,-Math.sin(heading)],u=cross(forward,r);
  return {forward,right:add(mul(r,Math.cos(bank)),mul(u,-Math.sin(bank))),
    up:add(mul(u,Math.cos(bank)),mul(r,Math.sin(bank)))};
}
function worldOffset(rest,basis){const r=sub(rest,REST_COM);return add(add(mul(basis.right,r[0]),mul(basis.up,r[1])),mul(basis.forward,r[2]));}

export class FlightSim {
  constructor(params={}) {this.params={...DEFAULTS,...params};this.reset();}
  reset() {
    const c=course(0);this.p=[c.x,c.y,0];this.v=[0,-14.1,36.5];
    this.heading=0;this.pitch=-.238;this.bank=0;Object.assign(this,orientation(this.heading,this.pitch,this.bank));
    this.particles=SKELETON.map(j=>{const p=add(this.p,worldOffset(j.rest,this));return {
      name:j.name,p,prev:[...p],v:[...this.v],mass:j.mass/MASS_SUM*this.params.mass,
      invMass:MASS_SUM/(j.mass*this.params.mass),radius:j.radius};});
    this.links=LINK_PAIRS.map(([a,b])=>({a,b,rest:len(sub(SKELETON[a].rest,SKELETON[b].rest)),lambda:0,compliance:0}));
    this.time=0;this.score=0;this.gatesPassed=0;this.nearMisses=0;this.impacts=0;
    this.state='ready';this.events=[];this._gateResults=new Set();this.passedGates=new Set();this.gateOutcomes=new Map();
    this._nearCooldown=0;this._impactCooldown=0;this.lastImpact=0;
    this.chain=0;this.multiplier=1;this.comboTimer=0;this.bestMultiplier=1;this.embersTaken=new Set();this.flow=0;this.flowPoints=0;this._flowAcc=0;this.thermalTime=0;this.inThermal=false;
    const wind=windAt(this.p,0,this.params),aero=aeroForces(this.v,wind,this.params,this);
    this.telemetry={airspeed:aero.airspeed,groundspeed:Math.hypot(this.v[0],this.v[2]),sink:14.1,
      q:aero.q,lift:aero.lift,drag:aero.drag,
      clearance:Math.min(...this.particles.map(j=>this._boundary(j.p).distance-j.radius)),
      load:len(aero.force)/(this.params.mass*this.params.g||1),wind,ld:aero.ld,peakImpact:0};return this;
  }
  _boundary(p){return this.params.arcade?arcadeBoundary(p):caveBoundary(p);}
  _emit(event){this.events.push({...event,time:this.time});if(this.events.length>64)this.events.shift();}
  _com() {
    this.p=[0,0,0];this.v=[0,0,0];let total=0;
    for(const j of this.particles){total+=j.mass;for(let k=0;k<3;k++){this.p[k]+=j.p[k]*j.mass;this.v[k]+=j.v[k]*j.mass;}}
    this.p=mul(this.p,1/total);this.v=mul(this.v,1/total);
  }
  _contact(j,previous) {
    // Sample the entire swept segment, then bisect its first field crossing.
    // This remains bounded by the step subdivision used in step().
    const n=Math.max(1,Math.ceil(len(sub(j.p,previous))/.20));let prior=[...previous],hit=null;
    for(let i=1;i<=n;i++){
      const sample=mix(previous,j.p,i/n);
      if(this._boundary(sample).distance<j.radius){
        let lo=prior,hi=sample;
        if(this._boundary(lo).distance>=j.radius)for(let k=0;k<10;k++){
          const mid=mix(lo,hi,.5);if(this._boundary(mid).distance>=j.radius)lo=mid;else hi=mid;
        }
        hit=this._boundary(hi);j.p=[...lo];break;
      }prior=sample;
    }
    let boundary=this._boundary(j.p);
    if(boundary.distance<j.radius){
      for(let k=0;k<5&&boundary.distance<j.radius;k++){
        j.p=add(j.p,mul(boundary.normal,(j.radius-boundary.distance)*1.3+.0001));boundary=this._boundary(j.p);
      }
      hit=boundary;
    }
    if(!hit)return 0;
    const inwardSpeed=dot(j.v,hit.normal),impact=Math.max(0,-inwardSpeed);
    if(!j.contact||impact>j.contact.speed)j.contact={normal:[...hit.normal],speed:impact};
    const normalImpulse=1.08*impact;
    if(inwardSpeed<0)j.v=add(j.v,mul(hit.normal,normalImpulse));
    // Friction is limited by the normal impulse, not an iteration-dependent
    // constant decay of tangential speed. No cloth or injury model.
    const tangent=sub(j.v,mul(hit.normal,dot(j.v,hit.normal)));
    const tangentSpeed=len(tangent);
    if(tangentSpeed>1e-9)j.v=sub(j.v,mul(tangent,Math.min(1,.25*normalImpulse/tangentSpeed)));
    return impact;
  }
  // Arcade coach: line up the next gate's offset and side-step mid-passage
  // columns. Still only bank/pitch commands; it never moves the body directly.
  _coachTarget(){
    const z=this.p[2],t=course(z+75);let ox=0,oy=0;
    const g=gates.find(g=>!this._gateResults.has(g.index)&&g.z>z);
    if(g&&g.z-z<COACH.reach){const c=course(g.z),w=clamp(1-(g.z-z-COACH.full)/(COACH.reach-COACH.full),0,1);ox=(g.x-c.x)*w;oy=(g.y-c.y)*w;}
    let x=t.x+ox;
    for(const o of obstacles){if(o.kind!=='pillar'||o.a[2]<z+2||o.a[2]>z+150)continue;
      const lane=course(o.a[2]).x+ox,gap=o.r+8.5;if(Math.abs(lane-o.a[0])<gap)x=o.a[0]+(lane>=o.a[0]?1:-1)*(gap+1);}
    return {x,y:t.y+oy+COACH.yBias};
  }
  _award(base,kind){
    // Combo: every gate, ember and close encounter feeds a chain; the chain
    // sets a multiplier (x1..x8) that decays after 5 s without a new feat.
    if(!this.params.arcade){this.score+=base;return base;}
    this.chain++;this.comboTimer=5;this.multiplier=Math.min(8,1+Math.floor(this.chain/3));
    this.bestMultiplier=Math.max(this.bestMultiplier,this.multiplier);
    const pts=Math.round(base*this.multiplier);this.score+=pts;return pts;
  }
  _tick(h,input) {
    const oldCOM=[...this.p];this.time+=h;
    const wind=windAt(this.p,this.time,this.params),relative=sub(this.v,wind);
    const heading=Math.atan2(relative[0],relative[2]);
    let bankCommand=clamp(input.bank??0,-1,1),pitchCommand=clamp(input.pitch??0,-1,1);
    if(this.params.assistance&&!input.limp){
      // Explicit assist applies steering only: it tilts lift, never moves COM.
      const target=course(this.p[2]+75);
      if(this.params.arcade){const t=this._coachTarget();target.x=t.x;target.y=t.y;}
      const desiredVX=clamp((target.x-this.p[0])*.7,-14,14);
      if(Math.abs(bankCommand)<=.05)bankCommand=clamp((desiredVX-this.v[0])*.09,-1,1);
      if(Math.abs(pitchCommand)<=.05)pitchCommand=clamp(((target.y-this.p[1])+30)*(this.params.arcade?COACH.pitchGain:.025),-1,1);
    }
    const desiredBank=bankCommand*1.05;
    this.bank+=(desiredBank-this.bank)*(1-Math.exp(-h*4));
    this.heading=heading;
    this.pitch=Math.atan2(relative[1],Math.hypot(relative[0],relative[2]))+.13+pitchCommand*.15;
    Object.assign(this,orientation(this.heading,this.pitch,this.bank));
    const aero=aeroForces(this.v,wind,this.params,this,!!input.limp);
    const acceleration=add(mul(aero.force,1/this.params.mass),[0,-this.params.g,0]);
    // Active-pose forces are internal: remove their mass-weighted resultant.
    const poseAccelerations=[],poseMean=[0,0,0];
    const muscle=input.limp?0:22;
    for(const [i,j] of this.particles.entries()){
      j.mass=SKELETON[i].mass/MASS_SUM*this.params.mass;j.invMass=1/j.mass;
      const relativeP=sub(j.p,this.p),relativeV=sub(j.v,this.v);
      const goal=worldOffset(SKELETON[i].rest,this);
      const a=sub(mul(sub(goal,relativeP),muscle),mul(relativeV,input.limp?.15:7));
      poseAccelerations.push(a);for(let k=0;k<3;k++)poseMean[k]+=a[k]*j.mass/this.params.mass;
    }
    for(const [i,j] of this.particles.entries()){
      j.contact=null;
      j.prev=[...j.p];j.v=add(j.v,mul(add(acceleration,sub(poseAccelerations[i],poseMean)),h));
      j.p=add(j.p,mul(j.v,h));
    }
    // Capture pre-projection impact speed; otherwise position constraints could
    // remove the incoming normal velocity before gameplay records the impact.
    let impact=0;
    for(const j of this.particles)impact=Math.max(impact,this._contact(j,j.prev));
    for(const link of this.links){link.lambda=0;link.compliance=this.params.compliance*(link.a===0||link.b===0?.3:1);}
    for(let iteration=0;iteration<5;iteration++){
      for(const link of this.links){
        const a=this.particles[link.a],b=this.particles[link.b],d=sub(a.p,b.p),dist=len(d);
        if(dist<1e-10)continue;
        const alpha=link.compliance/(h*h),dl=(-(dist-link.rest)-alpha*link.lambda)/(a.invMass+b.invMass+alpha);
        link.lambda+=dl;const normal=mul(d,1/dist);
        a.p=add(a.p,mul(normal,a.invMass*dl));b.p=sub(b.p,mul(normal,b.invMass*dl));
      }
      // Correct positions without applying restitution repeatedly in iterations.
      for(const j of this.particles){const boundary=this._boundary(j.p);if(boundary.distance<j.radius)
        j.p=add(j.p,mul(boundary.normal,(j.radius-boundary.distance)*1.3+.0001));}
    }
    for(const j of this.particles){
      // Velocity is derived after constraint projection (XPBD Algorithm 1).
      j.v=mul(sub(j.p,j.prev),1/h);impact=Math.max(impact,this._contact(j,j.prev));
      // Retain pre-projection contacts through velocity reconstruction. A
      // projected-safe endpoint alone cannot recover the incoming impact.
      if(j.contact){
        const {normal,speed}=j.contact,vn=dot(j.v,normal),desiredNormal=.08*speed;
        const correction=Math.max(0,desiredNormal-vn);
        j.v=add(j.v,mul(normal,correction));
        const tangent=sub(j.v,mul(normal,dot(j.v,normal))),tangentSpeed=len(tangent);
        if(tangentSpeed>1e-9)j.v=sub(j.v,mul(tangent,Math.min(1,.25*correction/tangentSpeed)));
        impact=Math.max(impact,speed);
      }
    }
    this.lastImpact=Math.max(this.lastImpact,impact);
    this._com();
    this._impactCooldown=Math.max(0,this._impactCooldown-h);
    if(impact>2&&this._impactCooldown===0){
      this.impacts++;this.score=Math.max(0,this.score-Math.round(impact*8));this._impactCooldown=.7;
      if(this.params.arcade&&this.chain){this._emit({type:'combo-break',multiplier:this.multiplier});this.chain=0;this.multiplier=1;this.comboTimer=0;}
      this._emit({type:'impact',speed:impact});
      if(impact>32){this.state='crashed';this._emit({type:'crash',speed:impact});}
    }
    // Plane crossings count each gate once, including crossings in a long tick.
    for(const gate of gates){
      if(this._gateResults.has(gate.index)||oldCOM[2]>gate.z||this.p[2]<gate.z||this.p[2]===oldCOM[2])continue;
      const t=(gate.z-oldCOM[2])/(this.p[2]-oldCOM[2]);const crossing=mix(oldCOM,this.p,t);
      this._gateResults.add(gate.index);
      const error=Math.hypot(crossing[0]-gate.x,crossing[1]-gate.y);
      if(error<gate.radius-.3){this.gatesPassed++;this.passedGates.add(gate.index);this.gateOutcomes.set(gate.index,'gate');
        const points=this._award(500+Math.round((1-error/gate.radius)*500),'gate');
        this._emit({type:'gate',index:gate.index,points,error,multiplier:this.multiplier,at:crossing});}
      else {this.gateOutcomes.set(gate.index,'miss');this._emit({type:'miss',index:gate.index,error});}
    }
    let clearance=Infinity,closest=null;for(const j of this.particles){const b=this._boundary(j.p),d=b.distance-j.radius;if(d<clearance){clearance=d;closest={p:[...j.p],normal:b.normal,distance:d,obstacle:b.obstacle?.kind||null};}}
    this._nearCooldown=Math.max(0,this._nearCooldown-h);
    if(clearance>.2&&clearance<2.5&&this._nearCooldown===0){this.nearMisses++;const points=this._award(100,'near');
      this._nearCooldown=1.8;this._emit({type:'near',clearance,points,obstacle:closest?.obstacle});}
    if(this.params.arcade){
      // Skimming: continuous points for holding a line within 3 m of rock.
      if(clearance>.15&&clearance<3){this.flow+=h;this._flowAcc+=(3-clearance)*h*90*this.multiplier;
        const whole=Math.floor(this._flowAcc);if(whole>0){this._flowAcc-=whole;this.flowPoints+=whole;this.score+=whole;}}
      else if(this.flow>0){if(this.flow>.6)this._emit({type:'skim',seconds:this.flow,points:this.flowPoints});this.flow=0;this.flowPoints=0;this._flowAcc=0;}
      for(const e of embers){if(this.embersTaken.has(e.index)||Math.abs(e.p[2]-this.p[2])>3)continue;
        if(len(sub(e.p,this.p))<EMBER_RADIUS){this.embersTaken.add(e.index);const points=this._award(150,'ember');this._emit({type:'ember',index:e.index,points,p:e.p});}}
      const up=windAt(this.p,this.time,this.params)[1];const was=this.inThermal;this.inThermal=up>3;
      if(this.inThermal){this.thermalTime+=h;if(!was)this._emit({type:'thermal',lift:up});}
      if(this.comboTimer>0){this.comboTimer-=h;if(this.comboTimer<=0&&this.chain){this._emit({type:'combo-end',multiplier:this.multiplier});this.chain=0;this.multiplier=1;}}
    }
    this.telemetry={airspeed:aero.airspeed,groundspeed:Math.hypot(this.v[0],this.v[2]),sink:-this.v[1],
      q:aero.q,lift:aero.lift,drag:aero.drag,clearance,load:len(aero.force)/(this.params.mass*this.params.g||1),
      wind,ld:aero.ld,alpha:aero.alpha,assistance:!!this.params.assistance,peakImpact:this.lastImpact,closest};
    if(this.p[2]>=COURSE_LENGTH){this.state='finished';const bonus=this.params.arcade?2000+Math.max(0,Math.round((80-this.time)*60)):2000;this.score+=bonus;this._emit({type:'finish',bonus});}
  }
  step(dt,input={}) {
    if(this.state!=='flying'||!(dt>0)||!Number.isFinite(dt))return;
    this.lastImpact=0;
    // Caller normally supplies 1/120s. Subdivision bounds travel to ~0.2 m for
    // contacts and keeps constraint stability if a caller supplies a larger dt.
    let remaining=Math.min(dt,.1);
    while(remaining>1e-9&&this.state==='flying'){
      const fastest=Math.max(...this.particles.map(j=>len(j.v)),1);
      const h=Math.min(remaining,1/120,.20/fastest);this._tick(h,input);remaining-=h;
    }
  }
}
