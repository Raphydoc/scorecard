// node tools/snap_markets.mjs markets.json ohlc.json
// Market Watch, force des devises, sentiment de risque, banques et chandeliers (Yahoo Finance).
// Fait pour GitHub Actions : aucune clé, données publiques.
import fs from 'node:fs';
const [OUT_M = 'markets.json', OUT_O = 'ohlc.json'] = process.argv.slice(2);
const UA = {'User-Agent': 'Mozilla/5.0 (scorecard-macro; GitHub Actions)', 'Accept': '*/*'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const r2 = (x, d = 2) => x == null || !isFinite(x) ? null : +(+x).toFixed(d);
const dp = v => v == null ? 2 : Math.abs(v) < 2 ? 5 : Math.abs(v) < 20 ? 4 : Math.abs(v) < 1000 ? 2 : 1;

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, {headers: UA}); if (r.ok) return r.json(); if (r.status === 404) return null; console.error('HTTP', r.status, url); }
    catch (e) { console.error('err', e.message, url); }
    await sleep(1500 * (i + 1));
  }
  return null;
}
// rows: [epochSec, o, h, l, c]
async function chart(sym, range, interval) {
  for (const host of ['query1', 'query2']) {
    const j = await get(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}&includePrePost=false`);
    const r = j && j.chart && j.chart.result && j.chart.result[0];
    if (!r || !r.timestamp) continue;
    const q = r.indicators.quote[0], out = [];
    r.timestamp.forEach((t, i) => { const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
      if (c != null && h != null && l != null && o != null) out.push([t, o, h, l, c]); });
    if (out.length) return {rows: out, meta: r.meta || {}};
  }
  return null;
}
// petite file d'attente : 4 requêtes à la fois
async function pool(items, fn, n = 4) {
  const out = new Array(items.length); let k = 0;
  await Promise.all(Array.from({length: n}, async () => { while (k < items.length) { const i = k++; out[i] = await fn(items[i], i); await sleep(120); } }));
  return out;
}

// ---------- Market Watch ----------
const W = {
  fx: [['EURUSD=X','EUR/USD','EU'],['GBPUSD=X','GBP/USD','GB'],['JPY=X','USD/JPY','JP'],['CHF=X','USD/CHF','CH'],['CAD=X','USD/CAD','CA'],['AUDUSD=X','AUD/USD','AU'],['NZDUSD=X','NZD/USD','NZ'],
       ['EURGBP=X','EUR/GBP','EU'],['EURJPY=X','EUR/JPY','EU'],['EURCHF=X','EUR/CHF','EU'],['EURAUD=X','EUR/AUD','EU'],['EURCAD=X','EUR/CAD','EU'],['EURNZD=X','EUR/NZD','EU'],
       ['GBPJPY=X','GBP/JPY','GB'],['GBPCHF=X','GBP/CHF','GB'],['GBPAUD=X','GBP/AUD','GB'],['AUDJPY=X','AUD/JPY','AU'],['CADJPY=X','CAD/JPY','CA'],['CHFJPY=X','CHF/JPY','CH'],['NZDJPY=X','NZD/JPY','NZ'],
       ['MXN=X','USD/MXN','MX'],['CNY=X','USD/CNY','CN']],
  idx: [['^GSPC','S&P 500','US'],['^NDX','Nasdaq 100','US'],['^DJI','Dow Jones','US'],['^RUT','Russell 2000','US'],['^VIX','VIX','US'],['DX-Y.NYB','US Dollar Index','US'],['^GSPTSE','S&P/TSX','CA'],
        ['^GDAXI','DAX','DE'],['^FTSE','FTSE 100','GB'],['^FCHI','CAC 40','FR'],['^STOXX50E','Euro Stoxx 50','EU'],['^N225','Nikkei 225','JP'],['^HSI','Hang Seng','HK'],['000001.SS','Shanghai Comp.','CN'],
        ['^AXJO','ASX 200','AU'],['^KS11','KOSPI','KR'],['^BSESN','Sensex','IN'],['^BVSP','Bovespa','BR']],
  cmd: [['GC=F','Or','gold'],['SI=F','Argent','silver'],['PL=F','Platine','plat'],['PA=F','Palladium','pall'],['HG=F','Cuivre','copper'],['CL=F','Pétrole WTI','oil'],['BZ=F','Pétrole Brent','oil'],
        ['NG=F','Gaz naturel','gas'],['HO=F','Mazout','oil'],['RB=F','Essence (RBOB)','oil'],['ZC=F','Maïs','grain'],['ZW=F','Blé','grain'],['ZS=F','Soja','grain'],['KC=F','Café','soft'],['CC=F','Cacao','soft'],['SB=F','Sucre','soft']],
  stk: [['AAPL','Apple'],['MSFT','Microsoft'],['NVDA','Nvidia'],['GOOGL','Alphabet'],['AMZN','Amazon'],['META','Meta'],['TSLA','Tesla'],['AVGO','Broadcom'],['BRK-B','Berkshire Hathaway'],['JPM','JPMorgan'],
        ['V','Visa'],['MA','Mastercard'],['LLY','Eli Lilly'],['UNH','UnitedHealth'],['XOM','Exxon Mobil'],['WMT','Walmart'],['ORCL','Oracle'],['AMD','AMD'],['NFLX','Netflix'],['COST','Costco']],
  cry: [['BTC-USD','BTC/USD'],['ETH-USD','ETH/USD'],['SOL-USD','SOL/USD'],['XRP-USD','XRP/USD'],['BNB-USD','BNB/USD'],['ADA-USD','ADA/USD'],['DOGE-USD','DOGE/USD'],['DOT-USD','DOT/USD'],['LINK-USD','LINK/USD'],['AVAX-USD','AVAX/USD'],['LTC-USD','LTC/USD']]
};
// ---------- banques systémiques (Bank Research) ----------
const BANKS = [
  ['JPM','JPMorgan','US',40.75,-73.98],['BAC','Bank of America','US',35.23,-80.84],['C','Citi','US',40.72,-74.01],['WFC','Wells Fargo','US',37.79,-122.40],['GS','Goldman Sachs','US',40.71,-74.01],['MS','Morgan Stanley','US',40.76,-73.98],
  ['RY.TO','RBC','CA',43.65,-79.38],['TD.TO','TD','CA',43.65,-79.38],['HSBA.L','HSBC','GB',51.51,-0.02],['BARC.L','Barclays','GB',51.51,-0.01],['LLOY.L','Lloyds','GB',51.51,-0.09],['NWG.L','NatWest','GB',55.95,-3.19],
  ['DBK.DE','Deutsche Bank','DE',50.11,8.67],['UBSG.SW','UBS','CH',47.37,8.54],['SAN.MC','Santander','ES',40.45,-3.69],['BBVA.MC','BBVA','ES',40.47,-3.69],['INGA.AS','ING','NL',52.34,4.89],
  ['BNP.PA','BNP Paribas','FR',48.87,2.33],['8306.T','MUFG','JP',35.68,139.76],['8316.T','SMBC Group','JP',35.68,139.76],['8411.T','Mizuho','JP',35.68,139.77],['8604.T','Nomura','JP',35.68,139.77]
];

function quoteOf(res) {
  if (!res) return null; const c = res.rows.map(r => r[4]), N = c.length; if (N < 2) return null;
  const last = c[N - 1], pc = (n) => N > n ? r2((last / c[N - 1 - n] - 1) * 100, 2) : null;
  return {last: r2(last, dp(last)), d1: pc(1), w1: pc(5), m1: pc(21), spark: c.slice(-30).map(x => r2(x, dp(x))), ccy: res.meta.currency || null};
}

// ---------- outils séries ----------
function align(series) { // {k: rows} -> {t:[], v:{k:[]}} avec report de la dernière valeur
  const ts = [...new Set(Object.values(series).filter(Boolean).flatMap(r => r.map(x => x[0])))].sort((a, b) => a - b);
  const v = {}; for (const [k, rows] of Object.entries(series)) { if (!rows) continue; const m = new Map(rows.map(x => [x[0], x[4]])); let last = null; v[k] = ts.map(t => { if (m.has(t)) last = m.get(t); return last; }); }
  // enlever le début tant qu'une série est vide
  let s = 0; while (s < ts.length && Object.values(v).some(a => a[s] == null)) s++;
  const out = {t: ts.slice(s)}; for (const k in v) out[k] = v[k].slice(s); return out;
}
function dailyKey(rows) { // regroupe par jour (UTC) -> [[YYYY-MM-DD, c]]
  const m = new Map(); rows.forEach(r => m.set(new Date(r[0] * 1000).toISOString().slice(0, 10), r[4])); return m;
}
function agg(rows, n) { // n barres -> 1 (pour 4H)
  const out = []; for (let i = 0; i < rows.length; i += n) { const g = rows.slice(i, i + n); if (!g.length) continue;
    out.push([g[0][0], g[0][1], Math.max(...g.map(x => x[2])), Math.min(...g.map(x => x[3])), g[g.length - 1][4]]); }
  return out;
}
const pctRank = (arr, x) => arr.length ? arr.filter(y => y <= x).length / arr.length * 100 : null;
const sma = (a, n, i) => i + 1 < n ? null : a.slice(i - n + 1, i + 1).reduce((s, x) => s + x, 0) / n;

(async () => {
  const M = {asOf: new Date().toISOString(), src: 'Yahoo Finance'};
  // Market Watch
  M.watch = {};
  for (const [g, list] of Object.entries(W)) {
    const res = await pool(list, x => chart(x[0], '3mo', '1d'));
    M.watch[g] = list.map((x, i) => { const q = quoteOf(res[i]); return q ? Object.assign({s: x[0], n: x[1], cc: x[2] || null}, q) : null; }).filter(Boolean);
    console.error('watch', g, M.watch[g].length, '/', list.length);
  }
  // banques
  const bres = await pool(BANKS, b => chart(b[0], '1mo', '1d'));
  M.banks = BANKS.map((b, i) => { const q = quoteOf(bres[i]); return Object.assign({s: b[0], n: b[1], cc: b[2], lat: b[3], lon: b[4]}, q ? {last: q.last, d1: q.d1, m1: q.m1, ccy: q.ccy} : {}); });

  // Force des devises (indices non pondérés) + autres préréglages
  const FX = {EUR: ['EURUSD=X', 1], GBP: ['GBPUSD=X', 1], AUD: ['AUDUSD=X', 1], NZD: ['NZDUSD=X', 1], JPY: ['JPY=X', -1], CHF: ['CHF=X', -1], CAD: ['CAD=X', -1]};
  const strengthFrom = (raw) => { // raw: {CCY: rows} -> indices
    const a = align(raw), N = a.t.length, cur = Object.keys(FX).concat(['USD']), out = {t: a.t};
    const usdVal = (c, i) => c === 'USD' ? 1 : FX[c][1] > 0 ? a[c][i] : 1 / a[c][i];
    cur.forEach(c => out[c] = []);
    for (let i = 0; i < N; i++) { const vals = cur.map(c => usdVal(c, i)); const gm = Math.exp(vals.reduce((s, x) => s + Math.log(x), 0) / vals.length);
      cur.forEach((c, j) => out[c].push(r2(vals[j] / gm * 100, 4))); }
    return out;
  };
  const fxH = {}, fxD = {};
  const fxRes = await pool(Object.entries(FX), async ([c, [s]]) => [c, await chart(s, '3mo', '60m'), await chart(s, '1y', '1d')]);
  fxRes.forEach(([c, h, d]) => { fxH[c] = h && h.rows; fxD[c] = d && d.rows; });
  M.strength = {};
  if (Object.values(fxH).every(Boolean)) {
    const h1 = strengthFrom(fxH); const keep = Math.min(h1.t.length, 24 * 22); // ~1 mois d'heures
    const cut = o => { const r = {}; for (const k in o) r[k] = o[k].slice(-keep); return r; };
    M.strength.fx_h1 = cut(h1);
    const h4src = {}; for (const c in fxH) h4src[c] = agg(fxH[c], 4); M.strength.fx_h4 = strengthFrom(h4src);
  }
  if (Object.values(fxD).every(Boolean)) M.strength.fx_d1 = strengthFrom(fxD);
  const presets = {
    cmd: {Or: 'GC=F', Argent: 'SI=F', Cuivre: 'HG=F', WTI: 'CL=F', Brent: 'BZ=F', 'Gaz nat.': 'NG=F'},
    idx: {'S&P 500': '^GSPC', 'Nasdaq 100': '^NDX', 'Dow Jones': '^DJI', 'Russell 2000': '^RUT'},
    yld: {'US 3 mois': '^IRX', 'US 5 ans': '^FVX', 'US 10 ans': '^TNX', 'US 30 ans': '^TYX'}
  };
  for (const [p, map] of Object.entries(presets)) {
    const ent = Object.entries(map);
    const rs = await pool(ent, async ([n, s]) => [n, await chart(s, '1mo', '60m'), await chart(s, '1y', '1d')]);
    const H = {}, D = {}; rs.forEach(([n, h, d]) => { if (h) H[n] = h.rows; if (d) D[n] = d.rows; });
    const round = o => { const r = {t: o.t}; for (const k in o) if (k !== 't') r[k] = o[k].map(x => r2(x, dp(x))); return r; };
    if (Object.keys(H).length) M.strength[p + '_h1'] = round(align(H));
    if (Object.keys(D).length) M.strength[p + '_d1'] = round(align(D));
  }

  // ---------- Sentiment de risque (0 à 100) ----------
  const RS = {vix: '^VIX', spx: '^GSPC', hyg: 'HYG', lqd: 'LQD', aj: 'AUDJPY=X', hg: 'HG=F', gc: 'GC=F', spy: 'SPY', tlt: 'TLT', btc: 'BTC-USD'};
  const rr = await pool(Object.entries(RS), async ([k, s]) => [k, await chart(s, '5y', '1d')]);
  const D = {}; rr.forEach(([k, r]) => { if (r) D[k] = dailyKey(r.rows); });
  if (Object.keys(D).length === Object.keys(RS).length) {
    const days = [...D.spx.keys()].sort();
    const ff = {}; for (const k in D) { let last = null; ff[k] = days.map(d => { if (D[k].has(d)) last = D[k].get(d); return last; }); }
    const N = days.length, chg = (a, i, n) => a[i] != null && a[i - n] != null ? (a[i] / a[i - n] - 1) * 100 : null;
    const raw = {
      vix: i => ff.vix[i],
      eq: i => { const s = sma(ff.spx, 50, i); return s ? (ff.spx[i] / s - 1) * 100 : null; },
      credit: i => i >= 20 ? ((ff.hyg[i] / ff.lqd[i]) / (ff.hyg[i - 20] / ff.lqd[i - 20]) - 1) * 100 : null,
      aj: i => chg(ff.aj, i, 20),
      cuau: i => i >= 20 ? ((ff.hg[i] / ff.gc[i]) / (ff.hg[i - 20] / ff.gc[i - 20]) - 1) * 100 : null,
      svh: i => { const a = chg(ff.spy, i, 20), b = chg(ff.tlt, i, 20); return a == null || b == null ? null : a - b; },
      btc: i => chg(ff.btc, i, 20)
    };
    const series = {}; for (const k in raw) series[k] = days.map((_, i) => { try { const v = raw[k](i); return v == null || !isFinite(v) ? null : v; } catch (e) { return null; } });
    const pctAt = (k, i) => { const v = series[k][i]; if (v == null) return null; const w = series[k].slice(Math.max(0, i - 251), i + 1).filter(x => x != null); if (w.length < 120) return null;
      const p = pctRank(w, v); return k === 'vix' ? 100 - p : p; };
    const compAt = i => { const ps = Object.keys(raw).map(k => pctAt(k, i)).filter(x => x != null); return ps.length >= 5 ? ps.reduce((s, x) => s + x, 0) / ps.length : null; };
    const hist = []; for (let i = Math.max(0, N - 260); i < N; i++) { const c = compAt(i); if (c != null) hist.push([days[i], r2(c, 1)]); }
    const i = N - 1;
    M.risk = {
      date: days[i], score: r2(compAt(i), 1), w1: r2(compAt(i - 5), 1), m1: r2(compAt(i - 21), 1),
      comps: Object.keys(raw).map(k => ({k, raw: r2(series[k][i], 2), pct: r2(pctAt(k, i), 0)})),
      hist,
      spx: days.slice(-252).map((d, j) => [d, r2(ff.spx[N - 252 + j], 2)]),
      vix: days.slice(-252).map((d, j) => [d, r2(ff.vix[N - 252 + j], 2)])
    };
    console.error('risk', M.risk.score);
  }

  // ---------- Chandeliers des 12 actifs (Indicators, Liquidity) ----------
  const A = {xauusd: 'GC=F', xagusd: 'SI=F', nasdaq: '^NDX', spx500: '^GSPC', us30: '^DJI', rut: '^RUT', usd: 'DX-Y.NYB', usoil: 'CL=F', btcusd: 'BTC-USD', eurusd: 'EURUSD=X', usdjpy: 'JPY=X', usdcad: 'CAD=X', gbpusd: 'GBPUSD=X', audusd: 'AUDUSD=X', usdchf: 'CHF=X', nzdusd: 'NZDUSD=X'};
  const O = {asOf: M.asOf, d1: {}, h1: {}};
  const ores = await pool(Object.entries(A), async ([k, s]) => [k, await chart(s, '2y', '1d'), await chart(s, '1mo', '60m')]);
  ores.forEach(([k, d, h]) => {
    const f = rows => rows.map(r => [r[0], ...r.slice(1).map(x => r2(x, dp(r[4])))]);
    if (d) O.d1[k] = f(d.rows.slice(-400)); if (h) O.h1[k] = f(h.rows);
  });
  console.error('ohlc', Object.keys(O.d1).length, Object.keys(O.h1).length);

  // ---------- Tendance automatique de la JOURNÉE (case « Tendance » du scorecard, ±2) ----------
  // Haussière si le prix est au-dessus de l'ouverture du jour ET de la clôture d'hier; baissière s'il est en dessous des deux; sinon neutre.
  const dayTrend = rows => {
    if (!rows || rows.length < 2) return null;
    const t = rows[rows.length - 1], px = t[4], o = t[1], pc = rows[rows.length - 2][4];
    const tr = px > o && px > pc ? 'bull' : px < o && px < pc ? 'bear' : 'neutral';
    return {t: tr, px: r2(px, dp(px)), o: r2(o, dp(px)), pc: r2(pc, dp(px)), chg: r2((px / pc - 1) * 100, 2), vsO: r2((px / o - 1) * 100, 2)};
  };
  M.trend = {};
  ores.forEach(([k, d]) => { const D = dayTrend(d && d.rows); if (D) M.trend[k] = D; });
  // Taux 10 ans du JOUR : en hausse si au moins +0,01 point depuis la clôture d'hier, en baisse si au moins −0,01, sinon stable.
  const tnx = await chart('^TNX', '5d', '1d');
  if (tnx && tnx.rows.length >= 2) { const r = tnx.rows, px = r[r.length - 1][4], pc = r[r.length - 2][4], ch = Math.round((px - pc) * 1000) / 1000;
    M.y10 = {px: r2(px, 3), pc: r2(pc, 3), chg: ch, dir: ch >= 0.01 ? 'rising' : ch <= -0.01 ? 'falling' : 'flat'}; }
  console.error('tendances', Object.entries(M.trend).map(([k, v]) => k + ':' + v.t).join(' '), '10 ans', M.y10 && M.y10.dir);

  fs.writeFileSync(OUT_M, JSON.stringify(M));
  fs.writeFileSync(OUT_O, JSON.stringify(O));
  const ok = Object.values(M.watch).flat().length > 40;
  if (!ok) { console.error('Trop peu de données, on ne publie pas'); process.exit(2); }
})();
