// simen.js — "SIMEN LIVE": live tracker for Simen Holvik at the EMU 6-Day Race (temporary, Sept 2026).
// Adds: a banner between hero and feed, the live stream in the sidebar image slot (expands over the hero
// on celebrations), confetti on every new lap, gold celebrations on milestones, a ticker block.
// Depends on window.InfoScreen (app.js) and window.Celebration (celebration.js).
// After the finish: result layout in the banner, video off, a result panel show over the hero every 5 minutes.
// Dev: ?simenDemo=1 fakes a lap every 25s. Keys: L = lap, M = milestone, F = finish, P = result show, V = toggle video size.
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
        hideAfter: '2026-09-16T18:00:00+02:00',     // everything disappears on its own after this (one week after the finish)
        eventName: 'EMU 6-dagers · Balatonfüred',
        eventFull: 'EMU 6-Day Race · GOMU 6-Day World Championship',
        eventPlace: 'Balatonfüred, Ungarn · 3.–9. september 2026',
        videoCaption: 'Balatonfüred — EMU 6-Day Race, direkte',
        resultsRefresh: 30 * 1000,                  // while the race runs (SOURCES.simen.refresh follows this)
        finalResultsRefresh: 30 * 60 * 1000,        // after the finish: only official corrections can change anything
        finalShowEveryMs: 5 * 60 * 1000,            // after the finish: confetti + rocket + result panel this often, round the clock
        finalShowConfettiMs: 60 * 1000,
        finalShowPanelMs: 45 * 1000,
        finalPulseMs: 8 * 1000,                     // after the finish: the distance re-counts up to the final figure this often
        finalPerDay: [210, 170, 177, 172, 124, 87], // km per race day; used when the lap table is unavailable (korido blocks IPs post-race)
        marathonKm: 42.195,
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
        perDay: null, km24: null, top3: [], finished: Date.now() >= raceEnd,
    };
    var prevLaps = null, prevKm = null;
    var finalMode = false, lastFinalShow = 0;          // final-mode flags (declared here: renderClock runs before later var initialisers)
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
    var ISO2 = { USA: 'US', NOR: 'NO', CRO: 'HR', HUN: 'HU', ROU: 'RO', JPN: 'JP', SWE: 'SE', FRA: 'FR', GER: 'DE', AUT: 'AT', ITA: 'IT',
        POL: 'PL', CZE: 'CZ', SVK: 'SK', SUI: 'CH', NED: 'NL', BEL: 'BE', GBR: 'GB', DEN: 'DK', FIN: 'FI', ESP: 'ES', POR: 'PT', SLO: 'SI',
        SRB: 'RS', UKR: 'UA', AUS: 'AU', CAN: 'CA', RSA: 'ZA', IND: 'IN', ISR: 'IL', IRL: 'IE', LTU: 'LT', LAT: 'LV', EST: 'EE', BRA: 'BR',
        ARG: 'AR', MEX: 'MX', NZL: 'NZ', TPE: 'TW', KOR: 'KR', CHN: 'CN', TUR: 'TR', GRE: 'GR', BUL: 'BG' };
    function flagHtml(countryField) {
        var a3 = iso3(countryField);
        if (a3 === 'NOR') return FLAG_NOR;
        var a2 = ISO2[a3];
        return a2 ? String.fromCodePoint(0x1F1E6 + a2.charCodeAt(0) - 65, 0x1F1E6 + a2.charCodeAt(1) - 65) : a3;
    }
    var MON = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
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
        st.top3 = rows.slice(0, 3).map(rowInfo);
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
    function perDayKm() { return st.perDay || (st.finished ? CFG.finalPerDay : null); }
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
            '<div class="simen-flag">' + FLAG_NOR + '<span class="simen-live" id="simen-live-tag">LIVE</span></div>' +
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
        '<div class="simen-cell simen-proj"><div class="simen-label" id="simen-proj-label">Prognose</div>' +
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
            var fin = new Date(raceEnd);
            $('simen-day').textContent = 'I mål · ' + CFG.raceHours + ' timer';
            $('simen-left').textContent = fin.getDate() + '. ' + MON[fin.getMonth()] + ' ' + pad2(fin.getHours()) + ':' + pad2(fin.getMinutes());
            enterFinalMode();
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
        if (st.finished) return;                                        // the cell shows the average speed instead (renderBanner)
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
        if (st.finished) {
            $('simen-lap-label').textContent = 'Snittfart';
            var avgEl = $('simen-lap'); avgEl.className = 'simen-value'; avgEl.textContent = fmtKm(st.km / CFG.raceHours) + ' km/t';
            $('simen-lap-sub').textContent = CFG.raceHours + ' timer';
        }

        var gapEl = $('simen-gap');
        if (st.pos === 1 && st.behind) {
            $('simen-gap-label').textContent = 'Ledelse';
            gapEl.className = 'simen-value up';
            gapEl.textContent = '▲ ' + fmtKm(st.km - st.behind.km) + ' km';
            $('simen-gap-sub').textContent = 'foran ' + surname(st.behind.name) + ' (' + iso3(st.behind.country) + ')';
        } else if (st.ahead) {
            $('simen-gap-label').textContent = st.finished ? 'Bak vinner' : 'Bak leder';
            gapEl.className = 'simen-value down';
            gapEl.textContent = '▼ ' + fmtKm(st.ahead.km - st.km) + ' km';
            $('simen-gap-sub').textContent = 'bak ' + surname(st.ahead.name) + ' (' + iso3(st.ahead.country) + ')';
        } else {
            gapEl.className = 'simen-value'; gapEl.textContent = '–'; $('simen-gap-sub').textContent = '';
        }

        var perDay = perDayKm();
        if (perDay) {
            var today = st.finished ? -1 : Math.min(5, Math.floor((Date.now() - raceStart) / 86400e3));
            var max = Math.max.apply(null, perDay) || 1;
            var best = perDay.indexOf(max);
            $('simen-days').innerHTML = perDay.map(function(km, i) {
                var cls = st.finished ? (i === best ? 'today' : '') : (i === today ? 'today' : i > today ? 'future' : '');
                var h = Math.max(2, Math.round(km / max * 32));
                return '<div class="' + cls + '"><div class="bar" style="height:' + h + 'px"></div><div class="val">' + (km > 0 ? Math.round(km) : '·') + '</div></div>';
            }).join('');
            $('simen-days-sub').textContent = st.finished ? 'beste dag: ' + Math.round(max) + ' km' : (st.km24 != null ? 'siste 24 t: ' + fmtKm(st.km24) + ' km' : '');
        }

        var projSub = $('simen-proj-sub');
        if (st.finished) {
            $('simen-proj-label').textContent = 'Tilsvarer';
            $('simen-proj').textContent = fmtKm(st.km / CFG.marathonKm) + ' maraton';
            projSub.textContent = 'à ' + fmtKm(CFG.marathonKm, 3) + ' km'; projSub.className = 'simen-sub';
        } else {
            var proj = projection();
            $('simen-proj-label').textContent = 'Prognose';
            $('simen-proj').textContent = proj != null ? fmtKm(proj, 0) + ' km' : '–';
            if (st.km >= CFG.worldRecordKm) { projSub.textContent = 'NY VERDENSREKORD!'; projSub.className = 'simen-sub record'; }
            else if (proj != null && proj >= CFG.worldRecordKm) { projSub.textContent = 'over VR ' + fmtKm(CFG.worldRecordKm) + ' km'; projSub.className = 'simen-sub record'; }
            else { projSub.textContent = 'VR: ' + fmtKm(CFG.worldRecordKm) + ' km'; projSub.className = 'simen-sub'; }
        }
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
            '<span class="tk-data-meta"><span class="tk-data-label">Simen · ' + st.pos + '. plass' + (st.finished ? ' · i mål' : '') + '</span>' +
            '<span class="tk-data-unit">km · ' + esc(gap) + '</span></span></span>';
    });

    /* ── video: one fixed box, normally over the sidebar slot, expands over the hero ── */
    var video = null, ytPlayer = null, videoBig = false, videoState = 'init', videoOff = false;
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
                '<div class="simen-video-fallback">' +
                '<img class="simen-still" id="simen-still" alt="">' +
                '<div class="simen-still-text"><div class="emoji">🏃</div><div>SIMEN LIVE</div><div class="dim" id="simen-video-note">videostrøm ikke tilgjengelig</div></div>' +
            '</div>' +
                '<div class="simen-video-tag"><span class="simen-live">LIVE</span></div>' +
                '<div class="simen-video-caption">' + esc(CFG.videoCaption) + '</div>' +
            '</div>' +
            '<div class="simen-stamp" id="simen-stamp" hidden></div>';
        document.body.appendChild(video);
        positionVideo();
        requestAnimationFrame(function() { requestAnimationFrame(function() { video.classList.remove('no-anim'); }); });
        window.addEventListener('resize', positionVideo);
        if (st.finished) shutdownVideo(); else loadYouTube();
    }
    // After the finish the stream is over: no player, no retries, slot back to the slideshow. The box stays for the result panel.
    function shutdownVideo() {
        if (videoOff) return;
        videoOff = true;
        try { if (ytPlayer && ytPlayer.destroy) ytPlayer.destroy(); } catch (e) { /* ignore */ }
        ytPlayer = null;
        var old = $('simen-yt'); if (old) old.remove();
        video.classList.add('video-off');
        parkVideo(true);
        console.log('[' + LABEL + '] video → off (race finished)');
    }
    function positionVideo() {
        if (!video) return;
        var target = videoBig ? hero : $('daily-images');
        var r = target.getBoundingClientRect();
        video.style.top = r.top + 'px'; video.style.left = r.left + 'px';
        video.style.width = r.width + 'px'; video.style.height = r.height + 'px';
        if (videoOff) {
            video.style.setProperty('--pw', '0px');
            video.style.setProperty('--sl', '0px');
        } else if (videoBig) {
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
        updateStill();
    }
    // While the player is down, show YouTube's live thumbnail instead (a near-live still, refreshed by YouTube every
    // few minutes). Reloaded every 2 minutes while the fallback is visible.
    var stillTimer = null;
    function updateStill() {
        var img = $('simen-still');
        if (!img) return;
        if (videoState === 'ok') {
            if (stillTimer) { clearInterval(stillTimer); stillTimer = null; }
            return;
        }
        var load = function() {
            img.onload = function() { video.classList.add('has-still'); };
            img.onerror = function() { video.classList.remove('has-still'); };
            img.src = 'https://i.ytimg.com/vi/' + CFG.videoId + '/sddefault_live.jpg?t=' + Date.now();
        };
        if (!stillTimer) { load(); stillTimer = setInterval(load, 10 * 60 * 1000); }
    }
    function updateVideoNote() {
        var el = $('simen-video-note');
        if (!el) return;
        var txt = VIDEO_NOTE[videoState] || (/^error/.test(videoState) ? 'YouTube-feil ' + videoState.slice(6) + (/150|101|153/.test(videoState) ? ' (avspilling nektet)' : '') : videoState);
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
    var vw = { lastPlaying: 0, lastAttempt: 0, attempts: 0, rebuilds: 0, downSince: null, parked: false };
    var PARK_AFTER_MS = 3 * 60 * 1000;
    // On networks where YouTube refuses to play (the TV box gets error 150), a frozen poster is worse than the normal
    // slideshow. After 3 min without video the slot goes back to the slideshow; the player keeps retrying in the
    // background and takes the slot again as soon as it plays. Celebrations still expand the box over the hero.
    function parkVideo(park) {
        if (park === vw.parked) return;
        vw.parked = park;
        var slot = $('daily-images');
        if (slot) slot.classList.toggle('video-takeover', !park);
        IS.pauseSlideshow = !park;
        video.classList.toggle('parked', park);
        console.log('[' + LABEL + '] video → ' + (park ? 'slot handed back to the slideshow' : 'slot reclaimed'));
    }
    var YT_HOSTS = ['https://www.youtube.com', 'https://www.youtube-nocookie.com'];
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
                host: YT_HOSTS[vw.rebuilds % YT_HOSTS.length],           // alternate hosts: a refusal on one sometimes clears on the other
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
        vw.downSince = null;
        parkVideo(false);
        if (videoState !== 'ok') { console.log('[' + LABEL + '] video → playing' + (vw.attempts ? ' (after ' + vw.attempts + ' retries)' : '')); vw.attempts = 0; setVideoState('ok'); }
    }
    function rebuildPlayer() {
        try { if (ytPlayer && ytPlayer.destroy) ytPlayer.destroy(); } catch (e) { /* ignore */ }
        ytPlayer = null;
        var old = $('simen-yt'); if (old) old.remove();
        vw.rebuilds++;
        createPlayer();
    }
    function videoWatchdog() {
        if (videoOff) return;
        if (!ytPlayer) {
            if (window.YT && YT.Player && video && videoState !== 'init') rebuildPlayer();   // API arrived late or player got lost
            return;
        }
        var state = -2;
        try { state = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -2; } catch (e) { /* ignore */ }
        if (state === 1) { markPlaying(); return; }
        if (Date.now() - vw.lastPlaying < 30000) return;                  // short buffering is normal
        if (videoState === 'ok') setVideoState('stalled');
        if (vw.downSince == null) vw.downSince = Date.now();
        if (Date.now() - vw.downSince >= PARK_AFTER_MS) parkVideo(true);
        if (Date.now() - vw.lastAttempt < 60000) return;
        vw.lastAttempt = Date.now(); vw.attempts++;
        var step = /^error/.test(videoState) ? 0 : vw.attempts % 3;         // 1: resume, 2: reload stream, 0: rebuild player (straight to rebuild after a YouTube error)
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
        stamp.hidden = true; stamp.innerHTML = ''; stamp.classList.remove('panel');
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
        var r = hero.getBoundingClientRect(), pw = videoOff ? 0 : r.height * 16 / 9;
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
    /* ── final mode: result layout, video off, result panel show every 5 minutes ── */
    function enterFinalMode() {
        if (finalMode) return;
        finalMode = true;
        var wasRunning = st.hasData && prevLaps != null && !st.finished;   // the page was up when the clock hit zero
        st.finished = true;
        banner.classList.add('final');
        $('simen-live-tag').textContent = 'MÅL';
        if (IS.SOURCES.simen) IS.SOURCES.simen.refresh = CFG.finalResultsRefresh;
        if (wasRunning) celebrateFinish();
        // finish celebration keeps the video for a while; then the stream is over for good
        setTimeout(shutdownVideo, wasRunning ? CFG.finishTakeoverMs + 60 * 1000 : 0);
        lastFinalShow = Date.now() - CFG.finalShowEveryMs + 90 * 1000;   // first result show 90 s after entering final mode
        setInterval(function() { if (videoOff && st.hasData && Date.now() - lastFinalShow >= CFG.finalShowEveryMs) finalShow(); }, 5000);
        setInterval(idlePulse, CFG.finalPulseMs);
        if (st.hasData) renderBanner();
        console.log('[' + LABEL + '] final mode');
    }
    // Idle pulse: the final distance counts up the last three laps again and bumps, so the banner keeps looking alive.
    function idlePulse() {
        if (!st.hasData || st.km == null) return;
        shownKm = st.km - CFG.lapKm * 3;
        animateKm(st.km);
    }
    function finalShow() {
        lastFinalShow = Date.now();
        console.log('[' + LABEL + '] 🎆 resultatvisning');
        if (window.Celebration) Celebration.confetti({ duration: CFG.finalShowConfettiMs, colors: CFG.colors.concat(['#ffd166']), rate: 70, burstCount: 160 });
        bannerGlow(CFG.finalShowConfettiMs, true);
        takeover(CFG.finalShowPanelMs, true);
        if (window.Celebration && Celebration.rocket) {
            var t = stampTarget();
            Celebration.rocket({ x: t.x, y: t.y, duration: CFG.rocketMs, colors: CFG.goldColors, glow: '#ffd166', onExplode: showFinalPanel });
        } else {
            showFinalPanel();
        }
    }
    function showFinalPanel() {
        if (!video || !videoBig) return;
        var perDay = perDayKm() || [];
        var max = Math.max.apply(null, perDay.concat([1])), best = perDay.indexOf(max);
        var podium = st.top3.map(function(r) {
            return '<div class="' + (r.bib === CFG.bib ? 'me' : '') + '"><span class="fp-rank">' + r.pos + '</span><span class="fp-fl">' + flagHtml(r.country) + '</span>' +
                '<span class="fp-nm">' + esc(r.name) + '</span><span class="fp-dist">' + fmtKm(r.km) + ' km</span></div>';
        }).join('');
        var days = perDay.map(function(km, i) {
            return '<div class="' + (i === best ? 'best' : '') + '"><div class="val">' + Math.round(km) + '</div><div class="bar" style="height:' + Math.max(3, Math.round(km / max * 46)) + 'px"></div><div class="day">D' + (i + 1) + '</div></div>';
        }).join('');
        var stamp = $('simen-stamp');
        stamp.className = 'simen-stamp gold panel';
        stamp.innerHTML =
            '<div class="fp">' +
                '<div class="fp-id"><div class="fp-flag">' + FLAG_NOR + '</div><div class="fp-name">' + esc(st.name) + '</div>' +
                    '<div class="fp-pos">' + st.pos + '. PLASS</div>' +
                    '<div class="fp-event">' + esc(CFG.eventFull) + '<br>' + esc(CFG.eventPlace) + ' · ' + st.total + ' løpere</div></div>' +
                '<div class="fp-main"><div class="fp-km">' + fmtKm(st.km) + '<small>km</small></div>' +
                    '<div class="fp-stats">' +
                        '<div><b>' + fmtKm(st.laps, 0) + '</b><span>runder</span></div>' +
                        '<div><b>' + fmtKm(st.km / CFG.raceHours) + '</b><span>km/t i snitt</span></div>' +
                        '<div><b>' + fmtKm(st.km / CFG.marathonKm) + '</b><span>maraton</span></div>' +
                        '<div><b>' + CFG.raceHours + '</b><span>timer</span></div>' +
                    '</div></div>' +
                '<div class="fp-side"><div class="fp-label">Topp 3 av ' + st.total + '</div><div class="fp-podium">' + podium + '</div>' +
                    '<div class="fp-label">Km per løpsdag</div><div class="fp-days">' + days + '</div></div>' +
            '</div>';
        stamp.hidden = false;
    }

    function detectEvents() {
        var running = Date.now() < raceEnd;
        if (running && prevLaps != null && st.laps > prevLaps) celebrateLap();
        var fromKm = prevKm != null ? prevKm : storedKm;
        if (running && fromKm != null && st.km > fromKm) {
            var hit = null;
            CFG.milestones.forEach(function(m) { if (fromKm < m && st.km >= m) hit = { title: m + ' KM!', sub: 'Milepæl passert' }; });
            if (fromKm < CFG.worldRecordKm && st.km >= CFG.worldRecordKm) hit = { title: 'VERDENSREKORD!', sub: fmtKm(st.km) + ' km – forbi ' + fmtKm(CFG.worldRecordKm) + ' km' };
            if (hit) celebrateMilestone(hit.title, hit.sub);
        }
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
        if (e.key === 'l' || e.key === 'L') { if (st.finished) { if (st.hasData && videoOff) finalShow(); } else simulateLap(); }
        else if (e.key === 'm' || e.key === 'M') { if (st.finished) { if (st.hasData && videoOff) finalShow(); } else simulateMilestone(); }
        else if (e.key === 'f' || e.key === 'F') { if (st.hasData) celebrateFinish(); }
        else if (e.key === 'p' || e.key === 'P') { if (st.hasData && videoOff) finalShow(); }
        else if (e.key === 'v' || e.key === 'V') { if (video) { videoBig = !videoBig; video.classList.toggle('big', videoBig); positionVideo(); } }
    });
    if (demo && !st.finished) setInterval(simulateLap, 25000);

    /* ── go ── */
    initVideo();
    function scheduleResults() {
        var ms = Date.now() >= raceEnd ? CFG.finalResultsRefresh : CFG.resultsRefresh;
        if (IS.SOURCES.simen) IS.SOURCES.simen.refresh = ms;
        setTimeout(function() { loadResults().then(scheduleResults, scheduleResults); }, ms);
    }
    if (IS.SOURCES.simen && st.finished) IS.SOURCES.simen.refresh = CFG.finalResultsRefresh;
    setTimeout(function() { loadResults().then(scheduleResults, scheduleResults); }, 8000);
    if (!st.finished) {
        setTimeout(loadLaps, 30000);
        var lapsTimer = setInterval(function() { if (Date.now() >= raceEnd) { clearInterval(lapsTimer); return; } loadLaps(); }, CFG.lapsRefresh);
    }
    window.SimenLive = { state: st, simulateLap: simulateLap, simulateMilestone: simulateMilestone, celebrateFinish: celebrateFinish, finalShow: finalShow,
        video: { state: function() { return videoState; }, watch: vw, pause: function() { if (ytPlayer) ytPlayer.pauseVideo(); },
                 tick: videoWatchdog, rebuild: rebuildPlayer, fail: function(code) { setVideoState('error ' + (code || 150)); }, park: parkVideo } };
})();
