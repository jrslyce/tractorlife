import test from 'node:test';
import assert from 'node:assert/strict';
import { ShopUI } from '../js/shopui.js';

test('shop locks gameplay while open and restores the previous lock on close', () => {
  const previousWindow = globalThis.window;
  try {
    globalThis.window = { VT_LOCKED: false };
    const shop = Object.create(ShopUI.prototype);
    Object.assign(shop, { _open: false, _message: {}, _overlay: { style: {} },
      _close: { focus() {} }, refreshBalance() {}, _showMenu() {} });
    shop.open();
    assert.equal(window.VT_LOCKED, true);
    shop.open(); // Re-opening must not replace the original unlocked state.
    shop.close();
    assert.equal(window.VT_LOCKED, false);
    window.VT_LOCKED = true;
    shop.open();
    shop.close();
    assert.equal(window.VT_LOCKED, true);
    shop.close(); // An already closed shop must not unlock another modal.
    assert.equal(window.VT_LOCKED, true);
  } finally { globalThis.window = previousWindow; }
});

test('farmer roster refresh updates purchase labels without rewriting sell buttons', () => {
  const shop = Object.create(ShopUI.prototype);
  const buy = { textContent: 'Buy · $12' };
  const sell = { textContent: 'Sell all' };
  Object.assign(shop, { _recipient: { value: '', options: [{}] }, _list: {
    querySelectorAll(selector) {
      return selector === '.shop-buy[data-purchase]' ? [buy] : [buy, sell];
    }
  } });
  shop.setRecipients([], 'owner@example.com');
  assert.equal(buy.textContent, 'Buy · $12');
  assert.equal(sell.textContent, 'Sell all');
});

test('selling the last crop keeps the receipt visible in the Sell harvest section', () => {
  const previousDocument = globalThis.document;
  let crops = [{ id: 'wheat', name: 'Wheat', emoji: '🌾', qty: 2, value: 4 }];
  const element = () => ({ children: [], appendChild(child) { this.children.push(child); },
    set textContent(value) { this.value = value; this.children = []; }, get textContent() { return this.value || ''; },
    addEventListener(type, callback) { this[type] = callback; } });
  try {
    globalThis.document = { createElement: element };
    const shop = Object.create(ShopUI.prototype);
    Object.assign(shop, { _produce: element(), _message: element(), _category: { sell: true },
      _getProduce: () => crops, _onSell: () => { crops = []; return { ok: true }; },
      refreshBalance() { this._renderProduce(); }, _showMenu() { throw new Error('Sale confirmation was lost'); } });
    shop._renderProduce();
    shop._produce.children[0].children[2].click();
    assert.equal(shop._message.textContent, 'Sold 2 Wheat for $8!');
    assert.equal(shop._category.sell, true);
    assert.match(shop._produce.children[0].textContent, /No harvest to sell yet/);
  } finally { globalThis.document = previousDocument; }
});
