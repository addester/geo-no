/*
 * Geo No web app – a YouTube Shorts feed with chosen countries filtered out.
 * Works on iPhone and Android (add to home screen). Uses the viewer's own YouTube Data API key;
 * everything else stays in this browser. Detection: classifier.js (same file as the extension).
 */
(() => {
  'use strict';
  const C = window.GeoNoClassifier;
  const $ = (id) => document.getElementById(id);
  const API = 'https://www.googleapis.com/youtube/v3/';

  // ---------- settings ----------
  const ISO = ('AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ ' +
    'CA CD CF CG CH CI CK CL CM CN CO CR CU CV CW CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
    'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP ' +
    'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ ' +
    'MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PR PS PT PW PY QA ' +
    'RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR ' +
    'TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW').split(' ');
  const RICH = Object.keys(C.PROFILES);
  const names = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch (_) { return null; } })();
  const countryName = (c) => { try { return (names && names.of(c)) || c; } catch (_) { return c; } };
  const flag = (c) => String.fromCodePoint(...[...c].map((ch) => 0x1F1E6 + ch.charCodeAt(0) - 65));

  const TOPICS = {
    Comedy: 'funny', Sports: 'sports', Music: 'music', Food: 'food recipe', Science: 'science facts',
    Gaming: 'gaming', Travel: 'travel', Animals: 'cute animals', Tech: 'tech', Fitness: 'workout',
    Art: 'art', DIY: 'diy',
  };

  const browserRegion = (() => {
    const m = (navigator.language || '').match(/-([A-Z]{2})$/i);
    return m ? m[1].toUpperCase() : 'US';
  })();

  const DEFAULTS = { countries: ['IN'], sensitivity: 'medium', apiKey: '', topics: ['Comedy', 'Sports', 'Animals'], region: '' };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } },
  };
  let S = { ...DEFAULTS, ...store.get('geono-app', {}) };
  const save = () => store.set('geono-app', S);
  const region = () => {
    const r = S.region || browserRegion;
    return S.countries.includes(r) ? 'US' : r; // don't source from a country you're hiding
  };

  // ---------- YouTube Data API ----------
  class ApiError extends Error { constructor(msg, reason) { super(msg); this.reason = reason; } }
  async function api(path, params) {
    const u = new URL(API + path);
    Object.entries({ ...params, key: S.apiKey }).forEach(([k, v]) => v !== undefined && v !== '' && u.searchParams.set(k, v));
    const r = await fetch(u);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = j.error || {};
      const reason = (e.errors && e.errors[0] && e.errors[0].reason) || '';
      throw new ApiError(e.message || `HTTP ${r.status}`, reason);
    }
    return j;
  }

  const channelCache = store.get('geono-channels', {});
  const CHANNEL_TTL = 30 * 864e5;
  function saveChannels() {
    const keys = Object.keys(channelCache);
    if (keys.length > 3000) keys.sort((a, b) => channelCache[a].ts - channelCache[b].ts).slice(0, 800).forEach((k) => delete channelCache[k]);
    store.set('geono-channels', channelCache);
  }

  const isoDuration = (d) => {
    const m = String(d || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  };

  // ---------- feed state ----------
  const feed = $('feed');
  let items = [];             // {id, title, channel, thumb}
  const seen = new Set();
  let hidden = 0;
  let topicIdx = 0;
  const tokens = {};          // topic -> nextPageToken | null (exhausted)
  let loading = false;
  let feedError = null;
  let active = -1;

  function slideFor(it) {
    const s = document.createElement('section');
    s.className = 'slide';
    s.innerHTML = '<div class="frame"><div class="meta"><div class="channel"></div><div class="title"></div></div></div>';
    s.querySelector('.frame').style.backgroundImage = `url("${it.thumb}")`;
    s.querySelector('.channel').textContent = it.channel;
    s.querySelector('.title').textContent = it.title;
    return s;
  }

  function messageSlide(title, text, button, onClick) {
    feed.querySelectorAll('.slide.message').forEach((m) => m.remove());
    const s = document.createElement('section');
    s.className = 'slide message';
    s.innerHTML = '<div class="frame"><img src="icon-192.png" width="64" height="64" alt="" style="border-radius:50%;background:#fff"><h1></h1><p></p></div>';
    s.querySelector('h1').textContent = title;
    s.querySelector('p').textContent = text;
    if (button) {
      const b = document.createElement('button');
      b.className = 'primary';
      b.textContent = button;
      b.onclick = onClick;
      s.querySelector('.frame').appendChild(b);
    }
    feed.appendChild(s);
    return s;
  }

  function setStatus(t) { $('status').textContent = t || ''; }
  function updateHidden() {
    const el = $('hiddenCount');
    el.hidden = !hidden;
    el.textContent = `${hidden} hidden`;
  }

  async function loadMore() {
    if (loading || feedError || !S.apiKey) return;
    const topics = S.topics.length ? S.topics : ['Comedy'];
    if (topics.every((t) => tokens[t] === null)) return;
    loading = true;
    setStatus(items.length ? '' : 'Finding Shorts…');
    try {
      let added = 0, tries = 0;
      while (added < 6 && tries < 4) {
        tries++;
        const topic = topics[topicIdx++ % topics.length];
        if (tokens[topic] === null) continue;
        const res = await api('search', {
          part: 'snippet', type: 'video', videoDuration: 'short', maxResults: 50,
          q: `${TOPICS[topic] || topic} #shorts`, regionCode: region(),
          relevanceLanguage: (navigator.language || 'en').slice(0, 2), safeSearch: 'moderate',
          publishedAfter: new Date(Date.now() - 45 * 864e5).toISOString(),
          pageToken: tokens[topic] || undefined,
        });
        tokens[topic] = res.nextPageToken || null;
        const ids = (res.items || []).map((x) => x.id && x.id.videoId).filter((id) => id && !seen.has(id));
        if (!ids.length) continue;
        ids.forEach((id) => seen.add(id));

        const vids = await api('videos', { part: 'snippet,contentDetails', id: ids.join(','), maxResults: 50 });
        const list = (vids.items || []).filter((v) => isoDuration(v.contentDetails && v.contentDetails.duration) <= 180);

        const need = [...new Set(list.map((v) => v.snippet.channelId))]
          .filter((c) => !channelCache[c] || Date.now() - channelCache[c].ts > CHANNEL_TTL);
        if (need.length) {
          const ch = await api('channels', { part: 'snippet,brandingSettings', id: need.slice(0, 50).join(','), maxResults: 50 });
          (ch.items || []).forEach((it) => {
            channelCache[it.id] = {
              country: it.snippet.country || (it.brandingSettings && it.brandingSettings.channel && it.brandingSettings.channel.country) || '',
              description: (it.snippet.description || '').slice(0, 1200), ts: Date.now(),
            };
          });
          saveChannels();
        }

        for (const v of list) {
          const sn = v.snippet;
          const ch = channelCache[sn.channelId] || {};
          const verdict = C.classify({
            title: sn.title, description: sn.description, tags: sn.tags || [],
            channelTitle: sn.channelTitle, channelDescription: ch.description, channelCountry: ch.country,
            audioLanguage: sn.defaultAudioLanguage, defaultLanguage: sn.defaultLanguage,
          }, S);
          if (verdict.block) { hidden++; continue; }
          const thumbs = sn.thumbnails || {};
          const it = { id: v.id, title: sn.title, channel: sn.channelTitle,
            thumb: (thumbs.high || thumbs.medium || thumbs.default || {}).url || '' };
          items.push(it);
          const msg = feed.querySelector('.slide.message');
          feed.insertBefore(slideFor(it), msg);
          added++;
        }
        updateHidden();
      }
      if (!items.length) {
        messageSlide('Nothing left to show', 'Every Short found was from a country you hide. Try other topics or another region in Settings.',
          'Open settings', openSettings);
      }
    } catch (e) {
      handleApiError(e);
    } finally {
      loading = false;
      setStatus('');
      if (active < 0 && items.length) onScroll();
    }
  }

  function handleApiError(e) {
    console.warn('[GeoNo]', e);
    if (e.reason === 'quotaExceeded' || e.reason === 'dailyLimitExceeded') {
      feedError = e;
      messageSlide('Daily limit reached', "Your free YouTube key has used today's quota. It resets at midnight Pacific time.", null);
    } else if (/key|API_KEY|keyInvalid|forbidden|accessNotConfigured/i.test(e.reason + e.message)) {
      feedError = e;
      messageSlide('Your API key was rejected', e.message, 'Check the key', openSettings);
    } else {
      messageSlide("Couldn't load Shorts", e.message || 'Network problem.', 'Try again', () => { feedError = null; loadMore(); });
    }
  }

  function resetFeed() {
    items = []; hidden = 0; topicIdx = 0; feedError = null; active = -1;
    Object.keys(tokens).forEach((k) => delete tokens[k]);
    seen.clear();
    feed.innerHTML = '';
    feed.scrollTop = 0;
    $('caption').hidden = true;
    updateHidden();
    hidePlayer();
    if (!S.apiKey) {
      messageSlide('Shorts without the countries you skip', 'Geo No needs a free YouTube API key to list Shorts. It takes about two minutes and stays on this device.',
        'Set up', openSettings);
      return;
    }
    if (!S.countries.length) {
      messageSlide('Pick countries to hide', 'Choose at least one country in Settings.', 'Open settings', openSettings);
      return;
    }
    loadMore();
  }

  // ---------- player ----------
  let player = null, playerReady = false, muted = true, pendingId = null;
  window.onYouTubeIframeAPIReady = () => {
    player = new YT.Player('player', {
      width: '100%', height: '100%',
      playerVars: { autoplay: 1, playsinline: 1, controls: 0, rel: 0, modestbranding: 1, mute: 1, fs: 0, iv_load_policy: 3, disablekb: 1 },
      events: {
        onReady: () => { playerReady = true; if (pendingId) play(pendingId); },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) { $('player-wrap').classList.add('on'); $('tap').classList.add('on'); }
          if (e.data === YT.PlayerState.ENDED) { player.seekTo(0); player.playVideo(); }
        },
      },
    });
  };
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);

  function hidePlayer() {
    $('player-wrap').classList.remove('on');
    $('tap').classList.remove('on');
    if (player && playerReady) { try { player.pauseVideo(); } catch (_) { /* ignore */ } }
  }

  function play(id) {
    pendingId = id;
    if (!playerReady) return;
    $('player-wrap').classList.remove('on');
    if (muted) player.mute(); else player.unMute();
    player.loadVideoById(id);
    $('soundHint').hidden = !muted;
  }

  $('tap').onclick = () => {
    if (!player || !playerReady) return;
    if (muted) { muted = false; player.unMute(); player.setVolume(100); player.playVideo(); $('soundHint').hidden = true; return; }
    const st = player.getPlayerState();
    if (st === YT.PlayerState.PLAYING) player.pauseVideo(); else player.playVideo();
  };

  // ---------- scrolling ----------
  let scrollT = 0;
  function onScroll() {
    const idx = Math.round(feed.scrollTop / feed.clientHeight);
    const slides = feed.querySelectorAll('.slide');
    const s = slides[idx];
    if (!s || idx === active) return;
    active = idx;
    const cap = $('caption');
    if (s.classList.contains('message')) { hidePlayer(); pendingId = null; cap.hidden = true; }
    else if (items[idx]) {
      play(items[idx].id);
      cap.querySelector('.channel').textContent = items[idx].channel;
      cap.querySelector('.title').textContent = items[idx].title;
      cap.hidden = false;
    }
    if (idx >= items.length - 4) loadMore();
  }
  feed.addEventListener('scroll', () => {
    $('player-wrap').classList.remove('on');
    clearTimeout(scrollT);
    scrollT = setTimeout(onScroll, 120);
  }, { passive: true });
  window.addEventListener('resize', () => { feed.scrollTop = Math.max(active, 0) * feed.clientHeight; });

  // ---------- settings UI ----------
  let dirty = false;
  function openSettings() { renderSettings(); $('settings').hidden = false; dirty = false; }
  function closeSettings() {
    $('settings').hidden = true;
    if (dirty) { save(); resetFeed(); }
  }
  $('openSettings').onclick = openSettings;
  $('closeSettings').onclick = closeSettings;
  $('settings').addEventListener('click', (e) => { if (e.target.id === 'settings') closeSettings(); });

  function change(patch) { Object.assign(S, patch); save(); dirty = true; renderSettings(); }

  function renderSettings() {
    const chips = $('chips');
    chips.innerHTML = '';
    if (!S.countries.length) chips.innerHTML = '<span class="small muted">None yet.</span>';
    S.countries.forEach((c) => {
      const el = document.createElement('span');
      el.className = 'chip';
      el.innerHTML = '<span></span><button aria-label="Remove">×</button>';
      el.firstChild.textContent = `${flag(c)} ${countryName(c)}${RICH.includes(c) ? ' ★' : ''}`;
      el.lastChild.onclick = () => change({ countries: S.countries.filter((x) => x !== c) });
      chips.appendChild(el);
    });

    const topics = $('topics');
    topics.innerHTML = '';
    Object.keys(TOPICS).forEach((t) => {
      const b = document.createElement('button');
      b.className = 'chip' + (S.topics.includes(t) ? ' on' : '');
      b.textContent = t;
      b.onclick = () => {
        const on = S.topics.includes(t);
        const next = on ? S.topics.filter((x) => x !== t) : [...S.topics, t];
        change({ topics: next.length ? next : [t] });
      };
      topics.appendChild(b);
    });

    const sel = $('region');
    if (!sel.options.length) {
      ISO.map((c) => ({ c, n: countryName(c) })).sort((a, b) => a.n.localeCompare(b.n)).forEach(({ c, n }) => {
        const o = document.createElement('option');
        o.value = c; o.textContent = `${flag(c)} ${n}`;
        sel.appendChild(o);
      });
      sel.onchange = () => change({ region: sel.value });
    }
    sel.value = region();

    document.querySelectorAll('.seg').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('on', b.dataset.v === S[seg.dataset.key]);
        b.onclick = () => change({ [seg.dataset.key]: b.dataset.v });
      });
    });

    $('apiKey').value = S.apiKey;
    renderInstall();
  }

  // country search
  const search = $('countrySearch'), results = $('countryResults');
  function renderResults() {
    const q = search.value.trim().toLowerCase();
    const list = ISO.filter((c) => !S.countries.includes(c))
      .map((c) => ({ c, n: countryName(c) }))
      .filter(({ c, n }) => !q || n.toLowerCase().includes(q) || c.toLowerCase() === q)
      .sort((a, b) => (RICH.includes(b.c) - RICH.includes(a.c)) || a.n.localeCompare(b.n))
      .slice(0, 40);
    results.innerHTML = '';
    list.forEach(({ c, n }) => {
      const d = document.createElement('div');
      d.innerHTML = '<span></span><small class="muted"></small>';
      d.firstChild.textContent = `${flag(c)} ${n}`;
      d.lastChild.textContent = RICH.includes(c) ? '★' : '';
      d.onmousedown = (e) => { e.preventDefault(); search.value = ''; results.hidden = true; change({ countries: [...S.countries, c] }); };
      results.appendChild(d);
    });
    results.hidden = !list.length;
  }
  search.onfocus = renderResults;
  search.oninput = renderResults;
  search.onblur = () => setTimeout(() => { results.hidden = true; }, 150);

  // API key
  $('saveKey').onclick = async () => {
    const k = $('apiKey').value.trim();
    const st = $('keyStatus');
    S.apiKey = k; save(); dirty = true;
    if (!k) { st.className = 'small muted'; st.textContent = 'Key removed.'; return; }
    st.className = 'small muted'; st.textContent = 'Checking…';
    try {
      await api('videos', { part: 'id', id: 'jNQXAC9IVRw' });
      st.className = 'small ok'; st.textContent = '✓ Key works. Tap Done to start watching.';
    } catch (e) {
      st.className = 'small bad'; st.textContent = '✗ ' + e.message;
    }
  };

  // install
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; renderInstall(); });
  function renderInstall() {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    $('installBtn').hidden = !installEvt || standalone;
    $('installHelp').textContent = standalone ? 'Installed. Geo No opens like an app from your home screen.'
      : ios ? 'In Safari, tap the Share button, then "Add to Home Screen". Geo No then opens full screen like an app.'
        : installEvt ? 'Install Geo No so it opens full screen like an app.'
          : 'In your browser menu choose "Install app" or "Add to Home screen".';
  }
  $('installBtn').onclick = async () => { if (installEvt) { installEvt.prompt(); installEvt = null; renderInstall(); } };

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  resetFeed();
})();
