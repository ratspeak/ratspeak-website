// Release notes in a dialog. Links keep their GitHub href, so they still work without this script.
(() => {
  const API = 'https://api.github.com/repos/';
  const cache = (window.ratspeakReleaseCache = window.ratspeakReleaseCache || {});
  const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  let dialog, titleEl, dateEl, bodyEl, githubEl, trigger, openSeq = 0;

  // github.com/<owner>/<repo>/releases[/latest|/tag/<tag>] -> its API release URL
  function apiUrl(href) {
    let url;
    try { url = new URL(href, location.href); } catch { return null; }
    if (url.hostname !== 'github.com') return null;
    const m = url.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/releases(?:\/(?:latest|tag\/([^/]+)))?\/?$/);
    if (!m) return null;
    return API + m[1] + '/' + m[2] + '/releases/' + (m[3] ? 'tags/' + m[3] : 'latest');
  }

  function fetchRelease(url) {
    if (!cache[url]) {
      cache[url] = fetch(url, { headers: { Accept: 'application/vnd.github+json' } }).then(r => {
        if (!r.ok) throw new Error('Release lookup failed');
        return r.json();
      });
    }
    return cache[url].catch(err => { delete cache[url]; throw err; });
  }

  // ── Markdown: a safe subset, built as DOM nodes so nothing from the body is parsed as HTML ──
  function safeHref(raw) {
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch { return null; }
  }

  function link(href, children) {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.append(...children);
    return a;
  }

  const INLINE = /(`+)([\s\S]*?[^`])\1(?!`)|!?\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|(^|[^\w*])\*(?!\s)([^*]+?)\*(?!\w)|(^|[^\w])_(?!\s)([^_]+?)_(?!\w)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/;

  function inline(text, inLink) {
    const out = [];
    while (text) {
      const m = INLINE.exec(text);
      if (!m) { out.push(text); break; }
      let start = m.index;
      let node;
      if (inLink && (m[4] !== undefined || m[11])) {
        node = m[3] !== undefined && m[4] !== undefined ? inline(m[3] || m[4], true) : m[0];
      } else if (m[1]) {
        node = document.createElement('code');
        node.textContent = m[2].replace(/^ (.*) $/, '$1');
      } else if (m[4] !== undefined) {
        const href = safeHref(m[4]);
        const label = inline(m[3] || m[4], true);
        node = href ? link(href, label) : label;
      } else if (m[5] || m[6]) {
        node = document.createElement('strong');
        node.append(...inline(m[5] || m[6], inLink));
      } else if (m[8] || m[10]) {
        const lead = m[7] ?? m[9] ?? '';
        out.push(text.slice(0, start) + lead);
        node = document.createElement('em');
        node.append(...inline(m[8] || m[10], inLink));
        out.push(node);
        text = text.slice(m.index + m[0].length);
        continue;
      } else {
        node = link(m[11], [m[11]]);
      }
      if (start) out.push(text.slice(0, start));
      Array.isArray(node) ? out.push(...node) : out.push(node);
      text = text.slice(m.index + m[0].length);
    }
    return out;
  }

  function arrow() {
    const span = document.createElement('span');
    span.setAttribute('aria-hidden', 'true');
    span.textContent = '↗';
    return span;
  }

  function el(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.append(...inline(text));
    return node;
  }

  function render(md, skipTitle) {
    const root = document.createDocumentFragment();
    const lines = md.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n');
    let para = null;
    let lists = [];
    let lastItem = null;
    let first = true;
    const levels = lines.map(l => (l.match(/^\s{0,3}(#{1,6})\s/) || [])[1]).filter(Boolean).map(h => h.length);
    const firstHeading = lines.find(l => l.trim()) || '';
    const titled = /^\s{0,3}#{1,6}\s/.test(firstHeading) && skipTitle.includes(firstHeading.replace(/^\s*#+\s+|\s*#*\s*$/g, '').toLowerCase());
    const base = Math.min(...(titled ? levels.slice(1) : levels), 6);
    const endPara = () => { if (para) { root.append(el('p', para.join(' '))); para = null; } };
    const endLists = () => { lists = []; lastItem = null; };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fence = line.match(/^\s*(```|~~~)/);
      if (fence) {
        endPara(); endLists();
        const code = [];
        while (++i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i]);
        const pre = document.createElement('pre');
        pre.append(document.createElement('code'));
        pre.firstChild.textContent = code.join('\n');
        root.append(pre);
        first = false;
        continue;
      }
      if (!line.trim()) { endPara(); if (lists.length && !/^\s+\S|^\s*([-*+]|\d+[.)])\s/.test(lines[i + 1] || '')) endLists(); continue; }

      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (heading) {
        endPara(); endLists();
        // The body often opens with the version as a heading; the dialog title already says it.
        if (first && titled) { first = false; continue; }
        root.append(el('h' + Math.min(3 + heading[1].length - base, 6), heading[2]));
        first = false;
        continue;
      }
      first = false;
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { endPara(); endLists(); root.append(document.createElement('hr')); continue; }

      const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (item) {
        endPara();
        const indent = item[1].replace(/\t/g, '    ').length;
        const ordered = /\d/.test(item[2]);
        while (lists.length && indent < lists[lists.length - 1].indent) lists.pop();
        if (lists.length && indent === lists[lists.length - 1].indent && lists[lists.length - 1].ordered !== ordered) lists.pop();
        let top = lists[lists.length - 1];
        if (!top || indent > top.indent) {
          const list = document.createElement(ordered ? 'ol' : 'ul');
          if (ordered && parseInt(item[2], 10) !== 1) list.start = parseInt(item[2], 10);
          ((top && top.list.lastElementChild) || root).append(list);
          top = { indent, list, ordered };
          lists.push(top);
        }
        lastItem = el('li', item[3].replace(/^\[([ xX])\]\s+/, (_, c) => (c === ' ' ? '☐ ' : '☑ ')));
        top.list.append(lastItem);
        continue;
      }
      if (lists.length && lastItem && /^\s+\S/.test(line)) { lastItem.append(' ', ...inline(line.trim())); continue; }
      endLists();

      const quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) {
        endPara();
        const prev = root.lastChild;
        if (prev && prev.nodeName === 'BLOCKQUOTE') prev.append(' ', ...inline(quote[1]));
        else root.append(el('blockquote', quote[1]));
        continue;
      }
      (para = para || []).push(line.trim());
    }
    endPara();
    return root;
  }

  // ── Dialog ──
  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'rn-dialog';
    dialog.setAttribute('aria-labelledby', 'rnDialogTitle');
    dialog.innerHTML =
      '<div class="rn-dialog__frame">' +
        '<header class="rn-dialog__head">' +
          '<div class="rn-dialog__heading"><p class="rn-dialog__kicker">Release notes</p><h2 class="rn-dialog__title" id="rnDialogTitle"></h2><p class="rn-dialog__date"></p></div>' +
          '<button type="button" class="rn-dialog__close" aria-label="Close release notes"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
        '</header>' +
        '<div class="rn-dialog__body" tabindex="0" role="region" aria-label="Release notes" aria-live="polite"></div>' +
        '<footer class="rn-dialog__foot"><a class="rn-dialog__github" target="_blank" rel="noopener">View on GitHub <span aria-hidden="true">↗</span></a></footer>' +
      '</div>';
    titleEl = dialog.querySelector('.rn-dialog__title');
    dateEl = dialog.querySelector('.rn-dialog__date');
    bodyEl = dialog.querySelector('.rn-dialog__body');
    githubEl = dialog.querySelector('.rn-dialog__github');
    dialog.querySelector('.rn-dialog__close').addEventListener('click', () => dialog.close());
    // A click on the backdrop lands on the dialog itself; the frame covers the panel.
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('rn-dialog-open');
      if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
      trigger = null;
    });
    document.body.append(dialog);
  }

  function state(kind, message, href) {
    bodyEl.replaceChildren();
    bodyEl.setAttribute('aria-busy', kind === 'loading' ? 'true' : 'false');
    const p = document.createElement('p');
    p.className = 'rn-dialog__state rn-dialog__state--' + kind;
    p.textContent = message;
    if (href) p.append(' ', link(href, ['Open them on GitHub ', arrow()]), '.');
    bodyEl.append(p);
  }

  function open(a) {
    const url = apiUrl(a.href);
    if (!url) return false;
    if (!dialog) build();
    const label = a.dataset.releaseNotes || 'Release';
    const seq = ++openSeq;
    trigger = a;
    titleEl.textContent = label;
    dateEl.textContent = '';
    githubEl.href = a.href;
    state('loading', 'Loading release notes…');
    document.documentElement.classList.add('rn-dialog-open');
    dialog.showModal();
    bodyEl.scrollTop = 0;
    fetchRelease(url).then(release => {
      if (seq !== openSeq) return;
      const tag = String(release.tag_name || '');
      titleEl.textContent = tag ? label + ' ' + tag : label;
      if (release.published_at) {
        const when = new Date(release.published_at);
        if (!isNaN(when)) {
          const time = document.createElement('time');
          time.dateTime = release.published_at;
          time.textContent = 'Published ' + dateFormat.format(when);
          dateEl.replaceChildren(time);
        }
      }
      const page = safeHref(release.html_url || '');
      if (page && new URL(page).hostname === 'github.com') githubEl.href = page;
      const body = String(release.body || '').trim();
      if (!body) { state('empty', 'This release has no notes.'); return; }
      const names = [tag, String(release.name || ''), label + ' ' + tag].map(s => s.trim().toLowerCase()).filter(Boolean);
      bodyEl.replaceChildren(render(body, names));
      bodyEl.setAttribute('aria-busy', 'false');
    }).catch(() => {
      if (seq !== openSeq) return;
      state('error', 'The release notes didn’t load.', githubEl.href);
    });
    return true;
  }

  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[data-release-notes]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (typeof HTMLDialogElement !== 'function' || typeof fetch !== 'function') return;
    if (open(a)) e.preventDefault();
  });
})();
