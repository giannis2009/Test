// Runs before first paint so the page never flashes the wrong theme.
(function () {
  var t = null;
  try { t = localStorage.getItem('ezro-theme'); } catch (e) {}
  if (!t) {
    try { t = localStorage.getItem('ezro-default-theme'); } catch (e) {}
    if (!t || t === 'system') t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', t);
})();
