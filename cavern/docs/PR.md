# Add CHASM: a 3D wingsuit ragdoll cavern observatory

Adds a separate2.4km wingsuit descent at `cavern/`: steer an articulated pilot
through natural rock, a luminous virtual passage and a daylit course finish.
Changing wind speed/direction/gusts immediately changes air-relative lift and
drag. The live flight lab also exposes mass, area, density, gravity,
coefficient scales and joint compliance.

The14-particle,24-link XPBD rig shares its mass-weighted aerodynamic resultant
with the flight model. Internal pose forces cancel their net linear force;
swept particle contacts preserve pre-projection impact speeds. The optional
route coach supplies bounded bank/pitch commands with per-axis manual priority.
Gates use one-time interpolated plane crossings and authoritative outcomes.

Rendering uses the existing pinned Three.js closure: shared irregular cave
geometry, continuous rock shading, wall mineral accents, emissive gates,
feathered light shafts, dust, bloom, articulated membranes and harness, three
cameras and quality/comfort controls. The120Hz outer clock caps catch-up and
reports discarded wall time. Rendering settings leave the physics unchanged.

Static X3D4.0 export records the cave, gates, pilot, disabled particle proxies
and declared settings/constraint metadata. Bounded JSON settings import and
sampled SI CSV exports support experiments. The offline single-HTML builder
embeds the pinned module closure and guide using Node built-ins only.

## Validation

- `npm test`:154 inherited PASS lines and16 new checks pass.
- Existing `node build.mjs` output remains byte-identical.
-20 real Chromium/SwiftShader browser checks pass from a Pages-style subpath,
  including390px layout, input/focus, cameras and all three download formats.
- Standalone `file://` page renders, advances flight and opens its guide with
  no external requests or page errors.
- Checked X3D snapshot passes the pinned4.0 schema and implemented semantic
  diagnostics, with both negative-control twins caught.

See [VALIDATION.md](VALIDATION.md) for executed scope and raw reports,
[PHYSICS.md](PHYSICS.md) for the model and
[FOLDBACK.md](FOLDBACK.md) for ten transferable engineering lessons.

## Model and publication boundaries

Coefficients are uncalibrated estimates. Wind is prescribed; body attitude,
contacts and membranes use low-cost approximations. Measured real-suit
validation, hardware-GPU performance, broader browser testing, fabric/CFD,
anatomical joint limits and distributed aerodynamic moments remain future work.
X3D export is a static snapshot, not native execution of this custom solver.

No new runtime dependency or frozen-release modification is included. The
separate route, README link and test scripts expose the new experiment.
