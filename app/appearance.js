/* Portal binding for exact Runtime assets. Theme changes never rerender a form. */
(function () {
  'use strict';
  function syncAssets() {
    const dark = document.documentElement.getAttribute('data-dv-appearance') === 'dark';
    document.querySelectorAll('img[src^="brand/donventas-"]').forEach(img => {
      const current = img.getAttribute('src');
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
  new MutationObserver(syncAssets).observe(document.body, { childList: true, subtree: true });
  syncAssets();
}());
