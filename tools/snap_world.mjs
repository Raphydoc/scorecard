// node tools/snap_world.mjs world_out.json
// Données par pays pour la page « Carte du monde » : FMI (Perspectives de l'économie mondiale),
// BIS (taux directeurs des banques centrales), Yahoo Finance (monnaie et bourse). Fait pour GitHub Actions.
import fs from 'node:fs';
const OUT = process.argv[2] || 'world_out.json';
const UA = {'User-Agent': 'Mozilla/5.0 (scorecard-macro; GitHub Actions)', 'Accept': '*/*'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, json = true, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, {headers: UA}); if (r.ok) return json ? r.json() : r.text(); console.error('HTTP', r.status, url); }
    catch (e) { console.error('err', e.message, url); }
    await sleep(2000 * (i + 1));
  }
  return null;
}
const out = {asOf: new Date().toISOString(), imf: {}, rates: {}, mkts: {}, src: {}};
const Y = new Date().getUTCFullYear();

// 1) FMI : valeurs de l'année en cours et de l'année précédente (estimations et prévisions du WEO)
const IMF = {gdp: 'NGDP_RPCH', infl: 'PCPIPCH', unemp: 'LUR', debt: 'GGXWDG_NGDP', ca: 'BCA_NGDPD', size: 'NGDPD'};
for (const [k, code] of Object.entries(IMF)) {
  const j = await get(`https://www.imf.org/external/datamapper/api/v1/${code}?periods=${Y - 1},${Y}`);
  const v = j && j.values && j.values[code];
  if (!v) { console.error('FMI manquant', code); continue; }
  out.imf[k] = {};
  for (const [iso, yrs] of Object.entries(v)) {
    if (!/^[A-Z]{3}$/.test(iso)) continue;
    const a = yrs[String(Y - 1)], b = yrs[String(Y)];
    if (a == null && b == null) continue;
    out.imf[k][iso] = [a == null ? null : +(+a).toFixed(2), b == null ? null : +(+b).toFixed(2)];
  }
  console.log('FMI', k, Object.keys(out.imf[k]).length);
  await sleep(500);
}
out.src.imf = `FMI · Perspectives de l’économie mondiale (${Y - 1} et ${Y})`;

// 2) BIS : taux directeurs (série mensuelle, dernière valeur et changement)
async function bisCsv() {
  const urls = [
    `https://stats.bis.org/api/v1/data/WS_CBPOL/M./all?startPeriod=${Y - 2}-01&detail=dataonly&format=csv`,
    `https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.?startPeriod=${Y - 2}-01&detail=dataonly&format=csv`,
  ];
  for (const u of urls) { const t = await get(u, false, 2); if (t && t.includes('OBS_VALUE')) return t; }
  return null;
}
const csv = await bisCsv();
if (csv) {
  const lines = csv.trim().split(/\r?\n/), head = lines[0].split(',');
  const iA = head.indexOf('REF_AREA'), iT = head.indexOf('TIME_PERIOD'), iV = head.indexOf('OBS_VALUE');
  const ser = {};
  lines.slice(1).forEach(l => { const c = l.split(','); const a = c[iA], t = c[iT], v = parseFloat(c[iV]); if (!a || !t || isNaN(v)) return; (ser[a] = ser[a] || []).push([t, v]); });
  for (const [a, s] of Object.entries(ser)) {
    s.sort((p, q) => p[0].localeCompare(q[0]));
    const last = s[s.length - 1]; let j = s.length - 1; while (j > 0 && s[j - 1][1] === last[1]) j--;
    const prev = j > 0 ? s[j - 1][1] : null;
    out.rates[a] = {v: last[1], d: last[0], since: s[j][0], prev, hist: s.slice(-24).map(x => x[1])};
  }
  out.src.rates = 'BIS · Central bank policy rates (WS_CBPOL)';
  console.log('BIS', Object.keys(out.rates).length);
} else console.error('BIS indisponible');

// 3) Yahoo Finance : monnaie (en dollars US) et bourse principale des grands pays
const MK = {
  USA: {idx: '^GSPC'}, CAN: {fx: 'CAD=X', idx: '^GSPTSE'}, MEX: {fx: 'MXN=X', idx: '^MXX'}, BRA: {fx: 'BRL=X', idx: '^BVSP'}, ARG: {fx: 'ARS=X', idx: '^MERV'},
  GBR: {fx: 'GBPUSD=X', inv: true, idx: '^FTSE'}, DEU: {fx: 'EURUSD=X', inv: true, idx: '^GDAXI'}, FRA: {fx: 'EURUSD=X', inv: true, idx: '^FCHI'}, ITA: {fx: 'EURUSD=X', inv: true, idx: 'FTSEMIB.MI'},
  ESP: {fx: 'EURUSD=X', inv: true, idx: '^IBEX'}, NLD: {fx: 'EURUSD=X', inv: true, idx: '^AEX'}, CHE: {fx: 'CHF=X', idx: '^SSMI'}, SWE: {fx: 'SEK=X', idx: '^OMX'}, NOR: {fx: 'NOK=X', idx: 'OBX.OL'},
  POL: {fx: 'PLN=X', idx: 'WIG20.WA'}, TUR: {fx: 'TRY=X', idx: 'XU100.IS'}, RUS: {fx: 'RUB=X'}, ZAF: {fx: 'ZAR=X', idx: '^J203.JO'}, SAU: {fx: 'SAR=X', idx: '^TASI.SR'}, ISR: {fx: 'ILS=X', idx: '^TA125.TA'},
  JPN: {fx: 'JPY=X', idx: '^N225'}, CHN: {fx: 'CNY=X', idx: '000001.SS'}, KOR: {fx: 'KRW=X', idx: '^KS11'}, IND: {fx: 'INR=X', idx: '^NSEI'}, IDN: {fx: 'IDR=X', idx: '^JKSE'},
  TWN: {fx: 'TWD=X', idx: '^TWII'}, AUS: {fx: 'AUDUSD=X', inv: true, idx: '^AXJO'}, NZL: {fx: 'NZDUSD=X', inv: true, idx: '^NZ50'}, SGP: {fx: 'SGD=X', idx: '^STI'}, EGY: {fx: 'EGP=X'}, NGA: {fx: 'NGN=X'}
};
const cache = {};
async function quote(sym) {
  if (cache[sym] !== undefined) return cache[sym];
  let res = null;
  for (const host of ['query1', 'query2']) {
    const j = await get(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1d`, true, 2);
    const r = j && j.chart && j.chart.result && j.chart.result[0];
    if (!r || !r.timestamp) continue;
    const c = [], d = []; r.timestamp.forEach((t, i) => { const v = r.indicators.quote[0].close[i]; if (v != null) { c.push(v); d.push(new Date(t * 1000).toISOString().slice(0, 10)); } });
    if (c.length < 30) continue;
    const N = c.length, px = c[N - 1], y = d[N - 1].slice(0, 4), iy = d.findIndex(x => x.slice(0, 4) === y);
    const r2 = (x, k = 2) => +x.toFixed(k), dec = px < 10 ? 4 : 2;
    res = {sym, date: d[N - 1], px: r2(px, dec), chg1d: r2((px / c[N - 2] - 1) * 100), chg1m: r2((px / c[Math.max(0, N - 22)] - 1) * 100), chgYtd: iy > 0 ? r2((px / c[iy - 1] - 1) * 100) : null,
      spark: c.filter((_, i) => i % 3 === 0 || i === N - 1).map(x => r2(x, dec))};
    break;
  }
  cache[sym] = res; await sleep(400); return res;
}
for (const [iso, m] of Object.entries(MK)) {
  const o = {};
  if (m.fx) { const q = await quote(m.fx); if (q) o.fx = {...q, inv: !!m.inv}; }
  if (m.idx) { const q = await quote(m.idx); if (q) o.idx = q; }
  if (Object.keys(o).length) out.mkts[iso] = o;
}
out.src.mkts = 'Yahoo Finance · clôtures quotidiennes';
console.log('Marchés', Object.keys(out.mkts).length);
if (!Object.keys(out.imf).length && !Object.keys(out.rates).length) { console.error('Aucune donnée'); process.exit(1); }
fs.writeFileSync(OUT, JSON.stringify(out));
