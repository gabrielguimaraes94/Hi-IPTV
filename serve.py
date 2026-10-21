"""Servidor local do HI-IPTV: serve o index.html e oferece /proxy?u=<url> para contornar CORS.

Uso: python serve.py [porta]   (padrão 8080)
"""
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
UA = "Mozilla/5.0 (HI-IPTV)"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/proxy":
            return self.proxy(urllib.parse.parse_qs(parsed.query).get("u", [""])[0])
        return super().do_GET()

    def proxy(self, target):
        if not target.startswith(("http://", "https://")):
            return self.send_error(400, "URL inválida")
        headers = {"User-Agent": UA}
        if "Range" in self.headers:
            headers["Range"] = self.headers["Range"]
        try:
            with urllib.request.urlopen(urllib.request.Request(target, headers=headers), timeout=20) as r:
                ctype = r.headers.get("Content-Type", "application/octet-stream")
                body = r.read() if self._is_playlist(target, ctype) else None
                self.send_response(r.status)
                self.send_header("Content-Type", ctype)
                self.send_header("Access-Control-Allow-Origin", "*")
                if body is None:
                    # Necessário para seek e para o Chrome aceitar respostas 206 de vídeo.
                    for h in ("Content-Length", "Content-Range", "Accept-Ranges"):
                        if r.headers.get(h):
                            self.send_header(h, r.headers[h])
                if body is not None:
                    # Reescreve URLs de playlists HLS para que segmentos também passem pelo proxy.
                    body = self._rewrite(body.decode("utf-8", "replace"), r.geturl()).encode()
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                self.end_headers()
                while chunk := r.read(64 * 1024):
                    self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except urllib.error.HTTPError as e:
            self.send_error(e.code, str(e.reason))
        except Exception as e:  # noqa: BLE001
            self.send_error(502, f"Falha no proxy: {e}")

    @staticmethod
    def _is_playlist(url, ctype):
        path = urllib.parse.urlparse(url).path.lower()
        return path.endswith((".m3u8", ".m3u")) or "mpegurl" in ctype.lower()

    @staticmethod
    def _rewrite(text, base):
        out = []
        for line in text.splitlines():
            s = line.strip()
            if s and not s.startswith("#"):
                line = "/proxy?u=" + urllib.parse.quote(urllib.parse.urljoin(base, s), safe="")
            out.append(line)
        return "\n".join(out) + "\n"


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"HI-IPTV em http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
