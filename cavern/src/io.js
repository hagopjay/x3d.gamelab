// The export boundary is deliberately smaller than the simulation.
// X3D contains a static inspectable scene, not an equivalent flight engine.
import {DEFAULTS, course, gates, wallPoint} from './physics.js';

export const SETTINGS_SCHEMA = 'chasm-settings/1';
export const LIMITS = Object.freeze({
  windSpeed:[0,25], windDirection:[0,360], gust:[0,8], mass:[60,120],
  area:[1.2,2.2], rho:[.6,1.4], g:[1,15], liftScale:[.5,1.5],
  dragScale:[.5,1.5], compliance:[0,.002]
});
const enums = {theme:['hybrid','natural','virtual'],quality:['low','balanced','high'],camera:['chase','helmet','orbit']};

export function settingsObject(params, presentation={}) {
  const physics={};
  for(const key of Object.keys(LIMITS)) physics[key]=params[key] ?? DEFAULTS[key];
  physics.assistance=!!params.assistance;
  return {schema:SETTINGS_SCHEMA,physics,presentation:{theme:presentation.theme||'hybrid',quality:presentation.quality||'balanced',camera:presentation.camera||'chase'}};
}
export function parseSettings(text) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>8192) throw Error('Settings must be a JSON file smaller than 8 KiB.');
  const v=JSON.parse(text);
  if(!v||v.schema!==SETTINGS_SCHEMA||!v.physics||!v.presentation) throw Error('Expected a CHASM settings file, schema '+SETTINGS_SCHEMA+'.');
  const keys=(o,allowed)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!allowed.includes(k))) throw Error('Unknown or malformed settings field.');};
  keys(v,['schema','physics','presentation']); keys(v.physics,[...Object.keys(LIMITS),'assistance']); keys(v.presentation,Object.keys(enums));
  for(const [key,[min,max]] of Object.entries(LIMITS)) {
    const n=v.physics[key];
    if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max) throw Error('Out-of-range physics value: '+key);
  }
  if(typeof v.physics.assistance!=='boolean') throw Error('Route coach must be true or false.');
  for(const [key,opts] of Object.entries(enums)) if(!opts.includes(v.presentation[key])) throw Error('Unknown presentation value: '+key);
  return v;
}
const n=x=>{if(!Number.isFinite(x))throw Error('Cannot export a nonfinite scene.');return String(Number(x.toFixed(6)));};
const vec=a=>a.map(n).join(' ');
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll("'",'&apos;');
const mf=s=>xml('"'+s.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"');
function cylinder(a,b,r,color) {
  const d=b.map((v,i)=>v-a[i]),len=Math.hypot(...d),mid=a.map((v,i)=>(v+b[i])/2);
  if(len<1e-8)return '';
  const ax=d[2]/len,az=-d[0]/len,al=Math.hypot(ax,az);
  const rot=al<1e-8 ? (d[1]>=0?'1 0 0 0':'1 0 0 3.141593') : vec([ax/al,0,az/al,Math.acos(Math.max(-1,Math.min(1,d[1]/len)))]);
  return `<Transform translation="${vec(mid)}" rotation="${rot}"><Shape><Appearance><Material diffuseColor="${color}"/></Appearance><Cylinder radius="${n(r)}" height="${n(len)}"/></Shape></Transform>`;
}

export function toX3D(sim,{theme='hybrid',quality='balanced',camera='chase'}={}) {
  const pts=[],faces=[],colors=[],N=48,M=180;
  for(let j=0;j<=M;j++){
    const z=j*2400/M,c=course(z),virtual=theme==='virtual'||theme==='hybrid'&&z>=900&&z<1700;
    for(let i=0;i<N;i++){
      const a=i/N*Math.PI*2;pts.push(...wallPoint(z,a));
      colors.push(...(virtual?[.025,.105,.13]:[.12+.025*Math.sin(i*3+j),.12,.10]));
      if(j<M){const a0=j*N+i,b0=j*N+(i+1)%N;faces.push(a0,b0,b0+N,a0+N,-1);}
    }
  }
  const p=sim.p||[course(0).x,course(0).y,0], pilot=sim.particles||[];
  const out=[`<?xml version="1.0" encoding="UTF-8"?>`,
    `<X3D profile="Full" version="4.0" xmlns:xsd="http://www.w3.org/2001/XMLSchema-instance" xsd:noNamespaceSchemaLocation="https://www.web3d.org/specifications/x3d-4.0.xsd">`,
    `<head><meta name="title" content="CHASM - static cavern and ragdoll snapshot"/><meta name="description" content="chasm-x3d-snapshot/1. Static scene, disabled particle proxies, custom XPBD constraint metadata. No portable flight dynamics or replay."/><meta name="generator" content="X3D GameLab CHASM"/></head><Scene>`,
    `<WorldInfo title="CHASM - Wingsuit Observatory"><MetadataSet containerField="metadata" name="chasm"><MetadataString containerField="value" name="contract" value='"chasm-x3d-snapshot/1"'/><MetadataString containerField="value" name="settings" value="${mf(JSON.stringify(settingsObject(sim.params,{theme,quality,camera})))}"/><MetadataString containerField="value" name="constraints" value="${mf(JSON.stringify((sim.links||[]).map(l=>({a:l.a,b:l.b,rest:l.rest,compliance:l.compliance}))))}"/><MetadataString containerField="value" name="scope" value='"Static presentation and disabled particle proxies. Distance constraints and flight controls require the custom CHASM solver. Decorative light and dust omitted."'/></MetadataSet></WorldInfo>`,
    `<NavigationInfo type='"EXAMINE" "FLY" "ANY"' headlight="true"/><Background skyColor="0.018 0.04 0.05"/><Viewpoint description="Pilot chase" position="${vec([p[0],p[1]+3,p[2]-8])}" orientation="0 1 0 3.141593" fieldOfView="1.1"/><DirectionalLight direction="0 -1 1" intensity="1"/><PointLight location="${vec(p)}" intensity="2" radius="140"/>`,
    `<Shape DEF="Cavern"><Appearance><Material diffuseColor="0.25 0.3 0.26" ambientIntensity="0.6"/></Appearance><IndexedFaceSet solid="false" creaseAngle="0.5" coordIndex="${faces.join(' ')}"><Coordinate point="${vec(pts)}"/><Color color="${vec(colors)}"/></IndexedFaceSet></Shape>`
  ];
  for(let i=0;i<gates.length;i++){
    const g=gates[i],cp=[],ci=[];
    for(let k=0;k<64;k++){const a=k/64*Math.PI*2;cp.push(g.x+g.radius*Math.cos(a),g.y+g.radius*Math.sin(a),g.z);ci.push(k);}
    ci.push(0,-1);
    out.push(`<Shape DEF="Gate_${i}"><Appearance><Material emissiveColor="0.25 0.9 0.8"/></Appearance><IndexedLineSet coordIndex="${ci.join(' ')}"><Coordinate point="${vec(cp)}"/></IndexedLineSet></Shape>`);
  }
  for(let i=0;i<pilot.length;i++){
    const particle=pilot[i],position=particle.p;
    out.push(`<CollidableShape DEF="Proxy_${i}" translation="${vec(position)}"><Shape containerField="shape"><Appearance><Material diffuseColor="${i===0?'0.8 0.9 0.85':'0.98 0.32 0.17'}"/></Appearance><Sphere radius="${n(particle.radius??(i===0?.15:.09))}"/></Shape></CollidableShape>`);
  }
  for(const l of sim.links||[]) if(pilot[l.a]&&pilot[l.b])out.push(cylinder(pilot[l.a].p,pilot[l.b].p,.055,'0.9 0.35 0.16'));
  // The physical graph is disabled intentionally. Native rigid bodies cannot
  // reproduce this custom particle solver by simply receiving its parameters.
  out.push(`<RigidBodyCollection DEF="ParticleSnapshot" enabled="false" gravity="0 ${n(-sim.params.g)} 0">`);
  for(let i=0;i<pilot.length;i++)out.push(`<RigidBody DEF="Particle_${i}" containerField="bodies" position="${vec(pilot[i].p)}" mass="${n(pilot[i].mass??sim.params.mass/pilot.length)}" linearVelocity="${vec(pilot[i].v||sim.v)}"><CollidableShape USE="Proxy_${i}" containerField="geometry"/></RigidBody>`);
  out.push('</RigidBodyCollection>');
  // Membrane topology is visible geometry only, not a cloth simulation.
  if(pilot.length>=14){
    const coords=pilot.flatMap(j=>j.p),idx=[];
    for(const ids of [[3,5,7,9,2,1],[4,6,8,10,2,1],[2,9,11,12,10]])for(let i=1;i<ids.length-1;i++)idx.push(ids[0],ids[i],ids[i+1],-1);
    out.push(`<Shape DEF="SuitMembranes"><Appearance><Material diffuseColor="0.95 0.25 0.12" transparency="0.12"/></Appearance><IndexedFaceSet solid="false" coordIndex="${idx.join(' ')}"><Coordinate point="${vec(coords)}"/></IndexedFaceSet></Shape>`);
  }
  out.push('</Scene></X3D>');return out.join('\n')+'\n';
}

export const CSV_COLUMNS=['time_s','x_m','y_m','z_m','air_speed_m_s','ground_speed_m_s','sink_m_s','wind_x_m_s','wind_y_m_s','wind_z_m_s','lift_N','drag_N','dynamic_pressure_Pa','clearance_m','score','gates','impacts','mass_kg','area_m2','density_kg_m3','gravity_m_s2','mean_wind_m_s','wind_direction_deg','gust_m_s','lift_scale','drag_scale','compliance_m_N','route_coach'];
export function sampleTelemetry(sim){
  const t=sim.telemetry||{},w=t.wind||[0,0,0];
  const p=sim.params;
  return [sim.time,...sim.p,t.airspeed,t.groundspeed,t.sink,...w,t.lift,t.drag,t.q,t.clearance,sim.score,sim.gatesPassed,sim.impacts,p.mass,p.area,p.rho,p.g,p.windSpeed,p.windDirection,p.gust,p.liftScale,p.dragScale,p.compliance,p.assistance?1:0].map(v=>{if(!Number.isFinite(v))throw Error('Cannot record nonfinite telemetry.');return Number(v.toPrecision(9));});
}
export function toCSV(rows,settings){
  // Prefix comment is quoted so commas in JSON cannot become fake columns.
  return '# CHASM telemetry; SI units; export-time presentation/settings='+JSON.stringify(settings)+'\n'+CSV_COLUMNS.join(',')+'\n'+rows.map(r=>r.join(',')).join('\n')+'\n';
}
