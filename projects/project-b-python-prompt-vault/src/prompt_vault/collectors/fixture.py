from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable

from prompt_vault.collectors.base import Collector
from prompt_vault.models import RawConversation


class FixtureCollector(Collector):
    source = "fixture"

    def __init__(self, path: Path) -> None:
        self.path = path

    def collect(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        query: str | None = None,
        limit: int | None = None,
    ) -> Iterable[RawConversation]:
        rows = json.loads(self.path.read_text(encoding="utf-8"))
        out: list[RawConversation] = []
        for row in rows:
            conv = RawConversation(
                source=row.get("source", "fixture"),
                source_id=row["source_id"],
                title=row["title"],
                created=row["created"],
                updated=row.get("updated", row["created"]),
                source_url=row.get("source_url", ""),
                messages=row.get("messages", []),
                status=row.get("status", "inbox"),
            )
            if not _matches(conv, date_from, date_to, query):
                continue
            out.append(conv)
            if limit and len(out) >= limit:
                break
        return out


def _matches(conv: RawConversation, date_from: date | None, date_to: date | None, query: str | None) -> bool:
    created = datetime.fromisoformat(conv.created.replace("Z", "+00:00")).date()
    if date_from and created < date_from:
        return False
    if date_to and created > date_to:
        return False
    if query:
        blob = json.dumps({"title": conv.title, "messages": conv.messages}, ensure_ascii=False).lower()
        return query.lower() in blob
    return True
