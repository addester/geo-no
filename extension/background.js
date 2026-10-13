/* Geo No – service worker: fetches Short metadata, classifies it, caches verdicts. */
importScripts('classifier.js');

const DEFAULTS = {
  enabled: true,
  countries: ['IN'],
  sensitivity: 'medium', // low | medium | high
  mode: 'skip',          // skip | blur
  apiKey: '',
  allowChannels: [],     // [{key, name}] never blocked
  blockChannels: [],     // [{key, name}] always blocked
};

const videoCache = new Map();   // videoId -> verdict (session only; settings changes clear it)
let channelCache = null;        // channelId -> {country, title, description, ts}
const CHANNEL_TTL = 30 * 24 * 3600 * 1000;

async function getSettings() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

async function loadChannelCache() {
  if (channelCache) return channelCache;
  const { channelCache: c } = await chrome.storage.local.get({ channelCache: {} });
  channelCache = c || {};
  return channelCache;
}

async function saveChannel(id, data) {
  const cache = await loadChannelCache();
  cache[id] = { ...data, ts: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > 5000) { // keep storage small
    keys.sort((a, b) => cache[a].ts - cache[b].ts).slice(0, 1000).forEach((k) => delete cache[k]);
  }
  chrome.storage.local.set({ channelCache: cache });
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Full metadata via YouTube Data API v3 (needs a key; ~2 quota units per new channel). */
async function metaFromApi(videoId, apiKey) {
  const v = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`);
  const sn = v.items && v.items[0] && v.items[0].snippet;
  if (!sn) throw new Error('video not found');
  const meta = {
    title: sn.title, description: sn.description, tags: sn.tags || [],
    channelId: sn.channelId, channelTitle: sn.channelTitle,
    audioLanguage: sn.defaultAudioLanguage, defaultLanguage: sn.defaultLanguage,
  };
  const cache = await loadChannelCache();
  let ch = cache[sn.channelId];
  if (!ch || Date.now() - ch.ts > CHANNEL_TTL) {
    const c = await fetchJson(`https://www.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings&id=${encodeURIComponent(sn.channelId)}&key=${encodeURIComponent(apiKey)}`);
    const it = c.items && c.items[0];
    ch = {
      country: (it && (it.snippet.country || (it.brandingSettings && it.brandingSettings.channel && it.brandingSettings.channel.country))) || '',
      title: it ? it.snippet.title : '',
      description: it ? (it.snippet.description || '').slice(0, 1500) : '',
      handle: it ? (it.snippet.customUrl || '') : '',
    };
    await saveChannel(sn.channelId, ch);
  }
  meta.channelCountry = ch.country;
  meta.channelDescription = ch.description;
  meta.channelHandle = ch.handle;
  return meta;
}

/** Keyless fallback: oEmbed gives title + channel name + channel URL. */
async function metaFromOembed(videoId) {
  const o = await fetchJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/shorts/' + videoId)}`);
  const handle = (o.author_url || '').split('/').pop();
  return { title: o.title, channelTitle: o.author_name, channelHandle: handle };
}

function channelKeys(meta, hint) {
  return [meta.channelId, meta.channelHandle, hint && hint.handle]
    .filter(Boolean).map((k) => String(k).toLowerCase().replace(/^@/, ''));
}

async function verdictFor(videoId, hint) {
  const settings = await getSettings();
  if (!settings.enabled || !settings.countries.length) return { block: false, reasons: ['disabled'] };
  if (videoCache.has(videoId)) return videoCache.get(videoId);

  let meta = {};
  let source = 'page';
  try {
    if (settings.apiKey) { meta = await metaFromApi(videoId, settings.apiKey); source = 'api'; }
  } catch (e) { console.warn('[GeoNo] API failed, falling back', e); }
  if (!meta.title) {
    try { meta = await metaFromOembed(videoId); source = 'oembed'; } catch (e) { /* use page hint */ }
  }
  // Merge what the page itself shows (fills gaps if network calls failed).
  if (hint) {
    meta.title = meta.title || hint.title;
    meta.channelTitle = meta.channelTitle || hint.channel;
    meta.channelHandle = meta.channelHandle || hint.handle;
  }

  const keys = channelKeys(meta, hint);
  const inList = (list) => list.some((c) => keys.includes(String(c.key).toLowerCase()));
  let verdict;
  if (inList(settings.allowChannels)) {
    verdict = { block: false, score: 0, reasons: ['channel on your allow list'] };
  } else if (inList(settings.blockChannels)) {
    verdict = { block: true, score: 1, country: null, reasons: ['channel on your block list'] };
  } else {
    verdict = GeoNoClassifier.classify(meta, settings);
  }
  verdict.channel = { key: keys[0] || '', name: meta.channelTitle || meta.channelHandle || '' };
  verdict.countryName = verdict.country ? GeoNoClassifier.countryName(verdict.country) : '';
  verdict.source = source;
  videoCache.set(videoId, verdict);
  return verdict;
}

async function bumpStats(blocked) {
  const today = new Date().toISOString().slice(0, 10);
  const { stats } = await chrome.storage.local.get({ stats: { date: today, checked: 0, blocked: 0, total: 0 } });
  if (stats.date !== today) Object.assign(stats, { date: today, checked: 0, blocked: 0 });
  stats.checked++;
  if (blocked) { stats.blocked++; stats.total++; }
  await chrome.storage.local.set({ stats });
}

async function addToList(listName, channel) {
  const s = await getSettings();
  const list = s[listName].filter((c) => c.key !== channel.key);
  list.push(channel);
  const other = listName === 'allowChannels' ? 'blockChannels' : 'allowChannels';
  await chrome.storage.sync.set({ [listName]: list, [other]: s[other].filter((c) => c.key !== channel.key) });
}

chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'sync') videoCache.clear(); });

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'check': {
        const v = await verdictFor(msg.videoId, msg.hint);
        return v;
      }
      case 'counted': await bumpStats(msg.blocked); return true;
      case 'allowChannel': await addToList('allowChannels', msg.channel); return true;
      case 'blockChannel': await addToList('blockChannels', msg.channel); return true;
      case 'settings': return getSettings();
      default: return null;
    }
  })().then(sendResponse, (e) => sendResponse({ error: String(e) }));
  return true; // async response
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
