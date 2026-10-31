import { theme } from '../config';

export const GAME_TIME_ZONE = theme.resetTimeZone;
export const LAUNCH_DATE = theme.launchDate;
export const PRIOR_SAMPLE_SIZE = 200;

export interface MovieRecord {
  id: string;
  title: string;
  year: number;
  aliases: string[];
  wiki: string;
  weight: number;
}

export interface PromptRecord {
  id: string;
  text: string;
  category: string;
  movieIds: string[];
  description: string;
  packs?: string[];
}

const thresholds = [0.1, 0.03, 0.005, 0.001, 0];
export const TIERS = theme.tiers.map((name, index) => ({
  name, points: theme.points[index], emoji: theme.emoji[index], minimum: thresholds[index],
}));

export interface PublicMovie { id: string; title: string; year: number }
export interface PublicPrompt { id: string; text: string; category: string; description: string }
export type AnswerStatus = 'correct' | 'incorrect' | 'timeout' | 'skipped' | 'abandoned';
export interface AnswerResult {
  index: number;
  promptId: string;
  movie: PublicMovie | null;
  submitted: string;
  points: number;
  tier: string;
  emoji: string;
  estimatedShare: number | null;
  playerShare: number | null;
  status: AnswerStatus;
  example?: PublicMovie;
}

export function newYorkDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: GAME_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** Find the next New York date boundary, including the 23/25-hour DST days. */
export function nextResetAt(now = new Date()): string {
  const date = newYorkDate(now);
  let low = now.getTime();
  let high = low + 27 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (newYorkDate(new Date(middle)) === date) low = middle;
    else high = middle;
  }
  return new Date(high).toISOString();
}

export function puzzleNumber(date: string): number {
  return Math.max(1, Math.round((Date.parse(date) - Date.parse(LAUNCH_DATE)) / 86_400_000) + 1);
}

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function normalizeText(title: string): string {
  return title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeTitle(title: string): string {
  return normalizeText(title).replace(/^(the|an|a)\s+/, '');
}

export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let minimum = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      minimum = Math.min(minimum, current[j]);
    }
    if (minimum > 2) return 3;
    previous = current;
  }
  return previous[b.length];
}

const titleIndexes = new WeakMap<MovieRecord[], {
  ids: Map<string, MovieRecord>;
  names: Map<string, MovieRecord[]>;
  mainTitles: Map<string, MovieRecord[]>;
  normalized: Map<MovieRecord, string[]>;
}>();

function titleIndex(catalog: MovieRecord[]) {
  let index = titleIndexes.get(catalog);
  if (index) return index;
  index = { ids: new Map(), names: new Map(), mainTitles: new Map(), normalized: new Map() };
  for (const movie of catalog) {
    index.ids.set(movie.id, movie);
    const mainTitle = normalizeTitle(movie.title);
    index.mainTitles.set(mainTitle, [...(index.mainTitles.get(mainTitle) || []), movie]);
    const names = [...new Set([movie.title, ...movie.aliases].map(normalizeTitle).filter(Boolean))];
    index.normalized.set(movie, names);
    for (const name of names) index.names.set(name, [...(index.names.get(name) || []), movie]);
  }
  titleIndexes.set(catalog, index);
  return index;
}

/** Exact matches precede fuzzy matches, and fuzzy matching never invents a sequel number. */
export function matchMovies(answer: string, catalog: MovieRecord[]): MovieRecord[] {
  const index = titleIndex(catalog);
  const byId = index.ids.get(answer);
  if (byId) return [byId];
  const yearMatch = answer.match(/\s*\((\d{4})\)\s*$/);
  const year = yearMatch ? Number(yearMatch[1]) : undefined;
  const normalized = normalizeTitle(yearMatch ? answer.slice(0, yearMatch.index) : answer);
  if (!normalized) return [];
  const pool = year ? catalog.filter(movie => movie.year === year) : catalog;
  const exact = (index.names.get(normalized) || []).filter(movie => !year || movie.year === year);
  if (exact.length) return exact;
  // Short titles are too ambiguous to safely tolerate two edits.
  const threshold = normalized.length <= 3 ? 0 : normalized.length <= 5 ? 1 : 2;
  let best = threshold + 1;
  let matches: MovieRecord[] = [];
  for (const movie of pool) {
    for (const name of index.normalized.get(movie) || []) {
      if ((name.match(/\d+/g) || []).join(',') !== (normalized.match(/\d+/g) || []).join(',')) continue;
      const distance = editDistance(normalized, name);
      if (distance < best) { best = distance; matches = [movie]; }
      else if (distance === best && !matches.includes(movie)) matches.push(movie);
    }
  }
  return best <= threshold ? matches : [];
}

export function resolveMovie(matches: MovieRecord[], prompt: PromptRecord, catalog?: MovieRecord[]): MovieRecord | undefined {
  // A selected autocomplete ID or explicit year must not bypass remake scoring.
  const titles = new Set(matches.map(movie => normalizeTitle(movie.title)));
  const versions = catalog ? [...titles].flatMap(title => titleIndex(catalog).mainTitles.get(title) || []) : matches;
  const valid = versions.filter(movie => prompt.movieIds.includes(movie.id));
  const pool = valid.length ? valid : versions;
  return pool.slice().sort((a, b) => b.weight - a.weight)[0];
}

export function priorShare(movie: MovieRecord, prompt: PromptRecord, catalog: MovieRecord[]): number {
  const accepted = new Set(prompt.movieIds);
  const total = catalog.reduce((sum, item) => sum + (accepted.has(item.id) ? Math.max(1, item.weight) : 0), 0);
  return total ? Math.max(1, movie.weight) / total : 0;
}

export function estimatedShare(prior: number, choices: number, respondents: number): number {
  return (choices + PRIOR_SAMPLE_SIZE * prior) / (respondents + PRIOR_SAMPLE_SIZE);
}

export function tierForShare(share: number) {
  return TIERS.find(tier => share >= tier.minimum) || TIERS[TIERS.length - 1];
}

export function publicMovie(movie: MovieRecord): PublicMovie {
  return { id: movie.id, title: movie.title, year: movie.year };
}

export function publicPrompt(prompt: PromptRecord): PublicPrompt {
  return { id: prompt.id, text: prompt.text, category: prompt.category, description: prompt.description };
}
