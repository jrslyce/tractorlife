// Shared gathering rules. Durations are seconds; tools are never consumed.
// Return null for materials that cannot be gathered with the selected tool.
export function getBreakRule(material, toolId, targetKind) {
  if (material === 'wood') {
    var tree = targetKind === 'tree';
    var axe = toolId === 'axe';
    return {
      duration: axe ? 1.5 : 5,
      itemId: 'wood',
      quantity: tree ? 3 : 1,
      label: (axe ? 'Chop ' : 'Punch ') + (tree ? 'tree' : 'wood')
    };
  }
  if (targetKind === 'tree') return null;
  if (material === 'dirt') {
    return { duration: toolId === 'shovel' ? 0.35 : 1, itemId: 'dirt', quantity: 1, label: 'Dig dirt' };
  }
  if (material === 'stone' && toolId === 'pickaxe') {
    return { duration: 2, itemId: 'stone', quantity: 1, label: 'Mine stone' };
  }
  return null;
}
