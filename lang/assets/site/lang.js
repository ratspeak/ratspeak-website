// Header language menu: disclosure button + list of links. Choosing a language stores rs-lang for the edge redirect.
(() => {
  const root = document.querySelector('[data-lang-menu]');
  if (!root) return;
  const trigger = root.querySelector('.lang-trigger');
  const panel = root.querySelector('.lang-panel');
  const links = [...panel.querySelectorAll('a[data-lang]')];
  const cookie = root.dataset.cookie || 'rs-lang';
  const maxAge = Number(root.dataset.maxAge) || 31536000;

  const isOpen = () => trigger.getAttribute('aria-expanded') === 'true';
  const currentIndex = () => Math.max(0, links.findIndex((a) => a.hasAttribute('aria-current')));

  function open(focusIndex) {
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    if (focusIndex != null) links[(focusIndex + links.length) % links.length].focus();
  }
  function close(returnFocus) {
    if (!isOpen()) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (returnFocus) trigger.focus();
  }

  // detail is 0 when the click came from Enter/Space, so keyboard users land on the list
  trigger.addEventListener('click', (event) => (isOpen() ? close(false) : open(event.detail === 0 ? currentIndex() : null)));
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); open(isOpen() ? 0 : currentIndex()); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); open(links.length - 1); }
  });

  panel.addEventListener('keydown', (event) => {
    const i = links.indexOf(document.activeElement);
    const moves = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: links.length - 1 };
    if (event.key in moves) { event.preventDefault(); links[(moves[event.key] + links.length) % links.length].focus(); }
  });

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) { event.preventDefault(); close(true); }
  });
  root.addEventListener('focusout', (event) => {
    if (isOpen() && event.relatedTarget && !root.contains(event.relatedTarget)) close(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (isOpen() && !root.contains(event.target)) close(false);
  });

  for (const link of links) {
    link.addEventListener('click', (event) => {
      const secure = location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${cookie}=${encodeURIComponent(link.dataset.lang)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
      if (link.hasAttribute('aria-current')) {
        event.preventDefault();
        close(true);
        return;
      }
      // keep the device hash / map query when the same page exists in the target language
      const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
      if (plain && link.hasAttribute('data-same-page') && (location.search || location.hash)) {
        event.preventDefault();
        location.href = link.getAttribute('href') + location.search + location.hash;
      }
    });
  }
})();
