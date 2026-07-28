import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const mode = process.argv[2];
const allowed = [
  '.gitignore', '.nvmrc', '.github/workflows/portal-ci.yml', 'app/auth.js',
  'app/atomic-mutations.js', 'app/client.js', 'app/environment-indicator.js',
  'app/environment.js', 'app/portal.css', 'app/portal.js',
  'app/release-config.js', 'app/staff.js', 'app/store.js', 'app/supabase.js',
  'app/write-guard.js',
  'config/release-config.example.js', 'index.html', 'package-lock.json',
  'package.json', 'playwright.config.js', 'scripts/serve.mjs',
  'scripts/verify.mjs', 'tests/atomic-mutations.test.js',
  'tests/atomic-mutations-harness.html',
  'tests/browser/foundation.spec.js', 'tests/environment-indicator.test.js',
  'tests/environment-indicator-harness.html',
  'tests/environment.test.js', 'tests/product-foundation.test.js',
  'tests/write-guard.test.js'
];
const forbidden = [
  /^supabase\//, /^data\/seed\.js$/, /^README\.md$/, /\.env(?:\.|$)/,
  /fix-grants\.sql$/, /reset-prod\.sql$/, /migrations\//,
  /stripe|payment|webhook|edge.?function/i
];
function changed() {
  const tracked = cp.execFileSync('git', ['diff', '--name-only', '0e53b217513ac71c7765637bda047f8871cbe684'])
    .toString().trim().split(/\r?\n/).filter(Boolean);
  const untracked = cp.execFileSync('git', ['ls-files', '--others', '--exclude-standard'])
    .toString().trim().split(/\r?\n/).filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}
function fail(message) { console.error(message); process.exitCode = 1; }
if (mode === 'paths') {
  for (const file of changed()) {
    if (!allowed.includes(file)) fail('PATH_NOT_ALLOWLISTED: ' + file);
    if (forbidden.some(rule => rule.test(file))) fail('PATH_DENYLISTED: ' + file);
  }
} else if (mode === 'bundle') {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
  if (scripts.some(file => /test|harness|fixture|example|source.?map/i.test(file))) {
    fail('NON_PRODUCT_SOURCE_IN_BUNDLE');
  }
  if (/<script src="data\/seed\.js"/.test(html)) fail('SEED_IN_STATIC_BOOT');
} else if (mode === 'secrets') {
  const files = changed().filter(file => fs.existsSync(path.join(root, file)) &&
    /\.(?:js|json|html|mjs|yml|yaml|md|nvmrc)$/.test(file));
  const patterns = [
    /service[_-]?role\s*[:=]\s*['"][^'"]+/i,
    /(?:password|private[_-]?key|webhook[_-]?secret)\s*[:=]\s*['"][^'"]+/i,
    /eyJ[a-zA-Z0-9_-]{30,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/,
    /https:\/\/[a-z0-9-]+\.supabase\.co/i
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    if (patterns.some(rule => rule.test(source))) fail('SECRET_LIKE_MATERIAL: ' + file);
  }
} else {
  fail('UNKNOWN_VERIFY_MODE');
}
