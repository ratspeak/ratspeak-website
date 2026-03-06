/**
 * docs-search.js — Fuse.js fuzzy search (inline data, no fetch)
 */
(function() {
    'use strict';

    var searchInput = document.getElementById('searchInput');
    var searchResults = document.getElementById('searchResults');
    var fuse = null;
    var indexLoaded = false;
    var focusedIndex = -1;

    function init() {
        if (!searchInput) return;

        // Load index on first focus
        searchInput.addEventListener('focus', loadIndex);
        searchInput.addEventListener('input', onSearch);
        searchInput.addEventListener('keydown', onKeydown);

        // Close on outside click
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.sidebar-search') && !e.target.closest('.search-results')) {
                closeResults();
            }
        });

        // Keyboard shortcut: / to focus search
        document.addEventListener('keydown', function(e) {
            if (e.key === '/' && !e.target.closest('input, textarea, [contenteditable]')) {
                e.preventDefault();
                searchInput.focus();
            }
            if (e.key === 'Escape') {
                closeResults();
                searchInput.blur();
            }
        });
    }

    function loadIndex() {
        if (indexLoaded) return;
        indexLoaded = true;

        // Use inline search data (no fetch)
        var data = window.SEARCH_INDEX;
        if (!data) return;

        fuse = new Fuse(data, {
            keys: [
                { name: 'title', weight: 0.5 },
                { name: 'headings', weight: 0.3 },
                { name: 'content', weight: 0.15 },
                { name: 'section', weight: 0.05 }
            ],
            threshold: 0.3,
            ignoreLocation: true,
            includeMatches: true,
            minMatchCharLength: 1,
            limit: 8
        });
    }

    function onSearch() {
        var query = searchInput.value.trim();
        if (query.length < 2 || !fuse) {
            closeResults();
            return;
        }

        var results = fuse.search(query);

        // Sort glossary results after all others
        results.sort(function(a, b) {
            var aGloss = a.item.path === 'reference/glossary' ? 1 : 0;
            var bGloss = b.item.path === 'reference/glossary' ? 1 : 0;
            return aGloss - bGloss;
        });

        focusedIndex = -1;

        if (results.length === 0) {
            searchResults.innerHTML = '<div class="search-results__empty">No results found</div>';
            searchResults.classList.add('active');
            return;
        }

        var html = '';
        var count = Math.min(results.length, 8);
        for (var i = 0; i < count; i++) {
            var item = results[i].item;
            var matches = results[i].matches || [];

            // Highlight title
            var titleHtml = escapeHtml(item.title);
            for (var mi = 0; mi < matches.length; mi++) {
                if (matches[mi].key === 'title') {
                    titleHtml = highlightMatches(item.title, matches[mi].indices);
                    break;
                }
            }

            // Context-aware snippet
            var snippet = '';
            var contentMatch = null;
            for (var ci = 0; ci < matches.length; ci++) {
                if (matches[ci].key === 'content') {
                    contentMatch = matches[ci];
                    break;
                }
            }
            if (contentMatch && contentMatch.indices.length) {
                var pos = contentMatch.indices[0][0];
                var start = Math.max(0, pos - 50);
                var end = Math.min(item.content.length, pos + 70);
                snippet = (start > 0 ? '...' : '') +
                          item.content.substring(start, end) +
                          (end < item.content.length ? '...' : '');
            } else if (item.content) {
                snippet = item.content.substring(0, 120);
            }

            html += '<a class="search-result" href="#/' + item.path + '" data-index="' + i + '">' +
                '<div class="search-result__section">' + escapeHtml(item.section) + '</div>' +
                '<div class="search-result__title">' + titleHtml + '</div>';
            if (snippet) {
                html += '<div class="search-result__snippet">' + escapeHtml(snippet) + '</div>';
            }
            html += '</a>';
        }
        searchResults.innerHTML = html;
        searchResults.classList.add('active');

        // Bind click handlers
        var resultEls = searchResults.querySelectorAll('.search-result');
        for (var j = 0; j < resultEls.length; j++) {
            resultEls[j].addEventListener('click', function() {
                closeResults();
                searchInput.value = '';
            });
        }
    }

    function highlightMatches(text, indices) {
        if (!indices || !indices.length) return escapeHtml(text);
        var result = '', last = 0;
        for (var i = 0; i < indices.length; i++) {
            var s = indices[i][0], e = indices[i][1] + 1;
            if (s > last) result += escapeHtml(text.substring(last, s));
            result += '<mark>' + escapeHtml(text.substring(s, e)) + '</mark>';
            last = e;
        }
        if (last < text.length) result += escapeHtml(text.substring(last));
        return result;
    }

    function onKeydown(e) {
        var results = searchResults.querySelectorAll('.search-result');
        if (!results.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusedIndex = Math.min(focusedIndex + 1, results.length - 1);
            updateFocus(results);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusedIndex = Math.max(focusedIndex - 1, 0);
            updateFocus(results);
        } else if (e.key === 'Enter' && focusedIndex >= 0) {
            e.preventDefault();
            results[focusedIndex].click();
        }
    }

    function updateFocus(results) {
        for (var i = 0; i < results.length; i++) {
            results[i].classList.toggle('focused', i === focusedIndex);
        }
    }

    function closeResults() {
        searchResults.classList.remove('active');
        searchResults.innerHTML = '';
        focusedIndex = -1;
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    window.DocsSearch = {
        init: init
    };
})();
