import test from 'node:test';
import assert from 'node:assert/strict';

function fixture(saved = '') {
  const values = new Map(saved ? [['vt-name', saved]] : []);
  const elements = new Map();
  const element = () => ({
    value: '', checked: true, hidden: false, disabled: false, dataset: {}, attributes: {}, handlers: {}, textContent: '',
    addEventListener(type, callback) { this.handlers[type] = callback; },
    setAttribute(key, value) { this.attributes[key] = value; },
    getAttribute(key) { return this.attributes[key] ?? null; },
    removeAttribute(key) { delete this.attributes[key]; },
    focus() { this.focused = true; }, prepend() {},
  });
  globalThis.document = {
    body: { children: [] },
    addEventListener() {}, removeEventListener() {},
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element,
  };
  globalThis.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  return { elements, values, el: id => document.getElementById(id) };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('title form validates before load, keeps first submit across import, and never stores passwords', async () => {
  const originals = { document: globalThis.document, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  try {
    const { el, values } = fixture();
    const gameplay = el('covered-gameplay');
    const gameplayButton = el('covered-button');
    const onboarding = el('onboarding-choice');
    onboarding.hidden = true;
    for (const sibling of [gameplay, onboarding]) {
      sibling.contains = () => false;
      sibling.matches = () => false;
      sibling.querySelectorAll = () => sibling === gameplay ? [gameplayButton] : [];
    }
    document.body.children = [el('login'), gameplay, onboarding];
    let loads = 0, accepted = null, finishLoad;
    const load = new Promise(resolve => { finishLoad = resolve; });
    let body;
    globalThis.fetch = async (url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({ ok: true, email: 'farmer jo', state: { money: 10 } }));
    };
    const { getLoginScreen } = await import('../js/login-screen.js?form-test');
    const screen = getLoginScreen({ loadGame: () => { loads++; return load; } });
    const submit = () => el('login-form').handlers.submit({ preventDefault() {} });
    submit();
    assert.equal(loads, 0);
    assert.equal(el('login-msg').textContent, 'Type your farmer name first.');
    assert.equal(el('login-name').attributes['aria-invalid'], 'true');
    el('login-name').value = 'Farmer Jo';
    el('login-name').handlers.input();
    assert.equal(el('login-name').attributes['aria-invalid'], undefined);
    submit();
    assert.equal(el('login-msg').textContent, 'Don’t forget your password!');
    el('login-code').value = 'test-secret';
    submit();
    await settle();
    assert.equal(loads, 1);
    for (const id of ['login-name', 'login-code', 'login-eye', 'login-go', 'login-remember-check']) assert.equal(el(id).disabled, true);
    screen.connect(result => {
      // Navigation must be restored before enterFarm reveals/focuses onboarding.
      assert.equal(gameplay.getAttribute('aria-hidden'), null);
      assert.equal(gameplayButton.getAttribute('tabindex'), null);
      assert.equal(onboarding.hidden, true);
      onboarding.hidden = false;
      onboarding.focus();
      accepted = result;
    });
    assert.equal(gameplay.getAttribute('aria-hidden'), 'true');
    assert.equal(gameplayButton.getAttribute('tabindex'), '-1');
    finishLoad();
    await settle();
    assert.equal(accepted.email, 'farmer jo');
    assert.equal(onboarding.hidden, false);
    assert.equal(onboarding.focused, true);
    assert.equal(body.name, 'Farmer Jo');
    assert.equal(body.password, 'test-secret');
    assert.equal(el('login-code').value, '');
    assert.ok(!Array.from(values.values()).includes('test-secret'));
  } finally { Object.assign(globalThis, originals); }
});

test('server password rejection stays at login with accessible error and re-enabled controls', async () => {
  const originals = { document: globalThis.document, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  try {
    const { el } = fixture();
    globalThis.fetch = async () => new Response('{}', { status: 401 });
    const { getLoginScreen } = await import('../js/login-screen.js?reject-test');
    let accepted = false;
    getLoginScreen({ loadGame: async () => {} }).connect(() => { accepted = true; });
    el('login-name').value = 'Jo';
    el('login-code').value = 'wrong';
    el('login-form').handlers.submit({ preventDefault() {} });
    await settle();
    assert.equal(accepted, false);
    assert.equal(el('login-msg').textContent, 'That password didn’t work. Try again!');
    assert.equal(el('login-code').attributes['aria-invalid'], 'true');
    assert.equal(el('login-go').disabled, false);
    el('login-code').handlers.input();
    assert.equal(el('login-msg').textContent, '');
  } finally { Object.assign(globalThis, originals); }
});

test('switch farmer drops a late restore and logs out before another login is allowed', async () => {
  const originals = { document: globalThis.document, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  try {
    const { el, values } = fixture();
    // Obtain the current storage key from the public remembering behavior.
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, email: 'farmer jo' }));
    const { login } = await import('../js/net.js');
    await login('Farmer Jo', 'test-secret', true);
    let completeRestore, completeLogout;
    const calls = [];
    globalThis.fetch = url => {
      calls.push(url);
      return new Promise(resolve => {
        if (url === '/api/logout') completeLogout = resolve;
        else completeRestore = resolve;
      });
    };
    const { getLoginScreen } = await import('../js/login-screen.js?switch-test');
    let accepted = false, loads = 0;
    getLoginScreen({ loadGame: async () => { loads++; } }).connect(() => { accepted = true; });
    assert.equal(loads, 0);
    assert.equal(el('login-form').hidden, true);
    el('load-game').handlers.click();
    await settle();
    assert.equal(el('login-returning-status').hidden, true);
    assert.equal(el('login-msg').textContent, 'Loading the farm…');
    el('login-switch').handlers.click();
    assert.equal(el('login-form').hidden, false);
    assert.equal(el('login-go').disabled, true);
    completeRestore(new Response(JSON.stringify({ ok: true, email: 'farmer jo' })));
    await settle();
    assert.equal(accepted, false);
    assert.deepEqual(calls, ['/api/login', '/api/logout']);
    assert.equal(el('login-go').disabled, true);
    completeLogout(new Response('{}'));
    await settle();
    assert.equal(el('login-go').disabled, false);
    assert.equal(el('login-name').value, '');
    assert.equal(values.has('vt-name'), false);
    assert.equal(values.has('vt-farm-generation'), true);
  } finally { Object.assign(globalThis, originals); }
});

test('login boundary excludes covered controls without inert and restores only owned navigation attributes', async () => {
  const { createLoginNavigationBoundary } = await import('../js/login-screen.js?boundary-test');
  const handlers = {};
  const node = (attributes = {}, children = [], interactive = false) => ({
    attributes: { ...attributes }, children, disabled: false, hidden: false,
    getAttribute(key) { return this.attributes[key] ?? null; },
    setAttribute(key, value) { this.attributes[key] = value; },
    removeAttribute(key) { delete this.attributes[key]; },
    contains(target) { return target === this || this.children.some(child => child.contains(target)); },
    matches() { return interactive; },
    querySelectorAll() { return children.flatMap(child => [...(child.matches() ? [child] : []), ...child.querySelectorAll()]); },
    get tabIndex() { return this.attributes.tabindex === undefined ? 0 : Number(this.attributes.tabindex); },
    getClientRects() { return this.hidden ? [] : [{}]; },
    focus() { doc.activeElement = this; },
  });
  const name = node({}, [], true), graphics = node({}, [], true);
  const overlay = node({}, [name, graphics]);
  const jump = node({}, [], true), custom = node({ tabindex: '2' }, [], true);
  const hud = node({}, [jump, custom]);
  const onboardingStart = node({}, [], true);
  const onboarding = node({ 'aria-hidden': 'false' }, [onboardingStart]);
  onboarding.hidden = true;
  const alreadyHidden = node({ 'aria-hidden': 'true' });
  const doc = {
    body: { children: [overlay, hud, onboarding, alreadyHidden] }, activeElement: name,
    addEventListener(type, callback) { handlers[type] = callback; },
    removeEventListener(type) { delete handlers[type]; },
  };
  const boundary = createLoginNavigationBoundary(doc, overlay);
  boundary.activate();
  assert.equal(overlay.getAttribute('role'), 'dialog');
  assert.equal(hud.getAttribute('aria-hidden'), 'true');
  assert.equal(jump.tabIndex, -1);
  assert.equal(custom.tabIndex, -1);
  assert.equal(onboarding.hidden, true);
  handlers.focusin({ target: jump });
  assert.equal(doc.activeElement, name);
  let prevented = false;
  doc.activeElement = graphics;
  handlers.keydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(doc.activeElement, name);
  // Gameplay-owned properties may change while covered; don't roll them back.
  hud.hidden = true;
  jump.disabled = true;
  boundary.release();
  assert.equal(hud.getAttribute('aria-hidden'), null);
  assert.equal(jump.getAttribute('tabindex'), null);
  assert.equal(custom.getAttribute('tabindex'), '2');
  assert.equal(alreadyHidden.getAttribute('aria-hidden'), 'true');
  assert.equal(onboarding.getAttribute('aria-hidden'), 'false');
  assert.equal(hud.hidden, true);
  assert.equal(jump.disabled, true);
  assert.equal(onboarding.hidden, true);
  onboarding.hidden = false;
  onboardingStart.focus();
  assert.equal(doc.activeElement, onboardingStart);
  assert.deepEqual(handlers, {});
});

test('expired session keeps the formatted name and requests a password; eye toggle is accessible', async () => {
  const originals = { document: globalThis.document, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  try {
    const { el } = fixture();
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, email: 'farmer jo' }));
    const { login } = await import('../js/net.js');
    await login('Farmer Jo', 'test-secret', true);
    globalThis.fetch = async () => new Response('{}', { status: 401 });
    const { getLoginScreen } = await import('../js/login-screen.js?expired-test');
    let accepted = false;
    getLoginScreen({ loadGame: async () => {} }).connect(() => { accepted = true; });
    el('load-game').handlers.click();
    await settle();
    assert.equal(accepted, false);
    assert.equal(el('login-form').hidden, false);
    assert.equal(el('login-name').value, 'Farmer Jo');
    assert.equal(el('login-heading').textContent, 'Welcome back, Farmer Jo');
    assert.equal(el('login-msg').textContent, 'You were away a while. Type your password again.');
    assert.equal(el('login-code').focused, true);
    el('login-eye').handlers.click();
    assert.equal(el('login-code').type, 'text');
    assert.equal(el('login-eye').attributes['aria-label'], 'Hide password');
    assert.equal(el('login-eye').attributes['aria-pressed'], 'true');
    el('login-eye').handlers.click();
    assert.equal(el('login-code').type, 'password');
  } finally { Object.assign(globalThis, originals); }
});
