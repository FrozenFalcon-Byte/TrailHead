"""Request pacing: one evenly spaced slot per provider, and a pool that picks the soonest slot."""

from __future__ import annotations

import asyncio
import fcntl
import logging
import time
from pathlib import Path
from typing import Awaitable, Callable, Generic, Sequence, TypeVar

logger = logging.getLogger(__name__)

Clock = Callable[[], float]
Sleep = Callable[[float], Awaitable[None]]


class SlotLimiter:
    """Spaces requests 60/rpm seconds apart. Slots are reserved up front, so waiters never stampede."""

    def __init__(self, requests_per_minute: float) -> None:
        if requests_per_minute <= 0:
            raise ValueError("requests_per_minute must be positive")
        self.interval = 60.0 / requests_per_minute
        self._next = 0.0

    def peek(self, now: float) -> float:
        return max(self._next, now)

    def reserve(self, now: float) -> float:
        slot = self.peek(now)
        self._next = slot + self.interval
        return slot

    def penalize(self, now: float, seconds: float) -> None:
        """Push the next slot out, for example after a 429."""
        self._next = max(self._next, now + seconds)


class SharedSlotLimiter(SlotLimiter):
    """A SlotLimiter whose next-slot time lives in a locked file, so several processes (the web app,
    a background eval, the CLI) share one provider allowance. Needs a wall clock."""

    def __init__(self, requests_per_minute: float, path: Path) -> None:
        super().__init__(requests_per_minute)
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def _update(self, change: Callable[[float], float | None]) -> float:
        with open(self._path, "a+", encoding="utf-8") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            handle.seek(0)
            try:
                current = float(handle.read().strip() or 0.0)
            except ValueError:
                current = 0.0
            updated = change(current)
            if updated is not None:
                handle.seek(0)
                handle.truncate()
                handle.write(repr(updated))
            return current

    def peek(self, now: float) -> float:
        return max(self._update(lambda current: None), now)

    def reserve(self, now: float) -> float:
        slot = max(self._update(lambda current: max(current, now) + self.interval), now)
        return slot

    def penalize(self, now: float, seconds: float) -> None:
        self._update(lambda current: max(current, now + seconds))


T = TypeVar("T")


class NoProviderAvailable(Exception):
    pass


class ProviderPool(Generic[T]):
    """Routes each request to the enabled provider whose next slot is soonest; ties go to list order."""

    def __init__(
        self,
        providers: Sequence[tuple[T, float]],
        *,
        clock: Clock = time.monotonic,
        sleep: Sleep = asyncio.sleep,
        shared_paths: Sequence[Path] | None = None,
    ) -> None:
        self._providers = [p for p, _ in providers]
        if shared_paths is not None:
            self._limiters: list[SlotLimiter] = [SharedSlotLimiter(rpm, path) for (_, rpm), path in zip(providers, shared_paths)]
        else:
            self._limiters = [SlotLimiter(rpm) for _, rpm in providers]
        self._disabled: dict[int, str] = {}
        self._clock = clock
        self._sleep = sleep

    @property
    def enabled(self) -> list[T]:
        return [p for i, p in enumerate(self._providers) if i not in self._disabled]

    @property
    def disabled_reasons(self) -> dict[int, str]:
        return dict(self._disabled)

    async def acquire(self) -> tuple[int, T]:
        live = [i for i in range(len(self._providers)) if i not in self._disabled]
        if not live:
            reasons = "; ".join(self._disabled.values()) or "none configured"
            raise NoProviderAvailable(f"no decision provider available ({reasons})")
        now = self._clock()
        index = min(live, key=lambda i: (self._limiters[i].peek(now), i))
        slot = self._limiters[index].reserve(now)
        delay = slot - now
        if delay > 0:
            if delay >= 5:
                logger.info("rate limit: waiting %.0fs for a request slot", delay)
            await self._sleep(delay)
        return index, self._providers[index]

    def interval(self, index: int) -> float:
        return self._limiters[index].interval

    def penalize(self, index: int, seconds: float) -> None:
        self._limiters[index].penalize(self._clock(), seconds)

    def disable(self, index: int, reason: str) -> None:
        self._disabled[index] = reason
