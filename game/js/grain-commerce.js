// Harvest is physical cargo. Cash is credited only after accepting a store offer.
export const GRAIN_VALUES = Object.freeze({
  harvest_grain: 10, harvest_corn: 7, harvest_wheat: 4,
  harvest_sunflower: 10, harvest_pumpkin: 18, harvest_peas: 2
});

export function quoteGrain(cargo, items) {
  const lines = [];
  let quantity = 0, value = 0;
  for (const stack of cargo) {
    if (!stack || !Object.prototype.hasOwnProperty.call(GRAIN_VALUES, stack.itemId) ||
        !Number.isSafeInteger(stack.qty) || stack.qty <= 0) continue;
    const unitValue = GRAIN_VALUES[stack.itemId];
    const item = items[stack.itemId];
    lines.push({ itemId: stack.itemId, name: item.name, emoji: item.emoji,
      qty: stack.qty, unitValue, value: stack.qty * unitValue });
    quantity += stack.qty;
    value += stack.qty * unitValue;
  }
  return { lines, quantity, value, signature: JSON.stringify(lines) };
}

export function acceptGrainSale(hold, quote, items, atDepot) {
  if (!atDepot) return { ok: false, error: 'Return the wagon to the store grain depot.' };
  const current = quoteGrain(hold.cargo, items);
  if (!current.quantity || current.signature !== quote.signature) {
    return { ok: false, error: 'Your wagon cargo changed. Reopen the offer to get a new price.' };
  }
  for (let i = 0; i < hold.cargo.length; i++) {
    const stack = hold.cargo[i];
    if (stack && Object.prototype.hasOwnProperty.call(GRAIN_VALUES, stack.itemId) &&
        Number.isSafeInteger(stack.qty) && stack.qty > 0) hold.cargo[i] = null;
  }
  return { ok: true, quantity: current.quantity, value: current.value };
}

export function transferBinToWagon(bin, hold) {
  const ids = Object.keys(bin).filter(id => bin[id] > 0);
  const missing = ids.filter(id => !hold.cargo.some(stack => stack && stack.itemId === id)).length;
  if (missing > hold.cargo.filter(stack => !stack).length) {
    return { ok: false, error: 'The wagon has no room for this harvest.' };
  }
  let quantity = 0;
  for (const id of ids) {
    const result = hold.add(id, bin[id]);
    if (!result.ok) return result;
    quantity += bin[id];
    // Clear each successful transfer immediately so a retry cannot duplicate grain.
    delete bin[id];
  }
  return { ok: true, quantity };
}
