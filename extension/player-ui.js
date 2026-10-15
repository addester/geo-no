/*
 * Geo No – shared on-page UI for every supported site (YouTube Shorts, Instagram Reels).
 * Loaded before the site-specific content script; exposes GeoNoPlayerUI(options).
 *
 * options:
 *   activeVideo()  -> the <video> currently on screen (or null)
 *   next()         -> move to the next Short/Reel
 *   noun           -> 'Short' | 'Reel' (used in labels)
 *   platform       -> 'youtube' | 'instagram' (settings key that switches this site on/off)
 */
(() => {
  'use strict';

  const send = (msg) => new Promise((res) => {
    try { chrome.runtime.sendMessage(msg, (r) => res(chrome.runtime.lastError ? null : r)); }
    catch (_) { res(null); } // extension reloaded – page needs refresh
  });

  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function visibleArea(el) {
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return w * h;
  }

  /** The <video> taking up most of the viewport. */
  function mostVisibleVideo(selector) {
    const vids = [...document.querySelectorAll(selector || 'video')];
    return vids.sort((a, b) => visibleArea(b) - visibleArea(a))[0] || null;
  }

  function GeoNoPlayerUI({ activeVideo, next, noun, platform }) {
    const shownAnyway = new Set();
    const counted = new Set();
    let hold = null;     // { video, wasMuted, timer }
    let overlay = null;
    let rafId = 0;

    // ---------- holding the video while we decide ----------
    function startHold() {
      stopHold(false);
      const video = activeVideo();
      if (!video) return;
      hold = { video, wasMuted: video.muted, timer: null };
      video.muted = true;
      video.pause();
      hold.timer = setInterval(() => {
        // Sites sometimes swap the <video> element under us; keep holding the current one.
        const v = activeVideo();
        if (v && v !== hold.video) { hold.video.muted = hold.wasMuted; hold.video = v; hold.wasMuted = v.muted; v.muted = true; }
        if (!hold.video.paused) hold.video.pause();
      }, 80);
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

    function clear() { hideOverlay(); stopHold(false); }

    // ---------- toast ----------
    function toast(text, actionLabel, onAction) {
      document.querySelectorAll('.geono-toast').forEach((t) => t.remove());
      const t = document.createElement('div');
      t.className = 'geono-toast';
      t.innerHTML = '<span></span>';
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

    function describe(v) {
      const where = v.countryName ? `from ${v.countryName}` : 'blocked account';
      return { where, why: (v.reasons || []).join(' · ') };
    }

    function showBlocked(id, v) {
      const { where, why } = describe(v);
      const label = noun === 'Reel' ? 'account' : 'channel';
      const o = showOverlay(`
        <div class="geono-card">
          <div class="geono-title">Hidden: ${esc(where)}</div>
          <div class="geono-why">${esc(why)}</div>
          <div class="geono-channel">${esc(v.channel && v.channel.name)}</div>
          <div class="geono-actions">
            <button data-a="next" class="primary">Next ${esc(noun)}</button>
            <button data-a="show">Show anyway</button>
            ${v.channel && v.channel.key ? `<button data-a="allow">Allow this ${label}</button>` : ''}
          </div>
        </div>`, 'blocked');
      o.onclick = async (e) => {
        const a = e.target.dataset && e.target.dataset.a;
        if (a === 'next') next();
        if (a === 'show' || a === 'allow') {
          shownAnyway.add(id);
          if (a === 'allow') await send({ type: 'allowChannel', channel: v.channel });
          hideOverlay(); stopHold(true);
        }
      };
    }

    /**
     * Run the full check flow for one item.
     *   id          – unique id of the Short/Reel
     *   getVerdict  – async () => verdict from the background worker
     *   isCurrent   – () => true while the user is still on this item
     */
    async function run(id, getVerdict, isCurrent) {
      const settings = await send({ type: 'settings' });
      if (!settings || !settings.enabled || settings[platform] === false ||
          !settings.countries.length || shownAnyway.has(id)) {
        clear(); return;
      }
      startHold();
      showOverlay('<div class="geono-spinner"></div>', 'checking');

      let v = null;
      try { v = await getVerdict(); } catch (e) { v = { error: String(e) }; }
      if (!isCurrent()) return; // user already moved on
      if (!v || v.error) { console.debug('[GeoNo] check failed', v); hideOverlay(); stopHold(true); return; }
      console.debug('[GeoNo]', id, v);
      if (!counted.has(id)) { counted.add(id); send({ type: 'counted', blocked: !!v.block }); }

      if (!v.block) { hideOverlay(); stopHold(true); return; }

      if (settings.mode === 'skip') {
        const { where } = describe(v);
        const ch = v.channel;
        const label = noun === 'Reel' ? 'account' : 'channel';
        toast(`Skipped a ${noun} ${where}`, ch && ch.key ? `Wrong? Allow ${label}` : null, () => {
          send({ type: 'allowChannel', channel: ch });
        });
        next();
        // If the site didn't move (end of feed / layout change), fall back to the blur card.
        setTimeout(() => { if (isCurrent()) showBlocked(id, v); }, 900);
      } else {
        showBlocked(id, v);
      }
    }

    function forget(id) { shownAnyway.delete(id); }

    return { run, clear, forget, send };
  }

  window.GeoNoPlayerUI = GeoNoPlayerUI;
  window.GeoNoUtil = { send, esc, mostVisibleVideo, visibleArea };
})();
