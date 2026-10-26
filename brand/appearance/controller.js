/* Don Ventas appearance 0.1.0 — preference only, never form or identity data. */
(function () {
  'use strict';
  if (window.DVAppearance) return;
  var key = 'dv.appearance.v1', root = document.documentElement;
  var valid = function (v) { return v === 'light' || v === 'dark' || v === 'system'; };
  var preference = root.getAttribute('data-dv-preference');
  if (!valid(preference)) {
    preference = 'system';
    try { var stored = window.localStorage.getItem(key); if (valid(stored)) preference = stored; } catch (_) {}
  }
  var media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var names = { light: 'claro', dark: 'oscuro', system: 'sistema' };
  function mode() { return preference === 'system' ? (media && media.matches ? 'dark' : 'light') : preference; }
  function render(announce) {
    var resolved = mode();
    root.setAttribute('data-dv-preference', preference);
    root.setAttribute('data-dv-appearance', resolved);
    document.querySelectorAll('[data-dv-appearance-control]').forEach(function (select) {
      select.disabled = false;
      select.value = preference;
    });
    document.querySelectorAll('[data-dv-appearance-status]').forEach(function (node) {
      node.textContent = preference === 'system' ? 'Sistema · ' + names[resolved] : 'Modo ' + names[resolved];
    });
    if (announce) window.dispatchEvent(new CustomEvent('dv:appearancechange', { detail: { preference: preference, resolved: resolved } }));
  }
  function setPreference(value) {
    if (!valid(value)) throw new TypeError('Apariencia no válida');
    preference = value;
    try { window.localStorage.setItem(key, value); } catch (_) {}
    render(true);
  }
  window.DVAppearance = Object.freeze({
    version: '0.1.0', getPreference: function () { return preference; },
    getResolvedTheme: mode, setPreference: setPreference
  });
  function init() {
    document.querySelectorAll('[data-dv-appearance-control]').forEach(function (select) {
      select.addEventListener('change', function () { setPreference(select.value); });
    });
    render(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
  if (media) {
    var changed = function () { if (preference === 'system') render(true); };
    if (media.addEventListener) media.addEventListener('change', changed);
    else if (media.addListener) media.addListener(changed);
  }
  window.addEventListener('storage', function (event) {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : 'system';
    render(true);
  });
  window.addEventListener('pageshow', function (event) { if (event.persisted) render(false); });
}());

