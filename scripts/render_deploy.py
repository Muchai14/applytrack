"""Deploy or roll back a Render service using credentials supplied as environment secrets."""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

def request(service, path, data=None):
    token = os.environ.get('RENDER_API_KEY', '')
    if not token or not re.fullmatch(r'srv-[a-z0-9]+', service):
        raise RuntimeError('Set RENDER_API_KEY and a valid RENDER_SERVICE_ID securely.')
    req = urllib.request.Request('https://api.render.com/v1/services/'+service+path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError('Render request failed with HTTP '+str(exc.code)) from None

def main():
    p=argparse.ArgumentParser()
    p.add_argument('action', choices=['deploy','rollback'])
    p.add_argument('--commit')
    p.add_argument('--deploy-id')
    args=p.parse_args()
    service=os.environ.get('RENDER_SERVICE_ID','')
    if args.action=='deploy':
        if not args.commit or not re.fullmatch(r'[a-f0-9]{40}',args.commit):
            p.error('--commit must be the full tested Git commit SHA')
        result=request(service,'/deploys',{'commitId':args.commit,'clearCache':'do_not_clear'})
    else:
        if not args.deploy_id or not re.fullmatch(r'dep-[a-z0-9]+',args.deploy_id):
            p.error('--deploy-id must be an existing Render deploy ID')
        result=request(service,'/rollback',{'deployId':args.deploy_id})
    deploy_id=result.get('id') or result.get('deploy',{}).get('id')
    if not deploy_id: raise RuntimeError('Render did not return a deploy ID')
    print('Deployment:',deploy_id,flush=True)
    # Sleep intervals are bounded; CI shows each status transition.
    previous=None
    for _ in range(120):
        status=request(service,'/deploys/'+deploy_id).get('status')
        if status!=previous: print('Status:',status,flush=True); previous=status
        if status=='live': return
        if status in {'build_failed','update_failed','pre_deploy_failed','canceled','deactivated'}:
            raise RuntimeError('Deployment did not become live: '+str(status))
        time.sleep(10)
    raise RuntimeError('Deployment timed out; inspect the saved deploy ID in Render.')
if __name__=='__main__':
    try: main()
    except Exception as e:
        print(str(e),file=sys.stderr);sys.exit(1)
