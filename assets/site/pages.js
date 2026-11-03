// Map, support and policy pages: toggle state and the "On this page" position.
(() => {
  const root = document.documentElement;

  // The map's own script flips the theme (it must, to restyle the basemap); mirror it on the button.
  const syncToggle = () => {
    const dark = root.getAttribute('data-theme') === 'dark';
    for (const button of document.querySelectorAll('[data-theme-toggle]')) {
      button.setAttribute('aria-pressed', String(dark));
      button.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
    }
  };
  new MutationObserver(syncToggle).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  syncToggle();

  const toc = document.querySelector('.toc');
  if (!toc || !('IntersectionObserver' in window)) return;
  const links = new Map();
  for (const link of toc.querySelectorAll('a[href^="#"]')) {
    const section = document.getElementById(link.hash.slice(1));
    if (section) links.set(section, link);
  }
  const visible = new Set();
  const mark = () => {
    const first = [...links.keys()].find(section => visible.has(section));
    if (!first) return;
    for (const [section, link] of links) {
      if (section === first) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target);
    mark();
  }, { rootMargin: '-15% 0px -55% 0px' });
  for (const section of links.keys()) observer.observe(section);
})();
