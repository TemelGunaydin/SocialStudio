import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseProject } from '../server/projects.mjs';

const root = resolve(import.meta.dirname, '..');
const project = { name: 'Example', category: 'Software', platform: 'Web', url: 'https://example.com/product',
  features: 'Verified feature one.\nVerified feature two.' };

test('project import requires owner-verified claims and safe HTTPS links', () => {
  assert.equal(parseProject(project).features.length, 2);
  for (const url of ['http://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:pass@example.com']) {
    assert.throws(() => parseProject({ ...project, url }), /HTTPS/);
  }
  assert.throws(() => parseProject({ ...project, features: '' }), /doğrulanmış/);
  assert.equal(parseProject(project).icon, '/favicon.svg');
});

test('setup creates private credentials only once and never overwrites an existing env', () => {
  const dir = mkdtempSync(join(tmpdir(), 'social-studio-setup-'));
  try {
    mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'scripts/setup.mjs'), readFileSync(join(root, 'scripts/setup.mjs')));
    writeFileSync(join(dir, '.env.example'), readFileSync(join(root, '.env.example')));
    const command = () => spawnSync(process.execPath, [join(dir, 'scripts/setup.mjs')], { encoding: 'utf8' });
    assert.equal(command().status, 0);
    const content = readFileSync(join(dir, '.env'), 'utf8');
    assert.match(content, /ADMIN_PASSWORD=[A-Za-z0-9_-]{24}/);
    assert.match(content, /SESSION_SECRET=[A-Za-z0-9_-]{64}/);
    assert.equal(statSync(join(dir, '.env')).mode & 0o777, 0o600);
    assert.equal(command().status, 0);
    assert.equal(readFileSync(join(dir, '.env'), 'utf8'), content);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
