/* Geo No – runs on youtube.com. Watches the Shorts player and skips/blurs blocked Shorts. */
(() => {
  'use strict';
  const LOG = (...a) => console.debug('[GeoNo]', ...a);

  let currentId = null;
  let settings = null;
  let hold = null;          // { video, wasMuted, timer }
  const shownAnyway = new Set();
  const counted = new Set();      // count each Short once in stats

  // ---------- helpers ----------
  const send = (msg) => new Promise((res) => {
    try { chrome.runtime.sendMessage(msg, (r) => res(chrome.runtime.lastError ? null : r)); }
    catch (_) { res(null); } // extension reloaded – page needs refresh
  });

  function shortsId() {
    const m = location.pathname.match(/^\/shorts\/([\w-]{6,})/);
    return m ? m[1] : null;
  }

  function activeRenderer() {
    return document.querySelector('ytd-reel-video-renderer[is-active]') ||
      document.querySelector('ytd-shorts [is-active]');
  }

  function visibleArea(el) {
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return w * h;
  }

  function activeVideo() {
    const r = activeRenderer();
    const inR = r && r.querySelector('video');
    if (inR) return inR;
    const vids = [...document.querySelectorAll('ytd-shorts video, #shorts-player video, video')];
    return vids.sort((a, b) => visibleArea(b) - visibleArea(a))[0] || null;
  }

  function pageHint() {
    const r = activeRenderer() || document;
    const link = r.querySelector('a[href^="/@"]');
    const handle = link ? decodeURIComponent(link.getAttribute('href').slice(2).split(/[/?]/)[0]) : '';
    const channel = link ? link.textContent.trim() : '';
    const titleEl = r.querySelector('h2, .ytShortsVideoTitleViewModelShortsVideoTitle, yt-shorts-video-title-view-model');
    const title = titleEl ? titleEl.textContent.trim() : document.title.replace(/ - YouTube$/, '');
    return { handle, channel, title };
  }

  // ---------- holding the video while we decide ----------
  function startHold() {
    stopHold(false);
    const video = activeVideo();
    if (!video) return;
    hold = { video, wasMuted: video.muted, timer: null };
    video.muted = true;
    video.pause();
    hold.timer = setInterval(() => { if (!video.paused) video.pause(); }, 80);
  }

  function stopHold(resume) {
    if (!hold) return;
    clearInterval(hold.timer);
    const { video, wasMuted } = hold;
    hold = null;
    video.muted = wasMuted;
    if (resume) video.play().catch(() => {});
  }

  // ---------- overlay ----------
  let overlay = null;
  let rafId = 0;

  function targetRect() {
    const v = activeVideo();
    const r = v && v.getBoundingClientRect();
    if (r && r.width > 50 && r.height > 50) return r;
    const w = Math.min(420, innerWidth - 32), h = Math.min(innerHeight - 120, w * 16 / 9);
    return { left: (innerWidth - w) / 2, top: 70, width: w, height: h };
  }

  function track() {
    if (!overlay) return;
    const r = targetRect();
    Object.assign(overlay.style, {
      left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px',
    });
    rafId = requestAnimationFrame(track);
  }

  function showOverlay(html, cls) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'geono-overlay';
      document.documentElement.appendChild(overlay);
      cancelAnimationFrame(rafId);
      track();
    }
    overlay.className = cls;
    overlay.innerHTML = html;
    return overlay;
  }

  function hideOverlay() {
    cancelAnimationFrame(rafId);
    if (overlay) overlay.remove();
    overlay = null;
  }

  // ---------- toast ----------
  function toast(text, actionLabel, onAction) {
    document.querySelectorAll('.geono-toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'geono-toast';
    t.innerHTML = `<span></span>`;
    t.firstChild.textContent = text;
    if (actionLabel) {
      const b = document.createElement('button');
      b.textContent = actionLabel;
      b.onclick = () => { t.remove(); onAction(); };
      t.appendChild(b);
    }
    document.documentElement.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- actions ----------
  function nextShort() {
    const btn = document.querySelector('#navigation-button-down button, #navigation-button-down ytd-button-renderer, button[aria-label="Next video"]');
    if (btn) { btn.click(); return true; }
    const ev = { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true };
    document.dispatchEvent(new KeyboardEvent('keydown', ev));
    document.dispatchEvent(new KeyboardEvent('keyup', ev));
    return true;
  }

  function describe(v) {
    const where = v.countryName ? `from ${v.countryName}` : 'blocked channel';
    return { where, why: (v.reasons || []).join(' · ') };
  }

  function showBlocked(id, v) {
    const { where, why } = describe(v);
    const o = showOverlay(`
      <div class="geono-card">
        <div class="geono-title">Hidden: ${esc(where)}</div>
        <div class="geono-why">${esc(why)}</div>
        <div class="geono-channel">${esc(v.channel && v.channel.name)}</div>
        <div class="geono-actions">
          <button data-a="next" class="primary">Next Short</button>
          <button data-a="show">Show anyway</button>
          ${v.channel && v.channel.key ? '<button data-a="allow">Allow this channel</button>' : ''}
        </div>
      </div>`, 'blocked');
    o.onclick = async (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a === 'next') nextShort();
      if (a === 'show' || a === 'allow') {
        shownAnyway.add(id);
        if (a === 'allow') await send({ type: 'allowChannel', channel: v.channel });
        hideOverlay(); stopHold(true);
      }
    };
  }

  async function handle(id) {
    settings = await send({ type: 'settings' });
    if (!settings || !settings.enabled || !settings.countries.length || shownAnyway.has(id)) {
      hideOverlay(); stopHold(false); return;
    }
    startHold();
    showOverlay('<div class="geono-spinner"></div>', 'checking');

    // Give the new Short's DOM a moment to render so the page hint matches it.
    await new Promise((r) => setTimeout(r, 150));
    const v = await send({ type: 'check', videoId: id, hint: pageHint() });
    if (id !== currentId) return; // user already moved on
    if (!v || v.error) { LOG('check failed', v); hideOverlay(); stopHold(true); return; }
    LOG(id, v);
    if (!counted.has(id)) { counted.add(id); send({ type: 'counted', blocked: !!v.block }); }

    if (!v.block) { hideOverlay(); stopHold(true); return; }

    if (settings.mode === 'skip') {
      const { where } = describe(v);
      const ch = v.channel;
      toast(`Skipped a Short ${where}`, ch && ch.key ? 'Wrong? Allow channel' : null, () => {
        send({ type: 'allowChannel', channel: ch });
      });
      nextShort();
      // If YouTube didn't move (end of feed / layout change), fall back to the blur card.
      setTimeout(() => { if (currentId === id) showBlocked(id, v); }, 900);
    } else {
      showBlocked(id, v);
    }
  }

  function tick() {
    const id = shortsId();
    if (id === currentId) return;
    currentId = id;
    if (!id) { hideOverlay(); stopHold(false); return; }
    handle(id);
  }

  window.addEventListener('yt-navigate-finish', tick);
  setInterval(tick, 300);
  tick();

  // Re-check current Short when settings change (e.g. user adds a country).
  chrome.storage.onChanged.addListener((_c, area) => {
    if (area === 'sync' && currentId) { const id = currentId; currentId = null; shownAnyway.delete(id); tick(); }
  });
})();
