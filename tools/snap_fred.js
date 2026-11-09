// À exécuter (javascript_tool) sur une page de https://fred.stlouisfed.org — renvoie {macro, rates} au format de data.json → live
const M = {cpi:'CPIAUCSL', core:'CPILFESL', pce:'PCEPI', corepce:'PCEPILFE', ppi:'PPIFIS', nfp:'PAYEMS', unemp:'UNRATE', jolts:'JTSJOL', retail:'RSAFS', umich:'UMCSENT'};
const W = {y10:'DGS10', y2:'DGS2', y3m:'DGS3MO', y5:'DGS5', y30:'DGS30', ff:'DFEDTARU', be5:'T5YIE', hy:'BAMLH0A0HYM2', vix:'VIXCLS', mort:'MORTGAGE30US', claims:'ICSA'};
const get = async (id, start) => (await (await fetch('/graph/fredgraph.csv?id='+id+'&cosd='+start)).text()).trim().split('\n').slice(1).map(l=>l.split(',')).filter(r=>r[1]!==''&&r[1]!=='.').map(r=>[r[0], +r[1]]);
const now = new Date(), y0 = now.getFullYear()-6, w0 = new Date(now - 760*864e5).toISOString().slice(0,10);
const out = {macro:{}, rates:{}};
for(const [k,id] of Object.entries(M)) out.macro[k] = (await get(id, y0+'-01-01')).map(([d,v])=>[d.slice(0,7), v]);
out.macro.gdp = (await get('A191RL1Q225SBEA', (y0-1)+'-01-01')).map(([d,v])=>[d.slice(0,4)+'-Q'+(Math.floor((+d.slice(5,7)-1)/3)+1), v]);
for(const [k,id] of Object.entries(W)){
  const rows = await get(id, w0); const wk = {};
  rows.forEach(([d,v])=>{ const t = new Date(d+'T12:00:00Z'); const f = new Date(t.getTime() + ((5 - t.getUTCDay() + 7) % 7)*864e5).toISOString().slice(0,10); wk[f] = [d, v]; });
  const pts = Object.keys(wk).sort().map(f=>wk[f]);
  (k==='claims' ? out.macro : out.rates)[k] = k==='claims' ? pts.map(([d,v])=>[d, Math.round(v/1000)]) : pts;
}
JSON.stringify(out)
