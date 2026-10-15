// Detection tests for the browser extension. The same cases (tests/cases.json) also run
// against the Android port: android/app/src/test/.../ClassifierCasesTest + scripts/test-java.sh
const C = require('../extension/classifier.js');
const cases = require('./cases.json');

let fail = 0;
for (const c of cases) {
  const v = C.classify(c.meta, { countries: c.countries || ['IN'], sensitivity: c.sensitivity || 'medium' });
  const ok = v.block === c.block;
  if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', c.name.padEnd(34), v.block, v.score, v.reasons.join(' | '));
}
console.log(fail ? `${fail} FAILED` : `all ${cases.length} passed`);
process.exitCode = fail ? 1 : 0;
