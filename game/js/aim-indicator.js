// Keep the indicator out of vehicles and overlays; HarvestControls' enabled
// callback already includes the game's modal and login gates.
export function aimIndicatorState({ enabled, buildMode, touch, target }) {
  return {
    visible: !!enabled,
    centered: !!buildMode || !!touch,
    valid: !!target
  };
}
