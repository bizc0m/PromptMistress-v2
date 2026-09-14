from __future__ import annotations

import json
import re
from pathlib import Path


FIELDS = ["id", "title", "project", "source", "created", "updated", "status", "tags", "source_url", "path"]


def rebuild_index(vault: Path) -> list[dict]:
    rows: list[dict] = []
    for md in sorted(_chat_files(vault)):
        text = md.read_text(encoding="utf-8")
        meta = _frontmatter(text)
        title = _title(text)
        rows.append(
            {
                "id": meta.get("id", md.stem),
                "title": title,
                "project": meta.get("project", "00_INBOX"),
                "source": meta.get("source", ""),
                "created": meta.get("created", ""),
                "updated": meta.get("updated", ""),
                "status": meta.get("status", "inbox"),
                "tags": meta.get("tags", []),
                "source_url": meta.get("source_url", ""),
                "path": str(md.relative_to(vault)),
            }
        )
    (vault / "index.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return rows


def load_index(vault: Path) -> list[dict]:
    path = vault / "index.json"
    if not path.exists():
        return rebuild_index(vault)
    return json.loads(path.read_text(encoding="utf-8"))


def search(vault: Path, query: str) -> list[dict]:
    q = query.lower()
    return [row for row in load_index(vault) if q in json.dumps(row, ensure_ascii=False).lower()]


def _chat_files(vault: Path):
    yield from (vault / "00_INBOX").glob("*.md")
    yield from (vault / "01_PROJECTS").glob("*/chats/*.md")
    yield from (vault / "90_DONE").glob("*.md")
    yield from (vault / "99_ARCHIVE").glob("*.md")


def _frontmatter(text: str) -> dict:
    if not text.startswith("---\n"):
        return {}
    block = text.split("---", 2)[1]
    meta: dict[str, object] = {}
    current: str | None = None
    for line in block.splitlines():
        if not line.strip():
            continue
        if line.startswith("  - ") and current:
            meta.setdefault(current, [])
            assert isinstance(meta[current], list)
            meta[current].append(line[4:].strip())
            continue
        if ":" in line:
            key, value = line.split(":", 1)
            current = key.strip()
            cleaned = value.strip().strip('"')
            meta[current] = [] if cleaned == "" else cleaned
    return meta


def _title(text: str) -> str:
    match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
    return match.group(1).strip() if match else "Untitled"
