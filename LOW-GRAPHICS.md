# Older-device graphics mode

Branch: `feat/low-graphics-mode`.

## Player settings

Open **Graphics** on the title card and choose **Low · older devices** before
pressing **Let's farm!**. This is the
recommended starting point for an iPad 6th generation or an older 4 GB laptop.
The choice is saved on that browser and does not change farming features,
inventory, rewards, or the Simple/Full Farm setting.

Settings also offers graphics quality changes. Use **Save game & reload
graphics** to apply them. Reload is blocked if saving fails, including an
offline browser whose local storage is unavailable/full.

| Setting | Low | Balanced | High |
| --- | --- | --- | --- |
| Target FPS | 30 | 30 | 60 |
| Maximum pixel ratio | 1 | 1 | 1.5 |
| Maximum rendering pixels | 1 million | 1.6 million | 3 million |
| Dynamic shadows / antialiasing | Off | Off | On |
| Field/scenery lighting | Lambert | Lambert | Standard |
| Soil tiles | Flat | Flat | Boxes |
| Farm culling distance | 280 | 350 | 440 |

Auto starts conservatively on mobile/tablet browsers (including iPad's
desktop-identifying user agent), devices reporting 4 GB memory or less,
four or fewer CPU threads, and data-saver devices. Hardware hints are not
benchmarks: a manual Low override is always available. Reduced-motion users
also get a 30 FPS cap.

Adaptive resolution observes actual rendered-frame intervals as well as CPU
submission time. It lowers resolution after sustained overload and recovers
one step at a time after sustained headroom. Pixel caps are recalculated on
resize. Text and controls retain their CSS resolution.

## Rendering and CPU changes

- Crop instances are densely packed by visible box, with no zero-scale padding
  or historical high-water draw count. Harvested stubble is preserved as one
  box per tile; tilling removes it entirely.
- Crop buffers start at 32 instances per field and grow on demand, releasing
  replaced GPU buffers. Field geometry/materials are shared.
- Field meshes use conservative fixed bounds for camera-frustum culling.
  Farm distance culling now matches each profile's fog distance.
- Road markings and trees are instanced in spatial batches.
- Contextual controls update at 10 Hz; unchanged labels/styles avoid DOM writes.
- Slow farm systems update at 5 Hz in Low and 10 Hz otherwise, using elapsed
  time and time-weighted vehicle usage. Input/movement still update each frame.
- Decorative animation is throttled, invisible remote character animation is
  skipped, and crop scans are staggered across farms instead of synchronized.
- Implement work searches only the touched grid rectangle, with the original
  rotated-bar and inventory-capacity checks retained.
- Dirty terrain chunks are coalesced and processed one chunk per frame per
  terrain renderer. The time budget cannot interrupt an individual chunk;
  further meshing optimization may still be needed on very slow CPUs.
- No world or Three.js allocation occurs until a valid login submission or
  the returning farmer's **Let's farm!** action. The title screen uses only
  HTML/CSS scenery and self-hosted fonts; it has no animated 3D backdrop.

## Build and compatibility

Field saves now losslessly run-length-pack repeated states, timers, crop and
fertilizer codes, soil fertility, and rotation history. Existing array/string
saves remain readable; varied data keeps its original shape if packing would
make it larger. This fixes fresh ten-farm snapshots exceeding the Worker's
existing 512 KiB limit. A browser-tested snapshot dropped from a 903,198-byte
legacy-equivalent state to 26,958 bytes, with HTTP 200 autosave and successful
reload. This is not an unlimited save budget; exceptionally varied worlds or
large structure/terrain histories can still reach the existing limit.

```
npm ci
npm run build
npm test
npm run dev
```

Development/deployment scripts build first. The generated `game/dist/` files
are ignored by git; GitHub deployment uses the build-aware deployment script.
After editing frontend source during a running dev session, run
`npm run build` and refresh (the bundle is not currently watched).

The game bundles the existing Three.js 0.160.0 locally rather than loading it
from unpkg through native import maps. The small bootstrap defers the large
game chunk until the player chooses quality. The build targets Safari 15 and
Chrome/Firefox 90 syntax; this is not a guarantee that every browser API or
every older GPU works. Use updated iPadOS 17 on iPad 6 where possible.
WebGL 1 with ANGLE instancing or WebGL 2 is required. Unsupported contexts get
a readable loading error. Three.js was deliberately not upgraded to a newer,
WebGL-2-only release.

## Verification and remaining work

Node tests exercise actual Three.js instance buffers without a GPU, including
packing/removal, growth, save restoration, conservative bounds, flat tile
geometry, rotated implement coverage, resolution budgets, frame pacing,
GPU-like missed targets, quality persistence, and deferred chunk rebuilding.

For 40 empty base fields, reserved crop matrix/color arrays now total
**97,280 bytes**, versus **19,261,440 bytes** previously (about 99.5% less).
These are CPU-side instance-array bytes, not total browser/GPU memory.
Low soil tiles use 2 triangles instead of 12 per tile. Both are structural
measurements, not claimed device FPS improvements.

Local Chromium smoke testing at 1024 × 768 with WebGL 2 deliberately disabled
verified WebGL 1 startup, Low selection, offline play, a planted farm growing
its instance buffers, and nonblank rendering without runtime errors. FPS on
that development machine is not evidence of iPad/Vizio performance.

Open `/?perf` to expose `window.__THREE_GAME_DIAGNOSTICS__`, including renderer
draw/triangle/resource counts, selected profile, current pixel ratio, canvas
dimensions, and crop-buffer totals. It is absent without the query parameter.

Before declaring hardware support, test on the actual iPad/Vizio:

1. Empty, planted, harvested, and re-tilled fields at the same camera position.
2. Driving, neighboring farms, terrain edits, autosaves, and multiplayer.
3. Rotation, background/resume, and touch input release/cancel.
4. A 30-minute session for heat-related slowdown and memory growth.
5. Compare frame-time percentiles, not just the FPS badge.

Fully lazy-loading distant farm visuals, crop LOD, background save
serialization, greedy terrain meshing, and real-device measurements remain
follow-up work. The current implementation keeps world data and field tiles
resident to avoid changing save and cross-farm behavior.
