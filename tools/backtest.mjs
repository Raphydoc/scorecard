// node tools/backtest.mjs backtest.json
// Test du score sur le passé : on recalcule chaque jour, sur environ 10 ans, la partie du score qu'on peut reconstituer
// sans regarder l'avenir (technique 30 points + fonds COT), puis on regarde si le biais avait raison 1 jour et 5 jours plus tard.
// Les données économiques (macro) et la foule (IG) ne peuvent pas être testées : les prévisions des analystes et le
// positionnement IG d'il y a 10 ans ne sont pas disponibles gratuitement.
import fs from 'node:fs';
const [OUT = 'backtest.json'] = process.argv.slice(2);
const UA = {'User-Agent': 'Mozilla/5.0 (scorecard-macro; GitHub Actions)', 'Accept': '*/*'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, {headers: UA}); if (r.ok) return r.json(); console.error('HTTP', r.status, url); }
    catch (e) { console.error('err', e.message, url); }
    await sleep(1500 * (i + 1));
  }
  return null;
}
const SYM = {xauusd:'GC=F', xagusd:'SI=F', nasdaq:'^NDX', spx500:'^GSPC', us30:'^DJI', rut:'^RUT', usd:'DX-Y.NYB', usoil:'CL=F', btcusd:'BTC-USD', eurusd:'EURUSD=X', usdjpy:'JPY=X', usdcad:'CAD=X', gbpusd:'GBPUSD=X', audusd:'AUDUSD=X', usdchf:'CHF=X', nzdusd:'NZDUSD=X'};
// COT : contrats « legacy » (non-commerciaux); pour USD/JPY, USD/CAD, USD/CHF le contrat est sur la devise étrangère, donc on inverse
const COT = {eurusd:'099741', xauusd:'088691', xagusd:'084691', nasdaq:'209742', spx500:'13874A', us30:'124603', rut:'239742', usd:'098662', btcusd:'133741', gbpusd:'096742', audusd:'232741', nzdusd:'112741', usdjpy:'097741', usdcad:'090741', usdchf:'092741'};
const INV = new Set(['usdjpy', 'usdcad', 'usdchf']);
const FROM = '2015-06-01';

const day = (k, t) => new Date((t + (/=X$/.test(SYM[k]) ? -43200 : 43200)) * 1000).toISOString().slice(0, 10);
const monday = d => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const sgn = x => x > 0 ? 1 : x < 0 ? -1 : 0;

async function prices(k) {
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(SYM[k])}?range=10y&interval=1d`);
  const r = j && j.chart && j.chart.result && j.chart.result[0]; if (!r || !r.timestamp) return null;
  const q = r.indicators.quote[0], out = [];
  r.timestamp.forEach((t, i) => { if (q.close[i] != null && q.open[i] != null) out.push({d: day(k, t), o: q.open[i], c: q.close[i]}); });
  // une barre par date (la dernière gagne)
  const m = new Map(); out.forEach(b => m.set(b.d, b)); return [...m.values()].sort((a, b) => a.d.localeCompare(b.d));
}
async function cot(k) {
  if (k === 'usoil') {
    const r = await get(`https://publicreporting.cftc.gov/resource/72hh-3qpy.json?cftc_contract_market_code=067651&$where=report_date_as_yyyy_mm_dd>'${FROM}'&$order=report_date_as_yyyy_mm_dd&$limit=1000&$select=report_date_as_yyyy_mm_dd,m_money_positions_long_all,m_money_positions_short_all`);
    return (r || []).map(x => ({d: x.report_date_as_yyyy_mm_dd.slice(0, 10), l: +x.m_money_positions_long_all, s: +x.m_money_positions_short_all}));
  }
  if (!COT[k]) return [];
  const r = await get(`https://publicreporting.cftc.gov/resource/6dca-aqww.json?cftc_contract_market_code=${COT[k]}&$where=report_date_as_yyyy_mm_dd>'${FROM}'&$order=report_date_as_yyyy_mm_dd&$limit=1000&$select=report_date_as_yyyy_mm_dd,noncomm_positions_long_all,noncomm_positions_short_all`);
  return (r || []).map(x => { const l = +x.noncomm_positions_long_all, s = +x.noncomm_positions_short_all; return {d: x.report_date_as_yyyy_mm_dd.slice(0, 10), l: INV.has(k) ? s : l, s: INV.has(k) ? l : s}; });
}

// mêmes règles que le site (voir « Comment le score se calcule »)
function signals(k, B, C) {
  const out = [], close = B.map(b => b.c);
  const sma = (n, i) => i + 1 < n ? null : close.slice(i - n + 1, i + 1).reduce((a, v) => a + v, 0) / n;
  // rendements mensuels (clôture de fin de mois), pour la saisonnalité
  const mret = {}; let prevEnd = null;
  for (let i = 0; i < B.length; i++) { const ym = B[i].d.slice(0, 7), last = i === B.length - 1 || B[i + 1].d.slice(0, 7) !== ym;
    if (last) { if (prevEnd != null) mret[ym] = (B[i].c / prevEnd - 1) * 100; prevEnd = B[i].c; } }
  // COT : un rapport (daté du mardi) est publié le vendredi; on ne s'en sert qu'à partir de ce vendredi
  const cr = C.map(x => ({pub: new Date(Date.parse(x.d + 'T12:00:00Z') + 3 * 864e5).toISOString().slice(0, 10), L: x.l + x.s ? x.l / (x.l + x.s) * 100 : null})).filter(x => x.L != null);
  let ci = -1;
  for (let i = 210; i < B.length; i++) {
    const b = B[i], mon = monday(b.d);
    // tendance de la semaine (±2) : au-dessus de l'ouverture de la semaine ET de la clôture de la semaine passée
    let w0 = i; while (w0 > 0 && B[w0 - 1].d >= mon) w0--;
    const wo = B[w0].o, pc = w0 > 0 ? B[w0 - 1].c : null;
    const trend = pc == null ? 0 : b.c > wo && b.c > pc ? 2 : b.c < wo && b.c < pc ? -2 : 0;
    // tendance de fond (±1) : 2 des 3 (prix > MM50, prix > MM200, MM50 qui monte sur 10 séances)
    const s50 = sma(50, i), s200 = sma(200, i), s50p = sma(50, i - 10); let c = 0;
    if (s50) c += b.c > s50 ? 1 : -1; if (s200) c += b.c > s200 ? 1 : -1; if (s50 && s50p) c += s50 > s50p ? 1 : -1;
    const dtrend = c >= 2 ? 1 : c <= -2 ? -1 : 0;
    // saisonnalité (±1) : ce mois-ci dans les années d'avant seulement (jusqu'à 20 ans, au moins 5)
    const y = +b.d.slice(0, 4), m = b.d.slice(5, 7), past = []; for (let yy = y - 1; yy >= y - 20; yy--) { const v = mret[yy + '-' + m]; if (v != null) past.push(v); }
    let season = 0; if (past.length >= 5) { const avg = past.reduce((a, v) => a + v, 0) / past.length, win = past.filter(v => v > 0).length / past.length * 100;
      season = avg >= 0.5 && win >= 55 ? 1 : avg <= -0.5 && win <= 45 ? -1 : 0; }
    // fonds (COT) : net acheteur (±1) + changement de la semaine (±1)
    while (ci + 1 < cr.length && cr[ci + 1].pub <= b.d) ci++;
    const cotNet = ci >= 0 ? sgn(cr[ci].L - 50) : 0, cotChg = ci >= 1 ? sgn(cr[ci].L - cr[ci - 1].L) : 0;
    const tech = trend + dtrend + season, sent = cotNet + cotChg;
    const pT = Math.round(tech / 4 * 30), pS = Math.round(sent / 3 * 20), total = pT + pS;
    const f1 = i + 1 < B.length ? (B[i + 1].c / b.c - 1) * 100 : null, f5 = i + 5 < B.length ? (B[i + 5].c / b.c - 1) * 100 : null;
    out.push({d: b.d, total, pT, pS, f1, f5});
  }
  return out;
}
function stats(rows, field, th) {
  const r = rows.filter(x => x.f1 != null && x.f5 != null && x.d >= '2016-06-01');
  const grp = side => { const g = r.filter(x => side > 0 ? x[field] >= th : x[field] <= -th); if (!g.length) return {n: 0};
    const h1 = g.filter(x => sgn(x.f1) === side).length / g.length * 100, h5 = g.filter(x => sgn(x.f5) === side).length / g.length * 100;
    const r1 = g.reduce((a, x) => a + side * x.f1, 0) / g.length, r5 = g.reduce((a, x) => a + side * x.f5, 0) / g.length;
    return {n: g.length, h1: +h1.toFixed(1), h5: +h5.toFixed(1), r1: +r1.toFixed(3), r5: +r5.toFixed(3)}; };
  // référence « au hasard » : % des jours où l'actif monte (pour un biais haussier) ou baisse (baissier), sur la même période
  const up1 = r.filter(x => x.f1 > 0).length / r.length * 100, up5 = r.filter(x => x.f5 > 0).length / r.length * 100;
  const dn1 = r.filter(x => x.f1 < 0).length / r.length * 100, dn5 = r.filter(x => x.f5 < 0).length / r.length * 100;
  const bull = grp(1), bear = grp(-1), all = r.filter(x => Math.abs(x[field]) >= th);
  const hAll5 = all.length ? all.filter(x => sgn(x.f5) === sgn(x[field])).length / all.length * 100 : null;
  const base5 = bull.n + bear.n ? ((bull.n * up5) + (bear.n * dn5)) / (bull.n + bear.n) : null;
  const hAll1 = all.length ? all.filter(x => sgn(x.f1) === sgn(x[field])).length / all.length * 100 : null;
  const base1 = bull.n + bear.n ? ((bull.n * up1) + (bear.n * dn1)) / (bull.n + bear.n) : null;
  return {days: r.length, from: r.length ? r[0].d : null, to: r.length ? r[r.length - 1].d : null, bull, bear,
    h1: hAll1 == null ? null : +hAll1.toFixed(1), h5: hAll5 == null ? null : +hAll5.toFixed(1), b1: base1 == null ? null : +base1.toFixed(1), b5: base5 == null ? null : +base5.toFixed(1),
    up1: +up1.toFixed(1), up5: +up5.toFixed(1)};
}

const res = {asOf: new Date().toISOString(), th: 15, note: 'technique (30 pts) + fonds COT (13 pts); macro et foule non testables', assets: {}};
const pooled = {total: [], pT: [], pS: []};
for (const k of Object.keys(SYM)) {
  const [B, C] = await Promise.all([prices(k), cot(k)]);
  if (!B || B.length < 400) { console.error('pas de prix', k); continue; }
  const S = signals(k, B, C || []);
  res.assets[k] = {all: stats(S, 'total', 15), tech: stats(S, 'pT', 15), cot: C && C.length ? stats(S, 'pS', 13) : null, strong: stats(S, 'total', 30), cotWeeks: (C || []).length};
  S.forEach(x => { pooled.total.push(x); });
  console.error(k, B.length, 'jours', (C || []).length, 'semaines COT', JSON.stringify(res.assets[k].all).slice(0, 160));
  await sleep(400);
}
res.pooled = {all: stats(pooled.total, 'total', 15), tech: stats(pooled.total, 'pT', 15), cot: stats(pooled.total.filter(x => x.pS !== 0 || true), 'pS', 13), strong: stats(pooled.total, 'total', 30)};
fs.writeFileSync(OUT, JSON.stringify(res));
console.error('écrit', OUT, Object.keys(res.assets).length, 'actifs');
