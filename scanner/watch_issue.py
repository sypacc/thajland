"""Zpracování GitHub issue 'watch: PRG→BKK 2027-08-26 → 2027-09-09' -> watchlist.yaml.

    python -m scanner.watch_issue --title "..." --body-file body.md
Vypíše výsledek (přidáno / odebráno / neplatné) na stdout; exit 0 = issue lze zavřít.
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

from . import watchlist as w


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", required=True)
    ap.add_argument("--body-file", default=None)
    args = ap.parse_args(argv)
    body = Path(args.body_file).read_text(encoding="utf-8") if args.body_file and Path(args.body_file).exists() else ""
    parsed = w.parse_issue(args.title, body)
    if not parsed:
        print("NEPLATNÉ: titulek musí být ve tvaru `watch: PRG→BKK 2027-08-26 → 2027-09-09` (nebo `unwatch: …`).")
        return 1
    cmd, entry = parsed
    data = w.load_watchlist()
    result = w.apply_issue(data, cmd, entry, dt.date.today().isoformat())
    w.save_watchlist(data)
    print(f"{cmd}: {entry['origin']}→{entry['destination']} {entry['depart_date']} → {entry['return_date']}: {result}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
