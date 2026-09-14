from __future__ import annotations

from pathlib import Path


DEFAULT_VAULT_NAME = "PromptVault"


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def default_vault_path(base: Path | None = None) -> Path:
    return (base or project_root()) / DEFAULT_VAULT_NAME


def ensure_vault(root: Path) -> None:
    for rel in [
        "00_INBOX",
        "01_PROJECTS",
        "02_PROMPTS",
        "03_TEMPLATES",
        "90_DONE",
        "99_ARCHIVE",
        "RAW/chatgpt",
        "RAW/claude",
        "RAW/perplexity",
        "RAW/codex",
    ]:
        (root / rel).mkdir(parents=True, exist_ok=True)
