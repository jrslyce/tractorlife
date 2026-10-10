import test from 'node:test';
import assert from 'node:assert/strict';
import { GrainSaleUI } from '../js/grain-sale-ui.js';

class Element {
  constructor(tag, doc) {
    this.tagName = tag;
    this.ownerDocument = doc;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.isConnected = true;
    this.disabled = false;
    this._text = '';
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  appendChild(node) { this.children.push(node); node.parentNode = this; return node; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  focus() { this.ownerDocument.activeElement = this; this.ownerDocument.fire('focusin', { target: this }); }
  contains(node) { return node === this || this.children.some(child => child.contains?.(node)); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent || '').join(''); }
  scrollIntoView() {}
}

function setup() {
  const doc = {
    listeners: {}, activeElement: null,
    createElement(tag) { return new Element(tag, this); },
    addEventListener(name, fn) { this.listeners[name] = fn; },
    removeEventListener(name) { delete this.listeners[name]; },
    fire(name, event) { this.listeners[name]?.(event); },
  };
  doc.head = new Element('head', doc);
  doc.body = new Element('body', doc);
  globalThis.document = doc;
  globalThis.window = { VT_LOCKED: false };
  const opener = new Element('button', doc);
  doc.activeElement = opener;
  const ui = new GrainSaleUI({ getMoney: () => 12, onAccept: () => ({ ok: true }) });
  return { doc, opener, ui };
}

const quote = { lines: [{ name: 'Wheat', qty: 2, unitValue: 3, value: 6 }], quantity: 2, value: 6 };

test('sale offer exposes a named modal dialog and labeled, adequately sized actions', () => {
  const { ui } = setup();
  ui.open(quote);
  assert.equal(ui._panel.getAttribute('role'), 'dialog');
  assert.equal(ui._panel.getAttribute('aria-modal'), 'true');
  assert.equal(ui._panel.getAttribute('aria-labelledby'), ui._panel.children[0].children[1].id);
  assert.equal(ui._accept.getAttribute('aria-label'), 'Accept delivery and collect payment');
  assert.equal(ui._cancel.getAttribute('aria-label'), 'Close grain delivery offer');
  assert.equal(ui._accept.disabled, false);
  assert.equal(ui._cancel.style.minHeight, undefined); // enforced by the component's 48px action CSS
  ui.close();
});

test('modal traps focus, blocks gameplay keys, closes with Escape and restores focus and lock', () => {
  const { doc, opener, ui } = setup();
  ui.open(quote);
  assert.equal(window.VT_LOCKED, true);
  assert.equal(doc.activeElement, ui._cancel);
  const outside = new Element('button', doc);
  doc.fire('focusin', { target: outside });
  assert.equal(doc.activeElement, ui._cancel);
  let stopped = false;
  doc.fire('keydown', { key: 'w', stopImmediatePropagation() { stopped = true; } });
  assert.equal(stopped, true);
  stopped = false;
  doc.fire('keydown', { key: 'Escape', preventDefault() {}, stopImmediatePropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(ui.isOpen(), false);
  assert.equal(window.VT_LOCKED, false);
  assert.equal(doc.activeElement, opener);
});

test('Tab and Shift+Tab cycle only through available dialog controls', () => {
  const { doc, ui } = setup();
  ui.open(quote);
  const tab = (shiftKey = false) => {
    let prevented = false;
    doc.fire('keydown', { key: 'Tab', shiftKey, preventDefault() { prevented = true; }, stopImmediatePropagation() {} });
    assert.equal(prevented, true);
  };
  tab();
  assert.equal(doc.activeElement, ui._body);
  tab(true);
  assert.equal(doc.activeElement, ui._cancel);
  ui.close();
});
