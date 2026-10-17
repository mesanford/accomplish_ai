"""A fake Stripe API on 127.0.0.1 for the emulator tests. It never talks to Stripe.

Point the Functions emulator at it by writing `_test/payments` = {"mode": "test", "apiBase": fake.base} (the functions
read that document only on the emulator). It records every request and answers the calls Forthright makes. The same
idempotency key always gets the same answer, as Stripe does.
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl

from handlers.stripe_wire import sign

SECRET_FILE = Path(__file__).resolve().parents[2] / "functions" / ".secret.local"
STAND_IN_WEBHOOK_SECRET = "whsec_emulator_stand_in"  # what scripts/test.sh writes to functions/.secret.local


def webhook_secret() -> str:
    """The STRIPE_WEBHOOK_SECRET the emulator loaded, so tests can sign deliveries it accepts."""
    if SECRET_FILE.exists():
        for line in SECRET_FILE.read_text().splitlines():
            if line.startswith("STRIPE_WEBHOOK_SECRET="):
                return line.split("=", 1)[1].strip()
    return STAND_IN_WEBHOOK_SECRET


def signature(body: bytes, stamp: int, secret: str | None = None) -> str:
    return f"t={stamp},v1={sign(body, secret or webhook_secret(), stamp)}"


class FakeStripe:
    def __init__(self):
        self.requests: list[dict] = []
        self.charges_enabled = True
        self.fail_next: int | None = None  # answer the next request with this status
        self.expire_status = 200
        self._ids: dict[str, int] = {}
        self._by_key: dict[str, dict] = {}
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), self._handler())
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def stop(self) -> None:
        self.server.shutdown()

    def posts(self, path_start: str) -> list[dict]:
        return [r for r in self.requests if r["method"] == "POST" and r["path"].startswith(path_start)]

    def _next(self, prefix: str) -> str:
        self._ids[prefix] = self._ids.get(prefix, 0) + 1
        return f"{prefix}_fake_{self._ids[prefix]}"

    def answer(self, method: str, path: str, form: dict, headers: dict) -> tuple[int, dict]:
        if self.fail_next:
            status, self.fail_next = self.fail_next, None
            return status, {"error": {"type": "api_error", "message": "fake failure"}}
        key = headers.get("idempotency-key")
        if method == "POST" and key in self._by_key:
            return 200, self._by_key[key]
        if method == "POST" and path == "/v1/accounts":
            body = {"id": self._next("acct"), "charges_enabled": False, "details_submitted": False}
        elif method == "POST" and path == "/v1/account_links":
            body = {"url": f"https://connect.stripe.com/setup/fake?return={form.get('return_url', '')}"}
        elif method == "GET" and path.startswith("/v1/accounts/"):
            body = {"id": path.rsplit("/", 1)[-1], "charges_enabled": self.charges_enabled, "details_submitted": True}
        elif method == "POST" and path.endswith("/expire"):
            if self.expire_status != 200:
                return self.expire_status, {"error": {"type": "invalid_request_error", "message": "complete"}}
            body = {"id": path.split("/")[4], "status": "expired"}
        elif method == "POST" and path == "/v1/checkout/sessions":
            sid = self._next("cs_test")
            total = sum(int(v) for k, v in form.items() if k.endswith("[price_data][unit_amount]"))
            body = {"id": sid, "url": f"https://checkout.stripe.com/c/pay/{sid}", "amount_total": total}
        else:
            return 404, {"error": {"type": "invalid_request_error", "message": f"no fake for {method} {path}"}}
        if method == "POST" and key:
            self._by_key[key] = body
        return 200, body

    def _handler(self):
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def _serve(self, method: str) -> None:
                size = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(size).decode() if size else ""
                form = dict(parse_qsl(raw, keep_blank_values=True))
                headers = {k.lower(): v for k, v in self.headers.items()}  # header names are case-insensitive
                seen = {"method": method, "path": self.path, "form": form, "headers": headers, "raw": raw}
                fake.requests.append(seen)
                status, body = fake.answer(method, self.path, form, headers)
                data = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):  # noqa: N802
                self._serve("GET")

            def do_POST(self):  # noqa: N802
                self._serve("POST")

            def log_message(self, *args):
                pass

        return Handler
