// Player-facing wording for internal farm actions and result reasons.
const ACTION_LABELS = Object.freeze({
  'clear-branch': 'clear fallen branches', 'clear-stump': 'remove a tree stump',
  'clear-tree': 'clear a tree', 'repair-breakdown': 'repair the vehicle',
  'repair-vehicle': 'repair the vehicle', 'animal-care': 'care for an animal',
  'repair-fence': 'repair the fence', 'build-channel': 'build an irrigation channel',
  'build-pump': 'build a water pump', 'build-sprinkler': 'build a sprinkler',
  'fuel-pump': 'refuel the water pump', 'clean-river': 'clean the river',
  'reinforce-bank': 'reinforce the riverbank', 'repair-bank': 'repair the riverbank',
  'farm-repair': 'repair the farm', 'breed': 'breed livestock', 'feed': 'feed the animals',
  'water': 'water the animals', 'herd': 'bring the escaped animal home',
  'plant': 'plant a tree', 'prune': 'prune the tree', 'harvest': 'harvest the tree',
  'deliver': 'deliver the crops', 'irrigate': 'irrigate the field'
});

const REASON_MESSAGES = Object.freeze({
  'insufficient-resources': 'You do not have the supplies needed for that.',
  'insufficient-funds': 'You do not have enough money for that.',
  'insufficient-crops': 'You do not have enough crops to deliver.',
  'inventory-full': 'Your inventory is full. Make room and try again.',
  'no-nearby-target': 'Nothing nearby to interact with.',
  'hold-chop-required': 'Hold Chop while facing the tree to collect wood.',
  'already-built': 'That is already built.', 'already-expanded': 'That field is already open.',
  'already-fed': 'These animals have already been fed today.',
  'already-watered': 'These animals have already been watered today.',
  'already-ripe': 'That tree already has ripe fruit.', 'not-ripe': 'That fruit is not ripe yet.',
  'target-not-found': 'That target is no longer available.', 'target-changed': 'The target changed. Try again.',
  'invalid-location': 'That is not a valid place to work.', 'out-of-bounds': 'That spot is outside the work area.',
  'occupied': 'That spot is already occupied.', 'not-attached': 'Attach the right tool first.',
  'no-water-system': 'Build a channel or pump before irrigating.',
  'pump-not-built': 'Build a water pump first.', 'river-clean': 'The river is already clean.',
  'bank-intact': 'The riverbank does not need repairs.', 'fence-intact': 'The fence is already in good shape.',
  'fish-unhealthy': 'The fish need a healthier river first.',
  'animal-not-found': 'That animal could not be found.', 'animal-escaped': 'Bring the escaped animal home first.',
  'animal-not-escaped': 'That animal is already safe at home.',
  'breeding-needs-healthy-cared-pair': 'Breeding needs a healthy, cared-for pair.',
  'herd-at-capacity': 'Your herd is already at capacity.', 'already-bred-today': 'That animal has bred today already.',
  'request-not-found': 'That farm request is no longer available.', 'request-not-active': 'That farm request is no longer active.',
  'in-progress': 'Work in progress.', 'delivered': 'Crops delivered!', 'branches-cleared': 'Branches cleared!',
  'breakdown-repaired': 'Vehicle repaired!', 'animal-cared-for': 'Animal cared for!',
  'farm-repaired': 'Farm repairs completed!', 'unknown-action': 'That action is not available.'
});

function keyOf(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '-') : '';
}

export function formatGameAction(action) {
  const key = keyOf(action);
  return ACTION_LABELS[key] || (key ? key.replace(/-/g, ' ') : 'continue');
}

const RESOURCE_HELP = Object.freeze({ wood: 'buy wood at the shop or collect branches', stone: 'buy stone at the shop', metal: 'buy metal parts at the shop',
  water: 'buy a water jug at the shop', fuel: 'buy a fuel can at the shop', spare_tire: 'buy a spare tire at the shop', repair_kit: 'buy a repair kit at the shop', tool_use: 'buy garden tools at the shop',
  spareTire: 'buy a spare tire at the shop', repairKit: 'buy a repair kit at the shop' });

export function formatGameReason(reason, action, costs) {
  const key = keyOf(reason);
  if (key === 'insufficient-resources' && costs && typeof costs === 'object') {
    const missing = Object.entries(costs).filter(([resource, amount]) => Number(amount) > 0)
      .map(([resource, amount]) => `${Number(amount)} ${resource.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase()}`);
    if (missing.length) {
      const sources = Object.keys(costs).map(resource => RESOURCE_HELP[resource]).filter(Boolean);
      const nextStep = sources[0] || 'get the supplies from the shop';
      return `You need ${missing.join(' and ')}. ${nextStep.charAt(0).toUpperCase()}${nextStep.slice(1)}.`;
    }
  }
  if (REASON_MESSAGES[key]) return REASON_MESSAGES[key];
  if (!key || key === 'unknown-action') return 'That action could not be completed. Please try again.';
  const readable = key.replace(/-/g, ' ');
  return action ? `Could not ${formatGameAction(action)}: ${readable}.` : `Could not complete that: ${readable}.`;
}

export const gameMessageMappings = Object.freeze({ actions: ACTION_LABELS, reasons: REASON_MESSAGES });
