// Shared catalog for the shop and inventory. Prices are tuned around the
// current harvest reward and will be rebalanced with the crop economy in M5.
export var ITEMS = [
  { id: 'asphalt', name: 'Asphalt', emoji: '⬛', price: 4, category: 'Roads', description: 'A smooth, dark road tile.' },
  { id: 'gravel', name: 'Gravel', emoji: '◽', price: 2, category: 'Roads', description: 'A rustic path or farm road tile.' },
  { id: 'brick', name: 'Brick', emoji: '🧱', price: 6, category: 'Roads', description: 'A warm red paving tile.' },
  { id: 'wood', name: 'Wood', emoji: '🪵', price: 12, category: 'Building', description: 'A sturdy voxel building block.' },
  { id: 'roof_shingles', name: 'Roof Shingles', emoji: '🏠', price: 90, category: 'Building', description: 'A bundle of cozy roof shingles.' },
  { id: 'fence_kit', name: 'Fence Kit', emoji: '🚧', price: 80, category: 'Building', description: 'Build a little fence around your yard.' },
  { id: 'window_glass', name: 'Window Glass', emoji: '🪟', price: 65, category: 'Building', description: 'A bright window for your new home.' },
  { id: 'door', name: 'Door', emoji: '🚪', price: 70, category: 'Building', description: 'A welcoming front door.' },
  { id: 'lamp_light', name: 'Lamp Light', emoji: '💡', price: 55, category: 'Lighting', description: 'A warm farmyard lamp.' },
  { id: 'string_lights', name: 'String Lights', emoji: '✨', price: 95, category: 'Lighting', description: 'Little lights for autumn evenings.' },
  { id: 'fertilizer', name: 'Fertilizer', emoji: '🪴', price: 25, category: 'Farm supplies', description: 'Helps crops grow faster.' },
  { id: 'corn_seeds', name: 'Corn Seeds', emoji: '🌽', price: 15, category: 'Farm supplies', description: 'Plant a row of golden corn.' },
  { id: 'wheat_seeds', name: 'Wheat Seeds', emoji: '🌾', price: 10, category: 'Farm supplies', description: 'A dependable crop for your fields.' },
  { id: 'pumpkin_seeds', name: 'Pumpkin Seeds', emoji: '🎃', price: 25, category: 'Farm supplies', description: 'Grow cheerful autumn pumpkins.' },
  { id: 'sunflower_seeds', name: 'Sunflower Seeds', emoji: '🌻', price: 18, category: 'Farm supplies', description: 'Tall sunflowers brighten the farm.' },
  { id: 'pea_seeds', name: 'Pea Seeds', emoji: '🟢', price: 8, category: 'Farm supplies', description: 'Plant a patch of sweet peas.' },
  { id: 'paint', name: 'Paint', emoji: '🎨', price: 30, category: 'Decorating', description: 'Give placed blocks a fresh color.' },
  { id: 'hay_bale', name: 'Hay Bale', emoji: '🟨', price: 28, category: 'Autumn decor', description: 'A cozy little bale for your yard.' },
  { id: 'scarecrow', name: 'Scarecrow', emoji: '🧑‍🌾', price: 60, category: 'Autumn decor', description: 'A friendly guardian for your fields.' },
  { id: 'pumpkin_pile', name: 'Pumpkin Pile', emoji: '🎃', price: 75, category: 'Autumn decor', description: 'A stack of bright fall pumpkins.' },
  { id: 'corn_shocks', name: 'Corn Shocks', emoji: '🌽', price: 48, category: 'Autumn decor', description: 'Golden bundles of dried corn.' },
  { id: 'mailbox', name: 'Mailbox', emoji: '📮', price: 42, category: 'Autumn decor', description: 'A cute mailbox for your driveway.' }
];

export var ITEM_BY_ID = {};
for (var i = 0; i < ITEMS.length; i++) ITEM_BY_ID[ITEMS[i].id] = ITEMS[i];
