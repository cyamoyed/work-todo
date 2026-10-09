/**
 * Run all WorkTodo test suites and print a combined report.
 * Usage: node tests/run-all.js
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;
const NODE_PATH = path.join(ROOT, 'output', 'node_modules');

const suites = [
  { name: 'syntax', cmd: [NODE, '--check', 'app.js'], nodePath: false },
  { name: 'legacy-smoke', cmd: [NODE, 'scripts/smoke-test.js'], nodePath: false },
  { name: 'unit-data', cmd: [NODE, 'tests/unit-data.test.js'], nodePath: false },
  { name: 'unit-logic', cmd: [NODE, 'tests/unit-logic.test.js'], nodePath: false },
  { name: 'unit-recovery', cmd: [NODE, 'tests/unit-recovery.test.js'], nodePath: false },
  { name: 'unit-security', cmd: [NODE, 'tests/unit-security.test.js'], nodePath: false },
  { name: 'unit-features', cmd: [NODE, 'tests/unit-features.test.js'], nodePath: false },
  { name: 'unit-v03', cmd: [NODE, 'tests/unit-v03.test.js'], nodePath: false },
  { name: 'dom-behavior', cmd: [NODE, 'tests/dom-behavior.test.js'], nodePath: false },
  { name: 'e2e-ui', cmd: [NODE, 'tests/e2e-ui.test.js'], nodePath: true },
];

const results = [];
let totalPass = 0;
let totalFail = 0;

for (const suite of suites) {
  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  SUITE: ' + suite.name);
  console.log('════════════════════════════════════════');
  const env = { ...process.env };
  if (suite.nodePath) env.NODE_PATH = NODE_PATH;
  const r = spawnSync(suite.cmd[0], suite.cmd.slice(1), {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    timeout: 180000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(out);
  // parse "N passed, M failed"
  const m = out.match(/(?:\]|Result:)\s*(\d+) passed, (\d+) failed/);
  const pass = m ? Number(m[1]) : r.status === 0 ? 1 : 0;
  const fail = m ? Number(m[2]) : r.status === 0 ? 0 : 1;
  totalPass += pass;
  totalFail += fail;
  results.push({ name: suite.name, pass, fail, status: r.status, summary: m ? `${pass} passed, ${fail} failed` : r.status === 0 ? 'OK' : 'FAILED' });
}

console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║           COMPREHENSIVE TEST REPORT          ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');
console.log('Suite'.padEnd(18) + 'Result');
console.log('─'.repeat(46));
for (const r of results) {
  const mark = r.fail === 0 ? '✓' : '✗';
  console.log(`${mark} ${r.name.padEnd(16)} ${r.summary}`);
}
console.log('─'.repeat(46));
console.log(`TOTAL              ${totalPass} passed, ${totalFail} failed`);
console.log('');

// write machine-readable report
const reportDir = path.join(ROOT, 'tests', 'reports');
fs.mkdirSync(reportDir, { recursive: true });
const report = {
  project: 'workTodo',
  date: new Date().toISOString(),
  suites: results,
  totalPass,
  totalFail,
  exitCode: totalFail > 0 ? 1 : 0,
};
fs.writeFileSync(path.join(reportDir, 'latest.json'), JSON.stringify(report, null, 2));
console.log('Report written to tests/reports/latest.json');
process.exit(report.exitCode);
