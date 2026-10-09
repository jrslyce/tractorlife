// Presentation only: the caller validates the quote and transfers the harvest.
var nextDialogId = 0;
var PANEL_CSS = [
  '.grain-sale-overlay{position:fixed;inset:0;z-index:100;display:none;align-items:center;justify-content:center;padding:16px;padding:calc(12px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left));box-sizing:border-box;background:rgba(5,12,8,.8);color:#f4f4e7;font-family:system-ui,-apple-system,sans-serif;touch-action:pan-y}',
  '.grain-sale-panel{--grain-gold:#ffe36b;--grain-border:#a9ca72;width:min(520px,100%);max-height:90vh;max-height:90dvh;display:flex;flex-direction:column;min-height:0;background:#1b281f;border:3px solid var(--grain-border);border-radius:10px;box-shadow:6px 6px 0 rgba(0,0,0,.45);overflow:hidden}',
  '.grain-sale-head{padding:20px 22px 17px;background:#344a32;border-bottom:2px solid var(--grain-border)}',
  '.grain-sale-depot{margin:0 0 5px;color:#d0e6af;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em}',
  '.grain-sale-head h2{margin:0;color:#ffe36b;font-size:28px;line-height:1.15;font-weight:850}',
  '.grain-sale-body{padding:18px 22px;overflow-y:auto;min-height:0;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}',
  '.grain-sale-intro{margin:0 0 16px;font-size:14px;line-height:1.5;color:#dce5d1}',
  '.grain-sale-receipt{padding:0 14px;background:#233226;border:1px solid #6d8455;border-top:3px solid #a9ca72}',
  '.grain-sale-caption{margin:0;padding:11px 0;border-bottom:1px dashed #82946b;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;color:#c7dda8}',
  '.grain-sale-lines{list-style:none;padding:0;margin:0}',
  '.grain-sale-line{display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:10px;padding:12px 0;border-bottom:1px dashed #64754f}',
  '.grain-sale-line:last-child{border-bottom:0}.grain-sale-icon{font-size:25px;text-align:center}.grain-sale-name{font-size:15px;font-weight:750;overflow-wrap:anywhere}.grain-sale-rate{margin-top:3px;font-size:12px;color:#c7dda8}.grain-sale-value{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;text-align:right}',
  '.grain-sale-empty{padding:18px 0;font-size:14px;line-height:1.5;color:#dce5d1}',
  '.grain-sale-total{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 0 14px;border-bottom:2px dashed #82946b}.grain-sale-total-label{font-size:14px;font-weight:800}.grain-sale-quantity{display:block;margin-top:4px;font-size:12px;font-weight:500;color:#c7dda8}.grain-sale-total strong{font-size:clamp(28px,7vw,42px);line-height:1;color:#ffe36b;letter-spacing:-.035em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;min-width:0;text-align:right}',
  '.grain-sale-account{display:flex;justify-content:space-between;gap:12px;margin:14px 0 6px;font-size:13px;color:#dce5d1}.grain-sale-account strong{font-variant-numeric:tabular-nums;color:#f4f4e7}',
  '.grain-sale-note{margin:0;font-size:12px;line-height:1.5;color:#c7dda8}',
  '.grain-sale-error{margin:14px 0 0;padding:10px 12px;border-left:3px solid #ffd18a;background:#3a3022;color:#ffe0ad;font-size:14px;line-height:1.45}.grain-sale-error:empty{display:none}',
  '.grain-sale-actions{display:grid;gap:10px;padding:14px 22px 20px;border-top:1px solid #516442;background:#1b281f;flex-shrink:0}',
  '.grain-sale-actions button{min-height:48px;padding:10px 14px;border:2px solid #b6d77a;border-radius:6px;font:800 16px system-ui,-apple-system,sans-serif;cursor:pointer;touch-action:manipulation}',
  '.grain-sale-accept{background:#ffe36b;color:#233018;box-shadow:0 3px 0 #98ad4b}.grain-sale-accept:hover:not(:disabled){background:#fff09c}.grain-sale-accept:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 #98ad4b}.grain-sale-accept:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}',
  '.grain-sale-cancel{background:#293c2c;color:#f4f4e7}.grain-sale-cancel:hover{background:#405738}.grain-sale-cancel:active{background:#344a32}.grain-sale-panel button:focus-visible,.grain-sale-body:focus-visible{outline:3px solid #ffe36b;outline-offset:3px}',
  '@media(max-width:420px){.grain-sale-head{padding:16px}.grain-sale-head h2{font-size:25px}.grain-sale-body{padding:14px 16px}.grain-sale-actions{padding:12px 16px 16px}.grain-sale-line{gap:7px;grid-template-columns:26px minmax(0,1fr) auto}.grain-sale-receipt{padding:0 10px}}',
  '@media(max-height:500px){.grain-sale-panel{max-height:96vh;max-height:96dvh}.grain-sale-head{padding:10px 16px}.grain-sale-head h2{font-size:22px}.grain-sale-actions{grid-template-columns:minmax(0,1fr) auto;padding:10px 16px}.grain-sale-actions button{font-size:14px}}'
].join('\n');

function element(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function number(value) {
  var result = Number(value);
  return isFinite(result) ? result : 0;
}

function money(value) {
  return '$' + number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export class GrainSaleUI {
  constructor(options) {
    this._onAccept = options.onAccept;
    this._getMoney = options.getMoney;
    this._open = false;
    this._attempted = false;
    this._quote = null;
    var style = element('style');
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);
    this._build();
    this._onKey = this._onKey.bind(this);
    this._onFocus = this._onFocus.bind(this);
  }

  _build() {
    var self = this;
    var id = 'grain-sale-' + (++nextDialogId);
    this._overlay = element('div', 'grain-sale-overlay');
    this._panel = element('section', 'grain-sale-panel');
    this._panel.setAttribute('role', 'dialog');
    this._panel.setAttribute('aria-modal', 'true');
    this._panel.setAttribute('aria-labelledby', id + '-title');
    this._panel.setAttribute('aria-describedby', id + '-note');
    this._panel.tabIndex = -1;
    var head = element('header', 'grain-sale-head');
    head.appendChild(element('p', 'grain-sale-depot', 'Store grain depot'));
    var title = element('h2', '', 'Grain delivery');
    title.id = id + '-title';
    head.appendChild(title);
    this._panel.appendChild(head);
    this._body = element('div', 'grain-sale-body');
    this._body.tabIndex = 0;
    this._body.setAttribute('role', 'region');
    this._body.setAttribute('aria-label', 'Delivery receipt');
    this._body.appendChild(element('p', 'grain-sale-intro', 'Your harvest is ready for market. Here’s our offer for this delivery.'));
    var receipt = element('div', 'grain-sale-receipt');
    receipt.appendChild(element('p', 'grain-sale-caption', 'Harvest receipt · crop / amount'));
    this._lines = element('ul', 'grain-sale-lines');
    receipt.appendChild(this._lines);
    this._body.appendChild(receipt);
    var total = element('div', 'grain-sale-total');
    var label = element('div', 'grain-sale-total-label', 'Total offer');
    this._quantity = element('span', 'grain-sale-quantity');
    label.appendChild(this._quantity);
    total.appendChild(label);
    this._total = element('strong');
    total.appendChild(this._total);
    this._body.appendChild(total);
    var account = element('p', 'grain-sale-account');
    account.appendChild(element('span', '', 'Current account balance'));
    this._balance = element('strong');
    account.appendChild(this._balance);
    this._body.appendChild(account);
    var note = element('p', 'grain-sale-note', 'Proceeds go to your purchase balance. Your cargo stays with you until you accept.');
    note.id = id + '-note';
    this._body.appendChild(note);
    this._error = element('p', 'grain-sale-error');
    this._error.setAttribute('role', 'alert');
    this._body.appendChild(this._error);
    this._panel.appendChild(this._body);
    var actions = element('footer', 'grain-sale-actions');
    this._accept = element('button', 'grain-sale-accept');
    this._accept.type = 'button';
    this._accept.addEventListener('click', function () { self._collect(); });
    this._cancel = element('button', 'grain-sale-cancel', 'Not now');
    this._cancel.type = 'button';
    this._cancel.addEventListener('click', function () { self.close(); });
    actions.appendChild(this._accept);
    actions.appendChild(this._cancel);
    this._panel.appendChild(actions);
    this._overlay.appendChild(this._panel);
    document.body.appendChild(this._overlay);
  }

  isOpen() { return this._open; }

  open(quote) {
    if (!this._open) {
      this._previousFocus = document.activeElement;
      this._previousLock = window.VT_LOCKED;
    }
    this._quote = quote;
    this._attempted = false;
    this._error.textContent = '';
    this._lines.textContent = '';
    var lines = quote && Array.isArray(quote.lines) ? quote.lines : [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var row = element('li', 'grain-sale-line');
      var icon = element('span', 'grain-sale-icon', line.emoji || '');
      icon.setAttribute('aria-hidden', 'true');
      row.appendChild(icon);
      var details = element('div');
      details.appendChild(element('div', 'grain-sale-name', line.name));
      details.appendChild(element('div', 'grain-sale-rate', number(line.qty).toLocaleString() + ' × ' + money(line.unitValue) + ' each'));
      row.appendChild(details);
      row.appendChild(element('span', 'grain-sale-value', money(line.value)));
      this._lines.appendChild(row);
    }
    if (!lines.length) this._lines.appendChild(element('li', 'grain-sale-empty', 'No harvested crops to sell. Bring a loaded wagon to the depot.'));
    var quantity = number(quote && quote.quantity);
    var value = number(quote && quote.value);
    this._quantity.textContent = quantity.toLocaleString() + (quantity === 1 ? ' crop delivered' : ' crops delivered');
    this._total.textContent = money(value);
    this._balance.textContent = money(this._getMoney());
    this._accept.textContent = 'Accept & collect ' + money(value);
    this._accept.disabled = !lines.length || quantity <= 0 || value < 0;
    this._open = true;
    window.VT_LOCKED = true;
    this._overlay.style.display = 'flex';
    this._body.scrollTop = 0;
    document.addEventListener('keydown', this._onKey, true);
    document.addEventListener('focusin', this._onFocus, true);
    // Start on the safe action so an arriving player's held Enter cannot sell cargo.
    this._cancel.focus();
  }

  close() {
    if (!this._open) return;
    this._open = false;
    this._overlay.style.display = 'none';
    document.removeEventListener('keydown', this._onKey, true);
    document.removeEventListener('focusin', this._onFocus, true);
    window.VT_LOCKED = this._previousLock;
    this._quote = null;
    if (this._previousFocus && this._previousFocus.isConnected && typeof this._previousFocus.focus === 'function') {
      this._previousFocus.focus();
    }
  }

  _collect() {
    if (!this._open || this._attempted || this._accept.disabled) return;
    this._attempted = true;
    this._accept.disabled = true;
    var result;
    try {
      result = typeof this._onAccept === 'function' ? this._onAccept(this._quote) : null;
    } catch (error) {
      result = { ok: false, error: 'Could not complete this delivery. Please reopen the offer to try again.' };
    }
    if (result && result.ok === true) {
      this.close();
      return;
    }
    this._error.textContent = result && result.error ? result.error : 'This offer is no longer available. Reopen the delivery to get a fresh offer.';
    this._error.scrollIntoView({ block: 'nearest' });
    this._cancel.focus({ preventScroll: true });
  }

  _onFocus(event) {
    if (this._open && !this._panel.contains(event.target)) this._cancel.focus();
  }

  _onKey(event) {
    if (!this._open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var stops = [this._body];
    if (!this._accept.disabled) stops.push(this._accept);
    stops.push(this._cancel);
    var index = stops.indexOf(document.activeElement);
    var next = event.shiftKey ? (index <= 0 ? stops.length - 1 : index - 1) : (index + 1) % stops.length;
    stops[next].focus();
  }
}
