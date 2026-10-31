import test from 'node:test';
import assert from 'node:assert/strict';
import { isCloudflareBuild } from '../scripts/require-cloudflare-ci.mjs';

test('ordinary local shells and other CI providers cannot run the production wrapper', () => {
  assert.equal(isCloudflareBuild({}), false);
  assert.equal(isCloudflareBuild({ CI: 'true' }), false);
  assert.equal(isCloudflareBuild({ WORKERS_CI: '1' }), false);
});

test('initial Cloudflare Git builds can reach the independent checkout SHA gate', () => {
  assert.equal(isCloudflareBuild({ CI: 'true', WORKERS_CI: '1' }), true);
});
