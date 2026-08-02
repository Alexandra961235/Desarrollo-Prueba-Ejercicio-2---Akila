"""Prepara los datos y sirve el dashboard localmente."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))
from prepare_data import prepare  # noqa: E402

REFRESH_LOCK = threading.Lock()


class DashboardHandler(SimpleHTTPRequestHandler):
    """Sirve el dashboard y regenera sus datos desde el CSV local."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "dashboard"), **kwargs)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/refresh":
            self.send_error(404)
            return
        if not REFRESH_LOCK.acquire(blocking=False):
            self._send_json(409, {"ok": False, "error": "Ya hay una actualización en curso."})
            return
        try:
            result = prepare()
            self._send_json(200, {"ok": True, "generated_at": result["generated_at"],
                                  "rows": result["kpis"]["total"],
                                  "errors": result["quality"]["errors"],
                                  "warnings": result["quality"]["warnings"]})
        except Exception as exc:
            self._send_json(422, {"ok": False, "error": str(exc)})
        finally:
            REFRESH_LOCK.release()

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self) -> None:
        if self.path.startswith("/data/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepara y sirve el dashboard Akila")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Dirección de escucha; usa 0.0.0.0 para acceder desde la red local",
    )
    args = parser.parse_args()

    subprocess.run(
        [sys.executable, str(ROOT / "src" / "prepare_data.py")],
        check=True,
        cwd=ROOT,
    )

    server = ThreadingHTTPServer((args.host, args.port), DashboardHandler)
    display_host = "localhost" if args.host == "127.0.0.1" else args.host
    print(f"Dashboard disponible en http://{display_host}:{args.port}")
    print("Presiona Ctrl+C para detenerlo.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
