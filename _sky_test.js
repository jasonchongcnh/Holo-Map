const fs = require('fs');
const html = fs.readFileSync(__dirname + '/bds_map.html', 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];

function grab(name) {
  const start = script.indexOf('  function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  const end = script.indexOf('\n  }\n', start);
  return script.slice(start, end + 4);
}

const funcs = ['parseGSV', 'parseGSA', 'isUsedSat', 'pruneSky'].map(grab).join('\n');

let state = { satsView: null };
const skySats = new Map();
const usedSats = new Map();
const SKY_TTL = 15000;
const GSA_SYS = { 1: 'GP', 2: 'GL', 3: 'GA', 4: 'BD', 5: 'GQ', 6: 'GI' };
let gsaSeen = false;
function systemKey(t) { return t === 'GB' ? 'BD' : t; }
function num(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

eval(funcs);

const results = [];
const ok = (cond, msg) => results.push((cond ? 'PASS ' : 'FAIL ') + msg);

parseGSV({ fields: ['BDGSV', '1', '1', '3', '05', '45', '120', '42', '06', '30', '210', '38', '07', '15', '080', '25'] });
ok(skySats.get('BD:5').snr === 42, 'GSV SNR BD:5 = 42');
ok(skySats.get('BD:6').snr === 38, 'GSV SNR BD:6 = 38');
ok(skySats.get('BD:7').snr === 25, 'GSV SNR BD:7 = 25');
ok(state.satsView === 3, 'GSV satsView = 3');

parseGSA({ talker: 'BD', fields: ['BDGSA', 'A', '3', '05', '06', '', '', '', '', '', '', '', '', '', '', '1.8', '1.0', '1.5'] });
ok(gsaSeen === true, 'GSA sets gsaSeen');
ok(isUsedSat({ sys: 'BD', prn: 5 }, Date.now()) === true, 'used BD:5');
ok(isUsedSat({ sys: 'BD', prn: 7 }, Date.now()) === false, 'not used BD:7');

parseGSA({ talker: 'GN', fields: ['GNGSA', 'A', '3', '10', '12', '', '', '', '', '', '', '', '', '', '', '1.8', '1.0', '1.5', '4'] });
ok(isUsedSat({ sys: 'BD', prn: 10 }, Date.now()) === true, 'GNGSA sysid 4 -> used BD:10');

parseGSA({ talker: 'BD', fields: ['BDGSA', 'A', '1', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''] });
ok(isUsedSat({ sys: 'BD', prn: 5 }, Date.now()) === false, 'fixType 1 clears BD used');

usedSats.set('GN:9', Date.now());
ok(isUsedSat({ sys: 'GP', prn: 9 }, Date.now()) === true, 'GN fallback marks GP:9');

const pruned = pruneSky(Date.now() + 16000);
ok(pruned === true && skySats.size === 0 && usedSats.size === 0, 'pruneSky clears stale sky+used');

console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
