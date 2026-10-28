/* Portal binding for exact Runtime assets. Theme changes never rerender a form. */
(function () {
  'use strict';
  const picker = document.getElementById('appearancePicker');
  const trigger = document.getElementById('portalAppearance');
  const menu = document.getElementById('appearanceMenu');
  const choices = picker ? Array.from(picker.querySelectorAll('[data-appearance-choice]')) : [];
  function syncPicker() {
    if (!trigger || !window.DVAppearance) return;
    trigger.disabled = false;
    choices.forEach(button => button.setAttribute('aria-checked', String(button.dataset.appearanceChoice === DVAppearance.getPreference())));
  }
  function closePicker(restoreFocus) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }
  function mountPicker() {
    if (!picker) return;
    // Reuse one control across shell rebuilds and logout. Never rerender forms.
    const target = document.querySelector('#modalHost .modal.on .mbox')
      || document.querySelector('#environmentBlockedMount .prelaunch-head')
      || document.querySelector('#environmentBlockedMount .env-blocked-card')
      || document.querySelector('#app.on #topBar:has(.who)')
      || document.querySelector('#auth .acard') || document.body;
    if (picker.parentElement === target) return;
    closePicker(false);
    if (target.matches('.acard,.mbox,.env-blocked-card')) target.prepend(picker);
    else target.append(picker);
  }
  function openPicker(last) {
    if (!window.DVAppearance || trigger.disabled) return;
    syncPicker();
    menu.hidden = false;
    // Fixed positioning avoids clipping in cards, modals and short viewports.
    const box = trigger.getBoundingClientRect(), width = menu.getBoundingClientRect().width;
    const below = innerHeight - box.bottom - 14, above = box.top - 14;
    const upwards = below < 160 && above > below;
    menu.style.left = Math.max(8, Math.min(box.right - width, innerWidth - width - 8)) + 'px';
    menu.style.top = upwards ? 'auto' : (box.bottom + 6) + 'px';
    menu.style.bottom = upwards ? (innerHeight - box.top + 6) + 'px' : 'auto';
    menu.style.maxHeight = Math.max(44, upwards ? above : below) + 'px';
    trigger.setAttribute('aria-expanded', 'true');
    const selected = choices.find(button => button.getAttribute('aria-checked') === 'true');
    (last ? choices[choices.length - 1] : selected || choices[0]).focus({ preventScroll: true });
  }
  if (picker && menu && trigger) {
    trigger.addEventListener('click', () => menu.hidden ? openPicker(false) : closePicker(false));
    trigger.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); event.stopPropagation();
        openPicker(event.key === 'ArrowUp');
      }
    });
    choices.forEach(button => button.addEventListener('click', () => {
      DVAppearance.setPreference(button.dataset.appearanceChoice);
      closePicker(true);
    }));
    picker.addEventListener('keydown', event => {
      if (menu.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); closePicker(true);
      } else if (event.key === 'Tab') {
        // Return to the trigger before native tab navigation; no focus trap and
        // no offscreen scroll caused by focusing another header control.
        closePicker(true);
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const pilot = menu.querySelector('[data-don-pilot-preference]');
        const options = pilot ? [...choices, pilot] : choices;
        const index = options.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
          : (index + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
        options[next].focus({ preventScroll: true });
      }
    });
    document.addEventListener('pointerdown', event => { if (!picker.contains(event.target)) closePicker(false); });
    document.addEventListener('focusin', event => { if (!picker.contains(event.target)) closePicker(false); });
    window.addEventListener('dv:appearancechange', syncPicker);
    window.addEventListener('resize', () => closePicker(false));
    // Card headers can scroll, unlike the app header. Dismiss rather than leave
    // a fixed panel detached from its trigger; internal menu scrolling is valid.
    document.addEventListener('scroll', event => {
      if (!menu.contains(event.target)) closePicker(false);
    }, true);
    document.addEventListener('DOMContentLoaded', syncPicker, { once: true });
    syncPicker();
  }
  function syncAssets() {
    const dark = document.documentElement.getAttribute('data-dv-appearance') === 'dark';
    document.querySelectorAll('img[src^="brand/donventas-"]').forEach(img => {
      const current = img.getAttribute('src');
      if (current === 'brand/donventas-horizontal-curvas-reverse.svg') {
        img.setAttribute('src', 'brand/donventas-wordmark-b6' + (dark ? '-reverse' : '') + '.svg');
        return;
      }
      if (!/^brand\/donventas-(wordmark-b6|symbol-bs)(-reverse)?\.svg$/.test(current)) return;
      const next = current.replace(/(-reverse)?\.svg$/, (dark ? '-reverse' : '') + '.svg');
      if (current !== next) img.setAttribute('src', next);
    });
    document.querySelectorAll('.dv-icon use').forEach(use => {
      const current = use.getAttribute('href') || '';
      const next = current.replace(/-[pi](-mono)?$/, (_, mono) => (dark ? '-p' : '-i') + (mono || ''));
      if (current !== next) use.setAttribute('href', next);
    });
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = dark ? '#0E1117' : '#EEF1F6';
  }
  window.addEventListener('dv:appearancechange', syncAssets);
  // Auth, navigation and modal content are inserted after boot. Observe child lists
  // only, so changing asset attributes cannot trigger another observer pass.
  new MutationObserver(() => { mountPicker(); syncAssets(); }).observe(document.body, { childList: true, subtree: true });
  mountPicker();
  syncAssets();
}());
