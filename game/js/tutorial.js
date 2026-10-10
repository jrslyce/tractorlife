// Optional, renderer-independent onboarding flow. The host decides when to
// call completeStep (or skipStep); this module has no game/DOM dependencies.
const VERSION = 2;

const STEPS = [
  { id: 'move-to-tractor', title: 'Get to the tractor', text: 'Move with WASD or the left stick. Walk up to the tractor until the Enter control appears, then press E or tap Enter.', action: 'enter-tractor' },
  { id: 'attach-plow', title: 'Attach the plow', text: 'While driving the tractor, tap Attach. The tractor starts without an implement; attaching equips the plow.', action: 'attach-plow' },
  { id: 'plow-field', title: 'Prepare a field', text: 'Drive the tractor across a field with the plow attached. Cover the soil until the field is tilled.', action: 'till-field' },
  { id: 'switch-to-planter', title: 'Fit the planter', text: 'Tap Next tool to switch the tractor from the plow to the planter. If it has no seeds, buy seeds at the shop first.', action: 'equip-planter' },
  { id: 'plant-field', title: 'Plant the tilled soil', text: 'Drive over the tilled soil with the planter. Crops grow over time; once they turn golden, harvest them with the appropriate machine.', action: 'plant-field' }
];

const copy = value => JSON.parse(JSON.stringify(value));

export class Tutorial {
  constructor() {
    this.started = false;
    this.paused = false;
    this.dismissed = false;
    this.completed = false;
    this.index = 0;
    this.actionComplete = false;
  }

  get currentStep() {
    return this.started && !this.dismissed && !this.completed ? copy(STEPS[this.index]) : null;
  }

  getState() {
    return {
      started: this.started,
      paused: this.paused,
      dismissed: this.dismissed,
      completed: this.completed,
      currentStep: this.currentStep,
      stepIndex: this.index,
      totalSteps: STEPS.length,
      progress: this.index / STEPS.length,
      actionComplete: this.actionComplete
    };
  }

  start() {
    if (this.dismissed || this.completed) return this.getState();
    this.started = true;
    this.paused = false;
    return this.getState();
  }

  reset() {
    this.started = false;
    this.paused = false;
    this.dismissed = false;
    this.completed = false;
    this.index = 0;
    this.actionComplete = false;
    return this.getState();
  }

  pause() {
    if (this.started && !this.dismissed && !this.completed) this.paused = true;
    return this.getState();
  }

  resume() {
    if (this.started && !this.dismissed && !this.completed) this.paused = false;
    return this.getState();
  }

  recordAction(action) {
    const step = this.currentStep;
    if (!step || this.paused || !step.action || step.action !== action || this.actionComplete) return false;
    this.actionComplete = true;
    return true;
  }

  skipStep() {
    if (!this.started || this.paused || this.dismissed || this.completed) return this.getState();
    this.actionComplete = true;
    return this.completeStep();
  }

  completeStep() {
    if (!this.started || this.paused || this.dismissed || this.completed || !this.actionComplete) return this.getState();
    this.index++;
    this.actionComplete = false;
    if (this.index >= STEPS.length) {
      this.index = STEPS.length;
      this.completed = true;
      this.paused = false;
    }
    return this.getState();
  }

  dismiss() {
    this.dismissed = true;
    this.paused = false;
    this.actionComplete = false;
    return this.getState();
  }

  exportProgress() {
    return {
      version: VERSION,
      started: this.started,
      paused: this.paused,
      dismissed: this.dismissed,
      completed: this.completed,
      stepIndex: this.index,
      actionComplete: this.actionComplete
    };
  }

  restoreProgress(data) {
    // Reject legacy, malformed, and impossible combinations without changing
    // current progress. Callers can safely ignore a false return value.
    if (!data || typeof data !== 'object' || Array.isArray(data) || ![1, VERSION].includes(data.version) ||
        !['started', 'paused', 'dismissed', 'completed'].every(key => typeof data[key] === 'boolean') ||
        !Number.isInteger(data.stepIndex) || data.stepIndex < 0 || data.stepIndex > STEPS.length) return false;
    const { started, paused, dismissed, completed, stepIndex } = data;
    const actionComplete = data.version === 1 ? false : data.actionComplete;
    if (typeof actionComplete !== 'boolean') return false;
    if ((!started && (paused || stepIndex !== 0 || completed || dismissed || actionComplete)) ||
        (paused && (!started || dismissed || completed)) ||
        (dismissed && completed) ||
        (completed !== (stepIndex === STEPS.length)) ||
        (dismissed && !started) ||
        ((completed || dismissed) && actionComplete)) return false;
    this.started = started;
    this.paused = paused;
    this.dismissed = dismissed;
    this.completed = completed;
    this.index = stepIndex;
    this.actionComplete = actionComplete;
    return true;
  }
}

export { STEPS as TUTORIAL_STEPS };
export default Tutorial;
