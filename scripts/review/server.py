#!/usr/bin/env python3
"""产品图筛选页的本地服务。

只做三件事：
  1. 提供筛选页与图片（仅限 public/ 与 .local/recrawl/ 两个目录）
  2. 读写人工点选结果（.local/recrawl/picks-ui.json）
  3. 不改数据库 —— 点选完成后由 apply-picked.py 统一入库

用法：
  python3 scripts/review/server.py [--port 4173]
"""
import argparse
import json
import mimetypes
import os
import posixpath
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PICKS = os.path.join(ROOT, ".local/recrawl/picks-ui.json")
DATA = os.path.join(ROOT, ".local/recrawl/review-data.json")
HTML = os.path.join(ROOT, "scripts/review/review.html")
ALLOW = ("public/", ".local/recrawl/")


def load_picks():
    if os.path.exists(PICKS):
        with open(PICKS, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_picks(picks):
    os.makedirs(os.path.dirname(PICKS), exist_ok=True)
    with open(PICKS, "w", encoding="utf-8") as f:
        json.dump(picks, f, ensure_ascii=False, indent=1)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _safe(self, url_path):
        p = posixpath.normpath(url_path.lstrip("/"))
        if p.startswith("local/"):
            p = "." + p          # 对外用 /local/...，磁盘上是 .local/...
        if p.startswith("..") or ".." in p.split("/"):
            return None
        if not p.startswith(ALLOW):
            return None
        full = os.path.join(ROOT, p)
        return full if os.path.isfile(full) else None

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            with open(HTML, "rb") as f:
                return self._send(200, f.read(), "text/html; charset=utf-8")
        if path == "/api/data":
            with open(DATA, "rb") as f:
                return self._send(200, f.read())
        if path == "/api/picks":
            return self._send(200, json.dumps(load_picks(), ensure_ascii=False))
        full = self._safe(path)
        if not full:
            return self._send(404, '{"error":"not found"}')
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        with open(full, "rb") as f:
            return self._send(200, f.read(), ctype)

    def do_POST(self):
        if self.path.split("?")[0] != "/api/picks":
            return self._send(404, '{"error":"not found"}')
        length = int(self.headers.get("Content-Length") or 0)
        if length > 1_000_000:
            return self._send(413, '{"error":"too large"}')
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._send(400, '{"error":"bad json"}')
        picks = load_picks()

        if payload.get("reset"):
            picks = {}
        else:
            sku = payload.get("sku")
            if not isinstance(sku, str) or not sku:
                return self._send(400, '{"error":"sku required"}')
            if payload.get("clear"):
                picks.pop(sku, None)
            else:
                picks[sku] = {
                    "file": payload.get("file"),
                    "kind": payload.get("kind"),      # pick | original | skip
                    "src": payload.get("src", ""),
                    "page": payload.get("page", ""),
                }
        save_picks(picks)
        return self._send(200, json.dumps({"ok": True, "count": len(picks)}))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=4173)
    a = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    print(f"筛选页 http://127.0.0.1:{a.port}/")
    srv.serve_forever()


if __name__ == "__main__":
    main()
