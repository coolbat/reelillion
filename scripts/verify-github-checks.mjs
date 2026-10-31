#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const REPOSITORY = 'coolbat/reelillion';
export const REQUIRED_CHECK = 'Quality';
export const MAX_WAIT_MS = 120_000;
export const POLL_MS = 10_000;
const shaPattern = /^[a-f0-9]{40}$/i;

/** Workers Builds documents WORKERS_CI_COMMIT_SHA:
 * https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#default-variables
 * CF_PAGES_COMMIT_SHA also supports Pages; CF_BUILD_COMMIT_SHA is an optional
 * explicit integration alias. Every supplied value must agree with checkout.
 */
export function resolveCommit(env = process.env, readCheckout = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()) {
  const checkout = readCheckout().trim().toLowerCase();
  if (!shaPattern.test(checkout)) throw new Error('Cannot verify a full Git checkout commit SHA.');
  const supplied = ['WORKERS_CI_COMMIT_SHA', 'CF_PAGES_COMMIT_SHA', 'CF_BUILD_COMMIT_SHA']
    .filter((name) => env[name] !== undefined && env[name] !== '')
    .map((name) => ({ name, sha: env[name].trim().toLowerCase() }));
  for (const source of supplied) {
    if (!shaPattern.test(source.sha)) throw new Error(`${source.name} is not a full commit SHA.`);
    if (source.sha !== checkout) throw new Error(`${source.name} does not match the checked-out commit. Deployment blocked.`);
  }
  return supplied[0]?.sha ?? checkout;
}

/** Check-run list data is enriched with the independently fetched check suite.
 * Only GitHub Actions' Quality job can satisfy this gate. Cloudflare's own
 * in-progress deployment check is deliberately excluded to avoid a cycle.
 */
export function evaluateQualityCheck(checkRuns, sha) {
  if (!shaPattern.test(sha) || !Array.isArray(checkRuns)) return { state: 'failure', reason: 'Invalid GitHub check evidence.' };
  const quality = checkRuns.filter((run) => run?.name === REQUIRED_CHECK && run?.app?.slug === 'github-actions');
  if (!quality.length) return { state: 'pending', reason: 'Waiting for the GitHub Actions Quality check to appear.' };
  if (quality.some((run) => run.head_sha?.toLowerCase() !== sha.toLowerCase() || run.check_suite?.head_sha?.toLowerCase() !== sha.toLowerCase())) {
    return { state: 'failure', reason: 'Quality check or check-suite SHA does not match the deployment commit.' };
  }
  // A new rerun supersedes an earlier attempt; never deploy from an old success
  // while the newest attempt is queued, running, cancelled or failed.
  if (quality.some((run) => !Number.isSafeInteger(run.id) || run.id <= 0)) return { state: 'failure', reason: 'Quality check has no verifiable run ID.' };
  const latest = quality.reduce((a, b) => a.id > b.id ? a : b);
  if (latest.status !== 'completed') return { state: 'pending', reason: `Quality is ${latest.status || 'not complete'}.`, run: latest };
  if (latest.conclusion !== 'success') return { state: 'failure', reason: `Quality concluded ${latest.conclusion || 'without a result'}. Deployment blocked.`, run: latest };
  return { state: 'success', reason: 'GitHub Actions Quality passed for this exact commit.', run: latest };
}

async function githubJson(path, remainingMs) {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'Reelillion-deployment-gate' },
    signal: AbortSignal.timeout(Math.max(1, Math.min(8_000, remainingMs))),
  });
  if (!response.ok) throw new Error(`GitHub verification returned HTTP ${response.status}. Deployment blocked.`);
  try { return await response.json(); }
  catch { throw new Error('GitHub returned invalid verification data. Deployment blocked.'); }
}

export async function fetchCheckEvidence(sha, remainingMs) {
  const started = performance.now();
  const remaining = () => {
    const time = remainingMs - (performance.now() - started);
    if (time <= 0) throw new Error('GitHub verification timed out. Deployment blocked.');
    return time;
  };
  // Filtering by name still includes only exact-name results after validation.
  // Fail closed if unexpected pagination would hide a later Quality attempt.
  const data = await githubJson(`commits/${sha}/check-runs?check_name=${encodeURIComponent(REQUIRED_CHECK)}&filter=latest&per_page=100`, remaining());
  if (!Array.isArray(data.check_runs) || !Number.isSafeInteger(data.total_count) || data.total_count !== data.check_runs.length) {
    throw new Error('GitHub check evidence is incomplete. Deployment blocked.');
  }
  const suites = new Map();
  for (const run of data.check_runs) {
    if (run?.name !== REQUIRED_CHECK || run?.app?.slug !== 'github-actions') continue;
    const suiteId = run.check_suite?.id;
    if (!Number.isSafeInteger(suiteId) || suiteId <= 0) throw new Error('Quality check has no verifiable suite. Deployment blocked.');
    if (!suites.has(suiteId)) suites.set(suiteId, await githubJson(`check-suites/${suiteId}`, remaining()));
    const suite = suites.get(suiteId);
    if (suite?.id !== suiteId || suite?.app?.slug !== 'github-actions') throw new Error('Quality suite identity is invalid. Deployment blocked.');
    run.check_suite = suite;
  }
  return data.check_runs;
}

export async function waitForQuality(sha, { readChecks = fetchCheckEvidence, now = () => performance.now(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = console.log } = {}) {
  if (!shaPattern.test(sha)) throw new Error('A full deployment commit SHA is required.');
  const deadline = now() + MAX_WAIT_MS;
  while (now() < deadline) {
    const state = evaluateQualityCheck(await readChecks(sha, deadline - now()), sha);
    if (state.state === 'failure') throw new Error(state.reason);
    if (state.state === 'success') {
      if (now() >= deadline) throw new Error('GitHub verification exceeded its time limit. Deployment blocked.');
      log(`${state.reason} ${sha}`);
      return state.run;
    }
    log(`${state.reason} Deployment remains blocked.`);
    await sleep(Math.min(POLL_MS, Math.max(0, deadline - now())));
  }
  throw new Error(`Quality did not pass within ${MAX_WAIT_MS / 1000} seconds. Deployment blocked; retry the automated build after CI finishes.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await waitForQuality(resolveCommit()); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Deployment verification failed.'); process.exitCode = 1; }
}
