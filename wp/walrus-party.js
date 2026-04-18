/* =========================================================
   Walrus Party Easter Egg — Behavior
   Self-contained IIFE. No dependencies. No globals leaked.
   Attaches one keydown listener to document.
   ========================================================= */
(function () {
  'use strict';

  // --- Configuration ---------------------------------------
  const KONAMI = [
    'ArrowUp',    'ArrowUp',
    'ArrowDown',  'ArrowDown',
    'ArrowLeft',  'ArrowRight',
    'ArrowLeft',  'ArrowRight',
    'KeyB',       'KeyA'
  ];
  const DURATION_MS            = 10000;   // total party length
  const FADE_MS                = 500;     // fade in / fade out
  const WALRUS_COUNT           = 10;      // dancing walruses
  const CONFETTI_COUNT         = 120;     // confetti particles
  const RESPECT_REDUCED_MOTION = true;    // if true, skip disco+confetti for users with OS-level reduced-motion preference

  // --- Assets ----------------------------------------------
  const WALRUS_SVG = `
    <svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="60" cy="65" rx="45" ry="32" fill="#8b8ba3"/>
      <ellipse cx="60" cy="72" rx="32" ry="20" fill="#b8b8cc"/>
      <ellipse cx="22" cy="78" rx="12" ry="6"  fill="#6a6a82" transform="rotate(-30 22 78)"/>
      <ellipse cx="98" cy="78" rx="12" ry="6"  fill="#6a6a82" transform="rotate(30 98 78)"/>
      <ellipse cx="60" cy="45" rx="30" ry="26" fill="#9696ad"/>
      <ellipse cx="60" cy="58" rx="18" ry="12" fill="#d4d4e0"/>
      <path d="M46 40 Q50 35 54 40" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M66 40 Q70 35 74 40" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <circle cx="37" cy="50" r="3.5" fill="#ffb3c6" opacity="0.75"/>
      <circle cx="83" cy="50" r="3.5" fill="#ffb3c6" opacity="0.75"/>
      <line x1="45" y1="58" x2="34" y2="56" stroke="#555" stroke-width="0.8" stroke-linecap="round"/>
      <line x1="45" y1="60" x2="32" y2="60" stroke="#555" stroke-width="0.8" stroke-linecap="round"/>
      <line x1="45" y1="62" x2="34" y2="64" stroke="#555" stroke-width="0.8" stroke-linecap="round"/>
      <line x1="75" y1="58" x2="86" y2="56" stroke="#555" stroke-width="0.8" stroke-linecap="round"/>
      <line x1="75" y1="60" x2="88" y2="60" stroke="#555" stroke-width="0.8" stroke-linecap="round"/>
      <line x1="75" y1="62" x2="86" y2="64" stroke="#555" stroke-width="0.8" stroke-linecap="round"/>
      <ellipse cx="60" cy="54" rx="3" ry="2" fill="#2a2a2a"/>
      <path d="M54 62 L51 76 L56 74 Z" fill="#fffae6" stroke="#d4cfa6" stroke-width="0.5"/>
      <path d="M66 62 L69 76 L64 74 Z" fill="#fffae6" stroke="#d4cfa6" stroke-width="0.5"/>
    </svg>`;

  const DANCES = ['wp-dance-bounce', 'wp-dance-wiggle', 'wp-dance-spin'];
  const CONFETTI_COLORS = ['#ff3b5c','#ffcb3b','#3bff7a','#3bcfff','#c93bff','#ff8f3b','#ffffff'];

  // --- State -----------------------------------------------
  const buffer = [];
  let partyActive = false;

  // --- Konami detection ------------------------------------
  document.addEventListener('keydown', function (e) {
    buffer.push(e.code);
    if (buffer.length > KONAMI.length) buffer.shift();
    if (buffer.length !== KONAMI.length) return;
    for (let i = 0; i < KONAMI.length; i++) {
      if (buffer[i] !== KONAMI[i]) return;
    }
    if (!partyActive) startParty();
  });

  // --- Party -----------------------------------------------
  function startParty() {
    partyActive = true;

    const reduced = RESPECT_REDUCED_MOTION &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const disco        = reduced ? null : spawnDisco();
    const walruses     = spawnWalruses();
    const stopConfetti = reduced ? function () {} : startConfetti();

    // Fade-in
    requestAnimationFrame(function () {
      if (disco) disco.style.opacity = '';
      walruses.forEach(function (w) { w.style.opacity = '1'; });
    });

    // End sequence
    setTimeout(function () {
      if (disco) disco.style.opacity = '0';
      walruses.forEach(function (w) { w.style.opacity = '0'; });
      setTimeout(function () {
        stopConfetti();
        if (disco) disco.remove();
        walruses.forEach(function (w) { w.remove(); });
        partyActive = false;
      }, FADE_MS);
    }, DURATION_MS);
  }

  function spawnDisco() {
    const el = document.createElement('div');
    el.className = 'walrus-party-disco';
    el.style.transition = 'opacity ' + FADE_MS + 'ms ease-out';
    el.style.opacity = '0';
    document.body.appendChild(el);
    return el;
  }

  function spawnWalruses() {
    const out = [];
    for (let i = 0; i < WALRUS_COUNT; i++) {
      const w = document.createElement('div');
      const dance = DANCES[Math.floor(Math.random() * DANCES.length)];
      w.className = 'walrus-party-walrus ' + dance;
      w.innerHTML = WALRUS_SVG;
      w.style.left = (Math.random() * 85 + 5).toFixed(2) + 'vw';
      w.style.top  = (Math.random() * 75 + 10).toFixed(2) + 'vh';
      w.style.animationDuration = (0.5 + Math.random() * 0.4).toFixed(2) + 's';
      w.style.animationDelay    = (-Math.random() * 0.6).toFixed(2) + 's';
      w.style.opacity = '0';
      w.style.transition = 'opacity 300ms ease-out';
      document.body.appendChild(w);
      out.push(w);
    }
    return out;
  }

  function startConfetti() {
    const canvas = document.createElement('canvas');
    canvas.className = 'walrus-party-confetti';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width  = window.innerWidth  + 'px';
      canvas.style.height = window.innerHeight + 'px';
    }
    resize();
    window.addEventListener('resize', resize);
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const particles = new Array(CONFETTI_COUNT);
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      particles[i] = newParticle(canvas, true);
    }

    function newParticle(c, scatter) {
      return {
        x:    Math.random() * c.width,
        y:    scatter ? Math.random() * c.height : -20 * dpr,
        vx:  (Math.random() - 0.5) * 2 * dpr,
        vy:  (Math.random() * 3 + 2) * dpr,
        size: (Math.random() * 5 + 4) * dpr,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rot:  Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.25
      };
    }

    let running = true;
    let rafId;
    function tick() {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vRot;
        if (p.y > canvas.height + 20 || p.x < -20 || p.x > canvas.width + 20) {
          particles[i] = newParticle(canvas, false);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      rafId = requestAnimationFrame(tick);
    }
    tick();

    return function stop() {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      canvas.style.transition = 'opacity ' + FADE_MS + 'ms ease-out';
      canvas.style.opacity = '0';
      setTimeout(function () { canvas.remove(); }, FADE_MS);
    };
  }
})();
