import { getPreferences, setPreferences, applyPreferences } from './player-preferences.js';

const fields = [
  ['wordsOnButtons', 'Words on buttons'],
  ['largerControls', 'Bigger buttons'],
  ['highContrast', 'Strong colors'],
  ['reducedMotion', 'Less moving'],
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
  const scrim = doc.createElement('div');
  scrim.className = 'settings-scrim';
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
  const header = doc.createElement('header');
  const closeButton = doc.createElement('button'); closeButton.type = 'button'; closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Close settings'); closeButton.className = 'settings-close';
  header.append(heading, closeButton); dialog.append(header);
  let value = getPreferences();
  function segments(name, choices, selected, onSelect) {
    const section = doc.createElement('div'); section.className = 'settings-choice';
    const title = doc.createElement('h3'); title.textContent = name;
    const group = doc.createElement('div'); group.className = 'settings-segments';
    group.setAttribute('role', 'group'); group.setAttribute('aria-label', name);
    for (const [key, label] of choices) {
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = label;
      button.setAttribute('aria-label', name === 'Text size' ? { standard: 'Standard text', large: 'Large text', larger: 'Largest text' }[key] : label);
      button.setAttribute('aria-pressed', String(selected === key));
      button.addEventListener('click', () => {
        for (const child of group.children) child.setAttribute('aria-pressed', String(child === button));
        onSelect(key);
      });
      group.append(button);
    }
    section.append(title, group); dialog.append(section);
  }

  const graphicsLabel = doc.createElement('label');
  graphicsLabel.append(doc.createTextNode('Graphics quality '));
  const graphics = doc.createElement('select');
  graphics.setAttribute('aria-label', 'Graphics quality');
  graphics.setAttribute('aria-describedby', 'graphics-settings-help');
  for (const [v, text] of [['auto', 'Auto'], ['low', 'Low · older devices'], ['balanced', 'Balanced'], ['high', 'High']]) {
    const option = doc.createElement('option'); option.value = v; option.textContent = text; graphics.append(option);
  }
  graphics.value = value.graphicsQuality;
  const graphicsHelp = doc.createElement('p');
  graphicsHelp.id = 'graphics-settings-help';
  graphicsHelp.textContent = 'Low is recommended for an iPad 6 or older 4 GB laptop. Graphics changes apply after reloading; farming features are unchanged.';
  const reloadGraphics = doc.createElement('button');
  reloadGraphics.type = 'button'; reloadGraphics.textContent = 'Save game & reload graphics'; reloadGraphics.hidden = true;
  graphics.addEventListener('change', () => {
    value = setPreferences({ graphicsQuality: graphics.value });
    reloadGraphics.hidden = !options.onGraphicsReload;
  });
  reloadGraphics.addEventListener('click', async () => {
    reloadGraphics.disabled = true;
    try { await options.onGraphicsReload?.(); }
    catch { graphicsHelp.textContent = 'Could not save. Your game is still open; reconnect and try again.'; }
    finally { reloadGraphics.disabled = false; }
  });
  graphicsLabel.append(graphics);

  const scaleLabel = doc.createElement('label');
  scaleLabel.textContent = 'Text size ';
  const scale = doc.createElement('select');
  scale.setAttribute('aria-label', 'Text size');
  for (const [v, text] of [['standard', 'Standard'], ['large', 'Large'], ['larger', 'Largest']]) {
    const option = doc.createElement('option'); option.value = v; option.textContent = text; scale.append(option);
  }
  scale.value = value.textScale;
  scale.addEventListener('change', () => { value = setPreferences({ textScale: scale.value }); applyPreferences(value); options.onChange?.(value); });
  scaleLabel.append(scale); scaleLabel.hidden = true; dialog.append(scaleLabel);
  segments('Text size', [['standard', 'A'], ['large', 'A'], ['larger', 'A']], value.textScale, key => {
    scale.value = key; value = setPreferences({ textScale: key }); applyPreferences(value); options.onChange?.(value);
  });

  const steerLabel = doc.createElement('label');
  steerLabel.append(doc.createTextNode('Steering '));
  const steer = doc.createElement('select');
  steer.setAttribute('aria-label', 'Steering');
  for (const [v, text] of [['wheel', 'Wheel'], ['joystick', 'Joystick']]) {
    const option = doc.createElement('option'); option.value = v; option.textContent = text; steer.append(option);
  }
  steer.value = value.steering;
  steer.addEventListener('change', () => { value = setPreferences({ steering: steer.value }); applyPreferences(value); options.onChange?.(value); });
  steerLabel.append(steer); steerLabel.hidden = true; dialog.append(steerLabel);
  segments('Steering', [['wheel', 'Wheel'], ['joystick', 'Joystick']], value.steering, key => {
    steer.value = key; value = setPreferences({ steering: key }); applyPreferences(value); options.onChange?.(value);
  });

  const detailLabel = doc.createElement('label');
  detailLabel.append(doc.createTextNode('Farm information '));
  const detail = doc.createElement('select');
  detail.setAttribute('aria-label', 'Farm information detail');
  for (const [v, text] of [['focused', 'Focused'], ['full', 'Full details']]) {
    const option = doc.createElement('option'); option.value = v; option.textContent = text; detail.append(option);
  }
  detail.value = value.hudDetail;
  detail.addEventListener('change', () => { value = setPreferences({ hudDetail: detail.value }); applyPreferences(value); options.onChange?.(value); });
  detailLabel.append(detail);

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
  experienceLabel.append(experience); experienceLabel.hidden = true; dialog.append(experienceLabel);
  segments('Farm', [['simple', 'Simple'], ['full', 'Full']], experience.value, key => {
    experience.value = key;
    experienceHelp.textContent = key === 'simple' ? 'Crops and weather keep going. Other farm jobs rest.' : 'All farm jobs are on.';
    options.onExperienceModeChange?.(key);
  });
  const experienceHelp = doc.createElement('p');
  experienceHelp.id = 'farm-experience-help';
  experienceHelp.setAttribute('aria-live', 'polite');
  experienceHelp.textContent = experience.value === 'simple' ? 'Crops and weather keep going. Other farm jobs rest.' : 'All farm jobs are on.';
  dialog.append(experienceHelp);

  for (const [key, text] of fields) {
    const label = doc.createElement('label');
    const input = doc.createElement('input'); input.type = 'checkbox'; input.checked = value[key];
    input.addEventListener('change', () => { value = setPreferences({ [key]: input.checked }); applyPreferences(value); options.onChange?.(value); });
    label.append(input, doc.createTextNode(` ${text}`)); dialog.append(label);
  }
  const advanced = doc.createElement('details'); advanced.className = 'settings-advanced';
  const advancedTitle = doc.createElement('summary'); advancedTitle.textContent = 'More settings · graphics';
  advanced.append(advancedTitle, detailLabel, graphicsLabel, graphicsHelp, reloadGraphics);
  dialog.append(advanced); doc.body.append(scrim, dialog);
  scrim.addEventListener('click', close);
  applyPreferences(value);

  let closed = false;
  function close() {
    if (closed) return; closed = true;
    doc.removeEventListener('keydown', onKeyDown);
    dialog.remove(); scrim.remove();
    if (win) win.VT_LOCKED = hadLock ? previousLock : false;
    if (previousFocus?.focus) previousFocus.focus();
  }
  function onKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button, input, select, summary, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && (!el.closest || (!el.closest('[hidden]') && (!el.closest('details') || el.closest('details').open || el.tagName === 'SUMMARY'))));
    if (!controls.length) { event.preventDefault(); dialog.focus(); return; }
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  closeButton.addEventListener('click', close);
  doc.addEventListener('keydown', onKeyDown);
  dialog.focus({ preventScroll: true });
  dialog.scrollTop = 0;
  return { element: dialog, close };
}
