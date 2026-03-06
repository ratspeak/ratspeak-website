/**
 * docs-sidebar.js — Render sidebar from nav.json, collapse/expand, mobile toggle
 */
(function() {
    'use strict';

    var sidebarNav = document.getElementById('sidebarNav');
    var sidebar = document.getElementById('docsSidebar');
    var overlay = document.getElementById('sidebarOverlay');
    var toggle = document.getElementById('sidebarToggle');
    var navData = null;

    function init(data) {
        navData = data;
        render(data);
        bindMobile();
    }

    function render(data) {
        var html = '';
        for (var i = 0; i < data.sections.length; i++) {
            var section = data.sections[i];
            html += '<div class="sidebar-section collapsed" data-section="' + section.slug + '">';
            html += '<div class="sidebar-section__header" data-section-toggle="' + section.slug + '">';
            html += section.title;
            html += '<svg class="sidebar-section__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>';
            html += '</div>';
            html += '<div class="sidebar-section__items">';
            for (var j = 0; j < section.pages.length; j++) {
                var page = section.pages[j];
                html += '<a class="sidebar-link" href="#/' + section.slug + '/' + page.slug + '" data-page="' + section.slug + '/' + page.slug + '">';
                html += page.title;
                html += '</a>';
            }
            html += '</div></div>';
        }
        sidebarNav.innerHTML = html;

        // Bind section toggles
        var headers = sidebarNav.querySelectorAll('.sidebar-section__header');
        for (var k = 0; k < headers.length; k++) {
            headers[k].addEventListener('click', function() {
                var sect = this.parentElement;
                sect.classList.toggle('collapsed');
                var items = sect.querySelector('.sidebar-section__items');
                if (!sect.classList.contains('collapsed')) {
                    items.style.maxHeight = items.scrollHeight + 'px';
                } else {
                    items.style.maxHeight = '0';
                }
            });
        }

        // Bind page links for mobile close
        var links = sidebarNav.querySelectorAll('.sidebar-link');
        for (var l = 0; l < links.length; l++) {
            links[l].addEventListener('click', function() {
                closeMobile();
            });
        }
    }

    function setActive(sectionSlug, pageSlug) {
        // Remove all active
        var links = sidebarNav.querySelectorAll('.sidebar-link');
        for (var i = 0; i < links.length; i++) {
            links[i].classList.remove('active');
        }

        // Set active link
        var activeLink = sidebarNav.querySelector('[data-page="' + sectionSlug + '/' + pageSlug + '"]');
        if (activeLink) activeLink.classList.add('active');

        // Expand current section, collapse others
        var sections = sidebarNav.querySelectorAll('.sidebar-section');
        for (var j = 0; j < sections.length; j++) {
            var sect = sections[j];
            var items = sect.querySelector('.sidebar-section__items');
            if (sect.dataset.section === sectionSlug) {
                sect.classList.remove('collapsed');
                items.style.maxHeight = items.scrollHeight + 'px';
            } else {
                sect.classList.add('collapsed');
                items.style.maxHeight = '0';
            }
        }
    }

    function bindMobile() {
        if (toggle) {
            toggle.addEventListener('click', function() {
                sidebar.classList.toggle('open');
                overlay.classList.toggle('active');
            });
        }
        if (overlay) {
            overlay.addEventListener('click', closeMobile);
        }
    }

    function closeMobile() {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    }

    function openMobile() {
        sidebar.classList.add('open');
        overlay.classList.add('active');
    }

    window.DocsSidebar = {
        init: init,
        setActive: setActive,
        openMobile: openMobile
    };
})();
