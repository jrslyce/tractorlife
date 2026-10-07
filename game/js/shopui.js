// Shop UI is DOM-based so the catalog stays readable on touch devices.
import { ITEMS } from './items.js';

var CATEGORIES = [
  { name: 'Building materials', icon: '🧱', includes: function (item) { return item.category === 'Roads' || item.category === 'Building'; } },
  { name: 'Seeds', icon: '🌱', includes: function (item) { return /_seeds$/.test(item.id); } },
  { name: 'Farm supplies', icon: '🧰', includes: function (item) { return item.category === 'Farm supplies' && !/_seeds$/.test(item.id); } },
  { name: 'Lighting', icon: '💡', includes: function (item) { return item.category === 'Lighting'; } },
  { name: 'Decorating', icon: '🎨', includes: function (item) { return item.category === 'Decorating'; } },
  { name: 'Autumn decor', icon: '🍂', includes: function (item) { return item.category === 'Autumn decor'; } }
];

export class ShopUI {
  constructor(options) {
    this._getMoney = options.getMoney;
    this._onPurchase = options.onPurchase;
    this._onGift = options.onGift;
    this._getProduce = options.getProduce || function () { return []; };
    this._onSell = options.onSell;
    this._open = false;
    this._category = null;
    this._style = document.createElement('style');
    this._style.textContent = [
      '#shop-overlay{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;padding:12px;padding:calc(8px + env(safe-area-inset-top)) calc(8px + env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) calc(8px + env(safe-area-inset-left));background:rgba(5,12,8,.76);font-family:system-ui,-apple-system,sans-serif;color:#f4f4e7;box-sizing:border-box;touch-action:pan-y}',
      '#shop-panel{width:min(760px,100%);max-height:88vh;max-height:88dvh;min-height:0;display:flex;flex-direction:column;background:#1b281f;border:3px solid #a9ca72;border-radius:10px;box-shadow:6px 6px 0 rgba(0,0,0,.45);overflow:hidden}',
      '#shop-head{padding:13px 16px;background:#344a32;border-bottom:2px solid #a9ca72;display:flex;align-items:center;justify-content:space-between;gap:12px}',
      '#shop-head h2{margin:0;font-size:22px;color:#ffe36b}#shop-balance{font-weight:850;font-size:17px;color:#ffe36b;font-variant-numeric:tabular-nums}',
      '#shop-close{flex:none;border:2px solid #b6d77a;border-radius:6px;background:#202c22;color:#f7f6e9;font-size:20px;font-weight:800;width:44px;height:44px;cursor:pointer}',
      '#shop-back{display:none;min-width:64px;min-height:44px;border:2px solid #b6d77a;border-radius:6px;background:#202c22;color:#f7f6e9;font-size:15px;font-weight:800;cursor:pointer}#shop-head-actions{display:flex;align-items:center;gap:8px}#shop-head h2{min-width:0;line-height:1.2}',
      '#shop-greeting{margin:0;padding:12px 20px 4px;font-size:15px}',
      '#shop-recipient{display:flex;align-items:center;gap:8px;padding:8px 20px;font-weight:700}#shop-recipient select{min-height:42px;max-width:70%;padding:6px 10px;border:2px solid #a9ca72;border-radius:6px;background:#202c22;color:#f7f6e9;font-size:15px}',
      '#shop-list{padding:8px 18px 18px;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain;flex:1;min-height:0}',
      '#shop-menu{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:8px 0}#shop-menu button{display:flex;align-items:center;gap:12px;min-height:70px;padding:12px;border:2px solid #9dbd70;border-radius:9px;background:#293c2c;color:#f7f6e9;text-align:left;font:800 16px system-ui,sans-serif;cursor:pointer;touch-action:manipulation}#shop-menu .shop-menu-icon{font-size:28px;flex:none}#shop-menu button:active,#shop-menu button:hover{background:#405738}',
      '.shop-category{margin:14px 0 6px;font-size:16px;color:#b9e27e;text-transform:uppercase;letter-spacing:.05em}',
      '.shop-row{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(169,202,114,.25)}',
      '.shop-emoji{font-size:28px;text-align:center}.shop-name{font-weight:750}.shop-desc{font-size:13px;opacity:.8;margin-top:2px}',
      '#shop-produce h3{margin:10px 0 4px;color:#b9e27e}',
      '.shop-buy{min-width:96px;min-height:44px;padding:7px 10px;border:2px solid #b6d77a;border-radius:6px;background:#ffe36b;color:#233018;font-weight:850;font-size:14px;cursor:pointer;box-shadow:0 3px 0 #98ad4b}',
      '.shop-buy:active{transform:translateY(2px);box-shadow:0 1px 0 #98ad4b}.shop-buy:disabled{opacity:.5;cursor:not-allowed}#shop-msg{min-height:22px;padding:0 20px 12px;font-weight:700;color:#ffe36b}',
      '#shop-panel button:focus-visible,#shop-panel select:focus-visible{outline:3px solid #ffe36b;outline-offset:2px}',
      '@media(max-width:520px){#shop-panel{max-height:96vh;max-height:96dvh}#shop-head{padding:10px;gap:5px;flex-wrap:wrap}#shop-head h2{font-size:17px;flex:1 1 100%}#shop-head-actions{width:100%;justify-content:space-between}#shop-balance{font-size:14px}#shop-list{padding:6px 12px 12px}#shop-menu{grid-template-columns:1fr}#shop-menu button{min-height:54px}.shop-row{grid-template-columns:34px minmax(0,1fr) 82px;gap:7px}.shop-buy{min-width:82px;font-size:13px}.shop-desc{font-size:12px}}',
      '@media(max-height:500px){#shop-panel{max-height:96vh;max-height:96dvh}#shop-greeting{padding:4px 12px}#shop-recipient{padding:4px 12px}}'
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
    this._back = document.createElement('button');
    this._back.id = 'shop-back';
    this._back.type = 'button';
    this._back.textContent = '← Back';
    this._back.addEventListener('click', function () { self._showMenu(); });
    var actions = document.createElement('div');
    actions.id = 'shop-head-actions';
    actions.appendChild(this._balance);
    actions.appendChild(this._back);
    actions.appendChild(this._close);
    head.appendChild(title);
    head.appendChild(actions);

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
    this._list.setAttribute('tabindex', '0');
    this._list.setAttribute('aria-label', 'Shop items');
    this._produce = document.createElement('div');
    this._produce.id = 'shop-produce';
    this._message = document.createElement('div');
    this._message.id = 'shop-msg';
    panel.appendChild(head);
    panel.appendChild(greeting);
    this._greeting = greeting;
    panel.appendChild(this._recipientWrap);
    panel.appendChild(this._list);
    panel.appendChild(this._message);
    overlay.appendChild(panel);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) self.close(); });
    document.body.appendChild(overlay);
    this._overlay = overlay;
    this._showMenu();
  }

  _showMenu() {
    var self = this;
    var returning = !!this._category;
    this._category = null;
    this._list.textContent = '';
    this._list.scrollTop = 0;
    this._back.style.display = 'none';
    this._greeting.style.display = '';
    this._recipientWrap.style.display = 'none';
    var menu = document.createElement('div');
    menu.id = 'shop-menu';
    var categories = CATEGORIES.slice();
    if ((this._getProduce() || []).length) categories.push({ name: 'Sell harvest', icon: '📦', sell: true });
    for (var i = 0; i < categories.length; i++) {
      (function (category) {
        var button = document.createElement('button');
        button.type = 'button';
        var icon = document.createElement('span');
        icon.className = 'shop-menu-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = category.icon;
        var label = document.createElement('span'); label.textContent = category.name;
        button.appendChild(icon); button.appendChild(label);
        button.addEventListener('click', function () { self._showCategory(category); });
        menu.appendChild(button);
      })(categories[i]);
    }
    this._list.appendChild(menu);
    if (returning) menu.querySelector('button').focus();
  }

  _showCategory(category) {
    var self = this;
    this._category = category;
    this._list.textContent = '';
    this._list.scrollTop = 0;
    this._back.style.display = 'block';
    this._back.focus();
    this._greeting.style.display = 'none';
    this._recipientWrap.style.display = category.sell ? 'none' : 'flex';
    var heading = document.createElement('h3');
    heading.className = 'shop-category';
    heading.textContent = category.icon + ' ' + category.name;
    this._list.appendChild(heading);
    if (category.sell) {
      this._renderProduce();
      this._list.appendChild(this._produce);
    } else {
      for (var j = 0; j < ITEMS.length; j++) {
        if (!category.includes(ITEMS[j])) continue;
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
        })(ITEMS[j]);
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
          if (!(ui._getProduce() || []).length) ui._showMenu();
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
    if (this._category && this._category.sell) this._renderProduce();
  }

  open() {
    this._open = true;
    this._message.textContent = '';
    this.refreshBalance();
    this._showMenu();
    this._overlay.style.display = 'flex';
    this._close.focus();
  }

  close() {
    this._open = false;
    this._overlay.style.display = 'none';
  }

  isOpen() { return this._open; }

  _onKey(e) {
    if (this._open && e.key === 'Escape') {
      e.preventDefault();
      if (this._category) this._showMenu();
      else this.close();
    }
  }

  dispose() {
    document.removeEventListener('keydown', this._onKey);
    if (this._overlay && this._overlay.parentNode) this._overlay.parentNode.removeChild(this._overlay);
    if (this._style && this._style.parentNode) this._style.parentNode.removeChild(this._style);
  }
}
