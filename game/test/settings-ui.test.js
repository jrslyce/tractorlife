import test from 'node:test';
import assert from 'node:assert/strict';
import { openSettings } from '../js/settings-ui.js';

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.dataset = {}; this.style = { setProperty() {} }; this.classList = { add() {} }; this.attributes = {}; }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k] ?? null; }
  append(...items) { this.children.push(...items); }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  focus() { this.ownerDocument.activeElement = this; }
  remove() { this.removed = true; this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1); }
  querySelectorAll() { return this.children.filter(e => ['button', 'input', 'select'].includes(e.tag)); }
}

test('settings dialog locks input, supports Escape, restores focus and lock state', () => {
  const body = new Element('body');
  const doc = {
    body, activeElement: null, listeners: {}, defaultView: { VT_LOCKED: false },
    createElement(tag) { const e = new Element(tag); e.ownerDocument = this; e.parentNode = body; return e; },
    createTextNode(text) { return { textContent: text }; },
    addEventListener(k, fn) { this.listeners[k] = fn; },
    removeEventListener(k) { delete this.listeners[k]; },
  };
  const opener = { focused: false, focus() { this.focused = true; } }; doc.activeElement = opener;
  const changedModes = [];
  const instance = openSettings({ document: doc, experienceMode: 'simple', onExperienceModeChange: value => changedModes.push(value) });
  assert.ok(instance);
  assert.equal(doc.defaultView.VT_LOCKED, true);
  assert.equal(instance.element.getAttribute('role'), 'dialog');
  const experience = instance.element.children.flatMap(child => child.children || []).find(child => child.tag === 'select' && child.getAttribute('aria-label') === 'Farm experience');
  assert.ok(experience);
  assert.equal(experience.value, 'simple');
  assert.equal(experience.getAttribute('aria-describedby'), 'farm-experience-help');
  experience.value = 'full';
  experience.listeners.change();
  assert.deepEqual(changedModes, ['full']);
  const graphics = instance.element.children.flatMap(child => child.children || []).find(child => child.tag === 'select' && child.getAttribute('aria-label') === 'Graphics quality');
  assert.ok(graphics);
  assert.equal(graphics.getAttribute('aria-describedby'), 'graphics-settings-help');
  doc.listeners.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(instance.element.removed, true);
  assert.equal(doc.defaultView.VT_LOCKED, false);
  assert.equal(opener.focused, true);
});

test('settings dialog returns null without a usable document', () => {
  assert.equal(openSettings({ document: null }), null);
});

test('graphics reload is explicit and a failed save keeps the dialog usable', async () => {
  const doc = {
    body: new Element('body'), activeElement: null, defaultView: { VT_LOCKED: false },
    createElement(tag) { const element = new Element(tag); element.ownerDocument = this; return element; },
    createTextNode(text) { return { textContent: text }; },
    addEventListener() {}, removeEventListener() {},
  };
  let calls = 0;
  const instance = openSettings({ document: doc, onGraphicsReload: async () => { calls++; throw new Error('save-failed'); } });
  const graphics = instance.element.children.flatMap(child => child.children || []).find(child => child.tag === 'select' && child.getAttribute('aria-label') === 'Graphics quality');
  const reload = instance.element.children.find(child => child.textContent === 'Save game & reload graphics');
  assert.equal(reload.hidden, true);
  graphics.value = 'balanced'; graphics.listeners.change();
  assert.equal(calls, 0);
  assert.equal(reload.hidden, false);
  await reload.listeners.click();
  assert.equal(calls, 1);
  assert.equal(reload.disabled, false);
  assert.ok(instance.element.children.some(child => child.textContent?.startsWith('Could not save.')));
  instance.close();
});
