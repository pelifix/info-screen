// celebration.js — reusable canvas celebration engine (window.Celebration). Not tied to any data source.
//   Celebration.confetti({ duration, colors, rate, power, floor, burstCount })  confetti rain: dense at first, thinning out
//   Celebration.burst({ x, y, count, colors, angle, spread })                    one-shot pop (x/y = viewport fractions)
//   Celebration.rocket({ x, y, from, duration, colors, onExplode })              firework rocket looping across the screen,
//                                                                                exploding at x/y, then calling onExplode()
//   Celebration.stop()
(function() {
    'use strict';

    var canvas = null, ctx = null, raf = null, lastT = 0, W = 0, H = 0;
    var particles = [], emitters = [], rockets = [], sparks = [], rings = [];
    var MAX_PARTICLES = 650;
    var GRAVITY = 380;
    var DEFAULT_COLORS = ['#e8a83e', '#f0ece4', '#4ade80', '#60a5fa', '#f472b6'];
    var SPARK_COLORS = ['#ffffff', '#ffd166', '#ffb347', '#fff3c4'];

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
    function lerp(a, b, t) { return a + (b - a) * t; }

    /* ── confetti pieces ── */
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
    function drawParticle(p) {
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

    /* ── rocket: converging loops from `from` to the target, sparks trailing, explosion at the end ── */
    function rocketPos(rk, u) {
        var amp = Math.pow(1 - u, 0.85);                          // loops shrink towards the target
        var ang = rk.phase + u * rk.loops * Math.PI * 2;
        return {
            x: lerp(rk.from.x, rk.to.x, u) + Math.cos(ang) * rk.ax * amp,
            y: lerp(rk.from.y, rk.to.y, u) + Math.sin(ang) * rk.ay * amp,
        };
    }
    function spawnSpark(x, y, vx, vy, colors) {
        sparks.push({ x: x, y: y, vx: vx, vy: vy, life: rand(0.35, 0.9), age: 0, r: rand(1.5, 3.2), color: pick(colors) });
    }
    function drawRocket(rk) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowBlur = 30; ctx.shadowColor = rk.glow;
        ctx.fillStyle = rk.glow; ctx.globalAlpha = 0.45;
        ctx.beginPath(); ctx.arc(rk.x, rk.y, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(rk.x, rk.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
    function explode(rk) {
        var fx = rk.to.x / W, fy = rk.to.y / H;
        Celebration.burst({ x: fx, y: fy, count: 240, colors: rk.colors, spread: Math.PI * 2 });
        for (var i = 0; i < 120; i++) {
            var a = rand(0, Math.PI * 2), sp = rand(150, 650);
            spawnSpark(rk.to.x, rk.to.y, Math.cos(a) * sp, Math.sin(a) * sp, SPARK_COLORS);
        }
        rings.push({ x: rk.to.x, y: rk.to.y, age: 0, life: 0.7, color: rk.glow });
        if (rk.onExplode) { try { rk.onExplode(); } catch (e) { /* ignore */ } }
    }

    function step(t) {
        var dt = Math.min((t - lastT) / 1000, 0.05);
        lastT = t;
        var now = Date.now();

        // emitters: many pieces at first, few at the end (rate × (1-frac)^power, never below `floor`)
        for (var e = emitters.length - 1; e >= 0; e--) {
            var em = emitters[e];
            if (now > em.until) { emitters.splice(e, 1); continue; }
            var frac = 1 - (em.until - now) / em.duration;
            var k = em.decay ? Math.max(em.floor, Math.pow(1 - frac, em.power)) : 1;
            em.acc += em.rate * k * dt;
            while (em.acc >= 1) {
                em.acc -= 1;
                spawn(rand(-20, W + 20), -20, rand(-40, 40), rand(40, 120), em.colors);
            }
        }

        // rockets
        for (var ri = rockets.length - 1; ri >= 0; ri--) {
            var rk = rockets[ri];
            var u = Math.min(1, (now - rk.t0) / rk.duration);
            var pos = rocketPos(rk, u);
            var dx = pos.x - rk.x, dy = pos.y - rk.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
            for (var si = 0; si < 5; si++) {
                spawnSpark(pos.x - dx * Math.random(), pos.y - dy * Math.random(),
                    -dx / len * rand(40, 140) + rand(-50, 50), -dy / len * rand(40, 140) + rand(-50, 50), SPARK_COLORS);
            }
            rk.x = pos.x; rk.y = pos.y;
            if (u >= 1) { rockets.splice(ri, 1); explode(rk); }
        }

        ctx.clearRect(0, 0, W, H);

        // confetti
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
            drawParticle(p);
        }

        // sparks (rocket trail + explosion embers)
        if (sparks.length) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (var s = sparks.length - 1; s >= 0; s--) {
                var sp = sparks[s];
                sp.age += dt;
                if (sp.age >= sp.life) { sparks.splice(s, 1); continue; }
                sp.vy += 120 * dt;
                sp.x += sp.vx * dt; sp.y += sp.vy * dt;
                var a = 1 - sp.age / sp.life;
                ctx.globalAlpha = a;
                ctx.fillStyle = sp.color;
                ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r * (0.4 + 0.6 * a), 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }
        for (var g = rings.length - 1; g >= 0; g--) {
            var rg = rings[g];
            rg.age += dt;
            if (rg.age >= rg.life) { rings.splice(g, 1); continue; }
            var f = rg.age / rg.life;
            ctx.save();
            ctx.globalAlpha = (1 - f) * 0.9;
            ctx.strokeStyle = rg.color; ctx.lineWidth = 6 * (1 - f) + 1;
            ctx.beginPath(); ctx.arc(rg.x, rg.y, 20 + f * 260, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        }
        for (var rj = 0; rj < rockets.length; rj++) drawRocket(rockets[rj]);

        if (particles.length || emitters.length || rockets.length || sparks.length || rings.length) raf = requestAnimationFrame(step);
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
                            colors: opts.colors || DEFAULT_COLORS, acc: 0,
                            decay: opts.decay !== false, power: opts.power == null ? 2.2 : opts.power, floor: opts.floor == null ? 0.03 : opts.floor });
            if (opts.burst !== false) {
                var n = opts.burstCount || 130;
                Celebration.burst({ x: 0.12, y: 1.05, count: n, angle: -Math.PI / 2 + 0.35, spread: 0.9, colors: opts.colors });
                Celebration.burst({ x: 0.88, y: 1.05, count: n, angle: -Math.PI / 2 - 0.35, spread: 0.9, colors: opts.colors });
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
        rocket: function(opts) {
            opts = opts || {};
            ensureCanvas();
            var from = opts.from || { x: 0.5, y: 1.04 };
            var rk = {
                from: { x: from.x * W, y: from.y * H },
                to: { x: (opts.x == null ? 0.5 : opts.x) * W, y: (opts.y == null ? 0.4 : opts.y) * H },
                t0: Date.now(), duration: opts.duration || 5000,
                loops: opts.loops || 2.5, phase: Math.PI / 2,
                ax: (opts.amplitudeX || 0.38) * W, ay: (opts.amplitudeY || 0.34) * H,
                colors: opts.colors || DEFAULT_COLORS, glow: opts.glow || '#ffd166',
                onExplode: opts.onExplode || null,
            };
            rk.x = rk.from.x; rk.y = rk.from.y;
            rockets.push(rk);
            start();
        },
        stop: function() { emitters = []; particles = []; rockets = []; sparks = []; rings = []; },
        active: function() { return !!(emitters.length || particles.length || rockets.length || sparks.length); },
    };
    window.Celebration = Celebration;
})();
