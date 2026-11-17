// CHASM 2.0 presentation layer: intensity over pixel accuracy (Babylon rule:
// "visual graphics extreme intensity", gaps logged in docs/FX-GAPS.md).
// Reads the simulation, never writes it. Everything here is cosmetic.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import * as physics from './physics.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return v - Math.floor(v); };
const V = () => new THREE.Vector3();

// ---------------------------------------------------------------- post grade
export const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uSpeed: { value: 0 }, uAberr: { value: 0 },
    uFlash: { value: new THREE.Color(1, 1, 1) }, uFlashAmt: { value: 0 }, uFocus: { value: 0 }, uGrain: { value: .045 }, uDawn: { value: 0 } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float uTime,uSpeed,uAberr,uFlashAmt,uFocus,uGrain,uDawn;uniform vec3 uFlash;varying vec2 vUv;
float rnd(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec2 c=vUv-.5;float r=length(c);
  float blur=uSpeed*.05*smoothstep(.1,.75,r);vec2 off=c*(uAberr*.014+uSpeed*.003);
  vec3 col=vec3(0.);float ws=0.;
  for(int i=0;i<7;i++){float t=float(i)/6.;float w=1.-t*.55;vec2 uv=vUv-c*blur*t;
    col+=vec3(texture2D(tDiffuse,uv+off).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-off).b)*w;ws+=w;}
  col/=ws;
  float l=dot(col,vec3(.2126,.7152,.0722));
  col=mix(col,vec3(l)*vec3(.62,1.0,1.35),uFocus*.7);
  col=mix(col,col*vec3(1.08,1.0,.9)+vec3(.05,.035,.01),uDawn);
  col+=uFlash*uFlashAmt*(1.-r*.8);
  col*=mix(1.,smoothstep(1.0,.22,r),.55+uFocus*.35+uSpeed*.12);
  col+=(rnd(vUv*vec2(1733.,977.)+fract(uTime))-.5)*uGrain*(.35+l);
  gl_FragColor=vec4(max(col,0.),1.);
}` };

// ------------------------------------------------------------ particle pool
class Sparks {
  constructor(scene, n) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n).fill(1); this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    this.grav = new Float32Array(n); this.drag = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1)); g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uScale: { value: 400 } },
      vertexShader: 'attribute vec3 aColor;attribute float aSize,aAlpha;varying vec3 vC;varying float vA;uniform float uScale;void main(){vC=aColor;vA=aAlpha;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(aSize*uScale/max(-mv.z,.1),0.,96.);gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'varying vec3 vC;varying float vA;void main(){vec2 d=gl_PointCoord-.5;float r=length(d)*2.;if(r>1.)discard;float core=exp(-r*r*5.);gl_FragColor=vec4(vC*(core*1.6+.25),vA*(1.-r)*1.2);}' });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5; scene.add(this.points);
  }
  emit(p, v, color, size, life, grav = 9.8, drag = .6) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos.set(p, i * 3); this.vel.set(v, i * 3); this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.life[i] = this.max[i] = life; this.size[i] = size; this.grav[i] = grav; this.drag[i] = drag;
  }
  burst(p, count, { speed = 8, color = new THREE.Color(1, .7, .3), jitter = 0, size = .25, life = .8, base = [0, 0, 0], grav = 9.8, drag = .8, spread = 1 } = {}) {
    const c = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), m = speed * (.35 + Math.random() * .65);
      c.copy(color); if (jitter) c.offsetHSL((Math.random() - .5) * jitter, 0, (Math.random() - .5) * jitter);
      this.emit([p[0] + (Math.random() - .5) * spread, p[1] + (Math.random() - .5) * spread, p[2] + (Math.random() - .5) * spread],
        [base[0] + s * Math.cos(a) * m, base[1] + u * m, base[2] + s * Math.sin(a) * m], c, size * (.5 + Math.random()), life * (.6 + Math.random() * .6), grav, drag);
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt; const k = i * 3, d = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= d; this.vel[k + 1] = this.vel[k + 1] * d - this.grav[i] * dt; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = clamp(this.life[i] / this.max[i], 0, 1); this.alpha[i] = t * t;
    }
    const a = this.points.geometry.attributes; a.position.needsUpdate = a.aAlpha.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = true;
  }
}

// ------------------------------------------------------------ vapor ribbon
class Ribbon {
  constructor(scene, n, color) {
    this.n = n; this.samples = [];
    const g = new THREE.BufferGeometry(); this.pos = new Float32Array(n * 2 * 3); this.al = new Float32Array(n * 2); this.side = new Float32Array(n * 2);
    for (let i = 0; i < n * 2; i++) this.side[i] = i % 2 ? 1 : -1;
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aAlpha', new THREE.BufferAttribute(this.al, 1)); g.setAttribute('aSide', new THREE.BufferAttribute(this.side, 1));
    this.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(color) }, uHot: { value: 0 } },
      vertexShader: 'attribute float aAlpha,aSide;varying float vA,vS;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vA=aAlpha*smoothstep(4.,16.,-mv.z);vS=aSide;gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'uniform vec3 uColor;uniform float uHot;varying float vA,vS;void main(){float edge=1.-abs(vS);float core=pow(edge,2.2);vec3 c=mix(uColor,vec3(1.),core*.6+uHot*.3);gl_FragColor=vec4(c*(1.+uHot),vA*(edge*.9+.1));}' });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; scene.add(this.mesh);
  }
  push(p, right, strength) { this.samples.push({ p: p.clone(), r: right.clone(), s: strength }); if (this.samples.length > this.n) this.samples.shift(); }
  clear() { this.samples.length = 0; this.mesh.geometry.setDrawRange(0, 0); }
  update(hidden) {
    const m = this.samples.length;
    for (let i = 0; i < m; i++) {
      const s = this.samples[i], age = 1 - i / Math.max(1, m - 1), w = .03 + age * .32;
      const a = hidden ? 0 : (1 - age) * (1 - age) * s.s * .55;
      this.pos[i * 6] = s.p.x - s.r.x * w; this.pos[i * 6 + 1] = s.p.y - s.r.y * w; this.pos[i * 6 + 2] = s.p.z - s.r.z * w;
      this.pos[i * 6 + 3] = s.p.x + s.r.x * w; this.pos[i * 6 + 4] = s.p.y + s.r.y * w; this.pos[i * 6 + 5] = s.p.z + s.r.z * w;
      this.al[i * 2] = this.al[i * 2 + 1] = a;
    }
    const at = this.mesh.geometry.attributes; at.position.needsUpdate = at.aAlpha.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, Math.max(0, m - 1) * 6);
  }
}

function veinTexture() {
  // Emissive mineral veins: a thresholded ridge-noise mask on the same UV as rock.
  const n = 512, d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n * Math.PI * 2, v = y / n * Math.PI * 2;
    const f = Math.sin(u * 2 + Math.sin(v * 2) * 2.2) * Math.cos(v * 3 + Math.sin(u * 3) * 1.4) + .35 * Math.sin(u * 7 + v * 5 + Math.sin(u * 2) * 3);
    const ridge = Math.pow(clamp(1 - Math.abs(f) * 6, 0, 1), 8) * (Math.sin(v * 2 + u) > .55 ? 1 : 0), spark = hash(x * 7.1 + y * 131.3) > .9985 ? 1 : 0;
    const i = (y * n + x) * 4, k = clamp(ridge + spark, 0, 1);
    d[i] = 40 * k; d[i + 1] = 255 * k; d[i + 2] = 215 * k; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, n, n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.repeat.set(.16, .2); t.needsUpdate = true; return t;
}

// ------------------------------------------------------------ the FX layer
export class ChasmFX {
  constructor(view) {
    this.view = view; const scene = view.scene; this.scene = scene; this.time = 0;
    this.shake = 0; this.flash = 0; this.flashColor = new THREE.Color(1, 1, 1); this.aberr = 0; this.focus = 0; this.speedFx = 0; this.dawn = 0;
    this.arcade = true; this.ghostPath = null;
    // Grade pass sits between bloom and the output (tone map) pass.
    this.grade = new ShaderPass(GradeShader);
    const passes = view.composer.passes; view.composer.insertPass(this.grade, passes.length - 1);
    // Headlamp: the pilot lights the rock ahead; cheap, no shadows.
    this.lamp = new THREE.SpotLight(0xfff0d8, 1400, 190, .42, .55, 1.5); this.lamp.target = new THREE.Object3D(); scene.add(this.lamp, this.lamp.target);
    this.flareLight = new THREE.PointLight(0xffffff, 0, 60, 1.6); scene.add(this.flareLight);
    // Rock: wetter, with breathing bioluminescent veins.
    const rm = view.rockMat; rm.roughness = .74; rm.metalness = .1; rm.emissive = new THREE.Color(0x2fd8c2);
    rm.emissiveMap = veinTexture(); rm.emissiveIntensity = .8; rm.needsUpdate = true;
    // Construct: travelling scan pulses and a fine grid, injected into the standard shader.
    this.pulse = { value: 0 };
    view.virtualMat.onBeforeCompile = sh => {
      sh.uniforms.uPulse = this.pulse;
      sh.vertexShader = 'varying vec3 vChasmW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvChasmW=(modelMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = 'uniform float uPulse;varying vec3 vChasmW;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float ph=fract((vChasmW.z-uPulse*95.)/150.);float band=exp(-pow((ph-.5)*34.,2.));
float gz=smoothstep(.9,1.,abs(fract(vChasmW.z/6.)-.5)*2.);float gy=smoothstep(.93,1.,abs(fract(vChasmW.y/4.)-.5)*2.);
totalEmissiveRadiance+=vec3(.12,.85,1.)*(band*1.6+max(gz,gy)*.35)+vec3(1.,.25,.75)*exp(-pow((fract((vChasmW.z+uPulse*40.)/420.)-.5)*60.,2.))*1.4;`);
    };
    view.virtualMat.needsUpdate = true;
    view.scene.fog.density = .0045; view.renderer.toneMappingExposure = 1.25;
    this.sparks = new Sparks(scene, view.quality === 'low' ? 700 : 1800);
    this.ribbons = [new Ribbon(scene, 64, 0x5ffff0), new Ribbon(scene, 64, 0xffb36a)]; this.ribbonTimer = 0;
    view.trails.forEach(t => { t.visible = false; });
    this.buildWorld(); this.buildShockwaves(); this.buildGhost(); this.buildExit();
  }

  buildWorld() {
    const v = this.view; this.worldGroup = new THREE.Group(); this.scene.add(this.worldGroup);
    // Columns: displaced rock cylinders with glowing growth rings.
    this.columns = [];
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x58ffe0).multiplyScalar(2.4) });
    const barMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3fb4).multiplyScalar(3) });
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xff4fc0, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const o of physics.obstacles) {
      const a = new THREE.Vector3().fromArray(o.a), b = new THREE.Vector3().fromArray(o.b), length = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(.5);
      const g = new THREE.Group(); g.position.copy(mid);
      if (o.kind === 'pillar') {
        const geo = new THREE.CylinderGeometry(o.r * 1.03, o.r * 1.25, length, 18, 40, true), p = geo.attributes.position, col = [];
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ang = Math.atan2(z, x);
          const bulge = 1 + .14 * Math.sin(ang * 3 + y * .2 + o.index) + .08 * Math.sin(ang * 7 - y * .45) + .2 * Math.exp(-Math.pow((Math.abs(y) - length * .42) / 5, 2));
          p.setXYZ(i, x * bulge, y, z * bulge); const s = .36 + .1 * Math.sin(y * .7 + ang * 2); col.push(s * .9, s, s * .92);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
        // Same texel density as the cave wall (u: angle, v: metres / 28) so bump and veins read as one rock.
        const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * 1.4, (p.getY(i) + mid.y) / 28);
        const m = new THREE.Mesh(geo, v.rockMat); g.add(m);
        for (let k = 0; k < 3; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(o.r * 1.22, .07, 6, 40), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = (k - 1) * 7 + hash(o.index + k) * 3; g.add(ring); }
      } else {
        g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(o.r * .55, o.r * .55, length, 10, 1), barMat));
        const halo = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 1.8, o.r * 1.8, length, 16, 1, true), haloMat); g.add(halo);
      }
      this.worldGroup.add(g); this.columns.push({ o, g });
    }
    // Thermals: rising luminous columns.
    this.thermalMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vU;varying vec3 vN,vW;void main(){vU=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader: 'uniform float uTime;varying vec2 vU;varying vec3 vN,vW;void main(){float f=1.-abs(dot(normalize(vN),normalize(cameraPosition-vW)));float bands=.5+.5*sin(vU.y*60.-uTime*7.+sin(vU.x*25.)*1.5);float ends=smoothstep(0.,.18,vU.y)*smoothstep(1.,.82,vU.y);float thin=pow(bands,6.);gl_FragColor=vec4(vec3(1.,.62,.28)*(.5+thin*1.5),(f*f*f*.14+thin*.035)*ends);}' });
    for (const t of physics.thermals) {
      const c = physics.course(t.z), m = new THREE.Mesh(new THREE.CylinderGeometry(t.R * .9, t.R * 1.3, c.ry * 2.2, 28, 1, true), this.thermalMat);
      m.position.set(t.x, c.y, t.z); this.worldGroup.add(m);
      const vent = new THREE.Mesh(new THREE.RingGeometry(t.R * .9, t.R * 1.3, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a3a).multiplyScalar(2.2), transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      vent.rotation.x = -Math.PI / 2; vent.position.set(t.x, c.y - c.ry * .95, t.z); this.worldGroup.add(vent);
    }
    // Embers: spinning golden crystals.
    const eg = new THREE.OctahedronGeometry(.55, 0), em = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc45a).multiplyScalar(3.2) });
    this.embers = new THREE.InstancedMesh(eg, em, physics.embers.length); this.worldGroup.add(this.embers); this.emberTaken = new Set();
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = V(); this.tmp = V(); this.tmp2 = V();
  }

  buildShockwaves() {
    this.waves = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(.92, 1, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; this.scene.add(m); this.waves.push({ m, t: 1, dur: .7, from: 1, to: 3 });
    }
  }
  wave(p, color, from, to, dur = .7, facing = null) {
    const w = this.waves.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    w.m.position.fromArray(p); w.m.material.color.set(color).multiplyScalar(2.5); w.t = 0; w.dur = dur; w.from = from; w.to = to; w.m.visible = true;
    if (facing) w.m.lookAt(w.m.position.clone().add(facing)); else w.m.rotation.set(0, 0, 0);
  }

  buildGhost() {
    this.ghost = new THREE.Mesh(new THREE.IcosahedronGeometry(.45, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xa58bff).multiplyScalar(2.5), transparent: true, opacity: .85 }));
    this.ghost.visible = false; this.scene.add(this.ghost);
    this.ghostRibbon = new Ribbon(this.scene, 50, 0xa58bff);
  }
  setGhost(path) { this.ghostPath = path && path.length > 4 ? path : null; this.ghostRibbon.clear(); }

  buildExit() {
    // Dawn exit: a fan of additive god-ray blades reaching back into the cave.
    const z = physics.COURSE_LENGTH, c = physics.course(z + 30), g = new THREE.Group(); g.position.set(c.x, c.y, z + 30);
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uTime;varying vec2 vU;void main(){float a=pow(vU.y,1.5)*sin(vU.x*3.14159)*(.7+.3*sin(uTime*.7+vU.x*9.));gl_FragColor=vec4(vec3(1.,.88,.62)*a,a*.6);}' });
    // Cave mouth: hot sky with a low sun; bloom does the rest.
    this.exitDiscMat = new THREE.ShaderMaterial({ fog: false, uniforms: { uTime: mat.uniforms.uTime },
      vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uTime;varying vec2 vU;void main(){vec2 c=vU-vec2(.5,.56);float r=length(c);vec3 sky=mix(vec3(1.5,1.3,1.0),vec3(.16,.42,.8),smoothstep(.04,.42,r));sky+=vec3(4.,3.,1.8)*exp(-r*r*140.);sky=mix(sky,vec3(.9,.65,.4)*1.3,smoothstep(.0,.2,-c.y-.12));gl_FragColor=vec4(sky,1.);}' });
    this.exitMat = mat;
    for (let i = 0; i < 14; i++) {
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(9 + hash(i) * 10, 260), mat); blade.position.z = -130; blade.rotation.x = Math.PI / 2;
      const holder = new THREE.Group(); holder.rotation.z = i / 14 * Math.PI * 2 + hash(i * 3); blade.position.y = 6 + hash(i * 5) * 14;
      holder.add(blade); holder.rotation.y = 0; g.add(holder);
    }
    this.scene.add(g); this.exit = g;
  }

  onEvent(e, sim) {
    const reduced = this.view.reducedMotion, P = sim.p;
    if (e.type === 'gate') {
      const g = physics.gates[e.index], at = [g.x, g.y, g.z], col = e.multiplier >= 4 ? 0xffd36a : 0x6bffc8;
      this.wave(at, col, g.radius, g.radius * 3.2, .8); this.wave(at, 0xffffff, g.radius * .6, g.radius * 2, .45);
      this.sparks.burst(at, 90, { speed: 18, color: new THREE.Color(col), jitter: .15, size: .45, life: 1.1, base: sim.v.map(x => x * .5), grav: 0, drag: 1.4, spread: g.radius * 1.5 });
      this.flash = Math.max(this.flash, .18); this.flashColor.set(col); this.flareLight.intensity = 900; this.flareLight.color.set(col); this.flareLight.position.fromArray(at);
    } else if (e.type === 'ember') {
      this.emberTaken.add(e.index);
      this.sparks.burst(e.p, 40, { speed: 9, color: new THREE.Color(0xffc45a), jitter: .1, size: .35, life: .8, base: sim.v.map(x => x * .7), grav: 2, drag: 1.2 });
      this.wave(e.p, 0xffc45a, .5, 4, .4, new THREE.Vector3().fromArray(sim.v));
    } else if (e.type === 'impact') {
      const cl = sim.telemetry?.closest, at = cl ? cl.p : P, s = clamp(e.speed / 12, .2, 3);
      this.sparks.burst(at, Math.round(25 + s * 40), { speed: 6 + e.speed * .6, color: new THREE.Color(0xffa060), jitter: .2, size: .3, life: .9, grav: 12, drag: .5 });
      this.sparks.burst(at, Math.round(20 + s * 25), { speed: 3 + e.speed * .3, color: new THREE.Color(0x8a9a90), jitter: .05, size: .7, life: 1.6, grav: 3, drag: 1.5 });
      if (!reduced) this.shake = Math.max(this.shake, .25 + s * .35);
      this.flash = Math.max(this.flash, .25 * s); this.flashColor.set(0xff3a22); this.aberr = Math.max(this.aberr, 1.5 * s);
    } else if (e.type === 'near') {
      this.aberr = Math.max(this.aberr, .7);
    } else if (e.type === 'crash') {
      if (!reduced) this.shake = 1.4; this.flash = .6; this.flashColor.set(0xff2a10);
    } else if (e.type === 'thermal') {
      this.wave([P[0], P[1] - 2, P[2]], 0xffa050, 2, 10, .9);
    } else if (e.type === 'finish') {
      this.flash = 1; this.flashColor.set(0xfff4dc);
    } else if (e.type === 'combo-break') {
      this.aberr = Math.max(this.aberr, 2);
    }
  }

  update(sim, dt, camera) {
    const v = this.view, t = sim.telemetry || {}, reduced = v.reducedMotion; this.time += dt;
    const speed = t.airspeed || 0, clear = t.clearance ?? 30;
    // Grade
    const targetSpeed = reduced ? 0 : clamp((speed - 28) / 22, 0, 1.3) + (clear < 3 ? (3 - clear) / 3 * .5 : 0);
    this.speedFx += (targetSpeed - this.speedFx) * (1 - Math.exp(-dt * 4));
    this.flash *= Math.exp(-dt * 5); this.aberr *= Math.exp(-dt * 4); this.shake *= Math.exp(-dt * 5.5);
    this.flareLight.intensity *= Math.exp(-dt * 6);
    const z = sim.p[2], dawn = clamp((z - 2150) / 250, 0, 1); this.dawn = dawn;
    const u = this.grade.uniforms; u.uTime.value = this.time; u.uSpeed.value = this.speedFx; u.uAberr.value = this.aberr + this.speedFx * .5;
    u.uFlash.value.copy(this.flashColor); u.uFlashAmt.value = this.flash; u.uFocus.value = this.focus; u.uDawn.value = dawn;
    u.uGrain.value = v.quality === 'low' ? 0 : .045;
    this.pulse.value = this.time; this.thermalMat.uniforms.uTime.value = this.time; this.exitMat.uniforms.uTime.value = this.time;
    v.rockMat.emissiveIntensity = .7 + .4 * Math.sin(this.time * 1.7 + z * .01);
    v.renderer.toneMappingExposure = 1.25 + dawn * .7;
    if (dawn > 0) { v.scene.fog.color.lerp(new THREE.Color(0xcfe6e0), dawn * .08); v.scene.fog.density = .0045 * (1 - dawn * .6); }
    else v.scene.fog.density = .0045;
    // Headlamp follows the visor
    const head = v.pilotPts[0];
    this.lamp.position.copy(head).addScaledVector(v.aimUp, .4); this.lamp.target.position.copy(head).addScaledVector(v.aimForward, 40);
    this.lamp.intensity = sim.state === 'crashed' ? 200 : 1400;
    // Columns / bars visibility and pulse
    for (const c of this.columns) c.g.visible = Math.abs(c.o.a[2] - z) < 700;
    // Embers
    for (const e of physics.embers) {
      const taken = this.emberTaken.has(e.index) || sim.embersTaken?.has(e.index), near = Math.abs(e.p[2] - z) < 600 && e.p[2] > z - 30;
      this.s.setScalar(taken || !near ? 0 : 1 + .25 * Math.sin(this.time * 6 + e.index));
      this.q.setFromEuler(new THREE.Euler(this.time * 1.3 + e.index, this.time * 2.1, 0));
      this.tmp.fromArray(e.p); this.tmp.y += Math.sin(this.time * 2 + e.index) * .3;
      this.m4.compose(this.tmp, this.q, this.s); this.embers.setMatrixAt(e.index, this.m4);
    }
    this.embers.instanceMatrix.needsUpdate = true;
    // Shockwaves
    for (const w of this.waves) {
      if (w.t >= w.dur) { w.m.visible = false; continue; }
      w.t += dt; const k = clamp(w.t / w.dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
      w.m.scale.setScalar(w.from + (w.to - w.from) * e); w.m.material.opacity = (1 - k) * .9;
    }
    // Wall scrape sparks + continuous emitters
    const flying = sim.state === 'flying';
    if (flying && t.closest && clear < 1.6) {
      const n = Math.ceil((1.6 - clear) * 6), cp = t.closest, wall = [cp.p[0] - cp.normal[0] * (cp.distance + .1), cp.p[1] - cp.normal[1] * (cp.distance + .1), cp.p[2] - cp.normal[2] * (cp.distance + .1)];
      for (let i = 0; i < n; i++) this.sparks.emit(wall, [sim.v[0] * .55 + cp.normal[0] * 5 * Math.random() + (Math.random() - .5) * 6, sim.v[1] * .55 + cp.normal[1] * 5 * Math.random() + Math.random() * 4, sim.v[2] * .55 + cp.normal[2] * 5 * Math.random() + (Math.random() - .5) * 6],
        new THREE.Color().setHSL(.07 + Math.random() * .05, 1, .55 + Math.random() * .3), .18 + Math.random() * .2, .35 + Math.random() * .4, 14, .3);
    }
    if (flying) for (const th of physics.thermals) {
      if (Math.abs(th.z - z) > 160 || Math.random() > dt * 40) continue; const c = physics.course(th.z);
      this.sparks.emit([th.x + (Math.random() - .5) * th.R * 1.4, c.y - c.ry * .8 + Math.random() * 10, th.z + (Math.random() - .5) * th.R * 1.4], [0, 8 + Math.random() * 8, 0], new THREE.Color(0xffb060), .5, 3, -1, .2);
    }
    this.sparks.update(dt);
    // Vapor ribbons from wingtips: intensity rises with speed and wall proximity.
    this.ribbonTimer += dt;
    if (flying && this.ribbonTimer > .02) {
      this.ribbonTimer = 0; const k = clamp((speed - 24) / 22, .15, 1.2) + (clear < 3 ? .6 : 0);
      this.ribbons[0].push(v.pilotPts[7], v.aimRight, k); this.ribbons[1].push(v.pilotPts[8], v.aimRight, k);
      this.ribbons.forEach(r => { r.mat.uniforms.uHot.value = clamp((3 - clear) / 3, 0, 1); });
    }
    if (sim.time < .05) this.ribbons.forEach(r => r.clear());
    this.ribbons.forEach(r => r.update(reduced));
    // Ghost of the best run
    if (this.ghostPath && sim.state !== 'ready') {
      const p = this.ghostPath, tt = sim.time * 10, i = Math.min(p.length - 2, Math.floor(tt)), f = clamp(tt - i, 0, 1);
      if (i >= 0 && tt < p.length) {
        this.ghost.visible = true; this.tmp.fromArray(p[i]).lerp(this.tmp2.fromArray(p[i + 1]), f); this.ghost.position.copy(this.tmp);
        this.ghost.scale.setScalar(1 + .2 * Math.sin(this.time * 8));
        if (flying) this.ghostRibbon.push(this.tmp, v.aimRight.clone().multiplyScalar(.5), .55);
      } else this.ghost.visible = false;
      this.ghostRibbon.update(false);
    } else this.ghost.visible = false;
    // Camera shake (positional + roll), with a speed rumble near rock.
    // Applied for this frame only; restoreCamera() removes it after render.
    this._saved = null;
    if (!reduced && camera) {
      const rumble = clamp((3 - clear) / 3, 0, 1) * .08 + clamp((speed - 45) / 30, 0, 1) * .04, s = this.shake + rumble, tm = this.time * 31;
      if (s > .001) {
        this._saved = { p: camera.position.clone(), q: camera.quaternion.clone() };
        camera.position.x += (Math.sin(tm * 1.3) + Math.sin(tm * 2.9)) * .5 * s; camera.position.y += (Math.sin(tm * 1.7 + 1) + Math.sin(tm * 3.7)) * .5 * s;
        camera.rotateZ(Math.sin(tm * 1.1) * .03 * s);
      }
    }
  }
  restoreCamera(camera) { if (this._saved) { camera.position.copy(this._saved.p); camera.quaternion.copy(this._saved.q); this._saved = null; }
  }
}
