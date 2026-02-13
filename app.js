// app.js — Author: Christer Grimsæth

(function() {
    'use strict';

    var CONFIG = {
        corsProxy: 'https://api.codetabs.com/v1/proxy/?quest=',
        rssApi: 'https://api.rss2json.com/v1/api.json?rss_url=',
        feeds: {
            news: 'https://www.nrk.no/toppsaker.rss',
            sport: 'https://www.nrk.no/sport/toppsaker.rss',
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
        tickerSpeed: 100,
        slideInterval: 12000,
        heroInterval: 14000,
        heroCount: 8,
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
        busStop: 'NSR:StopPlace:26354',
        busStopName: 'Vestre Svanholmen',
        busDepartures: 5,
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
    };

    /* ═══ SOURCE STATUS TRACKING ═══ */
    var SOURCES = {
        nyheter:     { label: 'NRK',         status: 'pending', refresh: CONFIG.feedRefresh },
        sport:       { label: 'NRK Sport',   status: 'pending', refresh: CONFIG.feedRefresh },
        e24:         { label: 'E24',         status: 'pending', refresh: CONFIG.feedRefresh },
        aftenbladet: { label: 'Aftenbladet', status: 'pending', refresh: CONFIG.feedRefresh },
        vg:          { label: 'VG',          status: 'pending', refresh: CONFIG.feedRefresh },
        vgSport:     { label: 'VG Sport',    status: 'pending', refresh: CONFIG.feedRefresh },
        dn:          { label: 'DN',          status: 'pending', refresh: CONFIG.feedRefresh },
        tu:          { label: 'TU',          status: 'pending', refresh: CONFIG.feedRefresh },
        strompris:   { label: 'Strøm',       status: 'pending', refresh: CONFIG.stromprisRefresh },
        trafikk:     { label: 'Trafikk',     status: 'pending', refresh: CONFIG.trafficRefresh },
        sykkel:      { label: 'Sykkel',      status: 'pending', refresh: CONFIG.bikeCountRefresh },
        marked:      { label: 'Marked',      status: 'pending', refresh: CONFIG.financeRefresh },
        vaer:        { label: 'V\u00e6r',    status: 'pending', refresh: CONFIG.weatherRefresh },
        bilder:      { label: 'Bilder',      status: 'pending', refresh: CONFIG.imageRefresh },
        bysykler:    { label: 'Bysykler',    status: 'pending', refresh: CONFIG.bikeRefresh },
        buss:        { label: 'Buss',        status: 'pending', refresh: CONFIG.busRefresh },
        konserthus:  { label: 'Konserthus',  status: 'pending', refresh: CONFIG.eventsRefresh },
        folken:      { label: 'Folken',      status: 'pending', refresh: CONFIG.eventsRefresh },
    };

    var preRefreshTimers = {};

    var FEED_META = {
        news:        { srcKey: 'nyheter',     label: 'NRK',         color: 'src-nrk' },
        sport:       { srcKey: 'sport',       label: 'NRK Sport',   color: 'src-nrk-sport' },
        e24:         { srcKey: 'e24',         label: 'E24',         color: 'src-e24' },
        aftenbladet: { srcKey: 'aftenbladet', label: 'Aftenbladet', color: 'src-aftenbladet' },
        vg:          { srcKey: 'vg',          label: 'VG',          color: 'src-vg' },
        vgSport:     { srcKey: 'vgSport',     label: 'VG Sport',    color: 'src-vg-sport' },
        dn:          { srcKey: 'dn',          label: 'DN',          color: 'src-dn' },
        tu:          { srcKey: 'tu',          label: 'TU',          color: 'src-tu' },
        strompris:   { srcKey: 'strompris',   label: 'Strømpris',   color: 'src-strompris' },
        trafikk:     { srcKey: 'trafikk',     label: 'E39 Trafikk', color: 'src-trafikk' },
        sykkel:      { srcKey: 'sykkel',      label: 'Sykkeldata',  color: 'src-sykkel' },
    };

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

    /* ═══ HELPERS ═══ */
    var dayN = ['s\u00f8ndag','mandag','tirsdag','onsdag','torsdag','fredag','l\u00f8rdag'];
    var monN = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];
    var monShort = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];

    function timeAgo(dateStr) {
        var d = dateStr;
        if (d && !/[Z+\-]\d/.test(d.slice(-6)) && d.slice(-1) !== 'Z') d += 'Z';
        var diff = Date.now() - new Date(d).getTime();
        var mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Akkurat n\u00e5';
        if (mins < 60) return mins + ' min siden';
        var hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + ' t siden';
        return Math.floor(hrs / 24) + ' d siden';
    }

    function escapeHtml(str) {
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
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

    function renderHero(item) {
        if (!item) return;
        if (item.title === currentHeroTitle) return;
        currentHeroTitle = item.title;

        var meta = FEED_META[item.source];
        var colorClass = meta ? meta.color : '';
        var badgeText = meta ? meta.label : 'Siste nytt';
        var isSpark = item.image && item.image.indexOf('spark:') === 0;
        var sparkType = isSpark ? item.image.slice(6) : '';
        var imgContent = sparkType === 'trafikk'
            ? buildTrafficCardHtml('large')
            : isSpark
                ? buildPriceCardHtml('large')
                : item.image
                    ? '<img src="' + escapeHtml(item.image) + '" alt="">'
                    : '<div class="hero-no-img">\u{1F4F0}</div>';

        var html =
            '<div class="hero-img-wrap">' +
                '<div class="hero-badges"><div class="hero-badge ' + colorClass + '">' + badgeText + '</div>' +
                '<div class="hero-top-badge">TOPP</div></div>' +
                imgContent +
            '</div>' +
            '<div class="hero-text">' +
                '<div class="hero-title">' + escapeHtml(item.title) + '</div>' +
                (item.descHtml ? '<div class="hero-desc">' + item.descHtml + '</div>' : item.desc ? '<div class="hero-desc">' + escapeHtml(item.desc) + '</div>' : '') +
                '<div class="hero-time">' + formatTimeCats(item) + '</div>' +
            '</div>';

        var cards = heroEl.querySelectorAll('.hero-card');
        var newCard = document.createElement('div');
        newCard.className = 'hero-card';
        newCard.innerHTML = html;
        heroEl.insertBefore(newCard, heroEl.querySelector('.hero-divider'));
        void newCard.offsetWidth;

        // Dynamically shrink hero description font if text overflows
        var heroDesc = newCard.querySelector('.hero-desc');
        if (heroDesc) {
            var fontSize = 1.6;
            var minSize = 0.95;
            var step = 0.05;
            while (fontSize > minSize && heroDesc.scrollHeight > heroDesc.clientHeight) {
                fontSize -= step;
                heroDesc.style.fontSize = fontSize + 'rem';
                heroDesc.style.lineHeight = String(1.35 + (fontSize - minSize) * 0.375);
            }
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
        div.className = 'article' + (isLatest ? ' article-latest ' + colorClass : '');
        div.setAttribute('data-source', item.source);
        div.setAttribute('data-title', item.title);
        var isSpark = item.image && item.image.indexOf('spark:') === 0;
        var sparkType = isSpark ? item.image.slice(6) : '';
        var imgHtml = sparkType === 'sykkel'
            ? '<div class="article-img">' + buildBikeCountCardHtml() + '</div>'
            : sparkType === 'trafikk'
                ? '<div class="article-img">' + buildTrafficCardHtml('small') + '</div>'
                : isSpark
                    ? '<div class="article-img">' + buildPriceCardHtml('small') + '</div>'
                    : item.image
                    ? '<div class="article-img"><img src="' + escapeHtml(item.image) + '" alt="" loading="lazy"></div>'
                    : '<div class="article-img no-image">\u{1F4F0}</div>';
        var nyBadge = isLatest ? '<div class="article-ny">NY</div>' : '';
        var imgWithBadge = '<div class="article-img-wrap">' +
                imgHtml +
                '<div class="article-badges"><div class="article-source-overlay ' + colorClass + '">' + (meta ? meta.label : 'Nyheter') + '</div>' + nyBadge + '</div>' +
            '</div>';
        div.innerHTML =
            '<div class="article-body">' +
                imgWithBadge +
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
        el.style.padding = '0 16px';
        col.insertBefore(el, col.firstChild);
        void el.offsetWidth;
        // Expand to full height, then fade in content
        el.style.transition = 'max-height 0.6s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s ease 0.3s, padding 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
        el.style.maxHeight = '400px';
        el.style.opacity = '1';
        el.style.padding = '14px 16px';
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
        merged.sort(function(a, b) { return new Date(b.pubDate || 0) - new Date(a.pubDate || 0); });

        // Hero: newest article from each source (before dedup so NTB dupes don't steal slots)
        heroItems = [];
        var heroSeen = {};
        var heroTitles = {};
        var heroSkip = { sykkel: 1 };
        for (var h = 0; h < merged.length && heroItems.length < CONFIG.heroCount; h++) {
            var src = merged[h].source || '';
            if (heroSkip[src] || heroSeen[src]) continue;
            var heroKey = merged[h].title.toLowerCase().trim().replace(/[\s\u2013\u2014\-–—:]+/g, ' ');
            if (heroTitles[heroKey]) continue;
            heroSeen[src] = true;
            heroTitles[heroKey] = true;
            heroItems.push(merged[h]);
        }

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
        var remaining = all.filter(function(item) { return !heroSet[item.title.toLowerCase().trim()]; });
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

    async function loadFeed(type) {
        var meta = FEED_META[type];
        var srcKey = meta ? meta.srcKey : type;
        setSource(srcKey, 'loading');
        try {
            var url = CONFIG.rssApi + encodeURIComponent(CONFIG.feeds[type]);
            var resp = await fetch(url, { cache: 'no-store' });
            if (!resp.ok) throw new Error('Feed fetch failed: ' + type);
            var data = await resp.json();
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
                };
            }).filter(function(a) { return a.title; });
            mergeFeedsAndRender();
            setSource(srcKey, 'ok');
        } catch (err) {
            console.warn('Feed load error (' + type + '):', err);
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
            div.className = 'di-slide ' + (i % 2 === 0 ? 'kb-a' : 'kb-b') + (i === 0 ? ' active' : '');
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
            var bingRss = CONFIG.rssApi + encodeURIComponent('https://www.bing.com/HPImageArchive.aspx?format=rss&idx=0&n=3&mkt=en-US');
            var resp = await fetch(bingRss, { cache: 'no-store' });
            if (resp.ok) {
                var data = await resp.json();
                if (data.status === 'ok' && data.items && data.items.length) {
                    data.items.forEach(function(item) {
                        var caption = (item.title || 'Bing').split('(')[0].trim();
                        var imgUrl = (item.link || item.thumbnail || '').replace('http://', 'https://');
                        if (imgUrl) {
                            bingImgs.push({ src: imgUrl, caption: caption, live: false });
                        }
                    });
                }
            }
        } catch (e) { console.warn('Bing wallpaper error:', e); }
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
        if (images.length) {
            buildSlideshow(images);
            setSource('bilder', 'ok');
        } else {
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
        var todayStr = new Date().toISOString().substring(0, 10);
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
        var url = CONFIG.corsProxy + encodeURIComponent('https://www.stavanger-konserthus.no/program/');
        var resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) throw new Error('Konserthus fetch failed');
        var html = await resp.text();
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
        var url = CONFIG.corsProxy + encodeURIComponent('https://www.folken.no/folken/index.php');
        var resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) throw new Error('Folken fetch failed');
        var html = await resp.text();
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

    async function loadEvents() {
        setSource('konserthus', 'loading');
        setSource('folken', 'loading');
        try {
            var results = await Promise.allSettled([scrapeKonserthus(), scrapeFolken()]);
            var srcKeys = ['konserthus', 'folken'];
            var all = [];
            results.forEach(function(r, idx) {
                if (r.status === 'fulfilled') {
                    all = all.concat(r.value);
                    setSource(srcKeys[idx], 'ok');
                } else {
                    console.warn(srcKeys[idx] + ' scrape failed:', r.reason);
                    setSource(srcKeys[idx], 'error');
                }
            });

            if (!all.length) { renderEvents(FALLBACK_EVENTS); return; }

            var now = new Date();
            var nowStr = now.toISOString().substring(0, 10);
            var maxDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
            var maxStr = maxDate.toISOString().substring(0, 10);
            all = all.filter(function(e) {
                var d = e.date && e.date.substring(0, 10);
                return d && d >= nowStr && d <= maxStr;
            });
            all.sort(function(a, b) { return a.date.localeCompare(b.date); });

            var events = all.map(function(e) {
                return { icon: e.icon, rawDate: e.date, title: e.title, venue: e.venue, image: e.image || '' };
            });

            renderEvents(events.length ? events : FALLBACK_EVENTS);
        } catch (e) {
            console.warn('Events scrape error:', e);
            setSource('konserthus', 'error');
            setSource('folken', 'error');
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

    function renderBusDepartures(calls) {
        busEl.innerHTML = '';
        if (!calls.length) {
            busEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.85rem;">Ingen avganger</div>';
            return;
        }
        calls.forEach(function(c) {
            var line = c.serviceJourney.line.publicCode;
            var dest = c.destinationDisplay.frontText;
            var timeStr = formatBusTime(c.expectedDepartureTime);
            var isRt = c.realtime;
            var div = document.createElement('div');
            div.className = 'bus-item';
            div.innerHTML =
                '<div class="bus-line">' + escapeHtml(line) + '</div>' +
                '<div class="bus-dest">' + escapeHtml(dest) + '</div>' +
                '<div class="bus-time">' + (isRt ? '<span class="bus-rt"></span>' : '') + timeStr + '</div>';
            busEl.appendChild(div);
        });
    }

    async function loadBusDepartures() {
        setSource('buss', 'loading');
        try {
            var resp = await fetch('https://api.entur.io/journey-planner/v3/graphql', {
                method: 'POST',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                    'ET-Client-Name': 'pelifix-infoscreen',
                },
                body: JSON.stringify({ query: BUS_QUERY }),
            });
            if (!resp.ok) throw new Error('Entur API failed');
            var data = await resp.json();
            var sp = data.data.stopPlace;
            var calls = sp.estimatedCalls || [];
            document.getElementById('bus-stop-name').textContent = sp.name;
            renderBusDepartures(calls);
            setSource('buss', 'ok');
        } catch (e) {
            console.warn('Bus departures error:', e);
            setSource('buss', 'error');
        }
    }

    setTimeout(function() { loadBusDepartures(); }, 14000);
    setInterval(loadBusDepartures, CONFIG.busRefresh);

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
            var headers = { 'ET-Client-Name': 'pelifix-infoscreen' };
            var opts = { cache: 'no-store', headers: headers };
            var results = await Promise.all([
                fetch('https://api.entur.io/mobility/v2/gbfs/v3/kolumbusbysykkel/station_information', opts),
                fetch('https://api.entur.io/mobility/v2/gbfs/v3/kolumbusbysykkel/station_status', opts)
            ]);
            if (!results[0].ok || !results[1].ok) throw new Error('GBFS API failed');
            var infoData = await results[0].json();
            var statusData = await results[1].json();

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

            renderBikeStations(stations);
            setSource('bysykler', 'ok');
        } catch (e) {
            console.warn('Bike stations error:', e);
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
        var parts = [];
        var newsIdx = 0;
        var chunk = 2;
        var dataSlot = 0; // 0 = marked, 1 = strøm, 2 = trafikk, 3 = sykkel

        while (newsIdx < headlines.length) {
            var slice = headlines.slice(newsIdx, newsIdx + chunk);
            slice.forEach(function(h) {
                parts.push('<span>' + escapeHtml(h) + '</span>');
                parts.push('<span class="sep">\u2022</span>');
            });
            newsIdx += chunk;

            if (dataSlot === 0 && tkFinancial.length) {
                tkFinancial.forEach(function(f) {
                    var chg = f.change ? fmtChange(f.change) : '';
                    parts.push('<span class="fin-item"><span class="fin-val">' + escapeHtml(f.value) + '</span><span class="fin-meta"><span class="fin-cur">' + escapeHtml(f.label) + '</span>' + chg + '</span></span>');
                });
                parts.push('<span class="sep">\u2022</span>');
            } else if (dataSlot === 1 && tkElectricity.length) {
                if (tkSparkData.length >= 2) {
                    parts.push('<span class="elec-spark">' + buildSparklineSvg(tkSparkData) + '</span>');
                }
                tkElectricity.forEach(function(e) {
                    parts.push('<span class="elec-item"><span class="elec-val">' + escapeHtml(e.value) + '</span><span class="elec-meta"><span class="elec-label">' + escapeHtml(e.label) + '</span><span class="elec-unit">kr/kWh</span></span></span>');
                });
                parts.push('<span class="sep">\u2022</span>');
            } else if (dataSlot === 2 && trafficState.currentVol) {
                if (trafficHours.length >= 2) {
                    parts.push('<span class="traffic-spark">' + buildSparklineSvg(trafficHours.map(function(h) { return h.total; }), '#f97316') + '</span>');
                }
                parts.push('<span class="traffic-item"><span class="traffic-val">' + trafficState.currentVol + '</span><span class="traffic-meta"><span class="traffic-label">' + escapeHtml(trafficState.level) + '</span><span class="traffic-unit">kjt/t</span></span></span>');
                parts.push('<span class="sep">\u2022</span>');
            } else if (dataSlot === 3 && bikeCountState.todayTotal) {
                if (bikeCountHours.length >= 2) {
                    parts.push('<span class="bike-count-spark">' + buildSparklineSvg(bikeCountHours.map(function(h) { return h.count; }), '#10b981') + '</span>');
                }
                parts.push('<span class="bike-count-item"><span class="bike-count-val">' + bikeCountState.todayTotal + '</span><span class="bike-count-meta"><span class="bike-count-label">syklister</span><span class="bike-count-unit">M\u00f8llebukta</span></span></span>');
                parts.push('<span class="sep">\u2022</span>');
            }
            dataSlot = (dataSlot + 1) % 4;
        }

        var html = parts.join('');
        tickerEl.innerHTML = html + html;
        var halfWidth = tickerEl.scrollWidth / 2;
        var duration = halfWidth / CONFIG.tickerSpeed;
        tickerEl.style.animation = 'none';
        void tickerEl.offsetWidth;
        tickerEl.style.animation = 'ticker-scroll ' + duration + 's linear infinite';
    }

    function fmtChange(pct) {
        if (Math.abs(pct) < 0.01) return '';
        var arrow = pct > 0 ? '\u25B2' : '\u25BC';
        return '<span class="fin-chg ' + (pct > 0 ? 'up' : 'down') + '">' + arrow + Math.abs(pct).toFixed(1) + '%</span>';
    }

    async function loadFinancialData() {
        setSource('marked', 'loading');
        try {
            // Fetch exchange rates from Norges Bank
            var nbUrl = 'https://data.norges-bank.no/api/data/EXR/B.USD+EUR+GBP.NOK.SP?format=sdmx-json&lastNObservations=2';
            var url = CONFIG.corsProxy + encodeURIComponent(nbUrl);
            var resp = await fetch(url, { cache: 'no-store' });
            if (!resp.ok) throw new Error('Norges Bank API failed');
            var data = await resp.json();

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

            buildTickerContent();
            setSource('marked', 'ok');
        } catch (e) {
            console.warn('Financial data error:', e);
            setSource('marked', 'error');
            tkFinancial = [
                { label: 'USD/NOK', value: '\u2013', change: 0 },
                { label: 'EUR/NOK', value: '\u2013', change: 0 },
                { label: 'GBP/NOK', value: '\u2013', change: 0 },
            ];
            buildTickerContent();
        }
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

    function buildPriceCardSvg(data, w, h) {
        if (!data || data.length < 2) return '';
        var pad = 4;
        var min = Math.min.apply(null, data);
        var max = Math.max.apply(null, data);
        var range = max - min || 1;
        // Build polyline points — line sits in lower 60% of SVG
        var top = h * 0.3, bot = h - pad;
        var pts = data.map(function(v, i) {
            var x = pad + (i / (data.length - 1)) * (w - pad * 2);
            var y = top + (1 - (v - min) / range) * (bot - top);
            return x.toFixed(1) + ',' + y.toFixed(1);
        });
        var polyline = pts.join(' ');
        // Closed area fill path
        var areaPath = 'M' + pts[0] + ' ' + pts.slice(1).map(function(p) { return 'L' + p; }).join(' ') +
            ' L' + (w - pad) + ',' + h + ' L' + pad + ',' + h + ' Z';
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">' +
            '<defs><linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#38bdf8" stop-opacity="0.4"/>' +
            '<stop offset="100%" stop-color="#38bdf8" stop-opacity="0.05"/>' +
            '</linearGradient></defs>' +
            '<path d="' + areaPath + '" fill="url(#spark-fill)"/>' +
            '<polyline points="' + polyline + '" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
            '</svg>';
    }

    function buildPriceCardHtml(size) {
        var price = tkElectricity.length ? tkElectricity[0].value : '';
        var svg = buildPriceCardSvg(tkSparkData, 400, 200);
        var fontSize = size === 'large' ? '5rem' : '2rem';
        var priceSize = size === 'large' ? '2.4rem' : '1rem';
        var unitSize = size === 'large' ? '0.9rem' : '0.55rem';
        return '<div class="price-card-visual">' +
            '<div class="price-card-spark">' + svg + '</div>' +
            '<div class="price-card-overlay">' +
                '<div class="price-card-emoji" style="font-size:' + fontSize + ';">\u26A1</div>' +
                (price ? '<div class="price-card-price" style="font-size:' + priceSize + ';">' + escapeHtml(price) + '<span class="price-card-unit" style="font-size:' + unitSize + ';"> kr/kWh</span></div>' : '') +
            '</div>' +
        '</div>';
    }

    async function fetchDayPrices(date) {
        var url = 'https://www.hvakosterstrommen.no/api/v1/prices/' + formatDateParam(date) + '_' + CONFIG.stromprisRegion + '.json';
        var resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) return null;
        return resp.json();
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
            var todayData = results[0].status === 'fulfilled' ? results[0].value : null;
            var tomorrowData = results[1].status === 'fulfilled' ? results[1].value : null;

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
                var dayData = results[s].status === 'fulfilled' ? results[s].value : null;
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

            buildTickerContent();
            setSource('strompris', 'ok');
        } catch (e) {
            console.warn('Electricity price error:', e);
            setSource('strompris', 'error');
        }
    }

    setTimeout(function() { loadElectricityPrices(); }, 22000);
    setInterval(loadElectricityPrices, CONFIG.stromprisRefresh);

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

        // vs last week
        var vsWeek = '';
        if (trafficLastWeek.length) {
            var sameHour = null;
            for (var i = 0; i < trafficLastWeek.length; i++) {
                if (trafficLastWeek[i].hour === cur.hour) { sameHour = trafficLastWeek[i]; break; }
            }
            if (sameHour && sameHour.total > 0) {
                var diff = Math.round(((vol - sameHour.total) / sameHour.total) * 100);
                vsWeek = (diff >= 0 ? '+' : '') + diff + '% vs forrige ' + dayN[new Date().getDay()].toLowerCase();
            }
        }

        // Direction insight
        var dirLabel = '';
        if (hour < 12) {
            dirLabel = 'Mot Stavanger: ' + cur.north;
        } else {
            dirLabel = 'Mot Sandnes: ' + cur.south;
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

        // Description (HTML with line breaks and emojis)
        var descLines = [];
        descLines.push('\u2B06\uFE0F Mot Stavanger: ' + cur.north + ' kjt/t');
        descLines.push('\u2B07\uFE0F Mot Sandnes: ' + cur.south + ' kjt/t');
        if (trend) descLines.push((trend === 'Trafikken \u00f8ker' ? '\uD83D\uDD3A' : trend === 'Trafikken avtar' ? '\uD83D\uDD3B' : '\u27A1\uFE0F') + ' ' + trend);
        if (vsWeek) descLines.push('\uD83D\uDCC5 ' + vsWeek);

        trafficState = {
            level: level,
            trend: trend,
            label: title,
            descHtml: descLines.join('<br>'),
            currentVol: vol,
        };
    }

    function buildTrafficCardSvg(todayData, lastWeekData, w, h) {
        if (!todayData || todayData.length < 2) return '';
        var pad = 4;
        // Shared scale across both datasets
        var allVals = todayData.map(function(d) { return d.total; });
        if (lastWeekData && lastWeekData.length) {
            allVals = allVals.concat(lastWeekData.map(function(d) { return d.total; }));
        }
        var min = Math.min.apply(null, allVals);
        var max = Math.max.apply(null, allVals);
        var range = max - min || 1;
        var top = h * 0.15, bot = h - pad;

        function hourToX(hr) { return pad + (hr / 23) * (w - pad * 2); }
        function valToY(v) { return top + (1 - (v - min) / range) * (bot - top); }
        function buildPoints(arr) {
            return arr.map(function(d) {
                return hourToX(parseInt(d.hour)).toFixed(1) + ',' + valToY(d.total).toFixed(1);
            });
        }

        var todayPts = buildPoints(todayData);
        var polyline = todayPts.join(' ');
        var lastHr = parseInt(todayData[todayData.length - 1].hour);
        var lastX = hourToX(lastHr);
        var firstX = hourToX(parseInt(todayData[0].hour));
        var areaPath = 'M' + todayPts[0] + ' ' + todayPts.slice(1).map(function(p) { return 'L' + p; }).join(' ') +
            ' L' + lastX.toFixed(1) + ',' + h + ' L' + firstX.toFixed(1) + ',' + h + ' Z';

        // Last week reference line
        var lwLine = '';
        if (lastWeekData && lastWeekData.length >= 2) {
            var lwPts = buildPoints(lastWeekData);
            lwLine = '<polyline points="' + lwPts.join(' ') + '" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" stroke-dasharray="4,4" stroke-linejoin="round" stroke-linecap="round"/>';
        }

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">' +
            '<defs><linearGradient id="traffic-fill" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#f97316" stop-opacity="0.4"/>' +
            '<stop offset="100%" stop-color="#f97316" stop-opacity="0.05"/>' +
            '</linearGradient></defs>' +
            lwLine +
            '<path d="' + areaPath + '" fill="url(#traffic-fill)"/>' +
            '<polyline points="' + polyline + '" fill="none" stroke="#f97316" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
            '</svg>';
    }

    function buildTrafficCardHtml(size) {
        var vol = trafficState.currentVol || '';
        var svg = buildTrafficCardSvg(trafficHours, trafficLastWeek, 400, 200);
        var fontSize = size === 'large' ? '5rem' : '2rem';
        var volSize = size === 'large' ? '2.4rem' : '1rem';
        var unitSize = size === 'large' ? '0.9rem' : '0.55rem';
        return '<div class="traffic-card-visual">' +
            '<div class="traffic-card-spark">' + svg + '</div>' +
            '<div class="traffic-card-overlay">' +
                '<div class="traffic-card-emoji" style="font-size:' + fontSize + ';">\uD83D\uDE97</div>' +
                (vol ? '<div class="traffic-card-vol" style="font-size:' + volSize + ';">' + vol + '<span class="traffic-card-unit" style="font-size:' + unitSize + ';"> kjt/t</span></div>' : '') +
            '</div>' +
        '</div>';
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
        setSource('trafikk', 'loading');
        try {
            var now = new Date();
            var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            var lastWeekDay = new Date(today.getTime() - 7 * 86400000);
            var todayStr = toLocalIso(today);
            var nowStr = toLocalIso(now);
            var lwStart = toLocalIso(lastWeekDay);
            var lwEnd = toLocalIso(new Date(lastWeekDay.getTime() + 86400000));

            var query = '{ today: trafficData(trafficRegistrationPointId: "' + CONFIG.trafficPointId + '") { volume { byHour(from: "' + todayStr + '", to: "' + nowStr + '") { edges { node { from total { volumeNumbers { volume } } byDirection { heading total { volumeNumbers { volume } } } } } } } } lastWeek: trafficData(trafficRegistrationPointId: "' + CONFIG.trafficPointId + '") { volume { byHour(from: "' + lwStart + '", to: "' + lwEnd + '") { edges { node { from total { volumeNumbers { volume } } byDirection { heading total { volumeNumbers { volume } } } } } } } } }';

            var resp = await fetch(CONFIG.trafficGraphQL, {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query }),
            });
            if (!resp.ok) throw new Error('Vegvesen API failed');
            var data = await resp.json();

            var todayEdges = data.data.today.volume.byHour.edges;
            var lwEdges = data.data.lastWeek.volume.byHour.edges;
            trafficHours = parseTrafficHours(todayEdges);
            trafficLastWeek = parseTrafficHours(lwEdges);
            console.log('Traffic: today=' + trafficHours.length + 'h, lastWeek=' + trafficLastWeek.length + 'h', trafficHours);

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
            }

            buildTickerContent();
            setSource('trafikk', 'ok');
        } catch (e) {
            console.warn('Traffic data error:', e);
            setSource('trafikk', 'error');
        }
    }

    setTimeout(function() { loadTrafficData(); }, 26000);
    setInterval(loadTrafficData, CONFIG.trafficRefresh);

    /* ═══ BIKE COUNTER (Møllebukta) ═══ */
    var bikeCountHours = [];
    var bikeCountLastWeek = [];
    var bikeCountState = { todayTotal: 0, currentHour: 0, trend: '', label: '', descHtml: '', avgSpeed: 0, temp: 0 };

    function computeBikeCountState() {
        if (!bikeCountHours.length) return;
        var total = 0;
        bikeCountHours.forEach(function(h) { total += h.count; });
        var cur = bikeCountHours[bikeCountHours.length - 1];
        var prev = bikeCountHours.length > 1 ? bikeCountHours[bikeCountHours.length - 2] : null;

        // Trend
        var trend = '';
        if (prev && prev.count > 0) {
            var pct = ((cur.count - prev.count) / prev.count) * 100;
            if (pct > 20) trend = 'Flere syklister';
            else if (pct < -20) trend = 'F\u00e6rre syklister';
            else trend = 'Stabilt';
        }

        // vs last week
        var vsWeek = '';
        var lwTotal = 0;
        if (bikeCountLastWeek.length) {
            bikeCountLastWeek.forEach(function(h) { lwTotal += h.count; });
            if (lwTotal > 0) {
                var diff = Math.round(((total - lwTotal) / lwTotal) * 100);
                vsWeek = (diff >= 0 ? '+' : '') + diff + '% vs forrige ' + dayN[new Date().getDay()].toLowerCase();
            }
        }

        // Average speed and temp from latest hour
        var avgSpeed = cur.speed || 0;
        var temp = cur.temp;

        // Dynamic title
        var title;
        if (total === 0) {
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
        descLines.push('\uD83D\uDEB4 ' + total + ' syklister totalt i dag');
        descLines.push('\u23F1\uFE0F Siste time: ' + cur.count);
        if (avgSpeed > 0) descLines.push('\uD83D\uDCA8 Snittfart: ' + avgSpeed + ' km/t');
        if (temp !== null && temp !== undefined) descLines.push('\uD83C\uDF21\uFE0F Veitemp: ' + temp + '\u00b0C');
        if (vsWeek) descLines.push('\uD83D\uDCC5 ' + vsWeek);

        bikeCountState = {
            todayTotal: total,
            currentHour: cur.count,
            trend: trend,
            label: title,
            descHtml: descLines.join('<br>'),
            avgSpeed: avgSpeed,
            temp: temp,
        };
    }

    function buildBikeCountCardSvg(todayData, lastWeekData, w, h) {
        if (!todayData || todayData.length < 2) return '';
        var pad = 4;
        var allVals = todayData.map(function(d) { return d.count; });
        if (lastWeekData && lastWeekData.length) {
            allVals = allVals.concat(lastWeekData.map(function(d) { return d.count; }));
        }
        var min = 0;
        var max = Math.max.apply(null, allVals);
        var range = max - min || 1;
        var top = h * 0.15, bot = h - pad;

        function hourToX(hr) { return pad + (hr / 23) * (w - pad * 2); }
        function valToY(v) { return top + (1 - (v - min) / range) * (bot - top); }
        function buildPoints(arr) {
            return arr.map(function(d) {
                return hourToX(parseInt(d.hour)).toFixed(1) + ',' + valToY(d.count).toFixed(1);
            });
        }

        var todayPts = buildPoints(todayData);
        var polyline = todayPts.join(' ');
        var lastHr = parseInt(todayData[todayData.length - 1].hour);
        var lastX = hourToX(lastHr);
        var firstX = hourToX(parseInt(todayData[0].hour));
        var areaPath = 'M' + todayPts[0] + ' ' + todayPts.slice(1).map(function(p) { return 'L' + p; }).join(' ') +
            ' L' + lastX.toFixed(1) + ',' + h + ' L' + firstX.toFixed(1) + ',' + h + ' Z';

        var lwLine = '';
        if (lastWeekData && lastWeekData.length >= 2) {
            var lwPts = buildPoints(lastWeekData);
            lwLine = '<polyline points="' + lwPts.join(' ') + '" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" stroke-dasharray="4,4" stroke-linejoin="round" stroke-linecap="round"/>';
        }

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">' +
            '<defs><linearGradient id="bike-count-fill" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#10b981" stop-opacity="0.4"/>' +
            '<stop offset="100%" stop-color="#10b981" stop-opacity="0.05"/>' +
            '</linearGradient></defs>' +
            lwLine +
            '<path d="' + areaPath + '" fill="url(#bike-count-fill)"/>' +
            '<polyline points="' + polyline + '" fill="none" stroke="#10b981" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
            '</svg>';
    }

    function buildBikeCountCardHtml() {
        var total = bikeCountState.todayTotal || '';
        var svg = buildBikeCountCardSvg(bikeCountHours, bikeCountLastWeek, 400, 200);
        return '<div class="bike-count-card-visual">' +
            '<div class="bike-count-card-spark">' + svg + '</div>' +
            '<div class="bike-count-card-overlay">' +
                '<div class="bike-count-card-emoji" style="font-size:2rem;">\uD83D\uDEB2</div>' +
                (total ? '<div class="bike-count-card-vol" style="font-size:1rem;">' + total + '<span class="bike-count-card-unit" style="font-size:0.55rem;"> i dag</span></div>' : '') +
            '</div>' +
        '</div>';
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

            // Simple URL — fetch recent records via CORS proxy, filter client-side
            var apiUrl = CONFIG.bikeCountApi + '?resource_id=' + CONFIG.bikeCountResource + '&limit=500&sort=_id+desc';
            var proxyUrl = CONFIG.corsProxy + encodeURIComponent(apiUrl);

            var resp = await fetch(proxyUrl);
            if (!resp.ok) throw new Error('Bike count proxy HTTP ' + resp.status);
            var text = await resp.text();
            var data;
            try { data = JSON.parse(text); }
            catch (e) { throw new Error('Bike count not JSON: ' + text.substring(0, 100)); }

            var allRecords = data.result ? data.result.records : [];

            // Filter client-side by date
            var todayRecords = allRecords.filter(function(r) { return r.Date && r.Date.indexOf(today) === 0; });
            var lwRecords = allRecords.filter(function(r) { return r.Date && r.Date.indexOf(lastWeek) === 0; });

            bikeCountHours = parseBikeCountRecords(todayRecords);
            bikeCountLastWeek = parseBikeCountRecords(lwRecords);
            console.log('Bike count: total=' + allRecords.length + ', today=' + todayRecords.length + ', lastWeek=' + lwRecords.length + ', hours=' + bikeCountHours.length, bikeCountHours);

            computeBikeCountState();

            // Inject synthetic article (never bumped to top)
            if (bikeCountHours.length) {
                rawFeeds.sykkel = [{
                    title: bikeCountState.label,
                    descHtml: bikeCountState.descHtml,
                    pubDate: new Date(now.getTime() - 2 * 3600000).toISOString(),
                    image: 'spark:sykkel',
                    source: 'sykkel',
                    categories: [],
                }];
                mergeFeedsAndRender();
            }

            buildTickerContent();
            setSource('sykkel', 'ok');
        } catch (e) {
            console.warn('Bike count error:', e);
            setSource('sykkel', 'error');
        }
    }

    setTimeout(function() { loadBikeCountData(); }, 34000);
    setInterval(loadBikeCountData, CONFIG.bikeCountRefresh);

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
        setSource('vaer', 'loading');
        try {
            var url = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=' + CONFIG.weatherLat + '&lon=' + CONFIG.weatherLon;
            var resp = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'PelifixInfoScreen/1.0' } });
            if (!resp.ok) throw new Error('Weather failed');
            var data = await resp.json();
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
            setSource('vaer', 'ok');
        } catch (e) {
            console.warn('Weather error:', e);
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

    /* ═══ LOADING ═══ */
    window.addEventListener('load', function() {
        setTimeout(function() {
            document.getElementById('loading').classList.add('hidden');
        }, 1500);
    });

})();
