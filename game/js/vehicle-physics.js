// Shared yaw convention: at heading 0 a vehicle moves along world +X.
// A positive steering input means "right", which turns toward world +Z and
// therefore decreases rotation.y. Steering reverses when backing up.
export function steeringYawDelta(turn, steeringRate, speed, dt) {
  if (!Number.isFinite(turn) || !Number.isFinite(steeringRate) ||
      !Number.isFinite(speed) || !Number.isFinite(dt)) return 0;
  const speedFactor = Math.min(1, Math.abs(speed) / 2);
  if (speedFactor === 0 || turn === 0 || dt === 0) return 0;
  const travelDirection = speed < 0 ? -1 : 1;
  return -turn * steeringRate * speedFactor * travelDirection * dt;
}
