// node tools/run_snap.mjs <script.js> <base_url> <expression_to_return> <out.json>
// Exécute un script de copie (fait pour la console du navigateur) dans Node, sur GitHub Actions.
import fs from 'node:fs';
const [file, base, expr, outFile] = process.argv.slice(2);
const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n');
lines.pop(); // dernière ligne = résumé pour la console
const body = lines.join('\n') + `\nreturn JSON.stringify(${expr});`;
const realFetch = globalThis.fetch;
const fetch = async (u, o) => {
  const url = new URL(u, base);
  for (let i = 0; i < 4; i++) {
    try {
      const r = await realFetch(url, { ...o, headers: { 'User-Agent': 'scorecard-macro (GitHub Actions)', 'Accept': '*/*' } });
      if (r.ok) return r;
      console.error('HTTP', r.status, url.href);
    } catch (e) { console.error('err', e.message, url.href); }
    await new Promise(s => setTimeout(s, 3000 * (i + 1)));
  }
  throw new Error('échec : ' + url.href);
};
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const res = await new AsyncFunction('fetch', body)(fetch);
fs.writeFileSync(outFile, res);
console.log(outFile, res.length, 'caractères');
