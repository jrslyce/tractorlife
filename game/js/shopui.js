// Shop UI is DOM-based so the catalog stays readable on touch devices.
import { ITEMS } from './items.js';

var CATEGORIES = ['Roads', 'Building', 'Lighting', 'Farm supplies', 'Decorating', 'Autumn decor'];

export class ShopUI {
  constructor(options) {
    this._getMoney = options.getMoney;
    this._onPurchase = options.onPurchase;
    this._onGift = options.onGift;
    this._getProduce = options.getProduce || function () { return []; };
    this._onSell = options.onSell;
    this._open = false;
    this._style = document.createElement('style');
    this._style.textContent = [
      '#shop-overlay{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(20,31,17,.62);font-family:system-ui,-apple-system,sans-serif;color:#233018;box-sizing:border-box}',
      '#shop-panel{width:min(760px,100%);max-height:min(88vh,820px);display:flex;flex-direction:column;background:#fffbe8;border:4px solid #2f4d1f;border-radius:20px;box-shadow:0 8px 0 rgba(0,0,0,.25);overflow:hidden}',
      '#shop-head{padding:16px 20px;background:#e8d6a8;border-bottom:3px solid #2f4d1f;display:flex;align-items:center;justify-content:space-between;gap:12px}',
      '#shop-head h2{margin:0;font-size:24px}#shop-balance{font-weight:800;font-size:18px}',
      '#shop-close{border:2px solid #2f4d1f;border-radius:10px;background:#fffbe8;font-size:20px;font-weight:800;width:44px;height:44px;cursor:pointer}',
      '#shop-greeting{margin:0;padding:12px 20px 4px;font-size:15px}',
      '#shop-recipient{display:flex;align-items:center;gap:8px;padding:8px 20px;font-weight:700}#shop-recipient select{min-height:42px;max-width:70%;padding:6px 10px;border:2px solid #2f4d1f;border-radius:9px;background:#fff;color:#233018;font-size:15px}',
      '#shop-list{padding:8px 18px 18px;overflow:auto;overscroll-behavior:contain}',
      '.shop-category{margin:14px 0 6px;font-size:17px;color:#385b25}',
      '.shop-row{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(47,77,31,.2)}',
      '.shop-emoji{font-size:28px;text-align:center}.shop-name{font-weight:750}.shop-desc{font-size:13px;opacity:.8;margin-top:2px}',
      '#shop-list{flex:1;min-height:80px}',
      '#shop-produce{padding:4px 18px 16px;border-top:2px dashed rgba(47,77,31,.3)}#shop-produce h3{margin:10px 0 4px;color:#385b25}',
      '.shop-buy{min-width:96px;min-height:44px;padding:7px 10px;border:2px solid #2f4d1f;border-radius:10px;background:#ffe066;color:#233018;font-weight:800;font-size:15px;cursor:pointer}',
      '.shop-buy:disabled{opacity:.5;cursor:not-allowed}#shop-msg{min-height:22px;padding:0 20px 12px;font-weight:700;color:#8b3e2d}',
      '@media(max-width:520px){#shop-overlay{padding:8px}#shop-panel{max-height:94vh}#shop-head{padding:12px}#shop-head h2{font-size:20px}.shop-row{grid-template-columns:34px minmax(0,1fr) 82px;gap:7px}.shop-buy{min-width:82px;font-size:13px}.shop-desc{font-size:12px}}'
    ].join('\n');
    document.head.appendChild(this._style);
    this._build();
    this._onKey = this._onKey.bind(this);
    document.addEventListener('keydown', this._onKey);
  }

  _build() {
    var self = this;
    var overlay = document.createElement('div');
    overlay.id = 'shop-overlay';
    overlay.setAttribute('role', 'presentation');
    var panel = document.createElement('section');
    panel.id = 'shop-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'shop-title');

    var head = document.createElement('header');
    head.id = 'shop-head';
    var title = document.createElement('h2');
    title.id = 'shop-title';
    title.textContent = '🍂 Harvest & Home Shop';
    this._balance = document.createElement('div');
    this._balance.id = 'shop-balance';
    this._close = document.createElement('button');
    this._close.id = 'shop-close';
    this._close.type = 'button';
    this._close.textContent = '×';
    this._close.setAttribute('aria-label', 'Close shop');
    this._close.addEventListener('click', function () { self.close(); });
    head.appendChild(title);
    head.appendChild(this._balance);
    head.appendChild(this._close);

    var greeting = document.createElement('p');
    greeting.id = 'shop-greeting';
    greeting.textContent = 'Welcome, farmer! What are we making today?';
    this._recipientWrap = document.createElement('label');
    this._recipientWrap.id = 'shop-recipient';
    this._recipientWrap.appendChild(document.createTextNode('Shopping for:'));
    this._recipient = document.createElement('select');
    this._recipient.setAttribute('aria-label', 'Choose who receives the purchase');
    var selfRecipient = document.createElement('option');
    selfRecipient.value = '';
    selfRecipient.textContent = 'My inventory';
    this._recipient.appendChild(selfRecipient);
    this._recipient.addEventListener('change', function () {
      var buttons = self._list ? self._list.querySelectorAll('.shop-buy') : [];
      for (var bi = 0; bi < buttons.length; bi++) {
        var price = buttons[bi].textContent.substring(buttons[bi].textContent.indexOf('$'));
        buttons[bi].textContent = (self._recipient.value ? 'Gift · ' : 'Buy · ') + price;
      }
    });
    this._recipientWrap.appendChild(this._recipient);
    this._list = document.createElement('div');
    this._list.id = 'shop-list';
    this._produce = document.createElement('div');
    this._produce.id = 'shop-produce';
    this._message = document.createElement('div');
    this._message.id = 'shop-msg';
    panel.appendChild(head);
    panel.appendChild(greeting);
    panel.appendChild(this._recipientWrap);
    panel.appendChild(this._list);
    panel.appendChild(this._produce);
    panel.appendChild(this._message);
    overlay.appendChild(panel);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) self.close(); });
    document.body.appendChild(overlay);
    this._overlay = overlay;
    this._renderItems();
  }

  _renderItems() {
    var self = this;
    var groups = {};
    for (var i = 0; i < ITEMS.length; i++) {
      if (!groups[ITEMS[i].category]) groups[ITEMS[i].category] = [];
      groups[ITEMS[i].category].push(ITEMS[i]);
    }
    for (var ci = 0; ci < CATEGORIES.length; ci++) {
      var category = CATEGORIES[ci];
      if (!groups[category]) continue;
      var heading = document.createElement('h3');
      heading.className = 'shop-category';
      heading.textContent = category;
      this._list.appendChild(heading);
      for (var j = 0; j < groups[category].length; j++) {
        (function (item) {
          var row = document.createElement('div');
          row.className = 'shop-row';
          var emoji = document.createElement('div');
          emoji.className = 'shop-emoji';
          emoji.textContent = item.emoji;
          var info = document.createElement('div');
          var name = document.createElement('div');
          name.className = 'shop-name';
          name.textContent = item.name;
          var desc = document.createElement('div');
          desc.className = 'shop-desc';
          desc.textContent = item.description;
          info.appendChild(name);
          info.appendChild(desc);
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'shop-buy';
          button.textContent = (self._recipient.value ? 'Gift · $' : 'Buy · $') + item.price;
          button.addEventListener('click', function () { self._purchase(item); });
          row.appendChild(emoji);
          row.appendChild(info);
          row.appendChild(button);
          self._list.appendChild(row);
        })(groups[category][j]);
      }
    }
  }

  _purchase(item) {
    var recipient = this._recipient ? this._recipient.value : '';
    if (recipient) {
      if (typeof this._onGift !== 'function') {
        this._message.textContent = 'Gifting is not available right now.';
        return;
      }
      this._message.textContent = 'Sending ' + item.name + '…';
      var giftResult = this._onGift(item, 1, recipient);
      var self = this;
      if (giftResult && typeof giftResult.then === 'function') {
        giftResult.then(function (result) { self._finishGift(item, result); }, function () {
          self._message.textContent = 'Gift could not be sent. Try again.';
        });
      } else this._finishGift(item, giftResult);
      return;
    }
    var balance = Number(this._getMoney());
    if (!isFinite(balance) || balance < item.price) {
      this._message.textContent = 'Not enough coins for ' + item.name + ' yet.';
      return;
    }
    if (typeof this._onPurchase !== 'function') {
      this._message.textContent = 'The inventory is not ready yet.';
      return;
    }
    var result = this._onPurchase(item, 1);
    if (!result || result.ok === false) {
      this._message.textContent = result && result.error ? result.error : 'Could not complete this purchase.';
      return;
    }
    this._message.textContent = 'Bought ' + item.name + '!';
    this.refreshBalance();
  }

  _renderProduce() {
    if (!this._produce) return;
    this._produce.textContent = '';
    var produce = this._getProduce() || [];
    if (!produce.length) return;
    var heading = document.createElement('h3');
    heading.textContent = '📦 Sell your harvest';
    this._produce.appendChild(heading);
    for (var i = 0; i < produce.length; i++) {
      (function (entry, ui) {
        var row = document.createElement('div'); row.className = 'shop-row';
        var icon = document.createElement('div'); icon.className = 'shop-emoji'; icon.textContent = entry.emoji;
        var info = document.createElement('div');
        var name = document.createElement('div'); name.className = 'shop-name'; name.textContent = entry.name + ' × ' + entry.qty;
        var desc = document.createElement('div'); desc.className = 'shop-desc'; desc.textContent = '$' + entry.value + ' each · total $' + (entry.value * entry.qty);
        info.appendChild(name); info.appendChild(desc);
        var button = document.createElement('button'); button.type = 'button'; button.className = 'shop-buy'; button.textContent = 'Sell all';
        button.addEventListener('click', function () {
          var result = ui._onSell ? ui._onSell(entry.id, entry.qty, entry.value) : { ok: false };
          if (!result || result.ok === false) {
            ui._message.textContent = result && result.error ? result.error : 'Could not sell this harvest.';
            return;
          }
          ui._message.textContent = 'Sold ' + entry.qty + ' ' + entry.name + ' for $' + (entry.qty * entry.value) + '!';
          ui.refreshBalance();
          ui._renderProduce();
        });
        row.appendChild(icon); row.appendChild(info); row.appendChild(button); ui._produce.appendChild(row);
      })(produce[i], this);
    }
  }

  _finishGift(item, result) {
    if (!result || result.ok === false) {
      this._message.textContent = result && result.error ? result.error : 'Gift could not be sent.';
      return;
    }
    var option = this._recipient.options[this._recipient.selectedIndex];
    this._message.textContent = '🎁 Sent ' + item.name + ' to ' + (option ? option.textContent : 'your friend') + '!';
    this.refreshBalance();
  }

  setRecipients(farmers, ownEmail) {
    if (!this._recipient) return;
    var selected = this._recipient.value;
    while (this._recipient.options.length > 1) this._recipient.remove(1);
    var own = String(ownEmail || '').toLowerCase();
    for (var i = 0; i < farmers.length; i++) {
      var email = farmers[i] && String(farmers[i].email || '');
      if (!email || email.toLowerCase() === own) continue;
      var option = document.createElement('option');
      option.value = email;
      option.textContent = email;
      this._recipient.appendChild(option);
    }
    this._recipient.value = selected;
    var buttons = this._list.querySelectorAll('.shop-buy');
    for (var b = 0; b < buttons.length; b++) {
      var label = buttons[b].textContent.split(' · $').pop();
      buttons[b].textContent = (this._recipient.value ? 'Gift · $' : 'Buy · $') + label;
    }
  }

  refreshBalance() {
    if (this._balance) this._balance.textContent = '💰 $' + Math.max(0, Math.floor(Number(this._getMoney()) || 0));
    this._renderProduce();
  }

  open() {
    this._open = true;
    this._message.textContent = '';
    this.refreshBalance();
    this._overlay.style.display = 'flex';
    this._close.focus();
  }

  close() {
    this._open = false;
    this._overlay.style.display = 'none';
  }

  isOpen() { return this._open; }

  _onKey(e) {
    if (this._open && e.key === 'Escape') this.close();
  }

  dispose() {
    document.removeEventListener('keydown', this._onKey);
    if (this._overlay && this._overlay.parentNode) this._overlay.parentNode.removeChild(this._overlay);
    if (this._style && this._style.parentNode) this._style.parentNode.removeChild(this._style);
  }
}
