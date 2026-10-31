#!/usr/bin/env python3
"""Bounded international-film correction; never calls the pageview provider.

Fetches only missing films from the 50-title regression manifest, plus type
ancestry and actor-credit audit queries. Existing prompt IDs/order are frozen.
"""
import concurrent.futures
import datetime as dt
import importlib.util
import json
import pathlib
import re
import subprocess
import sys
import urllib.parse
sys.dont_write_bytecode=True
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'src/data'
spec=importlib.util.spec_from_file_location('refresh',ROOT/'scripts/data-refresh.py')
refresh=importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)
PATHS=[
    'Spirited_Away','My_Neighbor_Totoro','Princess_Mononoke',"Howl's_Moving_Castle_(film)",
    'Nausicaä_of_the_Valley_of_the_Wind_(film)','Castle_in_the_Sky',"Kiki's_Delivery_Service",
    'Porco_Rosso','Ponyo','The_Wind_Rises','The_Tale_of_the_Princess_Kaguya_(film)',
    'Grave_of_the_Fireflies','Only_Yesterday_(1991_film)','Whisper_of_the_Heart',
    'The_Boy_and_the_Heron','Your_Name','Akira_(1988_film)','Perfect_Blue',
    'Paprika_(2006_film)','Ghost_in_the_Shell_(1995_film)','A_Silent_Voice_(film)',
    'Weathering_with_You','Suzume','Millennium_Actress','Tokyo_Godfathers',
    'A_Separation','Come_and_See','The_Lives_of_Others','Amour_(2012_film)',
    'The_Hunt_(2012_film)','Another_Round','The_Handmaiden','Mother_(2009_film)',
    'Memories_of_Murder','Burning_(2018_film)','Train_to_Busan','The_Wailing_(2016_film)',
    'The_Secret_in_Their_Eyes','Cinema_Paradiso','Life_Is_Beautiful','The_Intouchables',
    "Pan's_Labyrinth",'City_of_God_(2002_film)','The_400_Blows','8½',
    'Persona_(1966_film)','The_Seventh_Seal','Wild_Strawberries_(film)',
    'The_Color_of_Pomegranates','Taste_of_Cherry',
]
FIELDS={'P31':'instances','P136':'genres','P495':'countries','P272':'studios','P166':'awards'}

def load(name): return json.loads((OUT/(name+'.json')).read_text())
def write(name,value):
    compact=name in ['movies','facts','prompts']
    (OUT/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,
        indent=None if compact else 2,separators=(',',':') if compact else None)+'\n')
def article_key(url): return urllib.parse.unquote(url.split('/wiki/')[-1])

def fetch(paths):
    articles=' '.join('<https://en.wikipedia.org/wiki/'+urllib.parse.quote(path,safe='()_')+'>' for path in paths)
    query='''SELECT DISTINCT ?article ?film ?label ?property ?value ?links WHERE {
      VALUES ?article { '''+articles+''' } ?article schema:about ?film.
      ?film wdt:P31/wdt:P279* wd:Q11424; wikibase:sitelinks ?links.
      VALUES ?property { wdt:P31 wdt:P136 wdt:P495 wdt:P272 wdt:P166 wdt:P577 wdt:P2047 }
      ?film ?property ?value. OPTIONAL {?film rdfs:label ?label. FILTER(LANG(?label)="en")}
      FILTER NOT EXISTS { ?film wdt:P31/wdt:P279* wd:Q5398426. }
      FILTER NOT EXISTS { ?film wdt:P31/wdt:P279* wd:Q1259759. }
      FILTER NOT EXISTS { ?film wdt:P31/wdt:P279* wd:Q1983062. }
      FILTER NOT EXISTS { ?film wdt:P31/wdt:P279* wd:Q24862. }
    }'''
    return query,refresh.sparql(query)

def main():
    movies=load('movies'); prompts=load('prompts'); facts=load('facts'); metadata=load('metadata')
    order=[prompt['id'] for prompt in prompts]
    known={article_key(movie['wiki']) for movie in movies}
    missing=[path for path in PATHS if path not in known]
    audit=[]; entities={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for query,rows in pool.map(fetch,[missing[i:i+4] for i in range(0,len(missing),4)]):
            audit.append({'query':query,'rows':rows})
            for row in rows:
                qid=row['film']['value'].split('/')[-1]
                entity=entities.setdefault(qid,{'id':qid,'wiki':row['article']['value'],
                    'title':row.get('label',{}).get('value',article_key(row['article']['value']).replace('_',' ')),
                    'sitelinks':int(row['links']['value']),'properties':{}})
                entity['properties'].setdefault(row['property']['value'].split('/')[-1],set()).add(row['value']['value'])
    seen={article_key(entity['wiki']) for entity in entities.values()}
    if set(missing)!=seen: raise RuntimeError('Unresolved manifest articles: '+repr(set(missing)-seen))
    median=metadata['fallbackMedianMeasuredAnnualViews']
    for entity in entities.values():
        properties=entity.pop('properties')
        assert properties.get('P31') and properties.get('P577') and properties.get('P2047'),entity
        runtime=max(float(value) for value in properties['P2047']); assert runtime>=40
        year=min(int(value[:4]) for value in properties['P577']); assert 1888<=year<=2026
        movie=entity|{'year':year,'runtime':runtime,'aliases':[], 'annualPageviews':None,
            'pageviewMonths':0,'weightSource':'wikidata-sitelinks-fallback',
            'weight':max(1,round(median*(max(entity['sitelinks'],1)/30)**2))}
        movie_facts={field:sorted(value.split('/')[-1] for value in properties.get(prop,[]))
            for prop,field in FIELDS.items()}
        facts[movie['id']]=movie_facts; movie.update(movie_facts); movies.append(movie)
    index={movie['id']:movie for movie in movies}
    assert set(facts)==set(index),'Each new entity must have its own freshly fetched facts.'
    definitions={definition['id']:definition for definition in refresh.definitions()}
    roots={re.search(r'wd:(Q\d+)',definition['condition']).group(1)
        for definition in definitions.values() if definition['category']=='genre'}|{'Q11424','Q202866','Q24862'}
    types=sorted({kind for movie in movies for kind in movie.get('instances',[])+movie.get('genres',[])})
    ancestors={kind:set() for kind in types}; ancestor_queries=[]
    for offset in range(0,len(types),35):
        query='SELECT DISTINCT ?kind ?root WHERE { VALUES ?kind { '+' '.join('wd:'+kind for kind in types[offset:offset+35])+' } VALUES ?root { '+' '.join('wd:'+root for root in sorted(roots))+' } ?kind wdt:P279* ?root. }'
        ancestor_queries.append(query)
        for row in refresh.sparql(query):
            ancestors[row['kind']['value'].split('/')[-1]].add(row['root']['value'].split('/')[-1])
    removed=[movie['id'] for movie in movies if any('Q24862' in ancestors[kind] for kind in movie.get('instances',[]))]
    movies=[movie for movie in movies if movie['id'] not in removed]
    facts={qid:value for qid,value in facts.items() if qid not in removed}
    index={movie['id']:movie for movie in movies}
    for movie in movies:
        movie['instanceAncestors']=sorted({root for kind in movie.get('instances',[]) for root in ancestors[kind]})
        facts[movie['id']]['instanceAncestors']=movie['instanceAncestors']
    for entity in entities.values(): assert 'Q11424' in index[entity['id']]['instanceAncestors']
    for prompt in prompts:
        prompt['movieIds']=[qid for qid in prompt['movieIds'] if qid in index]
        category=prompt['category']; candidates=set()
        if category in ['genre','country','studio','award']:
            target=re.search(r'wd:(Q\d+)',definitions[prompt['id']]['condition']).group(1)
            field={'genre':'genres','country':'countries','studio':'studios','award':'awards'}[category]
            for movie in movies:
                fits=target in movie.get(field,[])
                if category=='genre':
                    fits=fits or any(target in ancestors[kind] for kind in movie.get('genres',[]))
                    if target=='Q202866': fits=fits or target in movie['instanceAncestors']
                    if prompt['id']=='genre-drama': fits=fits and movie['year']<2000
                if fits: candidates.add(movie['id'])
        elif category=='decade':
            year=int(prompt['id'].split('-')[1]); candidates={movie['id'] for movie in movies if year<=movie['year']<year+10}
        elif category=='runtime':
            candidates={movie['id'] for movie in movies if
                (prompt['id']=='runtime-under-90' and 40<=movie['runtime']<90) or
                (prompt['id']=='runtime-over-120' and movie['runtime']>120) or
                (prompt['id']=='runtime-over-150' and movie['runtime']>150)}
        else:
            continue # Independent P161|P725 audit follows below.
        assert 30<=len(candidates)<=2000,(prompt['id'],len(candidates))
        prompt['movieIds']=sorted(candidates)
    assert [prompt['id'] for prompt in prompts]==order
    aliases={'Spirited Away':['Sen to Chihiro no Kamikakushi'],
        'My Neighbor Totoro':['Tonari no Totoro','My Neighbour Totoro'],
        'Princess Mononoke':['Mononoke Hime'],'Your Name':['Kimi no Na wa'],
        "Howl's Moving Castle":['Hauru no Ugoku Shiro']}
    for movie in movies: movie['aliases']=list(dict.fromkeys(movie['aliases']+aliases.get(movie['title'],[])))
    metadata.update({'generatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),
        'movies':len(movies),'fallbackMovies':sum(movie['weightSource']=='wikidata-sitelinks-fallback' for movie in movies),
        'measuredMovies':sum(movie['weightSource']=='wikipedia-pageviews' for movie in movies),
        'catalogueCorrection':'Replaced direct-class allowlist with film/animated-film subclass closure; added missing international manifest films with complete per-entity facts. No pageview requests.'})
    write('movies',sorted(movies,key=lambda movie:movie['id'])); write('facts',facts); write('prompts',prompts);write('metadata',metadata)
    write('required-movies',[{'wiki':'https://en.wikipedia.org/wiki/'+urllib.parse.quote(path,safe='()_')} for path in PATHS])
    write('type-ancestors',{kind:sorted(values) for kind,values in ancestors.items()})
    write('coverage-correction',{'fetchedAt':metadata['generatedAt'],'addedMovies':len(entities),
        'addedIds':sorted(entities),'sourceQueries':audit,'ancestorQueries':ancestor_queries,
        'removedShortFilmIds':removed,'fixedPromptOrder':order,'pageviewRequests':0})
    write('pageviews',{qid:value for qid,value in load('pageviews').items() if qid in index})
    if '--skip-credit-audit' not in sys.argv:
        subprocess.run([sys.executable,str(ROOT/'scripts/data-voice-credits.py')],check=True)
    assert [prompt['id'] for prompt in load('prompts')]==order
    print(json.dumps({'movies':len(movies),'added':len(entities),'manifest':len(PATHS),'prompts':len(prompts),'pageviewRequests':0}),flush=True)

if __name__=='__main__': main()
