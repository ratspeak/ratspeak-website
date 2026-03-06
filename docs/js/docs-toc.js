/**
 * docs-toc.js — Right-column TOC from headings, IntersectionObserver scroll spy
 */
(function() {
    'use strict';

    var tocNav = document.getElementById('tocNav');
    var observer = null;

    function rebuild() {
        if (!tocNav) return;

        var article = document.getElementById('docsArticle');
        var headings = article.querySelectorAll('h2[id], h3[id]');

        if (headings.length === 0) {
            tocNav.innerHTML = '';
            return;
        }

        var html = '';
        for (var i = 0; i < headings.length; i++) {
            var h = headings[i];
            var level = h.tagName === 'H3' ? 'toc-link--h3' : '';
            html += '<a class="toc-link ' + level + '" href="#' + h.id + '" data-toc-id="' + h.id + '">' +
                h.textContent.replace(/#$/, '').trim() + '</a>';
        }
        tocNav.innerHTML = html;

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
        var links = tocNav.querySelectorAll('.toc-link');
        for (var i = 0; i < links.length; i++) {
            links[i].classList.toggle('active', links[i].dataset.tocId === id);
        }
    }

    // Smooth scroll on TOC click
    if (tocNav) {
        tocNav.addEventListener('click', function(e) {
            var link = e.target.closest('.toc-link');
            if (!link) return;
            e.preventDefault();
            var id = link.dataset.tocId;
            var el = document.getElementById(id);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    window.DocsToc = {
        rebuild: rebuild
    };
})();
