# Optional crop care

Crops mature naturally: **plant → growing → ready**. No spray or fertilizer is
required, including crops saved in the old growing stage. Weather and irrigation
still affect growth, and existing flood/frost hazards remain unchanged.

- **Fertilizer:** optional. Reduces each remaining growth stage's duration by 40%.
- **Weeds:** randomly appear in small crop patches and slow growth by 25%.
- **Bugs:** visible voxel insects fly above affected crop patches and slow growth by 30%.
  Every five simulation seconds, a patch has a chance to spread to one adjacent crop,
  stay local, or die out. It does not always spread, and there is no same-tick cascade.
- **Both problems:** growth continues at 45% of the normal rate; crops remain harvestable.
- **Crop spray:** drive the sprayer across affected tiles. One supply unit clears both
  problems on one affected tile and grants 45 seconds of protection. Healthy crops do
  not consume spray, and treatment never resets growth progress or ripe crop state.

The HUD shows affected weed/bug tile counts. Problems are local to the player's farm,
bounded to small patches, and saved with their random-generator state and temporary
protection so reloads do not reroll outbreaks. Harvesting, tilling, and crop destruction
clear the affected tile's problems. Sale prices and grain quantity are unchanged.

Rendering is capped at 96 weed tiles and 32 nearby bug patches (three insects per patch),
using three instanced meshes, rather than separate draw calls for every insect.

Tests run with `npm test`. They cover natural growth for every crop, old-save migration,
fertilizer acceleration, optional spray, slower-but-unblocked untreated crops, spread /
no spread / recovery, protection expiry, deterministic persistence, and visual budgets.

## Verification

- 63 automated tests pass; `wrangler deploy --dry-run` and `git diff --check` pass.
- Local browser test: wheat reached the ready stage with an empty inventory, no
  fertilizer, and no spray used, including under the existing slow-growth flood conditions.
- Desktop and mobile screenshots show flying insect swarms and weeds over affected
  crop patches. Driving the tractor sprayer through a mixed weed/bug patch cleared
  the problems, consumed supplies only for affected tiles, retained ripe crops, and
  left temporary protection on the treated tiles. No page or console errors observed.
- A ten-farm snapshot with active crop problems was approximately 395 KB, below the
  existing 512 KiB save limit. Sparse records avoid allocating full extra tile arrays
  in the saved JSON for every empty field.
- References followed: `gameplay-workflows.md` and `physics-engine-selection.md`.
  Existing vehicle physics and proximity rules were retained; no dependencies added.
