# CHASM: lessons to fold back into GameLab

CHASM applies GameLab's inspectable state, bounded controls, portable scene
exports and playful ragdoll presentation to a separate three-dimensional flight
experiment. The useful contribution is a set of explicit contracts between
forces, articulation, collision, presentation and evidence. This document
records the concrete failures those contracts prevent.

## 1. Separate velocity over ground from velocity through air

**Trigger:** changing wind moved the pilot's route, but an earth-relative drag
calculation would also have changed the force incorrectly.

**Before:** one speed value could serve movement, drag and the HUD.
**After:** position integrates world velocity `v`; aerodynamic force uses
`u = v - wind(position,time)` and `q = 0.5*rho*dot(u,u)`. The HUD and CSV expose
air speed and horizontal ground speed separately. Wind direction is velocity
**toward** the stated angle: 0 degrees is +Z, not meteorological wind-from.

For GameLab, name every velocity's reference frame at its boundary. Test that
adding the same constant velocity to wind and pilot leaves aerodynamic forces
unchanged. Lift must remain perpendicular to relative velocity; drag must
oppose it. The coefficient values remain uncalibrated design estimates even
when those force identities pass.

## 2. Share the physical shape with the visible and exported shape

**Trigger:** a perfectly elliptical cavern looked artificial; decorative rock
inside an unchanged collider would have introduced invisible collision rules.

**Before:** a smooth ellipse supplied both the tunnel and its clearance field.
**After:** `wallPoint(z,angle)` samples a shared radial shape. Three smooth
angular harmonics vary along Z and are bounded to a total nine percent radial
variation. The virtual section, Z = 900 to 1700 m, is elliptical, with 120 m eased
transitions outside its ends. Rendering and X3D export sample that same shape.

`caveBoundary` differentiates the shared implicit surface, including angular
lobes, centerline slope and taper. Clearance is 0.8 times its local first-order
distance estimate. It is **not an exact Euclidean signed-distance field**, and
the displayed number is a finite-particle collision-envelope estimate. There
are no separately authored interior collision hazards in this version.

The reusable rule is to export a geometry function or contract once, then test
its zero set and normals independently of the renderer. A triangle mesh still
approximates that analytic surface; geometric agreement does not make every
rendered triangle an exact collider.

## 3. Give articulation real mass without hiding propulsion in pose recovery

**Trigger:** pulling a ragdoll back toward an animated root can translate it
without any accounted external force.

**Before:** a kinematic root plus floppy limbs could have looked physical while
discarding the body's mass distribution.
**After:** fourteen particles carry normalized masses. Their mass-weighted COM
is the pilot position. The aerodynamic resultant produces the same
acceleration on each mass; active pose accelerations subtract their
mass-weighted mean before integration. Pose recovery therefore has zero net
linear force. COM conservation is checked with gravity and air disabled.

This is a precise, limited claim. Pose torques and the commanded lift frame
remain authored. The solver does not conserve angular momentum under its
active pose controller or solve distributed membrane pressures. A live mass
change is an external experiment, not a conservative physical event. GameLab
should preserve that distinction when combining animations and dynamic bodies.

## 4. Treat compliance and multiplier lifetime as solver contracts

**Trigger:** ordinary PBD stiffness changes when the iteration count or step
changes; a misplaced multiplier reset can silently invalidate XPBD behavior.

**Before:** a per-iteration stiffness blend could make quality controls change
physical material properties.
**After:** 24 distance/bracing constraints use five sequential iterations per
substep. `alphaTilde = compliance / h^2`; each constraint's accumulated lambda
resets at substep start and persists across that substep's iterations.

Keep render quality independent of integration settings. These are articulated
distance proxies, not anatomical ball joints, volumetric bodies or cloth. The
[original XPBD paper](https://mmacklin.com/xpbd.pdf) explains the compliant
constraint formulation; it does not validate this pilot's chosen parameters.

## 5. Record impacts before projection erases their evidence

**Trigger:** correcting particles back inside a wall before reconstructing
velocity could remove the incoming normal speed and suppress impact feedback.

**Before:** a safe projected endpoint could incorrectly imply that no impact
had occurred.
**After:** the predicted particle path is sampled before link projection;
first crossings are bisected. The incoming normal speed and contact normal
survive velocity reconstruction. Per-step peak impact is retained across
adaptive substeps and drives deduplicated impact events. Normal restitution
is 0.08; tangential friction is limited by a 0.25 coefficient times the normal
velocity impulse, rather than repeated arbitrary velocity decay.

The regression specimen strikes a wall at 240 m/s and requires an actual impact
event, a crash, finite contact velocities, and particles inside the collision
envelope. That is evidence for this bounded specimen, not a universal
continuous-collision guarantee. Integration limits nominal travel to 0.2 m per
substep and never exceeds 1/120 s per substep.

## 6. Score crossings by identity and preserve misses as first-class state

**Trigger:** checking whether a pilot overlaps a ring on one frame can miss a
fast crossing; coloring the first N rings from a passed count miscolors rings
after a missed gate.

**Before:** overlap checks and aggregate counts could disagree with what the
player saw.
**After:** every gate has a stable index. Its forward Z-plane crossing uses an
interpolated COM position; a 0.3 m margin defines a scoring hit. A consumed-index
set prevents repeated awards. `passedGates` and `gateOutcomes` retain individual
success and miss state independently of the bounded, consumable event queue.

Reset clears all of these collections. Near-wall bonuses deliberately have a
separate 1.8 s cooldown and can recur while wall-skimming; they are not covered
by the gate anti-repeat claim. Keep game state, transient messages and visual
status separate whenever a GameLab challenge has skipped objectives.

## 7. Make assistance explicit and let each manual channel take priority

**Trigger:** adding route guidance to an active stick command made manual
control feel inconsistent and contaminated comparative flight experiments.

**Before:** guidance and player input could add together on the same axis.
**After:** manual bank or pitch magnitude above 0.05 suppresses guidance on
that individual axis. The coach looks 75 m ahead and commands bounded bank and
angle of attack. It never sets COM position, adds forward thrust, or directly
corrects translational velocity. Offset gates remain the player's challenge.

Tests compare assisted and unassisted simulations under active manual bank and
pitch and require equal trajectories. Display and export the coach setting;
disable it for uncontrolled force comparisons. This controller is an authored
flight aid, not a real pilot model or an aerodynamic stability analysis.

## 8. Account for overload instead of feeding a long frame into physics

**Trigger:** a stalled render frame could otherwise become one large unstable
integration step or an unbounded catchup loop.

**Before:** wall-clock time and simulation time could appear interchangeable.
**After:** `FixedClock` issues 120 Hz outer ticks, runs at most eight per render
frame, and records excess discarded time. Sustained rendering overload slows
simulation time. The HUD exposes dropped time. Pause and hidden-tab handling
release controls and reset the accumulator; visual interpolation does not
alter authoritative physics, CSV samples or snapshots.

GameLab can reuse this explicit overload policy. An observed RAF rate is a
presentation observation; CPU submission duration is not GPU completion time.
Neither should be labelled a portable performance guarantee.

## 9. Export provenance and scope with the portable scene

**Trigger:** an X3D document containing rigid-body nodes might be mistaken for
a portable replay of the custom flight solver.

**Before:** an attractive static export could imply more behavioral portability
than it actually possessed.
**After:** `chasm-x3d-snapshot/1` records settings and distance-constraint data in
metadata. Its X3D 4.0 Full document contains sampled cavern geometry, named gate
rings, a pilot illustration and a **disabled** rigid-body snapshot with mass,
position and velocity. Native coincident-anchor joints do not stand in for
custom XPBD distance constraints. This is separate from GameLab's 2.5D slice
contract; it adds no arbitrary X3D importer.

`chasm-settings/1` is a bounded 8 KiB settings contract, with recognized numeric
fields, a boolean coach setting and known presentation enums. Validation
precedes application. A settings file is not a checkpoint or exact replay.
The snapshot is not a claim that native X3D runtimes execute CHASM's controls,
wind, muscle torques, contact model or game rules. See [X3D-CONTRACT.md](X3D-CONTRACT.md).

## 10. Attach each validation result to the claim it can actually support

**Trigger:** analytic equations, a green headless suite, a schema-valid snapshot
and an attractive browser render each answer different questions.

**Before:** those results could be summarized too broadly as physical or
performance validation.
**After:** unit and route tests establish specific numerical and state
contracts. Schema and implemented semantic validation establish a document's
checked structure. Browser checks establish observed interaction/rendering
behavior in that environment. None establishes a measured real wingsuit polar,
real cavern airflow, physiological injury behavior, cross-engine bitwise
identity, or general GPU frame rate. There is no CFD or native-X3D-flight-runtime
claim.

NASA's [lift](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-equation/),
[drag](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/)
and [induced-drag](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/modern-drag-equation/)
references support the equation structure and need for measured coefficients.
CHASM's numerical coefficient choices are explicitly separate from those
sources. The constructed CL = .55 / CD = .2126 equilibrium at 39.08 m/s is a force-balance
oracle, not a measured-suit validation or a training recommendation.

## Checked control envelope

The UI sliders and `io.js` settings validator admit these ranges. Two combined
corner specimens use the exact endpoints below, run for up to eight simulated
seconds, and check finite state, bounded speed and containment. This samples
the envelope; it does not exhaust every combination or every duration.

| Variable | Admitted range | Corner A | Corner B |
|---|---:|---:|---:|
| Pilot and equipment mass, kg |60–120|60|120|
| Reference suit area, m² |1.2–2.2|1.2|2.2|
| Air density, kg/m³ |0.6–1.4|0.6|1.4|
| Gravity, m/s² |1–15|15|1|
| Mean wind, m/s |0–25|25|25|
| Wind direction, degrees |0–360|360|0|
| Gust amplitude, m/s |0–8|8|8|
| Lift scale |0.5–1.5|0.5|1.5|
| Drag scale |0.5–1.5|1.5|0.5|
| Joint compliance, m/N |0–0.002|0.002|0|

The force-isolation tests also deliberately disable gravity or air outside
the UI range. Those are solver probes, not imported user settings.

## Physics test inventory

Run `node --test cavern/test/physics.test.mjs` from the repository root. All 12
tests passed after the endpoint-envelope update. Runtime is a local CPU test
observation and is not a GPU FPS measurement.

1. `aerodynamic forces scale with dynamic pressure and oppose relative flow`
2. `zero air density yields ballistic COM with no hidden propulsion`
3. `XPBD internal pose and link forces preserve COM momentum without external force`
4. `fixed input sequence is deterministic and reset clears run events`
5. `high speed swept wall contact stays finite and inside the collision shell`
6. `swept gate crossing awards once, and reversing cannot farm the same gate`
7. `still air coefficients predict a finite plausible uncalibrated trim oracle`
8. `manual bank and pitch override their individual assistance channels`
9. `combined extreme control settings remain finite within the advertised envelope`
10. `calm guided flight completes the entire route with gates and no impact`
11. `shared natural wall stays bounded and its exact points match collision zero`
12. `wall gradient matches numerical surface gradient through blends and lobes`

## Bounded next priorities

| Priority | Bounded next experiment | Evidence required before expanding the claim |
|---|---|---|
| Measured polar |Fit one licensed or published suit/posture dataset, retaining reference area and test conditions.|Measured CL/CD versus angle/posture, uncertainty and held-out error; reconcile Reynolds number and body configuration.|
| Distributed loads |Apply low-order loads to the two arm wings, leg wing and torso, with explicit moments.|Compare total force with the current model; audit force/torque balance and timestep convergence before adding a six-DOF claim.|
| Richer joints |Add shoulder/hip angular limits and a small set of capsule proxies to one rig.|Tests for limits, recovery, contact stability and measured CPU cost; preserve transparent mass and inertia assumptions.|
| Cavern branches |Build one authored fork with a shared collision/render/export representation and stable gate IDs.|Continuous collision behavior at the junction, bounded spatial queries and route-state tests. The present radial field cannot represent a true fork.|

These are research and implementation gates, not promised accuracy upgrades.
Real-world flight preparation requires validated data and specialist methods
outside this entertainment and visualization prototype.
