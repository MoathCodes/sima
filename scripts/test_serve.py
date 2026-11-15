"""Deployment routing checks, using a temporary build and no upstream requests."""
import gzip
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import serve


class ServeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        cls.old_dist = serve.DIST
        serve.DIST = root / 'dist'
        serve.DIST.mkdir()
        (serve.DIST / 'index.html').write_text('<html>Sima</html>')
        (serve.DIST / 'assets').mkdir()
        (serve.DIST / 'assets' / 'index-12345678.js').write_text('console.log(1)')
        (serve.DIST / 'frames.bin.gz').write_bytes(gzip.compress(b'pixels'))
        cls.server = serve.live.make_server('127.0.0.1', 0, root / 'cache', [])
        bound = cls.server.RequestHandlerClass
        cls.server.RequestHandlerClass = type('TestHandler', (serve.Handler,), {'service': bound.service, 'origins': []})
        cls.thread = threading.Thread(target=cls.server.serve_forever)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.thread.join()
        cls.server.server_close()
        serve.DIST = cls.old_dist
        cls.tmp.cleanup()

    def get(self, path, method='GET'):
        return urlopen(Request(self.url + path, method=method), timeout=5)

    def test_html_and_head_revalidate(self):
        for method in ('GET', 'HEAD'):
            with self.get('/', method) as r:
                self.assertEqual(r.status, 200)
                self.assertEqual(r.headers['Cache-Control'], 'no-cache')
                self.assertEqual(r.headers['X-Content-Type-Options'], 'nosniff')

    def test_hashed_asset_is_immutable(self):
        with self.get('/assets/index-12345678.js') as r:
            self.assertIn('immutable', r.headers['Cache-Control'])

    def test_binary_is_not_transparently_decompressed(self):
        with self.get('/frames.bin.gz') as r:
            self.assertEqual(r.headers['Content-Type'], 'application/octet-stream')
            self.assertIsNone(r.headers['Content-Encoding'])
            self.assertEqual(gzip.decompress(r.read()), b'pixels')

    def test_api_health_and_invalid_input(self):
        with self.get('/api/health') as r:
            self.assertTrue(json.load(r)['ok'])
            self.assertEqual(r.headers['Cache-Control'], 'no-store')
        with self.assertRaises(HTTPError) as ctx:
            self.get('/api/patch?ra=invalid&dec=0')
        self.assertEqual(ctx.exception.code, 400)
        ctx.exception.close()

    def test_no_directory_listing_or_html_fallback(self):
        for path in ('/assets/', '/missing.bin', '/api/missing', '/scripts/live.py'):
            with self.assertRaises(HTTPError) as ctx:
                self.get(path)
            self.assertEqual(ctx.exception.code, 404)
            ctx.exception.close()


if __name__ == '__main__':
    unittest.main()
