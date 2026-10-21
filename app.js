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
function finished(items) {
  return (items || []).filter(m => ['FT','AET','PEN'].includes(m.fixture.status.short) && m.goals.home != null && m.goals.away != null);
}
function teamRecord(items, teamId) {
  const matches = finished(items);
  let goalsFor = 0, goalsAgainst = 0, wins = 0, draws = 0;
  for (const m of matches) {
    const isHome = m.teams.home.id === teamId;
    const gf = isHome ? m.goals.home : m.goals.away, ga = isHome ? m.goals.away : m.goals.home;
    goalsFor += gf; goalsAgainst += ga;
    if (gf > ga) wins++; else if (gf === ga) draws++;
  }
  return { count: matches.length, gf: matches.length ? goalsFor / matches.length : null, ga: matches.length ? goalsAgainst / matches.length : null, wins, draws, form: matches.slice(0,5).map(m => {
    const isHome = m.teams.home.id === teamId;
    const gf = isHome ? m.goals.home : m.goals.away, ga = isHome ? m.goals.away : m.goals.home;
    return gf > ga ? 'G' : gf === ga ? 'B' : 'M';
  }).join('') };
}
function resultProb(data) {
  const h = data.match.teams.home.id, a = data.match.teams.away.id;
  const home = teamRecord(data.homeRecent, h), away = teamRecord(data.awayRecent, a);
  const pair = finished(data.h2h);
  const h2hHome = teamRecord(pair, h), h2hAway = teamRecord(pair, a);
  const blend = (own, opponent, h2hOwn, fallback) => {
    const recentValue = own.gf != null && opponent.ga != null ? own.gf * .55 + opponent.ga * .45 : own.gf ?? opponent.ga ?? fallback;
    return Math.max(.15, Math.min(4.5, h2hOwn.gf == null ? recentValue : recentValue * .78 + h2hOwn.gf * .22));
  };
  const lambdaHome = blend(home, away, h2hHome, 1.45) * 1.06;
  const lambdaAway = blend(away, home, h2hAway, 1.15) * .96;
  const fact = n => n < 2 ? 1 : n * fact(n - 1);
  const probs = (lambda) => Array.from({length: 9}, (_, n) => Math.exp(-lambda) * Math.pow(lambda, n) / fact(n));
  const hp = probs(lambdaHome), ap = probs(lambdaAway);
  let homeWin = 0, draw = 0, awayWin = 0, best = { p: -1, h: 0, a: 0 };
  for (let hg=0; hg<hp.length; hg++) for (let ag=0; ag<ap.length; ag++) {
    const chance = hp[hg] * ap[ag];
    if (hg > ag) homeWin += chance; else if (hg === ag) draw += chance; else awayWin += chance;
    if (chance > best.p) best = { p: chance, h: hg, a: ag };
  }
  const atLeast = threshold => 1 - Array.from({length: threshold}, (_, n) => hp[n] * ap.slice(0, threshold - n).reduce((sum, x) => sum + x, 0)).reduce((sum, x) => sum + x, 0);
  return { home: homeWin, draw, away: awayWin, lambdaHome, lambdaAway, score: best, goals1: atLeast(1), goals2: atLeast(2), goals3: atLeast(3), goals4: atLeast(4), homeRecord: home, awayRecord: away, h2hHome, h2hAway, h2hCount: pair.length };
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
  const f = (record) => record?.form ? record.form.split('').map(c => `<span class="badge ${c === 'M' ? 'warning' : ''}">${c}</span>`).join('') : '<span class="badge">Form verisi yok</span>';
  const h2h = finished(d.h2h).slice(0, 20);
  const hWins = h2h.filter(x => x.teams.home.id === h.id ? x.goals.home > x.goals.away : x.goals.away > x.goals.home).length;
  const aWins = h2h.filter(x => x.teams.home.id === a.id ? x.goals.home > x.goals.away : x.goals.away > x.goals.home).length;
  const draws = h2h.filter(x => x.goals.home === x.goals.away).length;
  const lineups = (team) => d.lineups.find(x => x.team.id === team.id)?.startXI || [];
  const injured = (team) => d.injuries.filter(x => x.team.id === team.id);
  const playerList = (team) => lineups(team).length ? `<ul>${lineups(team).map(x => `<li>${escapeHTML(x.player.name)}</li>`).join('')}</ul>` : '<ul><li>İlk 11 henüz açıklanmadı</li></ul>';
  const injuryList = [...injured(h), ...injured(a)];
  const pctBar = (label, val) => `<div class="prob-row"><span>${label}</span><div class="bar"><i style="width:${pct(val*100)}"></i></div><b>${pct(val*100)}</b></div>`;
  const paragraph = `Skor modeli ${p.score.h}-${p.score.a} sonucunu en yüksek olasılıklı skor olarak buluyor; beklenen gol ${h.name} ${p.lambdaHome.toFixed(1)} – ${a.name} ${p.lambdaAway.toFixed(1)}. En az 2 gol olasılığı ${pct(p.goals2*100)}, en az 3 gol olasılığı ${pct(p.goals3*100)}. ${h2h.length ? `Lig ayrımı olmadan bulunan son ${h2h.length} karşılaşmada ${hWins} ${h.name} galibiyeti, ${draws} beraberlik ve ${aWins} ${a.name} galibiyeti var.` : 'İki takım arasında geçmiş karşılaşma kaydı bulunamadı.'} Takımların son maç formu da lig ayrımı yapılmadan değerlendirilir. Tahminler geçmiş gol ortalamalarına dayalı olasılıksal model çıktısıdır; kesin sonuç değildir.`;
  $('#analysis').innerHTML = `<div class="analysis-card"><div class="result-card"><div class="result-heading">MAÇ ANALİZİ · ${escapeHTML(m.league.name.toLocaleUpperCase('tr-TR'))}</div><div class="result-match"><div class="club"><img src="${escapeHTML(h.logo)}"><b>${escapeHTML(h.name)}</b></div><div class="score-mid"><strong>${m.goals.home ?? '—'} : ${m.goals.away ?? '—'}</strong>${escapeHTML(m.fixture.status.long)}</div><div class="club"><img src="${escapeHTML(a.logo)}"><b>${escapeHTML(a.name)}</b></div></div><div class="score-prediction"><span>TAHMİNİ SKOR</span><strong>${p.score.h} – ${p.score.a}</strong><small>En olası skor · beklenen gol ${p.lambdaHome.toFixed(1)} – ${p.lambdaAway.toFixed(1)}</small></div><div class="prob-title">1X2 KAZANMA OLASILIKLARI <span style="float:right">gol modeli</span></div><div class="prob-bars">${pctBar('Ev sahibi',p.home)}${pctBar('Beraberlik',p.draw)}${pctBar('Deplasman',p.away)}</div></div><div class="detail-card"><h3>Gol tahmini</h3><div class="stat-line"><span>Toplam beklenen gol</span><b>${(p.lambdaHome+p.lambdaAway).toFixed(1)}</b></div><div class="stat-line"><span>En az 1 gol</span><b>${pct(p.goals1*100)}</b></div><div class="stat-line"><span>En az 2 gol</span><b>${pct(p.goals2*100)}</b></div><div class="stat-line"><span>En az 3 gol</span><b>${pct(p.goals3*100)}</b></div><div class="stat-line"><span>En az 4 gol</span><b>${pct(p.goals4*100)}</b></div></div><div class="detail-card"><h3>Takım formu <span style="float:right;color:#7d8b81;font:9px var(--font)">Son 5 · tüm ligler</span></h3><div class="stat-line"><span>${escapeHTML(h.name)}</span><b>${p.homeRecord.count} maç · ${p.homeRecord.gf == null ? '—' : p.homeRecord.gf.toFixed(1)} gol attı</b></div><div class="badges">${f(p.homeRecord)}</div><div class="stat-line"><span>${escapeHTML(a.name)}</span><b>${p.awayRecord.count} maç · ${p.awayRecord.gf == null ? '—' : p.awayRecord.gf.toFixed(1)} gol attı</b></div><div class="badges">${f(p.awayRecord)}</div><div class="stat-line"><span>İkili rekabet · tüm ligler</span><b>${hWins}G · ${draws}B · ${aWins}G (${h2h.length})</b></div><div class="stat-line"><span>Eksik oyuncu</span><b>${injuryList.length} bildirim</b></div></div><div class="detail-card"><h3>Muhtemel / açıklanan ilk 11</h3><div class="lineup-columns"><div class="lineup-box"><b>${escapeHTML(h.name)}</b>${playerList(h)}</div><div class="lineup-box"><b>${escapeHTML(a.name)}</b>${playerList(a)}</div></div></div><div class="detail-card"><h3>Sakat / cezalı oyuncular</h3>${injuryList.length ? injuryList.map(x=>`<div class="injury-item">${escapeHTML(x.player.name)} · ${escapeHTML(x.team.name)} <span>${escapeHTML(x.player.reason || 'Eksik')}</span></div>`).join('') : '<div class="injury-item">Bu maç için bildirilmiş eksik bulunamadı. Veri bulunmaması, eksik olmadığı anlamına gelmeyebilir.</div>'}</div><div class="analysis-summary"><h3>Maçın kısa özeti</h3><p>${escapeHTML(paragraph)}</p><div class="badges"><span class="badge">Kaynak: API-Football</span><span class="badge">${d.lineups.length ? 'İlk 11 verisi mevcut' : 'İlk 11 henüz açıklanmadı'}</span><span class="badge warning">Tahmin olasılıksaldır, garanti değildir</span></div></div></div>`;
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
