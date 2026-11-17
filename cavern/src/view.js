import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as physics from './physics.js';

// Presentation reads the flight model. It never changes its trajectory or score.
const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const V = () => new THREE.Vector3();
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return v - Math.floor(v); };
const COLORS = { cyan: 0x54f3f2, amber: 0xffa766, red: 0xff6046, white: 0xebfff6, dark: 0x061820 };
function line(points, color, opacity = 1) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false }));
}
function rockTexture() {
  const n = 512, data = new Uint8Array(n * n * 4);
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash((ix % 64 + 64) % 64 + ((iy % 64 + 64) % 64) * 101);
    const b = hash(((ix + 1) % 64 + 64) % 64 + ((iy % 64 + 64) % 64) * 101);
    const c = hash((ix % 64 + 64) % 64 + (((iy + 1) % 64 + 64) % 64) * 101);
    const d = hash(((ix + 1) % 64 + 64) % 64 + (((iy + 1) % 64 + 64) % 64) * 101);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const p = noise(x * .035, y * .035), q = noise(x * .12, y * .12), r = noise(x * .43, y * .43);
    const layers = Math.pow(Math.abs(Math.sin(y * .055 + p * 2.5 + Math.sin(x * .018))), 9);
    const v = 78 + 60 * p + 32 * q + 22 * r - layers * 45;
    const i = (y * n + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
}
function makeConeMaterial(color, emissive, intensity = .2) { return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, metalness: .3, roughness: .46, flatShading: true }); }

export class CavernView {
  constructor(canvas) {
    this.canvas = canvas; this.cameraMode = 'chase'; this.theme = 'hybrid'; this.quality = 'balanced';
    this.overlays = false; this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0; this.chunk = null; this.cameraReady = false; this.lastTheme = null;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(0x06181e); this.renderer.info.autoReset = false;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x06181e);
    this.scene.fog = new THREE.FogExp2(0x06181e, .006);
    this.camera = new THREE.PerspectiveCamera(65, 1, .08, 1100);
    this.scene.add(new THREE.HemisphereLight(0x8bc8ca, 0x23322a, 2.0));
    const key = new THREE.DirectionalLight(0xffdab2, 2.0); key.position.set(40, 80, -20); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6de5ff, 1.6); rim.position.set(-30, 0, 50); this.scene.add(rim);
    this.pilotLight = new THREE.PointLight(0xffb284, 4, 26, 1.4); this.scene.add(this.pilotLight);
    this.cyanLight = new THREE.PointLight(0x3cf0f2, 130, 115, 1.7); this.scene.add(this.cyanLight);
    this.aheadLight = new THREE.PointLight(0xffbc74, 150, 170, 1.7); this.scene.add(this.aheadLight);
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.rockTex = rockTexture();
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0xa6a28c, vertexColors: true, roughness: .94, metalness: .04,
      bumpMap: this.rockTex, bumpScale: .42, flatShading: false, side: THREE.DoubleSide });
    this.virtualMat = new THREE.MeshStandardMaterial({ color: 0x0b2632, emissive: 0x082a38, emissiveIntensity: .45,
      vertexColors: true, roughness: .65, metalness: .6, flatShading: true, side: THREE.DoubleSide });
    this.buildPilot(); this.buildGates(); this.buildParticles(); this.buildTrails(); this.buildOverlay();
    this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(800, 500), .38, .48, 1.5); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.setQuality('balanced'); this.resize();
  }

  setQuality(value) {
    if (!['low', 'balanced', 'high'].includes(value)) return false;
    this.quality = value;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, value === 'high' ? 1.75 : value === 'balanced' ? 1.25 : 1));
    if (this.bloom) this.bloom.enabled = value !== 'low';
    this.chunk = null; this.resize(); return true;
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth || innerWidth), h = Math.max(1, this.canvas.clientHeight || innerHeight);
    if (w === this.width && h === this.height && this.dpr === this.renderer.getPixelRatio()) return;
    this.width = w; this.height = h; this.dpr = this.renderer.getPixelRatio();
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.composer?.setPixelRatio(this.dpr); this.composer?.setSize(w, h);
  }

  isVirtual(z) { return this.theme === 'virtual' || (this.theme === 'hybrid' && z >= 900 && z < 1700); }

  rebuild(z) {
    // A bounded window, rebuilt only after crossing a 72 m streaming boundary.
    if (this.tunnel) { this.world.remove(this.tunnel); this.tunnel.traverse(o => { if (o.isInstancedMesh) o.dispose(); o.geometry?.dispose(); if (o.userData.ownMat) o.material?.dispose(); }); }
    this.tunnel = new THREE.Group(); this.world.add(this.tunnel);
    const quality = this.quality, radial = quality === 'high' ? 64 : 48;
    const step = quality === 'low' ? 14 : 10, start = Math.floor(z / 72) * 72 - 120, end = start + (quality === 'low' ? 620 : 880);
    const addWall = virtual => {
      const positions = [], colors = [], uv = [], normals = [];
      const color = new THREE.Color();
      const point = (zz, a) => { const c = physics.course(zz); return physics.wallPoint ? physics.wallPoint(zz, a) : [c.x + Math.cos(a) * c.rx, c.y + Math.sin(a) * c.ry, zz]; };
      for (let zz = start; zz < end; zz += step) {
        if (this.isVirtual(zz + step * .5) !== virtual) continue;
        for (let j = 0; j < radial; j++) {
          const a = j / radial * Math.PI * 2, b = (j + 1) / radial * Math.PI * 2;
          const p = [point(zz, a), point(zz + step, a), point(zz, b), point(zz + step, b)];
          for (const k of [0, 2, 1, 2, 3, 1]) {
            const pt = p[k], xx = pt[0], yy = pt[1], zzz = pt[2];
            const broad = Math.sin(xx * .17 + zzz * .025) * Math.sin(yy * .09 - zzz * .012);
            const veins = Math.pow(Math.abs(Math.sin(yy * .28 + Math.sin(zzz * .022) * 2.3 + Math.sin(xx * .13))), 10);
            const shade = .70 + .15 * broad - veins * .18;
            if (virtual) color.setRGB(.15 * shade, .32 * shade, .44 * shade);
            else color.setRGB((.42 + .05 * broad) * shade, (.46 + .06 * broad) * shade, (.39 + .025 * broad) * shade);
            positions.push(...pt); colors.push(color.r, color.g, color.b); uv.push((k === 0 || k === 1 ? a : b) * 2.8, zzz / 28);
            if (!virtual) { const n = physics.caveBoundary(pt).normal; normals.push(-n[0], -n[1], -n[2]); }
          }
        }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      if (virtual) geo.computeVertexNormals(); else geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      this.tunnel.add(new THREE.Mesh(geo, virtual ? this.virtualMat : this.rockMat));
    };
    addWall(false); addWall(true);

    const cyan = [], amber = [], metal = [], layers = [], seams = [];
    const ringPoint = (zz, a, inset = .12) => {
      const c = physics.course(zz), p = physics.wallPoint ? physics.wallPoint(zz, a) : [c.x + c.rx * Math.cos(a), c.y + c.ry * Math.sin(a), zz];
      return new THREE.Vector3(p[0] - inset * Math.cos(a), p[1] - inset * Math.sin(a), p[2]);
    };
    const segment = (arr, p, q) => arr.push(p.x, p.y, p.z, q.x, q.y, q.z);
    for (let zz = Math.ceil(start / 18) * 18; zz < end; zz += 18) {
      const virtual = this.isVirtual(zz);
      for (let j = 0; j < radial; j++) {
        const a = j * Math.PI * 2 / radial, b = (j + 1) * Math.PI * 2 / radial;
        if (virtual) {
          segment(metal, ringPoint(zz, a), ringPoint(zz, b));
          segment(metal, ringPoint(zz, a), ringPoint(zz + 18, a));
          if (j % 8 === 1 || j % 8 === 2) segment(j % 3 ? cyan : amber, ringPoint(zz, a, .18), ringPoint(zz, b, .18));
        } else {
          // Geological layers and bioluminescent fissures stay on the collision wall.
          if (hash(j + zz * .18) > .57) segment(layers, ringPoint(zz + 2 * Math.sin(a * 5), a, .05), ringPoint(zz + 2 * Math.sin(b * 5), b, .05));
          if (hash(j * 19 + zz) > .91) {
            const a2 = a + .12 * Math.sin(zz);
            segment(seams, ringPoint(zz, a, .16), ringPoint(zz + 7, a2, .17));
            segment(seams, ringPoint(zz + 7, a2, .17), ringPoint(zz + 14, a2 - .07, .17));
          }
        }
      }
    }
    for (const [arr, color, opacity] of [[cyan, 0x2ff5ed, .75], [amber, 0xffa95d, .85], [metal, 0x306478, .48], [layers, 0x819c8e, .20], [seams, 0x62d9c8, .7]]) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      const obj = new THREE.LineSegments(g, m); obj.userData.ownMat = true; this.tunnel.add(obj);
    }

    // Wall-mounted mineral plates: all vertices lie at or outside the analytic shell.
    const count = quality === 'low' ? 180 : quality === 'high' ? 540 : 360;
    const crystalGeo = new THREE.ConeGeometry(1, 1, 5, 1), crystalMat = makeConeMaterial(0x486f67, 0x12423e, .28);
    const crystals = new THREE.InstancedMesh(crystalGeo, crystalMat, count); crystals.userData.ownMat = true;
    const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), s = V(), pos = V(), normal = V();
    const glowGeo = new THREE.IcosahedronGeometry(.24, 0), glowMat = new THREE.MeshBasicMaterial({ color: 0x75ead4 });
    const glows = new THREE.InstancedMesh(glowGeo, glowMat, count); glows.userData.ownMat = true;
    for (let i = 0; i < count; i++) {
      const zz = start + hash(i * 41.9) * (end - start), a = hash(i * 8.43 + 1) * Math.PI * 2, c = physics.course(zz), virtual = this.isVirtual(zz);
      normal.set(Math.cos(a) / c.rx, Math.sin(a) / c.ry, .0).normalize();
      const length = 1.5 + hash(i * 3.8) * 4;
      pos.copy(ringPoint(zz, a, 0)).addScaledVector(normal, length * .5);
      quat.setFromUnitVectors(UP, normal.clone().negate()); s.set(.6 + hash(i) * 1.7, length, .6 + hash(i + 1) * 1.5);
      matrix.compose(pos, quat, s); crystals.setMatrixAt(i, matrix);
      crystals.setColorAt(i, new THREE.Color(virtual ? 0x27586e : i % 7 === 0 ? 0x7c9e81 : 0x657f71));
      pos.addScaledVector(normal, -length * .5 - .12); s.setScalar(virtual ? .3 : .5 + hash(i * 6) * 1.7);
      matrix.compose(pos, quat, s); glows.setMatrixAt(i, matrix);
      glows.setColorAt(i, new THREE.Color(virtual ? 0x57eaff : i % 5 === 0 ? 0xffb16a : 0x75ead4));
    }
    this.tunnel.add(crystals, glows);

    // Broad soft shafts give light a readable direction without volumetric ray marching.
    const shafts = new THREE.Group();
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 uvBeam; varying vec3 worldBeam; varying vec3 normalBeam; void main(){uvBeam=uv;vec4 p=modelMatrix*vec4(position,1.0);worldBeam=p.xyz;normalBeam=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*p;}',
      fragmentShader: 'varying vec2 uvBeam; varying vec3 worldBeam; varying vec3 normalBeam; void main(){float face=abs(dot(normalize(normalBeam),normalize(cameraPosition-worldBeam)));float ends=sin(uvBeam.y*3.14159265);float a=pow(face,3.0)*ends*ends*.009;gl_FragColor=vec4(.40,.69,.61,a);}'
    });
    const shaftGeo = new THREE.CylinderGeometry(2, 10, 62, 20, 1, true);
    for (let i = 0; i < 9; i++) {
      const zz = start + 60 + i * 90, c = physics.course(zz), mesh = new THREE.Mesh(shaftGeo, beamMat);
      mesh.position.set(c.x - 15 + hash(i + start) * 30, c.y + 3, zz); mesh.rotation.z = .25 + hash(i * 3) * .45; shafts.add(mesh);
    }
    shafts.children[0]?.userData && (shafts.children[0].userData.ownMat = true); this.tunnel.add(shafts);
    // Tunnel exit is deliberately broad and luminous, visible from the final approach.
    const finishZ = physics.COURSE_LENGTH || 2400;
    if (end >= finishZ) {
      const c = physics.course(finishZ + 25), disc = new THREE.Mesh(new THREE.CircleGeometry(45, 64), new THREE.MeshBasicMaterial({ color: 0xafffe4 }));
      disc.position.set(c.x, c.y, finishZ + 25); disc.rotation.y = Math.PI; disc.userData.ownMat = true; this.tunnel.add(disc);
    }
    this.chunk = Math.floor(z / 72); this.lastTheme = this.theme;
  }

  buildGates() {
    this.gateObjs = [];
    const gateData = physics.gates || [];
    const torus = new THREE.TorusGeometry(1, .025, 6, 80), outer = new THREE.TorusGeometry(1, .025, 6, 80);
    for (let i = 0; i < gateData.length; i++) {
      const g = gateData[i], radius = g.radius || 7, group = new THREE.Group();
      const p = g.p || [g.x, g.y, g.z]; group.position.fromArray(p);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 4 === 3 ? COLORS.amber : COLORS.cyan).multiplyScalar(2.2) });
      const ring = new THREE.Mesh(torus, mat); ring.position.z = -.24; ring.scale.setScalar(radius); group.add(ring);
      const metal = new THREE.Mesh(outer, new THREE.MeshStandardMaterial({ color: 0x35575c, metalness: .8, roughness: .4 })); metal.scale.setScalar(radius + .3); group.add(metal);
      const ticks = [];
      for (let j = 0; j < 12; j++) { const a = j / 12 * Math.PI * 2; ticks.push(new THREE.Vector3(Math.cos(a) * (radius + .55), Math.sin(a) * (radius + .55), 0), new THREE.Vector3(Math.cos(a) * (radius + 1.15), Math.sin(a) * (radius + 1.15), 0)); }
      group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), new THREE.LineBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: .55 })));
      const inner = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshBasicMaterial({ color: COLORS.cyan, side: THREE.DoubleSide, transparent: true, opacity: .025, depthWrite: false })); group.add(inner);
      this.scene.add(group); this.gateObjs.push({ group, ring, inner, mat, z: p[2], index: i });
    }
  }

  buildPilot() {
    this.pilot = new THREE.Group(); this.scene.add(this.pilot);
    this.suitMat = new THREE.MeshStandardMaterial({ color: 0xf86840, roughness: .47, metalness: .14 });
    this.darkMat = new THREE.MeshStandardMaterial({ color: 0x142c32, roughness: .68, metalness: .2 });
    this.strapMat = new THREE.MeshStandardMaterial({ color: 0xddd5ae, roughness: .6, metalness: .25 });
    this.helmetMat = new THREE.MeshStandardMaterial({ color: 0xf9e5c5, roughness: .24, metalness: .35 });
    this.visorMat = new THREE.MeshStandardMaterial({ color: 0x113944, emissive: 0x155a63, emissiveIntensity: .2, roughness: .12, metalness: .9 });
    this.seamMat = new THREE.MeshBasicMaterial({ color: 0x71ffed });
    const sphere = new THREE.SphereGeometry(1, 16, 12), cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
    this.bodyParts = [];
    for (const [a, b, radius, material] of [[1, 2, .22, this.suitMat], [3, 5, .10, this.suitMat], [4, 6, .10, this.suitMat], [5, 7, .085, this.darkMat], [6, 8, .085, this.darkMat], [2, 9, .13, this.suitMat], [2, 10, .13, this.suitMat], [9, 11, .10, this.darkMat], [10, 12, .10, this.darkMat], [3, 4, .10, this.darkMat]]) {
      const mesh = new THREE.Mesh(cylinder, material); this.pilot.add(mesh); this.bodyParts.push({ a, b, radius, mesh });
    }
    this.joints = [];
    for (const [id, radius, material] of [[5, .103, this.darkMat], [6, .103, this.darkMat], [9, .125, this.darkMat], [10, .125, this.darkMat], [7, .09, this.helmetMat], [8, .09, this.helmetMat]]) {
      const mesh = new THREE.Mesh(sphere, material); mesh.scale.setScalar(radius); this.pilot.add(mesh); this.joints.push({ id, mesh });
    }
    this.helmet = new THREE.Mesh(sphere, this.helmetMat); this.helmet.scale.set(.23, .23, .28); this.pilot.add(this.helmet);
    this.visor = new THREE.Mesh(sphere, this.visorMat); this.visor.scale.set(.205, .14, .17); this.pilot.add(this.visor);
    this.pack = new THREE.Mesh(new THREE.BoxGeometry(.36, .23, .52, 1, 1, 1), this.darkMat); this.pilot.add(this.pack);
    this.packDetail = new THREE.Mesh(new THREE.BoxGeometry(.27, .016, .19), this.suitMat); this.pilot.add(this.packDetail);
    this.boots = [];
    for (const id of [11, 12]) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(.17, .15, .33), this.darkMat); this.pilot.add(mesh); this.boots.push({ id, mesh }); }
    this.wings = [];
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xf44c26, emissive: 0x5b170d, emissiveIntensity: .04, metalness: .02, roughness: .78, side: THREE.DoubleSide });
    const wingInset = new THREE.MeshStandardMaterial({ color: 0xffbe62, roughness: .65, side: THREE.DoubleSide, metalness: .1 });
    // Each membrane is a physical-particle triangle fan, not a rigid decorative cape.
    for (const ids of [[3, 5, 7, 9, 2, 1], [4, 6, 8, 10, 2, 1], [2, 9, 11, 12, 10]]) {
      const g = new THREE.BufferGeometry(), pos = new Float32Array((ids.length - 2) * 9); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mesh = new THREE.Mesh(g, wingMat); mesh.frustumCulled = false; this.pilot.add(mesh);
      const outlineGeo = new THREE.BufferGeometry(); outlineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ids.length + 1) * 3), 3));
      const outline = new THREE.Line(outlineGeo, new THREE.LineBasicMaterial({ color: 0xffd692 })); outline.frustumCulled = false; this.pilot.add(outline);
      const cellsGeo = new THREE.BufferGeometry(); cellsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ids.length - 2) * 6), 3));
      const cells = new THREE.LineSegments(cellsGeo, new THREE.LineBasicMaterial({ color: 0x6f2a24, transparent: true, opacity: .65 })); cells.frustumCulled = false; this.pilot.add(cells);
      this.wings.push({ ids, mesh, outline, cells });
    }
    this.straps = [];
    for (const [a, b] of [[3, 2], [4, 2], [1, 9], [1, 10], [3, 4], [9, 10]]) {
      const m = new THREE.Mesh(cylinder, this.strapMat); this.pilot.add(m); this.straps.push({ a, b, radius: .025, mesh: m, offset: .19 });
    }
    this.seam = line([V(), V()], 0x69fff0); this.pilot.add(this.seam);
    this.pilotPts = Array.from({ length: 14 }, V);
    this.aimForward = V(); this.aimRight = V(); this.aimUp = V(); this.pilotQ = new THREE.Quaternion();
    this.tmpA = V(); this.tmpB = V(); this.tmpC = V(); this.tmpM = new THREE.Matrix4();
  }

  updatePilot(sim) {
    const points = this.pilotPts;
    const fallback = [[0, .06, .92], [0, 0, .42], [0, 0, -.26], [-.27, 0, .4], [.27, 0, .4], [-.8, -.03, .3], [.8, -.03, .3], [-1.45, -.05, .13], [1.45, -.05, .13], [-.29, -.03, -.83], [.29, -.03, -.83], [-.42, -.03, -1.4], [.42, -.03, -1.4], [0, 0, .05]];
    const vel = this.tmpA.fromArray(sim.forward || sim.v || [0, -13, 36]);
    this.aimForward.copy(vel).normalize();
    if (this.aimForward.lengthSq() < .1) this.aimForward.set(0, -.3, 1).normalize();
    this.aimRight.crossVectors(UP, this.aimForward).normalize(); this.aimUp.crossVectors(this.aimForward, this.aimRight).normalize();
    const bank = sim.bank || 0, q = new THREE.Quaternion().setFromAxisAngle(this.aimForward, -bank);
    this.aimRight.applyQuaternion(q); this.aimUp.applyQuaternion(q);
    if (sim.right) this.aimRight.fromArray(sim.right);
    if (sim.up) this.aimUp.fromArray(sim.up);
    this.tmpM.makeBasis(this.aimRight, this.aimUp, this.aimForward); this.pilotQ.setFromRotationMatrix(this.tmpM);
    for (let i = 0; i < points.length; i++) {
      const p = sim.particles?.[i]?.p;
      if (p) points[i].fromArray(p);
      else points[i].fromArray(sim.p).addScaledVector(this.aimRight, fallback[i][0]).addScaledVector(this.aimUp, fallback[i][1]).addScaledVector(this.aimForward, fallback[i][2]);
    }
    const segment = ({ a, b, radius, mesh, offset = 0 }) => {
      this.tmpA.copy(points[a]); this.tmpB.copy(points[b]);
      if (offset) { this.tmpA.addScaledVector(this.aimUp, offset); this.tmpB.addScaledVector(this.aimUp, offset); }
      this.tmpC.subVectors(this.tmpB, this.tmpA); const len = this.tmpC.length();
      mesh.position.copy(this.tmpA).add(this.tmpB).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(UP, this.tmpC.normalize()); mesh.scale.set(radius, len, radius);
    };
    this.bodyParts.forEach(segment); this.straps.forEach(segment);
    for (const j of this.joints) j.mesh.position.copy(points[j.id]);
    this.helmet.position.copy(points[0]); this.helmet.quaternion.copy(this.pilotQ);
    this.visor.position.copy(points[0]).addScaledVector(this.aimForward, .19).addScaledVector(this.aimUp, .035); this.visor.quaternion.copy(this.pilotQ);
    this.pack.position.copy(points[1]).lerp(points[2], .38).addScaledVector(this.aimUp, .21); this.pack.quaternion.copy(this.pilotQ);
    this.packDetail.position.copy(this.pack.position).addScaledVector(this.aimUp, .13); this.packDetail.quaternion.copy(this.pilotQ);
    for (const b of this.boots) { b.mesh.position.copy(points[b.id]); b.mesh.quaternion.copy(this.pilotQ); }
    for (const wing of this.wings) {
      const p = wing.mesh.geometry.attributes.position, o = wing.outline.geometry.attributes.position, c = wing.cells.geometry.attributes.position;
      let n = 0;
      for (let j = 1; j < wing.ids.length - 1; j++) for (const id of [wing.ids[0], wing.ids[j], wing.ids[j + 1]]) { const a = points[id]; p.setXYZ(n++, a.x, a.y - .025, a.z); }
      wing.ids.forEach((id, j) => { const a = points[id]; o.setXYZ(j, a.x, a.y, a.z); });
      const a = points[wing.ids[0]]; o.setXYZ(wing.ids.length, a.x, a.y, a.z);
      for (let j = 1; j < wing.ids.length - 1; j++) { const b = points[wing.ids[j]]; c.setXYZ((j - 1) * 2, a.x, a.y + .006, a.z); c.setXYZ((j - 1) * 2 + 1, b.x, b.y + .006, b.z); }
      p.needsUpdate = o.needsUpdate = c.needsUpdate = true; wing.mesh.geometry.computeVertexNormals();
    }
    this.pilot.visible = this.cameraMode !== 'helmet';
  }

  buildParticles() {
    const n = 850, pos = new Float32Array(n * 3), sizes = new Float32Array(n);
    this.dustSeeds = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.dustSeeds[i * 3] = hash(i * 9.3); this.dustSeeds[i * 3 + 1] = hash(i * 4.2); this.dustSeeds[i * 3 + 2] = hash(i * 73.1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xb5ebc8, size: .09, transparent: true, opacity: .48, depthWrite: false, sizeAttenuation: true }));
    this.dust.frustumCulled = false; this.scene.add(this.dust);
    const streakGeo = new THREE.BufferGeometry(); streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 6), 3));
    this.streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({ color: 0xbceced, transparent: true, opacity: .1, depthWrite: false }));
    this.streaks.frustumCulled = false; this.scene.add(this.streaks);
  }

  updateParticles(sim) {
    const p = sim.p, arr = this.dust.geometry.attributes.position, n = this.quality === 'low' ? 240 : this.quality === 'high' ? 850 : 520;
    for (let i = 0; i < n; i++) {
      const s = this.dustSeeds, zz = Math.floor(p[2] / 70) * 70 - 30 + s[i * 3 + 2] * 320, c = physics.course(zz), a = s[i * 3] * Math.PI * 2, r = Math.sqrt(s[i * 3 + 1]) * .94;
      arr.setXYZ(i, c.x + Math.cos(a) * c.rx * r + Math.sin(this.time * .2 + i) * .3, c.y + Math.sin(a) * c.ry * r, zz);
    }
    arr.needsUpdate = true; this.dust.geometry.setDrawRange(0, n);
    const pos = this.streaks.geometry.attributes.position, amount = this.reducedMotion || sim.state !== 'flying' ? 0 : 60;
    const speed = sim.telemetry?.airspeed || 38, wind = sim.telemetry?.wind || [0, 0, 0];
    for (let i = 0; i < amount; i++) {
      const zz = p[2] - 5 + ((hash(i * 7) * 70 - this.time * 22) % 70 + 70) % 70, x = p[0] + (hash(i * 5) - .5) * 45, y = p[1] + (hash(i * 13) - .5) * 32;
      pos.setXYZ(i * 2, x, y, zz); pos.setXYZ(i * 2 + 1, x - wind[0] * .04, y - wind[1] * .04 + .6, zz - clamp(speed * .04, .5, 3));
    }
    pos.needsUpdate = true; this.streaks.geometry.setDrawRange(0, amount * 2);
  }

  buildTrails() {
    this.trails = []; this.trailSamples = [[], []]; this.trailTimer = 0;
    for (let j = 0; j < 2; j++) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(160 * 3), 3));
      const obj = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: j ? 0xffbd71 : 0x65fff4, transparent: true, opacity: .45, depthWrite: false })); obj.frustumCulled = false; this.scene.add(obj); this.trails.push(obj);
    }
  }

  buildOverlay() {
    this.debugGeo = new THREE.BufferGeometry(); this.debugGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    this.debugGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    this.debug = new THREE.LineSegments(this.debugGeo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: .9 })); this.debug.renderOrder = 12; this.debug.frustumCulled = false; this.scene.add(this.debug);
  }

  updateOverlay(sim) {
    this.debug.visible = !!this.overlays;
    if (!this.overlays) return;
    const p = this.debugGeo.attributes.position, c = this.debugGeo.attributes.color, origin = new THREE.Vector3().fromArray(sim.p); let n = 0;
    const arrow = (dir, color) => {
      const end = origin.clone().add(dir), col = new THREE.Color(color); p.setXYZ(n, origin.x, origin.y, origin.z); c.setXYZ(n++, col.r, col.g, col.b); p.setXYZ(n, end.x, end.y, end.z); c.setXYZ(n++, col.r, col.g, col.b);
    };
    arrow(new THREE.Vector3().fromArray(sim.v).multiplyScalar(.12), 0x63e8fa);
    arrow(new THREE.Vector3(0, -(sim.params?.mass || 90) * (sim.params?.g || 9.80665) / 250, 0), 0xffb363);
    const wind = sim.telemetry?.wind || [0, 0, 0];
    const aero = physics.aeroForces(sim.v, wind, sim.params, { forward: sim.forward, up: sim.up }, !!sim.limp);
    arrow(new THREE.Vector3().fromArray(aero.liftVector).multiplyScalar(1 / 250), 0xc2ff9b);
    arrow(new THREE.Vector3().fromArray(aero.dragVector).multiplyScalar(1 / 250), 0xff786f);
    arrow(new THREE.Vector3().fromArray(wind).multiplyScalar(.25), 0xc6a1ff);
    for (const l of sim.links || []) {
      if (n >= 60 || !sim.particles?.[l.a] || !sim.particles?.[l.b]) break;
      const a = sim.particles[l.a].p, b = sim.particles[l.b].p;
      p.setXYZ(n, ...a); c.setXYZ(n++, 1, .85, .3); p.setXYZ(n, ...b); c.setXYZ(n++, 1, .85, .3);
    }
    p.needsUpdate = c.needsUpdate = true; this.debugGeo.setDrawRange(0, n);
  }

  updateCamera(sim, dt) {
    const p = new THREE.Vector3().fromArray(sim.p), velocity = new THREE.Vector3().fromArray(sim.v), speed = velocity.length();
    const forward = velocity.normalize(), right = new THREE.Vector3().crossVectors(UP, forward).normalize();
    if (forward.lengthSq() < .1) forward.set(0, -.3, 1);
    let desired = p.clone(), look = p.clone(), up = UP.clone();
    if (this.cameraMode === 'helmet') {
      desired.copy(this.pilotPts[0]).addScaledVector(forward, .23).addScaledVector(this.aimUp, .1);
      look.copy(desired).addScaledVector(forward, 55); up.copy(this.aimUp).lerp(UP, .6).normalize();
    } else if (this.cameraMode === 'orbit') {
      const a = this.reducedMotion ? .6 : this.time * .09;
      desired.add(new THREE.Vector3(Math.sin(a) * 6.3, 2.2, -Math.cos(a) * 6.3)); look.copy(p).addScaledVector(forward, .5);
    } else {
      desired.addScaledVector(forward, -6.2).addScaledVector(UP, 2.5).addScaledVector(right, .65);
      look.addScaledVector(forward, 12).addScaledVector(UP, -.5);
      if (!this.reducedMotion) up.applyAxisAngle(forward, -(sim.bank || 0) * .13);
    }
    // Keep the spectator camera inside the same tunnel even after a wall impact.
    const cc = physics.course(desired.z), dx = desired.x - cc.x, dy = desired.y - cc.y, r = Math.hypot(dx / (cc.rx - 2), dy / (cc.ry - 2));
    if (r > 1) { desired.x = cc.x + dx / r; desired.y = cc.y + dy / r; }
    const a = this.cameraReady ? 1 - Math.exp(-Math.min(dt, .1) * (this.cameraMode === 'helmet' ? 18 : 8)) : 1;
    this.camera.position.lerp(desired, a); this.camera.up.lerp(up, a).normalize();
    this.lookAt ||= look.clone(); this.lookAt.lerp(look, a); this.camera.lookAt(this.lookAt);
    const fov = this.cameraMode === 'orbit' ? 52 : 62 + (this.reducedMotion ? 0 : clamp((speed - 25) * .15, 0, 7));
    if (Math.abs(this.camera.fov - fov) > .03) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.cameraReady = true;
  }

  render(sim, dt = 1 / 60) {
    this.time += Math.min(dt, .1); this.resize();
    const resetView = sim.time < .03 || Math.abs((this.lastSimZ ?? sim.p[2]) - sim.p[2]) > 40;
    if (resetView) { this.cameraReady = false; this.lookAt = null; this.trailSamples = [[], []]; }
    if (this.chunk !== Math.floor(sim.p[2] / 72) || this.theme !== this.lastTheme) this.rebuild(sim.p[2]);
    const virtual = this.isVirtual(sim.p[2]);
    this.scene.fog.color.lerp(new THREE.Color(virtual ? 0x061322 : 0x071b1d), .04); this.scene.background.copy(this.scene.fog.color);
    this.updatePilot(sim); this.updateCamera(sim, dt); this.updateParticles(sim); this.updateOverlay(sim);
    this.pilotLight.position.fromArray(sim.p).addScaledVector(this.aimUp, 2).addScaledVector(this.aimForward, -1.5);
    const z = sim.p[2] + 48, c = physics.course(z); this.cyanLight.position.set(c.x - 14, c.y + 10, z);
    const c2 = physics.course(z + 120); this.aheadLight.position.set(c2.x + 10, c2.y + 18, z + 120);
    this.aheadLight.color.set(virtual ? 0x6e8dff : 0xffbc74);
    for (const obj of this.gateObjs) {
      obj.group.visible = obj.z > sim.p[2] - 45 && obj.z < sim.p[2] + 620;
      const passed = sim.passedGates?.has(obj.index) || false, missed = sim.gateOutcomes?.get(obj.index) === 'miss';
      obj.mat.color.set(passed ? 0x8aff9e : missed ? 0xa7514d : obj.index % 4 === 3 ? COLORS.amber : COLORS.cyan).multiplyScalar(missed ? .8 : 2.2);
      obj.inner.material.opacity = passed ? .0 : .022 + .006 * Math.sin(this.time * 2);
    }
    this.lastSimZ = sim.p[2]; this.trailTimer += dt;
    if (this.trailTimer > .025 && sim.state === 'flying') {
      this.trailTimer = 0;
      for (let j = 0; j < 2; j++) { this.trailSamples[j].push(this.pilotPts[j ? 8 : 7].clone()); if (this.trailSamples[j].length > 160) this.trailSamples[j].shift(); }
    }
    for (let j = 0; j < 2; j++) {
      const arr = this.trails[j].geometry.attributes.position, samples = this.trailSamples[j]; samples.forEach((p, i) => arr.setXYZ(i, p.x, p.y, p.z)); arr.needsUpdate = true; this.trails[j].geometry.setDrawRange(0, this.reducedMotion ? 0 : samples.length);
    }
    this.renderer.info.reset();
    if (this.quality === 'low') this.renderer.render(this.scene, this.camera); else this.composer.render();
    this.frameStats = { drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      lines: this.renderer.info.render.lines, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures,
      pixelRatio: this.renderer.getPixelRatio(), quality: this.quality, camera: this.cameraMode, bloom: this.quality !== 'low' };
  }

  stats() { return this.frameStats || { drawCalls: 0, triangles: 0, quality: this.quality, camera: this.cameraMode }; }
}
