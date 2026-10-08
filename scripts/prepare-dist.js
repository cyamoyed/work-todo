/* Copy static web assets into dist/ for Tauri packaging. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const FILES = ['index.html', 'styles.css', 'app.js'];

fs.mkdirSync(DIST, { recursive: true });
for (const f of FILES) {
  fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));
}
console.log('dist ready:', FILES.join(', '));
