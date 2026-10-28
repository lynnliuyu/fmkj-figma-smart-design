#!/usr/bin/env python3
"""Caddy on_demand_tls 的校验端点：只允许 *.fmkj.top 的子域名申请证书。

为什么需要它：Caddy 不允许「谁指向本机就给谁签证书」，否则别人把自己的域名指过来也能蹭。
这里只放行 fmkj.top 的子域名 —— 域名在你手里，别人蹭不到；加客户也不用改这个文件。
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

ALLOWED_SUFFIX = ".fmkj.top"
RESERVED = set()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        domain = (parse_qs(urlparse(self.path).query).get("domain") or [""])[0].strip().lower()
        ok = (
            domain.endswith(ALLOWED_SUFFIX)
            and domain != ALLOWED_SUFFIX.lstrip(".")
            and domain not in RESERVED
            and ".." not in domain
            and domain.count(".") >= 2
        )
        self.send_response(200 if ok else 404)
        self.end_headers()
        self.wfile.write(b"ok" if ok else b"denied")

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 18321), Handler).serve_forever()
