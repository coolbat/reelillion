import { movies, prompts, getDailyPrompts } from '../src/data/catalog';
import {
  LAUNCH_DATE, newYorkDate, nextResetAt, puzzleNumber, shiftDate, matchMovies, normalizeTitle, normalizeText,
  resolveMovie, priorShare, estimatedShare, tierForShare, publicMovie, publicPrompt,
  type AnswerResult, type AnswerStatus, type PromptRecord, type MovieRecord,
} from '../src/lib/game';

interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}
export interface Env {
  DB: Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

interface SessionRow {
  id: string; device_id: string; mode: 'daily' | 'archive' | 'practice'; date: string;
  prompt_ids: string; accessible: number; current_index: number; deadline: number;
  round_started_at: number; created_at: number; completed_at: number | null;
}
interface AnswerRow { round_index: number; result_json: string }
interface ChoiceCount { movie_id: string | null; count: number }
const movieMap = new Map<string, MovieRecord>(movies.map(movie => [movie.id, movie]));
const promptMap = new Map<string, PromptRecord>(prompts.map(prompt => [prompt.id, prompt]));
const searchIndex = movies.map(movie => ({ movie, names: [movie.title, ...movie.aliases]
  .flatMap(name => [normalizeTitle(name), normalizeText(name)]) }));
const SCORING_BASIS = 'Estimated rarity uses public film popularity as a starting point and blends in eligible first daily answers. Scores lock when submitted; player percentages use real answers only.';

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  } });
}
function stringField(body: Record<string, unknown>, field: string, maximum = 150): string {
  const value = body[field];
  if (typeof value !== 'string' || value.length > maximum) throw new ApiError(400, `Invalid ${field}.`);
  return value;
}
function deviceId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(value)) throw new ApiError(400, 'Invalid device identifier.');
  return value;
}
async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'Send a JSON request.');
  if (Number(request.headers.get('content-length')) > 4096) throw new ApiError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let raw = ''; let bytes = 0;
  if (reader) {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4096) { await reader.cancel(); throw new ApiError(413, 'Request is too large.'); }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
  }
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new ApiError(400, 'Invalid JSON request.'); }
}
function sameOrigin(request: Request): void {
  const origin = request.headers.get('Origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    throw new ApiError(403, 'Please play from this website.');
  }
}
async function rateLimit(db: Database, request: Request, scope: string, limit: number): Promise<void> {
  const address = request.headers.get('CF-Connecting-IP') || 'local';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${scope}:${address}`));
  const hash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  const window = Math.floor(Date.now() / 60_000);
  const bucket = `${hash}:${window}`;
  const row = await db.prepare(`INSERT INTO rate_limits (bucket, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count`).bind(bucket, (window + 2) * 60_000).first<{ count: number }>();
  if (row && row.count > limit) throw new ApiError(429, 'A little too fast. Please try again in a minute.');
  // Expired counters have no analytical purpose and are pruned opportunistically.
  if (Math.random() < 0.02) await db.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(Date.now()).run();
}
function sessionPrompts(session: SessionRow): PromptRecord[] {
  return (JSON.parse(session.prompt_ids) as string[]).map(id => {
    const prompt = promptMap.get(id);
    if (!prompt) throw new ApiError(503, 'This round is temporarily unavailable.');
    return prompt;
  });
}
async function loadSession(db: Database, id: string, device: string): Promise<SessionRow> {
  const session = await db.prepare('SELECT * FROM sessions WHERE id = ? AND device_id = ?').bind(id, device).first<SessionRow>();
  if (!session) throw new ApiError(404, 'Game not found on this device.');
  return session;
}
async function answerRows(db: Database, sessionId: string): Promise<AnswerResult[]> {
  const result = await db.prepare('SELECT round_index, result_json FROM answers WHERE session_id = ? ORDER BY round_index')
    .bind(sessionId).all<AnswerRow>();
  return result.results.map(row => JSON.parse(row.result_json));
}
async function expireDailySession(db: Database, session: SessionRow): Promise<boolean> {
  if (session.mode !== 'daily' || session.date === newYorkDate() || session.completed_at !== null) return false;
  const now = Date.now();
  const questions = sessionPrompts(session);
  const statements = questions.map((prompt, index) => {
    const result: AnswerResult = { index, promptId: prompt.id, movie: null, submitted: '', points: 0,
      tier: 'No score', emoji: '⬛', estimatedShare: null, playerShare: null, status: 'timeout' };
    return db.prepare(`INSERT OR IGNORE INTO answers
      (session_id, round_index, prompt_id, date, movie_id, points, eligible, result_json, submitted_at)
      VALUES (?, ?, ?, ?, NULL, 0, 0, ?, ?)`)
      .bind(session.id, index, prompt.id, session.date, JSON.stringify(result), now);
  });
  statements.push(db.prepare(`UPDATE sessions SET current_index = ?, deadline = ?, completed_at = ? WHERE id = ?`)
    .bind(questions.length - 1, now, now, session.id));
  await db.batch(statements);
  session.current_index = questions.length - 1; session.deadline = now; session.completed_at = now;
  return true;
}
async function sessionView(db: Database, session: SessionRow) {
  const answers = await answerRows(db, session.id);
  const serverNow = Date.now();
  return {
    sessionId: session.id, date: session.date, number: puzzleNumber(session.date), mode: session.mode,
    accessible: !!session.accessible, secondsPerRound: session.accessible ? 40 : 20,
    prompts: sessionPrompts(session).map(publicPrompt), currentIndex: session.current_index,
    deadline: session.deadline, serverNow, answers,
    completed: session.completed_at !== null, scoringBasis: SCORING_BASIS,
  };
}
async function counts(db: Database, date: string, promptId: string): Promise<ChoiceCount[]> {
  const result = await db.prepare(`SELECT movie_id, COUNT(*) AS count FROM answers
    WHERE date = ? AND prompt_id = ? AND eligible = 1 GROUP BY movie_id`).bind(date, promptId).all<ChoiceCount>();
  return result.results;
}
async function lockAnswer(db: Database, session: SessionRow, submitted: string, forcedStatus?: AnswerStatus): Promise<AnswerResult | null> {
  const priorAnswer = await db.prepare('SELECT result_json FROM answers WHERE session_id = ? AND round_index = ?')
    .bind(session.id, session.current_index).first<{ result_json: string }>();
  if (priorAnswer) return JSON.parse(priorAnswer.result_json);
  const now = Date.now();
  const prompt = sessionPrompts(session)[session.current_index];
  if (!prompt) throw new ApiError(409, 'This game is already complete.');
  let status: AnswerStatus = forcedStatus || (now >= session.deadline ? 'timeout' : submitted.trim() ? 'correct' : 'skipped');
  let movie: MovieRecord | undefined;
  let share: number | null = null;
  let playerShare: number | null = null;
  let points = 0; let tier = 'No score'; let emoji = '⬛';
  if (status === 'correct') {
    movie = resolveMovie(matchMovies(submitted, movies), prompt, movies);
    if (!movie) return null;
    if (!prompt.movieIds.includes(movie.id)) status = 'incorrect';
    else {
      const choices = await counts(db, session.date, prompt.id);
      const respondents = choices.reduce((sum, item) => sum + item.count, 0);
      const chosen = choices.find(item => item.movie_id === movie!.id)?.count || 0;
      const prior = priorShare(movie, prompt, movies);
      // Practice uses only the public-data prior; archive freezes the historical daily choices.
      share = session.mode === 'practice' ? prior : estimatedShare(prior, chosen, respondents);
      playerShare = respondents ? chosen / respondents : null;
      const result = tierForShare(share);
      points = result.points; tier = result.name; emoji = result.emoji;
    }
  }
  const result: AnswerResult = {
    index: session.current_index, promptId: prompt.id, movie: movie ? publicMovie(movie) : null,
    submitted: submitted.slice(0, 150), points, tier, emoji, estimatedShare: share, playerShare, status,
  };
  if (status === 'incorrect') {
    const example = prompt.movieIds.map(id => movieMap.get(id)).filter((item): item is MovieRecord => !!item)
      .sort((a, b) => b.weight - a.weight)[0];
    if (example) result.example = publicMovie(example);
  }
  // Fast automated sequences cannot contribute to the public rarity model.
  const eligible = session.mode === 'daily' && now - session.round_started_at >= 700 ? 1 : 0;
  await db.prepare(`INSERT OR IGNORE INTO answers
    (session_id, round_index, prompt_id, date, movie_id, points, eligible, result_json, submitted_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? FROM sessions WHERE id = ? AND current_index = ? AND completed_at IS NULL`)
    .bind(session.id, session.current_index, prompt.id, session.date, status === 'correct' ? movie!.id : null,
      points, eligible, JSON.stringify(result), now, session.id, session.current_index).run();
  const locked = await db.prepare('SELECT result_json FROM answers WHERE session_id = ? AND round_index = ?')
    .bind(session.id, session.current_index).first<{ result_json: string }>();
  if (!locked) throw new ApiError(409, 'The round changed. Please refresh.');
  if (session.current_index === sessionPrompts(session).length - 1) {
    await db.prepare(`UPDATE sessions SET completed_at = COALESCE(completed_at, ?) WHERE id = ?`)
      .bind(now, session.id).run();
    session.completed_at = now;
  }
  return JSON.parse(locked.result_json);
}

async function start(db: Database, body: Record<string, unknown>) {
  const device = deviceId(body.deviceId);
  const mode = body.mode ?? 'daily';
  if (typeof mode !== 'string' || !['daily', 'archive', 'practice'].includes(mode)) throw new ApiError(400, 'Unknown game mode.');
  const today = newYorkDate();
  const date = mode === 'archive' ? stringField(body, 'date', 10) : today;
  if (mode === 'archive' && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= today || date < shiftDate(today, -7) || date < LAUNCH_DATE)) {
    throw new ApiError(400, 'Choose one of the last seven available daily games.');
  }
  if (mode === 'daily') {
    const existing = await db.prepare(`SELECT * FROM sessions WHERE device_id = ? AND date = ? AND mode = 'daily'`)
      .bind(device, date).first<SessionRow>();
    if (existing) {
      if (existing.completed_at === null) await lockAnswer(db, existing, '', 'abandoned');
      return sessionView(db, existing);
    }
  }
  let dailyPrompts = getDailyPrompts(date);
  if (mode === 'practice') {
    let pool = prompts;
    if (body.pack) {
      const pack = stringField(body, 'pack', 30);
      pool = prompts.filter(prompt => prompt.packs?.includes(pack));
      if (pool.length < 7) throw new ApiError(409, 'This themed pack is still in the editing room.');
    }
    dailyPrompts = pool.map(prompt => ({ prompt, random: crypto.getRandomValues(new Uint32Array(1))[0] }))
      .sort((a, b) => a.random - b.random).slice(0, 7).map(item => item.prompt);
  }
  if (dailyPrompts.length !== 7) throw new ApiError(503, 'Today’s screening is being prepared. Please try again shortly.');
  const now = Date.now();
  const accessible = body.accessible === true;
  const session: SessionRow = {
    id: crypto.randomUUID(), device_id: device, mode: mode as SessionRow['mode'], date,
    prompt_ids: JSON.stringify(dailyPrompts.map(prompt => prompt.id)), accessible: accessible ? 1 : 0,
    current_index: 0, deadline: now + (accessible ? 40_000 : 20_000), round_started_at: now,
    created_at: now, completed_at: null,
  };
  await db.prepare(`INSERT OR IGNORE INTO sessions
    (id, device_id, mode, date, prompt_ids, accessible, current_index, deadline, round_started_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`)
    .bind(session.id, device, mode, date, session.prompt_ids, session.accessible, session.deadline, now, now).run();
  // A concurrent daily start is recovered through the unique device/date constraint.
  if (mode === 'daily') {
    const stored = await db.prepare(`SELECT * FROM sessions WHERE device_id = ? AND date = ? AND mode = 'daily'`)
      .bind(device, date).first<SessionRow>();
    return sessionView(db, stored!);
  }
  return sessionView(db, session);
}

async function results(db: Database, session: SessionRow) {
  if (session.completed_at === null) throw new ApiError(409, 'Finish all seven rounds to see the answers.');
  const view = await sessionView(db, session);
  const rounds = await Promise.all(sessionPrompts(session).map(async (prompt, index) => {
    const choices = await counts(db, session.date, prompt.id);
    const respondents = choices.reduce((sum, item) => sum + item.count, 0);
    const actual = choices.filter(item => item.movie_id && movieMap.has(item.movie_id));
    const chosen = new Set(actual.map(item => item.movie_id));
    const toMovie = (item: ChoiceCount) => ({ ...publicMovie(movieMap.get(item.movie_id!)!), count: item.count,
      playerShare: respondents ? item.count / respondents : null });
    const common = [...actual].sort((a, b) => b.count - a.count).slice(0, 3).map(toMovie);
    const rare = [...actual].sort((a, b) => a.count - b.count).slice(0, 3).map(toMovie);
    const unseen = prompt.movieIds.map(id => movieMap.get(id)).filter((movie): movie is MovieRecord => !!movie && !chosen.has(movie.id))
      .sort((a, b) => a.weight - b.weight)[0];
    const answer = view.answers.find(item => item.index === index)!;
    const choice = answer.movie ? choices.find(item => item.movie_id === answer.movie!.id)?.count || 0 : 0;
    return { prompt: publicPrompt(prompt), answer: { ...answer, playerShare: respondents ? choice / respondents : null },
      common, rare, nobody: unseen ? { ...publicMovie(unseen), wiki: unseen.wiki,
        description: `A ${unseen.year} feature film. An overlooked option for “${prompt.text}” in this screening’s recorded daily answers.` } : null,
      respondents };
  }));
  const total = view.answers.reduce((sum, answer) => sum + answer.points, 0);
  const population = await db.prepare(`SELECT COUNT(*) AS participants,
    SUM(CASE WHEN score < ? THEN 1 ELSE 0 END) AS below FROM (
      SELECT s.id, SUM(a.points) AS score FROM sessions s JOIN answers a ON a.session_id = s.id
      WHERE s.date = ? AND s.mode = 'daily' AND s.completed_at IS NOT NULL GROUP BY s.id
    )`).bind(total, session.date).first<{ participants: number; below: number | null }>();
  const participants = population?.participants || 0;
  return { session: view, total, rounds, participants,
    percentile: participants >= 20 && session.mode === 'daily' ? Math.round((population!.below || 0) / participants * 100) : null,
    scoringBasis: SCORING_BASIS };
}

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/daily' && request.method === 'GET') {
    const date = newYorkDate();
    return json({ date, number: puzzleNumber(date), resetAt: nextResetAt(), prompts: getDailyPrompts(date).map(publicPrompt),
      secondsPerRound: 20, scoringBasis: SCORING_BASIS });
  }
  if (url.pathname === '/api/search' && request.method === 'GET') {
    const query = (url.searchParams.get('q') || '').trim();
    if (query.length < 3) return json({ movies: [] });
    if (query.length > 100) throw new ApiError(400, 'Search is too long.');
    const normalized = normalizeText(query);
    if (normalized.length < 3) return json({ movies: [] });
    const found = searchIndex.filter(item => item.names.some(name => name.includes(normalized)))
      .map(item => item.movie).sort((a, b) => b.weight - a.weight).slice(0, 8).map(publicMovie);
    return json({ movies: found });
  }
  if (url.pathname === '/api/archive' && request.method === 'GET') {
    const today = newYorkDate();
    return json({ games: Array.from({ length: 7 }, (_, index) => shiftDate(today, -index - 1))
      .filter(date => date >= LAUNCH_DATE).map(date => ({ date, number: puzzleNumber(date),
        prompts: getDailyPrompts(date).map(publicPrompt) })) });
  }
  if (!env.DB) throw new ApiError(503, 'The screening room is temporarily unavailable. Please try again soon.');
  if (url.pathname === '/api/health' && request.method === 'GET') {
    await env.DB.prepare('SELECT 1 AS ok').first();
    return json({ ok: true, movies: movies.length, prompts: prompts.length, date: newYorkDate() });
  }
  if (request.method === 'POST') {
    sameOrigin(request);
    const body = await bodyOf(request);
    await rateLimit(env.DB, request, url.pathname, url.pathname === '/api/start' ? 20 : 120);
    if (url.pathname === '/api/start') return json(await start(env.DB, body));
    const session = await loadSession(env.DB, stringField(body, 'sessionId', 50), deviceId(body.deviceId));
    const expired = await expireDailySession(env.DB, session);
    if (url.pathname === '/api/answer') {
      if (expired) {
        const view = await sessionView(env.DB, session);
        return json({ recognized: true, answer: view.answers.find(answer => answer.index === body.index),
          session: view, message: 'That daily screening has ended. The remaining rounds scored zero.' });
      }
      if (!Number.isInteger(body.index) || body.index !== session.current_index) throw new ApiError(409, 'This round has already changed.');
      const answer = await lockAnswer(env.DB, session, stringField(body, 'answer').trim());
      return json({ recognized: !!answer, message: answer ? undefined : 'We don’t know that one. Check the title and try again.',
        answer: answer || undefined, session: await sessionView(env.DB, session) });
    }
    if (url.pathname === '/api/next') {
      if (session.completed_at !== null) return json(await sessionView(env.DB, session));
      const answers = await answerRows(env.DB, session.id);
      if (!answers.some(answer => answer.index === session.current_index)) {
        if (Date.now() < session.deadline) throw new ApiError(409, 'Submit an answer or skip this round first.');
        await lockAnswer(env.DB, session, '', 'timeout');
      }
      const now = Date.now();
      await env.DB.prepare(`UPDATE sessions SET current_index = current_index + 1, round_started_at = ?, deadline = ?
        WHERE id = ? AND current_index = ? AND completed_at IS NULL
        AND EXISTS (SELECT 1 FROM answers WHERE session_id = ? AND round_index = ?)`)
        .bind(now, now + (session.accessible ? 40_000 : 20_000), session.id, session.current_index, session.id, session.current_index).run();
      return json(await sessionView(env.DB, await loadSession(env.DB, session.id, session.device_id)));
    }
  }
  if (url.pathname === '/api/results' && request.method === 'GET') {
    const session = await loadSession(env.DB, url.searchParams.get('sessionId') || '', deviceId(url.searchParams.get('deviceId')));
    await expireDailySession(env.DB, session);
    return json(await results(env.DB, session));
  }
  throw new ApiError(404, 'Not found.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try { return await api(request, env); }
    catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      console.error('Reelillion API failure:', error instanceof Error ? error.message : 'Unknown failure');
      return json({ error: 'The screening room is temporarily unavailable. Please try again.' }, 503);
    }
  },
};
