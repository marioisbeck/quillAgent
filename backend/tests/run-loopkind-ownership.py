#!/usr/bin/env python3
"""Run actual backend handlers in a scratch SQLite process, never a listener.

OUTPUT_DIR [--rpc] builds an isolated real-source copy with installed read-only
packages. --rpc exposes handler calls over stdio for the real Python executor.
"""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys
backend=Path(__file__).resolve().parents[1]
root=Path(sys.argv[1]).resolve();root.mkdir(parents=True,exist_ok=False)
shutil.copytree(backend/'src',root/'src',ignore=shutil.ignore_patterns('*.js','*.map','*.d.ts'))
hashes={str(p.relative_to(root/'src')):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'src').glob('*.ts')}
p=root/'src/index.ts';source=p.read_text();p.write_text(source[:source.rindex('app.listen(port,')]+'export {app,requireApiKey};\n')
(root/'source-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
(root/'package.json').write_text('{"type":"module"}\n')
modules=root/'node_modules';modules.mkdir()
# Bootstrap owns dependency links. Read backend-local cors from that same
# installed dependency tree, without installing or altering any package.
installed=(backend.parent/'node_modules').resolve()
for where in [backend/'node_modules',installed.parent/'backend/node_modules',installed]:
 if where.is_dir():
  for dep in where.iterdir():
   if not (modules/dep.name).exists():os.symlink(dep,modules/dep.name)
offline=root/'offline.cjs'
offline.write_text('''const net=require('node:net'),tls=require('node:tls'),http=require('node:http'),https=require('node:https');
const deny=()=>{throw Error('OWNERSHIP_OFFLINE_NETWORK_DENIED')};
net.Socket.prototype.connect=net.Server.prototype.listen=tls.connect=http.request=http.get=https.request=https.get=deny;
global.fetch=deny;require('node:module').syncBuiltinESMExports();
''')
test=root/'loopkind-ownership.test.mjs';shutil.copy2(backend/'tests'/test.name,test)
env={k:os.environ[k] for k in ['HOME','TMPDIR','PATH','PYTHONDONTWRITEBYTECODE','PYTHONPATH'] if k in os.environ}
env.update(QUILL_API_KEY='fixture',QUILL_RATE_LIMIT_DISABLED='1',NODE_OPTIONS='--require='+str(offline),QUILL_TEST_BACKEND_MODULE=(root/'src/index.ts').as_uri())
if '--rpc' in sys.argv:env['QUILL_OWNERSHIP_RPC']='1'
cmd=['node','--import',str(installed/'tsx/dist/loader.mjs'),*([] if '--rpc' in sys.argv else ['--test']),str(test)]
raise SystemExit(subprocess.call(cmd,cwd=root,env=env))
