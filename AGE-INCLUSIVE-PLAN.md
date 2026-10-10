# Age-Inclusive Onboarding and Usability Plan

## Goal

Make the first 10–15 minutes understandable and comfortable for both a young child playing with a responsible adult nearby and an older adult, without assuming that either person has a particular reading, vision, hearing, or motor ability. Keep the full game available; make help adjustable, optional, and easy to leave.

## Design principles

- **One clear next step:** distinguish the current task from optional status and advanced systems.
- **Show, don’t require memorization:** pair short text with recognizable icons and the actual control to use; never rely on color or emoji alone.
- **No dead ends:** every tutorial can be skipped, paused, resumed, or dismissed; advanced systems remain discoverable.
- **No hidden penalties:** if a mode hides an optional system, that system must not quietly punish or mutate the farm while hidden.
- **Preserve existing farms:** returning saves retain their current full-system behavior. Preferences must not overwrite crops, livestock, terrain, vehicles, or shared-world state.
- **Adjustable, not age-prescriptive:** users can change text size, controls, guidance, and complexity at any time.

## Recommended experience model

Offer three farm experiences when starting a new farm, with **Guided Farm** recommended:

1. **Guided Farm:** a short optional first-day tutorial, concise task card, and only the core farming controls emphasized.
2. **Simple Farm:** the core farm loop stays available; advanced systems are revealed through clearly labelled “Explore more” choices.
3. **Full Farm:** current behavior and all systems are available immediately.

Do not silently switch existing farms into Simple Farm. Keep visual preferences (text size, contrast, control layout) separate from gameplay saves. Treat the farm experience as gameplay policy: for online farms it must be consistent across devices and saved with the farm/server state. When an optional system is hidden, pause that system’s simulation and penalties without deleting its state; resume from the preserved state when the player enables it. Explicitly decide system-by-system whether it belongs in the core loop before hiding it.

## Phased implementation

### Phase 1 — Preferences and accessibility foundation

- Add a small preferences module and always-available Settings panel. Keep view preferences (text scale, high contrast, button size/control layout, reduced motion) outside `snapshot()` so presentation settings cannot overwrite farm state.
- Add a versioned Guided/Simple/Full farm-experience preference. Preserve current behavior for existing saves through a migration default; use the existing Worker save authority for online consistency rather than a device-only difficulty choice.
- Keep current login and remembered-session flow unchanged apart from an optional first-time experience choice after farm entry.
- Support browser zoom rather than forcing a fixed scale. Preserve safe-area behavior and check the game at enlarged text sizes.

**Likely files:** `game/index.html`, `game/js/main.js`, new `game/js/player-preferences.js`, new `game/js/settings-ui.js`, `worker.js` only if a separate authoritative farm-experience field is needed.

### Phase 2 — Optional first-day tutorial

- For a genuinely new farm, offer “Show me around” and “Let me explore”; never interrupt a returning farmer.
- Use a persistent, dismissible task card, not a sequence of transient toasts. Keep each step to one short instruction, with a text label for the touch/keyboard control.
- Teach only the core loop first: move and look around, enter/exit a vehicle, try one safe field task, find the shop, and understand how to get help. Do not require waiting for crop growth or purchasing optional supplies to finish the tutorial.
- Let players pause, resume, skip a step, or end the tutorial. Do not move the player or commit an in-world action on their behalf.
- Persist tutorial completion/progress without changing older save formats; ensure a restart never strands a player in a modal or locked input state.

**Likely files:** new `game/js/tutorial.js`, `game/js/main.js`, `game/js/input.js`, and tests such as `game/test/tutorial.test.js` and existing input-modal tests.

### Phase 3 — Progressive disclosure and a clearer HUD

- Replace the crowded all-systems HUD with: (a) the current task/nearby action, (b) a few immediate farm essentials, and (c) expandable “Farm details” and “Explore systems” panels.
- Define explicit visibility/action policies for livestock care and breeding, requests, water/river tasks, woodland, vehicle failures/upgrades, market detail, and terrain/building. Gate both the UI and action handlers—not just the visible buttons.
- In Simple Farm, preserve saved system state while pausing any optional simulation that would otherwise create unseen duties, damage, expiration, or costs. On upgrade to Full Farm, reveal the preserved system with an explanation before its ongoing effects resume.
- Keep urgent safety/recovery information visible even when other details are collapsed.

**Likely files:** `game/js/main.js`, `game/js/farm-systems.js`, and policy-focused tests plus the existing `livestock`, `water-system`, `farm-requests`, `vehicle-condition`, and terrain tests.

### Phase 4 — Plain-language prompts and actionable errors

- Audit HUD hints, farm interactions, shop item descriptions, and failure messages. Use short, consistent verbs (“Plant seeds”, “Repair bridge”, “Sell crops”) instead of internal action names (“build-channel”, “repair-breakdown”).
- For blocked actions, explain the missing resource and amount, why it is needed, and where it can be found. For example: “You need 2 wood to repair the fence. Chop a tree or buy wood at the shop.”
- Reuse result/reason codes rather than parsing strings. Add a shared player-facing message formatter while keeping structured errors stable for tests and networking.
- Label optional care and upgrades as optional; state the result of a shop purchase and its price before confirmation.
- Keep one primary instruction at a time; move secondary controls into a dedicated Help panel.

**Likely files:** new `game/js/game-messages.js`, `game/js/farm-systems.js`, `game/js/shopui.js`, `game/js/items.js`, `game/js/livestock.js`, `game/js/water-system.js`, `game/js/river-crossings.js`, and focused tests for reason-to-message mapping.

### Phase 5 — Predictable, touch-friendly controls and dialogs

- Establish a generous minimum target size (aim for 48–56 CSS px for primary touch actions) and legible labels; do not shrink important controls on short screens to make everything fit. Use scrolling or an alternate layout instead.
- Keep movement, primary action, and pause/help/settings controls in predictable safe-area-aware locations across portrait, landscape, phone, and tablet layouts. Check map/garage/settings overlays for overlap with vehicle controls.
- Give every icon button an accessible name and visible keyboard focus. Ensure every dialog has initial focus, Escape/close support, focus containment/restoration, and the existing gameplay input lock behavior.
- Review the login, inventory, shop, cargo, map, settings, and upgrade dialogs—not just the driving buttons.

**Likely files:** `game/js/input.js`, `game/index.html`, `game/js/shopui.js`, `game/js/grain-sale-ui.js`, `game/js/wagon.js`, `game/js/main.js`, plus `game/test/input-touch-controls.test.js` and `game/test/input-modal.test.js`.

### Phase 6 — Automated verification and two formative playtests

- Add deterministic tests for preference migration, tutorial skip/resume, feature visibility/action gates, hidden-system pause/resume, save round-trips, missing-resource explanations, and modal focus/input lock.
- Add browser smoke coverage for login, start/skip tutorial, settings, map/settings dialogs, and no uncaught errors at phone, short-landscape, tablet, and desktop viewports. The repo currently has `node:test` coverage but no browser-test framework; choose a small Playwright setup only if it can run in CI without production accounts or shared-world writes.
- Run the existing `npm test` and `npm run test:perf`; use a staging/local Worker and disposable accounts/data only. Check existing save migration and online/offline preference consistency before release.
- Conduct two separate, short formative sessions using the same broad goals: start, explore, perform one interaction, optionally drive, and stop/recover. For the 4-year-old, obtain guardian permission and child assent, keep the guardian present, let the child lead, and stop at any sign of discomfort. For the 75-year-old, ask what device and accommodations they prefer; do not infer ability from age. Do not collect identifying details or record by default.
- Record whether each task was completed independently, with a hint, skipped, or not completed; note confusion, mis-taps, help requests, comfort, and whether progress feels safe. Treat two sessions as qualitative feedback, not statistical proof.

**Likely files:** `package.json` and new browser tests only if selected, plus a short release checklist after the flows are stable.

## Parallel work plan (up to six agents)

After Phase 1 defines the preference and policy APIs, split implementation by file ownership:

1. Preferences/settings module and accessible settings dialog.
2. Tutorial state machine and its deterministic tests.
3. Simple/Full system-visibility and pause/resume policy in `FarmSystems` and tests.
4. Plain-language result/error formatter and shop/action copy tests.
5. Touch layout, viewport scaling, focus behavior, and responsive checks.
6. Browser smoke setup, staging checklist, and playtest materials.

Assign one integrator to own `game/js/main.js` and merge the separate UI hooks after the modules stabilize; avoid parallel edits to this central integration file. Keep milestones reviewable, and do not merge a phase until its migration, input-lock, and save-compatibility checks pass.

## Definition of done

- New players can choose guidance or free exploration; returning players are not interrupted and their farms retain existing behavior.
- A player can always skip/close guidance and reopen Help; no path leaves movement locked or loses progress.
- Simple Farm never hides a system that can silently penalize the player; switching modes preserves system state and remains consistent across online devices.
- Primary controls remain legible, operable, and comfortably sized at tested phone/tablet/desktop layouts and with enlarged text.
- Blocked actions identify the missing requirement and a next step; prompts use plain verbs and avoid unexplained internal terms.
- Automated tests, browser smoke checks, staging checks, and age-inclusive formative feedback reveal no critical confusion, inaccessible controls, data loss, or hidden gameplay penalties.
