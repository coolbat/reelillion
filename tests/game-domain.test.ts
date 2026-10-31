import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTitle, matchMovies, resolveMovie, priorShare, estimatedShare, tierForShare,
  newYorkDate, nextResetAt, type MovieRecord, type PromptRecord,
} from '../src/lib/game';

const catalog: MovieRecord[] = [
  { id: 'thing1982', title: 'The Thing', year: 1982, aliases: [], wiki: 'https://en.wikipedia.org/wiki/The_Thing_(1982_film)', weight: 1000 },
  { id: 'thing2011', title: 'The Thing', year: 2011, aliases: [], wiki: 'https://en.wikipedia.org/wiki/The_Thing_(2011_film)', weight: 100 },
  { id: 'toy', title: 'Toy Story', year: 1995, aliases: [], wiki: 'https://en.wikipedia.org/wiki/Toy_Story', weight: 1000 },
  { id: 'toy3', title: 'Toy Story 3', year: 2010, aliases: [], wiki: 'https://en.wikipedia.org/wiki/Toy_Story_3', weight: 400 },
  { id: 'amelie', title: 'Amélie', year: 2001, aliases: ['Le Fabuleux Destin d’Amélie Poulain'], wiki: 'https://en.wikipedia.org/wiki/Am%C3%A9lie', weight: 50 },
  { id: 'parasite', title: 'Parasite', year: 2019, aliases: ['Gisaengchung', '기생충'], wiki: 'https://en.wikipedia.org/wiki/Parasite_(2019_film)', weight: 100 },
  { id: 't2', title: 'Terminator 2: Judgment Day', year: 1991, aliases: ['T2'], wiki: 'https://en.wikipedia.org/wiki/Terminator_2:_Judgment_Day', weight: 500 },
];
const prompt: PromptRecord = { id: 'eighties', text: 'Name a 1980s film', category: 'decade',
  description: 'Feature films released from 1980 to 1989.', movieIds: ['thing1982'] };

test('title matching forgives accents, punctuation, initial articles and common aliases', () => {
  assert.equal(normalizeTitle('  The Amélie! '), 'amelie');
  assert.equal(matchMovies('amelie', catalog)[0].id, 'amelie');
  assert.equal(matchMovies('Gisaengchung', catalog)[0].id, 'parasite');
  assert.equal(matchMovies('기생충', catalog)[0].id, 'parasite');
  assert.equal(matchMovies('T2', catalog)[0].id, 't2');
  assert.equal(matchMovies('Parasiet', catalog)[0].id, 'parasite');
  assert.equal(matchMovies('a thing', catalog).length, 2);
});

test('remakes choose a qualifying version while unrestricted ties use the better-known version', () => {
  assert.equal(resolveMovie(matchMovies('The Thing', catalog), prompt)?.id, 'thing1982');
  assert.equal(resolveMovie(matchMovies('The Thing', catalog), { ...prompt, movieIds: ['thing2011'] })?.id, 'thing2011');
  assert.equal(resolveMovie(matchMovies('The Thing', catalog), { ...prompt, movieIds: ['thing1982', 'thing2011'] })?.id, 'thing1982');
  assert.equal(matchMovies('The Thing (2011)', catalog)[0].id, 'thing2011');
  assert.equal(resolveMovie(matchMovies('thing2011', catalog), { ...prompt, movieIds: ['thing1982', 'thing2011'] }, catalog)?.id, 'thing1982');
  assert.equal(resolveMovie(matchMovies('The Thing (2011)', catalog), { ...prompt, movieIds: ['thing1982', 'thing2011'] }, catalog)?.id, 'thing1982');
  assert.equal(resolveMovie(matchMovies('thing2011', catalog), { ...prompt, movieIds: ['thing2011'] }, catalog)?.id, 'thing2011');
});

test('exact sequel and original are separate; a typo never invents another sequel number', () => {
  assert.equal(matchMovies('Toy Story', catalog)[0].id, 'toy');
  assert.equal(matchMovies('Toy Story 3', catalog)[0].id, 'toy3');
  assert.deepEqual(matchMovies('Toy Story 9', catalog), []);
  assert.deepEqual(matchMovies('zzzzzzzzzz', catalog), []);
});

test('cold-start shares normalize over qualifying movies and use documented Bayesian prior', () => {
  const allThings = { ...prompt, movieIds: ['thing1982', 'thing2011'] };
  assert.equal(priorShare(catalog[0], allThings, catalog), 1000 / 1100);
  assert.equal(estimatedShare(0.02, 3, 100), 7 / 300);
  assert.equal(estimatedShare(0.001, 0, 0), 0.001);
});

test('all five thresholds and zero-adjacent rare scores follow the rules', () => {
  assert.equal(tierForShare(0.1).points, 10);
  assert.equal(tierForShare(0.03).points, 30);
  assert.equal(tierForShare(0.005).points, 60);
  assert.equal(tierForShare(0.001).points, 85);
  assert.equal(tierForShare(0.000999).points, 100);
});

test('global date resets in New York, including spring and autumn DST changes', () => {
  assert.equal(newYorkDate(new Date('2026-10-31T03:59:00Z')), '2026-10-30');
  assert.equal(newYorkDate(new Date('2026-10-31T04:00:00Z')), '2026-10-31');
  assert.equal(nextResetAt(new Date('2026-03-08T05:00:00Z')), '2026-03-09T04:00:00.000Z');
  assert.equal(nextResetAt(new Date('2026-11-01T04:00:00Z')), '2026-11-02T05:00:00.000Z');
});
