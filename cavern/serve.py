#!/usr/bin/env python3
"""Open CHASM locally, with the bundled renderer. Python 3.10+; no pip/npm needed."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import webbrowser

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--port',type=int,default=8842)
    p.add_argument('--open',action='store_true')
    p.add_argument('--check',action='store_true',help='Check runtime files without starting a server')
    args=p.parse_args()
    root=Path(__file__).resolve().parent.parent
    for name in ['cavern/index.html','cavern/src/app.js','cavern/src/physics.js','vendor/three/build/three.module.js','vendor/three/examples/jsm/postprocessing/OutputPass.js']:
        if not (root/name).is_file():p.error('Missing runtime file: '+name)
    if args.check:
        print('CHASM runtime files present.');return
    if not 1<=args.port<=65535:p.error('Port must be 1 through 65535.')
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(SimpleHTTPRequestHandler,directory=str(root)))
    url=f'http://127.0.0.1:{args.port}/cavern/'
    print('CHASM Wingsuit Observatory: '+url,flush=True)
    print('Keep this terminal open. Ctrl+C stops the local server.',flush=True)
    if args.open:webbrowser.open(url)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=='__main__':main()
