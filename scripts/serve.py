#!/usr/bin/env python3
"""Serve the Vite build and the existing live API on one HTTP port."""
from __future__ import annotations

import os
import re
import signal
import threading
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit

import live

DIST = Path(os.environ.get("SIMA_DIST", Path(__file__).resolve().parent.parent / "dist")).resolve()
HASHED_ASSET = re.compile(r"/assets/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$")


class Handler(live.Handler, SimpleHTTPRequestHandler):
    # Keep the API's handlers, errors, queue and file format in live.py.
    timeout = 300

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api" or path.startswith("/api/"):
            live.Handler.do_GET(self)
        else:
            SimpleHTTPRequestHandler.do_GET(self)

    def do_HEAD(self):
        path = urlsplit(self.path).path
        if path == "/api" or path.startswith("/api/"):
            self._json(405, {"error": "only GET"})
        else:
            SimpleHTTPRequestHandler.do_HEAD(self)

    def list_directory(self, path):
        self.send_error(404, "Not found")
        return None

    def guess_type(self, path):
        # The app decompresses these itself; never send Content-Encoding: gzip.
        if str(path).endswith(".bin.gz"):
            return "application/octet-stream"
        return super().guess_type(path)

    def end_headers(self):
        path = urlsplit(self.path).path
        if not (path == "/api" or path.startswith("/api/")):
            cache = "public, max-age=31536000, immutable" if HASHED_ASSET.fullmatch(path) else "no-cache"
            self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def main():
    if not (DIST / "index.html").is_file():
        raise SystemExit(f"Build the front end first: {DIST}/index.html is missing")
    cache = Path(os.environ.get("SIMA_CACHE", str(live.pb.CACHE_DIR))).expanduser()
    cache.mkdir(parents=True, exist_ok=True)
    live.pb.CACHE_DIR = cache
    server = live.make_server("0.0.0.0", int(os.environ.get("PORT", "8080")), cache, [])
    bound = server.RequestHandlerClass
    server.RequestHandlerClass = type("AppHandler", (Handler,), {"service": bound.service, "origins": []})
    # shutdown() must run outside the serve_forever thread.
    def stop(signum, frame):
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print(f"Sima serving {DIST} on {server.server_port}; cache {cache}", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
