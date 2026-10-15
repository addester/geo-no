(async () => {
  const s = await loadSettings();
  const { stats } = await chrome.storage.local.get({ stats: null });
  const today = new Date().toISOString().slice(0, 10);
  const st = stats && stats.date === today ? stats : { blocked: 0, checked: 0 };

  const enabled = document.getElementById('enabled');
  const body = document.getElementById('body');
  enabled.checked = s.enabled;
  body.classList.toggle('off', !s.enabled);
  enabled.onchange = () => { saveSettings({ enabled: enabled.checked }); body.classList.toggle('off', !enabled.checked); };

  document.getElementById('blocked').textContent = st.blocked;
  document.getElementById('checked').textContent = st.checked;

  const box = document.getElementById('countries');
  if (!s.countries.length) box.innerHTML = '<small class="muted">No countries chosen yet — open Settings.</small>';
  s.countries.forEach((c) => {
    const el = document.createElement('span');
    el.className = 'chip';
    el.style.paddingRight = '10px';
    el.textContent = `${flag(c)} ${countryName(c)}`;
    box.appendChild(el);
  });

  const sites = [s.youtube !== false && 'YouTube Shorts', s.instagram !== false && 'Instagram Reels'].filter(Boolean);
  document.getElementById('modeLine').textContent =
    `${s.mode === 'skip' ? 'Auto-skipping' : 'Blurring'} matches on ${sites.join(' + ') || 'no sites'} · ` +
    `${s.sensitivity} sensitivity · ` + (s.apiKey ? 'YouTube API on' : 'no YouTube API key (less accurate)');
})();
