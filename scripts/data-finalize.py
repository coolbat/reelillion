#!/usr/bin/env python3
"""Finalize an interrupted refresh from the on-disk CC0 snapshot and caches.

No network requests. Useful when the provider imposes HTTP 429 during refresh.
"""
import datetime as dt
import importlib.util
import json
import pathlib
import re
import sys
sys.dont_write_bytecode=True

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'src/data'
spec=importlib.util.spec_from_file_location('refresh',ROOT/'scripts/data-refresh.py')
refresh=importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)
movies=json.loads((OUT/'movies.json').read_text())
prompts=json.loads((OUT/'prompts.json').read_text())
facts=json.loads((OUT/'facts.json').read_text())
movie_ids={movie['id'] for movie in movies}
if set(facts)!=movie_ids:
    missing=sorted(movie_ids-set(facts))
    extra=sorted(set(facts)-movie_ids)
    raise SystemExit('facts.json does not cover this exact movie snapshot; '
        f'missing={missing[:10]}, extra={extra[:10]}. Run data-refresh.py to fetch '
        'facts for every current movie; do not reuse an older facts file.')
previous_metadata=json.loads((OUT/'metadata.json').read_text()) if (OUT/'metadata.json').exists() else {}
observations={}
for movie in movies:
    movie.update(facts.get(movie['id'],{}))
    path=ROOT/'.data-cache'/('pv-'+movie['id']+'.json')
    if path.exists():
        values=json.loads(path.read_text()).get('items',[])
        if len(values)==12:
            observations[movie['id']]=values
            movie['annualPageviews']=sum(int(row['views']) for row in values)
            movie['pageviewMonths']=len(values)
        else:
            movie['annualPageviews']=None
            movie['pageviewMonths']=len(values)
    else:
        movie['annualPageviews']=None
        movie['pageviewMonths']=0
measured=sorted(movie['annualPageviews'] for movie in movies if movie['annualPageviews'] is not None)
median=measured[len(measured)//2] if measured else 100000
aliases={
    'The Lord of the Rings: The Fellowship of the Ring':['LOTR','Fellowship of the Ring'],
    'The Lord of the Rings: The Two Towers':['LOTR 2','The Two Towers'],
    'The Lord of the Rings: The Return of the King':['LOTR 3','Return of the King'],
    'Terminator 2: Judgment Day':['T2','Terminator 2'],
    'The Empire Strikes Back':['ESB','Star Wars Episode V'],
    'Star Wars: Episode V – The Empire Strikes Back':['ESB','The Empire Strikes Back','Star Wars Episode V'],
    'Star Wars: Episode IV – A New Hope':['Star Wars','A New Hope','ANH','Star Wars Episode IV'],
    'Star Wars: Episode VI – Return of the Jedi':['Return of the Jedi','ROTJ','Star Wars Episode VI'],
    'Amélie':['Amelie','Le Fabuleux Destin d’Amélie Poulain'],
    'Parasite':['Gisaengchung'],
    'Spirited Away':['Sen to Chihiro no Kamikakushi'],
    'My Neighbor Totoro':['Tonari no Totoro','My Neighbour Totoro'],
    'Crouching Tiger, Hidden Dragon':['Wo hu cang long'],
    'Everything Everywhere All at Once':['EEAAO'],
}
for movie in movies:
    if movie['annualPageviews'] is not None:
        movie['weight']=max(1,movie['annualPageviews'])
        movie['weightSource']='wikipedia-pageviews'
    else:
        movie['weight']=max(1,round(median*(max(movie['sitelinks'],1)/30)**2))
        movie['weightSource']='wikidata-sitelinks-fallback'
    movie['aliases']=list(dict.fromkeys(movie.get('aliases',[])+aliases.get(movie['title'],[])))

movie_index={movie['id']:movie for movie in movies}
for prompt in prompts:
    if prompt['id']=='genre-drama':
        prompt['text']='Name a drama movie released before 2000.'
        prompt['description']='A feature-length film classified as drama on Wikidata and first released before 2000.'
        prompt['movieIds']=[qid for qid in prompt['movieIds'] if movie_index[qid]['year']<2000]

# Correctly sourced studio conditions can be built from facts already fetched
# for the full catalogue, even if no separate studio seed query was admitted.
definitions=refresh.definitions()
for definition in definitions:
    if definition['category']!='studio' or any(p['id']==definition['id'] for p in prompts):
        continue
    target=re.search(r'wd:(Q\d+)',definition['condition']).group(1)
    ids=[movie['id'] for movie in movies if target in movie.get('studios',[])]
    if len(ids)>=30:
        prompts.append({key:value for key,value in definition.items() if key not in ['condition','limit']}|{'movieIds':ids})

provenance=json.loads((OUT/'provenance.json').read_text())
for source in provenance:
    prompt=next((p for p in prompts if p['id']==source['id']),None)
    if prompt: source['catalogueAnswerCount']=len(prompt['movieIds'])
    if source['id'] in ['studio-dreamworks-animation','studio-studio-ghibli']:
        definition=next(d for d in definitions if d['id']==source['id'])
        source['query']=definition['condition']
        source['method']='Full-catalogue P272 facts; seed source ID corrected before release.'
        target=re.search(r'wd:(Q\d+)',definition['condition']).group(1)
        source['answerCount']=sum(target in movie.get('studios',[]) for movie in movies)
metadata={
    'generatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),
    'license':'Wikidata structured facts and Wikimedia pageview metrics: CC0.',
    'pageviewStart':'2025-10-01','pageviewEnd':'2026-09-30','pageviewMonths':12,
    'movies':len(movies),'prompts':len(prompts),'measuredMovies':len(measured),
    'fallbackMovies':len(movies)-len(measured),'fallbackMedianMeasuredAnnualViews':median,
    'pageviewFetchStatus':previous_metadata.get('pageviewFetchStatus',
        'Offline finalization from cached observations; live provider status unverified.'),
    'sources':['https://www.wikidata.org/wiki/Wikidata:Licensing',
        'https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/access-policy.html'],
    'reviewStatus':'Automated factual checks and source-condition review; independent human editorial review and player calibration pending.',
    'limitations':[
        'A supported catalogue snapshot, not an exhaustive list of every film ever made.',
        'All known catalogue movies are checked against genre/country/studio/award facts, beyond bounded discovery queries.',
        'Most initial weights use Wikidata sitelink counts because Wikimedia pageviews imposed HTTP 429.',
        'Estimated familiarity is not a player selection percentage or score percentile.',
        'Runtime, release year and genre inherit Wikidata source ambiguity.',
        'Full holiday editions and seven-round premium themed packs are not available.',
    ],
}
if previous_metadata.get('catalogueCorrection'):
    metadata['catalogueCorrection']=previous_metadata['catalogueCorrection']
for name,value,indent in [('movies',movies,None),('prompts',prompts,None),
                         ('provenance',provenance,2),('metadata',metadata,2),('pageviews',observations,None)]:
    (OUT/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,
        indent=indent,separators=(',',':') if indent is None else None)+'\n')
print(json.dumps(metadata,indent=2))
