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
