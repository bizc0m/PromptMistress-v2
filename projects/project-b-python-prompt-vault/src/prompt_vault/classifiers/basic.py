from __future__ import annotations

import re
from dataclasses import dataclass

from prompt_vault.models import ClassifiedConversation, RawConversation


KEYWORDS = {
    "Nyx": ["nyx", "nyxnote", "nct", "notecortex"],
    "GroceryNanny": ["grocerynanny", "grocery", "courses", "frigo"],
    "COOPRO": ["coopro", "copro", "centralis", "assemblee generale"],
    "Prompt Management": ["prompt", "vault", "template", "codex skill"],
}


@dataclass(slots=True)
class BasicProjectClassifier:
    threshold: float = 0.7

    def classify(self, conv: RawConversation) -> ClassifiedConversation:
        text = _conversation_text(conv)
        scores: dict[str, int] = {}
        tags: set[str] = set()
        for project, words in KEYWORDS.items():
            count = sum(len(re.findall(rf"\b{re.escape(word)}\b", text)) for word in words)
            if count:
                scores[project] = count
                tags.update(words[:2])
        if not scores:
            return ClassifiedConversation(conv, "00_INBOX", 0.0, [])
        project, score = max(scores.items(), key=lambda item: item[1])
        confidence = min(0.55 + (score * 0.15), 0.98)
        if confidence < self.threshold:
            return ClassifiedConversation(conv, "00_INBOX", confidence, sorted(tags))
        return ClassifiedConversation(conv, project, confidence, sorted(tags))


def _conversation_text(conv: RawConversation) -> str:
    parts = [conv.title]
    for msg in conv.messages:
        parts.append(str(msg.get("content", "")))
    return "\n".join(parts).lower()
