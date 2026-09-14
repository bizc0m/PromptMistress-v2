from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

from prompt_vault.collectors.codex import CodexCollector
from prompt_vault.collectors.fixture import FixtureCollector
from prompt_vault.index.build import rebuild_index, search
from prompt_vault.models import RawConversation
from prompt_vault.paths import default_vault_path, ensure_vault, project_root
from prompt_vault.storage.markdown import import_conversations
from prompt_vault.ui.server import serve


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pv")
    parser.add_argument("--vault", type=Path, default=default_vault_path())
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("doctor")
    p_import = sub.add_parser("import")
    p_import.add_argument("--source", choices=["codex", "fixture"], default="codex")
    p_import.add_argument("--fixture", type=Path)
    p_import.add_argument("--from", dest="date_from")
    p_import.add_argument("--to", dest="date_to")
    p_import.add_argument("--query")
    p_import.add_argument("--limit", type=int)
    p_search = sub.add_parser("search")
    p_search.add_argument("query")
    sub.add_parser("projects")
    sub.add_parser("inbox")
    sub.add_parser("rebuild-index")
    p_ui = sub.add_parser("ui")
    p_ui.add_argument("--host", default="127.0.0.1")
    p_ui.add_argument("--port", type=int, default=8765)
    p_export = sub.add_parser("export")
    p_export.add_argument("--query", default="")
    args = parser.parse_args(argv)
    ensure_vault(args.vault)

    if args.cmd == "doctor":
        return _doctor(args.vault)
    if args.cmd == "import":
        collector = _collector(args)
        rows = list(collector.collect(_date(args.date_from), _date(args.date_to), args.query, args.limit))
        written = import_conversations(args.vault, rows)
        rebuild_index(args.vault)
        print(f"imported={len(rows)} curated_files={len(written)}")
        return 0
    if args.cmd == "search":
        for row in search(args.vault, args.query):
            print(f"{row['created'][:10]}\t{row['source']}\t{row['project']}\t{row['status']}\t{row['title']}")
        return 0
    if args.cmd == "projects":
        rows = rebuild_index(args.vault)
        for project in sorted({r["project"] for r in rows}):
            print(project)
        return 0
    if args.cmd == "inbox":
        for row in rebuild_index(args.vault):
            if row["project"] == "00_INBOX" or row["status"] == "inbox":
                print(f"{row['id']}\t{row['title']}")
        return 0
    if args.cmd == "rebuild-index":
        rows = rebuild_index(args.vault)
        print(f"indexed={len(rows)}")
        return 0
    if args.cmd == "ui":
        print(f"http://{args.host}:{args.port}")
        serve(args.vault, args.host, args.port)
        return 0
    if args.cmd == "export":
        rows = search(args.vault, args.query) if args.query else rebuild_index(args.vault)
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0
    return 1


def _collector(args: argparse.Namespace):
    if args.source == "fixture":
        if not args.fixture:
            raise SystemExit("--fixture is required for source=fixture")
        return FixtureCollector(args.fixture)
    return CodexCollector()


def _date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def _doctor(vault: Path) -> int:
    codex = CodexCollector()
    print(f"project_root={project_root()}")
    print(f"vault={vault}")
    print(f"codex_home={codex.codex_home}")
    print(f"codex_available={codex.available()}")
    print(f"session_index={codex.session_index} exists={codex.session_index.exists()}")
    git = _git_status()
    print(f"git={git}")
    return 0


def _git_status() -> str:
    root = project_root()
    try:
        out = subprocess.check_output(["git", "-C", str(root), "status", "--short", "--branch"], text=True, stderr=subprocess.STDOUT)
        return out.strip().replace("\n", " | ")
    except Exception as exc:
        return f"not-a-git-repository ({exc})"


if __name__ == "__main__":
    raise SystemExit(main())
