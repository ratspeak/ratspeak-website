/**
 * docs-router.js — Hash-based routing, inline content rendering via marked.js
 */
(function() {
    'use strict';

    var navData = null;
    var currentPath = null;

    // Custom marked renderer
    var renderer = new marked.Renderer();

    function escapeAttr(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function slugifyHeading(text) {
        return String(text || '').replace(/<[^>]+>/g, '').toLowerCase()
            .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
    }

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
        var id = slugifyHeading(raw);
        var route = currentPath ? '#/' + currentPath + '::' + id : '#' + id;
        if (depth >= 2 && depth <= 4) {
            return '<h' + depth + ' id="' + id + '">' + text +
                '<a class="heading-anchor" href="' + route + '" aria-label="Link to ' + escapeAttr(plainText) + '">#</a>' +
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
        var linkAnchor = '';
        if (href && href.indexOf('#') !== -1 && !href.match(/^[a-z]+:/i) && href.charAt(0) !== '#') {
            var hrefParts = href.split('#');
            href = hrefParts.shift();
            linkAnchor = hrefParts.join('#');
        }

        if (href && href.match(/^\.\.?\//)) {
            // Relative path — convert to hash route
            href = href.replace(/\.md$/, '');
            var parts = href.split('/').filter(function(p) { return p && p !== '..' && p !== '.'; });
            if (parts.length >= 2) {
                href = '#/' + parts[parts.length - 2] + '/' + parts[parts.length - 1];
            } else if (parts.length === 1) {
                // Singleton (./page) — same section as the page being rendered.
                var sec = (currentPath || '').split('/')[0] || 'introduction';
                href = '#/' + sec + '/' + parts[0];
            }
            if (linkAnchor) href += '::' + linkAnchor;
        } else if (href && /\.md$/.test(href) && !/^[a-z]+:/i.test(href) && href.charAt(0) !== '#' && href.charAt(0) !== '/') {
            // Bare same-section link (e.g. "rslxmf.md") — resolve to current section.
            var sec2 = (currentPath || '').split('/')[0] || 'introduction';
            href = '#/' + sec2 + '/' + href.replace(/\.md$/, '');
            if (linkAnchor) href += '::' + linkAnchor;
        }
        var titleAttr = title ? ' title="' + escapeAttr(title) + '"' : '';
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
        var path = cleaned;
        var anchor = null;
        if (cleaned.indexOf('::') !== -1) {
            var anchorSplit = cleaned.split('::');
            path = anchorSplit[0];
            anchor = anchorSplit[1] || null;
        } else if (cleaned.indexOf('#') !== -1) {
            var hashSplit = cleaned.split('#');
            path = hashSplit[0];
            anchor = hashSplit[1] || null;
        }
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
        if (path === currentPath && !anchor) {
            window.scrollTo(0, 0);
            return;
        }
        if (path === currentPath && anchor) {
            scrollToAnchor(anchor);
            return;
        }
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

            // Scroll to anchor or top
            if (anchor) {
                if (scrollToAnchor(anchor)) {
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

    function scrollToAnchor(anchor) {
        var el = document.getElementById(anchor);
        if (!el) return false;
        setTimeout(function() { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
        return true;
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
        getCurrentPath: function() { return currentPath; },
        parseHash: parseHash
    };
})();
