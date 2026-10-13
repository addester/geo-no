(async () => {
  let s = await loadSettings();
  const $ = (id) => document.getElementById(id);

  const savedEl = $('saved');
  let savedT;
  async function save(patch) {
    Object.assign(s, patch);
    await saveSettings(patch);
    savedEl.classList.add('show');
    clearTimeout(savedT);
    savedT = setTimeout(() => savedEl.classList.remove('show'), 1200);
  }

  // ---------- countries ----------
  const all = ISO_CODES.map((c) => ({ code: c, name: countryName(c) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  function renderChips() {
    const box = $('chips');
    box.innerHTML = '';
    if (!s.countries.length) box.innerHTML = '<small class="muted">None yet.</small>';
    s.countries.forEach((c) => {
      const el = document.createElement('span');
      el.className = 'chip';
      el.innerHTML = `<span></span><button title="Remove">×</button>`;
      el.firstChild.textContent = `${flag(c)} ${countryName(c)}${RICH_PROFILES.includes(c) ? ' ★' : ''}`;
      el.lastChild.onclick = () => { save({ countries: s.countries.filter((x) => x !== c) }); renderChips(); };
      box.appendChild(el);
    });
  }

  const search = $('search'), results = $('results');
  let hl = 0, matches = [];
  function renderResults() {
    const q = search.value.trim().toLowerCase();
    matches = all.filter((c) => !s.countries.includes(c.code) &&
      (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q)).slice(0, 40);
    results.innerHTML = '';
    matches.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = i === hl ? 'hl' : '';
      d.innerHTML = '<span></span><small class="muted"></small>';
      d.firstChild.textContent = `${flag(c.code)} ${c.name}`;
      d.lastChild.textContent = RICH_PROFILES.includes(c.code) ? '★ ' + c.code : c.code;
      d.onmousedown = (e) => { e.preventDefault(); add(c.code); };
      results.appendChild(d);
    });
    results.hidden = !matches.length;
  }
  function add(code) {
    save({ countries: [...s.countries, code] });
    search.value = ''; hl = 0;
    renderChips(); renderResults();
    results.hidden = true; // close until the user types again
  }
  search.onfocus = () => { hl = 0; renderResults(); };
  search.oninput = () => { hl = 0; renderResults(); };
  search.onblur = () => { results.hidden = true; };
  search.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { hl = Math.min(hl + 1, matches.length - 1); renderResults(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { hl = Math.max(hl - 1, 0); renderResults(); e.preventDefault(); }
    if (e.key === 'Enter' && matches[hl]) add(matches[hl].code);
    if (e.key === 'Escape') search.blur();
  };

  // ---------- segmented controls ----------
  document.querySelectorAll('.seg').forEach((seg) => {
    const key = seg.dataset.key;
    const paint = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === s[key]));
    seg.onclick = (e) => { const v = e.target.dataset.v; if (v) { save({ [key]: v }); paint(); } };
    paint();
  });

  // ---------- API key ----------
  const keyIn = $('apiKey'), status = $('keyStatus');
  keyIn.value = s.apiKey;
  function setStatus(text, cls) { status.className = cls || 'muted'; status.firstChild.textContent = text; }
  $('testKey').onclick = async () => {
    const k = keyIn.value.trim();
    await save({ apiKey: k });
    if (!k) return setStatus('Key removed. Using title/channel name only.');
    setStatus('Testing…');
    try {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=UC_x5XG1OV2P6uZZ5FSM9Ttw&key=${encodeURIComponent(k)}`);
      const j = await r.json();
      if (r.ok) setStatus('✓ Key works.', 'ok');
      else setStatus('✗ ' + ((j.error && j.error.message) || 'Key rejected') + '. Make sure YouTube Data API v3 is enabled for this project.', 'bad');
    } catch (e) { setStatus('✗ Could not reach Google: ' + e.message, 'bad'); }
  };

  // ---------- channel lists ----------
  function renderList(id, key) {
    const box = $(id);
    box.innerHTML = '';
    if (!s[key].length) box.innerHTML = '<small class="muted">None.</small>';
    s[key].forEach((c) => {
      const el = document.createElement('span');
      el.className = 'chip';
      el.innerHTML = '<span></span><button title="Remove">×</button>';
      el.firstChild.textContent = c.name || c.key;
      el.lastChild.onclick = () => { save({ [key]: s[key].filter((x) => x.key !== c.key) }); renderList(id, key); };
      box.appendChild(el);
    });
  }

  chrome.storage.onChanged.addListener(async (_c, area) => {
    if (area !== 'sync') return;
    s = await loadSettings();
    renderList('allowList', 'allowChannels');
  });

  renderChips();
  renderList('allowList', 'allowChannels');
})();
