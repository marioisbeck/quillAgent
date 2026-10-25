#!/usr/bin/env python3
"""Offline real-source route harness: no listener, network or production config.

Usage: python3 backend/tests/run-loopkind-retention.py OUTPUT_DIR SERVER_SCRIPTS
Reuses installed dependencies; runs ad-hoc node --test, not an npm runner.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys

backend=Path(__file__).resolve().parents[1]
root=Path(sys.argv[1]).resolve();root.mkdir(parents=True,exist_ok=False)
shutil.copytree(backend/'src',root/'src',ignore=shutil.ignore_patterns('*.js','*.map','*.d.ts'))
hashes={str(p.relative_to(root/'src')):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'src').glob('*.ts')}
p=root/'src/index.ts';source=p.read_text();p.write_text(source[:source.rindex('app.listen(port,')]+'export {app,requireApiKey};\n')
(root/'source-hashes.json').write_text(json.dumps(hashes,indent=2))
(root/'package.json').write_text('{"type":"module"}\n')
# Resolve backend-local cors and type packages without changing canonical deps.
modules=root/'node_modules';modules.mkdir()
installed=(backend.parent/'node_modules').resolve()
for where in [backend/'node_modules',installed.parent/'backend/node_modules',installed]:
 if not where.is_dir():continue
 for dep in where.iterdir():
  if not (modules/dep.name).exists():os.symlink(dep,modules/dep.name)
for suite in ['loopkind-retention','loopkind-migration']:
 test=backend/'tests'/f'{suite}.test.mjs'
 shutil.copy2(test,root/test.name)
 cwd=root/suite;cwd.mkdir()
 env={**{k:os.environ[k] for k in ['HOME','TMPDIR','PATH','PYTHONPATH','PYTHONDONTWRITEBYTECODE'] if k in os.environ},'QUILL_API_KEY':'fixture','QUILL_RATE_LIMIT_DISABLED':'1',
      'LOOPKIND_VAPID_PUBLIC_KEY':'','LOOPKIND_VAPID_PRIVATE_KEY':'',
      'QUILL_TEST_BACKEND_MODULE':(root/'src/index.ts').as_uri(),
      'QUILL_TEST_SERVER_SCRIPTS':str(Path(sys.argv[2]).resolve())}
 offline=root/'offline.cjs'
 offline.write_text("const net=require('node:net'),tls=require('node:tls'),http=require('node:http'),https=require('node:https');const deny=()=>{throw Error('RETENTION_OFFLINE_NETWORK_DENIED')};net.Socket.prototype.connect=net.Server.prototype.listen=tls.connect=http.request=http.get=https.request=https.get=deny;global.fetch=deny;require('node:module').syncBuiltinESMExports();\n")
 env['NODE_OPTIONS']='--require='+str(offline)
 loader=installed/'tsx/dist/loader.mjs'
 cmd=['node','--import',str(loader),'--test',str(root/test.name)]
 with (root/f'{suite}.log').open('w') as log: result=subprocess.run(cmd,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
 print(json.dumps({'command':cmd,'cwd':str(cwd),'exit':result.returncode}),flush=True)
 if result.returncode:sys.exit(result.returncode)
