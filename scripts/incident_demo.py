"""Trigger a real dev incident and wait for the independent responder to repair it."""
import json
import os
import time
import urllib.error
import urllib.request
base=os.environ.get('API_URL','http://127.0.0.1:8000').rstrip('/')
token=os.environ.get('OPS_TOKEN','local-demo-ops-token-change-before-hosting')
def get(path):
    with urllib.request.urlopen(base+path,timeout=10) as r: return json.load(r)
def main():
    before={i['id'] for i in get('/api/incidents')}
    req=urllib.request.Request(base+'/ops/fault',data=b'{"enabled":true}',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=10) as r:
        assert json.load(r)['enabled'] is True
    print('Fault enabled: dashboard should fail while health remains available.',flush=True)
    try: get('/api/dashboard')
    except urllib.error.HTTPError as e:
        assert e.code==503
    else: raise RuntimeError('The injected fault was not observed')
    for _ in range(60):
        reports=get('/api/incidents')
        report=next((i for i in reports if i['id'] not in before),None)
        if report and report['status']=='Resolved':
            assert get('/api/dashboard')['total']>=0
            print(json.dumps(report,indent=2));return
        if report and report['status']=='Needs attention':
            raise RuntimeError('Incident needs attention; inspect the incident report')
        time.sleep(2)
    raise RuntimeError('Timed out waiting for the independent checker/responder')
if __name__=='__main__': main()
