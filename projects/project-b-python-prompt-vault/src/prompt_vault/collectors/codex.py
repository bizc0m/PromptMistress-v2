from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable

from prompt_vault.collectors.base import Collector
from prompt_vault.models import RawConversation


class CodexCollector(Collector):
    source = "codex"

    def __init__(self, codex_home: Path | None = None) -> None:
        self.codex_home = codex_home or Path.home() / ".codex"
        self.session_index = self.codex_home / "session_index.jsonl"
        self.sessions_dir = self.codex_home / "sessions"

    def available(self) -> bool:
        return self.session_index.exists() or self.sessions_dir.exists()

    def collect(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        query: str | None = None,
        limit: int | None = None,
    ) -> Iterable[RawConversation]:
        seen: set[str] = set()
        records: list[RawConversation] = []
        for row in self._read_index():
            source_id = str(row.get("id") or row.get("session_id") or "")
            if not source_id or source_id in seen:
                continue
            seen.add(source_id)
            updated = _to_iso(row.get("updated_at") or row.get("ts"))
            title = str(row.get("thread_name") or row.get("text") or source_id)
            conv = RawConversation(
                source=self.source,
                source_id=source_id,
                title=title,
                created=updated,
                updated=updated,
                source_url=f"promptvault://chat/{source_id}",
                messages=[],
            )
            if not _matches(conv, date_from, date_to, query):
                continue
            records.append(conv)
            if limit and len(records) >= limit:
                return records
        return records

    def _read_index(self) -> Iterable[dict]:
        if self.session_index.exists():
            with self.session_index.open("r", encoding="utf-8") as fh:
                for line in fh:
                    if line.strip():
                        try:
                            yield json.loads(line)
                        except json.JSONDecodeError:
                            continue


def _to_iso(value: object) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), timezone.utc).isoformat()
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _matches(
    conv: RawConversation,
    date_from: date | None,
    date_to: date | None,
    query: str | None,
) -> bool:
    try:
        created = datetime.fromisoformat(conv.created.replace("Z", "+00:00")).date()
    except ValueError:
        created = None
    if date_from and created and created < date_from:
        return False
    if date_to and created and created > date_to:
        return False
    if query:
        blob = f"{conv.title} {conv.source_id}".lower()
        return query.lower() in blob
    return True
