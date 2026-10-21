const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 4173);
const API_KEY = process.env.API_FOOTBALL_KEY || '';
const ROOT = __dirname;
const API_BASE = 'https://v3.football.api-sports.io';

function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}

async function api(endpoint, params = {}) {
  if (!API_KEY) throw Object.assign(new Error('API anahtarı ayarlanmamış. README bölümündeki adımları izleyin.'), { status: 503 });
  const url = new URL(API_BASE + endpoint);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { 'x-apisports-key': API_KEY } });
  const data = await response.json();
  if (!response.ok || data.errors && Object.keys(data.errors).length) {
    throw Object.assign(new Error(JSON.stringify(data.errors || data.message || 'Veri sağlayıcı isteği başarısız.')), { status: response.ok ? 502 : response.status || 502 });
  }
  return data.response || [];
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    try {
      if (url.pathname === '/api/status') return send(res, 200, { connected: Boolean(API_KEY), provider: 'API-Football' });
      if (url.pathname === '/api/fixtures') {
        const date = url.searchParams.get('date');
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return send(res, 400, { error: 'Geçerli bir tarih gerekli.' });
        return send(res, 200, { data: await api('/fixtures', { date, timezone: 'Europe/Istanbul' }) });
      }
      if (url.pathname === '/api/analyze') {
        const id = url.searchParams.get('fixture');
        if (!id) return send(res, 400, { error: 'Maç kimliği gerekli.' });
        const fixture = await api('/fixtures', { id });
        if (!fixture.length) return send(res, 404, { error: 'Maç bulunamadı.' });
        const match = fixture[0];
        const home = match.teams.home, away = match.teams.away;
        const league = match.league;
        const season = league.season;
        const pair = `${home.id}-${away.id}`;
        const [h2h, injuries, lineups, homeRecent, awayRecent] = await Promise.all([
          api('/fixtures/headtohead', { h2h: pair, last: '20' }).catch(() => []),
          api('/injuries', { fixture: id }).catch(() => []),
          api('/fixtures/lineups', { fixture: id }).catch(() => []),
          api('/fixtures', { team: home.id, last: '10' }).catch(() => []),
          api('/fixtures', { team: away.id, last: '10' }).catch(() => [])
        ]);
        return send(res, 200, { match, h2h, injuries, lineups, homeRecent, awayRecent });
      }
      return send(res, 404, { error: 'API adresi bulunamadı.' });
    } catch (error) {
      return send(res, error.status || 502, { error: error.message || 'Veri alınamadı.' });
    }
  }
  const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(ROOT, requested);
  if (!file.startsWith(path.resolve(ROOT) + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (error, content) => {
    if (error) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    const ext = path.extname(file);
    const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
    send(res, 200, content, type);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Mac Analiz hazır: http://localhost:${PORT}`));
