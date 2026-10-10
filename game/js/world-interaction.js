// Pure held-action state. Presentation and mutations are injected by the game.
import { getBreakRule } from './resource-rules.js';

export class WorldInteraction {
  constructor(commit) {
    this.commit = commit;
    this.cancel();
  }

  cancel() {
    this.key = null;
    this.elapsed = 0;
    this.finished = false;
  }

  update(dt, { target, toolId = '', slot = -1, held = false, enabled = true, mode = '' }) {
    const rule = target && getBreakRule(target.material, toolId, target.kind);
    if (!enabled || !held || !target || !rule) {
      this.cancel();
      return { progress: 0, rule, target };
    }
    const key = JSON.stringify([target.kind, target.id, target.revision, toolId, slot, mode]);
    if (this.key !== key) {
      this.cancel();
      this.key = key;
      // Never carry elapsed time from a different target, tool, slot or mode.
      return { progress: 0, rule, target };
    }
    if (this.finished) return { progress: 1, rule, target };
    this.elapsed += Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    const progress = Math.min(1, this.elapsed / rule.duration);
    if (progress < 1) return { progress, rule, target };
    this.finished = true;
    const result = this.commit(target, rule);
    return { progress: 1, rule, target, result };
  }
}
