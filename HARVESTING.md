# Harvesting and grain sales

1. Drive the combine with a header attached over golden, ready crops on your own farm.
   Corn, wheat, sunflowers, and legacy/default grain fill the combine's 200-unit bin.
   Pumpkins and peas are still picked by hand. A full bin leaves remaining crops standing.
2. Park the wagon beside the combine's side auger. Tap **Unload** or press **U**.
   The grain transfers to wagon cargo; a wagon without enough cargo slots leaves it in the bin.
3. Hitch the wagon to the truck and haul it to the **store grain depot apron** beside the shop.
   An itemized offer opens automatically when you arrive with harvested cargo.
4. Choose **Accept & collect** to sell the displayed harvest. Proceeds go into the same
   account balance used for shop purchases, and the updated balance/cargo save immediately.
   **Not now** or **Escape** keeps your crops. Tap **Sell crops** or press **Y** to reopen
   the offer, or leave the apron and return.

## Prices per crop unit

| Crop | Price |
| --- | ---: |
| Legacy / mixed grain | $10 |
| Corn | $7 |
| Wheat | $4 |
| Sunflower heads | $10 |
| Pumpkins | $18 |
| Peas | $2 |

Harvesting no longer pays instant money: payment occurs when you accept a sale.
Non-harvest supplies stay in the wagon. Changed cargo or leaving the depot invalidates
the displayed offer, and repeated acceptance cannot pay twice.

## Verification for v1.19.0

- `npm test`: 48 passing tests, including legacy harvest output, all machine crop types,
  capacity and full-wagon limits, itemized prices, stale/out-of-range offers, duplicate
  acceptance, immediate save snapshots, modal input release, and unrestricted tilling.
- `npm run deploy -- --dry-run`: Worker packaging passes, with unchanged resource bindings.
- Browser QA used a local, offline test account and a temporary test-only state fixture;
  no production account or save data was modified. The fixture supplied ready crops and
  vehicle starting positions; real keyboard/button input exercised harvesting, unload,
  truck arrival, cancellation, acceptance, and shop purchasing.
- Browser harvesting filled the bin to 200 without crediting cash. Unload moved all 200
  units to the wagon. The depot offer showed $2,000; accepting credited the balance from
  $100 to $2,100, emptied the harvest cargo, and immediately saved those changes together.
  Buying a $15 corn-seed bag then left $2,085 and loaded 100 seeds into the wagon.
- Desktop and 390 × 844 mobile receipt screenshots checked; no page/console errors in
  the final browser test session. Input is cleared while a modal is open so closing it
  cannot resume a stale held throttle.
- Gameplay references read: `gameplay-workflows.md` and `physics-engine-selection.md`.
  Existing lightweight proximity checks and vehicle physics are retained; no physics
  engine, asset, or runtime dependency was added.
