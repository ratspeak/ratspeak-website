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
            var itemsId = 'sidebar-section-items-' + section.slug;
            html += '<div class="sidebar-section collapsed" data-section="' + section.slug + '">';
            html += '<button class="sidebar-section__header" type="button" data-section-toggle="' + section.slug + '" aria-expanded="false" aria-controls="' + itemsId + '">';
            html += escapeHtml(section.title);
            html += '<svg class="sidebar-section__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>';
            html += '</button>';
            html += '<div class="sidebar-section__items" id="' + itemsId + '">';
            for (var j = 0; j < section.pages.length; j++) {
                var page = section.pages[j];
                html += '<a class="sidebar-link" href="#/' + section.slug + '/' + page.slug + '" data-page="' + section.slug + '/' + page.slug + '">';
                html += escapeHtml(page.title);
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
                setSectionOpen(sect, sect.classList.contains('collapsed'));
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
            if (sect.dataset.section === sectionSlug) {
                setSectionOpen(sect, true);
            } else {
                setSectionOpen(sect, false);
            }
        }
    }

    function bindMobile() {
        if (toggle) {
            toggle.addEventListener('click', function() {
                setMobileOpen(!sidebar.classList.contains('open'));
            });
        }
        if (overlay) {
            overlay.addEventListener('click', closeMobile);
        }
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && sidebar.classList.contains('open')) {
                closeMobile();
            }
        });
    }

    function setSectionOpen(sect, open) {
        var items = sect.querySelector('.sidebar-section__items');
        var header = sect.querySelector('.sidebar-section__header');
        sect.classList.toggle('collapsed', !open);
        if (items) items.style.maxHeight = open ? items.scrollHeight + 'px' : '0';
        if (header) header.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function setMobileOpen(open) {
        sidebar.classList.toggle('open', open);
        overlay.classList.toggle('active', open);
        if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function closeMobile() {
        setMobileOpen(false);
    }

    function openMobile() {
        setMobileOpen(true);
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    window.DocsSidebar = {
        init: init,
        setActive: setActive,
        openMobile: openMobile
    };
})();
