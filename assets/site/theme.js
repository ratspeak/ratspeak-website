// Light/dark toggle shared by every page; the head boot script sets the first theme (dark unless chosen).
(() => {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#10208c' : '#1838ed');
    for (const button of document.querySelectorAll('[data-theme-toggle]')) {
      const dark = theme === 'dark';
      button.setAttribute('aria-pressed', String(dark));
      button.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
    }
  }

  for (const button of document.querySelectorAll('[data-theme-toggle]')) {
    button.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('ratspeak-theme', next); } catch {}
      apply(next);
    });
  }
  apply(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
})();
