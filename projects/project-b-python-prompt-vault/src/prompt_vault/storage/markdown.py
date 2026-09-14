from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path

from prompt_vault.models import ClassifiedConversation, RawConversation, now_iso, stable_id
from prompt_vault.paths import ensure_vault


def import_conversations(vault: Path, conversations: list[RawConversation]) -> list[Path]:
    ensure_vault(vault)
    written: list[Path] = []
    from prompt_vault.classifiers.basic import BasicProjectClassifier

    classifier = BasicProjectClassifier()
    for conv in conversations:
        raw_path = write_raw(vault, conv)
        conv.raw_path = raw_path
        classified = classifier.classify(conv)
        written.append(write_curated(vault, classified))
    return written


def write_raw(vault: Path, conv: RawConversation) -> Path:
    raw_dir = vault / "RAW" / conv.source
    raw_dir.mkdir(parents=True, exist_ok=True)
    raw_path = raw_dir / f"{_safe(conv.source_id)}.json"
    if raw_path.exists():
        return raw_path
    payload = {
        "source": conv.source,
        "source_id": conv.source_id,
        "title": conv.title,
        "created": conv.created,
        "updated": conv.updated,
        "source_url": conv.source_url,
        "status": conv.status,
        "messages": conv.messages,
    }
    raw_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return raw_path


def write_curated(vault: Path, classified: ClassifiedConversation) -> Path:
    conv = classified.raw
    chat_id = stable_id("pv_chat", conv.source, conv.source_id)
    project = classified.project
    target_dir = _chat_dir(vault, project)
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / f"{chat_id}.md"
    rel_raw = os.path.relpath(conv.raw_path, path.parent) if conv.raw_path else ""
    body = _body(conv)
    frontmatter = {
        "id": chat_id,
        "source": conv.source,
        "source_id": conv.source_id,
        "source_url": conv.source_url or f"promptvault://chat/{chat_id}",
        "project": project,
        "created": conv.created,
        "updated": conv.updated,
        "imported": now_iso(),
        "status": conv.status,
        "tags": classified.tags,
        "confidence": round(classified.confidence, 2),
        "raw_source": str(rel_raw),
    }
    path.write_text(_frontmatter(frontmatter) + body, encoding="utf-8")
    ensure_project_file(vault, project)
    return path


def ensure_project_file(vault: Path, project: str) -> None:
    if project == "00_INBOX":
        return
    project_dir = vault / "01_PROJECTS" / _safe(project)
    project_dir.mkdir(parents=True, exist_ok=True)
    project_file = project_dir / "project.md"
    if not project_file.exists():
        project_file.write_text(
            f"---\nname: {project}\nstatus: active\n---\n\n# {project}\n\n## Résumé\n\n## Décisions\n\n## Conversations\n",
            encoding="utf-8",
        )


def _chat_dir(vault: Path, project: str) -> Path:
    if project == "00_INBOX":
        return vault / "00_INBOX"
    return vault / "01_PROJECTS" / _safe(project) / "chats"


def _frontmatter(data: dict) -> str:
    lines = ["---"]
    for key, value in data.items():
        if isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f"  - {item}")
        else:
            lines.append(f'{key}: "{value}"' if ":" in str(value) or value == "" else f"{key}: {value}")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def _body(conv: RawConversation) -> str:
    content = "\n\n".join(str(m.get("content", "")) for m in conv.messages[:6]).strip()
    if not content:
        content = "Aucun message détaillé disponible dans la source locale indexée."
    return f"""# {conv.title}

## Résumé

À compléter après validation humaine.

## Demandes importantes

{_extract_requests(content)}

## Décisions prises

À compléter.

## Résultats retenus

À compléter.

## Prompts réutilisables

{_extract_prompt(content)}

## Liens associés

- Source: {conv.source_url or "source locale"}

## Source originale

Voir `raw_source` dans le frontmatter.
"""


def _extract_requests(content: str) -> str:
    first = content.splitlines()[0][:300] if content.splitlines() else ""
    return f"- {first}" if first else "- À compléter."


def _extract_prompt(content: str) -> str:
    if "prompt" not in content.lower():
        return "- Aucun prompt réutilisable détecté automatiquement."
    return "- Prompt candidat détecté automatiquement, à valider."


def _safe(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip())
    return value.strip("-") or "untitled"
