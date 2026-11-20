/**
 * WKK Landesreihung Worker
 * Holt Bezirks-Dashboards serverseitig und liefert JSON.
 *
 * Deploy: wrangler deploy
 * Aufruf: GET /?id=6f69a61f7a6ad3a4f7b8553bc893d61e
 *         GET /?url=https://mpfeuer-vp.../dashboard/{id}/
 *         GET /list
 */

const DASHBOARD_BASE =
  'https://mpfeuer-vp.webservices.mpsoft4u.info/neu/kaernten/oeffentlich/veranstaltungen/dashboard/';

const BEZIRKE = [
  { name: 'Hermagor', short: 'HE', id: '6f69a61f7a6ad3a4f7b8553bc893d61e' },
  { name: 'Villach-Stadt', short: 'VI', id: '074e34926373b52297c0c5641e03b994' },
  { name: 'Wolfsberg', short: 'WO', id: '10feeedb756b548cd67bde3ee28035fa' },
  { name: 'Völkermarkt', short: 'VK', id: '14ec38979b942db672accbde037fbbe3' },
  { name: 'St. Veit/Glan', short: 'SV', id: '71ed2a30410cb4970056fb050c2487bc' },
  { name: 'Villach-Land', short: 'VL', id: 'fa1931052f2fb834ea43a2a67936ad3d' },
  { name: 'Klagenfurt-Stadt', short: 'K', id: 'add570a42090b1a109506fc93f0c39c7' },
  { name: 'Klagenfurt-Land', short: 'KL', id: '5553cb9f94e3c32ad6bcee1402342522' },
  { name: 'Spittal/Drau', short: 'SP', id: '72bdbc514d92a4acdb8eb68e9813034c' },
  { name: 'Feldkirchen', short: 'FE', id: '797996ee2589f83a0ef7f612ed40b9aa' }
];

const CATEGORIES = [
  'KFLA Bronze A',
  'KFLA Bronze B',
  'KFLA Silber A',
  'Mannschaftsleistungsbewerb (MLB)'
];

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=120'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() }
  });
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseNum(s) {
  const n = parseFloat(String(s || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function parseFpZeit(cellHtml) {
  const clean = stripTags(cellHtml);
  const parts = clean.split(/\s+/);
  return {
    fp: parseInt(parts[0], 10) || 0,
    zeit: parts[1] ? parts[1].replace('.', ',') : '0:00,00'
  };
}

function parseCategory(html, categoryName) {
  const entries = [];
  // Finde den Abschnitt der Kategorie über die Tabellen-ID oder Überschrift
  const idHint = categoryName.replace(/\s+/g, '_').replace(/[()]/g, '');
  const tableRe = new RegExp(
    `<table[^>]*(?:id=["'][^"']*${idHint}[^"']*["'])[^>]*>[\\s\\S]*?<\\/table>`,
    'i'
  );
  let scope = html;
  const tm = html.match(tableRe);
  if (tm) scope = tm[0];

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(scope)) !== null) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => x[1]);
    if (cells.length < 6) continue;
    const name = stripTags(cells[1]);
    if (!name || name.length < 2) continue;
    const sp = parseNum(stripTags(cells[2]));
    const la = parseFpZeit(cells[3]);
    const sl = parseFpZeit(cells[4]);
    const points = parseNum(stripTags(cells[5]));
    if (points < 50) continue;
    entries.push({
      name,
      points,
      startpunkte: sp,
      fp_la: la.fp,
      zeit_la: la.zeit,
      fp_sa: sl.fp,
      zeit_sa: sl.zeit,
      category: categoryName
    });
  }
  return entries;
}

async function fetchDashboard(id) {
  const url = DASHBOARD_BASE + id + '/';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'WKK-Landesreihung/1.0',
      'Accept': 'text/html'
    }
  });
  if (!res.ok) throw new Error('Dashboard HTTP ' + res.status);
  return res.text();
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const u = new URL(request.url);

    if (u.pathname === '/list' || u.pathname === '/bezirke') {
      return json({ bezirke: BEZIRKE, categories: CATEGORIES });
    }

    let id = u.searchParams.get('id');
    const rawUrl = u.searchParams.get('url');
    const bezirkName = u.searchParams.get('bezirk');

    if (!id && bezirkName) {
      const found = BEZIRKE.find(b => b.name.toLowerCase() === bezirkName.toLowerCase() || b.short.toLowerCase() === bezirkName.toLowerCase());
      if (found) id = found.id;
    }
    if (!id && rawUrl) {
      const m = rawUrl.match(/dashboard\/([a-f0-9]+)/i);
      if (m) id = m[1];
    }
    if (!id) {
      return json({ error: 'id, url oder bezirk fehlt', example: '/?id=6f69a61f7a6ad3a4f7b8553bc893d61e' }, 400);
    }

    try {
      const html = await fetchDashboard(id);
      const data = {};
      for (const kat of CATEGORIES) {
        data[kat] = parseCategory(html, kat);
      }
      const meta = BEZIRKE.find(b => b.id === id) || { id };
      return json({
        ok: true,
        bezirk: meta.name || id,
        short: meta.short || '',
        id,
        fetchedAt: new Date().toISOString(),
        categories: data
      });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e), id }, 502);
    }
  }
};
