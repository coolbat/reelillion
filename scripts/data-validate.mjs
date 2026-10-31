import fs from 'node:fs';
import assert from 'node:assert/strict';

const movies = JSON.parse(fs.readFileSync(new URL('../src/data/movies.json', import.meta.url)));
const prompts = JSON.parse(fs.readFileSync(new URL('../src/data/prompts.json', import.meta.url)));
const metadata = JSON.parse(fs.readFileSync(new URL('../src/data/metadata.json', import.meta.url)));
const movieMap = new Map(movies.map(movie => [movie.id, movie]));
assert.equal(movieMap.size, movies.length, 'Duplicate movie identifiers');
assert.equal(new Set(prompts.map(prompt => prompt.id)).size, prompts.length, 'Duplicate prompts');
for (const movie of movies) {
  assert.match(movie.id, /^Q\d+$/);
  assert.ok(movie.title && !/^Q\d+$/.test(movie.title), `Missing English title: ${movie.id}`);
  assert.match(movie.wiki, /^https:\/\/en\.wikipedia\.org\/wiki\//);
  assert.ok(movie.runtime >= 40, `Short film: ${movie.title}`);
  assert.ok(movie.year >= 1888 && movie.year <= 2026);
  assert.ok(Number.isFinite(movie.weight) && movie.weight > 0);
  assert.ok(['wikipedia-pageviews', 'wikidata-sitelinks-fallback'].includes(movie.weightSource));
}
for (const prompt of prompts) {
  assert.ok(prompt.movieIds.length >= 30, `Too few answers: ${prompt.id}`);
  assert.ok(prompt.movieIds.length <= 2000, `Too broad for launch: ${prompt.id}`);
  assert.equal(new Set(prompt.movieIds).size, prompt.movieIds.length);
  for (const id of prompt.movieIds) assert.ok(movieMap.has(id), `${prompt.id}: unknown film ${id}`);
}
const categories = ['studio', 'decade', 'genre', 'country', 'runtime', 'cast', 'award'];
for (const category of categories) assert.ok(prompts.some(p => p.category === category), `Missing ${category}`);
assert.ok(prompts.filter(p => p.category === 'cast').length >= 30, 'At least 30 distinct actors required');
assert.equal(new Set(prompts.filter(p => p.category === 'cast').map(p => p.person)).size,
  prompts.filter(p => p.category === 'cast').length);
assert.equal(metadata.movies, movies.length);
assert.equal(metadata.prompts, prompts.length);
const counts = Object.fromEntries(categories.map(category => [category, prompts.filter(p => p.category === category).length]));
const quality = prompts.map(prompt => {
  const ranked = prompt.movieIds.map(id => movieMap.get(id)).sort((a,b) => b.weight - a.weight);
  const total = ranked.reduce((sum, movie) => sum + movie.weight, 0);
  return {
    id: prompt.id,
    answers: ranked.length,
    topThreePriorShare: Number((ranked.slice(0,3).reduce((sum,movie)=>sum+movie.weight,0)/total).toFixed(4)),
    rarestPriorShare: Number((ranked.at(-1).weight/total).toFixed(7)),
    measured: ranked.filter(movie => movie.weightSource === 'wikipedia-pageviews').length,
  };
});
fs.writeFileSync(new URL('../src/data/quality.json', import.meta.url), JSON.stringify(quality, null, 2)+'\n');
const schedule = Array.from({length:30},(_,day)=>{
  const date=new Date(Date.UTC(2026,9,30+day)).toISOString().slice(0,10);
  const promptIds=categories.map((category,slot)=>{
    const pool=prompts.filter(prompt=>prompt.category===category);
    return pool[(day+(category==='cast'?0:slot*11))%pool.length].id;
  });
  return {date,promptIds};
});
assert.equal(new Set(schedule.map(day=>day.promptIds[5])).size,30,'Actor repeats within 30-day launch schedule');
fs.writeFileSync(new URL('../src/data/schedule.json', import.meta.url),JSON.stringify(schedule,null,2)+'\n');
console.log(JSON.stringify({movies:movies.length,prompts:prompts.length,categories:counts,
  minimumAnswers:Math.min(...quality.map(p=>p.answers)),measuredMovies:metadata.measuredMovies,
  fallbackMovies:metadata.fallbackMovies,reviewStatus:metadata.reviewStatus},null,2));
