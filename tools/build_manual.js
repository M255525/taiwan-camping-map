// 由 tools/manual_tpl.html 產生 manual.html：node tools/build_manual.js . tools/manual_tpl.html
const fs = require('fs'), path = require('path');
const dir = process.argv[2], tplPath = process.argv[3];
global.window = {};
new Function(fs.readFileSync(path.join(dir, 'data.js'), 'utf8'))();
const CM = window.CM;
const e = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mhead = Array.from({length:12}, (_, i) => '<th>' + (i + 1) + '月</th>').join('');
const table = CM.SPOTS.map(p => '<tr><td>' + e(p.name) + '</td>' + Array.from({length:12}, (_, i) => { const c = CM.climate(p, i + 1); return '<td class="sc" style="background:' + CM.SCORES[c.score].c + '" title="' + CM.SCORES[c.score].name + '">' + Math.round(c.tn) + '</td>'; }).join('') + '</tr>').join('\n');
const spots = CM.REGIONS.map(r => r.name + '：' + CM.SPOTS.filter(s => s.r === r.id).map(s => s.name + '（' + s.city + '，海拔約 ' + s.elev.toLocaleString() + ' 公尺）').join('、')).join('</li><li>');
const scores = [5, 4, 3, 2, 1].map(s => '<tr><td><span class="k" style="background:' + CM.SCORES[s].c + '"></span> ' + s + '　' + CM.SCORES[s].name + '</td><td>' + e(CM.SCORES[s].tip) + '</td></tr>').join('\n');
let out = fs.readFileSync(tplPath, 'utf8').replace('{{MHEAD}}', mhead).replace('{{TABLE}}', table).replace('{{SPOTS}}', spots).replace('{{SCORES}}', scores)
  .replace(/\{\{NS\}\}/g, CM.SPOTS.length).replace(/\{\{NST\}\}/g, CM.STATIONS.length);
fs.writeFileSync(path.join(dir, 'manual.html'), out);
console.log('manual ok', CM.SPOTS.length);
