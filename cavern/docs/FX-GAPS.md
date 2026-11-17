# CHASM 2.0 · FX and gameplay gaps (logged, not fixed)

Standing rule for this lane: no pixel perfection, maximum visual intensity, log
the gaps for later receipts. Grades: **Confirmed** (seen or measured),
**Likely**, **Suspected**.

| # | Gap | Grade | Note |
|---|---|---|---|
| 1 | Never played by a human on a real GPU; every still is SwiftShader | Confirmed | Feel, speed blur strength and shake need a pad test |
| 2 | Medal lines tuned against the bot only | Confirmed | The coach ignores embers; a human may find Gold too easy or too hard |
| 3 | Headlamp and point lights light through rock (no shadows) | Confirmed | Columns do not occlude the lamp pool |
| 4 | Thermals are prescribed wind columns, not convection | Confirmed | By design; documented in metadata and X3D |
| 5 | Embers use COM distance, not limb contact | Confirmed | A wingtip through an ember does not collect it |
| 6 | Light-bars and columns are static | Confirmed | Moving hazards need a time-dependent collision field |
| 7 | Vapor ribbons fade within 4–16 m of the camera to avoid screen smears | Confirmed | Close fly-bys hide the newest ribbon segment |
| 8 | The grade pass radial blur is screen-space, not motion vectors | Confirmed | Fine at 40 m/s; at the edges it smears HUD-free pixels only |
| 9 | Low quality skips the composer: no bloom, no grade, no blur | Confirmed | Economy mode is for phones |
| 10 | SFX are oscillator sketches; never listened to | Confirmed | Sound stays opt-in |
| 11 | Bioluminescent vein texture repeats visibly on long straight walls | Likely | One 512² mask with UV repeat 0.16 × 0.2 |
| 12 | Ghost stores a 10 Hz path in localStorage; long runs approach ~30 KB | Likely | Not a replay; inputs not recorded |
| 13 | Gamepad mapping assumes the standard layout | Suspected | Untested on any physical pad |
| 14 | Flop Lab root page shows one 404 in `npm run test:pages` here | Confirmed | Also on clean main e93e3db in this environment; not touched by CHASM |
