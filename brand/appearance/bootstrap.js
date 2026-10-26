/* Don Ventas appearance 0.1.0 — parser-blocking, before CSS; no external I/O. */
(function () {
  'use strict';
  var pref = 'system', mode, root = document.documentElement;
  try {
    var stored = window.localStorage.getItem('dv.appearance.v1');
    if (stored === 'light' || stored === 'dark' || stored === 'system') pref = stored;
  } catch (_) {}
  var dark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  mode = pref === 'system' ? (dark ? 'dark' : 'light') : pref;
  root.setAttribute('data-dv-preference', pref);
  root.setAttribute('data-dv-appearance', mode);
}());

