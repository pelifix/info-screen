// celebration.js — reusable confetti engine (window.Celebration). Not tied to any data source.
// Usage: Celebration.confetti({ duration: 90000, colors: [...], rate: 40 })  → confetti rain + corner bursts
//        Celebration.burst({ x: 0.5, y: 0.6, count: 150 })                  → one-shot pop (x/y = viewport fractions)
//        Celebration.stop()
(function() {
    'use strict';

    var canvas = null, ctx = null, raf = null, lastT = 0, W = 0, H = 0;
    var particles = [];
    var emitters = [];
    var MAX_PARTICLES = 450;
    var GRAVITY = 380;
    var DEFAULT_COLORS = ['#e8a83e', '#f0ece4', '#4ade80', '#60a5fa', '#f472b6'];

    function ensureCanvas() {
        if (canvas) return;
        canvas = document.createElement('canvas');
        canvas.className = 'celebration-canvas';
        document.body.appendChild(canvas);
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
    }
    function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
    function rand(a, b) { return a + Math.random() * (b - a); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function spawn(x, y, vx, vy, colors) {
        if (particles.length >= MAX_PARTICLES) return;
        var r = Math.random();
        particles.push({
            x: x, y: y, vx: vx, vy: vy,
            w: rand(6, 11), h: rand(10, 18),
            rot: rand(0, Math.PI * 2), vr: rand(-6, 6),
            wob: rand(0, Math.PI * 2), wobSpeed: rand(2, 5), wobAmp: rand(0.6, 1.6),
            tilt: rand(0, Math.PI * 2), tiltSpeed: rand(3, 7),
            drag: rand(0.955, 0.975),
            color: pick(colors),
            shape: r < 0.15 ? 'circle' : r < 0.4 ? 'ribbon' : 'rect',
        });
    }

    function step(t) {
        var dt = Math.min((t - lastT) / 1000, 0.05);
        lastT = t;
        var now = Date.now();
        for (var e = emitters.length - 1; e >= 0; e--) {
            var em = emitters[e];
            if (now > em.until) { emitters.splice(e, 1); continue; }
            var frac = 1 - (em.until - now) / em.duration;          // 0 → 1 over the emitter's life
            var rate = em.rate * (em.decay ? Math.max(0.25, 1 - frac) : 1);
            em.acc += rate * dt;
            while (em.acc >= 1) {
                em.acc -= 1;
                spawn(rand(-20, W + 20), -20, rand(-40, 40), rand(40, 120), em.colors);
            }
        }
        ctx.clearRect(0, 0, W, H);
        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];
            var dragF = Math.pow(p.drag, dt * 60);
            p.vy += GRAVITY * dt;
            p.vx *= dragF; p.vy *= dragF;
            p.wob += p.wobSpeed * dt;
            p.x += (p.vx + Math.sin(p.wob) * 40 * p.wobAmp) * dt;
            p.y += p.vy * dt;
            p.rot += p.vr * dt;
            p.tilt += p.tiltSpeed * dt;
            if (p.y > H + 30 || p.x < -60 || p.x > W + 60) { particles.splice(i, 1); continue; }
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.scale(Math.cos(p.tilt), 1);                          // fake 3D flutter
            ctx.fillStyle = p.color;
            ctx.globalAlpha = 0.95;
            if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
            else if (p.shape === 'ribbon') { ctx.fillRect(-p.w / 4, -p.h, p.w / 2, p.h * 2); }
            else { ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
            ctx.restore();
        }
        if (particles.length || emitters.length) raf = requestAnimationFrame(step);
        else { raf = null; ctx.clearRect(0, 0, W, H); }
    }
    function start() {
        if (raf) return;
        lastT = performance.now();
        raf = requestAnimationFrame(step);
    }

    var Celebration = {
        confetti: function(opts) {
            opts = opts || {};
            ensureCanvas();
            var duration = opts.duration || 15000;
            emitters.push({ until: Date.now() + duration, duration: duration, rate: opts.rate || 45,
                            colors: opts.colors || DEFAULT_COLORS, acc: 0, decay: opts.decay !== false });
            if (opts.burst !== false) {
                Celebration.burst({ x: 0.12, y: 1.05, count: 130, angle: -Math.PI / 2 + 0.35, spread: 0.9, colors: opts.colors });
                Celebration.burst({ x: 0.88, y: 1.05, count: 130, angle: -Math.PI / 2 - 0.35, spread: 0.9, colors: opts.colors });
            }
            start();
        },
        burst: function(opts) {
            opts = opts || {};
            ensureCanvas();
            var colors = opts.colors || DEFAULT_COLORS;
            var x = (opts.x == null ? 0.5 : opts.x) * W;
            var y = (opts.y == null ? 0.6 : opts.y) * H;
            var count = opts.count || 100;
            var ang0 = opts.angle == null ? -Math.PI / 2 : opts.angle;
            var spread = opts.spread == null ? Math.PI / 3 : opts.spread;
            for (var i = 0; i < count; i++) {
                var a = ang0 + rand(-spread / 2, spread / 2), sp = rand(450, 950);
                spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, colors);
            }
            start();
        },
        stop: function() { emitters = []; particles = []; },
        active: function() { return !!(emitters.length || particles.length); },
    };
    window.Celebration = Celebration;
})();
