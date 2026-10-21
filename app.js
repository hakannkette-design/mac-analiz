const $ = (s) => document.querySelector(s);
const today = new Date();
const isoToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(today);
const trDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
$('#matchDate').value = isoToday;
$('#dateLabel').textContent = trDate(isoToday);
$('#topDate').textContent = trDate(isoToday);
let fixtures = [];
let selectedMode = 'today';

function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3500); }
async function getJSON(path) { const r = await fetch(path); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'İstek başarısız.'); return d; }

async function loadStatus() {
  try { const status = await getJSON('/api/status'); $('#connectionText').textContent = status.connected ? 'Veri bağlantısı aktif' : 'Demo modu'; $('#connectionSub').textContent = status.connected ? 'API-Football bağlantısı hazır' : 'API anahtarı yapılandırılmalı'; if (status.connected) loadFixtures(); }
  catch { $('#connectionText').textContent = 'Bağlantı yok'; }
}
async function loadFixtures() {
  const date = $('#matchDate').value;
  $('#fixtureRows').innerHTML = '<div class="empty-state"><span>◌</span><b>Maçlar yükleniyor…</b></div>';
  try {
    const { data } = await getJSON(`/api/fixtures?date=${encodeURIComponent(date)}`);
    fixtures = data;
    renderFixtures();
  } catch (e) {
    fixtures = [];
    $('#fixtureRows').innerHTML = `<div class="empty-state"><span>⌁</span><b>Maç verileri alınamadı</b><small>${escapeHTML(e.message)}</small></div>`;
  }
}
function escapeHTML(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function renderFixtures() {
  const query = $('#fixtureSearch').value.trim().toLocaleLowerCase('tr-TR');
  const filtered = fixtures.filter(f => !query || `${f.teams.home.name} ${f.teams.away.name} ${f.league.name} ${f.league.country}`.toLocaleLowerCase('tr-TR').includes(query));
  $('#fixtureCount').textContent = `${filtered.length} MAÇ`;
  if (!filtered.length) { $('#fixtureRows').innerHTML = '<div class="empty-state"><span>⌕</span><b>Bu aramayla eşleşen maç yok</b><small>Farklı bir takım veya lig adı deneyin.</small></div>'; return; }
  $('#fixtureRows').innerHTML = filtered.slice(0, 40).map(f => {
    const time = new Date(f.fixture.date).toLocaleTimeString('tr-TR', { timeZone:'Europe/Istanbul', hour:'2-digit', minute:'2-digit' });
    const score = f.goals.home == null ? time : `${f.goals.home} : ${f.goals.away}`;
    const status = f.fixture.status.short === 'NS' ? 'Başlama' : f.fixture.status.long;
    return `<div class="fixture-row" data-id="${f.fixture.id}"><div class="league-meta"><span class="league-ball">⚽</span><span>${escapeHTML(f.league.country)} · ${escapeHTML(f.league.name)}</span></div><div class="teams"><span class="team"><img src="${escapeHTML(f.teams.home.logo)}" alt=""><span>${escapeHTML(f.teams.home.name)}</span></span><em>vs</em><span class="team"><img src="${escapeHTML(f.teams.away.logo)}" alt=""><span>${escapeHTML(f.teams.away.name)}</span></span></div><div class="fixture-time"><b>${score}</b>${escapeHTML(status)}</div><div class="row-link">Analiz et →</div></div>`;
  }).join('');
  document.querySelectorAll('.fixture-row').forEach(el => el.addEventListener('click', () => analyze(el.dataset.id)));
}

function pct(n) { return `${Math.round(n)}%`; }
function resultProb(data) {
  const recent = (items, teamId) => {
    let points = 0, count = 0;
    for (const m of items) {
      if (m.fixture.status.short !== 'FT' && m.fixture.status.short !== 'AET' && m.fixture.status.short !== 'PEN') continue;
      const isHome = m.teams.home.id === teamId;
      const gf = isHome ? m.goals.home : m.goals.away, ga = isHome ? m.goals.away : m.goals.home;
      if (gf == null || ga == null) continue;
      points += gf > ga ? 3 : gf === ga ? 1 : 0; count++;
    }
    return count ? points / (count * 3) : .48;
  };
  const h = data.match.teams.home.id, a = data.match.teams.away.id;
  const hs = data.homeStats, as = data.awayStats;
  const formScore = (stats, fallback) => {
    const played = stats?.fixtures?.played?.total || 0;
    const wins = stats?.fixtures?.wins?.total || 0;
    return played ? wins / played : fallback;
  };
  const hp = formScore(hs, recent(data.h2h, h));
  const ap = formScore(as, recent(data.h2h, a));
  let home = 0.35 + (hp - ap) * .32 + .06;
  let away = 0.29 + (ap - hp) * .32;
  const injuriesHome = data.injuries.filter(x => x.team.id === h).length;
  const injuriesAway = data.injuries.filter(x => x.team.id === a).length;
  home -= injuriesHome * .012; away -= injuriesAway * .012;
  const total = home + away; home = home / total * .72; away = away / total * .72;
  return { home, draw: .28, away, hp, ap };
}
async function analyze(id) {
  $('#analysis').innerHTML = '<div class="analysis-placeholder"><div class="radar">◌</div><div><b>Maç analiz ediliyor…</b><span>Form, geçmiş maçlar, kadro ve eksikler taranıyor.</span></div></div>';
  $('#analysis').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try { const data = await getJSON(`/api/analyze?fixture=${encodeURIComponent(id)}`); renderAnalysis(data); }
  catch (e) { $('#analysis').innerHTML = `<div class="analysis-placeholder"><div class="radar">!</div><div><b>Analiz hazırlanamadı</b><span>${escapeHTML(e.message)}</span></div></div>`; }
}
function renderAnalysis(d) {
  const m = d.match, h = m.teams.home, a = m.teams.away;
  const p = resultProb(d);
  const f = (stats) => stats?.form ? stats.form.slice(-5).split('').map(c => `<span class="badge ${c === 'L' ? 'warning' : ''}">${c === 'W' ? 'G' : c === 'D' ? 'B' : c === 'L' ? 'M' : c}</span>`).join('') : '<span class="badge">Form verisi yok</span>';
  const h2h = d.h2h.slice(0, 8);
  const hWins = h2h.filter(x => x.teams.home.id === h.id ? x.goals.home > x.goals.away : x.goals.away > x.goals.home).length;
  const aWins = h2h.filter(x => x.teams.home.id === a.id ? x.goals.home > x.goals.away : x.goals.away > x.goals.home).length;
  const draws = h2h.filter(x => x.goals.home === x.goals.away).length;
  const lineups = (team) => d.lineups.find(x => x.team.id === team.id)?.startXI || [];
  const injured = (team) => d.injuries.filter(x => x.team.id === team.id);
  const playerList = (team) => lineups(team).length ? `<ul>${lineups(team).map(x => `<li>${escapeHTML(x.player.name)}</li>`).join('')}</ul>` : '<ul><li>İlk 11 henüz açıklanmadı</li></ul>';
  const injuryList = [...injured(h), ...injured(a)];
  const pctBar = (label, val) => `<div class="prob-row"><span>${label}</span><div class="bar"><i style="width:${pct(val*100)}"></i></div><b>${pct(val*100)}</b></div>`;
  const paragraph = `${h.name} için modelin hesapladığı galibiyet olasılığı ${pct(p.home*100)}; ${a.name} için ${pct(p.away*100)}. Beraberlik olasılığı ${pct(p.draw*100)}. ${h2h.length ? `Son ${h2h.length} karşılaşmada tablo ${hWins} ${h.name} galibiyeti, ${draws} beraberlik ve ${aWins} ${a.name} galibiyeti.` : 'İki takımın geçmiş karşılaşma verisi bulunamadı.'} Bu tahmin; lig performansı, iç saha avantajı ve bildirilen eksikleri temel alan basit bir modeldir.`;
  $('#analysis').innerHTML = `<div class="analysis-card"><div class="result-card"><div class="result-heading">MAÇ ANALİZİ · ${escapeHTML(m.league.name.toLocaleUpperCase('tr-TR'))}</div><div class="result-match"><div class="club"><img src="${escapeHTML(h.logo)}"><b>${escapeHTML(h.name)}</b></div><div class="score-mid"><strong>${m.goals.home ?? '—'} : ${m.goals.away ?? '—'}</strong>${escapeHTML(m.fixture.status.long)}</div><div class="club"><img src="${escapeHTML(a.logo)}"><b>${escapeHTML(a.name)}</b></div></div><div class="prob-title">1X2 KAZANMA OLASILIKLARI <span style="float:right">model tahmini</span></div><div class="prob-bars">${pctBar('Ev sahibi',p.home)}${pctBar('Beraberlik',p.draw)}${pctBar('Deplasman',p.away)}</div></div><div class="detail-card"><h3>Takım formu <span style="float:right;color:#7d8b81;font:9px var(--font)">Son maçlar</span></h3><div class="stat-line"><span>${escapeHTML(h.name)}</span><b></b></div><div class="badges">${f(d.homeStats)}</div><div class="stat-line"><span>${escapeHTML(a.name)}</span><b></b></div><div class="badges">${f(d.awayStats)}</div><div class="stat-line"><span>Geçmiş maçlar</span><b>${hWins}G · ${draws}B · ${aWins}G</b></div><div class="stat-line"><span>Eksik oyuncu</span><b>${injuryList.length} bildirim</b></div></div><div class="detail-card"><h3>Muhtemel / açıklanan ilk 11</h3><div class="lineup-columns"><div class="lineup-box"><b>${escapeHTML(h.name)}</b>${playerList(h)}</div><div class="lineup-box"><b>${escapeHTML(a.name)}</b>${playerList(a)}</div></div></div><div class="detail-card"><h3>Sakat / cezalı oyuncular</h3>${injuryList.length ? injuryList.map(x=>`<div class="injury-item">${escapeHTML(x.player.name)} · ${escapeHTML(x.team.name)} <span>${escapeHTML(x.player.reason || 'Eksik')}</span></div>`).join('') : '<div class="injury-item">Bu maç için bildirilmiş eksik bulunamadı. Veri bulunmaması, eksik olmadığı anlamına gelmeyebilir.</div>'}</div><div class="analysis-summary"><h3>Maçın kısa özeti</h3><p>${escapeHTML(paragraph)}</p><div class="badges"><span class="badge">Kaynak: API-Football</span><span class="badge">${d.lineups.length ? 'İlk 11 verisi mevcut' : 'İlk 11 henüz açıklanmadı'}</span><span class="badge warning">Olasılık tahmindir, garanti değildir</span></div></div></div>`;
}

document.querySelectorAll('.mode-tab').forEach(b => b.addEventListener('click', () => {
  selectedMode = b.dataset.mode;
  document.querySelectorAll('.mode-tab').forEach(x => x.classList.toggle('selected', x === b));
  $('#todayMode').classList.toggle('hidden', selectedMode !== 'today');
  $('#manualMode').classList.toggle('hidden', selectedMode !== 'manual');
  $('#fixtureList').classList.toggle('hidden', selectedMode !== 'today');
}));
$('#dateButton').addEventListener('click', () => { const input = $('#matchDate'); if (input.showPicker) input.showPicker(); else input.click(); });
$('#matchDate').addEventListener('change', e => { $('#dateLabel').textContent = trDate(e.target.value); loadFixtures(); });
$('#fixtureSearch').addEventListener('input', renderFixtures);
$('#manualAnalyze').addEventListener('click', () => {
  const home = $('#homeInput').value.trim(), away = $('#awayInput').value.trim();
  if (!home || !away) return toast('Analiz için iki takım adını da girin.');
  const normalize = s => s.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const match = fixtures.find(f => normalize(f.teams.home.name).includes(normalize(home)) && normalize(f.teams.away.name).includes(normalize(away)));
  if (match) return analyze(match.fixture.id);
  const reverse = fixtures.find(f => normalize(f.teams.home.name).includes(normalize(away)) && normalize(f.teams.away.name).includes(normalize(home)));
  if (reverse) return analyze(reverse.fixture.id);
  toast('Bu tarihte bu takımların maçı fikstürde bulunamadı. Tarihi değiştirip yeniden deneyin.');
});
$('#todayNav').addEventListener('click', () => { document.querySelector('[data-mode="today"]').click(); $('#fixtureSearch').focus(); });
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.querySelector('[data-mode="today"]').click(); $('#fixtureSearch').focus(); } });
loadStatus();
