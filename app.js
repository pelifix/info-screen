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
            aftenbladSport: 'https://www.aftenbladet.no/sport/rss',
            vg: 'https://www.vg.no/rss/feed/',
            vgSport: 'https://www.vg.no/rss/feed/?categories=sport',
        },
        feedRefresh: 5 * 60 * 1000,
        feedScrollInterval: 5000,
        tickerSpeed: 1.2,
        slideInterval: 12000,
        heroInterval: 10000,
        heroCount: 5,
        weatherLat: 58.97,
        weatherLon: 5.73,
        weatherLocation: 'Stavanger, Norge',
        weatherRefresh: 30 * 60 * 1000,
        financeRefresh: 30 * 60 * 1000,
        eventsRefresh: 6 * 60 * 60 * 1000,
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
        busRefresh: 60 * 1000,
    };

    /* ═══ SOURCE STATUS TRACKING ═══ */
    var SOURCES = {
        nyheter:     { label: 'NRK',         status: 'pending' },
        sport:       { label: 'NRK Sport',   status: 'pending' },
        e24:         { label: 'E24',         status: 'pending' },
        aftenbladet: { label: 'Aftenbladet', status: 'pending' },
        aftenbladSport: { label: 'Aft. Sport', status: 'pending' },
        vg:          { label: 'VG',          status: 'pending' },
        vgSport:     { label: 'VG Sport',    status: 'pending' },
        ticker:      { label: 'Ticker',      status: 'pending' },
        marked:      { label: 'Marked',      status: 'pending' },
        vaer:        { label: 'V\u00e6r',    status: 'pending' },
        bilder:      { label: 'Bilder',      status: 'pending' },
        buss:        { label: 'Buss',        status: 'pending' },
        konserthus:  { label: 'Konserthus',  status: 'pending' },
        folken:      { label: 'Folken',      status: 'pending' },
    };

    var FEED_META = {
        news:        { srcKey: 'nyheter',     label: 'NRK',         sport: false },
        sport:       { srcKey: 'sport',       label: 'NRK Sport',   sport: true },
        e24:         { srcKey: 'e24',         label: 'E24',         sport: false },
        aftenbladet: { srcKey: 'aftenbladet', label: 'Aftenbladet', sport: false },
        aftenbladSport: { srcKey: 'aftenbladSport', label: 'Aft. Sport', sport: true },
        vg:          { srcKey: 'vg',          label: 'VG',          sport: false },
        vgSport:     { srcKey: 'vgSport',     label: 'VG Sport',    sport: true },
    };

    var lastRefreshTime = null;

    function setSource(key, status) {
        SOURCES[key].status = status;
        if (status === 'ok') lastRefreshTime = new Date();
        renderSourceStatus();
    }

    function renderSourceStatus() {
        var el = document.getElementById('source-status');
        if (!el) return;
        el.innerHTML = Object.keys(SOURCES).map(function(key) {
            var s = SOURCES[key];
            return '<div class="source-dot"><div class="dot ' + s.status + '"></div>' + s.label + '</div>';
        }).join('');
        var refreshEl = document.getElementById('last-refresh');
        if (refreshEl && lastRefreshTime) {
            refreshEl.textContent = 'Sist oppdatert: ' +
                String(lastRefreshTime.getHours()).padStart(2, '0') + ':' +
                String(lastRefreshTime.getMinutes()).padStart(2, '0') + ':' +
                String(lastRefreshTime.getSeconds()).padStart(2, '0');
        }
    }

    renderSourceStatus();

    /* ═══ IMAGE SLIDESHOW (Bing + Webcams) ═══ */
    var slideImages = [];

    /* ═══ EVENTS (scraped from Konserthus + Folken) ═══ */
    var FALLBACK_EVENTS = [
        { icon: '\uD83C\uDFB5', date: 'Laster...', title: 'Henter arrangementer...', venue: 'Stavanger' },
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

    function formatISODate(isoDate) {
        if (!isoDate) return '';
        var p = isoDate.split('T')[0].split('-');
        var day = parseInt(p[2]);
        var mon = parseInt(p[1]) - 1;
        return day + '. ' + monN[mon].substring(0, 3);
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

    /* ═══ HELPERS ═══ */
    var dayN = ['s\u00f8ndag','mandag','tirsdag','onsdag','torsdag','fredag','l\u00f8rdag'];
    var monN = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];

    function timeAgo(dateStr) {
        var diff = Date.now() - new Date(dateStr).getTime();
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
        document.getElementById('clock-date').textContent = dayN[now.getDay()] + ' ' + now.getDate() + '. ' + monN[now.getMonth()];
        var d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        var ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        var wk = Math.ceil(((d - ys) / 86400000 + 1) / 7);
        document.getElementById('clock-week').textContent = 'Uke ' + wk + ' \u00b7 ' + now.getFullYear();
    }
    setInterval(updateClock, 1000);
    updateClock();

    /* ═══ NEWS FEED ═══ */
    var heroEl = document.getElementById('hero-story');
    var feedTrack = document.getElementById('feed-track');
    var feedItems = [];
    var feedScrollPos = 0;
    var currentHeroTitle = '';
    var heroItems = [];
    var heroIndex = 0;
    var rawFeeds = { news: [], sport: [], e24: [], aftenbladet: [], aftenbladSport: [], vg: [], vgSport: [] };

    function renderHero(item) {
        if (!item) return;
        if (item.title === currentHeroTitle) return;
        currentHeroTitle = item.title;

        var meta = FEED_META[item.source];
        var isSport = meta && meta.sport;
        var badgeClass = isSport ? 'sport-badge' : 'news-badge';
        var badgeText = meta ? meta.label : 'Siste nytt';
        var imgContent = item.image
            ? '<img src="' + escapeHtml(item.image) + '" alt="">'
            : '<div class="hero-no-img">\u{1F4F0}</div>';

        var html =
            '<div class="hero-img-wrap">' +
                '<div class="hero-badge ' + badgeClass + '">' + badgeText + '</div>' +
                imgContent +
            '</div>' +
            '<div class="hero-text">' +
                '<div class="hero-source ' + (isSport ? 'sport' : '') + '">' + badgeText + '</div>' +
                '<div class="hero-title">' + escapeHtml(item.title) + '</div>' +
                (item.desc ? '<div class="hero-desc">' + escapeHtml(item.desc) + '</div>' : '') +
                '<div class="hero-time">' + (item.pubDate ? timeAgo(item.pubDate) : '') + '</div>' +
            '</div>';

        var cards = heroEl.querySelectorAll('.hero-card');
        var newCard = document.createElement('div');
        newCard.className = 'hero-card';
        newCard.innerHTML = html;
        heroEl.insertBefore(newCard, heroEl.querySelector('.hero-divider'));
        void newCard.offsetWidth;
        newCard.classList.add('active');

        for (var i = 0; i < cards.length; i++) { cards[i].classList.remove('active'); }
        setTimeout(function() {
            var old = heroEl.querySelectorAll('.hero-card:not(.active)');
            for (var j = 0; j < old.length; j++) { old[j].parentNode.removeChild(old[j]); }
        }, 1200);
    }

    function renderHeroProgress() {
        var existing = heroEl.querySelector('.hero-progress');
        if (existing) existing.remove();
        if (heroItems.length <= 1) return;
        var bar = document.createElement('div');
        bar.className = 'hero-progress';
        var dur = (CONFIG.heroInterval / 1000) + 's';
        heroItems.forEach(function(_, i) {
            var seg = document.createElement('div');
            seg.className = 'hero-prog-seg';
            if (i < heroIndex) seg.classList.add('done');
            else if (i === heroIndex) seg.classList.add('active');
            var fill = document.createElement('div');
            fill.className = 'hero-prog-fill';
            if (i === heroIndex) fill.style.animationDuration = dur;
            seg.appendChild(fill);
            bar.appendChild(seg);
        });
        heroEl.appendChild(bar);
    }

    function updateHeroProgress() {
        var segs = heroEl.querySelectorAll('.hero-prog-seg');
        var dur = (CONFIG.heroInterval / 1000) + 's';
        for (var i = 0; i < segs.length; i++) {
            segs[i].classList.remove('done', 'active');
            var fill = segs[i].querySelector('.hero-prog-fill');
            fill.style.animation = 'none';
            fill.style.animationDuration = '';
            if (i < heroIndex) {
                segs[i].classList.add('done');
            } else if (i === heroIndex) {
                segs[i].classList.add('active');
                void fill.offsetWidth;
                fill.style.animation = '';
                fill.style.animationDuration = dur;
            }
        }
    }

    function renderFeed(items) {
        feedTrack.innerHTML = '';
        feedScrollPos = 0;
        feedTrack.style.transform = 'translateY(0)';
        if (!items.length) {
            feedTrack.innerHTML = '<div style="padding:40px 32px;color:var(--text-dim);font-size:1.1rem;">Laster nyheter&hellip;</div>';
            return;
        }
        items.forEach(function(item, i) {
            var meta = FEED_META[item.source];
            var isSport = meta && meta.sport;
            var div = document.createElement('div');
            div.className = 'article';
            var imgHtml = item.image
                ? '<div class="article-img"><img src="' + escapeHtml(item.image) + '" alt="" loading="' + (i < 4 ? 'eager' : 'lazy') + '"></div>'
                : '<div class="article-img no-image">\u{1F4F0}</div>';
            div.innerHTML = imgHtml +
                '<div class="article-text">' +
                    '<div class="article-source ' + (isSport ? 'sport' : '') + '">' + (meta ? meta.label : 'Nyheter') + '</div>' +
                    '<div class="article-title">' + escapeHtml(item.title) + '</div>' +
                    (item.desc ? '<div class="article-desc">' + escapeHtml(item.desc) + '</div>' : '') +
                    '<div class="article-time">' + (item.pubDate ? timeAgo(item.pubDate) : '') + '</div>' +
                '</div>';
            feedTrack.appendChild(div);
        });
    }

    function scrollFeed() {
        if (feedItems.length <= 4) return;
        feedScrollPos++;
        var offset = feedScrollPos * 160;
        var maxScroll = feedTrack.scrollHeight - feedTrack.parentElement.clientHeight;
        if (offset >= maxScroll) {
            feedScrollPos = 0;
            feedTrack.style.transition = 'none';
            feedTrack.style.transform = 'translateY(0)';
            void feedTrack.offsetWidth;
            feedTrack.style.transition = 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
            return;
        }
        feedTrack.style.transform = 'translateY(-' + offset + 'px)';
    }

    function mergeFeedsAndRender() {
        var merged = [];
        Object.keys(rawFeeds).forEach(function(key) { merged = merged.concat(rawFeeds[key]); });
        merged.sort(function(a, b) { return new Date(b.pubDate || 0) - new Date(a.pubDate || 0); });
        var seen = {};
        var all = [];
        for (var i = 0; i < merged.length && all.length < 25; i++) {
            var key = merged[i].title.toLowerCase().trim();
            if (seen[key]) continue;
            seen[key] = true;
            all.push(merged[i]);
        }
        if (!all.length) return;
        heroItems = all.slice(0, CONFIG.heroCount);
        feedItems = all.slice(CONFIG.heroCount);
        if (heroIndex >= heroItems.length) heroIndex = 0;
        renderHero(heroItems[heroIndex]);
        renderHeroProgress();
        renderFeed(feedItems);
    }

    async function loadFeed(type) {
        var meta = FEED_META[type];
        var srcKey = meta ? meta.srcKey : type;
        setSource(srcKey, 'loading');
        try {
            var url = CONFIG.rssApi + encodeURIComponent(CONFIG.feeds[type]);
            var resp = await fetch(url);
            if (!resp.ok) throw new Error('Feed fetch failed: ' + type);
            var data = await resp.json();
            if (data.status !== 'ok' || !data.items || !data.items.length) throw new Error('No items in feed: ' + type);
            rawFeeds[type] = data.items.slice(0, 15).map(function(item) {
                return {
                    title: item.title || '',
                    desc: (item.description || '').replace(/<[^>]*>/g, ''),
                    pubDate: item.pubDate || '',
                    image: item.thumbnail || (item.enclosure && item.enclosure.link) || null,
                    source: type,
                };
            }).filter(function(a) { return a.title; });
            mergeFeedsAndRender();
            setSource(srcKey, 'ok');
        } catch (err) {
            console.warn('Feed load error (' + type + '):', err);
            setSource(srcKey, 'error');
        }
    }

    // Stagger initial loads to avoid API rate limits
    var feedKeys = Object.keys(CONFIG.feeds);
    feedKeys.forEach(function(key, i) {
        setTimeout(function() { loadFeed(key); }, i * 1500);
        setInterval(function() { loadFeed(key); }, CONFIG.feedRefresh);
    });
    setInterval(scrollFeed, CONFIG.feedScrollInterval);
    setInterval(function() {
        if (heroItems.length <= 1) return;
        heroIndex = (heroIndex + 1) % heroItems.length;
        renderHero(heroItems[heroIndex]);
        updateHeroProgress();
    }, CONFIG.heroInterval);

    /* ═══ IMAGE SLIDESHOW ═══ */
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
            var bingUrl = CONFIG.corsProxy + encodeURIComponent('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=5&mkt=en-US');
            var resp = await fetch(bingUrl);
            if (resp.ok) {
                var data = await resp.json();
                if (data.images && data.images.length) {
                    data.images.forEach(function(img) {
                        var copy = img.copyright || '';
                        var caption = img.title || copy.split('(')[0].trim() || 'Bing';
                        bingImgs.push({
                            src: 'https://www.bing.com' + img.urlbase + '_1920x1080.jpg',
                            caption: caption,
                            live: false,
                        });
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
        // Interleave: Bing, Live, Bing, Live, ...
        var images = [];
        var bi = 0, li = 0;
        while (bi < bingImgs.length || li < liveImgs.length) {
            if (bi < bingImgs.length) images.push(bingImgs[bi++]);
            if (li < liveImgs.length) images.push(liveImgs[li++]);
        }
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

    function renderEvents(events) {
        eventsEl.innerHTML = '';
        if (!events.length) {
            eventsEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.85rem;">Ingen kommende arrangementer</div>';
            return;
        }
        events.forEach(function(ev) {
            var div = document.createElement('div');
            div.className = 'event-item';
            var iconHtml = ev.image
                ? '<img src="' + escapeHtml(ev.image) + '" alt="">'
                : ev.icon;
            div.innerHTML =
                '<div class="event-icon">' + iconHtml + '</div>' +
                '<div class="event-info">' +
                    '<div class="event-title">' + escapeHtml(ev.title) + '</div>' +
                    '<div class="event-meta">' + escapeHtml(ev.venue) + '</div>' +
                '</div>' +
                '<div class="event-date">' + ev.date + '</div>';
            eventsEl.appendChild(div);
        });
    }

    async function scrapeKonserthus() {
        var url = CONFIG.corsProxy + encodeURIComponent('https://www.stavanger-konserthus.no/program/');
        var resp = await fetch(url);
        if (!resp.ok) throw new Error('Konserthus fetch failed');
        var html = await resp.text();
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var articles = doc.querySelectorAll('article.event');
        var events = [];
        for (var i = 0; i < articles.length && events.length < 6; i++) {
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
        var resp = await fetch(url);
        if (!resp.ok) throw new Error('Folken fetch failed');
        var html = await resp.text();
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var items = doc.querySelectorAll('.list-item');
        var events = [];
        for (var i = 0; i < items.length && events.length < 6; i++) {
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

            var nowStr = new Date().toISOString().substring(0, 10);
            all = all.filter(function(e) { return e.date && e.date.substring(0, 10) >= nowStr; });
            all.sort(function(a, b) { return a.date.localeCompare(b.date); });

            var events = all.slice(0, 5).map(function(e) {
                return { icon: e.icon, date: formatISODate(e.date), title: e.title, venue: e.venue, image: e.image || '' };
            });

            renderEvents(events.length ? events : FALLBACK_EVENTS);
        } catch (e) {
            console.warn('Events scrape error:', e);
            setSource('konserthus', 'error');
            setSource('folken', 'error');
            renderEvents(FALLBACK_EVENTS);
        }
    }

    setTimeout(function() { loadEvents(); }, 14000);
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

    setTimeout(function() { loadBusDepartures(); }, 16000);
    setInterval(loadBusDepartures, CONFIG.busRefresh);

    /* ═══ TICKER ═══ */
    var tickerEl = document.getElementById('ticker-content');
    var tkHeadlines = [];
    var tkFinancial = [];
    var tkOffset = 0;
    var tkWidth = 0;
    var tkRunning = false;

    function buildTickerContent() {
        if (!tkHeadlines.length && !tkFinancial.length) return;
        var parts = [];
        var newsIdx = 0;
        var chunk = 5;

        while (newsIdx < tkHeadlines.length) {
            var slice = tkHeadlines.slice(newsIdx, newsIdx + chunk);
            slice.forEach(function(h) {
                parts.push('<span>' + h + '</span>');
                parts.push('<span class="sep">\u2022</span>');
            });
            newsIdx += chunk;

            if (tkFinancial.length) {
                tkFinancial.forEach(function(f) {
                    parts.push('<span class="fin-item"><span class="fin-val">' + f.value + '</span><span class="fin-cur">' + f.label + '</span></span>');
                });
                parts.push('<span class="sep">\u2022</span>');
            }
        }

        var html = parts.join('');
        tickerEl.innerHTML = html + html;
        tickerEl.style.transform = 'translateX(0)';
        tkWidth = tickerEl.scrollWidth / 2;
        tkOffset = 0;
        if (!tkRunning) { tkRunning = true; animTicker(); }
    }

    function animTicker() {
        tkOffset -= CONFIG.tickerSpeed;
        if (Math.abs(tkOffset) >= tkWidth) tkOffset += tkWidth;
        tickerEl.style.transform = 'translateX(' + tkOffset + 'px)';
        requestAnimationFrame(animTicker);
    }

    async function loadTicker() {
        setSource('ticker', 'loading');
        try {
            var url = CONFIG.rssApi + encodeURIComponent(CONFIG.feeds.news);
            var resp = await fetch(url);
            if (!resp.ok) throw new Error('Ticker RSS failed');
            var data = await resp.json();
            if (data.status !== 'ok' || !data.items || !data.items.length) throw new Error('No ticker items');
            var hds = data.items.slice(0, 20).map(function(item) {
                return item.title ? item.title.trim() : '';
            }).filter(Boolean);
            if (hds.length) { tkHeadlines = hds; buildTickerContent(); }
            setSource('ticker', hds.length ? 'ok' : 'error');
        } catch (e) {
            console.warn('Ticker error:', e);
            setSource('ticker', 'error');
            if (!tkHeadlines.length) { tkHeadlines = ['Henter nyheter\u2026']; buildTickerContent(); }
        }
    }

    async function loadFinancialData() {
        setSource('marked', 'loading');
        try {
            var nbUrl = 'https://data.norges-bank.no/api/data/EXR/B.USD+EUR+GBP.NOK.SP?format=sdmx-json&lastNObservations=1';
            var url = CONFIG.corsProxy + encodeURIComponent(nbUrl);
            var resp = await fetch(url);
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
                var lastKey = Object.keys(obs).sort(function(a,b) { return parseInt(a) - parseInt(b); }).pop();
                rates[curCode] = obs[lastKey][0];
            });

            tkFinancial = [];
            if (rates.USD) tkFinancial.push({ label: 'USD/NOK', value: Number(rates.USD).toFixed(2) });
            if (rates.EUR) tkFinancial.push({ label: 'EUR/NOK', value: Number(rates.EUR).toFixed(2) });
            if (rates.GBP) tkFinancial.push({ label: 'GBP/NOK', value: Number(rates.GBP).toFixed(2) });
            tkFinancial.push({ label: 'Brent', value: '$74.8' });
            tkFinancial.push({ label: 'OSEBX', value: '1 472' });
            buildTickerContent();
            setSource('marked', 'ok');
        } catch (e) {
            console.warn('Financial data error:', e);
            setSource('marked', 'error');
            tkFinancial = [
                { label: 'USD/NOK', value: '\u2013' },
                { label: 'EUR/NOK', value: '\u2013' },
                { label: 'Brent', value: '$74.8' },
                { label: 'OSEBX', value: '1 472' },
            ];
            buildTickerContent();
        }
    }

    // Stagger ticker + finance (after feeds finish)
    setTimeout(function() { loadTicker(); }, 10000);
    setTimeout(function() { loadFinancialData(); }, 12000);
    setInterval(loadTicker, CONFIG.feedRefresh);
    setInterval(loadFinancialData, CONFIG.financeRefresh);

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
            var resp = await fetch(url, { headers: { 'User-Agent': 'PelifixInfoScreen/1.0' } });
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

    setTimeout(function() { loadWeather(); }, 18000);
    setInterval(loadWeather, CONFIG.weatherRefresh);

    /* ═══ IMAGE SLIDESHOW LOADER ═══ */
    setTimeout(function() { loadImages(); }, 22000);
    setInterval(loadImages, CONFIG.imageRefresh);

    /* ═══ LOADING ═══ */
    window.addEventListener('load', function() {
        setTimeout(function() {
            document.getElementById('loading').classList.add('hidden');
        }, 1500);
    });

})();
