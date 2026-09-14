from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CHAT_STATUSES = {"inbox", "active", "paused", "done", "archived", "obsolete"}
PROJECT_STATUSES = {"active", "paused", "done", "archived"}


@dataclass(slots=True)
class RawConversation:
    source: str
    source_id: str
    title: str
    created: str
    updated: str
    raw_path: Path | None = None
    source_url: str = ""
    messages: list[dict[str, Any]] = field(default_factory=list)
    status: str = "inbox"


@dataclass(slots=True)
class ClassifiedConversation:
    raw: RawConversation
    project: str
    confidence: float
    tags: list[str] = field(default_factory=list)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stable_id(prefix: str, source: str, source_id: str) -> str:
    import hashlib

    digest = hashlib.sha1(f"{source}:{source_id}".encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"
