// rsNode guide: this page is public; the guide comes from the beta API after the beta password.
(() => {
  const api = '/api/rsnode-beta?action=';
  const lock = document.getElementById('guideLock');
  const form = document.getElementById('guideLogin');
  const password = document.getElementById('guidePassword');
  const unlock = document.getElementById('guideUnlock');
  const status = document.getElementById('guideStatus');
  const guide = document.getElementById('guide');
  const version = document.getElementById('guideVersion');
  const signOut = document.getElementById('guideSignOut');
  if (!lock || !form || !guide) return;

  const say = text => { status.textContent = text; status.hidden = !text; };
  const errorText = async (response, fallback) => {
    try { return (await response.json()).error || fallback; } catch { return fallback; }
  };

  // The fragment is ours and integrity-checked server-side; strip anything active anyway.
  function clean(doc) {
    for (const node of doc.querySelectorAll('script,style,link,meta,iframe,object,embed,form,base')) node.remove();
    for (const node of doc.body.querySelectorAll('*')) {
      for (const { name, value } of [...node.attributes]) {
        if (/^on/i.test(name) || (/^(href|src|action|formaction|xlink:href)$/i.test(name) && /^\s*(javascript|data|vbscript):/i.test(value))) node.removeAttribute(name);
      }
    }
    return doc.body;
  }

  function showLocked(message = '') {
    guide.hidden = true;
    guide.replaceChildren();
    lock.hidden = false;
    form.hidden = false;
    signOut.hidden = true;
    version.textContent = 'For rsNode beta testers';
    say(message);
  }

  async function load() {
    let response;
    try {
      response = await fetch(api + 'guide', { credentials: 'same-origin', cache: 'no-store' });
    } catch {
      return showLocked('The guide could not be loaded. Check your connection and try again.');
    }
    if (response.status === 401) return showLocked();
    if (!response.ok) {
      form.hidden = true;
      return say(response.status === 404 ? 'The rsNode guide is not published yet. Check back soon.'
        : 'The guide could not be loaded. Try again later.');
    }
    const body = clean(new DOMParser().parseFromString(await response.text(), 'text/html'));
    guide.replaceChildren(...body.childNodes);
    // Phone layouts stack table cells, so each cell carries its column name.
    for (const table of guide.querySelectorAll('table')) {
      const names = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
      for (const row of table.querySelectorAll('tbody tr')) {
        [...row.cells].forEach((cell, i) => { if (i && names[i]) cell.dataset.label = names[i]; });
      }
    }
    const release = guide.querySelector('[data-guide-version]')?.dataset.guideVersion;
    version.textContent = release ? `rsNode ${release} · beta testers only` : 'Beta testers only';
    lock.hidden = true;
    guide.hidden = false;
    signOut.hidden = false;
    password.value = '';
    document.dispatchEvent(new Event('rs:content'));
    const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView();
    return true;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    unlock.disabled = true;
    say('Checking…');
    try {
      const response = await fetch(api + 'login', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.value })
      });
      if (!response.ok) {
        say(await errorText(response, 'That beta password was not accepted.'));
        password.select();
        return;
      }
      say('Loading the guide…');
      if (await load() === true && !location.hash) {
        const first = guide.querySelector('h2');
        if (first) { first.tabIndex = -1; first.focus(); }
      }
    } catch {
      say('The guide could not be reached. Check your connection and try again.');
    } finally {
      unlock.disabled = false;
    }
  });

  signOut.addEventListener('click', async () => {
    signOut.disabled = true;
    try {
      await fetch(api + 'logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
    } catch {}
    signOut.disabled = false;
    showLocked();
    password.focus();
  });

  load();
})();
