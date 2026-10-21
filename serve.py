"""Servidor local do HI-IPTV: serve os estáticos e oferece /proxy?u=<url> para contornar CORS.

Uso: python serve.py [porta]   (padrão 8080)

Segurança (o proxy roda na máquina do usuário e enxerga a rede dele):
- só aceita requisições cujo Host seja localhost/127.0.0.1 (barra DNS rebinding);
- /proxy recusa requisições vindas de outros sites (Sec-Fetch-Site) e carregamento como página/iframe;
- /proxy recusa destinos não públicos (loopback, rede privada, link-local), inclusive em redirecionamentos.
  Para um provedor na rede local: HI_ALLOW_PRIVATE=1 python serve.py
- nenhuma resposta leva Access-Control-Allow-Origin (a página é same-origin);
- o log não imprime a URL completa do proxy (ela carrega usuário e senha).
"""
import ipaddress
import os
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
UA = "Mozilla/5.0 (HI-IPTV)"
ALLOW_PRIVATE = os.environ.get("HI_ALLOW_PRIVATE") == "1"
BAD_DEST = {"document", "iframe", "frame", "embed", "object"}


def _blocked(url):
    """True se o destino não é um endereço público (ou a URL não é http/https)."""
    p = urllib.parse.urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        return True
    if ALLOW_PRIVATE:
        return False
    try:
        infos = socket.getaddrinfo(p.hostname, None)
    except socket.gaierror:
        return False  # deixa o urlopen falhar com o erro normal de DNS
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if getattr(ip, "ipv4_mapped", None):
            ip = ip.ipv4_mapped
        if not ip.is_global:
            return True
    return False


class _SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if _blocked(newurl):
            raise urllib.error.HTTPError(newurl, 403, "redirecionamento para destino não público", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_SafeRedirect)


def _host_of(proxy_path):
    target = urllib.parse.unquote(proxy_path[len("/proxy?u="):])
    return urllib.parse.urlparse(target).hostname or "?"


class Handler(SimpleHTTPRequestHandler):
    port = 8080

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, fmt, *args):
        msg = re.sub(r"/proxy\?u=\S+", lambda m: f"/proxy?u=<{_host_of(m.group(0))}>", fmt % args)
        sys.stderr.write(f"{self.address_string()} - - [{self.log_date_time_string()}] {msg}\n")

    def _local_host(self):
        allowed = {f"localhost:{self.port}", f"127.0.0.1:{self.port}", f"[::1]:{self.port}"}
        return self.headers.get("Host", "").lower() in allowed

    def do_GET(self):
        if not self._local_host():
            return self.send_error(403, "Host não permitido")
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/proxy":
            if self.headers.get("Sec-Fetch-Site", "same-origin") not in ("same-origin", "none") \
                    or self.headers.get("Sec-Fetch-Dest", "") in BAD_DEST:
                return self.send_error(403, "Origem não permitida")
            return self.proxy(urllib.parse.parse_qs(parsed.query).get("u", [""])[0])
        return super().do_GET()

    def proxy(self, target):
        if _blocked(target):
            return self.send_error(403, "Destino não permitido")
        headers = {"User-Agent": UA}
        if "Range" in self.headers:
            headers["Range"] = self.headers["Range"]
        try:
            with _OPENER.open(urllib.request.Request(target, headers=headers), timeout=20) as r:
                ctype = r.headers.get("Content-Type", "application/octet-stream")
                body = r.read() if self._is_playlist(target, ctype) else None
                self.send_response(r.status)
                self.send_header("Content-Type", ctype)
                # Conteúdo de terceiros nunca executa na origem do app (onde ficam as credenciais).
                self.send_header("Content-Security-Policy", "sandbox")
                self.send_header("X-Content-Type-Options", "nosniff")
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
    Handler.port = port
    print(f"HI-IPTV em http://localhost:{port}" + ("  (HI_ALLOW_PRIVATE=1: destinos privados liberados)" if ALLOW_PRIVATE else ""))
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
