/*
 * Geo No – origin classifier.
 * Pure functions, no browser APIs, so it runs in the service worker and in Node tests.
 *
 * Input: metadata about one Short or Reel (title/caption, description, tags, channel/account
 * name, channel description/bio, declared country, audio language, tagged location, audio
 * track name) + the user's blocked countries.
 * Output: { block, country, score, reasons[] }
 */
(function (root) {
  'use strict';

  // Unicode ranges for scripts that strongly point to a region.
  const SCRIPTS = {
    devanagari: /[ऀ-ॿ]/g,
    bengali: /[ঀ-৿]/g,
    gurmukhi: /[਀-੿]/g,
    gujarati: /[઀-૿]/g,
    oriya: /[଀-୿]/g,
    tamil: /[஀-௿]/g,
    telugu: /[ఀ-౿]/g,
    kannada: /[ಀ-೿]/g,
    malayalam: /[ഀ-ൿ]/g,
    sinhala: /[඀-෿]/g,
    // Letters specific to Urdu (not used in Arabic/Persian): ٹ ڈ ڑ ں ھ ے ۓ
    urdu: /[ٹڈڑںھےۓ]/g,
    thai: /[฀-๿]/g,
    hangul: /[가-힯ᄀ-ᇿ]/g,
    kana: /[぀-ヿ]/g,
    hebrew: /[֐-׿]/g,
    georgian: /[Ⴀ-ჿ]/g,
    armenian: /[԰-֏]/g,
    khmer: /[ក-៿]/g,
    lao: /[຀-໿]/g,
    myanmar: /[က-႟]/g,
    ethiopic: /[ሀ-፿]/g,
  };

  // Romanised Hindi/Urdu ("Hinglish") words that rarely appear in English text.
  const HINGLISH = new Set((
    'bhai bhaiya bhabhi yaar yr kya kyu kyun kyon hai hain nahi nahin nhi bhi kaise kaisa ' +
    'kab kaha kahan accha acha achha bahut bohot bht mera meri mere tera teri tere apna apni ' +
    'humara hamara tumhara aap aapka aapke abhi sab sabko kuch kuchh dekho dekh suno chalo ' +
    'karo karna kar raha rahi rahe tha thi wala wali wale ladka ladki paisa paise pyaar pyar ' +
    'dost dil zindagi jaldi bilkul matlab samjha samajh pata log logo ghar khana desi ' +
    'mummy papa didi beta ji jee haan nahi sirf bas toh lekin agar jab phir fir bahot ' +
    'shaadi shadi saal din raat subah naya purana sasta mehnga bachpan'
  ).split(/\s+/));

  /*
   * Country profiles. Any country can be blocked via the channel's declared country and a
   * #countryname hashtag; the profiles below add language/script/keyword evidence.
   * Each weight is "how strongly this signal alone suggests the country" (0..1).
   */
  const PROFILES = {
    IN: {
      scripts: { devanagari: 0.8, gujarati: 0.95, oriya: 0.95, telugu: 0.95, kannada: 0.95,
                 malayalam: 0.95, gurmukhi: 0.75, tamil: 0.8, bengali: 0.5 },
      audio: { hi: 0.9, mr: 0.95, gu: 0.95, te: 0.95, kn: 0.95, ml: 0.95, or: 0.95,
               as: 0.9, ta: 0.8, pa: 0.65, bn: 0.5, ur: 0.25 },
      hinglish: 0.75,
      keywords: ['india', 'indian', 'bharat', 'hindustan', 'desi', 'bollywood', 'tollywood',
        'kollywood', 'mollywood', 'sandalwood', 'hindi', 'tamil', 'telugu', 'marathi',
        'punjabi', 'gujarati', 'bengali', 'kannada', 'malayalam', 'mumbai', 'delhi',
        'newdelhi', 'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'kolkata', 'pune',
        'jaipur', 'ahmedabad', 'lucknow', 'kanpur', 'nagpur', 'indore', 'bhopal', 'patna',
        'raipur', 'surat', 'goa', 'kerala', 'rajasthan', 'gujarat', 'maharashtra', 'bihar',
        'punjab', 'uttarpradesh', 'up', 'mp', 'chhattisgarh', 'odisha', 'assam', 'ipl',
        'diwali', 'holi', 'navratri', 'ganpati', 'rupees', 'crore', 'lakh', 'jugaad',
        'jaihind', 'modi', 'chai', 'chaiwala', 'paneer', 'biryani', 'samosa', 'vadapav',
        'panipuri', 'golgappa', 'dosa', 'upsc', 'jee', 'neet', 'iit', 'cbse'],
    },
    PK: {
      scripts: { urdu: 0.9, gurmukhi: 0.1 },
      audio: { ur: 0.85, pa: 0.3, sd: 0.8, ps: 0.5 },
      hinglish: 0.3,
      keywords: ['pakistan', 'pakistani', 'karachi', 'lahore', 'islamabad', 'rawalpindi',
        'peshawar', 'quetta', 'multan', 'faisalabad', 'psl', 'urdu', 'sindhi'],
    },
    BD: {
      scripts: { bengali: 0.5 },
      audio: { bn: 0.5 },
      keywords: ['bangladesh', 'bangladeshi', 'dhaka', 'chittagong', 'sylhet', 'bangla'],
    },
    NP: {
      scripts: { devanagari: 0.25 },
      audio: { ne: 0.95 },
      keywords: ['nepal', 'nepali', 'kathmandu', 'pokhara'],
    },
    LK: {
      scripts: { sinhala: 0.95, tamil: 0.2 },
      audio: { si: 0.95 },
      keywords: ['srilanka', 'srilankan', 'colombo', 'kandy'],
    },
    TH: { scripts: { thai: 0.9 }, audio: { th: 0.9 }, keywords: ['thailand', 'thai', 'bangkok'] },
    KR: { scripts: { hangul: 0.85 }, audio: { ko: 0.85 }, keywords: ['korea', 'korean', 'seoul', 'kpop'] },
    JP: { scripts: { kana: 0.85 }, audio: { ja: 0.9 }, keywords: ['japan', 'japanese', 'tokyo', 'osaka'] },
    IL: { scripts: { hebrew: 0.85 }, audio: { he: 0.9, iw: 0.9 }, keywords: ['israel', 'telaviv'] },
    GE: { scripts: { georgian: 0.95 }, audio: { ka: 0.95 }, keywords: ['georgia', 'tbilisi'] },
    AM: { scripts: { armenian: 0.9 }, audio: { hy: 0.9 }, keywords: ['armenia', 'yerevan'] },
    KH: { scripts: { khmer: 0.95 }, audio: { km: 0.95 }, keywords: ['cambodia', 'phnompenh'] },
    LA: { scripts: { lao: 0.95 }, audio: { lo: 0.95 }, keywords: ['laos', 'vientiane'] },
    MM: { scripts: { myanmar: 0.95 }, audio: { my: 0.95 }, keywords: ['myanmar', 'yangon'] },
    ET: { scripts: { ethiopic: 0.85 }, audio: { am: 0.9 }, keywords: ['ethiopia', 'addisababa'] },
  };

  const THRESHOLDS = { low: 0.85, medium: 0.7, high: 0.5 };

  function countryName(code) {
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
    } catch (_) {
      return code;
    }
  }

  function squash(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function tokenize(text) {
    return String(text || '').toLowerCase().match(/[a-z]+/g) || [];
  }

  function hashtags(text) {
    return (String(text || '').toLowerCase().match(/#[\p{L}\p{N}_]+/gu) || [])
      .map((h) => h.slice(1).replace(/_/g, ''));
  }

  function countScript(text, re) {
    const m = String(text || '').match(re);
    return m ? m.length : 0;
  }

  /** Noisy-OR: independent pieces of evidence combine to a probability-like score. */
  function combine(strengths) {
    return 1 - strengths.reduce((acc, s) => acc * (1 - Math.max(0, Math.min(1, s))), 1);
  }

  /**
   * Score how likely `meta` is from `country` using content evidence only.
   * Returns { score, reasons }.
   */
  function contentScore(meta, country) {
    const profile = PROFILES[country] || {};
    const reasons = [];
    const strengths = [];

    // "Strong" text fields: things the creator wrote about this video/channel.
    const text = [meta.title, meta.description, meta.channelTitle, meta.channelDescription,
      (meta.tags || []).join(' '), meta.location, meta.audioTitle].filter(Boolean).join('\n');

    // 1) Scripts
    for (const [script, weight] of Object.entries(profile.scripts || {})) {
      const n = countScript(text, SCRIPTS[script]);
      if (n >= 2) {
        const s = weight * Math.min(1, n / 6);
        strengths.push(s);
        reasons.push(`${script} script (${n} chars)`);
      }
    }

    // 2) Audio / default language reported by YouTube
    const langs = [meta.audioLanguage, meta.defaultLanguage]
      .filter(Boolean).map((l) => String(l).toLowerCase().split(/[-_]/)[0]);
    const seenLang = new Set();
    for (const l of langs) {
      if (seenLang.has(l)) continue;
      seenLang.add(l);
      const w = (profile.audio || {})[l];
      if (w) { strengths.push(w); reasons.push(`language: ${l}`); }
    }

    // 3) Romanised Hindi/Urdu
    if (profile.hinglish) {
      const toks = tokenize([meta.title, meta.description, (meta.tags || []).join(' ')].join(' '));
      const hits = toks.filter((t) => HINGLISH.has(t));
      const distinct = new Set(hits);
      if (distinct.size >= 2) {
        const ratio = hits.length / Math.max(toks.length, 1);
        const s = profile.hinglish * Math.min(1, distinct.size / 3 + ratio);
        strengths.push(s);
        reasons.push(`Hinglish words: ${[...distinct].slice(0, 4).join(', ')}`);
      }
    }

    // 4) Hashtags / keywords (incl. the country's own name for every country)
    const kw = new Set((profile.keywords || []).map(squash));
    kw.add(squash(countryName(country)));
    const tags = new Set([...hashtags(text), ...(meta.tags || []).map(squash)]);
    const tokenSet = new Set(tokenize(text));
    const tagHits = [...tags].filter((t) => kw.has(t) ||
      [...kw].some((k) => k.length >= 5 && t.includes(k)));
    const wordHits = [...kw].filter((k) => k.length >= 4 && tokenSet.has(k) && !tagHits.includes(k));
    if (tagHits.length) {
      strengths.push(Math.min(0.85, 0.5 + 0.15 * tagHits.length));
      reasons.push(`hashtags: #${tagHits.slice(0, 3).join(' #')}`);
    }
    if (wordHits.length) {
      strengths.push(Math.min(0.6, 0.3 + 0.1 * wordHits.length));
      reasons.push(`mentions: ${wordHits.slice(0, 3).join(', ')}`);
    }

    // 5) Tagged location (Instagram Reels: "Mumbai, Maharashtra", "Taj Mahal, Agra, India")
    if (meta.location) {
      const locToks = new Set(tokenize(meta.location));
      const locSquash = squash(meta.location);
      const hit = [...kw].find((k) => (k.length >= 4 && locToks.has(k)) || (k.length >= 6 && locSquash.includes(k)));
      if (hit) {
        strengths.push(0.85);
        reasons.push(`location: ${String(meta.location).slice(0, 40)}`);
      }
    }

    return { score: combine(strengths), reasons };
  }

  /**
   * Main entry point.
   * @param meta {title, description, tags[], channelTitle, channelDescription,
   *              channelCountry, audioLanguage, defaultLanguage, location, audioTitle}
   * @param settings {countries: ['IN', ...], sensitivity: 'low'|'medium'|'high'}
   */
  function classify(meta, settings) {
    const countries = (settings.countries || []).map((c) => c.toUpperCase());
    const threshold = THRESHOLDS[settings.sensitivity] || THRESHOLDS.medium;
    const declared = meta.channelCountry ? String(meta.channelCountry).toUpperCase() : null;

    let best = { block: false, country: null, score: 0, reasons: [] };

    for (const c of countries) {
      if (declared === c) {
        return { block: true, country: c, score: 1,
          reasons: [`channel country is ${countryName(c)}`] };
      }
      let { score, reasons } = contentScore(meta, c);
      if (declared && declared !== c && score > 0) {
        // The creator says they're based elsewhere: weaker, but don't ignore strong evidence.
        score *= 0.5;
        reasons = reasons.concat(`but channel country is ${countryName(declared)}`);
      }
      if (score > best.score) best = { block: false, country: c, score, reasons };
    }

    best.block = best.score >= threshold;
    best.score = Math.round(best.score * 100) / 100;
    return best;
  }

  const api = { classify, contentScore, countryName, PROFILES, THRESHOLDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GeoNoClassifier = api;
})(typeof self !== 'undefined' ? self : this);
