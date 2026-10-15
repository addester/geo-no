/*
 * Geo No – runs on instagram.com. Watches Reels (/reels/<code>/ and /reel/<code>/) and
 * skips/blurs the ones from blocked countries.
 *
 * Metadata comes from the same read-only endpoints instagram.com itself calls while you browse
 * (same origin, your own session), so no API key is needed:
 *   /api/v1/media/<id>/info/                 caption, tagged location, audio, account
 *   /api/v1/users/web_profile_info/?username full name, bio, business city / country
 * If those fail, Geo No falls back to the caption and username visible on the page.
 */
(() => {
  'use strict';
  const { send, mostVisibleVideo } = window.GeoNoUtil;

  const IG_APP_ID = '936619743392459'; // public ID of the instagram.com web app
  const RESERVED = new Set(['reels', 'reel', 'p', 'explore', 'direct', 'accounts', 'stories', 'about',
    'legal', 'developer', 'web', 'tv', 'challenge', 'emails', 'audio', 'locations', 'tags', 'your_activity']);
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  let currentId = null;
  const profileMem = new Map(); // username -> profile (this tab)

  // ---------- where are we ----------
  function reelCode() {
    const m = location.pathname.match(/^\/(?:[\w.]+\/)?reels?\/([\w-]{5,})/);
    return m ? m[1] : null;
  }

  /** Instagram shortcodes are base64-encoded media IDs. */
  function codeToMediaId(code) {
    let id = 0n;
    for (const ch of code.slice(0, 11)) {
      const i = ALPHABET.indexOf(ch);
      if (i < 0) return null;
      id = id * 64n + BigInt(i);
    }
    return id.toString();
  }

  function activeVideo() { return mostVisibleVideo('main video, video'); }

  // ---------- moving on ----------
  function scrollParent(el) {
    for (let p = el && el.parentElement; p && p !== document.body; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if (/(auto|scroll)/.test(oy) && p.scrollHeight > p.clientHeight + 10) return p;
    }
    return null;
  }

  function nextReel() {
    const v = activeVideo();
    const sp = v && scrollParent(v);
    if (sp) { sp.scrollBy({ top: sp.clientHeight, behavior: 'smooth' }); return true; }
    if (v) {
      const vr = v.getBoundingClientRect();
      const below = [...document.querySelectorAll('video')]
        .map((x) => [x, x.getBoundingClientRect()])
        .filter(([x, r]) => x !== v && r.height > 50 && r.top > vr.top + vr.height / 2)
        .sort((a, b) => a[1].top - b[1].top)[0];
      if (below) { below[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); return true; }
    }
    window.scrollBy({ top: innerHeight, behavior: 'smooth' });
    return true;
  }

  // ---------- reading the page (fallback) ----------
  function usernameFromHref(href) {
    const m = (href || '').match(/^\/([A-Za-z0-9._]{1,30})\/(?:reels\/)?$/);
    return m && !RESERVED.has(m[1].toLowerCase()) ? m[1] : '';
  }

  function pageHint() {
    const v = activeVideo();
    let box = v;
    for (let i = 0; box && i < 12; i++, box = box.parentElement) {
      const link = [...box.querySelectorAll('a[href]')].find((a) => usernameFromHref(a.getAttribute('href')));
      if (link) {
        const text = (box.innerText || '').trim().slice(0, 800);
        return { username: usernameFromHref(link.getAttribute('href')), caption: text };
      }
    }
    return { username: '', caption: '' };
  }

  // ---------- Instagram's own web endpoints ----------
  async function igJson(path) {
    const r = await fetch(path, {
      credentials: 'include',
      headers: { 'x-ig-app-id': IG_APP_ID, 'x-requested-with': 'XMLHttpRequest' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function mediaInfo(code) {
    const id = codeToMediaId(code);
    if (!id) throw new Error('bad shortcode');
    const j = await igJson(`/api/v1/media/${id}/info/`);
    const it = j.items && j.items[0];
    if (!it) throw new Error('no media');
    const loc = it.location || {};
    const clips = it.clips_metadata || {};
    const music = clips.music_info && clips.music_info.music_asset_info;
    const orig = clips.original_sound_info;
    const audio = music ? `${music.title || ''} ${music.display_artist || ''}`
      : (orig && orig.original_audio_title && !/^original audio$/i.test(orig.original_audio_title) ? orig.original_audio_title : '');
    return {
      caption: (it.caption && it.caption.text) || '',
      username: (it.user && it.user.username) || '',
      fullName: (it.user && it.user.full_name) || '',
      location: [loc.name, loc.city].filter(Boolean).join(', '),
      audioTitle: audio.trim(),
    };
  }

  async function profile(username) {
    if (!username) return null;
    if (profileMem.has(username)) return profileMem.get(username);
    const key = 'ig:' + username.toLowerCase();
    const cached = await send({ type: 'getChannel', key });
    if (cached) { profileMem.set(username, cached); return cached; }
    const j = await igJson(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
    const u = j.data && j.data.user;
    if (!u) return null;
    let addr = {};
    try { addr = JSON.parse(u.business_address_json || '{}') || {}; } catch (_) { /* ignore */ }
    const p = {
      title: u.full_name || '',
      description: (u.biography || '').slice(0, 1500),
      country: (addr.country_code || '').toUpperCase(),
      city: addr.city_name || '',
      category: u.category_name || '',
    };
    profileMem.set(username, p);
    send({ type: 'putChannel', key, data: p });
    return p;
  }

  async function verdict(code) {
    const hint = pageHint();
    let m = null;
    try { m = await mediaInfo(code); } catch (e) { console.debug('[GeoNo] media info failed, using page text', e); }
    const username = (m && m.username) || hint.username;
    let p = null;
    try { p = await profile(username); } catch (e) { console.debug('[GeoNo] profile failed', e); }

    const meta = {
      title: m ? m.caption : hint.caption,
      channelTitle: (p && p.title) || (m && m.fullName) || username,
      channelHandle: username,
      channelDescription: p ? [p.description, p.category].filter(Boolean).join('\n') : '',
      channelCountry: (p && p.country) || '',
      location: [m && m.location, p && p.city].filter(Boolean).join(' · '),
      audioTitle: m ? m.audioTitle : '',
    };
    return send({
      type: 'checkMeta', id: 'ig:' + code, meta,
      channel: username ? { key: 'ig:' + username.toLowerCase(), name: '@' + username + ' (Instagram)' } : null,
    });
  }

  // ---------- main loop ----------
  const ui = window.GeoNoPlayerUI({ activeVideo, next: nextReel, noun: 'Reel', platform: 'instagram' });

  function tick() {
    const code = reelCode();
    if (code === currentId) return;
    currentId = code;
    if (!code) { ui.clear(); return; }
    ui.run(code, async () => {
      await new Promise((r) => setTimeout(r, 150)); // let the new Reel's DOM render
      return verdict(code);
    }, () => code === currentId);
  }

  setInterval(tick, 300);
  tick();

  chrome.storage.onChanged.addListener((_c, area) => {
    if (area === 'sync' && currentId) { const id = currentId; currentId = null; ui.forget(id); tick(); }
  });
})();
