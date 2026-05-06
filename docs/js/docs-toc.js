/**
 * docs-toc.js — Right-column TOC from headings, IntersectionObserver scroll spy
 */
(function() {
    'use strict';

    var tocNav = document.getElementById('tocNav');
    var mobileToc = document.getElementById('docsMobileToc');
    var mobileTocNav = document.getElementById('mobileTocNav');
    var observer = null;

    function rebuild() {
        if (!tocNav) return;

        var article = document.getElementById('docsArticle');
        var headings = article.querySelectorAll('h2[id], h3[id]');

        if (headings.length === 0) {
            tocNav.innerHTML = '';
            if (mobileTocNav) mobileTocNav.innerHTML = '';
            if (mobileToc) mobileToc.hidden = true;
            return;
        }

        if (mobileToc) mobileToc.hidden = false;

        var html = '';
        var path = window.DocsRouter && window.DocsRouter.getCurrentPath ? window.DocsRouter.getCurrentPath() : '';
        for (var i = 0; i < headings.length; i++) {
            var h = headings[i];
            var level = h.tagName === 'H3' ? 'toc-link--h3' : '';
            var text = h.cloneNode(true);
            var badges = text.querySelectorAll('.glossary-category');
            for (var j = 0; j < badges.length; j++) badges[j].remove();
            var href = path ? '#/' + path + '::' + h.id : '#' + h.id;
            html += '<a class="toc-link ' + level + '" href="' + href + '" data-toc-id="' + h.id + '">' +
                text.textContent.replace(/#$/, '').trim() + '</a>';
        }
        tocNav.innerHTML = html;
        if (mobileTocNav) mobileTocNav.innerHTML = html;

        // Set up IntersectionObserver for scroll spy
        setupObserver(headings);
    }

    function setupObserver(headings) {
        if (observer) observer.disconnect();

        var options = {
            rootMargin: '-80px 0px -70% 0px',
            threshold: 0
        };

        observer = new IntersectionObserver(function(entries) {
            for (var i = 0; i < entries.length; i++) {
                if (entries[i].isIntersecting) {
                    setActiveToc(entries[i].target.id);
                    break;
                }
            }
        }, options);

        for (var i = 0; i < headings.length; i++) {
            observer.observe(headings[i]);
        }
    }

    function setActiveToc(id) {
        var links = document.querySelectorAll('.docs-toc .toc-link, .docs-mobile-toc .toc-link');
        for (var i = 0; i < links.length; i++) {
            links[i].classList.toggle('active', links[i].dataset.tocId === id);
        }
    }

    function bindTocClicks(nav) {
        if (!nav) return;
        nav.addEventListener('click', function(e) {
            var link = e.target.closest('.toc-link');
            if (!link) return;
            e.preventDefault();
            var id = link.dataset.tocId;
            var el = document.getElementById(id);
            if (el) {
                if (window.history && window.history.replaceState) {
                    window.history.replaceState(null, '', link.getAttribute('href'));
                }
                if (mobileToc && mobileToc.contains(link)) mobileToc.open = false;
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    // Smooth scroll on TOC click
    bindTocClicks(tocNav);
    bindTocClicks(mobileTocNav);

    window.DocsToc = {
        rebuild: rebuild
    };
})();
