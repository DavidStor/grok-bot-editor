#!/usr/bin/env python3
"""Static server for the kit + POST /save?name=file.mp4 writes the request body into ./output/ (used to pull renders out of the browser)."""
import http.server, os, sys, urllib.parse
ROOT = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(ROOT, 'output')
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != '/save': self.send_error(404); return
        name = os.path.basename(urllib.parse.parse_qs(u.query).get('name', ['render.bin'])[0])
        n = int(self.headers.get('Content-Length', 0)); data = self.rfile.read(n)
        os.makedirs(OUT, exist_ok=True); p = os.path.join(OUT, name)
        with open(p, 'wb') as f: f.write(data)
        body = f'saved {p} ({n} bytes)'.encode()
        self.send_response(200); self.send_header('Content-Type', 'text/plain'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def log_message(self, *a): sys.stderr.write('%s - %s\n' % (self.address_string(), a[0] % a[1:]))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
