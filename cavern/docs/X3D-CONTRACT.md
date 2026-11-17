# chasm-x3d-snapshot/1

This export is a static X3D4.0 `Full` profile document. It is separate from
`floplab-x3d-slice/1` and cannot be imported by that2.5D reader. No arbitrary
X3D importer is added by CHASM.

| Export | Interpretation |
|---|---|
| IndexedFaceSet cavern | Sampled full analytic tunnel,48 radial by180 longitudinal strips; solid=false |
| IndexedLineSet gates | Fifteen named geometric circles; crossing/scoring remains custom |
| CollidableShape proxies | Fourteen named particle spheres at current world locations |
| RigidBodyCollection | Disabled physical snapshot,14 masses/positions/velocities referencing proxies |
| Cylinders and triangle membranes | Static articulated pilot illustration, not native cloth |
| WorldInfo / MetadataSet | Contract ID, current settings, distance-constraint endpoint/rest/compliance records, scope |
| Viewpoint/lights/materials | Portable classic scene presentation; no Three bloom or postprocessing |

Every membrane face is a triangle so nonplanar articulated loops do not rely on
undefined polygon tessellation. The tunnel is a coarse presentation sampling,
not the exact analytic collision field. No external textures, scripts, Inline,
or URLs that load geometry/code are embedded. The schema declaration identifies
the4.0 specification; local validation uses the repository's pinned schemas.

The disabled collection is intentional. XPBD distances are not misrepresented
as native coincident-anchor BallJoint constraints. Custom aerodynamic forces,
muscle torques, prescribed wind, timestep, assistance, contact approximations,
game rules and RNG/clock history do not become portable native dynamics.
Enabling the collection in another viewer is not a meaningful replay.

Snapshot settings use MFString-escaped JSON inside XML-escaped metadata.
The serializer refuses nonfinite numeric geometry. The checked snapshot and
`x3d-validation.json` document one schema+implemented-semantic validation run;
they do not certify every consumer's display or physical accuracy.

`chasm-settings/1` is the smaller settings import/export contract. It admits
exactly the bounded numeric fields in `io.js`, a boolean coach setting, and
known presentation enums, within8KiB UTF-8. All checks precede application of
the candidate. This format does not accept scripts or geometry. Live tuning
does not reset the run and is marked experimental. A settings file is not a
checkpoint or exact replay.
