# Executed validation · 17 November 2026

Base: `hagopjay/x3d.gamelab` main,
`e93e3db3d9b67dfaee1c626ee21efe86fd23d8d7`.
This is integration evidence from one host. No hardware-GPU frame-rate or
real-suit aerodynamic validation is claimed.

| Check | Observed result |
|---|---|
| `npm test` | Exit0;154 inherited PASS lines and16 new Node tests passed |
| New force tests | Dynamic-pressure scaling; lift orthogonality; drag opposition; common wind/velocity shift invariance |
| New conservation tests | Zero-density ballistic COM; internal-pose/link net linear momentum |
| New trajectory tests | Determinism/reset, exact UI endpoint combinations, whole guided course finishes without impacts |
| New contact/geometry tests |240m/s wall specimen reports impact/crash and stays finite/inside; shared wall zero and gradients; swept gates credited once |
| New clock/I/O tests |60/144Hz schedules give identical120Hz state; eight-tick overload cap counts discarded time; strict settings; deterministic finite X3D; time-varying parameter CSV |
| `node build.mjs` | Existing Flop Lab index remains byte-identical to base |
| `python3 cavern/serve.py --check` | Bundled runtime closure present |
| Actual pinned x3d_mcp XSD+semantic checks | Checked snapshot passes4.0 schema and implemented semantic rules; both negative-control twins caught |
| Real browser at `/x3d.gamelab/cavern/` |20 checks passed, zero page/console errors and zero HTTP failures |
|390px coarse-pointer browser | No horizontal overflow; touch buttons visible; lab remains inside viewport |
| Standalone HTML via `file://` |17 embedded modules; actual scene renders and flight advances; guide modal opens; zero external HTTP requests/errors |

Raw evidence: `node-validation.log`, `browser-validation.json`,
`standalone-validation.json`, `x3d-validation.json` and the checked
`CHASM-snapshot.x3d`. Browser inspection screenshots were used locally; they
are not runtime dependencies or packaged release assets.

## Browser coverage

Headless Chromium153.0.8010.0 (serverless headless shell), SwiftShader, one
Linux host. Normal desktop Chromium's process-singleton Unix socket was
restricted in this environment; a headless-shell distribution supplied via the
standard npm registry was used for these tests. This browser is development
tooling and is not shipped with the game.

The functional harness drives real UI controls: start, pause, wind endpoint,
coach checkbox, close-lab focus, limp/recover from button focus, keyboard resume,
three cameras, settings/X3D/CSV downloads, virtual region, high quality, and
phone-sized touch layout. The virtual region uses an explicit fixed-step model
fast-forward while paused; it is not a minute-long real-time traversal test.
The whole-course physics test runs separately in Node.

The final standalone edition was also inspected after the natural-wall smooth
normal and lighting refinements. Its gate glow, articulated orange suit,
harness contrast, typography and natural-wall shading were visible.

The recorded short browser interval observed approximately0.35ms CPU per outer
physics tick. That value varies with host, workload, adaptive substeps and
instrumentation. Software rendering caused recorded discarded wall time.
Draw counts, render submission time and observed requestAnimationFrame rate
are not GPU timings and establish no60FPS hardware target.

## Material limits

- No Firefox, Safari/WebKit, real phone, gamepad, VR or real desktop GPU test.
- No measured suit polar, flight-test comparison, wind-tunnel data, fabric/CFD
  simulation, anatomical injury/limits, angular momentum guarantee for active
  pose motors, or full6DoF aerodynamic-moment simulation.
- The conservative implicit collision field and sampled display surface are
  related approximations; the field is not an exact signed-distance function.
- Coefficient/compliance sliders span illustrative experiment ranges. Two
  combined extreme corners and selected trajectories are checked; every
  possible sustained input/parameter history is not exhaustively proven.
- X3D is a static declared export contract, with disabled body proxies and
  custom constraint metadata. Native X3D flight equivalence and cross-viewer
  pixel parity remain unverified.
- CSV retains sampled physical parameters but lacks a complete control and
  solver-state history. It is not a resumable checkpoint or a certified replay.
- Scores and coach behavior are authored local game design. There is no
  competitive validation, anti-cheat, human playtest or difficulty calibration.
- A GitHub patch and PR text are prepared. No remote branch or PR is published:
  the workspace has no GitHub authentication.
