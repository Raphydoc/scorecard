// node tools/snap_live.mjs live.json
// Cours « en direct » (Yahoo Finance, ~1 min) et manchettes (fils RSS de sources reconnues) pour
// la Surveillance des marchés et le Fil en direct. Appelé en boucle par .github/workflows/direct.yml.
// Aucune clé : données publiques.
import fs from 'node:fs';
const [OUT = 'live.json', NEWS = '1'] = process.argv.slice(2);
const UA = {'User-Agent': 'Mozilla/5.0 (scorecard-macro; GitHub Actions)', 'Accept': '*/*'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
let prev = {}; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
let M = {}; try { M = JSON.parse(fs.readFileSync('markets.json', 'utf8')); } catch (e) {}
// les 16 actifs du scorecard (tendance de la journée) et le taux 10 ans
const AS = {xauusd: 'GC=F', xagusd: 'SI=F', nasdaq: '^NDX', spx500: '^GSPC', us30: '^DJI', rut: '^RUT', usd: 'DX-Y.NYB', usoil: 'CL=F', btcusd: 'BTC-USD', eurusd: 'EURUSD=X', usdjpy: 'JPY=X', usdcad: 'CAD=X', gbpusd: 'GBPUSD=X', audusd: 'AUDUSD=X', usdchf: 'CHF=X', nzdusd: 'NZDUSD=X'};
const syms = [...new Set(Object.values(M.watch || {}).flat().map(x => x.s).concat(Object.values(AS), ['^TNX']))];

async function getJSON(url) {
  try { const r = await fetch(url, {headers: UA, signal: AbortSignal.timeout(8000)}); if (r.ok) return r.json(); console.error('HTTP', r.status, url.slice(0, 90)); } catch (e) { console.error('err', e.message, url.slice(0, 90)); }
  return null;
}
async function getText(url) {
  try { const r = await fetch(url, {headers: UA, signal: AbortSignal.timeout(8000)}); if (r.ok) return r.text(); console.error('HTTP', r.status, url.slice(0, 90)); } catch (e) { console.error('err', e.message, url.slice(0, 90)); }
  return null;
}
async function pool(items, fn, n = 6) {
  const out = new Array(items.length); let k = 0;
  await Promise.all(Array.from({length: n}, async () => { while (k < items.length) { const i = k++; out[i] = await fn(items[i]); } }));
  return out;
}
const dp = v => Math.abs(v) < 2 ? 5 : Math.abs(v) < 20 ? 4 : Math.abs(v) < 1000 ? 2 : 1;

// Journée de bourse : la journée se termine à 17 h (heure de New York), comme le forex et les contrats à terme.
// Les barres de 5 minutes sont regroupées par journée; ouverture = 1re barre de la journée en cours, clôture d'hier = dernière barre de la journée précédente.
const NYD = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'});
function dayStats(rows) {
  if (!rows || rows.length < 2) return null;
  const key = t => NYD.format(new Date((t + 7 * 3600) * 1000));
  const last = key(rows[rows.length - 1][0]);
  const cur = rows.filter(r => key(r[0]) === last), before = rows.filter(r => key(r[0]) < last);
  if (!cur.length || !before.length) return null;
  return {o: cur[0][1], px: cur[cur.length - 1][4], pc: before[before.length - 1][4]};
}

// ---------- cours ----------
const q = Object.assign({}, prev.q || {});
async function quoteChart(sym) {
  for (const host of ['query1', 'query2']) {
    const j = await getJSON(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=5m&includePrePost=false`);
    const res = j && j.chart && j.chart.result && j.chart.result[0], m = res && res.meta;
    if (m && m.regularMarketPrice != null) return m;
  }
  return null;
}
// le dernier cours de la séance précédente (même référence que la variation 1D de markets.json)
const lastClose = {}; Object.values(M.watch || {}).flat().forEach(x => { if (x.last != null && x.d1 != null) lastClose[x.s] = x.last / (1 + x.d1 / 100); });
const metas = await pool(syms, quoteChart);
let ok = 0;
syms.forEach((s, i) => { const m = metas[i]; if (!m) return; ok++;
  const p = m.regularMarketPrice, pc = m.chartPreviousClose ?? m.previousClose ?? lastClose[s];
  q[s] = [+p.toFixed(dp(p)), pc ? +((p / pc - 1) * 100).toFixed(2) : null, (m.regularMarketTime || 0) * 1000]; });
console.error('cours', ok, '/', syms.length);
// tendance de la journée : haussière si le prix est au-dessus de l'ouverture du jour ET de la clôture d'hier, baissière s'il est en dessous des deux
async function bars5(sym) {
  for (const host of ['query1', 'query2']) {
    const j = await getJSON(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=5m&includePrePost=false`);
    const r = j && j.chart && j.chart.result && j.chart.result[0]; if (!r || !r.timestamp) continue;
    const qq = r.indicators.quote[0], out = []; r.timestamp.forEach((t, i) => { if (qq.close[i] != null && qq.open[i] != null) out.push([t, qq.open[i], 0, 0, qq.close[i]]); });
    if (out.length) return out;
  }
  return null;
}
const trSyms = Object.entries(AS).concat([['__y10', '^TNX']]);
const trBars = await pool(trSyms, ([, s]) => bars5(s), 6);
const tr = Object.assign({}, prev.tr || {}); let y10 = prev.y10 || null;
trSyms.forEach(([k], i) => { const D = dayStats(trBars[i]); if (!D) return;
  const {o, px, pc} = D;
  if (k === '__y10') { const ch = Math.round((px - pc) * 1000) / 1000; y10 = {px: +px.toFixed(3), pc: +pc.toFixed(3), chg: ch, dir: ch >= 0.01 ? 'rising' : ch <= -0.01 ? 'falling' : 'flat'}; return; }
  tr[k] = {t: px > o && px > pc ? 'bull' : px < o && px < pc ? 'bear' : 'neutral', px: +px.toFixed(dp(px)), o: +o.toFixed(dp(px)), pc: +pc.toFixed(dp(px)), chg: +((px / pc - 1) * 100).toFixed(2), vsO: +((px / o - 1) * 100).toFixed(2)}; });
console.error('tendances', Object.keys(tr).length, '10 ans', y10 && y10.dir);

// ---------- manchettes ----------
let news = (prev.news || []).slice();
if (NEWS === '1') {
  const FEEDS = [
    ['MarketWatch', 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse', 0],
    ['MarketWatch', 'https://feeds.content.dowjones.io/public/rss/mw_topstories', 1],
    ['CNBC', 'https://www.cnbc.com/id/100003114/device/rss/rss.html', 1],
    ['CNBC', 'https://www.cnbc.com/id/20910258/device/rss/rss.html', 1],
    ['CNBC', 'https://www.cnbc.com/id/10000664/device/rss/rss.html', 1],
    ['Yahoo Finance', 'https://finance.yahoo.com/news/rssindex', 1],
    ['FXStreet', 'https://www.fxstreet.com/rss/news', 0],
    ['CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/', 1],
    ['Investing.com', 'https://www.investing.com/rss/news_25.rss', 0],
    ['Investing.com', 'https://www.investing.com/rss/news_1.rss', 0],
    ['Investing.com', 'https://www.investing.com/rss/news_11.rss', 0],
    ['Federal Reserve', 'https://www.federalreserve.gov/feeds/press_all.xml', 0],
  ];
  const KEY = /stock|market|wall street|fed\b|federal reserve|powell|dow\b|s&p|nasdaq|russell|treasur|yield|bond|dollar|gold|silver|oil|crude|opec|bitcoin|crypto|ether|inflation|cpi|ppi|pce|payroll|jobs|jobless|unemploy|rate|earnings|shares|tariff|econom|gdp|futures|currenc|yen|euro|ecb|boj|bank of|nvidia|apple|microsoft|tesla|recession|sell-off|rally/i;
  const dec = s => (s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘').replace(/&#822[01];/g, '"').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/\s+/g, ' ').trim();
  const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? dec(m[1]) : ''; };
  const texts = await pool(FEEDS, f => getText(f[1]), 6);
  const cut = Date.now() - 36 * 3600e3, seen = new Set(news.map(n => n.url));
  FEEDS.forEach(([src, , filt], i) => {
    const xml = texts[i]; if (!xml) return;
    (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).slice(0, 30).forEach(it => {
      const title = tag(it, 'title'), url = tag(it, 'link') || (it.match(/<guid[^>]*>(https?:[^<]+)</i) || [])[1], t = Date.parse(tag(it, 'pubDate') || tag(it, 'dc:date'));
      if (!title || !url || !isFinite(t) || t < cut || t > Date.now() + 6e5 || seen.has(url)) return;
      if (filt && !KEY.test(title)) return;
      seen.add(url); news.push({t, src, title, url});
    });
  });
  // une même manchette reprise par deux fils : on garde la première
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const byTitle = new Set();
  news = news.filter(n => n.t >= cut).sort((a, b) => b.t - a.t).filter(n => { const k = norm(n.title); if (byTitle.has(k)) return false; byTitle.add(k); return true; }).slice(0, 80);
  // traduction française des nouvelles manchettes
  await pool(news.filter(n => !n.fr), async n => {
    const j = await getJSON(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t&q=${encodeURIComponent(n.title)}`);
    if (j && Array.isArray(j[0])) { const fr = j[0].map(x => x[0]).join('').trim(); if (fr) n.fr = fr; }
  }, 4);
  console.error('manchettes', news.length);
}

const out = {asOf: new Date().toISOString(), q, news, tr, y10};
if (ok || news.length) fs.writeFileSync(OUT, JSON.stringify(out));
