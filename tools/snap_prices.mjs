// node tools/snap_prices.mjs prices_out.json
// Télécharge les prix quotidiens (Yahoo Finance, repli Stooq) des 12 actifs, calcule les indicateurs
// techniques et la saisonnalité sur 20 ans. Fait pour GitHub Actions.
import fs from 'node:fs';
const OUT = process.argv[2] || 'prices_out.json';
const A = {
  xauusd: {y: 'GC=F', s: 'xauusd', n: 'Or'},
  xagusd: {y: 'SI=F', s: 'xagusd', n: 'Argent'},
  nasdaq: {y: '^NDX', s: '^ndx', n: 'Nasdaq 100'},
  spx500: {y: '^GSPC', s: '^spx', n: 'S&P 500'},
  us30:   {y: '^DJI', s: '^dji', n: 'Dow Jones'},
  rut:    {y: '^RUT', s: '^rut', n: 'Russell 2000'},
  usd:    {y: 'DX-Y.NYB', s: 'dx.f', n: 'Dollar (DXY)'},
  usoil:  {y: 'CL=F', s: 'cl.f', n: 'Pétrole WTI'},
  btcusd: {y: 'BTC-USD', s: 'btcusd', n: 'Bitcoin'},
  eurusd: {y: 'EURUSD=X', s: 'eurusd', n: 'EUR/USD'},
  usdjpy: {y: 'JPY=X', s: 'usdjpy', n: 'USD/JPY'},
  usdcad: {y: 'CAD=X', s: 'usdcad', n: 'USD/CAD'},
};
const UA = {'User-Agent': 'Mozilla/5.0 (scorecard-macro; GitHub Actions)', 'Accept': '*/*'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, json = true) {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(url, {headers: UA}); if (r.ok) return json ? r.json() : r.text(); console.error('HTTP', r.status, url); }
    catch (e) { console.error('err', e.message, url); }
    await sleep(2500 * (i + 1));
  }
  return null;
}
async function yahoo(sym) {
  for (const host of ['query1', 'query2']) {
    const j = await get(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=20y&interval=1d&includePrePost=false`);
    const r = j && j.chart && j.chart.result && j.chart.result[0];
    if (!r || !r.timestamp) continue;
    const q = r.indicators.quote[0], out = [];
    r.timestamp.forEach((t, i) => { const c = q.close[i], h = q.high[i], l = q.low[i];
      if (c != null && h != null && l != null) out.push([new Date(t * 1000).toISOString().slice(0, 10), +h, +l, +c]); });
    if (out.length > 300) return out;
  }
  return null;
}
async function stooq(sym) {
  const t = await get(`https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`, false);
  if (!t || !t.startsWith('Date')) return null;
  return t.trim().split('\n').slice(1).map(l => l.split(',')).filter(r => r.length >= 5 && r[4] !== '').map(r => [r[0], +r[2], +r[3], +r[4]]);
}
const sma = (a, n, i = a.length - 1) => i + 1 < n ? null : a.slice(i - n + 1, i + 1).reduce((s, x) => s + x, 0) / n;
function ema(a, n) { const k = 2 / (n + 1); const o = []; a.forEach((x, i) => o.push(i ? x * k + o[i - 1] * (1 - k) : x)); return o; }
function rsi(c, n = 14) { let g = 0, l = 0; for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; d > 0 ? g += d : l -= d; }
  g /= n; l /= n; for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l); }
const r2 = (x, d = 2) => x == null || !isFinite(x) ? null : +x.toFixed(d);
function volAnn(c, n, end = c.length) { const r = []; for (let i = end - n; i < end; i++) r.push(Math.log(c[i] / c[i - 1]));
  const m = r.reduce((s, x) => s + x, 0) / r.length; return Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252) * 100; }

function technical(rows) {
  const c = rows.map(r => r[3]), h = rows.map(r => r[1]), l = rows.map(r => r[2]), N = c.length, px = c[N - 1];
  const s20 = sma(c, 20), s50 = sma(c, 50), s200 = sma(c, 200), s50p = sma(c, 50, N - 11);
  // tendance : prix vs MM50/MM200, pente de la MM50
  let tr = 0; if (s50) tr += px > s50 ? 1 : -1; if (s200) tr += px > s200 ? 1 : -1; if (s50 && s50p) tr += s50 > s50p ? 1 : -1;
  const trend = tr >= 2 ? 'bull' : tr <= -2 ? 'bear' : 'neutral';
  const R = rsi(c), mom = R >= 70 ? 'overbought' : R <= 30 ? 'oversold' : R >= 55 ? 'bull' : R <= 45 ? 'bear' : 'neutral';
  const e12 = ema(c, 12), e26 = ema(c, 26), m = e12.map((x, i) => x - e26[i]), sig = ema(m, 9), hist = m[N - 1] - sig[N - 1], histP = m[N - 2] - sig[N - 2];
  const macd = hist > 0 ? (hist > histP ? 'bull+' : 'bull') : (hist < histP ? 'bear+' : 'bear');
  // volatilité : 20 jours annualisée vs ses valeurs de la dernière année
  const v = volAnn(c, 20), hv = []; for (let e = N - 252; e <= N; e += 5) if (e > 21) hv.push(volAnn(c, 20, e));
  const pct = hv.filter(x => x <= v).length / hv.length * 100, vol = pct >= 80 ? 'high' : pct <= 20 ? 'low' : 'normal';
  // structure : sommets et creux des 2 dernières fenêtres de 20 jours
  const hiA = Math.max(...h.slice(N - 20)), hiB = Math.max(...h.slice(N - 40, N - 20)), loA = Math.min(...l.slice(N - 20)), loB = Math.min(...l.slice(N - 40, N - 20));
  const struct = hiA > hiB && loA > loB ? 'bull' : hiA < hiB && loA < loB ? 'bear' : 'range';
  // liquidité : le plus proche entre le sommet et le creux des 20 derniers jours
  const dU = (hiA / px - 1) * 100, dD = (loA / px - 1) * 100, liq = Math.abs(dU) < Math.abs(dD) ? {side: 'above', lvl: hiA, d: dU} : {side: 'below', lvl: loA, d: dD};
  // tendance hebdomadaire : prix vs MM de 20 semaines (100 jours)
  const s100 = sma(c, 100), wk = s100 ? (px > s100 ? 'bull' : 'bear') : 'neutral';
  let score = 0; score += trend === 'bull' ? 2 : trend === 'bear' ? -2 : 0; score += wk === 'bull' ? 1 : wk === 'bear' ? -1 : 0;
  score += macd.startsWith('bull') ? 1 : -1; score += struct === 'bull' ? 1 : struct === 'bear' ? -1 : 0;
  if (mom === 'overbought') score -= 1; if (mom === 'oversold') score += 1;
  score = Math.max(-5, Math.min(5, score));
  const chg = n => r2((px / c[N - 1 - n] - 1) * 100, 2);
  return {date: rows[N - 1][0], px: r2(px, px < 10 ? 5 : 2), chg1d: chg(1), chg5d: chg(5), chg1m: chg(21), chgYtd: (() => { const y = rows[N - 1][0].slice(0, 4); const i = rows.findIndex(r => r[0].slice(0, 4) === y); return i > 0 ? r2((px / c[i - 1] - 1) * 100, 2) : null; })(),
    sma20: r2(s20, 5), sma50: r2(s50, 5), sma200: r2(s200, 5), d50: r2((px / s50 - 1) * 100), d200: r2((px / s200 - 1) * 100),
    trend, trendScore: tr, weekly: wk, rsi: r2(R, 1), mom, macd, macdHist: r2(hist, 6), vol, volAnn: r2(v, 1), volPct: Math.round(pct),
    struct, hi20: r2(hiA, 5), lo20: r2(loA, 5), liq: {side: liq.side, lvl: r2(liq.lvl, 5), d: r2(liq.d)}, score,
    spark: c.slice(-90).map(x => r2(x, 5))};
}
function seasonal(rows) {
  // rendements mensuels sur les 20 dernières années complètes, par jour de semaine, et courbe moyenne de l'année
  const last = rows[rows.length - 1][0].slice(0, 4), y0 = +last - 20;
  const byM = {}; rows.forEach(r => { byM[r[0].slice(0, 7)] = r[3]; });
  const months = Object.keys(byM).sort(), mret = Array.from({length: 12}, () => []), yret = {};
  for (let i = 1; i < months.length; i++) { const y = +months[i].slice(0, 4); if (y <= y0) continue;
    const r = (byM[months[i]] / byM[months[i - 1]] - 1) * 100; mret[+months[i].slice(5) - 1].push(r); }
  const yEnd = {}; rows.forEach(r => { yEnd[r[0].slice(0, 4)] = r[3]; });
  for (let y = y0 + 1; y < +last; y++) if (yEnd[y] && yEnd[y - 1]) yret[y] = (yEnd[y] / yEnd[y - 1] - 1) * 100;
  const wd = Array.from({length: 5}, () => []);
  for (let i = 1; i < rows.length; i++) { if (+rows[i][0].slice(0, 4) <= y0) continue; const d = new Date(rows[i][0] + 'T12:00:00Z').getUTCDay(); if (d >= 1 && d <= 5) wd[d - 1].push((rows[i][3] / rows[i - 1][3] - 1) * 100); }
  // courbe : rendement cumulé moyen depuis le 1er janvier, par semaine de l'année (52 points)
  const curve = Array.from({length: 53}, () => []);
  for (let y = y0 + 1; y < +last; y++) { const yr = rows.filter(r => +r[0].slice(0, 4) === y); if (yr.length < 200 || !yEnd[y - 1]) continue;
    const base = yEnd[y - 1]; const wk = {}; yr.forEach(r => { const d = new Date(r[0] + 'T12:00:00Z'); const w = Math.min(52, Math.floor((d - new Date(Date.UTC(y, 0, 1))) / 6048e5)); wk[w] = r[3]; });
    for (let w = 0; w <= 52; w++) if (wk[w] != null) curve[w].push((wk[w] / base - 1) * 100); }
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const yv = Object.values(yret);
  return {years: yv.length, from: y0 + 1, to: +last - 1, month: mret.map(a => r2(avg(a), 2)), monthWin: mret.map(a => a.length ? Math.round(a.filter(x => x > 0).length / a.length * 100) : null),
    weekday: wd.map(a => r2(avg(a), 3)), curve: curve.map(a => r2(avg(a), 2)), yearPos: yv.filter(x => x > 0).length, yearAvg: r2(avg(yv), 1),
    best: r2(Math.max(...yv), 1), worst: r2(Math.min(...yv), 1)};
}
const out = {asOf: new Date().toISOString(), src: 'Yahoo Finance (repli : Stooq) · clôtures quotidiennes', assets: {}, seas: {}};
for (const [k, a] of Object.entries(A)) {
  let rows = await yahoo(a.y), src = 'yahoo';
  if (!rows) { rows = await stooq(a.s); src = 'stooq'; }
  if (!rows || rows.length < 260) { console.error('ÉCHEC', k); continue; }
  rows = rows.filter((r, i) => i === 0 || r[0] !== rows[i - 1][0]);
  try { out.assets[k] = {...technical(rows), src}; out.seas[k] = seasonal(rows); console.log(k, src, rows.length, out.assets[k].date, out.assets[k].px, 'score', out.assets[k].score); }
  catch (e) { console.error('calcul', k, e.message); }
  await sleep(800);
}
if (Object.keys(out.assets).length < 9) { console.error('Trop d’actifs manquants'); process.exit(1); }
fs.writeFileSync(OUT, JSON.stringify(out));
