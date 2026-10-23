"""CLI: python -m pipeline {enroll|run|review|status}"""
from __future__ import annotations

import argparse
import logging
import signal
import sys
import threading

from . import config


def _logging(verbose: bool) -> None:
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO,
                        format="%(asctime)s %(levelname)-7s %(name)-9s %(message)s", datefmt="%H:%M:%S")
    for noisy in ("werkzeug", "httpx", "httpx2", "urllib3", "anthropic"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def cmd_enroll(cfg: config.Config) -> int:
    from . import enroll

    enroll.run(cfg)
    return 0


def _serve(cfg, db, stop: threading.Event, on_change=None):
    from werkzeug.serving import make_server

    from .review import create_app

    server = make_server("127.0.0.1", cfg.review_port, create_app(cfg, db, on_change), threaded=True)
    t = threading.Thread(target=server.serve_forever, name="review", daemon=True)
    t.start()
    logging.getLogger("review").info("review queue: http://127.0.0.1:%d", cfg.review_port)
    return server


def _wait_for_ctrl_c(stop: threading.Event) -> None:
    def handler(signum, frame):
        if stop.is_set():  # second Ctrl-C: give up waiting
            sys.exit(130)
        logging.getLogger("main").info("shutting down (Ctrl-C again to force)...")
        stop.set()

    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)
    while not stop.wait(0.5):
        pass


def cmd_run(cfg: config.Config, review_only: bool = False) -> int:
    from .db import DB

    cfg.ensure_dirs()
    db = DB(cfg.db_path)
    db.recover_inflight()
    stop = threading.Event()
    threads: list[threading.Thread] = []
    wakers: list[threading.Event] = []

    if not review_only:
        from .publisher import Publisher
        from .tagger import Tagger
        from .writer import Writer

        tagger, writer, publisher = Tagger(cfg, db), Writer(cfg, db), Publisher(cfg, db)
        wakers = [tagger.wake, writer.wake, publisher.wake]
        for name, target in (("tagger", tagger.run), ("writer", writer.run), ("publisher", publisher.run)):
            t = threading.Thread(target=target, args=(stop,), name=name, daemon=True)
            t.start()
            threads.append(t)

    def on_change():  # review actions nudge the workers instead of waiting for their next poll
        for w in wakers[1:]:
            w.set()

    server = _serve(cfg, db, stop, on_change)
    _wait_for_ctrl_c(stop)
    for w in wakers:
        w.set()
    server.shutdown()
    for t in threads:
        t.join(timeout=10)
    logging.getLogger("main").info("stopped")
    return 0


def cmd_status(cfg: config.Config) -> int:
    from .db import DB

    db = DB(cfg.db_path)
    print("photos:", {r[0]: r[1] for r in db.all("SELECT status, COUNT(*) FROM photos GROUP BY status")})
    print("tags by state:", {r[0]: r[1] for r in db.all("SELECT state, COUNT(*) FROM tags GROUP BY state")})
    print("drafts:", {r[0]: r[1] for r in db.all("SELECT draft, COUNT(*) FROM tags GROUP BY draft")})
    print("gallery:", {r[0]: r[1] for r in db.all("SELECT publish, COUNT(*) FROM tags GROUP BY publish")})
    for r in db.all("SELECT path, error FROM seen_files WHERE error IS NOT NULL"):
        print("  unreadable:", r["path"], "-", r["error"])
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m pipeline", description="Hack Day photo pipeline")
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("enroll", help="fetch teams from the site and (re)build the face index")
    sub.add_parser("run", help="watch DRIVE_DIR, tag, draft, publish, and serve the review page")
    sub.add_parser("review", help="serve only the review page (no tagging/drafting/publishing)")
    sub.add_parser("status", help="print counts from the state database")
    args = p.parse_args(argv)
    _logging(args.verbose)
    cfg = config.load()
    if args.cmd == "enroll":
        return cmd_enroll(cfg)
    if args.cmd == "run":
        return cmd_run(cfg)
    if args.cmd == "review":
        return cmd_run(cfg, review_only=True)
    return cmd_status(cfg)


if __name__ == "__main__":
    sys.exit(main())
