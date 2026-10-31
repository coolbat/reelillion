/** Run against an isolated local Wrangler instance: BASE_URL=http://127.0.0.1:8788 npx tsx tests/game-live-smoke.ts */
import assert from 'node:assert/strict';
import { movies, prompts } from '../src/data/catalog';

const base = process.env.BASE_URL || 'http://127.0.0.1:8788';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('This smoke test is restricted to a local preview.');
const deviceId = crypto.randomUUID();
async function api(path: string, body?: Record<string, unknown>, origin = base) {
  const response = await fetch(`${base}${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) } : { signal: AbortSignal.timeout(10_000) });
  return { status: response.status, body: await response.json() as any };
}

const health = await api('/api/health');
assert.equal(health.status, 200); assert.equal(health.body.ok, true);
const daily = await api('/api/daily');
assert.equal(daily.body.prompts.length, 7);
assert.ok(daily.body.prompts.every((prompt: any) => !('movieIds' in prompt)));
const blocked = await api('/api/start', { deviceId, mode: 'daily' }, 'https://untrusted.test');
assert.equal(blocked.status, 403);
let session = (await api('/api/start', { deviceId, mode: 'daily' })).body;
const identity = { deviceId, sessionId: session.sessionId };
const unknown = await api('/api/answer', { ...identity, index: 0, answer: 'zzxyyzzq-no-such-film-zzxyyzzq' });
assert.equal(unknown.body.recognized, false);
let correctPoints = 0;
for (let index = 0; index < 7; index++) {
  const prompt = prompts.find(prompt => prompt.id === session.prompts[index].id)!;
  const movie = index === 1 ? movies.find(movie => !prompt.movieIds.includes(movie.id)) : movies.find(movie => prompt.movieIds.includes(movie.id));
  if (index === 3) {
    console.log('Waiting for a real server deadline to verify timeout scoring…');
    await new Promise(resolve => setTimeout(resolve, Math.max(0, session.deadline - Date.now() + 75)));
  }
  const answer = await api('/api/answer', { ...identity, index, answer: index === 2 ? '' : movie!.id });
  assert.equal(answer.status, 200);
  const status = index === 1 ? 'incorrect' : index === 2 ? 'skipped' : index === 3 ? 'timeout' : 'correct';
  assert.equal(answer.body.answer.status, status);
  if (status === 'correct') correctPoints += answer.body.answer.points;
  else assert.equal(answer.body.answer.points, 0);
  const repeat = await api('/api/answer', { ...identity, index, answer: 'duplicate request' });
  assert.deepEqual(repeat.body.answer, answer.body.answer);
  session = answer.body.session;
  if (!session.completed) session = (await api('/api/next', identity)).body;
}
assert.equal(session.completed, true);
const result = await api(`/api/results?sessionId=${identity.sessionId}&deviceId=${deviceId}`);
assert.equal(result.status, 200); assert.equal(result.body.total, correctPoints);
assert.equal(result.body.rounds.length, 7); assert.equal(result.body.percentile, null);
const resumed = await api('/api/start', { deviceId, mode: 'daily' });
assert.equal(resumed.body.sessionId, identity.sessionId); assert.equal(resumed.body.completed, true);
const accessible = await api('/api/start', { deviceId, mode: 'practice', accessible: true });
assert.equal(accessible.body.secondsPerRound, 40);
console.log(JSON.stringify({ passed: true, runtime: 'Wrangler / workerd + real local D1',
  movies: health.body.movies, prompts: health.body.prompts, rounds: 7, total: result.body.total,
  verified: ['same-origin rejection', 'unknown retry', 'correct rarity', 'wrong lock', 'skip', 'real 20-second timeout',
    'duplicate idempotence', 'daily uniqueness', 'results', '40-second practice'] }, null, 2));
