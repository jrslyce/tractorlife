# Minecraft-style basics: gathering, inventory, and building

## Goal

Add a satisfying on-foot loop to the existing farming game:

**Aim at something → punch, chop, or dig it → collect its material into inventory → select that material → place it back into the world.**

The first release should let a player dig an actual hole, collect dirt, chop a tree for usable wood, build a small structure, reclaim its blocks, and reload without losing those changes. Keep the game's existing visual style, farming, vehicles, and touch support.

This document contains the implementation plan and a progress record. Suggested module boundaries and dependencies below support later task breakdown. Planned behavior remains a proposal unless marked implemented in the progress record.

## Implementation progress — first wood gathering slice

Started with three subagents working on inventory/resource rules, woodland harvesting, and builder reclaiming, followed by shared integration and review.

Implemented locally:

- `resource-rules.js` defines material drops and tool timing; `world-interaction.js` owns cancellable, single-completion held actions.
- `harvest-controls.js` connects actual scene targeting, four-unit reach, obstruction checks, progress, target outline, arm motion, completion sound, and desktop/touch action controls.
- On-foot left hold punches a harvestable grove tree; selecting an axe shortens harvesting from five seconds to 1.5 seconds. Completion awards three wood and leaves the existing stump lifecycle. Decorative scenery trees are not yet harvestable.
- Inventory has validated `addItem()` and capacity checking while keeping `buy()` compatible. Full inventory leaves the world untouched. Restored tool icons are recovered from the item catalog.
- Build mode places collected wood, with reach, occupancy, player/vehicle overlap, protected field/pad, and line-of-sight checks. Right hold or the explicit Break action reclaims one wood per block. Runtime target identities prevent duplicate completion on replaced blocks.
- Build aim starts angled toward reachable ground. Mouse wheel or Aim arrows adjust vertical aim. Touch gathering uses a lower visible aiming marker and separate action buttons.
- The existing snapshot saves woodland, inventory, and structures together. The axe is available in the shop; dirt/shovel/pickaxe definitions are staged but hidden from sale until terrain actions exist.
- Existing crop/cargo dispatch keeps priority where appropriate. No-target desktop drags still reach movement controls, and selected seeds/fertilizer retain touch placement.

Verification completed:

- All **93 automated tests passed**, including the existing farming suite and new inventory, held-action, woodland-harvest, and builder tests. Syntax and whitespace checks passed.
- Local browser with an isolated offline save: actual mouse hold chopped a tree and granted three wood; saved state included the matching stump and inventory.
- Repositioned that test save into the build yard, retaining its earned inventory: placement changed wood from 3 to 2; reload restored one wood structure and two inventory units; timed reclaim returned inventory to 3.
- Full nine-slot inventory with no wood stack: the browser reported `Inventory full`, gave no wood, and left the target available to chop.
- Explicit Place-button interaction and tablet-sized layout were checked. This is not physical-tablet or native touch endurance verification.

Next milestone and remaining limits:

1. Define the terrain grid/save fixture and build the bounded editable ground volume, real digging, exposed-face rendering, and terrain/block character collision. Dirt placement, stone mining, and climbing placed blocks are not implemented by this slice.
2. Finish terrain migration, safe spawning, vehicle exclusion, and material effects. The wood slice has basic feedback but no harvesting particle burst yet.
3. Add authenticated operation/revision handling and remote removal/terrain updates. Current realtime building is additive; visitors can retain a reclaimed block until scene refresh. Axe gifting is not yet added to the server gift catalog. No multiplayer consistency or server-authoritative harvesting claim is made.
4. Exercise native touch on a physical tablet, complete the farming/cargo/gift interactive regressions, and measure sustained performance.

No commit, push, or deployment was performed. The pre-existing crop-care work was preserved.

## Implementation progress — terrain foundation in progress

### Current implementation status (local working tree)

The previously isolated terrain pieces are now integrated into the game and Worker paths:

- `main.js` creates bounded per-farm terrain, renders it, saves/restores it, wires terrain hit targets to held actions, applies character collision, and prevents vehicles from entering terrain patches. The patch perimeter and bedrock are protected; the legacy ground and active yard pad are cut out so excavations can be visible.
- Dirt/grass gathering, pickaxe-gated stone mining, dirt/stone placement, inventory transactions, placement previews, and actor/structure/tree overlap checks are connected. Shovel and pickaxe are available in the shop.
- Online terrain edits use authenticated `/api/terrain/edit`, per-owner Durable Object state, operation IDs, expected revisions, server-side bounds/tool/inventory/support validation, and post-commit realtime broadcasts. Save writes preserve canonical terrain state. Remote farm-state responses and realtime updates include terrain, including removals; revision gaps trigger a state refresh.
- Touch fixes cover action dock constraints, orientation resize, brake-over-gas precedence, and suppressing accidental joystick world clicks.
- A cursor-following desktop crosshair now tracks the live target, centers in build mode, and turns green for valid targets; touch keeps its centered aim marker. A small compass objective HUD tracks nearby discoveries.
- Farm owners can buy one clearly marked 30×24 crop plot for $250. It is inside the farm boundary, blocks purchase when structures overlap, joins crop simulation/save/restore, and is forwarded to remote farm views.
- The terrain patch now has three low, walkable hills and a shallow valley with matching client/Worker generation. The expansion plot remains flat and protected from digging; flat-generation saves migrate their sparse edits to the new terrain generation.
- Exploration adds two landmark goals and three one-time supply caches. Cache rewards use inventory capacity rules, discoveries are saved per player, and all locations stay within world movement bounds.
- Worker and pure-module tests cover authenticated owner derivation, committed broadcasts, idempotency, revisions, bounds, tool/inventory rules, save preservation, and remote terrain overlay.

**Verification:** `npm test` passes **134 tests**; syntax checks, Worker packaging dry-run, and `git diff --check` pass. An authenticated local Worker/browser smoke test confirmed login, terrain-state reads, a committed grass break with a dirt reward, revision persistence, and rendering of the crosshair/objective HUD around 50–60 FPS. A resized phone viewport confirms the canvas tracks the new dimensions. Detailed mouse/touch digging, field-purchase playthrough, two-client realtime, native tablet, old-save full playthrough, and sustained performance remain unverified. No commit, PR, push, merge, or deployment has yet been performed; related crop-care and wood-slice work is included on branch `mc`.

The terrain state and presentation pieces are implemented locally; integration research is complete:

- **Terrain state and tests:** `game/js/terrain.js` defines versioned deterministic bounded dirt/stone cells, explicit air overrides, atomic break/place rules, exposed-face queries, chunk keys, and validated save/restore. Its 6 targeted tests pass.
- **Terrain presentation:** `game/js/terrain-renderer.js` builds exposed-face chunk meshes with shared material instances, explicit/dirty chunk rebuilds, disposal, and hit-to-cell mapping. A small mock-Three smoke test passed; the module is not yet connected to the game scene.
- **Dirty-chunk contract:** terrain state now exposes bounded chunk keys and drains changed chunk keys after edits. An edit invalidates its own chunk and adjacent chunks only when it touches a shared chunk edge, allowing the renderer's incremental update API to be driven without rebuilding the full bounded volume. A targeted negative-origin/edge regression test covers this contract.
- **Terrain collision foundation:** `game/js/terrain-physics.js` now contains a pure axis-separated character-volume movement helper for terrain walls, ceilings, falling, landing, and support. Its three focused tests pass. It is not yet used by `main.js`, and does not replace the existing woodland/vehicle/world obstacle checks.
- **Renderer regressions:** `game/test/terrain-renderer.test.js` now checks exposed-face geometry, material grouping, dirty rebuild/disposal, chunk-edge updates with negative coordinates, and hit-to-cell mapping. These four tests pass with mock Three.js objects.
- **Terrain action transactions:** `game/js/terrain-actions.js` now coordinates tool-gated break rules and inventory capacity with terrain edits, plus exact item consumption on successful material placement. Two focused tests cover capacity rejection, pickaxe requirement, and placement accounting. This is a local helper only; it is not yet connected to ray targeting or runtime controls.
- **Integration research:** movement/gravity and the flat y=0 assumption are in `main.js:1095–1124`; vehicle movement also assumes flat ground (`main.js:1036–1087`). Save integration points are `snapshot()`/`applyState()` (`main.js:1698–1877`). `Builder` currently owns separate occupancy (`build.js`), while `/api/save` is whole-snapshot persistence with a 512 KiB limit, not an authenticated per-edit protocol. This is suitable for a bounded local prototype only; multiplayer edits need server authorization, revisions, deduplication, and removal propagation.

These components are deliberately not yet wired into `main.js`. The shared coordinate contract is integer X/Z cell centers and integer Y cell bottoms; default surface is Y=0, with a bounded underground/above-ground volume. Editable-region selection, collision, safe spawn migration, vehicle exclusion, old-builder occupancy, and save-size budgets remain open design gates. In particular, a visual hole without removing/cutting the existing ground rendering and replacing the y=0 movement clamp would be unsafe and is not a completed digging feature.

Before this terrain work began, a fresh local device-emulation audit also found touch/layout issues that affect the eventual end-to-end gate: action buttons overlap the phone hotbar; rotating the emulated viewport updates the drawing buffer but leaves the visible canvas at its old size; touch gas+brake accelerates instead of stopping; Build mode's initial aim can be outside placement reach; and a walking joystick drag can accidentally place a selected block. These are confirmed local findings, not fixes, and need separate integration work and regression tests. The shop purchase and wagon cargo-panel touch flows worked in the same audit. No production or player save was used.

The historical notes in this section describe the earlier isolated-foundation stage; the current status above supersedes its integration/verification statements.

## Existing foundations

Based on the current checkout:

| Area | Existing code | How to use it |
| --- | --- | --- |
| Inventory | `game/js/inventory.js` | Nine hotbar slots, selection, held-item visuals, stacking, consumption, and serialization already exist. Generalize resource addition beyond the current `buy()` name. |
| Item definitions | `game/js/items.js` | Extend the existing catalog with dirt and actual hand tools; keep established item IDs compatible. |
| Placement | `game/js/build.js` | Already handles placement previews, occupied cells, structures, and inventory consumption. Extend it instead of creating a second competing builder. |
| Trees and resources | `game/js/woodland.js`, `game/js/farm-systems.js` | Trees have IDs, stages, interactions, obstacles, and saved state. Existing felling gives firewood and creates a stump; connect chopping to this lifecycle. |
| Controls and orchestration | `game/js/input.js`, `game/js/main.js` | Keyboard/touch actions, on-foot mode, crop interactions, building, and save/load are integrated here. Route new actions through one interaction owner. |
| World and ownership | `game/js/world.js`, `game/js/farm.js` | Reuse farm bounds and assigned-farm checks. |
| Ground and movement | `game/js/main.js`, `game/js/build.js` | Ground rendering and targeting currently use a flat plane. Editable terrain requires replacing that assumption in affected areas. |
| Persistence and networking | `game/js/net.js`, `game/js/realtime.js`, `worker.js` | Extend existing save and remote-view paths. The shared-road placement endpoint is specific to road tiles, not a general terrain-edit system. |

There is already unrelated work in the checkout, including farming and crop-care changes. Preserve it and reconcile integration points before implementation.

## First-release scope and rules

### Punching, chopping, and digging

- Empty hands can punch soft materials and slowly gather wood. Punching is a harvesting action in this release; combat is outside scope.
- Holding the primary action progresses a break meter on one target. Releasing, changing targets or tools, moving out of reach, entering a vehicle, or opening a modal cancels progress.
- Use a proposed reach of four world units from the character, with a clear line of sight. Camera position must not allow harvesting through walls or from far away.
- An axe speeds up wood gathering; a shovel speeds up dirt digging; a pickaxe enables stone gathering. Make starter tools available through the existing shop for the first release. Crafting can follow later.
- Tools are reusable initially. Keep durability and tool upgrades out of the first implementation so they do not complicate inventory accounting.
- Show the target outline, action label, progress, brief hand/tool motion, material particles, and a completion sound. Invalid targets explain why they cannot be worked.

Proposed starting balance, to tune in playtesting:

| Target | Hands | Preferred tool | Collected item | Placement behavior |
| --- | --- | --- | --- | --- |
| Grass-topped soil or dirt | 1.0 second | Shovel: 0.35 seconds | 1 `dirt` | One dirt cube; no automatic crop restoration |
| Harvestable tree | 5.0 seconds | Axe: 1.5 seconds | Fixed 3 `wood` per tree | Standard wood building cubes |
| Stone cell | Cannot break; show tool hint | Pickaxe: 2.0 seconds | 1 `stone` | One stone cube |
| Player-placed resource cube | Material-specific | Matching tool | Exactly 1 matching item | Reusable in the same grid |
| Loose branch | Existing collection action | None | Existing `firewood` reward | Keep its existing resource role |

Treat trees as whole harvestable objects initially, not individually simulated trunk and leaf blocks. One completed chop removes the tree canopy/trunk, updates its collision, and leaves the existing stump state. Route the older felling action through the same completion path or disable that shortcut for these trees so it cannot bypass timing or award twice. Keep `wood` and `firewood` distinct; do not silently convert saved firewood into building stock. Stump clearing uses the existing lifecycle with no second wood reward.

### Collection and inventory

- Completed harvesting transfers resources directly into the existing inventory and displays a short `+1 Dirt` or `+3 Wood` message.
- Keep the nine-slot hotbar and current stacking behavior initially. A larger backpack and new stack caps are separate follow-ups.
- Provide a general `addItem(itemId, quantity)` entry point, with `buy()` retained as a compatibility wrapper for existing callers. Validate item IDs and positive integer quantities.
- Check capacity for the complete reward before changing the world. If all slots hold other item types, display `Inventory full` and leave the target intact. An existing matching stack can still receive resources.
- Do not substitute money for resources when this new gathering path runs out of space.
- Complete removal and inventory addition together, once. If either cannot commit, restore the prior state. The same rule applies to placement and item consumption.
- Keep selected-item appearance and quantity synchronized, including when gathering fills the selected empty slot or placement empties it.

### Placing collected materials

- Select dirt, wood, or stone from the hotbar and enter the existing Build mode.
- Preview a grid-aligned block against the face being aimed at: beside, above, or below an existing solid cell where allowed. Refill excavated ground using the same system.
- Valid previews use the material appearance; invalid previews are red and display a concise reason.
- Require reach, line of sight, ownership, an empty destination, and attachment to an existing solid face. Reject placement intersecting the player, another character, a vehicle, or protected infrastructure.
- A successful placement consumes exactly one item. A rejected placement consumes none.
- Placed blocks can be broken and collected again. Legacy decorations, road surfaces, seeds, and fertilizer retain their own behavior; do not give every object an automatic resource-cube refund.
- Basic blocks may remain suspended after support is removed. Falling-block simulation and structural collapse are deferred.

## Controls and interaction priority

| Context | Desktop | Touch |
| --- | --- | --- |
| Gather while walking | Hold left mouse on the target | Aim with existing camera controls, then hold a labeled Punch/Chop/Dig button |
| Place in Build mode | Left click places one previewed item, matching the existing builder | Tap a dedicated Place button |
| Reclaim in Build mode | Hold a separate Break action, proposed right mouse | Hold a dedicated Break button |
| Select item | Existing keys 1–9 | Existing hotbar taps |
| Switch Build mode | Existing B key | Existing Build button |

Do not attach another independent canvas click handler that can also trigger crop harvest or placement. Establish one dispatch order: UI/modal handling first, driving controls second, Build-mode actions third, then on-foot context actions. Crop picking and farm interactions should resolve to one appropriate action per gesture. Suppress the browser context menu only on the game canvas where the Break binding is active.

For first-person view use the reticle; for third-person desktop use the cursor ray. Touch uses a visible aim marker and action buttons so dragging to look never starts digging. Cancel held actions on pointer cancellation, blur, pause, login lock, and modal transitions. Preserve existing touch-to-mouse duplicate-event protection.

## Editable ground: the main technical change

### Recommended initial terrain model

Use a bounded voxel volume in designated editable parts of the player's own farm. Start with one dirt/stone gathering area, then expand editable coverage after the full loop works. Protect roads, riverbanks, bridges, house/shop foundations, active crop fields, and spawn/vehicle access routes in the first release.

- Use one-world-unit cells aligned with the builder. Define coordinates once: integer cell centers on X/Z and integer bottom heights on Y, matching existing placement conventions after verifying them.
- Proposed initial vertical bounds: eight cells below the original surface and sixteen cells above it, with an unbreakable bottom. Display the boundary visibly or explain it in the target hint.
- Generate deterministic base soil and stone layers, then store only changed cells, including explicit air entries for excavations. Removing a cell must not be indistinguishable from an unmodified cell.
- Use chunked storage and rebuild only changed chunks plus affected neighbors. A starting horizontal chunk size of 16 × 16 is a tuning proposal.
- Render exposed faces only, with shared materials and bounded visual effects. Avoid a separate scene mesh and raycast candidate for every buried cube.
- Remove or cut the original ground plane out of editable footprints. Otherwise holes remain covered by the old surface. Render cavity walls and bottoms as real geometry.
- Use one solid-cell query for target selection, occupancy, terrain meshes, and collision. Ray hits on chunk geometry must resolve to stable cell coordinates and face normals.
- Treat placed resource cubes in editable areas as part of this same occupancy model. Adapt legacy builder data at the boundary instead of letting two registries disagree about whether a cell is solid.

### Movement must follow the edited world

Digging is not finished when a block disappears visually. Characters must stand on remaining surfaces, fall into excavations, land on blocks, and stop at walls and ceilings. Use a character-volume collision check rather than only a height sample, since digging can create overhangs and placement can create ceilings.

Integrate terrain collision with current movement in `main.js`; preserve jumping and camera behavior. Prevent block placement inside the character. Provide a recovery action to return a stuck player to a verified safe position without granting resources or erasing edits.

For the first terrain slice, exclude vehicles from the editable area with an explicit boundary and safe dismount position. Supporting tractors in pits requires separate vehicle-ground/contact work; do not allow them to drive across an invisible flat collider while the player sees a hole. Existing routes and farming areas remain navigable.

## Suggested implementation boundaries

These are interfaces for later task breakdown, not agent assignments. New filenames are suggestions.

| Component | Responsibility and contract |
| --- | --- |
| Resource definitions, e.g. `resource-rules.js` | Target hardness, tool eligibility/speed, drops, and item-to-placeable mappings; pure data and functions. |
| Terrain state, e.g. `terrain.js` | `getCell`, `isSolid`, bounded/permission-aware edit validation, chunk revisions, serialization, and restore. No DOM dependency. |
| Terrain presentation, e.g. `terrain-renderer.js` | Chunk meshes, hit-to-cell mapping, dirty-region updates, disposal, and culling. |
| Interaction controller, e.g. `world-interaction.js` | Current target, reach/visibility checks, held-action progress, cancellation, and a single completion event. |
| Inventory, existing `inventory.js` | Capacity checks, general item addition, exact consumption, and UI synchronization. |
| Woodland adapter, existing woodland/farm systems | Stable tree targets and single-path harvest commits that preserve stump/regrowth behavior. |
| Builder adapter, existing `build.js` | Preview and placement validation against shared occupancy; retain farming and decoration behavior. |
| Integration, existing `main.js` / input / networking | Mode dispatch, terrain-aware movement, lifecycle, save/load, and remote display. Keep material rules outside `main.js`. |

A target descriptor should identify its kind, stable tree/object ID or cell coordinates, material, hit face, owner, and revision. Revalidate it when harvesting completes; a target removed or changed during a hold must not award its old resource.

A world edit should carry an operation ID, expected revision, removal/placement details, and inventory delta. Return a clear success or rejection result. Keep visual feedback separate from committed state so a rejected operation cannot leave a phantom hole or duplicate item.

## Saves, ownership, and remote visibility

- Add a versioned terrain section containing generation version, bounds, and changed cells. Keep existing inventory and structure formats readable.
- Old saves with no terrain section generate the unchanged base world and retain money, crops, tools, inventory, and structures.
- Define how legacy placed resource cubes enter shared occupancy on load. Migrate once with an explicit version marker, never render or refund them twice.
- Save terrain edits, tree state, placed blocks, and resulting inventory in the same snapshot. Restore collision before placing the player; validate their saved position against the restored world.
- Validate IDs, coordinates, quantities, edit counts, bounds, and save size. Verify actual save/request limits before deciding chunk/edit budgets.
- Restrict destructive edits to the owner’s allowed farm areas. Visitors may see changes but cannot mine or place there. Derive identity from the authenticated session; farm-slot assignment alone is not proof of ownership.
- Extend remote farm rendering to display excavated terrain and resource structures. Preserve existing road sharing as its own path.
- A local prototype may use the existing snapshot model, but public synchronized editing needs revision/conflict handling and server validation. Do not claim client-side checks prevent tampering.
- For online operations, reject stale revisions and deduplicate operation IDs. A retry must never grant a second reward. Reconcile failed operations from confirmed state.
- Preserve offline/local save behavior deliberately. Avoid blind merging of independently modified inventory and terrain on reconnect; use a defined whole-save conflict rule until an operation-based merge is implemented.

## Delivery sequence and acceptance gates

### 1. Agree on shared rules and interfaces

Define grid coordinates, editable bounds, item IDs, target descriptors, inventory transaction behavior, and save schema. Capture old-save fixtures before making changes. Inventory, builder, and terrain work must use the same contracts.

**Gate:** A short design fixture demonstrates what a base dirt cell, removed cell, placed wood block, and chopped tree look like in saved state, with no overlapping ownership of the same block.

### 2. Deliver the wood gathering loop

Implement targeting, held-action timing, cancellation, inventory addition, and the woodland adapter. Make gathered wood usable in existing placement, then support reclaiming that wood.

**Gate:** Starting without wood, the player punches or chops one tree, receives the defined quantity exactly once, places a block, and breaks it back into inventory. A full inventory leaves the tree/block unchanged.

### 3. Deliver real digging and collision

Add the bounded terrain volume, exposed-face rendering, dirt/stone rules, terrain targeting, character collision, and protection boundaries. Connect block placement to terrain occupancy.

**Gate:** The player digs a two-cell-deep hole, stands inside it, refills it with collected dirt, and builds/climbs a small stair. No flat plane covers the hole; walls and ceilings block movement; the player cannot place a block through their body.

### 4. Complete persistence and integration

Add schema migration, atomic snapshot state, restore safety, remote visibility, and the online conflict/ownership behavior needed for the chosen release mode. Exercise existing shop, crop, cargo, gift, and building flows against the inventory changes.

**Gate:** Reloading preserves the exact terrain, tree, structure, and inventory result. Loading an old save works. Remote viewers see committed changes; rejected/repeated actions cannot create resources.

### 5. Tune and verify desktop and touch play

Tune reach and timings, tool availability, feedback, button layout, chunk updates, and resource limits. Run existing tests plus targeted behavior tests and real interactive sessions.

**Gate:** A player can complete the entire gather/build/reload loop with mouse/keyboard and touch without accidental actions, blocked controls, or visible terrain/collision disagreement.

## Verification checklist

- Pure behavior tests: material/tool rules, break cancellation, bounds, face-adjacent placement, capacity rejection, exact resource accounting, and stale-target completion.
- Terrain tests: negative coordinates, chunk edges, exposed faces after digging/refilling, bottom/height limits, character wall/ceiling/ground collision, and migration of legacy blocks.
- Persistence tests: old saves, edited-world round trips, invalid data, safe spawn recovery, retry deduplication, and revision conflicts.
- Regression tests: current `npm test` suite plus shop purchases, crop harvest/planting, woodland interactions, cargo transfer, gifts, decorations, and vehicle entry/exit.
- Browser playthrough: collect wood, dig dirt, mine stone with a pickaxe, build a small shelter, reclaim it, fill inventory, attempt invalid placement, save/reload, and check actual counts.
- Input checks: first/third person, touch look versus action, modal opening mid-hold, pointer cancellation, app backgrounding, and entering a vehicle mid-action.
- Performance checks: repeated edits at chunk boundaries, large bounded constructions, dirty-chunk rebuild time, draw calls, memory, and save payload size. Measure against the unchanged game on the same device; record actual measurements rather than inventing a pass threshold.
- Verify touch usability and sustained performance on a real target tablet before claiming device readiness; browser emulation alone is insufficient.

## Deferred features

Crafting recipes, tool durability, backpacks/chests, dropped-item physics, infinite terrain, procedural caves, ores/smelting, water flow, falling sand, survival hunger, combat, mobs, and collaborative editing of the same farm are later extensions. The first release is complete when gathering changes the world, rewards enter inventory reliably, collected materials can be placed and reclaimed, and those changes survive reload.
