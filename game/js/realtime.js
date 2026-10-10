// Best-effort authenticated realtime transport. The Worker session cookie is
// sent automatically by same-origin WebSocket upgrades.
export class RealtimeClient {
  constructor(getPose, onMessage, poseInterval) {
    this._getPose = getPose;
    this._onMessage = onMessage || function () {};
    this._socket = null;
    this._timer = null;
    this._retry = null;
    this._closed = false;
    this._delay = 1000;
    this._poseInterval = Math.max(125, Number(poseInterval) || 125);
    this._onVisibility = this._onVisibility.bind(this);
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  connect() {
    if (this._closed || typeof WebSocket === 'undefined' || this._socket) return;
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var socket;
    try { socket = new WebSocket(protocol + '//' + location.host + '/api/realtime'); }
    catch (err) { this._scheduleRetry(); return; }
    this._socket = socket;
    var self = this;
    socket.onopen = function () {
      self._delay = 1000;
      self._startPoseTimer();
      self.sendPose();
    };
    socket.onmessage = function (event) {
      var data;
      try { data = JSON.parse(event.data); } catch (err) { return; }
      if (data && typeof data.type === 'string') self._onMessage(data);
    };
    socket.onerror = function () { try { socket.close(); } catch (err) { /* ignore */ } };
    socket.onclose = function () {
      self._socket = null;
      if (self._timer !== null) { clearInterval(self._timer); self._timer = null; }
      self._scheduleRetry();
    };
  }

  _startPoseTimer() {
    if (this._timer !== null || document.hidden || !this._socket || this._socket.readyState !== WebSocket.OPEN) return;
    var self = this;
    this._timer = setInterval(function () { self.sendPose(); }, this._poseInterval);
  }

  _onVisibility() {
    if (document.hidden) {
      if (this._timer !== null) { clearInterval(this._timer); this._timer = null; }
    } else this._startPoseTimer();
  }

  _scheduleRetry() {
    if (this._closed || this._retry !== null) return;
    var self = this;
    this._retry = setTimeout(function () {
      self._retry = null;
      self._delay = Math.min(self._delay * 2, 30000);
      self.connect();
    }, this._delay);
  }

  _send(message) {
    if (!this._socket || this._socket.readyState !== WebSocket.OPEN) return false;
    try { this._socket.send(JSON.stringify(message)); return true; }
    catch (err) { return false; }
  }

  sendPose() {
    if (document.hidden) return;
    var pose;
    try { pose = this._getPose(); } catch (err) { return; }
    if (pose) this._send({ type: 'pose', pose: pose });
  }

  sendBuild(entry) {
    return this._send({ type: 'build', entry: entry });
  }

  close() {
    this._closed = true;
    document.removeEventListener('visibilitychange', this._onVisibility);
    if (this._retry !== null) { clearTimeout(this._retry); this._retry = null; }
    if (this._timer !== null) { clearInterval(this._timer); this._timer = null; }
    if (this._socket) {
      var socket = this._socket;
      this._socket = null;
      try { socket.close(1000, 'leaving'); } catch (err) { /* ignore */ }
    }
  }
}
