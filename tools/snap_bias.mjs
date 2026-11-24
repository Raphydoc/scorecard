// node tools/snap_bias.mjs  (dans .github/workflows/bulletin.yml)
// Ouvre le site dans un navigateur sans écran, lit le biais du scorecard de chaque actif (window.__bias)
// et l'ajoute à bulletin.json. La page Bulletin du score compare ensuite ce biais à ce que le prix a fait.
import fs from 'node:fs';
import {chromium} from 'playwright';
const URL = process.env.SITE || 'http://localhost:8000/';
const day = new Date().toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
const wd = new Date(day + 'T12:00:00Z').getUTCDay();
if (wd === 0 || wd === 6) { console.log('fin de semaine : rien à enregistrer'); process.exit(0); }
const b = await chromium.launch();
const p = await b.newPage();
await p.route(/tradingview|youtube|googletagmanager/, r => r.abort());
await p.goto(URL, {waitUntil: 'load'});
let a = null;
for (let i = 0; i < 60 && !a; i++) { await p.waitForTimeout(1000); a = await p.evaluate(() => window.__bias && window.__bias()).catch(() => null); }
await b.close();
if (!a || !Object.keys(a).length) { console.error('biais introuvable'); process.exit(1); }
let B = {days: []}; try { B = JSON.parse(fs.readFileSync('bulletin.json', 'utf8')); } catch (e) {}
B.days = (B.days || []).filter(d => d.date !== day);
B.days.push({date: day, asOf: new Date().toISOString(), a});
B.days.sort((x, y) => x.date.localeCompare(y.date));
fs.writeFileSync('bulletin.json', JSON.stringify(B));
console.log('bulletin', day, Object.keys(a).length, 'actifs');
