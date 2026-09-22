"""Servidor local do dashboard de finanças.

Serve os arquivos estáticos e guarda os dados em dados.json (nesta mesma pasta).
Uso: python3 server.py [porta]   (padrão: 5178)
"""
import datetime
import glob
import json
import os
import shutil
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE, "dados.json")
MAX_BODY = 25 * 1024 * 1024  # 25 MB (a foto de perfil vai junto)
BACKUP_DIR = os.path.join(BASE, "backups")
KEEP_BACKUPS = 30


def backup_daily():
    """Antes do primeiro salvamento do dia, guarda uma cópia de como os dados estavam.
    Assim dá pra voltar pro estado do começo de qualquer um dos últimos 30 dias."""
    if not os.path.exists(DATA_FILE):
        return
    os.makedirs(BACKUP_DIR, exist_ok=True)
    today = os.path.join(BACKUP_DIR, f"dados-{datetime.date.today().isoformat()}.json")
    if not os.path.exists(today):
        shutil.copy2(DATA_FILE, today)
    for old in sorted(glob.glob(os.path.join(BACKUP_DIR, "dados-*.json")))[:-KEEP_BACKUPS]:
        os.remove(old)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE, **kwargs)

    def _json(self, status, body=b""):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] != "/api/dados":
            return super().do_GET()
        if not os.path.exists(DATA_FILE):
            return self._json(404, b"null")
        with open(DATA_FILE, "rb") as f:
            self._json(200, f.read())

    def do_PUT(self):
        if self.path.split("?")[0] != "/api/dados":
            return self._json(404, b'{"erro":"rota inexistente"}')
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._json(413, b'{"erro":"tamanho invalido"}')
        try:
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict) or not isinstance(data.get("tx"), list):
                raise ValueError
        except ValueError:
            return self._json(400, b'{"erro":"json invalido"}')
        backup_daily()
        # grava num arquivo temporário e troca, pra nunca deixar o dados.json pela metade
        tmp = DATA_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        os.replace(tmp, DATA_FILE)
        self._json(200, b'{"ok":true}')

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")  # sempre pega a versão mais nova dos arquivos
        super().end_headers()

    do_POST = do_PUT  # usado pelo sendBeacon ao fechar a aba

    def log_message(self, fmt, *args):
        if args and "/api/" in str(args[0]):
            return  # não polui o terminal a cada salvamento
        super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5178
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Finanças rodando em http://localhost:{port}  (dados em {DATA_FILE})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
