# CHASM · Wingsuit Observatory

A separate 3D GameLab experiment: an orange squirrel suit, an articulated pilot,
2.4 km of descending natural and virtual cavern, fifteen gates, close encounters,
and an inspectable aerodynamic model. It uses the repository's pinned Three.js
bridge and X3D transparency principles. Flop Lab remains a separate application.

## Play

The delivery also includes **CHASM-Wingsuit-Observatory.html**. Download it and
open it directly in a modern browser: all code, renderer, styles and the field
guide are embedded, so that edition requires no server or network access.

From the complete checkout or delivery archive, run `cavern/run.bat` on Windows
or `bash cavern/run.sh` in WSL/Linux. Python 3.10+ is sufficient; Python 3.13+
also works. Or run:

```sh
python3 cavern/serve.py --open
```

Open **http://127.0.0.1:8842/cavern/** and choose **Begin descent**. Keep the
terminal open. `--port 8850` changes the port. No install, CDN, network assets,
account, API key or model download is required for play. Double-clicking
`index.html` via `file://` is unsupported because browsers restrict ES modules.
Use a WebGL 2 browser with hardware acceleration.

| Action | Input |
|---|---|
| Bank | A / D or left / right |
| Dive / flare | W / S or up / down; Space also flares |
| Go limp / recover pose | F |
| Pause / resume | P or Escape |
| Restart at entrance | R |
| Chase / helmet / witness camera | C |
| Flight laboratory | L or Flight lab button |

Touch buttons appear on coarse-pointer devices. Reduced motion is honored and
can be changed with Comfort view. Audio is synthesized and starts off.
Keyboard flight commands do not change focused sliders or selects.
Losing browser focus pauses flight and releases controls.

**Route coach starts on.** It gives bounded bank and pitch guidance toward the
corridor center; manual input overrides the corresponding channel. It does not
teleport the pilot, supply thrust or guarantee every gate. Watch guided flight
uses this same controller. Turn the coach off in Flight lab for direct control.
All scores are local toy scores, with no leaderboard. Wind/physics changes mark
an active run as an experiment. A severe impact ends the run with a rescue card;
lighter contacts continue. R starts again immediately. The exit is a luminous
course finish, not a simulated parachute deployment or landing.

## Tinker and learn

The live lab exposes mean wind 0–25 m/s, wind direction, gusts 0–8 m/s, total
mass 60–120 kg, reference area 1.2–2.2 m², density 0.6–1.4 kg/m³, gravity,
lift/drag scales and effective joint compliance. 0° wind travels toward +Z
(tailwind); 90° travels toward +X. The calm/crosswind/gust presets change wind
only. Presentation controls change no simulation state.

Read [the illustrated field guide](docs/FIELD-GUIDE.html) for six experiments,
equations and primary sources. [PHYSICS.md](docs/PHYSICS.md) states exact model
boundaries. [FOLDBACK.md](docs/FOLDBACK.md) records transferable GameLab lessons.
[VALIDATION.md](docs/VALIDATION.md) separates executed evidence from limitations.

## Inspect and export

- **X3D scene** exports the full static cave, gates, articulated pose,
  disabled particle bodies, and declared solver/settings metadata. A checked
  example is [CHASM-snapshot.x3d](docs/CHASM-snapshot.x3d).
- **Telemetry CSV** samples at approximately 10 Hz, capped at 20,000 records.
  SI units and live physical settings accompany each row. This is a trajectory
  record, not a complete replay; input history and internal state are absent.
- **Save/load settings** uses a strict 8 KiB `chasm-settings/1` JSON contract;
  unknown fields or invalid values reject the entire candidate before applying.
- **Joint & flight vectors** shows actual particle links and force/velocity
  directions. Diagnostic counters are CPU measurements, not GPU timings.

This is a custom JavaScript flight engine drawn through Three.js. Native X3D
consumers can inspect the snapshot; they do not automatically reproduce the
flight. The old Flop Lab X3D importer does not accept this new 3D snapshot.
See [X3D-CONTRACT.md](docs/X3D-CONTRACT.md).

## Architecture and checks

| Module | Owns |
|---|---|
| `src/physics.js` | Course, prescribed wind, flight forces, coupled particle rig, contacts, scoring |
| `src/clock.js` | 120 Hz outer ticks, eight-tick catch-up cap, discarded wall-time accounting |
| `src/view.js` | Bounded tunnel streaming, articulated suit, dust, bloom, cameras, quality |
| `src/io.js` | Validated settings, static X3D serialization, SI telemetry |
| `src/app.js` | Input, experiment controls, run/pause lifecycle, interpolation, downloads |

```sh
npm run test:cavern
python3 cavern/serve.py --check
python3 cavern/test/browser.py --browser /path/to/chrome-headless-shell
python3 tools/validate_levels.py cavern/docs/CHASM-snapshot.x3d --output cavern/docs/x3d-validation.json
```

The browser harness needs Python Playwright in the development environment,
but the game does not. `npm test` includes these new pure Node checks as well as
the inherited suites. The X3D validator uses the already pinned local x3d_mcp
subset. No new runtime dependencies are added. Third-party notices and the
Three.js license remain in the parent checkout/complete archive.

Create the self-contained edition with Node built-ins only:

```sh
node cavern/tools/build-standalone.mjs /path/to/CHASM-Wingsuit-Observatory.html
```

The builder embeds the pinned ES-module closure as import-mapped data modules
and includes Three's license. It does not fetch or install packages.

The coefficient polar, stall transition, active body orientation and contacts
are simplified and uncalibrated. This is an educational game, not a validated
wingsuit model or real-world flight-planning tool.
