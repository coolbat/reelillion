import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { type Env } from '../worker/index';
import { movies, getDailyPrompts } from '../src/data/catalog';
import { shiftDate } from '../src/lib/game';

function harness() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_game.sql', import.meta.url), 'utf8'));
  function prepare(sql: string) {
    let values: unknown[] = [];
    const statement = {
      bind(...input: unknown[]) { values = input; return statement; },
      async first<T>() { return (sqlite.prepare(sql).get(...values as never[]) || null) as T | null; },
      async all<T>() { return { results: sqlite.prepare(sql).all(...values as never[]) as T[] }; },
      async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values as never[]).changes) } }; },
    };
    return statement;
  }
  const env: Env = { DB: { prepare, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } },
    ASSETS: { async fetch() { return new Response('static asset'); } } };
  async function request(path: string, body?: Record<string, unknown>, origin = 'https://game.test') {
    const response = await worker.fetch(new Request(`https://game.test${path}`, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body),
    } : {}), env);
    return { status: response.status, body: await response.json() as any };
  }
  return { sqlite, request, env };
}

test('D1 SQL contract: authoritative round locking, unknown retries, resume forfeiture, and daily uniqueness', async () => {
  const { sqlite, request } = harness();
  try {
    const deviceId = crypto.randomUUID();
    const started = await request('/api/start', { deviceId, mode: 'daily' });
    assert.equal(started.status, 200);
    let session = started.body;
    assert.equal(session.prompts.length, 7);
    assert.equal(session.secondsPerRound, 20);
    assert.ok(session.deadline > Date.now());
    assert.ok(!('movieIds' in session.prompts[0]));
    const identity = { sessionId: session.sessionId, deviceId };
    assert.equal((await request(`/api/results?sessionId=${session.sessionId}&deviceId=${deviceId}`)).status, 409);
    assert.equal((await request('/api/next', identity)).status, 409);

    const unknown = await request('/api/answer', { ...identity, index: 0, answer: 'zzxyyzzq-no-such-film-zzxyyzzq' });
    assert.equal(unknown.body.recognized, false);
    assert.equal(unknown.body.session.answers.length, 0);

    const prompt = getDailyPrompts(session.date)[0];
    const correct = movies.find(movie => prompt.movieIds.includes(movie.id))!;
    sqlite.prepare('UPDATE sessions SET round_started_at = ? WHERE id = ?').run(Date.now() - 1000, session.sessionId);
    const answer = await request('/api/answer', { ...identity, index: 0, answer: correct.id });
    assert.equal(answer.body.answer.status, 'correct');
    assert.ok(answer.body.answer.points > 0);
    const duplicate = await request('/api/answer', { ...identity, index: 0, answer: 'anything else' });
    assert.deepEqual(duplicate.body.answer, answer.body.answer);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM answers WHERE session_id = ?').get(session.sessionId)?.n, 1);

    const simultaneousNext = await Promise.all([request('/api/next', identity), request('/api/next', identity)]);
    assert.ok(simultaneousNext.some(response => response.status === 200));
    assert.ok(simultaneousNext.every(response => response.status === 409 || response.body.currentIndex === 1));
    session = simultaneousNext.find(response => response.status === 200)!.body;
    assert.equal(session.currentIndex, 1);
    const nextPrompt = getDailyPrompts(session.date)[1];
    const wrong = movies.find(movie => !nextPrompt.movieIds.includes(movie.id))!;
    const incorrect = await request('/api/answer', { ...identity, index: 1, answer: wrong.id });
    assert.equal(incorrect.body.answer.status, 'incorrect');
    assert.equal(incorrect.body.answer.points, 0);
    assert.ok(incorrect.body.answer.example?.title);

    session = (await request('/api/next', identity)).body;
    sqlite.prepare('UPDATE sessions SET deadline = ? WHERE id = ?').run(Date.now() - 1, session.sessionId);
    const expired = await request('/api/answer', { ...identity, index: 2, answer: correct.id });
    assert.equal(expired.body.answer.status, 'timeout');
    assert.equal(expired.body.answer.points, 0);

    session = (await request('/api/next', identity)).body;
    const resumed = await request('/api/start', { deviceId, mode: 'daily' });
    assert.equal(resumed.body.sessionId, session.sessionId);
    assert.equal(resumed.body.answers[3].status, 'abandoned');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE device_id = ?').get(deviceId)?.n, 1);

    session = (await request('/api/next', identity)).body;
    while (!session.completed) {
      const skipped = await request('/api/answer', { ...identity, index: session.currentIndex, answer: '' });
      assert.equal(skipped.status, 200);
      session = skipped.body.session;
      if (!session.completed) session = (await request('/api/next', identity)).body;
    }
    const result = await request(`/api/results?sessionId=${session.sessionId}&deviceId=${deviceId}`);
    assert.equal(result.status, 200);
    assert.equal(result.body.rounds.length, 7);
    assert.equal(result.body.total, answer.body.answer.points);
    assert.equal(result.body.participants, 1);
    assert.equal(result.body.percentile, null);
    assert.ok(result.body.rounds[0].common.some((movie: any) => movie.id === correct.id));
    assert.ok(!result.body.rounds[1].common.length);
    assert.ok(result.body.rounds.every((round: any) => round.nobody?.wiki));
    const finalResume = await request('/api/start', { deviceId, mode: 'daily' });
    assert.equal(finalResume.body.completed, true);
  } finally { sqlite.close(); }
});

test('practice, accessibility, device ownership, request boundaries and cross-origin checks', async () => {
  const { sqlite, request, env } = harness();
  try {
    const deviceId = crypto.randomUUID();
    const blocked = await request('/api/start', { deviceId, mode: 'daily' }, 'https://other.test');
    assert.equal(blocked.status, 403);
    assert.equal((await request('/api/start', { deviceId: 'tiny', mode: 'daily' })).status, 400);
    assert.equal((await request('/api/start', { deviceId, mode: ['daily'] })).status, 400);
    const session = (await request('/api/start', { deviceId, mode: 'practice', accessible: true })).body;
    assert.equal(session.secondsPerRound, 40);
    assert.equal((await request('/api/answer', { sessionId: session.sessionId, deviceId: crypto.randomUUID(), index: 0, answer: '' })).status, 404);
    sqlite.prepare('UPDATE sessions SET round_started_at = ? WHERE id = ?').run(Date.now() - 1000, session.sessionId);
    await request('/api/answer', { sessionId: session.sessionId, deviceId, index: 0, answer: '' });
    assert.equal(sqlite.prepare('SELECT SUM(eligible) AS n FROM answers').get()?.n, 0);
    const another = (await request('/api/start', { deviceId, mode: 'practice' })).body;
    assert.notEqual(another.sessionId, session.sessionId);
    assert.equal((await request('/api/search?q=ab')).body.movies.length, 0);
    const oversized = await request('/api/start', { deviceId, mode: 'daily', padding: 'x'.repeat(5000) });
    assert.equal(oversized.status, 413);
    const missing = await worker.fetch(new Request('https://game.test/api/start', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId, mode: 'daily' }) }), { ...env, DB: undefined as never });
    assert.equal(missing.status, 503);
  } finally { sqlite.close(); }
});

test('a daily session cannot continue scoring after the New York date has ended', async () => {
  const { sqlite, request } = harness();
  try {
    const deviceId = crypto.randomUUID();
    const session = (await request('/api/start', { deviceId, mode: 'daily' })).body;
    const previousDate = shiftDate(session.date, -1);
    // Simulate the same stored session immediately after the New York date boundary.
    sqlite.prepare('UPDATE sessions SET date = ? WHERE id = ?').run(previousDate, session.sessionId);
    const prompt = getDailyPrompts(session.date)[0];
    const valid = movies.find(movie => prompt.movieIds.includes(movie.id))!;
    const ended = await request('/api/answer', { sessionId: session.sessionId, deviceId, index: 0, answer: valid.id });
    assert.equal(ended.status, 200);
    assert.equal(ended.body.session.completed, true);
    assert.equal(ended.body.session.answers.length, 7);
    assert.ok(ended.body.session.answers.every((answer: any) => answer.points === 0 && answer.status === 'timeout'));
    assert.equal(sqlite.prepare('SELECT SUM(eligible) AS n FROM answers').get()?.n, 0);
    const next = await request('/api/next', { sessionId: session.sessionId, deviceId });
    assert.equal(next.body.completed, true);
    const result = await request(`/api/results?sessionId=${session.sessionId}&deviceId=${deviceId}`);
    assert.equal(result.body.total, 0);
    assert.ok(result.body.rounds.every((round: any) => !round.common.length));
  } finally { sqlite.close(); }
});

test('daily ranking counts strictly lower scores, so ties never imply a false top-one-percent result', async () => {
  const { sqlite, request } = harness();
  try {
    const deviceId = crypto.randomUUID();
    let session = (await request('/api/start', { deviceId, mode: 'daily' })).body;
    const identity = { sessionId: session.sessionId, deviceId };
    for (let index = 0; index < 7; index++) {
      session = (await request('/api/answer', { ...identity, index, answer: '' })).body.session;
      if (!session.completed) session = (await request('/api/next', identity)).body;
    }
    // Add nineteen independently completed seven-round daily games to the real SQLite population.
    for (let index = 1; index < 20; index++) {
      const otherId = crypto.randomUUID();
      sqlite.prepare(`INSERT INTO sessions
        (id, device_id, mode, date, prompt_ids, accessible, current_index, deadline, round_started_at, created_at, completed_at)
        SELECT ?, ?, mode, date, prompt_ids, accessible, current_index, deadline, round_started_at, created_at, completed_at
        FROM sessions WHERE id = ?`).run(otherId, crypto.randomUUID(), session.sessionId);
      sqlite.prepare(`INSERT INTO answers
        (session_id, round_index, prompt_id, date, movie_id, points, eligible, result_json, submitted_at)
        SELECT ?, round_index, prompt_id, date, movie_id, points, eligible, result_json, submitted_at
        FROM answers WHERE session_id = ?`).run(otherId, session.sessionId);
    }
    const path = `/api/results?sessionId=${session.sessionId}&deviceId=${deviceId}`;
    const tied = (await request(path)).body;
    assert.equal(tied.participants, 20);
    assert.equal(tied.total, 0);
    assert.equal(tied.percentile, 0);
    assert.equal(100 - tied.percentile, 100, 'twenty zero-point ties are Top 100%, not Top 1%');

    // Give this player the only higher locked score; the other nineteen remain tied at zero.
    const winningAnswer = { ...session.answers[0], points: 100, tier: 'One in a Reelillion', emoji: '🏆' };
    sqlite.prepare('UPDATE answers SET points = ?, result_json = ? WHERE session_id = ? AND round_index = 0')
      .run(100, JSON.stringify(winningAnswer), session.sessionId);
    const winner = (await request(path)).body;
    assert.equal(winner.total, 100);
    assert.equal(winner.percentile, 95);
    assert.equal(100 - winner.percentile, 5, 'the sole leader among twenty completed games is Top 5%');
    assert.equal(winner.session.answers.reduce((sum: number, answer: any) => sum + answer.points, 0), winner.total);
  } finally { sqlite.close(); }
});
