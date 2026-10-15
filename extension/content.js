/* Geo No – runs on youtube.com. Watches the Shorts player and skips/blurs blocked Shorts. */
(() => {
  'use strict';
  const { send, mostVisibleVideo } = window.GeoNoUtil;

  let currentId = null;

  function shortsId() {
    const m = location.pathname.match(/^\/shorts\/([\w-]{6,})/);
    return m ? m[1] : null;
  }

  function activeRenderer() {
    return document.querySelector('ytd-reel-video-renderer[is-active]') ||
      document.querySelector('ytd-shorts [is-active]');
  }

  function activeVideo() {
    const r = activeRenderer();
    const inR = r && r.querySelector('video');
    if (inR) return inR;
    return mostVisibleVideo('ytd-shorts video, #shorts-player video, video');
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

  function nextShort() {
    const btn = document.querySelector('#navigation-button-down button, #navigation-button-down ytd-button-renderer, button[aria-label="Next video"]');
    if (btn) { btn.click(); return true; }
    const ev = { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true };
    document.dispatchEvent(new KeyboardEvent('keydown', ev));
    document.dispatchEvent(new KeyboardEvent('keyup', ev));
    return true;
  }

  const ui = window.GeoNoPlayerUI({ activeVideo, next: nextShort, noun: 'Short', platform: 'youtube' });

  function handle(id) {
    ui.run(id, async () => {
      // Give the new Short's DOM a moment to render so the page hint matches it.
      await new Promise((r) => setTimeout(r, 150));
      return send({ type: 'check', videoId: id, hint: pageHint() });
    }, () => id === currentId);
  }

  function tick() {
    const id = shortsId();
    if (id === currentId) return;
    currentId = id;
    if (!id) { ui.clear(); return; }
    handle(id);
  }

  window.addEventListener('yt-navigate-finish', tick);
  setInterval(tick, 300);
  tick();

  // Re-check current Short when settings change (e.g. user adds a country).
  chrome.storage.onChanged.addListener((_c, area) => {
    if (area === 'sync' && currentId) { const id = currentId; currentId = null; ui.forget(id); tick(); }
  });
})();
