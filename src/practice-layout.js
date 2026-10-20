// Keep layout changes separate from score/player rendering: rotating or folding a
// panel must never replace a playing score, restart audio, or lose its position.
const STORAGE_KEY = 'qinban-practice-layout-v1';
const panels = ['topbar', 'sidebar', 'keyboard', 'focus'];

export function practicePresentation(width, height) {
  if (width < 700 || (height < 500 && width < 1000)) return width > height ? 'phone-landscape' : 'phone';
  if (height > width && width <= 1400) return 'portrait';
  return width <= 1400 ? 'tablet' : 'desktop';
}

export function practiceLayout(presentation, preferences = {}) {
  const layout = {
    topbar: true,
    sidebar: presentation === 'tablet' || presentation === 'desktop',
    keyboard: presentation === 'tablet' || presentation === 'desktop',
    focus: presentation === 'portrait' || presentation === 'phone-landscape',
  };
  for (const panel of panels) {
    const value = preferences?.[presentation]?.[panel];
    if (typeof value === 'boolean') layout[panel] = value;
  }
  return layout;
}

export function mountPracticeLayout(shell, { storage, viewport = window } = {}) {
  let preferences;
  try { storage ??= viewport.localStorage; preferences = JSON.parse(storage.getItem(STORAGE_KEY)) || {}; } catch { preferences = {}; }
  if (typeof preferences !== 'object' || Array.isArray(preferences)) preferences = {};
  let presentation, layout, frame;
  const doc = shell.ownerDocument;
  const sidebar = shell.querySelector('#practice-sidebar');
  const bar = shell.querySelector('.practice-layout-bar');
  const score = shell.querySelector('.score-stage');
  const dock = shell.querySelector('.playback-dock');
  let drawerWasOpen = false, returnFocus;

  function apply() {
    presentation = practicePresentation(viewport.innerWidth, viewport.innerHeight);
    layout = practiceLayout(presentation, preferences);
    shell.dataset.presentation = presentation;
    shell.classList.toggle('is-focus', layout.focus);
    for (const panel of panels.filter(panel => panel !== 'focus')) {
      shell.classList.toggle(`${panel}-hidden`, !layout[panel] || layout.focus);
    }
    shell.querySelectorAll('[data-layout]').forEach(button => {
      const panel = button.dataset.layout;
      button.setAttribute('aria-pressed', String(layout[panel]));
      if (panel !== 'focus') button.setAttribute('aria-expanded', String(layout[panel] && !layout.focus));
    });
    const drawerOpen = presentation.startsWith('phone') && layout.sidebar && !layout.focus;
    sidebar.setAttribute('role', drawerOpen ? 'dialog' : 'complementary');
    if (drawerOpen) sidebar.setAttribute('aria-modal', 'true');
    else sidebar.removeAttribute('aria-modal');
    for (const element of [bar, score, dock, shell.querySelector('.app-header'), shell.querySelector('.mobile-nav')]) {
      if (element) element.inert = drawerOpen;
    }
    if (drawerOpen && !drawerWasOpen) {
      returnFocus = doc.activeElement;
      sidebar.querySelector('[data-layout-close]').focus();
    } else if (!drawerOpen && drawerWasOpen) {
      if (returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus();
    }
    drawerWasOpen = drawerOpen;
    // Don't leave keyboard focus in a panel that just became hidden.
    if (!drawerOpen && doc.activeElement !== doc.body && !doc.activeElement.getClientRects().length) {
      shell.querySelector(layout.focus ? '.layout-restore' : '[data-layout="sidebar"]')?.focus();
    }
  }
  function change(panel, value) {
    preferences[presentation] = { ...preferences[presentation], [panel]: value };
    try { storage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Layout works in private/limited storage too. */ }
    apply();
  }
  const onClick = event => {
    const button = event.target.closest('[data-layout], [data-layout-close]');
    if (!button || !shell.contains(button)) return;
    if (button.hasAttribute('data-layout-close')) change('sidebar', false);
    else change(button.dataset.layout, !layout[button.dataset.layout]);
  };
  const onResize = () => {
    viewport.cancelAnimationFrame(frame);
    frame = viewport.requestAnimationFrame(apply);
  };
  const onKey = event => {
    if (doc.querySelector('.modal')) return;
    if (event.key === 'Escape') {
      if (drawerWasOpen) change('sidebar', false);
      else if (layout.focus) change('focus', false);
    }
    if (event.key !== 'Tab' || !drawerWasOpen) return;
    const focusable = [...sidebar.querySelectorAll('button, input, select, a[href]')]
      .filter(element => !element.disabled && element.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  shell.addEventListener('click', onClick);
  viewport.addEventListener('resize', onResize);
  doc.addEventListener('keydown', onKey);
  apply();
  return () => {
    viewport.cancelAnimationFrame(frame);
    shell.removeEventListener('click', onClick);
    viewport.removeEventListener('resize', onResize);
    doc.removeEventListener('keydown', onKey);
  };
}

export function practiceKeyboard() {
  let whiteKeys = 0;
  const keys = [];
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  for (let midi = 36; midi <= 96; midi++) {
    const black = [1, 3, 6, 8, 10].includes(midi % 12);
    const name = `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
    keys.push(`<button class="piano-key ${black ? 'black' : 'white'}" data-midi="${midi}" style="--key-left:${whiteKeys}" aria-label="试听 ${name}">${midi % 12 === 0 ? `<span>${name}</span>` : ''}</button>`);
    if (!black) whiteKeys++;
  }
  return `<section id="practice-keyboard" class="practice-keyboard" aria-label="钢琴键盘"><div class="keyboard-caption"><span>C2 — C7 · 点击试听</span><button data-layout="keyboard" aria-controls="practice-keyboard" aria-label="收起键盘">收起键盘</button></div><div class="keyboard-scroll"><div class="piano-keys" style="--white-keys:${whiteKeys}">${keys.join('')}</div></div></section>`;
}
