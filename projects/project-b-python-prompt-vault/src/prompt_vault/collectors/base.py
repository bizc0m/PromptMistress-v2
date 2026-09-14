from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date
from typing import Iterable

from prompt_vault.models import RawConversation


class Collector(ABC):
    source: str

    @abstractmethod
    def collect(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        query: str | None = None,
        limit: int | None = None,
    ) -> Iterable[RawConversation]:
        raise NotImplementedError
