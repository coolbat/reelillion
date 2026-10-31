#!/usr/bin/env python3
"""Audit both onscreen and voice-acting credits across the supported catalogue."""
import concurrent.futures
import importlib.util
import json
import pathlib
import urllib.parse
import sys
sys.dont_write_bytecode=True

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'src/data'
spec=importlib.util.spec_from_file_location('refresh',ROOT/'scripts/data-refresh.py')
refresh=importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)
movies=json.loads((OUT/'movies.json').read_text())
known={movie['id'] for movie in movies}
prompts=json.loads((OUT/'prompts.json').read_text())
actors=[prompt for prompt in prompts if prompt['category']=='cast']

def fetch(prompt):
    article='https://en.wikipedia.org/wiki/'+urllib.parse.quote(prompt['person'].replace(' ','_'))
    query='SELECT DISTINCT ?film WHERE { <'+article+'> schema:about ?person. ?film (wdt:P161|wdt:P725) ?person. }'
    rows=refresh.sparql(query)
    ids=sorted({row['film']['value'].split('/')[-1] for row in rows}&known)
    return prompt['id'],{'person':prompt['person'],'query':query,'movieIds':ids}

credits={}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for qid,result in pool.map(fetch,actors):
        credits[qid]=result
        print(qid,len(result['movieIds']),flush=True)
for prompt in actors:
    prompt['movieIds']=sorted((set(prompt['movieIds'])|set(credits[prompt['id']]['movieIds']))&known)
    prompt['description']='A feature-length film crediting '+prompt['person']+' in the cast or as a voice actor.'
(OUT/'voice-credits.json').write_text(json.dumps(credits,ensure_ascii=False,indent=2)+'\n')
(OUT/'prompts.json').write_text(json.dumps(prompts,ensure_ascii=False,separators=(',',':'))+'\n')
print('Voice credits merged without changing the movie catalogue.',flush=True)
