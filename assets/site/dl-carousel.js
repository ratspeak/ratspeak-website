// Download page device carousel: crossfades every few seconds, dots to pick, a pause button.
// Without JS (or on any error) the first slide shows alone.
(function () {
    'use strict';
    var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

    function reduced() { return !!(reduce && reduce.matches); }

    // Slides after the first ship with data-src so they never load without JS.
    function load(img) {
        if (img.dataset.srcset) { img.srcset = img.dataset.srcset; img.removeAttribute('data-srcset'); }
        if (img.dataset.src) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
        img.hidden = false;
    }

    function init(root) {
        var slides = Array.prototype.slice.call(root.querySelectorAll('.dl-carousel__slide'));
        var dots = Array.prototype.slice.call(root.querySelectorAll('.dl-carousel__dot'));
        var nav = root.querySelector('.dl-carousel__nav');
        var pause = root.querySelector('.dl-carousel__pause');
        var kase = root.closest('.dl-spotlight__case');
        if (slides.length < 2 || slides.length !== dots.length || !nav || !pause) return;

        var interval = Number(root.getAttribute('data-interval')) || 5000;
        var current = 0, timer = 0, startedAt = 0, remaining = interval;
        var playing = !reduced();
        var holds = { hover: false, focus: false, page: document.hidden, view: false, panel: !!(kase && kase.hidden) };

        function held() { return holds.hover || holds.focus || holds.page || holds.view || holds.panel; }

        function sync() {
            var run = playing && !held();
            if (run && !timer) {
                startedAt = Date.now();
                timer = setTimeout(advance, Math.max(0, remaining));
            } else if (!run && timer) {
                clearTimeout(timer); timer = 0;
                remaining -= Date.now() - startedAt;
            }
            var label = playing ? 'Pause slideshow' : 'Play slideshow';
            pause.setAttribute('aria-label', label);
            pause.title = label;
            // Both icons stay in the DOM: replacing nodes under the pointer stops WebKit firing pointerleave.
            pause.setAttribute('data-state', playing ? 'playing' : 'paused');
            if (!holds.panel) load(slides[(current + 1) % slides.length]);
        }

        function resetClock() {
            if (timer) { clearTimeout(timer); timer = 0; }
            remaining = interval;
        }

        function show(i) {
            i = (i + slides.length) % slides.length;
            load(slides[i]);
            slides.forEach(function (s, k) {
                var on = k === i;
                s.classList.toggle('is-active', on);
                if (on) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true');
            });
            dots.forEach(function (d, k) {
                if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
            });
            current = i;
        }

        function advance() {
            timer = 0;
            remaining = interval;
            show(current + 1);
            sync();
        }

        // Choosing a slide stops autoplay until Play.
        function choose(i) {
            playing = false;
            resetClock();
            show(i);
            sync();
        }

        dots.forEach(function (d, k) {
            d.addEventListener('click', function () { choose(k); });
            d.addEventListener('keydown', function (e) {
                var to = { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: dots.length - 1 }[e.key];
                if (to === undefined) return;
                e.preventDefault();
                to = (to + dots.length) % dots.length;
                choose(to);
                dots[to].focus();
            });
        });
        pause.addEventListener('click', function () {
            playing = !playing;
            resetClock();
            sync();
        });

        var down = null, area = root.querySelector('.dl-carousel__slides');
        area.addEventListener('pointerdown', function (e) { down = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY }; });
        area.addEventListener('pointerup', function (e) {
            if (!down) return;
            var dx = e.clientX - down.x, dy = e.clientY - down.y;
            down = null;
            if (Math.abs(dx) >= 48 && Math.abs(dx) > 1.5 * Math.abs(dy)) choose(current + (dx < 0 ? 1 : -1));
        });
        area.addEventListener('pointercancel', function () { down = null; });

        root.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { holds.hover = true; sync(); } });
        root.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { holds.hover = false; sync(); } });
        document.addEventListener('pointerover', function (e) {
            if (holds.hover && e.pointerType === 'mouse' && !root.contains(e.target)) { holds.hover = false; sync(); }
        });
        root.addEventListener('focusin', function () { holds.focus = true; sync(); });
        root.addEventListener('focusout', function (e) {
            if (!e.relatedTarget || !root.contains(e.relatedTarget)) { holds.focus = false; sync(); }
        });
        document.addEventListener('visibilitychange', function () { holds.page = document.hidden; sync(); });
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                var e = entries[entries.length - 1];
                holds.view = !e.isIntersecting || e.intersectionRatio < 0.5;
                sync();
            }, { threshold: [0, 0.5, 1] }).observe(root);
        }
        if (reduce) {
            var onReduce = function () { if (reduced()) { playing = false; resetClock(); } sync(); };
            if (reduce.addEventListener) reduce.addEventListener('change', onReduce);
            else if (reduce.addListener) reduce.addListener(onReduce);
        }
        // The platform picker hides inactive panels: back to slide 1, autoplay again when shown.
        if (kase && 'MutationObserver' in window) {
            new MutationObserver(function () {
                if (kase.hidden === holds.panel) return;
                holds.panel = kase.hidden;
                if (holds.panel) { resetClock(); show(0); playing = !reduced(); }
                sync();
            }).observe(kase, { attributes: true, attributeFilter: ['hidden'] });
        }

        slides.forEach(function (s, k) { if (k) s.setAttribute('aria-hidden', 'true'); });
        nav.hidden = false;
        sync();
    }

    function start() {
        Array.prototype.forEach.call(document.querySelectorAll('.dl-carousel'), function (root) {
            try { init(root); } catch (e) { /* leave the first slide */ }
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
