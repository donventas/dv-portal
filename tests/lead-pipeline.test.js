const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '06_lead_anon_insert_policy.sql'),
  'utf8'
);

test('BUG-001 permits anonymous inserts through an explicit RLS policy', () => {
  assert.match(migration, /create policy lead_anon_insert on public\.lead/i);
  assert.match(migration, /for insert to anon/i);
});

test('BUG-001 requires consent and core contact fields but not a website', () => {
  assert.match(migration, /consent is true/i);
  assert.match(migration, /btrim\(nombre\)/i);
  assert.match(migration, /btrim\(negocio\)/i);
  assert.match(migration, /btrim\(correo\)/i);
  assert.doesNotMatch(migration, /\burl\b|sitio/i);
});
