(() => {
  const CONTRACT = '0xf1e9baa65d418a9025e1851dd2d37f1ad208bba3';
  const toast = document.getElementById('tokenToast');
  let toastTimer = null;

  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  };

  const writeClipboard = async (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  };

  for (const btn of document.querySelectorAll('[data-copy-contract]')) {
    btn.addEventListener('click', () => {
      const label = btn.matches('[data-copy-label]')
        ? btn
        : btn.querySelector('[data-copy-label]');
      writeClipboard(CONTRACT)
        .then(() => {
          if (label) {
            const prev = label.textContent;
            label.textContent = 'Copied';
            setTimeout(() => { label.textContent = prev; }, 1600);
          }
          showToast('Contract copied.');
        })
        .catch(() => showToast('Copy failed. Select the address manually.'));
    });
  }

  for (const btn of document.querySelectorAll('.faq-q')) {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      if (!item) return;
      const open = item.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
  }

  if (
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    'IntersectionObserver' in window
  ) {
    const rows = [...document.querySelectorAll('.token-strike__row')];
    const belowFold = rows.filter(
      (row) => row.getBoundingClientRect().top > window.innerHeight * 0.92
    );
    for (const row of belowFold) row.classList.add('is-armed');
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.remove('is-armed');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.35 }
    );
    for (const row of belowFold) io.observe(row);
  }
})();
