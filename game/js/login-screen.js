import { login, rememberedName, hasRememberedName, restoreRememberedSession, forgetRememberedCredentials } from './net.js';

let screen;

// aria-hidden alone does not stop keyboard focus, and older iPad Safari has no
// inert support. Preserve only the attributes this boundary actually owns.
export function createLoginNavigationBoundary(doc, overlay) {
  const saved = new Map();
  const selector = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]';
  let observer;
  let enabled = false;
  function mask(element, attribute, value) {
    let attributes = saved.get(element);
    if (!attributes) { attributes = new Map(); saved.set(element, attributes); }
    if (!attributes.has(attribute)) attributes.set(attribute, element.getAttribute(attribute));
    if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
  }
  function scan() {
    for (const sibling of doc.body.children) {
      if (sibling === overlay || sibling.contains(overlay)) continue;
      mask(sibling, 'aria-hidden', 'true');
      if (sibling.matches(selector)) mask(sibling, 'tabindex', '-1');
      for (const control of sibling.querySelectorAll(selector)) mask(control, 'tabindex', '-1');
    }
  }
  function controls() {
    return Array.from(overlay.querySelectorAll(selector)).filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
  }
  function containFocus(event) {
    if (!overlay.contains(event.target)) (controls()[0] || overlay).focus();
  }
  function containTab(event) {
    if (event.key !== 'Tab') return;
    const items = controls();
    const first = items[0], last = items[items.length - 1];
    if (!first || (event.shiftKey && doc.activeElement === first) || (!event.shiftKey && doc.activeElement === last) || !overlay.contains(doc.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last || overlay : first || overlay).focus();
    }
  }
  return {
    activate() {
      if (enabled) return;
      enabled = true;
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('tabindex', '-1');
      scan();
      doc.addEventListener('focusin', containFocus, true);
      doc.addEventListener('keydown', containTab, true);
      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(scan);
        observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['tabindex', 'aria-hidden'] });
      }
    },
    release() {
      enabled = false;
      if (observer) observer.disconnect();
      doc.removeEventListener('focusin', containFocus, true);
      doc.removeEventListener('keydown', containTab, true);
      for (const [element, attributes] of saved) {
        for (const [attribute, original] of attributes) {
          const masked = attribute === 'aria-hidden' ? 'true' : '-1';
          if (element.getAttribute(attribute) !== masked) continue;
          if (original === null) element.removeAttribute(attribute);
          else element.setAttribute(attribute, original);
        }
      }
      saved.clear();
    },
  };
}

// A single controller survives the deferred main import. No password is stored.
export function getLoginScreen(options = {}) {
  if (screen) return screen;
  const byId = id => document.getElementById(id);
  const form = byId('login-form');
  const name = byId('login-name');
  const password = byId('login-code');
  const remember = byId('login-remember-check');
  const eye = byId('login-eye');
  const go = byId('login-go');
  const returning = byId('login-returning');
  const start = byId('load-game');
  const switchButton = byId('login-switch');
  const message = byId('login-msg');
  const quality = byId('login-graphics');
  const navigation = createLoginNavigationBoundary(document, byId('login'));
  let accept;
  let generation = 0;
  let busy = false;
  let active = Promise.resolve();
  let logout = Promise.resolve();
  const savedName = rememberedName();
  name.value = savedName || '';

  function status(text, info = false) {
    message.textContent = text;
    message.dataset.info = String(info);
    if (text === 'Loading the farm…' && !returning.hidden) {
      const spinner = document.createElement('span');
      spinner.className = 'login-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      message.prepend(spinner);
    }
  }
  function buttonContent(button, loading) {
    button.textContent = loading ? 'Loading…' : "Let's farm!";
    if (loading) {
      const spinner = document.createElement('span');
      spinner.className = 'login-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      button.prepend(spinner);
    }
  }
  function setBusy(value) {
    busy = value;
    form.setAttribute('aria-busy', String(value));
    [name, password, remember, eye, go, start, quality].forEach(el => { el.disabled = value; });
    buttonContent(go, value);
    buttonContent(start, value);
    byId('login-returning-status').hidden = value;
  }
  function clearError() {
    name.removeAttribute('aria-invalid');
    password.removeAttribute('aria-invalid');
    status('');
  }
  function invalid(field, text) {
    field.setAttribute('aria-invalid', 'true');
    status(text);
    field.focus();
  }
  function showForm() {
    returning.hidden = true;
    form.hidden = false;
  }
  function concealPassword() {
    password.type = 'password';
    eye.setAttribute('aria-label', 'Show password');
    eye.setAttribute('aria-pressed', 'false');
    byId('login-eye-open').setAttribute('visibility', 'visible');
    byId('login-eye-closed').setAttribute('visibility', 'hidden');
  }
  concealPassword();
  // SVG hidden attributes are inconsistent in older Safari; visibility is explicit.
  byId('login-eye-closed').removeAttribute('hidden');
  eye.addEventListener('click', () => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    eye.setAttribute('aria-pressed', String(show));
    byId('login-eye-open').setAttribute('visibility', show ? 'hidden' : 'visible');
    byId('login-eye-closed').setAttribute('visibility', show ? 'visible' : 'hidden');
  });
  name.addEventListener('input', clearError);
  password.addEventListener('input', clearError);
  remember.addEventListener('change', () => {
    if (!remember.checked) logout = logout.then(() => forgetRememberedCredentials());
  });

  function authenticate(restore) {
    if (busy) return;
    clearError();
    if (!restore && !name.value.trim()) return invalid(name, 'Type your farmer name first.');
    if (!restore && !password.value.trim()) return invalid(password, 'Don’t forget your password!');
    const request = ++generation;
    setBusy(true);
    concealPassword();
    status('Loading the farm…', true);
    active = (async () => {
      try {
        await logout;
        await options.loadGame();
        if (request !== generation) return;
        const result = restore
          ? await restoreRememberedSession(name.value)
          : await login(name.value, password.value, remember.checked);
        if (request !== generation) return;
        if (!result || !result.email || !accept) throw new Error('Could not open your farm. Please try again.');
        password.value = '';
        // Release before gameplay changes visibility and focuses onboarding.
        navigation.release();
        accept(result);
      } catch (error) {
        if (request !== generation) return;
        if (accept) navigation.activate();
        setBusy(false);
        if (restore) {
          showForm();
          byId('login-heading').textContent = 'Welcome back, ' + name.value;
          status(error && error.message === 'session-expired'
            ? 'You were away a while. Type your password again.'
            : 'Could not reconnect. Type your password to try again.', true);
          password.focus();
        } else {
          const text = error && error.message || '';
          if (text === 'That password didn’t work. Try again!') invalid(password, text);
          else if (text === 'This farm needs its original shared password to claim it.') invalid(password, text);
          else if (/name/i.test(text)) invalid(name, text);
          else status(text || 'Could not open your farm. Please try again.');
        }
      }
    })();
  }
  form.addEventListener('submit', event => { event.preventDefault(); authenticate(false); });
  start.addEventListener('click', () => authenticate(true));
  switchButton.addEventListener('click', () => {
    ++generation; // A late restore can never enter the previous farmer's world.
    const previousRequest = active;
    showForm();
    name.value = '';
    password.value = '';
    remember.checked = true;
    byId('login-heading').textContent = 'Welcome back, farmer';
    clearError();
    concealPassword();
    setBusy(true);
    status('Switching farmer…', true);
    switchButton.disabled = true;
    // Wait for the old cookie-setting request, then revoke it before new auth.
    logout = previousRequest.catch(() => {}).then(() => forgetRememberedCredentials());
    logout.then(() => { setBusy(false); status(''); name.focus(); }, () => {
      setBusy(false);
      status('Could not switch farmers. Please refresh and try again.');
    }).finally(() => { switchButton.disabled = false; });
  });
  if (savedName && hasRememberedName()) {
    form.hidden = true;
    returning.hidden = false;
    byId('login-returning-heading').textContent = 'Welcome back, ' + savedName + '!';
    byId('login-initial').textContent = (savedName.replace(/^farmer\s+/i, '')[0] || 'F').toUpperCase();
  }
  screen = { connect(onAccepted) { accept = onAccepted; navigation.activate(); } };
  return screen;
}
