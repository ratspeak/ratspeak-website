(function() {
    "use strict";

    var root = document.documentElement;
    var themeToggle = document.getElementById("themeToggle");
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    var navbar = document.getElementById("navbar");
    var navHamburger = document.getElementById("navHamburger");
    var navMobileMenu = document.getElementById("navMobileMenu");

    function readTheme() {
        try {
            return localStorage.getItem("ratspeak-theme") === "light" ? "light" : "dark";
        } catch (_) {
            return "dark";
        }
    }

    function syncThemeColor() {
        if (!themeMeta) return;
        var color = getComputedStyle(root).getPropertyValue("--bg-primary").trim();
        if (color) themeMeta.setAttribute("content", color);
    }

    function applyTheme(theme) {
        root.setAttribute("data-theme", theme);
        if (themeToggle) {
            themeToggle.setAttribute("aria-label", theme === "dark" ? "Use light theme" : "Use dark theme");
        }
        syncThemeColor();
    }

    function closeMenu() {
        if (!navMobileMenu || !navHamburger) return;
        navMobileMenu.classList.remove("open");
        navHamburger.setAttribute("aria-expanded", "false");
    }

    function syncNavbar() {
        if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 8);
    }

    applyTheme(readTheme());
    syncNavbar();

    if (themeToggle) {
        themeToggle.addEventListener("click", function() {
            var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
            try {
                localStorage.setItem("ratspeak-theme", next);
            } catch (_) {}
            applyTheme(next);
        });
    }

    if (navHamburger && navMobileMenu) {
        navHamburger.addEventListener("click", function(event) {
            event.stopPropagation();
            var isOpen = navMobileMenu.classList.toggle("open");
            navHamburger.setAttribute("aria-expanded", String(isOpen));
        });

        navMobileMenu.addEventListener("click", function(event) {
            if (event.target.closest("a")) closeMenu();
        });

        document.addEventListener("click", function(event) {
            if (!navMobileMenu.contains(event.target) && !navHamburger.contains(event.target)) closeMenu();
        });

        document.addEventListener("keydown", function(event) {
            if (event.key === "Escape") {
                closeMenu();
                navHamburger.focus();
            }
        });
    }

    window.addEventListener("scroll", syncNavbar, { passive: true });
    window.addEventListener("resize", function() {
        if (window.innerWidth > 768) closeMenu();
        syncThemeColor();
    });

    var year = document.getElementById("legal-year");
    if (year) year.textContent = String(new Date().getFullYear());
})();
