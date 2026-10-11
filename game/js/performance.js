// Small-device rendering and update budget. Kept independent from Three.js so
// the policy can be unit-tested in Node without a WebGL context.
export function deviceProfile(nav, width, quality = 'auto') {
  nav = nav || {};
  var tablet = /ipad|iphone|ipod|android/i.test(nav.userAgent || '') ||
    (/mac/i.test(nav.platform || nav.userAgent || '') && nav.maxTouchPoints > 1);
  var constrained = !!(nav.saveData || tablet ||
    (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) ||
    (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) ||
    (width <= 760 && /android|iphone|ipad|ipod/i.test(nav.userAgent || '')));
  var motion = nav.reducedMotion === true;
  if (quality !== 'auto') constrained = quality === 'low';
  var balanced = quality === 'balanced';
  return {
    quality: quality,
    constrained: constrained || motion,
    maxDpr: constrained || balanced ? 1 : 1.5,
    minDpr: constrained ? 0.65 : 0.8,
    targetFps: constrained || motion || balanced ? 30 : 60,
    maxPixels: constrained ? 1000000 : balanced ? 1600000 : 3000000,
    cullDistance: constrained ? 280 : balanced ? 350 : 440,
    maxView: constrained ? 950 : 1000,
    fogFar: constrained ? 270 : balanced ? 340 : 430,
    shadows: !constrained && !balanced,
    antialias: !constrained && !balanced,
    cheapMaterials: constrained || balanced,
    simulationInterval: constrained ? 0.2 : 0.1,
    decorationInterval: constrained ? 0.1 : 0.033,
    shadowMapSize: constrained ? 0 : 1024,
    poseInterval: constrained ? 250 : 125
  };
}

export class PerformanceBudget {
  constructor(nav, width, height, quality = 'auto') {
    this.profile = deviceProfile(nav, width, quality);
    this._deviceDpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    this._dpr = this._baseRatio(width, height);
    this._scale = 1;
    this._levels = this.profile.constrained ? [1, 0.8, 0.65] : [1, 0.85, 0.7];
    this._slowFrames = 0;
    this._fastSince = 0;
    this._lastFrame = 0;
    this._lastLabels = 0;
    this._lastHud = 0;
    this._lastSun = 0;
    this._lastControls = 0;
    this._lastObserved = 0;
    this._samples = [];
  }

  get pixelRatio() { return this._dpr * this._scale; }
  get frameInterval() { return 1000 / this.profile.targetFps; }

  _baseRatio(width, height) {
    return Math.min(this._deviceDpr, this.profile.maxDpr,
      Math.sqrt(this.profile.maxPixels / Math.max(1, width * height)));
  }

  resetTiming() {
    this._lastFrame = this._lastObserved = this._fastSince = 0;
    this._slowFrames = 0;
    this._samples.length = 0;
  }

  shouldRender(now) {
    if (this._lastFrame && now - this._lastFrame < this.frameInterval - 1) return false;
    // Preserve the pacing remainder instead of drifting to 20 FPS on a 60 Hz display.
    this._lastFrame = this._lastFrame
      ? this._lastFrame + Math.max(1, Math.floor((now - this._lastFrame + 1) / this.frameInterval)) * this.frameInterval
      : now;
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
  shouldUpdateControls(now) { return this._due(now, 'Controls', 100); }

  observeFrame(frameMs, now, apply) {
    var budget = this.frameInterval;
    var interval = this._lastObserved ? now - this._lastObserved : budget;
    this._lastObserved = now;
    if (interval > 250) { this.resetTiming(); return; }
    // CPU submission time alone misses asynchronous GPU overload. Average the
    // intervals between actual rendered frames, excluding capped RAF callbacks.
    this._samples.push(interval);
    if (this._samples.length > 20) this._samples.shift();
    var average = this._samples.reduce((sum, value) => sum + value, 0) / this._samples.length;
    if (frameMs > budget * 0.95 || average > budget * 1.15) {
      this._slowFrames++;
      this._fastSince = 0;
      if (this._slowFrames >= 8) {
        this._slowFrames = 0;
        var i = this._levels.indexOf(this._scale);
        if (i >= 0 && i < this._levels.length - 1) {
          this._scale = this._levels[i + 1];
          this._samples.length = 0;
          if (apply) apply(this.pixelRatio);
        }
      }
    } else if (frameMs < budget * 0.7 && average < budget * 1.05) {
      this._slowFrames = 0;
      if (!this._fastSince) this._fastSince = now;
      if (now - this._fastSince > 12000 && this._scale !== 1) {
        this._scale = this._levels[Math.max(0, this._levels.indexOf(this._scale) - 1)];
        this._fastSince = now;
        if (apply) apply(this.pixelRatio);
      }
    } else { this._slowFrames = 0; this._fastSince = 0; }
  }

  setSize(renderer, width, height) {
    this._deviceDpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : this._deviceDpr;
    this._dpr = this._baseRatio(width, height);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(width, height, false);
  }
}
