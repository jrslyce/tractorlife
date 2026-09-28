// Small-device rendering and update budget. Kept independent from Three.js so
// the policy can be unit-tested in Node without a WebGL context.
export function deviceProfile(nav, width) {
  nav = nav || {};
  var constrained = !!(nav.saveData ||
    (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) ||
    (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) ||
    (width <= 760 && /android|iphone|ipad|ipod/i.test(nav.userAgent || '')));
  var motion = nav.reducedMotion === true;
  return {
    constrained: constrained || motion,
    maxDpr: constrained ? 1 : 1.5,
    minDpr: constrained ? 0.65 : 0.8,
    targetFps: constrained || motion ? 30 : 60,
    maxView: constrained ? 950 : 1000,
    fogFar: constrained ? 340 : 430,
    shadows: !constrained,
    shadowMapSize: constrained ? 0 : 1024,
    poseInterval: constrained ? 250 : 125
  };
}

export class PerformanceBudget {
  constructor(nav, width, height) {
    this.profile = deviceProfile(nav, width);
    this._dpr = Math.min((typeof devicePixelRatio === 'number' ? devicePixelRatio : 1), this.profile.maxDpr);
    this._scale = 1;
    this._levels = this.profile.constrained ? [1, 0.8, 0.65] : [1, 0.85, 0.7];
    this._slowFrames = 0;
    this._fastSince = 0;
    this._lastFrame = 0;
    this._lastLabels = 0;
    this._lastHud = 0;
    this._lastSun = 0;
  }

  get pixelRatio() { return this._dpr * this._scale; }
  get frameInterval() { return 1000 / this.profile.targetFps; }

  shouldRender(now) {
    if (this._lastFrame && now - this._lastFrame < this.frameInterval - 1) return false;
    this._lastFrame = now;
    return true;
  }

  _due(now, key, interval) {
    var prop = '_last' + key;
    if (now - this[prop] < interval) return false;
    this[prop] = now;
    return true;
  }

  shouldUpdateLabels(now) { return this._due(now, 'Labels', 100); }
  shouldUpdateHud(now) { return this._due(now, 'Hud', 100); }
  shouldUpdateSun(now) { return this._due(now, 'Sun', 66); }

  observeFrame(frameMs, now, apply) {
    var budget = this.frameInterval;
    if (frameMs > budget * 1.45) {
      this._slowFrames++;
      this._fastSince = 0;
      if (this._slowFrames >= 8) {
        this._slowFrames = 0;
        var i = this._levels.indexOf(this._scale);
        if (i >= 0 && i < this._levels.length - 1) {
          this._scale = this._levels[i + 1];
          if (apply) apply(this.pixelRatio);
        }
      }
    } else {
      this._slowFrames = 0;
      if (!this._fastSince) this._fastSince = now;
      if (now - this._fastSince > 12000 && this._scale !== 1) {
        this._scale = 1;
        this._fastSince = now;
        if (apply) apply(this.pixelRatio);
      }
    }
  }

  setSize(renderer, width, height) {
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(width, height, false);
  }
}
