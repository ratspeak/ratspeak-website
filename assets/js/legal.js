(function() {
    var root = document.documentElement;
    var stored = null;
    try { stored = localStorage.getItem('ratspeak-theme'); } catch (_) {}
    var theme = stored === 'light' || stored === 'dark'
        ? stored
        : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

    function apply(next) {
        theme = next;
        root.setAttribute('data-theme', theme);
        var button = document.getElementById('theme-toggle');
        if (button) button.setAttribute('aria-label', theme === 'dark' ? 'Use light theme' : 'Use dark theme');
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = theme === 'dark' ? '#18171a' : '#faf7f3';
    }

    apply(theme);
    document.addEventListener('DOMContentLoaded', function() {
        apply(theme);
        var button = document.getElementById('theme-toggle');
        if (button) button.addEventListener('click', function() {
            var next = theme === 'dark' ? 'light' : 'dark';
            try { localStorage.setItem('ratspeak-theme', next); } catch (_) {}
            apply(next);
        });
        var year = document.getElementById('legal-year');
        if (year) year.textContent = String(new Date().getFullYear());
    });
})();
