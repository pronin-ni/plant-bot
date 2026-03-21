import json, random, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
BASE='http://127.0.0.1:8081'

def req(path, method='GET', payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    r = urllib.request.Request(BASE+path, data=data, headers={'Content-Type':'application/json'}, method=method)
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            body=resp.read()
            return resp.status, body.decode() if body else ''
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return 0, str(e)

status, body = req('/api/plants')
print('seed status', status)
plants = json.loads(body) if status==200 else []
ids=[p['id'] for p in plants[:10]]
print('ids', ids)
errs=[]

def worker(i):
    out=[]
    end=time.time()+5
    while time.time()<end:
        s,b=req('/api/plants')
        if s!=200: out.append(('list',s,b))
        if ids:
            pid=random.choice(ids)
            s,b=req(f'/api/plants/{pid}')
            if s!=200: out.append(('detail',s,b))
    return out

with ThreadPoolExecutor(max_workers=20) as ex:
    futs=[ex.submit(worker,i) for i in range(20)]
    for f in as_completed(futs):
        errs.extend(f.result())
print('errors', len(errs))
for e in errs[:20]:
    print(e)
