#!/usr/bin/env python3
"""Rebuild the CC0 Wikidata movie catalogue and Wikimedia popularity priors.

Only title-level facts are stored; Wikipedia prose, posters, IMDb and TMDB are
not imported. Network responses are cached so a failed run can be resumed.
"""
import concurrent.futures
import datetime as dt
import hashlib
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request
import urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/data'
CACHE = ROOT / '.data-cache'
UA = 'Reelillion/1.0 (public movie trivia; https://reelillion.com)'
PAGEVIEWS_THROTTLED = False
ACTORS = [
    'Tom Hanks', 'Meryl Streep', 'Samuel L. Jackson', 'Morgan Freeman',
    'Robert De Niro', 'Al Pacino', 'Denzel Washington', 'Cate Blanchett',
    'Tilda Swinton', 'Nicole Kidman', 'Julianne Moore', 'Sigourney Weaver',
    'Susan Sarandon', 'Jack Nicholson', 'Bruce Willis', 'Nicolas Cage',
    'Keanu Reeves', 'Matt Damon', 'Brad Pitt', 'Anthony Hopkins',
    'Michael Caine', 'Judi Dench', 'Maggie Smith', 'Johnny Depp',
    'Michelle Yeoh', 'Jackie Chan', 'Kate Winslet', 'Willem Dafoe',
    'Emma Thompson', 'Dustin Hoffman', 'Cary Grant', 'Clint Eastwood',
    'Harrison Ford', 'Gene Hackman', 'John Goodman', 'Jeff Bridges',
]


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def request_json(url, cache_key, retries=4):
    path = CACHE / (cache_key + '.json')
    if path.exists():
        return json.loads(path.read_text())
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=75) as response:
                value = json.load(response)
            path.write_text(json.dumps(value, ensure_ascii=False))
            return value
        except Exception as error:
            if isinstance(error,urllib.error.HTTPError) and error.code==429:
                raise error
            if attempt + 1 == retries:
                raise error
            time.sleep(1 + attempt * 2)


def sparql(query):
    digest = hashlib.sha256(query.encode()).hexdigest()
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': query, 'format': 'json'})
    return request_json(url, 'wd-' + digest)['results']['bindings']


def movie_query(condition, limit=300):
    # Minimum duration is explicit. Exclude television series/miniseries and
    # episodes both by Wikidata class and by unambiguous article disambiguators.
    if 'wdt:P161' in condition:
        return '''SELECT ?film ?filmLabel ?article (MIN(?date) AS ?released)
        (MAX(?duration) AS ?runtime) (MAX(?links) AS ?sitelinks) WHERE {
        ?film wdt:P31/wdt:P279* wd:Q11424; wdt:P577 ?date;
            wdt:P2047 ?duration; wikibase:sitelinks ?links.
        FILTER(?duration >= 40)
        ''' + condition + '''
        ?article schema:about ?film; schema:isPartOf <https://en.wikipedia.org/>.
        FILTER(!REGEX(STR(?article), "miniseries|television_series|TV_series|episode", "i"))
        FILTER NOT EXISTS { ?film wdt:P31/wdt:P279* wd:Q5398426. }
        FILTER NOT EXISTS { ?film wdt:P31/wdt:P279* wd:Q1259759. }
        FILTER NOT EXISTS { ?film wdt:P31/wdt:P279* wd:Q1983062. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } GROUP BY ?film ?filmLabel ?article ORDER BY DESC(?sitelinks) LIMIT ''' + str(limit)
    # Bounded direct types keep broad queries within the public endpoint budget;
    # release dates and runtimes are consolidated locally, not by a huge GROUP BY.
    return '''SELECT DISTINCT ?film ?article ?date ?duration ?links WHERE {
        ''' + condition.replace('wdt:P136/wdt:P279*','wdt:P136') + '''
        ?film wdt:P31 ?kind; wdt:P577 ?date;
            wdt:P2047 ?duration; wikibase:sitelinks ?links.
        VALUES ?kind { wd:Q11424 wd:Q24869 wd:Q202866 wd:Q506240 wd:Q93204 }
        FILTER(?duration >= 40)
        ?article schema:about ?film; schema:isPartOf <https://en.wikipedia.org/>.
        FILTER(!REGEX(STR(?article), "miniseries|television_series|TV_series|episode|Holiday_Special", "i"))
    } ORDER BY DESC(?links) LIMIT ''' + str(limit*5)


def definitions():
    result = []
    for name in ACTORS:
        article = 'https://en.wikipedia.org/wiki/' + urllib.parse.quote(name.replace(' ', '_'))
        result.append({
            'id': 'cast-' + slug(name), 'text': 'Name a movie starring ' + name + '.',
            'category': 'cast', 'description': 'A feature-length film crediting ' + name + ' in its cast or as a voice actor.',
            'condition': '<' + article + '> schema:about ?person. ?film (wdt:P161|wdt:P725) ?person.',
            'person': name, 'limit': 500,
        })
    for name, qid, tags in [
        ('horror', 'Q200092', ['horror']), ('science fiction', 'Q471839', []),
        ('comedy', 'Q157443', []), ('drama', 'Q130232', []),
        ('romantic comedy', 'Q860626', []), ('fantasy', 'Q157394', []),
        ('musical', 'Q842256', []), ('western', 'Q172980', []),
        ('animated', 'Q202866', ['anime']),
    ]:
        result.append({'id': 'genre-' + slug(name), 'text': 'Name ' + ('an ' if name == 'animated' else 'a ') + name + ' movie' + (' released before 2000.' if name == 'drama' else '.'),
            'category': 'genre', 'description': 'A feature-length film classified as ' + name + ' on Wikidata.',
            'condition': '?film wdt:P136/wdt:P279* wd:' + qid + '.', 'packs': tags})
    for country, qid in [('Japan','Q17'),('France','Q142'),('India','Q668'),
                          ('Italy','Q38'),('Germany','Q183'),('United Kingdom','Q145')]:
        result.append({'id':'country-'+slug(country), 'text':'Name a movie produced in '+country+'.',
            'category':'country', 'description':'A feature-length film listing '+country+' as a country of origin.',
            'condition':'?film wdt:P495 wd:'+qid+'.'})
    for name, qid, tags in [
        ('Academy Award for Best Picture','Q102427',['oscars']),
        ("Palme d’Or",'Q179808',[]),
    ]:
        result.append({'id':'award-'+slug(name),'text':'Name a movie that won the '+name+'.',
            'category':'award','description':'A feature-length film with a recorded win for this award.',
            'condition':'?film wdt:P166 wd:'+qid+'.','packs':tags,'limit':400})
    for name, qid, tags in [('Pixar','Q127552',['disney']),
                             ('Walt Disney Pictures','Q191224',['disney']),
                             ('DreamWorks Animation','Q500088',[]),
                             ('Studio Ghibli','Q182950',['anime'])]:
        result.append({'id':'studio-'+slug(name),'text':'Name a movie produced by '+name+'.',
            'category':'studio','description':'A feature-length film listing '+name+' as a production company.',
            'condition':'?film wdt:P272 wd:'+qid+'.','packs':tags,'limit':400})
    return result


def fetch_prompt(definition):
    definition = dict(definition)
    query = movie_query(definition['condition'], definition.get('limit', 240))
    try:
        rows = sparql(query)
        if rows and 'date' in rows[0]:
            merged={}
            for row in rows:
                qid=row['film']['value']
                if qid not in merged:
                    merged[qid]={'film':row['film'],'article':row['article'],
                        'released':row['date'],'runtime':row['duration'],'sitelinks':row['links']}
                else:
                    current=merged[qid]
                    if row['date']['value']<current['released']['value']: current['released']=row['date']
                    if float(row['duration']['value'])>float(current['runtime']['value']): current['runtime']=row['duration']
            rows=list(merged.values())[:definition.get('limit',240)]
        print(definition['id'], len(rows), flush=True)
        return definition, rows, query
    except Exception as error:
        print('FAILED', definition['id'], str(error), flush=True)
        return definition, [], query


def pageviews(movie):
    global PAGEVIEWS_THROTTLED
    article = urllib.parse.unquote(movie['wiki'].split('/wiki/')[-1])
    encoded = urllib.parse.quote(article, safe='')
    # Last twelve complete calendar months, ending September 2026.
    url = ('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/'
        'en.wikipedia/all-access/user/' + encoded + '/monthly/20251001/20260901')
    try:
        if PAGEVIEWS_THROTTLED and not (CACHE/('pv-'+movie['id']+'.json')).exists():
            return movie['id'],None,0
        values = request_json(url, 'pv-' + movie['id'], retries=2)['items']
        if len(values)!=12:
            return movie['id'],None,len(values)
        return movie['id'], sum(int(x['views']) for x in values), len(values)
    except Exception as error:
        if isinstance(error,urllib.error.HTTPError) and error.code==429:
            PAGEVIEWS_THROTTLED=True
            print('Wikimedia HTTP 429: stopping further uncached pageview requests.',flush=True)
        return movie['id'], None, 0


def enrich_catalogue(movies, prompts):
    """Classify EVERY known movie, not only the top rows of each seed query.

    This is essential: a movie discovered through a cast query must never be
    marked wrong for a genre merely because the genre seed query was bounded.
    """
    ids=list(movies)
    properties={'P136':'genres','P495':'countries','P272':'studios','P166':'awards','P31':'instances'}
    def batch_facts(batch):
        values=' '.join('wd:'+qid for qid in batch)
        query='SELECT DISTINCT ?film ?property ?value WHERE { VALUES ?film { '+values+' } VALUES ?property { '+ ' '.join('wdt:'+p for p in properties)+' } ?film ?property ?value. }'
        return sparql(query)
    batches=[ids[i:i+40] for i in range(0,len(ids),40)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for i,rows in enumerate(pool.map(batch_facts,batches)):
            for row in rows:
                qid=row['film']['value'].split('/')[-1]
                prop=row['property']['value'].split('/')[-1]
                if qid in movies and prop in properties:
                    movies[qid].setdefault(properties[prop],[]).append(row['value']['value'].split('/')[-1])
            if i%20==0: print('classify',i,'/',len(batches),flush=True)
    genre_ids=sorted({qid for movie in movies.values() for qid in movie.get('genres',[])})
    genre_targets={definition['id']:re.search(r'wd:(Q\d+)',definition['condition']).group(1)
        for definition in definitions() if definition['category']=='genre'}
    roots=' '.join('wd:'+qid for qid in set(genre_targets.values()))
    ancestors={}
    for start in range(0,len(genre_ids),40):
        values=' '.join('wd:'+qid for qid in genre_ids[start:start+40])
        query='SELECT DISTINCT ?genre ?root WHERE { VALUES ?genre { '+values+' } VALUES ?root { '+roots+' } ?genre wdt:P279* ?root. }'
        for row in sparql(query):
            ancestors.setdefault(row['genre']['value'].split('/')[-1],set()).add(row['root']['value'].split('/')[-1])
    definitions_by_id={definition['id']:definition for definition in definitions()}
    for prompt in prompts:
        if prompt['category'] not in ['genre','country','studio','award']:
            continue
        definition=definitions_by_id[prompt['id']]
        target=re.search(r'wd:(Q\d+)',definition['condition']).group(1)
        field={'genre':'genres','country':'countries','studio':'studios','award':'awards'}[prompt['category']]
        existing=set(prompt['movieIds'])
        for movie in movies.values():
            qualifies=target in movie.get(field,[])
            if field=='genres':
                qualifies=qualifies or any(target in ancestors.get(genre,set()) for genre in movie.get('genres',[]))
                if target=='Q202866': qualifies=qualifies or target in movie.get('instances',[])
            if prompt['id']=='genre-drama' and movie['year']>=2000:
                qualifies=False
            if qualifies: existing.add(movie['id'])
        if prompt['id']=='genre-drama':
            existing={qid for qid in existing if movies[qid]['year']<2000}
        prompt['movieIds']=sorted(existing)
    return prompts


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    movies = {}
    prompts = []
    provenance = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for definition, rows, query in pool.map(fetch_prompt, definitions()):
            ids = []
            for row in rows:
                qid = row['film']['value'].split('/')[-1]
                article = row['article']['value']
                if article.endswith('/Star_Wars_Holiday_Special'):
                    continue  # A television variety special, not a feature film.
                # Some items have no English label: canonical enwiki article
                # titles preserve the actual title and only lose disambiguation.
                article_title = urllib.parse.unquote(article.split('/wiki/')[-1]).replace('_', ' ')
                fallback = re.sub(r' \((?:\d{4} )?(?:film|American film|British film|Japanese film)\)$', '', article_title)
                label = row.get('filmLabel', {}).get('value', fallback)
                title = fallback if re.fullmatch(r'Q\d+', label) else label
                year = int(row['released']['value'][:4])
                if year < 1888 or year > 2026:
                    continue
                ids.append(qid)
                if qid not in movies:
                    movies[qid] = {'id':qid, 'title':title, 'year':year, 'aliases':[], 'wiki':article,
                        'sitelinks':int(row['sitelinks']['value']),
                        'runtime':float(row['runtime']['value']), 'weight':1}
            ids = list(dict.fromkeys(ids))
            provenance.append({'id':definition['id'],'answerCount':len(ids),'query':query})
            if len(ids) >= 30:
                prompts.append({key:value for key,value in definition.items()
                    if key not in ['condition','limit']} | {'movieIds':ids})
    prompts=enrich_catalogue(movies,prompts)
    facts={qid:{key:value for key,value in movie.items()
        if key in ['genres','countries','studios','awards','instances']}
        for qid,movie in movies.items()}
    (OUT/'facts.json').write_text(json.dumps(facts,ensure_ascii=False,separators=(',',':'))+'\n')
    for decade in range(1930,2030,10):
        ids = [m['id'] for m in movies.values() if decade <= m['year'] < decade+10]
        if len(ids)>=30:
            prompts.append({'id':f'decade-{decade}', 'text':f'Name a movie released in the {decade}s.',
                'category':'decade','description':f'A feature-length movie first released from {decade} to {decade+9}.',
                'movieIds':ids,'packs':['90s'] if decade == 1990 else []})
    for name, condition, text in [
        ('under-90',lambda m:40<=m['runtime']<90,'Name a movie shorter than 90 minutes.'),
        ('over-120',lambda m:m['runtime']>120,'Name a movie longer than two hours.'),
        ('over-150',lambda m:m['runtime']>150,'Name a movie longer than two and a half hours.'),
    ]:
        ids=[m['id'] for m in movies.values() if condition(m)]
        if len(ids)>=30:
            prompts.append({'id':'runtime-'+name,'text':text,'category':'runtime',
                'description':'Use the longest runtime listed in the Wikidata snapshot; cuts can differ.', 'movieIds':ids})
    # Keep independently checkable facts before expensive popularity requests.
    values=sorted(movies.values(),key=lambda m:m['id'])
    (OUT/'movies.json').write_text(json.dumps(values,ensure_ascii=False,separators=(',',':'))+'\n')
    (OUT/'prompts.json').write_text(json.dumps(prompts,ensure_ascii=False,separators=(',',':'))+'\n')
    (OUT/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
    print('FETCHING PAGEVIEWS',len(values),flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        for i,(qid,views,months) in enumerate(pool.map(pageviews,values)):
            movies[qid]['annualPageviews']=views
            movies[qid]['pageviewMonths']=months
            if i%100==0: print('pageviews',i,'/',len(values),flush=True)
    good_views=[m['annualPageviews'] for m in values if m.get('annualPageviews') is not None]
    # Sitelink fallback is deliberately labelled and stays on the same order of
    # magnitude as the observed population median.
    median=sorted(good_views)[len(good_views)//2] if good_views else 100000
    for m in values:
        if m.get('annualPageviews') is not None:
            m['weight']=max(1,m['annualPageviews'])
            m['weightSource']='wikipedia-pageviews'
        else:
            m['weight']=max(1,round(median*(max(m['sitelinks'],1)/30)**2))
            m['weightSource']='wikidata-sitelinks-fallback'
        aliases = {
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
        m['aliases']=aliases.get(m['title'],[])
    (OUT/'movies.json').write_text(json.dumps(values,ensure_ascii=False,separators=(',',':'))+'\n')
    metadata={'generatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),
        'license':'Wikidata structured facts: CC0. Wikimedia pageview metrics: CC0.',
        'pageviewStart':'2025-10-01','pageviewEnd':'2026-09-30',
        'pageviewMonths':12,'movies':len(values),'prompts':len(prompts),
        'measuredMovies':len(good_views),'fallbackMovies':len(values)-len(good_views),
        'fallbackMedianMeasuredAnnualViews':median,
        'pageviewFetchStatus':'Partial: provider returned HTTP 429; uncached requests stopped.' if PAGEVIEWS_THROTTLED else 'Completed supported requests; per-movie source tags describe failures.',
        'sources':['https://www.wikidata.org/wiki/Wikidata:Licensing',
            'https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/'],
        'reviewStatus':'Automated factual checks passed; independent human editorial review pending.',
        'limitations':['Catalogue is a bounded snapshot, not every film ever made.',
            'Broad queries take up to 240 films by sitelink count; actor filmographies take up to 500.',
            'Runtime and genre classifications inherit Wikidata omissions and disagreements.',
            'View-based priors are estimates of familiarity, never real player selection percentages.',
            'Past daily prompt statistics require retained production D1 data; priors alone are not historical player data.']}
    (OUT/'metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    observations={}
    for movie in values:
        cache_path=CACHE/('pv-'+movie['id']+'.json')
        if movie.get('annualPageviews') is not None and cache_path.exists():
            observations[movie['id']]=json.loads(cache_path.read_text())['items']
    (OUT/'pageviews.json').write_text(json.dumps(observations,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps(metadata,indent=2),flush=True)


if __name__=='__main__':
    main()
