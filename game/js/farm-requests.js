// Deterministic, renderer-independent daily farm contract board.
const CROPS = [
  ['harvest_corn', 'corn'], ['harvest_wheat', 'wheat'],
  ['harvest_sunflower', 'sunflower'], ['harvest_pumpkin', 'pumpkin'],
  ['harvest_peas', 'peas']
];
const DEFAULTS = { maxActive: 3, requestsPerDay: 2, durationDays: 1, cropMin: 2, cropMax: 5 };
const copy = value => JSON.parse(JSON.stringify(value));
const clampInt = (n, min, max) => Math.max(min, Math.min(max, Math.floor(Number(n) || min)));

export function FarmRequests({ seed = 1, config = {} } = {}) {
  const board = {
    version: 1, seed: (Number(seed) >>> 0) || 1,
    config: { ...DEFAULTS, ...config }, day: null, nextId: 1,
    active: [], history: [],
  };
  const random = () => {
    let t = board.seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = list => list[Math.floor(random() * list.length)];
  const add = (type, fields, day) => {
    const id = 'farm-request-' + board.nextId++;
    board.active.push({ id, type, day, expiresDay: day + board.config.durationDays, status: 'active', ...fields });
  };
  function offer(day, context = {}) {
    const capacity = Math.max(0, clampInt(board.config.maxActive, 0, 100) - board.active.length);
    const count = Math.min(capacity, clampInt(board.config.requestsPerDay, 0, 100));
    const available = ['deliver', 'clear-branch', 'repair-breakdown', 'animal-care', 'farm-repair'];
    // Context can narrow work offers to currently actionable work.
    const branches = Number(context.branches || context.branchCount) || 0;
    const breakdowns = Number(context.breakdowns || context.breakdownCount) || 0;
    const animals = Number(context.animals || context.animalCount) || 0;
    const repairs = Number(context.repairs || context.repairCount) || 0;
    const work = available.filter(type => type === 'deliver' ||
      (type === 'clear-branch' && branches > 0) ||
      (type === 'repair-breakdown' && breakdowns > 0) ||
      (type === 'animal-care' && animals > 0) ||
      (type === 'farm-repair' && repairs > 0));
    for (let i = 0; i < count && work.length; i++) {
      const type = pick(work);
      if (type === 'deliver') {
        const crop = pick(CROPS), quantity = clampInt(board.config.cropMin, 1, 99) + Math.floor(random() * (clampInt(board.config.cropMax, 1, 99) - clampInt(board.config.cropMin, 1, 99) + 1));
        add(type, { itemId: crop[0], crop: crop[1], quantity, reward: { money: 20 + quantity * 8 } }, day);
      } else if (type === 'clear-branch') add(type, { quantity: 1 + Math.floor(random() * Math.min(3, branches)), reward: { money: 24, resources: { wood: 1 } } }, day);
      else if (type === 'repair-breakdown') add(type, { quantity: 1, reward: { money: 42 } }, day);
      else if (type === 'animal-care') add(type, { quantity: 1, reward: { money: 32, resources: { feed: 1 } } }, day);
      else add(type, { quantity: 1, reward: { money: 36 } }, day);
      work.splice(work.indexOf(type), 1);
    }
  }
  function update(dt, context = {}) {
    // dt is accepted for integration symmetry; expiry and refresh use game-day time.
    void dt;
    const day = Number.isFinite(Number(context.day)) ? Math.floor(Number(context.day)) : 0;
    if (board.day === null) { board.day = day; offer(day, context); }
    else if (day > board.day) {
      for (const req of board.active) if (req.status === 'active' && req.expiresDay <= day) {
        req.status = 'failed'; req.reason = 'expired'; board.history.push(req);
      }
      board.active = board.active.filter(req => req.status === 'active');
      board.day = day;
      offer(day, context); // deterministic daily reroll; prior active contracts remain.
    }
    return list();
  }
  function list() { return copy(board.active); }
  function complete(id, outcome = {}) {
    const req = board.active.find(item => item.id === id);
    if (!req) return { success: false, reason: 'request-not-found' };
    if (req.status !== 'active') return { success: false, reason: 'request-not-active' };
    let ok = false, reason = 'work-not-confirmed';
    if (req.type === 'deliver') {
      const inventory = outcome.inventory || outcome.items || {};
      let count = 0;
      if (typeof inventory.getCount === 'function') count = Number(inventory.getCount(req.itemId)) || 0;
      else if (Array.isArray(inventory)) count = inventory.reduce((n, item) => n + (item && (item.itemId === req.itemId || item.id === req.itemId) ? Number(item.qty || item.count || 0) : 0), 0);
      else count = Number(inventory[req.itemId]) || 0;
      if (count < req.quantity) reason = 'insufficient-crops';
      else { ok = true; reason = 'delivered'; if (outcome.consume && typeof outcome.consumeItem === 'function') outcome.consumeItem(req.itemId, req.quantity); }
    } else {
      const key = req.type === 'clear-branch' ? 'branchesCleared' : req.type === 'repair-breakdown' ? 'breakdownsRepaired' : req.type === 'animal-care' ? 'animalsCaredFor' : 'repairsCompleted';
      const generic = outcome.completed === true || outcome.success === true;
      const amount = Number(outcome[key] != null ? outcome[key] : outcome.count) || 0;
      const required = req.quantity;
      if (outcome.success === false) reason = outcome.reason || 'work-failed';
      else if (generic && amount === 0) { ok = true; reason = req.type === 'clear-branch' ? 'branches-cleared' : req.type === 'repair-breakdown' ? 'breakdown-repaired' : req.type === 'animal-care' ? 'animal-cared-for' : 'farm-repaired'; }
      else if (amount > 0) {
        req.progress = Math.min(required, (Number(req.progress) || 0) + amount);
        if (req.progress >= required) { ok = true; reason = req.type === 'clear-branch' ? 'branches-cleared' : req.type === 'repair-breakdown' ? 'breakdown-repaired' : req.type === 'animal-care' ? 'animal-cared-for' : 'farm-repaired'; }
        else { req.reason = 'in-progress'; return { success: false, partial: true, reason: 'in-progress', progress: req.progress, required, request: copy(req) }; }
      }
      else reason = req.type === 'clear-branch' ? 'branch-not-cleared' : req.type === 'repair-breakdown' ? 'breakdown-not-repaired' : req.type === 'animal-care' ? 'animal-care-not-confirmed' : 'repair-not-completed';
    }
    req.status = ok ? 'completed' : 'active';
    req.reason = reason;
    if (ok) { req.payout = copy(req.reward); board.active.splice(board.active.indexOf(req), 1); board.history.push(req); }
    return { success: ok, reason, request: copy(req), reward: ok ? copy(req.reward) : null };
  }
  function serialize() { return copy(board); }
  function restore(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.active) || !Array.isArray(data.history)) return false;
    board.seed = (Number(data.seed) >>> 0) || 1;
    board.config = { ...DEFAULTS, ...(data.config || {}) };
    board.day = Number.isFinite(data.day) ? data.day : null;
    board.nextId = Math.max(1, Number(data.nextId) || 1);
    board.active = copy(data.active); board.history = copy(data.history);
    return true;
  }
  return { update, list, complete, serialize, restore };
}
