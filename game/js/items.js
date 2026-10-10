// Shared catalog for the shop and inventory. `pack` is how many units one
// purchase adds to the inventory (default 1): a seed bag plants 50 tiles, a
// spray jug covers 50 tiles, a fertilizer sack feeds 10 tiles. Keep prices
// and packs are also used by the Worker's gift validation.
// Terrain tools remain reusable and are available from the shop; dirt is still
// gathered in-world rather than purchased.
export var ITEMS = [
  { id: 'asphalt', name: 'Asphalt', emoji: '⬛', price: 4, category: 'Roads', description: 'A smooth, dark road tile.' },
  { id: 'gravel', name: 'Gravel', emoji: '◽', price: 2, category: 'Roads', description: 'A rustic path or farm road tile.' },
  { id: 'brick', name: 'Brick', emoji: '🧱', price: 6, category: 'Roads', description: 'A warm red paving tile.' },
  { id: 'dirt', available: false, name: 'Dirt', emoji: '🟫', price: 1, category: 'Building', description: 'A gathered earth block for building and filling ground.' },
  { id: 'wood', name: 'Wood', emoji: '🪵', price: 12, category: 'Building', description: 'Wood blocks for building walls and other structures.' },
  { id: 'roof_shingles', name: 'Roof Shingles', emoji: '🏠', price: 90, category: 'Building', description: 'Roof pieces to finish the top of a building.' },
  { id: 'fence_kit', name: 'Fence Kit', emoji: '🚧', price: 80, category: 'Building', description: 'Use this kit to build a fence around your yard.' },
  { id: 'window_glass', name: 'Window Glass', emoji: '🪟', price: 65, category: 'Building', description: 'Glass for adding windows to a building.' },
  { id: 'door', name: 'Door', emoji: '🚪', price: 70, category: 'Building', description: 'A door piece to add an entrance to a building.' },
  { id: 'lamp_light', name: 'Lamp Light', emoji: '💡', price: 55, category: 'Lighting', description: 'A warm farmyard lamp.' },
  { id: 'string_lights', name: 'String Lights', emoji: '✨', price: 95, category: 'Lighting', description: 'Little lights for autumn evenings.' },
  { id: 'fertilizer', name: 'Fertilizer', emoji: '🪴', price: 25, pack: 10, category: 'Farm supplies', description: 'Optional: use on a growing crop tile to make it grow 40% faster. One purchase gives 10 uses; crops grow without it.' },
  { id: 'crop_spray', name: 'Crop Spray', emoji: '🧴', price: 20, pack: 200, category: 'Farm supplies', description: 'Optional: use on crops affected by weeds or bugs to clear them and protect crops for 45 seconds. Healthy crops do not need spray.' },
  { id: 'animal_feed', name: 'Animal Feed', emoji: '🌾', price: 12, pack: 10, category: 'Farm supplies', description: 'Feed livestock for ten daily care actions.' },
  { id: 'water_jug', name: 'Water Jug', emoji: '💧', price: 6, pack: 10, category: 'Farm supplies', description: 'Use water for orchards, animals, or irrigation. One purchase gives 10 uses.' },
  { id: 'fuel_can', name: 'Fuel Can', emoji: '⛽', price: 18, pack: 5, category: 'Farm supplies', description: 'Refuel pumps or use to repair serious tractor engine trouble. One purchase gives 5 cans.' },
  { id: 'spare_tire', name: 'Spare Tire', emoji: '🛞', price: 35, category: 'Farm supplies', description: 'Needed to replace a tractor tire after it gets a flat.' },
  { id: 'repair_kit', name: 'Repair Kit', emoji: '🧰', price: 28, category: 'Farm supplies', description: 'Use to fix tractor engine smoke or other mechanical failures.' },
  { id: 'cleanup_kit', name: 'River Cleanup Kit', emoji: '🧹', price: 10, category: 'Farm supplies', description: 'Clean pollution from the river and restore fish health.' },
  { id: 'sapling', name: 'Tree Sapling', emoji: '🌱', price: 9, category: 'Farm supplies', description: 'Plant a new tree in the woodland.' },
  { id: 'stone', name: 'Stone', emoji: '🪨', price: 5, category: 'Building', description: 'Use stone to repair riverbanks and reinforce bridges.' },
  { id: 'metal', name: 'Metal Parts', emoji: '⚙️', price: 15, category: 'Building', description: 'Parts required to build or repair a farm water pump.' },
  { id: 'axe', name: 'Axe', emoji: '🪓', price: 35, reusable: true, category: 'Farm supplies', description: 'Reusable hand tool. Hold to chop trees and wooden blocks faster.' },
  { id: 'shovel', name: 'Shovel', emoji: '🥄', price: 25, reusable: true, category: 'Farm supplies', description: 'Reusable hand tool. Hold to dig dirt faster.' },
  { id: 'pickaxe', name: 'Pickaxe', emoji: '⛏️', price: 45, reusable: true, category: 'Farm supplies', description: 'Reusable hand tool. Required to mine stone blocks.' },
  { id: 'tool_use', name: 'Garden Tools', emoji: '🪓', price: 8, category: 'Farm supplies', description: 'Tools for pruning and clearing stumps.' },
  { id: 'corn_seeds', name: 'Corn Seeds', emoji: '🌽', price: 15, pack: 100, category: 'Farm supplies', description: 'One purchase gives 100 seeds. Load them into the planter to plant corn.' },
  { id: 'wheat_seeds', name: 'Wheat Seeds', emoji: '🌾', price: 10, pack: 100, category: 'Farm supplies', description: 'One purchase gives 100 seeds. Load them into the planter to plant wheat.' },
  { id: 'pumpkin_seeds', name: 'Pumpkin Seeds', emoji: '🎃', price: 25, pack: 100, category: 'Farm supplies', description: 'One purchase gives 100 seeds. Load them into the planter to plant pumpkins.' },
  { id: 'sunflower_seeds', name: 'Sunflower Seeds', emoji: '🌻', price: 18, pack: 100, category: 'Farm supplies', description: 'One purchase gives 100 seeds. Load them into the planter to plant sunflowers.' },
  { id: 'pea_seeds', name: 'Pea Seeds', emoji: '🟢', price: 8, pack: 100, category: 'Farm supplies', description: 'One purchase gives 100 seeds. Load them into the planter to plant peas.' },
  { id: 'paint', name: 'Paint', emoji: '🎨', price: 30, category: 'Decorating', description: 'Give placed blocks a fresh color.' },
  { id: 'hay_bale', name: 'Hay Bale', emoji: '🟨', price: 28, category: 'Autumn decor', description: 'A cozy little bale for your yard.' },
  { id: 'scarecrow', name: 'Scarecrow', emoji: '🧑‍🌾', price: 60, category: 'Autumn decor', description: 'A friendly guardian for your fields.' },
  { id: 'pumpkin_pile', name: 'Pumpkin Pile', emoji: '🎃', price: 75, category: 'Autumn decor', description: 'A stack of bright fall pumpkins.' },
  { id: 'corn_shocks', name: 'Corn Shocks', emoji: '🌽', price: 48, category: 'Autumn decor', description: 'Golden bundles of dried corn.' },
  { id: 'mailbox', name: 'Mailbox', emoji: '📮', price: 42, category: 'Autumn decor', description: 'A cute mailbox for your driveway.' },
  { id: 'harvest_grain', name: 'Harvested Grain', emoji: '🌾', price: 0, category: 'Produce', description: 'Grain harvested from legacy or mixed crops. Deliver it to the store grain depot.' },
  { id: 'harvest_corn', name: 'Harvested Corn', emoji: '🌽', price: 0, category: 'Produce', description: 'Fresh corn harvested by your combine.' },
  { id: 'harvest_wheat', name: 'Harvested Wheat', emoji: '🌾', price: 0, category: 'Produce', description: 'Fresh wheat harvested by your combine.' },
  { id: 'harvest_sunflower', name: 'Sunflower Heads', emoji: '🌻', price: 0, category: 'Produce', description: 'Sunflower heads harvested by your combine.' },
  { id: 'harvest_pumpkin', name: 'Pumpkin', emoji: '🎃', price: 0, category: 'Produce', description: 'A pumpkin picked by hand.' },
  { id: 'harvest_peas', name: 'Peas', emoji: '🟢', price: 0, category: 'Produce', description: 'A handful of peas picked by hand.' },
  { id: 'firewood', name: 'Firewood', emoji: '🪵', price: 0, category: 'Produce', description: 'Wood gathered from fallen branches.' },
  { id: 'fruit', name: 'Orchard Fruit', emoji: '🍎', price: 0, category: 'Produce', description: 'Fresh fruit from your orchard.' },
  { id: 'fish', name: 'River Fish', emoji: '🐟', price: 0, category: 'Produce', description: 'Fish from the river.' },
  { id: 'animal_produce', name: 'Farm Produce', emoji: '🥚', price: 0, category: 'Produce', description: 'Fresh produce from well-cared-for animals.' }
];

export function packSize(item) {
  return item && item.pack > 0 ? item.pack : 1;
}

export var ITEM_BY_ID = {};
for (var i = 0; i < ITEMS.length; i++) ITEM_BY_ID[ITEMS[i].id] = ITEMS[i];
