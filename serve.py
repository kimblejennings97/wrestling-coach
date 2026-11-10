"""Tiny static server for the game: same as `python -m http.server`, but tells the browser never to cache.
Without this, the browser can keep an old copy of one JavaScript module next to new copies of the others after an
update, which breaks the whole page (blank screen)."""
import http.server, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('', PORT), Handler) as httpd:
    print(f'Wrestling Coach on http://localhost:{PORT}/index.html  (Ctrl+C or close this window to stop)')
    httpd.serve_forever()
