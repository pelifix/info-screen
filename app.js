// app.js — Author: Christer Grimsæth

(function() {
    'use strict';

    var CONFIG = {
        // CORS proxies for sources without CORS headers, tried in order until one succeeds.
        // (corsproxy.io dropped Sept 2026: free tier now requires an API key.)
        corsProxies: [
            { name: 'codetabs', url: function(u) { return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u); } },
            { name: 'redocly',  url: function(u) { return 'https://cors.redoc.ly/' + u; } },
            // These two strip the browser Origin header (Avinor rejects requests that carry one). Only used when a
            // source asks for them via opts.proxyOrder: cors.lol rate-limits hard and allorigins is flaky.
            { name: 'corslol',    onRequest: true, url: function(u) { return 'https://api.cors.lol/?url=' + encodeURIComponent(u); } },
            { name: 'allorigins', onRequest: true, url: function(u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); } },
        ],
        proxyTimeout: 15 * 1000,   // per proxy attempt (a dead codetabs takes ~20s to 522)
        rssApi: 'https://api.rss2json.com/v1/api.json?rss_url=',
        feeds: {
            news: 'https://www.nrk.no/toppsaker.rss',
            sport: 'https://www.nrk.no/sport/toppsaker.rss',
            rogaland: 'https://www.nrk.no/rogaland/toppsaker.rss',
            e24: 'https://e24.no/rss2/',
            aftenbladet: 'https://www.aftenbladet.no/rss',
            vg: 'https://www.vg.no/rss/feed/',
            vgSport: 'https://www.vg.no/rss/feed/?categories=sport',
            dn: 'https://services.dn.no/api/feed/rss/',
            tu: 'https://www.tu.no/rss',
            strompris: 'https://www.hvakosterstrommen.no/rss/prices/NO2',
        },
        stromprisRegion: 'NO2',
        stromprisRefresh: 30 * 60 * 1000,
        feedRefresh: 5 * 60 * 1000,
        feedScrollInterval: 7000,
        maxItemAgeHours: 48,       // news older than this leaves the feed pool...
        minItemsPerSource: 3,      // ...unless it is among a source's newest few (regional feeds are slow)
        // tu.no serves the strip itself at this URL (image/jpeg, one per date). No CORS needed for an <img>.
        comicUrl: 'https://www.tu.no/api/widgets/comics?name=lunch&date=',
        comicCredit: 'Lunch · Børge Lund · tu.no',
        comicRefresh: 60 * 60 * 1000,
        paadagRefresh: 6 * 60 * 60 * 1000,
        tickerSpeed: 100,
        slideInterval: 12000,
        heroInterval: 14000,
        heroCount: 9,
        weatherLat: 58.97,
        weatherLon: 5.73,
        weatherLocation: 'Stavanger, Norge',
        weatherRefresh: 10 * 60 * 1000,
        financeRefresh: 30 * 60 * 1000,
        eventsRefresh: 3 * 60 * 60 * 1000,
        imageRefresh: 60 * 60 * 1000,
        webcams: [
            { src: 'https://kamera.atlas.vegvesen.no/api/images/1129023_1', caption: 'Vegkamera \u2014 E39 Forusbeen' },
            { src: 'https://kamera.atlas.vegvesen.no/api/images/1229047_1', caption: 'Vegkamera \u2014 E134 Midtl\u00e6ger (1084 moh)' },
            { src: 'https://www.yr.no/webcams/1/2000/ullandhaug/3.jpg', caption: 'Ullandhaug \u2014 Stavanger nord\u00f8st' },
            { src: 'https://www.yr.no/webcams/8/2000/1578993455.jpg', caption: 'Stavanger \u2014 V\u00e5gen' },
            { src: 'https://www.yr.no/webcams/8/2000/1656509673.jpg', caption: 'Stavanger \u2014 havn' },
        ],
        busStop: 'NSR:StopPlace:27727',
        busStopName: 'Koppholen',
        busDepartures: 8,
        busRefresh: 45 * 1000,
        bikeStations: ['YKO:Station:190', 'YKO:Station:192'],
        bikeRefresh: 60 * 1000,
        trafficGraphQL: 'https://trafikkdata-api.atlas.vegvesen.no/',
        trafficPointId: '12478V320582',
        trafficPointName: 'E39 J\u00e5tten',
        trafficRefresh: 5 * 60 * 1000,
        bikeCountApi: 'https://opencom.no/api/action/datastore_search',
        bikeCountResource: 'c584f88c-c967-4ced-9e47-4126eb7b1e14',
        bikeCountStation: 'Møllebukta',
        bikeCountRefresh: 10 * 60 * 1000,
        policeApi: 'https://api.politiloggen.politiet.no/messages?Districts=S%C3%B8rVest&Municipalities=Randaberg&Municipalities=Sandnes&Municipalities=Sola&Municipalities=Stavanger&Take=50',   // 50 is the API maximum
        policeRefresh: 2 * 60 * 1000,
        policeMaxAgeHours: 24,     // closed incidents drop out after this; ongoing ones always stay
    };

    /* ═══ SOURCE STATUS TRACKING ═══ */
    var SOURCES = {
        nyheter:     { label: 'NRK',         status: 'pending', refresh: CONFIG.feedRefresh,      proxy: 'rss2json' },
        sport:       { label: 'NRK Sport',   status: 'pending', refresh: CONFIG.feedRefresh,      proxy: 'rss2json' },
        rogaland:    { label: 'NRK Rogaland', status: 'pending', refresh: CONFIG.feedRefresh,     proxy: 'rss' },        // direct fetch (NRK sends CORS); rss2json throttles new feeds
        e24:         { label: 'E24',         status: 'pending', refresh: CONFIG.feedRefresh,      proxy: 'rss2json' },
        aftenbladet: { label: 'Aftenbladet', status: 'pending', refresh: CONFIG.feedRefresh,      proxy: 'rss2json' },
        vg:          { label: 'VG',          status: 'pending', refresh: CONFIG.feedRefresh,      proxy: 'rss2json' },
        vgSport:     { label: 'VG Sport',    status: 'pending', refresh: CONFIG.feedRefresh,      proxy: 'rss2json' },
        dn:          { label: 'DN',          status: 'pending', refresh: CONFIG.feedRefresh,      proxy: 'rss2json' },
        tu:          { label: 'TU',          status: 'pending', refresh: CONFIG.feedRefresh,      proxy: 'rss2json' },
        strompris:   { label: 'Strøm',       status: 'pending', refresh: CONFIG.stromprisRefresh, proxy: 'rss2json' },
        magasin:     { label: 'Magasin',     status: 'pending', refresh: 6 * 60 * 60 * 1000,      proxy: 'none' },       // NVE, weekly (Wed 13:00), sends CORS
        lunch:       { label: 'Lunch',       status: 'pending', refresh: CONFIG.comicRefresh,     proxy: 'none' },       // image only, nothing to fetch as data
        paadag:      { label: 'Historie',    status: 'pending', refresh: CONFIG.paadagRefresh,    proxy: 'none' },       // no.wikipedia, origin=* so no proxy
        trafikk:     { label: 'Trafikk',     status: 'pending', refresh: CONFIG.trafficRefresh,   proxy: 'none' },
        sykkel:      { label: 'Sykkel',      status: 'pending', refresh: CONFIG.bikeCountRefresh, proxy: 'jsonp' },
        marked:      { label: 'Marked',      status: 'pending', refresh: CONFIG.financeRefresh,   proxy: 'cors' },
        vaer:        { label: 'V\u00e6r',    status: 'pending', refresh: CONFIG.weatherRefresh,   proxy: 'none' },
        bilder:      { label: 'Bilder',      status: 'pending', refresh: CONFIG.imageRefresh,     proxy: 'rss2json' },
        bysykler:    { label: 'Bysykler',    status: 'pending', refresh: CONFIG.bikeRefresh,      proxy: 'none' },
        buss:        { label: 'Buss',        status: 'pending', refresh: CONFIG.busRefresh,       proxy: 'none' },
        fly:         { label: 'Fly Sola',    status: 'pending', refresh: 5 * 60 * 1000,           proxy: 'cors' },       // Avinor allows one poll per 3 min; the Origin-stripping proxy rate-limits, so 5
        konserthus:  { label: 'Konserthus',  status: 'pending', refresh: CONFIG.eventsRefresh,    proxy: 'cors' },
        folken:      { label: 'Folken',      status: 'pending', refresh: CONFIG.eventsRefresh,    proxy: 'cors' },
        tou:         { label: 'Tou',         status: 'pending', refresh: CONFIG.eventsRefresh,    proxy: 'cors' },
        solvberget:  { label: 'Sølvberget',  status: 'pending', refresh: CONFIG.eventsRefresh,    proxy: 'cors' },
        dnbarena:    { label: 'DNB Arena',   status: 'pending', refresh: CONFIG.eventsRefresh,    proxy: 'cors' },
        forum:       { label: 'Forum',       status: 'pending', refresh: CONFIG.eventsRefresh,    proxy: 'cors' },
        politi:      { label: 'Politi',      status: 'pending', refresh: CONFIG.policeRefresh,   proxy: 'cors' },
        parkering:   { label: 'Parkering',   status: 'pending', refresh: 5 * 60 * 1000,           proxy: 'cors' },       // Stavanger open data, live garage counts
        simen:       { label: 'Simen',       status: 'pending', refresh: 30 * 1000,               proxy: 'cors' },   // see simen.js
    };

    var preRefreshTimers = {};

    var FEED_META = {
        news:        { srcKey: 'nyheter',     label: 'NRK',         color: 'src-nrk' },
        sport:       { srcKey: 'sport',       label: 'NRK Sport',   color: 'src-nrk-sport' },
        rogaland:    { srcKey: 'rogaland',    label: 'NRK Rogaland', color: 'src-nrk-rogaland' },
        e24:         { srcKey: 'e24',         label: 'E24',         color: 'src-e24' },
        aftenbladet: { srcKey: 'aftenbladet', label: 'Aftenbladet', color: 'src-aftenbladet' },
        vg:          { srcKey: 'vg',          label: 'VG',          color: 'src-vg' },
        vgSport:     { srcKey: 'vgSport',     label: 'VG Sport',    color: 'src-vg-sport' },
        dn:          { srcKey: 'dn',          label: 'DN',          color: 'src-dn' },
        tu:          { srcKey: 'tu',          label: 'TU',          color: 'src-tu' },
        strompris:   { srcKey: 'strompris',   label: 'Strømpris',   color: 'src-strompris' },
        magasin:     { srcKey: 'magasin',     label: 'Magasinfylling', color: 'src-magasin' },
        lunch:       { srcKey: 'lunch',       label: 'Lunch',       color: 'src-tu', cardClass: 'comic-card' },
        paadag:      { srcKey: 'paadag',      label: 'På denne dagen', color: 'src-paadag' },
        trafikk:     { srcKey: 'trafikk',     label: 'E39 Trafikk', color: 'src-trafikk' },
        sykkel:      { srcKey: 'sykkel',      label: 'Sykkeldata',  color: 'src-sykkel' },
        politi:      { srcKey: 'politi',      label: 'Politi',      color: 'src-politi',
            cardClass: 'police-tape',
            noImg: function(item) { return policeIcon(item._category); },
            noImgClass: 'police-img',
            heroNoImgClass: 'police-hero-img',
            topBadge: function(item) {
                if (!item._isActive) return null;
                return { text: 'P\u00C5G\u00C5R', cls: 'hero-top-badge police-pagar-hero' };
            },
            statusBadge: function(item) {
                return item._isActive
                    ? '<div class="police-status-badge police-status-pagar">P\u00C5G\u00C5R</div>'
                    : '<div class="police-status-badge police-status-avsluttet">AVSLUTTET</div>';
            },
        },
    };

    var HERO_PIN = { lunch: 1 };    // sources guaranteed a hero slot when they have an item
    var FEED_SKIP = { lunch: 1 };   // sources kept out of the two-column feed

    var lastRefreshTime = null;

    function setSource(key, status) {
        SOURCES[key].status = status;
        if (status === 'ok') lastRefreshTime = new Date();
        // Schedule pre-refresh glow 8s before next refresh
        if (status === 'ok' || status === 'error') {
            if (preRefreshTimers[key]) clearTimeout(preRefreshTimers[key]);
            var interval = SOURCES[key].refresh;
            if (interval) {
                var delay = Math.max(interval - 10000, 0);
                preRefreshTimers[key] = setTimeout(function() {
                    if (SOURCES[key].status === 'ok' || SOURCES[key].status === 'error') {
                        SOURCES[key].status = 'soon';
                        renderSourceStatus();
                    }
                }, delay);
            }
        }
        renderSourceStatus();
    }

    function renderSourceStatus() {
        var el = document.getElementById('source-status');
        if (!el) return;
        var anyLoading = false, anySoon = false;
        var refreshEl = el.querySelector('.refresh-label');
        el.innerHTML = Object.keys(SOURCES).map(function(key) {
            var s = SOURCES[key];
            if (s.status === 'loading') anyLoading = true;
            if (s.status === 'soon') anySoon = true;
            return '<div class="source-dot"><div class="dot ' + s.status + '"></div>' + s.label + '</div>';
        }).join('');
        if (refreshEl) el.appendChild(refreshEl);
        // Sync EC logo pulse with source activity
        var ecWrap = ecLogoFill ? ecLogoFill.parentElement : null;
        if (ecWrap) {
            ecWrap.classList.toggle('ec-loading', anyLoading);
            ecWrap.classList.toggle('ec-soon', !anyLoading && anySoon);
        }
    }

    /* ═══ REFRESH PROGRESS — EC LOGO ═══ */
    var ecLogoFill = document.getElementById('ec-logo-fill');

    renderSourceStatus();

    /* ═══ FETCH INFRASTRUCTURE ═══ */
    var isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';

    function getDevCache(key, url, cacheKey) {
        if (!isDev) return null;
        try {
            var k = cacheKey || ('dev:' + key + ':' + url);
            var raw = localStorage.getItem(k);
            if (!raw) return null;
            var entry = JSON.parse(raw);
            var ttl = SOURCES[key] ? SOURCES[key].refresh : 5 * 60 * 1000;
            if (Date.now() - entry.ts > ttl) {
                localStorage.removeItem(k);
                return null;
            }
            return entry.data;
        } catch (e) { return null; }
    }

    function setDevCache(key, url, data, cacheKey) {
        if (!isDev) return;
        try {
            var k = cacheKey || ('dev:' + key + ':' + url);
            localStorage.setItem(k, JSON.stringify({ ts: Date.now(), data: data }));
        } catch (e) {
            // Quota exceeded — clear all dev cache and retry once
            try {
                Object.keys(localStorage).forEach(function(k2) {
                    if (k2.indexOf('dev:') === 0) localStorage.removeItem(k2);
                });
                var k = cacheKey || ('dev:' + key + ':' + url);
                localStorage.setItem(k, JSON.stringify({ ts: Date.now(), data: data }));
            } catch (e2) { /* give up */ }
        }
    }

    // Parse an RSS 2.0 document into the same shape rss2json returns, so loadFeed() can treat both alike.
    function rssToJson(xml) {
        var doc = new DOMParser().parseFromString(xml, 'text/xml');
        if (doc.querySelector('parsererror')) throw new Error('RSS parse error');
        // rss2json emits "YYYY-MM-DD HH:MM:SS" in UTC and timeAgo() relies on that shape, so match it.
        function rssDate(raw) {
            var t = new Date(raw).getTime();
            if (!raw || isNaN(t)) return raw || '';
            var d = new Date(t), p = function(n) { return String(n).padStart(2, '0'); };
            return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
        }
        var items = [];
        doc.querySelectorAll('item').forEach(function(it) {
            function txt(tag) { var el = it.getElementsByTagName(tag)[0]; return el ? el.textContent.trim() : ''; }
            var media = it.getElementsByTagNameNS('*', 'content')[0] || it.getElementsByTagNameNS('*', 'thumbnail')[0];
            var enclosure = it.getElementsByTagName('enclosure')[0];
            var cats = [];
            var catEls = it.getElementsByTagName('category');
            for (var i = 0; i < catEls.length; i++) cats.push(catEls[i].textContent.trim());
            items.push({
                title: txt('title'), link: txt('link'), guid: txt('guid'), description: txt('description'),
                pubDate: rssDate(txt('pubDate') || txt('dc:date')),
                thumbnail: media ? (media.getAttribute('url') || '') : '',
                enclosure: enclosure ? { link: enclosure.getAttribute('url') || '' } : null,
                categories: cats,
            });
        });
        return { status: 'ok', items: items };
    }

    // The proxy that worked last is tried first next time (a dead codetabs otherwise costs 15s per fetch);
    // cleared every 30 min so the primary gets re-probed.
    var lastGoodProxy = null;
    setInterval(function() { lastGoodProxy = null; }, 30 * 60 * 1000);

    async function sourceFetch(sourceKey, url, opts) {
        opts = opts || {};
        var proxy = opts.proxy !== undefined ? opts.proxy : (SOURCES[sourceKey] ? SOURCES[sourceKey].proxy : 'none');
        var parse = opts.parse || 'json';
        var label = SOURCES[sourceKey] ? SOURCES[sourceKey].label : sourceKey;

        // Check dev cache
        var cached = getDevCache(sourceKey, url, opts.cacheKey);
        if (cached !== null) {
            console.log('[' + label + '] cache → hit');
            return cached;
        }

        // Set loading status
        if (!opts.skipStatus) setSource(sourceKey, 'loading');

        // Build fetch options
        var fetchOpts = { cache: 'no-store' };
        if (opts.method) fetchOpts.method = opts.method;
        if (opts.headers) fetchOpts.headers = opts.headers;
        if (opts.body) fetchOpts.body = opts.body;

        async function doFetch(fetchUrl, timeoutMs) {
            var thisOpts = fetchOpts;
            var timer = null;
            if (timeoutMs && window.AbortController) {
                var ctrl = new AbortController();
                thisOpts = Object.assign({}, fetchOpts, { signal: ctrl.signal });
                timer = setTimeout(function() { ctrl.abort(new DOMException('timeout after ' + (timeoutMs / 1000) + 's', 'AbortError')); }, timeoutMs);
            }
            try {
                var resp = await fetch(fetchUrl, thisOpts);
                if (!resp.ok) throw new Error(label + ' HTTP ' + resp.status);
                return parse === 'text' ? await resp.text() : await resp.json();
            } finally {
                if (timer) clearTimeout(timer);
            }
        }

        var data;
        if (proxy === 'rss2json') {
            data = await doFetch(CONFIG.rssApi + encodeURIComponent(url));
        } else if (proxy === 'rss') {
            parse = 'text';
            data = rssToJson(await doFetch(url));
        } else if (proxy === 'cors') {
            var lastErr = null;
            // opts.proxyOrder = ['allorigins', 'codetabs'] picks and orders proxies for sources with special needs
            var proxies = opts.proxyOrder
                ? opts.proxyOrder.map(function(n) { return CONFIG.corsProxies.filter(function(p) { return p.name === n; })[0]; }).filter(Boolean)
                : CONFIG.corsProxies.filter(function(p) { return !p.onRequest; });
            if (!opts.proxyOrder && lastGoodProxy) {
                proxies = proxies.filter(function(p) { return p.name === lastGoodProxy; })
                    .concat(proxies.filter(function(p) { return p.name !== lastGoodProxy; }));
            }
            for (var pi = 0; pi < proxies.length; pi++) {
                var px = proxies[pi];
                try {
                    data = await doFetch(px.url(url), CONFIG.proxyTimeout);
                    lastErr = null;
                    if (!opts.proxyOrder) lastGoodProxy = px.name;
                    break;
                } catch (e) {
                    lastErr = e;
                    console.log('[' + label + '] ' + px.name + ' failed (' + e.message + ')' + (pi + 1 < proxies.length ? ' → next proxy' : ''));
                }
            }
            if (lastErr) throw lastErr;
        } else {
            data = await doFetch(url);
        }

        // Store in dev cache
        setDevCache(sourceKey, url, data, opts.cacheKey);

        return data;
    }

    /* ═══ HELPERS ═══ */
    var dayN = ['s\u00f8ndag','mandag','tirsdag','onsdag','torsdag','fredag','l\u00f8rdag'];
    var monN = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];
    var monShort = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];

    // Single parse for every pubDate in the app. rss2json reports UTC without a zone marker
    // ("2026-09-09 17:23:19"), which the browser would otherwise read as local time — that made the
    // feed sort rank news two hours older than the age label showed, so police and the synthetic
    // cards outranked fresher stories. Sorting and display must go through the same function.
    function parseDate(dateStr) {
        if (!dateStr) return NaN;
        var raw = String(dateStr);
        var d = raw;
        if (!/[Z+\-]\d/.test(d.slice(-6)) && d.slice(-1) !== 'Z') d += 'Z';
        var t = new Date(d).getTime();
        return isNaN(t) ? new Date(raw).getTime() : t;   // RFC 822 and friends: parse as given
    }

    function timeAgo(dateStr) {
        var diff = Date.now() - parseDate(dateStr);
        var mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Akkurat n\u00e5';
        if (mins < 60) return mins + ' min siden';
        var hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + ' t siden';
        return Math.floor(hrs / 24) + ' d siden';
    }

    // Thousands grouped with a space, Norwegian style: 3 776
    function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

    function escapeHtml(str) {
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    // Line icons per incident category, stroked in the police blue on the card plate. Six of the twelve
    // categories the log actually uses had no emoji before, so most incidents fell back to the beacon and the
    // picture looked arbitrary. Stroke width, colour and size come from CSS; these are just the shapes.
    var POLICE_ICON_PATHS = {
        'Trafikk':         '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 002 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
        'Ulykke':          '<path d="M2.5 12h4.2M5 9.6L7.4 12 5 14.4"/><path d="M21.5 12h-4.2M19 9.6L16.6 12 19 14.4"/><circle cx="12" cy="12" r="1.7"/><path d="M12 6.2v2.1M12 15.7v2.1M8.8 8.2l1.5 1.5M15.2 8.2l-1.5 1.5M8.8 15.8l1.5-1.5M15.2 15.8l-1.5-1.5"/>',
        'Brann':           '<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 002.5 2.5z"/>',
        'Voldshendelse':   '<path d="M12 3l7 2.5v5.8c0 4.2-2.9 7.9-7 9.4-4.1-1.5-7-5.2-7-9.4V5.5L12 3z"/><path d="M12 8.8v4"/><circle cx="12" cy="15.9" r=".95" fill="currentColor" stroke="none"/>',
        'Tyveri':          '<path d="M4.2 8.6h15.6l-1.2 11.1a1.5 1.5 0 01-1.5 1.3H6.9a1.5 1.5 0 01-1.5-1.3L4.2 8.6z"/><path d="M8.9 8.6V6.8a3.1 3.1 0 016.2 0v1.8"/>',
        'Innbrudd':        '<rect x="4.8" y="10.8" width="14.4" height="10.2" rx="2"/><path d="M8.6 10.8V7.4a3.4 3.4 0 016.2-1.9"/>',
        'Skadeverk':       '<rect x="4" y="4" width="16" height="16" rx="1.8"/><path d="M12 10.8L8.2 4.4M12 10.8l7.6-1.9M12 10.8l-7.7 4.1M12 10.8l2.4 8.7M12 10.8l6.8 6.1"/><circle cx="12" cy="10.8" r=".9" fill="currentColor" stroke="none"/>',
        'Sj\u00F8':             '<path d="M4 14.6h16l-2.1 4a2 2 0 01-1.8 1.1H7.9a2 2 0 01-1.8-1.1l-2.1-4z"/><path d="M12 14.6V3.8l6.2 6.2H12"/>',
        'Savnet':          '<circle cx="10.6" cy="10.6" r="6.1"/><path d="M15 15l5.4 5.4"/><circle cx="10.6" cy="8.8" r="1.6"/><path d="M7.9 14.1a3 3 0 015.4 0"/>',
        'Redning':         '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="3.4"/><path d="M12 3.6v5M12 15.4v5M3.6 12h5M15.4 12h5"/>',
        'Ro og orden':     '<path d="M4.2 9.8h3.1l4.6-3.6v11.6l-4.6-3.6H4.2v-4.4z"/><path d="M15.4 9.4a4 4 0 010 5.2M18 6.9a7.6 7.6 0 010 10.2"/>',
        'Andre hendelser': '<rect x="5.6" y="4.6" width="12.8" height="15.8" rx="1.7"/><path d="M9.4 9.2h5.2M9.4 12.6h5.2M9.4 16h3.1"/>',
        _fallback:         '<path d="M7.6 20.4h8.8"/><rect x="6.8" y="12.6" width="10.4" height="5.6" rx="1.4"/><path d="M9.6 12.6v-2.3a2.4 2.4 0 014.8 0v2.3"/><path d="M12 5.6V3.4M6.4 7.9L5 6.5M17.6 7.9L19 6.5"/>',
    };
    var POLICE_ICON_ALIAS = { 'Trafikkulykke': 'Ulykke', 'Arbeidsulykke': 'Ulykke', 'Ran': 'Tyveri', 'Trusler': 'Voldshendelse' };
    // The two names too long for a 180px plate; the rest fit as they are
    var POLICE_CAT_SHORT = { 'Voldshendelse': 'Vold', 'Andre hendelser': 'Annet' };

    // Icon plus the category name, so the headline can be just the place ("Stavanger, Madlalia")
    function policeIcon(category) {
        var key = POLICE_ICON_ALIAS[category] || category;
        return '<svg class="police-icon" viewBox="0 0 24 24" aria-hidden="true">' +
            (POLICE_ICON_PATHS[key] || POLICE_ICON_PATHS._fallback) + '</svg>' +
            '<span class="police-cat">' + escapeHtml(POLICE_CAT_SHORT[category] || category || 'Hendelse') + '</span>';
    }

    /* ═══ CLOCK ═══ */
    function updateClock() {
        var now = new Date();
        document.getElementById('clock-h').textContent = String(now.getHours()).padStart(2,'0');
        document.getElementById('clock-m').textContent = String(now.getMinutes()).padStart(2,'0');
        document.getElementById('clock-s').textContent = String(now.getSeconds()).padStart(2,'0');
        var d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        var ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        var wk = Math.ceil(((d - ys) / 86400000 + 1) / 7);
        document.getElementById('clock-date').textContent = dayN[now.getDay()] + ' ' + now.getDate() + '. ' + monShort[now.getMonth()] + ' \u00b7 Uke ' + wk;
    }
    setInterval(updateClock, 1000);
    updateClock();

    var refreshLabelEl = document.getElementById('clock-last-refresh');
    var feedCycleStart = Date.now();

    function resetFeedCycle() { feedCycleStart = Date.now(); }

    function updateRefreshRing() {
        if (!ecLogoFill) return;
        var elapsed = Date.now() - feedCycleStart;
        var remaining = CONFIG.feedRefresh - elapsed;
        if (remaining <= 0) remaining = 0;
        var progress = Math.min(elapsed / CONFIG.feedRefresh, 1);
        var angle = progress * 360;
        ecLogoFill.style.setProperty('--progress', angle + 'deg');
        // Countdown text
        var secs = Math.ceil(remaining / 1000);
        var mins = Math.floor(secs / 60);
        var s = secs % 60;
        var time = mins > 0 ? mins + ':' + String(s).padStart(2, '0') : secs + 's';
        refreshLabelEl.innerHTML = '<span class="refresh-prefix">news refresh in </span>' + time;
    }
    setInterval(updateRefreshRing, 1000);
    updateRefreshRing();

    function formatTimeCats(item) {
        var parts = [];
        if (item.categories && item.categories.length) {
            item.categories.forEach(function(c) { parts.push(escapeHtml(c)); });
        }
        if (item.pubDate) parts.push(timeAgo(item.pubDate));
        return parts.join(' <span class="meta-sep">\u00b7</span> ');
    }

    /* ═══ NEWS FEED ═══ */
    var heroEl = document.getElementById('hero-story');
    var feedItems = [];
    var currentHeroTitle = '';
    var heroItems = [];
    var heroIndex = 0;
    var rawFeeds = {};
    Object.keys(CONFIG.feeds).forEach(function(k) { rawFeeds[k] = []; });
    rawFeeds.trafikk = [];
    rawFeeds.sykkel = [];
    rawFeeds.politi = [];
    rawFeeds.magasin = [];
    rawFeeds.lunch = [];
    rawFeeds.paadag = [];

    function renderHero(item) {
        if (!item) return;
        if (item.title === currentHeroTitle) return;
        currentHeroTitle = item.title;

        var meta = FEED_META[item.source];
        var colorClass = meta ? meta.color : '';
        var badgeText = meta ? meta.label : 'Siste nytt';
        var isSpark = item.image && item.image.indexOf('spark:') === 0;
        var noImgCls = meta && meta.heroNoImgClass ? ' ' + meta.heroNoImgClass : '';
        var noImgContent = meta && meta.noImg ? meta.noImg(item) : '\u{1F4F0}';
        var isComic = item.image && item.image.indexOf('comic:') === 0;
        var imgContent = isComic
            ? buildComicCard(item.image.slice(6))
            : isSpark
                ? getSparkCard(item.image.slice(6), 'large')
                : item.image
                    ? '<img src="' + escapeHtml(item.image) + '" alt="">'
                    : '<div class="hero-no-img' + noImgCls + '">' + noImgContent + '</div>';
        var customBadge = meta && meta.topBadge ? meta.topBadge(item) : null;
        var topBadgeText = customBadge ? customBadge.text : 'TOPP';
        var topBadgeClass = customBadge ? customBadge.cls : 'hero-top-badge';

        var heroTapeClass = meta && meta.cardClass ? ' ' + meta.cardClass : '';
        var html =
            '<div class="hero-img-wrap">' +
                '<div class="hero-badges"><div class="hero-badge ' + colorClass + '">' + badgeText + '</div>' +
                '<div class="' + topBadgeClass + '">' + topBadgeText + '</div></div>' +
                imgContent +
            '</div>' +
            '<div class="hero-text"' + (colorClass ? ' style="--hero-src: var(--' + colorClass + ')"' : '') + '>' +
                '<div class="hero-title">' + escapeHtml(item.title) + '</div>' +
                (item.descHtml ? '<div class="hero-desc">' + item.descHtml + '</div>' : item.desc ? '<div class="hero-desc">' + escapeHtml(item.desc) + '</div>' : '') +
                '<div class="hero-time">' + formatTimeCats(item) + '</div>' +
            '</div>';

        var cards = heroEl.querySelectorAll('.hero-card');
        var newCard = document.createElement('div');
        newCard.className = 'hero-card' + heroTapeClass;
        newCard.innerHTML = html;
        heroEl.insertBefore(newCard, heroEl.querySelector('.hero-divider'));
        void newCard.offsetWidth;

        // Today's strip may not be published yet (or it is a weekend); step back a day at a time.
        var comicImg = newCard.querySelector('.comic-img');
        if (comicImg) comicImg.onerror = comicStepBack;

        // Shrink the hero description a little if it overflows, but keep it readable from across the room;
        // whatever still doesn't fit fades out at the bottom instead of being cut mid-line.
        var heroDesc = newCard.querySelector('.hero-desc');
        if (heroDesc) {
            var fontSize = 1.6;
            var minSize = 1.3;
            var step = 0.05;
            while (fontSize > minSize && heroDesc.scrollHeight > heroDesc.clientHeight + 2) {
                fontSize -= step;
                heroDesc.style.fontSize = fontSize + 'rem';
            }
            if (heroDesc.scrollHeight > heroDesc.clientHeight + 2) heroDesc.classList.add('clipped');
        }

        newCard.classList.add('active');

        for (var i = 0; i < cards.length; i++) {
            cards[i].classList.remove('active');
            cards[i].classList.add('exit');
        }
        setTimeout(function() {
            var old = heroEl.querySelectorAll('.hero-card.exit');
            for (var j = 0; j < old.length; j++) { old[j].parentNode.removeChild(old[j]); }
        }, 800);
    }

    var heroTabsBar = document.getElementById('hero-tabs-bar');

    function renderHeroProgress() {
        heroTabsBar.innerHTML = '';
        if (heroItems.length <= 1) return;
        var dur = (CONFIG.heroInterval / 1000) + 's';
        var len = heroItems.length;
        for (var n = 0; n < len; n++) {
            var idx = (heroIndex + n) % len;
            var item = heroItems[idx];
            var meta = FEED_META[item.source];
            var label = meta ? meta.label : 'Nyheter';
            var colorClass = meta ? meta.color : '';
            var srcColor = colorClass ? getComputedStyle(document.documentElement).getPropertyValue('--' + colorClass).trim() : '#e8a83e';
            var tab = document.createElement('div');
            tab.className = 'hero-tab';
            if (n === 0) tab.classList.add('active');
            var fill = document.createElement('div');
            fill.className = 'hero-tab-fill';
            fill.style.background = srcColor;
            if (n === 0) fill.style.animationDuration = dur;
            var lbl = document.createElement('span');
            lbl.className = 'hero-tab-label';
            lbl.textContent = label;
            tab.appendChild(fill);
            tab.appendChild(lbl);
            heroTabsBar.appendChild(tab);
        }
    }


    var feedQueue = [];
    var feedQueueIndex = 0;

    function buildArticleEl(item, isLatest) {
        var meta = FEED_META[item.source];
        var colorClass = meta ? meta.color : '';
        var div = document.createElement('div');
        var extraCardClass = meta && meta.cardClass ? ' ' + meta.cardClass : '';
        div.className = 'article' + (isLatest ? ' article-latest ' + colorClass : '') + extraCardClass;
        div.setAttribute('data-source', item.source);
        div.setAttribute('data-title', item.title);
        var isSpark = item.image && item.image.indexOf('spark:') === 0;
        var noImgCls = meta && meta.noImgClass ? ' ' + meta.noImgClass : '';
        var noImgContent = meta && meta.noImg ? meta.noImg(item) : '\u{1F4F0}';
        var imgHtml = isSpark
            ? '<div class="article-img">' + getSparkCard(item.image.slice(6)) + '</div>'
            : item.image
                ? '<div class="article-img"><img src="' + escapeHtml(item.image) + '" alt="" loading="lazy"></div>'
                : '<div class="article-img no-image' + noImgCls + '">' + noImgContent + '</div>';
        var nyBadge = isLatest ? '<div class="article-ny">NY</div>' : '';
        var imgWithBadge = '<div class="article-img-wrap">' +
                imgHtml +
                '<div class="article-badges"><div class="article-source-overlay ' + colorClass + '">' + (meta ? meta.label : 'Nyheter') + '</div>' + nyBadge + '</div>' +
            '</div>';
        var statusBadgeHtml = meta && meta.statusBadge ? meta.statusBadge(item) : '';
        div.innerHTML =
            '<div class="article-body">' +
                imgWithBadge +
                statusBadgeHtml +
                '<div class="article-text">' +
                    '<div class="article-title">' + escapeHtml(item.title) + '</div>' +
                    (item.descHtml ? '<div class="article-desc">' + item.descHtml + '</div>' : item.desc ? '<div class="article-desc">' + escapeHtml(item.desc) + '</div>' : '') +
                    '<div class="article-time">' + formatTimeCats(item) + '</div>' +
                '</div>' +
            '</div>';
        return div;
    }

    var feedCols = [document.getElementById('feed-col-0'), document.getElementById('feed-col-1')];
    var nextCol = 0;

    function trimFeedOverflow() {
        feedCols.forEach(function(col) {
            var articles = col.querySelectorAll('.article');
            while (articles.length > 6) {
                articles[articles.length - 1].remove();
                articles = col.querySelectorAll('.article');
            }
        });
    }

    function renderFeed(items) {
        feedQueue = items.slice();
        if (feedQueueIndex >= feedQueue.length) feedQueueIndex = 0;
    }

    function scrollFeed() {
        if (!feedQueue.length) return;
        // Find next article not already in either column
        var existing = {};
        feedCols.forEach(function(col) {
            col.querySelectorAll('.article').forEach(function(el) {
                existing[el.getAttribute('data-title')] = true;
            });
        });
        var startIdx = feedQueueIndex;
        var item = null;
        do {
            var candidate = feedQueue[feedQueueIndex];
            feedQueueIndex = (feedQueueIndex + 1) % feedQueue.length;
            if (!existing[candidate.title]) { item = candidate; break; }
        } while (feedQueueIndex !== startIdx);
        if (!item) return;
        // Check if this article is the newest from its source (first occurrence in feedQueue)
        var isNewest = true;
        for (var qi = 0; qi < feedQueue.length; qi++) {
            if (feedQueue[qi].source === item.source) {
                if (feedQueue[qi].title !== item.title) isNewest = false;
                break;
            }
        }
        if (isNewest) {
            // Search both columns for old badge
            feedCols.forEach(function(col) {
                var oldLatest = col.querySelector('.article-latest[data-source="' + item.source + '"]');
                if (oldLatest) {
                    oldLatest.classList.remove('article-latest');
                    var oldBadge = oldLatest.querySelector('.article-ny');
                    if (oldBadge) oldBadge.remove();
                }
            });
        }
        var col = feedCols[nextCol];
        nextCol = (nextCol + 1) % 2;
        var el = buildArticleEl(item, isNewest);
        // Start collapsed and invisible
        el.style.maxHeight = '0';
        el.style.opacity = '0';
        el.style.overflow = 'hidden';
        el.style.padding = '0 10px';
        col.insertBefore(el, col.firstChild);
        void el.offsetWidth;
        // Expand to full height, then fade in content
        el.style.transition = 'max-height 0.6s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s ease 0.3s, padding 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
        el.style.maxHeight = '400px';
        el.style.opacity = '1';
        el.style.padding = '10px';
        // Clean up inline styles after animation
        setTimeout(function() {
            el.style.transition = '';
            el.style.maxHeight = '';
            el.style.overflow = '';
            trimFeedOverflow();
        }, 900);
    }

    function mergeFeedsAndRender() {
        var merged = [];
        Object.keys(rawFeeds).forEach(function(key) { merged = merged.concat(rawFeeds[key]); });
        merged.sort(function(a, b) { return (parseDate(b.pubDate) || 0) - (parseDate(a.pubDate) || 0); });

        // Hero: newest article from each source (before dedup so NTB dupes don't steal slots)
        heroItems = [];
        var heroSeen = {};
        var heroTitles = {};
        var heroSkip = { sykkel: 1 };
        // A 180px thumbnail of a comic strip is unreadable, so it stays out of the two-column feed

        for (var h = 0; h < merged.length && heroItems.length < CONFIG.heroCount; h++) {
            var src = merged[h].source || '';
            if (heroSkip[src] || heroSeen[src]) continue;
            var heroKey = merged[h].title.toLowerCase().trim().replace(/[\s\u2013\u2014\-–—:]+/g, ' ');
            if (heroTitles[heroKey]) continue;
            heroSeen[src] = true;
            heroTitles[heroKey] = true;
            heroItems.push(merged[h]);
        }
        // The comic is only readable at hero size, so it always gets a slot even when the news is fresher
        Object.keys(HERO_PIN).forEach(function(src) {
            if (heroSeen[src] || !rawFeeds[src] || !rawFeeds[src].length) return;
            heroSeen[src] = true;
            heroItems.push(rawFeeds[src][0]);
        });

        // Deduplicate by normalized title for feed + ticker
        var seen = {};
        var all = [];
        for (var i = 0; i < merged.length; i++) {
            var key = merged[i].title.toLowerCase().trim().replace(/[\s\u2013\u2014\-–—:]+/g, ' ');
            if (seen[key]) continue;
            seen[key] = true;
            all.push(merged[i]);
        }
        if (!all.length) return;

        // Feed: interleave sources for variety
        var heroSet = {};
        heroItems.forEach(function(item) { heroSet[item.title.toLowerCase().trim()] = true; });
        var remaining = all.filter(function(item) {
            return !heroSet[item.title.toLowerCase().trim()] && !FEED_SKIP[item.source || ''];
        });
        var bySource = {};
        remaining.forEach(function(item) {
            var s = item.source || 'unknown';
            if (!bySource[s]) bySource[s] = [];
            bySource[s].push(item);
        });
        var sources = Object.keys(bySource);
        feedItems = [];
        var si = 0;
        while (sources.length) {
            var s = sources[si % sources.length];
            if (bySource[s].length) {
                feedItems.push(bySource[s].shift());
            } else {
                sources.splice(si % sources.length, 1);
                if (!sources.length) break;
            }
            si++;
        }
        if (heroIndex >= heroItems.length) heroIndex = 0;
        renderHero(heroItems[heroIndex]);
        renderHeroProgress();
        renderFeed(feedItems);
        scheduleTickerRebuild();
        // Reset refresh ring when a new cycle completes (>80% of interval elapsed)
        if (Date.now() - feedCycleStart > CONFIG.feedRefresh * 0.8) {
            resetFeedCycle();
        }
    }

    // NRK Rogaland overlaps with the national NRK feed: the national feed wins, Rogaland keeps only its own stories.
    function normLink(u) { return String(u).replace(/^https?:\/\//, '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase(); }
    function dropNrkOverlap(type) {
        if (type !== 'news' && type !== 'rogaland') return;
        if (!rawFeeds.news || !rawFeeds.rogaland) return;
        var national = {};
        rawFeeds.news.forEach(function(a) { if (a.link) national[a.link] = true; });
        var before = rawFeeds.rogaland.length;
        rawFeeds.rogaland = rawFeeds.rogaland.filter(function(a) { return !national[a.link]; });
        if (rawFeeds.rogaland.length !== before) console.log('[NRK Rogaland] ' + (before - rawFeeds.rogaland.length) + ' duplicates of NRK dropped');
    }

    async function loadFeed(type) {
        var meta = FEED_META[type];
        var srcKey = meta ? meta.srcKey : type;
        try {
            var data = await sourceFetch(srcKey, CONFIG.feeds[type]);
            if (data.status !== 'ok' || !data.items || !data.items.length) throw new Error('No items in feed: ' + type);
            var skipCats = {'nyheter':1,'news':1,'ukategorisert':1,'uncategorized':1,'allmennt':1};
            rawFeeds[type] = data.items.slice(0, 15).map(function(item) {
                var cats = (item.categories || [])
                    .filter(function(c) { return c && !skipCats[c.toLowerCase().trim()]; })
                    .slice(0, 3);
                var title = (item.title || '').replace(/^\[.*?\]\s*/, '');
                var image = item.thumbnail || (item.enclosure && item.enclosure.link) || null;
                if (!image && type === 'strompris') image = 'spark:strom';
                return {
                    title: title,
                    desc: (item.description || '').replace(/<[^>]*>/g, ''),
                    pubDate: item.pubDate || '',
                    image: image,
                    source: type,
                    categories: cats,
                    link: normLink(item.link || item.guid || ''),
                };
            }).filter(function(a) { return a.title; });

            // Low-volume feeds (NRK Rogaland spans ~5 days in 20 items) otherwise put days-old cards on the
            // screen. Drop the stale tail, but always keep a few so a slow source still gets its turn.
            rawFeeds[type].sort(function(a, b) { return (parseDate(b.pubDate) || 0) - (parseDate(a.pubDate) || 0); });
            var itemCutoff = Date.now() - CONFIG.maxItemAgeHours * 3600e3;
            var kept = rawFeeds[type].filter(function(it, i) {
                return i < CONFIG.minItemsPerSource || !(parseDate(it.pubDate) < itemCutoff);
            });
            if (kept.length !== rawFeeds[type].length) {
                console.log('[' + (meta ? meta.label : type) + '] ' + (rawFeeds[type].length - kept.length) +
                    ' items older than ' + CONFIG.maxItemAgeHours + 'h dropped');
            }
            rawFeeds[type] = kept;
            dropNrkOverlap(type);
            console.log('[' + (meta ? meta.label : type) + '] rss2json \u2192 ' + rawFeeds[type].length + ' items');
            mergeFeedsAndRender();
            setSource(srcKey, 'ok');
        } catch (err) {
            console.log('[' + (meta ? meta.label : type) + '] rss2json \u2192 ERROR ' + err.message);
            setSource(srcKey, 'error');
        }
    }

    // Set all sources to loading on page load
    Object.keys(SOURCES).forEach(function(key) { setSource(key, 'loading'); });

    // Stagger initial loads to avoid API rate limits
    var feedKeys = Object.keys(CONFIG.feeds);
    feedKeys.forEach(function(key, i) {
        setTimeout(function() { loadFeed(key); }, i * 2000);
        setInterval(function() { loadFeed(key); }, CONFIG.feedRefresh);
    });
    window._feedTimer = setInterval(scrollFeed, CONFIG.feedScrollInterval);
    window._heroTimer = setInterval(function() {
        if (heroItems.length <= 1) return;
        heroIndex = (heroIndex + 1) % heroItems.length;
        renderHero(heroItems[heroIndex]);
        renderHeroProgress();
    }, CONFIG.heroInterval);

    /* ═══ IMAGE SLIDESHOW ═══ */
    var slideImages = [];
    var diEl = document.getElementById('daily-images');
    var diIndex = 0;
    var diCaption, diDots;

    function buildSlideshow(images) {
        slideImages = images;
        diEl.innerHTML = '';
        diIndex = 0;
        images.forEach(function(img, i) {
            var div = document.createElement('div');
            div.className = 'di-slide ' + (i % 2 === 0 ? 'kb-a' : 'kb-b') + (i === 0 ? ' active' : '') + (img.contain ? ' contain' : '');
            var el = document.createElement('img');
            el.src = img.live ? img.src + (img.src.indexOf('?') >= 0 ? '#' : '?t=') + Date.now() : img.src;
            el.alt = img.caption; el.loading = i < 2 ? 'eager' : 'lazy';
            div.appendChild(el);
            diEl.appendChild(div);
        });
        diCaption = document.createElement('div');
        diCaption.className = 'di-caption';
        diCaption.textContent = images[0].caption;
        diEl.appendChild(diCaption);
        diDots = document.createElement('div');
        diDots.className = 'di-dots';
        images.forEach(function(_, i) {
            var d = document.createElement('div');
            d.className = 'di-dot' + (i === 0 ? ' active' : '');
            diDots.appendChild(d);
        });
        diEl.appendChild(diDots);
    }

    function cycleSlide() {
        if (window.InfoScreen && window.InfoScreen.pauseSlideshow) return;   // slot taken over (simen.js)
        if (slideImages.length <= 1) return;
        var slides = diEl.querySelectorAll('.di-slide');
        var dots = diEl.querySelectorAll('.di-dot');
        if (!slides.length) return;
        slides[diIndex].classList.remove('active');
        dots[diIndex].classList.remove('active');
        diIndex = (diIndex + 1) % slideImages.length;
        var ns = slides[diIndex];
        // Refresh live images (webcams, radar) with cache-buster
        if (slideImages[diIndex].live) {
            var img = ns.querySelector('img');
            var bust = slideImages[diIndex].src.indexOf('?') >= 0 ? '#' : '?t=';
            img.src = slideImages[diIndex].src + bust + Date.now();
        }
        ns.classList.remove('kb-a', 'kb-b');
        void ns.offsetWidth;
        ns.classList.add(diIndex % 2 === 0 ? 'kb-a' : 'kb-b');
        ns.classList.add('active');
        dots[diIndex].classList.add('active');
        diCaption.textContent = slideImages[diIndex].caption;
    }

    async function loadImages() {
        setSource('bilder', 'loading');
        var bingImgs = [];
        var liveImgs = [];
        try {
            var data = await sourceFetch('bilder', 'https://www.bing.com/HPImageArchive.aspx?format=rss&idx=0&n=3&mkt=en-US', { skipStatus: true });
            if (data.status === 'ok' && data.items && data.items.length) {
                data.items.forEach(function(item) {
                    var caption = (item.title || 'Bing').split('(')[0].trim();
                    var imgUrl = (item.link || item.thumbnail || '').replace('http://', 'https://');
                    if (imgUrl) {
                        bingImgs.push({ src: imgUrl, caption: caption, live: false });
                    }
                });
            }
        } catch (e) { console.log('[' + SOURCES.bilder.label + '] rss2json \u2192 ERROR ' + e.message); }
        // Latest xkcd, letterboxed (comics are tall and white). RSS via rss2json first, JSON via the proxies as fallback.
        var xkcdImg = null;
        try {
            var xk = await sourceFetch('bilder', 'https://xkcd.com/rss.xml', { skipStatus: true, cacheKey: 'dev:xkcd:rss' });
            var xkItem = xk && xk.status === 'ok' && xk.items && xk.items[0];
            var xkMatch = xkItem && /<img[^>]+src="([^"]+)"/i.exec(xkItem.description || '');
            if (xkMatch) xkcdImg = { src: xkMatch[1].replace('http://', 'https://'), caption: 'xkcd \u00b7 ' + (xkItem.title || ''), live: false, contain: true };
        } catch (e) { console.log('[' + SOURCES.bilder.label + '] xkcd rss \u2192 ERROR ' + e.message); }
        if (!xkcdImg) {
            try {
                var xj = await sourceFetch('bilder', 'https://xkcd.com/info.0.json', { proxy: 'cors', skipStatus: true, cacheKey: 'dev:xkcd:json' });
                if (xj && xj.img) xkcdImg = { src: xj.img.replace('http://', 'https://'), caption: 'xkcd \u00b7 ' + (xj.safe_title || xj.title || ''), live: false, contain: true };
            } catch (e) { console.log('[' + SOURCES.bilder.label + '] xkcd json \u2192 ERROR ' + e.message); }
        }
        // Radar + webcams
        liveImgs.push({
            src: 'https://api.met.no/weatherapi/radar/2.0/?type=reflectivity&area=southwestern_norway&content=animation',
            caption: 'Nedb\u00f8rsradar \u2014 S\u00f8rvestlandet',
            live: true,
        });
        CONFIG.webcams.forEach(function(wc) {
            liveImgs.push({ src: wc.src, caption: wc.caption, live: true });
        });
        // Distribute Bing images evenly among live images
        var images = [];
        var gap = bingImgs.length > 0 ? Math.floor(liveImgs.length / bingImgs.length) : liveImgs.length;
        if (gap < 1) gap = 1;
        var bi = 0;
        for (var li = 0; li < liveImgs.length; li++) {
            images.push(liveImgs[li]);
            if (bi < bingImgs.length && (li + 1) % gap === 0) {
                images.push(bingImgs[bi++]);
            }
        }
        while (bi < bingImgs.length) images.push(bingImgs[bi++]);
        if (xkcdImg) images.push(xkcdImg);
        if (images.length) {
            console.log('[' + SOURCES.bilder.label + '] rss2json \u2192 ' + images.length + ' images');
            buildSlideshow(images);
            setSource('bilder', 'ok');
        } else {
            console.log('[' + SOURCES.bilder.label + '] rss2json \u2192 ERROR no images');
            setSource('bilder', 'error');
        }
    }

    setInterval(cycleSlide, CONFIG.slideInterval);

    /* ═══ EVENTS (scraped from venue sites) ═══ */
    var eventsEl = document.getElementById('events-list');

    var FALLBACK_EVENTS = [
        { icon: '\uD83C\uDFB5', rawDate: '', title: 'Henter arrangementer...', venue: 'Stavanger' },
    ];

    var FOLKEN_MONTHS = {
        'January':'01','February':'02','March':'03','April':'04',
        'May':'05','June':'06','July':'07','August':'08',
        'September':'09','October':'10','November':'11','December':'12',
    };

    function folkenIcon(type) {
        if (type === 'Comedy') return '\uD83C\uDFAD';
        if (type === 'Quiz') return '\uD83E\uDDE9';
        if (type === 'Teater') return '\uD83C\uDFAD';
        if (type === 'Film') return '\uD83C\uDFAC';
        return '\uD83C\uDFB5';
    }

    function formatEventDate(isoDate) {
        if (!isoDate) return { label: '', isToday: false };
        var datePart = isoDate.split('T')[0];
        var timePart = isoDate.split('T')[1] || '';
        var time = timePart ? timePart.substring(0, 5) : '';
        var p = datePart.split('-');
        var day = parseInt(p[2]);
        var mon = parseInt(p[1]) - 1;
        var todayStr = localIsoMin(new Date()).substring(0, 10);   // local date, not UTC
        var isToday = datePart === todayStr;
        var dateStr = day + '. ' + monN[mon].substring(0, 3);
        return { label: isToday ? time : dateStr, time: time, isToday: isToday };
    }

    function parseFolkenDate(dateText, timeText) {
        var parts = dateText.trim().split(/\s+/);
        if (parts.length < 2) return '';
        var day = parts[0].padStart(2, '0');
        var mon = FOLKEN_MONTHS[parts[1]] || '01';
        var year = new Date().getFullYear();
        var time = timeText || '00:00';
        return year + '-' + mon + '-' + day + 'T' + time;
    }

    function buildEventHtml(ev) {
        var iconHtml = ev.image
            ? '<img src="' + escapeHtml(ev.image) + '" alt="">'
            : ev.icon;
        var d = formatEventDate(ev.rawDate);
        var dateHtml;
        if (d.isToday) {
            dateHtml = '<span class="event-today-tag">I DAG</span>' +
                (d.time && d.time !== '00:00' ? ' <span class="event-time">' + d.time + '</span>' : '');
        } else {
            dateHtml = '<span class="event-date">' + escapeHtml(d.label) + '</span>' +
                (d.time && d.time !== '00:00' ? ' <span class="event-time">' + d.time + '</span>' : '');
        }
        return '<div class="event-item">' +
            '<div class="event-icon">' + iconHtml + '</div>' +
            '<div class="event-info">' +
                '<div class="event-title">' + escapeHtml(ev.title) + '</div>' +
                '<div class="event-bottom">' +
                    '<div class="event-meta">' + escapeHtml(ev.venue) + '</div>' +
                    '<div class="event-date-wrap">' + dateHtml + '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    var eventsPulseTimer = null;

    function setupEventsPulse(pauseTime, totalTime) {
        if (eventsPulseTimer) clearInterval(eventsPulseTimer);
        var startTime = Date.now();
        var totalMs = totalTime * 1000;
        var pauseMs = pauseTime * 1000;
        var pulseLeadIn = pauseMs;
        eventsPulseTimer = setInterval(function() {
            var cyclePos = (Date.now() - startTime) % totalMs;
            var shouldPulse = cyclePos > (pauseMs - pulseLeadIn) && cyclePos < pauseMs;
            eventsEl.classList.toggle('peek', shouldPulse);
        }, 500);
    }

    function renderEvents(events) {
        eventsEl.innerHTML = '';
        if (!events.length) {
            eventsEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.85rem;">Ingen kommende arrangementer</div>';
            return;
        }
        var html = events.map(buildEventHtml).join('');
        // If more events than visible, duplicate for seamless loop
        if (events.length > 5) {
            var inner = document.createElement('div');
            inner.className = 'events-scroll';
            var sep = '<div class="events-sep"><span></span><span></span><span></span></div>';
            inner.innerHTML = html + sep + html + sep;
            var scrollTime = events.length * 4;
            var pauseTime = 20;
            var totalTime = scrollTime + pauseTime;
            var pausePct = (pauseTime / totalTime * 100).toFixed(1);
            // Inject dynamic keyframe with pause at start
            var styleId = 'events-drift-kf';
            var oldStyle = document.getElementById(styleId);
            if (oldStyle) oldStyle.remove();
            var style = document.createElement('style');
            style.id = styleId;
            style.textContent = '@keyframes events-drift{0%,' + pausePct + '%{transform:translate3d(0,0,0)}100%{transform:translate3d(0,-50%,0)}}';
            document.head.appendChild(style);
            inner.style.animationDuration = totalTime + 's';
            eventsEl.appendChild(inner);
            // Pulse indicator at bottom during pause window
            setupEventsPulse(pauseTime, totalTime);
        } else {
            eventsEl.innerHTML = html;
        }
    }

    async function scrapeKonserthus() {
        var html = await sourceFetch('konserthus', 'https://www.stavanger-konserthus.no/program/', { parse: 'text', skipStatus: true });
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var articles = doc.querySelectorAll('article.event');
        var events = [];
        for (var i = 0; i < articles.length && events.length < 15; i++) {
            var a = articles[i];
            var nameEl = a.querySelector('[itemprop="name"]');
            var dateEl = a.querySelector('[itemprop="startDate"]');
            var venueEl = a.querySelector('[itemprop="location"] [itemprop="name"]');
            if (!nameEl || !dateEl) continue;
            var imgEl = a.querySelector('img[itemprop="image"]');
            var image = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '') : '';
            events.push({
                title: nameEl.textContent.trim(),
                date: dateEl.getAttribute('content') || '',
                venue: venueEl ? venueEl.textContent.trim() : 'Konserthuset',
                icon: '\uD83C\uDFB5',
                image: image,
            });
        }
        return events;
    }

    async function scrapeFolken() {
        var html = await sourceFetch('folken', 'https://www.folken.no/folken/', { parse: 'text', skipStatus: true });
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var items = doc.querySelectorAll('.list-item');
        var events = [];
        for (var i = 0; i < items.length && events.length < 15; i++) {
            var item = items[i];
            var titleEl = item.querySelector('.title a');
            if (!titleEl) continue;
            var type = item.getAttribute('data-type') || '';
            var infoItems = item.querySelectorAll('.info-item');
            var dateText = '', timeText = '';
            for (var j = 0; j < infoItems.length; j++) {
                var txt = infoItems[j].textContent.trim();
                if (/\d{1,2}:\d{2}/.test(txt)) timeText = txt.match(/\d{1,2}:\d{2}/)[0];
                else if (/\d/.test(txt)) dateText = txt;
            }
            var imgDiv = item.querySelector('.image');
            var image = '';
            if (imgDiv) {
                var bgMatch = (imgDiv.getAttribute('style') || '').match(/url\(([^)]+)\)/);
                if (bgMatch) image = bgMatch[1];
            }
            events.push({
                title: titleEl.textContent.trim(),
                date: parseFolkenDate(dateText, timeText),
                venue: 'Folken',
                icon: folkenIcon(type),
                image: image,
            });
        }
        return events;
    }

    function localIsoMin(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
            'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    // Tou: the site's own events endpoint (JSON). Zones are the halls; off-site bookings (e.g. Konserthuset) are skipped.
    async function scrapeTou() {
        var data = await sourceFetch('tou', 'https://www.touofficial.com/api/eventsEdge?', { skipStatus: true });
        if (!Array.isArray(data)) throw new Error('unexpected shape');
        var events = [];
        data.forEach(function(e) {
            var cf = e.custom_fields || {};
            if (cf.published === false || !e.name || !e.start_time) return;
            if (/cancel|avlyst/i.test(cf.eventStatus || '')) return;
            var zone = cf.zone || '';
            if (/konserthus/i.test(zone)) return;
            var d = new Date(e.start_time);
            if (isNaN(d.getTime())) return;
            events.push({
                title: e.name,
                date: localIsoMin(d),
                venue: 'Tou' + (zone ? ' · ' + zone : ''),
                icon: '🎵',
                image: (e.photo && e.photo.urls && (e.photo.urls.small || e.photo.urls.micro)) || '',
            });
        });
        return events;
    }

    // Sølvberget: server-rendered cards, date as Norwegian text ("Mandag 7. september, kl. 10:00, 1. etasje, Allrommet").
    var NO_MONTHS = { januar: '01', februar: '02', mars: '03', april: '04', mai: '05', juni: '06', juli: '07', august: '08', september: '09', oktober: '10', november: '11', desember: '12' };
    async function scrapeSolvberget() {
        var html = await sourceFetch('solvberget', 'https://www.solvberget.no/hva-skjer', { parse: 'text', skipStatus: true });
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var cards = doc.querySelectorAll('a.content-box-card');
        var events = [], now = new Date();
        for (var i = 0; i < cards.length && events.length < 40; i++) {
            var c = cards[i];
            var meta = c.querySelector('p.text-x-small'), h = c.querySelector('h3');
            if (!meta || !h) continue;
            var m = /(\d{1,2})\.\s*([a-zæøå]+),?\s*kl\.?\s*(\d{1,2})[:.](\d{2})(?:,\s*(.*))?/i.exec(meta.textContent.trim());
            if (!m || !NO_MONTHS[m[2].toLowerCase()]) continue;
            var where = (m[5] || '').trim();
            if (/madla|rennesøy|finnøy/i.test(where)) continue;   // branch libraries
            var mon = NO_MONTHS[m[2].toLowerCase()];
            var year = now.getFullYear();
            if (parseInt(mon, 10) < now.getMonth()) year++;         // listing runs into next year
            var img = c.querySelector('img.content-box-image');
            events.push({
                title: h.textContent.trim(),
                date: year + '-' + mon + '-' + m[1].padStart(2, '0') + 'T' + m[3].padStart(2, '0') + ':' + m[4],
                venue: 'Sølvberget',
                icon: '📚',
                image: img ? (img.getAttribute('src') || '') : '',
            });
        }
        return events;
    }

    // DNB Arena: concerts and shows table (Oilers matches live elsewhere and are not listed).
    async function scrapeDnbArena() {
        var html = await sourceFetch('dnbarena', 'https://www.dnbarena.no/events/', { parse: 'text', skipStatus: true });
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var rows = doc.querySelectorAll('tr.event-item');
        var events = [];
        for (var i = 0; i < rows.length && events.length < 30; i++) {
            var r = rows[i], tds = r.querySelectorAll('td'), t = r.querySelector('time[datetime]');
            if (!t || tds.length < 2) continue;
            var ts = parseInt(t.getAttribute('datetime'), 10) * 1000;
            if (!ts) continue;
            var img = tds[0].querySelector('img');
            var cls = r.className || '';
            var icon = /sport|oilers/i.test(cls) ? '🏒' : /show/i.test(cls) ? '🎭' : '🎵';
            events.push({ title: tds[0].textContent.trim(), date: localIsoMin(new Date(ts)), venue: 'DNB Arena', icon: icon, image: img ? (img.getAttribute('src') || '') : '' });
        }
        return events;
    }

    // Stavanger Forum: its own site is dead, but hall bookings for Forum Expo are in the municipal open data
    // (one row per hall per day, so dedupe on name + day). The organiser field can hold private names, so it is not shown.
    async function scrapeForumExpo() {
        var url = 'https://opencom.no/api/3/action/datastore_search?resource_id=064a2552-152f-4b8a-b1cc-c605b1a47553' +
            '&filters=' + encodeURIComponent('{"Sted":"Forum Expo"}') + '&limit=500';
        var data = await sourceFetch('forum', url, { skipStatus: true });
        var recs = (data && data.result && data.result.records) || [];
        var seen = {}, events = [];
        var todayStr = localIsoMin(new Date()).substring(0, 10);
        recs.forEach(function(r) {
            if (!r.Arrangement || !r.Fra) return;
            var day = String(r.Fra).substring(0, 10);
            if (day < todayStr) return;
            var key = String(r.Arrangement).toLowerCase() + '|' + day;
            if (seen[key]) return;
            seen[key] = true;
            events.push({ title: String(r.Arrangement).trim(), date: String(r.Fra).substring(0, 16), venue: 'Stavanger Forum', icon: '🎪', image: '' });
        });
        return events;
    }

    var EVENT_SCRAPERS = { konserthus: scrapeKonserthus, folken: scrapeFolken, tou: scrapeTou, solvberget: scrapeSolvberget, dnbarena: scrapeDnbArena, forum: scrapeForumExpo };
    var MAX_EVENTS = 24, MAX_EVENTS_PER_VENUE = 8;

    async function loadEvents() {
        var srcKeys = Object.keys(EVENT_SCRAPERS);
        srcKeys.forEach(function(k) { setSource(k, 'loading'); });
        try {
            var results = await Promise.allSettled(srcKeys.map(function(k) { return EVENT_SCRAPERS[k](); }));
            var all = [];
            results.forEach(function(r, idx) {
                if (r.status === 'fulfilled') {
                    console.log('[' + SOURCES[srcKeys[idx]].label + '] proxy \u2192 ' + r.value.length + ' events');
                    all = all.concat(r.value.map(function(e) { e.src = srcKeys[idx]; return e; }));
                    setSource(srcKeys[idx], 'ok');
                } else {
                    console.log('[' + SOURCES[srcKeys[idx]].label + '] proxy \u2192 ERROR ' + (r.reason && r.reason.message || r.reason));
                    setSource(srcKeys[idx], 'error');
                }
            });

            if (!all.length) { renderEvents(FALLBACK_EVENTS); return; }

            var now = new Date();
            var nowStr = localIsoMin(now).substring(0, 10);
            var maxDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
            var maxStr = localIsoMin(maxDate).substring(0, 10);
            all = all.filter(function(e) {
                var d = e.date && e.date.substring(0, 10);
                return d && d >= nowStr && d <= maxStr;
            });
            all.sort(function(a, b) { return a.date.localeCompare(b.date); });
            // Cancelled events are noise on a what's-on board; venues also list some events twice
            var seenEv = {};
            all = all.filter(function(e) {
                if (/^avlyst\b/i.test(e.title)) return false;
                var k = e.title.toLowerCase().trim() + '|' + e.date;
                if (seenEv[k]) return false;
                seenEv[k] = true;
                return true;
            });
            // No single venue may crowd out the others (Sølvberget alone has several small events a day)
            var perSrc = {};
            all = all.filter(function(e) { perSrc[e.src] = (perSrc[e.src] || 0) + 1; return perSrc[e.src] <= MAX_EVENTS_PER_VENUE; });
            all = all.slice(0, MAX_EVENTS);

            var events = all.map(function(e) {
                return { icon: e.icon, rawDate: e.date, title: e.title, venue: e.venue, image: e.image || '' };
            });

            renderEvents(events.length ? events : FALLBACK_EVENTS);
        } catch (e) {
            console.log('[Hva skjer] \u2192 ERROR ' + e.message);
            srcKeys.forEach(function(k) { setSource(k, 'error'); });
            renderEvents(FALLBACK_EVENTS);
        }
    }

    setTimeout(function() { loadEvents(); }, 20000);
    setInterval(loadEvents, CONFIG.eventsRefresh);

    /* ═══ BUS DEPARTURES (Entur) ═══ */
    var busEl = document.getElementById('bus-list');
    var BUS_QUERY = '{stopPlace(id:"' + CONFIG.busStop + '"){name estimatedCalls(timeRange:3600,numberOfDepartures:' + CONFIG.busDepartures + '){expectedDepartureTime aimedDepartureTime realtime destinationDisplay{frontText}serviceJourney{line{publicCode transportMode}}}}}';

    function formatBusTime(isoStr) {
        var dep = new Date(isoStr);
        var now = new Date();
        var diffMs = dep - now;
        var diffMin = Math.round(diffMs / 60000);
        if (diffMin <= 0) return 'N\u00e5';
        if (diffMin < 60) return diffMin + ' min';
        return String(dep.getHours()).padStart(2, '0') + ':' + String(dep.getMinutes()).padStart(2, '0');
    }

    // The .bus-scroll track is persistent so the drift animation survives the 45s re-renders;
    // only the rows inside it are replaced. Pacing matches the events widget (20s pause, 4s/row).
    var busTrack = null;
    var busRowsHtml = '';
    var busPulseTimer = null;
    var BUS_PAUSE = 20;
    var BUS_CYCLE = BUS_PAUSE + CONFIG.busDepartures * 4;
    var BUS_SEP = '<div class="bus-sep"><span></span><span></span><span></span></div>';
    (function() {
        var style = document.createElement('style');
        style.textContent = '@keyframes bus-drift{0%,' + (BUS_PAUSE / BUS_CYCLE * 100).toFixed(1) + '%{transform:translate3d(0,0,0)}100%{transform:translate3d(0,-50%,0)}}';
        document.head.appendChild(style);
    })();

    function renderBusDepartures(calls) {
        if (!calls.length) {
            setBusScrolling(false);
            busTrack = null;
            busEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.85rem;">Ingen avganger</div>';
            return;
        }
        busRowsHtml = calls.map(function(c) {
            var line = c.serviceJourney.line.publicCode;
            var dest = c.destinationDisplay.frontText;
            var timeStr = formatBusTime(c.expectedDepartureTime);
            var isRt = c.realtime;
            return '<div class="bus-item">' +
                '<div class="bus-line">' + escapeHtml(line) + '</div>' +
                '<div class="bus-dest">' + escapeHtml(dest) + '</div>' +
                '<div class="bus-time">' + (isRt ? '<span class="bus-rt"></span>' : '') + timeStr + '</div>' +
                '</div>';
        }).join('');
        if (!busTrack) {
            busEl.innerHTML = '<div class="bus-scroll"><div class="bus-copy"></div></div>';
            busTrack = busEl.firstChild;
        }
        var copies = busTrack.querySelectorAll('.bus-copy');
        for (var i = 0; i < copies.length; i++) copies[i].innerHTML = busRowsHtml;
        layoutBusList();
    }

    // Static when one copy fits the viewport, drifting (duplicated content) when it doesn't.
    // Re-run on resize: the viewport shrinks/grows as the events card above changes height.
    function layoutBusList() {
        if (!busTrack) return;
        setBusScrolling(busTrack.firstChild.offsetHeight > busEl.clientHeight + 1);
    }

    function setBusScrolling(on) {
        var isOn = !!(busTrack && busTrack.classList.contains('scrolling'));
        if (on === isOn) return;
        if (busPulseTimer) { clearInterval(busPulseTimer); busPulseTimer = null; }
        busEl.classList.remove('peek');
        if (!on) {
            busTrack.classList.remove('scrolling');
            while (busTrack.children.length > 1) busTrack.removeChild(busTrack.lastChild);
            return;
        }
        busTrack.insertAdjacentHTML('beforeend', BUS_SEP + '<div class="bus-copy">' + busRowsHtml + '</div>' + BUS_SEP);
        busTrack.style.animationDuration = BUS_CYCLE + 's';
        busTrack.classList.add('scrolling');
        // Glow line at the bottom pulses during the pause window, like the events widget
        var start = Date.now();
        busPulseTimer = setInterval(function() {
            busEl.classList.toggle('peek', (Date.now() - start) % (BUS_CYCLE * 1000) < BUS_PAUSE * 1000);
        }, 500);
    }
    if (window.ResizeObserver) new ResizeObserver(layoutBusList).observe(busEl);

    async function loadBusDepartures() {
        try {
            var data = await sourceFetch('buss', 'https://api.entur.io/journey-planner/v3/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ET-Client-Name': 'pelifix-infoscreen',
                },
                body: JSON.stringify({ query: BUS_QUERY }),
            });
            var sp = data.data.stopPlace;
            var calls = sp.estimatedCalls || [];
            document.getElementById('bus-stop-name').textContent = sp.name;
            console.log('[' + SOURCES.buss.label + '] entur.io \u2192 ' + calls.length + ' departures');
            renderBusDepartures(calls);
            setSource('buss', 'ok');
        } catch (e) {
            console.log('[' + SOURCES.buss.label + '] entur.io \u2192 ERROR ' + e.message);
            setSource('buss', 'error');
        }
    }

    setTimeout(function() { loadBusDepartures(); }, 14000);
    setInterval(loadBusDepartures, CONFIG.busRefresh);

    /* ═══ FLIGHTS FROM SOLA (Avinor XmlFeed) ═══
       Shares the bottom card with the bus list: 40 s bus, 20 s flights. Times in the feed are UTC; status codes
       are N new info, E new time, D departed, A arrived, C cancelled. The feed rejects browser Origins, so proxy. */
    var FLY_URL = 'https://asrv.avinor.no/XmlFeed/v1.0?airport=SVG&TimeFrom=0&TimeTo=6';   // no direction param = arrivals + departures in one call
    var FLY_AIRPORTS = {
        OSL: 'Oslo', BGO: 'Bergen', TRD: 'Trondheim', TRF: 'Sandefjord Torp', KRS: 'Kristiansand', AES: 'Ålesund', HAU: 'Haugesund',
        BOO: 'Bodø', TOS: 'Tromsø', EVE: 'Harstad/Narvik', KSU: 'Kristiansund', MOL: 'Molde', FRO: 'Florø', SVG: 'Stavanger',
        CPH: 'København', BLL: 'Billund', AAL: 'Aalborg', AMS: 'Amsterdam', ABZ: 'Aberdeen', LHR: 'London Heathrow', LGW: 'London Gatwick',
        STN: 'London Stansted', ARN: 'Stockholm', GOT: 'Göteborg', HEL: 'Helsinki', FRA: 'Frankfurt', MUC: 'München', CDG: 'Paris',
        BER: 'Berlin', DUS: 'Düsseldorf', HAM: 'Hamburg', BRU: 'Brussel', EDI: 'Edinburgh', MAN: 'Manchester', NCL: 'Newcastle', DUB: 'Dublin',
        AGP: 'Malaga', ALC: 'Alicante', PMI: 'Palma', BCN: 'Barcelona', LPA: 'Gran Canaria', TFS: 'Tenerife', ACE: 'Lanzarote', FUE: 'Fuerteventura',
        FNC: 'Madeira', LIS: 'Lisboa', FAO: 'Faro', KRK: 'Krakow', WAW: 'Warszawa', GDN: 'Gdansk', RZE: 'Rzeszów', RIX: 'Riga', VNO: 'Vilnius',
        KUN: 'Kaunas', TLL: 'Tallinn', IST: 'Istanbul', AYT: 'Antalya', NCE: 'Nice', FCO: 'Roma', MXP: 'Milano', VIE: 'Wien', ZRH: 'Zürich',
        PRG: 'Praha', BUD: 'Budapest', SPU: 'Split', DBV: 'Dubrovnik', ATH: 'Athen', LCA: 'Larnaca', KEF: 'Reykjavik',
    };
    var flyEl = document.getElementById('fly-list'), flyBlock = document.getElementById('fly-block'), busBlock = document.getElementById('bus-block');
    var flights = [];
    function flyText(el, tag) { var n = el.getElementsByTagName(tag)[0]; return n ? n.textContent.trim() : ''; }
    function parseFlights(xml) {
        var doc = new DOMParser().parseFromString(xml, 'text/xml');
        if (doc.querySelector('parsererror')) throw new Error('XML parse error');
        var out = [];
        doc.querySelectorAll('flight').forEach(function(f) {
            var dir = flyText(f, 'arr_dep');
            if (dir !== 'D' && dir !== 'A') return;
            var sched = new Date(flyText(f, 'schedule_time'));
            if (isNaN(sched.getTime())) return;
            var st = f.getElementsByTagName('status')[0];
            var code = st ? (st.getAttribute('code') || '') : '';
            if (code === 'D' || code === 'A') return;                           // already departed / landed
            var newTime = st && st.getAttribute('time') ? new Date(st.getAttribute('time')) : null;
            var when = (code === 'E' && newTime && !isNaN(newTime.getTime())) ? newTime : sched;
            var iata = flyText(f, 'airport');
            out.push({ dir: dir, sched: sched, when: when, code: code, id: flyText(f, 'flight_id'), dest: FLY_AIRPORTS[iata] || iata, gate: flyText(f, 'gate'), belt: flyText(f, 'belt') });
        });
        out.sort(function(a, b) { return a.when - b.when; });
        return out;
    }
    function hhmm(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    function renderFlights() {
        var now = Date.now();
        var rows = flights.filter(function(f) { return f.when.getTime() > now - 5 * 60000; }).slice(0, 7);
        if (!rows.length) { flyEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.85rem;">Ingen fly de neste timene</div>'; return; }
        flyEl.innerHTML = rows.map(function(f) {
            var arrival = f.dir === 'A';
            var cancelled = f.code === 'C', delayed = f.code === 'E' && f.when.getTime() - f.sched.getTime() > 4 * 60000;
            var cls = cancelled ? ' cancelled' : delayed ? ' delayed' : '';
            var where = arrival ? (f.belt ? 'B\u00e5nd ' + escapeHtml(f.belt) : '') : (f.gate ? 'Gate ' + escapeHtml(f.gate) : '');
            var status = cancelled ? 'Innstilt' : delayed ? 'Ny tid (' + hhmm(f.sched) + ')' : where;
            return '<div class="fly-item">' +
                '<div class="fly-time' + cls + '">' + hhmm(f.when) + '</div>' +
                '<div class="fly-dir" title="' + (arrival ? 'Ankomst' : 'Avgang') + '">' + (arrival ? '\u{1F6EC}' : '\u{1F6EB}') + '</div>' +
                '<div class="fly-dest">' + escapeHtml(f.dest) + '<span class="fly-no">' + escapeHtml(f.id) + '</span></div>' +
                '<div class="fly-status' + cls + '">' + status + '</div>' +
            '</div>';
        }).join('');
    }
    async function loadFlights() {
        try {
            var xml = await sourceFetch('fly', FLY_URL, { parse: 'text', skipStatus: true, proxyOrder: ['codetabs', 'corslol', 'allorigins'] });   // redocly forwards Origin → 401; cors.lol rate-limits
            flights = parseFlights(xml);
            console.log('[' + SOURCES.fly.label + '] avinor.no → ' + flights.filter(function(f) { return f.dir === 'D'; }).length + ' avganger, ' + flights.filter(function(f) { return f.dir === 'A'; }).length + ' ankomster');
            renderFlights();
            renderCardTabs();
            setSource('fly', 'ok');
        } catch (e) {
            console.log('[' + SOURCES.fly.label + '] avinor.no → ERROR ' + e.message);
            setSource('fly', 'error');
            if (!flyRetryTimer) flyRetryTimer = setTimeout(function() { flyRetryTimer = null; loadFlights(); }, 90 * 1000);   // proxies are flaky: retry soon once
        }
    }
    var flyRetryTimer = null;
    // Bus 40 s, flights 20 s (bus only until flights have loaded)
    var FLY_CYCLE_MS = 60000, FLY_SHOW_MS = 20000, flyCycleStart = Date.now();
    var busCard = document.querySelector('.bus-card'), cardTabs = document.getElementById('card-tabs');
    var CARD_TAB_META = { bus: { label: 'Buss', color: '#e8a83e' }, fly: { label: 'Fly Sola', color: '#38bdf8' } };
    // Queue tabs: [current, next], like the hero tabs bar
    function renderCardTabs() {
        if (!cardTabs) return;
        if (!flights.length) { cardTabs.innerHTML = ''; busCard.classList.remove('has-tabs'); return; }
        busCard.classList.add('has-tabs');
        var phase = (Date.now() - flyCycleStart) % FLY_CYCLE_MS;
        var showFly = phase >= FLY_CYCLE_MS - FLY_SHOW_MS;
        var order = showFly ? ['fly', 'bus'] : ['bus', 'fly'];
        var dur = showFly ? FLY_SHOW_MS : FLY_CYCLE_MS - FLY_SHOW_MS;
        var elapsed = showFly ? phase - (FLY_CYCLE_MS - FLY_SHOW_MS) : phase;
        cardTabs.innerHTML = order.map(function(k, i) {
            var m = CARD_TAB_META[k];
            var fillStyle = 'background:' + m.color + (i === 0 ? ';animation-duration:' + (dur / 1000) + 's;animation-delay:-' + (elapsed / 1000).toFixed(2) + 's' : '');
            return '<div class="hero-tab' + (i === 0 ? ' active' : '') + '"><div class="hero-tab-fill" style="' + fillStyle + '"></div><span class="hero-tab-label">' + m.label + '</span></div>';
        }).join('');
    }
    var flyShown = false, blockSwapTimer = null;
    function swapBlocks(showFly) {
        var show = showFly ? flyBlock : busBlock, hide = showFly ? busBlock : flyBlock;
        hide.classList.remove('active'); hide.classList.add('leaving');
        show.classList.remove('leaving'); show.classList.add('active');
        if (blockSwapTimer) clearTimeout(blockSwapTimer);
        blockSwapTimer = setTimeout(function() { hide.classList.remove('leaving'); blockSwapTimer = null; }, 700);   // park it off to the right again
    }
    setInterval(function() {
        var showFly = flights.length > 0 && (Date.now() - flyCycleStart) % FLY_CYCLE_MS >= FLY_CYCLE_MS - FLY_SHOW_MS;
        if (showFly === flyShown) return;
        flyShown = showFly;
        if (showFly) renderFlights();                                       // re-filter departed / landed flights before showing
        swapBlocks(showFly);
        renderCardTabs();
    }, 1000);
    setTimeout(loadFlights, 16000);
    setInterval(loadFlights, SOURCES.fly.refresh);

    /* ═══ CITY BIKES (Entur GBFS) ═══ */
    var bikeEl = document.getElementById('bike-list');

    function renderBikeStations(stations) {
        bikeEl.innerHTML = '';
        if (!stations.length) {
            bikeEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.85rem;">Ingen stasjoner tilgjengelig</div>';
            return;
        }
        stations.forEach(function(s) {
            var div = document.createElement('div');
            div.className = 'bike-item';
            var avail = s.available;
            var colorClass = avail > 0 ? 'bike-ok' : 'bike-none';
            div.innerHTML =
                '<div class="bike-name">' + escapeHtml(s.name) + '</div>' +
                '<div class="bike-avail ' + colorClass + '">' +
                    '<span class="bike-dot"></span>' +
                    avail + ' ' + (avail === 1 ? 'sykkel' : 'sykler') +
                '</div>';
            bikeEl.appendChild(div);
        });
    }

    async function loadBikeStations() {
        setSource('bysykler', 'loading');
        try {
            var fetchOpts = { skipStatus: true, headers: { 'ET-Client-Name': 'pelifix-infoscreen' } };
            var results = await Promise.all([
                sourceFetch('bysykler', 'https://api.entur.io/mobility/v2/gbfs/v3/kolumbusbysykkel/station_information', Object.assign({}, fetchOpts, { cacheKey: 'dev:bysykler:info' })),
                sourceFetch('bysykler', 'https://api.entur.io/mobility/v2/gbfs/v3/kolumbusbysykkel/station_status', Object.assign({}, fetchOpts, { cacheKey: 'dev:bysykler:status' }))
            ]);
            var infoData = results[0];
            var statusData = results[1];

            var infoMap = {};
            (infoData.data.stations || []).forEach(function(s) { infoMap[s.station_id] = s; });
            var statusMap = {};
            (statusData.data.stations || []).forEach(function(s) { statusMap[s.station_id] = s; });

            var stations = CONFIG.bikeStations.map(function(id) {
                var info = infoMap[id] || {};
                var status = statusMap[id] || {};
                var name = info.name || id;
                if (Array.isArray(name)) name = (name[0] && name[0].text) || id;
                return {
                    name: name,
                    available: status.num_vehicles_available || 0,
                    docks: status.num_docks_available || 0,
                    renting: status.is_renting !== false
                };
            });

            console.log('[' + SOURCES.bysykler.label + '] entur.io \u2192 ' + stations.length + ' stations');
            renderBikeStations(stations);
            setSource('bysykler', 'ok');
        } catch (e) {
            console.log('[' + SOURCES.bysykler.label + '] entur.io \u2192 ERROR ' + e.message);
            setSource('bysykler', 'error');
        }
    }

    setTimeout(function() { loadBikeStations(); }, 18000);
    setInterval(loadBikeStations, CONFIG.bikeRefresh);

    /* ═══ TICKER ═══ */
    var tickerEl = document.getElementById('ticker-content');
    var tkFinancial = [];
    var tkRebuildTimer = null;

    function getTickerHeadlines() {
        var all = [];
        Object.keys(rawFeeds).forEach(function(key) {
            rawFeeds[key].forEach(function(item) {
                if (item.title) all.push(item.title);
            });
        });
        for (var i = all.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = all[i]; all[i] = all[j]; all[j] = tmp;
        }
        return all;
    }

    function getTickerX() {
        var cs = window.getComputedStyle(tickerEl);
        var matrix = cs.transform;
        if (matrix && matrix !== 'none') {
            var parts = matrix.split(',');
            return Math.abs(parseFloat(parts[4]));
        }
        return 0;
    }

    function scheduleTickerRebuild() {
        if (tkRebuildTimer) clearTimeout(tkRebuildTimer);
        tkRebuildTimer = setTimeout(function() {
            tkRebuildTimer = null;
            buildTickerContent();
        }, 2000);
    }

    function buildTickerContent() {
        var headlines = getTickerHeadlines();
        if (!headlines.length && !tkFinancial.length && !tkElectricity.length) return;

        // Collect all available data blocks
        var dataBlocks = [];
        if (tkFinancial.length) {
            dataBlocks.push(function() {
                var p = [];
                tkFinancial.forEach(function(f) {
                    var chg = f.change ? fmtChange(f.change) : '';
                    p.push('<span class="fin-item"><span class="fin-val">' + escapeHtml(f.value) + '</span><span class="fin-meta"><span class="fin-cur">' + escapeHtml(f.label) + '</span>' + chg + '</span></span>');
                });
                return p.join('');
            });
        }
        if (tkElectricity.length) {
            dataBlocks.push(function() {
                var p = [];
                if (tkSparkData.length >= 2) {
                    p.push('<span class="tk-data-spark">' + buildSparklineSvg(tkSparkData) + '</span>');
                }
                tkElectricity.forEach(function(e) {
                    p.push('<span class="tk-data-item tk-elec"><span class="tk-data-val">' + escapeHtml(e.value) + '</span><span class="tk-data-meta"><span class="tk-data-label">' + escapeHtml(e.label) + '</span><span class="tk-data-unit">kr/kWh</span></span></span>');
                });
                return p.join('');
            });
        }
        if (trafficState.currentVol) {
            dataBlocks.push(function() {
                var p = [];
                if (trafficHours.length >= 2) {
                    p.push('<span class="tk-data-spark">' + buildSparklineSvg(trafficHours.map(function(h) { return h.total; }), '#f97316') + '</span>');
                }
                p.push('<span class="tk-data-item tk-traffic"><span class="tk-data-val">' + trafficState.currentVol + '</span><span class="tk-data-meta"><span class="tk-data-label">' + escapeHtml(trafficState.level) + '</span><span class="tk-data-unit">kjt/t</span></span></span>');
                return p.join('');
            });
        }
        if (bikeCountState.todayTotal || bikeCountState.lwTotal) {
            dataBlocks.push(function() {
                var p = [];
                var bikeSparkSrc = bikeCountHours.length >= 2 ? bikeCountHours : bikeCountLastWeek;
                if (bikeSparkSrc.length >= 2) {
                    p.push('<span class="tk-data-spark">' + buildSparklineSvg(bikeSparkSrc.map(function(h) { return h.count; }), '#10b981') + '</span>');
                }
                var bikeVal = bikeCountState.todayTotal || bikeCountState.lwTotal;
                var bikeLabel = bikeCountState.todayTotal ? 'i dag' : 'forrige uke';
                p.push('<span class="tk-data-item tk-bike"><span class="tk-data-val">' + bikeVal + '</span><span class="tk-data-meta"><span class="tk-data-label">' + bikeLabel + '</span><span class="tk-data-unit">M\u00f8llebukta</span></span></span>');
                return p.join('');
            });
        }

        if (magasinState.no2) {
            dataBlocks.push(function() {
                return '<span class="tk-data-item tk-magasin"><span class="tk-data-val">' + fmtPct(magasinState.no2.pct) + '</span>' +
                    '<span class="tk-data-meta"><span class="tk-data-label">Magasin Sørvest</span><span class="tk-data-unit">normalt ' + fmtPct(magasinState.no2.median) + '</span></span></span>';
            });
        }

        if (parkingState.garages.length) {
            dataBlocks.push(function() {
                return parkingState.garages.map(function(g) {
                    return '<span class="tk-data-item tk-parking"><span class="tk-data-val">' + g.free + '</span>' +
                        '<span class="tk-data-meta"><span class="tk-data-label">🅿 ' + escapeHtml(g.name) + '</span><span class="tk-data-unit">ledige</span></span></span>';
                }).join('');
            });
        }

        // Blocks registered by add-on scripts (simen.js etc.)
        if (window.InfoScreen) {
            window.InfoScreen.tickerBlocks.forEach(function(fn) {
                var h = '';
                try { h = fn(); } catch (e) { /* ignore broken block */ }
                if (h) dataBlocks.push(function() { return h; });
            });
        }

        // Interleave: [2 news] [1 data] [2 news] [1 data] ...
        var parts = [];
        var newsIdx = 0;
        var dataIdx = 0;
        while (newsIdx < headlines.length) {
            // Add up to 2 news headlines
            var slice = headlines.slice(newsIdx, newsIdx + 2);
            slice.forEach(function(h) {
                parts.push('<span>' + escapeHtml(h) + '</span>');
                parts.push('<span class="sep">\u2022</span>');
            });
            newsIdx += 2;

            // Add 1 data block (cycling through available blocks)
            if (dataBlocks.length) {
                parts.push(dataBlocks[dataIdx % dataBlocks.length]());
                parts.push('<span class="sep">\u2022</span>');
                dataIdx++;
            }
        }

        var html = parts.join('');
        var currentX = getTickerX();
        tickerEl.style.animation = 'none';
        tickerEl.innerHTML = html + html;
        var halfWidth = tickerEl.scrollWidth / 2;
        var duration = halfWidth / CONFIG.tickerSpeed;
        var timeOffset = halfWidth > 0 ? (currentX % halfWidth) / CONFIG.tickerSpeed : 0;
        void tickerEl.offsetWidth;
        tickerEl.style.animation = 'ticker-scroll ' + duration + 's linear infinite';
        tickerEl.style.animationDelay = '-' + timeOffset + 's';
    }

    function fmtChange(pct) {
        if (Math.abs(pct) < 0.01) return '';
        var arrow = pct > 0 ? '\u25B2' : '\u25BC';
        return '<span class="fin-chg ' + (pct > 0 ? 'up' : 'down') + '">' + arrow + Math.abs(pct).toFixed(1) + '%</span>';
    }

    // Energy-company staples next to the currencies: Brent crude and Equinor, from Yahoo's chart API via the proxies.
    var YAHOO_QUOTES = [
        { symbol: 'BZ=F',    label: 'Brent USD',   decimals: 2 },
        { symbol: 'EQNR.OL', label: 'Equinor NOK', decimals: 1 },
    ];
    async function loadYahooQuote(q) {
        var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(q.symbol) + '?range=5d&interval=1d';
        var data = await sourceFetch('marked', url, { proxy: 'cors', skipStatus: true, cacheKey: 'dev:yahoo:' + q.symbol });
        var res = data && data.chart && data.chart.result && data.chart.result[0];
        if (!res || !res.meta || res.meta.regularMarketPrice == null) throw new Error(q.symbol + ' no quote');
        var price = res.meta.regularMarketPrice;
        var pct = res.meta.regularMarketChangePercent;
        if (pct == null) {
            var closes = ((res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || [])
                .filter(function(v) { return v != null; });
            var prev = closes.length >= 2 ? closes[closes.length - 2] : null;
            pct = prev ? (price - prev) / prev * 100 : 0;
        }
        return { label: q.label, value: Number(price).toFixed(q.decimals), change: pct };
    }

    async function loadFinancialData() {
        try {
            var nbUrl = 'https://data.norges-bank.no/api/data/EXR/B.USD+EUR+GBP.NOK.SP?format=sdmx-json&lastNObservations=2';
            var data = await sourceFetch('marked', nbUrl, { proxy: 'none' });   // Norges Bank echoes the Origin header: direct fetch works

            var ds = data.data.dataSets[0];
            var dims = data.data.structure.dimensions.series;
            var curDim = null;
            for (var di = 0; di < dims.length; di++) {
                if (dims[di].id === 'BASE_CUR') { curDim = dims[di]; break; }
            }
            if (!curDim) throw new Error('Missing BASE_CUR dimension');

            var rates = {};
            var seriesKeys = Object.keys(ds.series);
            seriesKeys.forEach(function(key) {
                var indices = key.split(':');
                var curIdx = parseInt(indices[1]);
                var curCode = curDim.values[curIdx].id;
                var obs = ds.series[key].observations;
                var obsKeys = Object.keys(obs).sort(function(a,b) { return parseInt(a) - parseInt(b); });
                var cur = obs[obsKeys[obsKeys.length - 1]][0];
                var prev = obsKeys.length > 1 ? obs[obsKeys[obsKeys.length - 2]][0] : null;
                var pct = prev ? ((cur - prev) / prev) * 100 : 0;
                rates[curCode] = { value: cur, change: pct };
            });

            tkFinancial = [];
            if (rates.USD) tkFinancial.push({ label: 'USD/NOK', value: Number(rates.USD.value).toFixed(2), change: rates.USD.change });
            if (rates.EUR) tkFinancial.push({ label: 'EUR/NOK', value: Number(rates.EUR.value).toFixed(2), change: rates.EUR.change });
            if (rates.GBP) tkFinancial.push({ label: 'GBP/NOK', value: Number(rates.GBP.value).toFixed(2), change: rates.GBP.change });

            console.log('[' + SOURCES.marked.label + '] norges-bank.no \u2192 ' + tkFinancial.length + ' items');
            setSource('marked', 'ok');
        } catch (e) {
            console.log('[' + SOURCES.marked.label + '] norges-bank.no \u2192 ERROR ' + e.message);
            setSource('marked', 'error');
            tkFinancial = [
                { label: 'USD/NOK', value: '\u2013', change: 0 },
                { label: 'EUR/NOK', value: '\u2013', change: 0 },
                { label: 'GBP/NOK', value: '\u2013', change: 0 },
            ];
        }
        var quotes = await Promise.allSettled(YAHOO_QUOTES.map(loadYahooQuote));
        quotes.forEach(function(r, i) {
            if (r.status === 'fulfilled') tkFinancial.push(r.value);
            else console.log('[' + SOURCES.marked.label + '] yahoo ' + YAHOO_QUOTES[i].symbol + ' \u2192 ERROR ' + (r.reason && r.reason.message || r.reason));
        });
        var ok = quotes.filter(function(r) { return r.status === 'fulfilled'; }).length;
        if (ok) console.log('[' + SOURCES.marked.label + '] yahoo \u2192 ' + ok + ' quotes');
        buildTickerContent();
    }

    // Stagger finance (after feeds finish)
    setTimeout(function() { loadFinancialData(); }, 12000);
    setInterval(loadFinancialData, CONFIG.financeRefresh);

    /* ═══ ELECTRICITY PRICES ═══ */
    var tkElectricity = [];
    var tkSparkData = [];

    function formatDateParam(d) {
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '/' + m + '-' + day;
    }

    function buildSparklineSvg(data, color) {
        if (!data || data.length < 2) return '';
        var c = color || '#38bdf8';
        var w = 80, h = 22, pad = 2;
        var min = Math.min.apply(null, data);
        var max = Math.max.apply(null, data);
        var range = max - min || 1;
        var points = data.map(function(v, i) {
            var x = pad + (i / (data.length - 1)) * (w - pad * 2);
            var y = pad + (1 - (v - min) / range) * (h - pad * 2);
            return x.toFixed(1) + ',' + y.toFixed(1);
        }).join(' ');
        return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
            '<polyline points="' + points + '" fill="none" stroke="' + c + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.8"/>' +
            '</svg>';
    }

    /* ═══ SHARED SPARK CARD BUILDERS ═══ */
    function seqPoints(arr) {
        return arr.map(function(v, i) { return { x: i / (arr.length - 1), y: v }; });
    }
    function hourlyPoints(arr, key) {
        return arr.map(function(d) { return { x: parseInt(d.hour) / 23, y: d[key] }; });
    }

    function buildSparkCardSvg(points, refPoints, w, h, color, opts) {
        if (!points || points.length < 2) return '';
        var pad = 4;
        var topRatio = (opts && opts.topRatio) || 0.15;
        var forceMinZero = opts && opts.forceMinZero;
        var gradientId = (opts && opts.gradientId) || 'spark-g';
        var allY = points.map(function(p) { return p.y; });
        if (refPoints && refPoints.length) {
            allY = allY.concat(refPoints.map(function(p) { return p.y; }));
        }
        var min = forceMinZero ? 0 : Math.min.apply(null, allY);
        var max = Math.max.apply(null, allY);
        var range = max - min || 1;
        var top = h * topRatio, bot = h - pad;
        function toSvg(arr) {
            return arr.map(function(p) {
                var x = pad + p.x * (w - pad * 2);
                var y = top + (1 - (p.y - min) / range) * (bot - top);
                return x.toFixed(1) + ',' + y.toFixed(1);
            });
        }
        var todayPts = toSvg(points);
        var polyline = todayPts.join(' ');
        var lastX = (pad + points[points.length - 1].x * (w - pad * 2)).toFixed(1);
        var firstX = (pad + points[0].x * (w - pad * 2)).toFixed(1);
        var areaPath = 'M' + todayPts[0] + ' ' + todayPts.slice(1).map(function(p) { return 'L' + p; }).join(' ') +
            ' L' + lastX + ',' + h + ' L' + firstX + ',' + h + ' Z';
        var lwLine = '';
        if (refPoints && refPoints.length >= 2) {
            var lwPts = toSvg(refPoints);
            lwLine = '<polyline points="' + lwPts.join(' ') + '" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" stroke-dasharray="4,4" stroke-linejoin="round" stroke-linecap="round"/>';
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">' +
            '<defs><linearGradient id="' + gradientId + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.4"/>' +
            '<stop offset="100%" stop-color="' + color + '" stop-opacity="0.05"/>' +
            '</linearGradient></defs>' +
            lwLine +
            '<path d="' + areaPath + '" fill="url(#' + gradientId + ')"/>' +
            '<polyline points="' + polyline + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
            '</svg>';
    }

    function buildSparkCardHtml(opts) {
        var size = opts.size || 'small';
        var fontSize = size === 'large' ? '5rem' : '2rem';
        var valSize = size === 'large' ? '2.4rem' : '1rem';
        var unitSize = size === 'large' ? '0.9rem' : '0.55rem';
        return '<div class="spark-card-visual ' + opts.theme + '">' +
            '<div class="spark-card-spark">' + (opts.svg || '') + '</div>' +
            '<div class="spark-card-overlay">' +
                '<div class="spark-card-emoji" style="font-size:' + fontSize + ';">' + opts.emoji + '</div>' +
                (opts.value ? '<div class="spark-card-value" style="font-size:' + valSize + ';">' + escapeHtml(String(opts.value)) + '<span class="spark-card-unit" style="font-size:' + unitSize + ';"> ' + escapeHtml(opts.unit) + '</span></div>' : '') +
            '</div>' +
        '</div>';
    }

    // E39 tile: a stat tile, not a picture. Value, delta and sparkline each get their own band so the number
    // is never read across the chart. One series, so no legend; the delta carries the week-on-week comparison.
    function buildTrafficSpark(points, w, h) {
        if (points.length < 2) return '';
        var pad = 7, top = 8, bot = h - 7;   // pad leaves room for the end dot plus its ring
        var max = Math.max.apply(null, points.map(function(p) { return p.y; })) || 1;
        var px = function(p) { return (pad + p.x * (w - pad * 2)).toFixed(1); };
        var py = function(p) { return (top + (1 - p.y / max) * (bot - top)).toFixed(1); };
        var pts = points.map(function(p) { return px(p) + ',' + py(p); });
        var last = points[points.length - 1];
        return '<svg class="tfc-svg" viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">' +
            '<path class="tfc-area" d="M' + px(points[0]) + ',' + h + ' L' + pts.join(' L') + ' L' + px(last) + ',' + h + ' Z"/>' +
            '<polyline class="tfc-line" points="' + pts.join(' ') + '"/>' +
            '<circle class="tfc-dot" cx="' + px(last) + '" cy="' + py(last) + '" r="3.6"/>' +
        '</svg>';
    }

    function buildTrafficCard(size) {
        var big = size === 'large';
        var delta = '';
        if (trafficState.vsWeekPct != null) {
            var up = trafficState.vsWeekPct >= 0;
            delta = '<div class="tfc-delta"><span class="tfc-arrow">' + (up ? '\u25B2' : '\u25BC') + '</span>' +
                Math.abs(trafficState.vsWeekPct) + '\u202F% mot ' + escapeHtml(trafficState.vsWeekRef) + '</div>';
        }
        return '<div class="tfc' + (big ? ' tfc-lg' : '') + '">' +
            (big ? '<div class="tfc-label">E39 J\u00E5tten \u00B7 n\u00E5</div>' : '') +
            '<div class="tfc-value">' + fmtInt(trafficState.currentVol || 0) + '<span class="tfc-unit">kjt/t</span></div>' +
            (big ? delta : '') +
            '<div class="tfc-spark">' + buildTrafficSpark(hourlyPoints(trafficHours, 'total'), big ? 400 : 220, big ? 104 : 64) + '</div>' +
            (big ? '<div class="tfc-ticks"><span>00</span><span>12</span><span>23</span></div>' : '') +
        '</div>';
    }

    // Calendar leaf for "På denne dagen": the date is the picture
    var paadagState = { day: '', month: '', count: 0 };
    function buildPaadagCard(size) {
        var big = size === 'large';
        return '<div class="pdc' + (big ? ' pdc-lg' : '') + '">' +
            '<div class="pdc-label">På denne dagen</div>' +
            '<div class="pdc-day">' + paadagState.day + '</div>' +
            '<div class="pdc-month">' + escapeHtml(paadagState.month) + '</div>' +
        '</div>';
    }

    function getSparkCard(type, size) {
        var svg, emoji, value, unit, theme;
        if (type === 'trafikk') {
            return buildTrafficCard(size);
        } else if (type === 'paadag') {
            return buildPaadagCard(size);
        } else if (type === 'sykkel') {
            var bikePrimary = bikeCountHours.length ? bikeCountHours : bikeCountLastWeek;
            var bikeRef = bikeCountHours.length ? bikeCountLastWeek : null;
            svg = buildSparkCardSvg(hourlyPoints(bikePrimary, 'count'), bikeRef ? hourlyPoints(bikeRef, 'count') : null, 400, 200, '#10b981', { forceMinZero: true, gradientId: 'bike-fill' });
            emoji = '\uD83D\uDEB2';
            value = bikeCountState.todayTotal || bikeCountState.lwTotal || '';
            unit = bikeCountState.todayTotal ? 'i dag' : 'forrige uke';
            theme = 'sc-bike';
        } else if (type === 'magasin') {
            svg = buildMagasinSvg(); emoji = ''; value = ''; unit = ''; theme = 'sc-magasin';   // the SVG carries the numbers itself
        } else {
            svg = buildSparkCardSvg(seqPoints(tkSparkData), null, 400, 200, '#38bdf8', { topRatio: 0.3, gradientId: 'spark-fill' });
            emoji = '\u26A1'; value = tkElectricity.length ? tkElectricity[0].value : ''; unit = 'kr/kWh'; theme = 'sc-elec';
        }
        return buildSparkCardHtml({ svg: svg, emoji: emoji, value: value, unit: unit, size: size || 'small', theme: theme });
    }

    async function fetchDayPrices(date) {
        var dateStr = formatDateParam(date);
        var url = 'https://www.hvakosterstrommen.no/api/v1/prices/' + dateStr + '_' + CONFIG.stromprisRegion + '.json';
        try {
            return await sourceFetch('strompris', url, { skipStatus: true, proxy: 'none', cacheKey: 'dev:strom:' + dateStr });
        } catch (e) { return null; }
    }

    function avgPrice(hours) {
        if (!hours || !hours.length) return null;
        var sum = 0;
        for (var i = 0; i < hours.length; i++) sum += hours[i].NOK_per_kWh;
        return (sum / hours.length) * 1.25; // incl. MVA
    }

    async function loadElectricityPrices() {
        setSource('strompris', 'loading');
        try {
            var now = new Date();
            var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            var tomorrow = new Date(today.getTime() + 86400000);

            // Fetch today + tomorrow + last 7 days for sparkline
            var fetches = [fetchDayPrices(today), fetchDayPrices(tomorrow)];
            for (var d = 6; d >= 1; d--) {
                fetches.push(fetchDayPrices(new Date(today.getTime() - d * 86400000)));
            }
            var results = await Promise.allSettled(fetches);
            var todayData = results[0].status === 'fulfilled' && results[0].value ? results[0].value : null;
            var tomorrowData = results[1].status === 'fulfilled' && results[1].value ? results[1].value : null;

            var todayAvg = avgPrice(todayData);
            var tomorrowAvg = avgPrice(tomorrowData);

            tkElectricity = [];
            if (todayAvg !== null) {
                tkElectricity.push({ label: 'I dag', value: todayAvg.toFixed(2) });
            }
            if (tomorrowAvg !== null) {
                tkElectricity.push({ label: 'I morgen', value: tomorrowAvg.toFixed(2) });
            }

            // Build sparkline from all hourly prices (last 7 days + today)
            var hourlyPrices = [];
            for (var s = 2; s < results.length; s++) {
                var dayData = results[s].status === 'fulfilled' && results[s].value ? results[s].value : null;
                if (dayData) {
                    for (var hi = 0; hi < dayData.length; hi++) {
                        hourlyPrices.push(dayData[hi].NOK_per_kWh * 1.25);
                    }
                }
            }
            if (todayData) {
                for (var ti = 0; ti < todayData.length; ti++) {
                    hourlyPrices.push(todayData[ti].NOK_per_kWh * 1.25);
                }
            }
            tkSparkData = hourlyPrices;

            console.log('[' + SOURCES.strompris.label + '] hvakosterstrommen \u2192 ' + hourlyPrices.length + ' hours');
            buildTickerContent();
            setSource('strompris', 'ok');
        } catch (e) {
            console.log('[' + SOURCES.strompris.label + '] hvakosterstrommen \u2192 ERROR ' + e.message);
            setSource('strompris', 'error');
        }
    }

    setTimeout(function() { loadElectricityPrices(); }, 22000);
    setInterval(loadElectricityPrices, CONFIG.stromprisRefresh);

    /* ═══ RESERVOIR FILLING (NVE magasinstatistikk) ═══
       Weekly numbers for price area NO2 (southwest Norway) and the whole country, shown as a spark card in the
       feed/hero rotation plus a ticker item. The 20-year min/median/max per ISO week gives the "normal" marker. */
    var magasinState = { no2: null, no: null, week: 0, next: '' };
    function fmtPct(v, dec) { return Number(v).toFixed(dec == null ? 1 : dec).replace('.', ',') + ' %'; }
    function magasinPhrase(a) {
        var d = a.pct - a.median;
        if (d < -10) return 'langt under normalen';
        if (d < -3) return 'under normalen';
        if (d > 10) return 'langt over normalen';
        if (d > 3) return 'over normalen';
        return 'nær normalen';
    }
    function buildMagasinSvg() {
        var rows = [{ label: 'SØRVEST-NORGE (NO2)', a: magasinState.no2 }, { label: 'HELE NORGE', a: magasinState.no }];
        var x0 = 22, w = 356;
        var s = '<svg viewBox="0 0 400 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="font-family:Montserrat,system-ui,sans-serif">';
        s += '<text x="' + x0 + '" y="26" font-size="11" letter-spacing="2" font-weight="600" fill="rgba(255,255,255,0.45)">MAGASINFYLLING · UKE ' + magasinState.week + '</text>';
        rows.forEach(function(r, i) {
            var a = r.a;
            if (!a) return;
            var y = 62 + i * 70;
            var col = (a.pct - a.median < -10) ? '#f59e0b' : '#2dd4bf';
            var px = function(p) { return x0 + w * Math.max(0, Math.min(100, p)) / 100; };
            s += '<text x="' + x0 + '" y="' + y + '" font-size="13" letter-spacing="1.5" font-weight="600" fill="rgba(255,255,255,0.7)">' + r.label + '</text>';
            s += '<text x="' + (x0 + w) + '" y="' + (y + 2) + '" font-size="26" text-anchor="end" font-weight="700" fill="' + col + '">' + fmtPct(a.pct) + '</text>';
            s += '<rect x="' + x0 + '" y="' + (y + 12) + '" width="' + w + '" height="14" rx="7" fill="rgba(255,255,255,0.07)"/>';
            s += '<rect x="' + px(a.min) + '" y="' + (y + 12) + '" width="' + Math.max(0, px(a.max) - px(a.min)) + '" height="14" rx="7" fill="rgba(255,255,255,0.08)"/>';
            s += '<rect x="' + x0 + '" y="' + (y + 12) + '" width="' + Math.max(0, px(a.pct) - x0) + '" height="14" rx="7" fill="' + col + '" opacity="0.9"/>';
            s += '<line x1="' + px(a.median) + '" x2="' + px(a.median) + '" y1="' + (y + 8) + '" y2="' + (y + 30) + '" stroke="#fff" stroke-width="2"/>';
            s += '<text x="' + px(a.median) + '" y="' + (y + 44) + '" font-size="11" text-anchor="middle" fill="rgba(255,255,255,0.6)">normalt ' + fmtPct(a.median, 0) + '</text>';
        });
        return s + '</svg>';
    }
    async function loadMagasin() {
        var base = 'https://biapi.nve.no/magasinstatistikk/api/Magasinstatistikk/';
        try {
            var res = await Promise.all([
                sourceFetch('magasin', base + 'HentOffentligDataSisteUke', { skipStatus: true }),
                sourceFetch('magasin', base + 'HentOffentligDataMinMaxMedian', { skipStatus: true }),
            ]);
            var siste = res[0], stats = res[1];
            function area(type, nr) {
                var cur = siste.filter(function(r) { return r.omrType === type && r.omrnr === nr; })[0];
                if (!cur) return null;
                var m = stats.filter(function(r) { return r.omrType === type && r.omrnr === nr && r.iso_uke === cur.iso_uke; })[0] || {};
                return {
                    pct: cur.fyllingsgrad * 100, chg: (cur.endring_fyllingsgrad || 0) * 100, week: cur.iso_uke, next: cur.neste_Publiseringsdato,
                    median: (m.medianFyllingsGrad || 0) * 100, min: (m.minFyllingsgrad || 0) * 100, max: (m.maxFyllingsgrad || 0) * 100,
                };
            }
            var no2 = area('EL', 2), no = area('NO', 0);
            if (!no2 || !no) throw new Error('areas missing');
            magasinState = { no2: no2, no: no, week: no2.week, next: no2.next };

            var nextD = no2.next ? new Date(no2.next) : null;                    // local time, no zone in the string
            var published = nextD ? new Date(nextD.getTime() - 7 * 86400000) : new Date();
            var dayN = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
            var nextTxt = nextD ? dayN[nextD.getDay()] + ' ' + nextD.getDate() + '. ' + monN[nextD.getMonth()].substring(0, 3) + ' kl. ' + String(nextD.getHours()).padStart(2, '0') : '';
            var chgTxt = (no2.chg >= 0 ? '+' : '−') + Math.abs(no2.chg).toFixed(1).replace('.', ',') + ' pp';
            rawFeeds.magasin = [{
                title: 'Vannmagasinene i Sørvest-Norge er ' + fmtPct(no2.pct) + ' fulle – ' + magasinPhrase(no2),
                descHtml: 'Uke ' + no2.week + ': Sørvest-Norge (NO2) <b>' + fmtPct(no2.pct) + '</b>, normalt ' + fmtPct(no2.median) + ' for uka · ' + chgTxt + ' siste uke.<br>' +
                    'Hele Norge ' + fmtPct(no.pct) + ' (normalt ' + fmtPct(no.median) + ')' + (nextTxt ? ' · neste tall fra NVE ' + nextTxt : '') + '.',
                pubDate: published.toISOString(),
                image: 'spark:magasin',
                source: 'magasin',
                categories: ['NVE', 'Uke ' + no2.week],
            }];
            console.log('[' + SOURCES.magasin.label + '] nve.no → NO2 ' + fmtPct(no2.pct) + ', Norge ' + fmtPct(no.pct));
            mergeFeedsAndRender();
            setSource('magasin', 'ok');
        } catch (e) {
            console.log('[' + SOURCES.magasin.label + '] nve.no → ERROR ' + e.message);
            setSource('magasin', 'error');
        }
    }
    setTimeout(loadMagasin, 28000);
    setInterval(loadMagasin, SOURCES.magasin.refresh);

    /* ═══ PARKING (Stavanger open data: free spaces in city-centre garages, refreshed every few minutes) ═══ */
    var parkingState = { garages: [], at: '' };
    var PARKING_URL = 'https://opencom.no/dataset/36ceda99-bbc3-4909-bc52-b05a6d634b3f/resource/d1bdc6eb-9b49-4f24-89c2-ab9f5ce2acce/download/parking.json';
    var PARKING_PREF = ['Jernbanen', 'Valberget', 'Forum', 'Kyrre', 'St Olav', 'Siddis', 'Jorenholmen', 'Parketten', 'Posten'];
    async function loadParking() {
        try {
            var data = await sourceFetch('parkering', PARKING_URL, { skipStatus: true });
            if (!Array.isArray(data)) throw new Error('unexpected shape');
            var byName = {};
            data.forEach(function(g) { if (g && g.Sted) byName[String(g.Sted).trim()] = g; });
            var picked = [];
            PARKING_PREF.forEach(function(name) {
                var g = byName[name];
                if (!g || picked.length >= 4) return;
                var n = parseInt(String(g.Antall_ledige_plasser).replace(/\D/g, ''), 10);
                if (isNaN(n)) return;                                   // "Open" = no live count for that garage
                picked.push({ name: name, free: n });
            });
            if (!picked.length) throw new Error('no garages with counts');
            parkingState = { garages: picked, at: data[0].Klokkeslett || '' };
            console.log('[' + SOURCES.parkering.label + '] opencom.no → ' + picked.map(function(g) { return g.name + ' ' + g.free; }).join(', '));
            scheduleTickerRebuild();
            setSource('parkering', 'ok');
        } catch (e) {
            console.log('[' + SOURCES.parkering.label + '] opencom.no → ERROR ' + e.message);
            setSource('parkering', 'error');
        }
    }
    setTimeout(loadParking, 32000);
    setInterval(loadParking, SOURCES.parkering.refresh);

    /* ═══ LUNCH (comic strip, tu.no) ═══
       tu.no serves the strip as a plain JPEG per date, so an <img> can load it without a proxy. It is 3:1 and
       only legible at hero width, hence HERO_PIN and FEED_SKIP: always a hero card, never a feed thumbnail. */
    var comicOffset = 0;        // days back from today; sticks once a working strip is found
    function comicDate() { return fmtDateLocal(new Date(Date.now() - comicOffset * 86400000)); }
    function buildComicCard() {
        return '<img class="comic-img" src="' + escapeHtml(CONFIG.comicUrl + comicDate()) + '" alt="Lunch">' +
            '<div class="comic-credit">' + escapeHtml(CONFIG.comicCredit) + '</div>';
    }
    function comicStepBack(e) {
        var img = (e && e.target) || this;
        if (comicOffset >= 4) {
            console.log('[' + SOURCES.lunch.label + '] tu.no → no strip in the last 4 days');
            setSource('lunch', 'error');
            return;
        }
        comicOffset++;                                  // weekend or not published yet
        img.src = CONFIG.comicUrl + comicDate();
        console.log('[' + SOURCES.lunch.label + '] tu.no → falling back to ' + comicDate());
    }
    function loadComic() {
        var pub = new Date();
        pub.setHours(6, 0, 0, 0);                       // the strip is a morning thing
        rawFeeds.lunch = [{
            title: 'Lunch', pubDate: pub.toISOString(), image: 'comic:lunch', source: 'lunch', categories: [],
        }];
        console.log('[' + SOURCES.lunch.label + '] tu.no → ' + comicDate());
        setSource('lunch', 'ok');
        mergeFeedsAndRender();
    }
    setTimeout(loadComic, 6000);
    setInterval(loadComic, CONFIG.comicRefresh);

    /* ═══ PÅ DENNE DAGEN (no.wikipedia) ═══
       The Norwegian on-this-day REST feed is empty, but the date article carries "Norsk historie",
       "Historie" and "Navnedag" sections. action=parse with origin=* sends CORS, so no proxy. ~8 KB. */
    var PAADAG_MAX = 4;
    function wikiClean(s) {
        return s.replace(/<ref[^>]*\/>/g, '')
            .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
            .replace(/\{\{[^{}]*\}\}/g, '')
            .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
            .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, '$1')
            .replace(/'''?/g, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    function wikiSections(text) {
        var out = {}, cur = null;
        text.split('\n').forEach(function(line) {
            var h = /^==+\s*(.+?)\s*==+\s*$/.exec(line);
            if (h) { cur = h[1]; if (!out[cur]) out[cur] = []; return; }
            if (cur && line.charAt(0) === '*') out[cur].push(line);
        });
        return out;
    }
    function paadagRows(bullets, norsk) {
        var rows = [];
        (bullets || []).forEach(function(b) {
            var m = /^(\d{3,4})\s*[–—-]\s*(.+)$/.exec(wikiClean(b.replace(/^\*+\s*/, '')));
            if (m && m[2].length > 8) rows.push({ year: m[1], text: m[2], norsk: norsk });
        });
        return rows.reverse();                          // the article lists oldest first; lead with the recent
    }
    async function loadPaaDagen() {
        var now = new Date();
        var page = now.getDate() + '. ' + monN[now.getMonth()];
        var url = 'https://no.wikipedia.org/w/api.php?action=parse&page=' + encodeURIComponent(page) +
            '&prop=wikitext&format=json&origin=*';
        try {
            var data = await sourceFetch('paadag', url, { skipStatus: true, cacheKey: 'dev:paadag:' + page });
            var wikitext = data && data.parse && data.parse.wikitext && data.parse.wikitext['*'];
            if (!wikitext) throw new Error('no wikitext');
            var sec = wikiSections(wikitext);
            var rows = paadagRows(sec['Norsk historie'], true).concat(paadagRows(sec['Historie'], false));
            if (!rows.length) throw new Error('no dated entries');
            rows = rows.slice(0, PAADAG_MAX);

            var navn = '';
            (sec['Navnedag'] || []).forEach(function(b) {
                var t = wikiClean(b.replace(/^\*+\s*/, ''));
                if (/^Norge\s*:/i.test(t)) navn = t.replace(/^Norge\s*:\s*/i, '').replace(/\.$/, '');
            });

            var head = rows[0];
            var rest = rows.slice(1).map(function(r) {
                return '<div class="pdd-row"><span class="pdd-year">' + r.year + '</span>' +
                    '<span class="pdd-text">' + escapeHtml(r.text) + (r.norsk ? '<span class="pdd-no">Norge</span>' : '') + '</span></div>';
            }).join('');
            paadagState.day = now.getDate();
            paadagState.month = monN[now.getMonth()];
            paadagState.count = rows.length;
            rawFeeds.paadag = [{
                title: head.year + ' · ' + head.text,
                descHtml: '<div class="pdd">' + rest +
                    (navn ? '<div class="pdd-note">Navnedag i Norge: ' + escapeHtml(navn) + '</div>' : '') + '</div>',
                pubDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 0, 0).toISOString(),
                image: 'spark:paadag',
                source: 'paadag',
                categories: [page],
            }];
            console.log('[' + SOURCES.paadag.label + '] no.wikipedia → ' + page + ', ' + rows.length + ' entries');
            mergeFeedsAndRender();
            setSource('paadag', 'ok');
        } catch (e) {
            console.log('[' + SOURCES.paadag.label + '] no.wikipedia → ERROR ' + e.message);
            setSource('paadag', 'error');
        }
    }
    setTimeout(loadPaaDagen, 34000);
    setInterval(loadPaaDagen, CONFIG.paadagRefresh);

    /* ═══ E39 TRAFFIC ═══ */
    var trafficHours = [];
    var trafficLastWeek = [];
    var trafficState = { level: '', trend: '', label: '', desc: '', currentVol: 0 };

    function computeTrafficState() {
        if (!trafficHours.length) return;
        var cur = trafficHours[trafficHours.length - 1];
        var prev = trafficHours.length > 1 ? trafficHours[trafficHours.length - 2] : null;
        var vol = cur.total;
        var hour = parseInt(cur.hour);

        // Level
        var level;
        if (vol > 4500) level = 'Rushtrafikk';
        else if (vol > 3500) level = 'Mye trafikk';
        else if (vol > 2000) level = 'Normal trafikk';
        else level = 'Rolig trafikk';

        // Trend
        var trend = '';
        if (prev) {
            var pct = ((vol - prev.total) / prev.total) * 100;
            if (pct > 15) trend = 'Trafikken \u00f8ker';
            else if (pct < -15) trend = 'Trafikken avtar';
            else trend = 'Stabil trafikk';
        }

        // vs the same hour last week (the delta shown on the tile)
        var vsWeekPct = null;
        if (trafficLastWeek.length) {
            var sameHour = null;
            for (var i = 0; i < trafficLastWeek.length; i++) {
                if (trafficLastWeek[i].hour === cur.hour) { sameHour = trafficLastWeek[i]; break; }
            }
            if (sameHour && sameHour.total > 0) {
                vsWeekPct = Math.round(((vol - sameHour.total) / sameHour.total) * 100);
            }
        }

        // Dynamic title
        var title;
        if (vol > 4500) {
            title = (hour < 12 ? 'Morgenrush' : 'Ettermiddagsrush') + ' p\u00e5 E39 \u2014 ' + vol + ' kjt/t';
        } else if (trend === 'Trafikken avtar') {
            title = 'Trafikken avtar p\u00e5 E39 J\u00e5tten';
        } else if (trend === 'Trafikken \u00f8ker') {
            title = 'Trafikken \u00f8ker p\u00e5 E39 J\u00e5tten';
        } else {
            title = level + ' p\u00e5 E39 J\u00e5tten';
        }

        // Description: a two-row direction readout. One hue for both bars, so the row labels carry identity
        // rather than colour; values are tabular because they form a column. (Was four emoji bullet lines.)
        // Bars run against today's busiest hour in one direction, not against each other: scaled to each other
        // the heavier direction is always full, which implies a limit that isn't there.
        var dirPeak = 0;
        trafficHours.forEach(function(h) { dirPeak = Math.max(dirPeak, h.north, h.south); });
        if (!dirPeak) dirPeak = Math.max(cur.north, cur.south) || 1;
        function dirRow(name, value) {
            return '<div class="tfx-row"><span class="tfx-dir">' + name + '</span>' +
                '<span class="tfx-val">' + fmtInt(value) + '</span>' +
                '<span class="tfx-bar"><i style="width:' + (value / dirPeak * 100).toFixed(1) + '%"></i></span></div>';
        }
        var noteParts = [];
        if (trend) noteParts.push(trend);
        noteParts.push(fmtInt(vol) + ' kjt/t totalt');
        noteParts.push('søyler mot dagens topptime (' + fmtInt(dirPeak) + ')');
        var descHtml = '<div class="tfx">' +
            dirRow('Mot Stavanger', cur.north) +
            dirRow('Mot Sandnes', cur.south) +
            '<div class="tfx-note">' + noteParts.join(' \u00B7 ') + '</div>' +
        '</div>';

        trafficState = {
            level: level,
            trend: trend,
            label: title,
            descHtml: descHtml,
            currentVol: vol,
            north: cur.north,
            south: cur.south,
            vsWeekPct: vsWeekPct,
            vsWeekRef: 'forrige ' + dayN[new Date().getDay()].toLowerCase(),
        };
    }



    function parseTrafficHours(edges) {
        return edges.map(function(e) {
            var n = e.node;
            var dirs = n.byDirection || [];
            var north = 0, south = 0;
            dirs.forEach(function(d) {
                if (d.heading === 'Stavanger') north = d.total.volumeNumbers.volume;
                else south = d.total.volumeNumbers.volume;
            });
            return {
                hour: n.from.substring(11, 13),
                total: n.total.volumeNumbers.volume,
                north: north,
                south: south,
            };
        });
    }

    function toLocalIso(d) {
        var off = -d.getTimezoneOffset();
        var sign = off >= 0 ? '+' : '-';
        var oh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
        var om = String(Math.abs(off) % 60).padStart(2, '0');
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0') +
            sign + oh + ':' + om;
    }

    async function loadTrafficData() {
        try {
            var now = new Date();
            var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            var lastWeekDay = new Date(today.getTime() - 7 * 86400000);
            var todayStr = toLocalIso(today);
            var nowStr = toLocalIso(now);
            var lwStart = toLocalIso(lastWeekDay);
            var lwEnd = toLocalIso(new Date(lastWeekDay.getTime() + 86400000));

            var query = '{ today: trafficData(trafficRegistrationPointId: "' + CONFIG.trafficPointId + '") { volume { byHour(from: "' + todayStr + '", to: "' + nowStr + '") { edges { node { from total { volumeNumbers { volume } } byDirection { heading total { volumeNumbers { volume } } } } } } } } lastWeek: trafficData(trafficRegistrationPointId: "' + CONFIG.trafficPointId + '") { volume { byHour(from: "' + lwStart + '", to: "' + lwEnd + '") { edges { node { from total { volumeNumbers { volume } } byDirection { heading total { volumeNumbers { volume } } } } } } } } }';

            var data = await sourceFetch('trafikk', CONFIG.trafficGraphQL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query }),
            });

            var todayEdges = data.data.today.volume.byHour.edges;
            var lwEdges = data.data.lastWeek.volume.byHour.edges;
            trafficHours = parseTrafficHours(todayEdges);
            trafficLastWeek = parseTrafficHours(lwEdges);
            console.log('[' + SOURCES.trafikk.label + '] vegvesen.no \u2192 ' + trafficHours.length + 'h today, ' + trafficLastWeek.length + 'h lastWeek');

            computeTrafficState();

            // Inject synthetic article
            if (trafficState.currentVol) {
                var isRush = now.getDay() >= 1 && now.getDay() <= 5 &&
                    ((now.getHours() >= 7 && now.getHours() < 9) || (now.getHours() >= 14 && now.getHours() < 17));
                var pubDate = isRush ? now.toISOString() : new Date(now.getTime() - 3600000).toISOString();

                rawFeeds.trafikk = [{
                    title: trafficState.label,
                    descHtml: trafficState.descHtml,
                    pubDate: pubDate,
                    image: 'spark:trafikk',
                    source: 'trafikk',
                    categories: [trafficState.level],
                }];
                mergeFeedsAndRender();
            } else {
                scheduleTickerRebuild();
            }

            setSource('trafikk', 'ok');
        } catch (e) {
            console.log('[' + SOURCES.trafikk.label + '] vegvesen.no \u2192 ERROR ' + e.message);
            setSource('trafikk', 'error');
        }
    }

    setTimeout(function() { loadTrafficData(); }, 26000);
    setInterval(loadTrafficData, CONFIG.trafficRefresh);

    /* ═══ BIKE COUNTER (Møllebukta) ═══ */
    var bikeCountHours = [];
    var bikeCountLastWeek = [];
    var bikeCountState = { todayTotal: 0, lwTotal: 0, currentHour: 0, trend: '', label: '', descHtml: '', avgSpeed: 0, temp: 0 };
    var _pendingBikeJsonp = null;

    function computeBikeCountState() {
        if (!bikeCountHours.length && !bikeCountLastWeek.length) return;
        var total = 0;
        bikeCountHours.forEach(function(h) { total += h.count; });
        var cur = bikeCountHours.length ? bikeCountHours[bikeCountHours.length - 1] : null;
        var prev = bikeCountHours.length > 1 ? bikeCountHours[bikeCountHours.length - 2] : null;

        // Trend
        var trend = '';
        if (cur && prev && prev.count > 0) {
            var pct = ((cur.count - prev.count) / prev.count) * 100;
            if (pct > 20) trend = 'Flere syklister';
            else if (pct < -20) trend = 'F\u00e6rre syklister';
            else trend = 'Stabilt';
        }

        // Last week totals
        var lwTotal = 0;
        if (bikeCountLastWeek.length) {
            bikeCountLastWeek.forEach(function(h) { lwTotal += h.count; });
        }
        var dayName = dayN[new Date().getDay()].toLowerCase();

        // vs last week
        var vsWeek = '';
        if (lwTotal > 0 && total > 0) {
            var diff = Math.round(((total - lwTotal) / lwTotal) * 100);
            vsWeek = (diff >= 0 ? '+' : '') + diff + '% vs forrige ' + dayName;
        }

        // Average speed and temp from latest hour
        var avgSpeed = cur ? (cur.speed || 0) : 0;
        var temp = cur ? cur.temp : null;

        // Dynamic title
        var title;
        if (total === 0 && lwTotal > 0) {
            title = 'Forrige ' + dayName + ': ' + lwTotal + ' syklister forbi M\u00f8llebukta';
        } else if (total === 0) {
            title = 'Ingen syklister forbi M\u00f8llebukta enn\u00e5';
        } else if (total < 50) {
            title = total + ' syklister forbi M\u00f8llebukta i dag';
        } else if (total < 200) {
            title = 'Aktiv sykkeldag \u2014 ' + total + ' forbi M\u00f8llebukta';
        } else {
            title = 'Travelt p\u00e5 sykkelveien \u2014 ' + total + ' forbi M\u00f8llebukta';
        }

        // Description
        var descLines = [];
        if (total > 0) {
            descLines.push('\uD83D\uDEB4 ' + total + ' syklister totalt i dag');
            descLines.push('\u23F1\uFE0F Siste time: ' + cur.count);
            if (avgSpeed > 0) descLines.push('\uD83D\uDCA8 Snittfart: ' + avgSpeed + ' km/t');
            if (temp !== null && temp !== undefined) descLines.push('\uD83C\uDF21\uFE0F Veitemp: ' + temp + '\u00b0C');
            if (vsWeek) descLines.push('\uD83D\uDCC5 ' + vsWeek);
        } else if (lwTotal > 0) {
            descLines.push('\uD83D\uDEB4 ' + lwTotal + ' syklister forrige ' + dayName);
            var lwAvgPerHour = Math.round(lwTotal / bikeCountLastWeek.length);
            descLines.push('\u23F1\uFE0F Snitt: ' + lwAvgPerHour + ' per time');
            var lwLast = bikeCountLastWeek[bikeCountLastWeek.length - 1];
            if (lwLast && lwLast.temp !== null && lwLast.temp !== undefined) descLines.push('\uD83C\uDF21\uFE0F Veitemp da: ' + lwLast.temp + '\u00b0C');
            descLines.push('\uD83D\uDCC5 Ingen passeringer i dag enn\u00e5');
        }

        bikeCountState = {
            todayTotal: total,
            lwTotal: lwTotal,
            currentHour: cur ? cur.count : 0,
            trend: trend,
            label: title,
            descHtml: descLines.join('<br>'),
            avgSpeed: avgSpeed,
            temp: temp,
        };
    }



    function parseBikeCountRecords(records) {
        // Group by hour, sum both lanes
        var hourMap = {};
        records.forEach(function(r) {
            var time = r.Time || '';
            var hour = time.split(':')[0];
            if (!hour) return;
            var h = parseInt(hour);
            if (!hourMap[h]) hourMap[h] = { hour: String(h).padStart(2, '0'), count: 0, speed: 0, temp: null, lanes: 0 };
            hourMap[h].count += (r.Count || 0);
            if (r.Average_Speed) { hourMap[h].speed += r.Average_Speed; hourMap[h].lanes++; }
            if (r.Average_Temperature !== null && r.Average_Temperature !== undefined) hourMap[h].temp = r.Average_Temperature;
        });
        var hours = Object.keys(hourMap).sort(function(a, b) { return a - b; });
        return hours.map(function(h) {
            var d = hourMap[h];
            if (d.lanes > 0) d.speed = Math.round(d.speed / d.lanes);
            return d;
        });
    }

    function fmtDateLocal(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    async function loadBikeCountData() {
        setSource('sykkel', 'loading');
        try {
            var now = new Date();
            var today = fmtDateLocal(now);
            var lastWeekDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
            var lastWeek = fmtDateLocal(lastWeekDay);

            // Check dev cache first
            var jsonpUrl = CONFIG.bikeCountApi + '?resource_id=' + CONFIG.bikeCountResource;
            var cached = getDevCache('sykkel', jsonpUrl);
            var data;
            if (cached !== null) {
                console.log('[' + SOURCES.sykkel.label + '] cache → hit');
                data = cached;
            } else {
                // Cancel any pending JSONP request
                if (_pendingBikeJsonp) {
                    clearTimeout(_pendingBikeJsonp.timeout);
                    delete window[_pendingBikeJsonp.cb];
                    if (_pendingBikeJsonp.script.parentNode) _pendingBikeJsonp.script.remove();
                    _pendingBikeJsonp = null;
                }
                // JSONP fetch — bypasses CORS via <script> tag
                data = await new Promise(function(resolve, reject) {
                    var cbName = '_bikeCountCb' + Date.now();
                    var script = document.createElement('script');
                    var timeout = setTimeout(function() {
                        _pendingBikeJsonp = null;
                        delete window[cbName];
                        script.remove();
                        reject(new Error('JSONP timeout'));
                    }, 15000);
                    _pendingBikeJsonp = { cb: cbName, script: script, timeout: timeout };
                    window[cbName] = function(d) {
                        _pendingBikeJsonp = null;
                        clearTimeout(timeout);
                        delete window[cbName];
                        script.remove();
                        resolve(d);
                    };
                    script.src = jsonpUrl + '&limit=500&sort=_id+desc&callback=' + cbName;
                    script.onerror = function() {
                        _pendingBikeJsonp = null;
                        clearTimeout(timeout);
                        delete window[cbName];
                        script.remove();
                        reject(new Error('JSONP script error'));
                    };
                    document.head.appendChild(script);
                });
                setDevCache('sykkel', jsonpUrl, data);
            }

            var allRecords = data.result ? data.result.records : [];

            // Filter client-side by date
            var todayRecords = allRecords.filter(function(r) { return r.Date && r.Date.indexOf(today) === 0; });
            var lwRecords = allRecords.filter(function(r) { return r.Date && r.Date.indexOf(lastWeek) === 0; });

            bikeCountHours = parseBikeCountRecords(todayRecords);
            bikeCountLastWeek = parseBikeCountRecords(lwRecords);
            console.log('[' + SOURCES.sykkel.label + '] JSONP opencom.no \u2192 ' + allRecords.length + ' records (today: ' + todayRecords.length + ', lastWeek: ' + lwRecords.length + ')');

            computeBikeCountState();

            // Inject synthetic article (never bumped to top)
            if (bikeCountState.label) {
                rawFeeds.sykkel = [{
                    title: bikeCountState.label,
                    descHtml: bikeCountState.descHtml,
                    pubDate: new Date(now.getTime() - 2 * 3600000).toISOString(),
                    image: 'spark:sykkel',
                    source: 'sykkel',
                    categories: [],
                }];
                mergeFeedsAndRender();
            } else {
                scheduleTickerRebuild();
            }

            setSource('sykkel', 'ok');
        } catch (e) {
            console.log('[' + SOURCES.sykkel.label + '] JSONP opencom.no \u2192 ERROR ' + e.message);
            setSource('sykkel', 'error');
        }
    }

    setTimeout(function() { loadBikeCountData(); }, 34000);
    setInterval(loadBikeCountData, CONFIG.bikeCountRefresh);

    /* ═══ POLITILOGGEN ═══ */
    async function loadPoliceLog() {
        try {
            var data = await sourceFetch('politi', CONFIG.policeApi);
            if (!data || !data.messages || !data.messages.length) throw new Error('No messages');

            var messages = data.messages;

            // Group by threadId
            var threads = {};
            messages.forEach(function(msg) {
                var tid = msg.threadId || msg.id;
                if (!threads[tid]) threads[tid] = [];
                threads[tid].push(msg);
            });

            // Build one article per thread
            var articles = [];
            Object.keys(threads).forEach(function(tid) {
                var updates = threads[tid].sort(function(a, b) {
                    return parseDate(a.createdOn) - parseDate(b.createdOn);
                });
                var first = updates[0];
                var latest = updates[updates.length - 1];

                // Title is the place; the category rides on the card plate under the icon instead
                var category = first.category || 'Hendelse';
                var location = first.municipality || '';
                if (first.area) location += (location ? ', ' : '') + first.area;
                var title = location || category;

                // Build description from all updates (newest first)
                var isActive = latest.isActive;
                var descParts = [];
                var descHtmlParts = [];
                for (var u = updates.length - 1; u >= 0; u--) {
                    var upd = updates[u];
                    var txt = (upd.text || '').trim();
                    if (!txt) continue;
                    var time = new Date(upd.createdOn).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
                    descParts.push(time + ': ' + txt);
                    descHtmlParts.push('<span class="police-time">' + time + '</span> ' + escapeHtml(txt));
                }
                var desc = descParts.join(' | ');
                var descHtml = descHtmlParts.join('<br>');

                articles.push({
                    title: title,
                    desc: desc,
                    descHtml: descHtml,
                    pubDate: latest.createdOn,        // last update, so "case closed" activity counts as recency
                    image: latest.imageUrl || first.imageUrl || null,
                    source: 'politi',
                    categories: [],                   // the category is on the plate, no need to repeat it here
                    _isActive: isActive,
                    _threadId: tid,
                    _category: category,
                    _lastMs: parseDate(latest.createdOn),
                });
            });

            // Ongoing incidents always stay. Closed ones drop out once their last update ages out: the API returns
            // the last 50 messages whatever their age, which on a quiet week reaches back nearly a week.
            var cutoff = Date.now() - CONFIG.policeMaxAgeHours * 3600e3;
            var shown = articles.filter(function(a) { return a._isActive || !(a._lastMs < cutoff); });

            console.log('[' + SOURCES.politi.label + '] politiet.no \u2192 ' + shown.length + ' of ' + articles.length +
                ' threads within ' + CONFIG.policeMaxAgeHours + 'h (' + messages.length + ' messages)');
            rawFeeds.politi = shown;
            mergeFeedsAndRender();
            setSource('politi', 'ok');
        } catch (e) {
            console.log('[' + SOURCES.politi.label + '] politiet.no \u2192 ERROR ' + e.message);
            setSource('politi', 'error');
        }
    }

    setTimeout(function() { loadPoliceLog(); }, 36000);
    setInterval(loadPoliceLog, CONFIG.policeRefresh);

    /* ═══ WEATHER ═══ */
    var WX = {
        clearsky: ['\u2600\uFE0F','Klarvær'], fair: ['\uD83C\uDF24\uFE0F','Lettskyet'],
        partlycloudy: ['\u26C5','Delvis skyet'], cloudy: ['\u2601\uFE0F','Skyet'],
        lightrainshowers: ['\uD83C\uDF26\uFE0F','Lette regnbyger'], rainshowers: ['\uD83C\uDF26\uFE0F','Regnbyger'],
        heavyrainshowers: ['\uD83C\uDF27\uFE0F','Kraftige regnbyger'],
        lightrain: ['\uD83C\uDF27\uFE0F','Lett regn'], rain: ['\uD83C\uDF27\uFE0F','Regn'],
        heavyrain: ['\uD83C\uDF27\uFE0F','Kraftig regn'],
        lightsleetshowers: ['\uD83C\uDF28\uFE0F','Lette sluddbyger'], sleetshowers: ['\uD83C\uDF28\uFE0F','Sluddbyger'],
        lightsleet: ['\uD83C\uDF28\uFE0F','Lett sludd'], sleet: ['\uD83C\uDF28\uFE0F','Sludd'],
        lightsnowshowers: ['\uD83C\uDF28\uFE0F','Lette sn\u00f8byger'], snowshowers: ['\u2744\uFE0F','Sn\u00f8byger'],
        lightsnow: ['\u2744\uFE0F','Lett sn\u00f8'], snow: ['\u2744\uFE0F','Sn\u00f8'], heavysnow: ['\u2744\uFE0F','Kraftig sn\u00f8'],
        lightrainandthunder: ['\u26C8\uFE0F','Regn og torden'], rainandthunder: ['\u26C8\uFE0F','Regn og torden'],
        fog: ['\uD83C\uDF2B\uFE0F','T\u00e5ke'],
    };

    function wxLookup(code) {
        var base = code.replace(/_(day|night|polartwilight)$/, '');
        return WX[base] || ['\u2601\uFE0F', code];
    }

    function windDesc(ms) {
        if (ms < 0.3) return 'Stille';
        if (ms < 3.4) return 'Svak vind';
        if (ms < 8.0) return 'Moderat vind';
        if (ms < 13.9) return 'Frisk vind';
        if (ms < 20.8) return 'Liten storm';
        return 'Storm';
    }

    async function loadWeather() {
        try {
            var url = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=' + CONFIG.weatherLat + '&lon=' + CONFIG.weatherLon;
            var data = await sourceFetch('vaer', url, { headers: { 'User-Agent': 'PelifixInfoScreen/1.0' } });
            var ts = data.properties.timeseries[0];
            var inst = ts.data.instant.details;
            var temp = Math.round(inst.air_temperature);
            var wind = inst.wind_speed;
            var fc = ts.data.next_1_hours || ts.data.next_6_hours;
            var sym = wxLookup(fc ? fc.summary.symbol_code : 'cloudy');
            document.getElementById('weather-icon').textContent = sym[0];
            document.getElementById('weather-temp').textContent = temp + '\u00B0';
            document.getElementById('weather-desc').textContent = sym[1];
            document.getElementById('weather-detail').textContent = windDesc(wind) + ' ' + wind.toFixed(1) + ' m/s';
            document.getElementById('weather-location').textContent = CONFIG.weatherLocation;
            console.log('[' + SOURCES.vaer.label + '] met.no \u2192 ' + temp + '\u00B0, ' + sym[1]);
            setSource('vaer', 'ok');
        } catch (e) {
            console.log('[' + SOURCES.vaer.label + '] met.no \u2192 ERROR ' + e.message);
            document.getElementById('weather-desc').textContent = 'Feil ved lasting';
            setSource('vaer', 'error');
        }
    }

    setTimeout(function() { loadWeather(); }, 16000);
    setInterval(loadWeather, CONFIG.weatherRefresh);

    /* ═══ IMAGE SLIDESHOW LOADER ═══ */
    setTimeout(function() { loadImages(); }, 24000);
    setInterval(loadImages, CONFIG.imageRefresh);

    /* ═══ KEYBOARD SHORTCUTS (for browser testing) ═══ */
    function resetHeroTimer() {
        clearInterval(window._heroTimer);
        window._heroTimer = setInterval(function() {
            if (heroItems.length <= 1) return;
            heroIndex = (heroIndex + 1) % heroItems.length;
            renderHero(heroItems[heroIndex]);
            renderHeroProgress();
        }, CONFIG.heroInterval);
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowRight') {
            if (heroItems.length <= 1) return;
            heroIndex = (heroIndex + 1) % heroItems.length;
            renderHero(heroItems[heroIndex]);
            renderHeroProgress();
            resetHeroTimer();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            scrollFeed();
        }
    });

    /* ═══ CURSOR AUTO-HIDE ═══ */
    var cursorTimer = null;
    document.addEventListener('mousemove', function() {
        document.body.classList.remove('hide-cursor');
        if (cursorTimer) clearTimeout(cursorTimer);
        cursorTimer = setTimeout(function() {
            document.body.classList.add('hide-cursor');
        }, 3000);
    });

    /* ═══ PUBLIC API for add-on scripts (celebration.js / simen.js) ═══ */
    window.InfoScreen = {
        CONFIG: CONFIG,
        SOURCES: SOURCES,
        sourceFetch: sourceFetch,
        setSource: setSource,
        escapeHtml: escapeHtml,
        buildSparklineSvg: buildSparklineSvg,
        tickerBlocks: [],                 // functions returning ticker HTML (or '')
        rebuildTicker: scheduleTickerRebuild,
        pauseSlideshow: false,            // set true to freeze the sidebar image slot
    };

    /* ═══ LOADING ═══ */
    window.addEventListener('load', function() {
        setTimeout(function() {
            document.getElementById('loading').classList.add('hidden');
        }, 1500);
    });

})();
