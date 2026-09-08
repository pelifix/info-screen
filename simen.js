// simen.js — "SIMEN LIVE": live tracker for Simen Holvik at the EMU 6-Day Race (temporary, Sept 2026).
// Adds: a banner between hero and feed, the live stream in the sidebar image slot (expands over the hero
// on celebrations), confetti on every new lap, gold celebrations on milestones, a ticker block.
// Depends on window.InfoScreen (app.js) and window.Celebration (celebration.js).
// Dev: ?simenDemo=1 fakes a lap every 25s. Keys: L = lap, M = milestone, F = finish, V = toggle video size.
(function() {
    'use strict';
    var IS = window.InfoScreen;
    if (!IS) { console.log('[Simen] InfoScreen API missing'); return; }

    var CFG = {
        bib: '1',
        resultsUrl: 'https://korido.hu/export/tblResultSource_3600.txt',
        lapsUrl: 'https://korido.hu/events/resultTableLaps.php?rc=3600&bib=1',
        videoId: 'Vbp4_QZ8HYw',
        raceStart: '2026-09-03T12:00:00+02:00',
        raceHours: 144,
        hideAfter: '2026-09-12T12:00:00+02:00',     // everything disappears on its own after this
        eventName: 'EMU 6-dagers · Balatonfüred',
        videoCaption: 'Balatonfüred — EMU 6-Day Race, direkte',
        resultsRefresh: 30 * 1000,                  // keep in sync with SOURCES.simen.refresh in app.js
        lapsRefresh: 5 * 60 * 1000,
        lapKm: 0.8982,
        breakHintFactor: 2,                         // current lap > factor × last lap (and > breakHintMinSec) → 'mulig pause'
        breakHintMinSec: 15 * 60,
        milestones: [800, 900, 1000],
        worldRecordKm: 1036.851,                    // men's 6-day world record (Yiannis Kouros, 2005) — confirm
        lapConfettiMs: 120 * 1000,
        lapTakeoverMs: 40 * 1000,
        milestoneConfettiMs: 240 * 1000,
        milestoneTakeoverMs: 60 * 1000,
        finishConfettiMs: 5 * 60 * 1000,
        rocketMs: 5000,                             // firework rocket flight time before it explodes into the text panel
        finishTakeoverMs: 2 * 60 * 1000,
        colors: ['#ef2b2d', '#f4f4f4', '#3b6fd4', '#e8a83e'],
        goldColors: ['#ffd166', '#fff3c4', '#e8a83e', '#ffffff', '#ef2b2d'],
    };
    var demo = /[?&]simenDemo=1/.test(location.search);

    var raceStart = new Date(CFG.raceStart).getTime();
    var raceEnd = raceStart + CFG.raceHours * 3600e3;
    if (Date.now() > new Date(CFG.hideAfter).getTime()) return;

    var LABEL = IS.SOURCES.simen ? IS.SOURCES.simen.label : 'Simen';
    var esc = IS.escapeHtml;
    var FLAG_NOR = '<svg viewBox="0 0 22 16" aria-label="Norge"><rect width="22" height="16" fill="#ef2b2d"/>' +
        '<rect x="6" width="4" height="16" fill="#fff"/><rect y="6" width="22" height="4" fill="#fff"/>' +
        '<rect x="7" width="2" height="16" fill="#002868"/><rect y="7" width="22" height="2" fill="#002868"/></svg>';

    /* ── state ── */
    var st = {
        hasData: false, pos: null, km: null, laps: null, lastLap: '', lastLapAt: null, mark: '', total: 0,
        name: 'Simen Holvik', behind: null, ahead: null,
        perDay: null, km24: null, finished: Date.now() >= raceEnd,
    };
    var prevLaps = null, prevKm = null;
    var storedKm = parseFloat(localStorage.getItem('simen:lastKm') || '') || null;

    /* ── formatting ── */
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function fmtKm(km, dec) {
        if (km == null || isNaN(km)) return '–';
        var parts = km.toFixed(dec == null ? 1 : dec).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return parts.join(',');
    }
    function fmtDuration(ms) {
        var s = Math.max(0, Math.floor(ms / 1000));
        return Math.floor(s / 3600) + ':' + pad2(Math.floor((s % 3600) / 60)) + ':' + pad2(s % 60);
    }
    function fmtLap(ms) {
        var s = Math.max(0, Math.floor(ms / 1000));
        return s >= 3600 ? fmtDuration(ms) : Math.floor(s / 60) + ':' + pad2(s % 60);
    }
    function surname(name) { return String(name || '').trim().split(/\s+/).pop(); }
    function iso3(countryField) { return (countryField || '').split('_')[0].toUpperCase(); }
    function parseHms(s) {
        var p = String(s || '').trim().split(':').map(Number);
        if (!p.length || p.some(isNaN)) return 0;
        return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0];
    }

    /* ── parsing ── */
    function rowInfo(r) { return { pos: +r[0], bib: String(r[4]), name: r[5], country: r[6], laps: +r[10], km: parseFloat(r[11]) }; }
    function parseResults(json) {
        var rows = (json && json.data) || [];
        if (!rows.length) throw new Error('empty results');
        rows.sort(function(a, b) { return a[0] - b[0]; });
        var me = null;
        rows.forEach(function(r) { if (String(r[4]) === CFG.bib) me = r; });
        if (!me) throw new Error('bib ' + CFG.bib + ' not found');
        st.total = rows.length;
        st.pos = +me[0]; st.name = me[5];
        st.laps = +me[10]; st.km = parseFloat(me[11]); st.lastLap = me[16] || ''; st.mark = me[24] || '';
        var lapAt = parseHms(me[12]);                      // col 12 = race clock when the last lap was recorded
        st.lastLapAt = lapAt > 0 ? raceStart + lapAt * 1000 : null;
        st.behind = null; st.ahead = null;
        rows.forEach(function(r) {
            var p = +r[0];
            if (p === st.pos + 1) st.behind = rowInfo(r);
            if (p === st.pos - 1) st.ahead = rowInfo(r);
        });
        st.hasData = true;
    }
    function parseReadTime(s) {
        var m = /^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})$/.exec(s.trim());
        if (!m) return null;
        return new Date(m[1] + '-' + m[2] + '-' + m[3] + 'T' + pad2(+m[4]) + ':' + m[5] + ':' + m[6] + '+02:00').getTime();
    }
    function parseLaps(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var rows = [];
        doc.querySelectorAll('tr').forEach(function(tr) {
            var td = tr.querySelectorAll('td');
            if (td.length < 6) return;
            var lap = parseInt(td[0].textContent, 10);
            if (!lap) return;
            var t = parseReadTime(td[5].textContent);
            if (!t) return;
            var lenM = parseFloat(td[3].textContent);
            rows.push({ lap: lap, lapSec: parseHms(td[2].textContent), lenKm: (lenM > 0 ? lenM : CFG.lapKm * 1000) / 1000, time: t });
        });
        rows.sort(function(a, b) { return a.lap - b.lap; });
        return rows;
    }
    function computeLapStats(rows) {
        var perDay = [0, 0, 0, 0, 0, 0];
        var cutoff = Date.now() - 86400e3, km24 = 0;
        rows.forEach(function(r) {
            var d = Math.floor((r.time - raceStart) / 86400e3);
            if (d >= 0 && d < 6) perDay[d] += r.lenKm;
            if (r.time > cutoff) km24 += r.lenKm;
        });
        st.perDay = perDay;
        st.km24 = km24;
    }
    function projection() {
        if (st.km == null) return null;
        var now = Date.now();
        if (now >= raceEnd) return st.km;
        var elapsedH = (now - raceStart) / 3600e3, remainH = (raceEnd - now) / 3600e3;
        var rate = (st.km24 != null && elapsedH >= 24) ? st.km24 / 24 : (elapsedH > 0 ? st.km / elapsedH : 0);
        return st.km + rate * remainH;
    }

    /* ── banner ── */
    var hero = document.querySelector('.hero-story');
    var banner = document.createElement('div');
    banner.className = 'simen-banner';
    banner.id = 'simen-banner';
    banner.innerHTML =
        '<div class="simen-cell simen-id">' +
            '<div class="simen-flag">' + FLAG_NOR + '<span class="simen-live">LIVE</span></div>' +
            '<div><div class="simen-name"><span id="simen-name">Simen Holvik</span></div>' +
            '<div class="simen-event"><div>· ' + esc(CFG.eventName) + '</div><div id="simen-event-runners"></div></div></div>' +
            '<div class="simen-pos" id="simen-pos">–</div>' +
        '</div>' +
        '<div class="simen-cell simen-km"><div class="simen-label">Distanse</div>' +
            '<div><span class="simen-value" id="simen-km">–<small>km</small></span></div>' +
            '<div class="simen-sub" id="simen-laps">–</div></div>' +
        '<div class="simen-cell simen-lap"><div class="simen-label" id="simen-lap-label">Denne runden</div>' +
            '<div class="simen-value" id="simen-lap">–</div><div class="simen-sub" id="simen-lap-sub">–</div></div>' +
        '<div class="simen-cell simen-gap"><div class="simen-label" id="simen-gap-label">Ledelse</div>' +
            '<div class="simen-value" id="simen-gap">–</div><div class="simen-sub" id="simen-gap-sub">–</div></div>' +
        '<div class="simen-cell simen-clock grow"><div class="simen-label" id="simen-day">Dag – av 6</div>' +
            '<div class="simen-value" id="simen-left">–</div><div class="simen-bar"><div id="simen-bar"></div></div></div>' +
        '<div class="simen-cell simen-daysc"><div class="simen-label">Km per løpsdag (12–12)</div><div class="simen-days" id="simen-days"></div><div class="simen-sub" id="simen-days-sub"></div></div>' +
        '<div class="simen-cell simen-proj"><div class="simen-label">Prognose</div>' +
            '<div class="simen-value" id="simen-proj">–</div><div class="simen-sub" id="simen-proj-sub">–</div></div>';
    hero.parentNode.insertBefore(banner, hero.nextSibling);
    var $ = function(id) { return document.getElementById(id); };

    var shownKm = null, kmAnim = null;
    function animateKm(target) {
        var el = $('simen-km');
        el.classList.toggle('wide', target >= 1000);
        if (shownKm == null || Math.abs(target - shownKm) > 50) {
            shownKm = target;
            el.innerHTML = fmtKm(target) + '<small>km</small>';
            return;
        }
        if (Math.abs(target - shownKm) < 0.0005) return;
        var from = shownKm, t0 = performance.now(), dur = 1500;
        el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
        if (kmAnim) cancelAnimationFrame(kmAnim);
        (function frame(t) {
            var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
            shownKm = from + (target - from) * e;
            el.innerHTML = fmtKm(shownKm) + '<small>km</small>';
            if (p < 1) kmAnim = requestAnimationFrame(frame); else { shownKm = target; kmAnim = null; }
        })(t0);
    }

    function renderClock() {
        var now = Date.now();
        var elapsed = Math.min(Math.max(now - raceStart, 0), CFG.raceHours * 3600e3);
        var day = Math.min(6, Math.floor(elapsed / 86400e3) + 1);
        $('simen-bar').style.width = (elapsed / (CFG.raceHours * 3600e3) * 100).toFixed(2) + '%';
        if (now >= raceEnd) {
            $('simen-day').textContent = 'Mål · ' + CFG.raceHours + ' timer fullført';
            $('simen-left').textContent = 'FERDIG';
        } else if (now < raceStart) {
            $('simen-day').textContent = 'Starter om';
            $('simen-left').textContent = fmtDuration(raceStart - now);
        } else {
            $('simen-day').textContent = 'Dag ' + day + '/6 · tid igjen';
            $('simen-left').textContent = fmtDuration(raceEnd - now);
        }
        renderLapTimer(now);
        positionVideo();   // keeps the fixed video box glued to its slot if the layout shifts
    }
    // Time since the last lap was recorded, ticking up. Resets when the next results poll (60 s) shows a new lap,
    // so it can overshoot by up to a minute. Korido marks breaks with mark === 'rest'.
    function renderLapTimer(now) {
        var el = $('simen-lap'), label = $('simen-lap-label');
        if (!st.hasData || st.lastLapAt == null || now < raceStart || now >= raceEnd) {
            label.textContent = 'Denne runden'; el.textContent = '–'; el.className = 'simen-value'; return;
        }
        var ms = now - st.lastLapAt, lastSec = parseHms(st.lastLap);
        var rest = st.mark === 'rest';
        var maybeBreak = !rest && ms / 1000 > Math.max(CFG.breakHintMinSec, lastSec * CFG.breakHintFactor);
        label.textContent = rest ? 'Pause' : maybeBreak ? 'Mulig pause' : 'Denne runden';
        el.textContent = fmtLap(ms);
        el.className = 'simen-value' + (rest ? ' rest' : maybeBreak ? ' maybe-rest' : '');
    }

    function gapText() {
        if (st.pos === 1 && st.behind) return '▲ ' + fmtKm(st.km - st.behind.km) + ' km foran ' + st.behind.name + ' (' + iso3(st.behind.country) + ')';
        if (st.ahead) return '▼ ' + fmtKm(st.ahead.km - st.km) + ' km bak ' + st.ahead.name + ' (' + iso3(st.ahead.country) + ')';
        return '';
    }

    function renderBanner() {
        if (!st.hasData) return;
        $('simen-name').textContent = st.name;
        $('simen-event-runners').textContent = '· ' + st.total + ' løpere';
        var posEl = $('simen-pos');
        posEl.textContent = st.pos + '. PLASS';
        posEl.classList.toggle('not-leading', st.pos !== 1);
        animateKm(st.km);

        $('simen-laps').textContent = st.laps + ' runder';
        var lapSub = '';
        if (st.lastLap) {
            var sec = parseHms(st.lastLap);
            lapSub = 'siste ' + st.lastLap + (sec > 0 ? ' · ' + fmtKm(CFG.lapKm / sec * 3600) + ' km/t' : '');
        }
        $('simen-lap-sub').textContent = lapSub;

        var gapEl = $('simen-gap');
        if (st.pos === 1 && st.behind) {
            $('simen-gap-label').textContent = 'Ledelse';
            gapEl.className = 'simen-value up';
            gapEl.textContent = '▲ ' + fmtKm(st.km - st.behind.km) + ' km';
            $('simen-gap-sub').textContent = 'foran ' + surname(st.behind.name) + ' (' + iso3(st.behind.country) + ')';
        } else if (st.ahead) {
            $('simen-gap-label').textContent = 'Bak leder';
            gapEl.className = 'simen-value down';
            gapEl.textContent = '▼ ' + fmtKm(st.ahead.km - st.km) + ' km';
            $('simen-gap-sub').textContent = 'bak ' + surname(st.ahead.name) + ' (' + iso3(st.ahead.country) + ')';
        } else {
            gapEl.className = 'simen-value'; gapEl.textContent = '–'; $('simen-gap-sub').textContent = '';
        }

        if (st.perDay) {
            var today = Math.min(5, Math.floor((Date.now() - raceStart) / 86400e3));
            var max = Math.max.apply(null, st.perDay) || 1;
            $('simen-days').innerHTML = st.perDay.map(function(km, i) {
                var cls = i === today ? 'today' : i > today ? 'future' : '';
                var h = Math.max(2, Math.round(km / max * 32));
                return '<div class="' + cls + '"><div class="bar" style="height:' + h + 'px"></div><div class="val">' + (km > 0 ? Math.round(km) : '·') + '</div></div>';
            }).join('');
            $('simen-days-sub').textContent = st.km24 != null ? 'siste 24 t: ' + fmtKm(st.km24) + ' km' : '';
        }

        var proj = projection();
        $('simen-proj').textContent = proj != null ? fmtKm(proj, 0) + ' km' : '–';
        var projSub = $('simen-proj-sub');
        if (st.km >= CFG.worldRecordKm) { projSub.textContent = 'NY VERDENSREKORD!'; projSub.className = 'simen-sub record'; }
        else if (proj != null && proj >= CFG.worldRecordKm) { projSub.textContent = 'over VR ' + fmtKm(CFG.worldRecordKm) + ' km'; projSub.className = 'simen-sub record'; }
        else { projSub.textContent = 'VR: ' + fmtKm(CFG.worldRecordKm) + ' km'; projSub.className = 'simen-sub'; }
        renderClock();
    }
    setInterval(renderClock, 1000);
    renderClock();

    /* ── ticker block ── */
    IS.tickerBlocks.push(function() {
        if (!st.hasData) return '';
        var gap = st.pos === 1 && st.behind ? '▲ ' + fmtKm(st.km - st.behind.km) + ' km' : (st.ahead ? '▼ ' + fmtKm(st.ahead.km - st.km) + ' km' : '');
        return '<span class="tk-data-item tk-simen"><span class="tk-simen-flag">' + FLAG_NOR + '</span>' +
            '<span class="tk-data-val">' + fmtKm(st.km) + '</span>' +
            '<span class="tk-data-meta"><span class="tk-data-label">Simen · ' + st.pos + '. plass</span>' +
            '<span class="tk-data-unit">km · ' + esc(gap) + '</span></span></span>';
    });

    /* ── video: one fixed box, normally over the sidebar slot, expands over the hero ── */
    var video = null, ytPlayer = null, videoBig = false, videoState = 'init';
    function initVideo() {
        var slot = $('daily-images');
        if (!slot) return;
        slot.classList.add('video-takeover');
        IS.pauseSlideshow = true;
        video = document.createElement('div');
        video.className = 'simen-video no-anim';
        video.innerHTML =
            '<div class="simen-player-box">' +
                '<div class="simen-video-player" id="simen-yt"></div>' +
                '<div class="simen-video-fallback"><div class="emoji">🏃</div><div>SIMEN LIVE</div><div class="dim" id="simen-video-note">videostrøm ikke tilgjengelig</div></div>' +
                '<div class="simen-video-tag"><span class="simen-live">LIVE</span></div>' +
                '<div class="simen-video-caption">' + esc(CFG.videoCaption) + '</div>' +
            '</div>' +
            '<div class="simen-stamp" id="simen-stamp" hidden></div>';
        document.body.appendChild(video);
        positionVideo();
        requestAnimationFrame(function() { requestAnimationFrame(function() { video.classList.remove('no-anim'); }); });
        window.addEventListener('resize', positionVideo);
        loadYouTube();
    }
    function positionVideo() {
        if (!video) return;
        var target = videoBig ? hero : $('daily-images');
        var r = target.getBoundingClientRect();
        video.style.top = r.top + 'px'; video.style.left = r.left + 'px';
        video.style.width = r.width + 'px'; video.style.height = r.height + 'px';
        if (videoBig) {
            var pw = Math.round(r.height * 16 / 9);
            video.style.setProperty('--pw', pw + 'px');
            video.style.setProperty('--sl', pw + 'px');
        } else {
            video.style.setProperty('--pw', '100%');
            video.style.setProperty('--sl', '0px');
        }
    }
    var VIDEO_NOTE = { init: 'kobler til YouTube', stalled: 'strømmen stoppet opp', ended: 'strømmen er avsluttet', 'not-playing': 'starter ikke',
        'api-failed': 'YouTube-API kunne ikke lastes', 'api-timeout': 'YouTube-API svarer ikke', 'player-failed': 'spilleren feilet' };
    function setVideoState(s) {
        videoState = s;
        video.classList.toggle('video-error', s !== 'ok');
        if (s !== 'ok') console.log('[' + LABEL + '] video → ' + s);
        updateVideoNote();
    }
    function updateVideoNote() {
        var el = $('simen-video-note');
        if (!el) return;
        var txt = VIDEO_NOTE[videoState] || (/^error/.test(videoState) ? 'YouTube-feil ' + videoState.slice(6) : videoState);
        el.textContent = txt + (vw.attempts ? ' · prøver igjen (' + vw.attempts + ')' : '');
    }
    function loadYouTube() {
        var prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = function() { if (prev) prev(); createPlayer(); };
        if (window.YT && window.YT.Player) { createPlayer(); return; }
        var s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        s.onerror = function() { setVideoState('api-failed'); s.remove(); setTimeout(loadYouTube, 5 * 60 * 1000); };
        document.head.appendChild(s);
        setTimeout(function() { if (videoState === 'init') setVideoState('api-timeout'); }, 30000);
    }
    /* Player lifecycle. onStateChange alone is not enough on flaky Wi-Fi: a stalled stream just sits in BUFFERING or
       UNSTARTED and never fires an error. A watchdog polls the real player state every 10s and, once nothing has played
       for 30s, escalates once a minute: resume → reload the stream → rebuild the player, then round again. */
    var vw = { lastPlaying: 0, lastAttempt: 0, attempts: 0 };
    function createPlayer() {
        var vars = { autoplay: 1, mute: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, disablekb: 1, fs: 0 };
        if (location.protocol !== 'file:') vars.origin = location.origin;
        var host = $('simen-yt');
        if (!host) {                                                        // destroyed by a rebuild — put the host element back
            host = document.createElement('div');
            host.id = 'simen-yt'; host.className = 'simen-video-player';
            var box = video.querySelector('.simen-player-box');
            box.insertBefore(host, box.firstChild);
        }
        try {
            ytPlayer = new YT.Player('simen-yt', {
                videoId: CFG.videoId, width: '100%', height: '100%', playerVars: vars,
                events: {
                    onReady: function(e) { e.target.mute(); e.target.playVideo(); },
                    onStateChange: function(e) {
                        if (e.data === YT.PlayerState.PLAYING) markPlaying();
                        else if (e.data === YT.PlayerState.ENDED) setVideoState('ended');
                    },
                    onError: function(e) { setVideoState('error ' + e.data); },
                },
            });
        } catch (e) { setVideoState('player-failed'); }
        vw.lastPlaying = Date.now();                                        // grace period for the new player
    }
    function markPlaying() {
        vw.lastPlaying = Date.now();
        if (videoState !== 'ok') { console.log('[' + LABEL + '] video → playing' + (vw.attempts ? ' (after ' + vw.attempts + ' retries)' : '')); vw.attempts = 0; setVideoState('ok'); }
    }
    function rebuildPlayer() {
        try { if (ytPlayer && ytPlayer.destroy) ytPlayer.destroy(); } catch (e) { /* ignore */ }
        ytPlayer = null;
        var old = $('simen-yt'); if (old) old.remove();
        createPlayer();
    }
    function videoWatchdog() {
        if (!ytPlayer) {
            if (window.YT && YT.Player && video && videoState !== 'init') rebuildPlayer();   // API arrived late or player got lost
            return;
        }
        var state = -2;
        try { state = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -2; } catch (e) { /* ignore */ }
        if (state === 1) { markPlaying(); return; }
        if (Date.now() - vw.lastPlaying < 30000) return;                  // short buffering is normal
        if (videoState === 'ok') setVideoState('stalled');
        if (Date.now() - vw.lastAttempt < 60000) return;
        vw.lastAttempt = Date.now(); vw.attempts++;
        var step = vw.attempts % 3;                                         // 1: resume, 2: reload stream, 0: rebuild player
        try {
            if (step === 1) { ytPlayer.mute(); ytPlayer.playVideo(); console.log('[' + LABEL + '] video retry ' + vw.attempts + ': resume'); }
            else if (step === 2) { ytPlayer.loadVideoById(CFG.videoId); ytPlayer.mute(); console.log('[' + LABEL + '] video retry ' + vw.attempts + ': reload stream'); }
            else { console.log('[' + LABEL + '] video retry ' + vw.attempts + ': rebuild player'); rebuildPlayer(); }
        } catch (e) {
            console.log('[' + LABEL + '] video retry failed (' + e.message + ') → rebuild player');
            rebuildPlayer();
        }
        updateVideoNote();
    }
    setInterval(videoWatchdog, 10000);
    var takeoverTimer = null;
    function takeover(ms, gold) {
        if (!video) return;
        var stamp = $('simen-stamp');
        stamp.hidden = true; stamp.innerHTML = '';
        stamp.classList.toggle('gold', !!gold);
        videoBig = true; video.classList.add('big'); positionVideo();
        if (takeoverTimer) clearTimeout(takeoverTimer);
        takeoverTimer = setTimeout(function() {
            stamp.hidden = true;
            videoBig = false; video.classList.remove('big'); positionVideo();
            takeoverTimer = null;
        }, ms);
    }
    function showStamp(title, sub, sub2) {
        if (!video || !videoBig) return;
        var stamp = $('simen-stamp');
        stamp.innerHTML = '<div class="simen-stamp-title">' + esc(title) + '</div>' +
            (sub ? '<div class="simen-stamp-sub">' + esc(sub) + '</div>' : '') +
            (sub2 ? '<div class="simen-stamp-sub2">' + esc(sub2) + '</div>' : '');
        stamp.hidden = false;
    }
    // Centre of the text panel (right of the 16:9 player) once the video box covers the hero, as viewport fractions
    function stampTarget() {
        var r = hero.getBoundingClientRect(), pw = r.height * 16 / 9;
        return { x: (r.left + pw + (r.width - pw) / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
    }

    /* ── celebrations ── */
    var glowTimer = null;
    function bannerGlow(ms, gold) {
        banner.classList.add('celebrate');
        banner.classList.toggle('gold', !!gold);
        if (glowTimer) clearTimeout(glowTimer);
        glowTimer = setTimeout(function() { banner.classList.remove('celebrate', 'gold'); }, ms);
    }
    // Shared choreography: confetti + banner glow right away, the video box expands over the hero with an empty
    // panel, a firework rocket loops around the screen and explodes on that panel, and the text pops in there.
    function fireworkShow(o) {
        if (window.Celebration) Celebration.confetti({ duration: o.confettiMs, colors: o.colors, rate: o.rate, burstCount: o.burstCount, decay: o.decay !== false });
        bannerGlow(o.confettiMs, o.gold);
        takeover(o.takeoverMs, o.gold);
        var reveal = function() { showStamp(o.title, o.sub, o.sub2); };
        if (window.Celebration && Celebration.rocket) {
            var t = stampTarget();
            Celebration.rocket({ x: t.x, y: t.y, duration: CFG.rocketMs, colors: o.colors, glow: o.gold ? '#ffd166' : '#ffb347', onExplode: reveal });
        } else {
            reveal();
        }
        IS.rebuildTicker();
    }
    function posText() { return st.pos + '. plass' + (gapText() ? ' · ' + gapText() : ''); }
    function celebrateLap() {
        console.log('[' + LABEL + '] 🎉 ny runde: ' + st.laps);
        fireworkShow({ confettiMs: CFG.lapConfettiMs, rate: 90, burstCount: 180, colors: CFG.colors, takeoverMs: CFG.lapTakeoverMs, gold: false,
            title: 'SIMEN!', sub: st.laps + ' runder · ' + fmtKm(st.km) + ' km', sub2: posText() });
    }
    function celebrateMilestone(title, sub) {
        console.log('[' + LABEL + '] 🏆 milepæl: ' + title);
        fireworkShow({ confettiMs: CFG.milestoneConfettiMs, rate: 120, burstCount: 220, colors: CFG.goldColors, takeoverMs: CFG.milestoneTakeoverMs, gold: true,
            title: title, sub: 'Simen · ' + st.laps + ' runder · ' + fmtKm(st.km) + ' km', sub2: sub + ' · ' + posText() });
        if (window.Celebration) {
            for (var i = 0; i < 8; i++) {
                setTimeout(function() {
                    Celebration.burst({ x: 0.15 + Math.random() * 0.7, y: 0.35 + Math.random() * 0.4, count: 160, colors: CFG.goldColors, spread: Math.PI * 2 });
                }, CFG.rocketMs + 800 + i * 900);
            }
        }
    }
    function celebrateFinish() {
        console.log('[' + LABEL + '] 🏁 mål!');
        fireworkShow({ confettiMs: CFG.finishConfettiMs, rate: 110, burstCount: 250, colors: CFG.goldColors, takeoverMs: CFG.finishTakeoverMs, gold: true, decay: false,
            title: 'MÅL!', sub: 'Simen · ' + fmtKm(st.km) + ' km · ' + st.laps + ' runder', sub2: posText() });
        if (window.Celebration) {
            for (var i = 0; i < 16; i++) {
                setTimeout(function() {
                    Celebration.burst({ x: 0.1 + Math.random() * 0.8, y: 0.3 + Math.random() * 0.5, count: 180, colors: CFG.goldColors, spread: Math.PI * 2 });
                }, CFG.rocketMs + 800 + i * 1200);
            }
        }
    }
    function detectEvents() {
        if (prevLaps != null && st.laps > prevLaps) celebrateLap();
        var fromKm = prevKm != null ? prevKm : storedKm;
        if (fromKm != null && st.km > fromKm) {
            var hit = null;
            CFG.milestones.forEach(function(m) { if (fromKm < m && st.km >= m) hit = { title: m + ' KM!', sub: 'Milepæl passert' }; });
            if (fromKm < CFG.worldRecordKm && st.km >= CFG.worldRecordKm) hit = { title: 'VERDENSREKORD!', sub: fmtKm(st.km) + ' km – forbi ' + fmtKm(CFG.worldRecordKm) + ' km' };
            if (hit) celebrateMilestone(hit.title, hit.sub);
        }
        if (!st.finished && Date.now() >= raceEnd && prevLaps != null) { st.finished = true; celebrateFinish(); }
        prevLaps = st.laps; prevKm = st.km; storedKm = st.km;
        try { localStorage.setItem('simen:lastKm', String(st.km)); } catch (e) { /* ignore */ }
    }

    /* ── data loading ── */
    async function loadResults() {
        try {
            var data = await IS.sourceFetch('simen', CFG.resultsUrl, { cacheKey: 'dev:simen:results' });
            parseResults(data);
            if (demo) applyDemoOffset();
            console.log('[' + LABEL + '] korido.hu → ' + st.pos + '. plass, ' + st.laps + ' runder, ' + st.km.toFixed(1) + ' km');
            IS.setSource('simen', 'ok');
            renderBanner();
            detectEvents();
        } catch (e) {
            console.log('[' + LABEL + '] korido.hu → ERROR ' + e.message);
            IS.setSource('simen', 'error');
        }
    }
    async function loadLaps() {
        try {
            var html = await IS.sourceFetch('simen', CFG.lapsUrl, { parse: 'text', skipStatus: true, cacheKey: 'dev:simen:laps' });
            var rows = parseLaps(html);
            if (!rows.length) throw new Error('no lap rows');
            computeLapStats(rows);
            console.log('[' + LABEL + '] laps → ' + rows.length + ' runder, siste 24t: ' + st.km24.toFixed(1) + ' km');
            renderBanner();
        } catch (e) {
            console.log('[' + LABEL + '] laps → ERROR ' + e.message);
        }
    }

    /* ── demo / dev shortcuts ── */
    var demoLaps = 0;
    function applyDemoOffset() { st.laps += demoLaps; st.km += demoLaps * CFG.lapKm; }
    function simulateLap() {
        if (!st.hasData) return;
        demoLaps++; st.laps++; st.km += CFG.lapKm;
        if (st.lastLapAt != null) st.lastLap = pad2(Math.floor((Date.now() - st.lastLapAt) / 60000)) + ':' + pad2(Math.floor((Date.now() - st.lastLapAt) / 1000) % 60);
        st.lastLapAt = Date.now();
        renderBanner(); detectEvents();
    }
    function simulateMilestone() {
        if (!st.hasData) return;
        var next = CFG.milestones.concat([CFG.worldRecordKm]).filter(function(m) { return m > st.km; })[0];
        if (!next) return;
        demoLaps += Math.round((next + 0.05 - st.km) / CFG.lapKm); st.km = next + 0.05;
        renderBanner(); detectEvents();
    }
    document.addEventListener('keydown', function(e) {
        if (e.key === 'l' || e.key === 'L') simulateLap();
        else if (e.key === 'm' || e.key === 'M') simulateMilestone();
        else if (e.key === 'f' || e.key === 'F') { if (st.hasData) celebrateFinish(); }
        else if (e.key === 'v' || e.key === 'V') { if (video) { videoBig = !videoBig; video.classList.toggle('big', videoBig); positionVideo(); } }
    });
    if (demo) setInterval(simulateLap, 25000);

    /* ── go ── */
    initVideo();
    setTimeout(loadResults, 8000);
    setInterval(loadResults, CFG.resultsRefresh);
    setTimeout(loadLaps, 30000);
    setInterval(loadLaps, CFG.lapsRefresh);
    window.SimenLive = { state: st, simulateLap: simulateLap, simulateMilestone: simulateMilestone, celebrateFinish: celebrateFinish,
        video: { state: function() { return videoState; }, watch: vw, pause: function() { if (ytPlayer) ytPlayer.pauseVideo(); },
                 tick: videoWatchdog, rebuild: rebuildPlayer } };
})();
