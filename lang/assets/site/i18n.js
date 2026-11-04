// Page strings for scripts: t()/tp() return the page language's string, else the English default written at the call.
// Generated /xx/ pages set window.RS_I18N = {lang, dir, locale, tech, base, pages, strings} before this runs.
(() => {
  const data = window.RS_I18N || {};
  const root = document.documentElement;
  const lang = data.lang || root.lang || 'en';
  const dir = data.dir || root.dir || 'ltr';
  const rtl = dir === 'rtl';
  const strings = data.strings || {};
  // English keeps the visitor's own date and time order; translated pages use their language (fa: calendar per languages.json).
  const dateLocale = data.locale || (lang === 'en' ? undefined : lang);
  // Byte counts, versions and percentages in code-built technical text (fa keeps Latin digits there).
  const techLocale = data.tech || lang;
  const base = data.base || '/';
  const pages = data.pages || [];
  const cache = {};
  const intl = (kind, locale, opts) => {
    const key = kind + '|' + locale + '|' + JSON.stringify(opts || {});
    return cache[key] || (cache[key] = new Intl[kind](locale, opts));
  };

  const LRI = '\u2066', PDI = '\u2069';
  const LATIN_RUN = /(?:[$€£#@+]|\.(?=[A-Za-z]))?[A-Za-z0-9][A-Za-z0-9 .,:'’&+\-_/()@#%→\u00a0\u2011]*[A-Za-z0-9)%]|[$€£]?[A-Za-z0-9]/g;
  // RTL: Latin runs (brands, labels, files) are isolated, and arrows outside them point the reading way.
  function rtlText(s) {
    let out = '', last = 0;
    for (const m of s.matchAll(LATIN_RUN)) {
      if (!/[A-Za-z0-9]/.test(m[0]) || s.slice(0, m.index).lastIndexOf(LRI) > s.slice(0, m.index).lastIndexOf(PDI)) continue;
      out += flip(s.slice(last, m.index)) + LRI + m[0] + PDI;
      last = m.index + m[0].length;
    }
    return out + flip(s.slice(last));
  }
  const flip = (s) => s.replace(/→/g, '←').replace(/↗/g, '↖');
  // Unfilled {placeholders} pass through untouched, so callers can still split on them.
  const finish = (s) => (rtl ? s.split(/(\{\/?\w+\})/).map((part, i) => (i % 2 ? part : rtlText(part))).join('') : s);

  const num = (n, opts) => intl('NumberFormat', lang, opts).format(n);
  const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? (typeof vars[k] === 'number' ? num(vars[k]) : String(vars[k])) : m));
  const own = (id) => (Object.prototype.hasOwnProperty.call(strings, id) ? strings[id] : undefined);

  function t(id, en, vars) {
    const s = own(id);
    return finish(fill(typeof s === 'string' && s ? s : en, vars));
  }

  // tp('id', '{n} node', '{n} nodes', n, vars): the translation holds one string per CLDR plural category.
  function tp(id, one, other, n, vars) {
    const all = Object.assign({ n }, vars);
    const forms = own(id);
    if (forms && typeof forms === 'object') {
      const s = forms[intl('PluralRules', lang).select(n)] || forms.other;
      if (s) return finish(fill(s, all));
    }
    return finish(fill(intl('PluralRules', 'en').select(n) === 'one' ? one : other, all));
  }

  // "A, B, and C" in the page language; listNodes keeps DOM nodes (links) in place.
  const listParts = (items, type) => intl('ListFormat', lang, { type }).formatToParts(items).map((part) => (
    lang === 'fa' && part.type === 'literal' ? { ...part, value: part.value.replace(/،[\s\u200f]*و /g, ' و ') } : part
  ));
  const list = (items, type = 'conjunction') => listParts(items.map(String), type).map((part) => part.value).join('');
  function listNodes(nodes, type = 'conjunction') {
    const marks = nodes.map((_, i) => '\u0000' + i + '\u0000');
    return listParts(marks, type).map((part) => {
      const m = part.type === 'element' && /^\u0000(\d+)\u0000$/.exec(part.value);
      return m ? nodes[+m[1]] : part.value;
    });
  }

  const ltr = (s) => (rtl ? LRI + s + PDI : String(s));
  const arrow = (s) => (rtl ? flip(s) : s);
  // Sizes in binary units, as the installer and download buttons have always shown them.
  function size(bytes, digits) {
    const [unit, value] = bytes < 1024 ? ['byte', bytes] : bytes < 1048576 ? ['kilobyte', bytes / 1024] : ['megabyte', bytes / 1048576];
    const d = unit === 'byte' ? 0 : digits != null ? digits : value < 10 ? 1 : 0;
    return ltr(intl('NumberFormat', techLocale, { style: 'unit', unit, unitDisplay: unit === 'byte' ? 'narrow' : 'short', minimumFractionDigits: d, maximumFractionDigits: d }).format(value));
  }
  const techNum = (n, opts) => intl('NumberFormat', techLocale, opts).format(n);
  // enLocale pins an English page's format where the house style needs one (release notes read "3 November 2026").
  const date = (d, opts, enLocale) => intl('DateTimeFormat', lang === 'en' && enLocale ? enLocale : dateLocale, opts).format(d);
  // "5m ago": English keeps its narrow form; other languages read better in the short style.
  function rel(value, now = Date.now()) {
    const delta = (new Date(value).getTime() - now) / 1000;
    if (!Number.isFinite(delta)) return null;
    const f = intl('RelativeTimeFormat', lang, { numeric: 'always', style: lang === 'en' ? 'narrow' : 'short' });
    const s = Math.max(1, Math.round(Math.abs(delta)));
    const sign = delta < 0 ? -1 : 1;
    if (s < 60) return f.format(sign * s, 'second');
    const m = Math.round(s / 60);
    if (m < 60) return f.format(sign * m, 'minute');
    const h = Math.round(m / 60);
    if (h < 48) return f.format(sign * h, 'hour');
    return f.format(sign * Math.round(h / 24), 'day');
  }
  // Site paths to localized pages stay in the page language.
  function href(path) {
    const m = /^\/([\w-]+\.html)?([?#].*)?$/.exec(path);
    if (!m || base === '/') return path;
    const page = m[1] || 'index.html';
    if (!pages.includes(page)) return path;
    return base + (page === 'index.html' ? '' : page) + (m[2] || '');
  }

  window.RSI18N = { lang, dir, rtl, t, tp, list, listNodes, num, techNum, size, date, rel, ltr, arrow, href };
})();
