// À exécuter (javascript_tool) sur une page de https://publicreporting.cftc.gov — renvoie {cot} au format de data.json → live
const LI = {usdjpy:'097741', usdcad:'090741', usdchf:'092741'};
const L = {eurusd:'099741', xauusd:'088691', xagusd:'084691', nasdaq:'209742', spx500:'13874A', us30:'124603', rut:'239742', usd:'098662', btcusd:'133741', gbpusd:'096742', audusd:'232741', nzdusd:'112741'};
const cot = {};
for(const [k,c] of Object.entries(L)){
  const r = await (await fetch(`/resource/6dca-aqww.json?cftc_contract_market_code=${c}&$order=report_date_as_yyyy_mm_dd DESC&$limit=53&$select=report_date_as_yyyy_mm_dd,open_interest_all,noncomm_positions_long_all,noncomm_positions_short_all,comm_positions_long_all,comm_positions_short_all,nonrept_positions_long_all,nonrept_positions_short_all`)).json();
  cot[k] = r.reverse().map(x=>[x.report_date_as_yyyy_mm_dd.slice(0,10), +x.noncomm_positions_long_all, +x.noncomm_positions_short_all, +x.comm_positions_long_all, +x.comm_positions_short_all, +x.nonrept_positions_long_all, +x.nonrept_positions_short_all, +x.open_interest_all]);
}
for(const [k,c] of Object.entries(LI)){
  const r = await (await fetch(`/resource/6dca-aqww.json?cftc_contract_market_code=${c}&$order=report_date_as_yyyy_mm_dd DESC&$limit=53&$select=report_date_as_yyyy_mm_dd,open_interest_all,noncomm_positions_long_all,noncomm_positions_short_all,comm_positions_long_all,comm_positions_short_all,nonrept_positions_long_all,nonrept_positions_short_all`)).json();
  // contrat de la devise étrangère : on inverse pour que « long » = acheteur de USD/JPY ou USD/CAD
  cot[k] = r.reverse().map(x=>[x.report_date_as_yyyy_mm_dd.slice(0,10), +x.noncomm_positions_short_all, +x.noncomm_positions_long_all, +x.comm_positions_short_all, +x.comm_positions_long_all, +x.nonrept_positions_short_all, +x.nonrept_positions_long_all, +x.open_interest_all]);
}
const o = await (await fetch(`/resource/72hh-3qpy.json?cftc_contract_market_code=067651&$order=report_date_as_yyyy_mm_dd DESC&$limit=53&$select=report_date_as_yyyy_mm_dd,open_interest_all,m_money_positions_long_all,m_money_positions_short_all,prod_merc_positions_long,prod_merc_positions_short,swap_positions_long_all,swap__positions_short_all,nonrept_positions_long_all,nonrept_positions_short_all`)).json();
cot.usoil = o.reverse().map(x=>[x.report_date_as_yyyy_mm_dd.slice(0,10), +x.m_money_positions_long_all, +x.m_money_positions_short_all, (+x.prod_merc_positions_long)+(+x.swap_positions_long_all), (+x.prod_merc_positions_short)+(+x.swap__positions_short_all), +x.nonrept_positions_long_all, +x.nonrept_positions_short_all, +x.open_interest_all]);
JSON.stringify({cot})
