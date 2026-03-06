/**
 * docs-router.js — Hash-based routing, inline content rendering via marked.js
 */
(function() {
    'use strict';

    var navData = null;
    var currentPath = null;

    // Custom marked renderer
    var renderer = new marked.Renderer();

    // Headings with anchor links and IDs
    // marked v12+ passes an object { text, depth, raw } instead of positional args
    renderer.heading = function(textOrObj, level, raw) {
        var text, depth;
        if (typeof textOrObj === 'object' && textOrObj !== null) {
            text = textOrObj.text;
            depth = textOrObj.depth;
            raw = textOrObj.raw || textOrObj.text;
        } else {
            text = textOrObj;
            depth = level;
            raw = raw || text;
        }
        // Strip HTML from raw for ID generation
        var plainText = raw.replace(/<[^>]+>/g, '');
        var id = plainText.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
        if (depth >= 2 && depth <= 4) {
            return '<h' + depth + ' id="' + id + '">' + text +
                '<a class="heading-anchor" href="#' + id + '" aria-hidden="true">#</a>' +
                '</h' + depth + '>';
        }
        return '<h' + depth + ' id="' + id + '">' + text + '</h' + depth + '>';
    };

    // Blockquotes → admonitions
    // marked v12+ passes { raw, text } object
    renderer.blockquote = function(quoteOrObj) {
        var quote = (typeof quoteOrObj === 'object' && quoteOrObj !== null) ? quoteOrObj.raw || quoteOrObj.text || '' : quoteOrObj;
        // Re-render inner markdown if we got raw markdown
        if (typeof quoteOrObj === 'object' && quoteOrObj.raw) {
            // Strip leading > and spaces from raw blockquote lines
            var inner = quoteOrObj.raw.replace(/^>\s?/gm, '').trim();
            quote = marked.parse(inner);
        }
        var types = ['Note', 'Warning', 'Tip', 'Info'];
        var icons = {
            Note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
            Warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            Tip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17H8v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z"/></svg>',
            Info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };

        for (var i = 0; i < types.length; i++) {
            var type = types[i];
            var patterns = [
                '<p><strong>' + type + '</strong>:',
                '<p><strong>' + type + '</strong>: ',
                '<p><strong>' + type.toLowerCase() + '</strong>:',
                '<p><strong>' + type.toLowerCase() + '</strong>: '
            ];
            for (var j = 0; j < patterns.length; j++) {
                if (quote.indexOf(patterns[j]) === 0) {
                    var content = quote.replace(patterns[j], '<p>');
                    return '<blockquote class="admonition admonition--' + type.toLowerCase() + '">' +
                        '<div class="admonition__title">' + icons[type] + ' ' + type + '</div>' +
                        content + '</blockquote>';
                }
            }
        }
        return '<blockquote>' + quote + '</blockquote>';
    };

    // Links: convert internal doc links
    // marked v12+ passes { href, title, text, tokens } object
    renderer.link = function(hrefOrObj, title, text) {
        var href;
        if (typeof hrefOrObj === 'object' && hrefOrObj !== null) {
            href = hrefOrObj.href;
            title = hrefOrObj.title;
            text = hrefOrObj.text;
            // If tokens exist, render them for inline formatting
            if (hrefOrObj.tokens && hrefOrObj.tokens.length) {
                text = this.parser ? this.parser.parseInline(hrefOrObj.tokens) : text;
            }
        } else {
            href = hrefOrObj;
        }
        if (href && href.match(/^\.\.?\//)) {
            // Relative path — convert to hash route
            href = href.replace(/\.md$/, '');
            var parts = href.split('/').filter(function(p) { return p && p !== '..' && p !== '.'; });
            if (parts.length >= 2) {
                href = '#/' + parts[parts.length - 2] + '/' + parts[parts.length - 1];
            } else if (parts.length === 1) {
                href = '#/' + parts[0];
            }
        }
        var titleAttr = title ? ' title="' + title + '"' : '';
        var target = href && href.indexOf('http') === 0 ? ' target="_blank" rel="noopener noreferrer"' : '';
        return '<a href="' + href + '"' + titleAttr + target + '>' + text + '</a>';
    };

    marked.setOptions({
        renderer: renderer,
        gfm: true,
        breaks: false,
        headerIds: false // We handle IDs in our custom renderer
    });

    // Load nav data from inline data (no fetch)
    function loadNav(inlineData) {
        navData = inlineData;
        return Promise.resolve(inlineData);
    }

    // Parse hash into section/page
    function parseHash(hash) {
        if (!hash || hash === '#' || hash === '#/') {
            return { section: 'introduction', page: 'what-is-ratspeak' };
        }
        var cleaned = hash.replace(/^#\/?/, '');
        var anchorSplit = cleaned.split('::');
        var path = anchorSplit[0];
        var anchor = anchorSplit[1] || null;
        var parts = path.split('/').filter(Boolean);

        if (parts.length >= 2) {
            return { section: parts[0], page: parts[1], anchor: anchor };
        }
        if (parts.length === 1) {
            return { section: parts[0], page: null, anchor: anchor };
        }
        return { section: 'introduction', page: 'what-is-ratspeak', anchor: anchor };
    }

    // Load and render a page from embedded content (no fetch)
    function loadPage(section, page, anchor) {
        var path = section + '/' + page;
        if (path === currentPath && !anchor) return;
        currentPath = path;

        var article = document.getElementById('docsArticle');

        // Read from embedded DocsContent — no fetch() needed
        var md = window.DocsContent ? window.DocsContent.get(path) : null;

        if (md) {
            var html = marked.parse(md);
            article.innerHTML = html;

            // Wrap tables in scrollable containers for mobile
            var tables = article.querySelectorAll('table');
            for (var t = 0; t < tables.length; t++) {
                var wrapper = document.createElement('div');
                wrapper.className = 'table-wrapper';
                tables[t].parentNode.insertBefore(wrapper, tables[t]);
                wrapper.appendChild(tables[t]);
            }

            // Post-render hooks
            if (window.DocsCode) window.DocsCode.highlight();
            if (window.DocsToc) window.DocsToc.rebuild();
            if (window.DocsNav) window.DocsNav.update(section, page);
            if (path === 'reference/glossary') initGlossarySearch();

            // Scroll to anchor or top
            if (anchor) {
                var el = document.getElementById(anchor);
                if (el) {
                    setTimeout(function() { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
                    return;
                }
            }
            window.scrollTo(0, 0);
        } else {
            article.innerHTML = '<div class="docs-404">' +
                '<h1>404</h1>' +
                '<p>Page not found: <code>' + section + '/' + page + '</code></p>' +
                '<p><a href="#/introduction/what-is-ratspeak">Go to introduction</a></p>' +
                '</div>';
            if (window.DocsToc) window.DocsToc.rebuild();
        }
    }

    // Glossary inline search — filter terms by keystroke
    function initGlossarySearch() {
        var input = document.getElementById('glossarySearchInput');
        if (!input) return;

        input.addEventListener('input', function() {
            filterGlossary(input.value.trim().toLowerCase());
        });

        input.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                input.value = '';
                filterGlossary('');
                input.blur();
            }
        });
    }

    var glossaryEmptyEl = null;

    function filterGlossary(query) {
        var article = document.getElementById('docsArticle');
        if (!article) return;

        var h2s = article.querySelectorAll('h2');
        var h3s = article.querySelectorAll('h3');

        // Show everything when query is empty
        if (!query) {
            for (var i = 0; i < h2s.length; i++) h2s[i].style.display = '';
            for (var j = 0; j < h3s.length; j++) {
                h3s[j].style.display = '';
                // Show siblings until next h2 or h3
                var sib = h3s[j].nextElementSibling;
                while (sib && sib.tagName !== 'H2' && sib.tagName !== 'H3') {
                    sib.style.display = '';
                    sib = sib.nextElementSibling;
                }
            }
            if (glossaryEmptyEl) glossaryEmptyEl.style.display = 'none';
            return;
        }

        // Track which h2 letter headers have visible children
        var h2Visible = {};
        for (var k = 0; k < h2s.length; k++) {
            h2Visible[h2s[k].id] = false;
        }

        var visibleCount = 0;

        // Find the parent h2 for each h3
        for (var m = 0; m < h3s.length; m++) {
            var term = h3s[m];
            // Gather term text + description text
            var text = term.textContent.toLowerCase();
            var descSib = term.nextElementSibling;
            while (descSib && descSib.tagName !== 'H2' && descSib.tagName !== 'H3') {
                text += ' ' + descSib.textContent.toLowerCase();
                descSib = descSib.nextElementSibling;
            }

            var matches = text.indexOf(query) !== -1;
            if (matches) visibleCount++;
            term.style.display = matches ? '' : 'none';

            // Show/hide description siblings
            var sib2 = term.nextElementSibling;
            while (sib2 && sib2.tagName !== 'H2' && sib2.tagName !== 'H3') {
                sib2.style.display = matches ? '' : 'none';
                sib2 = sib2.nextElementSibling;
            }

            // Find parent h2
            if (matches) {
                var prev = term.previousElementSibling;
                while (prev) {
                    if (prev.tagName === 'H2') {
                        h2Visible[prev.id] = true;
                        break;
                    }
                    prev = prev.previousElementSibling;
                }
            }
        }

        // Show/hide h2 letter headers
        for (var n = 0; n < h2s.length; n++) {
            h2s[n].style.display = h2Visible[h2s[n].id] ? '' : 'none';
        }

        // Show empty state when no terms match
        if (visibleCount === 0) {
            if (!glossaryEmptyEl) {
                glossaryEmptyEl = document.createElement('div');
                glossaryEmptyEl.className = 'glossary-empty';
                glossaryEmptyEl.textContent = 'No matching terms.';
            }
            if (!glossaryEmptyEl.parentNode) {
                var searchBox = article.querySelector('.glossary-search');
                if (searchBox) {
                    searchBox.parentNode.insertBefore(glossaryEmptyEl, searchBox.nextSibling);
                } else {
                    article.appendChild(glossaryEmptyEl);
                }
            }
            glossaryEmptyEl.style.display = '';
        } else if (glossaryEmptyEl) {
            glossaryEmptyEl.style.display = 'none';
        }
    }

    // Route handler
    function handleRoute() {
        var parsed = parseHash(window.location.hash);
        if (!parsed.page) {
            // Find first page in section
            if (navData) {
                for (var i = 0; i < navData.sections.length; i++) {
                    if (navData.sections[i].slug === parsed.section) {
                        parsed.page = navData.sections[i].pages[0].slug;
                        break;
                    }
                }
            }
            if (!parsed.page) parsed.page = 'what-is-ratspeak';
        }
        loadPage(parsed.section, parsed.page, parsed.anchor);
        if (window.DocsSidebar) window.DocsSidebar.setActive(parsed.section, parsed.page);
    }

    // Initialize — called explicitly from docs.html after all scripts are loaded
    function init(inlineData) {
        loadNav(inlineData).then(function(data) {
            if (window.DocsSidebar) window.DocsSidebar.init(data);
            if (window.DocsNav) window.DocsNav.init(data);
            if (window.DocsSearch) window.DocsSearch.init();
            handleRoute();
        });

        window.addEventListener('hashchange', handleRoute);
    }

    // Expose — do NOT auto-init; docs.html calls DocsRouter.init(NAV_DATA) explicitly
    window.DocsRouter = {
        init: init,
        getNav: function() { return navData; },
        parseHash: parseHash
    };
})();
