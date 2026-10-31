import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateQualityCheck, resolveCommit, waitForQuality, MAX_WAIT_MS, POLL_MS } from '../scripts/verify-github-checks.mjs';

const SHA = '1'.repeat(40);
const OTHER = '2'.repeat(40);
const quality = (overrides: Record<string, unknown> = {}) => ({ id: 10, name: 'Quality', head_sha: SHA,
  status: 'completed', conclusion: 'success', app: { slug: 'github-actions' }, check_suite: { id: 20, head_sha: SHA }, ...overrides });

test('only a successful GitHub Actions Quality run on the same run and suite SHA satisfies the gate', () => {
  assert.equal(evaluateQualityCheck([quality()], SHA).state, 'success');
  assert.equal(evaluateQualityCheck([], SHA).state, 'pending');
  assert.equal(evaluateQualityCheck([quality({ name: 'Cloudflare Workers', app: { slug: 'cloudflare-workers' }, status: 'in_progress' })], SHA).state, 'pending');
  assert.equal(evaluateQualityCheck([quality({ app: { slug: 'another-app' } })], SHA).state, 'pending');
  assert.equal(evaluateQualityCheck([quality({ head_sha: OTHER })], SHA).state, 'failure');
  assert.equal(evaluateQualityCheck([quality({ check_suite: { id: 20, head_sha: OTHER } })], SHA).state, 'failure');
  assert.equal(evaluateQualityCheck([quality({ check_suite: { id: 20 } })], SHA).state, 'failure');
});

test('failed, skipped, cancelled, neutral and stale runs never pass, and the newest rerun takes precedence', () => {
  for (const conclusion of ['failure', 'skipped', 'cancelled', 'neutral', 'stale', 'timed_out', 'action_required', null]) {
    assert.equal(evaluateQualityCheck([quality({ conclusion })], SHA).state, 'failure');
  }
  assert.equal(evaluateQualityCheck([quality(), quality({ id: 11, status: 'in_progress', conclusion: null })], SHA).state, 'pending');
  assert.equal(evaluateQualityCheck([quality(), quality({ id: 11, conclusion: 'failure' })], SHA).state, 'failure');
  assert.equal(evaluateQualityCheck([quality({ conclusion: 'failure' }), quality({ id: 11 })], SHA).state, 'success');
});

test('Cloudflare commit variables and checkout must all agree; malformed or mismatched evidence fails closed', () => {
  assert.equal(resolveCommit({}, () => SHA), SHA);
  assert.equal(resolveCommit({ WORKERS_CI_COMMIT_SHA: SHA }, () => SHA), SHA);
  assert.equal(resolveCommit({ CF_PAGES_COMMIT_SHA: SHA, CF_BUILD_COMMIT_SHA: SHA }, () => SHA), SHA);
  assert.throws(() => resolveCommit({ WORKERS_CI_COMMIT_SHA: OTHER }, () => SHA), /does not match/);
  assert.throws(() => resolveCommit({ WORKERS_CI_COMMIT_SHA: SHA, CF_PAGES_COMMIT_SHA: OTHER }, () => SHA), /does not match/);
  assert.throws(() => resolveCommit({ WORKERS_CI_COMMIT_SHA: 'main' }, () => SHA), /not a full/);
  assert.throws(() => resolveCommit({}, () => '1234'), /checkout commit/);
});

test('pending checks poll every ten seconds with a bounded two-minute wait, without network calls', async () => {
  let clock = 0; let reads = 0;
  await assert.rejects(waitForQuality(SHA, {
    readChecks: async () => { reads++; return []; }, now: () => clock,
    sleep: async (ms: number) => { assert.ok(ms <= POLL_MS); clock += ms; }, log: () => {},
  }), /did not pass within 120 seconds/);
  assert.equal(clock, MAX_WAIT_MS);
  assert.equal(reads, MAX_WAIT_MS / POLL_MS);
});

test('API failures and failed checks stop immediately; polling can resolve only after a successful check', async () => {
  let reads = 0;
  await assert.rejects(waitForQuality(SHA, { readChecks: async () => { reads++; throw new Error('HTTP 403'); }, log: () => {} }), /HTTP 403/);
  assert.equal(reads, 1);
  await assert.rejects(waitForQuality(SHA, { readChecks: async () => [quality({ conclusion: 'failure' })], log: () => {} }), /Deployment blocked/);
  let clock = 0;
  const run = await waitForQuality(SHA, {
    readChecks: async () => clock ? [quality()] : [quality({ status: 'queued', conclusion: null })],
    now: () => clock, sleep: async (ms: number) => { clock += ms; }, log: () => {},
  });
  assert.equal(run.id, 10);
  assert.equal(clock, POLL_MS);
});
