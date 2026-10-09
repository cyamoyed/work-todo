/** Tiny TAP-ish runner shared by Node test files. */
let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    console.log('  PASS  ' + name);
    passed += 1;
  } else {
    const msg = '  FAIL  ' + name + (detail ? ' — ' + detail : '');
    console.log(msg);
    failed += 1;
    failures.push(msg);
  }
}

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(name, a === e, `expected ${e}, got ${a}`);
}

function section(title) {
  console.log('');
  console.log('· ' + title);
}

function summary(label) {
  console.log('');
  console.log(`[${label}] ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log('  ' + f);
  }
  return failed === 0;
}

module.exports = { ok, eq, section, summary, get passed() { return passed; }, get failed() { return failed; } };
