# Flight model and computational tradeoffs

Coordinates are metres: +X right, +Y up, +Z along the course. Time is seconds;
mass includes pilot and gear in kilograms. Wind is a **velocity toward** the
given direction: 0° = +Z, 90° = +X. It is not meteorological wind-from notation.

## External forces

At the mass-weighted center of the articulated body:

```
u = v - wind(position, time)
q = 0.5 rho dot(u,u)
L = q area CL
D = q area CD
liftDirection = normalize(up - dot(up, normalize(u)) normalize(u))
F = L liftDirection - D normalize(u)
a = F/mass + [0,-g,0]
```

Degenerate zero-speed and zero lift-direction cases produce zero corresponding
force. The resultant is distributed as the same acceleration to every particle.
There is no forward thrust or position correction from the route coach.

The suit orientation follows the relative-velocity heading and flight-path
angle, plus a commanded angle of attack of `0.13 + pitchInput*0.15` radians.
Bank relaxes toward `bankInput*1.05` with a 4/s response rate. These are control
surrogates, **not a simulated six-degree-of-freedom aerodynamic moment model**.
The orientation command also supplies the active ragdoll pose target.

```
alpha = atan2(-dot(uHat,up), dot(uHat,forward))
b = clamp((abs(alpha)-0.30)/0.18, 0, 1)
CLattached = clamp(0.19 + 2.8 alpha, -1.1, 1.1)
CLstall = 0.65 sin(2 alpha)
CL = mix(CLattached, CLstall, b) * liftScale
CD = (0.14 + 0.24 CL^2 + 0.55 b) * dragScale
```

Limp mode multiplies CL by 0.12 and adds 0.7 inside CD's scaled bracket. This is
an authored loss of lifting posture, not a fabric-pressure solution. The normal
pitch range reaches the beginning of stall; unusual orientations can enter the
full blend. No real suit data establishes these constants.

Defaults are mass 90, area 1.6, rho 1.225, g 9.80665, calm wind, unit scales.
With constant CL=.55, CD=.2126, the analytic equilibrium is speed 39.08 m/s,
sink about14.1 m/s and L/D about2.59. The test verifies force balance at this
constructed equilibrium. It does not claim measured suit validation.

NASA's [lift](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-equation/),
[drag](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/),
and [induced drag](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/modern-drag-equation/)
pages support the equations' structure and explain the need for experimental
coefficients. The source's chosen coefficients are separate from those sources.

## Articulation

Fourteen finite-radius particles carry normalized anatomical mass fractions;
24 XPBD distance constraints connect them. The rig has five sequential solver
iterations per adaptive substep. Each accumulated constraint multiplier resets
at substep start and is retained across its iterations:

```
alphaTilde = compliance / h^2
deltaLambda = (-C - alphaTilde*lambda) / (invMassA + invMassB + alphaTilde)
```

Active pose accelerations are spring/damping forces toward the commanded suit
pose. Their mass-weighted mean is removed, preserving net linear momentum.
This does not assert angular-momentum conservation: the active pose controller
can impart torque. Limp mode removes pose stiffness and retains mild relative
damping. There are no anatomical angular limits, self-collision, body volumes,
distributed membrane airloads, or fabric constraints. Rendered wings follow
joint positions and have no additional independent mass or lift.

The visible harness connects the suit to the torso. It is not a bungee/tether
to the cave. Physics changes to mass reweight particles in place and therefore
constitute an external experimental intervention, not a conservative event.

Reference: [Macklin, Müller & Chentanez, XPBD (2016)](https://mmacklin.com/xpbd.pdf).

## Contacts and course

The course is a slowly varying elliptical frame along Z with smooth angular
harmonics supplying natural wall lobes, bounded to ±9% of its radial scale.
The virtual region is elliptical, with a smooth 120 m transition outside each
boundary. The renderer and exporter use the same `wallPoint(z, angle)` function
as the collision field. Texture, emissive fissures and wall-mounted mineral
tips add detail. There are no unmodeled interior obstacles. The conservative
clearance field is 0.8 times a first-order implicit-field distance estimate,
with an analytic gradient through lobes, taper and slope. It is not an exact
signed Euclidean distance. Displayed wall clearance refers to this collision
envelope, not distance to every rendered triangle.

Adaptive integration limits nominal travel to0.2m/substep, never using more than
1/120s per substep. Swept particle paths sample that field and bisect first
contact. Contacts are retained before constraint projection so impact speeds
survive velocity reconstruction. Low restitution (.08) and impulse-limited
tangential friction (.25 coefficient) give a forgiving contact response. This
is a bounded game contact model; the test at240m/s is a specific specimen, not
a universal continuous-collision guarantee.

Normal impacts above2m/s emit a deduplicated event with0.7s cooldown; above32m/s
end the run. Each gate's forward plane crossing is evaluated once at interpolated
COM crossing position. A0.3m ring margin defines a score hit. Scoring clearance
bonuses use a1.8s cooldown and can repeat while wall-skimming; this is intentional
local gameplay rather than an anti-farming claim. Reaching Z=2400 ends the course.

## Timing and assistance

Outer fixed ticks are120Hz. The clock catches up at most eight outer ticks per
render frame, then records and discards excess wall time. The simulation slows
under sustained rendering overload rather than increasing its integration step.
Paused/hidden tabs release controls and reset the time accumulator. Pose rendering
interpolates the last two physical particle positions; CSV and exports use the
authoritative state. Renderer settings never change solver step or constants.

The optional route coach looks75m ahead, commands a bounded target lateral
velocity, and chooses bank/pitch corrections. A manually active axis overrides
that axis. This controller changes the flight response and must be disabled for
uncontrolled comparative experiments. It can miss offset gates. It never
sets position, corrects velocity directly, or generates an engine force.

Wind is a smooth deterministic sum of spatial/time sine functions, not a
turbulence spectrum or solution of cavern airflow. Repeated fixed inputs on
the same JS runtime reproduce state; cross-engine bitwise identity is unproven.
