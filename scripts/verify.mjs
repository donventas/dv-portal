import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const mode = process.argv[2];
const allowed = [
  'evidence/h11-appearance/ACCEPTANCE.md', 'evidence/pr6-integration/REVIEW.md',
  'evidence/h11-appearance/form-light-390.png', 'evidence/h11-appearance/form-light-1280.png',
  'evidence/h11-appearance/form-dark-390.png', 'evidence/h11-appearance/form-dark-1280.png',
  'app/appearance.css', 'app/appearance.js', 'brand/appearance/appearance.css', 'brand/appearance/bootstrap.js', 'brand/appearance/controller.js',
  'brand/donventas-wordmark-b6.svg', 'brand/donventas-symbol-bs.svg', 'tests/browser/appearance.spec.js',
  'evidence/h11-appearance/REPORT.md', 'evidence/h11-appearance/source-receipt.json', 'evidence/h11-appearance/results.json',
  'evidence/h11-appearance/light-1280.png', 'evidence/h11-appearance/dark-1280.png', 'evidence/h11-appearance/light-390.png', 'evidence/h11-appearance/dark-390.png',
  'evidence/h11-appearance/admin-light.png', 'evidence/h11-appearance/access-light.png',
  'evidence/operational-backlog.md',
  'app/admin-invitations.js', 'server/invitations.cjs', 'tests/invitations.test.js',
  'supabase/proposals/h10-invitations.sql', 'supabase/tests/invitation-lab.cjs', 'supabase/tests/invitations-integration.cjs',
  'evidence/invitations-20261025/REPORT.md', 'evidence/invitations-20261025/results.json',
  'evidence/invitations-20261025/admin-1280.png', 'evidence/invitations-20261025/admin-390.png',
  '.gitattributes',
  // Authorized isolated identity/Auth integration; private lab material is excluded.
  'supabase/proposals/h10-identity-contract.sql',
  'supabase/tests/setup-identity-lab.cjs', 'supabase/tests/identity-provider.cjs',
  'supabase/tests/identity-browser.cjs', 'tests/auth-contract.test.js',
  'evidence/identity-auth-20261025/REPORT.md',
  'evidence/identity-auth-20261025/provider-results.json',
  'evidence/identity-auth-20261025/browser-results.json',
  // Authorized actual-backup rehearsal: sanitized reports only, never dumps or secrets.
  'evidence/hosted-restore-20261025/REPORT.md',
  'evidence/hosted-restore-20261025/results.json',
  // Authorized H1 chain: synthetic DEMO, canonical brand consumers and local proof.
  'app/util.js', 'app/brand-tokens.css', 'app/hybrid-demo.js', 'app/hybrid-demo-ui.js',
  'app/hybrid-demo.css', 'dv-shared/blocks.css', 'scripts/serve-demo.mjs', 'vercel.json',
  'brand/donventas-wordmark-b6-reverse.svg', 'brand/donventas-symbol-bs-reverse.svg',
  'brand/don-ventas-icons-sprite.svg',
  'brand/fonts/LICENSE-Schibsted-Grotesk.txt', 'brand/fonts/LICENSE-Space-Mono.txt',
  'brand/fonts/schibsted-grotesk-latin-normal.woff2',
  'brand/fonts/space-mono-latin-400.woff2', 'brand/fonts/space-mono-latin-700.woff2',
  'tests/h11-workflow.test.js', 'tests/browser/h11.spec.js',
  'supabase/tests/h10-fixtures.sql', 'supabase/tests/h10-security.sql',
  'supabase/tests/local-bootstrap.sql', 'supabase/tests/provider-bootstrap.sql',
  'supabase/tests/provider-integration.cjs', 'supabase/tests/rebuild-local.ps1',
  'evidence/h1-chain/README.md', 'evidence/h1-chain/asset-receipt.json',
  'evidence/h1-chain/brand-and-form.md', 'evidence/h1-chain/bsb-route.json',
  'evidence/h1-chain/functional-design.md', 'evidence/h1-chain/reference-receipt.json',
  'evidence/h1-chain/release-runbook.md', 'evidence/h1-chain/security-review.md',
  'evidence/h1-chain/provider-results.json', 'evidence/h1-chain/restore-results.json',
  'evidence/h1-chain/sql-concurrency.json', 'evidence/h1-chain/sql-negative.txt',
  'evidence/h1-chain/sql-security.txt', 'evidence/h1-chain/tests.txt',
  'evidence/h1-chain/browser.txt', 'evidence/h1-chain/modes.ndjson',
  'evidence/h1-chain/npm-audit.json', 'evidence/h1-chain/manifest.json',
  'evidence/h1-chain/validation.txt',
  'evidence/h1-chain/access-1280.png', 'evidence/h1-chain/members-1280.png',
  'evidence/h1-chain/members-390.png', 'evidence/h1-chain/demo-1280.png',
  'evidence/h1-chain/demo-390.png', 'evidence/h1-chain/form-1280.png',
  'evidence/h1-chain/form-390.png', 'evidence/h1-chain/form-options.png',
  'evidence/h1-chain/responsive-890.png',
  // H1.0 explicitly authorized review-only SQL, fixture guard, and bounded evidence.
  'app/free.js',
  'data/empty-state.js',
  'data/seed.js',
  'tests/h10-browser.cjs',
  'tests/h10-hardening.test.js',
  'supabase/proposals/h10-command-contract.sql',
  'supabase/tests/h10-negative.sql',
  'supabase/tests/run-h10-local.cjs',
  'evidence/h1.0/README.md',
  'evidence/h1.0/mutation-inventory.md',
  'evidence/h1.0/manifest.json',
  'evidence/h1.0/tests-first.txt',
  'evidence/h1.0/tests.txt',
  'evidence/h1.0/browser.ndjson',
  'evidence/h1.0/validation.txt',

  '.gitignore', '.nvmrc', '.github/workflows/portal-ci.yml', 'app/auth.js',
  'app/atomic-mutations.js', 'app/client.js', 'app/environment-indicator.js',
  'app/environment.js', 'app/portal.css', 'app/portal.js',
  'app/release-config.js', 'app/staff.js', 'app/store.js', 'app/supabase.js',
  'app/write-guard.js',
  'brand/donventas-horizontal-curvas-reverse.svg',
  'config/release-config.example.js', 'favicon.svg', 'index.html', 'og-portal.png', 'package-lock.json',
  'design-references/prospect-inbox-editorial-v1.png',
  'package.json', 'playwright.config.js', 'scripts/serve.mjs',
  'scripts/render-social-card.mjs', 'scripts/verify.mjs',
  'social-cards/donventas-horizontal-curvas-reverse.svg', 'social-cards/portal.html',
  'tests/atomic-mutations.test.js',
  'tests/atomic-mutations-harness.html',
  'tests/browser/foundation.spec.js', 'tests/environment-indicator.test.js',
  'tests/environment-indicator-harness.html',
  'tests/environment.test.js', 'tests/product-foundation.test.js',
  'tests/write-guard.test.js', 'tests/lead-pipeline.test.js',
  'supabase/README.md',
  'supabase/migrations/05_lead_pipeline.sql',
  'supabase/migrations/06_lead_anon_insert_policy.sql',
  'supabase/functions/lead-notifications/index.ts'
];
const forbidden = [
  /^supabase\//, /^data\/seed\.js$/, /^README\.md$/, /\.env(?:\.|$)/,
  /fix-grants\.sql$/, /reset-prod\.sql$/, /migrations\//,
  /stripe|payment|webhook|edge.?function/i
];
const governedBackend = new Set([
  'supabase/proposals/h10-invitations.sql', 'supabase/tests/invitation-lab.cjs', 'supabase/tests/invitations-integration.cjs',
  'supabase/proposals/h10-identity-contract.sql',
  'supabase/tests/setup-identity-lab.cjs', 'supabase/tests/identity-provider.cjs',
  'supabase/tests/identity-browser.cjs',
  'supabase/tests/h10-fixtures.sql', 'supabase/tests/h10-security.sql',
  'supabase/tests/local-bootstrap.sql', 'supabase/tests/provider-bootstrap.sql',
  'supabase/tests/provider-integration.cjs', 'supabase/tests/rebuild-local.ps1',
  // These exact H1.0 paths are review artifacts, never automatic migrations.
  'supabase/proposals/h10-command-contract.sql', 'supabase/tests/h10-negative.sql',
  'supabase/tests/run-h10-local.cjs', 'data/seed.js',
  'supabase/README.md',
  'supabase/migrations/05_lead_pipeline.sql',
  'supabase/migrations/06_lead_anon_insert_policy.sql',
  'supabase/functions/lead-notifications/index.ts'
]);
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
    if (!governedBackend.has(file) && forbidden.some(rule => rule.test(file))) fail('PATH_DENYLISTED: ' + file);
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
    /\.(?:js|cjs|ts|sql|json|html|mjs|yml|yaml|md|nvmrc)$/.test(file));
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
