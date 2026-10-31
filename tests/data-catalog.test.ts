import test from 'node:test';
import assert from 'node:assert/strict';
import {getDailyPrompts, movies, prompts, dataMetadata} from '../src/data/catalog';

test('daily schedule is deterministic, seven distinct categories and all answers exist', () => {
  const known = new Set(movies.map(movie => movie.id));
  for (let day = 0; day < 365; day++) {
    const date = new Date(Date.UTC(2026, 9, 31 + day)).toISOString().slice(0, 10);
    const daily = getDailyPrompts(date);
    assert.deepEqual(daily, getDailyPrompts(date));
    assert.equal(daily.length, 7);
    assert.equal(new Set(daily.map(prompt => prompt.category)).size, 7);
    assert.equal(new Set(daily.map(prompt => prompt.id)).size, 7);
    for (const prompt of daily) {
      assert.ok(prompt.movieIds.length >= 30);
      assert.ok(prompt.movieIds.every(id => known.has(id)));
    }
  }
});

test('no actor recurs in a rolling thirty-day window', () => {
  for (let start = 0; start < 65; start++) {
    const people = Array.from({length: 30}, (_, day) => {
      const date = new Date(Date.UTC(2026, 9, 31 + start + day)).toISOString().slice(0, 10);
      return getDailyPrompts(date).find(prompt => prompt.category === 'cast')?.person;
    });
    assert.equal(new Set(people).size, 30);
    assert.ok(people.every(Boolean));
  }
});

test('date validation handles leap dates and rejects accidental UTC timestamps', () => {
  assert.equal(getDailyPrompts('2028-02-29').length, 7);
  for (const date of ['2026-02-29', '2026-13-01', '2026-11-31', '2026-10-31T00:00:00Z', '']) {
    assert.throws(() => getDailyPrompts(date));
  }
});

test('data snapshot has traceable CC0 facts and explicitly sourced weights', () => {
  assert.equal(dataMetadata.movies, movies.length);
  assert.equal(dataMetadata.prompts, prompts.length);
  for (const movie of movies) {
    assert.match(movie.wiki, /^https:\/\/en\.wikipedia\.org\/wiki\//);
    assert.ok(movie.runtime! >= 40);
    assert.ok(movie.weight > 0 && Number.isFinite(movie.weight));
    assert.ok(movie.weightSource === 'wikipedia-pageviews' || movie.weightSource === 'wikidata-sitelinks-fallback');
  }
});

test('required common abbreviations and foreign aliases are supported', () => {
  for (const alias of ['LOTR', 'T2', 'ESB', 'Gisaengchung', 'Amelie']) {
    assert.ok(movies.some(movie => movie.aliases.includes(alias)), `Missing ${alias}`);
  }
});

test('animated voice performances qualify for actor prompts', () => {
  const toyStory = movies.find(movie => movie.title === 'Toy Story' && movie.year === 1995);
  const hanks = prompts.find(prompt => prompt.id === 'cast-tom-hanks');
  assert.ok(toyStory && hanks?.movieIds.includes(toyStory.id));
});
