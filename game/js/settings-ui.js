import { getPreferences, setPreferences, applyPreferences } from './player-preferences.js';

const fields = [
  ['highContrast', 'High contrast'],
  ['largerControls', 'Larger controls'],
  ['reducedMotion', 'Reduced motion'],
];

export function openSettings(options = {}) {
  const doc = options.document || globalThis.document;
  if (!doc?.body || !doc.createElement) return null;
  const previousFocus = doc.activeElement;
  const win = options.window || doc.defaultView || globalThis.window;
  const hadLock = !!win && win.VT_LOCKED !== undefined;
  const previousLock = win?.VT_LOCKED;
  if (win) win.VT_LOCKED = true;

  const dialog = doc.createElement('section');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'player-settings-title');
  dialog.tabIndex = -1;
  dialog.className = 'player-settings-dialog';
  if (doc.head && (!doc.getElementById || !doc.getElementById('player-settings-style'))) {
    const style = doc.createElement('style');
    style.id = 'player-settings-style';
    style.textContent = `
      .player-settings-dialog{position:fixed;z-index:120;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;padding:24px;display:grid;gap:18px;border:3px solid #a9ca72;border-radius:14px;background:#19271df5;color:#fffbe8;box-shadow:0 12px 45px #000b;font:calc(18px * var(--player-text-scale,1))/1.45 system-ui,-apple-system,sans-serif}
      .player-settings-dialog h2{margin:0;color:#ffe36b;font-size:1.5em}
      .player-settings-dialog label{display:flex;align-items:center;gap:12px;min-height:48px}
      .player-settings-dialog select,.player-settings-dialog input{font:inherit;accent-color:#a9ca72}
      .player-settings-dialog select{min-height:48px;margin-left:auto;padding:6px 10px}
      .player-settings-dialog input[type=checkbox]{width:28px;height:28px;flex:none}
      .player-settings-dialog button{min-height:52px;padding:10px 18px;border:2px solid #d7ed9a;border-radius:8px;background:#b9e27e;color:#1b281f;font:800 18px system-ui;cursor:pointer}
      .player-settings-dialog :focus-visible{outline:3px solid #ffe36b;outline-offset:3px}
      html[data-high-contrast="true"] .player-settings-dialog{background:#000;color:#fff;border-color:#fff}
      html[data-reduced-motion="true"] *,html[data-reduced-motion="true"] *::before,html[data-reduced-motion="true"] *::after{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}
    `;
    doc.head.append(style);
  }
  const heading = doc.createElement('h2');
  heading.id = 'player-settings-title';
  heading.textContent = 'Settings';
  dialog.append(heading);
  let value = getPreferences();

  const scaleLabel = doc.createElement('label');
  scaleLabel.textContent = 'Text size ';
  const scale = doc.createElement('select');
  scale.setAttribute('aria-label', 'Text size');
  for (const [v, text] of [['standard', 'Standard'], ['large', 'Large'], ['larger', 'Largest']]) {
    const option = doc.createElement('option'); option.value = v; option.textContent = text; scale.append(option);
  }
  scale.value = value.textScale;
  scale.addEventListener('change', () => { value = setPreferences({ textScale: scale.value }); applyPreferences(value); options.onChange?.(value); });
  scaleLabel.append(scale); dialog.append(scaleLabel);

  const detailLabel = doc.createElement('label');
  detailLabel.append(doc.createTextNode('Farm information '));
  const detail = doc.createElement('select');
  detail.setAttribute('aria-label', 'Farm information detail');
  for (const [v, text] of [['focused', 'Focused'], ['full', 'Full details']]) {
    const option = doc.createElement('option'); option.value = v; option.textContent = text; detail.append(option);
  }
  detail.value = value.hudDetail;
  detail.addEventListener('change', () => { value = setPreferences({ hudDetail: detail.value }); applyPreferences(value); options.onChange?.(value); });
  detailLabel.append(detail); dialog.append(detailLabel);

  const experienceLabel = doc.createElement('label');
  experienceLabel.append(doc.createTextNode('Farm experience '));
  const experience = doc.createElement('select');
  experience.setAttribute('aria-label', 'Farm experience');
  experience.setAttribute('aria-describedby', 'farm-experience-help');
  for (const [v, text] of [['simple', 'Simple Farm'], ['full', 'Full Farm']]) {
    const option = doc.createElement('option'); option.value = v; option.textContent = text; experience.append(option);
  }
  experience.value = options.experienceMode === 'simple' ? 'simple' : 'full';
  experience.addEventListener('change', () => {
    experienceHelp.textContent = experience.value === 'simple'
      ? 'Simple Farm pauses livestock, woodland, river systems, vehicle wear, and contracts. Crops and weather continue. Saved state is kept. Changes apply immediately.'
      : 'Full Farm resumes livestock, woodland, river systems, vehicle wear, and contracts immediately.';
    options.onExperienceModeChange?.(experience.value);
  });
  experienceLabel.append(experience); dialog.append(experienceLabel);
  const experienceHelp = doc.createElement('p');
  experienceHelp.id = 'farm-experience-help';
  experienceHelp.setAttribute('aria-live', 'polite');
  experienceHelp.textContent = 'Simple Farm pauses livestock, woodland, river systems, vehicle wear, and contracts. Crops and weather continue. Your saved advanced-system state is kept. Full Farm resumes it.';
  dialog.append(experienceHelp);

  for (const [key, text] of fields) {
    const label = doc.createElement('label');
    const input = doc.createElement('input'); input.type = 'checkbox'; input.checked = value[key];
    input.addEventListener('change', () => { value = setPreferences({ [key]: input.checked }); applyPreferences(value); options.onChange?.(value); });
    label.append(input, doc.createTextNode(` ${text}`)); dialog.append(label);
  }
  const closeButton = doc.createElement('button'); closeButton.type = 'button'; closeButton.textContent = 'Close';
  dialog.append(closeButton); doc.body.append(dialog);
  applyPreferences(value);

  let closed = false;
  function close() {
    if (closed) return; closed = true;
    doc.removeEventListener('keydown', onKeyDown);
    dialog.remove();
    if (win) win.VT_LOCKED = hadLock ? previousLock : false;
    if (previousFocus?.focus) previousFocus.focus();
  }
  function onKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled);
    if (!controls.length) { event.preventDefault(); dialog.focus(); return; }
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  closeButton.addEventListener('click', close);
  doc.addEventListener('keydown', onKeyDown);
  closeButton.focus();
  return { element: dialog, close };
}
