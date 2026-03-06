/**
 * docs-nav.js — Breadcrumbs and prev/next navigation
 */
(function() {
    'use strict';

    var navData = null;
    var flatPages = [];

    function init(data) {
        navData = data;
        buildFlatList(data);
    }

    function buildFlatList(data) {
        flatPages = [];
        for (var i = 0; i < data.sections.length; i++) {
            var section = data.sections[i];
            for (var j = 0; j < section.pages.length; j++) {
                flatPages.push({
                    section: section.slug,
                    sectionTitle: section.title,
                    page: section.pages[j].slug,
                    pageTitle: section.pages[j].title
                });
            }
        }
    }

    function update(sectionSlug, pageSlug) {
        updateBreadcrumbs(sectionSlug, pageSlug);
        updatePrevNext(sectionSlug, pageSlug);
    }

    function updateBreadcrumbs(sectionSlug, pageSlug) {
        var el = document.getElementById('docsBreadcrumbs');
        if (!el || !navData) return;

        var sectionTitle = '';
        var pageTitle = '';

        for (var i = 0; i < navData.sections.length; i++) {
            if (navData.sections[i].slug === sectionSlug) {
                sectionTitle = navData.sections[i].title;
                for (var j = 0; j < navData.sections[i].pages.length; j++) {
                    if (navData.sections[i].pages[j].slug === pageSlug) {
                        pageTitle = navData.sections[i].pages[j].title;
                        break;
                    }
                }
                break;
            }
        }

        el.innerHTML = '<a href="#/introduction/what-is-ratspeak">Docs</a>' +
            '<span class="docs-breadcrumbs__sep">/</span>' +
            '<a href="#/' + sectionSlug + '">' + sectionTitle + '</a>' +
            '<span class="docs-breadcrumbs__sep">/</span>' +
            '<span class="docs-breadcrumbs__current">' + pageTitle + '</span>';

        // On mobile, "Docs" link opens sidebar instead of navigating
        var docsLink = el.querySelector('a');
        if (docsLink) {
            docsLink.addEventListener('click', function(e) {
                if (window.innerWidth <= 768 && window.DocsSidebar && window.DocsSidebar.openMobile) {
                    e.preventDefault();
                    window.DocsSidebar.openMobile();
                }
            });
        }
    }

    function updatePrevNext(sectionSlug, pageSlug) {
        var el = document.getElementById('docsPrevNext');
        if (!el) return;

        var currentIndex = -1;
        for (var i = 0; i < flatPages.length; i++) {
            if (flatPages[i].section === sectionSlug && flatPages[i].page === pageSlug) {
                currentIndex = i;
                break;
            }
        }

        if (currentIndex === -1) {
            el.innerHTML = '';
            return;
        }

        var html = '';

        // Previous
        if (currentIndex > 0) {
            var prev = flatPages[currentIndex - 1];
            html += '<a class="docs-prev-next__link" href="#/' + prev.section + '/' + prev.page + '">' +
                '<span class="docs-prev-next__label">Previous</span>' +
                '<span class="docs-prev-next__title">' + prev.pageTitle + '</span>' +
                '</a>';
        } else {
            html += '<div></div>';
        }

        // Next
        if (currentIndex < flatPages.length - 1) {
            var next = flatPages[currentIndex + 1];
            html += '<a class="docs-prev-next__link docs-prev-next__link--next" href="#/' + next.section + '/' + next.page + '">' +
                '<span class="docs-prev-next__label">Next</span>' +
                '<span class="docs-prev-next__title">' + next.pageTitle + '</span>' +
                '</a>';
        } else {
            html += '<div></div>';
        }

        el.innerHTML = html;
    }

    window.DocsNav = {
        init: init,
        update: update
    };
})();
