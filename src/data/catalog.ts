import movieData from './movies.json';
import promptData from './prompts.json';
import metadata from './metadata.json';

export interface Movie {
  id: string;
  title: string;
  year: number;
  aliases: string[];
  wiki: string;
  weight: number;
  runtime?: number;
  sitelinks?: number;
  annualPageviews?: number | null;
  pageviewMonths?: number;
  weightSource?: string;
}

export interface Prompt {
  id: string;
  text: string;
  category: string;
  movieIds: string[];
  description: string;
  person?: string;
  packs?: string[];
}

export const movies: Movie[] = movieData;
export const prompts: Prompt[] = promptData;
export const dataMetadata = metadata;

const DAY = 86_400_000;
const EPOCH = Date.UTC(2026, 9, 30);
const categories = ['studio', 'decade', 'genre', 'country', 'runtime', 'cast', 'award'];
const mod = (n: number, length: number) => ((n % length) + length) % length;

/** The caller supplies the date in America/New_York, never its local UTC day. */
export function getDailyPrompts(date: string): Prompt[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Expected a YYYY-MM-DD game date.');
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new Error('Invalid game date.');
  }
  const day = Math.floor((timestamp - EPOCH) / DAY);
  return categories.map((category, slot) => {
    const pool = prompts.filter((prompt) => prompt.category === category);
    if (pool.length === 0) throw new Error(`No reviewed prompt available for ${category}.`);
    // Sequential casts ensure one actor cannot recur within any 30-day window.
    // Other pools rotate independently to avoid identical seven-prompt sets.
    const offset = category === 'cast' ? day : day + slot * 11;
    return pool[mod(offset, pool.length)];
  });
}

/** Title-only support for theme previews. Full seven-round packs are not live. */
export function getPackPrompts(pack: string): Prompt[] {
  return prompts.filter((prompt) => prompt.packs?.includes(pack));
}
